# 飞书 / 钉钉 CLI Agent 接入方案评估

**日期**: 2026-05-09  
**作者**: Ralph (§74 research slice)  
**范围**: CLI-based agent 接入，对比 MCP/webhook/stream-SDK 备选路径

---

## 一、集成模型分类（四种，不可混用）

| 模型 | 描述 | 飞书 | 钉钉 |
|------|------|------|------|
| **CLI 调用** | Agent 直接 shell-out 调 CLI 命令 | `@larksuite/cli` | `dingtalk-workspace-cli` |
| **MCP 工具暴露** | AI 助手通过 MCP 协议调 API | `lark-openapi-mcp`（独立包） | 无独立包；`dws` 内部桥接 DingTalk MCP metadata/runtime |
| **事件/Stream SDK** | 接收平台推送事件 | — | `open-dingtalk/dingtalk-stream-sdk-python` |
| **Outbound Webhook** | 主动推送消息到群/机器人 | §63 已实现 | §64 已实现 |

> 本文聚焦 **CLI 调用** 模型，其他模型仅作对比背景。

---

## 二、飞书 CLI (`@larksuite/cli`)

**Evidence**: https://github.com/larksuite/cli | https://www.npmjs.com/package/@larksuite/cli  
**Evidence**: https://open.feishu.cn/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu

### 核心参数

| 项目 | 值 |
|------|-----|
| 最新版本 | v1.0.26（发布 2026-05-08） |
| 首次发布 | v0.0.2 on 2026-03-27 |
| 周下载量 | 80,490（2026-05-02 ~ 2026-05-08） |
| 命令数 | 200+，覆盖 17 个业务域 |
| Agent Skills | 24 个结构化 Skill（开箱即用） |
| 语言/运行时 | Go v1.23+（预编译二进制，通过 npm 分发） |
| 安装 | `npm install -g @larksuite/cli` |

### Agent 兼容性

Verified (GitHub README): 官方 README 说 "compatible with popular AI tools"，未在主 README 中列出具体 agent 产品名。  
Verified (官方文档页): https://open.feishu.cn/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu 列出 **Claude Code、TRAE、Cursor、Codex**（该页面与 README 版本号/域数存在差异，可能来自不同时期）。

### 业务域覆盖

消息与群组、云文档、云空间（Drive）、电子表格、多维表格、日历、视频会议、会议纪要、邮件、任务、知识库、通讯录、幻灯片、白板、OKR、审批、考勤

### 认证模型

- 双模式：**User identity**（OAuth 授权，可读取个人数据）/ **App-only**（仅收发消息，无个人数据）
- 无头/Agent 模式：`--no-wait` 返回 OAuth 验证 URL（不阻塞 agent 流）
- 身份切换：`--as user` / `--as bot`
- 凭据存储：OS 原生 Keychain，不写明文

### 补充产品：`lark-openapi-mcp`

**Evidence**: https://github.com/larksuite/lark-openapi-mcp  
版本 v0.5.1（Beta），689 stars，95 forks。将 2500+ Lark API 封装为 MCP 工具——与 CLI 互补而非替代，适合 Claude Desktop / Cursor 通过 MCP 协议调用。

---

## 三、钉钉 CLI (`dingtalk-workspace-cli`)

**Evidence**: https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli  
Verified: 仓库存在，Apache-2.0，官方 org（DingTalk-Real-AI），首发 2026-03-27

### 核心参数

| 项目 | 值 |
|------|-----|
| 最新版本 | v1.0.23（发布 2026-05-08） |
| 首次发布 | 2026-03-27（与飞书 CLI 同周） |
| 命令数 | 163，覆盖 14 个产品 |
| Agent Skills | SKILL.md（Markdown 提示文档，无任意代码执行）+ 13 个独立 Python 批操作脚本 |
| 语言/运行时 | Go v1.25+（预编译二进制），另可 npm 安装 |
| 安装 | `npm install -g dingtalk-workspace-cli` 或 bash/PowerShell 脚本 |

### Agent 兼容性

Verified (GitHub README): 官方 README 明确列出 **Claude Code、Cursor**（原文："AI tools like Claude Code / Cursor can operate DingTalk directly through natural language"）。安装路径中隐含更多 agent 目录（`~/.claude/skills/dws`、`~/.cursor/skills/dws` 等），但正文未列 Codex 或 Qoder。

### 业务域覆盖

通讯录、聊天、日历、待办、审批、考勤、钉钉消息（Ding）、汇报、智能表格（AITable）、文档、云盘、会议纪要、邮件、开发文档、Raw API

### 认证模型

- OAuth device-flow（`--device` 无头模式）
- 凭据加密：PBKDF2 派生密钥 + AES-256-GCM，按设备 MAC 绑定
- 自定义 App 模式（client ID/Secret）—— 适合 CI/CD
- Domain allowlisting + least-privilege scoping

---

## 四、对比矩阵（8 维度）

| 维度 | 飞书 CLI | 钉钉 CLI |
|------|----------|----------|
| **命令覆盖** | 200+，17 域 | 163，14 域 |
| **Agent Skill 质量** | 24 结构化 Skill（Markdown 提示） | SKILL.md Markdown 提示 + 13 独立 Python 批操作脚本（两者分开） |
| **发现模型** | `--help` 自文档 | `--help` 自文档 |
| **Claude Code 兼容** | ✓ 官方文档页明确（README 仅说"popular AI tools"） | ✓ README 明确（"AI tools like Claude Code / Cursor"） |
| **Codex 兼容** | 官方文档页列出（README 未提） | README 未明确列出 |
| **MCP 互补产品** | `lark-openapi-mcp` v0.5.1（独立 MCP server 包，成熟） | 无独立 MCP server 包；`dws` 内部将 DingTalk MCP metadata 转成 CLI 命令面（MCP runtime bridge，见 docs/architecture.md） |
| **认证无头模式** | `--no-wait` 返回 OAuth URL | `--device` device-flow |
| **token 存储安全性** | OS Keychain | AES-256-GCM + MAC 绑定 |
| **运行时依赖** | Go 二进制，npm 为分发渠道（非运行时） | Go 二进制，无额外运行时依赖 |
| **发布频率** | 26 releases in ~6 周，约每日 | 23 releases in ~6 周（npm 首发 2026-04-01） |
| **npm 周下载量** | 80,490（2026-05-02~05-08，Evidence: npmjs API） | 1,553（同期，Evidence: npmjs API） |
| **开源协议** | MIT（README badge + npm metadata 均确认） | Apache-2.0 |

---

## 五、CLI vs. MCP 选路背景

**Evidence**: https://yage.ai/share/feishu-dingtalk-cli-reject-mcp-first-en-20260329.html

飞书和钉钉在同一周（2026-03-27）发布 CLI，被分析界解读为对"MCP-first 路径的实用性拒绝"：

- **CLI 优势**：terminal-native agent（Claude Code / Codex）直接 shell-out，零适配层；`--help` 即技能发现；企业平台快速包装 2500+ API 为命令成本低
- **MCP 当前缺陷**：上下文窗口压力（所有数据走 LLM context）；OpenAI 协议扩展导致跨宿主不兼容；OAuth 2.1 传输层 CVE；大量 tool schema 加载降低精度

结论：CLI 不是反 MCP 意识形态，而是 2026 年 H1 针对 agent-native 场景的工程务实选择。

---

## 六、RLL 视角分析

当前 RLL 状态：
- §63 飞书 outbound webhook bot（已交付，等待 Lark App Key 真打）
- §64 钉钉 outbound webhook bot（已交付，等待 DingTalk webhook URL + Secret 真打）
- RLL 本身是 Claude Code + Codex 双 agent 系统，shell-native

CLI 接入对 RLL 意味着什么：
1. **双向通道**：现有 webhook 只能 outbound（推消息）；CLI 可以 **inbound**（读消息、读日历、写文档）—— 能力质变
2. **Ralph 可直接调用**：Ralph 是 Claude Code，原生支持两款 CLI；`ralph-lisa wecom-push` 类似但只推，CLI 可读写
3. **身份问题**：CLI 需要用户授权 OAuth（飞书/钉钉账号）—— 这是凭据 gate，不影响技术可行性
4. **并行使用**：CLI（双向交互）+ webhook（主动推送）可并存，不互斥

---

## 七、推荐方案

**推荐：优先接入飞书 CLI（`@larksuite/cli`），钉钉 CLI 作为后续**

理由（基于验证事实）：

1. **Agent Skill 质量更高**：24 Skill（Markdown 提示，Claude Code 直接读取）vs. 钉钉 SKILL.md + 13 Python 批操作脚本（需 Python 环境执行脚本部分）
2. **Claude Code 兼容有官方文档背书**：飞书官方文档页明确列出 Claude Code + Codex；钉钉 README 仅列 "Claude Code / Cursor"，Codex 未明确
3. **MCP 互补产品更成熟**：`lark-openapi-mcp` v0.5.1（独立 MCP server 包，689 stars）已可在 Claude Desktop 场景使用；钉钉无独立 MCP server 包（`dws` 内部桥接 MCP runtime，但不对外暴露 MCP 协议端点）
4. **生态活跃度更高**：80,490 npm 周下载 vs. 钉钉 1,553（同期 npmjs API 数据，差距约 52×）；发布节奏相近
5. **两者均为 Go 二进制**：运行时依赖对等；飞书通过 npm 分发更贴近 RLL 的 Node 工具链习惯（install/upgrade 体验一致）

**钉钉 CLI 适用条件**：用户主要在钉钉生态工作，或需要 Go 二进制无运行时依赖的部署场景。

**暂不推荐 MCP-first**：`lark-openapi-mcp` 是补充工具，不替代 CLI；当前 MCP 协议稳定性问题（见第五节）不适合作为 RLL 主通道。

---

## 八、下一步选项

| 选项 | 内容 |
|------|------|
| A | 接入飞书 CLI：用户提供飞书账号授权，Ralph 调用 `@larksuite/cli` 实现双向飞书交互 |
| B | 接入钉钉 CLI：用户提供钉钉账号授权，接入 `dingtalk-workspace-cli` |
| C | 先完成 §63/§64 webhook dogfood（需要 Lark App Key + DingTalk webhook URL） |
| D | 暂缓 IM 接入，处理其他优先级任务 |

默认（无指示时）：停，等用户拍方向。

