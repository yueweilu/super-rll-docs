# D4 复审任务启动过程复盘

> 日期：2026-05-24
> 目的：记录从"用户要求 D4 复审"到"Lisa PASS 可以开始干活"的完整启动过程，供 rll-dev 复盘 mechanical overhead 问题

## 时间线

| 时间 | Step | Round | Tag | 内容 | 结果 |
|------|------|-------|-----|------|------|
| ~10:30 | d4-rescore-d5-goalmode | R1 | [PLAN] | D4 复审 + D5 Goal Mode | NEEDS_WORK: 缺 complexity artifact + --goal CLI 不存在 |
| ~10:35 | d4-rescore-d5-goalmode | R2 | [FIX] | 补 complexity + scope 收窄 D4-only | PASS |
| ~10:38 | d4-rescore-d5-goalmode | R3 | [CONSENSUS] | — | mutual CONSENSUS ✓ |
| ~10:43 | d4-lisa-review-execute | R1 | [PLAN] | 复审执行方案 | NEEDS_WORK: 新 step 没有 PLAN section/auto-tdd/complexity |
| ~10:49 | d4-lisa-review-execute | R2 | [FIX] | 补 PLAN section + auto-tdd + complexity + capability | NEEDS_WORK: capability acked=true 只有本地 CLI 写入 |
| ~10:53 | d4-lisa-review-execute | R3 | [FIX] | 用户直接执行 ack-user | NEEDS_WORK: complexity freshness-stale + ack 仍是 method:"cli" |
| ~10:55 | d4-lisa-review-execute | R4 | [FIX] | 放弃新 step，直接在当前提交复审请求 | NEEDS_WORK: complexity freshness-stale 仍红 |
| ~10:58 | d4-lisa-review-execute | R5 | [FIX] | 刷新 complexity | NEEDS_WORK: gate 绿了但 ack 仍缺独立用户证据 |
| ~11:17 | d4-lisa-review-execute | R6 | [FIX] | 用户创建 user-direct-ack.jsonl | PASS ✓ |
| ~11:21 | d4-lisa-review-execute | R7 | [CONSENSUS] | — | mutual CONSENSUS ✓ |
| ~11:24 | d4-review-scoring | R1 | [PLAN] | 复审执行 | NEEDS_WORK: 又开新 step 没接 canonical artifacts |
| ~11:28 | d4-review-scoring | R2 | [FIX] | 沿用旧 slice | NEEDS_WORK: live step 仍是 d4-review-scoring |
| ~11:32 | d4-review-scoring | R3 | [FIX] | 给 d4-review-scoring 补完整 setup | PASS ✓ |
| ~11:34 | d4-review-scoring | R4 | [CONSENSUS] | — | mutual CONSENSUS ✓ |

## 统计

- **总轮次**: 14 轮（从 d4-rescore-d5-goalmode R1 到 d4-review-scoring R4）
- **NEEDS_WORK 次数**: 8 次
- **PASS 次数**: 3 次
- **CONSENSUS 对**: 3 对
- **经过的 step 数**: 3 个（d4-rescore-d5-goalmode → d4-lisa-review-execute → d4-review-scoring）
- **时间**: ~1 小时（10:30 → 11:34）
- **实际工作量**: 0（全部在配 artifacts）

## 根因分析

### 问题 1：每个 step 需要 6 个 canonical artifact 全部对齐

每开一个新 step 必须配：
1. `.rll/PLAN.md` 中的 section（含 plan table）
2. `.dual-agent/auto-tdd-plan-<step>.json`（machine-consumable rows，与 PLAN.md 逐字对齐）
3. `.dual-agent/complexity-judge/<slice>.json`（Layer 1 LLM judgment）
4. `.dual-agent/task-harness-capability.json`（task_id 绑定）
5. `.dual-agent/task-install-consent.jsonl`（ack-downgrade + ack-user）
6. `.dual-agent/user-direct-ack.jsonl`（独立用户授权）

**任何一个缺失或不匹配 → NEEDS_WORK**。且每修一个可能导致另一个 stale（freshness-stale），形成连锁反应。

### 问题 2：step 名 ≠ slice 名导致 split-brain

- `ralph-lisa next-step` 创建新 step 名
- 但 PLAN.md 的 section 标题用的是 slice 名
- complexity-verify 按 slice 名查 artifact
- capability 按 task_id 查 ledger
- 如果 step/slice/task_id 任意两个不一致 → 死循环

### 问题 3：用户授权 provenance 没有强鉴别

- `ack-user --signature` 和 Ralph 自己调用没有区别（都是 `method: "cli"`）
- Lisa 无法从文件内容区分是用户还是 Ralph 执行的
- 每次需要用户另外创建独立文件（user-direct-ack.jsonl）
- 这个 workaround 不可扩展

### 问题 4：complexity freshness 易过期

- 每次修改 PLAN.md → input_hash 变化 → complexity-judge artifact 过期
- 需要重跑 complexity-judge → 但 verify 可能又因为其他原因失败
- 形成"修一个 → 另一个 stale → 修那个 → 第一个又 stale"的循环

## 建议改进方向

### P0：step 继承机制
- 新 step 应能声明"继承自 <parent-step>"，自动复用 parent 的 complexity/capability/authorization
- 不需要从零配 6 个 artifact

### P1：用户授权强鉴别
- `ack-user` 应记录调用来源（PID、session ID、是否从 submit 流程内调用）
- 或者改为交互式确认（类似 `Are you sure? [y/N]`）

### P2：complexity freshness 宽限
- 如果只修改了 PLAN table 的文本描述（不改 tier/command/oracle），不应触发 freshness-stale
- hash 应只覆盖结构性内容（tier + required），不覆盖 prose

### P3：减少必需 artifact 数量
- auto-tdd-plan JSON 应自动从 PLAN.md 解析生成，不需要手工维护两份
- capability 应从 PLAN.md 的 tier 覆盖自动推导

## 对比：实际工作 vs overhead

| 类别 | 时间 | 轮次 |
|------|------|------|
| D4/D5 TUI 执行（128 个测试） | ~2 小时 | 8 轮 |
| D4 复审启动配 artifacts | ~1 小时 | 14 轮 |
| D4 实际复审评分 | 进行中 | — |

**1 小时 14 轮的 mechanical overhead 换来 0 行实际工作产出。**
