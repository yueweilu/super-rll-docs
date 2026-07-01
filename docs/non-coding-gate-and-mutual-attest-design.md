# Non-Coding Task Gate + Bidirectional Mutual-Attest Design

**Slice**: `non-coding-gate-and-mutual-attest-design`
**Type**: research / design (analysis-only)
**Date**: 2026-05-23
**Trigger**: external bug report `docs/rll-analysis-only-closeout-bug-2026-05-23.md` (CCL-side user, RLL 0.9.9)

## 1. Problem statement

Three structurally related defects in the RLL workflow as shipped at 0.9.10:

1. **Non-coding task closeout deadlock** — a new step can start with Ralph `[DISCUSS]` (no first-tag enforcement). At closeout, Lisa `[CONSENSUS]` is mechanically blocked unless a `auto-tdd-plan` / `gate-results` / `harness-results` artifact exists. For analysis-only / RCA slices this artifact never gets seeded, forcing either ad-hoc backfill or operator stuck.
2. **`verifyLisaAttest` cross-check disconnected from `checkLisa`** — `cli/src/lisa-attest-parser.ts:116-159` implements full cross-check (plan_rows vs `auto-tdd-plan-<step>.json`, test_files vs filesystem, test_log_claim vs `test-execution-log.jsonl` via §137 verifier, rationale quality_score). `cli/src/policy.ts:104` is the ONLY call site, only inside Ralph counter-attest path (`tag === 'CONSENSUS'`). `checkLisa()` (`cli/src/policy.ts:361+`) only does field-presence + rationale-length + Verified-path-whitelist checks. Lisa can submit a PASS referencing nonexistent rows/files/log entries and the policy will not stop her until Ralph later tries `[CONSENSUS]`.
3. **Bidirectional mutual-gatekeeper mechanism only partly mechanized** — Ralph counter-attest exists (`policy.ts:88-121`, rule `ralph-must-challenge-rubber-stamp-pass`), but only at the moment Ralph submits `[CONSENSUS]`. Ralph cannot mechanically reject Lisa's process at any earlier round. Lisa's process quality is observed in the user's terms ("Ralph 收到 Lisa 反馈第一步先看 process") but not enforced submit-time.

## 2. Design principles

D1. **Early fail, not late fail.** Any wrong shape should be blocked at the FIRST invalid submission, not at closeout. (Reporter's Option A.)

D2. **Mutual gatekeeping by symmetric mechanism.** Lisa gates Ralph's plan/work; Ralph gates Lisa's review quality. Both sides routed through the same `verifyLisaAttest`-style cross-check primitive.

D3. **Explicit agreement over implicit whitelist.** Today's non-code escape is a 4-entry static whitelist (`doc-only / config-only / single-rename / process-only`). Replacing it with explicit per-slice Lisa agreement on a declared shape is more flexible AND mechanically auditable.

D4. **Process must be in the body, not in heads.** Lisa's `Reviewed-test-log` cite must be a real command + counts that cross-check; not a free-text "I reviewed".

D5. **Minimal protocol surface.** Reuse existing tags (`[PLAN]` / `[PASS]`) by extending body schema; do not introduce new tags unless strictly necessary.

D6. **Reversible & opt-out.** Every new enforcement carries an audit-named env opt-out (e.g. `RL_NONCODING_AGREE_OFF=1`) for dev-mode escape.

## 3. The three coupled fixes

### Fix #1 — Non-coding task propose/agree protocol

**R1 [PLAN] body schema extension** (only when proposing non-TDD):

```
**Tests**: none (proposed-shape: <shape>)
**Shape-Justification**: <≥40 chars + ≥1 file:line or artifact cite>
```

Accepted `proposed-shape` values:
- `analysis-only` — RCA / investigation / postmortem; deliverable is text findings.
- `doc-only` — pure documentation (replaces today's static whitelist entry).
- `config-only` — config / data file edits, no code.
- `single-rename` — a single file/identifier rename, no semantic change.
- `process-only` — workflow / PLAN.md / CLAUDE.md only.
- `research` — design exploration shipping `docs/<name>-design.md`.

(Whitelist EXTENDED from 4 to 6 entries; `analysis-only` and `research` added per reporter's recommendation.)

**R1 Lisa [PASS] body schema extension** (when agreeing):

```
Agreed-Shape: <shape>
Shape-Rationale: <≥40 chars + ≥1 cite proving Lisa actually reviewed the claim>
```

**Mutual CONSENSUS at R1** produces the artifact:

```
.dual-agent/non-tdd-agreement-<step>.json
{
  "schema_version": 1,
  "step": "<slug>",
  "shape": "analysis-only",
  "ralph_round": 1,
  "ralph_justification_hash": "<sha256>",
  "lisa_round": 1,
  "lisa_agreed_at": "<ISO 8601>",
  "lisa_rationale_hash": "<sha256>",
  "schema_complexity_judge_input_hash": "<sha256 from .dual-agent/complexity-judge/<slug>.json>"
}
```

The artifact is added to `§144` trusted-path whitelist. Closeout `Verified:` may cite it. `runGate` post-CONSENSUS cascade short-circuits when this artifact says `shape != code-task` (mirrors existing `escape: {tests: 'none'}` path at `cli/src/commands.ts:6737-6777`).

**Artifact writer contract** (Lisa R1 narrow lock — was ambiguous in v1): the artifact is **NOT** written by `submit-lisa` (Lisa should never mutate trusted artifacts). It is written on **Ralph's R1 [CONSENSUS] transition**, AFTER `cmdSubmitRalph` validates that:
- the latest Lisa PASS body contains a matching `Agreed-Shape: <X>` field;
- the Shape-Rationale hash matches the rationale in the Lisa attest;
- `parseLisaAttest(lisaPassBody)` + `verifyLisaAttest(...)` succeed (rationale quality_score true; no unverified cites);
- the slice has no existing `.dual-agent/non-tdd-agreement-<step>.json` (idempotent — second write rejected with `non-tdd-agreement-already-exists` error; explicit revocation must happen via flow below).

If any of those fail → Ralph [CONSENSUS] is blocked with rule `non-tdd-agreement-prerequisites-not-met`; Ralph must [CHALLENGE] or wait for Lisa to fix her attest. This makes the write a deterministic side-effect of a validated mutual transition, not a Lisa-side mutation.

Alternative (deferred unless needed): a dedicated noninteractive `ralph-lisa task non-tdd-agreement --slice <X>` cli command for repair/CI flows. NOT shipped in Phase B unless a concrete need surfaces.

**First-tag enforcement** (Reporter Fix A — Lisa R1 narrow lock: canonical rule pinned ONCE here, Q4 + summary cross-reference):
- A step's first **round-starting** Ralph submission must be one of `[PLAN]` / `[RESEARCH]` / `[CLARIFY]`.
- `[QUESTION]` is allowed AS a first Ralph submission but is **non-round-starting**: it does not begin the round count; Ralph's next non-`[QUESTION]` submission becomes R1 and must still be `[PLAN]` / `[RESEARCH]` / `[CLARIFY]`.
- All other tags as first round-starting submission → submit blocked with rule `r1-first-tag-not-allowed`.
- Implementation: scan `.dual-agent/history.md` for any prior **non-QUESTION** Ralph submission on `Step: <slug>`; if absent + new tag ∉ {`PLAN`, `RESEARCH`, `CLARIFY`, `QUESTION`} → block.
- This rule is canonical; Q4 below records the directional input that drove it; §8 summary references it without re-statement.

### Fix #2 — Wire `verifyLisaAttest` into `checkLisa`

`cli/src/policy.ts:checkLisa()` adds a section:

```typescript
// §149+ — Lisa submit-time cross-check (mirrors Ralph counter-attest)
if ((tag === 'PASS' || tag === 'NEEDS_WORK' || tag === 'CONSENSUS') && ctx?.stateRoot && ctx?.step) {
  const attest = parseLisaAttest(content);
  if (attest) {
    const r = verifyLisaAttest(attest, { stateRoot, step, repoRoot });
    if (r.unverified.length > 0) {
      // Each unverified entry becomes a `lisa-attest-cross-check` block-severity violation.
      for (const u of r.unverified) {
        violations.push({ rule: 'lisa-attest-cross-check', message: `[${tag}] §149+: ${u.kind} unverified — ${u.reason}` });
      }
    }
  }
}
```

Effect: Lisa cannot submit a PASS that references a `Reviewed-test-files` path that doesn't exist, a `Reviewed-test-log` cmd that has no recent execution-log entry, or `Reviewed-PLAN-rows: C7` when C7 isn't in `auto-tdd-plan-<step>.json`. Early fail at her submission, not at Ralph's CONSENSUS.

Opt-out: `RL_LISA_ATTEST_CROSS_CHECK_OFF=1` (audit-named).

### Fix #3 — Ralph submit-time mutual-gate at every [CODE]/[FIX] (not just [CONSENSUS])

Today `verifyLisaAttest` runs only when Ralph submits `[CONSENSUS]`. Extend so it ALSO runs when Ralph submits `[CODE]` / `[FIX]` / `[CHALLENGE]` — reading the latest Lisa review for the current step and checking process quality on Lisa's most-recent reply BEFORE Ralph's new submission lands.

```typescript
// §149++ — Ralph mutual-gate at any work-bearing tag
if ((tag === 'CODE' || tag === 'FIX' || tag === 'CHALLENGE' || tag === 'CONSENSUS') && ctx?.stateRoot && ctx?.step) {
  // ... existing extractLatestLisaPass + verifyLisaAttest flow ...
  // emit `ralph-must-challenge-rubber-stamp-pass` (CONSENSUS-tagged)
  //   OR `ralph-must-cite-process-gap` (CODE/FIX/CHALLENGE-tagged) ← NEW
}
```

The new `ralph-must-cite-process-gap` rule fires when Ralph proceeds with [CODE]/[FIX] without acknowledging that the previous Lisa review lacks process; it forces Ralph to either (a) [CHALLENGE] the previous Lisa review first, or (b) write a one-line acknowledgement in his body referencing the gap.

Opt-out: `RL_RALPH_MUTUAL_GATE_OFF=1`.

## 4. Sequencing

These three fixes have a strict implementation order:

```
Phase A (foundation — must ship first):
  Fix #2: checkLisa → verifyLisaAttest
  Fix #3: Ralph mutual-gate at all work-bearing tags
  (single sub-slice: r1-mutual-attest-cross-check)
  ~5-7 rounds; small LOC; reuses existing verifyLisaAttest

Phase B (depends on A):
  Fix #1: non-coding propose/agree protocol
  (single sub-slice: r1-noncoding-propose-agree)
  ~8-10 rounds; new artifact + trusted-path whitelist extension + body schema + first-tag enforce
```

Reason for the order: Fix #1 produces a new trusted-path artifact (`non-tdd-agreement-<step>.json`). If the verify mechanism (#2/#3) is broken, the new artifact is just another rubber-stamp surface. Foundation first.

## 5. Backward compatibility & dogfood path

- **Existing closed slices (§193-§199)** — they shipped under the unfixed regime. Already-CONSENSUS slices are untouched.
- **In-flight slices on other branches** — submit-time policy only fires on NEW submissions; existing state is not re-validated.
- **Existing test fixtures** — those that intentionally test the old behavior (e.g. §144 tests that submit fake Verified paths) need updating; expected to be ≤5 cases per quick scan.
- **Dogfood plan** — this very slice (the design doc) ships under the unfixed regime as an `analysis-only` proof: when Phase A+B ship, this slice would have used the new propose/agree protocol cleanly.

## 6. Open questions for Lisa review — RESOLVED (Lisa R1 directional answers)

All five answered + adopted; the design above already reflects Lisa's directions.

**Q1 — analysis-only Lisa attest fields**: **Do not allow a free skip.** Lisa must still cite proposed-shape rationale + reviewed deliverable. `Reviewed-PLAN-rows: none (analysis-only agreed)` is acceptable ONLY after the agreement artifact exists; `Reviewed-test-files` and `Reviewed-test-log` should still name the doc/oracle checks OR explicitly cite the agreed non-code skip. (Adopted: Lisa attest schema for analysis-only shapes accepts `Reviewed-test-log: skipped (non-code agreed — see .dual-agent/non-tdd-agreement-<step>.json)` only when the artifact is present and parsed-attest-shape matches.)

**Q2 — Ralph mutual-gate severity by tag**: **Warn for `[CODE]` / `[FIX]`; block at `[CONSENSUS]`; `[CHALLENGE]` stays allowed** (it is the escape route for disputing Lisa's process). Adopted: Fix #3 rule `ralph-must-cite-process-gap` emits warn-severity on [CODE]/[FIX]; the existing `ralph-must-challenge-rubber-stamp-pass` continues to block-severity on [CONSENSUS]; `[CHALLENGE]` carries no new gate.

**Q3 — agreement artifact revocability**: **Revocable only with explicit user acknowledgement, using existing tags** (Lisa R1 narrow: D5 minimal-protocol-surface forbids `[NEEDS_USER_ACK]` new tag). Adopted: Lisa submits `[NEEDS_WORK]` (or `[CLARIFY]`) with a structured `Shape-Change-Requested: <new-shape>` body field; this writes `.dual-agent/non-tdd-shape-change-pending-<step>.json`; Ralph's next [CODE]/[FIX] is blocked with rule `shape-change-pending-not-acked`; user must run `ralph-lisa ack-shape-change --slice <X> --reason "..."` to advance. (Mirrors the existing §128 `scope-expansion-pending` mechanism — same shape, different artifact name.)

**Q4 — first-tag allowlist scope**: **Include `[QUESTION]` as non-round-starting.** Adopted into §3 Fix #1 canonical rule above. Round-starting first tag must be `[PLAN]` / `[RESEARCH]` / `[CLARIFY]`.

**Q5 — opt-out env name consolidation**: **Keep the three distinct.** `RL_NONCODING_AGREE_OFF` / `RL_LISA_ATTEST_CROSS_CHECK_OFF` / `RL_RALPH_MUTUAL_GATE_OFF` — separate audit names are clearer than an umbrella opt-out for defects with different risk profiles. (Audit-named pattern preserved.)

## 7. Test plan (deferred — research slice ships zero test code)

Per the slice's own `analysis-only` shape, this design slice ships:
- `docs/non-coding-gate-and-mutual-attest-design.md` (this file)
- NO source code changes
- NO new test cases

The TWO implementation sub-slices (Phase A + Phase B) will each carry their own R1 [PLAN] with 5-col test tables per §102. This document is the input to those plans, not their substitute.

## 8. Summary recommendation

✅ **Proceed in two phases**:

1. **Phase A — `r1-mutual-attest-cross-check`** (foundation): wire `verifyLisaAttest` into `checkLisa` (Fix #2) + extend Ralph mutual-gate to all work-bearing tags (Fix #3). ~5-7 rounds, small surface area. Reuses fully-built `verifyLisaAttest`.

2. **Phase B — `r1-noncoding-propose-agree`** (built on Phase A): propose/agree protocol with `non-tdd-agreement-<step>.json` artifact, first-tag enforcement, trusted-path whitelist extension. ~8-10 rounds.

**Total**: ~13-17 rounds across two sub-slices, both standard complexity. No npm publish (per user lock). Bug report's secondary inconsistency (Q5 — `checkLisa` not calling `verifyLisaAttest`) is fixed inside Phase A naturally.

**Risks accepted**: (a) test-fixture migration for existing tests that submit fake Verified paths; (b) any in-flight slices on other branches must re-submit under new policy.

**Risks rejected**: (a) reporter's "repair-plan-artifact" recovery command — would encourage backfill anti-pattern; (b) auto-detect non-coding shape — Lisa must explicitly agree; (c) widening the first-tag allowlist beyond PLAN/RESEARCH/CLARIFY/QUESTION (canonical rule pinned at §3 Fix #1; QUESTION is non-round-starting).

**Lisa R1 narrows resolved** (this is v2 — supersedes v1):
- First-tag canonical rule pinned in §3 (single source of truth; Q4 + §8 reference, do not redefine).
- Agreement-artifact writer contract explicit in §3 (Ralph R1 [CONSENSUS] writes after validating Lisa PASS; idempotent; second write rejected).
- Shape-change revocation uses existing `[NEEDS_WORK]` + `Shape-Change-Requested:` field + `ralph-lisa ack-shape-change` cli (no new tag).
