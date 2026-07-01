# Super RLL Overview

> Ralph-Lisa Loop — A two-agent collaboration tool that enforces code quality through CLI gates.

## Purpose

Super RLL solves a fundamental problem: **who reviews AI-generated code?**

A single agent that both writes code and declares it "done" is grading its own exam. RLL separates development and review into two independent agents — Ralph (developer) and Lisa (reviewer) — working in alternating turns, with CLI gates serving as referee. The human retains architectural decision authority.

You don't need to review every line or inspect every commit. Review is automated; human attention stays on the decisions that matter.

## Capabilities

- **Turn-based development loop**: Ralph submits work → Lisa reviews independently → passes or returns for fixes → iterate to consensus
- **Automated quality gates**: test results, documentation sync, complexity assessment, safety audit — verified at submit time, not on the honor system
- **Multi-type fast-path**: code, documentation, review, and process tasks each get a tailored workflow; simple tasks skip unnecessary ceremony
- **Autonomous mode**: Engine mode drives both agents automatically, no tmux or manual coordination needed
- **Test tier cascade**: unit → smoke → integration → e2e, running automatically with failure loopback

## Run Model

```
You (human) → set direction, make architectural decisions
  ↓
Ralph (developer agent) → writes plans, code, and tests
  ↓
CLI gates → automatically verify test results, doc consistency, safety
  ↓
Lisa (reviewer agent) → independently reviews, verifies test authenticity, returns PASS or NEEDS_WORK
  ↓
Back to Ralph → fix or reach consensus
```

Every round is recorded in `.dual-agent/history.md` for full traceability.

## Task-Based Navigation

| I want to | Start with | Then see |
|-----------|-----------|----------|
| Run RLL for the first time | [User Guide](guide.html) | [FAQ](faq.html) |
| Understand RLL's design philosophy | This page ("What RLL Is and Isn't") | [CLI Reference](reference.html) |
| Debug a blocked submission | [FAQ](faq.html) | [Test Harness & Gates](test-harness-and-gates.html) |
| Maintain RLL itself (project handoff) | [Maintainer Handoff](maintainer-handoff.html) | [Testing Plan](testing-plan.html) |
| Understand the test system | [Testing Guide](testing.html) | [Testing Plan](testing-plan.html) |

## What RLL Is and Isn't

**RLL is**: structured AI-assisted development. It engineers the "AI writes code" workflow into something verifiable, traceable, and trustworthy.

**RLL is not**: a fully autonomous development robot. The human arbiter is not optional — architectural decisions, security boundaries, and business direction must come from you.

Public documentation stays conservative. RLL's described capabilities correspond to shipped CLI features and gate mechanisms; no unreleased features are promised.

## Source Evidence

All capability claims trace to actual implementations under `cli/src/`:
- Turn protocol: `cli/src/commands.ts` — `cmdSubmitRalph` / `cmdSubmitLisa`
- Quality gates: `cli/src/policy.ts` — `checkRalph` / `runGate`
- Test cascade: `cli/src/commands.ts` — `runTierCascade`
- Complexity assessment: `cli/src/complexity-judge.ts`

## Related Pages

- [User Guide](guide.html) — From installation to your first session
- [CLI Reference](reference.html) — Complete command reference
- [FAQ](faq.html) — Common questions and troubleshooting
- [Maintainer Handoff](maintainer-handoff.html) — Taking over RLL project maintenance
- [Test Harness & Gates](test-harness-and-gates.html) — Quality system in depth
- [Testing Plan](testing-plan.html) — Complete test strategy
- [Changelog](changelog.html)
