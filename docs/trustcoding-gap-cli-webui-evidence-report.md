# Trust-coding Gap — cli + webui Evidence Report

> User instruction (2026-05-13): "根据昨天定的 roadmap, 给我一个报告, 确定 webui 和 cli 两个技术栈在 trustcoding 目标的 gap. 分析代码和日志, 要**实锤证据**确认问题, 没有实锤**设计埋点来抓证据**". Scope: ONLY cli + webui.
> 
> Methodology lock: every gap claim 必须落在 (1) **实锤** (file:line / cmd output / artifact path) OR (2) **埋点设计** (instrumentation needed to capture future evidence).

---

## Table of Contents

1. Trust-coding 目标 (per §90 + §G + §H 已 locked)
2. Methodology — 实锤 vs 埋点 分类规则
3. CLI stack gap evidence table
4. webui stack gap evidence table
5. Cross-stack 共通 gap evidence table
6. 埋点 (instrumentation) design — for evidence-less claims
7. Evidence-refined critical-path
8. Lisa discussion candidates

---

## 1. Trust-coding 目标 (locked baseline)

Per §90 closed-loop research + §G Direction 1 lock + §H Section 6.2 lock, "trust-coding 闭环 (cli + webui)" production-ready baseline 定义:

- **(T1) TDD-first 协议自动 enforce**: R1 PLAN test table + R2 tests-only/§52 marker + R3 impl 自动 enforce (per §102 v1.2 + §52)
- **(T2) 多 tier 门禁 auto-fire**: unit + smoke + integration **真自动跑** per stack preset (cli-cmd / web-ui), functional tier 不 silent-skip
- **(T3) Closed-loop fail handling**: gate fail → §70 cascade halt → §79 loopback to Ralph 真触发, 不靠人盯
- **(T4) Agent-composed test plan**: Ralph (or 客户用户) 写 R1 PLAN 时, agent (§112) 草拟 test table (rule→agent transition)
- **(T5) Methodology + asset reuse**: 6-step methodology embedded in role template (§120), oracle catalog accessible (§117), test-lib helpers reusable (§116 ✓ shipped)
- **(T6) Quantified observability**: trust-code metrics emitted to PostHog (§121 + §122); narrow-rate / cycle-time / deadlock-frequency measurable
- **(T7) Real e2e at cascade level**: cli functional/L4 spawn auto-fires (§110/§107); webui Playwright + manual.md auto-generates (§104 + §106 ✓ infrastructure, but root opt-in pending)

---

## 2. Methodology — 实锤 vs 埋点

每个 gap 分类:

- **实锤 (Hard evidence)**: 已有 code/log/cmd-output 可直接证明. 提供 reproducible command + 截取 output.
- **埋点 (Instrumentation needed)**: 当前无 mechanical 测量, 必须 add metric capture (event log / cascade counter / time tracker / PostHog ingest) 才能 future 证明. 设计 instrumentation source.

下表 Evidence 列格式:
- 实锤: `cmd → output` 或 `file:line` 引用
- 埋点: `[NEED INSTRUMENTATION]` + design

---

## 3. CLI stack gap evidence

| # | Gap claim | Evidence | Status |
|---|-----------|----------|--------|
| C1 | **cli-cmd preset functional tier 不 required (auto-fire 不到 real cli spawn)** | `python3 -c "import json; d=json.load(open('cli/templates/presets/cli-cmd.json')); print(d['requiredTiers'])"` → `['unit', 'smoke', 'integration']`; `print(d['optionalTiers'])` → `['functional']`. Optional + default `RL_GATE_INCLUDE_OPTIONAL=false` → 真 cli spawn 测试除非显式 opt-in 否则不跑 | **实锤** |
| C2 | **Submit-time gate scope 只 4 commands, 不含 cli-pty-daemon / Playwright / e2e** | `cat .ralph-lisa.json` → `testRunners: { plan-validate-super-rll, plan-validate-canonical, cli-tests, wecom-bot-tests }` 共 4 runners. cli-pty-daemon (25 tests) 不在 list. `cli/test-e2e/web/smoke.spec.ts` Playwright 不在 list. `cli/test-e2e/run-e2e.ts` L5 也不在 | **实锤** |
| C3 | **Only ~20% of cli test files use real-spawn pattern (true L3+ surface limited)** | **Lisa R1 B1 corrected**: `rg -l "execFileSync\(\s*process\.execPath\|execFileSync\(\s*['\"]node['\"]\|spawnSync\(\s*process\.execPath\|spawnSync\(\s*['\"]node['\"]\|execSync\(.*node " cli/src/test/*.test.ts \| wc -l` → **21 files** (precise: matches `execFileSync(process.execPath, ...)` OR `execFileSync('node', ...)` OR same for spawnSync/execSync, NOT bare `|node` alternation). Total `find cli/src/test -name "*.test.ts" \| wc -l` → 106. **21/106 ≈ 20% L3+ ratio** (was reported 12%, regex flaw caught by Lisa) | **实锤** |
| C4 | **cli/test-e2e/run-e2e.ts L5 e2e exists but not in cascade or submit-gate** | `wc -l cli/test-e2e/run-e2e.ts` → 324 LOC. `grep cli/test-e2e .ralph-lisa.json` → 0 matches. Not in any testRunner. Manual `node cli/test-e2e/run-e2e.ts` only | **实锤** |
| C5 | **cli starter template (`cli-cmd/smoke.test.ts`) 仅 30 LOC stub, 仅测 `--help` + `--version`** | `cat cli/templates/test-cli/smoke.test.ts` 全文 30 LOC, 2 tests: `--help exits 0 + stdout > 0` 和 `--version exits 0`. 不覆盖 init/state/gate/wecom surfaces | **实锤** |
| C6 | **Cascade fire history exists across 15 slices** | `ls .dual-agent/auto-tdd-plan-*.json \| wc -l` → 15. 每 slice mutual-CONSENSUS 时 §70 reads + fires. **真自动跑过的 evidence** | **实锤** |
| C7 | **Cascade tier distribution skewed: 88% unit+integration, only 12% functional, 3% e2e** | Across 81 test rows from 15 auto-tdd-plan-*.json files: 46 unit (57%) + 19 integration (23%) + 10 functional (12%) + 4 smoke (5%) + 2 e2e (3%). **Real measurement, not estimate** | **实锤** |
| C8 | **§52 tests-only marker really used overnight (16 times)** | `rg "tests-only / expected-fail" .dual-agent/history.md \| wc -l` → 16. 16 个 [CODE]/[FIX] round used the marker. TDD-first 协议 enforce 真有用 | **实锤** |
| C9 | **§110 cli sub-cmd functional auto-tdd rows 不存在 (任何 slice 都没声明)** | `grep -l "functional" .dual-agent/auto-tdd-plan-*.json` 找到 10 行 functional tier 都是其他 slice 的(§106/§116/§103等), 没一个是 cli sub-cmd 真 spawn pattern. **§110 真的没 ship** | **实锤** |
| C10 | **cli starter template 缺 RLL-spec lifecycle (init/state/gate/wecom)** | `cli/templates/test-cli/` 只有 1 file (`smoke.test.ts`), 不含 `init/state/gate/wecom-feedback/whose-turn` 类 sub-cmd 模板 | **实锤** |
| C11 | **Ralph 手工写 R1 PLAN test table — agent 不参与** | grep `cli/src/commands.ts strategize-tests\|agent-driven-test-plan\|cmdStrategize` → 0 hits. `§112 test-strategist-agent` slice 未开 | **实锤** |
| C12 | **Narrow rate per slice 没量化** | history.md 没 narrow B-count 字段. 当前只能凭 round count proxy: §109 21, §103 33, §106 46, §116 33 history rounds (incl handoffs) — high but no class breakdown | **埋点** ([NEED INSTRUMENTATION]: per-slice narrow type classifier + count emit to PostHog event `narrow_recorded { slice, lisa_round, B_id, B_class }`) |
| C13 | **Trust-code cycle time per slice 没量化** | history.md timestamps exist but no aggregated "slice start → mutual CONSENSUS" duration metric | **埋点** ([NEED INSTRUMENTATION]: emit `slice_started` / `mutual_consensus_reached` events with epoch ms timestamps to PostHog; dashboard P50/P95 per slice type) |
| C14 | **Cascade tier auto-fire frequency vs declared 没量化** | `auto-tdd-plan-*.json` declares 10 functional rows across 15 slices but actual fire count unknown — cascade 跑 vs halt-on-fail-before-reach 没区分 | **埋点** ([NEED INSTRUMENTATION]: cascade `tier_attempted` + `tier_reached` event per row to disambiguate "declared but skipped because halted-earlier") |

---

## 4. webui stack gap evidence

| # | Gap claim | Evidence | Status |
|---|-----------|----------|--------|
| W1 | **Root super-rll/.ralph-lisa.json userManualGate NOT enabled** | `python3 -c "import json; d=json.load(open('.ralph-lisa.json')); print('userManualGate present:', 'userManualGate' in d)"` → `False`. §104 manual-gate 在本 repo 不 fire (Lisa §106 R1 B3 hermetic lock) | **实锤** |
| W2 | **webui starter (test-web/smoke.spec.ts + api.spec.ts) 仅 58 LOC** | `wc -l cli/templates/test-web/*.spec.ts` → smoke 26 + api 16 = 42 (+playwright.config.ts 16 = 58 total). smoke 仅测 page-title-not-empty + nav-visible + console-error-empty; api 仅测 `/api/health` 200 + JSON-shape | **实锤** |
| W3 | **Only 1 cli/src/test file imports `@playwright/test` (§106 newly added)** | `rg -l "@playwright/test" cli/src/test/*.test.ts \| wc -l` → 1 (`user-manual-gate-e2e-roundtrip.test.ts`). §106 R2 才加, 之前 0 | **实锤** |
| W4 | **0 cli/src/test file uses real http-server fixture pattern** | `rg -l "createServer.*listen\|startStaticServer" cli/src/test/*.test.ts \| wc -l` → 0. `cli/test-e2e/web/helpers/static-server.ts` 存在但仅 §106 e2e 用, 不在 cli/src/test 范围 | **实锤** |
| W5 | **§104 manual-gate end-to-end已 dogfood-validated** | §106 R3 [CODE] real chromium spawn + screenshot + manual.md 真生成 C5 test passed. Files: `cli/src/playwright-command-builder.ts` (§106 R3 bug-fixed), `cli/src/user-manual-gen.ts:64`, `cli/src/commands.ts:6396 generateUserManualForStep` | **实锤** |
| W6 | **webui perf/stability tier 需 k6 binary, RLL 不带安装步骤** | `cat cli/templates/presets/web-ui.json` perf/stability rows: `"requiredBinary": "k6", "locallyRunnable": false`. RLL init 不装 k6 | **实锤** |
| W7 | **webui functional grep tag (`@functional`) convention 不强制** | api.spec.ts use `@func` tag, smoke.spec.ts use `@smoke` — convention 散乱; preset declares `--grep '@functional'` but actual template tag is `@func` not `@functional` (drift) | **实锤** |
| W8 | **webui starter 不教用户 enable userManualGate** | `cli/templates/.ralph-lisa.json.example` 不存在 (`find cli/templates -name "*.ralph-lisa*" 2>/dev/null` → 0). 用户 init 后不知道怎么打开自动 manual.md | **实锤** |
| W9 | **客户项目用 webui preset 真打的频率/成功率没量化** | RLL 出去的 webui-stack projects 多少在 userManualGate=true 跑? 0 telemetry | **埋点** ([NEED INSTRUMENTATION]: when §121 ingest opens, add `manual_gate_fired { project_hash, slice_id, outcome }` event) |
| W10 | **Playwright 真 spawn 失败模式分类没量化** | §106 R3 dogfood 抓到 `--screenshot=on` invalid CLI flag — 这种"design lock 跟 reality drift" 类 bug 没机制 detect | **埋点** ([NEED INSTRUMENTATION]: §104 builder + manual-gate emit `playwright_cmd_built { cmd_string, builder_locks_applied }` + `playwright_exec_failed { exit_code, stderr_excerpt }`) |

---

## 5. Cross-stack 共通 gap evidence

| # | Gap claim | Evidence | Status |
|---|-----------|----------|--------|
| X1 | **Agent compose (§112) not shipped — Ralph 全手工写 test plan** | `grep -l "test-strategist\|cmdStrategize" cli/src/*.ts 2>/dev/null` → 0; `cli.ts` 没 `strategize-tests` case. **rule→agent transition pending** | **实锤** |
| X2 | **§121 PostHog ingest not shipped — 0 trust-code metric exported** | `grep -l "postHogIngest\|emitTrustCodeMetric\|trustCodeMetric" cli/src/*.ts 2>/dev/null` → 0. `find cli/src -name "*posthog*" -not -path "*test*"` → 0 production files | **实锤** |
| X3 | **No dedicated §107 watcher-bash-e2e file; no test starts full watcher.sh lifecycle / main loop** | **Lisa R1 B2 + R2 B9 refined**: `rg -l "watcher\.sh" cli/src/test/*.test.ts` → 4 files mention watcher.sh literal: `cli.test.ts`, `inbox-wake-tmux.test.ts`, `watcher.test.ts`, `watchdog-restart.test.ts`. The literal appears in 3 different shapes: (a) **doc-comments** (e.g. `watcher.test.ts:1042` "Simulates the escalation decision logic from watcher.sh"), (b) **fake-script fixtures** (`watchdog-restart.test.ts:44` "Fake watcher.sh script"), (c) **function-slice tests** (`inbox-wake-tmux.test.ts:20` defines `WATCHER_SH` and `:104-107` reads/slices function blocks from real watcher.sh). **None** starts the full watcher.sh lifecycle process / main loop end-to-end. Therefore **no dedicated §107 watcher-bash-e2e full-lifecycle test** (5-hour-stall class bug still has no auto-coverage). | **实锤 (refined per Lisa R2 B9)** |
| X4 | **§120 methodology doc not shipped — 6-step methodology 不在 role template** | `grep -l "Step 1.*风险面\|Step 2.*假阳\|Step 6.*跨 slice 一致性" cli/templates/roles/*.md` → 0. ralph.md (208 LOC) + lisa.md (196 LOC) 没显式 6-step methodology | **实锤** |
| X5 | **§117 oracle catalog not shipped** | `find docs -name "*oracle*"` → 0. Ralph 每个 R1 PLAN oracle 重写 | **实锤** |
| X6 | **§118 corpus not shipped — 没 cross-slice 经验复用** | `find ~/.rll/test-corpus 2>/dev/null` → 0; cli/src 没 `loadCorpus` symbol. Ralph 每 slice "从零设计" | **实锤** |
| X7 | **release-gate.sh exists at 3 locations but 不 wired 自动 trigger** | `find . -name release-gate.sh -not -path "*/node_modules/*"` → 3 files (platform/scripts/, rll-team-platform/scripts/, staging/margay-v2-tests/scripts/). 都 manual-only, 无自动 trigger on tag | **实锤** |
| X8 | **Lisa narrow class distribution per slice 没量化** | 每 slice 多少 narrow? Each B-tag 什么 class (architecture / contract / test-design / SOR-sync / cosmetic)? history.md 没结构化 | **埋点** ([NEED INSTRUMENTATION]: Lisa review.md 加 structured B-section + parse + emit `lisa_narrow { slice, round, B_id, class }` event) |
| X9 | **Deadlock frequency (8 连 NEEDS_WORK) 没量化** | CLAUDE.md 说 8-连 触发 watcher 自动暂停; 实际 over 100+ slices 中 8-连 频率多少? 没记录 | **埋点** ([NEED INSTRUMENTATION]: watcher detect 8-consecutive 时 emit event `deadlock_threshold_reached { slice, ralph_round, lisa_round }`) |
| X10 | **Lisa-narrow rate 下降 30%" claim — Lisa §F R6 lock 7 提的, baseline 没定** | §F 自己 admit "no baseline count + counting rule" — 30% 是 aspirational | **埋点** ([NEED INSTRUMENTATION]: §121 + X8 narrow-class capture → §122 dashboard P50/P95 narrow-per-slice over time) |

---

## 6. 埋点 (instrumentation) design summary

Total **埋点 needed**: **8 of 34 gap claims** (C12-C14 [3 cli] + W9-W10 [2 webui] + X8-X10 [3 cross-stack] = 3+2+3 = 8) collapse to **6 unique event families** (Lisa R1 B3 reconciled):

Critical 埋点 priority:

| Priority | Event name | Source | Consumer | Implementation slice |
|----------|-----------|--------|----------|---------------------|
| 🚨 P1 | `slice_started` / `mutual_consensus_reached` | history.md timestamp parser + emit on transitions | §122 dashboards (cycle-time P50/P95) | §121 |
| 🚨 P1 | `lisa_narrow { slice, round, B_id, class }` | Lisa review.md structured B-parser + emit | §122 dashboards (narrow-rate trend, class distribution) | §121 |
| 🚨 P1 | `cascade_tier_attempted` + `cascade_tier_reached` | §70 cascade engine emit | §122 dashboards (tier-fire-frequency, halt-position) | §121 |
| 🟡 P2 | `deadlock_threshold_reached` | watcher 8-consecutive detector | §122 dashboards (deadlock-frequency, slice histogram) | §121 |
| 🟡 P2 | `playwright_cmd_built` + `playwright_exec_failed` | §104 manual-gate emit | dashboard (Playwright command-builder drift detector) | §121 |
| 🟢 P3 | `manual_gate_fired` | §104 manual-gate emit | dashboard (per-project §104 adoption) | §121 (for super-rll itself), separate slice for client telemetry |

**全部归属 §121 posthog-test-harness-ingest** (8-12r per §G/§H lock). Without §121, **8 of 34 gap claims** (C12-C14, W9-W10, X8-X10) 永远是 unverifiable assertion, 不能 mechanically prove or refute over time. The 8 claims collapse to **6 unique event families** (each row above; some families contain 2 sub-events e.g. `slice_started`+`mutual_consensus_reached` are both lifecycle family).

---

## 7. Evidence-refined critical-path

Per §H Section 6.2 Lisa-lock §110 → §120 → §117 → §112 → dogfood → §121 = 30-42r + dogfood TBD.

Evidence 加强后细化:

| Step | Slice | Evidence-justified scope (per §3-§5 hard data) | 估 |
|------|-------|----------------------------------------------|----|
| 1 | **§110** (cli-functional-spawn-tests) | C1+C2+C5+C10 实锤: functional tier optional + starter only 30 LOC stub + **20% real-spawn surface (corrected per Lisa R1 B1)**. **§110 scope locked**: 写 15-20 RLL-spec sub-cmd functional tests (init/state/gate/wecom lifecycle); auto-tdd row tier=functional; 不立刻改 cli-cmd preset required (Lisa H R1 L2 lock) | 5-7r |
| 2 | **§120** (methodology doc) | X4 实锤: ralph.md 208 LOC + lisa.md 196 LOC 没 6-step. §120 scope: 写 docs/test-plan-methodology.md + 嵌入 role template ≤ 200 LOC compact | 4-6r |
| 3 | **§117** (oracle catalog) | X5 实锤: 0 docs/*oracle* file. §117 scope: docs/test-oracle-catalog.md per-tier patterns (smoke "page-load + console-clean" / e2e "API 200 + schema" / functional "exit 0 + state file equal" 等) | 3-5r |
| 4 | **§112** (test-strategist-agent) | X1 实锤: 0 agent compose surface. §112 scope: `ralph-lisa strategize-tests <step>` cli cmd; agent reads codebase + §120 methodology + §117 catalog; emits R1 PLAN test table draft | 10-12r |
| 5 | **§112 dogfood** (NEW bounded follow-up) | §H R1 L8 Lisa-lock: NOT recursive on §112 itself. New bounded slice using §112 agent compose to plan an actual feature | 3-5r |
| 6 | **§121** (posthog-test-harness-ingest) | C12+C13+C14+W9+W10+X8+X9+X10 = **8 of 34 gap claims** 没 hard evidence today, 全靠 §121 实现量化 (collapses to 6 unique event families per Section 6). **§121 mandatory 不是 nice-to-have** | 8-12r |

**Total: 33-47r** (estimate 略调高 from §H 30-42r by +3-5r once §121 emit-design adds dogfood validation cycle).

---

## 8. Lisa discussion candidates (this slice)

I1. **埋点 placement (§121 scope expansion)**: §121 原 scope "ingest token-usage / submit-event / review-event"; 是否扩到包含 X8 narrow-class parsing + X9 deadlock detection + C14 cascade tier-fire counter? 我推荐: **§121 scope expand to the 6 unique event families in §6, covering the 8 instrumentation-only gap claims** (per Lisa R3 B10 lock terminology). Lisa lock?

I2. **§110 sub-cmd list lock**: Lisa §H R1 L1 已锁 16 个 sub-cmd. §110 R1 [PLAN] 时 sub-cmd list verbatim 用 §H L1 lock? OR R1 narrow 时 refine? 我推荐: §H L1 lock verbatim 起 + 允许 narrow refine.

I3. **Functional tier promotion timing**: §110 ship 后 cli-cmd preset functional 改 required (per §H R1 L2 "promote after evidence")? 触发条件: §110 在 N 个 real slices 中 functional-tier auto-fire 通过率 ≥ 95% over Y rounds? 我推荐: trigger condition = 5 consecutive slices with 100% functional pass + 0 manual-bypass. Lisa lock?

I4. **Pre-§121 evidence-collection bootstrap**: 在 §121 ship 之前 (§110-§112 阶段), 怎么积累 trust-code metric data 给 §121 真有东西 ingest? 我推荐: §110 R1 [PLAN] 时同时定义 Manual Evidence Log (markdown checklist) per slice, ship 后 §121 import 这些 markdown 当 historical seed. Lisa lock?

I5. **Manual gate enablement at super-rll root**: §H R1 L4 lock "separate explicit slice after §110 stability data". 这个 slice 估时 + 触发条件? 我推荐: separate §123x slice 估 2-3r, trigger = §110 + §117 都 mutual close + 3 consecutive subsequent slices use cli functional gate stable. Lisa lock?

I6. **Roadmap reordering vs §H R1 L7 sequence**: §H locked §110 → §120 → §117 → §112 → dogfood → §121. 现 evidence 表明 §121 是 6+ 个 gap 量化的唯一手段; 是否考虑 §121 提到前面 (与 §110 并行 OR 紧跟 §110)? 我推荐: 保留 §H L7 顺序 — §121 真有价值 require §112 dogfood emit events; 但加 §110 同时设计 Manual Evidence Log (I4 lock) 不浪费 §110-§112 期间. Lisa lock?

I7. **Cli-pty-daemon + lark-bot + dingtalk-bot 测试套是否 trust-code scope?** 当前 cli stack preset 不覆盖. 我推荐: 留 cli stack 扩展, 不开新 sub-stack; §110 scope 可加 cli-pty-daemon attach 测试 1-2 个但不 expand to dingtalk/lark inbound (那是 D2b feature scope, not trust-code).

I8. **客户 webui project 实际 adoption 测量**: W9 埋点设计了, 但 RLL 是 self-contained tool — 客户项目的 telemetry opt-in 怎么从 RLL 这边 mechanically 测? 我推荐: §121 + §103 privacy opt-in 配合; 客户 enable telemetry → 数据回 super-rll PostHog; aggregated dashboards from §122. **此项跨 §103 privacy + §121 + §122 + 客户授权** — 可能不 in 0.8.0 scope, 留 0.9.0 D2c.

---

## Appendix: reproducible evidence commands

```bash
# Section 3 evidence
python3 -c "import json; d=json.load(open('cli/templates/presets/cli-cmd.json')); print(d['requiredTiers'], d['optionalTiers'])"     # C1
cat .ralph-lisa.json | python3 -c "import json,sys; print([k for k in json.load(sys.stdin)['testRunners']])"                          # C2
rg -l "execFileSync\(\s*process\.execPath|execFileSync\(\s*['\"]node['\"]|spawnSync\(\s*process\.execPath|spawnSync\(\s*['\"]node['\"]|execSync\(.*node " cli/src/test/*.test.ts | wc -l   # C3 (Lisa R1 B1 corrected: 21/106 = 20%)
wc -l cli/test-e2e/run-e2e.ts                                                                                                       # C4
cat cli/templates/test-cli/smoke.test.ts                                                                                            # C5
ls .dual-agent/auto-tdd-plan-*.json | wc -l                                                                                         # C6
for f in .dual-agent/auto-tdd-plan-*.json; do python3 -c "import json; d=json.load(open('$f')); [print(r['tier']) for r in d['rows']]"; done | sort | uniq -c   # C7
rg "tests-only / expected-fail" .dual-agent/history.md | wc -l                                                                       # C8

# Section 4 evidence
python3 -c "import json; print('userManualGate present:', 'userManualGate' in json.load(open('.ralph-lisa.json')))"                # W1
wc -l cli/templates/test-web/*.{spec,config}.ts                                                                                     # W2
rg -l "@playwright/test" cli/src/test/*.test.ts | wc -l                                                                             # W3
rg -l "createServer.*listen|startStaticServer" cli/src/test/*.test.ts | wc -l                                                       # W4
cat cli/src/playwright-command-builder.ts | head -50                                                                                # W5
python3 -c "import json; d=json.load(open('cli/templates/presets/web-ui.json')); print(d['perTierConfig']['perf'])"                # W6

# Section 5 evidence
grep -l "test-strategist\|cmdStrategize" cli/src/*.ts 2>/dev/null | wc -l                                                          # X1
grep -l "postHogIngest\|emitTrustCodeMetric" cli/src/*.ts 2>/dev/null | wc -l                                                      # X2
# X3 Lisa R2 B9 refined: 4 literal files in 3 shapes (doc-comment / fake-fixture / function-slice); NONE starts full watcher.sh lifecycle
rg -l "watcher\.sh" cli/src/test/*.test.ts 2>/dev/null                                                                              # → 4 files: cli.test.ts, inbox-wake-tmux.test.ts, watcher.test.ts, watchdog-restart.test.ts
# Verify shapes:
# watcher.test.ts:1042 doc-comment / watcher.test.ts:2019 "does NOT spawn child process"
# watchdog-restart.test.ts:44 "Fake watcher.sh script"
# inbox-wake-tmux.test.ts:20 WATCHER_SH + :104-107 function-slice read
# Semantic claim: no dedicated full-lifecycle §107 watcher-bash-e2e test
grep -l "6-step methodology\|Step 6.*跨 slice" cli/templates/roles/*.md 2>/dev/null | wc -l                                         # X4
find docs -name "*oracle*" 2>/dev/null | wc -l                                                                                     # X5
find ~/.rll/test-corpus 2>/dev/null | wc -l                                                                                        # X6
find . -name release-gate.sh -not -path "*/node_modules/*" 2>/dev/null                                                              # X7
```
