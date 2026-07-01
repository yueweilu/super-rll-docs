# Superpowers (obra/superpowers) — 分析 + 建议

**日期**: 2026-06-02. **来源**: github.com/obra/superpowers (+ using-superpowers SKILL.md).
**背景**: 用户让评估 superpowers skillset 有什么值得 super-rll/RLL 学习的。

## 是什么

**obra/superpowers**（Jesse Vincent 出品，2026-01 进官方 Anthropic 插件市场）——
把工程纪律写成纯 markdown 的 agentic skills 框架。14 个 `SKILL.md` + 一个
session hook，跨 Claude Code / Cursor / Codex / Copilot CLI / Gemini CLI / OpenCode
通用。无 fine-tune、无专有 SDK、无 agent 平台 —— 就是一个 `skills/` 目录。

**核心赌注**：*AI coding agent 缺的不是能力，是纪律；纪律能用纯文本分发。*

（网传 star 数存疑，未当事实采信；但项目真实 + Anthropic 背书。）

## 跟我们 RLL 的关系：解同一个问题，方向相反

| | Superpowers | super-rll / RLL |
|---|---|---|
| 怎么强制纪律 | **prompt 层**：skill + 防合理化 meta-skill + hook | **机械层**：硬门禁 (§102/§133/§137) + Ralph↔Lisa 对抗审查 |
| 强度 | 轻、跨平台，但 agent 仍可"合理化"绕过 | 提交时硬 block，绕不过 |
| 自承弱点 | "没 hook 时 agent 90% 会合理化逃避 skill" | 门禁僵化、过程黑箱（用户的核心抱怨） |

## 14 skill ↔ 我们已有的（大部分已有！）

| Superpowers skill | 我们对应 |
|---|---|
| brainstorming（写码前逼出 spec） | R0 CLARIFY §128 ✅ |
| writing-plans（2-5 分钟粒度任务，文件路径+测试先写） | R1 PLAN 测试表 + TDD-first ✅（**我们粒度更粗**） |
| test-driven-development（红/绿） | §102 tests-only / expected-fail ✅ |
| requesting / receiving-code-review | **Ralph↔Lisa loop 本体** ✅✅ |
| verification-before-completion | §70 cascade + Lisa 实质验证 ✅ |
| systematic-debugging | （部分，无专门 skill） |
| **using-superpowers（防合理化 meta-skill）** | ⚠️ **prompt 层我们没有** |
| subagent-driven-development / dispatching-parallel-agents | ⚠️ 我们 loop 没用 subagent/并行 |
| writing-skills（造 skill 的 meta-skill） | ⚠️ 对 margay-studio 直接有用 |
| using-git-worktrees / executing-plans / finishing-a-development-branch | （流程辅助） |

## 最值钱的发现 ⭐ — 防合理化 meta-skill

`using-superpowers` 的机制（实测自 SKILL.md）：在 agent 决定行动前插一个**强制决策门**，
逐条封死合理化借口：
- *"Invoke relevant skills BEFORE any response or action. Even a 1% chance a skill
  might apply means you should invoke it."*
- *"IF A SKILL APPLIES, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT."*
- "Red Flags" 段把 *"这只是个简单问题" / "我先探一下代码库"* 都判定为"伪装成探索的任务逃避"。
- *"Questions are tasks. Check for skills."*

**这正是 2026-06-02 通宵刚证实的根因**：TDD 是 opt-in、被 agent 合理化（"这个简单，
跳测试"）掉了（tdd-bind slice 修了机械绑定那半 = full-auto 现在真开 TDD）。
superpowers 用 **prompt 层防合理化**解决，我们用**机械门禁**解决 —— 这是同一目标的两条腿。

## 建议方案

1. **采纳"防合理化纪律门" pattern，叠在机械门禁之上（不替换）** ⭐
   给 Ralph 加一个 prompt 层的纪律门 skill（仿 using-superpowers），逐条封死"这个简单
   跳测试"的合理化。机械门禁是硬底线，prompt 门减少 agent 跟门禁对抗的摩擦。**最低成本
   直接补强"TDD 被忽视"**，跟 tdd-bind（机械绑定）正好凑成双保险。这也是 CLAUDE.md §102
   已写的"判定/执行分离"的自然延伸。

2. **偷师 plan 粒度**：它的 plan 拆到 2-5 分钟一个任务、文件路径+测试先写下来。
   我们 R1 PLAN 可以更细。

3. **跨平台可移植**：同一个 `skills/` 文件夹跨 5 个 agent 通用 —— 对齐 rll-term"多 agent
   可配置"的产品愿景；我们的协议可做得更可移植。

4. **writing-skills meta-skill** → margay-studio（造 skill）直接可用，等其方向理清后纳入。

5. **绝不用它替换 RLL**：它自承 prompt-only 纪律会被绕（90%），我们的**机械门禁 + Lisa
   对抗审查更强**（机械门禁绕不过、合理化不掉）。保留 RLL 当底线，把 superpowers 式 prompt
   纪律叠上来 = 双保险。

## 一句话

superpowers 验证了我们 RLL 的方向（纪律 > 能力），而且它的**"防合理化 meta-skill"正是
我们 prompt 层缺的那块拼图**，建议作为一个 sub-slice 纳入（prompt 层纪律门），跟机械门禁
形成双保险。
