# Non-coding task fast-path quickstart (§207)

This guide shows how to run a sub-slice through Ralph-Lisa without paying the full TDD ceremony when the work is **review-only**, **doc-only**, or **process-only**. It is for tasks that produce no production code change. For any sub-slice that touches `cli/src/**`, `wecom-bot/src/**`, or any other code path, stay on the default `code-task` track and use the standard TDD-first protocol from CLAUDE.md.

## TL;DR — 1-minute checklist

1. Open the slice with an explicit `--type`:
   ```bash
   ralph-lisa next-step "review-d4-retro" --type review-task
   ```
2. In every `[CODE]` / `[FIX]` submission body, include the explicit declaration line:
   ```
   Task type: review-task
   ```
3. Provide the per-type evidence (see matrix below).
4. Don't touch forbidden paths. If you need to, **open a new code-task slice** — do not try to inline a code change into a non-code slice.

## The 4-class taxonomy

| `task_type`     | What it is                            | Allowed-write whitelist                                              |
| --------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `code-task`     | Default. Production code change.      | _anywhere_ (full TDD applies)                                        |
| `review-task`   | Read code, write a review/report.     | `docs/**`, `.dual-agent/**`                                          |
| `doc-task`      | Write/update documentation.           | `docs/**`, `.dual-agent/**`, `CLAUDE.md`, `CODEX.md`, `README.md`, top-level `*.md` |
| `process-task`  | Edit RLL process / `.rll/PLAN.md`.    | `.rll/**`, `.dual-agent/**`, `CLAUDE.md`, `CODEX.md`, `docs/**`      |

The whitelist is enforced by the `task-type-file-mismatch` policy rule on every Ralph submit. It is **mode-locked** — `RL_POLICY_MODE=warn` does NOT bypass it (this is by design; trust-boundary mirroring §202/§205).

## Source-of-record (SoR) read order

The submit-time policy resolves `task_type` in this order:

1. `.dual-agent/task-type-<step>.json` (written by `next-step --type`)
2. `Task type:` line in the submission body
3. Auto-infer from current diff (default `code-task` if any path is outside all non-code whitelists)

PLAN.md slice metadata is NOT a source — declare via `next-step --type` (writes SoR) or by including `Task type:` in the submission body.

If the persisted SoR JSON exists and the body's `Task type:` line disagrees, the submit is blocked with `task-type-declaration-mismatch`. Update the SoR via `ralph-lisa task-type-change --reason "..."` rather than editing the body to mismatch.

## Per-type evidence matrix

| Task type     | Required body fields                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `review-task` | `Reviewed-PLAN-rows:`, `Reviewed-test-files:`, `Pass-Rationale:` or `NeedsWork-Rationale:`, `Verified:` |
| `doc-task`    | `Files:`, brief summary (≥20 chars of free text)                                                  |
| `process-task`| `Files:`, `rationale:` or `Process-Change-Reason:`; **`Process-Change-Reason:` is required** when CLAUDE.md or CODEX.md is in the diff |
| `code-task`   | Full §149 attest (`Test-Process:`, `Test-Cases:`, `Test-Results:`)                                |

Missing fields → `non-code-task-evidence-missing` block.

## What the fast-path skips

- ❌ Auto-tdd-plan artifact persistence (§102) — no C-row table required
- ❌ Per-row complexity-verify Required-coverage check (no C-rows to cover)
- ❌ §70 cascade gate against a non-existent test table

## What the fast-path STILL enforces

- ✅ `task-type-file-mismatch` (you cannot edit `cli/src/**` from a `review-task`)
- ✅ `task-type-declaration-mismatch` (body must match persisted SoR)
- ✅ `non-code-task-evidence-missing` (per-type evidence required)
- ✅ §133 policy block default, §144 Lisa `Verified:` cite, §149 bidirectional attest (where applicable)
- ✅ Turn discipline + mutual CONSENSUS

## Examples

### Review-task submission body skeleton

```
[CODE]
Task type: review-task

## Summary
<what you reviewed and concluded>

Reviewed-PLAN-rows: §207-R1
Reviewed-test-files: docs/d4-review-startup-retrospective.md:1-220
Pass-Rationale: <≥40 chars + cite>
Verified: docs/d4-review-startup-retrospective.md
```

### Doc-task submission body skeleton

```
[CODE]
Task type: doc-task

## Summary
Added §207 quickstart explaining the non-code-task fast-path...

Files: docs/non-coding-task-quickstart.md
```

### Process-task submission body skeleton (touching CLAUDE.md)

```
[CODE]
Task type: process-task

## Summary
Document the §207 protocol in the project charter.

Files: CLAUDE.md, .rll/PLAN.md
Process-Change-Reason: §207 closed; protocol needs to be discoverable from the charter so future Ralph sessions can find it without grepping commit history.
```

## What if classification flips mid-slice?

You started the slice as `review-task`, but Lisa narrowed and now you need to touch `cli/src/foo.ts`. **Do not just add the file** — the policy will block your next submit. Instead:

1. Finish the review-task scope cleanly + reach mutual CONSENSUS.
2. Open a new code-task slice: `ralph-lisa next-step "fix-foo-from-review" --type code-task`.
3. Proceed with full TDD on the code change.

This keeps each slice's scope honest and traceable in PLAN.md.

## Opt-out

There is **no opt-out**. §207 task-type rules are mode-locked (trust-boundary, mirroring §202/§205). `RL_POLICY_MODE=warn` does not bypass them, and there is no `RL_TASK_TYPE_OFF` env. If you need to change scope, open a new slice with the correct `--type` rather than disabling enforcement.

## See also

- `CLAUDE.md` §200/§202/§205/§207 — protocol charter
- `.rll/PLAN.md` §207 slice — design rationale and Lisa narrows
- `docs/d4-review-startup-retrospective.md` — motivating user-reported 14-round / 1-hour stall
