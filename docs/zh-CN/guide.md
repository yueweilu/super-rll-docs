[English](../en/guide.md) | [日本語](../ja/guide.md) | [中文](../zh-CN/guide.md)

# 用户指南

**给谁看**：第一次用 RLL，想了解它能做什么、怎么上手。

**看完你会**：理解 RLL 的核心概念 → 知道什么时候用 → 跑通第一个会话。

> 查命令细节 → [CLI 参考](reference.html)
> 提交被拒了 → [FAQ](faq.html)
> 接手维护 RLL 项目 → [维护者交接](maintainer-handoff.html)

## RLL 是什么

RLL（Ralph-Lisa Loop）是一个双智能体协作工具。它把"AI 写代码"这件事拆成两个独立角色：

- **Ralph**（开发）— 负责写计划、写代码、写测试
- **Lisa**（审查）— 独立审查 Ralph 的提交，验证测试是否真实通过

两者交替工作，中间由 CLI 门禁当裁判——自动检查测试结果、文档一致性、安全审计。**人类负责做架构决策。**

## 为什么需要 RLL

单一 AI 帮你写代码的问题是：它既当运动员又当裁判。RLL 把"写"和"审"强制分开：

- 你不会收到一份 AI 自说自话的代码
- 测试结果不是"看起来通过了"，而是被 Lisa 独立验证过的
- 每次提交都有完整记录，出了问题能追溯

**适用场景**：多步骤实现、架构决策、影响用户/安全的代码、需求不明确的探索。

**大材小用**：单行修复、个人脚本、紧急热修复。

## 快速上手

### 安装

需要 Node.js >= 18。还需要 Claude Code（Ralph）和 Codex CLI（Lisa）。

```bash
npm i -g ralph-lisa-loop
```

最简验证：`ralph-lisa doctor` 检查环境是否就绪。

### 初始化项目

```bash
cd your-project
ralph-lisa init
```

这会创建角色文件（CLAUDE.md / CODEX.md）和 `.dual-agent/` 会话目录。不想创建项目文件可以用 `ralph-lisa init --minimal`。

### 启动一个任务

```bash
ralph-lisa start "实现登录功能"
```

### 或者自动运行

```bash
ralph-lisa auto --engine --task "实现登录功能"
```

Engine 模式自动驱动两个 agent 轮转，不需要手动切换。

## 核心概念

### 回合制

Ralph 和 Lisa 轮流行动。每一轮：一方提交 → CLI 自动验证 → 另一方响应。不会同时说话。

### Tag 系统

每次提交以 tag 开头，表明这是什么类型的回合：

| Ralph 常用 | 含义 |
|-----------|------|
| `[PLAN]` | 第 1 轮：方案设计 |
| `[CODE]` | 代码实现（必须含测试结果） |
| `[FIX]` | 根据 Lisa 反馈修改 |
| `[CONSENSUS]` | 确认同意，关闭当前任务 |

| Lisa 常用 | 含义 |
|----------|------|
| `[PASS]` | 审查通过 |
| `[NEEDS_WORK]` | 需要修改，须说明原因 |

第 1 轮 Ralph 必须是 `[PLAN]`——让 Lisa 在编码前验证对任务的理解。

### Consensus 协议

Lisa 的裁决是建议性的，不是最终判决。双方必须都提交 `[CONSENSUS]` 才算任务关闭。

如果 5 轮内达不成共识，可以用 `[OVERRIDE]`（记录分歧后继续）或 `[HANDOFF]`（升级为人决策）。不会死循环。

### 质量门禁

CLI 在提交时自动验证：测试结果是否真实、文档是否同步、有没有泄露密钥、复杂度判定是否合理。违规默认 block 提交，不是 warn。

### 任务类型

不是所有任务都需要完整 TDD 流程。文档、审查、流程类任务可以用 fast-path 跳过不必要的仪式：

- **code-task**：完整 TDD（默认）
- **doc-task**：纯文档改动
- **review-task**：审查 / 写报告
- **process-task**：改协议 / PLAN 文件

关键判据：改没改 `cli/` 下的源码。

## 提交要求

`[CODE]` 和 `[FIX]` 必须包含：

- **Test Results**：跑了什么命令、通过多少、失败多少
- 测试结果必须是真跑出来的，不能编
- 需要跑回归测试 + 新测试

Lisa 审查时不只是看 Ralph 说测试通过了——她会独立验证 gate 结果和测试日志。

## 工作方式选择

| 场景 | 推荐方式 |
|------|----------|
| 日常 IDE 开发 | IDE 当 Ralph + 终端跑 `watch-lisa` |
| 全自动命令行 | `auto --engine --task "..."` |
| 快速审查 | `review --auto-approve` |
| 手动精细控制 | `start` → 手动 `submit-ralph` / `submit-lisa` |

## 环境变量

| 变量 | 默认值 | 作用 |
|------|--------|------|
| `RL_POLICY_MODE` | `block` | 门禁模式：`off` / `warn` / `block` |

详细的环境变量和 CLI 命令见 [CLI 参考](reference.html)。

## 重要提醒

### Git 纪律

小提交、清晰信息、频繁提交。出问题时唯一的安全网是 `git reset`。

### 人类仲裁者不可缺失

两个 AI 可能愉快地就一个糟糕的设计达成一致。RLL 是结构化辅助工具，不是全自动机器人。架构决策、安全边界、业务方向由你决定。

---

> 这篇指南覆盖了核心概念和基本用法。详细的 CLI 命令 → [CLI 参考](reference.html)。遇到问题 → [FAQ](faq.html)。
