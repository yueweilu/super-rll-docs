# Trustcoding Gap Assessment — 2026-05-06

**Status**: Strategic eval, written 2026-05-06 morning by Ralph per user directive "修完 bug 以后, 评估当前状态和 trustcoding 还有哪些差距", re-prioritized AHEAD of §37 PostHog deploy work so the eval drives next sub-slice ordering rather than the other way around.

**Authority**: This doc is a snapshot eval, not a contract. Canonical sources still:
- `docs/trustcoding-product-definition.md` (vision + Gate 1/2 + 8-phase TDD)
- `docs/trustcoding-project-lifecycle.md` (Phase 1-8 详细契约)
- `docs/rll-trustcoding-roadmap.md` (Capability Matrix + Two Scenarios + Golden Path + Exit Criteria)
- `.rll/PLAN.md` (sub-slice ledger)

If this doc and a canonical source disagree, the canonical wins.

---

## §1 方法

我对账的过程:
1. 读 `docs/trustcoding-product-definition.md:1-115` 抽 Goal + 信任契约 + 胞核/外围模型.
2. 读 `docs/trustcoding-project-lifecycle.md:9-184` 抽 8-phase 详细契约 + Gate 1/2 卡尺 + 跨阶段规则.
3. 读 `docs/rll-trustcoding-roadmap.md:1-162` 抽 Capability Matrix (§1) + Two Scenarios (§2) + Golden Path (§3) + Exit Criteria T1-T7 (§4) + Sub-slice queue #1-#9 (§5).
4. `git log --oneline -25` (super-rll + rll-team-platform 双侧) 跟 `.rll/PLAN.md` §1 active table 对账, 看 closed sub-slices 是否真 commit.
5. 列已 ship vs 应 ship, 按 Phase / Goal / 严重度切片.
6. 给 ordered backlog 推荐.

工具: `rg` / `grep` / file:line 引用. 不依赖记忆, 全锁源.

---

## §2 八阶段 TDD 工作流覆盖度

按 `docs/trustcoding-project-lifecycle.md:9-145` 的 Phase 1-8 卡尺评估. **核心判据**: 每阶段是否有产品级机制锁定其 deliverable (不是 "未来可以做").

### §2.1 Phase 1 (需求定义) + Phase 2 (架构设计) + Phase 3 (测试设计 ★ Gate 1)

**status: ✅ 完整 (Gate 1 锁完整)**

证据:
- `cli/src/commands.ts` ralph-lisa-loop 已实现 [PLAN] / [RESEARCH] / [CODE] / [FIX] / [CONSENSUS] tag 协议; 双 CONSENSUS 锁是项目工作流核心机制.
- Phase 3 卡尺 "test_spec 双 CONSENSUS 锁定" 由 sub-slice #8 (`tdd-gate`) 实现 (per `rll-trustcoding-roadmap.md:147`); 通过 `rll_launch` accept test spec → loop runs layered tests at appropriate stages. 已 closed.
- 实证: 本周 §33 / §34 / §35 / §36 / §37 / §38 全走 [PLAN] → Lisa NEEDS_WORK → [FIX] → CONSENSUS 路径; 多次 Lisa 抓到 plan-level contract drift (如 §38 Gate 2/Phase 7 误混) 在 Phase 3 阶段就拦下.

**gap**: 无 (这是 trustcoding 最成熟的 phase, 已经在生产中迭代多周).

### §2.2 Phase 4 (实现)

**status: ✅ 完整**

证据:
- quality-gate (`cli/src/commands.ts:1198` `--full-uaot`) 在每 round CODE 后跑.
- watchdog 自动重启 hung watcher (`.dual-agent/watchdog.sh`).
- T2 headless engine mode (`cli/src/test/headless-engine.test.ts`) 让 Lisa review 不依赖 tmux, sub-slice #3 closed.
- T6 tdd-gate (sub-slice #8) 让 Phase 4 每 round 跑分层测试 (unit→integration→functional).

**gap**: 无, Phase 4 完整.

### §2.3 Phase 5 (测试环境部署)

**status: 🟡 部分 — preview env 概念存在, 但**实际 preview env 启动**自动化空白

证据 (有的部分):
- `cli/src/commands.ts` smoke-check 命令存在.
- `rll-team-platform/server/test/e2e/web/` Playwright spec 框架存在 (login.spec.ts / dashboard.spec.ts 等), 配 `helpers/fixture-server.ts` 起 real fastify.
- `deploy/posthog/docker-compose.yml` 存在 (§32 ship); 是 preview env 的雏形.

**gap**:
- Phase 5 卡尺 (a) "preview URL / staging endpoint accessible" 没有自动化路径 — 用户得手动 docker compose up.
- Phase 5 卡尺 (b) "smoke test PASS 在真环境" — 当前 PostHog 自托管 docker 卡上游 IndexError (§37 deferred), preview env 起不来.
- `deployment-smoke.md` 模板没生成机制.

**严重度**: P1. 不阻塞当前 sub-slice (mock fixture 走得通), 但阻塞 "走完 Phase 5 → Gate 2 → Phase 7" 真闭环.

### §2.4 Phase 6 (用户文档) ★ Gate 2 (上线门禁)

**Gate 2 严格 = Phase 6 user-doc gate** per `docs/trustcoding-project-lifecycle.md:103-117`. 不混入 Phase 7 production monitoring (Lisa 确认锁定的 split).

**status: ✅ Gate 2 实质完整 (在 D2 数据闭环范围内)**

按 Gate 2 卡尺逐条评估:
- (a) **截图真实** ✅ — §35 ship 6 张 Playwright 真截图 (`rll-team-platform/docs/screenshots/d2/01-06-*.png`), spec `server/test/e2e/web/d2-screenshots.spec.ts` reproducible, mock-posthog driven through real Settings UI flow. 不是 mockup, 不是 INSERT 假数据.
- (b) **关键功能覆盖** ✅ — Settings observability + secrets + Feature Flags empty + list + create dialog + edit dialog 都有截图. 跟 §33/§34 backend+UI 验收标准对得上.
- (c) **文字描述跟截图一致** ✅ — `rll-team-platform/docs/d2-data-loop-user-manual.md` §8.1-§8.7 每张图都有对应文字注释 + API mapping.
- (d) **用户视角** ✅ — §6 用 "点这个按钮" / "填这个字段", 不是 "调用 PUT /web/api/team/secrets/posthog_personal_api_key" 这种开发者视角.
- (e) **没有内部 planning 路径 leak** ✅ — manual 不引 `.rll/PLAN.md`, 不写 round arc / sub-slice 编号面向用户.

§35 的反向作用也起到了: 写文档过程中发现 fixture-server.ts 缺 serverKeypair parity (写 §35 e2e spec 时 secrets 路由 500 暴露的), 这是 Gate 2 反向验证 Phase 5 的实例.

§36 ship 后 quickstart.md + manual-smoke-test.md 也 cross-reference 进了 D2 manual, 入口完整.

**gap (在 Gate 2 范围内)**: 无.

**注意**: Gate 2 完整 ≠ 整个产品上线 ready. Phase 7 还有独立 gap (见 §2.5).

### §2.5 Phase 7 (生产部署 + 灰度 + 监控)

**status: 🔴 大空白**

按 Phase 7 卡尺逐条评估:
- (a) **deploy hook 接 git push → CD** ❌ — 没有任何 CD pipeline; 7 个 RLL codebase 都没有 `.github/workflows/` (per `rll-trustcoding-roadmap.md:33`).
- (b) **PostHog feature flag rule 写入** 🟡 — backend (§33) + UI (§34) ship; 真 PostHog 自托管 docker blocked (§37 deferred, A 候选 image tag `posthog/posthog:posthog-live-latest` 已 research).
- (c) **Sentry / OpenTelemetry alert 配置** ❌ — 完全没接.
- (d) **灰度策略 (5%/25%/50%/100% 阶梯)** ❌ — 没实现; PostHog flag rule 是手动配, 不是 monitoring-driven.
- (e) **rollback playbook** ❌ — 没写.

**严重度**: P0/P1 mix. 真要 production deploy, 至少 (a)+(c)+(e) 必须 ship. 内测阶段可以用半 ship 状态先跑 (UI 已经能配 flag, 但没监控阻断).

### §2.6 Phase 8 (数据反哺迭代)

**status: 🟡 部分**

证据 (有的部分):
- Per-task retrospective: sub-slice #9 (`tdd-retrospective`) closed, 结构化 post-CONSENSUS report + per-round test result curves + harness registry + context injection. 这是 RLL 工作流自身的反哺.
- `rll-team-platform/server/src/analytics.ts` + analytics 4-phase pipeline (sub-slice closed) 提供 task-level 数据视图.
- D2 backend (§33) + UI (§34) 让 platform 收 + 透传 PostHog flag rule.

**gap**:
- D2 Phase 2 event ingestion 完全没动. 用户 app 怎么把事件送回 PostHog? PostHog SDK 直连(不经平台), 还是 platform 加 capture endpoint? 设计未锁.
- Cohort dashboard / 运营数据视图 0%. 用户 5/5 evening 原话 "内测阶段要强大的数据分析和运营能力" 没实现.
- SDK app_version auto-injection 0%. 用户 app 启动时怎么自动登记版本到 platform `/web/api/team/app-versions`? 当前 manual curl, 没 SDK helper.
- 自动 task 触发 (data → 自动开 sub-slice) 未实现.

**严重度**: P0 for 内测阶段 (per 用户明确诉求).

---

## §3 Goal 维度对账

按 `trustcoding-product-definition.md:1-50` 的核心 Goal 评估.

### §3.1 Goal "TDD 8 阶段端到端"

**status: 5/8 phase 完整, 2/8 部分, 1/8 大空白.**

完整 (5): Phase 1, 2, 3 (Gate 1), 4, 6 (Gate 2).
部分 (2): Phase 5 (preview env 自动化缺), Phase 8 (per-task retrospective ship; per-app/cohort/SDK 缺).
大空白 (1): Phase 7 (production+灰度+监控).

### §3.2 Goal "双门禁信任 (Gate 1 + Gate 2)"

**status: ✅ 完整 (在 D2 数据闭环范围内)**

- **Gate 1 (Phase 3 测试设计)** ✅ 完整: test_spec 双 CONSENSUS 锁机制实现 (sub-slice #8 closed). 实证: 本周 §33-§38 全走 Gate 1.
- **Gate 2 (Phase 6 user-doc)** ✅ 完整: §35 + §36 ship 后所有卡尺过 (per §2.4 评估).

**Phase 7 production hardening 跟 Gate 2 status 无关** (per Lisa narrow). 那是 Phase 7 单独 gap, 见 §2.5.

### §3.3 Goal "灰度发布 + 真用户数据反哺" (Goal 2 from product-definition)

**status: 🟡 30% (backend 和 UI 都通, 真 deploy + SDK 集成空白)**

- Platform backend: §33 ship (secrets table sealed-box + REST proxy + 4 flag CRUD routes + mock-posthog fixture, 10/10 route cases). ✅
- Platform UI: §34 ship (Settings + Feature Flags page + 11 DOM-grep cases). ✅
- 用户文档: §35 + §36 ship (D2 operator 手册 + quickstart cross-link + 6 真截图). ✅
- 真 PostHog 自托管 docker: ❌ blocked on PostHog upstream `events_sample_by` IndexError; §37 deferred. PR #40402 修了, 候选 image tag `posthog/posthog:posthog-live-latest` 待验.
- Cohort dashboard / 运营数据视图: ❌ 0%.
- SDK auto-injection: ❌ 0%.
- 灰度阶梯 monitoring-driven (5%/25%/50%/100%): ❌ 0%.

### §3.4 Goal "多代理协作" (Goal 3 / Stage D3)

**status: ❌ 0%**

未启动. 当前是 Ralph + Lisa 双 agent. 多代理协作 (e.g. 多个 Ralph 处理不同 sub-tasks 并发, 或 sub-Lisa 专项 review) 是 Stage D3 范围, 未设计未实现.

### §3.5 Goal "跨 team 共享" (Goal 4 / Stage E)

**status: ❌ 0%**

未启动. 当前 multi-team isolation 是 SQL `WHERE team_id = ?` 强隔离 (per §29 + §33 routes). 跨 team 共享 (e.g. 工具/template/test-spec/retrospective 跨 team 复用) 未设计.

---

## §4 RLL 胞核 vs 外围组件 status

按 `trustcoding-product-definition.md` 关系图评估.

### §4.1 RLL 胞核 (`cli/`)

**status: ✅ 完整, 884/884 tests** (verified 2026-05-06 via `cd cli && npm test`; roadmap §1 line 11 numbers `815 tests` are stale roadmap-era).

完整功能: ralph-lisa-loop 协议 / plan-keeper / quality-gate / watchdog / auto-step-ref / wecom-feedback / cross-platform engine (tmux + headless + 5 候选 backend).

**gap**: 无核心功能缺. 7 候选 backend (SplitUI / WtUI / Wezterm / Zellij / node-pty Pseudoterminal) 中只有 TmuxUI + headless 真 ship; 其他候选只是 backend matrix doc 中的 "可换" 选项, 未实.

### §4.2 调度 + 隔离 (`rll-team-platform/server` + `worker-base`)

**status: ✅ 完整**

- 290/290 unit tests (本周 §33-§35 加的 +43); 162 integration tests; cross-codebase E2E (sub-slice #6 / G3 closed).
- worker-base Docker (G1 closed, ralph-lisa 0.6.1 installed).
- devcontainer-cli 起隔离 worker container.

**gap**: production hardening 范畴 (Phase 7), 不是 §4.2 本身的 gap.

### §4.3 入口 (MCP / `rll-stack` extension / `rll-cli`)

**status: ✅ 完整**

- MCP tools (`rll_launch` / `rll_submit` / `rll_recall` / `rll_handoff` / `rll_my_tasks`) ship; rll-stack-team / rll-cli ship.
- T4 / sub-slice #4 `rll-stack-mcp-tests` **closed**: `rll-stack/src/test/session.test.ts:2` 头部明示 "T4 session tests — session persistence + round context + file:line citation"; line 83-194 三个 describe 分别覆盖 session persistence + round context restoration + file:line citation passthrough. roadmap §1 line 31 "10 existing tests cover 不到这些" 是 stale prose pre-#4-closure, 实际 tree 已经覆盖.

**Source-of-record inconsistency note**: `rll-trustcoding-roadmap.md:31` 列的 "rll-stack/ 未测" gap 是 sub-slice #4 closed 之前的 snapshot. roadmap §5 line 140 + line 4 ("Sub-slices #1-#9 all complete") 反而对. 这是 roadmap §1 prose 跟 §5 sub-slice queue 自相矛盾, 应该整理 (但不是本 §38 doc 的 scope, 本 doc flag 一下而已).

### §4.4 通信 + 介入 (WeCom + 语音 hook + email)

**status: 🟡 部分**

- WeCom 双向 ✅ ship (sub-slice §28 task-event-wecom-bridge + wecom-bot v0.x.1-v0.x.5 backlog).
- Local voice (Swabble macOS daemon) ✅ ship (`[语音]` prefix tmux send-keys; aliyun-asr-engine 二片).
- email 介入: ❌ TBD per product-definition.md 关系图.

**gap**: email 通道未实, 长期不阻塞内测.

### §4.5 持久 + 闭环 (audit + retrospective + SQLite WAL)

**status: ✅ 完整**

audit JSONL append-only / per-task retrospective / SQLite WAL / multi-team isolation 全 ship. sub-slice #9 (tdd-retrospective) closed.

### §4.6 部署 + 灰度 (PostHog flag rule + Sentry)

**status: 🟡 30%**

PostHog flag rule: backend+UI ship, 真 deploy blocked (§4.6/§3.3 重叠).
Sentry: ❌ 完全没接.

### §4.7 数据反哺 (analytics + 自动 task 触发)

**status: 🟡 部分**

analytics 4-phase pipeline ship (per-task 视图); **per-app 用户数据 (PostHog 收 → platform aggregate) 0%**; 自动 task 触发 0%.

### §4.8 跨平台 Terminal Backend

**status: 🟡 (TmuxUI + headless ship, 5 候选未实)**

TmuxUI macOS+Linux ship; headless engine cross-platform ship; SplitUI / WtUI / Wezterm / Zellij / node-pty Pseudoterminal 全是候选 (`docs/cross-platform-terminal-backend-matrix.md`), 未真实现.

---

## §5 Two Scenarios A/B status

按 `rll-trustcoding-roadmap.md:38-58` 评估.

### §5.1 Scenario A — Team Path (canonical)

**status: ✅ Golden Path 结构通 (G1+G2+G3 close per sub-slice #2+#3+#6)**

实证: cross-codebase E2E test (`server/test/integration/cross-codebase-e2e.test.ts`) 跑 dispatchTask → container → CONSENSUS → branch push → `git ls-remote` 验 remote ref. 结构通.

**gap**: production-grade hardening (Phase 7 范畴): TLS / domain / backup / multi-instance / 监控 / CI/CD across codebases — 全空.

### §5.2 Scenario B — Local Path (parallel, out of scope)

**status: ✅ ship, 但 core engine 有 gap**

- 10 tests (`rll-stack/`).
- per `rll-trustcoding-roadmap.md:31`: core MCP session persistence + round context + file:line citation 未测.

**gap**: Scenario B 不是当前 trustcoding canonical path (用户走 Team Path), 优先级 P2.

---

## §6 Risk / Blocker 清单 (按 severity)

### §6.1 P0 — 阻塞内测 (per 用户 5/5 evening "内测阶段要强大数据分析和运营能力")

| 项 | 当前状态 | 候选 unblock |
|---|---|---|
| **PostHog 自托管 docker deploy** | §37 deferred; PR #40402 修了 events_sample_by IndexError; 候选 tag `posthog/posthog:posthog-live-latest` | 1 sub-slice (跑 §37 [CODE] + 真 docker compose up + 验 health) |
| **Cohort dashboard / 运营数据视图** | 0% | 1-2 sub-slice (server query + UI + tests) |
| **SDK app_version auto-injection** | 0% | 1 sub-slice (写 SDK helper + sample app + docs) |
| **D2 Phase 2 event ingestion** | 设计未锁 (PostHog SDK 直连 vs platform capture endpoint) | 先 1 [PLAN] sub-slice 锁 design, 再 1-2 [CODE] sub-slice 实现 |

### §6.2 P1 — 阻塞 production (Phase 7 gap)

| 项 | 当前状态 | 候选 unblock |
|---|---|---|
| **Production hardening** (TLS / domain / backup / multi-instance) | 0% | 1 sub-slice per item, 总 3-4 sub-slice |
| **Sentry / OpenTelemetry 监控接入** | 0% | 1 sub-slice |
| **rll-core/ zero self-tests** (foundation library 风险) | per roadmap §1 已 flag; sub-slice #1 `rll-core-tests` per roadmap §5 marked complete in §4-line-4 batch — but tree-level verify 仍待: `find rll-core/src -name '*.test.ts'` 在 production code 上仍 0 (per Capability Matrix §1 row). 这是 roadmap §1 prose vs §5 queue 不一致的另一例. | 先核 sub-slice 真 closure 状态 (1 round 内); 若实际未补则跑 T3 (≥30 case) |
| **CI/CD across 7 codebases** (no `.github/workflows/`) | per roadmap §1 已 flag | 1 sub-slice (T5 / sub-slice #5 `ci-cd-foundation`) |
| **灰度阶梯 monitoring-driven** | 0% | 1 sub-slice (集成 PostHog flag rule + Sentry alert) |
| **Rollback playbook** | 0% | 1 sub-slice (写 deploy/rollback.md + 流程演练) |

### §6.3 P2 — 阻塞规模

| 项 | 当前状态 | 候选 unblock |
|---|---|---|
| **多代理协作 (Stage D3)** | 0% | 1 大设计 sub-slice + N 个实现 sub-slice |
| **跨 team 共享 (Stage E)** | 0% | 1 大设计 sub-slice + N 个实现 sub-slice |
| **5 候选 terminal backend (SplitUI / WtUI / Wezterm / Zellij / node-pty)** | 候选未实 | 1 sub-slice per backend, 长期 |
| **email 通道** | 0% | 1 sub-slice 长期 |
| **Scenario B core engine gap** | per roadmap §1 已 flag | 单独 sub-slice, 优先级低 (用户走 Team Path) |

---

## §7 推荐 ordered backlog

**核心 reasoning**: 用户明确 "内测阶段要强大数据分析和运营能力" + "数据闭环完成". 内测优先级 > production hardening > Stage D3/E. 立即可做的是 P0 三项 (PostHog deploy + cohort dashboard + SDK 集成) 和 D2 Phase 2 event ingestion.

### §7.1 立即 (next 2-3 sub-slices)

| 顺序 | sub-slice | rationale |
|---|---|---|
| 1 | **§37 `posthog-self-host-image-pin`** (resume from deferred) | Block lifting cost lowest (PR #40402 已 fix, 候选 tag verified by research agent); unblock 之后 §39+§40 真测能跑. 1 round 应该够. |
| 2 | **§39 `d2-phase2-event-ingestion-design`** ([PLAN]-only sub-slice) | 锁 PostHog SDK 直连 vs platform capture endpoint 设计选择; 用户拍板后驱动后续实现. 不写代码, 1-2 round 内出. |
| 3 | **§40 `d2-cohort-dashboard-mvp`** | 内测必备的运营视图. server query (read PostHog cohorts via REST proxy) + minimal UI page. 4-6 round. |

### §7.2 内测前必备 (within 1-2 weeks)

- **§41 `sdk-auto-injection-helper`** — 让 app 启动一行 `rll.init(...)` 自动 (a) 登记 app_version 到 platform (b) PostHog SDK init (c) 帮上报关键事件. 1 sub-slice, 多语言 (TS first, Python/Go 后续).
- **§42 D2 Phase 2 event ingestion** — 按 §39 锁定的设计实现.
- **§43 cohort dashboard 第二迭代** — 加 retention curve / per-version conversion / per-flag impact 三视图.
- **§44 production smoke** — 写 `deployment-smoke.md` 模板 + 自动化 preview env 起.

### §7.3 production 前必备 (within 1 month)

- **§45 Sentry / OpenTelemetry 接入**.
- **§46 灰度阶梯 monitoring-driven** (PostHog flag rule + Sentry alert 集成).
- **§47 rollback playbook**.
- **§48 production hardening** (TLS / domain / backup), 拆 3-4 个小 sub-slice.
- **§49 CI/CD foundation** (T5 / sub-slice #5 from roadmap, 跨 7 codebase 4 个 workflow file).
- **§50 rll-core/ unit tests verify** — first verify sub-slice #1 真 closure 状态 (`rll-trustcoding-roadmap.md:4` 标 complete vs §1 line 17 标 0 tests, 矛盾). 若实际未补则跑 T3 (≥30 case).
  - (T4 / sub-slice #4 `rll-stack-mcp-tests` **不在此 backlog** — 已经 closed by `rll-stack/src/test/session.test.ts`, 见 §4.3 source-of-record inconsistency note.)

### §7.4 长期 (Stage D3/E)

- **§52+ Stage D3 多代理协作** — 大设计先, 然后多个实现 slice.
- **§60+ Stage E 跨 team 共享** — 同上.
- **5 个 terminal backend 候选**, 按用户/IDE 实际诉求排序.

---

## §8 用户决定点

我能做但要你拍板的 5 个分叉:

1. **§37 PostHog deploy 优先级**: 立即做 (option A image pin) vs 推到 §40 之后并入大 D2 Phase 2 batch? **我倾向立即**, 因为 unblock 之后整个 D2 Phase 2 都能真测; 推不会更便宜.

2. **§39 D2 Phase 2 event ingestion 设计选择 (这个很关键)**: PostHog SDK 直连 (app → PostHog, 不经平台) vs platform capture endpoint (app → platform → PostHog)? 直连简单+解耦; 平台 endpoint 给 audit/审计/合规带来好处. **我倾向直连** 但你这是产品级决策.

3. **§40 cohort dashboard 范围**: MVP 三视图 (retention / per-version / per-flag) vs 单视图 (per-version 用户活跃) 先 ship 体验? **我倾向三视图** 一次到位.

4. **§44 preview env 自动化**: 跑在 server 本身的 docker-compose vs 单独的 staging cluster? 单机简单; 集群更接近 production.

5. **§52 Stage D3 多代理协作 vs §60 Stage E 跨 team 共享**: 哪个先? 都是 0%, 设计成本都高. 我没强偏好.

---

**最后更新**: 2026-05-06.
**Sub-slice ledger**: 见 `.rll/PLAN.md` §1 active table; 截至此 doc, §1-§36 closed mutual CONSENSUS, §37 deferred, §38 (本 doc 自身) **code stage** — Lisa review pending closeout (本 doc 是 §38 的 [CODE] deliverable; 已经 ship, 等 mutual CONSENSUS 闭).
**Total tests** (verified 2026-05-06): 290/290 unit + 6/6 e2e Playwright (rll-team-platform/server) + 884/884 (cli/) + 235/235 (wecom-bot/). 历史 roadmap §1 numbers (815 cli / 202 wecom-bot) 为 roadmap-era snapshot, 已 stale.
