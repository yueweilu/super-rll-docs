[English](../en/faq.md) | [日本語](../ja/faq.md) | [中文](../zh-CN/faq.md)

# Frequently Asked Questions

**How to use this page**: jump to "where I'm stuck right now". Each entry stands alone — you don't need to read top-to-bottom.

---

## Installation

### npm install fails with permission errors

Use nvm (recommended) or `--prefix`:

```bash
nvm install 18 && nvm use 18 && npm i -g ralph-lisa-loop
# or
npm i -g ralph-lisa-loop --prefix ~/.npm-global
```

### Which Node version?

Node.js ≥ 18. Check with `node --version`.

### How to install tmux and fswatch?

```bash
# macOS
brew install tmux fswatch
# Linux (Debian/Ubuntu)
apt install tmux inotify-tools
```

Only `--auto` mode needs these. Manual mode / `--engine` mode don't.

### `ralph-lisa doctor` reports missing things

Its output tells you exactly what's missing + how to install. In CI, use `--strict` (exit 1 on missing):

```bash
ralph-lisa doctor
ralph-lisa doctor --strict
```

---

## Startup modes

### auto / engine / start — which one?

| Mode | When | Command |
|---|---|---|
| `ralph-lisa start --auto` | macOS / Linux desktop with tmux | most common, runs until deadlock / CONSENSUS |
| `ralph-lisa auto --engine` | Windows / IDE / remote / containers | no tmux dependency, natively cross-platform |
| `ralph-lisa start` | learning / debug / hands-on | manually advance each round |

`--auto` is the same as `start --auto`. See [`guide.md`](./guide.md).

### Must I use Claude Code for Ralph and Codex for Lisa?

**Strongly recommended**. Each model has different blind spots — Claude Code might skip error handling in long context, Codex prefers abstraction but catches edge cases. Cross-checking covers what a single model misses.

In theory Lisa can be any agent that can read/write files + run shell, but `CODEX.md` is a Codex-specific role prompt that would need rewriting.

### Can I use the same model for both Ralph and Lisa?

Possible, but bad. With identical models, both agents share blind spots — effectively self-grading. **Not recommended for production**.

### `--minimal` vs default init?

- `ralph-lisa init` (full): writes CLAUDE.md / CODEX.md / commands/ / skills/ / `.dual-agent/`
- `ralph-lisa init --minimal`: only `.dual-agent/`, assuming your Claude Code plugin or Codex global config already provides role definitions

---

## Task-type fast-path (§207)

### "I'm just reviewing a design doc. Why am I forced to write tests?"

Use `--type review-task`:

```bash
ralph-lisa next-step "review-the-design" --type review-task
```

Skips the full TDD ceremony (auto-tdd-plan / 5-col test table / tests-only round). See [`../non-coding-task-quickstart.md`](../non-coding-task-quickstart.md).

### Which of the 4 task types should I pick?

- **`code-task`** (default): touching `cli/**` or any source code → full TDD
- **`review-task`**: pure review, writing report to `docs/**` or `.dual-agent/**`, no code
- **`doc-task`**: writing/editing docs (`docs/**`, top-level `*.md`, CLAUDE.md / CODEX.md / README.md)
- **`process-task`**: editing `.rll/PLAN.md` / `CLAUDE.md` / `CODEX.md` etc. (**cannot** touch `cli/package.json`)

Rule of thumb: **touching anything under `cli/**`? code-task**.

### "Simple tasks keep getting stuck on policy gates — how do I unblock?"

**Fastest path** (v0.9.14+): `--mode simple --user-signature` to skip the ceremony:

```bash
ralph-lisa next-step "fix-typo" --mode simple --user-signature "trivial-2026-05-26-simple-go"
```

`--mode simple` skips §128 clarify / §122 task-capability / §102 auto-TDD / §123 complexity-verify / §134 marker-plan-bound — the 5 most common "ceremony" rules. But §207 file whitelist / §149 attest / §144 Lisa verified / §70 cascade still enforce (trust-boundary lock by design).

**`--user-signature` is mandatory**: ≥10 chars + audit keyword (simple/efficiency-first/trivial/standard/strict/quality-first) OR ISO date. Ralph cannot self-fake.

**Or, more natural**: just run `ralph-lisa next-step "..."` with no flag — Ralph's first message will ask "A simple / B standard / C strict?", you reply A.

### "I opened a review-task but mid-slice I need to edit cli code, now what?"

**Don't force it through** — policy will instantly block with `task-type-file-mismatch`. Proper path:

1. Run the current review portion to clean [CONSENSUS] close
2. Open a new sub-slice: `ralph-lisa next-step "fix-x-from-review" --type code-task`
3. Full TDD on the code change

---

## Submit blocked — what now?

### `§149: must include Test-Process` / `Test-Cases` / `Test-Results`

Missing one of Ralph's three lines. Required even for pure doc/process tasks — but you can use `Skipped:` justification. See [`testing.md`](./testing.md) "Writing the test section" for the format.

### `Test Results contains unverified claims (no matching execution log entry)`

§137 verifier can't find a matching log entry. Common causes:

- Didn't run `quality-gate` in last 10 minutes / cmd string mismatched
- Prose has `12/12 pass` style numbers, parser sees them as independent claim with `cmd='?'` (never matches)
- Different prefix (`npm test` vs `npm test --prefix cli`)

Fix: run `ralph-lisa quality-gate` → submit immediately → `cmd="X"` exactly matches the jsonl cmd.

### `lisa-rerun-not-verified`

Lisa missing `Verified: <trusted-path>` or path isn't trusted. The 3 trusted categories:
- `.dual-agent/gate-results.{md,json}`
- `.dual-agent/harness-results/*`
- `.dual-agent/auto-tdd-plan-*.json`

`plan validate` does **not** write `gate-results.md`.

### `task-type-file-mismatch`

§207 file whitelist violation. See "Task-type fast-path" section above. **Cannot** bypass via `RL_POLICY_MODE=warn`; **no** `RL_TASK_TYPE_OFF` env exists.

### `clarify-not-completed`

§128: complex tasks (judged complex/expert) must go through R0 [CLARIFY]:

```bash
ralph-lisa clarify --start  # 5-stage grill
ralph-lisa clarify --commit --understanding "..." --covered "..." --negative-scope "..." --risks "..."
```

For simple tasks where you're confident: `ralph-lisa clarify --skip` (warning, no block).

### `task-capability-unacked`

§122: user must explicitly ack testing capability:

```bash
ralph-lisa task capability ack-user --signature "<token>"
```

Ralph cannot self-fake; trust-boundary locked.

### `phase-test-coverage-missing`

§145: you declared ≥2 phases but used a 5-col test table. Switch to 6-col with Phase column. See [`testing.md`](./testing.md) "Complex task" section.

### `doc-oracle-spec table missing`

doc-task PLAN / [FIX] must have a 5-col oracle table (separate from the test table):

```
| ID | Dimension | Verification Method | Pass Criteria | Required |
```

Dimension must be one of 9 canonicals: `data-accuracy` / `source-authority` / `source-freshness` / `logical-coherence` / `compliance-with-user-spec` / `ai-slop` / `style` / `topic-coverage` / `depth-detail`.

---

## RLL got stuck

### Watcher not responding / heartbeat stale

```bash
ralph-lisa doctor                      # check Watcher Health section
ralph-lisa daemon-health-check         # wecom-bot daemon status
cat .dual-agent/.watcher_heartbeat     # heartbeat timestamp
cat .dual-agent/watchdog.log | tail    # SIGKILL restarts?
```

Simplest fix: `ralph-lisa start --auto` to restart. State lives in `.dual-agent/`, restart is safe.

### 8 consecutive NEEDS_WORK, watcher auto-paused

Expected. Deadlock detection fires; waits for user. Look at `.dual-agent/review.md` Lisa narrows from the last 5+ rounds:

- Ralph really keeps fixing wrong → help Ralph read the code, give hints
- Wrong direction → `ralph-lisa scope-update` to adjust
- Lisa nitpicking → Ralph uses `[CHALLENGE]` to push back

Resume: let Ralph submit `[CHALLENGE]` or `[FIX]` to continue.

### Agent crashed mid-session

```bash
tmux ls                                # check session
ralph-lisa logs                        # see pane output
ralph-lisa force-turn ralph            # force-set turn if needed
```

In `auto --engine` mode: watcher embeds TurnCoordinator, usually pauses for user intervention on agent crash.

---

## CI / tests

### Tests pass locally, CI red

Common causes:

- CI shallow clone (`fetch-depth=1`) affects git-diff tests → fix CI workflow to `fetch-depth: 0`
- CI doesn't have Playwright / codex / other third-party CLIs → skip or mock those tests
- Local tmux env pollution (`RL_STATE_DIR` left from §184 tempProject) → fix: `tmux setenv -u RL_STATE_DIR && tmux setenv -u RL_SESSION_ID`

### Tests fail locally, CI green

Likely concurrent test pollution of `super-rll/.dual-agent/command-events.jsonl` (the snapshot-style tests; `§cmdRunLisa-isolation T2` is a known flake).

### Run a single test?

```bash
cd cli
node --test --test-name-pattern="MyCase" dist/test/foo.test.js
```

---

## Cost

### How much does a session cost?

| Component | Per round |
|---|---|
| Ralph (Claude Code) | ~$0.15–0.50 |
| Lisa (Codex) | ~$0.05–0.20 |
| **Per round total** | **~$0.20–0.70** |

Typical 10-15 rounds ≈ $3-10. Worst 25+ round deadlock ≈ $15-20.

### How to save tokens?

- **Split tasks small**: `ralph-lisa next-step "small-piece"` rather than one big step
- **Use `update-task` to redirect** rather than starting a new step from scratch
- **Set checkpoints**: `RL_CHECKPOINT_ROUNDS=5` pauses every 5 rounds for human review
- **Simple tasks use fast-path**: review/doc/process via `--type` skips TDD
- **Manual mode for debugging**: step through each agent's actions when needed

---

## Platform support

### Does it work on Windows?

**Yes**. `auto --engine` is natively cross-platform, no tmux / WSL needed:

```bash
ralph-lisa auto --engine --task "implement feature" --auto-approve
```

In Windows Terminal there's a dedicated dual-pane UI:

```bash
ralph-lisa auto --engine --task "..." --ui wt
```

`--ui wt` auto-detects Windows Terminal host; falls back to `--ui split` outside WT.

Legacy `ralph-lisa auto` (tmux mode) is still **unavailable** on native Windows; use WSL2 for tmux.

### Which Windows versions?

- **Windows 11**: full support
- **Windows 10 22H2**: full support (install Windows Terminal for `--ui wt`)
- Older Win10: untested

### Linux uses inotify-tools instead of fswatch

```bash
apt install tmux inotify-tools
```

---

## Architecture / design

### Difference from Ralph Wiggum Loop?

| Dimension | Ralph Wiggum Loop | Ralph-Lisa Loop |
|---|---|---|
| Agent count | 1 (self-loop) | 2 (dev + reviewer) |
| Validation | `<promise>` tag | Lisa's independent judgment + consensus |
| Review frequency | none | every round, mandatory |
| Bias | high (self-grading) | low (external review) |
| Best for | simple, well-defined tasks | complex, fuzzy tasks |

The two tools don't conflict; can coexist in the same project.

### Why not just use Claude Code?

A single agent both writes code and decides it's done = grading your own exam. RLL introduces:

- External review (Lisa's independent judgment)
- Mechanical gates (don't trust the model's self-evaluation)
- Bidirectional attest (prevents Lisa rubber-stamping)

Design rationale in [`../trustcoding-product-definition.md`](../trustcoding-product-definition.md).

### Will the two agents loop forever?

No. Three guards:

1. 5 rounds without consensus → `[OVERRIDE]` / `[HANDOFF]` escalation
2. 8 consecutive NEEDS_WORK → watcher auto-pauses (deadlock)
3. `RL_CHECKPOINT_ROUNDS=N` forces human checkpoint every N rounds

### Can I modify enforcement rules?

Yes. Path: open a `--type code-task` slice → edit `cli/src/policy.ts` → add spawn-based tests (at least one positive, one negative, one anti-loophole) → add a section in [`test-harness-and-gates.md`](./test-harness-and-gates.md).

See [`maintainer-handoff.md`](./maintainer-handoff.md) "Adding a new CLI sub-command" for the regression test pattern.
