# Feishu Remote Prompt Relay — 设计文档

> off-laptop 时把 rll-session 的**权限弹窗**与**选项卡(AskUserQuestion)**推到飞书远程应答,使
> rll-session / Ralph / Lisa / testharness 不因用户不在电脑前而阻塞。
>
> 配套接口契约见 [`feishu-remote-prompt-relay-contract.md`](./feishu-remote-prompt-relay-contract.md)。
> 状态:设计(design-only)。实现拆后续 code slice。

## 0. 来源与新鲜度(D2)

本文所有 Claude Code hook 事实均来自**当前官方文档**,非训练记忆:
- WebFetch `https://code.claude.com/docs/en/hooks` + `https://code.claude.com/docs/en/hooks-guide`(2026-06-29)
- WebSearch `code.claude.com/docs/en/hooks` + `code.claude.com/docs/en/agent-sdk/user-input`(2026-06-30)

每条 hook 断言在 §3 标注其来源行/锚点。

## 1. 问题与死锁机理

驱动 Ralph/Lisa 的内核是**交互式 `claude`**(在 tmux pane 内,非 `-p`、非 Agent SDK wrapper)。当它:
- 弹**权限确认框**(工具批准,如 `Bash(rm …)` / `Edit`),或
- 调 **AskUserQuestion**(A/B/C 选项卡)

时,内层进程**阻塞在 TTY 等键盘输入**。

而飞书入站只在 round 边界被消费:`cli/src/commands.ts:2340`(`cmdWhoseTurn` 的 Ralph-wake 路径)调 `cli/src/feishu-poll.ts:163`(`consumeAgentBusInboxTick`)drain。内层一旦卡在 TTY,**round 边界永远到不了 → 飞书入站收不到 → 整个 loop 停**。用户不在电脑前时,无人在终端按键 → 永久死锁。

目标:把弹窗/选项**内容**推飞书,用户在飞书**回选择**,session 拿到答案**接着处理**,全程不依赖本地键盘。

## 2. 现状盘点

### 2.1 已有的入站/出站
- 入站:喵吉共享轮询器 → 本地文件 → `consumeAgentBusInboxTick`(`cli/src/feishu-poll.ts:163`),round 边界 drain。
- 出站:`cli/src/lark-hook.ts` / `ralph-lisa lark-push`。

### 2.2 下午已建的 L2 磁盘契约骨架(`~/.claude/skills/feishu-bridge/runtime/`)
- `session_unblock.py:72` `detect_one()` — 巡检扫各 session `.dual-agent/`,最高优先读 `pending-user-decision.json` → `kind="user-decision"`。
- `approval_inbox.py` `park()` + `format_decision_prompt()` — park 待批项给短 id(A3)+ 拼飞书文案。
- `session_inject.py:99` `inject("user-decision:<id>:<choice>")` — 校验 `decision_id` 匹配 + `choice ∈ options` → 写 `user-decision-response.json`;`consume_response()` 供 session 消费 + 清理。
- 设计原则:"不靠拦截 claude 内部 AskUserQuestion,不需 tmux"。

### 2.3 "不太稳当"根因(群 oc_2e0f3c… 2026-06-29 21:18→21:49 实证)
| # | 根因 | 证据 |
|---|---|---|
| R1 | **选项 ID 没端到端绑定** | 21:18 桥散文提问("要重启吗?要 push 吗?还是收工?")→ 用户 21:26 回"A"→ 21:38 "我不确定 A 指哪个" → 被迫重澄清。回复靠 LLM 解读,非确定性绑定。 |
| R2 | **session 侧没接线** | `grep -rn pending-user-decision cli/src` = 0 命中。`inject` 会写 response,但 session 侧**无 CLI 原语**去「写卡片 + 阻塞等待 + 消费」。 |
| R3 | **延迟靠巡检 cadence** | 非即时(21:26→21:38 隔 12min)。 |

## 3. Claude Code hook 事实(D1 — 经官方文档核实)

| 事实 | 来源 |
|---|---|
| `permissionDecision` 四值 `allow / deny / ask / defer` | hooks#decision-control(WebFetch 2026-06-29) |
| **AskUserQuestion input schema 含 `answers` 字段** `dict[str, str \| list[str]] \| None`("User answers populated by the permission system",Claude 不填,maps question text → 选中答案;multi-select 可为 label 列表或逗号串) | hooks#askuserquestion(WebSearch 2026-06-30) |
| **`updatedInput` 能携带 AskUserQuestion 答案**:PreToolUse 返回 `permissionDecision:"allow"` + `hookSpecificOutput.updatedInput`(回显原 `questions` + 加 `answers`)→ Claude 视为已答,**不弹 TTY 卡片;交互模式可用** | hooks#pretooluse + agent-sdk/user-input(WebSearch 2026-06-30) |
| 直接 allow+updatedInput 约束:hook 必须在**返回前**拿到答案(受 hook timeout 限,默认 600s),不能无限等 | hooks-guide(WebFetch 2026-06-29) |
| **`defer` 仅 `-p` 非交互 + v2.1.89+**:交互模式 logs warning 并忽略;defer→`claude -p --resume`→第二次 PreToolUse `allow + updatedInput.answers`;`deferred_tool_use` 携带 tool id/name/input;无 timeout(session 留盘至 `cleanupPeriodDays`,默认 30 天) | hooks#defer-a-tool-call-for-later(WebSearch 2026-06-30) |
| `PermissionRequest` 独立事件:`{hookSpecificOutput:{hookEventName:"PermissionRequest", decision:{behavior:"allow"\|"deny", updatedPermissions:[{setMode…}]}}}`;`setMode` 避免二次提示 | hooks-guide:391-437(WebFetch 2026-06-29) |
| **`PermissionRequest` 不在 `-p` 非交互 fire**("Use PreToolUse hooks for automated permission decisions") | hooks-guide:888,905 |
| PreToolUse `allow` **不绕过** settings 的 deny/ask 规则(hooks 只能收紧不能放松);多 hook 决策合并 **deny > defer > ask > allow** 最严胜;多 hook 改同一 updatedInput last-to-finish wins | hooks-guide:487,890 |
| SDK `canUseTool`:权限 + 澄清问题都触发,可无限 pending;超长等待用 defer | agent-sdk/user-input(WebSearch 2026-06-30) |

### 3.1 本环境关键约束(决定主路选择)
Ralph/Lisa = **交互式 `claude` in tmux**(非 `-p`、非 SDK wrapper):
- `defer`→resume **不可用**(它要求 `-p`+SDK wrapper);
- 但 `allow + updatedInput.answers` **在交互模式可用** —— 只要 hook 在 timeout 内拿到答案;
- 超长 off-laptop 等待(> hook timeout)hook 不能安全无限等 → 必须落 L2 磁盘契约。

## 4. 分层架构

放弃 **L3 tmux 抓屏**(用户 2026-06-29 拍板:太脆,且真痛点在 R1/R2 而非"抓不到")。否决 **方案 C Agent SDK 重写 loop**(工作量/风险最大;但其 `-p`+defer 路径在契约中保留为非交互模式选项)。

### L_perm — 权限弹窗
| 模式 | 机制 |
|---|---|
| **交互 tmux(Ralph/Lisa,主)** | `PermissionRequest` hook → 推飞书审批 → 映射 `decision.behavior=allow\|deny`;放行用 `updatedPermissions setMode` 避免二次本地提示(因 PreToolUse allow 不绕 deny 规则) |
| **非交互 `-p`(部分 testharness 子进程)** | `PermissionRequest` 不 fire → `PreToolUse` hook 作 policy guard;settings 配成无 ask 规则触发二次提示 |

危险动作(`rm` / `git push` / 发外 / 花钱)无论哪个事件都**强制二次确认**(复用 destructive-guard 分类),不被任何 allow 短路。

### L_ask — AskUserQuestion 选项卡
| 模式 / 等待时长 | 机制 |
|---|---|
| **交互 tmux,答案能在 hook timeout 内拿到(快路径)** | `PreToolUse` hook 匹配 AskUserQuestion → push 问题/选项到飞书 → 在 hook 超时窗内轮询本地 decision 文件(独立 watcher 从飞书回填)→ 拿到则返回 `allow + updatedInput={questions(回显), answers:{<question text>:<label>}}` → Claude 不弹卡片直接继续。**确定性 hook 应答** |
| **交互 tmux,超长等待(> hook timeout)** | `ralph-lisa ask-user` + L2 磁盘契约:写 pending 卡 → 经 L2 等飞书 `choice_id`(hook 不能无限等) |
| **非交互 `-p`/SDK** | `defer` → `claude -p --resume` → 第二次 PreToolUse `allow + updatedInput.answers`;或 SDK `canUseTool` 直接 pending |
| **fallback(任何模式)** | `PreToolUse` hook `deny`(reason 指向 ask-user)。**风险显式**:deny 给 Claude 返回 tool error,依赖 Claude 读 reason 后改调 ask-user(model-following,非确定);仅在快路径/L2 都不可用时兜底 |

### L2 — 磁盘契约(决策往返;复用 §2.2 骨架 + 补两短板)
- schema(详见契约文档):`pending-user-decision.json` `{id, prompt, options:[{id,label}], context, ts}` + `user-decision-response.json` `{id, choice_id, ts}`。
- 补短板①:**session 侧阻塞原语** `ralph-lisa ask-user`(写卡片 → 阻塞轮询 response → 返回选中 → 清理),修 R2。
- 补短板②:**`choice_id` 端到端确定性绑定**,修 R1("A 对不上")。
- L2 既是**交互超长等待的主路**,也是 **hook 快路径的答案来源**:watcher 把飞书 `choice_id` 写入 decision 文件,L_ask 快路径 hook 读它组 `updatedInput.answers`。两条路共享同一 decision 文件 + corr 关联。

## 5. 端到端时序(D4 — 各路径闭合,无悬空/阻塞步)

### 5.1 权限弹窗(交互)
1. Claude 将调危险/需批工具 → `PermissionRequest` hook fire(交互模式)
2. hook 读 `tool_name` + `tool_input` → 危险分类(destructive-guard)→ push 飞书审批卡(corr_id + 危险标红 + 二次确认要求)
3. hook 在超时窗内轮询本地 decision 文件;watcher 从飞书回填用户 allow/deny
4. 拿到 → 返回 `decision.behavior`(+ `updatedPermissions setMode` 若 allow)→ Claude 继续/取消,**不弹本地框**
5. 超时未决 → 回落本地框(降级,但已 push,用户回飞书后下一同类动作即走 hook)

### 5.2 选项卡 · 快路径(交互,答案 ≤ hook timeout)
1. Claude 调 AskUserQuestion → `PreToolUse` hook fire
2. hook push 问题/选项(稳定 option id)到飞书 → 超时窗内轮询 decision 文件
3. watcher 收飞书 `choice_id` 写 decision 文件
4. hook 读到 → `allow + updatedInput={questions, answers}` → Claude 拿答案继续,**无卡片**

### 5.3 选项卡 · 超长路径(交互,用户离开 > hook timeout)
1. 指令层:Claude 改调 `ralph-lisa ask-user --prompt … --options …`(而非 AskUserQuestion)
2. ask-user 写 `pending-user-decision.json`(分配稳定 option id)→ 阻塞轮询 `user-decision-response.json`
3. 喵吉巡检 detect(`session_unblock.py:72`)→ park(`approval_inbox`)→ push 飞书(稳定 id 文案)
4. 用户回 → `session_inject.py:99` 校验 `decision_id`+`choice_id` → 写 response
5. ask-user 读到 id 匹配 → 返回选中 option(`consume_response` 清理)→ Claude 继续
6. 兜底:Claude 漏指令直接调 AskUserQuestion → L_ask fallback `deny`(reason 指向 ask-user)

### 5.4 testharness(非交互)
- testharness(`ralph-lisa skill wezterm-test` / `playwright-test`)非交互运行;内跑 claude 用 `-p` → 命中 `PreToolUse`(可 `defer` 或 `allow+updatedInput`)
- §70 post-consensus cascade / submit-gate **不因等用户阻塞**:test 动作权限走 allowlist 自动放行,仅真危险 test 动作 park 飞书

## 6. 安全边界

- **owner-only 信任门**:只有 owner 的飞书 open_id 能应答;沿用 `isTrustedBusRouter`(`cli/src/feishu-poll.ts` 信任 `from ∈ {junshi, miaoji-poller, rll-term}`)+ owner gate。
- **危险动作二次确认**:rm/push/发外/花钱 即使远程也要求额外确认词,不被 allow 短路(用户 2026-06-29 决策)。
- **corr_id / decision_id 防串台 + 防陈旧**:`session_inject.py:99` 已校验 `decision_id` 匹配当前卡 + `choice ∈ options`;多 session 并发时 decision 文件按 session_dir 隔离。
- **hook 不能无限等**:超长等待必走 L2(避免 hook timeout 后回落 TTY 的死锁)。

## 7. 长等待解耦设计

核心:**hook/CLI 不在自身进程里死等飞书**,而是 push 后轮询一个本地 decision 文件,由独立的 watcher/喵吉巡检从飞书回填。
- 交互快路径:hook 轮询窗 ≤ hook timeout;命中即 `updatedInput.answers`。
- 交互超长:`ralph-lisa ask-user` + L2;watcher 异步回填,session 侧消费。
- 非交互:`defer`(session 留盘,resume 时回填)。

这样飞书往返的"慢"被隔离在独立进程,被阻塞的 claude 要么快速拿到答案、要么走可恢复的 L2,**不存在"hook 自己卡几小时"**。

## 8. 用户决策对齐(D5)
- ✅ 放弃 L3 tmux 抓屏(本文 §4 记录为何放弃)
- ✅ 危险动作始终二次确认(§4 L_perm + §6)
- ✅ testharness 不阻塞(§5.4)
- ✅ off-laptop 远程应答(全文核心)

## 9. 实现子 slice 队列(后续 code slice)
1. **S-ask-cli**:`ralph-lisa ask-user` 阻塞原语 + L2 schema(options 带稳定 id + choice_id 绑定)+ 单元测试
2. **S-hook-perm**:`PermissionRequest`(交互)+ `PreToolUse`(非交互)权限桥脚本 + 危险二次确认 + settings 模板
3. **S-hook-ask**:`PreToolUse` AskUserQuestion 快路径(allow+updatedInput.answers)+ deny fallback + watcher 回填 decision 文件
4. **S-watcher-fill**:watcher 从飞书 `choice_id` 回填 decision 文件(连通 hook 快路径与 L2)
5. **S-testharness-nonblock**:testharness `-p` + allowlist + 危险动作 park
6. **S-feishu-card**:稳定 option id 卡片渲染 + id-bound 解析(LLM 兜底)

## 10. 不在范围(本设计 + 本 epic 边界)
- tmux 抓屏(L3,放弃)
- Agent SDK 重写 loop 产品化(方案 C 否;`-p`+defer 仅作非交互模式选项保留)
- 企微通道(本架构可复用,换发送/收事件实现;本 epic 只锁飞书)
