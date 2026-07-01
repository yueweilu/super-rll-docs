# D2 Phase 2 — Event Ingestion Architecture Design

**Status**: Design-only doc, written 2026-05-06 by Ralph per user's 5/6 directive 「37, 39, 40」 ordering. §39 sub-slice deliverable. Doc surfaces architectural decisions for user product-level pick; does NOT ship code.

**Authority**: This doc is a design proposal, not a contract. Once user picks path A or B (per §7 below), the picked path's §5 contract becomes a separate sub-slice's lock.

**Cross-references**:
- `docs/trustcoding-product-definition.md` — product vision (Goal 2: 灰度发布 + 真实数据反哺)
- `docs/rll-trustcoding-roadmap.md` — Capability Matrix + Goal 2 + Stage D2/D3 boundary
- `docs/trustcoding-gap-assessment-2026-05-06.md` — gap eval that flagged this fork
- `.rll/PLAN.md` §39 — canonical sub-slice scope
- `rll-team-platform/server/src/posthog-proxy.ts` — §33 backend that path B would extend
- `rll-team-platform/server/src/build-server.ts:295` `requireCookieIdentity` — operator cookie-auth seam (NOT for app ingestion)
- `rll-team-platform/server/src/auth.ts:12-16` — current `AuthIdentity{team_id, dev_id, token_hash}` shape

---

## §1 问题陈述

D2 Phase 1 已 ship: §29 (app_versions registry), §32 (PostHog deploy scaffold, currently blocked upstream), §33 (PostHog REST proxy + 4 flag CRUD routes), §34 (operator UI for flag management), §35 (operator manual + 6 真截图), §36 (quickstart cross-link). 290/290 server tests + 884/884 cli + 235/235 wecom-bot.

但用户 app 端**事件回流**到 PostHog 的路径还没设计. 没有事件回流, 就没有 cohort 数据 → §40 cohort dashboard 无数据可显示 → 用户 5/5 evening 原话 "内测阶段要强大数据分析和运营能力" 落空.

D2 Phase 2 的核心架构决策: **事件从用户 app 进入 PostHog 走哪条路**. 两条主流候选:

- **路径 A**: `app → PostHog` (PostHog SDK 直连, 平台不在 pipeline 上)
- **路径 B**: `app → platform → PostHog` (platform capture endpoint 居中, 平台在 pipeline 上)

两条路都有效, 选择取决于权衡: audit/合规/可控 vs 简单/解耦/cost. 这一份 doc 把权衡点摊出来让用户拍板.

---

## §2 架构候选

### §2.1 路径 A — PostHog SDK 直连

```
┌────────────────────┐
│  end-user app      │  posthog-js / posthog-python / posthog-go / 等等
│  (Settings 配置:    │
│   project_key+host)│
└─────────┬──────────┘
          │  HTTP POST events directly
          ▼
┌────────────────────┐
│  PostHog instance  │
│  (self-host or     │
│   PostHog Cloud)   │
└─────────┬──────────┘
          │  REST query (already shipped via §33 proxy)
          ▼
┌────────────────────┐
│  trustcoding       │
│  platform server   │  flag rule CRUD only
└────────────────────┘
```

**怎么对接当前实现**:
- §34 Settings UI 已经收集 `posthog_project_key` (公钥, 安全嵌客户端 SDK) + `posthog_host`. 用户在 Settings 填好 → operator 把这两个值放进 app 端 SDK init.
- §33 后端**完全不变**. PostHog REST proxy 只用于 flag rule CRUD, 不在事件路径上.
- §29 `app_versions` registry 仍由 deploy hook 调 `POST /web/api/team/app-versions`, 跟事件流并行.

**优点**:
1. **简单**: 0 server-side ingestion code. 无需新路由 / 新存储 / 新 auth.
2. **解耦**: PostHog SDK 已有 25+ 客户端 lib (web/mobile/server/desktop), 维护成本归 PostHog.
3. **PostHog SDK 成熟**: batching / offline-queue / retry / GDPR consent / session replay 等高级特性免费拿到.
4. **降级**: PostHog 挂时事件丢失但不影响 app 主功能 (SDK 默认 fire-and-forget).
5. **跟当前 §34 UI 100% 兼容**: Settings 不改; operator 配 PostHog 后立即能用.

**缺点**:
1. **平台无 audit**: 事件不经过平台, 平台看不到 PostHog 收了啥. 合规审计盲区 (例如 PII 误上报无法事后追溯).
2. **数据治理弱**: 没法在平台层统一 filter 敏感字段. data minimization 必须由 app 自己实现.
3. **GDPR 用户删除请求**: 事件存在 PostHog, 平台不掌握 → 必须直接调 PostHog API 删, 平台没"全权代理"能力.
4. **Project Key 公开 + 客户端可见**: 任何看到 app 网络流量的人都能看到 project_key (PostHog 设计如此; 公钥仅用于上报, 不是查询授权). PostHog 自己的安全模型靠的是 capture 端 spam-defense, 不是 key 保密.
5. **跨 team 数据隔离**: 一个 app 上线后, project_key 写死在客户端; 客户端版本更新前不可换. 一旦泄露不易换.

### §2.2 路径 B — platform capture endpoint

```
┌────────────────────┐
│  end-user app      │  custom thin SDK (or PostHog SDK with custom host)
│  (Settings 配置:    │
│   ingest_token +   │
│   platform host)   │
└─────────┬──────────┘
          │  HTTP POST events to platform
          ▼
┌────────────────────┐
│  trustcoding       │   /ingest/v1/capture (NEW route, NOT /web/api/*)
│  platform server   │   独立 app-facing auth middleware
│                    │   PII filter / rate limit / audit log
└─────────┬──────────┘
          │  fan-out to PostHog REST capture API
          ▼
┌────────────────────┐
│  PostHog instance  │
└────────────────────┘
```

**关键 auth contract gap (Lisa narrow)**:

不能用现有 `/web/api/*` seam. `rll-team-platform/server/src/build-server.ts:295` 的 `requireCookieIdentity` + `auth.ts:12-16 AuthIdentity{team_id, dev_id, token_hash}` 是 **team-operator cookie-auth web UI** 模型, 适合 operator 登录后的 web console (设置 PostHog / 看任务列表 / etc), **不**适合 end-user app 在生产流量里打 event ingest. End-user app 在生产流量里没有 operator 的 HTTP-cookie session.

Path B 必须先定义独立的 **app-facing ingestion auth contract**. 候选:

- **(a) app-scoped capture token** — per-team-app-scoped token, 写在 SDK init. Token 在 platform Settings UI 生成 (sealed-box 加密入 `secrets` 表 sibling 模式), app 端 plaintext init 时携带. PostHog Cloud 自己用的是公开 project_key, 不是 token; 但平台 capture endpoint 可以 raise the bar — 用 token 换更细的 rate-limit / audit / per-app revoke. 操作员可在 Settings 一键 rotate / revoke 而不重发 app 客户端.
- **(b) version-key signed ingest** — 每次 deploy 生成 ephemeral signing key (per (team, app, version)), app 用 key sign event payload. 平台验签 + drop-in-period 过期. 强 audit, 但 SDK 端复杂度高.
- **(c) PostHog-shape `Authorization: Bearer phc_...`** — 直接借 PostHog project_key 模型, 平台只做 透传 + filter. 无独立 token 管理, but bind 到 PostHog 的 key model.

(a) 是最常见的 SaaS ingestion 模型 (Datadog / Honeycomb / Snowflake / etc). (b) 强但复杂. (c) 简单但失去独立治理. **设计 doc 推荐 (a)** 作为 Path B 的初始 auth contract; 用户可在 §7 拍板里确认或换.

**优点**:
1. **审计完整**: 平台收到每个事件, audit log + per-team 数据可观测.
2. **数据治理**: PII filter 可在平台层统一实施 — 例如某 team 所有事件先 mask phone/email 字段再上送.
3. **GDPR 用户删除请求**: 平台掌握事件副本 (audit), 可主动删除 PostHog + 本地 audit. 全权代理.
4. **Per-app token revoke**: token 一键 invalidate, app 必须重发 SDK init or be locked out. project_key 做不到这一点.
5. **可降级**: 平台可缓存事件本地 (queue 模式), PostHog 挂时仍记录, 恢复后批量补发.
6. **可替换 PostHog**: 因为 app 不直连 PostHog, 平台可在背后切换到其他 backend (e.g. C4 选项里的 Plausible/Umami 评估) 而 app 端 SDK 不动.

**缺点**:
1. **NEW server work**: capture endpoint route + 独立 auth middleware + storage / queue / fan-out / rate-limit 全要写. 估 ~3-5 sub-slice.
2. **Latency +1 hop**: 每事件多走平台一跳. 实际影响 ~10-50ms 平均, 极端百毫秒.
3. **平台 cost**: events queue/store 占 disk/memory; 上量后是真成本.
4. **Backpressure 处理**: PostHog 挂时事件累积谁负责丢弃? 平台需明确 SLO 和 disposal policy.
5. **客户端 SDK 写 / 维护**: PostHog 25+ 客户端 lib 不能直接用 (PostHog SDK 默认打 PostHog REST), 需 custom thin SDK or PostHog SDK 配置 custom host. **新 cost vector**.

---

## §3 详细对比矩阵

| 维度 | 路径 A (SDK 直连) | 路径 B (platform 居中) |
|---|---|---|
| **Audit 完整性** | ❌ 无 | ✅ 完整 |
| **PII filter / 合规 (GDPR / 等保)** | 🟡 由 app 自己实现 | ✅ 平台层统一 |
| **GDPR 用户删除请求** | 🟡 直调 PostHog API | ✅ 平台代理 |
| **延迟** | ✅ 直连 (~50ms) | 🟡 +1 hop (~80-100ms) |
| **Server cost** | ✅ 0 (PostHog 全担) | ❌ events queue/store 上量后真贵 |
| **SDK 兼容性** | ✅ PostHog 25+ lib 免费用 | 🟡 必须自己写 thin SDK or 配置 PostHog SDK custom host |
| **数据可控 (跨 team / 跨 app revoke)** | ❌ project_key 嵌客户端不可换 | ✅ ingest_token 一键 rotate |
| **降级 (PostHog 挂时)** | ❌ 事件丢失 (SDK fire-and-forget) | ✅ 平台 queue, 恢复后批量补发 |
| **PostHog backend 替换** | ❌ app 客户端绑死 | ✅ 平台层无感切换 |
| **维护成本** | ✅ 0 (归 PostHog) | ❌ ~3-5 sub-slice 实现 + 长期持续 |
| **Mock 测试** | ✅ §34 mock-posthog 已覆盖 | 🟡 需新 mock-capture-endpoint fixture |
| **跟当前 §33+§34 兼容** | ✅ 无变化 | 🟡 §33 添 capture seam, §34 Settings 加 token UI |
| **C2 (PostHog deploy 暂缓) 兼容性** | 🟡 需新增 direct-ingest mock seam — 现 `mock-posthog.ts` 只覆盖 feature-flag REST (`/api/projects/{id}/feature_flags[/key]`), 不是 app SDK 事件 ingestion target. C1/C3 (真 PostHog) 通; C2 模式下 app 事件无法落. | 🟡 需新增 mock-capture-endpoint fixture (跟 §34 mock-posthog 平行扩展) |

---

## §4 推荐 + 理由

### 我的偏好 (Ralph): **路径 A 第一阶段**, **路径 B 留 Stage D3**

**Phase 2a (推荐立即做)**: 路径 A.

理由:
1. D2.1B 契约价值 (feature-flag CRUD) 已 100% 通过 §34 mock-posthog 锁住. 路径 A 让 D2.1B 在 C1 (PostHog Cloud) / C3 (forked image) 模式下真用户立即跑通, 0 新 server code. C2 (mock-only) 模式下 app 事件无法落 — 需补 direct-ingest mock seam (single sub-slice, ~50-80 SLOC).
2. 实现简单 → 快速到达"app → PostHog → 平台聚合" 的最小可用闭环, 用户内测能用上.
3. 如果 PostHog 上游 hobby self-host 修了 / 用户选 C1 PostHog Cloud, 路径 A 立即跑.
4. SDK 25+ lib 免费用 (vs 路径 B 自己写 SDK 是新 maintenance burden).
5. 跟当前 §34 UI 100% 兼容, Settings 不改.

**Phase 2b (Stage D3 阶段加)**: 路径 B as overlay.

理由:
1. 当 audit/合规真需求出现 (e.g., 某客户要 SOC 2 合规、GDPR 删除请求规模化), 再加 capture endpoint.
2. 那时候平台已经积累 D2 阶段的真实事件量数据, 知道 SLO 和 cost 边界.
3. 路径 B 不破坏路径 A: app 可继续直连 PostHog, capture endpoint 是 opt-in 的 audit-mode (per-team Settings toggle).
4. Auth contract (a/b/c) 那时候有真使用场景定夺.

### 用户产品级决策点 (gap-eval doc §8 fork #2)

如果用户**强 audit/合规**优先, 则反过来: **直接路径 B**, 接受 ~3-5 sub-slice cost.

如果用户**简单/快速 上线**优先, 则**路径 A** + 留 D3 加 audit overlay.

---

## §5 实现 contract (locked once user picks)

### 路径 A — 实现 contract

**No server changes**. 以下是 ship 的 deliverables:

1. **SDK 集成模板** — 给 4-5 主流语言的 PostHog SDK 1-line init 例子 (TypeScript / Python / Go / Java / Swift / Kotlin):
   ```ts
   posthog.init('<posthog_project_key>', { api_host: '<posthog_host>' });
   ```
2. **Settings UI 文档** — 在 §35 D2 manual `§8.1` 后续 (新 §8.1.1) 加一节 "怎么把 Settings 配的 project_key 给 app SDK". 截图 + 步骤.
3. **客户端 SDK 兼容矩阵** — 列 PostHog 官方 SDK 各版本兼容性 + 我们推荐的 minimum version.
4. **可选: SDK auto-injection helper** — §41 candidate sub-slice. trust 平台从 `posthog_project_key` + `posthog_host` 自动生成 SDK init 代码片段, 嵌入 deploy hook.

### 路径 B — 实现 contract (待用户拍 a/b/c)

1. **NEW route**: `POST /ingest/v1/capture` (NOT `/web/api/*`).
2. **NEW auth middleware** (依用户拍 a/b/c):
   - **(a) capture token**: 新表 `app_capture_tokens(team_id, app_name, version, token_hash, scopes, created_at, revoked_at)`. Settings UI 加生成/列表/revoke. SDK 端 `Authorization: Bearer ssrll_capture_<token>`.
   - **(b) version-key signed**: 每次 `POST /web/api/team/app-versions` 调用响应里附 ephemeral signing key, app SDK init 时携带, 每次 capture 调用 sign 一次. 平台验签 + drop-in-period.
   - **(c) PostHog-shape**: 直接复用 `posthog_project_key`, 平台只是 thin proxy + audit log.
3. **NEW storage / queue strategy**: 决定是同步透传 PostHog (简单, 但 PostHog 挂时丢事件) 还是先入 audit log + queue + 异步 fan-out (强 SLO, 但 disk/cost).
4. **NEW Settings UI delta**: token 生成/rotate UI (per `secrets` 表既有 sealed-box 加密 seam). 错误 UX 包含 token 状态.
5. **NEW mock-capture-endpoint test fixture**: 用于 §34 现有 Playwright spec 平行扩展.
6. **NEW manual smoke**: §2.4 in `rll-team-platform/docs/manual-smoke-test.md` covering capture path success / 401 / rate-limit / fan-out failure.
7. **Audit dashboard** — Stage D3 范畴.

---

## §6 不在范围内 (留作 follow-up sub-slices)

- **SDK 模板自动注入** — §41 candidate. 集成到 deploy hook, 自动生成 SDK init code based on Settings 配置.
- **Cohort dashboard** — §40. 路径 A 模式下消费 PostHog 已有 cohort API; 路径 B 模式下消费平台聚合数据 (后续).
- **Audit 视图** — Stage D3 范畴, 仅在路径 B 模式下有意义.
- **Replace PostHog** (C4 strategy in gap-eval) — 路径 B 模式下相对容易; 路径 A 模式下需重新设计 SDK.
- **PostHog deploy strategy (C1-C4)** — gap-eval flagged separately. 路径 A vs B 决策与 deploy 选择正交.

---

## §7 用户拍板检查项

请按 yes/no 回答下列问题, 拍板后此 doc 锁定:

1. **路径选择**: A (SDK 直连) 还是 B (platform 居中)?
   - **Ralph 推荐**: A 第一阶段 + B 留 Stage D3.
2. **如果选 B, auth contract 哪个**: (a) capture token / (b) version-key signed / (c) PostHog-shape?
   - **Ralph 推荐**: (a).
3. **如果选 B, storage strategy 哪个**: 同步透传 PostHog / 先入平台 queue 异步 fan-out?
   - **Ralph 推荐**: 同步透传 (PostHog 挂时事件丢失可接受第一阶段; queue 留长期).
4. **如果选 A, SDK auto-injection (§41) 哪个语言先做**: TypeScript / Python / Go / Java / Swift / Kotlin?
   - **Ralph 推荐**: TypeScript (最常见 web/server 上手); Python/Go 第二批.
5. **跟 PostHog deploy 决策 (C1-C4) 关系**: 路径选择是否依赖 deploy 决策?
   - **Ralph 答**: 部分依赖. 路径 A 在 C1 (PostHog Cloud) / C3 (forked image) 模式下立即跑; C2 (mock-posthog only) 模式下需补 direct-ingest mock seam (现 `mock-posthog.ts` 只覆盖 feature-flag REST). 路径 B 在 C1/C3 跑, C2 模式下需补 mock-capture-endpoint fixture (跟 §34 mock-posthog 平行).

---

**最后更新**: 2026-05-06.
**Sub-slice ledger**: 见 `.rll/PLAN.md` §39 active row + body. 截至此 doc, §1-§38 closed mutual CONSENSUS, §37 + §B closed negative (deploy 待 C1-C4 user pick), §39 [CODE] 已 ship 此 doc 作为 design lock.
