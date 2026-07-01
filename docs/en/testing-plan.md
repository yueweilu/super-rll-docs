# Super RLL v0.26.1 — Test Plan

## Overview

This plan covers the full test surface of the current v0.26.1 release. The project spans ~550 source test files across 5 packages, governed by an 8-tier canonical test system and 15+ quality gates.

**Packages under test:**

| Package | Test Files | Focus |
|---------|-----------|-------|
| `cli/` | 395 | Core CLI, commands, policy, gates, plan validation |
| `cli-e2e/` | 16 | End-to-end CLI behavior, WezTerm/Playwright harnesses |
| `wecom-bot/` | 28 | WeCom inbound/outbound, message routing, daemon |
| `cli-pty-daemon/` | 5 | PTY management, terminal sessions, tmux integration |
| `cli-pty-daemon-vscode/` | 1 | VSCode extension PTY bridge |

---

## 8-Tier Canonical Test System

The project defines 8 canonical tiers in `gate-manifest.json`. The CLI archetype's default baseline is `[unit, smoke, integration]`.

| Tier | Scope | When Required |
|------|-------|---------------|
| **unit** | Pure function / module tests | Every phase |
| **smoke** | Fast integration sanity | impl + consensus phases |
| **functional** | Feature-level behavior | Complex slices |
| **integration** | Cross-package interaction | consensus phase |
| **e2e** | Full user workflow | Release validation |
| **perf** | Performance benchmarks | Perf-sensitive changes |
| **stability** | Soak / stress / race | Long-running services |
| **security** | Auth / secret scan / injection | Security-sensitive changes |

**Phase-based requirements** (from `gate-manifest.json` phases):
- `design` → unit only
- `tests-only` → unit only
- `impl` → unit + smoke
- `fix` → unit only
- `consensus` → unit + smoke + integration

---

## Quality Gates

### Submit-Time Gates (every [CODE]/[FIX])

| Gate | § Ref | What It Checks |
|------|-------|----------------|
| Policy block-default | §133 | Missing attest, test results, file:line citations |
| Test execution log | §137 | Test claims vs actual execution log entries |
| Bidirectional attest | §149 | Ralph Test-Process / Test-Cases / Test-Results + Lisa Reviewed-* / Verified |
| Visual evidence | §151 | Screenshot required for UI/frontend slices |
| Project type tiers | §152 | Baseline vs archetype mismatch (warn-only) |
| Smoke auto-loop | §150 | RL_SMOKE_CMD post-submit health check |

### Plan-Time Gates (TDD-PLAN round)

| Gate | § Ref | What It Checks |
|------|-------|----------------|
| Complexity judge | §123 | 3-layer: LLM judgement → deterministic verify → Lisa rerun |
| Clarify phase | §128 | Complex/expert tasks need R0 5-stage grill before TDD-PLAN |
| Phase test coverage | §145 | Multi-phase slices need per-phase test cases |
| Baseline self-check | §155 | PLAN body must confirm project_type baseline alignment |

### Release Gates

| Gate | § Ref | Coverage |
|------|-------|----------|
| Dogfood gate | §139 | E2E enforcement check: happy path, fake claims, missing Verified |
| Doc update gate | §138 | Doc/code drift detection across CLAUDE.md / CODEX.md / role templates |
| Release report | §140 | Aggregated evidence: tests + plan + dogfood + doc-update + complexity |
| Test harness confirmation | §157 | Real-scenario, repetition justification, design ≠ mechanism review |

---

## Test Harnesses

### Node.js Built-in (`node --test`)

The primary test runner. All `cli/src/test/*.test.ts` files use Node.js native test runner.

```bash
cd cli && npm test
```

Covers: commands, policy, plan validation, gate execution, IPC, state management.

### WezTerm E2E Harness

Drives a real terminal via WezTerm for CLI end-to-end tests. Specs live in `cli-e2e/`.

```bash
ralph-lisa skill wezterm-test --macro <path>
```

Covers: CLI output rendering, tmux pane behavior, user interaction flows.

### Playwright Browser E2E

Browser automation harness. Specs in `harness-project-validation/` and `harness-verification/`.

```bash
ralph-lisa skill playwright-test --spec <path>
```

### Dogfood Gate (§139)

Self-testing the enforcement gates themselves. Validates:
- `happy`: Full PLAN→CODE→PASS→CONSENSUS flow
- `bypass-fake-claim`: §137 test-results-unverified catches fake claims
- `bypass-missing-Verified`: §144 lisa-rerun-not-verified catches missing cites

### Release Report (§140)

Pre-release evidence aggregation from 6 sources: cli tests, wecom-bot tests, plan validation, dogfood gate, doc-update gate, complexity judge.

---

## Key Test Areas by Feature

| Area | § / Feature | Test Coverage |
|------|-------------|---------------|
| Commands | auto, start, submit-ralph/lisa, init/uninit | cli/src/test/commands*.test.ts |
| Policy | §133/§137/§144/§149 | cli/src/test/policy*.test.ts |
| Plan validation | §102/§145 plan table parsing | cli/src/test/plan*.test.ts |
| Complexity | §123 judge + verify | cli/src/test/complexity*.test.ts |
| Gates cascade | §78/§79 tier cascade + loopback | cli/src/test/gate*.test.ts |
| WeCom transport | inbound/outbound, push, daemon | wecom-bot/src/test/*.test.ts |
| PTY daemon | tmux session, pipe-pane, attach | cli-pty-daemon/src/test/*.test.ts |
| Feishu relay | Lark outbound, decision-card | cli/src/test/feishu*.test.ts |
| Docs publisher | Publication workflow | cli/src/test/docs-publisher*.test.ts |
| Cleanup | §127 spawn/fork cleanup | cli/src/test/cleanup*.test.ts |
| Knowledge freshness | §128 volatile info TTL | cli/src/test/knowledge*.test.ts |

---

## Quality Oracle (15 Dimensions)

From `gate-manifest.json` `canonical_doc_oracle_dimensions`:

1. **data-accuracy** — Facts match sources
2. **source-authority** — Citations reference primary sources
3. **source-freshness** — Information is current (TTL-aware)
4. **logical-coherence** — No internal contradictions
5. **compliance-with-user-spec** — Matches stated requirements
6. **ai-slop** — No AI-generated filler or hallucinations
7. **style** — Consistent voice and formatting
8. **topic-coverage** — All declared scope is addressed
9. **depth-detail** — Appropriate level of detail per audience
10. **public-safety** — No leaked secrets, safe for public consumption
11. **locale-parity** — en/zh-CN/ja content is synchronized
12. **link-integrity** — All cross-references resolve
13. **build-readiness** — Content compiles/deploys without errors
14. **destination-liveness** — External links are reachable
15. **public-authorization** — Published content is authorized for public access

---

## Prerequisites

- **Node.js** >= 18
- **Claude Code** (Ralph backend)
- **Codex CLI** (Lisa backend)
- Optional: `tmux` (for tmux UI), `wezterm` (for WezTerm E2E), `playwright` (for browser E2E)

```bash
node -v          # >= 18
git --version
claude --version
codex --version
ralph-lisa doctor  # full environment check
```

---

## Running Tests

### Quick check

```bash
cd cli && npm test
```

### Full gate sequence

```bash
ralph-lisa quality-gate --full-uaot
```

### Pre-release checklist

```bash
npm test --prefix cli           # core tests
npm test --prefix wecom-bot     # wecom transport
ralph-lisa dogfood-gate run --strict   # enforcement E2E
ralph-lisa doc-update-gate run --strict # doc/code drift
ralph-lisa release-report emit          # aggregate evidence
```

### Gate policy mode

```bash
# Default: block (production / autonomous)
RL_POLICY_MODE=block ralph-lisa auto --engine --task "..."

# Dev escape: warn (interactive development only)
RL_POLICY_MODE=warn ralph-lisa submit-ralph --file .dual-agent/submit.md
```

---

## Test Result Summary

| # | Test Area | Runner | Gate Tier |
|---|-----------|--------|-----------|
| 1 | CLI unit tests (~395 files) | node --test | unit |
| 2 | CLI E2E tests (~16 files) | wezterm / playwright | e2e |
| 3 | WeCom bot tests (~28 files) | node --test | unit + integration |
| 4 | PTY daemon tests (~5 files) | node --test | unit + smoke |
| 5 | Dogfood gate (§139) | ralph-lisa dogfood-gate | e2e |
| 6 | Doc update gate (§138) | ralph-lisa doc-update-gate | functional |
| 7 | Release report (§140) | ralph-lisa release-report | integration |
| 8 | Test harness confirmation (§157) | ralph-lisa testharness-gate | functional |

---

> This plan reflects the v0.26.1 test surface. For per-slice test planning, see the [User Guide](guide.html) §102 auto-TDD mode and the [CLI Reference](reference.html).
