# RLL Bug Report — Analysis-Only / Doc-Only Step Can Reach Semantic Consensus But Fail Mechanical Closeout

**Prepared by**: CCL-side user of `ralph-lisa-loop`
**Date**: 2026-05-23 00:49 PDT
**Audience**: RLL dev team (`ralph-lisa-loop` CLI, local install `0.9.9`)
**Local package path inspected**: `/Users/yic_rj/rll/cli` via `ralph-lisa -> /Users/yic_rj/rll/cli/dist/cli.js`

---

## Summary

RLL currently has a workflow bug for non-code slices, especially analysis-only / RCA style steps:

1. A new step can start with Ralph `[DISCUSS]` instead of the documented mandatory `R1 [PLAN]`.
2. Later, when the step is semantically done and both agents want to close it, Lisa `[CONSENSUS]` is mechanically blocked unless she can cite a trusted artifact from a plan/gate/harness path.
3. For analysis-only steps, there is no clean first-class closeout path unless a plan artifact was seeded up front, or someone backfills one later.

This creates a late-stage deadlock:

- content-level review is finished
- both sides agree on the conclusion
- but the step cannot close cleanly under policy

The issue is not just “operator used the workflow wrong.” The CLI itself currently allows the wrong early path and only fails late, after multiple rounds of work.

---

## Concrete Reproduction

### Session

CCL repo step: `gateway-reliability`

History excerpt shows this step never had a true Ralph `[PLAN]` round:

- `.dual-agent/history.md:54410` — `## [Ralph] [DISCUSS] Round 1 | Step: gateway-reliability`
- `.dual-agent/history.md:54432` — `## [Ralph] [DISCUSS] Round 2 | Step: gateway-reliability`
- `.dual-agent/history.md:54454` — `## [Ralph] [CONSENSUS] Round 3 | Step: gateway-reliability`
- `.dual-agent/history.md:54476` — `## [Ralph] [DISCUSS] Round 4 | Step: gateway-reliability`
- `.dual-agent/history.md:54498` — `## [Ralph] [CONSENSUS] Round 5 | Step: gateway-reliability`

No `gateway-reliability` `[PLAN]` submission appears in history.

### What happened

The step was an RCA / analysis-only slice. By Round 5 the content had converged:

- confirmed facts
- partially confirmed facts
- unconfirmed hypotheses
- future remediation explicitly separated into a later step

At that point Lisa attempted `[CONSENSUS]`, and submit was blocked with:

```text
Submission BLOCKED by policy:
  - [CONSENSUS] §149: must include attest block (Reviewed-PLAN-rows / Reviewed-test-files / Reviewed-test-log)
  - [CONSENSUS] §149: must include Pass-Rationale: <reasoning text + file:line cite>
  - [CONSENSUS] Lisa must cite `Verified: <trusted-artifact-path>` (mtime ≤ 5min). Trusted paths: .dual-agent/gate-results.{md,json}, .dual-agent/harness-results/*, .dual-agent/auto-tdd-plan-*.json. §144
```

This block was not about the RCA content being wrong. It was purely mechanical: Lisa could not satisfy the trusted-artifact / attestation contract for a step that never seeded the usual `PLAN -> auto-tdd-plan -> post-consensus cascade` path.

---

## Why This Is A Product Bug

### 1. The docs say R1 must start with `[PLAN]`, but the CLI does not actually enforce that

The role docs are explicit:

- `AGENTS.md:103-117` — Round 1 mandatory `[PLAN]`

But submit-time code only applies PLAN-specific checks when the current tag is already `PLAN`:

- `/Users/yic_rj/rll/cli/dist/commands.js:2077-2094`
- `/Users/yic_rj/rll/cli/dist/policy.js:106-146`
- `/Users/yic_rj/rll/cli/dist/policy.js:532-579`

`DISCUSS` is a valid Ralph tag:

- `/Users/yic_rj/rll/cli/dist/state.js:69`

There is no early “first Ralph submission of this step must be `[PLAN]`” hard-block in submit path.

So the system currently permits:

1. start new step
2. Ralph submits `[DISCUSS]`
3. Lisa reviews `[DISCUSS]`
4. work continues for several rounds
5. only at closeout does the missing `PLAN` artifact become painful

That is a late failure for what should be an early failure.

### 2. Lisa `[PASS]` / `[CONSENSUS]` is hard-wired to plan/gate/harness artifacts, with no analysis-only carve-out

`checkLisa()` unconditionally applies §149 attest requirements to `[PASS]`, `[CONSENSUS]`, and `[NEEDS_WORK]`:

- `/Users/yic_rj/rll/cli/dist/policy.js:287-345`

It also unconditionally requires `Verified:` on `[PASS]` / `[CONSENSUS]`, and only trusts:

- `.dual-agent/gate-results.{md,json}`
- `.dual-agent/harness-results/**`
- `.dual-agent/auto-tdd-plan-*.json`

See:

- `/Users/yic_rj/rll/cli/dist/policy.js:365-423`

There is no visible doc-only / analysis-only bypass here.

### 3. RLL already has non-code escape concepts, but Lisa closeout does not consume them

`auto-tdd` already recognizes non-code escape reasons:

- `/Users/yic_rj/rll/cli/dist/auto-tdd.js:36-41`
  - `doc-only`
  - `config-only`
  - `single-rename`
  - `process-only`

It also supports `**Tests**: none (<reason>)`:

- `/Users/yic_rj/rll/cli/dist/auto-tdd.js:168-181`

and persists the result into `.dual-agent/auto-tdd-plan-<step>.json`:

- `/Users/yic_rj/rll/cli/dist/commands.js:2503-2517`
- `/Users/yic_rj/rll/cli/dist/auto-tdd.js:446-470`

Then `handleMutualCompletion()` knows how to short-circuit when that persisted artifact says “escape”:

- `/Users/yic_rj/rll/cli/dist/commands.js:6737-6777`

So there is already a design pattern for “non-code slice with no executable test cascade.”

But Lisa closeout policy does not appear to use that slice shape. It only asks: “does the submission include the standard attest block and a trusted artifact path?”

### 4. Doc-task handling exists for PLAN/FIX, but not as a complete closeout model

RLL has a doc-task detector and doc-oracle gate:

- `/Users/yic_rj/rll/cli/dist/commands.js:2096-2123`
- `/Users/yic_rj/rll/cli/dist/policy.js:847-877`
- `/Users/yic_rj/rll/cli/dist/doc-task-detector.js:1-37`

That means docs are not “ungated.” They do have a specialized path.

But the specialized path does not solve the late Lisa `[CONSENSUS]` problem for analysis-only / RCA slices that never seeded a valid artifact chain.

---

## Evidence Of Workflow Pressure / Backfill Behavior

By the time this report was written, the repo had:

- `.dual-agent/auto-tdd-plan-gateway-reliability.json`

mtime:

- `May 22 23:03:29 2026`

content:

```json
{
  "schema_version": 1,
  "step": "gateway-reliability",
  "parsedAt": "2026-05-23T06:05:00.000Z",
  "rows": [
    {"id": "A1", "phase": null, "tier": "unit", "command": "cat docs/gateway-reliability-analysis.md", "oracle": "contains 已确认", "required": true},
    {"id": "A2", "phase": null, "tier": "integration", "command": "grep -c 'proxy_read_timeout 660s' gateway-litellm/nginx-local.conf", "oracle": "2", "required": true}
  ]
}
```

But the visible session history still contains no `gateway-reliability` `[PLAN]` or `[FIX]` round. Since the normal persist hook only fires on `[PLAN]` or `[FIX]` with a non-empty table:

- `/Users/yic_rj/rll/cli/dist/commands.js:2513-2517`

this strongly suggests after-the-fact artifact backfilling rather than a clean R1 plan flow.

That is a bad smell:

- the system should not force users to synthesize late plan artifacts just to close an analysis-only step
- if backfill is the intended recovery path, it should be explicit and first-class

---

## Expected Behavior

Any one of these would be coherent:

### Option A — Fail early

If a new step has not started with the required R1 `[PLAN]` / `[RESEARCH]` / `[CLARIFY]` shape, block the very first invalid Ralph submission immediately.

Then the user never gets into a late-stage closeout deadlock.

### Option B — Support analysis-only / doc-only closeout explicitly

If the slice is non-code and has a persisted escape shape, Lisa `[PASS]` / `[CONSENSUS]` should be able to cite that artifact directly without pretending there are executable test rows/logs.

### Option C — Require explicit “analysis-only” PLAN artifact

If analysis-only slices are allowed, there should be a first-class R1 plan escape that seeds a trusted artifact and a closeout path. Today the escape whitelist is:

- `doc-only`
- `config-only`
- `single-rename`
- `process-only`

There is no explicit `analysis-only` / `rca-only` class.

---

## Suspected Root Cause

This looks like a composition bug between three independently reasonable features:

1. **R1 planning rules live mostly in docs / prompts**
   - but not fully in submit-time enforcement
2. **Lisa closeout policy assumes a prior plan artifact chain**
   - and has no non-code carve-out in `checkLisa()`
3. **Non-code escapes exist**
   - but only help if the step actually seeded the artifact correctly up front

That creates a gap:

- early invalid flow is permitted
- late closeout requires the artifact that early invalid flow never created

---

## Recommended Fixes

### Recommended fix 1 — Add submit-time R1 first-tag enforcement

In Ralph submit path, detect whether the current step has any prior Ralph submission.

If none exists, only allow the correct opening tag for that step shape:

- `[PLAN]`
- or `[RESEARCH]` when that workflow explicitly requires it first
- or `[CLARIFY]` for R0 complex-task path

Block first-round `[DISCUSS]`, `[CONSENSUS]`, `[CODE]`, etc.

This is the safest fix because it prevents the deadlock before it starts.

### Recommended fix 2 — Make Lisa `[PASS]/[CONSENSUS]` shape-aware

`checkLisa()` should not use one flat rule for every slice.

If the step resolves to a persisted non-code escape artifact, allow a reduced closeout contract such as:

- `Reviewed-PLAN-rows: none (escape)`
- `Reviewed-test-files: <doc/path refs>`
- `Reviewed-test-log: skipped (non-code escape)`
- `Verified: .dual-agent/auto-tdd-plan-<step>.json`

Or introduce a dedicated trusted artifact for doc/oracle closeout.

### Recommended fix 3 — Add a first-class `analysis-only` / `rca-only` escape reason

If RLL intends to support non-code investigation slices, they should not have to masquerade as:

- `doc-only`
- or `process-only`

An explicit escape reason would reduce ambiguity and make closeout policy easier to reason about.

### Recommended fix 4 — Make late recovery explicit if early PLAN is missing

If the team does not want to relax Lisa closeout rules, add a recovery command such as:

- `ralph-lisa repair-plan-artifact --step <slug> --shape analysis-only`

That would at least formalize today’s apparent backfill pattern instead of pushing users toward ad-hoc artifact synthesis.

---

## Secondary Inconsistency Found While Investigating

The role docs say Lisa attest fields are cross-checked against:

- `auto-tdd-plan-<step>.json`
- filesystem test files
- `test-execution-log`

See:

- `CODEX.md:324-330`

But `checkLisa()` itself appears to enforce mostly:

- field presence
- rationale length / cite presence
- `Verified:` trusted-path allowlist

It does **not** itself call `verifyLisaAttest()`.

See:

- `/Users/yic_rj/rll/cli/dist/policy.js:287-423`

`verifyLisaAttest()` exists:

- `/Users/yic_rj/rll/cli/dist/lisa-attest-parser.js:122-163`

but it is used in Ralph’s counter-attest path for latest Lisa PASS quality review:

- `/Users/yic_rj/rll/cli/dist/policy.js:70-103`

and even there the hard block is tied to `quality_score`, not to `unverified` plan rows/test logs.

This is a separate inconsistency from the main bug, but it may matter when redesigning Lisa closeout rules for non-code slices.

---

## Short Version

The current system allows an analysis-only step to skip real R1 `[PLAN]`, but later requires Lisa closeout evidence that only a proper plan/gate artifact chain can provide.

That is why a step can be semantically complete and still be mechanically uncloseable.

This should be fixed either by:

1. enforcing R1 `[PLAN]` early, or
2. giving analysis-only / doc-only slices a first-class closeout path, ideally both.
