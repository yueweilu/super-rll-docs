# Cross-Platform Terminal Backend Matrix

**Status**: Working draft, locked 2026-05-05 (`trustcoding-comprehensive-plan` mutual CONSENSUS).

Trustcoding 的 RLL 胞核（`cli/`）支持多 terminal backend，通过 `WatcherBackend` 接口插拔。每个 backend 是一个 `cli/src/ui/` 文件 + 必要的 transport 适配。下面是评估矩阵 + 推荐顺序。

---

## 当前架构（2026-04-13 `rll-cli-full-platform-plan` 已 CONSENSUS-locked）

```
cli/
├── src/
│   ├── engine/                    # TurnCoordinator + RllSession + bootstrap
│   ├── transport/                 # 5 transport adapters (ACP / stream-json / Codex MCP)
│   ├── mcp/                       # RLL MCP server (let others drive)
│   └── ui/                        # 5 已 ship UI backends
│       ├── TmuxUI.ts
│       ├── SplitUI.ts
│       ├── WtUI.ts
│       ├── QuietUI.ts
│       └── JsonUI.ts
```

**关键设计**：transport（agent IPC 协议）跟 UI（人看的展示）完全解耦。换 UI 不影响 transport。

---

## 评估矩阵

| Backend | 状态 | macOS | Linux | Win 原生 | 浏览器 | 安装 | UI 集成形态 | IPC 表面 | tmux 功能对应 |
|---|---|---|---|---|---|---|---|---|---|
| **TmuxUI** | ✅ ship | ✅ | ✅ | ❌ (WSL) | ❌ | brew tmux | tmux 自身 | tmux 协议（不 send-keys，仅展示）| 1:1（legacy） |
| **SplitUI** | ✅ ship | ✅ | ✅ | ✅ | ❌ | 0 | stdout 双栏（串行） | Node 内嵌 | 仅展示，无交互 |
| **WtUI** | ✅ ship | ❌ | ❌ | ✅ | ❌ | wt.exe（Win11 默认） | Windows Terminal tab | wt.exe spawn | spawn pane（OS 级） |
| **QuietUI** | ✅ ship | ✅ | ✅ | ✅ | ❌ | 0 | 状态行 stdout | Node 内嵌 | 无 |
| **JsonUI** | ✅ ship | ✅ | ✅ | ✅ | ✅ | 0 | NDJSON stdout | Node 内嵌 | 无（事件流）|
| **PtyUI**（node-pty + Pseudoterminal + daemon）| ❌ Lisa CONSENSUS-locked, 待 spike | ✅ | ✅ | ✅ ConPTY | future ws | npm + native binary 30-50MB | VS Code/Trae/Cursor 内嵌 | node-pty + IPC 到 daemon | `pty.spawn` ≈ tmux new-session, `pty.write` ≈ send-keys, `on('data')` ≈ pipe-pane |
| **WeztermUI**（Wezterm CLI）| ❌ 候选, 用户 2026-05-05 显式要求 | ✅ | ✅ | ✅ 原生 | ❌ | Wezterm 安装 | Wezterm 自身（独立窗口）| `wezterm cli` 通过 `WEZTERM_UNIX_SOCKET` | `send-text` ≈ send-keys, `get-text` ≈ pipe-pane, `split-pane` 一致, `spawn` 一致 — **1:1** |
| **ZellijUI**（备选） | ❌ | ✅ | ✅ | ✅ | ❌ | binary 安装 | Zellij 自身（独立窗口）| Zellij plugin (Wasm/Rust) | 类 tmux pane/session, plugin API |

---

## 已 ship Backend 局限实测

### TmuxUI
- ✅ 双 pane 视觉佳，开发者老用户体验流畅
- ❌ Windows 必须 WSL 才能用，对 Win 用户是真壁垒
- ❌ tmux 安装 + 配置有学习曲线

### SplitUI（`cli/src/ui/SplitUI.ts`）
- ✅ 0 安装，纯 Node stdout，跨平台
- ❌ 不是真"双 pane"，是单流交替输出
- ❌ 协作可视感弱（Ralph / Lisa 信息混在一起）
- ❌ 不能编辑 / 介入（看不到 Ralph prompt 的中间状态）

### WtUI（`cli/src/ui/WtUI.ts`）
- ✅ Windows 11 默认装 Windows Terminal，0 额外安装
- ✅ 双 pane 视觉好
- ❌ wt.exe 是 OS-level spawn，不能嵌进 IDE
- ❌ Mac/Linux 不可用

### QuietUI / JsonUI
- ✅ CI / 程序化消费场景完美
- ❌ 不给人看的（不是真 UI）

---

## 候选 Backend 详细评估

### PtyUI（node-pty + Pseudoterminal + 独立 daemon）

**架构**（per `rll-stack/.dual-agent/rll-vscode-proposal.md` Lisa CONSENSUS-locked）：

```
VS Code / Trae / Cursor Extension Host
└── UI thin client (Pseudoterminal API + StatusBar + Commands)
            ↑
            │ stdio / Unix socket / JSON-RPC
            ↓
独立 Node daemon（持久化进程）
├── PtyManager
│   ├── PTY #0 (ralph) → claude / ccl
│   └── PTY #1 (lisa) → codex / 其他
├── IdleDetector（数据 quiescence）
├── FileWatcher（turn.txt / .ready 信号）
└── 持久化 state / logs / crash recovery
```

**优点**：
- 真三平台原生（Mac / Linux / Windows ConPTY）
- 进 IDE 内嵌 —— 开发者不切窗口
- Pseudoterminal API 干净 —— 不 hack 终端
- daemon 跨 extension reload 持久 —— extension host 崩了 daemon 不丢
- 同时支持 cli standalone 跟 IDE 模式
- VS Code / Trae（VS Code fork）/ Cursor 都同 API

**缺点 / 风险**：
- 需要 5-gate spike 验证（S1 native loading matrix / S2 Pseudoterminal+daemon / S3 signal-first handoff / S4 fork API / S5 product boundary）
- node-pty native binary build matrix 复杂（win32-x64 / darwin-arm64 / linux-x64 / linux-arm64 / darwin-x64）
- IdleDetector false positive（agent 思考但不输出）→ 可能误判 turn switch
- ConPTY 跟真 PTY 行为差异（Windows 输出格式）
- daemon lifecycle 管理（启停 / pid file / orphan detection）
- 30-50MB extension size 增加

**估时**：5-gate spike 2-3 day → 实施 1-2 周

### WeztermUI（Wezterm CLI 集成）

**架构**：

```
ralph-lisa-loop (cli)
└── WeztermUI
    ├── 启动 Wezterm GUI（or 检测已运行）
    ├── 通过 WEZTERM_UNIX_SOCKET IPC
    │   ├── wezterm cli spawn → 起 Ralph / Lisa 进程
    │   ├── wezterm cli split-pane → 双 pane 布局
    │   ├── wezterm cli send-text → 注 "go" / hint
    │   └── wezterm cli get-text → 抓输出 / quiescence detection
    └── 监听 Wezterm pane events (Lua scripting)
```

**优点**：
- 三平台真原生（Mac / Linux / Windows，**不用 WSL**）
- Wezterm 自身 GPU 加速，视觉好
- IPC 表面 1:1 对应 tmux 我们用的能力（验证过）
- 项目活跃（8500+ commits）
- 集成简单（CLI subprocess + socket）—— 不需要写 native addon
- 给 Wezterm 老用户提供 first-class 体验

**缺点 / 风险**：
- 需要用户安装 Wezterm（不像 VS Code 那么普及，开发者覆盖率约 5-10%）
- Wezterm 进程跟 cli 进程 lifecycle 解耦 —— 一边死另一边可能漏感知
- 不嵌 IDE（独立窗口，开发者要切窗口）
- Wezterm Mux server 文档不完整（headless 模式不清晰）
- IPC 用 Unix socket（Windows 用 named pipe），跨平台 socket 库依赖

**估时**：1-2 周（subprocess 包装 + 最少 Lua 脚本 + 跨 OS 测试）

### ZellijUI（备选）

**优点**：
- tmux 真替代品，pane/session 模型 1:1 对齐
- Wasm plugin 系统（不需要重启）
- 三平台原生

**缺点**：
- 用户群最小（Zellij 用户 < Wezterm 用户）
- Wasm-only plugin 限制（只能跑 Wasm 不能跑 native binary）
- Mux server 跟 cli 进程模型也是解耦

**估时**：2-3 周

---

## 推荐顺序

按 **覆盖率 × 痛感 × 实施风险** 排：

### P0 — node-pty 5-gate spike（最高优先级）

理由：
- 用户群最大（任何用 VS Code / Trae / Cursor 的开发者，覆盖 80%+）
- Lisa 已经 CONSENSUS-locked spike 路径（`rll-stack/.dual-agent/rll-vscode-proposal.md`）
- 解决 Windows 真痛点（不用 WSL）
- 进 IDE 内嵌符合 trustcoding "在开发者已在的工具里" 的设计哲学

**前置**：5-gate spike 通过（2-3 day）  
**后置**：实施成 `cli/src/ui/PtyUI.ts` + 独立 daemon package + 最小 VS Code extension（也可复用 `rll-stack/extension/`）

### P1 — Wezterm CLI 集成（次优先级）

理由：
- 用户 2026-05-05 显式要求评估
- 集成代价低（subprocess + socket，无 native addon）
- IPC 表面 1:1 对应（不用重新设计 transport）
- 给独立终端用户（Vim / Emacs 党，不爱 VS Code）的逃生口

**前置**：P0 spike 完，了解 backend 接口契约后实施（避免重复设计）  
**后置**：`cli/src/ui/WeztermUI.ts` + 文档

### P2 — Zellij（备选，按需）

理由：
- 等真有 Zellij 用户反馈再做
- 现在做没足够价值

**前置**：P0 + P1 完之后看用户群有没有真 Zellij 诉求

### 维持 — TmuxUI / SplitUI / WtUI / QuietUI / JsonUI

理由：
- 已 ship，0 维护成本
- 各自覆盖独特场景（CI / 老 tmux 用户 / Windows / 程序化消费）

---

## Backend 跟 trustcoding 8-phase 关系

| Phase | Backend 涉及 |
|---|---|
| Phase 4 实现 | 跑哪个 backend 不影响 — Ralph 在哪 backend 写代码都行 |
| Phase 5 测试环境 | Backend 本身要在测试环境跑通（`PtyUI` 在 macOS / Linux / Windows 真测） |
| Phase 6 用户文档 | 文档要覆盖最常用 backend（推荐 P0 PtyUI） |
| Phase 7 生产部署 | server 侧不感知 backend；server 通过 worker docker 跑 cli `auto --engine` headless 模式 |

**重要**：trustcoding server-side（`rll-team-platform/server`）跑 worker container 时永远用 **headless engine 模式**（不需要 UI backend）。UI backend 是 cli **本地交互模式**专属。两条路径不耦合。

---

## 不在本评估范围内（parked）

- iTerm2 集成（Mac 独占，跨平台不达标）
- JetBrains 终端集成（Kotlin plugin 学习曲线 + JetBrains 用户群可优先用 PtyUI）
- Warp（不开源 + 已有 AI 功能可能冲突）
- Tabby（Electron 重 + 用户群小）

---

**最后更新**: 2026-05-05  
**版本**: v1.0  
**Lisa CONSENSUS-locked at**: `trustcoding-comprehensive-plan` sub-slice (`.rll/PLAN.md §23`)  
**关联**:
- `rll-stack/.dual-agent/rll-vscode-proposal.md` (PtyUI 详细架构 + 5-gate spike)
- `docs/rll-cli-full-platform-plan.md` (2026-04-13 锁定的现有 5 UI 架构)
- `docs/trustcoding-product-definition.md` (产品定义)
- `docs/trustcoding-project-lifecycle.md` (8-phase 模板)
