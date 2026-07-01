# RLL Stack — IDE-First Lisa Review

**产品定位**: 为 IDE Agent/Solo 模式优化的 AI 代码审查系统。IDE 的 AI agent 做 Ralph(开发),Lisa 通过 MCP 做持久上下文审查。

**与 ralph-lisa CLI 的关系**: 完全独立产品。不共享命令、规则文件、状态文件。不使用 `submit-ralph` / `whose-turn` / `watch-lisa` / `.dual-agent/`。

---

## 一、Integration Modes 矩阵

| 模式 | 入口条件 | 生成文件 | Agent 指令 | MCP 检测 | 降级(无 MCP) | 验收标准 |
|---|---|---|---|---|---|---|
| **IDE-as-Ralph**(默认 MVP) | `rll-stack init` + 打开 IDE | `.trae/mcp.json` + SKILL.md + AGENTS.md | SKILL.md:每 phase boundary 调 `rll_lisa_review` | agent 检查 tools 面板有 `rll_lisa_review` | 生成可复制 review prompt(不回退到旧 CLI) | agent 调 tool → 收到 review → 能自动循环 |
| **full-auto**(Phase 2+) | IDE agent 自主循环稳定 | 同上 | AGENTS.md 加"自动 review,无需用户指令" | 同上 | 同上 | plan→code→review→fix→pass 全自动 |
| **handoff**(兜底) | MCP 不可用 / 用户想手动 | 只有 AGENTS.md | 用户运行 `rll-stack review` | 不需要 MCP | `rll-stack review` one-shot | review 输出含 [PASS]/[NEEDS_WORK] |

**handoff 说明**: `rll-stack review` 是独立 one-shot 命令,不创建 `.dual-agent/`,不使用 `submit-ralph` / `whose-turn`,不回退到 `ralph-lisa` CLI。

---

## 二、Phase 计划

### Phase 0: 名称 + Repo

- 查 npm `rll-stack` 可用性
- 创建新 repo
- package.json: `name: "rll-stack"`, `bin: {"rll-stack": "dist/cli.js"}`

### Phase 1: Trae-First MCP MVP

**只做 Trae。** Cursor/Copilot/其他 IDE 全部放 Phase 2。

#### 生成文件(init)

| 文件 | 用途 |
|---|---|
| `.trae/mcp.json` | Trae MCP 配置 |
| `.trae/skills/lisa-review/SKILL.md` | Trae 技能:教 agent 调 rll_lisa_review |
| `AGENTS.md` | 跨 IDE 通用规则(MCP-only,不提 CLI 命令) |

**不生成**: `.cursor/mcp.json`, `.github/copilot-mcp.json`, `.cursorrules`, `CLAUDE.md`, `CODEX.md`, `.dual-agent/`, `.git/hooks/post-commit`

#### MCP Server Validation Checklist

| 检查项 | 预期 | 验证方法 |
|---|---|---|
| MCP config 路径 | `.trae/mcp.json` | `cat .trae/mcp.json` 有 `rll` 条目 |
| JSON schema | `{"mcpServers":{"rll":{"command":"...","args":["mcp-server"]}}}` | JSON parse 不报错 |
| server command | `node <abs-path>/cli.js mcp-server` | 绝对路径,跨平台 |
| Windows 路径/空格 | `C:\Users\My Name\...` 正确处理 | Windows 实测含空格路径 |
| stdio 启动 | server 通过 stdin/stdout JSON-RPC 通信 | `echo '{"jsonrpc":"2.0",...}' \| rll-stack mcp-server` 返回 JSON |
| Trae MCP 面板 | 显示 `rll` server + 8 个 tools | Trae 打开项目后截图确认 |
| `rll_lisa_review` tool 可用 | 面板里列出,可调用 | Trae 对话框让 agent 调用 |
| tool call 入参 | `{content: "[CODE]...", lisa_backend: "codex", auto_approve: true}` | Trae 日志确认参数正确 |
| tool call 出参 | `Lisa review [PASS/NEEDS_WORK]:\n\n...` | Trae 对话框显示 review |
| hidden session 3 轮 | Round 2/3 Lisa 引用前轮反馈 | 连续 3 次调用,验证上下文 |
| MCP 不可用时 | 不回退到 `ralph-lisa` CLI | 删 mcp.json 后 agent 不跑 `submit-ralph` |
| idle timeout | 5 分钟无调用 → session 清理 | 等 5 分钟 → 下次调用透明重建 |

#### CLI 命令(极简)

```
rll-stack init              # 生成 .trae/mcp.json + SKILL.md + AGENTS.md
rll-stack uninit             # 清理
rll-stack mcp-server         # 启动 MCP server(Trae 自动调)
rll-stack review             # one-shot review(handoff/CI)
rll-stack --help
```

#### 验收标准

1. `rll-stack init` → Trae 打开项目 → MCP 面板显示 `rll` + 8 tools
2. Trae Solo Builder 调 `rll_lisa_review` → Lisa 返回带 tag 的 review
3. 连续 3 轮调用 → Lisa 引用前轮反馈(hidden session 持久上下文)
4. `rll-stack review` → one-shot review 可用(handoff 模式)
5. 不出现 `ralph-lisa` / `submit-ralph` / `whose-turn` 任何引用

### Phase 2: IDE Validation Matrix

逐个 IDE 验证后加入:

| IDE | 验证项 | 加入条件 |
|---|---|---|
| **Cursor** | `.cursor/mcp.json` 路径 + schema + agent tool-call 行为 | 实测 3 轮 review 通过 |
| **Copilot** | `.github/copilot-mcp.json`(确认 `servers` key)+ agent mode tool-call | 实测通过 |
| **Windsurf** | 确认是否有项目级 config(目前只有全局) | 官方文档确认 |
| **Cline** | `.cline/mcp_settings.json` + tool-call 行为 | 实测通过 |
| **Claude Code** | `.mcp.json` + skills | 实测通过 |

### Phase 3: ReviewEngine MVP

- `ReviewEngine.review(input): ReviewResult` 最小接口
- Plan completion audit(对比 plan vs 实现)
- Prompt variant selection(按 diff 文件类型选审查侧重)
- 不含:跨模型/置信度/Red Team

### Phase 4: rll_propose_fix

- 新 MCP tool:`rll_propose_fix` 返回 patch + confidence + scope
- Ralph/user 决定是否 apply
- Lisa **不直接改代码**

### Phase 5: Prior Learnings + Ralph Skills

- `.rll-stack/learnings/*.jsonl`(项目级)
- 跨 session 去重
- SKILL.md 增强(plan 模板 / scope drift 自检)

---

## 三、架构

```
IDE Agent (Ralph)                         rll-stack MCP Server (Lisa)
  │                                         │
  │ 读 SKILL.md + AGENTS.md                 │
  │ 知道: 什么时候 review, 怎么提交          │
  │                                         │
  ▼ MCP: rll_lisa_review(content)           │
  ─────────────────────────────────────────►│
  │                                         ├── Session Registry (Map<cwd>)
  │                                         ├── TurnCoordinator
  │                                         │     tag/policy/round/deadlock
  │                                         ├── Transport (codex/claude/...)
  │                                         │
  │◄─────────────────────────────────────── │
  │ Lisa review [PASS/NEEDS_WORK]           │
  │                                         │
  │ [NEEDS_WORK] → 修代码 → 再调            │
  │ [PASS] → 继续下一阶段                   │
```

---

## 四、GStack 能力拆分(Phase 3+)

### Lisa 侧(MCP server 内部,Phase 3+)

| 能力 | Phase | 描述 |
|---|---|---|
| Plan audit | 3 | 对比 plan vs 实现,报 scope drift |
| Prompt variant | 3 | 按 diff 文件类型选审查侧重 |
| 跨模型审查 | 5+ | dispatch 第二个模型做 second opinion |
| 专家分派 | 5+ | 安全/性能/测试各专家 |
| 置信度评分 | 5+ | finding 打分,低分标 advisory |
| Red Team | 5+ | 大 diff 对抗审查 |

### Ralph 侧(SKILL.md + AGENTS.md)

| 能力 | Phase | 描述 |
|---|---|---|
| Review skill | 1 | SKILL.md 教 agent 调 rll_lisa_review |
| Phase discipline | 1 | AGENTS.md: Round 1 必须 PLAN, phase boundary 必须 review |
| Plan skill | 5 | SKILL.md 教 agent 写 plan 格式 |
| Scope drift 自检 | 5 | AGENTS.md: submit 前自查偏离 |
| Auto-fix 识别 | 4+ | AGENTS.md: 教 agent 识别机械问题,自己改,重新 review |

**Lisa 不改代码。auto-fix 的"改"在 Ralph 侧(IDE agent),Lisa 只给建议。**

---

## 五、Repo 结构

```
rll-stack/
├── package.json              # name: "rll-stack", bin: {"rll-stack": "dist/cli.js"}
├── tsconfig.json
├── src/
│   ├── cli.ts                # init / uninit / mcp-server / review
│   ├── init.ts               # 生成 MCP config + SKILL.md + AGENTS.md
│   ├── review.ts             # one-shot (handoff/CI)
│   ├── mcp/
│   │   ├── server.ts
│   │   └── handlers.ts       # hidden session + unified registry
│   ├── engine/
│   │   ├── TurnCoordinator.ts
│   │   ├── types.ts
│   │   ├── bootstrap.ts
│   │   └── debugLogger.ts
│   ├── transport/
│   │   ├── TransportAdapter.ts
│   │   ├── AcpBaseTransport.ts
│   │   ├── CodexMcpTransport.ts
│   │   ├── StreamJsonTransport.ts
│   │   └── GenericAcpTransport.ts
│   └── test/
│       ├── mcp-session.test.ts
│       ├── init.test.ts
│       └── e2e.test.ts
├── templates/
│   ├── skills/
│   │   └── lisa-review/SKILL.md
│   └── agents.md
└── docs/
    └── quick-start.md
```

---

## 六、与 ralph-lisa CLI 的分界线

| | ralph-lisa CLI | rll-stack |
|---|---|---|
| 命令 | `ralph-lisa` | `rll-stack` |
| 规则文件 | CLAUDE.md(CLI 协议) | AGENTS.md + SKILL.md(MCP 协议) |
| 状态文件 | `.dual-agent/` | 无(MCP session 内存态) |
| Lisa 运行 | watch-lisa 后台进程 | MCP hidden session(IDE 管理) |
| UI | tmux / wt 双 pane | IDE 对话框 |
| 可共存 | ✅ | ✅ 不冲突 |
| 互相引用 | ❌ 不引用 | ❌ 不引用 |
