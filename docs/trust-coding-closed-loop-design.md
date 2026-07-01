# Trust-Coding Closed-Loop Design

**Status**: research-only deliverable for §90 sub-slice. Zero impl in this slice. Hands off to §91/§92/§93 implementation queue.
**Date**: 2026-05-10
**Authors**: Ralph (drafter) + Lisa (reviewer, narrows R1/R2/R3) + user (strategic frame)
**Pattern**: mirrors §66 wecom-state-matrix-research deliverable scale

> Bottom-line constraint per user 2026-05-10: **不能跑坏现 RLL 成熟的流程和能力**. 只补 gap, 不重写, 不取代. See section 6 for 13 unchanged-invariant proofs.

---

## 1. Discussion archaeology

This conversation between user, Ralph, and Lisa pivoted 4 times before locking the design. Capturing verbatim so future maintainers (and §91-§93 implementers) can re-derive the rationale rather than guessing.

### Pivot 1 — "封装测试 CLI/tools + Skill" (initial draft)

Ralph's first proposal post-§83: wrap each test CLI (k6, playwright, npm audit, gitleaks) into an RLL sub-command (`ralph-lisa test:security:web`) and pair each with a Claude Code Skill (`skills/rll-test-security-web/SKILL.md`) so agents auto-invoke.

Critique that emerged: 18 wrapped tools × 18 Skills = 36 surfaces, mostly repeating the same invocation pattern (detect → run → parse → loop). DRY violation; surface explosion.

### Pivot 2 — "1 skill + N preset" (DRY reframe by user)

User's response: "我觉的好像没必要每个矩阵的 cell 都要创建一个 skill，因为大部分重复". The unit of capability isn't "per cell" — it's "per stack+change-type", and the agent only needs *one* skill that knows how to consult presets.

Architecture flips: `1 skill` (`rll-test-by-stack/SKILL.md`) + `N preset.json` (data files, not code) + `1 runner` (`ralph-lisa test --auto`). Maintenance cost drops 5-10x.

### Pivot 3 — "Lisa 不审 vs Ralph 不调" (real-gap reframe)

User's framing of the actual problem: "我们现在开发单元测试都会做，但是冒烟测试，功能测试，集成测试等等，能力矩阵中的测试并不会被自动调用". Lisa already audits every Ralph submit (turn-based protocol enforces this; `cli/src/policy.ts` requires Test Results section in [CODE]/[FIX]). The gap isn't review absence — it's **invocation absence**. Ralph reaches for `npm test` because that's familiar; smoke / functional / integration / E2E / perf / security tiers are skipped.

This reframe is the design center of gravity. All subsequent architecture serves this gap, not the broader "wrap every tool" ambition.

### Pivot 4 — "trust-coding 多重门禁 + 反馈 loop 是核心" (mission-alignment lock)

User locked RLL's core mission: AI 在人类不干预或极少干预的情况下实现 trust coding. Multi-tier test gates + feedback loops are *the* mechanism; WeCom/Lark/cross-agent integration are nice-to-have. This means: §90 trust-coding work outranks new bot integrations / cross-agent tooling.

---

## 2. Gap statement (3-layer)

The "Ralph 不调" symptom decomposes into three causal layers:

### L1 — No ground truth: Ralph 不知道该调啥

Currently Ralph's only invocation guidance is `.ralph-lisa.json` `testRunners` (a static command list, not stack/change-type aware) and his own prompt-engineered instinct. There is **no machine-checkable rule** that says "改 `cli/src/commands.ts` 加子命令 → 必须跑 [unit, smoke, contract-check, integration]". The capability matrix exists in `docs/test-harness-capability-evaluation.md` but as an evaluation artifact, not as a runtime contract.

### L2 — No auto-invocation: 没有动态选 tier 的机制

`cli/src/commands.ts:1286 cmdQualityGate` runs whatever is in `testRunners` (or `RL_GATE_COMMANDS`) — same set of cmds for every sub-slice, every change type. Cascade engine `cli/src/commands.ts:7428 cmdTestCascade` (§78) supports tier strategy filtering (`halt-on-fail` / `smoke-only` / `full`) but doesn't consult preset metadata to know which tiers are *required* vs *optional* for the current sub-slice.

### L3 — Policy gate is tier-blind

`cli/src/policy.ts` enforces "Test Results section must exist in [CODE]/[FIX]" but accepts any single-line evidence (`npm test 150/150 pass`) as satisfaction. There is no per-tier gate: `smoke: 0`, `functional: 0`, `integration: 0` is invisible. Ralph can ship code touching cli + server with only unit evidence, and current policy says PASS.

### Why this is hard to fix unilaterally

Each layer alone is insufficient:
- Ground truth (L1) without auto-invocation (L2) = preset.json sits as documentation, not enforcement
- Auto-invocation (L2) without policy gate (L3) = test runs but missing-tier still ships
- Policy gate (L3) without ground truth (L1) = false positives (Ralph blamed for missing tier that wasn't required)

§90 design addresses all three layers in one architectural arc.

---

## 3. Capability matrix recap

Reference: `docs/test-harness-capability-evaluation.md` (closed §83 mutual CONSENSUS 2026-05-10).

**9 stacks × 8 test types = 72 cells**:
- ✅ Full = 15 (21%) — adapter + fixture + file:line evidence (e.g. Web E2E via `templates/test-web/api.spec.ts:1`)
- 🟡 Partial = 16 (22%) — adapter without fixture, or fixture without adapter; missing-piece named
- 🟠 Config-only = 38 (53%) — generic command-runner only; user wires the actual cmd
- ❌ Not supported = 3 (4%) — Plugin functional + Cloud E2E + Cloud comprehensive

**Trust-coding-relevant subset for §90 starter presets**: cli / web / server stacks × functional / smoke / integration / E2E test types — 12 cells out of 72. Matrix Unit row全栈 🟠 (no stack-specific unit adapter) is **out of §90 scope** — accepted carry-forward, addressed by future §94 unit-test-multi-stack-templates if needed.

§90 doesn't try to upgrade matrix cells. §90 makes invocation **automatic and tier-aware** for the cells already at 🟡/🟠/✅. Bringing the 🟠 cells into routine invocation is more valuable than trying to push them to ✅.

---

## 4. Architecture proposal

### 4.1 Module layout (NEW only)

```
cli/src/preset/
├── stack-detect.ts        — pure fn (cwd → stack)
├── change-type-detect.ts  — pure fn (git diff paths + handoff Files → change-type)
├── preset-loader.ts       — `loadPresetByName(presetKey, opts)` loads templates/presets/<preset-key>.json (file name = preset key, NOT stack-changeType decomposition; per §91 R4-R6 narrow lock — see "Loader API" note below §4.5)
├── schema.ts              — Preset / Tier / TierConfig types + JSON-schema validators
└── runner.ts              — cmdTestAuto entry: detect → load → cascade

cli/templates/presets/      — JSON data, not code
├── cli-cmd.json
├── cli-schema.json
├── web-ui.json
├── platform-server-cmd.json
└── (future: wecom-bot-cmd / web-api / pure-refactor / migration / etc)
```

Existing modules (UNCHANGED interfaces): `cli/src/commands.ts:1072 runGate`, `:1286 cmdQualityGate`, `:6001 cmdTest`, `:5275 cmdSmokeTest`, `:7428 cmdTestCascade`, `:7300 cmdContractCheck`, `:7237 cmdTestSpecEval`, `cli/src/loopback.ts:121 processCascadeFailures`.

### 4.2 Preset schema

```typescript
// cli/src/preset/schema.ts (proposed)
export type Tier =
  | "unit" | "smoke" | "functional" | "integration"
  | "e2e" | "perf" | "stability" | "security";

export interface TierConfig {
  cmd: string;                    // shell cmd to run
  parser?: AdapterName;           // optional output parser (one of existing adapters)
  threshold?: Record<string, number>;  // metric → minimum
  oracle: string;                 // human-readable assertion: what "pass" proves
  locallyRunnable: boolean;       // false → R2 deferral allowed (see §5.2)
  requiredBinary?: string;        // standalone binary needed (e.g. "k6", "gitleaks"); §91 runner preflights via `command -v`
                                  //   — npm/npx-installable tools (playwright via npx) do NOT count; only true standalone binaries
                                  //   — if requiredBinary missing at runtime: required-tier → reject submit with install hint;
                                  //                                          optional-tier → skip silently with reason logged
}

export interface Preset {
  stack: string;            // e.g. "cli", "web", "server"
  changeType: string;       // e.g. "cmd", "schema", "ui"
  requiredTiers: Tier[];    // must run + must have evidence in [CODE]/[FIX]
  optionalTiers: Tier[];    // attempted only when explicitly selected via --tier; absence NEVER blocks submit
  perTierConfig: Partial<Record<Tier, TierConfig>>;
}
```

### 4.3 Four starter preset examples (per Lisa R1 Q2 + R5 narrow B2)

**cwd convention** (Lisa R5 narrow B1 lock): all preset cmds run with `cwd = super-rll/` (repo root). Every cmd path in the preset JSONs below resolves from repo root; e.g. `cli/templates/test-web/smoke.spec.ts` exists, `templates/test-web/smoke.spec.ts` does NOT. §91 runner must `chdir(repoRoot)` before spawning.

#### `cli-cmd.json` — adding/modifying a CLI sub-command

```json
{
  "stack": "cli",
  "changeType": "cmd",
  "requiredTiers": ["unit", "smoke", "integration"],
  "optionalTiers": ["functional"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test --prefix cli",
      "oracle": "All vitest cases for cli/src/test/*.ts pass; new cmd's unit test ≥1 case covers happy path + 1 negative",
      "locallyRunnable": true
    },
    "smoke": {
      "cmd": "ralph-lisa smoke-check",
      "oracle": "CLI binary spawns + new sub-cmd surfaces in `--help`; no crash on bare invocation",
      "locallyRunnable": true
    },
    "integration": {
      "cmd": "ralph-lisa contract-check --json",
      "oracle": "No drift between cli sub-cmd dispatch table and wecom-bot/lark-bot/dingtalk-bot accept-list",
      "locallyRunnable": true
    },
    "functional": {
      "cmd": "node cli/dist/cli.js <sub-cmd> --help && node cli/dist/cli.js <sub-cmd> <happy-args>",
      "oracle": "End-to-end invocation succeeds with realistic args; exit code 0 + stdout matches expected",
      "locallyRunnable": true
    }
  }
}
```

> **Adapter note**: the smoke tier above has no `parser` field because no `smoke` adapter exists. Existing adapters (`cli/node_modules/@yw1975/rll-core/dist/testing/adapters/index.js`) are: `ai-eval` / `k6` / `midscene` / `playwright` / `security` / `visual`. Tiers without a matching adapter rely on the runner cmd's exit code + stdout regex, not structured metrics.

#### `cli-schema.json` — adding/modifying a CLI schema (state file, JSON contract, etc)

```json
{
  "stack": "cli",
  "changeType": "schema",
  "requiredTiers": ["unit", "smoke", "integration"],
  "optionalTiers": ["functional"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test --prefix cli -- schema",
      "oracle": "Schema-shape unit tests cover: valid / invalid-extra-field / invalid-missing-field / invalid-type-mismatch (≥4 cases)",
      "locallyRunnable": true
    },
    "smoke": {
      "cmd": "ralph-lisa smoke-check",
      "oracle": "Schema-consuming binaries don't crash on existing on-disk artifacts (backward-compat smoke)",
      "locallyRunnable": true
    },
    "integration": {
      "cmd": "ralph-lisa contract-check --strict",
      "oracle": "Schema-version bump propagates: cli writers + cli readers + wecom-bot consumers all updated atomically",
      "locallyRunnable": true
    },
    "functional": {
      "cmd": "ralph-lisa <related-cmd> --json | jq <new-field-path>",
      "oracle": "End-to-end roundtrip: write schema artifact via cmd A, read via cmd B, new field present + correct",
      "locallyRunnable": true
    }
  }
}
```

#### `web-ui.json` — modifying web SPA (margay-engine UI, rll-team-platform web)

```json
{
  "stack": "web",
  "changeType": "ui",
  "requiredTiers": ["smoke", "e2e"],
  "optionalTiers": ["functional", "perf", "stability"],
  "perTierConfig": {
    "smoke": {
      "cmd": "npx playwright test cli/templates/test-web/smoke.spec.ts",
      "parser": "playwright",
      "oracle": "Page loads + key-elements render + no console errors",
      "locallyRunnable": true
    },
    "e2e": {
      "cmd": "npx playwright test cli/templates/test-web/api.spec.ts",
      "parser": "playwright",
      "oracle": "Critical user-flow exercised end-to-end against real backend",
      "locallyRunnable": true
    },
    "functional": {
      "cmd": "npx playwright test --grep '@functional'",
      "parser": "playwright",
      "oracle": "Tagged @functional suite covers UI-bound business logic (form validation / state transition / route guards)",
      "locallyRunnable": true
    },
    "perf": {
      "_note": "templates/test-web/load.js does NOT exist today (cli/templates/test-web/ has only api.spec.ts + smoke.spec.ts + playwright.config.ts); k6 perf templates live under cli/templates/test-server/. §91 must either create test-web/load.js or have web-ui preset reference test-server/load.js as a cross-stack pattern.",
      "cmd": "k6 run cli/templates/test-server/load.js --duration 30s",
      "parser": "k6",
      "threshold": { "p95": 500, "rps": 50 },
      "oracle": "Backend endpoint serving the UI sustains target rps + p95 < 500ms under 30s load (initially uses test-server template; §91 may add test-web/load.js)",
      "locallyRunnable": false,
      "requiredBinary": "k6"
    },
    "stability": {
      "_note": "Same template-existence note as perf above; cli/templates/test-web/stress.js does not exist today.",
      "cmd": "k6 run cli/templates/test-server/stress.js --duration 4h",
      "parser": "k6",
      "oracle": "4-hour stress shows no error-rate drift > 1% beyond baseline",
      "locallyRunnable": false,
      "requiredBinary": "k6"
    }
  }
}
```

#### `platform-server-cmd.json` — server endpoint add/modify (concretely targets `rll-team-platform/server/`)

```json
{
  "stack": "server",
  "changeType": "cmd",
  "_appliesTo": "Targets rll-team-platform/server/ specifically (uses npm workspaces — `npm test --prefix rll-team-platform` runs all workspace tests). The wecom-bot/lark-bot/dingtalk-bot sibling packages have a different test-runner shape (`node --test dist/test/*.test.js` per their package.json); §91 may add a separate `wecom-bot-cmd.json` preset rather than overload this one. cwd convention: super-rll/ (repo root).",
  "requiredTiers": ["unit", "functional", "integration"],
  "optionalTiers": ["e2e", "perf", "security"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test --prefix rll-team-platform",
      "oracle": "Workspace test runner exercises all server unit suites; new endpoint handler has ≥3 cases (happy / 4xx-validation / 5xx-internal-error)",
      "locallyRunnable": true
    },
    "functional": {
      "_note": "rll-team-platform/server uses node --test (not vitest). Tier-specific filtering uses test-path globs since existing layout already partitions by surface (routes/dispatch/web).",
      "cmd": "cd rll-team-platform/server && node --test --test-reporter=spec 'test/routes/**/*.test.ts' 'test/dispatch/**/*.test.ts' 'test/web/**/*.test.ts'",
      "oracle": "Endpoint functional contract: status 200 + response shape matches OpenAPI/IPC; ≥1 happy + ≥1 4xx case per new endpoint",
      "locallyRunnable": true
    },
    "integration": {
      "cmd": "ralph-lisa contract-check && cd rll-team-platform/server && node --test --test-reporter=spec 'test/data/**/*.test.ts' 'test/loop/**/*.test.ts' 'test/adapters/**/*.test.ts' 'test/migrations/**/*.test.ts'",
      "oracle": "Cross-module: schema/IPC accept-list synced (contract-check 0 blocking); integration coverage exercises DB writes + reads + adapter dispatch + migrations",
      "locallyRunnable": true
    },
    "e2e": {
      "cmd": "k6 run cli/templates/test-server/load.js --vus 1 --iterations 1",
      "parser": "k6",
      "oracle": "Single full request lifecycle from external client through server to DB and back",
      "locallyRunnable": false,
      "requiredBinary": "k6"
    },
    "perf": {
      "cmd": "k6 run cli/templates/test-server/load.js",
      "parser": "k6",
      "threshold": { "p95": 200, "rps": 100 },
      "oracle": "Endpoint sustains 100 rps with p95 < 200ms",
      "locallyRunnable": false,
      "requiredBinary": "k6"
    },
    "security": {
      "cmd": "npm audit --json && gitleaks detect --report-format json",
      "parser": "security",
      "threshold": { "critical": 0, "high": 0 },
      "oracle": "No critical/high CVEs in deps + no leaked credentials in repo",
      "locallyRunnable": false,
      "requiredBinary": "gitleaks"
    }
  }
}
```

### 4.4 Stack detection algorithm (priority order)

`cli/src/preset/stack-detect.ts` decides stack by file presence in cwd, in priority order:

1. `package.json` exists + has `"type": "module"` or `"main"` → check sub-fields:
   - has `"electron"` dep → `desktop`
   - has `"react-native"` or `"expo"` dep → `mobile`
   - has `"vue"` / `"react"` / `"svelte"` dep → `web`
   - has `"bin"` field → `cli`
   - has `"main": "server.js"` or fastify/express/koa dep → `server`
   - default → `web` (fallback)
2. `Cargo.toml` exists → `cli` if `[[bin]]` section, else `cli` (Rust default)
3. `pyproject.toml` / `setup.py` exists → `server` if fastapi/django/flask dep, else `cli`
4. `pubspec.yaml` exists → `mobile`
5. `manifest.json` with `manifest_version` → `plugin`
6. `*.csproj` → `desktop` if WPF/Avalonia dep, else `server`
7. `terraform/*.tf` or `*.yaml` with `apiVersion: v1` → `cloud-infra`
8. None of above → user must `--preset <X>` explicitly (no silent fallback)

Tie-breakers and ambiguity (e.g. monorepo with both web and cli) → user override wins.

### 4.5 Change-type detection algorithm

`cli/src/preset/change-type-detect.ts` consumes git diff paths + Ralph submission's `Files:` handoff section:

| Path pattern | change-type (= preset key per §91 R7 narrow; consumed directly by `loadPresetByName(presetKey, opts)` — no derivation) |
|---|---|
| `cli/src/cli.ts` (dispatch) + `cli/src/commands.ts:cmd*` (handler add) | `cli-cmd` |
| `**/schema.ts` / `**/types.ts` / `**/migration*.sql` | `cli-schema` |
| `**/web-static/*.js` / `**/web-static/*.css` / `**/build-server.ts` (route add) | `web-ui` |
| `rll-team-platform/server/src/*.ts` + new route handler | `platform-server-cmd` |
| `wecom-bot/src/*.ts` / `lark-bot/src/*.ts` / `dingtalk-bot/src/*.ts` + new endpoint | `wecom-bot-cmd` (deferred to §91-followup; see `platform-server-cmd` `_appliesTo` note) |
| `docs/**/*.md` only | (escape — process-only, see §49 §C simple-task escape) |
| `.rll/PLAN.md` / `CLAUDE.md` / `CODEX.md` only | (escape — process-only) |
| Pure file rename (no content delta) | (escape — process-only) |

Falls back to `cli-cmd` (most common) if no pattern matches; user override always wins.

### 4.6 Auto-invocation runner

```bash
ralph-lisa test --auto                    # detect stack+changeType, run all required tiers
ralph-lisa test --auto --preset web-ui    # explicit preset override
ralph-lisa test --auto --json             # structured per-tier metrics output
ralph-lisa test --auto --tier smoke,e2e   # filter to subset (must be ⊆ required ∪ optional)
```

Internally:
1. detectStack(cwd) → stack
2. detectChangeType(diff, files) → `{ changeType: presetKey, reason }` (per §91 R7 narrow lock: the returned `changeType` value IS the preset key — same identifier as `loadPresetByName` input. Examples: `cli-cmd`, `platform-server-cmd`. NOT a `stack-changeType` decomposition; do NOT reconstruct from preset body's stack/changeType fields)
3. const presetKey = detectChangeType(...).changeType; loadPresetByName(presetKey, opts) → preset (per §91 R4-R7 narrow lock — preset body has independent `stack` + `changeType` short-name fields, e.g. `platform-server-cmd.json` body = `{stack: "server", changeType: "cmd"}`; no hyphen-split decomposition)
4. **Preflight check** (Lisa R6 narrow lock): for each tier with `requiredBinary` set, run `command -v <bin>`:
   - required-tier missing binary → reject with install hint (e.g. "k6 missing; brew install k6 or set locallyRunnable=false")
   - optional-tier missing binary → skip silently with reason logged in JSON (`{tier, skipped: true, reason: "missing binary k6"}`)
5. For each tier in preset.requiredTiers (post-preflight):
   - run perTierConfig[tier].cmd via runGate's spawn pattern
   - parse output via adapter (if specified) → metrics
   - compare metrics vs threshold (if specified)
   - record per-tier result: `{tier, cmd, exit_code, parsed_metrics, threshold_pass}`
6. Aggregate: emit JSON `{schema_version: 1, stack, changeType, results: [...], all_required_pass: bool}`
7. **Exit-code rule (deterministic)**: 0 iff `all_required_pass === true`. Optional tiers are attempted **only when explicitly selected** via `--tier <name>`; their result is reported in JSON when run, but their **absence never blocks** (`optional_tier.attempted === false` is not an error). Non-zero exit on first required-tier fail. This rule is the contract — Lisa R5 narrow B3 lock.

### 4.7 submit-ralph hook (per-tier evidence enforcement)

Existing `submit-ralph` already runs `runGate()` (`commands.ts:1072`) before accepting submission. New behavior:

- **If preset.enabled in `.ralph-lisa.json`** (opt-in, default off until §93 mutual CONSENSUS):
  - Pre-submit: parse submission body's `## Test Results` section
  - Extract per-tier evidence using simple regex: `^- (unit|smoke|functional|integration|e2e|perf|stability|security): .+`
  - Compare against preset.requiredTiers
  - **If missing tier**: auto-invoke `ralph-lisa test --auto --tier <missing>` to fill, prepend results to submission body, then continue submit
  - **If auto-invoke fails**: reject submission with error citing tier omission + `ralph-lisa test --auto --tier <tier>` repro hint
- **If preset.enabled is false**: behavior unchanged (current submit-ralph flow is the only path)

### 4.8 Dual-track enforcement (per Lisa R1 Q3)

**Track 1 (CLI-side hard gate, source of truth)**:
- `cli/src/policy.ts` extension: when preset.enabled, `[CODE]/[FIX]` Test Results parser must match preset.requiredTiers
- Deterministic: same input → same accept/reject decision
- Failure mode: clear hint with cmd to fix (`ralph-lisa test --auto --tier <X>`)

**Track 2 (Lisa system prompt, additive review guidance)**:
- Lisa's prompt receives preset context for current sub-slice (loaded via `ralph-lisa preset show --json` injected into Lisa's review-time context)
- Lisa narrows on QUALITY: oracle strength, fake evidence detection, threshold sanity, tier coverage proportionality
- Failure mode: NEEDS_WORK with templated narrow citing tier + observed weakness + suggested oracle improvement

Track 1 catches **omissions** (tier-blind submission). Track 2 catches **deceptions** (tier present but evidence weak). Both needed; neither sufficient alone.

---

## 5. Lisa review constraints + §49 §C marker × multi-tier semantic

### 5.1 Per-round Lisa audit checkpoints (mandatory, written into doc to lock §91-§93 reuse)

| Round | Ralph submits | Lisa MUST audit (NEEDS_WORK if any fails) |
|---|---|---|
| R1 [PLAN] | task understanding + test cases C1-CN grouped by preset.requiredTiers + per-tier oracle + failure-loop design | (a) every requiredTier has ≥1 test case; (b) each oracle states what pass *proves* (not just "test passes"); (c) failure loop names which tier-fail triggers Ralph self-fix vs which triggers wecom-push K-budget halt |
| R2 [CODE] tests-only | per locally-runnable required tier: ≥1 expected-fail it-block / oracle artifact; per non-locally-runnable tier: explicit deferral record | (a) every locally-runnable tier has ≥1 test artifact; (b) deferred tiers have reason + R3 verification cmd; (c) `Convention: tests-only / expected-fail (§49 §C)` marker present (verbatim per §52) |
| R3 [CODE] | per-tier Test Results blocks (NOT merged) + lint/typecheck/build green | (a) every requiredTier has its own evidence block with cmd + result; (b) deferred tiers from R2 now have R3 cmd output; (c) no missing tier silently skipped |
| R4+ [FIX] | per-tier Test Results blocks (only changed tiers needed; unchanged tiers may reference R3 evidence) | same as R3 for changed tiers |
| RN [CONSENSUS] | mutual handshake | (a) all requiredTiers green at final round; (b) oracle quality confirmed; (c) loopback budget not exhausted |

### 5.2 §49 §C marker × preset multi-tier semantic (per Lisa R1 Q4, locked here)

The `Convention: tests-only / expected-fail (§49 §C)` marker (`cli/src/commands.ts:1058 hasTestsOnlyMarker`) currently triggers `runGate` warn-mode (allows test-failure submit only).

**Locked semantic for preset multi-tier R2**:

- **For every preset.requiredTier marked `locallyRunnable: true`**: R2 [CODE] tests-only round MUST contain at least one expected-fail test/oracle artifact. Examples: a unit test asserting future behavior; a smoke test scaffold; an integration test with a TODO assertion. The marker covers all locally-runnable tiers, not just unit.
- **For every preset.requiredTier marked `locallyRunnable: false`**: R2 [CODE] tests-only MUST contain explicit deferral record:
  ```markdown
  ### Tier deferral
  - tier=perf: locally-runnable=false; reason=requires k6 binary + sustained 30s execution; R3 verification cmd: `k6 run cli/templates/test-server/load.js --duration 30s`; R3 oracle: p95 < 500ms
  ```
- **Why not "all tiers blindly expected-fail"**: forces R2 to scaffold tests it can't even compile (e.g. perf tier needs k6 binary; not every dev machine has k6) — burns rounds on artifacts that don't validate anything.
- **Why not "only unit tier in R2"**: weakens TDD discipline; misses smoke/integration test design when contract is being established.

**Marker scope**: exactly as today — verbatim string `Convention: tests-only / expected-fail (§49 §C)` in submission body, parsed at `commands.ts:1060`. No marker change.

### 5.3 Test design quality bar (Lisa R2 narrows on this)

- **Oracle**: each tier config has `oracle: string` field; oracle states **what pass proves**, not "test passes". Examples:
  - GOOD: `"Endpoint serves the contract: status 200 + response shape matches OpenAPI"`
  - BAD: `"k6 returns 0 errors"` (tautology)
- **Threshold**: numeric tiers (perf, stability) must include `threshold` keyed to metric. Missing threshold = Lisa R2 narrow.
- **Negative coverage**: every tier with happy-path case must have ≥1 negative case (per §81 `happy-only` rule).

---

## 6. Bottom-line: 13 unchanged invariants

Each invariant: **existing behavior** | **new §90/§91/§92/§93 behavior** | **compatibility guarantee** | **verification method**.

| # | Invariant | Existing | New | Compat guarantee | Verification |
|---|---|---|---|---|---|
| 1 | `runGate()` interface | `cli/src/commands.ts:1072` signature `runGate(tag: string, submissionContent?: string, opts?: RunGateOptions): GateResult`; warn-mode triggered by `hasTestsOnlyMarker` (`:1058`) on `[CODE]` round | preset-aware path is ADDITIVE via new `cmdTestAuto`; `runGate` itself unchanged | Function signature, return type, side-effect path identical | `npm test --prefix cli` regression suite covers `runGate` directly |
| 2 | `cmdQualityGate` CLI surface | `:1286` exposes `ralph-lisa quality-gate` with `--strategy/--full-uaot/--warn/--block` | unchanged; `cmdTestAuto` is a new sibling sub-cmd | All existing flags + behavior preserved | Existing CLI tests for quality-gate pass unchanged |
| 3 | `cmdTest` / `cmdSmokeTest` | `:6001 cmdTest` / `:5275 cmdSmokeTest` are existing entry points | unchanged | Both callable independently of preset infra | Existing tests pass; smoke-check + test sub-cmds still wired in `cli.ts` |
| 4 | Cascade strategy enum (§78) | `cmdTestCascade` at `:7428` accepts `full \| smoke-only \| halt-on-fail` | unchanged; `cmdTestAuto` may *invoke* cascade with strategy=halt-on-fail internally but not redefine | Strategy enum frozen | `test-cascade.test.ts` cases unchanged; new code only consumes existing API |
| 5 | Loopback `task_failed` kind (§79) | `cli/src/loopback.ts:121 processCascadeFailures` emits `task_failed` events | unchanged event schema; preset-failure path reuses same kind | `task_failed` consumers in wecom-bot/lark-bot/dingtalk-bot unchanged | `loopback.test.ts` cases unchanged + cross-module contract-check |
| 6 | Contract-check drift classes (§80) | `cmdContractCheck` at `:7300` enforces 4 drift classes (event types / union⊕accept-list / field 3-source / render explicit+baseline) | unchanged; preset infra adds NEW data files but no new drift classes | All 4 drift classes preserved verbatim | Existing contract-check.test.ts cases pass |
| 7 | Test-spec-eval rules (§81) | `cmdTestSpecEval` at `commands.ts:7237` invokes 5 rules in `cli/src/test-spec-eval.ts:161 / :170 / :179 / :188 / :197`: `no-test-plan` / `thin-coverage` / `happy-only` / `single-surface` / `missing-integration` | unchanged; preset PLANs go through same lint with same rules | Rule set frozen; preset is new INPUT not new rule | §81 self-dogfood on this very doc passes blocking_gap_count=0 |
| 8 | `.ralph-lisa.json` schema | Existing `testRunners` / `testHarness` / `testTiers` keys read by `cli/src/config.ts` | preset adds NEW key `preset` (object); existing keys unchanged + still consulted when `preset.enabled === false` | Old configs work without changes; old behavior is default | New unit tests for config.ts cover both `preset.enabled=true` and absent-key paths |
| 9 | submit-ralph existing policy gates | `cli/src/policy.ts` Test Results gate + tag-after-NEEDS_WORK rejection + Lisa system prompt | preset gate is ADDITIONAL pre-check before existing gates; warning text appended on omission, doesn't replace | All current policy warnings/blocks fire identically when preset disabled | policy.test.ts coverage of existing gates pass unchanged |
| 10 | Lisa system prompt | Current Lisa prompt covers turn-based review, NEEDS_WORK / PASS / CONSENSUS protocol, tag rules | preset awareness is ADDITIVE (preset context injected as new section); old review behaviors retained | Lisa retains all existing review capabilities; new capability gated on preset context presence | Manual A/B prompt comparison + dogfood §93 Lisa review on RLL self-edit |
| 11 | Watcher / heartbeat / pipe-pane / per-pane backoff (§11.S/§11.T) | watcher.sh path resolution `cli/src/commands.ts:3901`; watcher template generation `:7578+`; watchdog.sh path resolution `:3965`; watchdog signal verification `isOurProcess` at `:2408`/`signalOurProcess` at `:2441` (scriptName parameterized "watcher.sh" / "watchdog.sh") | unchanged | Watcher loop, ACKED_TURN drift detection, codex-aware send_go_to_pane all preserved | `cmdDoctor` Watcher Health section + watchdog tests unchanged |
| 12 | WeCom-feedback / inbox-poll / lark-bot / dingtalk-bot (§51 / §63 / §64 / §76) | `cli/src/wecom-feedback.ts` (per-side cursor + getLatestTarget §68); `cli/src/wecom-hook.ts` (pushAgentStuck / pushWecomEvent / pushTaskStateChange — imported at `commands.ts:62`); `cli/src/lark-hook.ts:2` + `cli/src/dingtalk-hook.ts:2` (parallel hooks, wecom-hook unchanged); `wecom-bot/src/daemon.ts` (event ingress + appendInboxEntry at `:411`) | unchanged event types; preset failures route through existing `task_failed` channel only | event accept-list unchanged; daemon dispatch table unchanged | wecom-bot test suite (256/256) + lark-bot (7/7) + dingtalk-bot tests pass |
| 13 | No auto-publish/push semantics | Current preset-less infra never auto-pushes to git/npm | preset auto-invocation runs ONLY local cmds; never spawns `git push` / `npm publish` / external network calls except when user-explicit | Hard rule in cmdTestAuto: refuse if cmd contains `git push` / `npm publish` / `gh release` (pattern allow-list) | New unit test in `runner.test.ts`: blacklist regex catches forbidden cmds |

Items 11-13 added per Lisa R1 Q5; items 1-10 carried from R1 with concrete file:line evidence.

---

## 7. §91-§93 implementation queue

### §91 — `preset-schema-and-detect-and-starter-presets` (8-10 rounds estimated)

**Scope**: build preset infrastructure + 4 starter preset data files + dogfood on RLL self.

**Deliverables**:
- `cli/src/preset/schema.ts` (Preset / Tier / TierConfig types + Zod-style validators)
- `cli/src/preset/stack-detect.ts` (pure fn; ≥10 unit tests covering hybrid repos)
- `cli/src/preset/change-type-detect.ts` (pure fn; ≥8 unit tests)
- `cli/src/preset/preset-loader.ts` (file-system load + schema validation)
- `cli/templates/presets/cli-cmd.json` / `cli-schema.json` / `web-ui.json` / `platform-server-cmd.json`
- `ralph-lisa test --auto --dry-run` (cmdTestAuto stub: detect + load only, no execution yet)
- Dogfood: run `--dry-run` on RLL itself (`cli` repo, change-type=cmd) → expect preset=cli-cmd, requiredTiers=[unit,smoke,integration]

**Lisa audit checkpoints**:
- R1 PLAN: stack-detect priority order completeness; preset schema fields cover matrix 8 types; 4 starter presets adequate scope
- R2 tests-only: ≥10 stack-detect cases (RLL / margay / wecom-bot / rll-team-platform / mixed monorepo / Cargo / pyproject / pubspec / electron / fallback); ≥8 change-type cases
- R3 [CODE]: 4 preset JSON valid against schema; dogfood detect passes on 4 known-good projects
- R4+ [FIX]: per Lisa narrow

**Round budget**: 8-10r per §63/§64 sibling-package-pattern slice average (single-pkg new + cli wiring + dogfood).

### §92 — `preset-auto-invoke-and-policy-gate` (10-12 rounds estimated)

**Scope**: full cmdTestAuto execution + submit-ralph hook + policy.ts preset-aware gate.

**Deliverables**:
- `cli/src/preset/runner.ts` (cmdTestAuto: full execution path, JSON output, exit-code semantics)
- `cli/src/policy.ts` extension: `parseTierEvidence(submissionBody)` + `validateTierCoverage(parsed, preset)`
- `cli/src/commands.ts cmdSubmitRalph` extension: pre-submit auto-invoke if Test Results missing tier
- New `.ralph-lisa.json` keys: `preset.enabled`, `preset.requireAll`, `preset.dryRunOnly`
- Dogfood: change `cli/src/commands.ts` (add new sub-cmd), submit `[CODE]` body with only unit evidence → preset gate auto-invokes smoke + integration → enriched submission accepted

**Lisa audit checkpoints**:
- R1 PLAN: parseTierEvidence regex robustness (must handle 4 fake/partial/valid/omission cases); auto-invoke doesn't deadlock if cmd hangs
- R2 tests-only: ≥4 policy gate cases (omission / partial-evidence / fake-evidence-no-cmd / valid)
- R3 [CODE]: dogfood end-to-end on RLL itself; preset.enabled=true mode works; preset.enabled=false mode behaves exactly like current submit-ralph
- R4+ [FIX]: per Lisa narrow

**Round budget**: 10-12r per cross-component slice with policy + cli + cmdSubmit modifications (compare §80 contract-check 9r, §79 loopback 10r).

### §93 — `lisa-side-preset-audit-and-closed-loop-dogfood` (8-10 rounds estimated)

**Scope**: Lisa system prompt update + closed-loop dogfood on RLL self-modification.

**Deliverables**:
- Lisa system prompt section (additive): "When preset context is provided, audit per-tier oracle quality + fake-evidence detection + threshold sanity"
- `ralph-lisa preset show --json` (cli surface for Lisa to fetch preset context at review time)
- `cli/src/preset/lisa-narrow-templates.ts` (NEEDS_WORK templates for omission / weak-oracle / fake-evidence / threshold-missing)
- Dogfood: live closed-loop on RLL self-edit — change cli code, ship deliberately weak [CODE] (tier present but oracle = "test passes"), Lisa NEEDS_WORK templated narrow fires
- `docs/trust-coding-user-guide.md` (NEW user-facing doc: how to enable preset gates, how to write custom presets)

**Lisa audit checkpoints**:
- R1 PLAN: 4 NEEDS_WORK templates each have triggering condition + cite location + suggested fix
- R2 tests-only: ≥4 lisa-narrow-templates cases (omission / weak-oracle / fake-evidence / threshold-missing)
- R3 [CODE]: live dogfood on RLL self-edit fires correct narrow; Lisa system prompt update committed
- R4+ [FIX]: per Lisa narrow

**Round budget**: 8-10r — comparable to §66 wecom-state-matrix-research deliverable scale (research + impl-spec + dogfood).

---

## 8. Risk register

| # | Risk | Severity | Concrete mitigation |
|---|---|---|---|
| R1 | Preset data growth runaway (8 stack × 5 change-type = 40 cells × ongoing churn) | 🔴 high | Hard cap §91 starter at **4 presets**; new presets only added when 3+ real sub-slices request the gap (not speculatively). §91 PLAN must include explicit "no more than 4 in this slice" lock. |
| R2 | Stack-detect false-positive (e.g. monorepo with web + cli at root, picks wrong stack) | 🟡 medium | Two-layer mitigation: (a) priority order in §4.4 deterministic + tested with 10+ hybrid cases; (b) `--preset <name>` user override always wins; (c) `ralph-lisa preset detect --explain` shows reasoning so user can audit. Failure mode is loud (wrong preset → wrong tiers run → Lisa narrow flags), not silent. |
| R3 | Per-tier gate too strict, blocks current workflow | 🟡 medium | OPT-IN: `.ralph-lisa.json preset.enabled` defaults to `false` until §93 mutual CONSENSUS; even after §93, default stays `false` for existing repos (only new `ralph-lisa init` sets `enabled: true`). Existing RLL users have zero behavior change. |
| R4 | Lisa system prompt doesn't comply or over-complies (false NEEDS_WORK on valid evidence) | 🟡 medium | §93 R2 tests-only includes ≥4 prompt-behavior cases (manual A/B comparison: same submission with vs without preset context, expected NEEDS_WORK delta documented); if prompt route fails, fall back to cli-side hard gate as sole enforcement (Track 1 still works without Track 2). |
| R5 | `Convention: tests-only / expected-fail (§49 §C)` marker × preset multi-tier conflict | 🟡 medium | Resolved in §5.2 above: marker covers locally-runnable tiers (≥1 expected-fail per tier); non-local tiers use explicit deferral record with R3 verification cmd. No §90.5 needed (per Lisa R1 Q6). §92 R2 tests-only ships ≥3 cases covering: (a) all-local-tier marker, (b) mixed local + deferred, (c) all-deferred (rare; e.g. cloud-infra changes from non-cloud machine). |

---

## Test Plan

Self-verification cases for this research deliverable (mirrors §90 PLAN.md TC-1..TC-10):

| ID | Surface | Cases | Failure signal | Count |
|---|---|---|---|---|
| TC-1 | Doc completeness | 8 sections present (Discussion archaeology / Gap statement / Capability matrix recap / Architecture proposal / Lisa review constraints / 13 invariants / §91-§93 queue / Risk register), each with ≥1 concrete example or table | Section heading missing or section content empty/abstract-only | 1 |
| TC-2 | Discussion archaeology fidelity | 4 design pivots verbatim from this conversation in correct order: Pivot 1 (wrap CLI+Skill) → Pivot 2 (1 skill + N preset) → Pivot 3 (Lisa 不审 vs Ralph 不调) → Pivot 4 (trust-coding 多重门禁) | Pivot missing / order wrong / paraphrased away from user's words | 1 |
| TC-3 | Implementation queue actionability | §91 / §92 / §93 each declare: scope + deliverables (5+ items) + Lisa audit checkpoints (4 rounds R1/R2/R3/R4+) + round budget (with comparison reference to existing slice) | Slice has only goal but no deliverables, or no Lisa audit per round, or no round-budget rationale | 3 |
| TC-4 | Bottom-line invariants | 13 invariants each cite: existing slice/module name + file:line + 4-column proof (existing behavior / new behavior / compat guarantee / verification method) | Invariant missing column / file:line absent / verification method = "we will be careful" platitude | 13 |
| TC-5 | Risk register honesty | 5 risks each have concrete mitigation: not "we will monitor" but specific mechanism + cite — opt-in flag / hard cap / fallback path / additional test cases | Risk has no concrete mitigation, only acknowledgement | 5 |
| TC-6 | Code-anchor citations | Every reference to existing module (`runGate` / `cmdQualityGate` / `cmdTest` / `cmdSmokeTest` / `cmdTestCascade` / `processCascadeFailures` / `cmdContractCheck` / `cmdTestSpecEval` / `hasTestsOnlyMarker`) cites file:line | Module named without file:line (allows post-rename rot to hide; spot-check 5 anchors live) | spot-check 5 |
| TC-7 | Preset JSON realization | 4 preset examples (cli-cmd / cli-schema / web-ui / platform-server-cmd) each include: requiredTiers + optionalTiers + perTierConfig with cmd / oracle / locallyRunnable for every required tier; **(a)** all paths `test -e` verified live; **(b)** all required-tier cmds runnable with default RLL dev env binaries (npm/npx/node/git only — no standalone install); **(c)** standalone-binary tiers (k6 / gitleaks / etc) MUST set `locallyRunnable: false` + `requiredBinary: "<bin>"` annotation | Preset uses `<placeholder>` / missing oracle / locallyRunnable absent / cmd path doesn't exist / required-tier depends on standalone binary without `requiredBinary` annotation | 4 |
| TC-8 | §49 §C marker × multi-tier semantic | §5.2 explicitly defines: locally-runnable tiers behavior + non-local-tier deferral record format + rejection of "all blindly expected-fail" + rejection of "only unit tier" + marker scope unchanged | Semantic ambiguous / two interpretations not resolved / marker scope changed | 1 |
| TC-9 | Dual-track enforcement | §4.8 defines: Track 1 (CLI hard gate, deterministic, source of truth, catches omissions) + Track 2 (Lisa prompt, additive review, catches deceptions) + why both are needed (omission vs deception failure-mode split) | Only one track described / both tracks redundant / no failure-mode separation | 1 |
| TC-10 | §81 self-lint dogfood | `ralph-lisa test-spec-eval --plan-file docs/trust-coding-closed-loop-design.md --json` returns `blocking_gap_count: 0` (warnings acceptable for research-only) | Any §81 high-severity rule fires (live rules per `cli/src/test-spec-eval.ts:161/:170/:179/:188/:197`: `no-test-plan` / `thin-coverage` / `happy-only` / `single-surface` / `missing-integration`) | 1 |

**Quality gate**: research-only doc; verification via §81 self-lint command above + Lisa narrow against TC-1..TC-10.

---

## §81 self-lint dogfood result

```
$ ralph-lisa test-spec-eval --plan-file docs/trust-coding-closed-loop-design.md --json
```

Result reported in R4 submission body. Expected: `blocking_gap_count: 0` (medium warnings acceptable).

---

## Handoff

§90 closes when this doc reaches mutual CONSENSUS. Implementation queue passes to §91/§92/§93 in sequential order. No code/test changes in §90.

User authorization required before opening §91 (per CLAUDE.md §49 #2 — A/B/C decision gate).
