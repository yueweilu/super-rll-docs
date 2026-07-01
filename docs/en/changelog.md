[English](../en/changelog.md) | [日本語](../ja/changelog.md) | [中文](../zh-CN/changelog.md)

# Changelog

## v0.9.13 (2026-05-25) — non-code-task fast-path + session-anchor canonical root (§206 + §207)

Closes CCL D4 retrospective (14-round / 1-hour / 0-work-product stall on a pure review task) by routing analysis / doc / process tasks around the full TDD-6-artifact ceremony — without weakening enforcement on real code-bearing slices.

**§207 non-code-task-fast-path** (this release) — `--type` flag + 4-class taxonomy + mode-locked policy:
- NEW `cli/src/task-type.ts` (~250 LOC): `inferTaskType` / `validateTaskTypePaths` / `resolveTaskType` / `assertDeclarationMatchesSoR` / `validateNonCodeEvidence` / `computeStepDiff` (4-bucket git union minus step-start snapshot).
- 4-class taxonomy: `code-task` (default; full TDD unchanged) / `review-task` (writes `docs/**` + `.dual-agent/**`) / `doc-task` (+ top-level `*.md`) / `process-task` (+ `.rll/**` + `CLAUDE.md`/`CODEX.md`).
- NEW `ralph-lisa next-step "slug" --type <X>` — persists `.dual-agent/task-type-<step>.json` canonical SoR + always writes step-start commit SHA + dirty snapshot for diff-baseline classification.
- 3 NEW mode-locked policy rules in `cli/src/policy.ts`: `task-type-file-mismatch` (per-class file write whitelist) + `task-type-declaration-mismatch` (body-vs-SoR drift) + `non-code-task-evidence-missing` (per-type minimal evidence). Trust-boundary lock mirroring §202/§205 — NOT bypassable via `RL_POLICY_MODE=warn` and no `RL_TASK_TYPE_OFF` env exists.
- `cmdSubmitRalph` fast-path: skips auto-tdd-plan persistence (§102) for non-code task_types; evidence matrix replaces C-row table.
- NEW `docs/non-coding-task-quickstart.md` (~140 lines): 5 acceptance keywords + 3 body skeletons + mid-slice flip protocol + explicit no-opt-out.
- 13 tests C1-C13 (incl. C13 paired `.rll/PLAN.md` regression: review-task blocks / process-task passes).
- 5 rounds total (R1 PLAN → R2 tests-only → R3 impl → R4 FIX → R5 CONSENSUS); 2 substantive Lisa narrows on R3→R4 (B1 `.rll/**` whitelist bypass closed + B2 PLAN-meta source dropped).
- SoR read order finalized: `task-type-<step>.json` > body `Task type:` line > inferred (3 sources; original 4th "PLAN slice header" was never implemented and was dropped per Lisa R19 B2 to keep contract ≤ implementation).

**§206 session-anchor-canonical-root** (commit `146d5bc`) — no-upward-walk session resolution:
- `state.ts:resolveStateDir()` strictly prefers `RL_STATE_DIR` + tmux env + CWD `.dual-agent` (no upward walk to parent directories — closes false-rebind class where `cli/` cwd accidentally bound to repo-root state).
- `.dual-agent/.session-anchor` JSON `{session_id, init_at, init_user_email_hash, task_signature}` fingerprint written by `cmdInit`; subsequent `cmdStart`/`cmdAuto` verify and refuse to rebind silently.
- Closes the 3rd ack-shape-change class user reported on `rll-dev` 2026-05-23.

**Per §143 versioning rule 1** (additive contract / new cli sub-cmd / new default-with-opt-out = minor → patch eligible when no public API removal): patch bump 0.9.12 → 0.9.13. New `--type` flag is opt-in (omitting it preserves legacy `code-task` behavior). 3 new mode-locked rules are mechanically additive (they fire only when a `--type` slice declares non-code, which legacy projects never do).

**Test counts**: cli 2375/2375 pass, wecom-bot 250/250 pass, cli-e2e 68/68 pass. quality-gate full sequence (5/5) PASS. plan validate both repos (super-rll + rll-team-platform) green.

## v0.9.12 (2026-05-24) — user-behavior analytics + daily-summary + REPL (§203 + §204)

Two-slice batch closing the user goal pinned 2026-05-24: "完成 RLL 数据的采集和分析功能 ... 实现对每个用户 RLL 工作情况的分析 ... 为企业管控员工使用 RLL/coding agent 提供支持".

**§203 user-behavior-analytics-local** (commit `c43514b`) — local-first behavior analytics:
- `EventRecord.event_type` union extended 3→7 — added `model-invocation` / `narrow-event` / `consensus-event` / `command-event` (event-shipper.ts:20-46).
- 4 new append-helpers in event-shipper.ts (§197 SECRET_PATTERNS scrub on `appendCommandEvent` `cmd_name`; never persists args/env/cwd).
- NEW `cli/src/user-behavior-analyze.ts` (~280 LOC): 4 pure analyzer functions (`analyzeUserActivity` / `analyzeAgentBreakdown` — pivots both model-invocation AND token-usage to bridge §55-§61; `analyzeRalphLisaInteractions`; `analyzeDevTaskSummary`) + `cmdUserBehaviorAnalyze` CLI (md + JSON output; `--user --since --until --format --scope --out`).
- 3 production hooks (default-on with audit-named opt-outs):
  - `cli/src/cli.ts:264-290` — `command-event` on `process.on('exit')`; `RL_COMMAND_EVENT_OFF=1` opt-out.
  - `cli/src/commands.ts:cmdSubmitLisa` — `narrow-event` per `[NEEDS_WORK]`; `RL_NARROW_EVENT_OFF=1` opt-out.
  - `cli/src/commands.ts:handleMutualCompletion` — `consensus-event` with `total_rounds`/`narrows_count`/`slice_duration_ms` parsed from full history.md; `RL_CONSENSUS_EVENT_OFF=1` opt-out.
- `cli/package.json:12` `test` script sets `RL_COMMAND_EVENT_OFF=1` globally so the test suite never pollutes live `super-rll/.dual-agent` snapshot tests (F12/F13/T1-T3).
- 13 §203 tests C1-C13 + 80-line §203 section in `docs/测试作者指南.md`.

**§204 daily-summary-and-analyzer-fixes** (commit `fca7fce`) — 3 dogfood bug fixes + 2 new entry-points per user direction (REPL + daily-summary + WeCom push + backfill historical):
- **B1 timeline-render** — `cli/src/state.ts:timestamp()` flipped to UTC ISO with Z suffix; `cli/src/event-shipper.ts:134-160` loader tolerates BOTH new Z-rows AND legacy local-time rows (graceful migration; no break for existing history.md).
- **B2 narrow-rule whitelist** — NEW `parseNarrowRulesFromBody(body)` exported from `cli/src/commands.ts:170-220` with 32-entry §149 whitelist + suffix regex `\b[a-z]+-[a-z-]+-(missing|insufficient|unverified|not-acked|invalid|verified|stale|exhausted|mismatch|failed)\b`. Suppresses bare kebab-noise tokens (`ralph-lisa`, `user-behavior`, `command-event`) that were polluting §203 narrow_rule emissions.
- **B3 history.md backfill** — NEW `cli/src/user-behavior-backfill.ts` + `ralph-lisa user-behavior-backfill [--dry-run]` CLI; mutual-CONSENSUS only (both Ralph + Lisa rows required); slug-based idempotency. Backfills consensus-event rows for slices that closed BEFORE §203 hook shipped.
- **F4 daily-summary CLI** — NEW `cli/src/daily-summary.ts` + `ralph-lisa daily-summary [--date YYYY-MM-DD] [--user <email>] [--format md|json] [--scope user|team|admin] [--push] [--out <path>]`. 5-section markdown report (Tasks Worked / Activity / Agent + Model / Top Narrows / Hour Histogram with 24 UTC buckets + ASCII bars). `--user` defaults from §54 user.json email (skipped under `--scope admin`). `--push` invokes `RL_WECOM_PUSH_BIN` mock (test) OR canonical `ralph-lisa wecom-push --file` (production).
- **F5 REPL interactive** — NEW `cli/src/analyze-repl.ts` + `ralph-lisa analyze interactive` (alias `analyze repl`). Readline-based REPL, NO LLM dependency, 7 fixed query templates (`help` / `show today` / `show last week` / `count narrows` / `rank slices` / `show agents` / `quit`). §197 SECRET_PATTERNS scrub on input echo; REPL NEVER writes any `.dual-agent/*.jsonl`.
- 9 §204 tests C1-C9 + 53-line §204 section in `docs/测试作者指南.md`.

**New cli sub-cmds (this release)**: `user-behavior-analyze` (§203) / `user-behavior-backfill` (§204) / `daily-summary` (§204) / `analyze interactive|repl` (§204).

**New opt-out envs (audit-named)**: `RL_COMMAND_EVENT_OFF=1` / `RL_NARROW_EVENT_OFF=1` / `RL_CONSENSUS_EVENT_OFF=1` (production hooks); `RL_WECOM_PUSH_BIN=<path>` (test-injectable mock for daily-summary `--push`).

**Version-policy** (§143 Rule 1): additive contract + new cli sub-cmd + new default-with-opt-out → patch (followed v0.9.11 precedent of patch-bumping additive batches within the 0.9 series).

**Tests**: cli 2348/2348 PASS; wecom-bot 250/250 PASS; cli-e2e 67/67 PASS; plan validate ×2 + complexity-verify warnings=0; quality-gate full strategy all 5 checks PASS. Live dogfood validated end-to-end: `user-behavior-backfill` skipped 173 historical slices (idempotent); `daily-summary --date 2026-05-23` returned 70 submits across 3 active slices for default user (yuanwei@clickintech.com).

**Carry-forward narrows (lessons internalized)**: §203 R3 history.md slicing regex bug (lastIndexOf-then-slice missed prior NEEDS_WORK rows) → full-document header walk; §203 R3 default-on opt-in trade-off; §204 R1 PLAN test-row paths must use `.test.js` (tsc artifact) not `.test.ts`; §204 R1 C1 source-SOR alignment (submit/review events come from history.md, not from any `.jsonl` reader); §204 R2 `RL_COMMAND_EVENT_OFF=1` needed in REPL privacy test to keep snapshot stable against §203 default-on; §204 R3 daily-summary missed §54 user.json default — added precedence chain `--user > user.json.email > undefined`; §204 NEW `hermeticEnv()` test helper strips TMUX/TMUX_PANE to close tmux session-env pollution class.

---

## v0.9.0 (2026-05-17) — testing-gate full-closure batch (§149 / §150 / §151 / §154 / §152 / §153)

Five-slice batch + one priority hotfix closing post-§149 testing-gate ergonomics + Lisa-side observability + cross-archetype hint surfaces. Shipped: §149 bidirectional-attest baseline (already at v0.8.0; reinforced this batch); §150 smoke-auto-loop (mid-development fail-context capture into `.dual-agent/smoke-failures/<step>-R<round>.json`, prepended as `Smoke-Failure-Context` to next submit body across 4 propagation surfaces; 3-consec-fail → `smoke-deadlock.txt` + `TASK_FAILED` wecom; `RL_SMOKE_AUTO_LOOP_OFF=1` opt-out); §151 visual-evidence-tier (UI/web slice screenshot enforcement via `Visual-Evidence: <path>` line under `.dual-agent/visual-evidence/`; rotation cap=20; `RL_VISUAL_EVIDENCE_OFF=1` opt-out; UI keyword tightened post-Lisa narrow to drop bare `visual` for cross-slice metadata bleed); §154 wecom-push-on-policy-block (PRIORITY hotfix — `cli/src/wecom-hook.ts:buildBlockedPushPayload` + `pushBlockedSubmit` helpers wired into `cmdSubmitRalph`/`cmdSubmitLisa` block branches BEFORE `process.exit(1)` with 200ms event-loop drain, restoring user-visible WeCom push after the v0.7.0 §133 default-block silence regression); §152 project-type-tiers (`gate-manifest.json project_type: 'cli'|'web-app'|'mobile-app'|'library'|'service'` with archetype baseline mapping; `cli/src/project-type-tiers.ts:setProjectType` atomic tmp+renameSync; `GateManifest.project_type` typed; loader validates value union in BOTH strict + non-strict modes; `RL_PROJECT_TYPE_TIERS_OFF=1` opt-out; submit-time policy warn-only); §153 lisa-watchdog (Lisa silent >30min auto wecom rescue ping via `agent_stuck { target:'lisa', severity:'high', stuck_level:'critical' }`; `cli/src/lisa-watchdog.ts` 5 helpers; dedup via `.dual-agent/lisa-watchdog-last-ping.txt`; `ralph-lisa lisa-watchdog tick` for cron/launchd; `RL_LISA_WATCHDOG_THRESHOLD_SEC` override; `RL_LISA_WATCHDOG_OFF=1` opt-out; side-discovery: `pushWecomEvent` was dropping `stuck_level` field — fixed).

**New cli sub-cmds**: `gate-manifest --type <type>` / `lisa-watchdog tick` / `smoke-fail list|clear` / `visual-evidence add --file <path>`.

**Tests gained**: ~30 new tests (§150 12 / §151 6+regression / §154 6 / §152 9 / §153 6). Zero-failure regression baseline achieved at §153 closure.

**Carry-forward narrows**: §154 R4 cross-slice metadata bleed (UI_KEYWORDS bare `visual` → tightened); §152 R5+R6 fail-closed schema gap (loader allowlist + typed union validation); §153 R5 advertised opt-out env unpinned (executable oracle pattern reinforced).

---

## v0.8.0 (2026-05-16) — gate-bypass repair bundle

7-step enforcement bundle closing G3-G11 from `docs/gate-bypass-diagnostic-2026-05-16.md`. Shipped: §141 production-runtime-reliability-hook-fix; §133 policy-block-default (RL_POLICY_MODE defaults `block` not `warn`; `RL_POLICY_MODE=warn` dev escape); §137+§134+§144 prose-claim-verification bundle (test-execution-log + claim verifier + PLAN-bound §52 marker + Lisa Verified: trusted-artifact cite); §145 phase-test-prep (6-col Phase test table; `plan validate-phase-tests --slice` cli; `isMarkerPlanBound` phase-scope); §139 e2e-dogfood-gate (`dogfood-gate run --strict`: 7 live submit-ralph/submit-lisa scenarios + rotation + redaction + JSONL integrity); §138 doc-update-gate (`doc-update-gate run [--strict] [--doc-set]`: contract-aware doc/code drift detector; fail-closed missing-path + --doc-set-no-value); §140 test-report-emit (`release-report emit`: 6-collector pre-release evidence aggregator with exit_code-authoritative overall_green + SECRET_PATTERNS scrub).

**New cli sub-cmds**: `plan validate-phase-tests --slice <slug>` / `dogfood-gate run [--strict]` / `doc-update-gate run [--strict] [--doc-set <path>[,<path>...]]` / `release-report emit [--slug <slug>] [--format md|json|both]`.

**Default-behavior changes** (back-compat via explicit opt-out envs): policy default `block` (was `warn`; opt-out `RL_POLICY_MODE=warn`); §137 Test Results claim verification default-ON (opt-out `RL_TEST_RESULTS_VERIFY_OFF=1`); §144 Lisa Verified: cite default-ON (opt-out `RL_LISA_VERIFIED_OFF=1`); §134 bare §52 marker no longer flips gate to warn-mode (must be PLAN-bound via R2 self-decl / prior round / `tests-only: true` row flag).

**Tests**: cli 2054/2072 passed (+~300 new tests across §141/§133/§137/§134/§144/§145/§139/§138/§140); wecom-bot 244/244 unchanged. 8 §71-deprecated todos pre-existing.

**Version-policy rule** (§143 documented in CLAUDE.md): additive contract / new sub-cmd / new default-with-opt-out → minor (this release); semantic-equivalent fix → patch; breaking removal or signature change → major.

## v0.7.0 (2026-05-14) — 🎉 milestone release

**0.7.0 release-blocker 三件套 closed (§103 + §106 + §109 per Lisa R6 lock 7) + trust-coding mechanical enforcement arc §122/§123/§127/§125.** cli tests 1283→1753 (+470 new since 0.6.7, 0 regression).

### Release-blocker 三件套

- **§103 telemetry-privacy-opt-in** (closed R7) — `ralph-lisa init --telemetry yes|no|ask`; default-deny preserved; `~/.config/ralph-lisa/telemetry.json`
- **§106 playwright-real-e2e-test** (closed R8) — `@playwright/test ^1.60.0` + 1 real chromium page test (`cli/test-e2e/web/smoke.spec.ts`); `npm run test:e2e:web` → 1 passed; §104 manual-gate wired
- **§109 daemon-spawn-env-hygiene-fix** (closed R4) — `DAEMON_SCRUB_KEYS = ['RL_STATE_DIR', 'TMUX', 'TMUX_PANE']` scrubbed in cli-pty-daemon spawn (`cli-pty-daemon/src/pty-manager.ts:57`)

### Trust-coding mechanical enforcement

- **§122 task-capability** — `ralph-lisa task new <slug>` + `task capability ack-user --signature <T>` (required before R2 [CODE]); H1+H2 hooks; F0 watcher review.md/work.md sentinel sniff
- **§123 complexity-judge / complexity-verify** — Layer 1 LLM-primary artifact + Layer 2 deterministic gate + Layer 3 Lisa rerun; NEW `gate-manifest.json`
- **§127 testharness cleanup discipline** — `tempProject({tmuxSessionName, daemonPids})` mutable handle + SIGTERM→SIGKILL + descendant sweep + zombie-aware liveness; NEW `loadPresetByNameWithDiagnostics`; `residual-cleanup-missing` audit narrow
- **§125 phase-lifecycle-orchestration** — `ralph-lisa phase-gate --enter <id>` cli; allowed transition graph; fail-closed precondition; `.dual-agent/phase-state.json` runtime SOR; mandatory `.dual-agent/smoke-results.md`

Carry-forwards: (17) testharness 设计层必须内置 cleanup discipline; (18) PLAN-phase PASS ≠ end-of-slice CONSENSUS-eligible; (19) test table row IDs must use `C\d+` prefix.

Migration: zero breaking changes — `task`/`phase-gate` subcommands additive; gate-manifest.json schema backwards-compat; trust-coding mechanism auto-fires only after `task new`.

## v0.6.9 — skipped

v0.6.9 was a transient internal bump during the milestone session before §103/§106/§109 status was reassessed. Its content is folded into v0.7.0 above. No 0.6.9 tarball was released externally.

- **§122 task-capability** — `ralph-lisa task new <slug>` + `task capability ack-user --signature <T>` (required before R2 [CODE]); H1+H2 hooks fire plan-keeper + recordProgress at launch; F0 watcher review.md/work.md sentinel sniff
- **§123 complexity-judge / complexity-verify** — `ralph-lisa task complexity-judge --slice <slug>` (Layer 1 LLM-primary artifact) + `task complexity-verify --slice <slug>` (Layer 2 deterministic gate); Lisa rerun Layer 3 bounded-blocking; NEW `gate-manifest.json` canonical_tier_ids whitelist
- **§127 testharness cleanup discipline** — `tempProject({tmuxSessionName, daemonPids})` mutable handle + SIGTERM→500ms→SIGKILL + defensive descendant sweep + zombie-aware liveness; NEW `loadPresetByNameWithDiagnostics` API; NEW `residual-cleanup-missing` audit narrow; 4 role-template files updated
- **§125 phase-lifecycle-orchestration** — `ralph-lisa phase-gate --enter <id> [--json]` cli; allowed transition graph (null→design→tests-only→impl→{fix,consensus}); fail-closed precondition on missing testTiers; `.dual-agent/phase-state.json` runtime SOR (tracked manifest never mutated); mandatory `.dual-agent/smoke-results.md` with SKIPPED-row when no RL_SMOKE_CMD
- **§103 telemetry** — `ralph-lisa init --telemetry yes|no|ask` consent flag (default-deny preserved)

Carry-forwards: (17) testharness 设计层必须内置 cleanup discipline; (18) PLAN-phase PASS ≠ end-of-slice CONSENSUS-eligible; (19) test table row IDs must use `C\d+` prefix.

Migration: zero — additive `task`/`phase-gate` subcommands; gate-manifest.json schema backwards-compat; trust-coding mechanism auto-fires only after `task new`.

## v0.6.8 (2026-05-12)

**§102 protocol gap fixes — auto-TDD artifact + tests-only gate carve-out now work for [FIX] tag.** 2 sub-slices closed mutual CONSENSUS (17 rounds total, 0 regression), cli 1515→1526 (+11 tests).

Two protocol gaps that fired 10+ times across §A/§D/§E/cmdRunLisa-isolation overnight, both now shipped end-to-end:

### §102 v1.2 — PLAN-persist hook on [FIX] tag

- `cli/src/commands.ts:2133-2139` extends persist-hook tag-guard: `tag === "PLAN" || (tag === "FIX" && hasNonEmptyTestTable(content))`
- NEW `cli/src/auto-tdd.ts:464-471` exported helper `hasNonEmptyTestTable(content): boolean` — guards against artifact-nuke when [FIX] body has no table (returns false for tableless prose, header-only tables, malformed pipe rows, escape-only content)
- Effect: Ralph submit `[FIX]` with refined PLAN test table auto-refreshes `.dual-agent/auto-tdd-plan-<step>.json`. Previously only `[PLAN]` tag fired the hook → manual artifact edit every [FIX] iteration (10+ pain points across overnight slices).

### §102 v1.3 — §52 marker carve-out for [FIX] tag

- `cli/src/commands.ts:1108` extends `isTestsOnly` carve-out from `tag === "CODE"` to `(tag === "CODE" || tag === "FIX")` when verbatim §52 marker present
- `cli/src/test/tests-only-gate-convention.test.ts:85-90` §52 C3 pin updated to v1.3 contract
- Effect: post-NEEDS_WORK policy forces tests-only refinements onto `[FIX]` tag; pre-v1.3 they hit gate block-mode → `RL_RALPH_GATE=false` workaround. Now `[FIX]+§52 marker` routes to warn-mode same as `[CODE]`.

### §cmdRunLisa-isolation — env-driven Lisa subprocess isolation

- `cli/src/engine/types.ts` adds `RllSessionConfig.stateDirOverride?: string` field (resolved `.dual-agent` directory path, NOT project root)
- `cli/src/engine/TurnCoordinator.ts` adds `private resolveStateRoot()` helper — the SINGLE site of project-dir-derived state-root resolution; all 7 prior `stateDir(this.projectDir)` consumers + 5 helper-wrapped writes (setTurn/setRound/setStep/appendHistory/updateLastAction) now route through `path.join(this.resolveStateRoot(), ...)`
- `cli/src/commands.ts` exports `runLisaOnce(args, deps?: { transportFactory?, stateDirOverride?, cwd? })` DI seam for testable Lisa subprocess; `cmdRunLisa` becomes a thin try/catch wrapper
- Effect: `env -u TMUX RL_STATE_DIR=<tmp> ralph-lisa run-lisa` now isolates writes correctly to the env-pointed dir. Pre-fix, coordinator writes leaked to repo `.dual-agent/` despite the env contract (§E dogfood-discovered).

### Self-dogfood validation

v1.3 fix validated end-to-end on this slice's own R4 [FIX] iteration — submit body carried verbatim §52 marker, gate ran in warn-mode, no `RL_RALPH_GATE=false` workaround needed.

### Migration

No breaking migration. All v0.6.7 workflows keep working: the two `[FIX]` carve-outs are additive (don't change `[CODE]` or `[PLAN]` behavior). cmdRunLisa behavior is unchanged unless `RL_STATE_DIR` / tmux state-dir overrides are used — those overrides now correctly isolate coordinator writes to the env-pointed `.dual-agent` directory instead of leaking back to the repo (the §E dogfood regression).

## v0.6.7 (2026-05-11)

**Trust-coding closed-loop arc §90→§94 — 5 sub-slices closed mutual CONSENSUS in a single overnight session.** ~70 rounds (per-slice: §90=10 research / §91=13 / §92=12 / §93=10 / §94=7), 30+ substantive Lisa narrows, cli 1283→1415 (+132 tests, 0 regression, 13 §90 §6 invariants 100% intact). See `docs/trust-coding-closed-loop-design.md` (552 lines, design) + `docs/trust-coding-user-guide.md` (user-facing guide) for full architecture.

### §90 trust-coding-closed-loop-research — architecture deliverable

`docs/trust-coding-closed-loop-design.md` (8 sections / 13 unchanged-invariant proofs / 4 starter preset JSON / dual-track enforcement / §49 §C marker × multi-tier semantic). Mirrors §66 research-only pattern. Hands off §91-§93 impl queue.

### §91 preset-schema-and-detect-and-starter-presets — preset infrastructure

- NEW `cli/src/preset/`: schema.ts (Preset / Tier / TierConfig + validatePreset) / stack-detect.ts (12-rule priority + monorepo escalation) / change-type-detect.ts (path-pattern → preset key) / preset-loader.ts (loadPresetByName with bundled-default + tmpdir DI)
- 4 bundled preset JSONs at `cli/templates/presets/`: cli-cmd / cli-schema / web-ui / platform-server-cmd
- NEW `cli/src/commands.ts cmdTestAuto` (dry-run stub) + cli.ts dispatch
- 45 §91 cases incl. monorepo cross-subdir global-priority sentry (web > cli > server)

### §92 preset-auto-invoke-and-policy-gate — auto-fill + cli/policy wires

- NEW `cli/src/preset/runner.ts runPreset` (preflight `requiredBinary` via `command -v` + spawn + adapter parse + threshold check + aggregate JSON; deterministic exit-code rule) + `computeR2Obligations` (split into expectedFail vs deferralRecord)
- EXTEND `cli/src/policy.ts`: parseTierEvidence + validateTierCoverage
- EXTEND `cli/src/commands.ts`: TestConfig.preset?: { enabled / requireAll / dryRunOnly } + applyPresetHook async with Promise.race-with-timeout cleanup (no timer leak)
- cmdTestAuto full execution + `--tier <t1,t2>` filter + `--json` no-op alias + cmdSubmitRalph hook integration with real bounded autoInvokeFn
- 45 §92 cases incl. real submit-pipeline integration tests with tmpdir + fake binary (proves auto-fill success path exits in <500ms vs 60s timer leak)

### §93 lisa-side-preset-audit-and-closed-loop-dogfood — Lisa Track 2

- NEW `cli/src/preset/lisa-narrow-templates.ts auditLisaPresetSubmission(body, preset): Narrow[]` + renderNarrow. 4 narrow kinds with locked input contracts:
  - **omission**: tier in requiredTiers but absent from parsed evidence
  - **fake-evidence**: cmd OR result empty/placeholder/template-only
  - **weak-oracle**: preset.perTierConfig[tier].oracle tautological (`/test passes/` without `proves|demonstrates|covers` verbs)
  - **threshold-missing**: numeric tier (perf/stability) without threshold value
- NEW `ralph-lisa preset show [--preset <key>] [--json]` + `ralph-lisa preset audit --file <work.md> --preset <key> [--presets-dir <dir>] [--json]` cli
- EXTEND `cli/templates/roles/lisa.md` with additive "Preset audit" section (preserves all existing review requirements)
- NEW `docs/trust-coding-user-guide.md` (~180 lines: how to enable / write custom presets / debug closed-loop failures / happy-path walkthrough)
- 22 §93 cases incl. real cmdSubmitRalph integration (dryRunOnly reject / requireAll=false warn / preset disabled / auto-fill success with fake binary fixture)

### §94-followup defaultWhich Windows compat patch

Pre-release patch in `cli/src/preset/runner.ts:56-68 defaultWhich`: use `where` on `process.platform === 'win32'`, `command -v` elsewhere. Fixes false-negative "binary missing" on Windows for preset gate `requiredBinary` preflight. Day-to-day impact small because bundled presets put `requiredBinary` only on optional tiers (k6/gitleaks); missing-optional already silent-skipped. But `--tier perf` explicit invocation now works on Windows. +1 test `C2b.1` pins both Windows `where`-style and POSIX-style paths via DI'd whichFn.

### §94 wecom-protocol-fix-P0 — every-turn unread-inbox enforcement

User-reported 2026-05-10 root cause: 5 WeCom messages missed for hours because CLAUDE.md AUTO-START "after `whose-turn`, run `wecom-feedback unread`" was voluntary discipline. P0 fix makes it mechanical.

- NEW `cli/src/wecom-feedback.ts readUnreadFeedbackForSide({side, advance, suppressEmpty, stateDir?}): string` — returns rendered string or `""` (no `(no new feedback)` markers when suppressEmpty=true); consume-once cursor via `advance=true`
- EXTEND `cli/src/commands.ts cmdWhoseTurn` with 6-fn DI seam + auto-print unread inbox when turn ∈ {ralph, lisa}; `RL_WHOSE_TURN_NO_INBOX=1` env opt-out; silent on read failure (stderr too)
- 18 §94 cases incl. consume-once cursor advancement pin (proves `unread`, not `peek`) + direct helper tests with tmpdir state fixture (UUID-like ids matching `randomUUID()` real format)
- Deferred to §95+: P1 watcher inbox-unread-age escalation independent of pane idle / P2 submit-ralph pre-submit unread check / live model-Lisa subprocess dogfood (CI uses deterministic simulated audit)

### New CLI surface (v0.6.7)

| Command | Purpose |
|---------|---------|
| `ralph-lisa test --auto` | Auto-detect stack + run preset's required tiers |
| `ralph-lisa test --auto --dry-run` | Preview resolved preset (no execution) |
| `ralph-lisa test --auto --preset <key>` | Force preset selection |
| `ralph-lisa test --auto --tier <t1,t2>` | Filter to specific tiers |
| `ralph-lisa preset show` | List bundled presets |
| `ralph-lisa preset show --preset <key> --json` | Show preset JSON |
| `ralph-lisa preset audit --file <work.md> --preset <key>` | Lisa-side audit; emits structured Narrow[] |

### Config additions

`.ralph-lisa.json` new `preset` block (opt-in; default off):
```json
{
  "preset": {
    "enabled": true,
    "requireAll": true,
    "dryRunOnly": false
  }
}
```

When `preset.enabled=true`, submit-ralph automatically:
- Parses Test Results section
- Auto-invokes `ralph-lisa test --auto --tier <missing>` for missing tiers (if `requireAll=true && !dryRunOnly`)
- Rejects with hint if `dryRunOnly=true` or auto-invoke fails
- Warns (proceeds) if `requireAll=false`

### Env vars (v0.6.7)

- `RL_WHOSE_TURN_NO_INBOX=1` — opt out of `whose-turn` auto-print (for tests / cron)

## v0.6.6 (2026-05-10)

**Test-harness completion §75 series — 6 sub-slices closed mutual CONSENSUS in a single overnight session.** ~70 rounds (per-slice: §76=12 / §77=8 / §78=12 / §79=10 / §80=9 / §81=7), 36 substantive Lisa narrows, cli 1081→1283 (+202 tests, 0 fail). See `docs/dev-harness-closed-loop-design.md` for closed-loop architecture walkthrough.

### §76 watcher-inbox-poll-impl — F1 + F4 + F14 close

6-line state machine (`lastSeen`/`lastWake`/`blockedSince`/`firstBlockedAt`/`criticalFiredAt`/`sessionMtime`); per-side state files (`.inbox_wake_state.<side>`); ESCALATE (high) at `alertThresholdSecs=300` + CRITICAL (🚨🚨) at `criticalThresholdSecs=600`; sessionMtime distinguisher prevents cross-message sentinel leak (Lisa R5 narrow). 14 IM tests + IM-5i regression pin.

### §77 test-failure-context-schema — pure schema (2a0)

`cli/src/test-failure-context.ts`: TestFailureContext (schema_version=1 literal), TierName (open string union), TestType (closed 7-value union: contract/regression/security/visual/accessibility/deployment-smoke/general), TierConfig referencing testHarness.tests keys (no command duplication), RetryBudget, FailureInjectionTargets. Type guards strict on required+version+unions; forward-compat on extra fields. ISO 8601 calendar-validated occurred_at (rejects Feb 31 silent rollover via leap-year-aware daysInMonth helper).

### §78 test-tier-cascade-mvp — cascade engine (2a)

`cli/src/test-cascade.ts` + `ralph-lisa test-cascade`:

```bash
ralph-lisa test-cascade --strategy halt-on-fail   # default
ralph-lisa test-cascade --strategy full           # ignore halt
ralph-lisa test-cascade --strategy smoke-only     # only lowest-order tier
ralph-lisa test-cascade --tier integration --fail-fast --json
ralph-lisa test-cascade --dry-run
```

`safeFailureContextFilename` allowlist `[A-Za-z0-9._-]` + reject `..`/`.`/no-alphanumeric (Lisa R4 narrow); `validateTierTestKeys` rejects unknown harness test references (Lisa R9 narrow); cmd default uses real `runHarnessTest` wrapper not no-op (Lisa R10 narrow). 58 TC tests.

### §79 auto-loopback-with-context — Ralph rebound (2b)

`cli/src/loopback.ts` + extended `handleMutualCompletion` DI seam:

```bash
ralph-lisa loopback status   # consecutive_failures / escalated / halted
ralph-lisa loopback reset --step <X>
```

Cascade-fail branch: structured `## Cascade Failure Context (R{n})` review.md entry (parser-safe); per-test_id retry counter; `setTurn('ralph')` for repair; **no generic prose** (consumer branch unchanged for non-cascade fails). Escalation + halt use existing `task_failed` kind with note prefix `ESCALATION:` / `CRITICAL HALT:` (no new event type — wecom-bot untouched). 34 LB tests + LB-8g real-execution regression pin.

### §80 cross-module-contract-check — drift detector (2c)

`cli/src/contract-check.ts` + `ralph-lisa contract-check`:

```bash
ralph-lisa contract-check          # blocking drift → exit 1
ralph-lisa contract-check --strict # warnings → blocking
ralph-lisa contract-check --json
```

4 drift classes: cli emit / daemon accept-list mismatch; daemon EventType union ⊕ accept-list (silent ingress reject); cli/ingress add field but daemon consumer gate unchanged (silent drop); render-branch baseline distinction. `extractDaemonAcceptList` constrained to `'invalid type'` ingress gate via forward-scan find-enclosing-if (Lisa R7 narrow: prevents global regex false-negative). 37 CC tests.

### §81 tdd-test-spec-helper-agent — PLAN linter (2d)

`cli/src/test-spec-eval.ts` + `ralph-lisa test-spec-eval`:

```bash
ralph-lisa test-spec-eval --plan-file .dual-agent/work.md       # session work.md
echo "$plan_md" | ralph-lisa test-spec-eval --json              # stdin default
```

5 rules: no-test-plan (high) / thin-coverage <3 (high) / happy-only (medium) / single-surface (medium) / missing-integration (medium). Supports `## Test Plan` / `### Test plan` (case-insensitive); section bounded by next same/higher-level heading; `- TC-N` and `- [TC-N]` bullet styles + Surface column + Count column sum. 28 TS tests.

## v0.6.5 (2026-05-08)

Four sub-slices closed mutual CONSENSUS in a single run; longest §62 = 15 rounds.

### §59 weekly-digest-cli — D pillar consumer

```bash
ralph-lisa weekly-digest                       # last 7 days, stdout
ralph-lisa weekly-digest --days 30 --push      # 30-day window pushed to wecom
```

Reads `.dual-agent/token-usage.jsonl` (§55), formats markdown with per-agent + per-user 4-field tables (prompt + completion + total + event_count). cli +12 (W1-W12).

### §60 task-state-wecom-bridge — task lifecycle event bridge

```bash
ralph-lisa task-state done --note "shipped"
ralph-lisa task-state failed --note "rate limit"
ralph-lisa task-state pending-user --note "需要 API key"
```

Mirrors §28 sub-slice-state-change daemon special-case branch full footprint: skip humanize, owner-only fixed copy with emoji ✅/❌/⏸ + zh prefix, 5s `(step, kind)` semantic dedup. cli +7 + wecom-bot +10.

### §61 agent-session-jsonl-reader — native session token capture

```bash
ralph-lisa session-capture --agent claude --role ralph
ralph-lisa session-capture --agent codex --role lisa --since 2026-05-08T00:00:00Z
```

Replaces TUI pane parsing path with structured CLI-host session log reader. Covers any model routed through codex CLI or claude code CLI (incl. aliyun-hosted kimi/qwen/glm/deepseek via codex provider plugins). Reads `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` and `~/.codex/sessions/<y>/<m>/<d>/rollout-*.jsonl`. 5 design Locks (within-file dedup, user_email precedence, watermark, lossy mapping, --since filter). cli +16 (SR1-SR13).

### §62 posthog-self-host-loop-closure — local PostHog deploy stack

Removes `us.posthog.com` Cloud dependency from D2.1B integration tests. Path-3 external-checkout: operator clones upstream PostHog adjacent; setup.sh validates layout + delegates to canonical hobby compose with empirically-validated env contract.

```bash
mkdir -p ~/posthog-upstream
git clone https://github.com/PostHog/posthog ~/posthog-upstream/posthog
bash deploy/posthog/setup.sh
RLL_RUN_POSTHOG_LOCAL=1 npm test --prefix rll-team-platform/server -- test:integration:local-posthog
```

8-step boot contract: validate parent-dir layout / env-source order / 5-key validation / symlink hobby+base+dev-services.env to parent / provision `compose/{start,wait,temporal-django-worker}` scripts / download GeoLite2-City.mmdb / `docker compose up -d` / poll `http://localhost/_health`. NEW: setup.sh + teardown.sh + .env.dev-defaults (DOMAIN=localhost + CADDY_HOST=http://localhost + TLS_BLOCK= empty + ENCRYPTION_SALT_KEYS-as-32-char-raw-NOT-pre-encoded-Fernet) + PostHog_Local_Keys.template + rewritten README with R3-empirical findings table.

NEW 5-tier release-gate partition (pure / docker / real / cloud-posthog / local-posthog). NEW integration test `posthog-local-real-connectivity.test.ts` with 7 it-blocks (skip-by-default).

**Hardware caveat**: PostHog hobby topology requires Docker memory ≥ 12 GB. R3 empirical dogfood on 7.65 GiB Docker reached ~879/1094 Django migrations before OOM. Setup prepared; real-boot-PASS deferred to operator.

### Carry-forward methodology

- **§61 r13 [CHALLENGE] precedent**: meta-circular [FIX] cycles escape via [CHALLENGE] structural rewrite.
- **§62 r8 [CHALLENGE] precedent**: external-system contract > 100 lines warrants empirical-R0-first.
- **§62 r12-r15 source-vs-SOR sync**: closeout sync extends to shipped scripts.
- **§62 r14-r15 parser-anchor avoidance**: avoid canonical-heading literals in summary/prose before `##` heading.

cli tests: 989 → 1024 (+35).

## v0.6.4 (2026-05-07)

### Data closure (D pillar) — full auto-capture pipeline

Six new sub-slices ship the end-to-end token-usage data-closure chain. Identity captured automatically at session-init; pane-log parser extracts claude TUI token counts; watermark-based capture cmd makes auto-attribution idempotent; aggregation cli surfaces per-agent + per-user totals.

- **`ralph-lisa user-identity [--refresh]`** — read `git config user.email` / `user.name` → `.dual-agent/user.json`. Auto-runs on `init` / `start` / `auto` (any session-init path) via `cmdInit` hook.
- **`ralph-lisa token-record --agent X --role X --prompt N --completion N [--user-email X] [--task-id X]`** — programmatic event recording. Auto-resolves `user_email` from `user.json`; auto-fills `captured_at`; appends to `.dual-agent/token-usage.jsonl`.
- **`ralph-lisa token-parse-pane --file <path>`** — pure parser for claude TUI token lines. 3-rule discriminator (rejects grep-n echoes + prose mentions + `^\d+[:\s]` line-prefix; requires `↓ N tokens · ` middle-dot pattern + `)` line-end). Real-corpus validated against `.dual-agent/pane*.log`.
- **`ralph-lisa token-capture --pane <0|1>`** — wires parser → record + char-offset watermark `.dual-agent/.token-capture.watermark.json` (UTF-8-safe; pane logs contain multibyte glyphs). Idempotent on re-run; `--pane 2` strict reject (exit 1, no state mutation).
- **`ralph-lisa token-usage [show | summary]`** — aggregate per-agent + per-user totals. 4-field bucket: `prompt_tokens` / `completion_tokens` / `total_tokens` / `event_count`.

End-to-end smoke: `token-capture --pane 0` on a real 5MB pane log captures 32 events / 98879 completion-tokens, attributed to git-resolved user identity, idempotent across re-runs.

### Self-audit oracles (mechanically enforced)

- **`ralph-lisa repeat-edit-check [--threshold N] [--no-working-tree-overlap]`** — CLAUDE.md trigger #1 oracle, mechanized. Reads last N Ralph submit handoffs from `.dual-agent/history.md`, finds files appearing in all N, optionally cross-references with current `git diff -U0` hunk overlap (±10 lines). Exit 0 (no detect) / 2 (detect; machine-parseable stdout `REPEAT_EDIT_DETECTED file=... rounds=... cited_lines=... current_hunks=...`).
- **`ralph-lisa daemon-health-check`** — wecom-bot daemon liveness. Pidfile + `kill(pid, 0)` signal-0 probe + optional heartbeat staleness check. Status ∈ {`healthy`, `dead`, `stale`, `not-started`, `unknown`}. Integrated into `whose-turn`: silent on healthy/not-started/unknown, stderr `[warn] wecom-bot daemon dead/stale ...` on dead/stale.

### TDD-first protocol (§49 §C R2 marker convention)

- **Tests-only `[CODE]` round** with verbatim marker `Convention: tests-only / expected-fail (§49 §C)` in submission body relaxes the gate to warn-mode for that round only. Lets Ralph land tests with expected failures, gives Lisa a separate test-design review window before implementation, then R3 `[CODE]` writes impl with the gate back to hard-block.
- **Strict marker matching**: case-sensitive literal substring; `tag === "CODE"` only (FIX never relaxes); `RunGateOptions.executeGateImpl` injection seam for unit-testable mode-decision.
- **`isClaudeStatusLine`-style discriminator pattern** carried forward: helper-pure parsers + composite-cmd seams (Lisa-narrow lock from §56).

### WeCom default routing fix

- **Default target = `ralph`** for unmarked freeform / voice / `/task` / `/feedback` / `/ralph` messages. Only `/lisa <msg>` routes to lisa. Closes 0.6.2 multi-machine "WeCom 不读不回" symptom (was: default 'both' meant both agents thought "the other one will respond" → neither did).
- `cmdAutoEngine` (engine-mode) now auto-spawns wecom-bot daemon at startup; mirrors `cmdStart` + `cmdAuto`. Closes the second half of the same multi-machine bug (engine-mode users had no wecom-bot daemon at all).

### Process / SOR discipline (carry-forward in CLAUDE.md)

- **`主动求救场景`** 5 triggers + WeCom keyword interpretation table + complex-task TDD-first standard (with simple-task escape priority). All locked in CLAUDE.md.
- **stateDir() seam discipline**: any new `.dual-agent/<file>` writer must use `stateDir()` from `cli/src/state.ts:151` (not raw CWD-relative literal). mkdir-recursive + try/catch never-fatal for fs paths.
- **No round-numbered prose** in PLAN.md current-state surfaces (drift-cycle structural fix).

### Test coverage

- cli: 906 → **989** (+83 tests, all green)
- wecom-bot: 235/235
- typecheck clean; plan validate green

### Breaking / migration

- None. All new commands are additive. Existing `ralph-lisa init` / `start` / `auto` behavior unchanged except for the additional `init: captured user identity <email>` line printed at end-of-init (silent skip if git not configured).

---

## v0.6.3 (2026-05-06)

### Cross-platform IDE UX path (3 steps)

- **§46 `cli-pty-daemon attach <ralph|lisa>`** — thin terminal client connecting to long-running PTY daemon. Replaces tmux dependency.
- **§47 `ralph-lisa start --daemon`** — engine-driven start mode that pipes ralph (claude) + lisa (codex) into the daemon. Cross-platform pure (no `/bin/sh` wrapper, no iTerm/tmux); Seam A (socketPathFor) + Seam B (resolveDaemonStateRoot) with inline-oracle parity tests.
- **§48 `cli-pty-daemon-vscode` extension** — VSCode/Cursor/Trae extension MVP. "RLL: Open Ralph" + "RLL: Open Lisa" commands → `vscode.Terminal` driven by `Pseudoterminal` API. Type-only `vscode` import + `MiniEmitter` so tests run pure node.

### D2 PostHog Cloud Gate 2 lock

- §42 PostHog Cloud Phase 5 lock + §43 Phase 6 walkthrough + §45 wire-shape fix (real Cloud uses numeric `id` + PATCH soft-delete, not `:key` + DELETE).

---

## v0.4.1

### What's New in v0.4.1

**Cross-Platform Engine**
- Native Windows support for `ralph-lisa auto --engine` — no WSL, tmux, or bash required
- `--ui wt`: dedicated Windows Terminal dual-pane view (script-file approach for PowerShell `;` compat + UTF-8 encoding fix)
- `--ui tmux`: rewritten to file-tail rendering — no more `zsh: command not found` noise in panes
- Transport → UI direct streaming: panes show full agent output in real time, not just submission dividers

**IDE Integration (Mode 2B)**
- `ralph-lisa watch-lisa`: background Lisa watcher with persistent connection — Lisa retains context across rounds
- `ralph-lisa run-lisa`: synchronous single-round Lisa review via `TurnCoordinator.injectSubmission()`
- `ralph-lisa review`: stateless one-shot code review — auto-collects `git diff`, no init needed, supports `--scope`
- `ralph-lisa init` generates rule files for **all major IDEs**: CLAUDE.md, .cursorrules, .windsurfrules, .clinerules, .github/copilot-instructions.md
- Git post-commit hook: auto-triggers Lisa review on commit, writes to `.dual-agent/auto-review.md` (advisory channel)
- Phase completion triggers in Ralph template: mandatory submit boundaries for cross-IDE consistency

**Debug & Diagnostics**
- `--debug`: opt-in raw transport I/O + coordinator event logging to `<stateDir>/debug/`
- Resend cause classification: `empty_output`, `missing_tag`, `invalid_tag`, `needs_work_policy`, `policy_block`
- Full raw payloads (no truncation) in transport debug logs

**Codex 0.40+ Compatibility**
- `sandbox: false` → string enum (`workspace-write` / `read-only`), decoupled from `--auto-approve`
- `conversationId` → `crypto.randomUUID()` (codex requires UUID format for thread_id)
- Server-assigned `threadId` adoption from `structuredContent` on first codex tool call
- User's `~/.codex/config.toml` `sandbox_mode` respected independently of approval policy

**MCP Server Fixes**
- `rll_submit`: returns full Lisa review (removed 500-char truncation)
- `rll_handoff`: returns `final_work` + `final_review` with complete content

**Security**
- `review --scope`: uses `execFileSync` with argv array (prevents command injection via shell interpolation)

## v0.3.x

### What's New in v0.3

- **`update-task` command**: Change task direction mid-session without restarting. Appends to task.md so history is preserved. Task context is auto-injected into submissions and watcher trigger messages.
- **Round 1 mandatory `[PLAN]`**: Ralph's first submission must be `[PLAN]`, giving Lisa a chance to verify understanding before coding begins.
- **Goal Guardian**: Lisa now reads task.md before every review and checks for direction drift. Catching misalignment early is prioritized over code-level review.
- **Factual verification**: Lisa must provide `file:line` evidence when claiming something is "missing" or "not implemented".
- **Policy layer**: Configurable submission quality checks with `warn`/`block` modes.
- **Watcher v3**: Fire-and-forget triggering, 30s cooldown, checkpoint system (`RL_CHECKPOINT_ROUNDS`), auto-restart on crash, configurable log threshold (`RL_LOG_MAX_MB`), heartbeat file.
- **Deadlock escape**: After 5 rounds without consensus, agents can use `[OVERRIDE]` or `[HANDOFF]`.
- **Minimal init**: `ralph-lisa init --minimal` creates only session state (zero project files).
- **`doctor` command**: Verify all dependencies with `ralph-lisa doctor`.

### Bug Fixes (v0.3)

- Fixed case pattern escaping in generated `watcher.sh` — JS template literals silently stripped backslashes from case patterns, causing the watcher to crash-loop on every startup in auto mode.
- Fixed `check-next-step` consensus logic to match `step` command behavior.
- Fixed test isolation: neutralize tmux environment variables in test subprocesses.
- Hardened watcher send-keys delivery for TUI agent compatibility.

### What Didn't Work

Sharing the failures matters as much as the results:

- **Agent crashes have no auto-recovery.** Once an agent crashes (possibly from long context or system resource exhaustion), the loop stops and you must manually restart. No self-healing yet.
- **State desync between agents.** Early versions had Lisa going rogue — writing code herself instead of reviewing, causing state confusion. Much improved now, but the lesson stands.
- **Without domain judgment, the loop is useless.** Two AIs will happily agree on a bad design. This is not autonomous development — it is structured AI-assisted development. The human arbiter isn't optional.
- **Git discipline is non-negotiable.** Small commits, clear messages, commit often. When things go wrong (and they will), your only safety net is being able to `git reset` to a known good state.
