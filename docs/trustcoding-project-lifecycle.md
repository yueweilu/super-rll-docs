# Trustcoding Project Lifecycle Template (8 Phases, 2 Gates)

**Status**: Working draft, framework locked 2026-05-05 (`trustcoding-comprehensive-plan` mutual CONSENSUS).

每个用 Trustcoding 跑的项目都经历这 8 个阶段。每阶段 Ralph 写 / Lisa 审 / 双 CONSENSUS 锁。两道门禁（Gate 1 在 Phase 3，Gate 2 在 Phase 6）必须双 CONSENSUS 才能进下一阶段。

---

## 总览

```
Phase 1  需求定义           ───→ deliverable: 需求文档 + 验收标准
Phase 2  架构设计           ───→ deliverable: 接口 + 数据模型 + 关键决策
Phase 3  测试设计 ★ Gate 1  ───→ deliverable: test_spec (harness + 用例 + 通过标准)
                                    锁定 = 后续每轮 CODE 必过此门禁
Phase 4  实现               ───→ deliverable: 代码 + 单元测试; 每轮过 Gate 1
Phase 5  测试环境部署       ───→ deliverable: preview env + smoke 通过 + 业务流程跑通
Phase 6  用户文档 ★ Gate 2  ───→ deliverable: 真截图 + 文字手册
                                    前置 = Phase 5 跑通; 锁定 = 允许生产
Phase 7  生产部署 + 灰度 + 监控 ──→ deliverable: deploy hook + flag rule + 告警阈值
Phase 8  数据反哺迭代       ───→ deliverable: 真用户数据 → 回 Phase 1 (新需求)
```

---

## Phase 1 — 需求定义

| 项 | 内容 |
|---|---|
| **输入** | 用户原始诉求 (口头 / WeCom / issue 描述) |
| **Ralph 干啥** | 写 `requirements.md`: 用户故事 + 验收标准 + 非功能要求 (性能 / 安全 / 兼容) + 范围内/外 |
| **Lisa 审啥** | 用户故事是否覆盖原诉求; 验收标准是否可测量 (不是"快"而是"p95 < 200ms"); 范围边界是否清晰 |
| **CONSENSUS 协议** | 双 CONSENSUS = Phase 1 锁; 后续阶段不允许偷换需求 (用 plan-keeper 验证) |
| **卡尺 (Done 标准)** | (a) Ralph 写出 ≥3 验收标准全可测量; (b) Lisa 至少做一次实质 review (不是 rubber-stamp) |
| **失败处理** | 需求不清 → NEEDS_WORK 反弹给 Ralph; 用户原诉求模糊 → Ralph 通过 WeCom 推问题给用户 |

---

## Phase 2 — 架构设计

| 项 | 内容 |
|---|---|
| **输入** | Phase 1 锁定的 requirements.md |
| **Ralph 干啥** | 写 `design.md`: 模块拆分 + 接口定义 + 数据模型 + 关键技术决策 (库选型 / 算法 / 协议) + 非功能落地 (security / performance) |
| **Lisa 审啥** | 接口是否完整覆盖需求; 数据模型是否合理 (规范化 / 一致性); 技术决策是否有 alternatives 比较; 非功能要求是否落到具体设计 |
| **CONSENSUS 协议** | 双 CONSENSUS = Phase 2 锁; 后续 Phase 3 测试设计必须基于此设计 |
| **卡尺** | (a) 至少一张架构图; (b) 接口定义到方法签名级; (c) 关键决策有 alternatives 表 |
| **失败处理** | 设计漏洞 → NEEDS_WORK; 重大不确定 → 跳出主 sub-slice 开 spike sub-slice |

---

## Phase 3 — 测试设计 ★ Gate 1（功能门禁）

| 项 | 内容 |
|---|---|
| **输入** | Phase 1 + Phase 2 锁定 |
| **Ralph 干啥** | 写 `test_spec`: (1) test harness 选型 (jest/pytest/playwright/load-test 等); (2) 测试方法 (unit / integration / E2E / property-based / 模糊测试); (3) 用例清单 (覆盖每条验收标准 ≥1 case + 边界 + 失败); (4) 测试脚本骨架 (or 第一批用例); (5) **通过标准** (覆盖率门槛 / latency / 错误率上限 / etc) |
| **Lisa 审啥** | harness 是否合适 (不要用 jest 测 Python 项目); 用例是否覆盖每条验收标准; **通过标准是否可测量且贴近业务痛感** (不是"100% 覆盖"而是"核心路径 p95 错误率 < 0.1%"); 边界 / 失败用例是否完整 |
| **CONSENSUS 协议** | 双 CONSENSUS = ★ **Gate 1 锁** ★; **从此 test_spec 是项目的功能门禁**, Phase 4 每轮 CODE 必过 |
| **卡尺** | (a) 通过标准明确 (数字); (b) 用例覆盖率 ≥1 case per acceptance criterion; (c) 边界 + 失败 case 都有 |
| **失败处理** | 通过标准过宽 → NEEDS_WORK ("100% 覆盖" 拒收); 用例缺边界 → NEEDS_WORK |
| **trustcoding 参考实现** | `rll_launch(test_spec=...)` 字段 + `buildHarnessesForTask` (`rll-team-platform/server/src/build-task-context.ts`); 持久化在 `migrations/009_test_spec.ts` |

**Gate 1 锁后的强制语义**：

```
Phase 4 任意 round CODE submit
  → cli quality-gate (RLL 层 submit-time gate, lint+typecheck+unit) 
  → server integration gate (Trustcoding 层 post-Lisa-PASS, turn.ts:230-257)
  → 跑 test_spec 锁定的所有 cases + 校验通过标准
  → fail = synthetic Lisa NEEDS_WORK (反弹 Ralph 修)
  → 不允许"绕过测试合环"
```

---

## Phase 4 — 实现

| 项 | 内容 |
|---|---|
| **输入** | Phase 3 锁定的 test_spec; Phase 2 设计 |
| **Ralph 干啥** | 多 round CODE: 每 round 一组功能 + 跑过 Gate 1 + submit |
| **Lisa 审啥** | 代码符合设计; quality-gate 通过 (RLL 层); integration gate 通过 (Trustcoding 层); 不夹带 scope 之外的改动 |
| **CONSENSUS 协议** | 每 round 单独 CONSENSUS; Phase 4 整体 CONSENSUS = 进 Phase 5 |
| **卡尺** | (a) 所有 test_spec 用例 PASS; (b) 通过标准达到; (c) 没有 "已知 bug 留给后续修" |
| **失败处理** | 测试 fail → NEEDS_WORK; 代码偏离设计 → NEEDS_WORK; quality-gate fail → submit 拒收 |

---

## Phase 5 — 测试环境部署

| 项 | 内容 |
|---|---|
| **输入** | Phase 4 mutual CONSENSUS 后的 main 分支代码 |
| **Ralph 干啥** | (1) 起 preview env (docker-compose / staging cluster); (2) 跑 smoke test (含真实业务流程); (3) 触一遍 Gate 1 测试 (确认部署后跟开发环境一致); (4) 写 `deployment-smoke.md` 记录环境配置 + smoke 结果 |
| **Lisa 审啥** | preview env 配置可重现; smoke 真业务流程跑通 (不是 fake stub); 部署日志没有 silent failure |
| **CONSENSUS 协议** | 双 CONSENSUS = Phase 5 锁; **没锁不能进 Phase 6 写真实截图** |
| **卡尺** | (a) preview URL / staging endpoint accessible; (b) smoke test PASS 在真环境; (c) 至少 3 个核心业务流程手验通过 |
| **失败处理** | 部署 fail → 回 Phase 4 修配置 / 修代码; smoke 失败 → 回 Phase 4 修 bug |

---

## Phase 6 — 用户文档 ★ Gate 2（上线门禁）

| 项 | 内容 |
|---|---|
| **输入** | Phase 5 锁定的运行实例 (preview env URL) |
| **Ralph 干啥** | (1) 用真截图工具 (Playwright / 手截) 在 Phase 5 实例上捕获覆盖关键功能; (2) 写文字说明 (用户视角, 不是开发者视角); (3) 真实截图 + 真功能描述; (4) 链接 README / quickstart 入口 |
| **Lisa 审啥** | (a) **截图真实** (能从 Phase 5 实例 reproduce, 不是 mockup / 不是 INSERT 假数据); (b) 文字描述跟截图一致; (c) 用户视角 (不是 "调用 API" 而是 "点这个按钮"); (d) 关键功能覆盖 (跟 Phase 1 验收标准对得上) |
| **CONSENSUS 协议** | 双 CONSENSUS = ★ **Gate 2 锁** ★ = 允许进 Phase 7 生产部署 |
| **卡尺** | (a) 每张截图必有对应活的 preview env URL (验证 reproducibility); (b) 至少覆盖 Phase 1 全部验收标准对应的 UI 流程; (c) 文档没有内部 planning 路径 leak (不引用 `.rll/PLAN.md` 等内部文件) |
| **失败处理** | 截图不真 / 拍不到 → 说明 Phase 5 没真过, 反弹回 Phase 5 (这是 Gate 2 的真威力 —— 它**反向验证前面阶段**); 文档语气是开发者视角 → NEEDS_WORK |

**Gate 2 的双重作用**：

1. **正向**: 这是上线信任的最后一道防线 —— 真实文档代表真功能可用
2. **反向**: Gate 2 fail 暴露 Phase 5 / Phase 4 的隐藏问题; "拍不出真截图" = "前面阶段没真过"

---

## Phase 7 — 生产部署 + 灰度 + 监控

| 项 | 内容 |
|---|---|
| **输入** | Phase 6 锁定 (Gate 2 通过) |
| **Ralph 干啥** | (1) deploy hook 接 git push → CD; (2) PostHog feature flag rule 写入; (3) Sentry / OpenTelemetry alert 配置 (错误率 / latency / 关键指标阈值); (4) 灰度策略 (5%/25%/50%/100% 阶梯发布); (5) rollback playbook |
| **Lisa 审啥** | 灰度门槛是否有数据触发 (不是手动决定); 监控阈值是否合理; rollback 是否真 idempotent |
| **CONSENSUS 协议** | 双 CONSENSUS = Phase 7 锁; 实际灰度 ramp 走 monitoring-driven (5% 24h 错误率 < 阈值 → 25% → ...) |
| **卡尺** | (a) 灰度阶段配置在 PostHog 里 (不是代码 hardcode); (b) 至少 3 个监控指标配阈值 + 告警通道; (c) rollback 能在 5min 内恢复 |
| **失败处理** | 监控未达阈值 → 自动卡灰度; 告警 fire → ramp 暂停 |

---

## Phase 8 — 数据反哺迭代

| 项 | 内容 |
|---|---|
| **输入** | Phase 7 上线后的真实用户数据 (PostHog events / Sentry errors) |
| **Ralph 干啥** | (1) 数据回流 dashboard 配置 (DAU / 错误率 / 关键功能使用频率); (2) 阈值告警 → 自动开新 task (例: "错误率连续 3 天 > 1%, 自动开 bug fix task"); (3) A/B 实验结果 → flag rule 迭代 |
| **Lisa 审啥** | 自动 task 触发条件是否避免 oscillation (今天开了明天关掉); 数据信号是否真贴近业务价值 |
| **CONSENSUS 协议** | 每个新 task 触发回到 Phase 1 重新走 8 阶段 |
| **卡尺** | (a) 真用户数据 dashboard live; (b) ≥1 自动 task 触发规则验证过; (c) A/B 结果有归因 (不是相关性 = 因果) |
| **失败处理** | 触发规则误报 → 调阈值; A/B 结果不显著 → 收口 |

---

## 跨阶段规则

### Atomic Phase Transition

每 phase 切换是 atomic：
1. Ralph 在当前 phase mutual CONSENSUS 后立即更新 PLAN.md 中该 phase 状态为 closed
2. 同时 cli `next-step` 进下一 phase
3. 同步 commit (per `feedback_premature_sor_flip.md`)

### Plan-Keeper Rule 5 (跨 phase 版)

每个 phase 的 sub-slice 行 keyword 必须匹配 last submit tag:
- `[PLAN]` → row "plan stage"
- `[CODE]` / `[FIX]` → row "code stage"
- `[CONSENSUS]` after mutual close → row "closeout-stage"
- closed → row "closed"

### 反向 Gate

Gate 2 fail 不只是 Phase 6 重做，而是**反向 trigger Phase 5 / Phase 4 重审**。这是 trustcoding 信任链的关键:

```
Phase 6 拍不出真截图
  → 反向证据: Phase 5 测试环境不真 / Phase 4 实现有功能没跑通
  → atomic flip 回 Phase 5 / Phase 4 重做
  → 不允许 "Gate 2 让步过"
```

类似 Gate 1 fail 反向 trigger Phase 3 测试设计 / Phase 2 架构设计的可能补漏。

### Carry-forward Sub-slice

每 phase mutual CONSENSUS 闭后，未完成的次要工作开 carry-forward sub-slice (例: Gate 1 锁了主测试集，但 perf test 留作 carry-forward)。Carry-forward 不阻塞主 phase 推进。

---

## 不在本模板范围内 (parked)

- 第 3 道门禁 (例: 部署后 / 监控达标后) — 待 dogfood 数据后回顾决定
- 阶段并行 (例: Phase 1 跟 Phase 2 同时进行) — 默认串行, 串行不行才看并行
- 多团队跨项目共享 phase 产出 — 等多团队真用例
- IDE 内 phase progress 可视化 — 跟跨平台 backend 一起 (见 `cross-platform-terminal-backend-matrix.md`)

---

**最后更新**: 2026-05-05  
**版本**: v1.0  
**Lisa CONSENSUS-locked at**: `trustcoding-comprehensive-plan` sub-slice (`.rll/PLAN.md §23`)  
**依赖**: `docs/trustcoding-product-definition.md` (产品定义), `docs/cross-platform-terminal-backend-matrix.md` (terminal 选型)
