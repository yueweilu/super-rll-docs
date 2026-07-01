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
