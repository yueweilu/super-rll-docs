[English](../en/guide.md) | [日本語](../ja/guide.md) | [中文](../zh-CN/guide.md)
<!-- Translated from: docs/en/guide.md -->

# 用户指南

**这篇是给谁看的**：第一次用 RLL，想知道整套流程跑起来长啥样的人。
**看完能做什么**：装上 RLL → 选启动模式 → 跑通你的第一个 sub-slice → 知道每个 round 该做啥 → 知道什么时候用 fast-path。

Ralph-Lisa Loop 强制将代码生成和代码审查严格分离。一个 agent 负责编写，另一个负责审查，双方在回合制循环中交替进行。架构决策由你来做。

> 想看测试 / 门禁怎么过 → [`testing.md`](./testing.md)
> 提交被 block 想查错误信息 → [`faq.md`](./faq.md)
> 想知道某个 cli 命令 → [`reference.md`](./reference.md)
> 维护 RLL 本身（接手项目）→ [`maintainer-handoff.md`](./maintainer-handoff.md)

## 前提条件

| 依赖项 | 用途 | 安装方式 |
|--------|------|----------|
| [Node.js](https://nodejs.org/) >= 18 | CLI | 参见 nodejs.org |
| [Claude Code](https://claude.ai/code) | Ralph（开发者） | `npm i -g @anthropic-ai/claude-code` |
| [Codex CLI](https://github.com/openai/codex) | Lisa（审查者） | `npm i -g @openai/codex` |
| tmux | 自动模式 | `brew install tmux`（macOS）/ `apt install tmux`（Linux） |
| fswatch / inotify-tools | 更快的回合检测 | `brew install fswatch`（macOS）/ `apt install inotify-tools`（Linux） |

tmux 和 fswatch/inotify-tools 仅在自动模式下需要。手动模式只需 Node.js、Claude Code 和 Codex 即可运行。

运行 `ralph-lisa doctor` 验证你的环境配置：

```bash
ralph-lisa doctor
```

使用 `--strict` 可在缺少依赖时返回非零退出码（适用于 CI）：

```bash
ralph-lisa doctor --strict
```

## 安装

```bash
npm i -g ralph-lisa-loop
```

## 项目配置

### 完整初始化

```bash
cd your-project
ralph-lisa init
```

这将创建角色文件和会话状态：

```
your-project/
├── CLAUDE.md              # Ralph 的角色（由 Claude Code 自动加载）
├── CODEX.md               # Lisa 的角色（通过 .codex/config.toml 加载）
├── .claude/
│   └── commands/          # Claude 斜杠命令
├── .codex/
│   ├── config.toml        # Codex 配置
│   └── skills/            # Codex 技能
└── .dual-agent/           # 会话状态
    ├── turn.txt           # 当前回合
    ├── task.md            # 任务目标（通过 update-task 更新）
    ├── work.md            # Ralph 的提交内容
    ├── review.md          # Lisa 的提交内容
    └── history.md         # 完整历史记录
```

### 最小化初始化（零侵入）

```bash
ralph-lisa init --minimal
```

仅创建 `.dual-agent/` 会话状态目录——不创建项目级文件（不生成 CLAUDE.md、CODEX.md 或命令文件）。需要：

- 已安装 Claude Code 插件（通过 hooks 提供 Ralph 角色）
- Codex 全局配置位于 `~/.codex/`（提供 Lisa 角色）

`start` 和 `auto` 命令在两种初始化模式下均可使用。

### 从项目中移除

```bash
ralph-lisa uninit
```

## 你的第一个会话

### 第 1 步：启动任务

```bash
ralph-lisa start "implement login feature"
```

这会将任务写入 `.dual-agent/task.md` 并将回合设置为 Ralph。

### 第 2 步：Ralph 工作（终端 1）

```bash
ralph-lisa whose-turn                    # → "ralph"
# ... 进行你的工作 ...
# 将提交内容写入 .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

第 1 轮必须是 `[PLAN]` 提交——这让 Lisa 有机会在编码开始前验证对任务的理解。

### 第 3 步：Lisa 审查（终端 2）

```bash
ralph-lisa whose-turn                    # → "lisa"
ralph-lisa read work.md                  # 阅读 Ralph 的提交
# ... 将审查内容写入 .dual-agent/submit.md ...
ralph-lisa submit-lisa --file .dual-agent/submit.md
```

### 第 4 步：迭代直到达成 consensus

Ralph 阅读 Lisa 的审查并回应：

```bash
ralph-lisa read review.md                # 阅读 Lisa 的反馈
# 用 [FIX]、[CHALLENGE]、[DISCUSS] 等回应
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

循环持续进行，直到双方达成 `[CONSENSUS]`。

### 第 5 步：进入下一阶段

达成 consensus 后，进入下一个阶段：

```bash
ralph-lisa step "phase-2-implementation"
```

## 任务类型 fast-path（§207，v0.9.13+）

不是所有任务都该走完整 TDD。**review / 文档 / 协议改动**这类不写代码的工作，可以用 `--type` 显式声明 task type 跳过 TDD 礼仪：

```bash
# 写代码 → 完整 TDD（默认）
ralph-lisa next-step "implement-login" --type code-task

# 纯 review / 写报告 → 跳 TDD，只能改 docs/** + .dual-agent/**
ralph-lisa next-step "review-old-design" --type review-task

# 改文档 → 可改 docs/** + 顶层 *.md + CLAUDE/CODEX/README
ralph-lisa next-step "fix-readme-typos" --type doc-task

# 改协议 / PLAN → 可改 .rll/** + docs/** + CLAUDE/CODEX（不含 cli/package.json）
ralph-lisa next-step "update-protocol" --type process-task
```

**判别原则**：**有没有改 `cli/**` 源代码或 `cli/package.json`？有就 code-task**。

省略 `--type` 等价于 `code-task`，所有 legacy 流程不变。详见 [`../non-coding-task-quickstart.md`](../non-coding-task-quickstart.md)。

### Fast-path 里的 evidence 要求

非代码任务跳了 5-列 test 表 + tests-only round，但仍要求：

| task type | body 必含 |
|---|---|
| `review-task` | `Reviewed-PLAN-rows:` / `Reviewed-test-files:` / `Pass-Rationale:` 或 `NeedsWork-Rationale:` / `Verified:` |
| `doc-task` | `Files:` + 摘要 ≥10 字符 |
| `process-task` | `Files:` + `rationale:` 或 `Process-Change-Reason:`（改 CLAUDE/CODEX 时强制后者） |

**Anti-loophole 警告**：§207 是 trust-boundary 锁，`RL_POLICY_MODE=warn` **不能** bypass；中途想偷偷改代码会被 `task-type-file-mismatch` block。详见 [`testing.md`](./testing.md) "常见门禁 BLOCKED 信息" 段。

## 任务复杂度 mode fast-path（§212，v0.9.14+）

`--type` 决定"任务做什么"，`--mode` 决定"多严格"。两个轴正交，可叠加。

```bash
# 简单 (efficiency-first) — 跳 §128/§122/§102/§123/§134 礼仪
ralph-lisa next-step "fix-typo" --mode simple --user-signature "user-A-simple-2026-05-26"

# 标准 (default) — 当前 LLM 自动判 (省略 --mode 等价)
ralph-lisa next-step "add-feature"

# 严格 (quality-first) — 即使简单也走全套, 测试计划用户共创 (Phase 2 §213 ship)
ralph-lisa next-step "auth-refactor" --mode strict --user-signature "user-C-strict-2026-05-26"
```

**Skill auto-fire**: 不写 `--mode` 时, `next-step` 自动把 Stage 0 prompt 注入 `.dual-agent/task.md`, Ralph 第一句话问用户选 A/B/C。

**`--user-signature` 强制必填** (trust-boundary): ≥10 字符 + 含 audit 关键词 (simple/efficiency-first/trivial/standard/strict/quality-first) 或 ISO 日期 `YYYY-MM-DD`。否则:
- 缺 signature → exit 2 `mode-set-requires-user-signature`
- signature 太弱 → exit 2 `user-signature-too-weak`

每次 `--mode X` 调用写 `.dual-agent/audit-log.jsonl` 审计追踪。

**Body 声明被忽略**: 在 [CODE] body 写 `Mode: simple` 不生效——只有 SoR JSON (`.dual-agent/clarify-locked-<step>.json`) 和 cli flag 是 authoritative。

详见 `docs/211-task-intake-skill-design.md` 完整设计 + [`test-harness-and-gates.md`](./test-harness-and-gates.md) "§212 mode bypass" 段。

## 自动模式

### Engine 模式（推荐）

Engine 模式使用内置 TurnCoordinator 通过 ACP 协议驱动 Ralph 和 Lisa。它可在 macOS / Linux / Windows 上原生运行，不依赖 tmux 或 bash。

```bash
ralph-lisa auto --engine --task "implement login feature"
```

选项：
- `--ralph-backend claude` / `--lisa-backend claude` — 选择 agent 后端
- `--auto-approve` — 自动批准所有权限请求
- `--ui quiet|split|json|tmux|wt` — 显示模式。`wt` 会打开 Windows Terminal 双面板标签页
- `--max-rounds 20` — 自动停止前的最大轮数
- `--deadlock-threshold 5` — 判定 deadlock 的连续 NEEDS_WORK 次数

### 跨平台支持

- Windows：`ralph-lisa auto --engine` 可原生运行，legacy tmux 模式不支持。
- Windows Terminal：`--ui wt` 会打开 Ralph / Lisa 专用标签页；如果不在 Windows Terminal 宿主内，会回退到 `split`。
- macOS / Linux：仍可使用 `--ui tmux`，legacy tmux 模式也继续可用。

### IDE 集成（推荐 IDE 用户使用）

如果你使用 IDE（Cursor、Claude Code、Windsurf、Cline、VS Code + Copilot），推荐使用 **模式 2B：IDE 当 Ralph + Lisa watcher**。

#### 快速开始

```bash
# 1. 初始化项目（为所有支持的 IDE 生成规则文件）
ralph-lisa init

# 2. 在终端启动 Lisa watcher（保持运行）
ralph-lisa watch-lisa --lisa-backend codex --auto-approve

# 3. 在 IDE 中打开项目 — AI 会自动读取规则文件
```

`ralph-lisa init` 会创建：
- `CLAUDE.md`（Claude Code）
- `.cursorrules`（Cursor）
- `.windsurfrules`（Windsurf）
- `.clinerules`（Cline）
- `.github/copilot-instructions.md`（GitHub Copilot）
- `CODEX.md`（Codex / Lisa 角色）
- `.git/hooks/post-commit`（commit 后自动 Lisa review）

#### 工作原理

1. IDE 的 AI agent 充当 **Ralph**（开发者）
2. `watch-lisa` 在后台以**持久连接**运行 — Lisa 跨轮次保持上下文
3. 当 Ralph 通过 `ralph-lisa submit-ralph --file .dual-agent/submit.md` 提交时，watcher 自动触发 Lisa 审核
4. Lisa 的审核结果写入 `.dual-agent/review.md` — IDE AI 在下一轮动作时读取

#### 一键审核（无需 init）

快速审核代码，无需搭建完整 loop：

```bash
ralph-lisa review --auto-approve
ralph-lisa review --lisa-backend codex --scope "src/"
```

自动收集 `git diff`，发给 Lisa，将审核结果输出到 stdout。适用于任何项目。

#### 模式总览

| 模式 | 适用场景 | 命令 |
|------|----------|------|
| **IDE + watch-lisa** | 日常 IDE 开发 | 终端跑 `watch-lisa`，IDE AI 当 Ralph |
| **CLI 全自动** | 全自动、纯命令行 | `auto --engine --task "..." --ui tmux` |
| **一键审核** | 快速审核、CI/PR | `review --auto-approve` |
| **MCP 服务器** | 高级 IDE/agent 集成 | `mcp-server` |

### MCP 服务器（高级）

面向编程化 IDE/agent 集成，启动 RLL MCP 服务器：

```bash
ralph-lisa mcp-server
```

它会暴露 `rll_launch`、`rll_status`、`rll_submit`、`rll_lisa_review`、`rll_handoff`、`rll_pause`、`rll_resume`、`rll_override` 等工具。

### Legacy tmux 模式（已弃用）

> ⚠️ Legacy tmux 模式已弃用，请改用 `auto --engine`。

旧的 tmux 自动模式仍可使用，但未来会移除：

```bash
ralph-lisa auto "implement login feature"               # 已弃用
ralph-lisa auto --full-auto "implement login feature"   # 已弃用
```

它会创建一个双面板 tmux 会话，并使用 bash watcher 触发回合切换。该模式需要 tmux，仅支持 macOS / Linux。

### Checkpoint 系统（legacy tmux 模式）

每 N 轮暂停一次，供人工审查（仅限 legacy tmux 模式）：

```bash
export RL_CHECKPOINT_ROUNDS=5
ralph-lisa auto "task"
```

在 Engine 模式下，可以使用 `--max-rounds` 控制轮数，或通过 MCP 的 `rll_pause` 手动暂停。

### Watcher 行为

- **即发即忘触发**，实现快速回合转换
- **30 秒冷却时间**，防止工作期间重复触发
- **崩溃自动重启**（会话保护）
- **心跳文件**位于 `.dual-agent/.watcher_heartbeat`，用于存活检查
- **可配置的日志阈值**：`RL_LOG_MAX_MB`（默认 5，最小 1）

## Tag 系统

每次提交的第一行都需要一个 tag：

| Ralph 的 Tag | Lisa 的 Tag | 共用 |
|--------------|-------------|------|
| `[PLAN]` | `[PASS]` | `[CHALLENGE]` |
| `[RESEARCH]` | `[NEEDS_WORK]` | `[DISCUSS]` |
| `[CODE]` | | `[QUESTION]` |
| `[FIX]` | | `[CONSENSUS]` |

### Tag 详解

- **`[PLAN]`**：第 1 轮必须使用。在编码前概述方案。
- **`[RESEARCH]`**：当涉及参考实现、协议或外部 API 时，编码前必须使用。必须包含经过验证的证据（file:line、命令输出）。
- **`[CODE]`**：代码实现。必须包含 Test Results 部分。
- **`[FIX]`**：基于反馈的错误修复或修订。必须包含 Test Results 部分。
- **`[PASS]`**：Lisa 批准提交。
- **`[NEEDS_WORK]`**：Lisa 要求修改。必须包含至少一个原因。
- **`[CHALLENGE]`**：不同意另一方 agent 的建议，提供反驳论点。
- **`[DISCUSS]`**：一般性讨论或澄清。
- **`[QUESTION]`**：请求澄清。
- **`[CONSENSUS]`**：确认同意，关闭当前议题。

## 提交规则

### 第 1 轮必须是 [PLAN]

Ralph 的第一次提交必须是 `[PLAN]`。这让 Lisa 有机会在编写任何代码之前验证对任务的理解。

### 必须包含 Test Results

`[CODE]` 和 `[FIX]` 提交必须包含 Test Results 部分：

```markdown
### Test Results
- Test command: npm test
- Result: 150/150 passed
- New tests: 2 added (auth.test.ts, login.test.ts)
```

### 编码前先研究

当任务涉及参考实现、协议或外部 API 时，先提交 `[RESEARCH]` 并附带经过验证的证据：

```markdown
[RESEARCH] API integration research

- Endpoint: POST /api/v2/auth (docs:line 45)
- Auth: Bearer token in header (verified via curl)
- Response: { token, expires_in } (tested locally)
```

### 禁止无说明的接受

当回应 `[NEEDS_WORK]` 时：
- **如果你同意**：解释为什么 Lisa 是对的，然后提交 `[FIX]`
- **如果你不同意**：使用 `[CHALLENGE]` 提供反驳论点
- **绝不**提交没有说明的 `[FIX]`

## Consensus 协议

Lisa 的裁定是**建议性的，而非权威性的**。Ralph 可以接受、质疑或请求澄清。

双方必须明确提交 `[CONSENSUS]` 后才能进入下一步。流程如下：

1. Lisa 提交 `[PASS]`（如果 Ralph 同意则可关闭）
2. Ralph 提交 `[CONSENSUS]` — 议题关闭

### Deadlock 逃逸

5 轮内未达成 consensus 时：
- **`[OVERRIDE]`**：在记录分歧的情况下继续推进
- **`[HANDOFF]`**：升级为人工决策

不会出现无限循环。不会出现卡死状态。

## Policy 层

Policy 层验证提交质量。

### 内联检查

在 `submit-ralph` / `submit-lisa` 时自动应用：

```bash
# 警告模式（默认）— 打印警告，不阻止提交
export RL_POLICY_MODE=warn

# 阻止模式 — 拒绝不合规的提交
export RL_POLICY_MODE=block

# 禁用
export RL_POLICY_MODE=off
```

### 独立检查

用于脚本和 hooks — 无论 `RL_POLICY_MODE` 设置如何，违规时始终以非零退出码退出：

```bash
ralph-lisa policy check ralph           # 检查 Ralph 的最新提交
ralph-lisa policy check lisa            # 检查 Lisa 的最新提交
ralph-lisa policy check-consensus       # 双方是否都提交了 [CONSENSUS]？
ralph-lisa policy check-next-step       # 综合检查：consensus + 所有 policy 检查
```

### Policy 规则

- Ralph 的 `[CODE]`/`[FIX]` 必须包含 "Test Results" 部分
- Ralph 的 `[RESEARCH]` 必须有实质性内容
- Lisa 的 `[PASS]`/`[NEEDS_WORK]` 必须包含至少 1 个原因

## 会话中途控制

### 更新任务方向

无需重启即可改变方向：

```bash
ralph-lisa update-task "switch to REST instead of GraphQL"
```

追加内容到 task.md（保留历史记录）。任务上下文会自动注入到提交内容和 watcher 触发消息中。

### 进入新阶段

达成 consensus 后，进入新阶段：

```bash
ralph-lisa step "phase-2"              # 需要 consensus
ralph-lisa step --force "phase-2"      # 跳过 consensus 检查
```

### 强制切换回合

用于卡死状态的手动 override：

```bash
ralph-lisa force-turn ralph
ralph-lisa force-turn lisa
```

### 归档与清理

```bash
ralph-lisa archive [name]              # 归档当前会话
ralph-lisa clean                       # 清理会话状态
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RL_POLICY_MODE` | `warn` | Policy 检查模式：`off`、`warn`、`block` |
| `RL_CHECKPOINT_ROUNDS` | `0`（禁用） | 自动模式下每 N 轮暂停以进行人工审查 |
| `RL_LOG_MAX_MB` | `5` | 面板日志截断阈值，单位 MB（最小 1） |

## 提示与最佳实践

### Git 纪律

小提交、清晰的信息、频繁提交。当出问题时（一定会出问题的），你唯一的安全网是能够 `git reset` 到已知的良好状态。

### Agent 崩溃

Agent 崩溃目前尚无自动恢复机制。如果一个 agent 崩溃（可能由于上下文过长或系统资源耗尽），你必须手动重启。请监控 tmux 会话并根据需要重启。

### 上下文管理

长时间的会话会填满上下文窗口。使用 `ralph-lisa step` 将大型任务分解为多个步骤。保持每个任务的专注性，并使用 `update-task` 来重新定向，而非从头开始。

### 何时使用 RLL

**适合的场景**：多步骤实现、架构决策、影响用户/安全的代码、需求不明确的情况。

**过于大材小用**：单行修复、经过充分测试的重构、个人脚本、紧急热修复。

### 人类仲裁者

两个 AI 会愉快地就一个糟糕的设计达成一致。Ralph-Lisa Loop 是结构化的 AI 辅助开发，而非自主开发。人类仲裁者不是可选的。
