# test-harness + cascade gate composition: cli + webui (current state + flow + trust-code gap)

> Scope: ONLY cli + webui tech stacks per user instruction (2026-05-13 morning). Other stacks (desktop / mobile / plugin / server / cloud-infra) **deferred**. Status snapshot at §H slice open (post-§116 closeout).
> 
> Sources: cli/src/preset/stack-detect.ts (8-rule priority); cli/templates/presets/{cli-cmd,web-ui}.json; cli/src/commands.ts handleMutualCompletion + maybeRunUserManualGate + runTierCascade; .ralph-lisa.json testRunners; §F deliverable measurements.

---

## Table of Contents

1. CLI 技术栈 gate composition
2. webui 技术栈 gate composition
3. 全局 gate 层次 (submit-time + post-CONSENSUS cascade + release-gate)
4. 启动门禁后预期流程 (mermaid + 5 阶段)
5. 距离 trust-code 闭环 gap (仅 cli + webui)
6. Lisa 讨论候选 (open questions)

---

## 1. CLI 技术栈 gate composition

### Stack detection (`cli/src/preset/stack-detect.ts:8-rule`)

CLI 命中规则: `package.json + bin field → cli` (Rule 4). super-rll/cli/package.json has `"bin": { "ralph-lisa": "dist/cli.js" }` → 自动识别为 cli stack.

### Preset config (`cli/templates/presets/cli-cmd.json`)

```json
{
  "stack": "cli",
  "changeType": "cmd",
  "requiredTiers": ["unit", "smoke", "integration"],
  "optionalTiers": ["functional"],
  "perTierConfig": { ... }
}
```

| Tier | Required | Command | Oracle |
|------|----------|---------|--------|
| **unit** | ✓ required | `npm test --prefix cli` | All cases pass; new cmd's unit test ≥1 happy + 1 negative. **Lisa R1 B2 lock**: preset oracle string says "vitest" (cli-cmd.json:8), but actual cli runner is `node --test` per cli/package.json — preset wording drift, queue small cleanup slice |
| **smoke** | ✓ required | `ralph-lisa smoke-check` | CLI binary spawns + new sub-cmd surfaces in --help; no crash on bare invocation |
| **integration** | ✓ required | `ralph-lisa contract-check --json` | No drift between cli sub-cmd dispatch table + wecom-bot/lark-bot/dingtalk-bot accept-lists |
| **functional** | optional | `node cli/dist/cli.js <sub-cmd> --help && <happy-args>` | End-to-end invocation succeeds, exit 0 + stdout matches |

**Currently shipped infrastructure**:
- ✓ `npm test --prefix cli` runs 1585/1593 (8 todo, 0 fail) — L1+L2+L3+L4 mixed (per §F Section 1.2 measured tier distribution: ~21-25% L1 pure unit, ~60-65% L2 in-process integration, 7 L3 functional files, 8 L4 system files, 0 L5 in `src/test/`)
- ✓ `ralph-lisa smoke-check` cmd exists
- ✓ `ralph-lisa contract-check` cmd exists (§80 cross-module-contract-check)
- ⚠ `functional` tier — declared but rarely fires (optional + RL_GATE_INCLUDE_OPTIONAL=false default)

### 当前 cli stack 的 gating gap

- **L5 e2e** 完全不在 preset 里. `cli/test-e2e/run-e2e.ts` (324 LOC, 真 claude+codex spawn) 存在但不接 cascade — manual run only.
- **functional** 是 optional tier — 默认不跑. cli sub-cmd happy-path 真 spawn 测试**不自动**.
- **L4 watcher.sh** 真打不在 preset 里 (per §F measurement 8 files use spawnDaemon pattern but as unit-tests not e2e).

---

## 2. webui 技术栈 gate composition

### Stack detection

webui 命中规则: `package.json + vue/react/svelte/next dep → web` (Rule 3) OR Rule 6 fallback (no recognized fields → web). super-rll/rll-team-platform/server has its own web tests via Playwright.

### Preset config (`cli/templates/presets/web-ui.json`)

```json
{
  "stack": "web",
  "changeType": "ui",
  "requiredTiers": ["smoke", "e2e"],
  "optionalTiers": ["functional", "perf", "stability"],
  "perTierConfig": { ... }
}
```

| Tier | Required | Command | Oracle |
|------|----------|---------|--------|
| **smoke** | ✓ required | `npx playwright test cli/templates/test-web/smoke.spec.ts` | Page loads + key-elements render + no console errors |
| **e2e** | ✓ required | `npx playwright test cli/templates/test-web/api.spec.ts` | Critical user-flow exercised end-to-end against real backend |
| **functional** | optional | `npx playwright test --grep '@functional'` | @functional-tagged tests cover UI-bound business logic |
| **perf** | optional | `k6 run cli/templates/test-server/load.js --duration 30s` | p95 < 500ms @ rps 50 (requires `k6` binary) |
| **stability** | optional | `k6 run cli/templates/test-server/stress.js --duration 4h` | 4h stress error-rate drift < 1% |

**Currently shipped infrastructure**:
- ✓ `cli/templates/test-web/smoke.spec.ts` + `api.spec.ts` + `playwright.config.ts` — template files used by web-ui preset
- ✓ §104 `playwright-command-builder.ts` (§106 R3 bug-fixed) — composes `PLAYWRIGHT_JSON_OUTPUT_FILE=<...> npx playwright test ... --output=<...> --reporter=json`
- ✓ §104 manual-gate orchestrator `maybeRunUserManualGate` — opt-in via `.ralph-lisa.json userManualGate.enabled=true`
- ✓ §106 dogfood proved Playwright install+chromium download works + §104 manual.md generation works end-to-end on temp project (C5 test)
- ⚠ super-rll repo's root `.ralph-lisa.json` does **NOT** have `userManualGate` block → §104 doesn't fire on this repo's mutual CONSENSUS
- ⚠ `cli/test-e2e/web/smoke.spec.ts` (NEW §106 1-test fixture) is **separate** from preset-referenced `cli/templates/test-web/smoke.spec.ts` (template-for-new-projects scaffold)

### 当前 webui stack 的 gating gap

- `cli/templates/test-web/{smoke,api,playwright.config}` 是 **template scaffolds** — copied into NEW projects by `ralph-lisa init`. Not run against super-rll itself.
- super-rll/cli **没有** real web-ui surface (it's a CLI tool). webui preset 适用 RLL **客户**项目, 不是 super-rll 自己.
- **rll-team-platform/server** 有真 web-ui (web/comment.spec.ts / scroll-pin.spec.ts / midscene tests) but its own `.ralph-lisa.json` 没设, 走 super-rll cli 的 plan-validate-canonical (lightweight).
- **perf + stability** require k6 binary not pre-installed on most dev boxes — `locallyRunnable: false` declared.

---

## 3. 全局 gate 层次

RLL 有 **4 个独立 gate 层** (3 个 workflow-integrated 自动 + 1 个 manual release gate) per Lisa R1 B1 lock:

### 3.1 Submit-time gate (RL_RALPH_GATE)

**触发**: `ralph-lisa submit-ralph` 在 turn-flip 之前.

**配置**: super-rll/.ralph-lisa.json `testRunners` (4 commands):
| Runner | Command | Time |
|--------|---------|------|
| plan-validate-super-rll | `node cli/dist/cli.js plan validate` | ~50ms |
| plan-validate-canonical | `cd rll-team-platform && plan validate` | ~40ms |
| cli-tests | `npm test --prefix cli` | ~50s |
| wecom-bot-tests | `npm test --prefix wecom-bot` | ~2s |

**Mode**: `block` (default) | `warn` (when §52 marker in body) | `false` (RL_RALPH_GATE=false bypass).

**Scope**:
- ✅ cli: 1585/1593 (含 L1+L2+L3+L4 unit tests mixed)
- ❌ cli-pty-daemon (25 tests independent)
- ❌ wecom-bot full (only `npm test`, no bidirectional integration)
- ❌ Playwright (any L5 e2e)
- ❌ rll-team-platform server tests
- ❌ release-gate.sh (heavy, manual only)

### 3.2 §70 post-CONSENSUS cascade gate

**触发**: mutual CONSENSUS (Ralph+Lisa 都 [CONSENSUS]) 之后, handleMutualCompletion 自动 fires.

**配置**: 每个 slice 自己的 `.dual-agent/auto-tdd-plan-<step>.json rows[]` — 由 R1 [PLAN] 时 §102 v1.2 hook 持久化, R2/R3 [FIX] iterate 时 refresh.

**Strategy**: `halt-on-fail` (default) | `full` | `smoke-only` per RL_TEST_STRATEGY.

**Tier execution order** (per §78 cascade): required tiers ordered by config, optional included only if `RL_GATE_INCLUDE_OPTIONAL=true`.

**Loopback** (§79): cascade-fail → emit `task_failed` event + `Cascade Failure Context` → turn returned to Ralph (loopback to [FIX]).

**Empirical example** (§106 R7 1st [CONSENSUS] attempt):
- Cascade ran `C2: npm test --prefix cli -- user-manual-gate-e2e-roundtrip` (which expanded to full cli suite per Lisa R5 note — `-- filter` not honored by package.json test script)
- 2 pre-existing cmdRunLisa T1+T2 fails → unit:C2 fail → halt → loopback to Ralph
- Ralph R7 [FIX] fixed baseline → cascade re-ran on R7.2/R8/R10 → passed
- C1/C3/C5 e2e tier never reached (cascade halted at unit level)

### 3.3 §104 manual-gate (opt-in only)

**触发**: handleMutualCompletion **AFTER** cascade passes, **IF** root `.ralph-lisa.json userManualGate.enabled=true`.

**Flow**: parseUserManualConfig → buildManualGatePlaywrightCommand → execSync (real chromium spawn) → collectPlaywrightArtifacts → generateUserManual → write `docs/user-manual-<step>.md`.

**Current super-rll repo state**: NOT enabled (Lisa §106 R1 B3 hermetic lock — only temp project demo).

### 3.4 release-gate.sh (manual)

**触发**: 手动 `cd platform && bash scripts/release-gate.sh gate:local` at release time.

**Scope**: full repo gate including heavy commands (cross-codebase-e2e, integration tests, k6 perf, Playwright). Times out otherwise.

---

## 4. 启动门禁后预期流程

```
[Ralph 写 submit.md] 
   │
   ▼
[ralph-lisa submit-ralph]
   │
   ├─→ pre-submit policy check (tag/format/§52 marker detection)
   │
   ├─→ ① **RL_RALPH_GATE (3.1)** ─── 跑 4 个 testRunners
   │      │
   │      ├─→ FAIL: block mode → reject submission
   │      │      OR warn mode (§52 marker present) → log warnings + proceed
   │      │      OR RL_RALPH_GATE=false → bypass (documented)
   │      │
   │      └─→ PASS → continue
   │
   ├─→ persist auto-tdd-plan-<step>.json (§102 v1.2 hook fires on [PLAN] OR [FIX]+non-empty-table)
   │
   ├─→ turn-flip (lisa)
   │
   ▼
[Lisa reviews + submits [PASS] or [NEEDS_WORK] or [CONSENSUS]]
   │
   ▼ (if mutual CONSENSUS: Lisa [CONSENSUS] + Ralph [CONSENSUS])
   │
[handleMutualCompletion fires]
   │
   ├─→ ② **§70 cascade (3.2)** ─── reads auto-tdd-plan-<step>.json
   │      │
   │      ├─→ for each tier (required → optional based on strategy):
   │      │      ├─→ run command
   │      │      ├─→ PASS → next tier
   │      │      └─→ FAIL → 
   │      │             ├─→ halt-on-fail strategy → emit task_failed + loopback to Ralph (§79)
   │      │             └─→ full strategy → continue logging fails + total at end
   │      │
   │      └─→ all PASS → status = passed
   │
   ├─→ ③ **§104 manual-gate (3.3)** ─── ONLY IF userManualGate.enabled=true
   │      │
   │      └─→ Playwright spawn + screenshot capture + user-manual.md write
   │
   ├─→ ④ archive: history.md handoff written + slice closed
   │
   └─→ ralph-lisa next-step to open new slice OR remain idle
```

### 5 阶段 timeline (具体测试覆盖)

| 阶段 | 时机 | 跑哪些测试 | 覆盖 cli? | 覆盖 webui? |
|------|------|----------|----------|------------|
| 1. PLAN | R1 [PLAN] body | 无 (PLAN 不跑测) | — | — |
| 2. Tests-only | R2 [CODE] §52 marker | (build only) — TS2307 expected-fail | — | — |
| 3. Impl | R3 [CODE] | RL_RALPH_GATE → cli L1+L2+L3+L4 mixed (1585 tests) | ✓ (混 4 个 tier) | ✗ (Playwright not in gate) |
| 4. Mutual CONSENSUS | post-[CONSENSUS] | §70 cascade per slice's auto-tdd-plan tiers | ✓ (slice declared) | ✓ IF slice declared |
| 5. Manual-gate | userManualGate.enabled=true | §104 Playwright real-fire (chromium spawn) | — | ✓ |

---

## 5. 距离 trust-code 闭环 gap (仅 cli + webui)

### 5.1 CLI stack 的 trust-code gap

| Layer | 现状 | Gap | 关键 slice |
|-------|------|-----|------------|
| L1 unit | ✓ 21-25% test files | — | — |
| L2 in-process integration | ✓ 60-65% test files | — | — |
| L3 functional (cli sub-cmd 真 spawn) | ⚠ 7 files; preset 标 optional + 不在 cascade 默认 | **真 cli e2e 不自动跑**; functional tier 实际 dead code | **§110 cli-functional-spawn-tests** (5-7r) — L3 真 spawn 15-20 关键 sub-cmd × stdout/exit/state oracle |
| L4 system (watcher.sh / cli-pty-daemon spawn) | ⚠ 8 files mixed in src/test, none in cascade | **watcher.sh 真打 e2e 不自动** | **§107 watcher-bash-e2e** (6-10r) — L4 spawn watcher.sh + turn-flip sim + wake/escalation real-fire |
| L5 e2e (real LLM) | ⚠ `cli/test-e2e/run-e2e.ts` (324 LOC) manual only | release-gate.sh 才跑, 不在 submit-time gate | (no separate slice; works as-is if release-gate.sh fires) |
| Methodology | ⚠ scattered in CLAUDE.md + §F deliverable | role template `ralph.md`/`lisa.md` 不显式嵌入 6-step | **§120 test-plan-methodology-doc** (4-6r) |
| Asset reuse | ✓ §116 test-lib v1 shipped | oracle catalog / template-lifecycle 没 | §117 oracle-catalog (3-5r) / §119 template-lifecycle (3-5r) |

### 5.2 webui stack 的 trust-code gap

| Layer | 现状 | Gap | 关键 slice |
|-------|------|-----|------------|
| smoke (page-load + console) | ✓ template `smoke.spec.ts` + §106 Playwright install proved | super-rll 自己的根 .ralph-lisa.json 没开 userManualGate | (no slice — opt-in per project) |
| e2e (critical flow) | ✓ template `api.spec.ts` + §104 manual-gate infrastructure | 同上 (opt-in) | — |
| Manual.md 真生成 | ✓ §106 C5 dogfood proved end-to-end | RLL **客户项目**用 § 104 时, 由 客户 .ralph-lisa.json 开 enabled=true | — |
| functional / perf / stability | optional tiers | rarely fires | (no immediate slice) |
| Cross-platform (Windows WezTerm) | ⚠ untested | §125 cross-platform-windows-validation (8-12r) | §125 (Direction 2 D2a, 0.9.0 scope) |

### 5.3 共通 trust-code gap (跨 stack)

| Aspect | 现状 | Gap | 关键 slice |
|--------|------|-----|------------|
| **Compose agent** (rule → agent) | ❌ Ralph 手工写 R1 PLAN test table | **R1 PLAN test plan 全靠 Ralph 设计**, agent 不参与 | **§112 test-strategist-agent** (10-12r) — agent 读 codebase + methodology + corpus → emit R1 PLAN draft |
| **Asset corpus** | ❌ no learned-from-past corpus | 过去 slice 的 design decision 没复用 | §118 test-corpus (6-8r) |
| **Observability metrics** | ❌ no telemetry on harness behavior | 没量化 "narrow rate 下降"/"deadlock frequency"/"cycle time" | §121 posthog-test-harness-ingest (8-12r) + §122 dashboards (4-6r) |
| **Closed-loop research → impl** | ⚠ §90 research done (13 invariants), §91-§94 impl shipped | trust-coding closed-loop 已部分接入 (§70/§78/§79/§80/§81 in gate) | — (continuing in Phase 2/3) |

### 5.4 Critical-path 估时 (cli + webui only)

| Slice | 估 | 优先级 | 作用 |
|-------|----|------|------|
| **§110 cli-functional-spawn-tests** | 5-7r | 🚨 highest | L3 cli e2e 接 cascade — 这是 "auto-gate 看得到 cli 行为" 的关键 |
| **§112 test-strategist-agent** | 10-12r | 🚨 highest | agent compose — rule→agent 转折点 |
| **§121 posthog-test-harness-ingest** | 8-12r | 🟡 high | 量化 trust-code 进度的唯一手段 |
| **§107 watcher-bash-e2e** | 6-10r | 🟡 high | L4 watcher e2e — 5-hour-stall class bug 自动覆盖 |
| **§120 test-plan-methodology-doc** | 4-6r | 🟢 medium | 6-step methodology 嵌入 ralph.md role template |
| **§117 oracle-catalog** | 3-5r | 🟢 medium | per-tier oracle pattern 库 |
| **§118 test-corpus** | 6-8r | 🟢 low (depends on §112) | corpus 给 §112 agent 用 |
| **§122 posthog-dashboards** | 4-6r | 🟢 low (depends on §121) | dashboard UI |

**Subtotal initial "raw" critical-path (§110 + §112 + §121)**: ~28-34r — **OBSOLETED** by Section 6.2 locked sequence (per Lisa R1 L7 lock: §120/§117 methodology prep is required before §112). See Section 6.2 for the locked arithmetic: 30-42r + dogfood TBD.

**Subtotal 全 cli+webui trust-code 闭环**: 46-66r (= §F Phase 1+2+3 + D1 PostHog from §G Section 4.2)

---

## 6. Lisa 讨论候选 + Lisa 推荐 locks (per R1 B3+B4 lock)

### 6.1 Open questions + Ralph 推荐 + Lisa 推荐 lock (authority-classified)

| # | Question | Ralph 推荐 | Lisa 推荐 lock | Authority |
|---|----------|-----------|---------------|-----------|
| L1 | §110 cli-functional-spawn-tests scope: 15-20 sub-cmd 哪些? | 16 个 list (init/submit-ralph/submit-lisa/whose-turn/read/status/recap/step/quality-gate/contract-check/test-cascade/telemetry-push/agent-session-reader/token-record/wecom-feedback/wecom-push) | **保留 15-20 个**, 但需覆盖 lifecycle + state + gate + wecom surfaces: `init` / `init --minimal` / `submit-ralph --stdin` / `submit-lisa --stdin` / `whose-turn` / `wecom-feedback unread` / `read work.md` / `status` / `recap` / `step` / `plan validate` / `test --auto --dry-run` / `contract-check --json` / `smoke-check` / `telemetry-push` gated/skip path / `wecom-push` no-daemon no-op path. **避免真外部 send**. | Lisa-lockable |
| L2 | §110 cascade integration: 改 cli-cmd.json requiredTiers 加 functional, OR NEW preset, OR 仅 explicit auto-tdd rows? | 改 cli-cmd.json 加 functional | **NOT** 立刻全局改 `cli-cmd.json` requiredTiers. **先 ship §110 作 explicit auto-tdd rows / opt-in functional runner**; 等 runtime + flake evidence 后再 promote to required | Lisa-lockable |
| L3 | §112 agent compose 触发 default: R1 PLAN auto OR manual? | manual first (per §G U4) | **保留 §G U4 manual-first**. 加 `ralph-lisa strategize-tests <step>` 或类似 explicit command 在 auto R1 invocation 之前 | Lisa-lockable |
| L4 | userManualGate root enablement timing | §121 顺带 (折在 §121 里) | **NOT hide inside §121**. 单独 explicit dogfood slice **after §110 cli functional gate stable**; 打开 Playwright manual-gate at repo root 会改 mutual-close behavior, 应该 separate decision + 给 user surface visibility | Evidence-first (after §110 stability data); if product impact, escalate to User-only |
| L5 | L5 real LLM e2e (`cli/test-e2e/run-e2e.ts`) cascade integration | release-gate.sh + opt-in env | **Keep default out of cascade**. Accept release-gate + explicit env opt-in (`RL_GATE_INCLUDE_E2E=true` 或 equivalent) only | Lisa-lockable |
| L6 | §119 template-lifecycle 0.8.0 D1 status | not 0.8.0 blocker | **NOT 0.8.0 blocker**. Re-evaluate after §110 + 至少 1 个 real project 消费 generated test assets | Lisa-lockable |
| L7 | Roadmap priority: critical-path 三连 vs Phase 1→2→3→4 顺序 | critical-path (§110 + §112 + §121) | **§110 first**, 然后 minimum methodology/oracle prep needed for §112 (即 §120 + §117 if needed), 然后 §112, 然后 §121 observability. **不要 skip directly to agent compose without a functional gate baseline** | Lisa-lockable |
| L8 | §112 dogfood-evidence first-slice | §112 自己/§117 之后 minimal slice | **NOT recursive on §112 itself**. Dogfood §112 on **a small bounded follow-up slice after §110 + methodology/oracle prep**, not on §112 itself as first proof | Lisa-lockable |

### 6.2 Locked critical-path 顺序 (per Lisa R1 B3 L7)

不再是抽象 "§110 + §112 + §121 三连". Lisa-locked specific order:

1. **§110 cli-functional-spawn-tests** (5-7r) — explicit auto-tdd rows for 15-20 cli sub-cmd; functional tier stays **optional** in preset until evidence-driven promotion
2. **§120 test-plan-methodology-doc** (4-6r) — minimum methodology prep needed before §112 (if methodology not yet codified)
3. **§117 oracle-catalog** (3-5r) — minimum oracle catalog if §112 needs pattern reference
4. **§112 test-strategist-agent** (10-12r) — agent compose with manual-first trigger
5. **dogfood slice for §112** — small bounded follow-up slice (NEW slice §123x or §124x) — NOT recursive
6. **§121 posthog-test-harness-ingest** (8-12r) — observability layer

**Subtotal arithmetic (Lisa R2 B1 lock — reconciles Section 5.4 critical-path shorthand)**:
- Pre-§121 locked sequence: §110 + §120 + §117 + §112 = **22-30r**
- + dogfood follow-up slice (#5, estimated TBD; bounded small slice — typical 3-5r when measured)
- + §121 observability (#6): **8-12r**
- **Total: 30-42r + dogfood TBD** to "trust-code 闭环 (cli + webui) production-ready baseline"

This **replaces** the earlier Section 5.4 shorthand "§110 + §112 + §121 = 28-34r critical-path" — that 3-slice estimate skipped §120/§117 methodology prep that Lisa R1 L7 lock explicitly requires before §112.

### 6.3 Authority summary

- **Lisa-lockable** (architecture/process — Lisa locked): L1, L2, L3, L5, L6, L7, L8 (7 of 8)
- **Evidence-first** (need data first): L4 timing (depends on §110 stability data)
- **User-only** (if release cadence / default heavy gate cost changes for all users): potential escalation paths — currently no L1-L8 is purely user-only, but any decision changing default heavy gate or release cadence MUST escalate

### 6.4 Lisa R1 B3 net signal

> "After this doc fix, Lisa expects PASS/CONSENSUS quickly unless new factual claims are added."

→ R2 [FIX] focuses on (a) gate-layer count B1, (b) preset wording B2, (c) Lisa locks + authority B3+B4. No new factual claims added.

---

## Appendix: 测量来源 (reproducible)

```bash
# cli preset config
cat cli/templates/presets/cli-cmd.json
ralph-lisa test --auto --dry-run     # auto-detect → cli preset

# webui preset config
cat cli/templates/presets/web-ui.json

# Submit-time gate config
cat .ralph-lisa.json | jq '.testRunners'

# §70 cascade per slice
cat .dual-agent/auto-tdd-plan-<step>.json

# Current baseline
npm test --prefix cli 2>&1 | grep "^ℹ"            # tests / pass / fail
npm test --prefix cli-pty-daemon 2>&1 | grep "^ℹ"
npm test --prefix wecom-bot 2>&1 | grep "^ℹ"
node cli/dist/cli.js plan validate                 # PLAN.md SOR currency

# Stack detect
node -e "const sd=require('./cli/dist/preset/stack-detect.js'); console.log(sd.detectStack(process.cwd()))"
```
