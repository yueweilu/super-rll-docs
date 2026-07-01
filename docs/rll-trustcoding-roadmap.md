# RLL AI Trustcoding Roadmap

**Updated**: 2026-05-04  
**Status**: Sub-slices #1–#9 all complete; G1, G2, and G3 all closed; full sub-slice queue closed; T6 (tdd-gate) and T7 (tdd-retrospective) both implemented and verified  
**Canonical path**: Team Path (rll-team-platform/server → worker container → cli/)

---

## §1 Capability Matrix

**Scope**: the seven RLL codebases listed below. Other directories under `super-rll/`
(e.g. `TigerHill/`) are separate projects and are out of scope for this roadmap.

| Codebase | Purpose | Production tests | Extension/layer tests | Cross-platform |
|---|---|---|---|---|
| `cli/` | Local dual-agent loop (ralph-lisa) | 815 (30 files, `cli/src/test/`) | — | macOS+Linux (tmux), Windows (engine mode) |
| `wecom-bot/` | WeCom bot integration | 202 (17 files) | — | Node.js portable |
| `rll-core/src/` | State machine + policy engine | **0** — no `*.test.ts` on production code | `templates/` contains 9 scenario packs (`test-ai`, `test-cli`, `test-desktop`, `test-miniprogram`, `test-mobile`, `test-security`, `test-server`, `test-visual`, `test-web`); 3 scaffolding files within them (`test-web/smoke.spec.ts`, `test-web/api.spec.ts`, `test-cli/smoke.test.ts`) — these are templates for downstream projects, not self-tests of rll-core | TypeScript pure |
| `rll-stack/` | IDE-first local Lisa review | 3 (`src/test/`: platform.test.ts, workspace.test.ts, handlers.test.ts — 348 lines) | 7 extension tests (`extension/test/`: config, diff, dismissed, finding, mcpClient, prompt, queue — 641 lines) | macOS+Windows validated |
| `rll-stack-team/` | rll-stack adapted for team auth | 2 (`src/test/`: platform.test.ts, workspace.test.ts — 235 lines) | No extension tests | macOS+Windows |
| `rll-team-platform/server/` | Team orchestrator + MCP control plane | 62 unit tests | 94 integration tests (dispatch, loop, adapters, routes, E2E) | Docker (Linux worker) |
| `rll-team-platform/cli/` | End-user task CLI | 16 unit tests | — | Node.js portable |

**Key gaps:**
- `rll-core/`: foundation library with **zero** self-tests; state-machine + policy engine tested only via downstream consumers
- `rll-stack/`: core MCP session persistence, round context, and file:line citation are **not** covered by any of the 10 existing tests (3 src/test + 7 extension/test)
- No CI/CD in the seven RLL codebases above (no `.github/workflows/` in `cli/`, `wecom-bot/`, `rll-core/`, `rll-stack/`, `rll-stack-team/`, or `rll-team-platform/`)

---

## §2 Two Product Scenarios

These are **parallel products**, not a chain. The canonical trustcoding path for complex project development is **Scenario A**.

### Scenario A — Team Path (canonical)

| Aspect | Detail |
|---|---|
| **Use case** | Dev team, multi-user, complex project, compliance-friendly |
| **MCP tools** | `rll_launch`, `rll_submit`, `rll_recall`, `rll_handoff`, `rll_my_tasks` |
| **Control plane** | `rll-team-platform/server/src/build-server.ts:103-144` |
| **Audit** | `rll-team-platform/server/src/audit.ts:2` (append-only JSONL) |
| **Worker isolation** | Docker via `devcontainer-cli up` |
| **Agent loop** | `cli/` (ralph-lisa) inside container |
| **Branch output** | `rll-task/<id>` pushed by worker |
| **Status**: | Pre-v1, active development; G1, G2, G3 all closed — golden path structurally unblocked (ralph-lisa in worker-base; headless engine mode; cross-codebase E2E) |

### Scenario B — Local Path (parallel, not scope of this roadmap)

| Aspect | Detail |
|---|---|
| **Use case** | Solo dev, single machine, no team server needed |
| **MCP tool** | `rll_lisa_review` only (`rll-stack/src/cli.ts:82-89`) |
| **No server required** | Runs entirely in IDE agent context |
| **Status** | Working, 10 tests; core engine gaps (see §1) |

---

## §3 Golden Path — Team Path End-to-End

```
Developer IDE (Trae / Cursor / VSCode / Claude Code)
        │
        │  rll_launch("refactor auth.ts + add unit tests")
        │  → rll-team-platform/server/src/launch.ts:2
        ▼
rll-team-platform/server
  ├─ Task record created (SQLite WAL)
  ├─ Audit log entry (JSONL)
  ├─ Orchestrator: rll-team-platform/server/src/dispatch/worker-dispatch.ts:118
  └─ devcontainer-cli up <repo/.devcontainer.json>
        │
        ▼
worker-base container  ← rll-team-platform/worker-base/
  ├─ ralph-lisa CLI installed (G1 closed — ralph-lisa-loop 0.6.1)
  ├─ Ralph writes code (ralph-lisa agent loop)
  ├─ ralph-lisa quality-gate --full-uaot  (gate inside loop)
  ├─ submit-ralph → Lisa reviews
  │   └─ headless delivery via `auto --engine` mode (G2 closed — sub-slice #3)
  ├─ [PASS] / [NEEDS_WORK] rounds iterate to CONSENSUS
  └─ git push rll-task/<id>
        │
        ▼
rll-team-platform/server
  ├─ rll_recall → branch diff (recall.ts:5)
  └─ Audit log updated
        │
        ▼
Developer IDE — reviews diff, merges or discards
```

**Ownership per boundary:**

| Boundary | Owner | File | Status |
|---|---|---|---|
| MCP control plane (rll_launch, rll_submit, rll_recall) | `rll-team-platform/server` | `src/launch.ts:2`, `src/submit.ts:2`, `src/recall.ts:2` | ✅ Working |
| Task lifecycle + worker spawn | `rll-team-platform/server` | `src/dispatch/worker-dispatch.ts:118` | ✅ Working |
| Audit + auth | `rll-team-platform/server` | `src/audit.ts:2`, `src/auth.ts` | ✅ Working |
| Worker container image | `rll-team-platform/worker-base/` | `Dockerfile` | ✅ G1 closed: ralph-lisa 0.6.1 installed |
| Agent loop (Ralph writes, quality-gate, submits) | `cli/` | `src/commands.ts` | ✅ G2 closed: headless `auto --engine` mode (sub-slice #3) |
| Quality gate | `cli/` | `src/commands.ts:1198` (`--full-uaot`) | ✅ Working |
| Branch push | `rll-team-platform/server` | `src/dispatch/worker-dispatch.ts` | ✅ Working |
| Local solo review (Scenario B, out of scope) | `rll-stack` | `src/cli.ts:82-89` | ✅ Working separately |

**Integration gaps blocking the golden path:**

| Gap | Root cause | Blocks |
|---|---|---|
| ~~**G1**~~ | ✅ CLOSED — `ralph-lisa-loop 0.6.1` installed in `worker-base/Dockerfile` via local artifact | ~~Ralph can't run inside container~~ |
| ~~**G2**~~ | ✅ CLOSED — `cli/` headless engine mode (`auto --engine`) delivers without tmux; `cli/src/test/headless-engine.test.ts` is the T2 proof (sub-slice #3) | ~~Lisa review delivery fails; loop can't complete~~ |
| ~~**G3**~~ | ✅ CLOSED — cross-codebase E2E test in `server/test/integration/cross-codebase-e2e.test.ts` proves dispatchTask→container→CONSENSUS→branch push; `git ls-remote` verifies remote ref (sub-slice #6) | ~~Regressions in the golden path are invisible~~ |

---

## §4 AI Trustcoding Exit Criteria

**Definition**: The AI coding process is "trusted" when a developer can trigger a task, walk away, and receive a tested, reviewed, consensus-approved branch — without manual intervention inside the loop.

**Five binary exit criteria** (all must be true):

| ID | Criterion | Measured by |
|---|---|---|
| **T1** | `ralph-lisa` CLI installs and executes inside `worker-base` Docker image | `docker run worker-base ralph-lisa --version` exits 0 |
| **T2** | `cli/` agent loop completes a full PLAN→CODE→CONSENSUS cycle without tmux (headless/pipe mode) | E2E test in a container with no TERM/TMUX environment |
| **T3** | `rll-core/` has ≥30 unit tests covering policy warn/block + tag parser + test-result gate + case-engine | `npm test` in `rll-core/` reports ≥30 pass |
| **T4** | `rll-stack/` core MCP layer has ≥15 unit tests covering session persistence + round context + file:line citation | `npm test` in `rll-stack/` reports ≥15 new tests pass |
| **T5** | Cross-codebase E2E test (IDE trigger → container → CONSENSUS → branch push) runs on every CI push | GitHub Actions job exits 0 on macOS + Linux runners |

---

## §5 Sub-Slice Queue

Ordered by dependency. Sub-slices 1 and 2 are independent and can run in parallel. Sub-slice 6 requires 2 and 3 to be complete first.

| # | Sub-slice name | Closes | Depends on | Codebase |
|---|---|---|---|---|
| 1 | `rll-core-tests` | T3 | — | `rll-core/` |
| 2 | `worker-base-cli-integration` | T1, G1 | — | `rll-team-platform/worker-base/` |
| 3 | `cli-headless-mode` | T2, G2 | #2 (needs CLI in container to test) | `cli/` |
| 4 | `rll-stack-mcp-tests` | T4 | — | `rll-stack/` |
| 5 | `ci-cd-foundation` | CI 3-platform | #1, #2, #4 | all repos (4 workflow files: super-rll, rll-core, rll-stack main, rll-stack team-platform branch) |
| 6 | `cross-codebase-e2e` | T5, G3 | #2, #3 | `rll-team-platform/server/` |
| 7 | `trustcoding-metrics` | audit dashboard / review quality metrics | #6 | `rll-team-platform/server/` |
| 8 | `tdd-gate` ✅ | T6: TDD-driven quality gate — `rll_launch` accepts test spec; loop runs layered tests (unit→integration→functional) at appropriate stages | #7 | `rll-team-platform/server/` + `cli/` |
| 9 | `tdd-retrospective` ✅ | T7: Per-task retrospective — structured post-CONSENSUS report, per-round test result curves, harness registry, context injection for next task | #8 | `rll-team-platform/server/` |

**All sub-slices #1–#9 complete.** Full queue closed 2026-05-04.

---

## Appendix: Evidence Anchors

Key file:line references used in this document:

- `rll-team-platform/server/src/build-server.ts:103-144` — MCP server route registration
- `rll-team-platform/server/src/launch.ts:2` — rll_launch route handler
- `rll-team-platform/server/src/submit.ts:2` — rll_submit route handler
- `rll-team-platform/server/src/recall.ts:5` — rll_recall + branch diff
- `rll-team-platform/server/src/dispatch/worker-dispatch.ts:118` — devcontainer-cli spawn
- `rll-team-platform/server/src/audit.ts:2` — audit log writer
- `rll-stack/src/cli.ts:82-89` — rll_lisa_review MCP tool (Scenario B only)
- `cli/src/commands.ts:1198` — cmdQualityGate (--full-uaot flag)
