# RLL Test Harness Capability Evaluation

**日期**: 2026-05-10
**状态**: 评估报告（§83 deliverable）
**前置阅读**: `docs/dev-harness-closed-loop-design.md` / `docs/test-harness-completion-design.md`

---

## Executive Summary

- **覆盖率**: 9 tech stacks × 8 test types = **72 cells**。其中 ✅ Full=**15** (21%) / 🟡 Partial=**16** (22%) / 🟠 Config-only=**38** (53%) / ❌ Not supported=**3** (4%) / ⚪ Out-of-scope=0
- **强项 top 3**: (a) **Web/Mobile/Mini-program/Desktop 的 functional+E2E 全 ✅**（Playwright + Midscene 双 adapter + 完整 fixture 模板）；(b) **Server 的 perf+stability+functional+E2E 4 cell ✅**（k6 完整 load/stress/smoke 模板真实文件）；(c) **CLI functional+E2E ✅**（spawn-based smoke template）
- **弱项 top 3**: (a) **Unit 列全栈 🟠 Config-only**（jest/vitest/pytest/XCTest/junit 等 unit 框架 RLL 没 stack-specific adapter）；(b) **Security 全栈仅 🟠**（adapter 是 output parser，本身不带 runnable security 测试 fixture；user 必须自配 npm audit/gitleaks 等命令）；(c) **Plugin Functional ❌**（browser ext / VSCode ext / IDE plugin 没专属 template）+ **Cloud E2E/Comprehensive ❌**（sandbox 限制）
- **可优雅闭合的 gap**: 5 个（unit-test universal adapter / plugin-templates-mvp / cloud-infra-templates / security-runnable-fixtures / comprehensive-preset-templates）。其他 gap 多属 stack-specific 工具链问题（vendor tools / mobile profilers / chaos engineering — 不是 RLL 内核问题）

---

## 一、Inventory（实测 file:line cite）

### CLI dispatch (`cli/src/cli.ts`)

50+ sub-commands. Test-relevant subset:

| Sub-cmd | Dispatch line | Handler |
|---|---|---|
| `test` | `cli.ts:471` | `cmdTest` (test --list / init / gen / run / analyze) at `commands.ts:6001` |
| `test-cascade` | `cli.ts:422` | `cmdTestCascade` at `commands.ts:7428` (§78) |
| `test-spec-eval` | `cli.ts:430` | `cmdTestSpecEval` at `commands.ts:7237` (§81) |
| `contract-check` | `cli.ts:426` | `cmdContractCheck` at `commands.ts:7300` (§80) |
| `loopback status` | `cli.ts:434` | `cmdLoopbackStatus` at `commands.ts:7358` (§79) |
| `loopback reset` | `cli.ts:434` | `cmdLoopbackReset` at `commands.ts:7387` (§79) |
| `quality-gate` / `gate` | `cli.ts:351` | submit-time runGate (§52) |
| `agent-stuck-push --level high\|critical` | `cli.ts:418` | watcher escalation (§76+§69) |

### Adapter inventory (`cli/node_modules/@yw1975/rll-core/dist/testing/adapters/`)

6 adapters dispatched by `runAdapterParser` at `adapters/index.js:11`:

| Adapter | File | Maps to test type | Tool |
|---|---|---|---|
| `playwright` | `adapters/playwright.js` | functional / E2E (web) | Playwright |
| `k6` | `adapters/k6.js` | performance / stability (HTTP) | k6 |
| `midscene` | `adapters/midscene.js` | functional / E2E (UI) | Midscene VLM agent |
| `ai-eval` | `adapters/ai-eval.js` | functional (AI agent) | cases.json + custom runner |
| `security` | `adapters/security.js` | security (any stack) | npm audit / gitleaks / semgrep |
| `visual` | `adapters/visual.js` | visual regression (UI) | screenshot diff |

### Test templates (`cli/templates/test-*/`)

9 platforms supported by `cmdTestInit` at `commands.ts:6196` (`SUPPORTED_PLATFORMS` at `:6194`):

| Template | Files | Maps to stack |
|---|---|---|
| `test-web` | `playwright.config.ts` / `smoke.spec.ts` / `api.spec.ts` | Web app |
| `test-cli` | `smoke.test.ts` | CLI |
| `test-ai` | `cases.json` / `run-eval.js` | AI agent |
| `test-desktop` | `README.md` / `smoke.yaml` | Desktop |
| `test-mobile` | `README.md` / `smoke-android.yaml` / `smoke-ios.yaml` | Mobile |
| `test-miniprogram` | `README.md` / `smoke.automator.js` / `smoke.midscene.yaml` | Mini-program |
| `test-server` | `load.js` / `smoke.js` / `stress.js` | Server |
| `test-security` | (empty dir; generic) | Security cross-cutting |
| `test-visual` | `criteria.json` / `visual-check.js` | Visual cross-cutting |

### Cascade/loopback/contract orchestration

- `cli/src/test-cascade.ts` — multi-tier orderly execution (§78)
- `cli/src/loopback.ts` — cascade-fail → Ralph + escalation/halt (§79)
- `cli/src/contract-check.ts` — cli↔wecom-bot drift detector (§80)
- `cli/src/test-spec-eval.ts` — PLAN-time test-spec linter (§81)
- `cli/src/test-failure-context.ts` — failure-context schema (§77)

### Generic command-runner

`runHarnessTest` at `cli/src/commands.ts:5597` — for ANY test type without dedicated adapter, user wires `command:` / `commands:[]` in `.ralph-lisa.json` `testHarness.tests.<type>`. **关键**: 这是 RLL 的 generic 兜底，不是 stack-specific 支持。

---

## 二、9×8 Capability Matrix

**评分规则**（§83 R2 锁定）:
- ✅ Full = stack/type-specific adapter/runner + 至少 1 个 runnable fixture/example + file:line evidence
- 🟡 Partial = 有 adapter 但缺 fixture，或有 fixture 但缺 adapter；必须 name missing piece
- 🟠 Config-only = generic command-runner only；用户可自配，但 RLL 不专门支持
- ❌ Not supported = stack/type-specific blocker（sandbox / device farm / authorized human / etc.）
- ⚪ Out-of-scope = RLL 不该尝试做的领域（compliance audit / pen-test / human subjects）

**注**: generic command-runner 本身价值是有的（执行任意命令 + cascade 整合），但单独不算 RLL 对该 stack/type 的"支持"。

| Stack \ Test type | Unit | Functional | Integration | Performance | Stability | Security | E2E | Comprehensive |
|---|---|---|---|---|---|---|---|---|
| **Web app** | 🟠 generic command-runner only | ✅ Full (`adapters/playwright.js:1` + `templates/test-web/smoke.spec.ts:1`) | 🟡 Partial — Playwright works for API integration; missing docker-compose multi-service fixture | ✅ Full (`adapters/k6.js:1` for HTTP load + `templates/test-server/load.js:1` reusable pattern; web is HTTP same as server) | 🟡 Partial — k6 `templates/test-server/stress.js:1` exists; missing 24h-soak fixture | 🟠 generic command-runner only (security adapter is parser; user wires `npm audit`/`gitleaks` cmds) | ✅ Full (`templates/test-web/api.spec.ts:1` + `templates/test-web/smoke.spec.ts:1`) | 🟡 Partial — cascade §78 ties tiers; missing comprehensive-preset .ralph-lisa.json template |
| **CLI** | 🟠 generic command-runner only (no jest/vitest/pytest unit adapter) | ✅ Full (`templates/test-cli/smoke.test.ts:1` spawn-based + `cmdSmokeTest` at `commands.ts:5275`) | 🟠 generic command-runner only — no integration template | 🟠 generic command-runner only — no hyperfine adapter | 🟠 generic command-runner only | 🟠 generic command-runner only | ✅ Full (`templates/test-cli/smoke.test.ts:1` spawns CLI binary end-to-end) | 🟡 Partial — cascade ties; missing preset |
| **AI agent** | 🟠 generic command-runner only (pure-func unit via user-supplied node:test/pytest) | 🟡 Partial — `adapters/ai-eval.js:1` + `templates/test-ai/cases.json:1` + `run-eval.js:1`; missing rubric/criteria scoring example | 🟠 generic command-runner only — no multi-tool agent chain template | 🟠 generic command-runner only — could wrap LLM calls in k6 HTTP harness; no preset | 🟠 generic command-runner only | 🟠 generic command-runner only — security adapter is output-parser only; missing prompt-injection runnable fixture | 🟡 Partial — `run-eval.js:1` drives single-turn; missing multi-turn convo template | 🟡 Partial — missing comprehensive-preset .ralph-lisa.json template |
| **Desktop** | 🟠 generic command-runner only (Electron/Tauri framework owns unit) | ✅ Full (`adapters/midscene.js:1` + `templates/test-desktop/smoke.yaml:1`) | 🟠 generic command-runner only | 🟠 generic command-runner only — cold-start user-wired; no adapter | 🟠 generic command-runner only — no long-running fuzz template | 🟠 generic command-runner only | ✅ Full (Midscene drives desktop via VLM; `templates/test-desktop/smoke.yaml:1`) | 🟡 Partial — missing comprehensive-preset .ralph-lisa.json template |
| **Mobile** | 🟠 generic command-runner only (XCTest/JUnit framework owns unit) | ✅ Full (`templates/test-mobile/smoke-android.yaml:1` + `smoke-ios.yaml:1` + Midscene adapter) | 🟠 generic command-runner only | 🟠 generic command-runner only — mobile perf needs Instruments/Profiler (vendor) | 🟠 generic command-runner only | 🟠 generic command-runner only | ✅ Full (Midscene drives via WDA + adb; `templates/test-mobile/smoke-android.yaml:1`) | 🟡 Partial — missing comprehensive-preset .ralph-lisa.json template |
| **Mini-program** | 🟠 generic command-runner only | ✅ Full (`templates/test-miniprogram/smoke.automator.js:1` + `smoke.midscene.yaml:1`) | 🟠 generic command-runner only | 🟠 generic command-runner only | 🟠 generic command-runner only | 🟠 generic command-runner only | ✅ Full (`templates/test-miniprogram/smoke.automator.js:1` drives WeChat devtools) | 🟡 Partial — missing comprehensive-preset .ralph-lisa.json template |
| **Plugin** | 🟠 generic command-runner only (browser ext / VSCode ext have own test runners) | ❌ Not supported — missing plugin-specific template; browser ext needs extension host; VSCode ext needs `@vscode/test-electron` | 🟠 generic command-runner only | 🟠 generic command-runner only | 🟠 generic command-runner only | 🟠 generic command-runner only | 🟡 Partial — Midscene could drive browser with extension installed; missing extension-host fixture | 🟡 Partial — missing comprehensive-preset .ralph-lisa.json template |
| **Server** | 🟠 generic command-runner only (jest/vitest/pytest user-supplied) | ✅ Full (`templates/test-server/smoke.js:1` k6-driven HTTP smoke as functional baseline) | 🟡 Partial — `templates/test-server/smoke.js:1` exists; missing multi-service docker-compose integration template | ✅ Full (`adapters/k6.js:1` + `templates/test-server/load.js:1`) | ✅ Full (`templates/test-server/stress.js:1` + k6 extended-duration patterns) | 🟠 generic command-runner only | ✅ Full (`templates/test-server/smoke.js:1` exercises server end-to-end via HTTP) | 🟡 Partial — missing comprehensive-preset .ralph-lisa.json template |
| **Cloud infra** | 🟠 generic command-runner only (terraform validate / kubectl --dry-run via user wiring) | 🟡 Partial — could chain kubectl/aws-cli; missing template for multi-resource verification | 🟡 Partial — similar to functional; missing template | 🟠 generic command-runner only — cloud perf = SLA / vendor tools | 🟠 generic command-runner only — chaos engineering = LitmusChaos/Chaos Mesh, out of RLL scope | 🟠 generic command-runner only — user wires tfsec/checkov; no runnable cloud-security fixture in RLL | ❌ Not supported — cloud E2E needs sandbox account / VPC; out of RLL native scope | ❌ Not supported |

**Cell count audit (recomputed cell-by-cell after Lisa R4 narrows)**:

| Stack | ✅ | 🟡 | 🟠 | ❌ |
|---|---|---|---|---|
| Web app | 3 (functional, perf, E2E) | 3 (integration, stability, comprehensive) | 2 (unit, security) | 0 |
| CLI | 2 (functional, E2E) | 1 (comprehensive) | 5 (unit, integration, perf, stability, security) | 0 |
| AI agent | 0 | 3 (functional, E2E, comprehensive) | 5 (unit, integration, perf, stability, security) | 0 |
| Desktop | 2 (functional, E2E) | 1 (comprehensive) | 5 (unit, integration, perf, stability, security) | 0 |
| Mobile | 2 (functional, E2E) | 1 (comprehensive) | 5 (unit, integration, perf, stability, security) | 0 |
| Mini-program | 2 (functional, E2E) | 1 (comprehensive) | 5 (unit, integration, perf, stability, security) | 0 |
| Plugin | 0 | 2 (E2E, comprehensive) | 5 (unit, integration, perf, stability, security) | 1 (functional) |
| Server | 4 (functional, perf, stability, E2E) | 2 (integration, comprehensive) | 2 (unit, security) | 0 |
| Cloud infra | 0 | 2 (functional, integration) | 4 (unit, perf, stability, security) | 2 (E2E, comprehensive) |
| **Total** | **15** | **16** | **38** | **3** |

**Total: 15 + 16 + 38 + 3 = 72 cells ✓**

Updated coverage:
- ✅ Full = **15** (21%)
- 🟡 Partial = **16** (22%)
- 🟠 Config-only = **38** (53%)
- ❌ Not supported = **3** (4%)

---

## 三、Per-stack 深度分析

### 3.1 Web app

**Strengths**: Playwright adapter 成熟（`adapters/playwright.js`）+ 完整 test-web 模板（smoke + api specs）+ k6 perf integration。

**Gaps**:
- **Unit (🟠)**: 没有 jest/vitest specific adapter；用户自配 `npm test --prefix <pkg>`（这是 cli 当前自己的做法）
- **Integration (🟡)**: 缺 docker-compose multi-service fixture；缺 mock-server harness pattern
- **Stability (🟡)**: k6 stress 模板有，但缺 24h+ soak template

**Elegant solutions**:
- Unit (minimal): NEW `templates/test-web-unit/jest.config.example.js` + README 说明 jest/vitest 怎么接 cascade tier
- Integration (pragmatic): NEW `templates/test-web-integration/docker-compose.yaml.tmpl` + README
- Stability (minimal): 扩展 `templates/test-server/stress.js` 加 `--duration 24h` 注释

### 3.2 CLI

**Strengths**: `templates/test-cli/smoke.test.ts:1` 用 node:test 跑 spawn-based smoke；cmdSmokeTest 自带；test-cli pattern 即跑工具本身。

**Gaps**:
- **Unit (🟠)**: smoke.test.ts 是 spawn-based functional/smoke 测试，不是 unit；不同语言 CLI（Python/Go/Rust）需要用户自配 unit 框架
- **Integration (🟠)**: 没专门 integration 模板（CLI integration 通常意味多进程协作）
- **Performance/Stability (🟠)**: hyperfine / time 用户自配

**Elegant solutions**:
- Unit (pragmatic): NEW `templates/test-cli-multi/` with pytest + cargo test + go test 子 README（含真 unit 范本）
- Performance (minimal): 加 `templates/test-cli/perf-hyperfine.example.sh`

### 3.3 AI agent

**Strengths**: ai-eval adapter + cases.json 模板 + run-eval.js runner。

**Gaps**:
- **Functional (🟡)**: cases.json 仅 input/expected；缺 rubric/criteria 评分模板
- **E2E (🟡)**: run-eval.js single-turn；缺 multi-turn 对话 template
- **Performance (🟠)**: 无 LLM throughput / latency adapter（开源工具如 vllm-benchmark 可包装）
- **Security (🟠)**: security adapter 仅 output parser（无 runnable fixture）；缺 prompt-injection / jailbreak fixture（roadmap 标注）

**Elegant solutions**:
- Functional (pragmatic): 扩展 `templates/test-ai/cases.json` 加 `rubric` + `judgeCommand` 字段
- E2E (pragmatic): NEW `templates/test-ai/multi-turn.json` + run-eval.js 增加 conversation 字段
- Performance (strategic): NEW vllm-benchmark adapter（包装 vllm-benchmark / k6-llm 工具）
- Security (pragmatic): NEW `templates/test-ai-security/prompt-injection-cases.json`

### 3.4 Desktop

**Strengths**: Midscene VLM adapter + smoke.yaml 模板。

**Gaps**:
- **Performance (🟠)**: 桌面 cold-start / memory profiling 没 adapter（Electron 自带 chrome devtools 协议；可包装但不在 RLL scope）
- **Stability (🟠)**: long-running fuzz 没模板（mojibake / large-input）

**Elegant solutions**:
- Performance (pragmatic): NEW `templates/test-desktop/perf-cold-start.example.js`（spawn time + memory.rss 测量）
- Stability (minimal): 在 README 加"long-running 思路"段，引用 stress.js pattern

### 3.5 Mobile

**Strengths**: Midscene 同时支持 Android (adb) + iOS (WDA)；模板齐全。

**Gaps**:
- **Performance (🟠)**: Mobile perf 强依赖 Xcode Instruments / Android Profiler — 非 RLL native scope
- **Stability (🟠)**: 长跑 fuzz 没模板

**Elegant solutions**:
- Performance: 不解 — 标记为 vendor-tool 依赖（**接受 🟠**）
- Stability (minimal): README 加注释引用 Midscene loop pattern

### 3.6 Mini-program

**Strengths**: automator + Midscene 双驱动（automator 适合稳定 case，Midscene 适合 UX validation）。

**Gaps**:
- 与 Mobile 类似 — perf/stability 受小程序运行时限制；解决空间小

**Elegant solutions**:
- 接受当前状态；需要时用 automator 长跑 + 计数

### 3.7 Plugin

**Strengths**: 无（matrix 内 plugin 列全部 🟠/❌/🟡，无 ✅ cell）。

**Gaps (重)**:
- **Functional (❌)**: 完全没 plugin template — 这是真 gap
- **E2E (🟡)**: Midscene 理论上能驱动安装好扩展的浏览器；缺 fixture

**Elegant solutions**:
- Functional (pragmatic): NEW `templates/test-vscode-extension/` 用 `@vscode/test-electron` + sample test
- Functional (pragmatic): NEW `templates/test-browser-extension/` 用 Playwright extension-host 模式
- E2E (pragmatic): 扩展现有 Midscene 模板加 extension-loaded browser context 配置

**这是 §83-followup 候选**（plugin-template-mvp）— 1 sub-slice 5-7 round。

### 3.8 Server

**Strengths**: perf + stability + functional + E2E 覆盖；test-server 模板齐全（`templates/test-server/load.js:1` / `stress.js:1` / `smoke.js:1`）；k6 adapter (`adapters/k6.js:1`) 通用。

**Gaps**:
- **Unit (🟠)**: jest/vitest/pytest 用户自配 — 与其他 stack 同款 unit 缺口
- **Integration (🟡)**: 缺 multi-service docker-compose 模板（K8s 集成同款问题）
- **Security (🟠)**: 与其他 stack 同 — security adapter 是 parser；缺 server-specific runnable security fixture（OWASP ZAP / sqlmap / etc 用户自配）
- **Comprehensive (🟡)**: 同 cross-cutting

**Elegant solutions**:
- Integration (pragmatic): NEW `templates/test-server-integration/docker-compose.yaml.tmpl` + ready-to-extend pattern
- Security (pragmatic): 见 §4.5 cross-cutting — 跨 stack security fixture solution

### 3.9 Cloud infra

**Gaps (重)**:
- **Functional/Integration (🟡)**: terraform validate / kubectl --dry-run 没专属 template
- **Security (🟠)**: tfsec/checkov 用户自配；缺 cloud-security runnable fixture
- **Performance/Stability (🟠)**: chaos engineering 不在 RLL native scope；cloud perf = SLA 监控 = vendor 责任
- **E2E + Comprehensive (❌)**: cloud E2E 需要 sandbox 账号 / VPC — RLL 不应代用户授权

**Elegant solutions**:
- Functional (pragmatic): NEW `templates/test-terraform/` 含 plan-diff snapshot + 引用 tfsec config 用法
- Integration (pragmatic): NEW `templates/test-k8s/` 含 manifest validate + kustomize build + dry-run
- Security (pragmatic): NEW `templates/test-cloud-security/` 引用 tfsec/checkov + .ralph-lisa.json 范本
- Stability/E2E (strategic / unsupported): 接受 ❌（明确不在 RLL scope；推荐 user 用 Argo Rollouts / chaos-mesh 等）

**§83-followup 候选**（cloud-infra-template-mvp）— 1 sub-slice 5-7 round。

---

## 四、Cross-cutting concerns（跨 stack 共性问题）

### 4.1 Unit testing universal gap (9/9 🟠)

**问题**: 9 stack 的 Unit 列全是 🟠 — RLL 没有任何 stack-specific unit-test adapter。Jest/Vitest/Pytest/PHPUnit/RSpec/JUnit/XCTest/Cargo Test/Go test 都靠 generic command-runner 跑。

**影响**: §81 test-spec-eval 的 thin-coverage 规则会触发，但 RLL 不能"主动建议"用户用哪个 unit 框架。

**Elegant solutions**:
- (minimal): 不做 — 让用户自己选框架，generic command-runner 完全胜任
- (pragmatic): NEW `cli/src/templates/test-unit-multi/{jest,vitest,pytest,...}.example.config.{js,toml}` 提供 cascade tier 配置范本
- (strategic): NEW universal `unit` adapter that auto-detects framework via package.json/pyproject.toml/Cargo.toml + parses TAP/JUnit XML / pytest output

**推荐**: pragmatic 方案最 ROI 高，cascade tier 配置可直接复用。

### 4.2 Stability 长跑模板荒漠 (8/9 🟠)

**问题**: 8 stack 的 Stability 列 🟠（除 Server ✅ via `templates/test-server/stress.js:1`）。

**根因**: 长跑测试要 hours/days，模板提供方法 less than 工具支持。

**Elegant solutions**:
- (minimal): 现有 `templates/test-server/stress.js:1` 已展示 k6 long-duration pattern；加 README cross-reference
- (pragmatic): NEW `templates/test-stability-multi/` README 含 web/server/desktop/mobile/CLI 各自 long-running 模板片段

### 4.3 Performance 跨栈不均

- Web/Server perf ✅（k6 完整 — `templates/test-server/load.js:1` 双用）
- Mobile/Desktop perf 受 vendor 工具限制 🟠（接受 — vendor profilers 是 OEM 闭环，非 RLL scope）
- AI agent perf 🟠（缺 throughput adapter — pragmatic gap，§92 候选）
- CLI/Mini-program/Plugin/Cloud perf 🟠（领域工具特化或 SLA 性质）

### 4.4 Comprehensive 测试 (8/9 🟡)

8 stack 的 Comprehensive 列全是 🟡（除 Cloud infra ❌）— cascade engine §78 提供了 multi-tier 编排，但**缺"comprehensive preset"**（即 "我要把所有 tier 跑一遍" 的预配置 .ralph-lisa.json 范本）。

**Elegant solution (minimal)**: NEW `templates/comprehensive-preset/.ralph-lisa.json.example` per stack；cascade tier 排好顺序 + halt_on_fail 默认值。

### 4.5 Security 跨栈 9/9 🟠（new — Lisa R4 narrow downgrade）

**问题**: 9 stack 的 Security 列全是 🟠 — `adapters/security.js:1` 是 output parser（消费 npm audit / gitleaks 输出 JSON），不是 RLL 本身带 runnable security 测试 fixture。User 必须自己拼 commands 才有真正的 security check。

**根因**: 安全测试本质是把 user-supplied 工具的输出**解析**为 metrics + threshold check —— RLL 给 parser 但不给 fixture，因为不同 stack 的真 security 测试 命令完全不同（npm audit / gitleaks / OWASP ZAP / Trivy / tfsec / etc）。

**Elegant solutions**:
- (minimal): 在 `templates/test-security/` 加 README + sample `.ralph-lisa.json` 段（含 `npm audit --json` + `gitleaks detect --report-format json` 命令组合）
- (pragmatic): NEW `templates/test-security-multi/` 按 stack 分子目录，给出每 stack 的 security 命令组合范本（web 用 ZAP；server 用 ZAP+sqlmap；cloud 用 tfsec/checkov；container 用 Trivy；source 用 gitleaks/semgrep）
- (strategic): NEW `cli/src/security-runner.ts` 在 cli 内提供 `ralph-lisa security-scan --stack <web|server|cloud|...>` 一键封装常见组合

**推荐**: pragmatic（NEW templates/test-security-multi/）— 1 sub-slice 5-7 round。

---

## 五、Roadmap 提议（按 ROI 排序）

### Tier 1: 高 ROI / 小 scope（每个 1 sub-slice 5-7 round）

| # | Sub-slice | Closes | Estimated |
|---|---|---|---|
| §84 | `comprehensive-preset-templates` | Comprehensive 8 stack 🟡 → ✅（cloud 仍 ❌）— 8 个 .ralph-lisa.json 模板 | 5r |
| §85 | `security-multi-stack-templates` | Security 9 stack 🟠 → 🟡 (闭口)— stack-specific security cmd 组合 | 6r |
| §86 | `plugin-templates-mvp` | Plugin Functional ❌ → ✅；E2E 🟡 → ✅ | 7r |
| §87 | `cloud-infra-templates` | Cloud Functional + Integration + Security 🟡/🟠 → 🟡/✅ | 6r |
| §88 | `ai-agent-rubric-multi-turn` | AI agent rubric + multi-turn 🟡 → ✅；prompt-injection security fixture | 5r |
| §89 | `unit-test-multi-stack-templates` | Unit 9 stack 🟠 → 🟡 (有真 unit 范本但不算 ✅，因为 unit 框架本身不是 RLL) | 6r |

完成 §84-§89 后预估：
- ✅ Full 数：15 → ~28（39% 覆盖率，从 21% 提升）
- 🟡 Partial：16 → ~25
- 🟠 Config-only：38 → ~17（剩下的是真心 vendor-specific 或不该解决的）
- ❌ Not supported：3 → 1（剩下 cloud E2E + comprehensive，因 sandbox 限制）

### Tier 2: 中 ROI / 中 scope（每个 1-2 sub-slice 8-12 round）

| # | Sub-slice | Closes |
|---|---|---|
| §89 | `unit-universal-adapter` | 通用 unit adapter（auto-detect framework + parse TAP/JUnit XML） |
| §90 | `web-integration-docker-compose-template` | Web/Server integration multi-service template |
| §91 | `stability-cross-stack-template` | 7 stack 长跑模板 |
| §92 | `ai-agent-perf-adapter` | LLM throughput / latency adapter（vllm-benchmark 包装） |

### Tier 3: 拒绝接受 ❌（接受不做）

- Mobile perf via Instruments/Profiler — 留给 user 自用 vendor 工具
- Cloud chaos engineering — 留给 LitmusChaos / Chaos Mesh
- Cloud E2E（需 sandbox 账号 / VPC）— 留给 user 自配
- Plugin perf/stability — 框架级问题，非 RLL scope

---

## 六、Out-of-scope（明确不在 RLL native scope）

⚪ 以下领域不应 RLL 试图原生支持，应当 deferred 给专用工具或 human:

| 领域 | 为什么 out-of-scope | 推荐 user 用什么 |
|---|---|---|
| **Compliance audit (SOC2/HIPAA/GDPR)** | 法律 + 流程 + 人工审计；RLL 无法替代 | 专业审计公司 |
| **Pen-test (authorized intrusion testing)** | 需明确法律授权 + 人工 | 第三方 security firm |
| **Hardware-in-the-loop (HIL)** | 需物理设备 + 实验室 | 专用 HIL 工具链（DSpace etc.） |
| **Real-user usability testing** | Human subject IRB + ethics | UserTesting.com / 内部 UX 团队 |
| **Social engineering / red team** | Multi-week 人类参与 | 专业 red team 公司 |
| **Mobile vendor 工具** (Instruments / Android Profiler) | OEM 专属 GUI 工具 | Apple / Google 官方工具 |
| **Cloud vendor SLA monitoring** | Vendor dashboard 责任 | AWS CloudWatch / GCP Monitoring |

⚪ 当前矩阵中**没有 cell 标 ⚪**（all gaps 是 🟠/🟡/❌）。这些 ⚪ 领域是**矩阵的边界外**（out-of-matrix-boundary），不是 9 stack × 8 type 的某 cell —— 而是 RLL 整体不应试图支持的领域。如果未来用户要求 RLL 支持上述领域，明确拒绝并推荐替代品。

TP-5 中的 "≥5 ⚪ out-of-scope domains" 指的是这一节里的 7 个边界外领域（compliance / pen-test / HIL / human subjects / red team / mobile vendor profiler / cloud SLA 监控），不是矩阵 cells。

---

## 七、Self-audit log（R4 commitment 验证）

## Test Plan

为满足 §81 linter requirement + audit 报告自身 claims（每条用 grep/工具实测可验证）:

| ID | Surface | Cases | Count |
|---|---|---|---|
| [TP-1] | matrix grep audit | every ✅ cell has file:line citation; every 🟡 cell names missing piece (`missing\|缺\|gap\|need`); every 🟠 cell says "generic command-runner only" verbatim; reject overclaim if any rule fails | 3 |
| [TP-2] | matrix structural | 9 stack rows × 8 type cells = 72 populated cells; reject if blank or "?" cells exist | 1 |
| [TP-3] | §81 dogfood | running `ralph-lisa test-spec-eval --plan-file <this report>` returns `blocking_gap_count: 0` (no thin-coverage / no-test-plan); rejects if any high-severity gap | 1 |
| [TP-4] | inventory accuracy | every `templates/test-*/` path cited exists in repo; every `adapters/*.js` cited exists; reject if file missing | 2 |
| [TP-5] | out-of-scope honesty | section 六 lists ≥5 ⚪ out-of-scope domains with replacement-tool recommendation; reject if no alternative given | 1 |
| [TP-6] | solution tier honesty | Tier 1 ROI 5 candidates + Tier 2 medium-ROI 4 + Tier 3 explicitly accepts ❌ for ≥3 cases (no fake "everything has minimal fix"); reject if no honest unsupported acknowledgment | 1 |

### TP-1: Matrix grep audit (locked rubric per Lisa R4 narrow)

```bash
# Scope: matrix rows only — start with `| **<stack name>**` AND contain a status emoji
# (excludes the Total row at :114 which has no emoji, and the out-of-scope domains
# table around :348-354 which also has no emoji)
$ MATRIX='grep -E "^\| \*\*" docs/test-harness-capability-evaluation.md | grep -E "✅|🟡|🟠|❌"'
$ eval "$MATRIX" | wc -l
9   # 9 stack rows ✓

# Strict rule: every ✅ marker in matrix rows MUST contain file:line evidence
$ eval "$MATRIX" | grep "✅" | grep -vE "\.(ts|js|json|yaml|sh|md):"
# expected: empty (every ✅ matrix cell references a real file:line)

# 🟡 cells in matrix rows must name a missing piece
$ eval "$MATRIX" | grep "🟡 Partial" | grep -vE "missing|缺|gap|need"
# expected: empty (every 🟡 matrix cell identifies a missing piece keyword)

# 🟠 cells in matrix rows must say "generic command-runner only"
$ eval "$MATRIX" | grep "🟠" | grep -v "generic command-runner only"
# expected: empty (every 🟠 matrix cell says verbatim "generic command-runner only")
```

Note: prose sections outside matrix rows (gap bullets, headings, roadmap deltas) intentionally use 🟡/🟠/❌ markers without the matrix-cell verbatim phrases — the audit must scope to matrix rows (line-prefix `| **` + status emoji) to avoid false positives.

### TP-2: 9 × 8 = 72 cell

矩阵 stack rows = 9；每行 8 type cells = 72 ✓（已审）。

### TP-3: §81 dogfood

```bash
$ ralph-lisa test-spec-eval --plan-file <this report> --json
# expected: blocking_gap_count: 0 + ≥3 unique_surfaces
```
本 report 第六节有 ## Test Plan 段 (TP-1..TP-6)；§81 linter 应该接受。

### TP-4: Inventory accuracy

每个引用的 file path 都通过 `ls cli/templates/test-*` / `ls cli/node_modules/.../adapters/` 实测验证（R4 PLAN 已 grep）。

### TP-5: Out-of-scope honesty

第六节 ⚪ Out-of-scope 列出 7 个领域 + 推荐替代品。

### TP-6: Solution tier honesty

- Tier 1 高 ROI 5 个 sub-slice
- Tier 2 中 ROI 4 个 sub-slice
- Tier 3 接受不做（明确 4 个 ❌ 案例）

不假装"everything has minimal/pragmatic fix"。

---

## 八、结论

**当前 RLL test harness 覆盖率（recomputed per Lisa R4 + R5 narrows）**:
- ✅ Full = 21%（15/72）— Web/Mobile/Mini-program/Desktop functional+E2E + Server perf/stability/E2E + CLI functional/E2E 共 15 cell
- 🟡 Partial = 22%（16/72）— 8 stack 的 Comprehensive cells + Cloud functional/integration + AI agent functional/E2E + Web integration/stability + Server integration/comprehensive
- 🟠 Config-only = 53%（38/72）— Unit 9 + Security 9 + 大部分 Stability + 部分 Integration/Performance
- ❌ Not supported = 4%（3/72）— Plugin functional + Cloud E2E + Cloud comprehensive
- ⚪ Out-of-scope = 0/72（boundaries 在矩阵外，非 cells）

**通过 §84-§89（Tier 1 推荐 sub-slices）可提升 ✅ Full 至 ~39%**（15→28 cells）；剩余多属真实工具链限制（vendor / human / sandbox / chaos）— 接受不做更诚实。

**核心强项**（不是 adapter 数量，而是 orchestration 内核）:
- cli + cascade + loopback + contract-check + spec-eval 内核已在；任何 stack 通过 `testHarness.tests` + `testTiers` 都能被 cascade engine 编排
- 失败 → JSON 落盘 → Ralph 自动接手 → escalate/halt sentinel — 这套 closed-loop 机制对所有 9 stack 通用
- §80 contract-check 跨模块漂移检测对 IPC-heavy stack（server/cloud/AI agent multi-tool）特别值钱

**这是 RLL 的真正杠杆**，而不是 adapter 数量。Adapter 是必要但不充分；orchestration + closed loop 才是关键。

---

## 附录: 验证命令一键复用

```bash
# 验证 adapter 文件存在
ls cli/node_modules/@yw1975/rll-core/dist/testing/adapters/*.js

# 验证 template 文件存在
ls cli/templates/test-*

# 验证 cli dispatch
grep "case " cli/src/cli.ts | grep -E "test|cascade|contract|loopback|spec-eval"

# §81 dogfood 本报告
ralph-lisa test-spec-eval --plan-file docs/test-harness-capability-evaluation.md --json

# §80 contract-check live
ralph-lisa contract-check --json
```
