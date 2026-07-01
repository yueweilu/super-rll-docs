# super-rll comprehensive roadmap — 0.7.0 → 1.0.0

> Status: R2 [RESEARCH] deliverable. Mirrors §F Section 1.0 pattern (reproducible commands + measured-vs-inferred labeling per Lisa R1 B2). Authority split per Lisa R1 B1 (Section 7.1 Lisa-lockable / 7.2 user-only / 7.3 evidence-first). D2c §130/§131 estimates PROVISIONAL per Lisa R1 B3.

## Table of Contents

1. 现状 baseline (post §F closeout)
   - 1.0 Measurement / evidence methodology
   - 1.1 Release status
   - 1.2 Direction 1 现存 building block
   - 1.3 Direction 2 现存 building block
   - 1.4 Direction 3 现存 building block
   - 1.5 Already-queued (post-§F) slice queue
2. 3 directions 详解
   - 2.1 Direction 1 trust-code 闭环 (target 0.8.0)
   - 2.2 Direction 2 功能增强 (target 0.9.0)
   - 2.3 Direction 3 国际版/国内版 split (target 1.0.0)
3. 整合架构图 (4 release × 3 direction × dependency)
4. 落地 plan (release-by-release)
5. Per-release exit criteria (机械可验)
6. Risks + 缓解
7. Open questions
   - 7.1 Lisa-lockable (architecture/process/integration)
   - 7.2 User-only (AskUserQuestion required)
   - 7.3 Evidence-first (R2 must research more before recommending)
8. 附录: 现存 building block 索引

---

## 1. 现状 baseline (post §F closeout)

### 1.0 Measurement / evidence methodology

每条 baseline claim 在本节标 **measured** (有 command + file:line anchor) 或 **inferred** (推理 + 标 source). 镜像 §F Section 1.0 pattern.

```bash
# Release status (1.1)
cat cli/package.json | grep '"version"'                   # 0.6.8
git log --oneline -10

# Direction 1 building block (1.2)
wc -l docs/testharness-gate-comprehensive-plan.md         # §F deliverable
ls -la deploy/posthog/                                    # §62 PostHog assets

# Direction 2 building block (1.3)
wc -l lark-bot/src/*.ts                                   # §63
wc -l dingtalk-bot/src/*.ts                               # §64
wc -l wecom-bot/src/*.ts                                  # baseline
wc -l cli/src/*-hook.ts                                   # outbound hooks
ls cli-pty-daemon/ cli-pty-daemon-vscode/                 # §46/§47/§48
rg -c "dangerously-bypass-approvals-and-sandbox" cli/src/ # §73
ls -la /Users/yinaruto/rll-dogfood-website/launch-ralph-lisa-wezterm.sh
rg -l "wezterm" cli/src/                                  # current cli wezterm coupling
ls ~/Projects/ChatLLM/margay-engine/src/  # evidence for D2c (see 7.3)

# Direction 3 building block (1.4)
wc -l cli/templates/roles/*.md                            # role files
find cli/src -name "i18n*" -o -name "locale*"             # current i18n surface
rg -l '[一-鿿]' cli/src/*.ts | wc -l                       # Chinese-hardcoded file count
ls cli/templates/presets/                                 # preset names

# Already-queued slices (1.5)
node cli/dist/cli.js plan validate                        # PLAN.md SOR currency
grep -n "§103\b\|§109\b\|§106\b" .rll/PLAN.md
```

**Labeling convention used below**: `[M]` = measured; `[I]` = inferred (说明 source).

### 1.1 Release status

- [M] Current cli version: **0.6.8** (`cli/package.json:"version"`)
- [M] Last shipped slice family: §102 v1.2+v1.3 protocol fixes + §104 closed-loop manual gate + F3 remote-team digest + F14 multi-channel escalation. Commit subject `5461e7a feat(0.6.8): protocol fixes + closed-loop manual gate + remote-team digest + multi-channel escalation` ✓
- [M] §F testharness-gate-comprehensive-survey-and-plan: **closed mutual CONSENSUS R7** on 2026-05-12 (`.rll/PLAN.md:3085`)
- [M] 0.7.0 release-blocker per Lisa R6 lock 7: **§103 + §109 + §106** (`.rll/PLAN.md:3085 + docs/testharness-gate-comprehensive-plan.md:413-429`)
- [M] Current dist-pack-068 staging: 528K (`du -sh dist-pack-068`)
- [I] 0.6.8 已 commit + push 到 super-rll private (memory project_overnight_2026_05_11_outcome.md + recent commits 9ece97b/2b743a8/7f022dd visible in `git log`)

### 1.2 Direction 1 (trust-code 闭环) 现存 building block

| Asset | Status | Evidence |
|-------|--------|----------|
| `docs/testharness-gate-comprehensive-plan.md` | [M] 473 LOC shipped | §F R7 mutual CONSENSUS |
| 4-phase queue (§116/§117/§120 / §109/§110/§107 / §118/§112 / §103/§106/§119) | [M] locked by Lisa R6 | §F doc Section 4 |
| §62 PostHog self-host loop closure | [M] shipped — 12 files in `deploy/posthog/` incl docker-compose.base.yml (26KB) + docker-compose.hobby.yml (19KB) + README.md (8.4KB) + setup.sh / teardown.sh / .env.dev-defaults | `ls -la deploy/posthog/` |
| §70/§78/§79/§80/§81 test-gate/cascade/loopback/contract-check/spec-helper | [M] shipped — commits `3d57c21 feat: §78 test-tier-cascade-mvp (2a)`, `d357c7e feat: §79 auto-loopback-with-context (2b)`, `3578d77 feat: §80 cross-module-contract-check (2c)`, `59e1f7b feat: §81 tdd-test-spec-helper-agent (2d)` | `git log --oneline --grep="§7[89]\|§80\|§81"` |
| §83 9×8 capability matrix | [I] shipped per session memory | memory `project_subslice_83_test_harness_capability_evaluation.md` (memory-only; not git-tracked) |
| Gap | [M] **0 production** PostHog ingest files in cli/src — only 1 test file: `cli/src/test/posthog-deploy-yaml-shape.test.ts` | `find cli/src -path cli/src/test -prune -o -name '*posthog*' -print` |
| Gap | [I] PostHog dashboards for trust-code metrics — `deploy/posthog/dashboards/*.json` 0 files | `ls deploy/posthog/dashboards 2>/dev/null → no dir` |

### 1.3 Direction 2 (功能增强) 现存 building block

#### 2.2a Cross-platform / WezTerm

| Asset | Status | Evidence |
|-------|--------|----------|
| §46 cli-pty-daemon-attach-client | [M] shipped — `.rll/PLAN.md:126` "closed-stage [CONSENSUS] mutual 2026-05-06"; `cli-pty-daemon/src/attach-client.ts` ~220 LOC | `.rll/PLAN.md:126` + `ls cli-pty-daemon/` |
| §47 ralph-lisa-start-daemon-first | [M] shipped — `.rll/PLAN.md:125` "closed-stage [CONSENSUS] mutual 2026-05-06"; `cli/src/daemon-spawn.ts` ~190 LOC | `.rll/PLAN.md:125` |
| §48 cli-pty-daemon-vscode-extension MVP | [M] shipped (`.vsix` packaged) | `ls cli-pty-daemon-vscode/*.vsix` ✓ |
| §109 daemon-env-hygiene-fix | [M] queued (Lisa R6 lock 7 MUST-DO, 0.7.0) | §F doc + `.rll/PLAN.md:3085` |
| WezTerm dogfood launcher | [M] external script | `/Users/yinaruto/rll-dogfood-website/launch-ralph-lisa-wezterm.sh` 3075 bytes |
| Gap | [M] 0 wezterm refs in `cli/src/` (`rg -l "wezterm" cli/src/ → 0`) — cli 没原生 wezterm 集成 |
| Gap | [I] Windows-side WezTerm dogfood unverified — 仅 macOS dogfood done today |

#### 2.2b WeCom + DingTalk + Feishu 三 channel

| Channel | Outbound (push from cli) | Inbound (user → cli) | Evidence |
|---------|--------------------------|----------------------|----------|
| WeCom | [M] cli/src/wecom-hook.ts 291 LOC | [M] wecom-bot 3177 LOC total (bidirectional 全打通) | `wc -l wecom-bot/src/*.ts` |
| Lark | [M] §63 lark-bot 156 LOC + cli/src/lark-hook.ts 82 LOC (outbound MVP) | [I] **0 inbound** — lark-bot/src/lark-webhook.ts 仅含 outbound POST + HMAC sign | `cat lark-bot/src/lark-webhook.ts → 仅 fetch/POST` (memory project_subslice_63 confirms outbound-only) |
| DingTalk | [M] §64 dingtalk-bot 169 LOC + cli/src/dingtalk-hook.ts 109 LOC (outbound MVP) | [I] **0 inbound** — 同 lark, outbound-only | memory project_subslice_64 |

**Asymmetry [M]**: wecom-hook.ts 291 LOC ≈ 3.6× lark-hook 82 + 2.7× dingtalk-hook 109. wecom-bot 3177 LOC vs lark-bot 156 / dingtalk-bot 169 ≈ 20×. Channels-abstraction layer 不存在 (`ls cli/src/channels/ → No such file or directory`).

#### 2.2c 国产模型集成 — ccl + 定制 codex + margay-gateway 网关

| Asset | Status | Evidence |
|-------|--------|----------|
| §73 codex full-auto flag fix | [M] shipped — `--full-auto` → `--dangerously-bypass-approvals-and-sandbox`; 1 ref `cli/src/commands.ts` + 2 test refs | `rg -c "dangerously-bypass-approvals-and-sandbox" cli/src/` |
| §61 codex session-jsonl reader | [M] shipped — `.rll/PLAN.md:110` "closed-stage [CONSENSUS] mutual 2026-05-08"; NEW `cli/src/agent-session-reader.ts` 5 fns + `ralph-lisa session-capture` cmd | `.rll/PLAN.md:110`; coverage of kimi/qwen/glm/deepseek via codex aliyun-provider auto-capture [I] per session memory |
| ccl | [M] **unknown surface — 0 refs in cli/src** (`rg "claude-code-lite\|^ccl\b" cli/src/ --type ts → 0`); 0 sibling repo found via `ls /Users/yinaruto/*ccl* 2>/dev/null` and `ls ~/MyProjects/ChatLLM/*ccl* 2>/dev/null`. **User clarification needed** (see 7.2). |
| margay-gateway | [M] **margay-engine sibling repo exists** at `~/Projects/ChatLLM/margay-engine/` (`@margay/engine` v0.1.0 private). **BUT** its src content is NOT a model gateway — it contains `BackgroundTaskService`, `CronBusyGuard`, `SubmissionParser`, `TaskCompleteDetector`, `TurnCoordinator`, `WorkspaceRouter`, `workflow/` — i.e. it's a **sibling RLL-loop engine implementation**, not an LLM API routing proxy. **User clarification needed** (see 7.2/7.3). |

### 1.4 Direction 3 (国际版/国内版 split) 现存 building block

| Asset | Status | Evidence |
|-------|--------|----------|
| Role templates (固定 ralph + lisa) | [M] `cli/templates/roles/ralph.md` 208 LOC + `lisa.md` 196 LOC = 404 LOC total | `wc -l cli/templates/roles/*.md` |
| Role plugin / abstraction extension point | [I] **0 surface** — only 2 fixed files, no naming convention for swap, no config slot | `ls cli/templates/roles/ → only ralph.md + lisa.md` |
| i18n / locale bundles | [M] **0 dedicated i18n module** in cli/src (`find cli/src -name "i18n*" -o -name "locale*" → 0 hits`) | (above) |
| Chinese hardcoded surface | [M] **7 cli/src/*.ts files** contain CJK characters: `progress.ts / policy.ts / wecom-hook.ts / agent-stuck-fanout.ts / commands.ts / cli.ts / plan.ts` | `rg -l '[一-鿿]' cli/src/*.ts` → 7 file paths |
| Release pipeline (single tarball + dist-pack-NNN) | [M] currently 1 output: `rll-release-v*.tar.gz` (v0.5.0 309KB, v0.6.0 321KB, v0.6.1 324KB, dist-pack-068 528KB) | `ls -la rll-release-*.tar.gz` |
| Preset configs | [M] `cli/templates/presets/*.json` = 7 files (cli-cmd, cli-schema, desktop, mobile, platform-server-cmd, plugin, web-ui) | `ls cli/templates/presets/` |
| `.ralph-lisa.json` schema region field | [I] no `region` field today (schema check via `cli/templates/presets/*.json` + `cli/src/state.ts` — to be re-confirmed R3 narrow if Lisa challenges) |

### 1.5 Already-queued slice queue (post-§F closeout, Lisa R6 lock 7)

| Slice | Phase (§F) | 0.7.0 status | Estimate |
|-------|------------|--------------|----------|
| §109 daemon-spawn-env-hygiene-fix | Phase 2 | MUST-DO release blocker | 3-5r |
| §103 telemetry-privacy-opt-in | Phase 4 | MUST-DO release blocker | 6-10r |
| §106 playwright-real-e2e-test | Phase 4 | MUST-DO release blocker (after Phase 2 evidence) | 5-8r |
| §116 cli-test-lib-extraction | Phase 1 | internal leverage | 5-7r |
| §117 oracle-catalog | Phase 1 | internal leverage | 3-5r |
| §120 test-plan-methodology-doc | Phase 1 | internal leverage | 4-6r |
| §110 cli-functional-spawn-tests | Phase 2 | internal leverage | 5-7r |
| §107 watcher-bash-e2e | Phase 2 | internal leverage | 6-10r |
| §118 test-corpus | Phase 3 | internal leverage | 6-8r |
| §112 test-strategist-agent | Phase 3 | internal leverage | 10-12r |
| §119 template-lifecycle | Phase 4 | conditional | 3-5r |

---

## 2. 3 directions 详解

### 2.1 Direction 1 — trust-code 闭环 (target 0.8.0)

**Goal**: 把 trust-code (Ralph/Lisa 协议生产可信代码) 的闭环修严: 自动化测试门禁强化到能 ship customer-facing 真闭环 + PostHog 抓 telemetry 量化 trust-code 效果.

**Composition** (3 layers):

#### 2.1.1 强化 test-harness — 直接复用 §F Phase 1+2 queue

- §116 cli-test-lib-extraction (5-7r) — 抽 5+ 个重复 helper
- §117 oracle-catalog (3-5r) — per-tier oracle pattern doc
- §120 test-plan-methodology-doc (4-6r) — 6-step methodology + role template 嵌入
- §110 cli-functional-spawn-tests (5-7r) — L3 真 spawn 验 exit/stdout
- §107 watcher-bash-e2e (6-10r) — L4 真 spawn watcher.sh

Phase 1+2 估时合计: **23-35r**

#### 2.1.2 自动化测试门禁 — 复用 §70/§78/§79 + 加 Phase 2 evidence

- §70 post-CONSENSUS gate already shipped
- §78 tier cascade already shipped
- §79 loopback already shipped
- Phase 2 evidence 加完后 §70/§78/§79 真打到 L4/L5 — 不另开 slice, 算 §F Phase 2 dogfood 顺带

#### 2.1.3 §F Phase 3 corpus + agent

- §118 test-corpus (6-8r)
- §112 test-strategist-agent (10-12r)

Phase 3 估时合计: **16-20r**

#### 2.1.4 PostHog 集成 — NEW slices

- **§121 posthog-test-harness-ingest** — `cli/src/posthog-ingest.ts` 收 §70 gate-result / §F narrow-class / round-count / mutual-CONSENSUS-timing / DEADLOCK signal → 转 PostHog event. 依赖 §103 privacy opt-in (gate 决定是否 ingest). 估 8-12r.
- **§122 posthog-dashboards** — `deploy/posthog/dashboards/*.json` × 4-6 个: trust-code-velocity / narrow-class-trend / deadlock-frequency / mutual-CONSENSUS-cycle-time. 估 4-6r.

PostHog 估时合计: **12-18r**

#### 2.1.5 Direction 1 总估时

| Sub-phase | Slices | 估时 |
|-----------|--------|------|
| §F Phase 1+2 (复用) | §116/§117/§120/§110/§107 | 23-35r |
| §F Phase 3 (复用) | §118/§112 | 16-20r |
| PostHog ingest + dashboards (NEW) | §121/§122 | 12-18r |
| **总** | 9 slices | **51-73r** |

### 2.2 Direction 2 — 功能增强 (target 0.9.0)

#### 2.2a Cross-platform / WezTerm 紧密集成

- **§123 wezterm-native-dual-pane-driver** — `ralph-lisa start --frontend wezterm` 自动 `wezterm cli spawn --new-window` + `wezterm cli split-pane --right`, 取代外置 launch script. cli/src/wezterm-driver.ts NEW. 估 6-10r.
- **§124 wezterm-status-line-integration** — workspace.toml status line 显示 `round=N turn=ralph pending-narrow=M`. cli/src/wezterm-status.ts NEW + dogfood doc. 估 3-5r.
- **§125 cross-platform-windows-validation** — Windows-on-Parallels 上跑 §123 / §47 / §48 三套, 真验 dual-pane + status-line + vscode extension; 估 8-12r (含 install 调试).

2.2a 合计: **17-27r**

#### 2.2b WeCom + DingTalk + Feishu 三 channel 统一集成

**Asymmetry [M] 1.3 已示**: wecom 完整 bidirectional + 3177 LOC, lark/dingtalk 仅 outbound + 156/169 LOC.

- **§126 channel-abstraction-layer** — `cli/src/channels/{wecom,lark,dingtalk}.ts` 统一 interface `{ push(msg, target?), receive(handler), parseInbound(payload), userIdentity(payload) }`. 把现有 cli/src/{wecom,lark,dingtalk}-hook.ts 改造成 adapter. 估 8-12r.
- **§127 lark-bot-inbound-mvp** — Lark Open Platform Bot 加 inbound webhook receiver (`POST /lark/webhook`) + 命令解析 (parses `/feedback /task /状态 /看 ralph /看 lisa /停 /继续` 等 wecom 已 lock 的关键词). lark-bot/src/lark-inbound.ts NEW + integration test. 估 10-15r.
- **§128 dingtalk-bot-inbound-mvp** — 同 §127 但 dingtalk. 钉钉 inbound 走 outgoing-webhook (官方协议: 群里 `@bot 消息` → POST to user-configured URL). dingtalk-bot/src/dingtalk-inbound.ts NEW + test. 估 10-15r.

2.2b 合计: **28-42r**

#### 2.2c 国产模型集成 — ccl + 定制 codex + margay-gateway 【PROVISIONAL per Lisa R1 B3】

**Why PROVISIONAL**: 1.3 measurement 显示 (a) ccl 在 cli/src 0 refs, 含义 user-only TBD; (b) margay-gateway 名字含糊 — 现有 margay-engine sibling repo 是 RLL-loop engine 不是 LLM gateway. 估时落实必须 user clarification + repo/API evidence first.

**Discovery phase (R2 [RESEARCH] 已发, R3 [FIX] 会补 if user 解答)**:

- **§129 model-adapter-layer** — abstract claude+codex+ccl+custom-codex spawn + session-jsonl-reader 统一 interface. 借鉴 §61 codex-session-jsonl-reader pattern. 估 [PROVISIONAL] 10-15r (可执行 — 不依赖 ccl/margay 具体含义).
- **§130 ccl-adapter** — [PROVISIONAL] 待 user 拍 ccl 含义后定: 若 ccl = npm wrapper, 估 6-10r (adapter 模式); 若 ccl 是 unknown 国产 CLI, **§130 retire 成 discovery slice 3-5r 仅** (per Lisa R1 B3 carve-out).
- **§131 margay-gateway-routing** — [PROVISIONAL] 待 user 拍 margay 含义后定: 若指现有 margay-engine sibling repo (不太可能 — 它不是 gateway), retire 成 alignment slice 3-5r; 若指未来 NEW margay HTTP proxy service, 估 8-12r implementation + 4-6r dogfood = 12-18r. 也可能完全 retire if user clarifies 别的 service 名字.

2.2c 合计 [PROVISIONAL]: lower bound **§129 only 10-15r**; upper bound **24-48r (含 §130 + §131 + dogfood)**

#### 2.2 Direction 2 总估时

| Sub-phase | Slices | 估时 |
|-----------|--------|------|
| 2.2a WezTerm cross-platform | §123/§124/§125 | 17-27r |
| 2.2b Channel inbound | §126/§127/§128 | 28-42r |
| 2.2c 国产模型 [PROVISIONAL] | §129 + §130/§131 maybe | 10-15r (low) → 34-69r (high) |
| **总 (low/high)** | 6-8 slices | **55-84r (low) / 79-138r (high if §130+§131 full)** |

### 2.3 Direction 3 — 国际版/国内版 split (target 1.0.0)

**Goal**: 单 source 双产物 (`pnpm package:intl` + `pnpm package:cn`); 国际版 user 可 swap ralph/lisa 主 agent.

- **§132 agent-role-abstraction** — extension point + 2 reference roles
  - cli/templates/roles/<name>.md (现 ralph.md + lisa.md) 加 plugin discovery: scan `cli/templates/roles/*.md` + 用户安装 `~/.rll/roles/*.md`
  - `.ralph-lisa.json` 加 `roles: { agent_a: <name>, agent_b: <name> }` field (默认 `ralph/lisa`)
  - 2 reference: ralph-gpt5-architect.md + lisa-claude-reviewer.md (国际版 alpha 用)
  - 估 12-18r
- **§133 release-pipeline-split** — build script 加 `--region intl|cn` flag → 2 tarball (intl/cn) + per-region default config (telemetry endpoint / model default / channel integration default). 估 6-10r.
- **§134 i18n-hardening** — 7 cli/src/*.ts CJK-hardcoded files (progress / policy / wecom-hook / agent-stuck-fanout / commands / cli / plan) → extract to `cli/src/locale/{zh-CN,en}.ts`; en fallback. 估 8-15r (count from 5→7, scope 略增 但区间内).
- **§135 intl-edition-dogfood** — 国际版 alpha 真闭环 (e.g. gpt5 ralph + claude lisa 跑通 1 slice mutual CONSENSUS); 估 10-15r.

#### 2.3 Direction 3 总估时

| Sub-phase | Slices | 估时 |
|-----------|--------|------|
| Agent role abstraction | §132 | 12-18r |
| Release pipeline split | §133 | 6-10r |
| i18n hardening | §134 | 8-15r |
| intl edition dogfood | §135 | 10-15r |
| **总** | 4 slices | **36-58r** |

---

## 3. 整合架构图 (4 release × 3 direction × dependency)

```
                    0.7.0                  0.8.0 (D1)              0.9.0 (D2)                  1.0.0 (D3)
                    ─────                  ──────────              ──────────                  ──────────

release-blocker     §109 ──────► [unblocks
                    daemon/env    L4 dogfood
                    hygiene       across
                                  Phase 2]

                    §103 ──────► §121 (PostHog
                    privacy      ingest gated
                    opt-in       on opt-in)

                    §106 ──────► [Playwright
                    e2e          baseline for
                                 §125 cross-
                                 platform]

Direction 1                       §F Phase 1   ─┐
trust-code                        §116/§117/    │── §F Phase 3
                                  §120          │── §118/§112
                                  §F Phase 2    │
                                  §110/§107    ─┘
                                                ──► §121/§122 PostHog dashboards

Direction 2                                                          §123/§124/§125 WezTerm
功能增强                                                              §126 channel abstraction
                                                                     §127/§128 lark/dingtalk inbound
                                                                     §129 model adapter
                                                                     §130/§131 [PROVISIONAL]

Direction 3                                                                                     §132 agent role
intl/cn split                                                                                   §133 release split
                                                                                                §134 i18n
                                                                                                §135 intl dogfood

依赖弧:
  §103 ──► §121 (硬依赖: PostHog ingest 必须 opt-in 之后)
  §109 ──► §123/§125 (硬依赖: cross-platform 跑前修 env hygiene)
  §F Phase 1 (§116) ──► Direction 2/3 后续 slice (软依赖: 共享 test-lib)
  §126 ──► §127/§128 (硬依赖: inbound 走 abstraction)
  §129 ──► §130/§131 (硬依赖: domestic model 走 adapter)
  §132 ──► §133/§134/§135 (硬依赖: intl split 全部依赖 agent role abstraction)
  §F Phase 3 §112 ──► Direction 2/3 (软依赖: agent compose 给后续 slice 起 PLAN 草稿)
```

---

## 4. 落地 plan (release-by-release)

### 4.1 0.7.0 release-blocker (estimate 14-23r)

| 顺序 | Slice | 估时 | 依赖 |
|------|-------|------|------|
| 1 | §109 daemon-env-hygiene-fix | 3-5r | 无 (修今天 WezTerm bug + L4 unblock) |
| 2 | §103 telemetry-privacy-opt-in | 6-10r | 无 |
| 3 | §106 playwright-real-e2e-test | 5-8r | 需要 §109 + Phase 2 evidence (Lisa lock 5) |

**Phase order note** (Lisa R6 lock 5): §109 / §103 可部分并行 (无强依赖); §106 wait for §109 + Phase 2 dogfood evidence.

### 4.2 0.8.0 Direction 1 trust-code 闭环 (estimate 51-73r)

| 顺序 | Sub-phase | Slices | 估时 |
|------|-----------|--------|------|
| 1 | §F Phase 1 资产基础 | §116 / §117 / §120 (partial parallel) | 12-18r |
| 2 | §F Phase 2 missing middle (剩) | §110 / §107 | 11-17r |
| 3 | §F Phase 3 corpus + agent | §118 / §112 | 16-20r |
| 4 | PostHog ingest + dashboards | §121 / §122 | 12-18r |

### 4.3 0.9.0 Direction 2 功能增强 (estimate 55-84r low / 79-138r high)

| 顺序 | Sub-direction | Slices | 估时 |
|------|---------------|--------|------|
| 1 | 2.2a WezTerm cross-platform | §123 / §124 / §125 | 17-27r |
| 2 | 2.2b Channel inbound | §126 (abstraction) → §127 / §128 (parallel after §126) | 28-42r |
| 3 | 2.2c 国产模型 [PROVISIONAL] | §129 implementation + §130/§131 conditional | 10-15r low / 34-69r high |

### 4.4 1.0.0 Direction 3 intl/cn split (estimate 36-58r)

| 顺序 | Slice | 估时 | 依赖 |
|------|-------|------|------|
| 1 | §134 i18n-hardening | 8-15r | 无 (i18n 不阻塞别人, en fallback 先准备) |
| 2 | §132 agent-role-abstraction | 12-18r | §134 完成 (intl 国际版 agent swap 需要 en strings 已 extracted) |
| 3 | §133 release-pipeline-split | 6-10r | §132 + §134 (双产物需要 region + locale 都 ready) |
| 4 | §135 intl-edition-dogfood | 10-15r | §132 + §133 + §134 全 ready |

**Note**: §132 跟 §133 不可并行 — §133 双产物 build 需要 §132 agent role abstraction 落地后才能区分 region default. Lisa lock 候选: 是否 §132+§133 部分并行可行 (即 §132 R1-R3 PLAN+CODE 阶段 ↔ §133 R1 PLAN 阶段 重叠).

### 4.5 Total roadmap 估时

| Release | 估时 (low - high) |
|---------|-------------------|
| 0.7.0 | 14-23r |
| 0.8.0 | 51-73r |
| 0.9.0 | 55-84r (low) / 79-138r (high if §130+§131 full ship) |
| 1.0.0 | 36-58r |
| **Total** | **156-238r (low) / 180-292r (high)** |

按 ~5-10 round/week 节奏 (复杂 slice 30-50 round 重 + 间隔), 总 ship 周期 **6-14 月** (single-person, sequential, with breaks per § overnight cadence).

---

## 5. Per-release exit criteria (机械可验)

| Release | Exit checkpoint | Failure trigger |
|---------|-----------------|-----------------|
| 0.7.0 | **release-blocker only** (per `.rll/PLAN.md:3097-3100` user lock): §109 daemon/env-hygiene + §103 telemetry-privacy-opt-in + §106 real Playwright/e2e 全 mutual CONSENSUS, 且各自 mechanical check 通过 (§109 Linux+macOS L4 spawn 真验 + §103 console-prompt + `--telemetry-opt-out` flag 真验 + §106 Playwright real-page test 1 个真过) | 任一 fail → 不发布 |
| 0.8.0 | §F Phase 1-3 + §121/§122 全 mutual CONSENSUS + PostHog dashboard 真显示 ≥4 个 trust-code metric + §112 strategist agent 至少为 1 个真 slice 推荐 tier 且 Ralph 跑通 mutual CONSENSUS (§F Phase 3 mechanical exit) | 任一 fail → 回对应 Phase 补 |
| 0.9.0 | D2a/b/c 全部 ship; cross-platform Win+macOS 跑通 (§125 release gate); Lark+DingTalk inbound 真打 (e.g. 真发个 `/feedback test` 收到); 国产模型 ≥1 个真闭环 (e.g. qwen via codex aliyun OR §131 routing 真闭环 if user clarify margay) | 任一 fail → 回 D2 子 phase 补 |
| 1.0.0 | 国际版 alpha 真闭环 (gpt5 ralph + claude lisa 跑通 1 slice mutual CONSENSUS); 国内版 GA 不退步 (regression 0); release pipeline 双产物 (intl + cn tarball 都构出 + install 都跑通) | intl alpha fail → 回 §132 补 abstraction; 国内版 regression → 回 §134 补 i18n |

**Observational goals (not release gates)**:
- 0.7.0 — customer pilot scope 待 user 在 7.2 U3 lock 后定; pilot 反馈不作 release blocker (除非 user 明示 升级为 gate)
- 0.8.0 — §F Phase 3 dogfood 观察 Lisa narrow rate 降幅; 30% 数字是 aspirational, 缺基准 (§F baseline narrow count 没 mechanically 定义 + counting rule 留 §112 R1 PLAN 时锁); 当 trust-code 进度 retrospect signal, 不当 release blocker

---

## 6. Risks + 缓解

| Risk | 缓解 |
|------|------|
| Roadmap 12+ 月 silent drift (单人节奏 + 长周期 motivation 风险) | 每 release ship cadence ≤ 2 个月; ship 后 wecom-push retrospect + 用户拍下一 release 优先级; 长 phase 内每 5 slice 强 wecom-push milestone |
| D2c 国产模型 vendor lock (假设 margay-gateway 是别人 hosted service) | §131 加 fallback path (margay down → 直接 spawn vendor CLI); 不假设 gateway 100% uptime; PROVISIONAL 直到 user clarify margay 含义 |
| D3 国际版/国内版 release pipeline 分裂复杂 | §133 用 build-time flag (单 repo 双产物) 而非 fork repo; CI matrix 跑两 region |
| ccl 含义不明 (待 user 拍) | §130 R1 [PLAN] 先 ask user clarification (见 7.2); 若 R3 仍未拍, retire 成 discovery slice 3-5r per Lisa R1 B3 |
| margay-gateway 含义不明 | §131 PROVISIONAL; 同 ccl 处理 (见 7.2/7.3) |
| PostHog ingest 隐私敏感 | §121 必须在 §103 privacy opt-in 之后开始; hard dependency, 不可绕 |
| Direction 2/3 容易 scope creep | 每 sub-direction 限 3-5 slice, 超出新 sub-direction 单独 plan |
| §F asset library (§116) 不够通用 — Direction 2/3 复用低 | §116 closeout dogfood: 真挑 1 个 Direction 2 slice 用 cli/test-lib/, 验复用率; 不通用就 R2 [FIX] expand §116 scope |
| 0.8.0 / 0.9.0 / 1.0.0 release boundary 模糊 (实际可能某 D2 slice 应该 0.8.0 做) | 每 release exit criteria 机械可验 (Section 5); 不为 cherry-pick scope 改 release boundary, 而是改 slice 归属 + 重 plan |
| WezTerm Windows 上行为差异 (cli spawn / split-pane 可能 differs) | §125 cross-platform-windows-validation 是机械 exit gate; 不假设 macOS 行为可移植 |
| §132 agent role abstraction 改 fundamental 协议 → 破坏 backward compat | §132 R1 [PLAN] 必含 backward-compat 测试 (`default = ralph/lisa` 不退步); §135 dogfood 必走 default + intl 双路径 |

---

## 7. Open questions

Per Lisa R1 B1, 按 decision authority 分 3 tier:

### 7.1 Lisa-lockable (architecture / process / integration)

L1. **§132 agent role plugin form**: in-tree `cli/templates/roles/<name>.md` only / npm-installable plugin `@yw1975/role-<name>` / `~/.rll/roles/*.md` 用户级 / 三者都? 我推荐: in-tree + 用户级 (`cli/templates/roles/` shipped 当 reference, `~/.rll/roles/` 用户自带), npm plugin 留 future (避免 npm registry 引入)

L2. **§126 channel-abstraction-layer 拆法**: 抽 `Channel` interface + `WecomChannel implements Channel` / `LarkChannel implements Channel` / `DingTalkChannel implements Channel` (OOP), vs functional dispatch (`type Channel = 'wecom' | 'lark' | 'dingtalk'; channelPush(c, msg)` switch)? 我推荐: functional (避免 class 引入 + 跟现有 cli/src/*-hook.ts pattern 一致)

L3. **D2b unified webhook server architecture**: 现 wecom-bot 独立 process + cron-poll; lark/dingtalk inbound 是 (a) inline 进 wecom-bot daemon (单 process 跑 3 channel), (b) sibling process (lark-bot daemon + dingtalk-bot daemon), (c) cli-daemon-internal listener? 我推荐: 单 process inline (复用 wecom-bot lifecycle + cron + identity 框架), 避免 3 daemon process 管理复杂

L4. **§F Phase 4 §119 template-lifecycle attach timing**: 0.8.0 D1 还是 0.9.0 D2? 我推荐: 0.8.0 D1 incidental — §116/§117/§120 ship 后 §119 (fork-detect / update / reuse) 自然跟上, 不算独立 D2 feature

L5. **§132 role plugin discovery order**: cli/templates/roles/ (built-in) → `~/.rll/roles/` (user) → `.rll/roles/` (project)? 我推荐: built-in → user → project (specificity 升级, project override user)

L6. **§121 PostHog ingest 数据 cardinality 上限**: 每 slice 平均 emit 5-10 event vs 1 event/round? 我推荐: 1 event/round (含 round summary stats), 避免 emit 爆炸; round granularity 够 dashboard

L7. **§129 model adapter spawn vs HTTP mode**: §129 abstract 是 "spawn child process" 模式 only (claude+codex+ccl 都 spawn) vs 包含 HTTP API mode (margay-gateway 走 HTTP)? 我推荐: spawn-only — HTTP mode 留给 §131 单独, §129 不混

### 7.2 User-only (AskUserQuestion locked 2026-05-12 post-CONSENSUS)

U1. **ccl 含义** — **LOCKED**: 某国产 CLI wrapper (具体名字 user 后拍, §130 R1 PLAN 之前 ask). §130 估时 6-10r maintained (adapter pattern), 不 retire 成 discovery.

U2. **margay-gateway 含义** — **LOCKED**: NEW margay HTTP gateway service (尚未建). §131 full implementation estimate maintained: 12-18r (8-12 implementation + 4-6 dogfood). §131 R1 PLAN 之前 user 给 service API surface spec.

U3. **0.7.0 customer pilot scope** — **LOCKED**: 不设 pilot, 0.7.0 自用 ship. §103+§109+§106 mutual CONSENSUS 即触发 release, 不等 pilot 反馈. Section 5 0.7.0 exit + Section 5 footnote 已 reflect.

U4. **Release cadence** — **DEFERRED**: 现在不锁, 依现实调. roadmap 估时按 feature-readiness 默认.

U5. **D2c 国产模型集成放 0.9.0 vs 1.0.0** — **LOCKED**: 留 0.9.0 D2 (跨 region 平台性 feature, §129 model adapter 可 region-中立 reuse). Section 4.3 不动.

U6. **§121 PostHog ingest scope** — 仅本地 self-host PostHog (§62) ingest / 也可选 cloud PostHog (PostHog Cloud) opt-in / 仅本地? (privacy 决策) **DEFER**: 等 §121 R1 PLAN 时再 ask

U7. **§133 release pipeline 双产物 distribution channel** — intl/cn 都从 super-rll 私库直接 dist-pack tarball / 国际版 npm publish + 国内版 dist-pack / 其他? **DEFER**: 等 §133 R1 PLAN 时再 ask

U8. **Phase 4 §119 customer pilot 依赖度** — 0.9.0 之前是否真有人 fork template 然后需要 lifecycle 工具? **DEFER**: 等 §119 R1 PLAN 时再 ask (U3 lock 0.7.0 自用 暗示 §119 不是 0.7.0 blocker)

### 7.3 Evidence-first (R2 [RESEARCH] 必须先打 evidence 再 surface)

E1. **margay-gateway 真 API surface** — 若 user U2 答 "NEW HTTP proxy", R3 [FIX] 必须先 (a) 确认 margay-engine repo 是否 host 此 gateway (1.3 measurement 已示否) (b) 是否需要 NEW repo / 是否 已经存在但本地未 checkout. 估 1-2r research

E2. **Lark Open Platform Bot inbound webhook contract** — feishu.cn open platform docs 真打 (POST endpoint shape / event-callback challenge / verify token) — §127 R1 [PLAN] 必须含 doc URL + 真打 verify-token sample. 估 ~1r research

E3. **DingTalk outgoing-webhook protocol** — open.dingtalk.com docs 真打 (sign verification / message format / reply channel) — 同 §128

E4. **WezTerm cli capability matrix** — `wezterm cli list` / `wezterm cli spawn` / `wezterm cli split-pane` / `wezterm cli set-tab-title` / `wezterm cli activate-pane` Win vs macOS 一致性 — §123 R1 [PLAN] 必须含 capability matrix table

E5. **Windows-on-Parallels 上 RLL 端到端 install** — §125 PLAN 之前先 1 round dogfood: install.sh / cli-pty-daemon attach / vsix install / dual-pane 真打. 估 ~2r research

E6. **cli/templates/presets/*.json schema 跟 region 兼容性** — `cli/templates/presets/` 7 个 preset 文件 (cli-cmd, cli-schema, desktop, mobile, platform-server-cmd, plugin, web-ui), §133 R1 [PLAN] 之前 grep schema 是否 region 加 field 可保持向后兼容

E7. **i18n 7 文件 strings 分类** — `rg -l '[一-鿿]' cli/src/*.ts` 返回 7 files: `progress.ts / policy.ts / wecom-hook.ts / agent-stuck-fanout.ts / commands.ts / cli.ts / plan.ts`. §134 R1 [PLAN] 必须 per-file 验 strings 是 user-visible (需 i18n) vs internal/log-only (不需 extract) — 避免一刀切 over-extract

---

## 8. 附录: 现存 building block 索引

### 8.1 Direction 1 引用

- `docs/testharness-gate-comprehensive-plan.md` — 473 LOC, §F mutual CONSENSUS R7
- `deploy/posthog/{setup.sh, teardown.sh, docker-compose.base.yml, docker-compose.hobby.yml, README.md, .env.dev-defaults}` — §62 self-host loop closure
- `cli/src/contract-check.ts` (383 LOC, §80) — `find cli/src -maxdepth 2 -name 'contract*'`
- `cli/src/loopback.ts` (226 LOC, §79) — `find cli/src -maxdepth 2 -name 'loopback*'`
- §70 post-CONSENSUS gate / §78 tier cascade / §81 test-spec lint — inlined in `cli/src/commands.ts` (functions `handleMutualCompletion`, `runTierCascade`, `validatePlanCurrency` etc.) per `rg -l "runTierCascade\|hasTestPlan\|handleMutualCompletion" cli/src/`
- `.rll/PLAN.md:3048-3088` §F closed section

### 8.2 Direction 2 引用

- `cli-pty-daemon/` + `cli-pty-daemon-vscode/` (incl `.vsix`) — §46/§47/§48
- `cli/src/{wecom,lark,dingtalk}-hook.ts` (291/82/109 LOC) — outbound hooks
- `wecom-bot/` (3177 LOC total) — full bidirectional reference
- `lark-bot/src/lark-webhook.ts` (121 LOC) + `lark-bot/src/types.ts` (35 LOC) — §63 outbound MVP
- `dingtalk-bot/src/dingtalk-webhook.ts` (129 LOC) + `dingtalk-bot/src/types.ts` (40 LOC) — §64 outbound MVP
- `/Users/yinaruto/rll-dogfood-website/launch-ralph-lisa-wezterm.sh` (3075 bytes) — current WezTerm dogfood
- `cli/src/commands.ts` §73 `--dangerously-bypass-approvals-and-sandbox` ref
- `~/Projects/ChatLLM/margay-engine/` — sibling RLL-loop engine (NOT model gateway, evidence-first 7.3 E1)

### 8.3 Direction 3 引用

- `cli/templates/roles/ralph.md` (208 LOC) + `lisa.md` (196 LOC)
- 7 cli/src/*.ts files with CJK-hardcoded strings: `progress.ts / policy.ts / wecom-hook.ts / agent-stuck-fanout.ts / commands.ts / cli.ts / plan.ts` (per `rg -l '[一-鿿]' cli/src/*.ts`); user-visible vs internal classification deferred to §134 R1 [PLAN] per 7.3 E7
- `cli/templates/presets/*.json` (7 preset files)
- `rll-release-v*.tar.gz` (current single-output release pipeline; 0.5.0 309KB / 0.6.0 321KB / 0.6.1 324KB)
- `dist-pack-068/` (528K staging dir for current 0.6.8)
