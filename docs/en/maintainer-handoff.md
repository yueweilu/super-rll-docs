[English](../en/maintainer-handoff.md) | [中文](../zh-CN/maintainer-handoff.md)

# RLL Maintainer Handoff

**Who this is for**: engineers picking up super-rll (Ralph-Lisa Loop, or RLL) for the first time.
**What you get from reading this**: a mental model of what the project is, which moving parts do what, what changing one piece affects, where to look when things break, and which pitfalls cost previous maintainers time.

---

## TL;DR — 30-second version

RLL is a **two-agent collaboration tool** that puts two AIs through a turn-based "submit → review → fix → consensus" loop, forcing standard engineering discipline (write tests, run gates, don't fake results) onto the model. Code is mostly TypeScript; the CLI is `ralph-lisa`.

- **Main repo**: `super-rll/` (this one)
- **Core packages**: `cli/` (the main CLI, ~80 sub-commands, ~2400 tests) and `wecom-bot/` (a WebSocket daemon that bridges WeCom messages into and out of RLL)
- **Runtime**: a user runs `ralph-lisa init` then `ralph-lisa start --auto` inside their target project; the CLI spawns Claude/Codex in two tmux panes as Ralph and Lisa, and the CLI itself referees
- **State**: everything lives in `<project>/.dual-agent/` as plain files (`step.txt` / `turn.txt` / `work.md` / `review.md` / `history.md` + JSON artifacts)
- **Quality gates**: every Ralph submit goes through a stack of checks (did the tests really run? was Lisa's review substantive? is anyone trying to bypass discipline?). See [`test-harness-and-gates.md`](./test-harness-and-gates.md).

---

## What problem the project actually solves (product view)

Get AI-generated code that's **actually usable** — without per-commit human review and without trusting the model's self-evaluation. The mechanism is **two agents cross-checking + mechanical gates**:

- **Ralph** (developer agent): writes code, runs tests, submits results
- **Lisa** (reviewer agent): independently reads Ralph's submission, verifies test claims, returns PASS or NEEDS_WORK
- **CLI gates**: sit in the middle as referee, preventing Ralph from cutting corners (skipping tests, faking results) and preventing Lisa from rubber-stamping (PASS without real checks)

The design rationale lives in [`docs/trustcoding-product-definition.md`](../trustcoding-product-definition.md); this handoff doesn't repeat it. Maintainers only need to know: this is the project's core value prop, and "why are there so many checks?" always traces back here.

---

## Repository layout (the 6 directories you'll touch)

| Path | What | What to watch when editing |
|---|---|---|
| `cli/` | The main CLI package, what users install. Source in `src/`, compiled to `dist/`, tests in `src/test/`. | Any CLI behavior change requires tests + `quality-gate`; new sub-commands need a case in `cli/src/cli.ts` + a row in `docs/en/reference.md` |
| `wecom-bot/` | WeCom daemon, separate npm package. Pulls user messages (text/voice) from WeCom into RLL inbox and pushes RLL state back. WebSocket-based, **no public callback required**. | Protocol changes must sync with `cli/src/wecom-hook.ts` (CLI-side IPC client); enforced by `§80 cross-module-contract-check` |
| `cli-pty-daemon/` `cli-pty-daemon-vscode/` | Cross-platform IDE integration (VSCode extension + PTY daemon) — lets Ralph/Lisa run without tmux. | Early MVP, relatively isolated; check `§46-§48` carry-forward docs before deeper changes |
| `rll-team-platform/` | Backend platform (multi-user monitoring, token usage stats, enterprise admin). Separate npm workspace. | Mostly orthogonal to cli; has its own PLAN.md + tests |
| `lark-bot/` `dingtalk-bot/` | Lark / DingTalk outbound webhook MVP. **Push-only**, no inbound yet. | If you want bidirectional, copy the wecom-bot architecture (WebSocket smart-robot + local HTTP IPC) |
| `docs/` | User docs + design docs. **User docs live in `zh-CN/` / `en/` / `ja/` (trilingual)**; design docs (`*-design.md` etc.) sit at `docs/` root, single-language, historical SoR | Cross-language sync follows `§143` "translation defer" rule (core first, translations later) |

Smaller dirs (`scripts/` / `deploy/` / `test-e2e/`) can be looked up as needed.

---

## Three ways users run RLL

A maintainer should know which code path each one hits:

### 1. `ralph-lisa start --auto` (recommended / common)

- Entry: `cli/src/cli.ts` case `start` → `cmdStart()` at `cli/src/commands.ts:3500+`
- Spawns 4 tmux panes (Ralph claude, Lisa claude/codex, watcher status, log), watcher monitors `.dual-agent/turn.txt` and triggers agents
- `--engine` (`§51`): watcher embeds TurnCoordinator, simpler tmux setup
- Self-driving until 8-consecutive NEEDS_WORK deadlock or mutual CONSENSUS

### 2. `ralph-lisa start --daemon` (IDE integration / §47–§48)

- Entry: `cmdStartDaemonFirst()`, spawns `cli-pty-daemon` as background process; VSCode extension or `ralph-lisa attach <role>` thin client connects
- Cross-platform (macOS/Windows/Linux), no tmux
- Use case: in-IDE, SSH-remote, containerized

### 3. Manual `ralph-lisa init` + `submit-ralph` / `submit-lisa` / `read review.md`

- Low-level API for scripts and tests
- See [`reference.md`](./reference.md) for the full sub-command surface

---

## Data flow: a complete "Ralph submits" path

Understanding this gets you 80% of bug diagnoses:

```
User runs claude/codex in the Ralph pane
  ↓
Ralph writes submission body to .dual-agent/submit.md
  ↓
Runs `ralph-lisa submit-ralph --file .dual-agent/submit.md`
  ↓
cli/src/commands.ts cmdSubmitRalph():
  ├─ 1. Read step.txt / turn.txt (must be ralph)
  ├─ 2. Read task-type-<step>.json (§207) → decide full TDD or fast-path
  ├─ 3. runPolicyCheck() → cli/src/policy.ts checkRalph()
  │     ├─ §137 test-results-claim-verifier  (Test-Results line vs test-execution-log.jsonl)
  │     ├─ §149 ralph-attest                  (Test-Process / Cases / Results trio)
  │     ├─ §207 task-type-file-mismatch       (review-task touching cli/src/** → block)
  │     ├─ §202 first-tag enforcement         (new step's first tag must be [PLAN]/[RESEARCH]/[CLARIFY])
  │     ├─ §134 marker-plan-bound             (§52 tests-only marker must be declared in PLAN.md)
  │     └─ …(more, see test-harness-and-gates.md)
  ├─ 4. runPlanKeeperGate()  → .rll/PLAN.md SOR currency check
  ├─ 5. autoTdd.persistPlanTestTable()  → write 5-col test table to auto-tdd-plan-<step>.json
  ├─ 6. runGate()  → actually run npm test / lint / build (optional, RL_RALPH_GATE)
  ├─ 7. Write work.md / history.md / append last_action
  ├─ 8. Flip turn.txt to lisa
  └─ 9. pushWecomEvent ralph_submit  → wecom-bot daemon → user's WeCom

Any step failing → process.exit(1) → user sees BLOCKED output
```

`cmdSubmitLisa` mirrors this, plus §144 Verified: cite + Lisa-attest verification.

See [`test-harness-and-gates.md`](./test-harness-and-gates.md) for the per-gate breakdown.

---

## Key enforcement index (§xxx one-liner)

Each `§xxx` corresponds to a shipped mechanical rule. When changing CLI behavior you'll likely touch one — **look at the matching section in [`test-harness-and-gates.md`](./test-harness-and-gates.md) rather than guessing**.

| Anchor | One-line purpose | Detailed location |
|---|---|---|
| §70 | After mutual CONSENSUS, must run the test cascade to actually close the slice | test-harness-and-gates.md §post-consensus-gate |
| §102 | Complex tasks must write tests first (tests-only round) before implementation | test-harness-and-gates.md §auto-tdd |
| §122 | A sub-slice must explicitly ack testing capability before R2 (prevents "I'll mock it") | test-harness-and-gates.md §task-capability |
| §123 | Complexity judgment three layers (complexity-judge + verify + Lisa rerun) | test-harness-and-gates.md §complexity-gates |
| §128 | Complex tasks must go through R0 [CLARIFY] before R1 [PLAN] | test-harness-and-gates.md §clarify-phase |
| §133 | Policy default is block, not warn (so mechanism can't be silently bypassed) | test-harness-and-gates.md §policy-block-default |
| §137 | Test-Results lines must correspond to entries in test-execution-log.jsonl | test-harness-and-gates.md §test-results-claim |
| §144 | Lisa PASS/CONSENSUS must cite `Verified:` to a trusted artifact path | test-harness-and-gates.md §lisa-verified-cite |
| §149 | Ralph + Lisa bidirectional attest (prevents one-sided rubber-stamping) | test-harness-and-gates.md §bidirectional-attest |
| §150 | 3 consecutive mid-process smoke failures escalate to task_failed | test-harness-and-gates.md §smoke-auto-loop |
| §151 | UI / web slices must attach a screenshot artifact | test-harness-and-gates.md §visual-evidence |
| §200 §201 §202 | Propose-agree protocol for non-coding tasks | test-harness-and-gates.md §propose-agree |
| §206 | Session-anchor canonical root (state dir no longer hunted) | test-harness-and-gates.md §session-anchor |
| §207 | Task_type fast-path (review/doc/process skip full TDD ceremony) | test-harness-and-gates.md §task-type-fast-path |

The full §xxx ledger lives at the top of `.rll/PLAN.md` in reverse-chronological order.

---

## Debug runbook by symptom

Match what you see; one of these covers most cases:

### Symptom 1: User submission blocked, error mentions `§xxx` or `rule: xxx-xxx`

1. Read the rule name in the BLOCKED message (e.g. `task-type-file-mismatch`)
2. Grep that rule name in `cli/src/policy.ts` to find the trigger site
3. Compare the rule's message template against the user's submission body
4. If the rule misjudged (user didn't violate but got blocked) → fix the rule's logic + add a regression test
5. If the rule was right (user genuinely violated) → add an FAQ entry in `docs/en/faq.md` + verify `docs/en/test-harness-and-gates.md` has a clear "how to break" section

### Symptom 2: Watcher / daemon died, Ralph or Lisa unresponsive

1. `ralph-lisa doctor` — see Watcher Health section (heartbeat age, ACKED_TURN drift)
2. `ralph-lisa daemon-health-check` — wecom-bot daemon alive?
3. `cat .dual-agent/.watcher_heartbeat` — timestamp (>300s is bad)
4. Check `.dual-agent/watchdog.log` for SIGKILL/respawn
5. Last resort: `ralph-lisa start --auto` to restart — state is in `.dual-agent/`, restart is safe

### Symptom 3: Tests pass locally / fail in CI (or reverse)

- Local pass, CI fail → likely CI shallow checkout (depth=1) affects git-diff tests / no Playwright in CI / no `codex` etc.
- Local fail, CI pass → likely local tmux env pollution (`RL_STATE_DIR` left pointing to a deleted §184 tempProject). Fix: `tmux setenv -u RL_STATE_DIR && tmux setenv -u RL_SESSION_ID`
- Both fail → suspect concurrent test pollution of `super-rll/.dual-agent/command-events.jsonl` (the snapshot-style tests — `§cmdRunLisa-isolation T2` is a known flake)

### Symptom 4: User reports "RLL feels too heavy / I'm stuck writing test plans"

- Likely a non-code task (review/doc/process) running full TDD
- Tell user to `ralph-lisa next-step "slug" --type review-task` (or doc-task / process-task) for §207 fast-path
- See [`guide.md`](./guide.md) "Task-type fast-path" section + [`non-coding-task-quickstart.md`](../non-coding-task-quickstart.md)

### Symptom 5: CLAUDE.md / CODEX.md is incomprehensible

- These are agent-facing protocol specs, not human docs. Reading top-to-bottom will hurt.
- Look up by §xxx: find the anchor in `.rll/PLAN.md` ID Anchor Ledger → grep CLAUDE.md / CODEX.md for the relevant section
- For systematic protocol understanding → read `docs/*-design.md` (design docs)

### Symptom 6: Adding a new CLI sub-command

1. Add a switch case in `cli/src/cli.ts`
2. Add the `cmdXxx()` function in `cli/src/commands.ts` + needed helpers
3. Write `cli/src/test/xxx.test.ts` (spawn-based real cli test + a row in `cli/src/test/policy-block-static-audit.test.ts` allowlist if §149 would fire)
4. Add a row to `docs/en/reference.md` + `docs/zh-CN/reference.md`
5. Run `ralph-lisa quality-gate` until clean
6. If incidental to current sub-slice → just commit; otherwise open a new sub-slice and follow the full flow

### Symptom 7: Cutting a release

**Key constraint**: version-bumping requires editing `cli/package.json` / `cli/package-lock.json`, which are **not** in process-task's whitelist (`cli/src/task-type.ts:42` notes "not blanket package.json"). So release work **must** use `code-task`.

1. `ralph-lisa next-step "vX.Y.Z-bump" --type code-task`
2. Edit `cli/package.json` + `cli/package-lock.json`; pick patch/minor/major per §143
3. Update `docs/{en,zh-CN,ja}/changelog.md` (ja may be deferred)
4. Update `cli/src/test/version-decision.test.ts` pinned version strings (including inline `assert.match(out, /0\.X\.Y/, ...)` literals)
5. `bash build-release.sh` produces `rll-release-vX.Y.Z.tar.gz` (~891K)
6. Run `ralph-lisa dogfood-gate run --strict` + `doc-update-gate run --strict` + `release-report emit`
7. PR / merge / `git tag -a vX.Y.Z -m "..."` / `gh release create vX.Y.Z rll-release-vX.Y.Z.tar.gz`

If your slice is purely docs (e.g. fixing a changelog typo), use `--type doc-task`. If purely `.rll/PLAN.md` / CLAUDE.md / docs (no `cli/**` touch, no package files), use `--type process-task`. Rule of thumb: **touching anything under `cli/**`? code-task**.

---

## Design doc index (read on demand, not cover-to-cover)

The `*-design.md` files at `docs/` root are historical sub-slice design SoRs, loosely grouped:

- **Trust-coding origin**: `trustcoding-product-definition.md` / `trustcoding-product-definition.md` / `trust-coding-closed-loop-design.md`
- **Test harness design**: `test-harness-completion-design.md` / `test-harness-capability-evaluation.md` / `testharness-cli-webui-gate-composition.md` / `testharness-gate-comprehensive-plan.md` / `test-assertion-tiers-design.md`
- **Gate machinery**: `non-coding-gate-and-mutual-attest-design.md` / `gate-bypass-diagnostic-2026-05-16.md` / `dev-harness-closed-loop-design.md`
- **Data loop (§D)**: `d2-phase2-event-ingestion-design.md` / `d4-review-startup-retrospective.md`
- **Cross-platform PTY**: `cross-platform-terminal-backend-matrix.md` / `cli-e2e-skill-pivot-design.md` / `playwright-skill-pivot-design.md`
- **CLI platform plan**: `rll-cli-full-platform-plan.md` / `rll-stack-proposal.md` / `super-rll-roadmap-0.7-1.0.md`
- **Clarify / planning**: `clarify-phase-design.md` / `ai_native_sdlc_and_dynamic_gate_system_v_2.md`
- **Third-party integration eval**: `lark-dingtalk-cli-agent-eval.md`

For a specific §xxx, grep the sub-slice section in `.rll/PLAN.md` — each carries full design narrative.

---

## Common pitfalls (lessons paid in blood)

1. **Never `rm -rf` foreign repo directories** — clean up per-file. (We once accidentally deleted margay's whole `scripts/`; see memory feedback-never-rm-rf-foreign-repo-dir.)
2. **Never premature SOR atomic flip** — `.rll/PLAN.md` row status `active → closed` must wait for mutual CONSENSUS (both Ralph and Lisa [CONSENSUS]); one-sided PASS doesn't count.
3. **Commit/push only when the user explicitly asks** — don't auto-commit after finishing work.
4. **Never `npm publish`** — release goes through GitHub Release + tarball.
5. **tmux env pollution** — running §184-style tempProject tests leaves `RL_STATE_DIR` pointing at a now-deleted tmp dir; subsequent CLI commands resolve to the wrong stateDir. Fix: `tmux setenv -u RL_STATE_DIR && tmux setenv -u RL_SESSION_ID`.
6. **Test-Results parser trap** — `cli/src/test-results-claim-verifier.ts:39` `parseTestResultClaims` uses backticks to capture the cmd; prose-style `42/42 passed` without a nearby backticked cmd parses to `cmd='?'` and never matches the log. The safe pattern: explicit `Test-Results: cmd="X" passed=N total=N` lines.
7. **`.rll/**` is NOT session state** — it's process-slice SoR; code/review/doc-task can't touch it; to edit PLAN.md you need a process-task slice. §207 R3 had a bug where excluding `.rll/**` from classification let review-task silently edit PLAN.md (caught by Lisa R19 B1).
8. **doc-task still goes through §149 attest + doc-oracle-spec 5-col table** — it doesn't entirely skip gates; it skips auto-tdd-plan + Required test rows. See test-harness-and-gates.md §task-type-fast-path.

---

## Emergency contacts

- Project owner email: see `git log` `user.email` (`さだはる` / `xiaomicytest@gmail.com`)
- Sub-slice status: `ralph-lisa task list` or top of `.rll/PLAN.md`
- Current round / turn: `ralph-lisa status` gives a one-line snapshot

If you're handed a chaotic state: run `ralph-lisa status` + `ralph-lisa doctor` first; then `git log --oneline -20` for recent activity; then back to `.rll/PLAN.md` for the active sub-slice's round/state.
