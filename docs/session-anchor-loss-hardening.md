# session-anchor loss hardening + `ralph-lisa reanchor`

> Fixes a 3rd-recurrence bug: after an upgrade/`doctor`/`sync-project` cycle, a session's
> `.dual-agent/.session-anchor` (§206 canonical-root marker) went missing → session
> reported "corrupt" (`resolveRllRoot` → `no-anchor`). Shipped 2026-06-07. Slice
> `session-anchor-loss-hardening`, mutual CONSENSUS R8.

## Root causes

`.session-anchor` holds `{session_id, init_at, init_user_email_hash, task_signature}` and is
how `resolveRllRoot` identifies the canonical session. Two real mechanisms lost it:

- **M1 — `.dual-agent/` is gitignored** (`.gitignore:2`). A `git clean -fdx` (a common
  "pristine tree before rebuild" upgrade step; `-x` is required to hit ignored files)
  deletes `.dual-agent/` including the anchor. This is *not* caused by `doctor`/`sync-project`
  (verified: both preserve the anchor) — those only *surface* the loss.
- **M2 — silent swallow in `cmdInit`.** `cmdInit` did `fs.rmSync(.dual-agent)` FIRST, then
  wrote the anchor inside a `try { … } catch { console.error("warning") }`. If the write
  threw (e.g. `require("./rebind.js")` unresolved during a partial rebuild, git unavailable,
  or validation), init "succeeded" but left an **anchor-less, corrupt** `.dual-agent`.

## What changed

**Prevention (`cmdInit`)** — build + **pure-validate** the anchor BEFORE the destructive
`rmSync`. If that fails, init aborts with a non-zero exit and leaves the existing
`.dual-agent` **untouched** (no wiped-then-failed half-state). After writing, a **read-back
verification** makes init fail-loud rather than silently declare success on a missing anchor.

**Recovery (NEW `ralph-lisa reanchor`)** — recovers a lost/corrupt anchor **in place** without
wiping the session:

```
ralph-lisa reanchor [--force]
```

- Writes a fresh valid `.session-anchor` into the cwd's existing `.dual-agent`, **preserving**
  `history.md` / `round.txt` / `work.md`. Reuses `task.md` for the fingerprint; rebinds tmux env.
- Recovers a **no-anchor** state AND a **corrupt/unparseable** anchor with no `--force` needed.
- Refuses to overwrite a **healthy** (valid) anchor unless `--force` (no accidental identity churn).
- Unlike `ralph-lisa init`, reanchor is **non-destructive** — it keeps your session.
- `RL_INIT_NO_TMUX_BIND=1` opts out of the tmux env rebind (test-isolation safety).

**Discoverable recovery hints** — the previous `no-anchor` / parse-error diagnostics steered
users to `ralph-lisa rebind`, which *refuses* without an anchor (a dead end). They now
recommend `ralph-lisa reanchor` first (in-place, keeps history) and mark `init` as
DESTRUCTIVE (recreate-from-scratch). `rebind`'s own missing-anchor error does the same.

## If you hit "session corrupt" / anchor missing

```
cd <your project>
ralph-lisa reanchor        # recovers in place, keeps history
```

Only use `ralph-lisa init` if you actually want to wipe and recreate the session.

## Tests

`cli/src/test/session-anchor-loss-hardening.test.ts` — 10 cases (C1-C9 + C5b): pure
validation, cmdInit pre-wipe byte-unchanged (M2 pin) + read-back fail-loud, reanchor
in-place recovery (incl. corrupt/structurally-invalid without `--force`), and the
non-dead-end recovery messages.
