# Super RLL 概览

> Ralph-Lisa Loop — 双智能体协作工具，用 CLI 质量门禁保证 AI 生成代码的可靠性。

## 用途

Super RLL 解决一个根本问题：**AI 写的代码，谁来检查？**

单一智能体既能写代码又能判定"完成了"，等于自己批改自己的试卷。RLL 把开发和审查拆成两个独立 agent——Ralph（开发）和 Lisa（审查）——交替工作，中间由 CLI 门禁当裁判。人类负责做架构决策。

不需要审查每一行代码，也不需要每提交一次就 review 一次。把审查自动化，人力只保留在关键决策点上。

## 能力范围

- **回合制开发循环**：Ralph 提交代码 → Lisa 独立审查 → 通过或退回修改 → 循环直到共识
- **自动化质量门禁**：测试结果、文档同步、复杂度判定、安全检查——在提交时自动验证，不靠自觉
- **多任务类型 fast-path**：代码、文档、审查、流程类任务各有定制流程，简单任务不浪费轮次
- **自主模式**：Engine 模式自动驱动双 agent 轮转，无需手动操作 tmux
- **测试金字塔级联**：unit → smoke → integration → e2e 分层自动运行，失败自动回环修复

## 运行模型

```
你（人类）→ 定方向、做架构决策
  ↓
Ralph（开发 agent）→ 写计划、写代码、写测试
  ↓
CLI 门禁 → 自动验证测试结果、文档一致性、安全审计
  ↓
Lisa（审查 agent）→ 独立审查、验证测试真实性、给出 PASS 或 NEEDS_WORK
  ↓
回到 Ralph → 修正或共识
```

每一轮自动记录在 `.dual-agent/history.md` 中，完整可追溯。

## 按任务使用文档

| 我想做什么 | 先看 | 然后看 |
|-----------|------|--------|
| 第一次跑通 RLL | [用户指南](guide.html) | [FAQ](faq.html) |
| 理解 RLL 的设计原理 | 本页"RLL 是什么，不是什么" | [CLI 参考](reference.html) |
| 排查提交被拒 | [FAQ](faq.html) | [测试与门禁](test-harness-and-gates.html) |
| 维护 RLL 本身（接手项目） | [维护者交接](maintainer-handoff.html) | [测试计划](testing-plan.html) |
| 了解测试体系 | [测试指南](testing.html) | [测试计划](testing-plan.html) |

## RLL 是什么，不是什么

**RLL 是**：结构化 AI 辅助开发工具。帮你把"AI 写代码"这件事工程化、可验证、可追溯。

**RLL 不是**：全自动开发机器人。人类仲裁者不可缺失——架构决策、安全边界、业务方向必须由你做出。

公开文档必须保守。RLL 的能力描述基于已经 ship 的 CLI 功能和 gate 机制，不会承诺尚未实现的特性。

## 源码依据

所有能力描述对应 `cli/src/` 下的实际实现：
- 回合协议：`cli/src/commands.ts` — `cmdSubmitRalph` / `cmdSubmitLisa`
- 质量门禁：`cli/src/policy.ts` — `checkRalph` / `runGate`
- 测试级联：`cli/src/commands.ts` — `runTierCascade`
- 复杂度判定：`cli/src/complexity-judge.ts`

## 相关页面

- [用户指南](guide.html) — 从安装到跑通第一个会话
- [CLI 参考](reference.html) — 所有命令的完整参考
- [FAQ](faq.html) — 常见问题与排查
- [维护者交接](maintainer-handoff.html) — 接手维护 RLL 项目本身
- [测试与门禁](test-harness-and-gates.html) — 质量体系详解
- [测试计划](testing-plan.html) — 完整测试策略
- [更新日志](changelog.html)
