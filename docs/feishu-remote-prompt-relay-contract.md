# Feishu Remote Prompt Relay — 接口契约

> 锁定后续 code slice 必须实现的 schema 与行为契约。设计背景见
> [`feishu-remote-prompt-relay-design.md`](./feishu-remote-prompt-relay-design.md)。
> 所有 Claude Code hook 字段来自当前官方文档(WebFetch/WebSearch 2026-06-29/06-30,见设计文档 §0/§3)。

本契约共 **9 个契约点**(C-1 … C-9)。

---

## C-1 AskUserQuestion 工具契约(`{questions, answers}` via `updatedInput`)

AskUserQuestion 的 input schema(官方,hooks#askuserquestion):
```jsonc
{
  "questions": [                       // 1-4 个问题
    {
      "question": "string",            // 完整问题文本
      "header": "string",              // ≤12 char 短标签
      "options": [ { "label": "string", "description": "string" } ],  // 2-4 项
      "multiSelect": false
    }
  ],
  "answers": null                      // dict[str, str | list[str]] | None
                                       // "User answers populated by the permission system"
                                       // Claude 不填;maps question text → 选中 label
                                       // multi-select 可为 label 列表或逗号串
}
```
**应答契约**:PreToolUse hook 返回 `permissionDecision:"allow"` + `hookSpecificOutput.updatedInput`,其中 `updatedInput` **回显原 `questions`** 并补 `answers`:
```jsonc
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "answered via Feishu",
    "updatedInput": {
      "questions": [ /* 原样回显 */ ],
      "answers": { "<question text>": "<chosen label>" }   // multi → ["a","b"] 或 "a,b"
    }
  }
}
```
效果:Claude 视为已答,**不弹 TTY 卡片**;**交互模式有效**。约束:hook 须在**返回前**拿到答案(受 hook timeout,默认 600s)。

---

## C-2 PermissionRequest 事件契约(真权限对话框)

输出(官方,hooks-guide:391-437):
```jsonc
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",                  // "allow" | "deny"
      "updatedPermissions": [               // 可选;避免二次提示
        { "setMode": { "mode": "acceptEdits", "destination": "session" } }
      ]
    }
  }
}
```
- 仅**交互模式** fire("when a permission dialog appears");**`-p` 非交互不 fire** → 改用 C-3 PreToolUse。
- `behavior:"allow"` 代用户答权限框;`updatedPermissions setMode` 设会话权限模式免后续重问。

---

## C-3 PreToolUse 契约(`allow/deny/ask/defer` + `updatedInput` + 精度)

```jsonc
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",          // allow | deny | ask | defer
    "permissionDecisionReason": "string",
    "updatedInput": { /* 替换工具入参;C-1 用它带 answers */ }
  }
}
```
- `allow` **不绕过** settings 的 deny/ask 规则(hooks 只能收紧不能放松)。
- 多 hook 决策合并:**`deny > defer > ask > allow`** 最严胜。
- 多 hook 改同一 `updatedInput`:**last-to-finish wins**(避免多 hook 改同一工具入参)。
- `exit 2` + stderr = 阻塞(等价 deny,但无结构化字段)。

---

## C-4 `defer` 约束 + resume(仅非交互)

- **仅 `-p` 非交互 + Claude Code v2.1.89+**;交互模式 logs warning 并忽略。
- 流程:Claude 调工具 → PreToolUse 返回 `"defer"` → 工具不执行,结果 JSON `stop_reason:"tool_deferred"` + `deferred_tool_use:{id,name,input}` → 调用方 `claude -p --resume <session-id>` → 同 tool call 再次 PreToolUse → 返回 `allow + updatedInput.answers` → 执行继续。
- 无 timeout/retry 限;session 留盘至 `cleanupPeriodDays`(默认 30 天)。
- 本环境(交互 tmux)**不用**;契约保留供 testharness `-p` / 未来 SDK 路径。

---

## C-5 模式矩阵(事件 × 模式 → 路径)

| 事件 / 场景 | 交互 tmux(Ralph/Lisa) | 非交互 `-p` / SDK(testharness) |
|---|---|---|
| 权限弹窗 | `PermissionRequest` → 飞书 → `behavior` (C-2) | `PreToolUse` policy guard (C-3) |
| AskUserQuestion,答案 ≤ hook timeout | `PreToolUse` `allow+updatedInput.answers`(快路径,C-1) | `defer`→resume→`allow+updatedInput.answers`(C-4)/ SDK `canUseTool` |
| AskUserQuestion,超长等待 | `ralph-lisa ask-user` + L2(C-7/C-8) | `defer`(留盘可恢复,C-4) |
| 漏指令直接调 AskUserQuestion | `PreToolUse` `deny` fallback(reason 指向 ask-user;model-following 风险) | 同左 |

---

## C-6 长等待 L2 边界

- hook(C-1/C-2/C-3)**不得在自身进程内无限等飞书**:push 后在 ≤ hook timeout 窗口轮询本地 decision 文件;命中即应答,未命中按降级(交互回落 TTF / 非交互 defer)。
- **超长 off-laptop 等待必走 L2**(C-7/C-8):由独立 watcher/喵吉巡检异步从飞书回填,session 侧可恢复消费。
- 判定边界:预计等待 > hook timeout(默认 600s)→ 走 L2;否则可走 hook 快路径。

---

## C-7 L2 磁盘契约 JSON schema

`<session .dual-agent>/pending-user-decision.json`(session 写):
```jsonc
{
  "id": "string",                       // 决策唯一 id(防陈旧)
  "prompt": "string",
  "options": [ { "id": "string", "label": "string" } ],  // 稳定 option id(修 R1)
  "context": "string",
  "ts": 0                               // epoch ms,调用方传入
}
```
`<session .dual-agent>/user-decision-response.json`(注入方写):
```jsonc
{ "id": "string", "choice_id": "string", "ts": 0 }   // choice_id ∈ pending.options[].id
```
- 消费方(session)读到 `response.id == pending.id` → 取 `choice_id` → 清理两文件(`session_inject.py:99` `consume_response` 参考实现)。
- 注入校验(`session_inject.py:99`):`decision_id` 必匹配当前 pending 卡 + `choice_id ∈ options[].id`,否则拒绝(防陈旧审批/越权)。
- hook 快路径(C-1)与 L2 **共享同一 decision 文件**:watcher 把飞书选择写为 `user-decision-response.json` 的 `choice_id`,hook 读 `options[].label` 组 `updatedInput.answers`。

---

## C-8 `ralph-lisa ask-user` CLI 契约(session 侧阻塞原语)

```
ralph-lisa ask-user --prompt "<问题>" --options "<label1>,<label2>,…" [--timeout <sec>] [--context "<ctx>"]
```
- 行为:① 分配稳定 `option id`(如 `o1,o2,…`)→ 写 `pending-user-decision.json`;② **阻塞轮询** `user-decision-response.json`(`id` 匹配);③ 命中 → stdout 输出选中 option(label + id),exit 0;④ 清理两契约文件。
- 超时(`--timeout`,默认见实现):未决 → exit 非 0 + 提示(供 Claude 决定重试/换路);**不静默成功**。
- 长等待:轮询窗口可远大于 hook timeout(这是它相对 hook 快路径的价值);实际等待由 watcher 异步回填解耦。
- 指令层:CLAUDE.md 指示"需用户拍板时调 `ask-user`,勿用 AskUserQuestion"(配 C-5 fallback deny 兜底)。

---

## C-9 owner-only 信任门 + corr_id 串台防护

- **owner-only**:只有 owner 飞书 open_id 的回复被接受;沿用 `cli/src/feishu-poll.ts:163` 的 `isTrustedBusRouter`(信任 `from ∈ {junshi, miaoji-poller, rll-term}`)+ owner gate。
- **危险动作二次确认**:rm/git push/发外/花钱 即使远程也需额外确认词,不被 allow 短路(destructive-guard 分类)。
- **多 session 防串台**:decision 文件按 `session_dir` 隔离;飞书卡片携 corr/`decision_id`;注入按 `decision_id` 绑定(`session_inject.py:99` 已校验"卡已更新?"陈旧拒绝)。
- **稳定 option id 解析**:飞书卡片渲染稳定 id(回 `A3-o1 / A3-o2`),回复解析**先按 id 确定性绑定**,LLM 自然语言解读仅兜底(修 R1 "A 对不上")。

---

## 实现映射(后续 code slice → 契约点)
| code slice | 契约点 |
|---|---|
| S-ask-cli | C-7, C-8 |
| S-hook-perm | C-2, C-3, C-9(危险) |
| S-hook-ask | C-1, C-3, C-5, C-6 |
| S-watcher-fill | C-6, C-7(回填) |
| S-testharness-nonblock | C-4, C-5 |
| S-feishu-card | C-9(稳定 id 渲染/解析) |
