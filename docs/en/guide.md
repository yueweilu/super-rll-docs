[English](../en/guide.md) | [日本語](../ja/guide.md) | [中文](../zh-CN/guide.md)

# User Guide

**Who this is for**: first-time users wanting to see what a full RLL flow looks like.
**What you get**: install RLL → pick a startup mode → run your first sub-slice → know what each round means → know when to use fast-path.

Ralph-Lisa Loop enforces a strict separation between code generation and code review. One agent writes, another reviews, they alternate in a turn-based loop. You make the architectural decisions.

> Tests / gates → [`testing.md`](./testing.md)
> Submit blocked, looking up error → [`faq.md`](./faq.md)
> Looking for a CLI command → [`reference.md`](./reference.md)
> Maintaining RLL itself (handoff) → [`maintainer-handoff.md`](./maintainer-handoff.md)

## Prerequisites

| Dependency | Required For | Install |
|------------|-------------|---------|
| [Node.js](https://nodejs.org/) >= 18 | CLI | See nodejs.org |
| [Claude Code](https://claude.ai/code) | Ralph (developer) | `npm i -g @anthropic-ai/claude-code` |
| [Codex CLI](https://github.com/openai/codex) | Lisa (reviewer) | `npm i -g @openai/codex` |
| tmux | Legacy tmux mode only | `brew install tmux` (macOS) / `apt install tmux` (Linux) |
| fswatch / inotify-tools | Legacy tmux mode only | `brew install fswatch` (macOS) / `apt install inotify-tools` (Linux) |

tmux and fswatch/inotify-tools are only needed for legacy tmux mode. Engine mode (`auto --engine`) and manual mode work with just Node.js and a coding agent (Claude Code, Codex, etc.).

Run `ralph-lisa doctor` to verify your setup:

```bash
ralph-lisa doctor
```

Use `--strict` to get a non-zero exit code if anything is missing (useful for CI):

```bash
ralph-lisa doctor --strict
```

## Installation

```bash
npm i -g ralph-lisa-loop
```

## Project Setup

### Full Init

```bash
cd your-project
ralph-lisa init
```

This creates role files and session state:

```
your-project/
├── CLAUDE.md              # Ralph's role (auto-loaded by Claude Code)
├── CODEX.md               # Lisa's role (loaded via .codex/config.toml)
├── .claude/
│   └── commands/          # Claude slash commands
├── .codex/
│   ├── config.toml        # Codex configuration
│   └── skills/            # Codex skills
└── .dual-agent/           # Session state
    ├── turn.txt           # Current turn
    ├── task.md            # Task goal (updated via update-task)
    ├── work.md            # Ralph's submissions
    ├── review.md          # Lisa's submissions
    └── history.md         # Full history
```

### Minimal Init (Zero Intrusion)

```bash
ralph-lisa init --minimal
```

Creates only `.dual-agent/` session state — no project-level files (no CLAUDE.md, CODEX.md, or command files). Requires:

- Claude Code plugin installed (provides Ralph role via hooks)
- Codex global config at `~/.codex/` (provides Lisa role)

Both `start` and `auto` commands work with either init mode.

### Removing from a Project

```bash
ralph-lisa uninit
```

## Your First Session

### Step 1: Start a Task

```bash
ralph-lisa start "implement login feature"
```

This writes the task to `.dual-agent/task.md` and sets the turn to Ralph.

### Step 2: Ralph Works (Terminal 1)

```bash
ralph-lisa whose-turn                    # → "ralph"
# ... do your work ...
# Write your submission to .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

Round 1 must be a `[PLAN]` submission — this gives Lisa a chance to verify task understanding before coding begins.

### Step 3: Lisa Reviews (Terminal 2)

```bash
ralph-lisa whose-turn                    # → "lisa"
ralph-lisa read work.md                  # Read Ralph's submission
# ... write review to .dual-agent/submit.md ...
ralph-lisa submit-lisa --file .dual-agent/submit.md
```

### Step 4: Iterate Until Consensus

Ralph reads Lisa's review and responds:

```bash
ralph-lisa read review.md                # Read Lisa's feedback
# Respond with [FIX], [CHALLENGE], [DISCUSS], etc.
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

The loop continues until both agents reach `[CONSENSUS]`.

### Step 5: Next Step

After consensus, move to the next phase:

```bash
ralph-lisa step "phase-2-implementation"
```

## Task-type fast-path (§207, v0.9.13+)

Not every task needs full TDD. For **review / docs / process work**, declare the task type explicitly with `--type` to skip the ceremony:

```bash
# Writing code → full TDD (default)
ralph-lisa next-step "implement-login" --type code-task

# Pure review / writing a report → skip TDD; only docs/** + .dual-agent/** writable
ralph-lisa next-step "review-old-design" --type review-task

# Editing docs → docs/** + top-level *.md + CLAUDE/CODEX/README
ralph-lisa next-step "fix-readme-typos" --type doc-task

# Protocol / PLAN edits → .rll/** + docs/** + CLAUDE/CODEX (NOT cli/package.json)
ralph-lisa next-step "update-protocol" --type process-task
```

**Rule of thumb**: **touching anything under `cli/**` source or `cli/package.json`? code-task**.

Omitting `--type` is equivalent to `code-task`; all legacy flows unchanged. Full details in [`../non-coding-task-quickstart.md`](../non-coding-task-quickstart.md).

### Fast-path evidence requirements

Non-code tasks skip the 5-col test table + tests-only round, but still need:

| task type | body must include |
|---|---|
| `review-task` | `Reviewed-PLAN-rows:` / `Reviewed-test-files:` / `Pass-Rationale:` or `NeedsWork-Rationale:` / `Verified:` |
| `doc-task` | `Files:` + summary ≥10 chars |
| `process-task` | `Files:` + `rationale:` or `Process-Change-Reason:` (latter mandatory when editing CLAUDE/CODEX) |

**Anti-loophole warning**: §207 is a trust-boundary lock, `RL_POLICY_MODE=warn` **cannot** bypass it; mid-slice attempts to sneak in code edits hit `task-type-file-mismatch`. See [`testing.md`](./testing.md) "Common BLOCKED messages" for details.

## Task-complexity mode fast-path (§212, v0.9.14+)

`--type` decides "what the task does"; `--mode` decides "how strict". The two axes are orthogonal — combine them freely.

```bash
# Simple (efficiency-first) — skip §128/§122/§102/§123/§134 ceremony
ralph-lisa next-step "fix-typo" --mode simple --user-signature "user-A-simple-2026-05-26"

# Standard (default) — current LLM-judges-complexity behavior (omit --mode is equivalent)
ralph-lisa next-step "add-feature"

# Strict (quality-first) — force full ceremony, user co-creates test plan (Phase 2 §213 ships this)
ralph-lisa next-step "auth-refactor" --mode strict --user-signature "user-C-strict-2026-05-26"
```

**Skill auto-fire**: when no `--mode` is given, `next-step` automatically injects a Stage 0 prompt into `.dual-agent/task.md`, so Ralph's first message asks the user to pick A/B/C.

**`--user-signature` is mandatory** (trust-boundary): ≥10 characters AND containing an audit keyword (`simple` / `efficiency-first` / `trivial` / `standard` / `strict` / `quality-first`) OR an ISO date `YYYY-MM-DD`. Otherwise:
- missing signature → exit 2 `mode-set-requires-user-signature`
- weak signature → exit 2 `user-signature-too-weak`

Every `--mode X` invocation is written to `.dual-agent/audit-log.jsonl` for audit traceability.

**Body declarations are ignored**: writing `Mode: simple` in a `[CODE]` / `[PLAN]` body has no effect — only the SoR JSON (`.dual-agent/clarify-locked-<step>.json`) and CLI flags are authoritative.

See `docs/211-task-intake-skill-design.md` for the full design + [`test-harness-and-gates.md`](./test-harness-and-gates.md) "§212 mode bypass" section.

## Auto Mode

### Engine Mode (Recommended)

Engine mode uses the built-in TurnCoordinator to drive Ralph and Lisa via ACP protocol. It works cross-platform (macOS, Linux, Windows) with zero external dependencies.

```bash
ralph-lisa auto --engine --task "implement login feature"
```

Options:
- `--ralph-backend claude` / `--lisa-backend claude` — choose agent backends
- `--auto-approve` — auto-approve all permission requests
- `--ui quiet|split|json|tmux|wt` — display mode (default: quiet; `wt` opens a Windows Terminal dual-pane tab)
- `--max-rounds 20` — maximum rounds before auto-stop
- `--deadlock-threshold 5` — consecutive NEEDS_WORK before deadlock

### Cross-platform Support

- Windows: `ralph-lisa auto --engine` runs natively. Legacy tmux mode is not supported.
- Windows Terminal: `--ui wt` opens a dedicated tab with Ralph/Lisa panes. Outside a Windows Terminal host, `wt` falls back to `split`.
- macOS/Linux: `--ui tmux` remains available, and legacy tmux mode keeps the old watcher-based workflow.

### IDE Integration (Recommended for IDE Users)

If you use an IDE (Cursor, Claude Code, Windsurf, Cline, VS Code + Copilot), the recommended workflow is **Mode 2B: IDE as Ralph + Lisa watcher**.

#### Quick Start

```bash
# 1. Initialize project (generates rule files for all supported IDEs)
ralph-lisa init

# 2. Start Lisa watcher in a terminal (keep running)
ralph-lisa watch-lisa --lisa-backend codex --auto-approve

# 3. Open your project in your IDE — the AI reads the rule file automatically
```

`ralph-lisa init` creates:
- `CLAUDE.md` (Claude Code)
- `.cursorrules` (Cursor)
- `.windsurfrules` (Windsurf)
- `.clinerules` (Cline)
- `.github/copilot-instructions.md` (GitHub Copilot)
- `CODEX.md` (Codex / Lisa role)
- `.git/hooks/post-commit` (auto Lisa review on commit)

#### How It Works

1. Your IDE's AI agent acts as **Ralph** (the developer)
2. `watch-lisa` runs in the background with a **persistent Lisa connection** — Lisa retains context across rounds
3. When Ralph submits via `ralph-lisa submit-ralph --file .dual-agent/submit.md`, the watcher auto-triggers Lisa review
4. Lisa's review appears in `.dual-agent/review.md` — the IDE AI reads it on its next turn

#### One-Shot Review (No Init Needed)

For a quick code review without setting up the full loop:

```bash
ralph-lisa review --auto-approve
ralph-lisa review --lisa-backend codex --scope "src/"
```

This auto-collects `git diff`, sends it to Lisa, and prints the review to stdout. Works in any project, no `init` required.

#### Modes Overview

| Mode | Use Case | Command |
|------|----------|---------|
| **IDE + watch-lisa** | Daily development in IDE | `watch-lisa` in terminal, IDE AI as Ralph |
| **CLI auto engine** | Fully autonomous, CLI-only | `auto --engine --task "..." --ui tmux` |
| **One-shot review** | Quick review, CI/PR | `review --auto-approve` |
| **MCP server** | Advanced IDE/agent integration | `mcp-server` |

### MCP Server (Advanced)

For programmatic IDE/agent integration, start the RLL MCP server:

```bash
ralph-lisa mcp-server
```

This exposes tools like `rll_launch`, `rll_status`, `rll_submit`, `rll_lisa_review`, `rll_handoff`, `rll_pause`, `rll_resume`, `rll_override` — usable by any MCP-compatible client (Claude Code, Cursor, Zed, etc.).

### Legacy tmux Mode (Deprecated)

> ⚠️ Legacy tmux mode is deprecated. Use `auto --engine` instead.

The old tmux-based auto mode is still available but will be removed in a future version:

```bash
ralph-lisa auto "implement login feature"        # deprecated
ralph-lisa auto --full-auto "implement login feature"  # deprecated
```

This creates a tmux session with two panes and uses a bash watcher to trigger turns. It requires tmux (macOS/Linux only).

### Checkpoint System (Legacy tmux mode)

Pause for human review every N rounds (legacy tmux mode only):

```bash
export RL_CHECKPOINT_ROUNDS=5
ralph-lisa auto "task"   # legacy tmux mode
```

In engine mode, use `--max-rounds` to limit rounds, or `rll_pause` via MCP to manually pause.

### Watcher Behavior

- **Fire-and-forget triggering** for fast turn transitions
- **30-second cooldown** between triggers to prevent re-triggering during work
- **Auto-restart** on crash (session-guarded)
- **Heartbeat file** at `.dual-agent/.watcher_heartbeat` for liveness checks
- **Configurable log threshold**: `RL_LOG_MAX_MB` (default 5, min 1)

## Tag System

Every submission requires a tag on the first line:

| Ralph Tags | Lisa Tags | Shared |
|------------|-----------|--------|
| `[PLAN]` | `[PASS]` | `[CHALLENGE]` |
| `[RESEARCH]` | `[NEEDS_WORK]` | `[DISCUSS]` |
| `[CODE]` | | `[QUESTION]` |
| `[FIX]` | | `[CONSENSUS]` |

### Tag Details

- **`[PLAN]`**: Required for Round 1. Outlines approach before coding.
- **`[RESEARCH]`**: Required before coding when involving reference implementations, protocols, or external APIs. Must include verified evidence (file:line, command output).
- **`[CODE]`**: Code implementation. Must include Test Results section.
- **`[FIX]`**: Bug fix or revision based on feedback. Must include Test Results section.
- **`[PASS]`**: Lisa approves the submission.
- **`[NEEDS_WORK]`**: Lisa requests changes. Must include at least one reason.
- **`[CHALLENGE]`**: Disagree with the other agent's suggestion, providing a counter-argument.
- **`[DISCUSS]`**: General discussion or clarification.
- **`[QUESTION]`**: Ask for clarification.
- **`[CONSENSUS]`**: Confirm agreement to close the current item.

## Submission Rules

### Round 1 Must Be [PLAN]

Ralph's first submission must be `[PLAN]`. This gives Lisa a chance to verify task understanding before any code is written.

### Test Results Required

`[CODE]` and `[FIX]` submissions must include a Test Results section:

```markdown
### Test Results
- Test command: npm test
- Result: 150/150 passed
- New tests: 2 added (auth.test.ts, login.test.ts)
```

### Research Before Coding

When the task involves reference implementations, protocols, or external APIs, submit `[RESEARCH]` first with verified evidence:

```markdown
[RESEARCH] API integration research

- Endpoint: POST /api/v2/auth (docs:line 45)
- Auth: Bearer token in header (verified via curl)
- Response: { token, expires_in } (tested locally)
```

### No Silent Acceptance

When responding to `[NEEDS_WORK]`:
- **If you agree**: Explain WHY Lisa is right, then submit `[FIX]`
- **If you disagree**: Use `[CHALLENGE]` to provide a counter-argument
- **Never** submit a bare `[FIX]` without explanation

## Test Harness Automation (v0.6.6)

§75 series ships a **closed-loop test harness** that lets agents iterate dev → test → fix without human intervention until escalation thresholds.

### PLAN-time test spec linter

Before submitting `[PLAN]`, Ralph invokes the linter to self-check test coverage strength:

```bash
ralph-lisa test-spec-eval --plan-file .dual-agent/work.md     # session work.md
echo "$plan" | ralph-lisa test-spec-eval --json
```

5 rules: `no-test-plan` (high) / `thin-coverage` <3 cases (high) / `happy-only` (medium) / `single-surface` (medium) / `missing-integration` (medium). Exit 1 on high-severity gaps.

### Multi-tier cascade

Configure tiers in `.ralph-lisa.json` (every tier `tests` entry must reference a key in `testHarness.tests`; otherwise `validateTierTestKeys` will throw at runtime):

```json
{
  "testHarness": {
    "tests": {
      "unit-cli":        { "command": "npm test --prefix cli" },
      "integration-cli": { "command": "<your integration test command>" }
    }
  },
  "testTiers": [
    { "name": "unit",        "order": 1, "tests": ["unit-cli"],        "halt_on_fail": true },
    { "name": "integration", "order": 2, "tests": ["integration-cli"], "halt_on_fail": true,
      "depends_on": ["unit"] }
  ]
}
```

Run cascade:

```bash
ralph-lisa test-cascade                          # halt-on-fail (default)
ralph-lisa test-cascade --strategy full          # ignore halt; run all
ralph-lisa test-cascade --strategy smoke-only    # only lowest-order tier
ralph-lisa test-cascade --tier integration       # filter to one tier
ralph-lisa test-cascade --fail-fast              # global halt override
ralph-lisa test-cascade --dry-run                # plan only, no execution
ralph-lisa test-cascade --json                   # programmatic CascadeResult output
```

Failure JSON artifacts auto-write to `.dual-agent/harness-results/cascade-*.json` (schema_version=1).

### Auto-loopback to Ralph on cascade failure

When `[CONSENSUS]` triggers post-consensus gate and cascade fails:

1. **Structured review.md entry**: `## Cascade Failure Context (R{n})` with per-failure `test_id`, `tier`, `type`, `file`, `error_excerpt`, `retry_count`, `converge_status`, `occurred_at` — parser-safe heading (does NOT match consensus tag pattern)
2. **Turn flips back to Ralph** — Lisa NOT invoked again until Ralph submits a fix
3. **Per-step retry budget**: `loopback-state.json` tracks `consecutive_failures` per step; resets on step transition or happy-pass
4. **Escalation at N=3 consecutive failures**: one-shot `pushTaskStateChange(kind='task_failed', note='ESCALATION:...')` to wecom
5. **Halt at K=5 consecutive failures**: one-shot `pushTaskStateChange(kind='task_failed', note='CRITICAL HALT:...')` — operator must intervene

```bash
ralph-lisa loopback status              # show current state
ralph-lisa loopback reset --step <name> # manual reset after operator fix
```

### Cross-module contract drift detector

Static analysis catching cli ↔ wecom-bot field/event drift before runtime:

```bash
ralph-lisa contract-check          # exit 1 on blocking drift
ralph-lisa contract-check --strict # warnings → blocking
ralph-lisa contract-check --json   # programmatic ContractCheckResult
```

Detects 4 drift classes:
- cli emits event type that ingress accept-list doesn't accept (silent 400 reject)
- daemon EventType union ⊕ accept-list (declared but not validated)
- field union added to cli + ingress but daemon consumer/render branch unchanged (silent drop)
- render-branch baseline distinction (`high` baseline supported by default branch vs explicit `critical` branch)

### Watcher 2-tier escalation (5-hour stall fix)

Watcher monitors interactive panes (when agent waits for user input):
- **5min ESCALATE** (high severity): one-shot `pushAgentStuck` push
- **10min CRITICAL** (🚨🚨): one-shot push with stronger copy
- 6-line state file with `sessionMtime` distinguisher prevents cross-message sentinel leak

See `docs/dev-harness-closed-loop-design.md` for full closed-loop architecture, complex-task walkthrough, and break/dead-loop review.

## Consensus Protocol

Lisa's verdict is **advisory, not authoritative**. Ralph can accept, challenge, or request clarification.

Both agents must explicitly submit `[CONSENSUS]` before moving to the next step. The flow:

1. Lisa submits `[PASS]` (closeable if Ralph agrees)
2. Ralph submits `[CONSENSUS]` — item is closed

### Deadlock Escape

After 5 rounds without consensus:
- **`[OVERRIDE]`**: Proceed with documented disagreement
- **`[HANDOFF]`**: Escalate to human decision

No infinite loops. No stuck states.

## Policy Layer

The policy layer validates submission quality.

### Inline Checks

Applied automatically during `submit-ralph` / `submit-lisa`:

```bash
# Warn mode (default) — prints warnings, doesn't block
export RL_POLICY_MODE=warn

# Block mode — rejects non-compliant submissions
export RL_POLICY_MODE=block

# Disable
export RL_POLICY_MODE=off
```

### Standalone Checks

For scripts and hooks — always exit non-zero on violations, regardless of `RL_POLICY_MODE`:

```bash
ralph-lisa policy check ralph           # Check Ralph's latest submission
ralph-lisa policy check lisa            # Check Lisa's latest submission
ralph-lisa policy check-consensus       # Both agents submitted [CONSENSUS]?
ralph-lisa policy check-next-step       # Comprehensive: consensus + all policy checks
```

### Policy Rules

- Ralph's `[CODE]`/`[FIX]` must include a "Test Results" section
- Ralph's `[RESEARCH]` must have substantive content
- Lisa's `[PASS]`/`[NEEDS_WORK]` must include at least 1 reason

## Mid-Session Controls

### Update Task Direction

Change direction without restarting:

```bash
ralph-lisa update-task "switch to REST instead of GraphQL"
```

Appends to task.md (preserving history). Task context is auto-injected into submissions and watcher trigger messages.

### Enter New Step

After consensus, move to a new phase:

```bash
ralph-lisa step "phase-2"              # Requires consensus
ralph-lisa step --force "phase-2"      # Skip consensus check
```

### Force Turn

Manual override for stuck states:

```bash
ralph-lisa force-turn ralph
ralph-lisa force-turn lisa
```

### Archive and Clean

```bash
ralph-lisa archive [name]              # Archive current session
ralph-lisa clean                       # Clean session state
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RL_POLICY_MODE` | `warn` | Policy check mode: `off`, `warn`, `block` |
| `RL_CHECKPOINT_ROUNDS` | `0` (disabled) | Pause for human review every N rounds |
| `RL_LOG_MAX_MB` | `5` | Pane log truncation threshold in MB (min 1) |

## Tips and Best Practices

### Git Discipline

Small commits, clear messages, commit often. When things go wrong (and they will), your only safety net is being able to `git reset` to a known good state.

### Agent Crashes

Agent crashes have no auto-recovery yet. If an agent crashes (possibly from long context or system resource exhaustion), you must manually restart. Monitor the tmux session and restart as needed.

### Context Management

Long sessions fill the context window. Break large tasks into steps using `ralph-lisa step`. Keep individual tasks focused and use `update-task` to redirect rather than starting over.

### When to Use RLL

**Good fit**: Multi-step implementations, architectural decisions, code affecting users/security, ambiguous requirements.

**Overkill**: One-line fixes, well-tested refactoring, personal scripts, time-critical hotfixes.

### The Human Arbiter

Two AIs will happily agree on a bad design. Ralph-Lisa Loop is structured AI-assisted development, not autonomous development. The human arbiter is not optional.
