[English](../en/testing.md) | [日本語](../ja/testing.md) | [中文](../zh-CN/testing.md)

# Testing Guide

**Who this is for**: engineers using RLL to build their own project — NOT the maintainers of RLL itself (those should read [`test-harness-and-gates.md`](./test-harness-and-gates.md)).
**What you get**: how RLL pushes you to write tests, how to run them, how to unblock when a gate stops you, and when an escape is legitimately allowed.

---

## TL;DR

RLL is not a test framework. It's a tool that runs your project's existing tests (jest / pytest / vitest / Playwright / whatever) and mechanically verifies the results. The flow:

1. In `[PLAN]` you write a 5-column test case list (C1, C2, …)
2. For complex tasks, write tests first (R2 tests-only round) — failures are expected
3. Write implementation (R3) to turn them green
4. On `[CODE]` submit, provide real test output; the gate compares against the execution log
5. Lisa reviews → mutual consensus → test cascade runs → slice ships

**Most common pitfall**: writing "tests pass" in prose without giving concrete `cmd="X" passed=N total=M`. The gate rejects it.

---

## Concepts you should know but don't need to deeply understand

- **§102 auto-TDD**: complex tasks (estimate ≥4 rounds) default to tests-first; to opt out, declare `**Tests**: none (<reason>)` in `[PLAN]` body with a whitelisted reason
- **§70 post-consensus cascade**: after both consensus, actually runs tests; any Required ✓ row failing → loopback to Ralph
- **§137 test-results-unverified**: `Test-Results: cmd="X" passed=N` in Ralph's body must match a recent (≤10 min) entry in `.dual-agent/test-execution-log.jsonl`; prevents fakes
- **§149 bidirectional attest**: Ralph cites three lines (Test-Process / Cases / Results); Lisa cites `Verified: <trusted-path>`; either side cutting corners gets blocked

Full enforcement table + debug guidance lives in [`test-harness-and-gates.md`](./test-harness-and-gates.md). This page covers day-to-day: write / run / unblock.

---

## How to write a sub-slice's test plan

### Simple task (estimate <4 rounds or pure doc/config/rename)

Skip R2 tests-only; go R1 [PLAN] → R3 [CODE]. The PLAN body needs a minimal test section:

```
### Test Plan

| ID | Tier | Command | Oracle | Required |
|----|------|---------|--------|----------|
| C1 | unit | npm test --prefix cli -- --test-name-pattern="MyFeature" | 3/3 pass | ✓ |
```

Or if you genuinely don't need tests (doc-only / config-only / single-rename / process-only), use the escape:

```
**Tests**: none (doc-only)
```

### Complex task (estimate ≥4 rounds, or multi-file code)

Goes R1 [PLAN] → R2 tests-only → R3 [CODE] implementation → R4+ [FIX] → [CONSENSUS].

R1 [PLAN] needs the full test case list (5- or 6-column; 6 for multi-phase tasks):

**5-column (single phase)**:
```
| ID | Tier | Command | Oracle | Required |
|----|------|---------|--------|----------|
| C1 | unit | <how to run> | <pass criteria> | ✓ |
| C2 | smoke | npx playwright test web/smoke.spec.ts | renders + no console err | ✓ |
| C3 | e2e | curl -s X.example.com/api | 200 + payload.id present | ✗ |
```

**6-column (multi-phase, Phase column added)**:
```
| ID | Phase | Tier | Command | Oracle | Required |
|----|-------|------|---------|--------|----------|
| C1 | P1-parser-schema | unit | npm test ... | 6/6 pass | ✓ |
| C2 | P2-rule10-cli    | unit | npm test ... | 4/4 pass | ✓ |
```

Phase format is `P[0-9]+-<slug>`. PLAN body also needs a phases-declared block:

```
**Phases declared**:
- **P1-parser-schema**: what the first phase does
- **P2-rule10-cli**: what the second phase does
```

### Tier vocabulary

Only these 8 are accepted: `unit` / `smoke` / `functional` / `e2e` / `integration` / `perf` / `stability` / `security`. Other values get blocked by plan validate.

### Required column

- `✓` = mandatory in §70 cascade (failure must be fixed)
- `✗` = skipped by default (unless `RL_GATE_INCLUDE_OPTIONAL=true`)

### Command column with `|` characters

Markdown table parser treats raw `|` as column separator — even inside backticks. Rewrite to avoid raw `|`, or split into multiple Test-Results lines.

---

## How to run tests

### Your project's native test runner (what you use most)

Run them the way your project normally does:

```bash
# Node
npm test
npm test --prefix cli  # when project is in a subdir

# Python
pytest -v
pytest tests/test_foo.py::test_bar  # single test

# Playwright (web E2E)
npx playwright test
npx playwright test e2e/login.spec.ts --headed
```

### RLL's helper commands

```bash
# Full quality gate (run before every [CODE]/[FIX] submit)
ralph-lisa quality-gate

# Writes execution log to .dual-agent/test-execution-log.jsonl
# This is the SoR for §137 verifier; your body's cmd="X" must match a log entry

# Run a specific cascade strategy
ralph-lisa test-cascade --strategy full         # = §70 post-consensus runner
ralph-lisa test-cascade --strategy smoke-only   # smoke layer only
ralph-lisa test-cascade --strategy halt-on-fail # stop at first failure

# Safe dry-run + JSON (works in any project, no testTiers config required):
ralph-lisa test-cascade --strategy full --dry-run --json

# Filter by tier (NOT strategy) — only works in projects that have
# `testTiers` configured in `.ralph-lisa.json`. This repo's cli/.ralph-lisa.json
# has only `testRunners`, so the two below exit 2 here with
# `unknown --tier 'X'; available: (none)`. In a web-app project with testTiers
# configured, they work:
ralph-lisa test-cascade --tier unit             # unit only (requires config)
ralph-lisa test-cascade --tier integration      # integration only (requires config)

# Project-level smoke (requires RL_SMOKE_CMD set)
ralph-lisa smoke-check
```

### Debugging a single failing test

```bash
# This project uses Node's built-in test runner (cli/package.json scripts.test
# is also `node --test ...`)
cd cli
node --test --test-name-pattern="MyCase" dist/test/foo.test.js

# Full suite (matching cli/package.json)
RL_COMMAND_EVENT_OFF=1 RL_LEGACY_SESSION_OK=1 node --test --test-force-exit dist/test/*.js
```

---

## Writing the test section in [CODE] / [FIX] bodies

Common shape:

```markdown
### Test Results

`npm test --prefix cli` — Exit code: 0. All 13 §207 cases C1-C13 green. Full
`ralph-lisa quality-gate` (5/5 commands) PASS.

Test-Process: file://.dual-agent/visual-evidence/207-r3.md
Test-Cases: C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13
Test-Results: cmd="npm test --prefix cli" passed=2374 failed=0 total=2374
Test-Results: cmd="npm test --prefix wecom-bot" passed=250 failed=0 total=250
```

**Mines to avoid** (check these first when blocked):

1. `Test-Process` / `Test-Cases` / `Test-Results` — **all three required**; missing any one fires §149 block
2. `Test-Results: cmd="X" passed=N total=M` — the `cmd` string must **exactly match** an entry in `.dual-agent/test-execution-log.jsonl` (including `--prefix cli` and similar flags; `npm test` ≠ `npm test --prefix cli`)
3. `passed` / `total` must be **identical** to log numbers; mismatches count as §137 unverified
4. Prose with `12/12 pass` patterns gets parsed as a claim with `cmd='?'`, never matches the log → block. **Safest**: keep numbers only in `Test-Results:` lines, not prose.
5. Actually didn't run tests → `Skipped: <reason>`:

```markdown
### Test Results

Skipped: pure-prose narrow per Lisa R3; no executable test path.
Exit code: 0 (no commands executed).

Test-Process: file://.dual-agent/work.md
Test-Cases: D1, D2
Test-Results: cmd="node cli/dist/cli.js plan validate" Exit code: 0
```

---

## Writing a tests-only round

Complex task R2 [CODE] is "write tests, don't write implementation" — failures are expected. The §49 §C convention, with a marker:

```markdown
[CODE]

Convention: tests-only / expected-fail (§49 §C)

## R2 [CODE] tests-only — 13 cases all expected-fail

### Test Results

`npm test --prefix cli` — Exit code: 1. 13 §207 cases all expected-fail
(contract failures: missing task-type.ts module / missing policy rule / ...).
0 regression in baseline.

Test-Process: file://cli/src/test/non-code-task-fast-path.test.ts
Test-Cases: C1, C2, ..., C13
Test-Results: cmd="npm test --prefix cli" passed=2362 failed=13 total=2375
```

⚠️ The marker must be verbatim: `Convention: tests-only / expected-fail (§49 §C)` — case-sensitive, spacing / parens / §49 §C anchors all exact.

⚠️ The marker isn't a universal escape: `§134 marker-plan-bound` requires the current PLAN.md row to declare `tests-only: true`, else the marker doesn't bind. See [`test-harness-and-gates.md`](./test-harness-and-gates.md) §134 for details.

---

## Bidirectional attest (§149): both sides must cite

Ralph's side already covered (Test-Process / Cases / Results trio). Lisa's side:

```markdown
[PASS]

## ... Review

Reviewed-PLAN-rows: C1, C3, C7
Reviewed-test-files: cli/src/test/foo.test.ts:42-67
Reviewed-test-log: cmd="npm test --prefix cli" passed=N failed=0 total=M
Pass-Rationale: <≥40 chars + ≥1 file:line cite>
Verified: .dual-agent/gate-results.md
```

Trusted `Verified:` paths (3 categories):

- `.dual-agent/gate-results.{md,json}` (written by quality-gate / runGate)
- `.dual-agent/harness-results/*` (written by cascade / preset; Lisa can drop review notes here too)
- `.dual-agent/auto-tdd-plan-*.json`

⚠️ `plan validate` does **not** write `gate-results.md`. For PLAN-only rounds wanting a cite, Lisa writes a review-summary file under `harness-results/` and cites it.

---

## Common BLOCKED messages and how to handle them

| If you see | Likely cause | How to unblock |
|---|---|---|
| `§149: must include Test-Process` | Missing one of the three lines | Add `Test-Process: file://...` |
| `Test Results contains unverified claims` | §137: cmd doesn't match log / didn't run in last 10min | Run `quality-gate` to refresh log + submit immediately; cmd string must exactly match log |
| `task-type-file-mismatch` | §207: current task_type wrote a forbidden file | See [`test-harness-and-gates.md`](./test-harness-and-gates.md) §207 |
| `lisa-rerun-not-verified` | §144: Lisa missing `Verified:` cite or untrusted path | Cite one of the 3 trusted paths |
| `phase-test-coverage-missing` | §145: declared ≥2 phases but used 5-col table | Switch to 6-col Phase table |
| `complexity-judge-missing` | §123: complex task R1 [PLAN] body missing judge JSON | Run `task complexity-judge --slice X --json` and paste output |
| `clarify-not-completed` | §128: complex task skipped R0 [CLARIFY] | Run `clarify --start` full 5-stage; or `clarify --skip` for simple tasks |
| `task-capability-unacked` | §122: missing explicit ack of testing capability | Run `task capability ack-user --signature "..."` |
| `doc-oracle-spec table missing` | doc-task PLAN/[FIX] missing 5-col oracle table | Add 5-col table with ≥1 Required ✓ + Dimension ∈ 9 canonicals |
| `auto-tdd-protocol` | §102: complex task missing Estimate or tests-only marker | R1 [PLAN]: add `**Estimate**: <N>r`; R2 [CODE]: add §49 §C marker |

---

## When can you legitimately escape?

Not every task should go through full TDD. These genuinely don't need tests:

- Editing `*.md` docs / comments → `**Tests**: none (doc-only)` or use `--type doc-task`
- Editing `*.json` / `*.yaml` / `*.toml` config (no schema changes) → `**Tests**: none (config-only)`
- Pure file rename (no content change) → `**Tests**: none (single-rename)`
- Editing `.rll/PLAN.md` / `CLAUDE.md` / `CODEX.md` protocol docs → `**Tests**: none (process-only)` or `--type process-task`

Only one of those 4 whitelist reasons is allowed. The reason can't be made up (plan validate rejects unknown values).

**Any code change (e.g. `cli/src/**`) cannot escape** — tests are mandatory.

---

## Viewing test reports

```bash
ralph-lisa test-report          # latest report
ralph-lisa test-report --list   # all reports
```

Reports go to `.dual-agent/test-reports/`. Each contains env info (Node version, OS, step+round) and the last 50 lines of test output.

---

## Still stuck → maintainer escalation

If you've followed everything above and still get blocked, and you can stably reproduce — this is likely an RLL bug. **Don't bypass enforcement** (`RL_POLICY_MODE=warn` and `RL_TASK_TYPE_OFF` style escapes hide the root cause). Proper path:

1. Capture the full BLOCKED output + repro steps and WeCom the RLL maintainer
2. Or file an Issue on super-rll with the repro
3. Temporary workaround: after maintainer confirmation, use the corresponding audit-named opt-out env (see [`test-harness-and-gates.md`](./test-harness-and-gates.md))
