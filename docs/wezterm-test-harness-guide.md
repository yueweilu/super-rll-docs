# wezterm-test harness — flags, macOS caveats & evidence convention

Companion to [`docs/test-author-guide.md`](./test-author-guide.md) (which covers
macro structure and step types). This guide focuses on the CLI flags, the macOS
screenshot caveats, and the evidence convention surfaced by the CCL handoff
(`docs/superrll-handoff-2026-05-31.md`).

The skill: `ralph-lisa skill wezterm-test --macro <path> [flags]`
(implementation: `cli/src/wezterm-test-skill.ts`).

## CLI flags

| Flag | Purpose |
|------|---------|
| `--macro <path>` | Run the JSON macro at `<path>` and report per-step pass/fail (required). |
| `--json` | Emit the full `RunResult` as JSON instead of the human summary. |
| `--keep-pane` | Do not kill spawned panes after the run (for post-mortem inspection). |
| `--env KEY=VAL` | **(§B5)** Forward an env var to every spawned pane. Repeatable. See below. |
| `--ansi-cast <path>` | **(§B7)** Write each spawned pane's ANSI-preserving text to `<path>`. See below. |
| `--macro-schema` | **(§B1)** Print the valid macro step types + fields (JSON) and exit. |

### `--env KEY=VAL` (B5)

A wezterm-spawned pane inherits the **mux server's** env, *not* the env exported
by the wrapper that invoked the skill. So a wrapper's `export CCL_TEST_DEBUG_LOG=…`
is invisible inside the macro, and `$CCL_TEST_DEBUG_LOG` resolves to empty.

`--env KEY=VAL` (repeatable) forwards vars by spawning `env K=V … <shell>`. Each
`K=V` is passed as a separate argv element to `env(1)` — **never through a shell**
— so shell metacharacters in the value are inert (no injection). `KEY` must match
`[A-Za-z_][A-Za-z0-9_]*`.

```bash
ralph-lisa skill wezterm-test --macro m.json --env CCL_TEST_DEBUG_LOG=/tmp/ccl.log --env FOO=bar
```

### `--ansi-cast <path>` (B7) — capture output without screenshots

`--ansi-cast <path>` writes each spawned pane's output **with ANSI escape
sequences preserved** (via `wezterm cli get-text --escapes`) to `<path>`. This is
the **permission-free** way to capture what a test pane displayed — it does **not**
use `screencapture` and therefore needs no macOS Screen Recording permission and
no foreground window. Render the cast later by `cat`-ing it into a fresh pane.

(The ordinary `get-text` used for `assert-contains` stays stripped; `--ansi-cast`
is a separate ANSI-preserving path.)

## macOS caveats (screenshot route)

These bite only if you try the **screenshot** route. Prefer `--ansi-cast` (above),
which sidesteps all of them.

### `window_id` ≠ macOS CGWindowID (B4)

`wezterm cli list` returns a `window_id` (e.g. `0`) that is **wezterm's internal
mux id**, NOT a macOS `CGWindowID`. Passing it to `screencapture -l <window_id>`
fails with *"could not create image from window"*. To screenshot a specific
window you must resolve the native CGWindowID separately (e.g. via `osascript`) —
do not feed wezterm's `window_id` to `screencapture -l`.

### headed-mode / active-tab / mux-only (B8)

- A pane spawned into the mux server has **no GUI window** unless a `wezterm-gui`
  process is running (`open -a WezTerm`); in mux-only/daemon mode `screencapture`
  has nothing to capture.
- Even with the GUI up, the spawned pane is usually **not the active tab** — the
  foreground tab stays the user's main session, so a full-screen `screencapture`
  shows a different tab, not the test pane.
- Because of both, the screenshot route is unreliable on macOS. Use `--ansi-cast`
  as the headed-mode-independent, permission-free alternative.

## Evidence convention (D1–D4)

When recording evidence for a wezterm-driven test, prefer in this order:

- **D1 — `pane.cast` (ANSI text dump) = primary.** ANSI-preserving capture from
  `--ansi-cast` / `get-text --escapes`. Does not depend on foreground window or
  Screen Recording permission. This is the canonical evidence artifact.
- **D2 — `screenshot.png` = supplementary, best-effort.** Only meaningful when the
  GUI is up and the pane is foregrounded (see B8). Treat as optional.
- **D3 — `ccl-debug.log` = internal trace.** The tool-under-test's own debug log
  (e.g. via the `--env`-forwarded `CCL_TEST_DEBUG_LOG`); for diagnosing the
  subject, not the harness.
- **D4 — `run.json` = macro step pass/fail.** The skill's `RunResult` (`--json`):
  the authoritative per-step pass/fail record.
