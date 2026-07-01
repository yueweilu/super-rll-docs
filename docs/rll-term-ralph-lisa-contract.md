# rll-term ↔ ralph-lisa — interface contract

**Status:** authoritative spec (super-rll side). **Scope:** the boundary between
`rll-term` (the WezTerm-embedded `wezterm-rll` Rust coordinator) and the
`ralph-lisa` CLI (super-rll). Pinned by `cli/src/test/rll-term-contract.test.ts`.

`rll-term` lives in `~/MyProjects/ChatLLM/wezterm/wezterm-rll/` (a Rust crate). It
is a **thin, cross-platform coordinator**: it drives WezTerm panes natively and
delegates *all loop state* to the `ralph-lisa` CLI. It does **not** embed
`TurnCoordinator` (`turn_dispatcher.rs`: "不嵌入 TurnCoordinator,直接 spawn 既有
CLI"). It replaces the legacy bash watcher (the process-exhaustion source) with a
native Rust poll+dispatch loop.

```
  ┌─────────────────────────── rll-term (Rust, in WezTerm) ───────────────────────────┐
  │  agent_config.rs   → send-text "claude …" / "codex" into pane (native PTY render)  │
  │  coordinator.rs    → poll pane text → tag_detector finds [TAG] → slice body        │
  │  turn_dispatcher.rs→ spawn `ralph-lisa submit-{ralph,lisa} --file <body>`          │
  └───────────────┬───────────────────────────────────────────────┬───────────────────┘
   reads          │ turn.txt                          spawns CLI   │ submit-* --file
                  ▼                                                 ▼
  ┌─────────────────────────── ralph-lisa CLI (super-rll, Node) ──────────────────────┐
  │  SOLE STATE HOLDER: .dual-agent/turn.txt, work.md, review.md, history.md, gate …   │
  └────────────────────────────────────────────────────────────────────────────────────┘
```

## 1. State ownership

The `ralph-lisa` CLI is the **single source of truth** for all loop state
(`.dual-agent/`). `rll-term` holds **zero** loop state — every read is a file read
or a CLI call; every write goes through the CLI. This keeps one authority and lets
`rll-term` stay a thin driver.

## 2. Read path — `turn.txt`

`rll-term` learns whose turn it is by reading `.dual-agent/turn.txt` **directly**
(not by spawning the CLI — deliberately, to avoid a spawn race).

- **File:** `<state_dir>/turn.txt` where `state_dir` = `$RL_STATE_DIR` or `.dual-agent`.
- **Values:** exactly `ralph` or `lisa` (trimmed). Any other value is an error on
  the rll-term side.
- **Default:** absent/empty file ⇒ `ralph` (CLI `getTurn` default).
- **Source of truth:** `cli/src/state.ts` `getTurn` / `setTurn`.

## 3. Submission detection — pane-text `[TAG]` scraping

`rll-term` detects a completed submission by **polling the agent pane's rendered
text** and finding the latest `[TAG]` header (`tag_detector`), then slicing the
submission body out of the pane and writing it to a temp file.

- **Tag set:** the `[TAG]` must be one of the canonical loop tags. **Source of
  truth:** `cli/src/state.ts` `VALID_TAGS` (the `|`-delimited whitelist) and
  `TAG_RE = ^\[(VALID_TAGS)\]`. The whitelist is (13 tags, kept in sync with the
  source constant by `rll-term-contract.test.ts`):
  `TDD-PLAN`, `PLAN`, `RESEARCH`, `CODE`, `FIX`, `PASS`, `NEEDS_WORK`, `CHALLENGE`, `DISCUSS`,
  `QUESTION`, `CONSENSUS`, `CLARIFY`, `NEEDS_USER_ACK`.
- **Coupling note:** this path reads *rendered* pane text, so it is coupled to how
  submissions render. See **Gaps**.

## 4. Write path — `submit-{ralph,lisa} --file`

To flip a turn, `rll-term` spawns the CLI:

- `ralph-lisa submit-ralph --file <body>` → flips turn to **lisa**.
- `ralph-lisa submit-lisa --file <body>` → flips turn to **ralph**.
- **Env:** sets `RL_STATE_DIR=<state_dir>`, and **removes `TMUX`** from the child
  env. The `TMUX` removal is required because a tmux session's `RL_STATE_DIR` wins
  over the shell env; without unsetting `TMUX`, the CLI would resolve state via the
  tmux session context instead of the intended `RL_STATE_DIR`.
- **Success:** exit code `0`.
- **Source of truth:** `cli/src/cli.ts` `submit-ralph` / `submit-lisa` cases;
  rll-term side `turn_dispatcher.rs`.

## 5. Body format — `[TAG] one-line summary`

The `--file` body MUST start with `[TAG] one-line summary` on the first line,
followed by the rest of the submission. The CLI enforces that the **first tag** is
a member of `VALID_TAGS` (the `§202` first-tag rule); rll-term reformats its sliced
pane body into this canonical form before calling `submit-*`
(`coordinator.rs` body reformatting).

## 6. Feedback — exit code + streams

The CLI returns:
- **`exit_code`** — `0` = accepted/flipped; non-zero = rejected (policy block,
  gate failure, validation error, etc.).
- **stdout / stderr** — human-readable detail.

On non-zero exit, rll-term records a `DispatchFailed { exit_code, stderr }`. See
**Gaps** for the truncation limitation.

## 7. Stability guarantees vs. internal

**Stable contract (super-rll commits to keep these stable for rll-term):**
- `turn.txt` location + the exact tokens `ralph` / `lisa`.
- `submit-ralph` / `submit-lisa` subcommand names + the `--file <path>` signature.
- The `VALID_TAGS` whitelist + the first-tag (`§202`) requirement.
- Honoring `RL_STATE_DIR`.

**Internal (may change without notice — rll-term must NOT depend on):**
- `work.md` / `review.md` / `history.md` internal formatting.
- Gate/policy internals, cascade behavior, exact stdout phrasing.
- Pane *rendering* details (see Gaps — pane scraping is rll-term's own risk).

## Trust boundary / security

The contract is also a trust boundary; the following invariants gate what can
enter the loop and how:

- **`§202` tag-gating** — the CLI rejects any submission whose first line is not a
  `[VALID_TAG]`. This bounds what rll-term (or anything driving the CLI) can inject
  into the loop: arbitrary text cannot masquerade as a turn submission.
- **`TMUX` removal / `RL_STATE_DIR` isolation** — prevents a stale ambient tmux
  session from hijacking which state dir a submission lands in (cross-session
  contamination guard).
- **`--file` (not shell args)** — the submission body is passed by **file path**,
  not interpolated into a shell command, so body content (backticks, `$()`, etc.)
  cannot cause shell injection in the dispatch.

## Gaps (known, for future hardening)

- **G1 — unstructured block reasons.** rll-term only gets `exit_code` + (truncated,
  ~120-char) stderr; it cannot structurally distinguish a *fixable* policy block
  from a *fatal* error. Hardening: have `submit-*` emit a machine-parseable result
  (`--json` or per-class exit codes).
- **G2 — pane-text tag scraping fragility.** Detection couples to rendered pane
  text; a rendering change can break `tag_detector`. Hardening: structured turn
  signalling instead of scraping.
- **G3 — no version negotiation.** rll-term does not check the `ralph-lisa` version
  it drives; a contract-breaking CLI change is silent until the e2e test runs.
  Hardening: a `ralph-lisa --contract-version` handshake.

## Cross-checks

- super-rll side: `cli/src/test/rll-term-contract.test.ts` parses `VALID_TAGS` and
  the `submit-*` subcommands from source and asserts this doc matches them.
- rll-term side: `wezterm-rll/tests/mode_a_route4_e2e.rs` runs the **real**
  `ralph-lisa` binary (`init` → `next-step` → `submit-ralph` → `turn.txt` flips).
