# IM 多-session 接入:权限 + 开通自动化 研究 (飞书 / 企微)

> 研究日期 2026-06-22。目标:多 RLL session,每 session 一个 IM 群;群成员 = session-bot + 喵吉(监督) + 人;
> 人↔session **只走群聊**,喵吉**在群监督**(原则上读群内全部消息以执行安全门),直连仅限 session owner。
> 痛点:启动新项目 = 多一个 bot/群,手动太繁琐 + 管理员权限墙 → 能否程序化?怎么最丝滑?
> §128 知识新鲜度:本文为 WebSearch/WebFetch 拉官方文档结果,非训练记忆。引用 URL 见各条。

---

## 头条结论

| | **飞书 (Lark)** | **企微 (WeCom)** |
|---|---|---|
| 喵吉读**群内全部**消息 | ✅ 一个 scope `im:message.group_msg`(敏感,一次性管理员批) | ❌ 无轻量路径。appchat send-only;智能机器人只收 @;读全部须 **会话内容存档**(重型/RSA/合规) |
| 一个 app 服务**多群** | ✅ 无需每项目新 bot | ✅ appchat 一个 app 可建多群(≤1000群/天) |
| 每项目开通**程序化** | ✅ `POST im/v1/chats` 一调建群+拉 bot+加人,bot 自动入群,喵吉立刻读全部 | ⚠️ appchat 可建群,但 **app 收不到群内消息** → 监督模型在此断裂 |
| 一次性手动(管理员) | 建 app + 批敏感 scope + 发版(可设免审) | 建 app + 可信IP + 根部门可见 + 智能机器人回调 + (读全部)会话存档+RSA |

**= 群+喵吉监督模型:飞书优先(干净)。企微要么接受 @-触发输入(轻),要么上会话存档(重),无中间路。**

---

## 飞书 (Lark) — 详细

### A. 监督/读消息权限
- **喵吉读群内全部消息** = 自建应用 bot + scope **`im:message.group_msg`**。无此 scope 时 Feishu 只推 **@-提及** 的群消息(默认)。该 scope 为**敏感权限**,需管理员审批 + 发版生效。事件 = `im.message.receive_v1`。
  - 引用: https://open.feishu.cn/document/server-docs/im-v1/message/events/receive?lang=zh-CN
- **发信人身份**:payload `sender.sender_id` 含 `open_id`/`union_id`/`user_id`(user_id 需额外 `contact:user.employee_id:readonly`;open_id 总在)。→ 身份分层 authz 用 open_id。✅
- **自定义群机器人(webhook)= 只发不收**,无数据权限,不能跨群。→ 喵吉/session-bot 必须是**应用 bot**,不能用 webhook bot。

### B. 开通自动化(核心)
- **一个 app 的 bot 可入多群** → **无需每项目新建 app**。
- **可程序化 API**(均用 `tenant_access_token`):
  | 操作 | API | scope |
  |---|---|---|
  | 建群(名/描述/成员/owner) | `POST /open-apis/im/v1/chats` | `im:chat` 或 `im:chat:create` |
  | 拉成员/bot 入群 | `POST /open-apis/im/v1/chats/:chat_id/members` | `im:chat` 或 `im:chat.members:write_only`(`member_id_type` 支持 `app_id` 拉 bot / `open_id` 拉人) |
  - 建群一调可设 `name`/`user_id_list`(≤50)/`bot_id_list`(≤5)/`owner_id`/`set_bot_manager`,**请求方 bot 自动入群**。
  - 引用: chats/create + chat-member/create(已直接 fetch)
- **app 创建本身不可程序化**(开发者后台 UI;无 create-app API);发版需企业管理员审批;敏感 scope 须管理员批。**→ 硬阻塞(一次性)**。缓解:**免审**开关(管理员标 app/开发者/非敏感变更免审 → 后续重发版自动);测试应用里开发者=管理员、scope 申请即开通。
  - 引用: https://open.feishu.cn/document/develop-process/self-built-application-development-process?lang=zh-CN
- **token**:自建应用用 `tenant_access_token`(Bearer t-..., ≤2h,服务端刷新),`POST /open-apis/auth/v3/tenant_access_token/internal`(App ID+Secret)。
- **净结果**:一次性手动建 1 个 app + 批 scope;之后**每项目零后台**:取 token → 建群(成员=owner open_id,bots=session-bot+喵吉 by app_id)→ bot 自动入群 → 喵吉立刻读全部。

### C. 身份模型
- 一个共享 app 进多群:**bot 显示名 = 全局 app 名,各群相同**(无群名片)。可按 `chat_id` 路由不同 persona,但**显示名不能每群不同**。每 session 一个独立 app 才有独立名 → 但每 app 重撞 B 的硬阻塞。
- **建议**:不每 session 建 app;session 已有**专属群**当天然区分,显示名同名只是 cosmetic。app 数量上限官方未查到(unverified)。免费版 10000 API 调用/月(注意 fan-out)。

### D. 最丝滑(飞书推荐)
1. **一次性手动**:建喵吉 app(`im:message.group_msg`+`im:chat`/`im:chat:create`+`im:chat.members:write_only`+receive 事件,长连接)+ session-runner app(同 chat/member scope + group_msg + receive);管理员批 + 设免审。(若不需独立显示名,喵吉与 session-runner 可合一)
2. **每项目 `rll start <proj>`(全自动)**:token → `POST im/v1/chats`(name=项目,owner=人 open_id,bots=[session-runner, 喵吉] by app_id)→ bot 自动入群 → 喵吉立刻读全部。**零后台**。
3. session 区分靠群名+chat_id,接受同显示名。

### 飞书硬阻塞(不可自动,一次性)
1. 建 app(后台 UI,无 API)
2. 首次敏感 scope `im:message.group_msg` 批 + 发版(免审可让**后续**免,首次不可免)

---

## 企微 (WeCom) — 详细

### A. 监督/读消息(三种机制,差异大)
1. **群机器人 webhook = 只发不收**(确认无接收)。引用 path/91770。
2. **自建应用 接收消息**:只收**应用会话内**(用户在 app 里发给 app)的消息,**不收任意内部群聊**。引用 path/90238、90373。
3. **智能机器人(API)**:群里**仅 @-提及**才回调(不收未提及群聊);回调含 `from.userid`(创建者非超管时为**加密** userid)、`chatid`、`chattype`。引用 path/100719、101468。
- **读群内全部消息的唯一路径 = 会话内容存档**(独立重型合规功能,RSA-2048,SDK GetChatData,留存 90d–2y;独立 secret 在 管理工具→聊天内容存档)。引用 path/91774、91614。

### B. 开通自动化
- **一个 app 服务多群**:✅ `appchat` 一个自建 app 可建群(≤1000群/天,≤2000人/群)。
  | 操作 | API |
  |---|---|
  | 建群 | `POST /cgi-bin/appchat/create`(name/owner/userlist≥2) |
  | 改名/成员 | `POST /cgi-bin/appchat/update` |
  | 发群 | `POST /cgi-bin/appchat/send` |
  - 引用 path/90245、98913、90248。约束:**仅自建应用 + app 可见范围必须根部门**。
- **致命限制(打破期望拓扑)**:appchat 是**应用推送通道,非交互群** → **app 收不到成员在 appchat 里发的消息**。"成员能否自由打字"官方未明说(inferred);**已证实**=即便打字 app 也无接收回调。要成员可自由聊的真群得用 JS-SDK `createChat`(客户端触发,**不能服务端 headless 开通**)。引用 path/90248、94549。
- **app/智能机器人 创建 = 仅管理后台,无 API**(inferred from 文档缺失 + 一致后台 framing)。引用 path/95672。
- **token**:`gettoken?corpid&corpsecret`(7200s,每 app 独立 secret;会话存档另一 secret)。引用 path/90665。

### C. 身份模型
- 一个共享 app 多 appchat:群(chatid)区分,**bot 身份绑 app,各群同一发送者**,无每群别名(inferred)。
- 每 session 独立 app:有独立身份,但创建仅后台 + 各自 secret/可信IP/回调,高摩擦;app 上限未查到。

### D. 最丝滑(企微现实)
- 期望拓扑("群内人+session+喵吉,喵吉读全部")**企微难干净落地**:appchat send-only;智能机器人只见 @;读全部须会话存档。
- **轻路径**:一次性建 1 共享 app + 1 智能机器人(超管创建→明文 userid);每项目 `appchat/create` 建群+发;**人→session 输入须 @-提及智能机器人**(只有 @ 的才送达)= 轻量化的代价。
- **全监督路径**:上**会话内容存档**(管理员重型一次性) → 喵吉读全部。
- 非要群内自由人↔session 聊 → JS-SDK createChat 真群 + 会话存档,但 createChat 非 headless,更高摩擦。

### 企微硬阻塞(不可自动)
1. **会话内容存档**启用(后台 + RSA 公钥 + 独立 secret)— 读全部的唯一路径,重
2. 自建 app + secret 创建(后台,无 API)
3. 智能机器人 + 回调创建(后台;超管创建才得明文 userid)
4. 可信IP allowlist(后台,敏感 API 必需)
5. app 可见范围=根部门(后台,appchat API 必需)

---

## 对设计的影响 + 建议

1. **飞书优先实现群+喵吉监督模型** —— 平台原生支持读全部 + 程序化建群,且本机 lark-cli 已通(E1)。这是干净路径。
2. **provisioning UX 解了"手动太繁琐"**:一次性管理员建 1~2 个 app(+免审),之后 `rll start <proj>` **零后台**全 API 建群+拉 bot+加 owner。痛点消除。
3. **企微留作 phase 2 决策**:接受 @-触发输入(轻) vs 上会话存档(重)—— 这是后续要你拍的 trade-off,不阻塞飞书先行。
4. **身份**:不每 session 建 app(撞硬阻塞);共享 app + 专属群区分,接受同显示名(cosmetic)。

## 待用户决策
- D1. 飞书先行,企微留 phase 2?(建议:是)
- D2. 喵吉与 session-runner **合一个 app**(省一次性配置,同显示名)还是**两个 app**(喵吉/session 显示名可分)?
- D3. 企微最终走 @-触发(轻) vs 会话存档(重)?(可延后)

## Verified vs Unverified(摘要)
- **飞书 Verified**(直接 fetch 官方页):group_msg scope/@-default/sender_id;chats create+member API/字段/scope/auto-join;tenant_access_token;app 创建后台-only+管理员批。
- **飞书 Lightly verified**(官域搜索片段):webhook bot 只发不收+不跨群;免审/测试应用申请即开通;bot 无群名片;10000 调用/月。
- **飞书 Unverified**:每租户 app 数量上限(未找到官方数字)。
- **企微 Verified**:webhook 只发不收;智能机器人仅 @ 回调+from.userid(非超管加密);appchat create/update/get/send 端点/限额/自建+根部门;appchat app 不收成员消息;gettoken;会话存档读内部群+RSA+SDK+留存。
- **企微 Unverified/inferred**:app 创建仅后台(从缺失推断);appchat 成员是否被禁打字(官方未明说);共享 app 无每群别名;app 数量上限;会话存档需腾讯审批/付费(fetch 页未明说)。
