# Release 0.14.0 — RLL-bus inbound injection (SR1 + SR3)

> **cli 0.13.0 → 0.14.0** (minor, §143 Rule 1: three new cli sub-commands).
> Shipped 2026-06-06. Part of the multi-session feishu协同 (`SYNC-CONTRACT-multisession-feishu.md`).

## What this release adds

super-rll's **gate-aware RLL-bus inbound hook** — the half rll-term's RT2 was blocked on.
rll-term hands a `type=task` to super-rll; it becomes a **normal, fully-gated RLL slice**
(R1 PLAN → §122/§123/§149/§70) without breaking rounds/gates and without preempting an
in-flight slice. Transport-agnostic / local-backend: super-rll does **not** connect to
feishu, define the `[RLL-EVENT]` envelope, or touch 喵吉 (rll-term owns transport).

### New CLI sub-commands

| command | purpose |
|---------|---------|
| `ralph-lisa bus-inject --corr-id --from --requested-by --ts --body\|--file` | SR1 inbound injection — validate the C2 task body + flag/body mismatch reject + caller-supplied `--ts` (no module clock) + idempotent on full corr_id + untrusted body stored inert → enqueue (inbox record + FIFO + SR3 sidecar) |
| `ralph-lisa bus-next` | dequeue the oldest queued task into a gated slice, **only when idle** (non-preemption) + **fail-safe** (slice-creation failure never loses the queued task); exits non-zero on creation failure |
| `ralph-lisa bus-status` | list the inbound queue + corr_id sidecars |

### New artifacts

- `.dual-agent/bus-inbox/<corr_id>.json` — the injected task record (body stored as inert data).
- `.dual-agent/bus-queue.json` — FIFO order of queued corr_ids.
- `.dual-agent/bus-corr/<corr_id>.json` — **SR3 durable sidecar** (`{corr_id, from, requested_by, ts, status, step}`), restart-safe; the handle the outbound reply (SR2) will read.

### Interface contract for rll-term

`docs/rll-bus-injection-contract.md` is the authoritative SR1 interface rll-term's RT2
builds against (not super-rll source). It is **drift-guarded**: a `contract-doc-matches-cli`
test pins the documented flags against the real `bus-inject --help`.

## Implementation notes / disciplines

- **No module clock**: `--ts` is caller-supplied (the `[RLL-EVENT] ts=`); super-rll never
  reads the clock for event metadata (resume/test-friendly).
- **Non-preemption**: `bus-next` pops only when the loop is idle (no in-flight slice OR the
  current step is §70-terminal); its own `isLoopIdle` predicate is the dequeue authority
  (it calls `cmdStep --force`, intentionally skipping the interactive consensus guard).
- **Fail-safe atomicity**: `bus-next` invokes slice-creation first; only on success does it
  pop the FIFO + bind the sidecar — a throwing step-creation leaves the queue + sidecar
  untouched, so an injected task is never silently lost.
- **Untrusted body**: the `task.body` is treated as untrusted (prompt-injection) — stored as
  data, never shell-interpolated or executed.

## Tests

10 cases (C1-C9 + C6b atomicity) in `cli/src/test/rll-bus-inject.test.ts`; full cli suite
2619/2619, zero regression. Four substantive review narrows adopted during development
(ts no-clock, non-preemption guard, C6 non-vacuity, busNext task-loss atomicity).

## Not in this release (follow-ups)

- **SR2 — outbound reply**: on a terminal state (CONSENSUS→done / cascade-fail→failed /
  8×NEEDS_WORK→blocked / [CHALLENGE]→needs-discussion) produce a C2 `task-reply` for
  rll-term to send. Extends `handleMutualCompletion` (§70). Next slice.
- **SR4 — approval gate** for outward actions (reuse 喵吉 approval_inbox). Later.
