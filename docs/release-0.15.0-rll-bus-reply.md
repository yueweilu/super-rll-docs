# Release 0.15.0 — RLL-bus outbound reply (SR2)

> **cli 0.14.0 → 0.15.0** (minor — new SR2 outbound contract + behavior + artifacts).
> Shipped 2026-06-07. Completes super-rll's RLL-bus round-trip (`SYNC-CONTRACT-multisession-feishu.md`).

## What this release adds

The **outbound** half of super-rll's gate-aware RLL-bus hook. A **bus-injected** slice
(one with an SR3 corr_id sidecar from SR1 / 0.14.0), on **any terminal state**, produces a
C2 `task-reply` to `.dual-agent/bus-outbox/<corr_id>.json` for rll-term's RT3 to send.
**Never silent** — every terminal state of a bus-injected slice replies exactly once.
Transport-agnostic: super-rll never connects feishu / defines the envelope / touches 喵吉.

### Terminal-state → reply-status mapping

| terminal state | reply `status` | hook |
|---|---|---|
| mutual CONSENSUS (§70 passed) | `done` | `handleMutualCompletion` wrapper |
| cascade / gate fail | `failed` | same wrapper |
| 8×NEEDS_WORK deadlock | `blocked` | deadlock detection (commands.ts) |
| Ralph `[CHALLENGE]` | `needs-discussion` | Ralph-submit (commands.ts) |

### Reply record (`.dual-agent/bus-outbox/<corr_id>.json`)

```jsonc
{ "corr_id": "<full id>", "to": "<original from>",
  "status": "done|failed|blocked|needs-discussion",
  "summary": "", "evidence": ["history.md#roundN", "gate-results.md"] }
```
`to` = the original task's `from`; paired by `corr_id`. `ralph-lisa bus-status` surfaces the
outbox alongside the queue + sidecars.

## Implementation notes

- **Single chokepoint** for done/failed: `handleMutualCompletion` is now a thin wrapper around
  `handleMutualCompletionCore` — after the core settles the §70 terminal status, the wrapper
  reads it once and emits. Avoids instrumenting every internal status-write; the core is
  unchanged (zero §70 behavior change), and reply emission is try/caught (never breaks §70).
- **No-op for non-bus** (human-started) slices; **idempotent** (a slice already in a terminal
  status is not re-emitted).
- **Reverse-lookup**: `emitTaskReply` finds the corr_id whose SR3 sidecar `.step` matches the
  closing step, restart-safe.

## Tests

9 cases (C1-C9) in `cli/src/test/rll-bus-reply.test.ts` — C6/C7 drive the **real**
`cmdSubmitLisa` (deadlock, `RL_DEADLOCK_THRESHOLD=1`) and `cmdSubmitRalph` ([CHALLENGE]) paths,
not mocks. Full cli suite 2628/2628, zero regression.

## RLL-bus status after this release

- **SR1** (0.14.0): inbound injection (`bus-inject`) + corr_id sidecar — DONE.
- **SR2** (0.15.0, this release): outbound reply — DONE. The inbound→run→reply round-trip is
  functionally complete on super-rll's side.
- **SR4** (approval gate for outward actions): not yet — follow-up.
- **Live round-trip** also depends on rll-term wiring RT2 (calls `bus-inject`) + RT3 (sends
  from `bus-outbox`) against `docs/rll-bus-injection-contract.md`.
