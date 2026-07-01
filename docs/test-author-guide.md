# Test Author Guide — RLL Test Harness (v0.9.3+)

> Audience: Engineers + AI agents (Ralph, Lisa, test-runner subagent) authoring
> test macros and specs against the RLL test harness.
> Version baseline: cli `ralph-lisa-loop@0.9.3` (skills §171 + §173 shipped,
> subagent §184 shipped, fixture pair §172 dogfooded).

This guide is the single source for **how to write test macros (CLI/terminal)
and specs (browser)** that the test harness can run reliably. It bundles
hard-won lessons from §171→§184 dogfooding so you don't repeat them.

> ## ⛔ DO NOT run `ralph-lisa init` to do testing
>
> **`ralph-lisa init` is DESTRUCTIVE.** It runs `fs.rmSync('.dual-agent/',
> {recursive:true, force:true})` — deleting ALL session state: round history,
> 2000+ harness-results review files, token-usage logs, complexity-judge
> artifacts, test-execution-log. It only prints a one-line warning, NO
> confirmation prompt (as of v0.9.3).
>
> **Testing does NOT need init.** The skill commands (`ralph-lisa skill
> wezterm-test`, `skill playwright-test`, `skill list-fixtures`) and the
> test-runner subagent work from the globally-installed binary + user-level
> `~/.claude/agents/test-runner.md` — independent of any `.dual-agent/` state.
>
> Only run `ralph-lisa init` when you intend to start a **fresh dual-agent
> RLL collaboration** (Ralph-codes + Lisa-reviews) in a directory. If that
> directory has prior RLL history, **back it up first**:
> `cp -r .dual-agent .dual-agent.bak` before init.
>
> To do testing: just author a fixture JSON anywhere and pass its absolute
> path to the skill command. Zero init required. See [Workflow recipes](#workflow-recipes).

## Table of Contents

1. [System Overview](#system-overview)
2. [Three Tools You Have](#three-tools-you-have)
3. [Wezterm macros — CLI/terminal testing](#wezterm-macros)
4. [Playwright specs — browser/web testing](#playwright-specs)
5. [Known issues + pitfall avoidance](#known-issues)
6. [Workflow recipes](#workflow-recipes)
7. [When NOT to use this harness](#when-not-to-use)
8. [Quick reference](#quick-reference)

---

## System Overview

```
You (or Ralph)
    │
    ├── 1. Write JSON fixture (macro for CLI, spec for browser)
    │
    ├── 2. Choose dispatch path:
    │       a) Direct CLI: `ralph-lisa skill <wezterm-test|playwright-test> --macro|--spec X.json`
    │       b) Via subagent: `Agent({subagent_type: "test-runner", prompt: "..."})`
    │
    └── 3. Receive 6-field report or JSON result
            ├── RESULT: pass|fail|partial
            ├── STEPS:  N/total green
            ├── TIME:   wall_seconds
            ├── FAIL_REASON: ...
            ├── ARTIFACT: screenshot/trace path
            └── NEXT: recommendation
```

**What runs underneath:**
- §171 wezterm-test-skill → drives real wezterm pane via `wezterm cli` (shared mux + pane-id pattern)
- §173 playwright-test-skill → drives real Chromium via dynamically-loaded `playwright` package
- Both honor `try/finally` cleanup so panes/browsers are torn down on every exit path

---

## Three Tools You Have

### Tool 1: Macros (`.macro.json`) — for terminal/CLI testing

5 step types ONLY:

| Type | Required fields | What it does |
|---|---|---|
| `spawn` | `name`, `cwd?` | open new wezterm pane in cwd, register under name |
| `send` | `target`, `text` | type text into pane (use `\n` for Enter) |
| `wait-for` | `target`, `text`, `timeout_ms?` (default 3000) | poll pane text every 50ms until substring found OR timeout |
| `assert-contains` | `target`, `text` | one-shot substring check |
| `kill` | `target` | close pane (cleanup also auto-kills at end) |

### Tool 2: Specs (`.spec.json`) — for browser/web testing

6 step types ONLY:

| Type | Required fields | What it does |
|---|---|---|
| `navigate` | `url` | page.goto(url, wait_until=load) |
| `fill` | `selector`, `text` | page.fill(selector, text) |
| `click` | `selector` | page.click(selector) |
| `wait-for-text` | `selector`, `text`, `timeout_ms?` (default 3000) | poll page.textContent every 50ms |
| `assert-text` | `selector`, `text` | one-shot substring check on textContent |
| `screenshot` | `path` | page.screenshot({path}) — absolute path |

### Tool 3: test-runner subagent

When test output would pollute main agent context (>100 lines) OR you want intent-to-fixture routing:

```typescript
Agent({
  subagent_type: "test-runner",
  prompt: "Verify margay-cli init creates expected skeleton. Use fixture at .claude/skill-fixtures/margay-init.macro.json with RL_WEZTERM_SKILL_REAL=1."
})
```

Subagent constraints (mechanically pinned):
- Tools: Bash + Read + Grep only (NO Edit/Write — route-only contract)
- Body explicitly forbids generating new specs/macros
- Returns the 6-field report format always

---

## Wezterm macros

### Required fixture shape

```json
{
  "name": "your-macro-name",
  "description": "what this verifies and why",
  "steps": [
    { "type": "spawn", "name": "agent", "cwd": "/tmp/work-dir" },
    { "type": "send", "target": "agent", "text": "command\n" },
    { "type": "wait-for", "target": "agent", "text": "anchor", "timeout_ms": 30000 },
    { "type": "assert-contains", "target": "agent", "text": "expected" },
    { "type": "kill", "target": "agent" }
  ]
}
```

### Running

```bash
RL_WEZTERM_SKILL_REAL=1 node cli/dist/cli.js skill wezterm-test --macro path.macro.json --json
```

(Or via subagent: see test-runner section above.)

### Schema gotchas

- `spawn.cwd` must exist BEFORE the macro runs. `mkdir -p /tmp/work-dir` first.
- `send.text` is delivered char-by-char to the pane via `wezterm cli send-text --no-paste`. Use `\n` for Enter.
- `wait-for.text` is searched as **literal substring** in pane scrollback (NOT regex).
- All step types EXCEPT `spawn` and `kill` need `target` matching a previous `spawn.name`.

### Authoring rules (the 11 hard-learned)

#### R1. Real > Mock for integration tests

If you're testing how a real CLI behaves, drive the real binary. Mock backends miss
contract drift. We learned this in §57 (mocking PostHog cost us a week of fixing
mock-only assumptions when real Cloud was different).

#### R2. Stable anchors, not banner text

Banner text drifts with tool versions. ❌ DON'T:
```json
{ "type": "wait-for", "target": "claude", "text": "How can I help" }
```
Claude Code 2.x changed the banner; macro broke (see §172 D1 dogfood retry 1).

✅ DO:
```json
{ "type": "send", "target": "claude", "text": "claude -p '...' && printf 'D1''-DONE\\n'\n" },
{ "type": "wait-for", "target": "claude", "text": "D1-DONE", "timeout_ms": 600000 }
```
Use YOUR OWN marker emitted after the work completes.

#### R3. Marker isolation — keep wait-for substring out of typed cmd

CRITICAL: `wezterm cli get-text` returns the entire pane scrollback INCLUDING the
typed command line. If your wait-for substring appears in the typed text, the
macro completes in milliseconds before any work runs.

❌ DON'T:
```json
{ "type": "send", "target": "x", "text": "claude ... && echo DONE\n" },
{ "type": "wait-for", "target": "x", "text": "DONE" }
```
"DONE" appears in the typed line "echo DONE" → wait-for resolves instantly.

✅ DO — shell concat trick:
```json
{ "type": "send", "target": "x", "text": "claude ... && printf 'D''ONE\\n'\n" },
{ "type": "wait-for", "target": "x", "text": "DONE" }
```
Typed text contains `'D''ONE'` (NOT contiguous "DONE"); only the printf OUTPUT
contains "DONE". (See §172 D1 dogfood retry 2.)

Alternative — shell variable indirection:
```bash
M=$(printf 'D''ONE'); claude ...; echo "$M"
```

#### R4. Realistic timeouts

- Real CLI agent (claude/codex) build: 30s–10min for D1-class tasks. Default `timeout_ms: 3000` is **always wrong** for agent work.
- Shell command: 5–30s usually fine.
- Network call: 5–10s.

If you don't know, set generous (900000ms = 15min) for agent work. wait-for polls every 50ms and exits as soon as match found, so high ceiling is free.

#### R5. ANSI color pollution

CLIs print color codes (`\033[32m`). They appear in `get-text` output. wait-for
substring may not match `OK` if pane has `\033[32mOK\033[0m`.

Solutions:
- Set `NO_COLOR=1` env before launching: `NO_COLOR=1 claude ...`
- Or pass `--no-color` flag if tool supports it
- Or use shorter unique substring that color codes don't break

#### R6. cwd discipline

`spawn.cwd` directory MUST exist before macro runs. If you're running D1-style
build-from-scratch, do `mkdir -p /tmp/your-build-dir` BEFORE invoking the macro.

#### R7. Cleanup is automatic — but kill explicitly anyway

Every spawned pane is killed at macro end via try/finally (§171 cleanup invariant).
But explicit `kill` step is good documentation. Order: spawn → ... → kill.

#### R8. One pane per test concern

Don't try to drive 5 different things in one pane. Spawn separate panes per
target system. The macro runner handles them sequentially.

#### R9. Don't test through internal mocks

Inside a macro you may need to mock external services (e.g. PostHog Cloud). DO
that at the system boundary (env vars, fixture-server URLs), NOT by patching
internal modules. Mocked internals == coupled tests.

#### R10. Test names = behavior spec

Macro `name` field should describe behavior, not implementation:
- ✅ `margay-init-creates-skeleton`
- ❌ `margay-init-test`
- ❌ `test-margay-init-call-flow`

#### R11. Schema-content fidelity to source-of-truth

If your macro tests behavior described in a spec doc (e.g. `docs/§159-3cli-macro-dev-tasks-design.md`), quote the spec verbatim in the prompt. Don't paraphrase — fixtures drift from intent (§172 D3 narrow B caught this).

---

## Playwright specs

### Required fixture shape

```json
{
  "name": "your-spec-name",
  "description": "what UI behavior this verifies",
  "steps": [
    { "type": "navigate", "url": "http://localhost:3001" },
    { "type": "fill", "selector": "[data-testid='input']", "text": "value" },
    { "type": "click", "selector": "[data-testid='submit']" },
    { "type": "wait-for-text", "selector": "[data-testid='result']", "text": "expected", "timeout_ms": 5000 },
    { "type": "assert-text", "selector": "[data-testid='final-state']", "text": "done" },
    { "type": "screenshot", "path": "/tmp/result.png" }
  ]
}
```

### Running

```bash
RL_PLAYWRIGHT_SKILL_REAL=1 node cli/dist/cli.js skill playwright-test --spec path.spec.json --json
```

If playwright not installed in cli runtime: cli exits with code 2 + install hint.
For force-test the unavailable path: `RL_PLAYWRIGHT_FORCE_UNAVAILABLE=1`.

### Authoring rules

#### P1. Selector strategy (locked priority)

Always prefer in this order:

1. `[data-testid='X']` — explicit test contract, immune to design changes
2. `[role='button']`, `[aria-label='Submit']` — accessibility-anchored, decent stability
3. Tag + visible text via `text=` — `text=Login` works for buttons
4. CSS class selectors — ❌ AVOID; rebrand breaks tests

If the system-under-test has no `data-testid`s, lobby the dev team to add them.
It's a one-line change per element and pays back forever.

#### P2. wait-for-text before assert-text

Web pages have async loading. Always `wait-for-text` (polled) before
`assert-text` (one-shot):

```json
{ "type": "wait-for-text", "selector": "ul.todos", "text": "buy milk", "timeout_ms": 5000 },
{ "type": "assert-text", "selector": "ul.todos li", "text": "buy milk" }
```

If you only `assert-text` without prior wait, you'll get flaky tests when
the page hasn't rendered yet.

#### P3. Bounded realistic timeouts

- Static page: 1–3s
- API roundtrip: 3–5s
- Slow third-party: 8–10s
- Never 30000ms (overshoot blocks pipeline)

#### P4. screenshot for diagnostics, not assertion

Use `screenshot` to capture state on success AND failure for later inspection.
Don't assert ON the screenshot (no visual regression here yet).

```json
{ "type": "screenshot", "path": "/tmp/before-action.png" },
{ "type": "click", "selector": "[data-testid='btn']" },
{ "type": "screenshot", "path": "/tmp/after-action.png" }
```

#### P5. Cleanup is automatic

Browser closed via `try/finally` even on assert-text fail. Process tree teardown
verified via bound-polled `ps` count (no orphan headless_shell processes left).

#### P6. URL discipline

Don't hardcode `http://localhost:3001` if the port is configurable. Use env or
prefix the spec with a server-readiness check via a separate setup macro.

---

## Known issues

### Issue 1: Claude Code 2.x banner drift

**Symptom**: macro waits 30s for "How can I help" and times out.
**Cause**: Claude Code 2.1.144+ uses different banner text.
**Fix**: switch from interactive REPL (`claude\n` + banner-wait) to print mode
(`claude -p '<prompt>'` + your own marker). See §172 D1 macro retry 1.

### Issue 2: wait-for marker matches typed cmd

**Symptom**: macro completes in <100ms despite needing minutes of actual work.
**Cause**: marker substring appears in `send.text` literal.
**Fix**: Shell concat trick (R3 above). See §172 D1 macro retry 2.

### Issue 3: Pane count grows over time

**Symptom**: many leftover wezterm panes after multiple test runs.
**Cause**: macro crash before cleanup, OR `spawn` succeeded but later step
thrown without try/finally honoring.
**Fix**: §171 + §182 already implement try/finally + module-level live-handle
registry + signal handlers. If you still see leftover panes, file a §182-followup
bug; don't manually `wezterm cli kill-pane` as a workaround.

### Issue 4: Chromium child processes don't reap immediately

**Symptom**: `ps -ef | grep chromium` shows orphan processes ~10s after spec finishes.
**Cause**: chromium teardown is asynchronous — `browser.close()` returns before
process tree is reaped.
**Fix**: Tests that check orphan-process count must bound-poll (e.g. wait up to
10s for count to return to baseline). See §173 R6 narrow.

### Issue 5: macOS pty pool exhaustion (§181 R8-R9 root cause)

**Symptom**: `wezterm cli spawn` fails with "Device not configured" or hangs.
**Cause**: macOS `kern.tty.ptmx_max=511` exhausted by accumulated zombie tmux
sessions from leaky test runs.
**Fix**: §182 ships Layer A (live-handle registry) + Layer B (ESRCH-only dead-pid
sweep) in `cli/src/test-lib/temp-project.ts`. If you see this anyway, check
`lsof -nP /dev/ptmx | wc -l` — should be <50 in healthy state.

### Issue 6: §137 log-cite mismatch when submitting CODE/FIX

**Symptom**: `Submission BLOCKED by policy: §149 log-cite mismatch`.
**Cause**: Test-Results claim (`passed=N failed=M total=K`) doesn't match
recent test-execution-log entry within 10min.
**Fix**: Run `ralph-lisa gate` before submit (auto-appends fresh log entry),
then cite the gate's exact numbers in your submit body.

### Issue 8: `ralph-lisa init` silently wipes `.dual-agent/` history

**Symptom**: after running `ralph-lisa init` in a directory that had prior RLL
usage, all round history / harness-results / logs are gone.
**Cause**: `cmdInit` (commands.ts:1542) does `fs.rmSync('.dual-agent/',
{recursive,force})` unconditionally. The "Warning: Existing session will be
overwritten" line prints but there is NO confirmation prompt (as of v0.9.3).
**Fix / avoidance**:
- Never run `init` to do testing — testing needs no `.dual-agent/` state.
- Before any intentional `init` on a dir with history: `cp -r .dual-agent .dual-agent.bak`.
- A `--force`-gated confirmation prompt is planned (see §185-pending).

### Issue 7: `--test-name-pattern` regex char-class trips §149 C19

**Symptom**: §149 C19 drift detector fails with "pattern not in source file".
**Cause**: §149 C19 uses literal-substring matching (`src.includes(pattern)`),
not regex. So `§143 C[2389]` doesn't match describe text like `§143 C2 P3-bump`.
**Fix**: Use literal substring patterns: `§143 C` (matches all §143 describes)
or `§143 C2` (matches one specific).

---

## Workflow recipes

### Recipe A: Test a CLI agent build flow (D1-style)

```bash
# 1. Setup
mkdir -p /tmp/feature-build-test

# 2. Write macro
cat > /tmp/feature-macro.json <<EOF
{
  "name": "feature-build-flow",
  "description": "Verify agent X scaffolds feature Y per spec Z",
  "steps": [
    { "type": "spawn", "name": "agent", "cwd": "/tmp/feature-build-test" },
    { "type": "send", "target": "agent", "text": "claude --dangerously-skip-permissions -p 'Build X per spec Z. Files: a.js, b.html, c.sh' && printf 'BUILD''_DONE\\n'\n" },
    { "type": "wait-for", "target": "agent", "text": "BUILD_DONE", "timeout_ms": 900000 },
    { "type": "assert-contains", "target": "agent", "text": "BUILD_DONE" },
    { "type": "kill", "target": "agent" }
  ]
}
EOF

# 3. Run
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test --macro /tmp/feature-macro.json --json

# 4. Verify side-effects
ls /tmp/feature-build-test/
```

### Recipe B: Test a web frontend (D1-verify style)

```bash
# 1. Start server (separate process)
PORT=3001 node server.js &
SERVER_PID=$!
sleep 2

# 2. Write spec
cat > /tmp/feature-verify.spec.json <<EOF
{
  "name": "feature-frontend-verify",
  "description": "Verify CRUD UI works against server",
  "steps": [
    { "type": "navigate", "url": "http://localhost:3001" },
    { "type": "fill", "selector": "[data-testid='input']", "text": "test value" },
    { "type": "click", "selector": "[data-testid='submit']" },
    { "type": "wait-for-text", "selector": "[data-testid='result']", "text": "test value", "timeout_ms": 5000 },
    { "type": "assert-text", "selector": "[data-testid='result']", "text": "test value" },
    { "type": "screenshot", "path": "/tmp/feature-result.png" }
  ]
}
EOF

# 3. Run
RL_PLAYWRIGHT_SKILL_REAL=1 ralph-lisa skill playwright-test --spec /tmp/feature-verify.spec.json --json

# 4. Teardown
kill $SERVER_PID
```

### Recipe C: Test interactive REPL flow

```json
{
  "name": "psql-query-flow",
  "steps": [
    { "type": "spawn", "name": "db", "cwd": "/tmp" },
    { "type": "send", "target": "db", "text": "psql -U postgres -d testdb\n" },
    { "type": "wait-for", "target": "db", "text": "testdb=#", "timeout_ms": 5000 },

    { "type": "send", "target": "db", "text": "SELECT COUNT(*) FROM users;\n" },
    { "type": "wait-for", "target": "db", "text": "testdb=#", "timeout_ms": 5000 },
    { "type": "assert-contains", "target": "db", "text": "count" },

    { "type": "send", "target": "db", "text": "\\q\n" },
    { "type": "kill", "target": "db" }
  ]
}
```

Key: every send is followed by wait-for `testdb=#` (the psql prompt) before
next send. This is the standard REPL pattern.

### Recipe D: Combine macro (setup) + spec (verify)

```bash
# 1. Macro builds the artifact
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test --macro setup.macro.json --json

# 2. Start the artifact
PORT=3001 node /tmp/build/server.js &
sleep 2

# 3. Spec verifies the artifact
RL_PLAYWRIGHT_SKILL_REAL=1 ralph-lisa skill playwright-test --spec verify.spec.json --json

# 4. Cleanup
kill %1
```

Or wrap via test-runner subagent:

```typescript
Agent({
  subagent_type: "test-runner",
  prompt: "Run setup.macro.json. Then start the resulting server on PORT=3001. Then run verify.spec.json. Aggregate results."
})
```

### Recipe E: Develop a feature → auto-launch the test harness

The goal: you write/develop a feature and the test harness runs automatically
— no manual "now go test it" step. Two mechanisms, pick by how you develop.

#### E.1 — Developing via the RLL dual-agent loop (Ralph codes / Lisa reviews)

Use **§150 smoke-auto-loop**. Set `RL_SMOKE_CMD` and every Ralph `[CODE]`/`[FIX]`
submit auto-runs the test harness after propagation:

```bash
# 1. TDD-first — author the fixture BEFORE/with the feature
vim /abs/path/feature.spec.json     # or .macro.json

# 2. Point RL_SMOKE_CMD at it
export RL_SMOKE_CMD="env RL_PLAYWRIGHT_SKILL_REAL=1 ralph-lisa skill playwright-test --spec /abs/path/feature.spec.json"
#   CLI feature instead:
#   export RL_SMOKE_CMD="env RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test --macro /abs/path/feature.macro.json"

# 3. Start the loop
ralph-lisa auto --engine
```

Per-round behavior (automatic):
1. Ralph submits `[CODE]`/`[FIX]`
2. §150 runs `RL_SMOKE_CMD` (the test harness)
3. On non-zero exit → failure JSON saved to `.dual-agent/smoke-failures/`;
   next Ralph submit auto-prepends `Smoke-Failure-Context` so the failure
   propagates into Ralph's next round
4. 3 consecutive smoke fails → `smoke-deadlock.txt` + WeCom `task_failed` alert
5. At mutual CONSENSUS, §70 cascade re-runs the full PLAN test table

Opt-out: `RL_SMOKE_AUTO_LOOP_OFF=1`. Budget resets on a passing run or
`ralph-lisa smoke-fail clear`.

#### E.2 — Developing in plain Claude Code (no dual-agent loop)

Use a Claude Code **PostToolUse hook**. In `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "env RL_PLAYWRIGHT_SKILL_REAL=1 ralph-lisa skill playwright-test --spec /abs/path/feature.spec.json --json 2>&1 | tail -15"
      }
    ]
  }
}
```

Every time Claude edits or writes a file, the hook fires the test harness and
feeds the result back into Claude's context. Keep the matcher narrow (e.g.
restrict to a feature directory) so unrelated edits don't trigger slow runs.

#### E.3 — Recommended combined setup

```
1. TDD-first: author the fixture first (Recipe A/B above)
2. RL_SMOKE_CMD → that fixture          ← every dev round auto-tests
3. ralph-lisa auto --engine             ← Ralph codes, Lisa reviews
4. §70 cascade at CONSENSUS             ← full PLAN test table on close
5. test-runner subagent for deep debug  ← isolates noisy failures from main context
```

This gives a true "develop → auto-test → fail-context-fed-back" closed loop —
you never manually invoke the harness; failures surface in the next round
automatically.

> Note: `RL_SMOKE_CMD` runs the harness from the loop's working dir. Use
> ABSOLUTE fixture paths. If the smoke command spawns wezterm/Chromium, the
> §171/§173 try/finally cleanup + §182 registry handle teardown — no leak.

---

## When NOT to use this harness

This harness is for **text-driven, sequential, deterministic** testing. It does NOT
handle well:

| Scenario | Why not | Alternative |
|---|---|---|
| Full-screen TUIs (vim/htop/ncurses) | screen redraws break substring match | `pyte` + `pexpect` |
| High-frequency game-like input | 50ms poll interval too slow | game test framework |
| Binary IO (e.g. piping bytes) | `get-text` returns rendered text | direct subprocess + `stdin/stdout.write()` |
| Visual regression / pixel-diff | `screenshot` is for diagnostics only | playwright snapshot testing OR Applitools |
| Massive parallelism (100+ panes) | one macro = one pane at a time | k6 / locust / artillery |
| Race-sensitive flake | substring match doesn't capture timing | use deterministic mock |

If your test fits more than one of those categories, this harness is the wrong tool.
Pick a domain-specific test framework instead.

---

## Quick reference

### File extensions

- Wezterm macros: `<name>.macro.json` (convention; any .json works)
- Playwright specs: `<name>.spec.json`
- Store under: `cli/templates/skill-fixtures/` (shipped) OR `.claude/skill-fixtures/` (project) OR anywhere — paths are absolute

### Environment vars (must remember)

| Var | Purpose |
|---|---|
| `RL_WEZTERM_SKILL_REAL=1` | Enable real wezterm (off = test pre-conditions only) |
| `RL_PLAYWRIGHT_SKILL_REAL=1` | Enable real Chromium |
| `RL_PLAYWRIGHT_FORCE_UNAVAILABLE=1` | Simulate missing playwright module (for exit-code-2 test path) |
| `NO_COLOR=1` | Strip ANSI codes from CLI output (paired with macro `send.text`) |

### Output format (6 fields locked by §184 test-runner)

```
RESULT: pass|fail|partial
STEPS: <N>/<total> green
TIME: <wall_seconds>s
FAIL_REASON: <one line; empty if pass>
ARTIFACT: <screenshot path | trace path | null>
NEXT: <recommendation, one line>
```

### Files to read for deeper context

- `cli/templates/skill-fixtures/d1-todo-app.macro.json` — canonical wezterm example (post-fix)
- `cli/templates/skill-fixtures/d1-todo-app.spec.json` — canonical playwright example
- `cli/templates/skill-fixtures/d3-codebase-extend.macro.json` — interactive REPL example
- `cli/templates/agents/test-runner.md` — subagent contract
- `cli/src/wezterm-test-skill.ts` — macro runner implementation
- `cli/src/playwright-test-skill.ts` — spec runner implementation
- `docs/§159-3cli-macro-dev-tasks-design.md` — original D1/D3 task design
- `docs/playwright-skill-pivot-design.md` — playwright skill design rationale

### Common command snippets

```bash
# Pre-flight check
lsof -nP /dev/ptmx | wc -l                          # pty pool (should be <50)
tmux list-sessions                                   # confirm no rll-test-tmp-* zombies
wezterm cli --prefer-mux list                        # confirm no leaked panes

# Run macro
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test --macro X.json --json

# Run spec
RL_PLAYWRIGHT_SKILL_REAL=1 ralph-lisa skill playwright-test --spec Y.json --json

# List shipped fixtures
ralph-lisa skill list-fixtures --json

# Cleanup leftover sessions (if you see zombies)
tmux list-sessions | grep rll-test-tmp | awk -F: '{print $1}' | xargs -I{} tmux kill-session -t {}
```

---

## Maintenance

- This guide will be revised as new pitfalls are discovered. See git log for `docs/test-author-guide.md` changes.
- Issues / questions: log a [PLAN] in current dual-agent slice with `Task type: code-task` and reference `docs/test-author-guide.md`.
- Source of truth for skill contracts: `cli/src/wezterm-test-skill.ts` + `cli/src/playwright-test-skill.ts` (the code wins if doc drifts).
