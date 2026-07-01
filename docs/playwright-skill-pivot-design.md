# playwright-test Skill — Layer 3 Web-side Pivot Design (§173+)

**Status**: design — pre-§173 R1 PLAN
**Date**: 2026-05-17
**Author**: Ralph (under user 2026-05-17 23:30+ directive)
**Parallel to**: `docs/cli-e2e-skill-pivot-design.md` (wezterm-side §170-§172) — same 4-layer architecture, web-side mirror
**Predecessor audit**: 5 existing playwright.config.ts files reviewed (see §"Current state assessment" below)

## Target

Ship a **`playwright-test` skill** (Layer 3) that lets coding agents declare web-test intent and the skill materializes browser-driven Playwright execution. Mirrors `wezterm-test` skill but for browser/web instead of terminal/cli.

After ship, the typical flow becomes:

```
Ralph (coding agent):  "测一下登录流程, 看 3 个 dashboard 模板的差别"
   ↓
playwright-test skill: [analyzes intent] → generates Playwright TS test script
                       (uses templates: navigate / fill-form / wait-network / screenshot / a11y-check / report)
   ↓
playwright-runner:     spawns browser via Playwright API (no separate IPC layer needed;
                       Playwright already in-process)
                       → page.screenshot()
                       → page.evaluate()
                       → trace recording + JSON report
   ↓
Returns to Ralph:      evidence bundle (PNG screenshots + DOM snapshots + network logs + traces.zip + report.md)
```

## Why this pivot

### Direct trigger

Existing playwright tests (5 configs across repo — audit 2026-05-17) have known gaps:

- `cli/test-e2e/web/`: `retries: 0` + `trace: 'off'` — CI failures undebuggable
- `cli/tests/web/`: hardcoded `results.json` (parallel-run collision) + no `webServer` config
- `cli/templates/test-web/` + `rll-core/templates/test-web/`: identical bugs propagated to generated repos
- `TigerHill/playwright.config.ts`: bare-minimum config — no timeout/retries/reporters/screenshots/traces/device-config; testMatch references non-existent `experiments/` path

Adding more tests in current shape repeats the gap class. Each fix has to be applied per-config → drift inevitable.

### Paradigm fit

Same reasoning as cli-e2e-skill-pivot:
- Coding agents are the actual consumers
- Skill encapsulates platform expertise (Playwright locator strategy / network mocking / trace inspection)
- Test intent declarative; skill generates concrete spec per task
- New web framework? New skill, not redesigning fixed API

### Cross-platform doesn't apply (already solved)

Playwright is already cross-platform via Chromium/Firefox/WebKit bundled binaries. No "wezterm-style OS branching" issue. The pivot is purely about **abstraction level** for agents.

## 4-Layer architecture (mirror of cli-e2e)

```
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Ralph (coding agent)                           │
│   - Declares test intent                                │
│   - Calls playwright-test skill                         │
│   - Reviews returned evidence + ship decision           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: playwright-test skill                          │
│   - Markdown prompt + Playwright TS templates           │
│   - Generates concrete spec from intent                 │
│   - Invokes Layer 2 runner; collects evidence           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: playwright-runner (TS pkg, NEW)                │
│   - Standardized config builder (no per-repo config dup)│
│   - Trace + screenshot + JSON reporter wired by default │
│   - webServer / baseURL / browser projects normalized   │
└─────────────────────────────────────────────────────────┘
                          ↓ in-process Playwright API
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Playwright npm pkg (existing)                  │
│   - Browser binaries + page/context APIs                │
│   - Out-of-scope to redesign                            │
└─────────────────────────────────────────────────────────┘
```

**Key difference from wezterm-side**: no IPC bridge needed. Playwright already exposes its API in-process via `import { test, expect } from '@playwright/test'`. Layer 2 is just config-normalization + reporter standardization.

## Current state assessment (5 existing configs — 2026-05-17 audit)

| Config | Tests | Gap severity | Notes |
|---|---|---|---|
| `cli/test-e2e/web/playwright.config.ts` | 1 spec / 1 test | **P0** | `retries: 0` + `trace: 'off'`; manual server spawn; CI failures un-debuggable |
| `cli/tests/web/playwright.config.ts` | 2 specs / 5 tests | **P1** | Hardcoded `results.json` path; no `webServer` config; vague selectors |
| `cli/templates/test-web/playwright.config.ts` | template | **P2** | Same bugs as #2 propagated to generated repos |
| `rll-core/templates/test-web/playwright.config.ts` | template | **P2** | Identical to #3 |
| `TigerHill/TigerHill-repo/playwright.config.ts` | 4+ specs (unknown count) | **P1** | Bare-minimum config (no defaults); phantom `experiments/` path in testMatch |

CI integration: `.github/workflows/ci.yml` runs `npm test --prefix cli` only; whether Playwright fires there depends on `cli/package.json test` script content — needs verification.

## Layer 2 `playwright-runner` (NEW pkg) capability set

```ts
// playwright-runner/src/index.ts
export interface RunnerOpts {
  baseURL: string;
  webServer?: { command: string; port: number; reuseExistingServer?: boolean };
  browsers?: Array<'chromium' | 'firefox' | 'webkit'>;
  retries?: number;
  timeout?: number;
  outputDir?: string;
}

export function buildConfig(opts: RunnerOpts): PlaywrightTestConfig {
  // Standardized: trace='on-first-retry', screenshot='only-on-failure',
  //               video='retain-on-failure', reporter=['list', 'json-output', 'html'],
  //               CI defaults: retries=2, forbidOnly=true, workers=1
}

export async function runWithEvidence(testSpec: string, opts: RunnerOpts):
  Promise<EvidenceBundle> {
  // Spawn Playwright runner in-process; capture traces + screenshots + reports
  // Return { reportPath, traceZipPaths, screenshotPaths, dom_snapshots, network_log }
}
```

## Skill (Layer 3) input/output contract

**Input** — `playwright-test` skill receives natural-language intent + optional structured context:
```yaml
intent: "测一下登录流程的 3 个变体: empty-fields / wrong-password / success-path"
target_url: "http://localhost:3000"
fixtures:
  - "users/test-user-valid.json"
matrix:
  - browser: chromium
    viewport: 1280x800
  - browser: webkit
    viewport: 375x667  # mobile
```

**Output**:
- Generated Playwright spec under `playwright-skill-cache/<intent-hash>.spec.ts`
- Runner invocation
- Evidence bundle returned to Ralph (markdown report + traces + screenshots)

## Asset disposition (existing 5 configs)

| Asset | Disposition |
|---|---|
| `cli/test-e2e/web/playwright.config.ts` + smoke.spec.ts | **Retain** (P0 bugs fixed as part of §173 R1 cleanup); migrate to use playwright-runner buildConfig |
| `cli/tests/web/playwright.config.ts` + 2 specs | **Retain** (P1 bugs fixed); migrate to playwright-runner |
| `cli/templates/test-web/` + `rll-core/templates/test-web/` | **Update template** — once playwright-runner stable, templates import buildConfig + require minimal user opts |
| `TigerHill/TigerHill-repo/playwright.config.ts` | **Retain** — owner-managed external repo; fix bare config + phantom path as part of §173 R2; skill uses TigerHill as one of its dogfood targets |

## Execution plan (§173-§175 slice sequence)

### §173 playwright-runner-foundation (~10-13r)

R1 PLAN — Layer 2 buildConfig + runWithEvidence contract
R2 tests-only / expected-fail — pin config-defaults + reporter shape + trace-attached-on-retry
R3-R5 CODE — buildConfig impl + tests; runWithEvidence impl; migrate one of cli/test-e2e/web/ as dogfood
R6+ FIX per Lisa
RN [CONSENSUS]

Hot patches as part of §173 (audit fixes):
- `cli/test-e2e/web/playwright.config.ts` → trace='on-first-retry', retries: 1 in CI
- `cli/tests/web/playwright.config.ts` → outputDir for artifact isolation, webServer config
- Template configs → adopt playwright-runner.buildConfig
- `TigerHill/TigerHill-repo/playwright.config.ts` → add runtime defaults + remove phantom experiments/ path

### §174 playwright-test-skill-mvp (~5-10r)

R1 PLAN — skill `.claude/skills/playwright-test/SKILL.md` design + 3 templates (smoke/auth-flow/3-cli-frontend-comparison)
R2-R4 CODE — skill impl + dogfood (use existing cli/tests/web/ specs as input intent, verify skill regenerates equivalents)

### §175 dogfood-web-3way-comparison (~5-8r)

Use playwright-test skill to drive a 3-way frontend comparison — same intent ("做一个 todo-list 应用"), 3 different code-gen approaches (claude / codex / ccl), playwright runs each, returns diff report. Mirrors §160 D2 paginator pattern but web-side.

## Risk register

| Risk | Mitigation |
|---|---|
| Skill-generated specs flaky (locator strategy hardcoded) | Skill templates use `data-testid` + role-based locators only; explicit "avoid CSS class selectors" in skill prompt |
| Trace.zip sizes blow up artifact storage | Default `trace: 'on-first-retry'`; max-size cap in `playwright-runner` |
| CI access for runner (browser binaries 200MB+) | Cache via @playwright/test action; document in template |
| Skill regen non-determinism (same intent → different spec) | Cache generated spec under `.dual-agent/playwright-skill-cache/<intent-hash>.spec.ts`; human override path |

## Cross-references

- `docs/cli-e2e-skill-pivot-design.md` — mirror design (wezterm side)
- `cli-e2e/README.md` §170+ roadmap — references this doc as parallel skill
- §170-§172 cli-e2e foundation (in-progress 2026-05-17) — same architectural pattern
- 5 audited playwright configs above
