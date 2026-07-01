# Trust-Coding Closed-Loop User Guide

**Status**: §93 deliverable (preset-aware closed-loop). For architecture see `docs/trust-coding-closed-loop-design.md`.

This guide covers the operator workflow for trust-coding's preset-aware test gates: enabling, writing custom presets, understanding preset-aware Lisa narrows, and debugging.

---

## 1. What this gives you

When you change a CLI sub-cmd, schema, web UI route, or server endpoint, RLL can:

1. **Auto-detect stack and change-type** from `package.json` / git diff
2. **Auto-invoke the right tier of tests** (unit / smoke / functional / integration / E2E / perf / security) — not just unit
3. **Block submissions missing required tier evidence** (or auto-fill via `--auto`)
4. **Lisa-side audit** the submission for fake evidence / weak oracles / missing thresholds — structured `Narrow[]` she can act on mechanically

The trust-coding goal: AI develops, tests, and reviews itself with minimal human intervention. Multi-tier gates + closed-loop feedback are the mechanism.

## 2. Enable preset gates

Add to your project's `.ralph-lisa.json`:

```json
{
  "preset": {
    "enabled": true,
    "requireAll": true,
    "dryRunOnly": false
  }
}
```

| Field | Default | Behavior |
|---|---|---|
| `enabled` | `false` | When false, preset gate is no-op (legacy `testRunners` path used). When true, preset hook fires on `[CODE]`/`[FIX]` submissions. |
| `requireAll` | `true` | When true (strict), missing tier evidence triggers auto-invoke (or rejects if `dryRunOnly=true`). When false (warn-only), missing evidence is reported but submission proceeds. |
| `dryRunOnly` | `false` | When true, never auto-invoke. Reject missing evidence with a hint to run `ralph-lisa test --auto --tier <X>` manually. |

**Recommended starting config** for new projects: `enabled=true`, `requireAll=true`, `dryRunOnly=false` — full auto-fill.

## 3. CLI surface

### `ralph-lisa test --auto`

Executes the auto-detected (or `--preset`-specified) preset against your project.

```bash
# Auto-detect stack + run all required tiers
$ ralph-lisa test --auto

# Force a specific preset
$ ralph-lisa test --auto --preset web-ui

# Dry-run: print preset JSON without executing
$ ralph-lisa test --auto --dry-run

# Filter to specific tiers
$ ralph-lisa test --auto --tier unit,smoke

# Output structured aggregate JSON
$ ralph-lisa test --auto --json
```

Exit code: `0` iff `all_required_pass === true`. Optional tier absence never blocks.

### `ralph-lisa preset show`

Inspect bundled presets.

```bash
# List all bundled presets
$ ralph-lisa preset show

# Show full preset JSON
$ ralph-lisa preset show --preset cli-cmd --json
```

### `ralph-lisa preset audit` (Lisa-side)

Audit a submission's `work.md` against a preset. Lisa runs this at review time when `preset.enabled=true`.

```bash
$ ralph-lisa preset audit --file .dual-agent/work.md --preset cli-cmd --json
[
  {
    "kind": "weak-oracle",
    "tier": "unit",
    "citation": "preset.perTierConfig.unit.oracle is tautological",
    "observed": "oracle: \"tests pass\"",
    "suggestedFix": "rewrite oracle to state what passing PROVES..."
  }
]
```

Use `--presets-dir <dir>` to load test-owned presets without polluting bundled `cli/templates/presets/`.

## 4. Bundled presets

| Preset key | Stack / change-type | Required tiers | Optional tiers |
|---|---|---|---|
| `cli-cmd` | cli + adding/modifying CLI sub-cmd | unit / smoke / integration | functional |
| `cli-schema` | cli + schema (state file, JSON contract) change | unit / smoke / integration | functional |
| `web-ui` | web + SPA change | smoke / e2e | functional / perf / stability |
| `platform-server-cmd` | server (rll-team-platform/server/) endpoint | unit / functional / integration | e2e / perf / security |

`wecom-bot-cmd` deferred to §91-followup (different test-runner shape).

## 5. Writing a custom preset

Preset = JSON file at `cli/templates/presets/<preset-key>.json` (or anywhere via `--presets-dir`).

Required fields:

```json
{
  "stack": "cli",
  "changeType": "cmd",
  "requiredTiers": ["unit", "smoke", "integration"],
  "optionalTiers": ["functional"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test --prefix cli",
      "oracle": "covers happy + 4xx + 5xx; proves new endpoint contract",
      "locallyRunnable": true
    },
    "smoke": {
      "cmd": "ralph-lisa smoke-check",
      "oracle": "CLI binary spawns; new sub-cmd visible in --help",
      "locallyRunnable": true
    },
    ...
  }
}
```

### Field rules

- `oracle`: state **what passing proves**, not "test passes". Use verbs like `proves`, `demonstrates`, `covers`, `verifies`. The Lisa audit catches tautological oracles via `weak-oracle` narrow.
- `locallyRunnable`: `true` if the cmd runs in default RLL dev env (npm/npx/node/git/playwright). `false` for tools requiring standalone install (k6, gitleaks, terraform).
- `requiredBinary`: only set for true standalone binaries (NOT npm/npx-installable). Used by preflight `command -v` check before tier execution.
- `threshold`: required for numeric tiers (perf, stability). Omitting triggers `threshold-missing` narrow.

## 6. Understanding Lisa preset-aware narrows

When `preset.enabled=true`, Lisa runs `ralph-lisa preset audit` at review time. Possible narrows:

| Kind | Trigger | Fix |
|---|---|---|
| `omission` | Required tier missing from Test Results | Add `- <tier>: <cmd> → <result>` line, or run `ralph-lisa test --auto --tier <tier>` |
| `fake-evidence` | tier present but cmd or result empty/placeholder | Replace with actual cmd output |
| `weak-oracle` | `preset.perTierConfig[tier].oracle` is tautological | Rewrite oracle to state what passing proves |
| `threshold-missing` | Numeric tier (perf/stability) without `threshold` | Add `"threshold": { "p95": ..., "rps": ... }` |

The audit complements (does not replace) Lisa's existing review responsibilities — read actual code, cite file:line, verify test execution, re-run tests.

## 7. Debugging closed-loop failures

### Submission rejected by preset gate

```
========================================
Submission BLOCKED by preset gate:
  - missing tiers smoke, integration; run `ralph-lisa test --auto --tier smoke,integration` to fill, or set preset.requireAll=false for warn-only mode
========================================
```

Options:
1. **Recommended**: run the suggested cmd to fill evidence, then resubmit
2. Set `preset.requireAll=false` for warn-only mode (proceeds with warning)
3. Set `preset.dryRunOnly=true` to disable auto-fill (rejects with hint instead)

### Submission rejected by setup error

```
Submission BLOCKED by preset gate setup error:
  - preset.enabled=true but no stack detected (no package.json/Cargo.toml/etc); set preset.enabled=false or run from a recognized project root
```

This means stack-detect couldn't identify your project type. Either:
- Set `preset.enabled=false` (disables preset gate)
- Add a recognizable project file (package.json, Cargo.toml, pyproject.toml, etc.)
- Run `ralph-lisa submit-ralph` from the actual project root

### Auto-invoke timeout

```
Submission BLOCKED by preset gate:
  - auto-invoke timeout/hang for tier 'integration': ... exceeded timeout 30000ms; run `ralph-lisa test --auto --tier integration` manually
```

The auto-invoke for that tier exceeded the bounded timeout (default 30s). Run the cmd manually to investigate.

## 8. Closed-loop happy path

End-to-end example:

1. You change `cli/src/commands.ts` to add a new sub-cmd
2. You write [CODE] submission with only unit test results in body
3. `ralph-lisa submit-ralph --file <body>` fires:
   - **Setup**: detect stack=cli, changeType=cmd → load `cli-cmd.json` preset
   - **Coverage**: parses Test Results, finds `unit` present but `smoke` + `integration` missing
   - **Auto-invoke** (requireAll=true, dryRunOnly=false):
     - Run `ralph-lisa smoke-check` → result appended to body
     - Run `ralph-lisa contract-check --json` → result appended to body
   - **Write work.md** with auto-filled body, turn passed to Lisa
4. Lisa runs `ralph-lisa preset audit --file work.md --preset cli-cmd --json`:
   - All tiers present + non-tautological oracles → empty Narrow[]
   - Lisa proceeds with normal review (read code, verify tests, etc.)
5. Lisa returns [PASS]; turn back to you for next round

**Trust-coding loop**: Ralph (you) writes code + minimal evidence; preset gate fills the rest; Lisa audits structurally + qualitatively. Human intervention only at the boundaries (initial task, final consensus, deadlock).

## 9. Limitations + roadmap

- Stack detection currently 12 rules (npm/Cargo/pyproject/pubspec/manifest/csproj/terraform); does not yet cover all stacks
- Change-type detection currently 8 path patterns; full git-diff-based detection is §92-followup
- Live model-Lisa subprocess closed-loop dogfood **closed via §E 2026-05-12** (CI still uses deterministic simulated audit per §93 R1 lock; manual evidence in `docs/93-real-lisa-evidence.md`)
- WeCom-protocol P0 enforcement (every-turn unread inbox check) deferred to §94

See `.rll/PLAN.md` §90-§94 for the trust-coding closed-loop arc detail.

---

## 10. v0.7.0 mechanical enforcement (§122/§123/§127/§125)

v0.7.0 advances trust-coding from "mechanism exists" to "mechanical enforcement at every gate boundary". Four new sub-slices add cli surface:

### 10.1 `ralph-lisa task` subcommand (§122/§123)

Open a sub-slice with explicit user acknowledgement before R2 [CODE]:

```bash
# Open the task — creates draft capability artifact (acked=false)
ralph-lisa task new my-slice-slug

# (Optional) Detect stack + populate testharness combos
ralph-lisa task capability assess

# (Optional) Pin pending-install artifacts for tiers that need extra setup
ralph-lisa task capability ack-install --tier integration

# (Required before R2 [CODE]) Flip acked=true via user signature
ralph-lisa task capability ack-user --signature "<user-context-string>"

# Inspect current state
ralph-lisa task capability show
```

The acked=false → R2 [CODE] policy block is mechanical; bypass requires explicit user signature in `.dual-agent/task-install-consent.jsonl`. If Ralph submits [CODE] without ack-user, policy rejects with `task-capability-not-acked`.

### 10.2 Complexity judge + verify (§123 — required in R1 [PLAN])

Each sub-slice's R1 [PLAN] body must include the complexity-judge JSON output. Pre-submit verify gate ensures plan table covers high-confidence tier suggestions.

```bash
# Layer 1: LLM-primary judgement artifact (cached by tuple (mode, model_id, prompt_template_hash, input_hash))
ralph-lisa task complexity-judge --slice my-slice-slug --mode heuristic --json
# → writes .dual-agent/complexity-judge/<slice>.json
# → mode options: llm (default; needs API key) / heuristic / off

# Layer 2: deterministic hard gate (run before submit)
ralph-lisa task complexity-verify --slice my-slice-slug --json
# → { ok: true } gates submit; ok:false blocks
# → checks: schema / input_hash freshness / canonical_tier_ids whitelist
#           high-conf accepted-or-acked-rejected / Required 5-col coverage / heuristic sanity

# Layer 3 (Lisa): she reruns the same judge with same prompt_template_hash for independent baseline;
# high-conf differences vs your accept+reject set → mechanical [NEEDS_WORK]
```

**Test plan row IDs must use `C\d+` prefix** (carry-forward 19) — `cli/src/complexity-verify.ts:281` regex hard-codes `^\|\s*C\d+\s*\|`. Other prefixes (P/T/X) silently drop rows from extractPlanTable.

If complexity-judge flags a high-confidence tier you don't want to include, either add it to the 5-col Required table OR explicitly reject via the consent ledger:

```bash
ralph-lisa task capability ack-downgrade --tier integration \
  --consent "2026-MM-DD <reason-with-'downgrade'-keyword>"
```

### 10.3 Phase-gate (§125)

`ralph-lisa phase-gate --enter <phase-id> [--json]` validates phase transitions and runs the phase's required-tier cascade via real `runTierCascade`.

```bash
# Inspect runtime phase pointer
cat .dual-agent/phase-state.json
# { "current_phase": "design" }

# Transition: design → tests-only (after R1 [PLAN] PASS)
ralph-lisa phase-gate --enter tests-only --json
# Validates transition; runs phase.required_tiers cascade via testTiers/testHarness.tests in .ralph-lisa.json
# Exit 0 + state advanced + .dual-agent/phase-transition.json written
# Exit 1 → state preserved + repair-inbox entry (§79 loopback)
```

Allowed transition graph:
- `null → design`
- `design → tests-only`
- `tests-only → impl`
- `impl → fix` (Lisa narrow) OR `impl → consensus` (no narrow)
- `fix → impl` (re-enter for further narrows) OR `fix → consensus`
- `consensus` is terminal

**Fail-closed precondition**: if `gate-manifest.json` says a phase requires non-smoke tier (e.g. `unit`) but `.ralph-lisa.json` has no matching testTiers/testHarness entry → exit 1 + state NOT advanced.

The tracked `gate-manifest.json` is **never mutated** at runtime — declarative phase definitions only. Runtime current_phase lives in `.dual-agent/phase-state.json` (state dir, not version controlled).

### 10.4 Smoke-results mandatory (§125 Lisa R1 B3)

When a phase's required_tiers includes `smoke`, phase-gate writes `.dual-agent/smoke-results.md` even when `RL_SMOKE_CMD` is absent (SKIPPED row with reason — NOT silent no-op). Lisa's preset audit fires `smoke-results-missing` (warning-level §125; mechanical block deferred to §124) if the file is absent after a smoke-tier run.

### 10.5 Testharness cleanup discipline (§127 — testharness writers must spec)

When writing test fixtures that spawn subprocesses, tmux sessions, or daemons, **always** use `tempProject({ tmuxSessionName, daemonPids })` from `cli/src/test-lib/temp-project.ts` so cleanup is automatic. The mutable handle lets you record session/PID names after spawn:

```ts
import { tempProject } from '../test-lib/temp-project.js';

const h = tempProject({});
// Spawn first, then record (post-creation mutation supported)
const sessionName = `rll-test-tmp-${process.pid}-foo`;
spawnSync('tmux', ['new-session', '-d', '-s', sessionName]);
h.tmuxSessionName = sessionName;
h.daemonPids = [childProc.pid];
// cleanup() SIGTERM→500ms→SIGKILL + defensive descendant sweep + rm tmpDir
h.cleanup();
```

Cleanup contract (Lisa R1 B1/B3/R4 B7/R9 B12):
- `cleanup()` reads `handle.tmuxSessionName` / `handle.daemonPids` at call time (NOT initial capture)
- SIGTERM → 500ms bounded wait → SIGKILL if still alive
- ESRCH (already exited) and EPERM (other-user proc) tolerated; never throws
- **Never** kills `process.pid` or `process.ppid` (self/parent exclusion)
- Defensive descendant sweep: untracked processes whose cmdline contains `h.dir` AND whose parent chain includes test pid → also killed
- Zombie-aware liveness check (filters `Z` state to avoid false-alive when parent hasn't reaped)

Preset writers: add an optional `teardown` field to your preset JSON so `loadPresetByNameWithDiagnostics()` won't warn on missing cleanup:

```json
{
  "stack": "cli",
  "changeType": "cmd",
  "requiredTiers": ["unit", "functional"],
  "teardown": {
    "kill_tmux_session_pattern": "rll-test-tmp-${process.pid}-*",
    "kill_child_process_patterns": ["watcher.sh", "watchdog.sh"],
    "defensive_pgrep_arg": "<tmpdir>"
  },
  "perTierConfig": { ... }
}
```

Spawn-class presets (`requiredTiers` includes `functional`/`integration` OR cmd contains `spawn|tmux|daemon`) missing `teardown` → diagnostics warning. Mechanical block deferred to §124 narrow expansion.

### 10.6 Operator end-of-slice CONSENSUS rule (carry-forward 18)

**PLAN-phase [PASS] is NOT consensus-eligible.** Lisa returning [PASS] on your R1 [PLAN] means "proceed to R2 [CODE]", not "slice done". Sending [CONSENSUS] there triggers §70 post-CONSENSUS cascade against unshipped test files → loopback fail.

Only submit [CONSENSUS] when Lisa's [PASS] explicitly signals end-of-slice (e.g. "Ralph can proceed to mutual [CONSENSUS]" / "Ready for CONSENSUS"). For PLAN-phase or tests-only-phase PASS, proceed directly to the next round's CODE/FIX submission without sending [CONSENSUS].

### 10.7 Telemetry consent (§103)

`ralph-lisa init --telemetry <yes|no|ask>` controls anonymous usage telemetry. Default is deny when flag absent; `ask` prompts interactively. Stored at `~/.config/ralph-lisa/telemetry.json`.
