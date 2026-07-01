# Testharness 实际落地摸底 (actual-state survey)

**Status:** code-grounded survey — 每条都带 `file:line`，按当前源码 + skill/preset 实测，非推测。
**Purpose:** 给 testharness 升级做底图——先把"现在测试从计划到编码到执行到报告**实际**怎么走、哪层默认真跑、哪层 config-gated 或手动"摸清，再谈补充。
**Companion:** `docs/testharness-qa-rootcause-review.md`（根因），本文是其执行流程的 code-grounded 落地版。
**Author:** Ralph, 2026-06-20. **Reviewer:** Lisa.

---

## 0. TL;DR — 本 repo 默认真正自动跑的只有一层

| 层 | 入口 | 本 repo 默认是否自动跑 |
|---|---|---|
| 提交期 gate (testRunners) | `runGate`→`executeGate` | ✅ **真跑**（唯一默认自动层）|
| §70 post-CONSENSUS cascade | `handleMutualCompletion`→`runTierCascade` | ⚠️ **跑空**（L0 从 PLAN rows 合成，但 rows 命令与 testRunners 重复被 skipCommands 滤光；`.ralph-lisa.json` 又无 `testTiers`）|
| wezterm/playwright harness skill | `ralph-lisa skill wezterm-test/playwright-test` | ⏸ **手动/按需**，不在自动链 |
| preset hook | `applyPresetHook` | ⏸ **关闭**（`.ralph-lisa.json` 无 `preset.enabled`）|

`.ralph-lisa.json` 实测只有 5 个 testRunners（`.ralph-lisa.json:3` `testRunners` 块起，`cli-tests` 在 `.ralph-lisa.json:12`、`cli-e2e-tests` 在 `.ralph-lisa.json:20`）：`plan-validate-super-rll` / `plan-validate-canonical` / `cli-tests` / `wecom-bot-tests` / `cli-e2e-tests`，无 `testTiers`、无 `testHarness.schedule`、无 `preset`、无 `userManualGate`（全文件仅 testRunners 一个顶层键）。

---

## 1. PLAN 阶段（计划 → 持久化 artifact）

1. **preset 喂计划（本 repo 关闭）**：`cli/templates/presets/cli-cmd.json` 定义 `requiredTiers:[unit,smoke,integration]` + `perTierConfig{cmd,oracle,locallyRunnable}`；`preset-loader.ts:44 loadPresetByName()` 加载，`commands.ts:2882` + `applyPresetHook (commands.ts:2923)` 在 [CODE]/[FIX] 触发——仅当 `preset.enabled=true`。本 repo 未开 → preset 不参与。
2. **§102 测试表**：Ralph 在 `[TDD-PLAN]` 写 5 列 `| ID | Tier | Command | Oracle | Required |` → `auto-tdd.ts:147 parsePlanTestCases()` 解析成 `HarnessTableRow[]`。
3. **持久化**：`commands.ts:3140 persistPlanTestTable()` → `auto-tdd.ts:569` 写 `.dual-agent/auto-tdd-plan-<step>.json`（`{schema_version,step,rows[],estimate,escape}`）。**只在 `[TDD-PLAN]` / `[FIX]`(非空表) 落，gate-free `[PLAN]` 不落**。
4. **dev 门禁**：`validateAutoTddProtocol (auto-tdd.ts:429)`——`[PLAN]` 要 `**Estimate**`；complex(≥4r) 要测试表或 `**Tests**: none` escape；`[CODE]` complex 首轮要 §52 marker。complexity-judge/verify + `plan validate` 在 `[TDD-PLAN]` 走。

**摸底结论**：计划阶段的"质量"完全靠 Ralph 手写 + Lisa 审；oracle 内容、断言强度在解析层不校验（`auto-tdd.ts` 只 destructure oracle 字段）。这是 TH2/TH3 计划期 surfacing 介入的点。

---

## 2. CODE 阶段（提交期 gate — 本 repo 唯一默认自动层）

`cmdSubmitRalph (commands.ts:2422)` → policy `checkRalph (policy.ts:51)`（§149 attest + §137 verify）→ `runGate (commands.ts:1379)`：

- **block vs warn**：含 §52 plan-bound marker → warn（`isMarkerPlanBound commands.ts:1414`），否则 block。
- **executeGate (commands.ts:1563)**：读 `.ralph-lisa.json testRunners`，strategy 默认 **full**，逐条 `runGateRunner (commands.ts:1436)` `execSync` 跑。本 repo 实跑 = 2×plan-validate + cli 单测 + wecom-bot 单测 + cli-e2e。env 清 `RL_STATE_DIR`/`TMUX`（commands.ts:1620）。
- **落盘**：`gate-results.md`/`.json (commands.ts:1726)` + §137 `test-execution-log.jsonl (commands.ts:1695)` + `run-<round>.json` EvidenceRecord（`test-report.ts`，commands.ts:1742）。
- **CP1 计划卡**：`[TDD-PLAN]` 时 `firePlanCardOnSubmit (explain-gate.ts:182)` 渲染卡片（含 TH4 新增「质量提示」段 surface 三 flag）→ 写 `harness-results/plan-card-*.md` + best-effort wecom 推。

**摸底结论**：这层是真盾——但它跑的是**全局回归套件**（单测+plan-validate+cli-e2e），不是**per-slice 为本 feature 写的功能测试**。"测什么"由 testRunners 固定，与当前 slice 内容无关。

---

## 3. EXECUTION 阶段（§70 cascade — config-gated，本 repo 跑空）

双方 CONSENSUS → `handleMutualCompletion (commands.ts:8362)`：

- **L0 优先 (commands.ts:8572)**：有 `auto-tdd-plan-<step>.json` → `convertPlanRowsToCascadeConfig (auto-tdd.ts:345)` 从 PLAN C-rows 合成 cascade，**用 `skipCommands` 滤掉与 testRunners 重复的命令**（防 double-run）→ `runTierCascade (test-cascade.ts:279)` → 落 `cascade-<step>-<round>.json`。
- **跑空的机制（关键）**：本 repo 绝大多 slice 的 C-row 命令就是 `npm test --prefix cli`（一个 testRunner）→ 被 skipCommands 滤光 → 合成 `testTiers=[]` → cascade 跳过（`commands.ts:8628` 守 `tiersRaw.length>0`）。`.ralph-lisa.json` 又无 `testTiers` 兜底 → 非 L0 路径走 legacy harness：`runPostConsensusHarness (commands.ts:8234)` 读 `config?.testHarness?.schedule?.onConsensus`，无 schedule → `if (!scheduled?.length) return { passed: true, ... }`（`commands.ts:8241`）直接 passed；该 caller 在 `commands.ts:8702`。
- **harness skill**：dispatcher `cli.ts:1121 cmdWeztermTestSkill` / `cli.ts:1127 cmdPlaywrightTestSkill` → `runMacro (wezterm-test-skill.ts:179)` / `runSpec (playwright-test-skill.ts)`；断言原语 = 子串包含 `text.includes(step.text)`（`wezterm-test-skill.ts:256` / `playwright-test-skill.ts:207`）+ 取反 `assert-not-contains`（`wezterm-test-skill.ts:275`）；artifact 落 test-logs。`test-runner` subagent 路由到这两个 skill。**全是手动/按需**，不在自动链。

**摸底结论**：cascade 机制完整但本 repo 实际跑空——这是 P2 根因，也是 TH1 surfacing（close-cascade-empty）的对象。要让它真跑 per-slice 功能测试，需 slice 写**非 testRunner 命令**的 functional/integration C-row（如 `ralph-lisa skill wezterm-test --macro ...`）。

---

## 4. REPORT 阶段（证据 + 卡片 + 索引 — 已存在）

- **EvidenceRecord**：`writeRunReport (test-report.ts:137)` → `run-<round>.json`（provenance who/when/host/git_sha 由 `buildProvenance (test-report.ts:102)` + env + 每命令 exit/counts/log_ref/screenshot + overall）+ `.md`/`.html`。
- **CP4 报告卡**：`fireReportCardOnConsensus` 在 mutual close 调用（`commands.ts:8406` → `report-card.ts`），读「计划 rows vs §137 执行 log」做**覆盖核对**（哪些计划命令没在执行 log 出现）→ `report-card-*.md` + wecom 推。
- **证据索引**：`scanEvidenceRecords (evidence-index.ts:33)` 扫所有 `run-*.json` → `renderIndexHtml (evidence-index.ts:72)` 出可筛选 HTML 索引。

**摸底结论**：报告/归档层（= cluster-b B4 / transparency CP4）已实现且会推送。覆盖核对逻辑在，但其有效性依赖 §3 cascade 真跑出执行记录——cascade 跑空时核对两边趋同于"只有 testRunners"。

---

## 5. 升级补充建议（待 Lisa 审 + 用户拍）

按"判断标准 + 执行流程"两轴，本摸底暴露的可补充点（不含已 ship 的 TH1-TH4）：

- **X1 执行流程**：cascade 跑空是结构性的——slice 默认只写 testRunner-dup 的 unit C-row。补充方向：让 per-slice functional/integration C-row 用**非 testRunner harness 命令**（TH1 已 surface，未强制）。是否给"code-bearing slice 至少一条非 testRunner 功能行"加 warn→（可选）soft 要求？
- **X2 判断标准**：oracle/三件套现仅计划期 warn（TH2/TH3），未进 EvidenceRecord。补充：把 weak-oracle/case-triple-incomplete flag 写进 `run-<round>.json`，让报告/索引也带质量信号（TH4 已进卡片，未进归档 record）。
- **X3 preset 未启用**：`cli-cmd.json` 有 per-tier oracle 模板但本 repo `preset.enabled` 未开 → 计划期不借 preset 的 oracle 范本。是否启用以给 Ralph 计划期参考？
- **X4 harness skill 离线**：wezterm/playwright 仅手动；若要 per-slice 真功能测试进 cascade，需把 skill 命令写进 C-row 并确保 binary（`ralph-lisa doctor` 报 wezterm/playwright 可用）。

---

## 6. 验证方式 (research-slice oracle)
每条 file:line 可复跑核对：`cat .ralph-lisa.json`（无 testTiers/preset）；`sed -n '8572,8603p' cli/src/commands.ts`（L0 + skipCommands）；`sed -n '345,376p' cli/src/auto-tdd.ts`（convertPlanRowsToCascadeConfig 滤 skip）；`node cli/dist/cli.js plan validate`（实时 close-cascade-empty）。
