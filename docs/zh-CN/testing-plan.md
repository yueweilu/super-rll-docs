[English](../en/testing-plan.md) | [中文](../zh-CN/testing-plan.md)
<!-- Translated from: docs/en/testing-plan.md -->

# Ralph-Lisa Loop v0.4.0 — 完整测试计划

## 概述

本计划覆盖 v0.4.0 发布周期的所有功能：
- Fix A: TmuxUI file-tail 重写
- Fix B: Transport 调试日志
- Fix C: Codex 0.40+ 兼容（sandbox + UUID + threadId）
- Fix D: Transport → UI 直连流式传输
- P0: watch-lisa（持久连接监听器）
- P1: ralph-lisa review（无状态一次性审查）
- P2: Git post-commit hook
- P4: MCP 截断 + handoff 修复
- P5: 多 IDE 规则文件（Windsurf, Cline）
- P6: IDE 集成文档
- Layer 2: Ralph 模板中的阶段完成触发器

---

## 1. 先决条件

### Mac

```bash
node -v          # >= 18
git --version
claude --version # Claude Code CLI
codex --version  # Codex CLI
tmux -V          # 用于 --ui tmux 测试
```

### Windows

```powershell
node -v          # >= 18
git --version
claude --version
codex --version
echo $env:WT_SESSION  # 如果在 Windows Terminal 中运行则为非空
```

---

## 2. 自动化测试（首先运行）

```bash
cd cli
npm run build
npm test
```

**期望结果**: 627/627 通过, 0 失败

---

## 3. Init / Uninit（全平台）

### 3.1 Init 创建所有 IDE 文件

```bash
mkdir /tmp/rll-test-init && cd /tmp/rll-test-init && git init
ralph-lisa init    # 或: node <path>/cli/dist/cli.js init
```

**验证**:
- [ ] `CLAUDE.md` 存在，包含 `RALPH-LISA-LOOP` 标记
- [ ] `.cursorrules` 存在，包含标记
- [ ] `.windsurfrules` 存在，包含标记
- [ ] `.clinerules` 存在，包含标记
- [ ] `.github/copilot-instructions.md` 存在，包含标记
- [ ] `CODEX.md` 存在，包含标记
- [ ] `.git/hooks/post-commit` 存在，包含 `ralph-lisa review`
- [ ] `.dual-agent/` 目录存在，包含 turn.txt、round.txt、step.txt
- [ ] 控制台显示所有已创建文件 + 使用说明（IDE / CLI / one-shot）

### 3.2 模板中的阶段完成触发器

```bash
grep "When to Submit" CLAUDE.md
grep "Phase Completion Triggers" .cursorrules
```

**验证**:
- [ ] 两个文件都包含强制触发器表（PLAN/CODE/FIX/commit/CONSENSUS）
- [ ] 两个文件都提到了 `auto-review.md` advisory channel

### 3.3 重复 init 是幂等的

```bash
ralph-lisa init   # 再次运行
```

**验证**:
- [ ] 控制台显示 "Updating" 而非 "Creating"（针对已存在文件）
- [ ] 文件内容为最新（最新模板）
- [ ] 无重复标记块

### 3.4 Uninit 清理全部内容

```bash
ralph-lisa uninit
```

**验证**:
- [ ] `CLAUDE.md` 已删除（或已清理，如果之前有已有内容）
- [ ] `.cursorrules` 已删除
- [ ] `.windsurfrules` 已删除
- [ ] `.clinerules` 已删除
- [ ] `.github/copilot-instructions.md` 已删除
- [ ] `CODEX.md` 已删除
- [ ] `.git/hooks/post-commit` 已删除
- [ ] `.dual-agent/` 已删除
- [ ] `.claude/` 已清理
- [ ] `.codex/` 已清理

---

## 4. Engine 模式 — Quiet（Mac + Windows）

### 4.1 Ralph=Claude, Lisa=Codex

```bash
mkdir /tmp/rll-test-quiet && cd /tmp/rll-test-quiet && git init
ralph-lisa auto --engine --ralph-backend claude --lisa-backend codex \
  --task "say hello and exit" --max-rounds 3 --auto-approve --debug --ui quiet
```

**验证**:
- [ ] Ralph 已连接，Lisa 已连接
- [ ] Round 1: Ralph [PLAN]，Lisa 以标签（[NEEDS_WORK] 或 [PASS]）响应
- [ ] Round 2+: Ralph 响应，Lisa 响应
- [ ] 无 `invalid type: boolean false` 错误（Fix C v1）
- [ ] 无 `Failed to parse thread_id` 错误（Fix C v1）
- [ ] 无 `Session not found` 错误（Fix C follow-up）
- [ ] 调试日志创建在 `.dual-agent/debug/` 中：
  - [ ] `coordinator.log` 有 prompt_sent/prompt_response 事件
  - [ ] `ralph-raw-io.log` 有 spawn/stdin_raw/stdout_raw/exit 事件
  - [ ] `lisa-raw-io.log` 有 spawn/stdin_raw/stdout_raw/exit + `thread_id_adopted` 事件
- [ ] 以 max-rounds 或 consensus 退出（非崩溃）

### 4.2 Windows 特定检查

- [ ] 从本地驱动器（D:\）运行，而非 SMB 共享（Z:）— 避免 EBADF
- [ ] DEP0190 警告出现但不影响功能
- [ ] `.dual-agent/debug/*.log` 文件非空

---

## 5. Engine 模式 — tmux（仅 Mac）

```bash
mkdir /tmp/rll-test-tmux && cd /tmp/rll-test-tmux && git init
ralph-lisa auto --engine --ralph-backend claude --lisa-backend codex \
  --task "say hello" --max-rounds 3 --auto-approve --ui tmux
```

然后在另一个终端中：`tmux attach -t rll-engine`

**验证**:
- [ ] tmux session 已创建，attach 可用
- [ ] 左窗格：Ralph 的**完整提交文本**实时流式传输（不仅是 `─── [TAG] Round N ───` 分隔线）
- [ ] 右窗格：Lisa 的**完整审查文本**实时流式传输
- [ ] 窗格中无 `zsh: command not found` 错误（Fix A）
- [ ] 状态栏显示 `Round N | turn | step | status`
- [ ] 提交中的特殊字符正确渲染（[CODE], $HOME, backticks）

---

## 6. Engine 模式 — wt（仅 Windows）

必须在 Windows Terminal 中运行：

```powershell
mkdir D:\temp\rll-test-wt; cd D:\temp\rll-test-wt; git init
node <path>\cli\dist\cli.js auto --engine --ralph-backend claude --lisa-backend codex `
  --task "say hello" --max-rounds 3 --auto-approve --ui wt
```

**验证**:
- [ ] Windows Terminal 打开新标签页，包含两个窗格
- [ ] 左窗格：Ralph 输出流式传输（无乱码 — UTF-8 修复）
- [ ] 右窗格：Lisa 输出流式传输
- [ ] 无 PowerShell `;` 解析错误（script-file 修复）
- [ ] 回退：在 WT 外运行时显示警告并回退到 split 模式

---

## 7. run-lisa（单轮）

```bash
cd /tmp/rll-test-init   # 已完成 init 的项目
ralph-lisa init
# 作为 Ralph 提交一些工作
echo "[PLAN] Test plan for hello world" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
# 现在运行 Lisa
ralph-lisa run-lisa --lisa-backend codex --auto-approve
```

**验证**:
- [ ] Lisa 连接并向 stdout 返回审查结果
- [ ] 审查包含标签（[PASS] 或 [NEEDS_WORK]）
- [ ] `.dual-agent/review.md` 已更新
- [ ] `turn.txt` 翻回 `ralph`

---

## 8. watch-lisa（持久监听器）

### 终端 1:

```bash
cd /tmp/rll-test-init
ralph-lisa watch-lisa --lisa-backend codex --auto-approve
```

**验证**:
- [ ] 控制台显示 "Lisa connected — watching for Ralph's submissions"
- [ ] 进程保持存活（不退出）

### 终端 2:

```bash
cd /tmp/rll-test-init
echo "[PLAN] Watch test plan" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

**在终端 1 中验证**:
- [ ] 监听器检测到回合变更: `📥 Ralph [PLAN] Round N — sending to Lisa...`
- [ ] Lisa 响应: `📤 Lisa [NEEDS_WORK/PASS] Round N — review written`
- [ ] 监听器继续监听（不退出）

### Round 2（同一终端 2）:

```bash
echo "[FIX] Addressing Lisa's feedback" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

**验证**:
- [ ] 监听器自动再次接收
- [ ] Lisa 拥有来自 Round 1 的上下文（持久连接 — 会提到之前的审查内容）

### 错误恢复:

- [ ] 在终端 1 中 Ctrl+C: "Stopping Lisa watcher... Lisa disconnected." 干净退出
- [ ] 如果 Lisa transport 错误：监听器记录错误但继续运行（不崩溃）

---

## 9. review（无状态一次性审查）

### 9.1 有变更时

```bash
cd /tmp/rll-test-init
echo "console.log('hello')" > hello.js
git add hello.js
ralph-lisa review --auto-approve --lisa-backend codex
```

**验证**:
- [ ] 审查输出显示在 stdout 上
- [ ] 包含 [PASS] 或 [NEEDS_WORK] 标签
- [ ] 引用了实际文件变更

### 9.2 使用 --scope

```bash
echo "test" > src/test.js
git add src/test.js
ralph-lisa review --auto-approve --scope "src/"
```

**验证**:
- [ ] 审查仅覆盖 `src/` 变更
- [ ] 如果 `src/` 没有变更，不会回退到 unscoped diff（改为报告错误）

### 9.3 无变更

```bash
git stash  # 清除所有变更
ralph-lisa review --auto-approve
```

**验证**:
- [ ] 错误信息: "no changes found"
- [ ] 退出码非零

### 9.4 安全性：scope 注入

```bash
ralph-lisa review --scope '$(echo pwned)'
```

**验证**:
- [ ] 无 shell 命令执行（execFileSync 防止注入）
- [ ] 要么审查匹配字面路径的文件，要么报告无变更

---

## 10. Git Post-Commit Hook

```bash
cd /tmp/rll-test-init
ralph-lisa init
echo "test" > hooktest.txt
git add hooktest.txt
git commit -m "test hook"
```

**验证**:
- [ ] 控制台显示 `[ralph-lisa] Post-commit: triggering Lisa review...`
- [ ] 约 30-60 秒后，`.dual-agent/auto-review.md` 包含审查内容
- [ ] 审查不会显示在终端 stdout 上（重定向到文件）

---

## 11. MCP Server

```bash
ralph-lisa mcp-server
```

通过 stdin 发送 JSON-RPC：
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
```

**验证**:
- [ ] 服务器响应有效的 initialize 结果
- [ ] `rll_lisa_review` 返回完整审查（不截断到 500 字符 — P4 修复）
- [ ] `rll_handoff` 返回 `final_work` 和 `final_review` 字段（P4 修复）

---

## 12. 调试日志（--debug）

运行任何带 `--debug` 的 engine 命令：

```bash
ralph-lisa auto --engine --task "test" --max-rounds 2 --auto-approve --debug --ui quiet
```

**验证**:
- [ ] 控制台显示 `🔎 Debug logging enabled → <path>/debug/`
- [ ] `coordinator.log`: NDJSON with prompt_sent, prompt_response, resend_attempt（如有）
- [ ] `ralph-raw-io.log`: spawn, stdin_raw（完整内容，无截断）, stdout_raw, exit
- [ ] `lisa-raw-io.log`: 同上 + thread_id_adopted 事件
- [ ] 原始内容不被截断（transport 日志中无 `...truncated N chars`）
- [ ] Coordinator 预览确实被截断（promptPreview, outputPreview — 预期行为）

---

## 13. 跨平台路径处理

### Mac/Linux
- [ ] 所有路径使用 `/` 分隔符
- [ ] 使用 `os.tmpdir()`（非硬编码 `/tmp`）

### Windows
- [ ] 路径支持 `\` 分隔符
- [ ] 本地驱动器无 EBADF 错误
- [ ] SMB 驱动器（Z:）可用于代码但不用于状态文件（已知限制，已文档化）

---

## 14. 文档验证

```bash
# 检查三种语言都有 IDE Integration 章节
grep "IDE Integration" docs/en/guide.md
grep "IDE 集成" docs/zh-CN/guide.md
grep "IDE 連携" docs/ja/guide.md
```

**验证**:
- [ ] 三语都包含：快速入门、工作原理、一次性审查、模式概览表
- [ ] FAQ 提到 Win10 22H2 支持
- [ ] FAQ 描述了 WT_SESSION 对 --ui wt 的要求
- [ ] FAQ 提到 Git 是推荐但非必需

---

## 测试结果汇总

| # | 测试区域 | Mac | Windows | 通过/失败 |
|---|---------|-----|---------|----------|
| 2 | 自动化测试 (627) | | | |
| 3 | Init / Uninit | | | |
| 4 | Engine quiet | | | |
| 5 | Engine tmux | | N/A | |
| 6 | Engine wt | N/A | | |
| 7 | run-lisa | | | |
| 8 | watch-lisa | | | |
| 9 | review one-shot | | | |
| 10 | Git hook | | | |
| 11 | MCP server | | | |
| 12 | 调试日志 | | | |
| 13 | 跨平台路径 | | | |
| 14 | 文档 | | | |
