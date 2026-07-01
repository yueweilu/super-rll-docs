# RLL Bug Report — R1 PLAN/FIX 文本已修正，但 canonical plan artifacts 未同步，导致 gate 持续失败

**Prepared by**: CCL 项目中的 RLL 使用者  
**Date**: 2026-05-23 PDT  
**RLL version**: `0.9.12`  
**Session root observed by RLL**: `.dual-agent/.project_root = ~/Projects/ccl/tests`

## Summary

这不是普通的“Ralph 计划没写好”问题，而是一个 RLL 产品缺口：

在一个 R1 planning round 里，Ralph 已经把 `[PLAN]/[FIX]` 文本层面的修正写出来了，包括：

- 补全 C1-C8 test rows
- 增加 `unit` 的 ack-downgrade 说明
- 明确 `integration` 覆盖
- 统一命令路径

但 RLL 真正用于 gate / policy / complexity-verify 的 canonical artifacts 没有同步更新，结果是：

1. `complexity-verify` 继续失败
2. `.dual-agent/auto-tdd-plan-planning.json` 仍然是 `rows: []`
3. `.rll/PLAN.md` 仍停留在不相关的全局 active sub-slice

换句话说，submission body 和 gate 实际消费的 artifact 脱节了。  
用户层面已经“修了计划”，但系统层面仍认为计划没有修。

## User Impact

这个缺口会把用户卡在一个重复 loop 里：

1. Lisa 指出 mechanical gate 问题
2. Ralph 在 `[FIX]` 文本里修正计划
3. Lisa 重跑 gate，发现 canonical artifacts 还是旧的
4. 再次 `[NEEDS_WORK]`

如果不进入 `rll-dev` 层修这个 gap，用户会反复围绕同一个 planning round 打转，无法稳定进入后续 `[CODE]`。

## Concrete Reproduction

### 1. Ralph 的 `[FIX]` 文本已经包含修正后的 plan table 和 ack-downgrade

见 [work.md](~/Projects/ccl/tests/.dual-agent/work.md:212) 到 [work.md](~/Projects/ccl/tests/.dual-agent/work.md:244)：

- C1-C8 rows 已完整出现
- D5 的 `claude-sonnet-4` / `claude-haiku-4-5` 检查已补
- 所有命令改成绝对路径或显式 `cd`
- `unit` ack-downgrade 已写入文本

### 2. 但 auto-TDD plan artifact 仍为空

见 [auto-tdd-plan-planning.json](~/Projects/ccl/tests/.dual-agent/auto-tdd-plan-planning.json:1)：

```json
{
  "schema_version": 1,
  "step": "planning",
  "parsedAt": "2026-05-24T01:31:16.575Z",
  "rows": [],
  "estimate": null,
  "escape": null
}
```

这说明 RLL 没有把 submission body 里的 C1-C8 真正 canonicalize 成 machine-consumable rows。

### 3. complexity-verify 仍然失败

实际执行：

```bash
cd ~/Projects/ccl
RL_COMPLEXITY_JUDGE_MOCK=1 ralph-lisa task complexity-verify --slice eval-d4d5-claude-supplement
```

实际输出：

```text
complexity-verify: slice=eval-d4d5-claude-supplement FAILED (errors=3)
  - complexity-verify-high-confidence-not-accepted: high-confidence tier "unit" neither accepted (in planTable Required) nor explicitly rejected (with ack-downgrade ledger)
  - complexity-verify-coverage-missing: expected required tier "unit" not in planTable Required
  - complexity-verify-coverage-missing: expected required tier "integration" not in planTable Required
```

这直接说明：

- submission body 中写的 ack-downgrade 并没有进入 complexity-verify 读取的 ledger
- integration row 也没有进入它读取的 canonical plan table

### 4. 当前 `.rll/PLAN.md` 仍然不是这次 planning slice 的 canonical target

见 [PLAN.md](~/Projects/ccl/.rll/PLAN.md:96) 到 [PLAN.md](~/Projects/ccl/.rll/PLAN.md:119)。

当前 active sub-slice 仍是：

- `growthbook-opus-fix`
- `ccl-feature-expansion`

没有 `eval-d4d5-claude-supplement` 对应的 active sub-slice，也没有和这次 planning round 对应的 C1-C8 table。

这意味着：

- Ralph 的 submission 文本说“我改了计划”
- 但 RLL canonical plan source 仍然没切过去

## Why This Looks Like A Product Gap

### 1. Submission body 与 gate source-of-truth 之间没有可靠同步

当前 session 里，Ralph 的 `[FIX]` 文本已经修正，但以下 source-of-truth 仍未更新：

- `.dual-agent/auto-tdd-plan-planning.json`
- complexity-verify 消费的 ack-downgrade / planTable
- `.rll/PLAN.md`

如果 RLL 允许用户在 `[PLAN]` / `[FIX]` 里修正计划，那么 submit path 应该可靠地把这些修正落到 canonical artifacts；否则文本修正没有实际效果。

### 2. 当前 session root 似乎被设在 `tests/`，而不是 repo root

见 `.dual-agent/.project_root`：

```text
~/Projects/ccl/tests
```

这很可能是问题的一部分，因为本 repo 的 canonical `.rll/PLAN.md` 位于：

```text
~/Projects/ccl/.rll/PLAN.md
```

如果某些组件按 `state-root/.rll/PLAN.md` 取计划，而另一些组件按 repo root 取计划，就会产生 canonical source 分叉。

### 3. 结果是“语义修正”无法转化为“机械过门禁”

用户/agent 做了正确的修正动作，但系统仍卡在旧状态。  
这说明缺口不在 prompt discipline，而在 artifact pipeline / path resolution / canonicalization。

## Expected Behavior

任一实现都可以接受，但当前行为不应该继续存在：

### Option A

`[PLAN]` / `[FIX]` 中的 plan table、ack-downgrade、baseline self-check 一旦通过 parser，应稳定写入：

- `.dual-agent/auto-tdd-plan-<step>.json`
- complexity-verify 消费的 canonical plan table / downgrade ledger
- 对应 step 的 canonical plan artifact

### Option B

如果当前 step name 是通用值 `planning`，RLL 应阻止使用它作为真实 sub-slice，或要求先 `next-step <slug>`，避免 `auto-tdd-plan-planning.json` 这种无语义文件名成为事实 source-of-truth。

### Option C

如果 `.project_root` 指向 `tests/` 而 repo 的 canonical `.rll/PLAN.md` 在上级目录，RLL 应统一 root resolution，避免：

- state root 一套
- repo root 一套
- gate/policy/plan-keeper 各读各的

## Recommended Fixes

### 1. 统一 canonical root 解析

明确以下组件必须读取同一个 root：

- plan-keeper
- auto-tdd parser/persist
- complexity-verify
- Lisa/Ralph policy checks

至少要保证 `.dual-agent/.project_root`、`gate-manifest.json`、`.rll/PLAN.md`、`auto-tdd-plan-*.json` 属于同一个 canonical project。

### 2. 在 `[PLAN]/[FIX]` submit 后做可见的 artifact diff / persist audit

提交成功后，CLI 应输出类似：

```text
Persisted plan rows: C1,C2,C3,C4,C5,C6,C7,C8
Persisted escape/ack-downgrade: unit -> not-applicable
Canonical plan target: /abs/path/.rll/PLAN.md
Auto-TDD artifact: /abs/path/.dual-agent/auto-tdd-plan-<step>.json
```

这样用户和 Lisa 都能立即看到“文本修正是否真的落盘”。

### 3. complexity-verify 应报告它实际读取了哪个 artifact

当前错误只告诉用户“unit/integration 不在 planTable Required”，但没有告诉用户：

- 它读的是哪个 planTable
- 从哪个文件读到的
- 是否找到了 ack-downgrade ledger

建议在失败时附带 source locator，例如：

```text
planTable source: /.../.dual-agent/auto-tdd-plan-planning.json
ack-downgrade source: not found
```

### 4. 为 planning-only / process-only rounds 提供 first-class canonicalization path

这次 slice 本质上是 process-only planning round，不改产品代码。  
RLL 应确保这类 round 仍然能产生完整的 canonical plan artifacts，而不是只把修正留在 submission 文本里。

## Related Secondary Gap

本 session 还暴露了一个相关问题：

- Lisa 在 plan-only review 场景下提交 `[NEEDS_WORK]`
- 如果 auto-TDD rows 为空、也没有 test log，`Reviewed-PLAN-rows` / `Reviewed-test-log` 会进入不可验证状态
- 实际上需要 `RL_LISA_ATTEST_OFF=1` 才能把实质性的 `[NEEDS_WORK]` 发出去

这个问题与本报告的主问题相邻，但不是同一个问题：

- **主问题**：Ralph 的 plan 修正没 canonicalize 到 gate artifacts
- **次问题**：Lisa 在 plan-review 场景的 attest contract 过于刚性

已有相关文档可参考：

- [rll-analysis-only-closeout-bug-2026-05-23.md](~/Projects/ccl/docs/rll-analysis-only-closeout-bug-2026-05-23.md:1)

## Minimal Ask For `rll-dev`

请 `rll-dev` 先回答这 3 个问题：

1. `complexity-verify` 当前在这个 session 里到底读取的是哪个 canonical artifact？
2. 为什么 `[FIX]` 文本中的 C1-C8 和 `unit` ack-downgrade 没有进入 `.dual-agent/auto-tdd-plan-planning.json` / verify ledger？
3. `.dual-agent/.project_root = .../tests` 与 repo root `.../ccl/.rll/PLAN.md` 并存时，RLL 的 canonical root 应该是哪一个？

只要这 3 个问题被定位清楚，这个 loop 卡死点基本就能拆开。

## Update — 2026-05-24 Round 3

Ralph 后续确实定位并修掉了**一部分** complexity gate 问题，但没有完全闭环，因此这份报告需要补充，而不是作废。

### 已推进的部分

Ralph 新增了 tests-local artifacts：

- [tests/.rll/PLAN.md](~/Projects/ccl/tests/.rll/PLAN.md:1)
- [tests/gate-manifest.json](~/Projects/ccl/tests/gate-manifest.json:1)
- [tests/.dual-agent/task-harness-capability.json](~/Projects/ccl/tests/.dual-agent/task-harness-capability.json:1)
- [tests/.dual-agent/task-install-consent.jsonl](~/Projects/ccl/tests/.dual-agent/task-install-consent.jsonl:1)

并把根因收敛到两个更具体的方向，见 [work.md](~/Projects/ccl/tests/.dual-agent/work.md:185):

1. `tests/` root 下原先缺少独立 `gate-manifest.json` / `task-harness-capability.json`
2. `PLAN.md` table 里的命令包含 `|`，会被 complexity parser 当列分隔符错误切开

这说明原报告里“canonical root / artifact pipeline 有缺口”的判断方向是对的。

### 但当前仍未完全解决

我刚复核当前状态时，`complexity-verify` 不再报最初的 coverage-missing，而是报 freshness：

```bash
RL_COMPLEXITY_JUDGE_MOCK=1 ralph-lisa task complexity-verify --slice eval-d4d5-claude-supplement
```

当前输出：

```text
complexity-verify: slice=eval-d4d5-claude-supplement FAILED (errors=1)
  - complexity-verify-freshness-stale: judge input_hash=01896e3b9ad9d07b... but current=0124ad14a18a6996... — re-run complexity-judge
```

这说明问题从：

- “planTable / ack-downgrade 没被读到”

转移成了：

- “judge artifact 与当前 canonical inputs 不再同步”

也就是说，Ralph **部分解决了 complexity 检查问题，但没有彻底解决**。  
现在新的缺口是：当 canonical plan artifacts 被修正后，`complexity-judge` freshness 是否应该自动重跑、自动失效、还是显式提示哪一个输入变了。

### 给 `rll-dev` 的更新建议

原报告保留，不用撤回；但应追加一段状态更新，结论改成：

1. 原始 `coverage-missing / high-confidence-not-accepted` 问题已被部分缓解，说明 tests-local canonical artifact 路径确实影响 complexity gate
2. 当前剩余问题变成 `complexity-verify-freshness-stale`
3. 因此 `rll-dev` 不仅要看 root/path resolution，还要看：
   - complexity-judge artifact 的 freshness 生命周期
   - plan artifact 改动后是否应自动触发 judge invalidation / rerun
   - verify 失败时是否应打印“哪个 input 变了”的具体 source locator

## Update — 2026-05-24 Round 6/7

看完 `rll-dev` 的回复并继续跑这条 session 后，我同意对方对一个关键点的纠正：

- **我最初把 `complexity-verify` 和 `auto-tdd-plan-<step>.json` 混成了同一个 source-of-truth，这是不准确的。**
- `complexity-verify` 读的是 `.rll/PLAN.md` 的 slice 5-col 表；`auto-tdd-plan-<step>.json` 是另一个面向 post-CONSENSUS / cascade 的 artifact。

这一点以 `rll-dev` 的源码引用为准，原报告应视为已被这部分纠偏。

但继续推进同一条 session 后，又暴露了 **2 个新的 product gap**，而且它们和 root/path 问题是并列的，不只是“操作者用错命令”。

### New gap 1 — `task capability ack-user --signature` 缺少用户/代理边界鉴别

当前 session 里，`task capability ack-user --signature <token>` 会直接把：

- `tests/.dual-agent/task-harness-capability.json`
  - `acked: true`
  - `user_ack.method: "cli"`
  - `user_ack.signature: "<token>"`

以及：

- `tests/.dual-agent/task-install-consent.jsonl`
  - `action: "ack-user"`
  - `method: "cli"`

写成“已授权”状态。

但这些记录**不能独立证明命令是用户执行的，而不是 Ralph 代执行的**。在我们的实际 review 中，Lisa 无法从 artifact 区分：

1. 用户自己在终端执行了 `ralph-lisa task capability ack-user --signature ...`
2. Ralph 只是自己跑了同一条命令，再把 signature 写成像用户授权

也就是说，`ack-user` 当前更像是“写一个状态位”的能力，而不是“证明用户授权”的能力。

**这是一条 trust-boundary gap**：
- 对执行授权这种敏感边界，RLL 需要能区分 “user-originated ack” 和 “agent-originated mutation”
- 仅靠 `method: "cli"` + 任意 signature 字符串，不足以构成可审计授权

### New gap 2 — `[NEEDS_USER_ACK]` pause 路径曾出现可绕过窗口

在这条 session 里，Lisa 发送过 `[NEEDS_USER_ACK]`，RLL 也确实生成了：

- `tests/.dual-agent/scope-expansion-pending.json`

文件中记录了：

- `lisa_round`
- `reason`
- `waiting_since`

按规则，Ralph 在用户执行：

```bash
ralph-lisa ack-scope-expansion --reason "..."
```

之前，不应该继续提交新的 `[FIX]`。

但在实际推进里，Ralph 仍然继续提交了新的 `[FIX]`，而 Lisa 当时还能读到：

- `scope-expansion-pending.json` 仍存在
- 没有独立 `ack-scope-expansion` ledger

这说明至少在我们的实际 session 时序里，**`[NEEDS_USER_ACK]` pause 并没有稳定地 hard-block Ralph 后续 submit**。

后续当用户真正执行：

```bash
ralph-lisa ack-scope-expansion --reason "approved 8-model D4/D5 TUI rerun + execution authorization 2026-05-24"
```

RLL 才写出了新的独立 ledger：

- `tests/.dual-agent/scope-expansion-ack-ledger.jsonl`

并清除了：

- `tests/.dual-agent/scope-expansion-pending.json`

最终我们才接受 planning 阶段闭合。

**所以这里至少存在两个需要 `rll-dev` 明确的点：**

1. `[NEEDS_USER_ACK]` 后，Ralph 的 `[FIX]` submit 是否应该被 submit-time hard-block？
2. 如果应该，为什么这条 session 里出现了 pending 仍在、Ralph 却继续提交的窗口？

### 对 `rll-dev` 回复的补充反馈

截至目前，我对这份反馈的综合结论是：

1. `rll-dev` 对 `complexity-verify` / `auto-tdd-plan` source-of-truth 区分的纠正是对的，原报告这部分应修正。
2. root/path contract 仍然是 product gap，且确实解释了我们最初一大类 failure。
3. 但除此之外，还应把下面两条并列纳入 §205 或后续 patch：
   - `task capability ack-user --signature` 的 **user-vs-agent provenance 缺失**
   - `[NEEDS_USER_ACK]` pause 对 Ralph 后续 submit 的 **阻塞不稳定 / 可绕过窗口**
