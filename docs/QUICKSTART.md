# Ralph-Lisa Quick Start

> [中文](#中文) | [English](#english)

---

## 中文

4 种启动模式，按习惯选一种。所有项目先 `cd <project> && ralph-lisa init`（一次性）。

### 模式 A：经典（tmux / iTerm2 自动开窗）

最简单。

```sh
cd <project>
ralph-lisa start "task description"
```

- Mac：自动开 iTerm2，左右两 pane 跑 ralph + lisa
- Linux：自动起 tmux session（要 `apt install tmux`）

**默认选 A**。

### 模式 B：Daemon + iTerm2 split（不依赖 tmux）

适合不想装 tmux / 用非默认终端 / 跑多个 ralph-lisa session。

```sh
# Tab 1：daemon 前台保持
cli-pty-daemon start

# Tab 2：spawn agents
cd <project>
ralph-lisa start --daemon "task"
cli-pty-daemon attach ralph

# Tab 3
cli-pty-daemon attach lisa
```

iTerm2 split 一窗口里跑：Tab 2 跑完 `start --daemon` → `Cmd+D` 垂直 split → 左 `attach ralph` / 右 `attach lisa`。

清理：Tab 1 `Ctrl-C` 或 `cli-pty-daemon stop`。

### 模式 C：Engine 模式（推荐，原生跨平台）

不依赖 tmux 任何东西，**Windows / Mac / Linux 都行**。

```sh
ralph-lisa auto --engine --task "task" --auto-approve
```

Windows Terminal 用户：加 `--ui wt` 开专用双 pane（不在 WT 内会回退 split）。

### 模式 D：Daemon + VSCode/Cursor/Trae 扩展

天天在 IDE 写代码 + 想一窗口看双 pane。

```sh
# 一次性装扩展
cd super-rll/cli-pty-daemon-vscode
npm install && npm run build && npm run package
code --install-extension cli-pty-daemon-vscode-0.1.0-alpha.vsix

# 用
cli-pty-daemon start                    # Tab 1（终端）
cd <project> && ralph-lisa start --daemon "task"   # Tab 2
# VSCode: Cmd+Shift+P → "RLL: Open Ralph" / "RLL: Open Lisa"
```

### 任务类型 fast-path（v0.9.13+）

写代码默认走完整 TDD。**非代码任务**用 `--type` 跳礼仪：

```sh
ralph-lisa next-step "implement-x" --type code-task     # 默认（写代码）
ralph-lisa next-step "review-y"    --type review-task   # 跳 TDD，只能改 docs/**
ralph-lisa next-step "fix-readme"  --type doc-task      # 改文档
ralph-lisa next-step "update-rll-plan" --type process-task   # 改 .rll/** / CLAUDE.md
```

详见 [`non-coding-task-quickstart.md`](./non-coding-task-quickstart.md)。

### 简单任务 mode fast-path（v0.9.14+）

`--type` 是"做什么"; `--mode` 是"多严格"。简单任务用 `--mode simple` 跳礼仪:

```sh
# 简单 (efficiency-first) — 跳 §128/§122/§102/§123/§134 礼仪
ralph-lisa next-step "fix-typo" --mode simple --user-signature "trivial-2026-05-26-simple-go"

# 不写 --mode → Ralph 自动 grill 问 A/B/C 模式 (skill auto-fire)
ralph-lisa next-step "add-feature"
```

`--user-signature` 强制 ≥10 字符 + audit 关键词 (simple/efficiency-first/trivial 等) 或 ISO 日期。详见 `docs/211-task-intake-skill-design.md`。

### 常用命令（任何模式都一样）

```sh
ralph-lisa whose-turn                # 当前轮到谁
ralph-lisa status                    # 一行完整状态
ralph-lisa read review.md            # 读 Lisa 最新反馈
ralph-lisa submit-ralph --file f.md  # Ralph 提交
ralph-lisa wecom-feedback unread     # 看用户从微信发的反馈
ralph-lisa wecom-push --body "msg"   # 推消息回微信
ralph-lisa quality-gate              # 全套门禁
ralph-lisa doctor                    # 健康检查
```

### 第一次报错 → 怎么修

| 错误 | 修 |
|---|---|
| `Not initialized. Run 'ralph-lisa init' first.` | `cd <project> && ralph-lisa init` |
| `'claude' command not found` | 装 Claude Code (`npm i -g @anthropic-ai/claude-code`) |
| `'codex' command not found` | 装 Codex CLI (`npm i -g @openai/codex`) |
| `'cli-pty-daemon' command not found`（B/D） | `cd super-rll/cli-pty-daemon && npm link` |
| `cli-pty-daemon not running` | Tab 1 跑 `cli-pty-daemon start` |
| `Submission BLOCKED by policy: ...` | 看 [`zh-CN/faq.md`](./zh-CN/faq.md) "提交被 block 怎么办" 段 |

### 停止 / 清理

| 模式 | 停 | 完全清理 |
|---|---|---|
| A 经典 | iTerm 关 tab / tmux session | `ralph-lisa stop` |
| B daemon+iTerm | Ctrl-C；daemon 复用 | `cli-pty-daemon stop` |
| C engine | Ctrl-C | `ralph-lisa stop` |
| D daemon+VSCode | VSCode 关 terminal pane | `cli-pty-daemon stop` |

`ralph-lisa stop --force` 强杀；`--no-archive` 不归档。

### 详细文档

- [`zh-CN/guide.md`](./zh-CN/guide.md) — 完整用户指南
- [`zh-CN/testing.md`](./zh-CN/testing.md) — 怎么写测试 + 跑测试 + 破门禁
- [`zh-CN/faq.md`](./zh-CN/faq.md) — 常见问题
- [`zh-CN/reference.md`](./zh-CN/reference.md) — 108 个 cli 子命令参考
- [`zh-CN/maintainer-handoff.md`](./zh-CN/maintainer-handoff.md) — 接手项目维护
- [`zh-CN/test-harness-and-gates.md`](./zh-CN/test-harness-and-gates.md) — 门禁原理深度篇

---

## English

4 startup modes. Pick by preference. All projects first `cd <project> && ralph-lisa init` (one-time).

### Mode A: Classic (tmux / iTerm2 auto-spawn)

Simplest.

```sh
cd <project>
ralph-lisa start "task description"
```

- Mac: auto-spawn iTerm2, left/right pane = ralph / lisa
- Linux: auto-start tmux session (needs `apt install tmux`)

**Default A**.

### Mode B: Daemon + iTerm2 split (no tmux)

For: don't want tmux / non-default terminal / multiple sessions.

```sh
# Tab 1: daemon
cli-pty-daemon start

# Tab 2: spawn agents
cd <project>
ralph-lisa start --daemon "task"
cli-pty-daemon attach ralph

# Tab 3
cli-pty-daemon attach lisa
```

iTerm2 single-window split: after Tab 2 → `Cmd+D` → left `attach ralph` / right `attach lisa`.

Cleanup: Tab 1 `Ctrl-C` or `cli-pty-daemon stop`.

### Mode C: Engine mode (recommended, cross-platform)

No tmux dependency. **Windows / Mac / Linux all work**.

```sh
ralph-lisa auto --engine --task "task" --auto-approve
```

Windows Terminal users: add `--ui wt` for dedicated dual-pane (falls back to split if not in WT).

### Mode D: Daemon + VSCode/Cursor/Trae extension

For IDE-centric workflow + want both panes in one window.

```sh
# Install extension once
cd super-rll/cli-pty-daemon-vscode
npm install && npm run build && npm run package
code --install-extension cli-pty-daemon-vscode-0.1.0-alpha.vsix

# Use
cli-pty-daemon start                    # Tab 1
cd <project> && ralph-lisa start --daemon "task"   # Tab 2
# VSCode: Cmd+Shift+P → "RLL: Open Ralph" / "RLL: Open Lisa"
```

### Task type fast-path (v0.9.13+)

Code work follows full TDD by default. **Non-code work** skips the ceremony via `--type`:

```sh
ralph-lisa next-step "implement-x" --type code-task     # default (writes code)
ralph-lisa next-step "review-y"    --type review-task   # skip TDD; writes only docs/**
ralph-lisa next-step "fix-readme"  --type doc-task      # docs
ralph-lisa next-step "update-rll-plan" --type process-task   # .rll/**, CLAUDE.md
```

See [`non-coding-task-quickstart.md`](./non-coding-task-quickstart.md).

### Simple-task mode fast-path (v0.9.14+)

`--type` says "what"; `--mode` says "how strict". For trivial tasks, use `--mode simple` to skip the ceremony:

```sh
# Simple (efficiency-first) — skip §128/§122/§102/§123/§134 ceremony
ralph-lisa next-step "fix-typo" --mode simple --user-signature "trivial-2026-05-26-simple-go"

# Omit --mode → Ralph auto-grill asks A/B/C mode (skill auto-fire)
ralph-lisa next-step "add-feature"
```

`--user-signature` must be ≥10 chars + audit keyword (simple/efficiency-first/trivial etc.) or ISO date. See `docs/211-task-intake-skill-design.md`.

### Common commands

```sh
ralph-lisa whose-turn                # whose turn now
ralph-lisa status                    # one-line full status
ralph-lisa read review.md            # read Lisa's latest review
ralph-lisa submit-ralph --file f.md  # Ralph submits
ralph-lisa wecom-feedback unread     # read user WeCom messages
ralph-lisa wecom-push --body "msg"   # push reply to WeCom
ralph-lisa quality-gate              # full quality gate
ralph-lisa doctor                    # health check
```

### First-time errors

| Error | Fix |
|---|---|
| `Not initialized. Run 'ralph-lisa init' first.` | `cd <project> && ralph-lisa init` |
| `'claude' command not found` | install Claude Code (`npm i -g @anthropic-ai/claude-code`) |
| `'codex' command not found` | install Codex CLI (`npm i -g @openai/codex`) |
| `'cli-pty-daemon' command not found` (B/D) | `cd super-rll/cli-pty-daemon && npm link` |
| `cli-pty-daemon not running` | Tab 1 run `cli-pty-daemon start` |
| `Submission BLOCKED by policy: ...` | see [`en/faq.md`](./en/faq.md) "Submission blocked" section |

### Stop / cleanup

| Mode | Stop | Full cleanup |
|---|---|---|
| A classic | iTerm close tab / tmux session | `ralph-lisa stop` |
| B daemon+iTerm | Ctrl-C; daemon reusable | `cli-pty-daemon stop` |
| C engine | Ctrl-C | `ralph-lisa stop` |
| D daemon+VSCode | close terminal pane in VSCode | `cli-pty-daemon stop` |

`ralph-lisa stop --force` to hard-kill; `--no-archive` to skip archive.

### Deeper docs

- [`en/guide.md`](./en/guide.md) — full user guide
- [`en/testing.md`](./en/testing.md) — how to write tests + run + clear gates
- [`en/faq.md`](./en/faq.md) — FAQ
- [`en/reference.md`](./en/reference.md) — 108-command CLI reference
- [`en/maintainer-handoff.md`](./en/maintainer-handoff.md) — handing off the project
- [`en/test-harness-and-gates.md`](./en/test-harness-and-gates.md) — deep dive on the gate machinery
