# RLL-bus inbound-injection contract (super-rll SR1/SR3 → for rll-term RT2)

> **Status**: interface CONFIRMED at R2 [PLAN] PASS (Lisa, 2026-06-06). Implementation in
> progress in super-rll slice `rll-bus-inbound-injection`. This doc is the **authoritative
> contract rll-term builds RT2 against** — do NOT read super-rll source; build against this.
> A `contract-doc-matches-cli` test in super-rll pins this doc's flag list against the real
> `bus-inject --help` to prevent drift.
>
> Per `SYNC-CONTRACT-multisession-feishu.md`: super-rll owns the **gate-aware RLL hooks**
> (inbound injection + outbound reply); rll-term owns the `[RLL-EVENT] v=1` transport + feishu;
> 喵吉/feishu-bridge unchanged. super-rll does NOT connect to feishu, does NOT define the
> envelope, does NOT touch 喵吉.

---

## 1. What this covers

The **inbound** half (SR1) + the durable **correlation** (SR3): how rll-term hands a
`type=task` to super-rll so it becomes a normal, fully-gated RLL slice — without breaking
rounds/gates and without preempting an in-flight slice.

The **outbound** reply (SR2: terminal-state → `task-reply`) ships in a follow-up super-rll
slice; this doc will gain a §"outbound" section then. The corr_id sidecar (below) is the
durable handle SR2 reads.

## 2. `ralph-lisa bus-inject` — the entry rll-term RT2 calls

```
ralph-lisa bus-inject --corr-id <id> --from <session_id> --requested-by <human-open-id> \
                      --ts <epoch> ( --body '<json>' | --file <path> )
```

| flag | required | meaning |
|------|----------|---------|
| `--corr-id` | yes | the originating `[RLL-EVENT]` id; used FULL-LENGTH (never truncated) |
| `--from` | yes | originating session_id (reply's `to` will be this) |
| `--requested-by` | yes | human open-id who requested the task (owner-accountability) |
| `--ts` | yes | caller-supplied epoch (the `[RLL-EVENT] ts=`). **super-rll takes no clock** for event metadata — resume/test-friendly. Missing → error. |
| `--body` / `--file` | yes (one) | the C2 task body JSON (inline or file) |

**Body schema** (C2 `type=task`):
```jsonc
{ "title": "", "spec": "", "acceptance": "", "requested_by": "<human-open-id>", "corr_id": "<=event id>" }
```

**Validation / rules:**
- Missing any required flag or `title`/`spec` in body → **exit non-zero** (caller gets a clear error; nothing enqueued).
- **Mismatch reject (conservative)**: if the body also carries `corr_id`/`requested_by` and it **differs** from the `--corr-id`/`--requested-by` flag → reject (exit non-zero, no enqueue). Equal or body-absent → accept (flag authoritative).
- **Idempotent**: re-injecting the same `--corr-id` → no double-enqueue (dedup).
- `body` is treated as **untrusted** (prompt-injection): stored as data, never shell-interpolated or executed.

**Effect (success):** writes `.dual-agent/bus-inbox/<corr_id>.json` (task record) + appends to a FIFO order file + writes the sidecar (§4). Returns exit 0. **rll-term writes nothing inside RLL** — it only calls this entry.

## 3. `ralph-lisa bus-next` / `bus-status` — queue drain (super-rll-internal; rll-term need not call)

- RLL is single-active-slice (turn-based). Injected tasks **queue**; they do not preempt.
- `bus-next` pops the oldest queued task **only when the loop is idle** (no in-flight bus slice, or the current step is terminal / mutual-closed per §70). **Not idle → no-op**: it does not pop, the queue and current slice are untouched. When idle → it turns the task into a normal `next-step` slice (full R1 PLAN → §122/§123/§149/§70 gate flow).
- `bus-status` → lists the queue + each corr_id's status.
- rll-term does not need to drive these; the super-rll loop drains the queue at clean boundaries.

## 4. corr_id sidecar (SR3) — the durable handle for the reply

`.dual-agent/bus-corr/<corr_id>.json`:
```jsonc
{ "corr_id": "<full id>", "from": "<session_id>", "requested_by": "<open-id>",
  "ts": <caller epoch>, "status": "queued|running|done|failed|blocked|needs-discussion",
  "step": "<slice-slug|null>" }
```
- Persistent → survives a session restart. SR2 (outbound reply, follow-up slice) reads this by `step`→`corr_id` to emit the `task-reply` to the original `from` using the same `corr_id`.

## 5. Reply (SR2) — outbound `task-reply` (IMPLEMENTED @ 0.15.0)

On a terminal state of a **bus-injected** slice, super-rll writes a C2 `task-reply` to
**`.dual-agent/bus-outbox/<corr_id>.json`** and updates the corr_id sidecar's `status`.
super-rll does NOT send it — **rll-term's RT3 reads the bus-outbox + sends via `feishu push`**
(transport-agnostic, local-backend). Reply record:
```jsonc
{ "corr_id": "<full id>", "to": "<original from>", "status": "done|failed|blocked|needs-discussion",
  "summary": "", "evidence": ["history.md#roundN", "gate-results.md"] }
```
- `to` = the original task's `from`; paired by `corr_id` (rll-term routes the reply back).
- **Terminal-state → status mapping**: mutual CONSENSUS (§70 passed) → `done`; cascade/gate
  fail → `failed`; 8×NEEDS_WORK deadlock → `blocked`; Ralph `[CHALLENGE]` → `needs-discussion`.
- **Never silent**: every terminal state of a bus-injected slice emits exactly one reply.
- **No-op for non-bus** (human-started) slices; **idempotent** (a slice already in a terminal
  status is not re-emitted).
- `ralph-lisa bus-status` surfaces **pending** (top-level `bus-outbox/*.json`) replies alongside the queue + sidecars. Once RT3 moves a reply to `.sent/` (delivered), it no longer appears in `bus-status` — a delivered-`.sent/` view is the future/non-normative follow-up (see §6).

### 5.1 Reply schema (normative — matches shipped `TaskReply`)

The reply is **exactly** these fields (`cli/src/rll-bus.ts` `TaskReply` / `emitTaskReply`):

| field | type | meaning |
|-------|------|---------|
| `corr_id` | string | the originating `[RLL-EVENT]` id (full, never truncated); join key across bus-inbox/bus-corr/bus-outbox |
| `to` | string | the originating **session** (= sidecar `from`); envelope routing target |
| `status` | enum | `done` \| `failed` \| `blocked` \| `needs-discussion` |
| `summary` | string | one-line human-readable outcome |
| `evidence` | string[] | super-rll-**local** references (e.g. `history.md#roundN`, `gate-results.md`) — informational, not necessarily fetchable cross-machine |

- The reply does **not** carry the human requester. To get it, **join `bus-corr/<corr_id>.json`** (the SR3 sidecar carries `requested_by`).
- A `schema_version` field and richer delivery metadata (`{message_id, sent_at}`) are **not yet implemented** — see §6 (non-normative/future).

## 6. RT3 consume protocol (how rll-term reads + sends; matches the live e2e)

This codifies the convention RT3 **already** used in the 2026-06-07 live e2e (corr_id=miaoji-e2e-1780782823).

**Readiness signal**: the top-level `bus-outbox/<corr_id>.json` *existence* means "ready to send" — super-rll writes it only on a terminal §70 state, exactly once per corr_id. (The write is a plain `fs.writeFileSync` to the final path; super-rll does not currently use a temp+rename atomic-write protocol. RT3 should tolerate reading a just-created file — a tiny window — or treat a JSON-parse failure as "retry next poll".)

**RT3 flow**:
1. Poll **top-level** `bus-outbox/*.json` (excluding the `.sent/` subdir) for un-sent replies.
2. Emit the `[RLL-EVENT]` `task-reply` to feishu (the envelope is rll-term's spec; this doc pins only the **mapping**):

   | `[RLL-EVENT]` field | value |
   |---------------------|-------|
   | `from` | the rll-term session |
   | `to` | `bus-outbox.to` (the original requester session) |
   | `type` | `task-reply` |
   | `corr_id` | passthrough from `bus-outbox.corr_id` |
   | body | `{ status, summary, evidence }` from the reply |

3. **On successful push**: **move** `bus-outbox/<corr_id>.json` → `bus-outbox/.sent/<corr_id>.json` (the consumed-marker = the moved file). Observed live: top-level file gone, `.sent/<corr_id>.json` present.
4. **On push failure**: do **not** move — the file stays top-level and is retried next poll. Net: at-least-once attempts → **effectively-once delivery** (a reply in `.sent/` is never re-sent).

**Idempotency (both sides)**: super-rll never rewrites the reply for an already-terminal corr_id (sidecar status guards it); RT3 never re-sends a `.sent/` reply.

**Non-normative / future (proposed to rll-term, NOT yet implemented)**: enrich the moved `.sent/<corr_id>.json` with `{ message_id, sent_at }` so delivery is provable + super-rll-observable (a future `bus-status` "delivered" view, which would be super-rll code, not this doc).

### 6.1 status → requester action

| `status` | what it means | requester's next action |
|----------|---------------|--------------------------|
| `done` | slice closed at mutual CONSENSUS (§70 passed) | consume the result; task complete |
| `failed` | gate/cascade failed | may re-inject a refined task or abandon |
| `blocked` | 8×NEEDS_WORK deadlock — watcher paused | human intervention needed |
| `needs-discussion` | Ralph `[CHALLENGE]` — `summary` carries the counter-argument | human decision needed (accept challenge / re-scope) |

### 6.2 corr_id pairing invariants

- Join key = `corr_id`; same `<corr_id>.json` basename across `bus-inbox/`, `bus-corr/`, `bus-outbox/` (and `bus-outbox/.sent/` once delivered).
- `bus-corr.from === bus-outbox.to`; `bus-corr.status === bus-outbox.status` (terminal).
- **Exactly one reply per corr_id** (the terminal state is final; super-rll is idempotent).

## 7. Boundaries (super-rll)

- Does NOT connect to feishu (only produces the reply; rll-term sends it).
- Does NOT define the envelope (`[RLL-EVENT] v=1` is rll-term's).
- Does NOT touch 喵吉/feishu-bridge.
- Does NOT preempt an in-flight gated slice (bus-next idle guard).
