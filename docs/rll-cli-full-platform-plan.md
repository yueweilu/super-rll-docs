# RLL CLI 全平台改造方案

**Status**: Lisa reviewed, consensus reached (2026-04-13)
**Source**: Ralph-Lisa Loop discussion, steps: turn-coordinator-extraction-analysis → rll-cli-first-strategy → route-comparison-test → rll-cli-full-platform-plan

---

## 一、背景与已确认事实

经过多轮讨论与实测，以下结论已达成共识：

1. **`claude --experimental-acp` 不存在**（CLI v2.1.104，exit code 1: "unknown option"）
2. Claude 程序化接口只有两条：
   - **ACP bridge**（`npx @zed-industries/claude-code-acp`）— 依赖 `@anthropic-ai/claude-agent-sdk`，有完整 ACP 协议（session lifecycle + permission callback + finish 事件），但缺 Agent/ToolSearch 工具
   - **CLI stream-json**（`claude -p --input-format stream-json --output-format stream-json`）— 完整工具集（含 Agent），但无 per-request 权限回调，只有进程级 `--dangerously-skip-permissions`
3. Codex 不走 ACP，走 MCP（`codex mcp-server`，`CODEX_NO_INTERACTIVE=1`）
4. 其他 ACP agent（Qwen/Goose/Auggie 等）走各自的 acpArgs（`--acp` / `acp` 子命令等）
5. 当前 CLI auto mode 的 Windows 阻塞来自 tmux/fswatch/bash 依赖
6. tmux 的 transport 角色（send-keys）应被 TurnCoordinator + 程序化 transport 替代，tmux 降级为纯 UI 展示层
7. PM 角色可封装为 RLL-MCP server，让任何 MCP client 调用

### 用户调研发现

- 大部分开发者偏好 IDE，用 Claude Code 也通过 IDE 连接
- Windows 开发者占比较高
- Margay ACP 模式能力落后于 RLL CLI（归因待进一步验证）
- 需求场景：CLI 跨平台 / Margay 接入 CLI / RLL 作为 skill 被其他 agent 调用

## 二、改造目标

| 目标 | 当前状态 | 改造后 |
|------|---------|--------|
| Windows auto mode | ❌ 不支持 | ✅ 零外部依赖 |
| Transport 可靠性 | ❌ send-keys 猜测 | ✅ request-response |
| 被其他 agent/IDE 调用 | ❌ | ✅ MCP server |
| IDE 做 Ralph + CLI 做 Lisa | ❌ | ✅ `rll_submit` / `rll_lisa_review` |
| Margay 接入 | 需要内部 TurnCoordinator | ✅ 调用 CLI MCP |
| 多 agent 引擎 | Claude + Codex only | ✅ Claude/Codex/Qwen/Goose/... |

## 三、架构设计

### 3.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Consumers（消费方）                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐ │
│  │ CLI 命令  │  │ Margay   │  │ IDE/Cursor │  │ Other     │ │
│  │ ralph-lisa│  │ (MCP     │  │ (MCP      │  │ Agent     │ │
│  │ auto/etc  │  │  client) │  │  client)  │  │ (MCP)     │ │
│  └─────┬─────┘  └─────┬────┘  └─────┬─────┘  └─────┬─────┘ │
│        │              │              │              │        │
├────────┼──────────────┼──────────────┼──────────────┼────────┤
│  Layer 3: RLL-MCP Server（对外接口）                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Tools:                                                │   │
│  │   rll_launch(task, config) → session_id               │   │
│  │   rll_status(session_id) → turn/round/step/deadlock   │   │
│  │   rll_submit(session_id, role, content) → ack         │   │
│  │   rll_lisa_review(content) → review result            │   │
│  │   rll_pause / rll_resume / rll_override               │   │
│  │   rll_handoff(task) → final result (blocking)         │   │
│  │                                                        │   │
│  │ Resources:                                             │   │
│  │   rll://session/{id}/history                           │   │
│  │   rll://session/{id}/work                              │   │
│  │   rll://session/{id}/review                            │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           │                                   │
├───────────────────────────┼───────────────────────────────────┤
│  Layer 2: TurnCoordinator（状态机引擎）                        │
│  ┌────────────────────────┴─────────────────────────────┐   │
│  │ - turn / round / step 流转                            │   │
│  │ - Tag 解析 + Policy 检查（复用现有 policy.ts）          │   │
│  │ - 死锁检测 + 超时升级（L0-L3，从 Margay 移植）         │   │
│  │ - 共识检测 + 步骤推进                                  │   │
│  │ - 首条消息 bootstrap + rule capsule reinjection        │   │
│  │ - 事件发射（state_changed / submission / deadlock）     │   │
│  │ - 会话持久化（文件，兼容现有 .dual-agent/ 结构）        │   │
│  └──────────┬───────────────────────────┬───────────────┘   │
│             │                           │                     │
├─────────────┼───────────────────────────┼─────────────────────┤
│  Layer 1: Transport Adapters（多 transport 适配）             │
│  ┌──────────┴───────┐  ┌───────────────┴──────────────┐     │
│  │ Claude Transport  │  │ Generic ACP Transport        │     │
│  │                   │  │                              │     │
│  │ 路线 B: ACP bridge│  │ Qwen: <cli> --acp           │     │
│  │  npx claude-code  │  │ Goose: goose acp             │     │
│  │  -acp             │  │ Auggie: auggie --acp         │     │
│  │                   │  │ ...                          │     │
│  │ 路线 C: stream-   │  ├──────────────────────────────│     │
│  │  json (Phase 2)   │  │ Codex Transport (MCP)        │     │
│  │  claude -p         │  │  codex mcp-server            │     │
│  │  --input-format   │  │  CODEX_NO_INTERACTIVE=1      │     │
│  │  stream-json      │  │                              │     │
│  └───────────────────┘  └──────────────────────────────┘     │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  Layer 0: 状态持久化（兼容现有 .dual-agent/）                   │
│  turn.txt, round.txt, step.txt, history.md, work.md,          │
│  review.md, task.md, needs_work_count.txt, ...                │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 Transport Adapter 接口

```typescript
interface TransportAdapter {
  /** 连接并初始化 agent */
  connect(config: AgentConfig): Promise<void>;
  /** 发送消息，等待 agent 完成，返回完整输出 */
  sendPrompt(content: string): Promise<{ output: string; usage?: TokenUsage }>;
  /** 注册完成回调（agent 输出一个完整 turn） */
  onFinish(callback: (output: string) => void): void;
  /** 注册权限请求回调 */
  onPermissionRequest?(callback: (req: PermissionRequest) => Promise<string>): void;
  /** 断开连接 */
  disconnect(): Promise<void>;
  /** 是否存活 */
  isAlive(): boolean;
}
```

四种实现：
1. **AcpBridgeTransport** — `npx @zed-industries/claude-code-acp`（Claude via ACP bridge）
2. **StreamJsonTransport** — `claude -p --input-format stream-json --output-format stream-json`（Claude CLI native，Phase 2）
3. **GenericAcpTransport** — `<cli> + acpArgs`（Qwen/Goose/Auggie 等）
4. **CodexMcpTransport** — `codex mcp-server`（Codex via MCP）

### 3.3 TurnCoordinator（CLI 版）

从 Margay `src/process/services/TurnCoordinator.ts` 精简移植：

**保留（从 Margay 移植）**：
- `TurnState` 类型系统 + `RllSession` 接口
- `onAgentFinish()` 核心路由逻辑（`TurnCoordinator.ts:232-311`）
- `handleRalphSubmission/handleLisaSubmission`（`:315-450`）
- Tag 解析 + Policy 检查（复用现有 CLI `policy.ts`）
- 超时升级 L0-L3（`:774-807`，CLI 当前没有此功能）
- 死锁检测（`:407-416`）
- 步骤流转 STEP_ORDER + nextStep()（`:108-122`）
- 事件发射器（EventEmitter pattern）
- 首条消息 bootstrap + rule capsule reinjection（从 `AcpAgentManager.ts:358-376` 简化版）

**替换**：
- `workspaceRouter.send()` → `TransportAdapter.sendPrompt()`
- DB 持久化 → 文件持久化（`.dual-agent/` 目录，兼容现有结构）
- `sourceConversationId` → MCP 事件通知

**去掉**：
- Electron IPC bridge
- UI streaming events
- WorkerManage 集成
- cloud/OpenClaw dispatch

### 3.4 RLL-MCP Server

```typescript
const server = new McpServer({ name: "rll", version: "1.0.0" });

// === Tools ===
server.tool("rll_launch", { task, ralph_backend, lisa_backend, ralph_transport, lisa_transport, auto_approve_permissions });
server.tool("rll_status", { session_id });
server.tool("rll_submit", { session_id, role, content });
server.tool("rll_lisa_review", { content, lisa_backend });
server.tool("rll_handoff", { task, ... });
server.tool("rll_pause", { session_id });
server.tool("rll_resume", { session_id });
server.tool("rll_override", { session_id, force_turn });

// === Resources ===
server.resource("rll://session/{id}/history");
server.resource("rll://session/{id}/work");
server.resource("rll://session/{id}/review");
```

### 3.5 CLI 命令映射

| 现有命令 | 改造方式 |
|---------|---------|
| `ralph-lisa auto` | 保留 tmux legacy；新增 `auto --engine` 走 TurnCoordinator |
| `ralph-lisa mcp-server` | **新增**：启动 RLL-MCP server（stdio） |
| `ralph-lisa submit-ralph/lisa` | 保留，同时作为 `rll_submit` 的 CLI wrapper |
| 其他命令 | 保留不变 |

### 3.6 UI 展示层

Transport 和 UI 完全分离。`auto --engine` 支持多种 UI 模式：

| UI 模式 | 命令 | 平台 | 描述 |
|---------|------|------|------|
| **tmux** | `--ui tmux` | macOS/Linux | 双窗格实时展示（只展示，不 send-keys） |
| **split** | `--ui split` | 全平台 | Node.js terminal 双栏 |
| **quiet** | `--ui quiet` | 全平台 | 关键状态行（CI/agent 调用） |
| **json** | `--ui json` | 全平台 | NDJSON 事件流（Margay/IDE 消费） |
| **无** | `mcp-server` | 全平台 | MCP 协议 |

## 四、文件结构（改造后）

```
Ralph-Lisa-Loop/cli/src/
├── cli.ts                    # CLI 入口（现有，扩展新命令）
├── commands.ts               # 现有命令（保留，渐进迁移）
├── state.ts                  # 文件状态管理（保留）
├── policy.ts                 # Policy 检查（保留）
├── index.ts                  # Public API
│
├── engine/                   # 新增：TurnCoordinator 引擎
│   ├── TurnCoordinator.ts    # 状态机（从 Margay 精简移植）
│   ├── types.ts              # TurnState, RllSession, RllEvent 等类型
│   └── bootstrap.ts          # 首条消息 + rule capsule
│
├── transport/                # 新增：Transport 适配层
│   ├── TransportAdapter.ts   # 接口定义
│   ├── AcpBridgeTransport.ts # npx @zed-industries/claude-code-acp
│   ├── StreamJsonTransport.ts# claude -p stream-json（Phase 2）
│   ├── GenericAcpTransport.ts# Qwen/Goose/Auggie 通用 ACP
│   ├── CodexMcpTransport.ts  # codex mcp-server
│   └── TransportFactory.ts   # 根据 backend + 配置选择 transport
│
├── mcp/                      # 新增：RLL-MCP Server
│   ├── server.ts             # MCP server 入口
│   ├── tools.ts              # rll_launch / rll_submit / ...
│   └── resources.ts          # rll://session/{id}/* resources
│
├── ui/                       # 新增：UI 展示层
│   ├── TmuxUI.ts             # tmux 双窗格（只展示）
│   ├── SplitUI.ts            # Node.js terminal 双栏
│   ├── QuietUI.ts            # 关键状态行
│   └── JsonUI.ts             # NDJSON 事件流
│
└── test/                     # 测试
    ├── cli.test.ts           # 现有（1719 行）
    ├── policy.test.ts        # 现有（324 行）
    ├── state.test.ts         # 现有（291 行）
    ├── watcher.test.ts       # 现有（857 行）
    ├── turn-coordinator.test.ts  # 新增
    ├── transport.test.ts         # 新增
    └── mcp-server.test.ts        # 新增
```

## 五、实施路线

### Phase 1a: P0 Spike — 验证 ACP bridge 多轮语义

**目标**：用最小代码验证 ACP bridge 能完成 RLL 完整流程。

**交付**：`spike/acp-rll-spike.ts` 独立脚本

**验证点**：
- `initialize` → `session/new` → `session/prompt`（Ralph）→ 解析 tag → `session/prompt`（Lisa）→ 多轮 → consensus
- `session/request_permission` 回调触发
- `end_turn` / `stopReason: "end_turn"` 作为 finish 信号
- session resume（崩溃恢复）

### Phase 1b: TurnCoordinator + AcpBridgeTransport 集成

**目标**：`ralph-lisa auto --engine` 跑通完整 PLAN→CODE→REVIEW→CONSENSUS。

**交付**：
- `engine/TurnCoordinator.ts`、`engine/types.ts`、`engine/bootstrap.ts`
- `transport/TransportAdapter.ts`、`transport/AcpBridgeTransport.ts`、`transport/TransportFactory.ts`
- `ui/QuietUI.ts`
- `cli.ts` 新增 `auto --engine`

**测试**：
- `turn-coordinator.test.ts`：状态机单元测试（mock transport）
- `transport.test.ts`：ACP 协议测试（initialize → session/new → session/prompt → end_turn）
- 集成测试：实际 spawn claude-code-acp 跑一轮

### Phase 2: 多 Transport + 更多 Backend

**交付**：
- `StreamJsonTransport.ts`（权限跳过需显式 opt-in，不静默覆盖用户预期）
- `GenericAcpTransport.ts`
- `CodexMcpTransport.ts`
- `TransportFactory` 自动选择

### Phase 3: RLL-MCP Server

**交付**：
- `mcp/server.ts`、`mcp/tools.ts`、`mcp/resources.ts`
- `cli.ts` 新增 `mcp-server` 命令
- MCP config 示例

### Phase 4: UI 展示层

**交付**：
- `TmuxUI.ts`（pipe stdout 到 pane，不用 send-keys）
- `SplitUI.ts`（跨平台 terminal 双栏）
- `JsonUI.ts`（NDJSON 事件流）
- `--ui` 参数

### Phase 5: 迁移与兼容

- `ralph-lisa auto`（无 `--engine`）保留 tmux legacy
- `auto --engine` 经验证后变为默认
- legacy tmux 标记 deprecated
- 更新文档和 FAQ

## 六、兼容性保证

| 现有功能 | 保证 |
|---------|------|
| `ralph-lisa auto`（tmux） | Phase 5 前完全不变 |
| `ralph-lisa submit-ralph/lisa` | 不变 |
| `.dual-agent/` 文件结构 | 不变（TurnCoordinator 写同样的文件） |
| 所有其他命令 | 不变 |
| 现有测试（3191 行） | 全部保留 |
| 手动模式 | 不变 |

## 七、CLI vs Margay 状态机/Preset 差异及补充增强

### 7.1 状态机行为差异

| 维度 | CLI（现有） | Margay | 新方案处理 |
|------|-----------|--------|-----------|
| Tag：QUESTION vs ESCALATE | QUESTION（向对方提问） | ESCALATE（升级到用户干预） | 两者共存 |
| 步骤流转 | 手动 `cmdStep()`，任意名称 | 自动推进，固定 planning→research→implementation | 保留手动，可选自动 |
| 共识检测 | 对称（双方 CONSENSUS/PASS） | 非对称（Ralph CONSENSUS 需 Lisa 先 PASS） | 采用 Margay 非对称规则（更严格） |
| 死锁阈值 | 3（硬编码） | 5（可配置） | 可配置，默认 5 |
| 首轮要求 | 假设 PLAN，不强制 | 可配置 PLAN/RESEARCH/CODE | 可配置 |
| Policy 严重级别 | 二元（通过/阻塞） | 分级（warn/block） | 采用 warn/block 分级 |
| Test 证据检查 | 要求 Test Results 段 | 额外要求命令执行证据 | 采用 Margay 更严格版本 |

### 7.2 Prompt 注入策略差异（最高杠杆改进点）

| | CLI（现有） | Margay | 新方案 |
|--|-----------|--------|--------|
| 方式 | 静态文件（CLAUDE.md/CODEX.md 安装一次） | 动态注入（每轮构建） | 动态注入 |
| Ralph 收到 | 固定角色指令 | 任务 + 工作区 + 步骤 + plan.md + Lisa review + review history | 同 Margay |
| Lisa 收到 | 固定角色指令 + 手动读 work.md | 任务 + Ralph 提交全文 + **git diff** + **最近 3 轮 review** + policy 警告 | 同 Margay |

这是 CLI 和 Margay **审查质量差距的主要来源**。新方案的 TurnCoordinator 每轮动态构建 prompt，Lisa 不再需要自己去读文件。

### 7.3 Phase 1b 顺带移植的增强清单

| 增强项 | Margay 来源 | 说明 |
|--------|------------|------|
| Resend 逻辑 | `TurnCoordinator.ts:258-276` | 空输出/无 tag/无效 tag → 重发最多 3 次，防止卡死 |
| Git diff 注入 | `TurnCoordinator.ts:329,540-543` | CODE/FIX 提交时自动 `git diff`，注入 Lisa prompt |
| Recent reviews 注入 | `TurnCoordinator.ts:399-405` | 最近 3 轮 Lisa 反馈注入双方 prompt，保持讨论连续性 |
| 大文件卸载 | `TurnCoordinator.ts:1398-1415` | >50KB 提交存文件，prompt 里放路径，防 prompt 爆炸 |
| Policy warn/block 分级 | `SubmissionParser.ts:32` | warn 只记录，block 触发 resend |
| 死锁阈值可配置 | `TurnCoordinator.ts:104` | 默认 5，可通过 config 调整 |
| ESCALATE tag | `SubmissionParser.ts:10-11` | 与 QUESTION 共存，暂停 session 通知用户 |

### 7.4 CLI 独有功能（保留不变）

- Subtask 管理（add/done/list）
- Ralph Auto Gate（提交前 test/lint）
- Scope Update（重置死锁）
- Force Turn（手动切换）
- Review 按 round 提取
- Recap 命令

### 7.5 Skill/Preset 差异

| | CLI | Margay | 新方案 |
|--|-----|--------|--------|
| Ralph skills | 5 个 slash command | shell-bg, data-manager, memory-manager, work-journal, web-capture, console-test | TurnCoordinator 管理，不需要 slash command |
| Lisa skills | 3 个 slash command | work-journal, memory-manager | 同上 |
| PM | 无 | rll-launch, rll-status + 4 个 utility skills | RLL-MCP Server 替代 |
| Scope Guard | 提及 | 显式段落（Ralph 不做 review，Lisa 不写代码） | 注入 prompt 中 |

## 八、风险与缓解

| 风险 | 缓解 |
|------|------|
| ACP bridge 缺 Agent 工具 | Phase 2 补 stream-json transport |
| Codex MCP 协议差异大 | Phase 2 独立实现 CodexMcpTransport |
| TurnCoordinator 移植工作量 | 只移植核心状态机（~400 行） |
| MCP SDK 兼容性 | 使用 `@modelcontextprotocol/sdk` 稳定版 |
| stream-json 多轮语义 | Phase 1a spike 验证 |

## 九、已确认的工具差异（实测数据）

### ACP bridge（`npx @zed-industries/claude-code-acp`）工具列表

Task, TaskOutput, Bash, Glob, Grep, ExitPlanMode, Read, Edit, Write, NotebookEdit, WebFetch, TodoWrite, WebSearch, TaskStop, Skill, EnterPlanMode, ListMcpResourcesTool, ReadMcpResourceTool + MCP tools

### CLI stream-json（`claude -p`）工具列表

Agent, Bash, Edit, Glob, Grep, Read, ScheduleWakeup, Skill, ToolSearch, Write, AskUserQuestion, CronCreate, CronDelete, CronList, EnterPlanMode, EnterWorktree, ExitPlanMode, ExitWorktree, Monitor, NotebookEdit, RemoteTrigger, TaskOutput, TaskStop, TodoWrite, WebFetch, WebSearch + MCP tools

### 关键差异

| CLI stream-json 独有 | ACP bridge 独有 |
|---------------------|----------------|
| **Agent**（子 agent 并行） | Task |
| **ToolSearch**（延迟加载） | ListMcpResourcesTool |
| AskUserQuestion | ReadMcpResourceTool |
| CronCreate/Delete/List | |
| EnterWorktree/ExitWorktree | |
| Monitor, RemoteTrigger, ScheduleWakeup | |

## 十、讨论过程中纠正的误判

1. ~~"Windows 只能走 Margay"~~ → CLI 可以内嵌 ACP client 自主跨平台
2. ~~"ACP 提取只需 ~300 行"~~ → 需要 transport + wrapper 两层 ~500-600 行
3. ~~"Codex 走 ACP"~~ → Codex 走 MCP，需独立适配
4. ~~"`claude --experimental-acp` 可用"~~ → 不存在（CLI v2.1.104 报 unknown option）
5. ~~"claude-code-acp 是明显更弱的 SDK 子集"~~ → 核心编辑工具一致，主要差 Agent 工具
6. ~~"Phase 1 应先用 stream-json"~~ → stream-json 无权限回调，Phase 1 应用 ACP bridge
