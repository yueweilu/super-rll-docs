# Test Harness 完善方案设计讨论

**日期**: 2026-05-10  
**对话方**: User (さだはる) ↔ Ralph  
**状态**: 思路对齐阶段（未启动 sub-slice）

---

## 一、用户原话（核心思路）

> 应该优先考虑 解决在代码开发完以后，自动调用 testharness 完成不同级别测试，发现实现和部署配置的问题，然后 loop 回开发阶段修复问题再次测试，直到达成设计预期，填补目前流程中各个主模块之间功能 gap

> 1. 对于复杂任务要进行 TDD，在细化需求的时候就要出测试需求和测试用例，建立门禁；
> 2. 测试门禁构成可能包括：单元测试，集成测试，功能测试，性能测试，稳定性测试，端到端测试，测试方法的选择，测试用例的覆盖范围也随着测试需求强度不同，测试需求由主 Agent 调用助手进行判断；
> 3. 每一层测试不通过都应该返回开发阶段进行完善和修复；
> 4. 最后一道门禁是在部署到测试系统以后，要更新产品文档，用户真实界面截图等各种工作加上后期制作的需要；
> 5. 采集数据形成数据闭环。

> （注：用户原编号在 4 后又写了 "4，采集数据形成数据闭环"，按上下文保留为 5）

---

## 二、5 条思路结构化

### 思路 1：TDD 强制 + 测试需求前置

- 复杂任务（按 §49 §C 判定）必须 TDD-first
- **细化需求阶段**（R1 [PLAN]）就要同步产出：
  - 测试需求清单（哪些行为必须验）
  - 测试用例清单（C1-CN，含输入/期望/失败信号）
  - 对应门禁（哪些 case 是 block，哪些 warn）
- 当前已实现（§49 §C + §52 marker）：
  - R1 PLAN 必带测试用例
  - R2 [CODE] tests-only/expected-fail（warn 模式）
  - R3 [CODE] 实现转绿
  - R4+ [FIX] / [CONSENSUS]
- **完善方向**：测试需求清单本身的"够不够"由主 Agent 调用助手评估，不是 Ralph 自评

### 思路 2：测试门禁分层 + 强度自适应

测试门禁的可能构成（按测试目的分层）：

| 层 | 目的 | 当前状态 |
|---|---|---|
| 单元测试 | 函数/模块行为 | ✅ 已有（`npm test --prefix cli` 等） |
| 集成测试 | 模块间组合 | ⚠️ harness/config 支持任意 integration 命令（`testHarness.tests` `cli/src/commands.ts:5887`），但 repo 当前没有专门的 integration tier 目录布局；测试文件平铺在 `cli/src/test/*.test.ts` |
| 功能测试 | 用户故事级 | ❌ 缺 |
| 性能测试 | 响应时间/吞吐 | ❌ 缺 |
| 稳定性测试 | 长跑/压测/恢复 | ❌ 缺 |
| 端到端测试 | 真环境贯通 | ⚠️ adapter / scaffold 已有（`runHarnessTest` `cli/src/commands.ts:5580` + Midscene adapter scaffolding），但 project-level 配置好的 E2E cascade 未上 |

**关键约束**：
- 测试方法的选择 + 用例覆盖范围 **随测试需求强度不同**
- 测试需求强度的判断 **由 Ralph 调用 test-harness 工具/技能/插件/专门 agent 做**（不是固定 matrix）
- 比如：纯 doc 改动 → 不要求性能/稳定性；新公开 API → 必须集成 + 功能；触及部署配置 → 必须 E2E + 稳定性

**角色锁定（user 2026-05-10 拍板）**：
- **Ralph = 测试工作主 agent**：驱动测试需求/用例设计、cascade 执行、失败 loop 回开发、修复后再测试，与开发工作同模式
- **Lisa = 测试审核**：验测试设计是否真覆盖契约、cascade 结果是否真过、loopback 修复是否真闭环、最终是否达成目标——**职责是"确保不打折扣的达成目标"**
- **test-harness 工具/技能/插件/专门 agent = Ralph 调用的 capability**：用于完成具体测试类别（如 webapp-testing skill 跑功能测试 / playwright 插件跑 E2E / 性能测试专门 agent / contract-check 工具等），**是 Ralph 编排的资源，不是替代 Lisa 的独立角色**
- 这与 §49 §C "复杂任务 TDD-first + Lisa narrow 审核" 一致；测试 harness 的 [PLAN] / [CODE] / [FIX] / [CONSENSUS] 节奏完全照走，只是 step 主题是"测试驱动"而非"功能开发"

**模型修正（per Lisa R1 反驳）**：6 类层级是 user-facing example，不是 implementation taxonomy。实现模型应支持**正交 cross-cutting 标签**（contract / regression / security / visual / accessibility / deployment-smoke），不是单线性层级。tier 决定执行顺序，type/tag 决定测试维度。

### 思路 3：任一层不通过 → 自动 loop 回开发阶段

- 当前 §70 post-consensus-blocking-gate 已经是这条的种子：
  - mutual CONSENSUS 时同步阻塞 gate
  - 失败 → `setTurn('ralph')` + 回灌 inbox + `pushTaskStateChange(task_failed)`
- **完善方向**：
  - 不只是"consensus 时跑一次"，要 **每一层测试都触发 loop**
  - 失败上下文（具体哪个 case / file:line / error）必须结构化注入 review.md，不是泛的"repair"
  - 限连续 fail K 次 → 升级到 wecom-push 求救（§49 §A 求救场景的 #4 deadlock 类）
- **角色分工**（per 角色锁定）：
  - **Ralph 拿回 turn → 修问题 → 重跑 cascade**（drive 修复闭环）
  - **Lisa 审核每一轮修复**：失败定位是否准确、修复是否真改对了、cascade 重测是否真过、不是"打折扣应付"
  - K-budget 触发 → 不是 Ralph 自决"放弃"，是 wecom-push 求救让 user 拍 + Lisa final 审"是否能 ship"

### 思路 4：最后门禁 = 部署到测试系统后的"产品交付"门禁

部署后必做项：
- 更新产品文档（功能说明 / 配置说明）
- 用户真实界面截图（不是 mock）
- 后期制作（GIF / 视频 walkthrough / i18n 等）

参考实现：trustcoding-user-manual（已 ship，9 真截图 + 276 行） + margay-webui doc-capture skill。

**完善方向**：
- "部署到测试系统" 这一步本身需要标准化（哪个 host / 哪个 env / 怎么 smoke）
- 截图 / 文档更新 应该是自动触发，不是手动

### 思路 5：采集数据形成闭环

- 当前 D 数据闭环已 ship：§54-§58 token-capture 链 + §59 weekly-digest
- **完善方向**：
  - 测试结果（哪些 case 失败 / 多少次 retry / 多久 converge）也要进数据闭环
  - 形成"测试质量 → 反哺 PLAN 阶段测试需求清单"的反馈环
  - 长期：高 NW 模式自动建议改测试设计 / 改 adapter

---

## 三、当前 test-harness 框架核心模块（实测对照）

| 模块 | 文件 | 作用 | 跟思路对齐 |
|---|---|---|---|
| `runGate()` | `cli/src/commands.ts` | 通用 gate 引擎，从 `.ralph-lisa.json` `testRunners` 或 `RL_GATE_COMMANDS` 跑命令序列 | 思路 2 单层基础设施 |
| `cmdQualityGate` | `cli/src/commands.ts` | `ralph-lisa quality-gate`，`--strategy full\|smoke-only\|affected` + `--full-uaot` + `--warn`/`--block` | 思路 2 strategy 雏形 |
| Submit-time gate | `runGate()` `cli/src/commands.ts:1072`，`:1078` 对非 CODE/FIX tag 直接 noop | **CODE/FIX submit-time gate only**（PLAN/RESEARCH/CHALLENGE/CONSENSUS 不 fire） | 思路 3 当前触发点 |
| `hasTestsOnlyMarker` | `cli/src/commands.ts:1058` | §52 marker bypass：tests-only round warn 不 block | 思路 1 R2 阶段支撑 |
| `handleMutualCompletion` | call sites: `cmdSubmitRalph` `cli/src/commands.ts:1717` / `cmdSubmitLisa` `cli/src/commands.ts:1898`；impl `cli/src/commands.ts:5800` | §70 mutual CONSENSUS 同步阻塞 + 失败 setTurn ralph + 回灌 inbox | 思路 3 loop 回开发阶段种子 |
| `HarnessSchedule` types | `cli/src/commands.ts:615` | 已有 `onCodeSubmit?: string[]` + `onConsensus?: string[]` 调度 hook 类型 | 思路 2/3 调度雏形 |
| `testMapping.rules[].tier` | `cli/src/commands.ts:5379` | 已有 tier 字段（adapter 路由元数据） | 思路 2 tier 字段已有 |
| `runHarnessTest` | `cli/src/commands.ts:5580` | adapter-oriented 单 tier 执行函数 | 思路 2 单 tier 引擎 |
| status file | `.dual-agent/harness-results/*.status` | crash 保护 + idempotent skip | 思路 3 状态持久化 |
| token-capture chain | `cli/src/token-capture.ts` etc | 数据采集 (§54-§58) | 思路 5 数据闭环已有侧 |

---

## 四、Gap 总览（按思路逐项 vs 当前）

| 思路 | 当前覆盖 | 缺口 |
|---|---|---|
| 1 TDD 强制 | §49 §C + §52 marker 覆盖 R1-R4 节奏 | 测试需求清单的"够不够" Ralph 自评，没有助手评估 |
| 2 分层门禁 | runGate 单层；`testMapping.rules[].tier:5379` + `HarnessSchedule:615` + `runHarnessTest:5580` 已有 tier 字段、调度类型、单 tier 执行函数 | **first-class ordered cascade semantics 缺**（不是"无 tier"，是无"按 tier 顺序跑 + tier 间 halt 决策"）；**per-tier halt policy 缺**；**loopback context schema 缺**；**强度自适应（tag/type 维度）缺** |
| 3 自动 loop | §70 在 CONSENSUS 触发；submit-time gate 失败 exit | 每层失败都触发 loop 缺；失败上下文结构化注入缺；K-budget 缺 |
| 4 部署后门禁 | trustcoding-user-manual 手动；release-gate 部分 | 部署 → 更新文档 → 截图 → 后期 自动化链路缺 |
| 5 数据闭环 | §54-§59 已 ship | 测试结果数据 + 反哺 PLAN 测试需求 缺 |

---

## 五、Sub-slice 拆分队列（user + Lisa 锁定）

**A. 优先级队列（per Lisa R1 反驳重排：先 schema，后 cascade，contract 提前）**

| sub-slice | 解决的思路 | 估时 |
|---|---|---|
| **2a0** `test-failure-context-schema` | 失败 context JSON / tier config / halt policy / retry budget / 注入目的地 锁定 | 3-4 round |
| **2a** `test-tier-cascade-mvp` | 思路 2（复用既有 `testRunners` / `testHarness.tests` / `testMapping.rules[].tier`） | 4-6 round |
| **2b** `auto-loopback-with-context` | 思路 3 — 用 2a0 schema 扩 §70（不再 free-form text） | 5-7 round |
| **2c** `cross-module-contract-check` | "各主模块之间功能 gap" 直接攻 — 提前到 2c（per Lisa R1 反驳：不是 polish） | 6-8 round |
| **2d** `tdd-test-spec-helper-agent` | 思路 1 助手评估测试需求够不够 | 6-8 round |
| **2e** `deploy-doc-snapshot-loop` | 思路 4 部署后产品交付门禁 | 1-2 周 |
| **2f** `test-result-data-closure` | 思路 5 测试数据闭环 + 反哺 PLAN | 1 周 |

**依赖序**：2a0 → 2a → 2b → (2c // 2d 可并) → 2e → 2f

**B. 起点（锁定 per Lisa R1 反驳）**

**2a0 `test-failure-context-schema`** 必须先做。理由（Lisa 原话）：没 schema，2a 和 2b 会 ship 出 incompatible result payload + review.md/inbox injection 格式，回头还要返工。

2a0 deliverable：
- 失败 context JSON schema（test_id / tier / type / file:line / error excerpt / retry_count / converge_status）
- tier config 契约（tier name / order / halt-on-fail policy / depend-on-prev-tier-pass policy）
- retry budget 字段（K-max / escalation-trigger-N / escalate-channel）
- 注入目的地（review.md sections / inbox events / harness-results/*.status 文件）

2a0 闭后才解锁 2a + 2b。

---

## 六、用户已拍板（2026-05-10 对话锁定）

1. **5 条思路准确**（user 重复确认；思路 4 部署后门禁范围用"等各种工作"留余地）
2. **6 类测试层级 = user-facing example，不是最终 implementation taxonomy**（per Lisa R1 反驳 + user 隐含同意——doc 第二节已加 cross-cutting tags 维度）
3. **起点锁定 = 2a0 `test-failure-context-schema`**（per Lisa R1 反驳；user "没问题就开始编码"中的"编码"指 §68-followup-2 + 2a0 之后的实现，不是绕过 schema-first）
4. **§68-followup-2 watcher impl 先 ship**（user "1，没问题，同意"），其后开 2a0 → 2a → 2b → ...
5. **角色锁定（user 2026-05-10 拍板）**：测试工作同样 Ralph 主 agent / Lisa 审核 / 助手 = Ralph 工具 — 见思路 2、3 段中详细说明

无悬而未决项；本 doc 进入 [PASS]→[CONSENSUS] 后 Ralph 开 §68-followup-2 watcher impl。

---

