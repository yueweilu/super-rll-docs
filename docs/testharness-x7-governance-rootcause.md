# Testharness X7 governance package — root-cause + super-rll landing points

> Slice: `x7-th-reliability-rootcause` (research). Date: 2026-06-21.
> **Sources (in-repo, reproducible):**
> - stale-oracle spec (R1–R4) → vendored verbatim at `docs/research-sources/testharness-stale-oracle-fix-spec-2026-06-21.md`
>   (bus corr `miaoji-th-stale-oracle-fix-1782037256`). Anchors: D1 §1 (line 21), D2 §1 (line 27), D3 §1
>   (line 32); R1–R4 acceptance table §2 (lines 43–46).
> - governance gates (A–E / RCA R1–R5) → `~/Projects/ChatLLM/margay-standard/.dual-agent/release-test/TEST-SYSTEM-REPORT.md`
>   (§2.2 defects, §3 RCA, §5 super-rll responsibilities).
> Driver: margay-standard full e2e re-runs the same 2–3 cases forever → **paused**, blocking margay's
> trusted full-test (and ccl). Boss-authorized; super-rll = A 线 (framework governance owner).

## 0. Responsibility boundary (the key root-cause framing)

The concrete defects D1–D3 live in **margay-standard's bespoke harness** (`tools/e2e/runner.mjs`,
`run-batch.mjs`) — those line-level fixes are **margay's Ralph's job** (spec §3, report §7.1).

**super-rll's deliverable is the *paradigm + validation*** (spec §2/§4): encode R1–R4 (and governance
A–E) as **reusable RLL-framework guarantees** so margay, ccl, and every project inherit them and
cannot re-introduce the class. We do **not** edit margay's `runner.mjs`. Verified: spec §3 "归
margay-standard Ralph", spec §4 "A 线…给出 R1-R4 的范式/校验", report §5 "super-rll…负责治理层".

## 1. Root cause (confirmed)

The re-run loop = three compounding harness-design defects (any case that can't capture evidence
presents as "non-PASS" and gets manually re-run forever):

- **D1 stale-oracle (primary)** — success oracle bound to a **volatile backend log format**: harness
  greps the backend `"subtype":"init"` line's `"cwd"` to locate generated artifacts
  (`runner.mjs:363-374/507-522`). Backend refactor dropped that line → `cwd` regex empty →
  `findArtifact('')` → file truly generated but judged "not found" → indeterminate → re-run.
  Evidence: spec §1 "最近 3 次运行日志 subtype:init=0、cwd:=0 行".
- **D2 non-terminal EFFECT cases** — capture-only EFFECT cases parked at `PENDING_JUDGING`
  (`runner.mjs:741-743`) but the judge panel (`decideFinalVerdict`) is never auto-invoked, and runner
  `exit 1` on any ≠PASS → structurally un-finishable → re-run. Evidence: spec §1 D2.
- **D3 no INFRA-FAIL terminal / no attempt-cap / timeout too short** — "test truly failed" vs "harness
  couldn't capture evidence (no artifact path / timeout / out-of-scope subsystem)" are
  indistinguishable; both present non-PASS with no "stop retrying" signal. 5-min default timeout <
  real docx-skill run (5.67 min). Evidence: spec §1 D3, `run-batch.mjs:13`.

Governance report adds the same class at the coverage layer: registry **registered ≠ implemented**
(22/27 `impl:'pending'` counted as covered), negative-scope never recovered, no "change-X-must-test-X",
/tmp throwaway scripts, no cross-platform smoke. Evidence: report §2.2/§3.

**Merge map** (miaoji): R1+R3 ↔ E (anti-vacuous → impl); R2 ↔ A (pending ≠ covered); B/C/D = increments.

## 2. super-rll landing points (grounded, file:line)

The RLL testharness operates on PLAN test tables → detectors/warn-surfaces (plan.ts) → §70 cascade
(test-cascade.ts) → EvidenceRecord (evidence-record.ts) → policy (policy.ts). The X1–X6 pattern is
**warn-first detectors + EvidenceRecord fields + CLI**, NOT hard gates (user directive: no format-tax).

| Guarantee | Existing infra (reuse) | Gap → new work |
|---|---|---|
| **R1 oracle-not-volatile** | `oracle-quality.ts:50 detectWeakOracles` (anti-vacuous family); warn surface `plan.ts:1075` | NEW detector `detectVolatileOracles` flagging oracles that bind to volatile external log/stdout formats (grep backend log / "subtype:init" / "cwd:" from logs / parse-stdout-for-path); guidance: locate via harness-controlled workspace path. Warn surface + SKILL rule. |
| **R2 every-case-terminal** | `evidence-record.ts:96 overall PASS\|FAIL`; `oracle-verdict.ts:42` (matched/unmatched/not-executed) | Terminal-state taxonomy: add `INFRA-FAIL`/`INCONCLUSIVE`/`OUT-OF-SCOPE`; rule that no case stays non-terminal (PENDING auto-downgrades to INCONCLUSIVE). |
| **R3 INFRA-FAIL vs test-FAIL + attempt-cap** | `harness-readiness.ts:63 assessHarnessReadiness` already detects unavailable binary (infra) but **not wired into cascade**; `loopback.ts:23` per-test attempts; `test-failure-context.ts:60 retry_count` | Wire readiness into cascade; distinguish INFRA-FAIL from FAIL in CascadeResult + EvidenceRecord; record attempt-cap; stop re-run at cap. |
| **R4 out-of-scope expressible** | negative-scope detection `policy.ts:1481`; clarify negative_scope | OOS marker on a test case (oracle convention `OOS:`/column); OOS verdict not counted red; report lists it. |
| **A registry impl-check** | `close-cascade-coverage.ts:38` (X1 pending-empty cascade) | Extend anti-vacuous: Required row whose impl is `pending`/stub/`/tmp` ≠ coverage → flag. |
| **B negative-scope recovery** | `policy.ts:1481 checkLisaNarrowScopeExpansion` | Require `unscope_when` on negative-scoped items + recovery reminder. |
| **C change-X-must-test-X** | `policy.ts:51 checkRalph` ([CODE] test-process/cases/results) | New check: code diff touching a subsystem must add ≥1 corresponding test case. |
| **D x64/Windows smoke template** | `gate-manifest.json canonical_tier_ids` (has `smoke`) | Ship a reusable cross-platform smoke harness template (skill/template). |
| **E anti-vacuous → impl** | `oracle-quality.ts` weak-oracle | Extend anti-vacuous to impl layer (pending/stub/tmp ≠ coverage) — overlaps A. |

## 3. Proposed slice plan (prioritized; ship the blocker first)

- **X7 (critical, ship + version bump + build FIRST → unblocks margay/ccl)** = the R1–R4 framework
  paradigm, because the re-run loop is exactly R1–R4. Tightly coupled (R2/R3/R4 all need the
  terminal-state taxonomy), so one cohesive slice (possibly split P1 taxonomy / P2 detectors if Lisa
  prefers). Each guarantee ships with its **negative-control oracle** (spec §2 acceptance):
  - R1: negative control — rename/delete the backend init log line, artifact verdict still correct.
  - R2: negative control — single run without live judge, EFFECT case must NOT stay permanent PENDING.
  - R3: negative control — force "artifact path unobtainable", harness reaches INFRA-FAIL within ≤N attempts, no infinite retry.
  - R4: OOS-marked failure doesn't pollute pass-rate + is listed in the report.
  After X7: bump cli 0.19.0 → **0.20.0** (minor, §143 Rule 1 — additive guarantees with audit-named
  opt-outs), `npm run build`, so margay-standard adopts the paradigm and resumes.
- **X8 (follow-up, governance)** = gates A–E (registry impl-check, negative-scope recovery,
  change-must-test, x-platform smoke template, anti-vacuous→impl). Broader; does not block margay's
  immediate re-run loop.

**Negative scope (super-rll):** do NOT edit margay's `runner.mjs`/`run-batch.mjs`; do NOT add hard
blocking gates by default (warn-first per user no-format-tax directive; `RL_*=block` opt-in only).

## 4. Acceptance (how X7 will be validated)

Each R1–R4 lands as a pure detector/primitive with unit tests including the negative-control oracle
from spec §2, wired warn-first into plan.ts/cascade/EvidenceRecord, full `npm test --prefix cli`
green + `ralph-lisa quality-gate` green, then version bump + build. margay-standard then adopts the
primitives in its own runner (margay's Ralph) and resumes full e2e.

## 5. Bus reply (deferred until Lisa confirms + X7 ships)

Reply to `miaoji-th-governance-relay-1782037622` + `miaoji-th-stale-oracle-fix-1782037256` on
bus-outbox: super-rll **认领** the package; X7 (R1–R4) shipping first as the blocker unblock with a
version bump, X8 (A–E) as governance follow-up; ETA per slice cadence. (Not sent yet — alert-only per
bus protocol; await user instruction before replying to the bus.)
