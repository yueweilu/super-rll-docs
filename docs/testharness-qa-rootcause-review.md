# Testharness QA 根因复审 (testharness-qa-rootcause-review)

**Status:** research-only deliverable (R2 [RESEARCH]). 零代码改动。
**Author:** Ralph, 2026-06-19. **Reviewer:** Lisa.
**北极星 Goal (用户):** *解决 testharness 留于形式的问题，让 testharness 真正成为 RLL 可靠的质量审核，确保所有 RLL 开发的成果能够达到预期目标。*
**Reframe (用户锁定):** 这**不是**"加更多硬阻断门禁"的问题，而是**判断标准 (judgment criteria)** + **执行流程 (execution flow)** 的问题。本报告先把问题确认清楚，再谈方案。

---

## 0. 方法与证据约定

每条根因都带 `file:line` 或命令证据。证据标签 `[En]` 指本轮实跑的 grep/cat（命令与输出存于 R2 提交体的 Evidence 段，可复现）。读过的代码：`cli/src/{wezterm-test-skill,playwright-test-skill,testharness-gate,harness-record,test-cascade,auto-tdd,plan,policy,test-spec-eval,complexity-judge,complexity-verify,wecom-hook,wecom-push,lisa-attest-parser}.ts`、根 `.ralph-lisa.json`、`docs/` 下 13 份相关设计文档。

**复审纪律 (Lisa R1 Mechanism-Review):** 凡"未接线/仅 warn/不校验/不推给用户"类断言，必须引用证明其**存在或缺失**的确切代码路径或 grep 结果。本轮已就地实测纠正了 stale 文档（见 §6 的 §192 纠错）。

---

## 1. 现状架构（实测，非文档转述）

Testharness 实际由**三条互不连通的轨道**组成：

| 轨道 | 入口 | 是否自动 | 证据 |
|---|---|---|---|
| **A. 手动 skill** | `ralph-lisa skill wezterm-test --macro` / `skill playwright-test --spec` | ❌ 纯手动，无门禁接入 | `cli.ts:1118,1123` |
| **B. 设计/机制审查门** | `ralph-lisa testharness-gate validate` | ⚠️ warn-first，默认不阻断，未接自动 pipeline | `testharness-gate.ts:113-115`（`block` 仅在 `RL_TESTHARNESS_GATE=block`）|
| **C. 提交期 + consensus 后执行** | `runScheduledHarness("onCodeSubmit")` / `runPostConsensusHarness` / `runTierCascade` | ⚠️ **存在但 config-gated** | `commands.ts:2805`（onCodeSubmit）、`commands.ts:8234`（onConsensus）、`test-cascade.ts:279`（cascade）|

### 1.1 ★ 决定性现场证据：本 repo 自己的门禁配置是"裸的"

根 `.ralph-lisa.json` **只有 `testRunners`**（5 条：2 个 `plan validate` + `cli`/`wecom-bot`/`cli-e2e` 三个单测套件），**没有** `testHarness.schedule`（onCodeSubmit/onConsensus）、**没有** `testTiers`（§78 cascade）、**没有** `userManualGate`（§104）。`[E5]`

**后果（execution-flow 级，直接解释 P2）：** 在正在 dogfood testharness 的这个仓库上，每个 code-bearing slice 的提交期门禁**实际只跑** = 2×plan-validate + 3×单测套件。轨道 C 的 functional/E2E/cascade/harness/user-manual 全部**因为配置未启用而从不触发**。机器造好了，但本仓库没插电。

> 这正是 `docs/gate-bypass-diagnostic-2026-05-16.md` 里的 G1/G2 bypass，在 2026-06-19 今天的 repo 上**仍然成立**。

---

## 2. 症状 → 根因矩阵（Lisa R1 narrow 要求的 oracle）

每行：用户症状 → (1) 当前机制 → (2) 缺失的**判断标准** → (3) 断裂的**执行流程** → (4) 证据 → (5) 既有设计存活/失效判定。

| # | 用户症状 | (1) 当前机制 | (2) 缺失的判断标准 | (3) 断裂的执行流程 | (4) 证据 | (5) 既有设计判定 |
|---|---|---|---|---|---|---|
| **P1** | 测试计划没向用户充分解释/展示 | 计划只落 `auto-tdd-plan-<step>.json`（机器读）+ PLAN 表（只 Lisa 看）；`plan-ack` 仅终端 | 没有"用户可读的计划/报告卡"的内容标准（决策+理由+用例三件套+覆盖核对） | push 通道无任何 test-plan / test-report 事件；计划/结果从不外推给 off-laptop 用户 | `[E10]` wecom-hook/wecom-push grep 无 test_plan/test_report 事件；transparency-rfc:25-31 | **transparency-rfc CP1/CP4 存活** — 直击 P1，但仅 design-only 从未实现 |
| **P2** | 基本只跑单测，功能测试极少 | 轨道 C 的 functional/E2E/cascade 存在但 config-gated；本 repo 未启用 | "什么任务必须有 functional/E2E"无强判据：complexity-judge 没记判断时默默产空 tiers + warning（非 error） | 提交期门禁实跑只剩 plan-validate+单测；harness/cascade 因 `.ralph-lisa.json` 缺 schedule/tiers 从不跑 | `[E5]` 裸 config；`complexity-judge.ts:336-339`（无 judgment→空 tiers+warning）；capability-eval §83 实测 L1+L2≈85% / L5=0% | **capability-eval §83 + completion-design 存活**（已量化"missing middle"），但都没落地 |
| **P3** | 大量 defer 无解释；Lisa 不审计划/用例 | `it.todo`/省略 tier 自由通过；Lisa attest 提交期已 cross-check(§201)验 cite/file/log **存在**，quality_score = rationale ≥40 字 **且** ≥1 cite | 没有"defer 必须带理由 + 用户/Lisa 签字"的判据；cross-check 验**证据存在**，不验**oracle/断言质量**——Lisa 仍无"逐 Required 用例审三件套+断言强度非 vacuous"的 checklist | 无任何 defer-justification 校验；cross-check 只验 cite 能 resolve，不读用例断言内容 | `[E8]` 全仓 grep 无 defer 理由校验（仅 slice 状态 'deferred'）；`policy.ts:607-635`(§201 提交期 cross-check 验存在)；`lisa-attest-parser.ts:165-168`(quality_score = length **AND** ≥1 cite) | **cluster-b B2（用例三件套+Lisa 审 oracle 质量）存活**——正补 cross-check 只验存在的残余缺口 |
| **P4** | 用例缺预期/断言，结果流于形式 | PLAN 5 列表要求 Oracle 列**存在**；执行期 anti-vacuous 只查 evidence 记录有 model/marker/artifact/llm 之一 | 没有"每个 Required 用例的 oracle 必须是可机械判定的非空断言"的判据；断言强度无下限 | 计划期 Oracle 单元格内容从不校验；执行期断言原语仅子串包含（+取反），无结构/数值/契约断言 | `[E6]` auto-tdd 只 parse oracle 不 validate（:39,:198-220）；`[E7]` 反 vacuous 在 exec-report/lisa-attest 查 evidence 非 PLAN oracle；`[E2]` wezterm `text.includes()`；`[E3]` 有 assert-not-contains 但无结构断言 | **cluster-b B2（case/expected/assertion 三件套）+ assertion-tiers §192 存活**（但 §192 "无 negative assertion"已 stale，见 §6）|

---

## 3. 逐症状根因细分

### P1 — 沟通不足（判断标准 + 执行流程 双缺）
- **执行流程缺口（主因）：** 用户面向的 push 全是 agent↔agent 事件（`ralph_submit`/`lisa_submit`/`agent_stuck`/`sub_slice_state_change`/`task_state_change`，`wecom-hook.ts:16-42`）。**没有一个事件把测试计划或测试结果推给用户。** `[E10]` 确认 `test_plan`/`test_report` 在 wecom-hook/wecom-push 中零命中。
- **判断标准缺口：** 即使要推，也没有"一张用户可读的计划卡/报告卡该包含什么"的内容标准——TDD 决策+理由、用例三件套、门禁分层+为什么、覆盖核对（计划 vs 实跑）。
- transparency-rfc 第 17-23 行的诊断与此**完全一致**：*"所有门禁机制都是 agent-to-agent，用户从不是参与者；项目已经产出用户想要的全部 artifact，只是从不 surface。"*

### P2 — 几乎只有单测（执行流程为主，判断标准为辅）
- **执行流程缺口（主因）：** 轨道 C 整套（onCodeSubmit/onConsensus harness + §78 cascade + §104 user-manual）在本 repo `.ralph-lisa.json` 里**根本没配** `[E5]`。functional(L3)/system(L4)/e2e(L5) 即便代码支持，也因无配置而不跑。capability-eval §83 实测：L1+L2≈85%、L3≈7%、L4≈8%、L5=0%。
- **判断标准缺口：** complexity-judge 在**没有 agent 记录判断**时默默返回空 tiers + `complexity-not-judged` **warning（不是 error）** `complexity-judge.ts:336-339`。于是"这个任务到底要不要 functional/E2E"没有强制判据，缺省滑向"只单测"。
- 这是 completion-design「思路 2 分层门禁」与 capability-eval 共同点名的"missing middle / L4-L5 严重不足"，已量化、有 roadmap，但未落地。

### P3 — 无理由 defer + Lisa 不审（判断标准为主）
- **判断标准缺口（主因）：** 全仓**没有任何** defer/`it.todo`/省略 tier 的理由校验 `[E8]`（`plan.ts:358` 的 `'deferred'` 只是 slice 生命周期状态，与"测试用例 defer"无关）。承诺的测试可以无声 defer。
- **Lisa 审查判据——区分"旧问题已修"vs"残余真缺口"（R3 实测纠正，见 §6）：**
  - **旧问题已修：** §200/§201 已落地——`verifyLisaAttest` 现在已 wire 进 `checkLisa` 的**提交期** cross-check（`policy.ts:607-635`，PASS/NEEDS_WORK/CONSENSUS 都走，opt-out `RL_LISA_ATTEST_CROSS_CHECK_OFF`）。所以"checkLisa 不交叉验证 Lisa 声明"这条**已 stale**——cross-check 会验 Lisa 引用的 file/log/row 是否真**存在/能 resolve**。quality_score 的真实判据是 `rationale.text.length ≥ 40` **且** `(file_line_cites≥1 OR artifact_cites≥1 OR test_files≥1 OR plan_rows≥1)`（`lisa-attest-parser.ts:165-168`）——是 length **AND** ≥1 cite（OR 只在 cite 类型之间），不是我 R2 误写的"length OR cite"。
  - **残余真缺口（P3/P4 核心）：** cross-check 验的是**证据存在性**（cite 能不能 resolve），**不是 oracle/断言质量**。Lisa 仍**不需要**逐条审每个 Required 用例的 case/expected/assertion 三件套是否齐全、断言是否能区分对错（非 vacuous）。即"她看了文件存在"≠"她审了断言强不强"。这正是 cluster-b B2 + assertion-tiers §192 要补的判据。
- **执行流程缺口：** 没有"Lisa 必须独立确认三件套齐全且断言非 vacuous"的 oracle，导致审查退化成形式签字。

### P4 — 执行流程不严谨 / 流于形式（判断标准 + 断言原语 双缺）
- **计划期判据缺口：** auto-tdd 把 Oracle 解析进字段（`auto-tdd.ts:39,198-220`）但**从不校验其非空/有实质** `[E6]`。`test-spec-eval.ts:151-213` 只查**广度**（≥3 用例、有 fail/edge 关键词）不查**深度**（每个用例是否真有断言）。
- **执行期反 vacuous 错位：** 反 vacuous 检查确实存在，但在 `exec-report.ts:63`（checkEvidenceVacuity）/`lisa-attest-parser.ts:159`，查的是**执行证据记录**有没有 model/marker/artifact/llm 之一 `[E7]`——查的是"有没有跑过的痕迹"，**不是**"用例的断言强不强"。且只需四者之一即过。
- **断言原语贫弱：** harness 断言基本是子串包含 `wezterm-test-skill.ts:256` `text.includes()` `[E2]`；虽已新增 `assert-not-contains`（取反，`[E3]`），但仍**无**结构/数值预算/契约形状/UX-达成 断言。assertion-tiers §192 对此有完整设计（design-only）。

---

## 4. 既有两份设计的批判性复审（用户："批判性复审后采用"）

### 4.1 `test-transparency-protocol-rfc.md`（CP1 计划卡 + CP4 报告卡 + channel 抽象）
- **能否闭 P1？能，且是最对口的方案。** CP1 把 `auto-tdd-plan` + complexity-judge + TDD 决策渲染成用户卡片（含理由）；CP4 的**覆盖核对**（计划 N 用例 vs 实跑 N，经 §137 log）正是"反黑盒"的核心，直击 P4 的"谎报/漏跑"。
- **存活的部分：** 整体方向、CP4-先于-CP1（报告卡无阻断语义、最快见效）、channel 抽象（一处投递、多通道）。
- **批判 / 缺口：**
  1. **依赖未启用的 artifact。** CP4 的覆盖核对要读 §137 `test-execution-log.jsonl` 与 §70 cascade 结果——但本 repo cascade 根本没配 `[E5]`，所以"计划 vs 实跑"在当前会**两边都空**。**必须先让轨道 C 真在跑，CP4 才有内容可核对。** RFC 没把这个前置依赖写成 gate。
  2. supervised vs transparent 的 timeout（open question #2）未定；overnight 默认 0s 纯推送是合理的，但需明确。
- **判定：采用 CP1/CP4 + channel 抽象，但前置补一条"轨道 C 必须先启用并产出可核对日志"的依赖。**

### 4.2 `test-gate-protocol-cluster-b-design.md`（B1 提案环 / B2 用例三件套+Lisa 审 / B3 计划文档 / B4 报告归档）
- **能否闭 P3/P4？B2 直击。** 把 §102 的 Oracle 列显式拆成 **case / expected / assertion 三件套**，并新增"Lisa 必须独立确认每个 Required 用例三件套齐全且断言非 vacuous"——正是 P3（Lisa 不审）+ P4（缺断言）的判断标准。
- **存活的部分：** B2 三件套 schema + Lisa oracle 扩展；B4 的"记录完整过程+证据、流式落盘、绝不只留 pass/fail"（直击 P4 的"流于形式"）；trust-boundary 原则（门禁内容最终由用户拍，授权 skip 必须遵守）。
- **批判 / 缺口：**
  1. **B1 的 user-signed skip 与"硬门禁"张力。** 用户本次明确说"不是硬阻断问题"。B1 让用户可签字 skip 任意 tier——方向对（信任边界），但要小心别变成"默认全 skip"的后门。判断标准应是：**skip 必须带理由并留痕（audit-ledger），且默认推送给用户知情**，而非静默。
  2. **B2 只说"Lisa 审三件套齐全 + 断言非 vacuous"，但没给"断言强度下限"的可机械判据。** 这正是 assertion-tiers §192 的空白：vacuous 的反义不是"非空"，而是"能区分对错的断言"。B2 + §192 需合并，否则 Lisa 仍靠主观判断。
  3. **B3/B4 落盘目录与 transparency-rfc 的卡片是两套人读产物，需统一**（B 用 `.dual-agent/test-reports/` + `docs/test-plans/`；RFC 用卡片+channel）。建议：B3/B4 落盘 = 数据源，RFC CP1/CP4 = 渲染+投递，二者拼成一条链，别各做一套。
- **判定：采用 B2（合并 §192 断言强度判据）+ B4（过程+证据落盘）+ trust-boundary 原则；B1 收敛为"skip 必须带理由+留痕+默认知情"；B3/B4 与 RFC 卡片统一成一条产物链。**

---

## 5. ★ 元发现：被诊断 ≥7 次，从未 ship

同一组弱点已被独立诊断**至少 7 次**，每次都有 file:line 证据 + roadmap，但**除"找 bug"外几乎没有修复落地**：

| 文档 | 诊断了什么 | 状态 |
|---|---|---|
| `test-assertion-tiers-design.md` (§192) | 断言只有子串、无反 vacuous 下限 | design-only，defer 到 §193+ |
| `gate-bypass-diagnostic-2026-05-16.md` | 10 条 bypass（user-manual 从不启用、e2e 不跑、policy warn-default、prose 声明不验）| diagnostic-only，§133-§144 未启动 |
| `test-harness-capability-evaluation.md` (§83) | 72 格能力矩阵，L5=0%，unit 跨栈无 adapter | eval-complete，Tier-1/2 slices 未做 |
| `test-harness-completion-design.md` | 5 思路（TDD 评估/分层/loopback/部署后/数据闭环）gap 表 | design-only |
| `dev-harness-closed-loop-design.md` | 闭环 7 处未接线（contract-check 不在 gate、cascade 配置可选…）| 部分 ship，followup 未做 |
| `test-transparency-protocol-rfc.md` | 用户从不是门禁参与者 | design-only |
| `test-gate-protocol-cluster-b-design.md` | 用例三件套 + Lisa 审 + 报告归档 | 用户已拍方向，未实现 |

**这才是最深的执行流程根因：** RLL **不缺诊断、不缺设计、不缺代码能力**——缺的是"把已设计的修复真正接线、启用、并要求"的执行闭环。机器造了一地，没插电（`.ralph-lisa.json` 裸配 `[E5]`），图纸画了七张，没开工。

---

## 6. 实测纠正的 stale 断言（Mechanism-Review 诚实记录）
- assertion-tiers §192 称"无 negative assertion / grep assert-not 无命中"。**今日已 stale：** `assert-not-contains` 在 wezterm 与 playwright 均已实现 `[E3]`（`wezterm-test-skill.ts:51,264`、`playwright-test-skill.ts:22,215`）。**纠正：** 断言原语 = 子串包含 + 取反；仍**无**结构/数值/契约/UX-达成断言。这条纠正本身就是"先就地实测再下断言"纪律的样例。
- "pass == exit 0 only"需 nuance：除 `commands.ts:1669` 的 `passed: rr.exit_code===0` 兜底外，存在 `parseTestCounts`（`commands.ts:966,994,1031`）解析真实 pass/fail 计数 `[E4]`。**纠正：** 有计数解析，但解析失败/无计数时回退到 exit-0，且这与"断言强度"是两件事。
- ★ **R3 实测纠正（Lisa R2 narrow，与上面 §192 同一 stale-doc 类）：** R2 初稿据 `non-coding-gate-and-mutual-attest-design.md:13`（设计稿）写"`verifyLisaAttest` 只在 Ralph counter-attest 路径调用、`checkLisa` 不交叉验证 Lisa 声明"——**今日已 stale**：§200/§201 已 ship，`checkLisa` 提交期会调 `verifyLisaAttest` cross-check（`policy.ts:607-635`）`[E11]`；quality_score 是 length **AND** ≥1 cite（`lisa-attest-parser.ts:165-168`）`[E12]`，非"length OR cite"。**纠正后 P3/P4 残余缺口更精确：** cross-check 验**证据存在**（cite resolve），**不验 oracle/断言质量**（无逐用例三件套+断言强度审计）。教训重申：下断言前先读**当前源**，别信设计稿——这是本报告第二次踩同一类 stale。

---

## 7. 综合根因（映射到用户的两轴）

**判断标准轴 (judgment criteria) — "什么算合格"无强判据：**
- J1：没有"什么任务必须有 functional/E2E"的强判据（complexity-judge 无判断→空 tiers+warning）。→ P2
- J2：没有"每个 Required 用例必须有可机械判定的非空断言 + 断言强度下限"的判据。→ P4
- J3：没有"defer 必须带理由 + Lisa 逐用例审三件套非 vacuous"的判据。→ P3
- J4：没有"用户可读的计划卡/报告卡该含什么"的内容判据。→ P1

**执行流程轴 (execution flow) — "造了但没接线/没启用/没要求"：**
- X1：轨道 C（harness/cascade/user-manual）在本 repo `.ralph-lisa.json` 未启用 `[E5]`，提交期实跑只剩单测。→ P2（主因）
- X2：测试计划/结果从无 push 事件，用户全程黑盒 `[E10]`。→ P1（主因）
- X3：Lisa 提交期 cross-check（§201, `policy.ts:607-635`）只验证据**存在**（cite 能 resolve），**不读用例断言质量**；defer 无校验。→ P3、P4
- X4：≥7 份诊断/设计从未接线落地（§5 元发现）。→ 全部症状的元根因

---

## 8. 修复路线图（提案，本 session 不实现，待用户拍板）

按"先确认问题、判据+流程双轴、复用既有设计、不滥加硬阻断"原则，建议 slice 队列（每个走 Ralph↔Lisa）：

| Slice | 轴 | 内容 | 复用 | 估计 |
|---|---|---|---|---|
| **TH1 enable-track-C** | 执行流程 | 给本 repo `.ralph-lisa.json` 配 `testHarness.schedule` + `testTiers`（cli 栈：unit/smoke/integration 必跑、functional 真跑），让轨道 C 在 dogfood 仓真插电 | §78 cascade / 现有 preset | 4-6r |
| **TH2 judgment-criteria** | 判断标准 | complexity-judge 无判断时从 warning→**强制产判据或显式 ack**（J1）；oracle 非空+断言强度下限校验（J2，合并 §192）；defer-justification 校验（J3）| complexity-judge / test-spec-eval / auto-tdd | 6-8r |
| **TH3 case-triple+lisa-audit** | 判断标准 | cluster-b B2：case/expected/assertion 三件套 schema + Lisa 逐 Required 用例审 oracle（非 vacuous）| cluster-b B2 + §149 | 6-8r |
| **TH4 user-transparency** | 执行流程 | transparency-rfc CP1/CP4 + channel 抽象：计划卡/报告卡推 wecom/lark；CP4 覆盖核对（计划 vs 实跑）| transparency-rfc + 现有 push | 8-10r |
| **TH5 evidence-archival** | 执行流程 | cluster-b B4：过程+证据流式落盘 `.dual-agent/test-reports/`，与 CP4 卡片统一成一条产物链 | cluster-b B4 | 5-7r |

**依赖：** TH1 先行（没插电，TH4 的覆盖核对两边皆空）；TH2/TH3 是判据核心可并行；TH4 依赖 TH1+TH5 的真实日志/证据。

---

## 9. 结论

- 用户的 4 个症状全部 grounded，且**不是孤立 bug 而是同一组结构性 gap**：判断标准缺位（什么算合格没强判据）+ 执行流程断裂（造了但没插电/没推用户/没要求）。
- 用户的 reframe 正确：**这不是"加硬门禁"的问题**。硬阻断在本 repo 反而是被绕过的（裸 config），加更多只会被同样绕过。真问题是**判据要立起来、流程要接上电、用户要被纳入回路**。
- 既有两份设计（transparency-rfc CP1/CP4、cluster-b B1-B4）**大体存活**且对口，但需：(a) 补 TH1 前置依赖，(b) B2 合并 §192 断言强度判据，(c) B1 的 user-skip 收敛为"带理由+留痕+默认知情"，(d) B3/B4 落盘与 RFC 卡片统一成一条产物链。
- 最深根因是**执行闭环缺失**：≥7 份诊断/设计从未落地。下一步不该再产第 8 份诊断，而应从 **TH1（插电）** 开始把已有设计真正 ship。
