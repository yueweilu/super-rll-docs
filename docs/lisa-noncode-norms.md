# Lisa norms beyond code — the uniform acceptance guarantee

Margay-studio roadmap **E3** generalizes RLL from a code-only loop to *any* task domain. Lisa's
guarantee is the same regardless of what Ralph is producing — a feature, a research report, a
process change, or a code review. This document states that guarantee and maps it to a concrete
**acceptance gate** per task-type, so the guarantee applies uniformly.

## The guarantee (every task, every domain)

For any deliverable, Lisa verifies three things before accepting it:

1. **Meets spec** — the work does what the task (task.md / the agreed plan) actually asked for.
   This is the **Goal Guardian** check (`cli/templates/roles/lisa.md`): direction alignment, not
   just local correctness. A flawless answer to the wrong question fails.
2. **Follows rules** — the work respects the project's conventions, the task-type's boundaries
   (file whitelist, evidence requirements), and the safety substrate (identity/outbound/destructive
   gates, P0). No rule is silently skipped.
3. **No harm** — the work introduces no regression, no privacy leak, no destructive side effect,
   and no fabricated claim. Evidence is real, not asserted.

These three hold for code and non-code alike. What *changes* per task-type is the **acceptance
gate** — the concrete, checkable oracle that demonstrates the guarantee.

## Acceptance gate by task-type

| task-type | gate | what Lisa checks | how to run |
|---|---|---|---|
| `code-task` | tests | tests pass (regression + new), §149 attest (Test-Process / Test-Cases / Test-Results), quality-gate green | `ralph-lisa quality-gate` |
| `doc-task` | doc-oracle cascade | the Required quality dimensions in the doc-oracle-spec pass (data-accuracy, source-authority/freshness, logical-coherence, compliance-with-user-spec, ai-slop, coverage, depth) | `ralph-lisa task doc-oracle-spec run --slice <s> --doc <p>` |
| `review-task` | evidence-presence | the review cites concrete rows + files, gives a Pass/NeedsWork rationale, and carries a `Verified:` marker (no rubber-stamp) | `ralph-lisa task acceptance --type review-task --body <submission>` |
| `process-task` | evidence-presence | the change lists the `Files:` touched and gives a rationale / `Process-Change-Reason:` (mandatory when CLAUDE.md changes) | `ralph-lisa task acceptance --type process-task --body <submission>` |

`ralph-lisa task acceptance --type <T>` is the single entry point that routes to the right gate and
returns a uniform `{ status, gate, findings }` result. `code-task` returns `n/a` from this router —
its acceptance is owned by the test/quality gate, deliberately kept as the source of truth so the
acceptance router never weakens code gating.

## How Goal Guardian applies to any domain

The Goal Guardian role (meets-spec, point 1 above) is domain-agnostic by construction. Examples:

- **Research report** (doc-task): does it answer the *question asked*, with authoritative and fresh
  sources, free of AI-slop filler? — checked by the doc-oracle cascade dimensions.
- **Process change** (process-task): does the rule change actually address the stated problem,
  without contradicting existing discipline, and is the reason recorded? — checked by evidence
  presence + Lisa's reading of the rationale against task.md.
- **Code review** (review-task): is the verdict grounded in cited evidence rather than vibes, and
  was it independently verified? — checked by reviewer-evidence presence.

In every case Lisa reads the deliverable against the task's intent, requires real evidence, and
refuses silent gaps — the same loop, generalized. When no automated oracle exists for a dimension,
Lisa still applies the guarantee by judgment and says so explicitly in the review.
