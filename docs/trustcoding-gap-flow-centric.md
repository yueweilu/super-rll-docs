# Trust-coding 闭环流程 + Gap 映射 (cli + webui)

> User mandate (2026-05-13): "说清楚预期的闭环流程, gap 会出现在流程的哪一步, 有什么影响, 具体 gap 代码/指令的位置. 有个流程图把过程和 gap 指示出来最好".
> 
> Source data: §I (closed mutual CONSENSUS R5 2026-05-13) 34 gap claims (26 实锤 + 8 埋点) — 本文 reorganize into flow-centric view.

---

## 流程图: 预期 trust-code 闭环 (12 stages) + Gap 标注

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  S1. STACK DETECTION + PRESET LOAD                  [ralph-lisa init <task>]│
│     ⚠ gaps: C5, C10 (cli starter薄), W2, W7, W8 (webui starter薄)            │
│     file:line: cli/templates/test-cli/smoke.test.ts (30 LOC stub)            │
│                cli/templates/test-web/*.spec.ts (58 LOC total)                │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S2. R1 [PLAN] WRITING (test plan table)            [Ralph 写 PLAN body]    │
│     ⚠ gaps: X1, C11 (no §112 agent compose),                                 │
│             X4 (no methodology in role template),                            │
│             X5 (no oracle catalog), X6 (no corpus)                           │
│     file:line: cli/templates/roles/ralph.md (208 LOC, no 6-step),            │
│                cli/templates/roles/lisa.md (196 LOC, no 6-step)              │
│                docs/test-oracle-catalog.md (does not exist)                  │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S3. R2 [CODE] TESTS-ONLY / EXPECTED-FAIL           [Ralph 写测试, 不写impl]│
│     ✓ C8 working: §52 marker (used 16x overnight per E13c)                   │
│     file:line: cli/src/commands.ts:1071 hasTestsOnlyMarker()                 │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S4. SUBMIT-TIME GATE (RL_RALPH_GATE)               [submit-ralph 之前]     │
│     ⚠ gaps: C2 (only 4 cmds; cli-pty-daemon/Playwright/e2e missing)         │
│             C3 (20% real-spawn cli surface only — 21/106 files)              │
│             C4 (cli/test-e2e/run-e2e.ts 324 LOC not in gate)                 │
│     file:line: .ralph-lisa.json:3 testRunners (4 runners)                    │
│                cli/src/cli.ts:275 case "submit-ralph"                        │
│                cli/src/commands.ts:1750 cmdSubmitRalph (gate entry)          │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S5. R3 [CODE] IMPL + TESTS PASS                    [Ralph 写真 impl]       │
│     ✓ working                                                                │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S6. LISA REVIEW + NARROWS                          [Lisa 看代码 + B1/B2…]  │
│     🔧 埋点 needed:                                                          │
│        C12+X8 (per-slice narrow rate + class distribution 没量化)            │
│     file:line: 当前无 structured narrow-emit                                  │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S7. MUTUAL CONSENSUS                               [双方都 [CONSENSUS]]    │
│     🔧 埋点 needed: C13 (cycle time per slice 没量化)                        │
│     file:line: 当前无 slice_started/mutual_consensus_reached event           │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S8. §70 POST-CONSENSUS CASCADE GATE                [auto-tdd-plan 触发]    │
│     ✓ C6 working: cascade fire history exists (15 slices' artifacts present) │
│     ⚠ gaps: C1 (functional tier optional → 默认不跑)                         │
│             C7 (tier 88% unit+int / 12% functional / 3% e2e 严重偏)         │
│             C9 (0 cli sub-cmd real spawn rows in any slice's tdd plan)      │
│             X3 (no full-lifecycle watcher.sh test — 5-hour-stall class)     │
│     🔧 埋点: C14 (cascade tier attempted-vs-reached 没量化)                  │
│     file:line: cli/src/commands.ts:6481 handleMutualCompletion (cascade)   │
│                cli/templates/presets/cli-cmd.json: functional in optional   │
│                .dual-agent/auto-tdd-plan-*.json (15 artifacts evidence C6) │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S9. §104 MANUAL-GATE (opt-in only)                 [if userManualGate=true]│
│     ⚠ gaps: W1 (super-rll root userManualGate present:False — disabled)     │
│     ✓ working: W5 §104 dogfood validated (§106 R3)                          │
│     🔧 埋点: W9, W10 (manual-gate fire + playwright drift 没量化)            │
│     file:line: cli/src/commands.ts:6351 maybeRunUserManualGate              │
│                cli/src/commands.ts:6396 generateUserManualForStep           │
│                cli/src/playwright-command-builder.ts (§106 R3 bug-fixed)   │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼ (if cascade fail)
┌──────────────────────────────────────────────────────────────────────────────┐
│  S10. §79 LOOPBACK ON CASCADE FAIL                  [turn 回 Ralph]         │
│     🔧 埋点 needed: X9 (8-连 deadlock frequency 没记)                        │
│                    X10 (narrow rate down 30% claim 没 baseline)              │
│     file:line: cli/src/loopback.ts (226 LOC, §79 entry)                     │
│     deadlock detector cmd (line unstable):                                  │
│       rg -n "8-consecutive\|deadlock\|NEEDS_WORK" cli/src/commands.ts        │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S11. SLICE CLOSEOUT + TELEMETRY EMIT               [post-mutual; history]  │
│     ⚠ gaps: X2 (§121 PostHog ingest 0 production file — 整层 observability) │
│             W6 (k6 binary not auto-installed — perf tier blocked)            │
│     file:line: cli/src 没 *posthog*.ts production; perf/stability blocked    │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  S12. RELEASE-GATE.SH (manual at release time)      [bash release-gate.sh]  │
│     ⚠ gaps: X7 (3 release-gate.sh locations all manual-only, no auto-trigger)│
│             (C4 same — run-e2e.ts could wire here but isn't)                 │
│     file:line: platform/scripts/release-gate.sh                              │
│                rll-team-platform/scripts/release-gate.sh                     │
│                staging/margay-v2-tests/scripts/release-gate.sh               │
└──────────────────────────────────────────────────────────────────────────────┘

Gap summary on flow:
  实锤 gaps (现在能直接证): C1, C2, C3, C4, C5, C7, C9, C10  (cli stack);
                              W1, W2, W3, W4, W6, W7, W8       (webui stack);
                              X1, X2, X3, X4, X5, X6, X7        (cross-stack)
  埋点 needed (需 §121 才能量化): C12, C13, C14 (cli);
                                    W9, W10     (webui);
                                    X8, X9, X10 (cross)
  ✓ working evidence (positive — already in place):
       C6 cascade fire history (15 slices' artifacts in .dual-agent/auto-tdd-plan-*.json);
       C8 §52 marker (used 16x overnight via hasTestsOnlyMarker:1071);
       W5 §104 dogfood validated (§106 R3 real chromium + manual.md gen)
```

---

## 每 stage 详细: gap + 影响 + file:line

### S1. Stack detection + preset load

| Gap | 影响 (what breaks if not fixed) | 实锤 location |
|-----|--------------------------------|------------|
| **C5**: cli starter (`smoke.test.ts`) 30 LOC stub, 只 `--help`+`--version` | 客户起 cli 项目时 RLL 给的测试模板太薄, 用户自己得从零写, RLL 价值打折 | `cli/templates/test-cli/smoke.test.ts:1-30` (run `cat`) |
| **C10**: cli starter 缺 RLL-spec lifecycle templates (init/state/gate/wecom) | 客户用 RLL 接 cli 项目时, 测试 patterns 不够 starter-friendly | `cli/templates/test-cli/` (仅 1 file; no init/state/gate templates) |
| **W2**: webui starter (smoke+api+config) 58 LOC | webui 项目 RLL 给的模板薄, 仅测 `homepage loads + nav visible + /api/health JSON` | `cli/templates/test-web/smoke.spec.ts:1-26 + api.spec.ts:1-16 + playwright.config.ts:1-16` |
| **W7**: functional tag drift (preset 用 `@functional`, starter `smoke@smoke / api@func`) | grep filter 不命中, optional tier silently skip | `cli/templates/presets/web-ui.json functional cmd "--grep '@functional'"` vs `cli/templates/test-web/api.spec.ts:3 "@func"` |
| **W8**: 没 `.ralph-lisa.json.example` 教客户怎么开 userManualGate | 客户不知道有 §104 manual-gate auto-screenshot+manual.md 能力 | `find cli/templates -name "*.ralph-lisa*"` → 0 results |

### S2. R1 [PLAN] writing

| Gap | 影响 | 实锤 location |
|-----|------|------------|
| **X1+C11**: 0 agent compose surface | Ralph (我) R1 PLAN test table 全凭经验, oracle 设计弱; 类似 §106 C5 conditional assertion / §116 LOC target 误判 类 bug 反复发生 | `cli/src/*.ts grep "strategize\|cmdStrategize\|test-strategist"` → 0 hits; `cli/src/cli.ts` 没 `strategize-tests` case |
| **X4**: 6-step methodology 不在 role template | 新 Ralph 实例不知 6-step (边界/假阳/hermeticity/契约/复用/跨slice一致); 每次依赖 CLAUDE.md scatter | `cli/templates/roles/ralph.md:208 LOC` + `lisa.md:196 LOC` (`grep "Step 1.*边界\|Step 6.*跨 slice"` → 0) |
| **X5**: 0 oracle catalog | Ralph 每 R1 PLAN oracle 从零写; smoke oracle / e2e oracle / functional oracle 没 reference 库; 风格不统一 | `find docs -name "*oracle*"` → 0 |
| **X6**: 0 test corpus | 过去 slice 的设计经验不复用; 每 slice 重新发明 | `find ~/.rll/test-corpus 2>/dev/null` → 0 dir |

### S3. R2 [CODE] tests-only / expected-fail

| ✓ Working | 实锤 |
|-----------|------|
| **C8**: §52 marker 真用 + gate warn-mode 真切换 | overnight 16 次 `Convention: tests-only / expected-fail` per `rg ... history.md \| wc -l` → 16; `cli/src/commands.ts:1071 hasTestsOnlyMarker()` 真识别 |

### S4. Submit-time gate (RL_RALPH_GATE)

| Gap | 影响 | 实锤 location |
|-----|------|------------|
| **C2**: gate 只 4 cmd, cli-pty-daemon/Playwright/e2e 不在 | cli-pty-daemon (25 tests) 改动不在 submit-time gate 抓; Playwright e2e 永远等 cascade 才知; `cli/test-e2e/run-e2e.ts` L5 不在 | `.ralph-lisa.json testRunners` 4 keys (plan-validate-super-rll, plan-validate-canonical, cli-tests, wecom-bot-tests) |
| **C3**: ~20% cli test 文件 real-spawn (21/106) | 80% cli 测试是 unit/in-process; cli 真行为 (process spawn / stdout / state mutation) 测得少 → "stateDir double-nesting" 类 bug 自动测难抓 | see copy/paste cmd below → 21; total 106 (§I R2-corrected regex) |
| **C4**: `cli/test-e2e/run-e2e.ts` 324 LOC L5 e2e 真存在但不在 gate | 真 claude+codex e2e 只能 manual 跑; submit-time 看不见; release-gate.sh 也没 wire | `wc -l cli/test-e2e/run-e2e.ts` → 324; `grep run-e2e .ralph-lisa.json` → 0 hits |

**C3 reproducible command (copy/paste — unescaped pipes work outside markdown table)**:

```bash
rg -l "execFileSync\(\s*process\.execPath|execFileSync\(\s*['\"]node['\"]|spawnSync\(\s*process\.execPath|spawnSync\(\s*['\"]node['\"]|execSync\(.*node " cli/src/test/*.test.ts | wc -l
# → 21

find cli/src/test -name "*.test.ts" | wc -l
# → 106 (denominator)
```

### S5. R3 [CODE] impl + tests pass

✓ Working: 当 tests-only round 写好 + impl 写好, npm test 真跑 + assertions 真生效.

### S6. Lisa review + narrows

| 🔧 埋点 needed | 影响 (现在 unverifiable) | 设计 |
|---------------|----------------------|------|
| **C12 + X8**: per-slice narrow rate + class distribution 没结构化 | "narrow rate 下降 30%" / "agent compose 真减 narrow 数" 类声明永远不能 mechanically prove | 埋 `lisa_narrow { slice, round, B_id, class }`; Lisa review.md 加 structured B-section parser; emit to §121 |

### S7. Mutual CONSENSUS

| 🔧 埋点 needed | 影响 | 设计 |
|---------------|------|------|
| **C13**: slice cycle time 没量化 | "trust-code 加速 X%" 不能 prove; 哪些 slice 慢哪些快 不知 | 埋 `slice_started` (next-step 时) + `mutual_consensus_reached` (close 时); §121 emit; §122 P50/P95 dashboard |

### S8. §70 post-CONSENSUS cascade gate ⚠ 最大 gap 集中点

| Gap | 影响 | 实锤 location |
|-----|------|------------|
| ✓ **C6** (working evidence): cascade fire history exists across 15 slices | cascade infrastructure真启动 — 不是缺机制, 是 declared rows skewed (C7/C9 下) | `ls .dual-agent/auto-tdd-plan-*.json \| wc -l` → 15 |
| **C1**: cli-cmd preset `functional` tier optional (`requiredTiers: [unit, smoke, integration]; optionalTiers: [functional]`) + `RL_GATE_INCLUDE_OPTIONAL` default false | **cli 真 spawn 测试默认 cascade 不跑** — 所有 cli sub-cmd happy-path 自动测试不在闭环 | `cli/templates/presets/cli-cmd.json:requiredTiers / optionalTiers` |
| **C7**: tier 分布 88% unit+integration / 12% functional / 3% e2e (across 15 slices' 81 rows) | cascade 跑得多是 unit, 真行为级测试占比小 | `for f in .dual-agent/auto-tdd-plan-*.json; do ... tier ...; done \| sort \| uniq -c` → measured |
| **C9**: 0 cli sub-cmd real-spawn auto-tdd row in 15 slices | 15 slices 没一个把 cli sub-cmd 真 spawn 测试作 cascade row — §110 真没 ship | `grep -l "functional" .dual-agent/auto-tdd-plan-*.json` 10 rows 全是别的 stack tests, 没 cli sub-cmd spawn |
| **X3**: no full-lifecycle watcher.sh test | F1 5-hour-stall / F14 escalation 类 bug 没 cascade 自动覆盖 | 4 文件提 watcher.sh (cli.test.ts, inbox-wake-tmux.test.ts, watcher.test.ts, watchdog-restart.test.ts) 但 0 full-lifecycle spawn — verified at watcher.test.ts:2019 "does NOT spawn child process" + watchdog-restart.test.ts:44 "Fake watcher.sh script" + inbox-wake-tmux.test.ts:20-107 function-slice only |
| 🔧 **C14**: cascade tier attempted-vs-reached 没量化 | cascade halt-on-fail 时 halt 在哪 tier? declared tier 真 fire 比率多少? unknown | 埋 `cascade_tier_attempted` + `cascade_tier_reached` per row; §121 emit |

**Cascade entry**: `cli/src/commands.ts handleMutualCompletion` (line 6481)

### S9. §104 manual-gate (opt-in only)

| Status | 实锤 location |
|--------|------------|
| ✓ **W5 working**: §104 dogfood validated end-to-end via §106 R3 — real chromium + screenshot + manual.md gen | `cli/src/commands.ts:6396 generateUserManualForStep` + `cli/src/playwright-command-builder.ts (§106 R3 bug-fixed)` |
| ⚠ **W1 gap**: super-rll root userManualGate present:False | super-rll 自己 mutual CONSENSUS 时 §104 不 fire — §106 R1 B3 hermetic 锁; 没自动验证 production path | `python3 -c "import json; print('userManualGate present:', 'userManualGate' in json.load(open('.ralph-lisa.json')))"` → False |
| ⚠ **W3+W4 gap**: 1 cli/src/test 用 @playwright/test + 0 用 real http-server fixture | webui-flavored testing pattern 不在 super-rll cli regression suite | `rg -l "@playwright/test" cli/src/test/*.test.ts \| wc -l` → 1 |
| 🔧 **W9 埋点**: manual-gate fire frequency in client projects 没量化 | RLL 客户多少项目真启用 userManualGate? 未知 | 埋 `manual_gate_fired { project_hash, slice_id, outcome }` |
| 🔧 **W10 埋点**: Playwright cmd-builder drift detector 没实现 | §106 R3 `--screenshot=on` 这种 builder-vs-CLI-reality drift 类 bug 只能 dogfood 时 reactive 抓 | 埋 `playwright_cmd_built { cmd_string }` + `playwright_exec_failed { stderr_excerpt }` |

### S10. §79 loopback on cascade fail

| 🔧 埋点 needed | 影响 | 设计 |
|---------------|------|------|
| **X9**: 8-连 deadlock 频率不记 | CLAUDE.md 说 8-连 watcher 自动暂停, 实际触发频率多少? 0? 10次? 不知 | watcher 8-consecutive detector emit `deadlock_threshold_reached { slice, ralph_round }` |
| **X10**: "narrow rate down 30%" §F R6 lock 7 claim 无 baseline | "下降 30%" 数字无锚, 不能验证 §112 真有效 | §121 + X8 capture → §122 dashboard 长期 P50/P95 trend |

**Loopback entry**: `cli/src/loopback.ts (226 LOC, §79)`

### S11. Slice closeout + telemetry emit

| Gap | 影响 | 实锤 location |
|-----|------|------------|
| **X2**: §121 PostHog ingest 0 production file | 整层 observability 缺; 8 of 34 gap claims (S6+S7+S8 埋点+S9 W9+W10+S10 X9+X10) 永远 unverifiable | `find cli/src -name "*posthog*" -not -path "*test*"` → 0 production files |
| **W6**: k6 binary 不自动装 | webui perf/stability tier 在没装 k6 的机上 silent skip | `cli/templates/presets/web-ui.json perf.requiredBinary: "k6", locallyRunnable: false`; RLL init 不 install |

### S12. release-gate.sh (manual at release time)

| Gap | 影响 | 实锤 location |
|-----|------|------------|
| **X7**: release-gate.sh 3 location 全 manual-only, 无 git-tag-trigger | release 时人忘了跑 → 漏抓 heavy bug | `find . -name release-gate.sh -not -path "*/node_modules/*"` → 3 paths (platform/scripts/, rll-team-platform/scripts/, staging/margay-v2-tests/scripts/); 无 git hook wire |

---

## 总结: 闭环现状

| Stage | Status | 关键 gap | Lisa-locked 修复 slice |
|-------|--------|---------|----------------------|
| S1 starter | 🟡 薄 | C5/C10/W2/W7/W8 | (附带 §110 + §117 改 starter) |
| S2 R1 PLAN | ⚠ 弱 | X1/C11/X4/X5/X6 | **§120 + §117 + §112** |
| S3 §52 R2 | ✓ work | **C8 working** (§52 marker 16 uses) | — |
| **S4 submit gate** | ⚠ 漏 | C2/C3/C4 | **§110** (cli functional 接 gate) |
| S5 R3 impl | ✓ work | — | — |
| S6 Lisa review | 🔧 unverifiable | C12+X8 埋点 | **§121** |
| S7 mutual | 🔧 unverifiable | C13 埋点 | **§121** |
| **S8 §70 cascade** | ⚠ 严重偏 (但 ✓ C6 cascade infra works) | **C6 working** + C1/C7/C9/X3 gaps + C14 埋点 | **§110 + §121** (X3 watcher-bash-e2e → §107 ※ outside-critical-path Phase 2 supporting slice, not 0.8.0 D1 blocker per §H R6 lock + §I I1-I8) |
| S9 §104 manual-gate | ✓+⚠ | W1/W3/W4 + W9/W10 埋点 | I5 follow-up slice (after §110 stable) + **§121** |
| S10 loopback | 🔧 unverifiable | X9+X10 埋点 | **§121** |
| S11 closeout | ⚠ no observability | X2 + W6 | **§121** (mandatory) |
| S12 release-gate | ⚠ manual-only | X7 | (TBD — Direction 2 territory) |

## Critical-path (Lisa-locked, evidence-justified)

```
§110 (5-7r)   → 修 S4+S8 cli functional gate
§120 (4-6r)   → 修 S2 methodology in role template
§117 (3-5r)   → 修 S2 oracle catalog
§112 (10-12r) → 修 S2 agent compose
§112 dogfood (3-5r) → 验 §112
§121 (8-12r)  → 修 S6+S7+S8+S9+S10+S11 整层 observability + 解锁 8/34 unverifiable claims
```

**Total: 33-47r + dogfood TBD**

---

## Appendix: reproducible commands for every gap

Same as `docs/trustcoding-gap-cli-webui-evidence-report.md` Appendix (§I closed mutual R5). 各 gap (C1-C14 / W1-W10 / X1-X10) 对应 cmd 不复述, 见原 doc Appendix.
