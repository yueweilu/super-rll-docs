[English](../en/test-harness-and-gates.md) | [中文](../zh-CN/test-harness-and-gates.md)

# Test Harness and Quality Gates: How They Work + How to Unblock

**Who this is for**: (1) users trying to debug "why is my submit blocked?"; (2) maintainers adding / changing / removing enforcement rules.
**What you get**: an understanding of what each gate enforces and why; a procedure to unblock when caught; for maintainers, where to add a new rule and what tests to write.

---

## TL;DR mental model

RLL splits the "Ralph writes / Lisa reviews / both consent" flow into **3 gate layers**:

```
[1] Submit-time gate
    └─ cli/src/policy.ts:checkRalph() / checkLisa()
       Runs on every submit-ralph / submit-lisa
       Fail → process.exit(1) → user sees BLOCKED

[2] Bidirectional attest gate
    └─ §149 ralph-attest + §144 lisa-verified-cite
       Ralph must self-cite Test-Process/Cases/Results
       Lisa must cite Verified: <trusted-artifact>
       Each side verifies the other; neither can rubber-stamp alone

[3] Post-consensus cascade
    └─ §70 handleMutualCompletion → cli/src/test-cascade.ts:runTierCascade()
       Triggered only after both Ralph + Lisa are [CONSENSUS]
       Actually runs the test cascade (unit/smoke/integration/e2e)
       Any Required ✓ row failing → §79 loopback back to Ralph
```

**Why 3 layers instead of 1**: Layer 1 catches protocol violations (syntax, ordering, missing fields). Layer 2 catches false narration ("said tests ran but they didn't"). Layer 3 catches test design problems ("one tier passes but others fail").

---

## Layer 1: Submit-time policy

### How it works

`cli/src/commands.ts:cmdSubmitRalph()` and `cmdSubmitLisa()` call `runPolicyCheck(role, tag, content, ctx)` (`cli/src/policy.ts:838`) before writing work.md / review.md or flipping turn. That function collects all rule-triggered `violations[]`, then decides block vs. warn per `RL_POLICY_MODE`.

`RL_POLICY_MODE` defaults to `block` (§133 since 2026-05-16). Before v0.7.0 it defaulted to `warn`, which let enforcement be silently bypassed. See `docs/gate-bypass-diagnostic-2026-05-16.md` for the postmortem.

Some rules are **mode-locked** (trust-boundary): even `RL_POLICY_MODE=warn` blocks them:

- `task-capability-missing` / `task-capability-unacked` / `unsupported-tier-no-consent` (§122)
- `complexity-judge-missing` / `complexity-verify-failed` / `mode-off-without-user-ack` / `lisa-rerun-high-confidence-missing` / `expected-tier-not-in-required` (§123)
- `task-type-file-mismatch` / `task-type-declaration-mismatch` / `non-code-task-evidence-missing` (§207)
- `auto-tdd-protocol` (§102)

These are mechanical guarantees that dev-mode shouldn't be allowed to escape. The design reason: trust-boundary actions must be user-initiated (`ack-user`, `ack-scope-expansion`, `--type`, etc.) — Ralph cannot self-fake them.

### Main rules

Below in the order they fire on a submission body. Each rule has (a) how it works (b) example trigger (c) how to unblock.

---

#### §149 ralph-attest (Ralph's three lines)

**How it works**: every Ralph `[CODE]` / `[FIX]` body must contain:
- `Test-Process: <inline | file://path | git-diff HEAD~N..HEAD>` — how tests were run
- `Test-Cases: C1, C3, C7` — which cases (matching PLAN.md 5-col table IDs)
- `Test-Results: cmd="npm test --prefix cli" passed=N failed=0 total=M` — actual results

Prevents prose-style "tests pass" without machine-verifiable fields.

**Typical BLOCKED message**:
```
[FIX] §149: must include Test-Process: <inline|file-path|git-diff>
[FIX] §149: must include Test-Cases: C1, C2, ...
[FIX] §149: must include Test-Results: counts|file-path|log-cite
```

**How to unblock**:

1. Add the three lines verbatim (including colon + arguments):
   ```
   Test-Process: file://.dual-agent/visual-evidence/<step>.md
   Test-Cases: C1, C2, C3
   Test-Results: cmd="npm test --prefix cli" passed=N failed=0 total=M
   ```
2. For doc-task / process-task fast-path you still need these (§207 fast-path skips auto-tdd-plan, not §149). Acceptable shape:
   ```
   Test-Process: file://.dual-agent/work.md
   Test-Cases: D1, D2, D3
   Test-Results: cmd="node cli/dist/cli.js plan validate" Exit code: 0
   ```
3. **No tests actually run** (e.g. pure prose revision) → `Skipped:` + reason:
   ```
   ### Test Results
   Skipped: pure-prose fix per Lisa narrow; no executable test path
   Exit code: 0 (no commands executed)
   ```

**Implementation**: `cli/src/policy.ts:60-90` (rules `ralph-test-process-missing` / `ralph-test-cases-missing` / `ralph-test-results-missing`).

---

#### §137 test-results-unverified

**How it works**: `Test-Results: cmd="X" passed=N total=M` must have a matching execution record in `.dual-agent/test-execution-log.jsonl` within the last 10 minutes. Prevents fake test results — claiming `passed=100` when the cmd hasn't run.

`cli/src/policy.ts:280-299` calls `verifyTestResultsClaims()` to compare body claims against the log; mismatch → block.

**Typical BLOCKED**:
```
[CODE] Test Results contains unverified claims (no matching execution log entry in last 10min): `npm test --prefix cli`. Run test before submitting or cite Skipped: with justification.
```

**How to unblock**:

1. Actually run the gate so it writes the log: `ralph-lisa quality-gate` (writes several cmd entries to jsonl)
2. Submit immediately afterwards (within 10 min)
3. The cmd string in your body must **exactly match** the log entry's cmd (including `--prefix cli`; the log has `npm test --prefix cli`, and `npm test` won't match it)
4. Your `passed=` / `total=` must match the log's numbers; mismatches count as unverified (deliberate — prevents staling old logs)

**The `cmd='?'` trap**: the parser (`cli/src/test-results-claim-verifier.ts:39`) captures cmds via backticks. If you write prose like `12/12 pass`, `Actions in this step: 3`, the parser sees a claim with cmd `?` → can never match the log → block.

Fix: either use explicit `Test-Results: cmd="X" passed=N total=M` lines (no prose parser), or remove all `\d+/\d+ pass` literals from prose.

**Implementation**: `cli/src/test-results-claim-verifier.ts:31-99`.

---

#### §144 lisa-verified-cite

**How it works**: Lisa's `[PASS]` / `[CONSENSUS]` body must contain `Verified: <path>` where path is in the trusted-paths whitelist:
- `.dual-agent/gate-results.{md,json}`
- `.dual-agent/harness-results/*`
- `.dual-agent/auto-tdd-plan-*.json`

The file must have mtime ≤5 minutes.

Prevents Lisa PASSing with "looks good" but no artifact (touching an empty file doesn't help — path must be trusted and fresh).

**Typical BLOCKED**:
```
[PASS] §144: lisa-rerun-not-verified (no `Verified: <trusted-path>` cite within last 5min)
```

**How to unblock**:

Three trusted cite patterns (pick one per scenario):

1. **Ran quality-gate / runGate** → `Verified: .dual-agent/gate-results.md` (also `gate-results.json` works). Most common.
2. **Ran test-harness (cascade / loopback / preset)** → `Verified: .dual-agent/harness-results/<your-evidence-file>.md`. Lisa can also write a review-summary file under this dir and cite it — works for PLAN-only rounds.
3. **§70 cascade or §102 persistence** → `Verified: .dual-agent/auto-tdd-plan-<step>.json`

⚠️ **Common mistake**: `plan validate` does **not** write `.dual-agent/gate-results.md` (just validates PLAN.md syntax/anchors). If you only ran `plan validate`, cite a `.dual-agent/harness-results/<...>.md` file (with Lisa writing a review summary there) instead. `.dual-agent/review.md` is not in the trusted whitelist — citing it will block.

5-min freshness: file mtime ≤5 minutes. Generate the artifact and submit immediately; if interrupted, regenerate before resubmitting.

**Implementation**: `cli/src/policy.ts:535-583` (trusted-paths whitelist + mtime check).

---

#### §134 marker-plan-bound (§52 tests-only marker)

**How it works**: Ralph's R2 [CODE] "tests-only / expected-fail" round may include this line:

```
Convention: tests-only / expected-fail (§49 §C)
```

With the marker, the gate switches to warn mode (test failures allowed through submit), enabling pure-tests-first rounds.

**But**: the marker doesn't work unconditionally — at least one of these must hold:

1. `.rll/PLAN.md`'s current sub-slice row declares `tests-only: true`
2. Body contains `R2 [CODE] tests-only` self-declaration
3. The current step already has an R2 [CODE] round with the marker (subsequent [FIX]s inherit)

Otherwise the marker doesn't bind, and test failures still block.

**Typical BLOCKED**:
```
[CODE] §134: tests-only marker present but plan row does not declare `tests-only: true`; marker unbound
```

**How to unblock**:

- R2 [CODE]: add `tests-only: true` to the PLAN.md row, or write `## R2 [CODE] tests-only` in the body
- R3 [CODE] (real round): **don't carry the marker** (it doesn't help, and signals intent to bypass)

**Implementation**: `cli/src/policy.ts:1140-1180` + `cli/src/commands.ts:1152`.

---

#### §207 task-type-file-mismatch (task_type file whitelist)

**How it works**: each sub-slice has a task_type (`code-task` / `review-task` / `doc-task` / `process-task`), and each type has a file-write whitelist:

- `code-task`: anywhere (default full TDD)
- `review-task`: `docs/**` + `.dual-agent/**` only
- `doc-task`: + top-level `*.md` + `CLAUDE.md` / `CODEX.md` / `README.md`
- `process-task`: + `.rll/**` + `docs/**`

On every Ralph submit, policy runs `computeStepDiff()` to enumerate the slice's changed files and compare against the whitelist; out-of-bounds → block.

Prevents: declaring `--type review-task` to use fast-path but secretly editing `cli/src/foo.ts`.

**Typical BLOCKED**:
```
[CODE] task-type-file-mismatch: review-task cannot modify forbidden path(s) cli/src/foo.ts; rerun as code-task or split into follow-up code slice.
```

**How to unblock**:

1. Genuinely need to edit code → open a code-task slice: `ralph-lisa next-step "fix-foo" --type code-task` with full TDD
2. Genuine review but spuriously triggered (e.g. some auto-write file) → check `.dual-agent/step-start-dirty-<step>.txt` snapshot for the missing pre-existing file
3. **Cannot** be bypassed via `RL_POLICY_MODE=warn` (mode-locked); cannot via `RL_TASK_TYPE_OFF=1` (env doesn't exist, anti-loophole locked by C13 regression)

**Important nuance** (§207 R3 fix lock): policy decides task_type by **explicit declarations** only (SoR JSON or body `Task type:` line), **not inference**. This avoids `.rll/progress/<date>.md` auto-writes misclassifying a code slice as process-task.

**Implementation**: `cli/src/policy.ts:300-353` + `cli/src/task-type.ts`.

---

#### §202 first-tag enforcement

**How it works**: after entering a new sub-slice, Ralph's first submit must be `[PLAN]` / `[RESEARCH]` / `[CLARIFY]` (`[QUESTION]` excepted, non-round-starting). Prevents jumping straight to [CODE] without a plan.

**How to unblock**: write [PLAN] first. For emergencies / legacy: `RL_R1_FIRST_TAG_OFF=1` (this rule has an env opt-out, unlike task-type).

---

#### §122 task-capability-ack (user-driven trust-boundary)

**How it works**: opening a sub-slice via `ralph-lisa task new <slug>` triggers a capability detect (cli / web / mobile / e2e testing), writing `.dual-agent/task-harness-capability.json`. Before R2 [CODE], the user must explicitly ack:

```bash
ralph-lisa task capability ack-user --signature "<token>"
```

Prevents Ralph from claiming "I can test e2e" when Playwright isn't installed. User must verify independently.

**Typical BLOCKED**:
```
[CODE] task-capability-unacked: §122 acked=false — user must run `ralph-lisa task capability ack-user --signature "<token>"` before R2 [CODE]
```

**How to unblock**: run `task capability ack-user` explicitly. **Ralph cannot self-fake** (trust-boundary).

---

#### §128 clarify-not-completed

**How it works**: complex tasks (complexity-judge `task_complexity_class=complex|expert`) must go through R0 [CLARIFY] before R1 [PLAN]:

```bash
ralph-lisa clarify --start  # 5-stage grill
# ...
ralph-lisa clarify --commit --understanding "..." --covered "..." --negative-scope "..." --risks "..."
# writes .dual-agent/clarify-locked-<step>.json
```

Otherwise R1 [PLAN] submit blocks with `clarify-not-completed`.

**How to unblock**: run the full clarify 5-stage; or for simple tasks use `ralph-lisa clarify --skip` (warning, but no block; complexity_class unchanged).

---

#### §123 complexity-verify-failed

**How it works**: R1 [PLAN] body must contain a complexity-judge JSON (output of `ralph-lisa task complexity-judge --slice X --json` pasted in); before submit, `complexity-verify` is a deterministic hard gate (schema / canonical_tier_ids / Required coverage).

Prevents Ralph from declaring low complexity at PLAN time to dodge §102 TDD-first escalation.

**How to unblock**: paste judge JSON per template + run `task complexity-verify --slice X` to exit 0.

---

#### `doc-oracle-spec` (doc-task only 5-col table)

**How it works**: doc-task PLAN must include a 5-col table (separate from §102 6-col phase table):

```
| ID | Dimension | Verification Method | Pass Criteria | Required |
|----|-----------|---------------------|---------------|----------|
| D1 | topic-coverage | <how to verify> | <pass criteria> | ✓ |
```

The `Dimension` column accepts only the 9 canonicals from `cli/src/doc-oracle-spec.ts:21` `CANONICAL_DOC_ORACLE_DIMENSIONS`: `data-accuracy` / `source-authority` / `source-freshness` / `logical-coherence` / `compliance-with-user-spec` / `ai-slop` / `style` / `topic-coverage` / `depth-detail`.

Prevents doc-task from skipping the 5-col test table without also providing an oracle table (otherwise §70 cascade has nothing to verify).

**How to unblock**: write the 5-col table with ≥1 Required ✓. Dimension must be one of the 9 canonicals.

**`Verification Method` column must not contain literal `|`** (even in backticks) — markdown table parser treats `|` as column separator. If you need to write grep commands with `\|`, rephrase as space-separated keyword list.

---

### Adding a new rule

1. **Design**: open a new §xxx sub-slice in `.rll/PLAN.md` documenting why the rule, trigger conditions, error template, edge cases
2. **Implement**: add violation push in `cli/src/policy.ts` `checkRalph()` or `checkLisa()`; for trust-boundary rules (mode-locked), add the rule name to both the mechanical-bypass filter and always-block list in `runPolicyCheck()`
3. **Test**: in `cli/src/test/` add spawn-based tests — at least one positive (no trigger / no block), one negative (trigger → block), one anti-loophole (`RL_POLICY_MODE=warn` cannot bypass)
4. **Doc**: add a section in this file (how it works / example trigger / how to unblock / implementation) + a row in the [`maintainer-handoff.md`](./maintainer-handoff.md) key enforcement index
5. **Static audit**: `cli/src/test/policy-block-static-audit.test.ts` auto-scans policy.ts for uncovered rules; the new rule must be registered in the allowlist

---

## Layer 2: Bidirectional attest (§149)

### How it works

§149 makes Ralph and Lisa **attest to each other's work**:

- Ralph must cite his own test trio (Test-Process / Cases / Results — covered under §149 ralph-attest above)
- Lisa must cite her Reviewed-PLAN-rows / Reviewed-test-files / Reviewed-test-log + Pass-Rationale (≥40 chars with ≥1 file:line) + Verified path
- Before Ralph submits [CONSENSUS], he **counter-attests**: runs `verifyLisaAttest()` on Lisa's latest PASS quality_score; if too low → `ralph-must-challenge-rubber-stamp-pass` blocks [CONSENSUS], requiring [CHALLENGE] instead

Prevents Ralph + Lisa colluding into rubber-stamp "both PASS" mode.

### How to unblock / tune

- Ralph receiving a thin Lisa PASS → first move is [CHALLENGE] (at most once per round), not [CONSENSUS]
- Lisa narrows insufficiently specific → Ralph [CHALLENGE]s asking for file:line cites + verified oracles
- Stuck (rubber-stamp loop) → `RL_LISA_ATTEST_OFF=1` / `RL_RALPH_ATTEST_OFF=1` (audit-named opt-outs; not recommended in overnight autonomous; essentially an escape)

**Implementation**: `cli/src/lisa-attest.ts` + `cli/src/policy.ts:443-528`.

---

## Layer 3: Post-consensus cascade (§70)

### How it works

Once both Ralph and Lisa hit `[CONSENSUS]`, `cli/src/commands.ts:handleMutualCompletion()` triggers the **actual test cascade**:

1. First read `.dual-agent/auto-tdd-plan-<step>.json` (the 5-col table persisted from §102 R1 PLAN)
2. If `escape: {tests: 'none', reason: '...'}` → skip cascade, status=passed
3. If rows present → call `runTierCascade()` (`cli/src/test-cascade.ts`), running unit → smoke → integration → e2e → perf → stability → security in order
4. Any Required ✓ row failing → **§79 loopback**: write structured failure context to `.dual-agent/loopback-<step>.json`, flip turn back to Ralph, who reads cascade failure + submits [FIX]
5. ≥3 consecutive cascade failures → §71 ESCALATE: write `task_failed` event, wecom-push to user

Prevents: both [CONSENSUS] but tests didn't actually run / some failed silently.

### How to unblock / tune

- Cascade failure → look at `.dual-agent/loopback-<step>.json`'s `failure_context` field (raw stderr + stdout summary)
- `RL_GATE_INCLUDE_OPTIONAL=true` includes Required=✗ rows in cascade (default skips)
- Full escape (rare): in R1 PLAN body, write `**Tests**: none (<reason>)`; reason must be in the whitelist `doc-only` / `config-only` / `single-rename` / `process-only`

**Implementation**: `cli/src/commands.ts:7619-7820` (`handleMutualCompletion`) + `cli/src/test-cascade.ts` (`runTierCascade`) + `cli/src/loopback.ts`.

---

## Appendix: quality-gate command cheatsheet

Most common for maintainers:

```bash
# Full gate (recommended before every commit)
ralph-lisa quality-gate
# equivalent: plan validate + plan validate (sibling repo) + npm test --prefix cli + wecom-bot + cli-e2e

# Submit-time gate (policy.ts checkRalph in isolation, no real test execution)
ralph-lisa task complexity-verify --slice X
ralph-lisa plan validate-phase-tests --slice X

# Release gates (mandatory before release)
ralph-lisa dogfood-gate run --strict      # end-to-end enforcement scenarios
ralph-lisa doc-update-gate run --strict   # doc claim vs code impl drift detector
ralph-lisa release-report emit            # aggregate evidence → release-report-<slug>.md
```

`ralph-lisa doctor` for dependency + watcher health. `ralph-lisa status` for a one-line turn/round/step snapshot.
