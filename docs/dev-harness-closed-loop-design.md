# 全闭环开发 Harness 实现机制

**日期**: 2026-05-10
**状态**: 设计文档 — §75 系列 6/6 sub-slice 全部 ship 后的产品视角整理
**前置阅读**: `docs/test-harness-completion-design.md` (思路源)、`docs/trustcoding-product-definition.md` (产品定义)、`CLAUDE.md` §49

---

## 一、什么是"全闭环 dev harness"

一个**复杂软件任务**从需求拍板到生产部署的整个生命周期里，agent 应该能**自我闭环**完成大部分工作，无需人在每一步介入。具体地：

1. **设计阶段**：自动检验测试需求够不够（§81 test-spec linter）
2. **实现阶段**：TDD-first 强制（§49 §C + §52 marker），写测试在写实现之前
3. **执行阶段**：分层测试自动 cascade（§78 test-tier-cascade）
4. **回灌阶段**：测试失败自动结构化回交开发（§79 auto-loopback），开发者（agent）自己修
5. **跨模块阶段**：检测组件间契约 drift（§80 contract-check），防止 silent gap
6. **escalation 阶段**：连续 K 次失败自动呼叫人类（§79 K-budget + wecom-push）
7. **stall 阶段**：watcher 检测交互 prompt 5min ESCALATE / 10min CRITICAL 自动推送（§76）— 解决 user 实测过的 5-hour 不响应 bug，关键阈值是 5min/10min 不是 5 小时

关键属性：
- **闭环**：agent 不需要人按每一步推进；只在异常时呼叫人
- **结构化**：失败 context 是 JSON schema（§77）不是 prose
- **有界**：retry budget 有 K-max 上限，escalation 有 one-shot sentinel
- **可观测**：每一步都写 artifact（review.md / wecom-inbox.md / harness-results/ JSON）

---

## 二、组件全景图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Ralph (主开发 agent)                              │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  PLAN 阶段                                                           │ │
│  │   ├─ ralph-lisa test-spec-eval (§81)  ← 自检测试需求强度              │ │
│  │   └─ 提交 [PLAN] body                                                 │ │
│  │  CODE 阶段                                                           │ │
│  │   ├─ R2 tests-only (§52 §49 §C marker, gate warn)                    │ │
│  │   └─ R3+ impl (gate block)                                           │ │
│  │  FIX 阶段                                                            │ │
│  │   └─ 响应 Lisa narrows / cascade 失败 context                         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  ralph-lisa submit-ralph
┌─────────────────────────────────────────────────────────────────────────┐
│                      Submit-time Gate (§52)                              │
│   runGate() — 跑 .ralph-lisa.json testRunners                            │
│   - tests-only marker 检测 → warn 模式                                    │
│   - 否则 block 模式（测试失败 → 拒绝 submit）                              │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Lisa (审核 agent)                                │
│   读 work.md → 审 [PLAN]/[CODE]/[FIX]/[CONSENSUS]                         │
│   - [PASS] / [NEEDS_WORK] / [CHALLENGE]                                  │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  双方 [CONSENSUS]
┌─────────────────────────────────────────────────────────────────────────┐
│        Post-consensus Blocking Gate (§70 + §79 loopback)                 │
│  handleMutualCompletion(dir, step, round, opts)                          │
│  ├─ testTiers configured?                                                │
│  │   YES → runTierCascade (§78) 跑分层测试                                │
│  │   ├─ 全过 + harness 全过 → resetLoopbackState + notifyUser ✅          │
│  │   ├─ cascade 失败 → processCascadeFailures (§79):                     │
│  │   │   ├─ 写 review.md `## Cascade Failure Context (R{n})`             │
│  │   │   ├─ 写 .dual-agent/harness-results/cascade-*.json (§77 schema)   │
│  │   │   ├─ 写 .dual-agent/loopback-state.json (consec / attempts /      │
│  │   │   │   escalated / halted)                                         │
│  │   │   ├─ setTurn('ralph') ← Ralph 收到 → 进入 R(n+1) [FIX]             │
│  │   │   ├─ consec >= N → 一次性 ESCALATION pushTaskStateChange          │
│  │   │   └─ consec >= K → 一次性 CRITICAL HALT pushTaskStateChange       │
│  │   └─ cascade 过 + harness 失败 → 既有 generic branch                   │
│  │                                                                       │
│  │   NO → runPostConsensusHarness (§70) 既有路径                           │
│  └─ 失败的话 → setTurn('ralph') + appendSystemInboxEntry repair          │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Ralph 收到 turn=ralph + review.md 含 Cascade Failure Context
                              ▼ 进入下一 [FIX] round → 主循环回到 Lisa 审核
```

跨模块静态检查（开发期，submit 前）：

```
┌─────────────────────────────────────────────────────────────────────────┐
│             ralph-lisa contract-check (§80) — 静态分析工具                │
│   读 cli/src/wecom-hook.ts (WecomEventType union)                        │
│   读 wecom-bot/src/event-ingress.ts (EventType union + accept-list)      │
│   读 wecom-bot/src/daemon.ts (consumer kind gates + render branches)     │
│   ├─ cli vs ingress accept-list (cli_only) → BLOCKING                    │
│   ├─ daemon union ⊕ accept-list → BLOCKING                                │
│   ├─ 字段级 3-source: TaskStateChangeKind / SubSliceChangeKind /          │
│   │   stuck_level (cli vs ingress vs daemon consumer)                    │
│   └─ 输出 JSON schema_version=1 / 退出码 0 (无 drift) | 1 (有 drift)        │
└─────────────────────────────────────────────────────────────────────────┘
```

Watcher 主循环（持续 inbox 轮询）：

```
┌─────────────────────────────────────────────────────────────────────────┐
│      Watcher (cli/src/commands.ts:generateWatcherScript template)        │
│   每 1s poll .dual-agent/wecom-inbox.md                                  │
│   ├─ 新 mtime + ralph 非交互 → tmux send-keys "继续" Enter               │
│   ├─ 新 mtime + ralph 交互（有 prompt）+ elapsed >= alertThreshold:      │
│   │   ESCALATE → ralph-lisa agent-stuck-push --level high                │
│   ├─ totalBlocked >= criticalThreshold (默认 600s):                       │
│   │   CRITICAL → ralph-lisa agent-stuck-push --level critical (🚨🚨)      │
│   ├─ 新 mtime > sessionMtime → reset L3-L5 (§76 R5 narrow)              │
│   └─ 6-line state .inbox_wake_state.<side> 防同会话重复 escalate          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、复杂任务开发过程实例

以 §76 watcher-inbox-poll-impl 为例（实际就是上面这套机制开发出来的，自指证）：

### 时间轴

| 阶段 | Round | Tag | Ralph 做什么 | Lisa 反馈 |
|---|---|---|---|---|
| 设计 | R1 | [PLAN] | 提交计划：实现 IM-3/5/6；定义 stuck_level 字段 + 临界阈值 | [NEEDS_WORK] R2 narrow:5 个具体设计漏洞 |
| 设计修 | R2 | [FIX] | 补 schema_version + 接 daemon side validation + 阈值语义 | [PASS] |
| 测试 | R3 | [CODE tests-only] | 写 IM-3/5/6 测试 expected-fail；带 §49 §C marker | [NEEDS_WORK] R3 narrow:union 覆盖弱 |
| 测试加固 | R4 | [CODE tests-only] | 加 type/converge_status/depends_on 严验 + IM-5h e2e | [PASS] |
| 实现 | R5 | [CODE impl] | 实现 inboxWakeDecideCore + cmdAgentStuckPush --level + daemon render | [NEEDS_WORK] R5 narrow:state-machine bug — 新 mtime 不重置 sentinel |
| 修 bug | R6 | [FIX] | 加 sessionMtime L6 字段 + IM-5i regression pin | [PASS] |
| 收尾 | R7 | [CONSENSUS] | 双方同意 | [CONSENSUS] mutual |
| **post-consensus** | (auto) | gate | runTierCascade 跑（如果配置了） + runPostConsensusHarness 跑 | (auto) → 全过 → notifyUser + state_change(mutual_consensus) |

### 关键节点

**节点 1: 测试需求自检**
- Ralph 在 R1 [PLAN] 提交后，可以在 R2 之前用 `ralph-lisa test-spec-eval --plan-file .dual-agent/work.md` 自检
- 如果 linter 报 `thin-coverage`、`missing-integration` 等，Ralph 会先自己改 PLAN，再让 Lisa 审
- 这是 **思路 1** 的落地：测试需求强度由 Ralph 调用工具评估

**节点 2: tests-only round 制度**
- R3 [CODE] 带 `Convention: tests-only / expected-fail (§49 §C)` 这个**字面 marker**
- gate 检测到 marker → 不 block 失败的测试；测试可以全 fail land
- Lisa 只验证测试设计（看测试覆盖契约 + assertion 真覆盖），不要求测试都过
- R5 [CODE] 没 marker → gate 切回 block 模式，测试必须全过

**节点 3: cascade 失败自动 loopback**
- 假设 R7 [CONSENSUS] 提交后，cascade 跑发现单元测试挂了
- handleMutualCompletion 进入 cascade-fail 分支：
  - 写 `review.md` 加 `## Cascade Failure Context (R7)` 段，列每个失败 case 的 test_id / file:line / error_excerpt / retry_count / occurred_at
  - 写 `harness-results/cascade-*.json`（schema_version=1）
  - 把 turn 设回 ralph（Lisa 不再审，Ralph 直接修）
  - 增 `loopback-state.json` 的 `consecutive_failures`（per-step 范围）
- Ralph 下次 `whose-turn` 显示 ralph，读 review.md 看到结构化 cascade 失败上下文，发起 R8 [FIX]

**节点 4: K-budget halt**
- 如果 R8/R9/.../R12 连 5 次 cascade 失败：
  - R12 触发 halt：state.halted=true + 一次性推 wecom 事件 `task_failed` with `note: "CRITICAL HALT: K-max retry budget exhausted (test_ids: ...)"`
  - 同时 setTurn(ralph) 让 Ralph 还可以介入
  - User 收到 wecom 通知（即使在睡觉，醒了能立刻看到）
  - User 介入：可能改 PLAN、调测试、或 manually `ralph-lisa loopback reset`

**节点 5: 跨模块契约 drift 自检**
- §76 加了 stuck_level 字段 to AgentStuckExtra，并改 wecom-bot daemon 渲染
- 开发完成后跑 `ralph-lisa contract-check` 验证：
  - cli WecomEventType ⊆ daemon EventType ⊆ accept-list ✓
  - cli stuck_level field union ⊆ ingress 验证 union ⊆ daemon render（explicit ∪ baseline）✓
  - 0 blocking drift = 跨模块一致 = 安全提交

---

## 四、闭环 vs 断裂 / 无限循环 review

### 4.1 已防住的循环

| 风险 | 防范机制 | 触发位置 |
|---|---|---|
| 同 round 反复 NEEDS_WORK | §49 §A #4 — 5 连 NW 自动 wecom-push 求救；8 连 deadlock watcher 暂停 | CLAUDE.md §A 协议 |
| cascade 反复失败 | §79 K-budget halt（一次性 halted sentinel；触发后不再 push） | `loopback.ts:processCascadeFailures` |
| escalation push 风暴 | §79 escalated sentinel — 一次性 push 直到 reset | `loopback.ts` |
| watcher escalate 风暴 | §76 ESCALATE 后 reset blockedSince（IM-4）；CRITICAL 一次性 firedAt sentinel | `commands.ts:inboxWakeDecideCore` |
| watcher 同会话重复 escalate | §76 sessionMtime L6 — 新 mtime 才重置 retry budget | `commands.ts:inboxWakeDecideCore` |
| step 切换后旧 retry 残留 | §79 step-mismatch reset — `loadLoopbackState(dir, currentStep)` 自动重置 | `loopback.ts:loadLoopbackState` |
| tests-only round 误 block | §52 marker → gate warn 模式（仅当 tag === [CODE] + verbatim §49 §C） | `commands.ts:runGate:1078` |
| 跨模块 silent drop | §80 contract-check 静态阻断 cli↔ingress↔consumer drift | `contract-check.ts` |
| post-consensus 生效但失败被忽略 | §70 + §79 — cascade-fail 强制 setTurn(ralph)，不进 happy path | `commands.ts:handleMutualCompletion` |

### 4.2 仍可能断裂的点（已知 limitation）

| 点 | 描述 | 当前缓解 | 长期解 |
|---|---|---|---|
| **A. user 不在线时 wecom-push 失败** | wecom-bot daemon 挂了 → push 静默失败 | `daemon-health-check` cli 能查；Ralph 自检 §A；watcher 自检 | 加 `pushTaskStateChange` 重试队列 |
| **B. contract-check 没强制接 submit gate** | Ralph 可能忽略 drift 报告直接 submit | 手动跑；CI 集成；`policy.ts` 可加 hook | §80-followup：policy 调用 contract-check 自动 block |
| **C. test-spec-eval 不强制接 PLAN gate** | Ralph 可能不自检测试需求 | 手动跑；CLAUDE.md 推荐流程 | §81-followup：plan-keeper 检测 R1 [PLAN] 自动跑 lint |
| **D. cascade 配置未铺开** | `.ralph-lisa.json` 没配 `testTiers`，cascade 不跑 | 开发者手动配 | 默认 testTiers + 自动初始化 |
| **E. 部署后门禁未实现** | 思路 4（§82）未做：部署到测试环境后没自动截图/文档 | 手动；trustcoding-user-manual 流程 | §82 deploy-doc-snapshot-loop |
| **F. 数据闭环未完整** | 思路 5 部分（§83）未做：测试失败统计未反哺 PLAN | 手动看 weekly-digest；Ralph 自查历史 retrospective | §83 test-result-data-closure |
| **G. R2 tests-only marker verbatim 容易写错** | 字符串 `Convention: tests-only / expected-fail (§49 §C)` 漏一字符就 fail | §52 严格匹配；Ralph protocol §49 §C lock | submit cli 自动注入 marker |

### 4.3 仍可能无限循环的点

| 点 | 当前缓解 | 残余风险 |
|---|---|---|
| **R1: cascade 失败 → fix 不彻底 → 又失败** | §79 K-budget halt 在第 5 次后停 + wecom-push | user 不响应时 halt 就停留，但 turn 还在 ralph，不会自循环 |
| **R2: contract-check 报 drift 但 Ralph 反复修不对** | 没自动跑次数限制；user 看 wecom 介入 | 静态分析 false-positive 极少；如果 false-positive Ralph [CHALLENGE] 跑路 |
| **R3: watcher 在交互 prompt 长期抑制** | criticalThreshold (10min) 后 critical push；user 介入 | user 真的不介入就一直 BLOCK；但是 watcher 不会主动按键，安全 |
| **R4: post-consensus gate 反复 running** | §70 status file `'running'` 状态被重启识别为 in-progress；下次直接 retry | 边界场景：进程崩溃后重启，可能跑 2 次 — 不是无限循环 |

### 4.4 真正的"无限"风险（需要人为介入）

只有一种情况会导致真无限循环：**Ralph 自己做出错误判断，反复修同一处错的代码 + Lisa 反复 NEEDS_WORK 但 narrow 不一样**。

防范：
- §49 §A #1 重复编辑检测（连续 3 round 改同一处 file:line）→ 自动 wecom-push 求救
- §A #4 5 连 NW push
- 8 连 NW deadlock watcher 暂停（CLAUDE.md:247，但运行时未强制 — 自检兜底在 §A）

---

## 五、关键设计权衡

### 5.1 为什么 cascade 失败 → setTurn(ralph) 而不是 wecom-push 求救？

**选择**：Ralph 自动接管修复，user 只在 K-budget halt 后才知道。

**理由**：
- 多数 cascade 失败是简单 bug（typo / missing branch / broken import），Ralph 能自己修
- 每次 cascade 失败都 push 会让 user 收到大量噪声
- K-budget=5 是个合理上限：5 次都改不对，说明 Ralph 卡住，需要 user 介入

**反方意见 + 处理**：user 如果想全程跟踪可以 `ralph-lisa loopback status` 主动查；或加 escalation_trigger_n=1 让每次 fail 都 push（默认 N=3 是中庸）。

### 5.2 为什么 §80 contract-check 是静态分析而不是运行时 IPC 测试？

**选择**：regex-based 静态分析，不实际启动 daemon 发请求。

**理由**：
- 静态分析 sub-second 完成，可在每次 PR 跑
- 真实 IPC 测试需要 daemon 启动 + 网络 + flaky；CI 成本高
- §80 的检测目标是**字段/类型 drift**（cli 加了 daemon 没加），不是**业务逻辑 bug**——静态足够

**反方意见**：如果将来 daemon 有动态 schema 注册，静态分析会漏报。届时升级到 contract-check v2（运行时探测）。

### 5.3 为什么 §81 test-spec-eval 是 rule-based linter 而不是 LLM 评估？

**选择**：5 条机械规则（no-test-plan / thin-coverage / happy-only / single-surface / missing-integration）。

**理由**：
- LLM 评估每次跑要钱要 1-3 秒；linter 微秒级
- 机械规则可解释、可测试、可重复
- 5 条规则覆盖 80% 的低质 PLAN（其他 20% Lisa narrow 兜底）

**反方意见**：思路 1 原文说"由主 Agent 调用助手做"，可能暗指 LLM。但 user R5 narrow 锁定支持 bracket-bullet 等很机械的细节——LLM 不需要这种精确性。MVP 留 LLM 接口（未来 §81-followup 可加 `--llm-eval` 模式）。

---

## 六、剩余 Gap（思路 4 + 思路 5 完整版）

§75 design 锁定的 6 个 sub-slice 全部 ship，但思路 4 和思路 5 完整版未做：

### 6.1 思路 4 部署后产品交付门禁（§82 deploy-doc-snapshot-loop）

**未做的工作**：
- 部署到测试系统后自动跑 smoke test
- 自动抓 web UI 真截图（不是 mock）
- 截图自动写入 user manual
- 后期制作触发（GIF / 视频 walkthrough）

**当前 manual 流程**：trustcoding-user-manual 手动写 + margay-webui doc-capture skill 半自动

**估时**：1-2 周。需要部署 host + 截图 pipeline + 视频 pipeline。

### 6.2 思路 5 完整版（§83 test-result-data-closure）

**已做**：
- 失败 cascade 写 JSON 到 harness-results/
- weekly-digest 跑 token-usage 统计

**未做**：
- 高 NW% adapter 自动检测 + 建议改 test_spec
- 失败模式聚类（哪些 file:line 反复出问题）
- 自动 task 生成（基于 retry_count 阈值）

**估时**：1 周。需要数据 schema + 聚类逻辑 + 反哺 PLAN 钩子。

---

## 七、自指证：本文档的产生过程也跑了 dev harness 闭环

通宵 5 小时执行了：

- §76 (12r) → §77 (8r) → §78 (12r) → §79 (10r) → §80 (9r) → §81 (7r)
- 总 ~70 round（per-slice: §76=12 / §77=8 / §78=12 / §79=10 / §80=9 / §81=7 = 58；加上跨 slice 设计/closeout iteration 约 ~70），36 次 substantive Lisa narrow（每次都抓真 bug）
- cli 1081 → 1283（+202 测试），全 mutual CONSENSUS
- 0 push to rll-stack（user 要求 stage 但不 publish）

期间触发的闭环机制：
- §49 §A 5 连 NW push 触发 1 次（§78 R6）→ user 同意继续
- §49 §C tests-only marker 用了 ~30 次 (R2 tests-only round 每次)
- §70 + §79 cascade-loopback 测试时模拟 + 整合验证（自指）
- §80 contract-check live dogfood: 0 blocking drift
- §81 test-spec-eval live dogfood: 当前 PLAN 无 thin-coverage 等问题

整个过程没有 user 介入修代码，只有方向决策（A/B/C/D 拍板）。这正是 dev harness 闭环的实证。

---

## 八、下一步建议

按 ROI 排序：
1. **§82 deploy-doc-snapshot** — 思路 4 完整；解锁"部署后产品交付"自动化（1-2 周）
2. **§83 test-result-data-closure** — 思路 5 完整；解锁数据反哺 PLAN（1 周）
3. **§80-followup**：把 contract-check 接进 policy.ts submit gate（半天）
4. **§81-followup**：把 test-spec-eval 接进 plan-keeper R1 自动检（半天）
5. **dogfood §63/§64/§65 webhook** — 等 user 提供 credentials（即时）

---

**结论**：§75 系列 6/6 sub-slice 完成后，基本闭环已经 ship。剩余 gap（思路 4/5）是产品级"加分项"，不是闭环本身的核心。当前状态已经足够支撑 user 通宵授权 agent 自跑复杂任务且产出可信结果。
