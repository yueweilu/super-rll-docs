[English](../en/guide.md) | [日本語](../ja/guide.md) | [中文](../zh-CN/guide.md)

# User Guide

**Who this is for**: First-time RLL users who want to understand what it does and how to get started.

**What you'll learn**: RLL's core concepts → when to use it → running your first session.

> Command details → [CLI Reference](reference.html)
> Submission blocked → [FAQ](faq.html)
> Maintaining RLL project → [Maintainer Handoff](maintainer-handoff.html)

## What RLL Is

RLL (Ralph-Lisa Loop) is a two-agent collaboration tool. It splits "AI writes code" into two independent roles:

- **Ralph** (developer) — writes plans, code, and tests
- **Lisa** (reviewer) — independently reviews Ralph's work, verifies test authenticity

They alternate in a turn-based loop, with CLI gates acting as referee — automatically checking test results, documentation consistency, and safety. **The human makes architectural decisions.**

## Why RLL

The problem with a single AI writing your code: it grades its own exam. RLL enforces separation of concerns:

- You don't get code that an AI unilaterally declared "done"
- Test results aren't "looks like it passed" — Lisa independently verifies them
- Every submission is recorded and traceable

**Good fit**: multi-step implementation, architectural decisions, user-facing or security-sensitive code, ambiguous requirements.

**Overkill**: single-line fixes, well-tested refactors, personal scripts, emergency hotfixes.

## Quick Start

### Install

Requires Node.js >= 18, plus Claude Code (Ralph) and Codex CLI (Lisa).

```bash
npm i -g ralph-lisa-loop
```

Verify: `ralph-lisa doctor` checks your environment.

### Initialize

```bash
cd your-project
ralph-lisa init
```

Creates role files and `.dual-agent/` session state. Use `ralph-lisa init --minimal` for zero project-file footprint.

### Start a Task

```bash
ralph-lisa start "implement login feature"
```

### Or Run Automatically

```bash
ralph-lisa auto --engine --task "implement login feature"
```

Engine mode drives both agents automatically — no manual turn coordination.

## Core Concepts

### Turn-Based Loop

Ralph and Lisa take turns. Each round: one submits → CLI validates → the other responds. They never talk simultaneously.

### Tag System

Every submission starts with a tag indicating the round type:

| Ralph's Tags | Meaning |
|-------------|---------|
| `[PLAN]` | Round 1: architecture and approach |
| `[CODE]` | Implementation (must include test results) |
| `[FIX]` | Revision based on Lisa's feedback |
| `[CONSENSUS]` | Confirm agreement, close the task |

| Lisa's Tags | Meaning |
|------------|---------|
| `[PASS]` | Review approved |
| `[NEEDS_WORK]` | Changes required (must state reasons) |

Round 1 must be `[PLAN]` — Lisa verifies your understanding before code is written.

### Consensus Protocol

Lisa's ruling is advisory, not final. Both agents must submit `[CONSENSUS]` to close a task.

No consensus after 5 rounds? Use `[OVERRIDE]` (proceed with recorded disagreement) or `[HANDOFF]` (escalate to human). No infinite loops.

### Quality Gates

The CLI automatically validates at submit time: test results, doc consistency, secret leaks, complexity assessment. Violations block submission by default — not just warn.

### Task Types

Not every task needs full TDD ceremony. Fast-path types skip unnecessary formality:

- **code-task**: full TDD (default)
- **doc-task**: documentation-only changes
- **review-task**: review / report writing
- **process-task**: protocol / PLAN file changes

Key rule: if you're changing `cli/` source code, it's a code-task.

## Submission Requirements

`[CODE]` and `[FIX]` submissions must include:

- **Test Results**: what command was run, how many passed/failed
- Results must be from actual execution — not fabricated
- Both regression and new test results are required

Lisa doesn't just trust Ralph's self-report — she independently verifies gate results and test execution logs.

## Working Mode Options

| Scenario | Recommended |
|----------|------------|
| Daily IDE development | IDE as Ralph + terminal running `watch-lisa` |
| Fully automated CLI | `auto --engine --task "..."` |
| Quick review | `review --auto-approve` |
| Manual fine-grained control | `start` → manual `submit-ralph` / `submit-lisa` |

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `RL_POLICY_MODE` | `block` | Gate mode: `off` / `warn` / `block` |

Full CLI reference and environment variables: see [CLI Reference](reference.html).

## Important Notes

### Git Discipline

Small commits, clear messages, commit often. When things go wrong, `git reset` is your safety net.

### The Human Arbiter Is Not Optional

Two AIs can happily agree on a terrible design. RLL is structured AI-assisted development, not autonomous development. Architectural decisions, security boundaries, and business direction come from you.

---

> This guide covers core concepts and basic usage. Detailed commands → [CLI Reference](reference.html). Troubleshooting → [FAQ](faq.html).
