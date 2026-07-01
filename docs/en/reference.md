[English](../en/reference.md) | [日本語](../ja/reference.md) | [中文](../zh-CN/reference.md)

# Command Reference

**Who this is for**: anyone who forgot exactly what a CLI subcommand looks like.
**What you get**: find the command + see its flags + know which category it belongs to.

Full CLI surface ≈ 108 subcommands (`ralph-lisa --help` lists them all), grouped below by purpose. Detailed behavior lives in [`guide.md`](./guide.md) and [`testing.md`](./testing.md).

---

## Project init / startup

| Command | Description |
|---|---|
| `ralph-lisa init [dir]` | Full init: writes role files (CLAUDE.md / CODEX.md) + commands/ + skills/ + .dual-agent/ |
| `ralph-lisa init --minimal [dir]` | Only writes .dual-agent/ (role files assumed from Claude Code plugin / Codex global config) |
| `ralph-lisa uninit` | Remove RLL files from project |
| `ralph-lisa start "task"` | Manual mode (you advance rounds) |
| `ralph-lisa start --auto "task"` | Auto mode (tmux + fswatch) |
| `ralph-lisa auto "task"` | Alias for `start --auto` |
| `ralph-lisa auto --engine --task "description"` | Engine mode (natively cross-platform, no tmux) |
| `ralph-lisa auto --engine --task "..." --ui wt` | Engine + Windows Terminal dual-pane UI |
| `ralph-lisa start --daemon` | IDE integration mode (cli-pty-daemon background) |
| `ralph-lisa mcp-server` | MCP server mode (lets other LLM tools call RLL) |
| `ralph-lisa stop` | Stop current session |

---

## Turn / submit

| Command | Description |
|---|---|
| `ralph-lisa whose-turn` | Whose turn (ralph / lisa) |
| `ralph-lisa check-turn` | Alias |
| `ralph-lisa status` | One-line: step / round / turn / last action / watcher health |
| `ralph-lisa submit-ralph --file f.md` | Ralph submits (**recommended** via `--file`) |
| `ralph-lisa submit-lisa --file f.md` | Lisa submits |
| `ralph-lisa submit-ralph --stdin` | Read from stdin |
| `ralph-lisa submit-lisa --stdin` | Same |
| `ralph-lisa force-turn ralph\|lisa` | Force-set turn (debug) |

Inline mode `submit-ralph "[TAG] ..."` is **deprecated** (shell escape issues); use `--file`.

---

## Read / history / recap

| Command | Description |
|---|---|
| `ralph-lisa read work.md` | Read Ralph's latest submit |
| `ralph-lisa read review.md` | Read Lisa's latest review |
| `ralph-lisa read review --round N` | Read round N's review |
| `ralph-lisa read-review` | Alias for `read review.md` |
| `ralph-lisa history` | Full session history |
| `ralph-lisa recap` | Context recovery summary (after compaction) |
| `ralph-lisa logs` | List session logs |
| `ralph-lisa logs cat <name>` | View specific log |

---

## Flow / phase

| Command | Description |
|---|---|
| `ralph-lisa next-step "name"` | Enter new sub-slice (requires current sub-slice mutual CONSENSUS) |
| `ralph-lisa next-step "name" --type <X>` | Same + explicit task_type declaration (§207) |
| `ralph-lisa next-step --force "name"` | Skip consensus check |
| `ralph-lisa next-step "name" --task "first task"` | Also set first subtask |
| `ralph-lisa step` | Alias for `next-step` |
| `ralph-lisa update-task "new direction"` | Mid-session task redirect |
| `ralph-lisa subtask add\|done\|list` | Subtask management |
| `ralph-lisa scope-update` | Force Ralph to resubmit [PLAN] (for deadlock recovery) |
| `ralph-lisa archive [name]` | Archive session |
| `ralph-lisa clean` | Clear session state |

---

## Task-type fast-path (§207)

| Command | Description |
|---|---|
| `ralph-lisa next-step "x" --type code-task` | Default full TDD (equivalent to omitting `--type`) |
| `ralph-lisa next-step "x" --type review-task` | Skip TDD; writes only docs/** + .dual-agent/** |
| `ralph-lisa next-step "x" --type doc-task` | + top-level *.md + CLAUDE.md / CODEX.md / README.md |
| `ralph-lisa next-step "x" --type process-task` | + .rll/** + docs/** (**not** cli/package.json) |

See [`../non-coding-task-quickstart.md`](../non-coding-task-quickstart.md).

---

## task / complexity / clarify

| Command | Description |
|---|---|
| `ralph-lisa task new <slug>` | Open sub-slice (§122 capability detect) |
| `ralph-lisa task list` | List all sub-slices |
| `ralph-lisa task capability ack-user --signature "<token>"` | User explicit testing-capability ack (§122 trust-boundary) |
| `ralph-lisa task capability ack-install --tier <X>` | Ack install plan |
| `ralph-lisa task capability ack-downgrade --tier <X> --consent "..."` | Ack downgrade |
| `ralph-lisa task complexity-judge --slice <X> --json` | LLM complexity judgment (§123) |
| `ralph-lisa task complexity-verify --slice <X>` | Deterministic complexity verify (hard gate) |
| `ralph-lisa task-state list\|set` | Task-level state (done/failed/pending-user) |
| `ralph-lisa clarify --start` | Enter R0 [CLARIFY] 5-stage grill (§128 complex task requirement) |
| `ralph-lisa clarify --commit --understanding "..." --covered "..." --negative-scope "..." --risks "..."` | Finalize clarify |
| `ralph-lisa clarify --skip` | Simple tasks skip R0 (warning, no block) |
| `ralph-lisa ack-scope-expansion --reason "..."` | User acks Lisa-expanded scope |
| `ralph-lisa ack-shape-change` | User acks schema/shape change |

---

## Quality gates / tests

| Command | Description |
|---|---|
| `ralph-lisa quality-gate` | Full gate (plan validate + npm test across packages) |
| `ralph-lisa gate` | Alias |
| `ralph-lisa quality-gate --strategy full\|smoke-only\|affected` | Strategy selection |
| `ralph-lisa quality-gate --full-uaot` | + watcher health verification |
| `ralph-lisa quality-gate --warn` / `--block` | Mode override (default block) |
| `ralph-lisa test-cascade --strategy full\|smoke-only\|halt-on-fail [--dry-run] [--json]` | Run cascade |
| `ralph-lisa test-cascade --tier <X>` | Filter by tier (**only works in projects with `testTiers` configured in .ralph-lisa.json**) |
| `ralph-lisa smoke-check` | Project-level smoke (requires RL_SMOKE_CMD) |
| `ralph-lisa smoke-test` | Run predefined smoke scenarios |
| `ralph-lisa smoke-fail list\|clear` | Mid-process smoke failures management (§150) |
| `ralph-lisa test-report` | Latest test report |
| `ralph-lisa test-report --list` | All reports |
| `ralph-lisa test-spec-eval --slice <X>` | Test spec static rule audit |
| `ralph-lisa test-log` | View .dual-agent/test-execution-log.jsonl |
| `ralph-lisa tier-assertion-lint` | §194 tier-assertion-strength static audit |
| `ralph-lisa visual-evidence add --file <screenshot>` | UI/web slice add screenshot evidence (§151) |
| `ralph-lisa visual-baseline` | Visual regression baseline management |
| `ralph-lisa loopback list\|inspect <step>` | §79 loopback state inspection |
| `ralph-lisa phase-gate` | Single phase-gate run |

---

## Release gates

| Command | Description |
|---|---|
| `ralph-lisa dogfood-gate run [--strict]` | End-to-end enforcement scenarios (§139) |
| `ralph-lisa doc-update-gate run [--strict] [--doc-set <paths>]` | Doc claim vs code impl drift detector (§138) |
| `ralph-lisa release-report emit --slug <X> [--format md\|json\|both]` | Aggregate 6 evidence categories into release report (§140) |
| `ralph-lisa plan validate` | PLAN.md SOR currency / 5-col table / phase-coverage validation |
| `ralph-lisa plan validate-phase-tests --slice <X>` | §145 Rule 10 phase-test-coverage in isolation |
| `ralph-lisa gate-manifest --type <cli\|web-app\|mobile-app\|library\|service>` | Write project_type to gate-manifest.json (§152) |

---

## Policy / health

| Command | Description |
|---|---|
| `ralph-lisa policy check ralph\|lisa` | Run policy.ts checkRalph/Lisa in isolation (standalone subcmd always exits non-zero on violation, regardless of RL_POLICY_MODE) |
| `ralph-lisa policy check-consensus` | Both [CONSENSUS]? |
| `ralph-lisa policy check-next-step` | Comprehensive pre-next-step check (consensus + policy) |
| `ralph-lisa doctor` | Dependencies + watcher health + sandbox + artifacts full check |
| `ralph-lisa doctor --strict` | CI mode (missing → exit 1) |
| `ralph-lisa daemon-health-check` | wecom-bot daemon pid/heartbeat check |
| `ralph-lisa lisa-watchdog tick` | Lisa silent-stall detection (one-shot) |
| `ralph-lisa repeat-edit-check` | Detect same-file edited 3 rounds in a row |
| `ralph-lisa watcher-unread-age-check` | wecom-feedback unread aging detection |

---

## WeCom / Lark / DingTalk integration

| Command | Description |
|---|---|
| `ralph-lisa wecom-feedback unread` | View unread WeCom inbox |
| `ralph-lisa wecom-push --file <f>` | Push message to user (fire-and-forget) |
| `ralph-lisa wecom-push --body "..."` | Short message |
| `ralph-lisa wecom-bot start\|stop` | wecom-bot daemon control |
| `ralph-lisa voice transcribe` | Voice STT (macOS Swabble) |
| `ralph-lisa lark-push --webhook <url> [--secret <s>] --file <f>` | Lark outbound push (§63) |
| `ralph-lisa dingtalk-push --webhook <url> [--secret <s>] --file <f>` | DingTalk outbound push (§64) |
| `ralph-lisa oauth-authorize-url --provider github` | OAuth first-leg URL (§65) |
| `ralph-lisa oauth-test --code <code>` | OAuth full-flow test |

---

## Token / data loop

| Command | Description |
|---|---|
| `ralph-lisa token-usage show\|summary` | Token usage query (§55) |
| `ralph-lisa token-record --agent X --role X --prompt N --completion N` | Programmatic record (§56) |
| `ralph-lisa token-parse-pane --file <pane.log>` | Extract token from tmux pane log (§57) |
| `ralph-lisa token-capture --pane 0\|1` | Auto-wire §57 → §56 (§58) |
| `ralph-lisa session-capture --agent claude\|codex --role ralph\|lisa` | Extract token from claude/codex session jsonl (§61) |
| `ralph-lisa weekly-digest [--days N] [--push] [--since/--until]` | Weekly digest markdown (§59) |
| `ralph-lisa daily-summary [--date YYYY-MM-DD] [--push]` | Daily digest |
| `ralph-lisa my-stats` | Personal stats |
| `ralph-lisa user-identity [--refresh]` | git user.email/name capture (§54) |
| `ralph-lisa user-behavior-analyze` | User behavior analysis (§203) |
| `ralph-lisa user-behavior-backfill` | Historical data backfill |
| `ralph-lisa reliability-metrics` | Reliability metrics |
| `ralph-lisa telemetry-push` | Telemetry push |

---

## Session / state debug

| Command | Description |
|---|---|
| `ralph-lisa state-dir` | Resolve current stateDir |
| `ralph-lisa rll-root` | Resolve current RLL project root |
| `ralph-lisa session-role` | Current session's role |
| `ralph-lisa rebind` | Rebuild session anchor (§206) |
| `ralph-lisa sync-project` | Install / refresh project artifacts |
| `ralph-lisa add-context --file <f>` | Temporarily add context file for agent |
| `ralph-lisa preset show [--preset <name>] [--json]` | List / view specific preset |
| `ralph-lisa preset audit --file <body.md> --preset <name> [--json]` | Lisa-side preset audit |
| `ralph-lisa skill list\|run <name>` | Skill system |
| `ralph-lisa contract-check` | §80 cross-module-contract-check |
| `ralph-lisa knowledge-freshness` | §128 living-memory knowledge freshness check |

---

## Other CLIs

| Command | Description |
|---|---|
| `ralph-lisa --help` / `-h` | Help |
| `ralph-lisa --version` / `-v` | Version |
| `ralph-lisa run-lisa [--state-dir <d>]` | One-shot Lisa run (programmatic) |
| `ralph-lisa watch-lisa` | Watcher-triggered Lisa (debug) |
| `ralph-lisa review` | Review helper |
| `ralph-lisa notify` | Notify |
| `ralph-lisa emergency-msg` | Emergency message |
| `ralph-lisa agent-stuck-push` | agent_stuck event push |
| `ralph-lisa inbox-wake-decide` | inbox-wake routing decision |
| `ralph-lisa update-watcher` | Watcher upgrade |
| `ralph-lisa remote` | Remote access |
| `ralph-lisa progress` | Progress tracking |
| `ralph-lisa report` | Report |
| `ralph-lisa analyze` | Static analysis |
| `ralph-lisa baseline` | Baseline management |
| `ralph-lisa affected` | Affected files calculation |
| `ralph-lisa test` | Test orchestration |
| `ralph-lisa llm-judge` | LLM-as-judge subtool |
| `ralph-lisa ai-output-check` | AI output quality check |

---

## Environment variables (most common)

| Variable | Default | Description |
|---|---|---|
| `RL_POLICY_MODE` | `block` | `off` / `warn` / `block`; §133 default block |
| `RL_RALPH_GATE` | `auto` | Submit-time gate run: `true` / `false` |
| `RL_GATE_COMMANDS` | (empty) | Custom gate command list (overrides .ralph-lisa.json) |
| `RL_SMOKE_CMD` | (empty) | Mid-process smoke command (§150) |
| `RL_SMOKE_AUTO_LOOP_OFF` | `0` | Disable §150 auto smoke loop |
| `RL_CHECKPOINT_ROUNDS` | `0` | Pause for human review every N rounds |
| `RL_LOG_MAX_MB` | `5` | Pane log truncation MB threshold |
| `RL_LISA_WATCHDOG_THRESHOLD_SEC` | `1800` | Lisa silent-stall threshold |
| `RL_LISA_WATCHDOG_OFF` | `0` | Disable Lisa watchdog |
| `RL_VISUAL_EVIDENCE_OFF` | `0` | Disable §151 visual-evidence enforcement |
| `RL_TEST_EXECUTION_LOG_OFF` | `0` | Disable test-execution-log.jsonl writes (testing) |
| `RL_TEST_RESULTS_VERIFY_OFF` | `0` | Disable §137 verifier |
| `RL_LISA_VERIFIED_OFF` | `0` | Disable §144 Lisa Verified cite requirement |
| `RL_LISA_ATTEST_OFF` | `0` | Disable §149 Lisa attest |
| `RL_RALPH_ATTEST_OFF` | `0` | Disable §149 Ralph attest |
| `RL_R1_FIRST_TAG_OFF` | `0` | Disable §202 first-tag enforcement |
| `RL_TASK_CAPABILITY_GATE` | `auto` | §122 mode: `auto` / `block` / `off` |
| `RL_PROJECT_TYPE_TIERS_OFF` | `0` | Disable §152 archetype baseline hint |
| `RL_PRESUBMIT_UNREAD_CHECK` | `on` | Pre-submit WeCom unread check |
| `RL_PLAN_GATE` | `on` | plan-keeper gate |
| `RL_LEGACY_SESSION_OK` | `0` | Skip §206 session-anchor validation (legacy sessions only) |
| `RL_STATE_DIR` | (auto) | Force-specify stateDir |
| `RL_SESSION_ID` | (auto) | Session id |
| `RL_GATE_INCLUDE_OPTIONAL` | `false` | Cascade includes Required=✗ rows |
| `RL_TDD_MODE` / `RL_TDD_COMPLEX_THRESHOLD` | `off` / `4` | §102 auto-TDD mode / complexity threshold |

Audit-named opt-out envs default `OFF` suffix means setting them disables the corresponding enforcement. Once set, these envs go into the audit log so debugging can pinpoint which rule the user bypassed.

Full env list: `cli/src/state.ts` + `cli/src/policy.ts` process.env references.
