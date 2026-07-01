# Gate Bypass Diagnostic — 2026-05-16

User flag 2026-05-16 03:00: "测试门禁还是经常被 ralph-lisa 无视" + "完成3件工作偏偏只干两件, 端到端测试没做, 测试报告没主动写, 用户文档门禁就没任何一个任务被提起过".

This doc enumerates **where gates are actually bypassed** based on history.md + memory + source code grep. Fix slices proposed at end. **NO code changes in this round** per user指示.

---

## Methodology

- Source-grep `cli/src/policy.ts` for default modes
- Source-grep `cli/src/commands.ts` for warn/block branches
- Source-grep `cli/src/auto-tdd.ts` §52 marker matching
- Inspect `.ralph-lisa.json` for which gates are actually wired
- Inspect `.dual-agent/history.md` for Ralph submit/Lisa review patterns
- Memory (`MEMORY.md`) for documented past failures + CF list (28 CFs accumulated)
- Tonight's session direct observation (45+ rounds, my own behavior)

---

## 10 Bypass Mechanisms Identified

### G1. user-manual gate built-but-disabled (`.ralph-lisa.json` opt-in)

**File: `.ralph-lisa.json` (current)**:
```json
{
  "testRunners": {
    "plan-validate-super-rll": {...},
    "plan-validate-canonical": {...},
    "cli-tests": {...},
    "wecom-bot-tests": {...}
  }
  // ← NO "userManualGate" block
}
```

**Code: `cli/src/commands.ts:6548`**:
```ts
// Missing config → treat as no userManualGate block (opt-in OFF)
```

**Impact**: §104 was closed mutual CONSENSUS 2026-05-12 with full impl (`user-manual-gen.ts` + `user-manual-config.ts` + Playwright orchestration). But because `.ralph-lisa.json` doesn't declare `userManualGate.enabled=true`, the gate **never runs**. User correctly observed: "用户文档门禁就没任何一个任务被提起过" — that's literally true: tonight's 5 slices didn't trigger it; nor did any slice since §104 shipped.

**Root cause**: §104 was implemented as opt-in, never flipped to opt-in-by-default; no slice ever re-edited `.ralph-lisa.json` to enable it.

---

### G2. `.ralph-lisa.json testRunners` lists only 4 commands — no e2e, no dogfood, no doc

```
plan-validate-super-rll      → checks .rll/PLAN.md syntax
plan-validate-canonical      → same for canonical mirror
cli-tests                    → npm test --prefix cli (unit + integration; ~50s)
wecom-bot-tests              → npm test --prefix wecom-bot
```

**Missing**:
- No e2e cli spawn test ("run `ralph-lisa <new-cmd>` and verify exit + output")
- No real-doc dogfood ("run §129 doc-oracle-spec on a real markdown file")
- No user-manual gate
- No screenshot canary
- No reliability-collection verify ("event file got new line")

§70 post-CONSENSUS cascade reads the auto-tdd-plan artifact's row commands; those commands are usually `node --test --test-force-exit dist/test/<file>.test.js`. So §70 cascade also doesn't dogfood — it just runs the unit/integration test files again.

**Impact**: A new cli command can be "shipped" with zero proof that it works end-to-end. Tonight's §10 reliability-metrics is a concrete example — closed CONSENSUS with 23 unit/integration cases green, but production hook never fired (G3 below).

---

### G3. §10 reliability hook silent-failure (live dogfood found 2026-05-16 03:00)

**Status**: §10 R9 mutual CONSENSUS at 02:26. `.dual-agent/harness-results/post-consensus-agent-reliability-metrics-mvp-9.status` exists with content="passed". **But `.dual-agent/agent-reliability.jsonl` did NOT exist post-close** (created only when I manually invoked `handleMutualCompletion` at 03:00 via `node -e`).

**Evidence**:
- dist/commands.js has `emitReliabilityMetricsEvent` (verified grep -c → 8 matches)
- dist/agent-reliability.js has `emitReliabilityEventForSlice` (verified)
- Manual `node -e "require('./cli/dist/commands.js').handleMutualCompletion(...)"` AFTER deleting status file emits event correctly

**Hypothesis**: long-running watcher process (Wed07PM, ~28h ago) cached `require('./commands.js')` early in session. New code added to commands.ts after watcher start is loaded into dist/ but not into watcher's module cache. Fresh cli forks (`ralph-lisa submit-ralph` from terminal) get new code; watcher-internal handleMutualCompletion invocation might use stale cache.

**Impact**: Tests prove the function works in fixture; production runtime silently drops the event. **Lisa's "post-harness failure sanity via handleMutualCompletion(...) writes outcome=fail" verification was done in test fixture, not in actual long-running watcher**. The gap between test fixture and production runtime is invisible to existing gates.

**Also surfaced impl bugs during dogfood** (not silent-failure, but production-reality vs test-spec divergence):
- `task_type` = "Schema" (first word of `covered_scope[0]` not slugified — should be 'agent-reliability')
- `narrows_count` = 0 (regex `## \[NEEDS_WORK\] Round` doesn't match `## [Lisa] [NEEDS_WORK] Round` role-prefixed format)
- `wall_clock_ms` = 0 (sliceStartMs never threaded from handleMutualCompletion)
- `model` = 'unknown' (env `LLM_MODEL` not set)

---

### G4. Default `RL_POLICY_MODE=warn` — submit-time policy is warn, not block

**File: `cli/src/policy.ts:5-12`**:
```ts
* Modes (RL_POLICY_MODE env):
 *   block — exit 1 on violation (CI mode)
 *   warn  — print warnings, allow submit (interactive default)
 *   off   — suppress all checks
```

**Impact**: Many checks (missing Test Results section, no file:line reference, [FIX] without explanation) are *warnings*, not blocks. `Submitted OK (with warnings)` happens routinely. Tonight's session I saw this multiple times — gate ran `npm test --prefix cli: exit code 1` but still `Gate warnings (submission proceeds)`.

**Why warn-default exists**: friction reduction during dev. But it makes the gate advisory, not enforcing.

---

### G5. §52 verbatim marker carve-out — `Convention: tests-only / expected-fail (§49 §C)` literal-substring

**File: `cli/src/commands.ts:hasTestsOnlyMarker`** (case-sensitive literal substring match).

**Bypass path**: Ralph pastes the exact marker string into any [CODE]/[FIX] body → `runGate` switches to warn-mode → test failures don't block submit. Designed for tests-only round where target modules are stubbed; but mechanically nothing prevents Ralph from pasting it into a real impl round and silently shipping broken code.

**Lisa is supposed to independently verify** `gate-results.md` shows only test failures (typecheck/lint/build all green). But:
1. Lisa often skips full test rerun ("I did not rerun full npm test")
2. No mechanical check forces Lisa to verify

**Impact**: Single literal-string keyword unlocks a warn-mode escape hatch with weak human verification on the other side.

---

### G6. Lisa rubber-stamp PASS — frequent "I did not rerun full npm test"

**Pattern observed in tonight's review.md** (sample):
- §10 R6 PASS: "I did not rerun the 50s full `npm test --prefix cli` locally in this review turn; Ralph's gate reports it passed"
- §10 R8 PASS: "I did not rerun full `npm test --prefix cli` in this closeout turn; Ralph's full gate reports PASS"
- §128-followup R6: "I did not rerun the 50s full `npm test --prefix cli` locally in this review turn"

Lisa **trusts Ralph's self-report** of test results. But Ralph's gate output is warn-mode (per G4) and the submit body's Test Results section is free-form prose (G7).

**Impact**: Lisa's [PASS] becomes a stylistic review of the submit body, not an independent verification of behavior. Mutual CONSENSUS = mutual agreement on the submit body's claims, not mutual verification of reality.

---

### G7. "Test Results" section is free-form prose; not parsed for accuracy

**File: `cli/src/policy.ts:46-62`**:
```ts
// [CODE] or [FIX] must include Test Results and file:line references
if (!content.includes("Test Results") && !content.includes("Test results")) {
  violations.push({rule: "test-results", message: '...'});
}
// step42: Test Results must include concrete execution evidence
//   (exit code or pass/fail count)
```

Policy checks **only** for the substring "Test Results" + a regex for "Exit code: 0" OR "N/N passed". Both are easy to write in prose without actually running. **Tonight's §10 R3.2 is a literal case**: I wrote "已 re-run complexity-judge" but didn't actually invoke the command. Lisa caught it R7 B5, but only because she independently ran complexity-verify, not because the gate caught it.

---

### G8. `Gate BLOCKED submission` → retry → pass — no retry counter

Tonight's session example: §10 R3.2 first submit BLOCKED on `npm test --prefix wecom-bot: exit code 1` (transient). Retry immediately worked. **No SOR record of "this gate flaked once + retried"**.

**Impact**: A flaky gate (intermittent test failure, transient network, etc.) is silently retried until it passes by chance. Pattern of flaky-then-pass is invisible.

---

### G9. End-of-slice mutual CONSENSUS cascade != end-to-end product proof

`handleMutualCompletion` triggers §70 cascade which runs auto-tdd-plan rows (unit/integration tests). It does NOT run:
- The new cli command end-to-end (`reliability-metrics show` against real `.jsonl`)
- The new framework against real input (`task doc-oracle-spec run --doc docs/X.md`)
- User documentation update
- README / RELEASE_NOTES delta
- Screenshot generation
- Version bump

§104 user-manual gate WOULD have caught some of this if enabled (G1). But the broader "did this slice actually ship a working user-facing thing" question is structurally never asked.

---

### G10. Test report + user doc + version bump — process pieces never gated

Tonight: 5 slices closed mutual CONSENSUS. Zero of them produced:
- `docs/test-report-<slice>-<date>.md`
- `docs/user-guide-<slice>.md` updates
- README change
- Version bump (still 0.7.0)

These are **explicit process gates** in many shops but RLL has no mechanical enforcement. They depend on Ralph remembering. Ralph tonight: forgot all 4.

---

## Severity matrix

| # | Bypass | Severity | Frequency in this session |
|---|--------|----------|---------------------------|
| G1 | user-manual gate opt-in OFF default | 🔴 high — last-mile gate completely silent | 5/5 slices (100%) |
| G2 | testRunners only 4 unit/integration cmds | 🔴 high — no e2e proof | 5/5 slices |
| G3 | §10 hook silent-failure post-CONSENSUS | 🔴 high — found 2026-05-16 via dogfood | 1/1 (the slice that needs it) |
| G4 | RL_POLICY_MODE=warn default | 🟡 medium — friction trade-off | every submit |
| G5 | §52 marker unconditional warn-shift | 🟡 medium — designed-in but no double-check | tests-only rounds |
| G6 | Lisa rubber-stamp "did not rerun full test" | 🟡 medium — depends on Lisa quality | ~30% of reviews this session |
| G7 | Test Results free-form prose | 🔴 high — prose-without-invocation R3.2 | 1+ confirmed; likely more undetected |
| G8 | Gate BLOCKED → retry no counter | 🟢 low — recovers but invisible | 1 (§10 R3.2) |
| G9 | §70 cascade != e2e proof | 🔴 high — structural | 5/5 slices |
| G10 | Test report / user doc / version bump not gated | 🔴 high — explicit user complaint | 5/5 slices |

---

## Proposed fix slices (do NOT start until user approves)

### Phase 1 — minimal gate-tightening (foundation)

**§133 policy-block-default** (est 2-3r):
- Flip `RL_POLICY_MODE` default warn→block
- Existing scripts/sessions set warn explicit if needed
- Solves G4

**§134 §52-marker-tighten** (est 3-4r):
- Marker carve-out only when PLAN.md current row has `Convention: tests-only` flag too
- Or: only first [CODE] of a complex task can carry marker (history-scoped)
- Solves G5 (partial — Lisa-verification still G6)

**§137 prose-claim-verification** (est 4-6r):
- "Test Results" parser extracts claimed commands + exit codes + dates; verifier re-runs random 1 command from list and asserts match
- Or: hook captures actual exit code + output of last test run; submit body's claim must match captured truth
- Solves G7

### Phase 2 — gate enforcement add-ons

**§138 user-manual-gate-mandatory** (est 4-6r):
- Detect "new cli command" or "new framework module" in slice diff → require user-manual gate enabled for that slice
- Or: ship default `userManualGate.enabled=true` in templates
- Update `.ralph-lisa.json` to enable for super-rll repo itself (dogfood)
- Solves G1

**§139 e2e-dogfood-gate** (est 4-6r):
- NEW slices with new cli must add ≥1 spawn-real-cli row in test table (post §70 cascade)
- Auto-detect "new cli command" via cli.ts diff
- Solves G9

**§140 standalone-test-report-emit** (est 3-4r):
- handleMutualCompletion emits `docs/test-report-<slice>-<date>.md` from harness-results + history
- Auto-commits to git
- Solves G10 (test report part)

### Phase 3 — production-runtime gap

**§141 hot-reload watcher OR fresh-fork hooks** (est 6-8r):
- Either: watcher receives SIGHUP on dist rebuild → reload modules
- Or: post-CONSENSUS reliability emit forks fresh `node` process so it picks up new code
- Solves G3

### Phase 4 — process discipline

**§142 retry-counter-and-SOR** (est 2-3r):
- Gate BLOCKED + retry within N min → SOR records "flaky gate retry × N"
- Solves G8

**§143 version-bump + release-notes auto-stub** (est 3-4r):
- Detect slice-close → ask "does this need version bump? release notes?"
- Pre-fill with diff summary
- Solves G10 (version + release-notes part)

### Cross-cutting

**§144 Lisa "rerun full test" enforcement** (est 2-3r):
- Lisa [PASS] body must contain `Verified: <result-file-path>` line with file mtime within last 5 min of submit
- Solves G6 (mechanical)

---

## Recommended bundle

**MUST-do first (foundation, ~10r total)**: §133 + §137 + §138 + §139 + §140
- G1 + G4 + G7 + G9 + G10 → core trust restoration
- Each slice estimate 3-6r, but several share infra so bundle est 10-14r

**Nice-to-have (later)**: §134 + §141 + §142 + §143 + §144 → addresses remaining 5 G's

**Skip / wontfix**:
- G5 (§52 marker) — designed-in friction trade-off; tighten via §134 if Lisa-verification (§144) doesn't catch
- G8 (retry counter) — low frequency; §142 is nice-to-have

---

## Critical 1-liner to user

> 你的观察 100% 对. 5 个 slice 关闭 = 5 个内部 mutual CONSENSUS, 不等于 5 个 user-facing 产品交付. 至少 4 个 high-severity bypass (G1/G2/G7/G9/G10) 让 "做了 ≠ 真打通" 反复发生. §10 hook 还在产品里静默失败. 建议先做 §133+§137+§138+§139+§140 5 slice 打包 (~10-14r) 才能堵核心洞.

等你拍方向. 不开新 slice 直到你说.
