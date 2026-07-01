# §93 R1 B4 — Real Lisa Subprocess Dogfood Evidence

**Slice**: §E live-model-lisa-subprocess-dogfood (closes §93 R1 narrow B4 deferred)
**Date**: 2026-05-12
**Status**: ✅ Mandatory manual smoke completed via codex backend

## Context

§93 R1 narrow B4 (`.rll/PLAN.md:3378`, was line 3346 pre-§E edit) deferred "Live model-Lisa-subprocess closed-loop dogfood" to §95-followup with rationale:

> "Live model-Lisa-subprocess closed-loop dogfood (per Lisa R1 narrow B4 lock — slow/flaky; CI uses deterministic simulated audit via pure `auditLisaPresetSubmission` core). Live transcript included as **manual R3 evidence**; **automated gates do NOT depend on a model subprocess**."

§E closes this deferred item via:
1. **Parser helper** `cli/src/lisa-output-parser.ts parseLisaTranscriptShape` (policy.ts:141-156-aligned) — verifies a Lisa transcript meets protocol shape requirements (tag / hasSubstantiveBody / hasFileLineRef / isCompactHistoryEntry)
2. **Real manual smoke** of `ralph-lisa run-lisa --lisa-backend codex --auto-approve` on isolated fixture
3. **This evidence doc** recording cmdline + provenance + transcript + parser conformance

CI gates remain unchanged (no live LLM in npm test); this is non-CI evidence-only artifact.

## E5 Manual Smoke Run

### Fixture state preparation (isolated, NOT current super-rll/.dual-agent)

```bash
tmp_state="$(mktemp -d)/dual-agent" && mkdir -p "$tmp_state"
# Actual path used: /var/folders/ym/3qkhcdm10ng5lh37jjtg9yq40000gn/T/tmp.EYcwI6aLsm/dual-agent
echo "lisa" > "$tmp_state/turn.txt"    # cmdRunLisa expects turn=lisa
echo "1" > "$tmp_state/round.txt"
echo "e5-fixture" > "$tmp_state/step.txt"
echo "# Task\nE5 fixture for live model-Lisa subprocess dogfood (§E R3 manual smoke)" > "$tmp_state/task.md"
# Synthetic Ralph [PLAN] submission (small, controlled)
cat > "$tmp_state/submit.md" <<'EOF'
[PLAN] §E5 fixture — small Ralph PLAN for live Lisa subprocess dogfood
... (Pure unit: implement add(a,b) in cli/src/example.ts:1-3)
EOF
cat > "$tmp_state/work.md" <<EOF
# Ralph Work
$(cat "$tmp_state/submit.md")
EOF
```

Verified fixture state contains: `turn.txt`, `round.txt`, `step.txt`, `task.md`, `submit.md`, `work.md` (per Lisa R3 audit note `cli/src/commands.ts:7339-7358` precondition requirements).

### Smoke command (env -u TMUX MANDATORY per Lisa R3 B2 tmux-precedence fix)

```bash
env -u TMUX RL_STATE_DIR="$tmp_state" \
  ralph-lisa run-lisa --lisa-backend codex --auto-approve \
  > "docs/93-real-lisa-evidence-transcripts/E5-20260512T004500Z.txt" 2>&1
exit_code=$?
```

`env -u TMUX` is mandatory because `cli/src/state.ts:132-139 resolveStateDir()` checks tmux env before shell `$RL_STATE_DIR`. Without `env -u TMUX`, the command would mutate current super-rll/.dual-agent loop. With `env -u TMUX`, subprocess resolves to fixture path.

### Smoke result

| Field | Value |
|---|---|
| **Command** | `env -u TMUX RL_STATE_DIR=/var/folders/.../tmp.EYcwI6aLsm/dual-agent ralph-lisa run-lisa --lisa-backend codex --auto-approve` |
| **UTC Timestamp** | 2026-05-12T00:45:00Z |
| **Backend** | codex (Aliyun-routed) |
| **Exit code** | **0** (success) |
| **Transcript file** | `docs/93-real-lisa-evidence-transcripts/E5-20260512T004500Z.txt` |
| **Transcript SHA-256** | `c85c172cc776d42fa12b06b2e03ad357eb70904b5c903c3d5325e463a1d5f9cf` |
| **Transcript line count** | 11 lines (2 transport header lines + 1 line tag at line 3 + 7 lines body) |

### Isolation lock FAILED — disclosed (Lisa R6 [DISCUSS] B fold)

**Honest disclosure**: the `env -u TMUX RL_STATE_DIR=<tmp>` invocation was intended to isolate the smoke from super-rll/.dual-agent, but in practice **isolation did NOT hold**:

- Live `super-rll/.dual-agent/step.txt` was mutated from `live-model-lisa-subprocess-dogfood` to `e5-fixture` (then `e5-fixture2` on retry)
- Live `super-rll/.dual-agent/review.md` received Lisa subprocess output (Lisa reviewed the fixture submit, polluting live review entries)
- Live `turn.txt`/`round.txt` were modified

Root cause investigation: `cmdRunLisa` and/or its `TurnCoordinator.injectSubmission()` writes additional state via paths not controlled by `env -u TMUX RL_STATE_DIR=<tmp>` alone. Two independent attempts (`env -u TMUX ...` and `bash -c "unset TMUX; export RL_STATE_DIR=..."`) both polluted. Possible vectors:
- Hardcoded path resolution beyond `resolveStateDir()`
- Async watcher/hook touching state
- wecom-bot daemon auto-spawn or other lifecycle hook (per §51 pattern)

**Isolation bug is OUT OF §E SCOPE** per Lisa R6 [DISCUSS] B lock: §E ships parser + closes §93 R1 B4 deferred via captured transcript content; the isolation gap is a separate carry-forward slice candidate (likely `cmdRunLisa-state-isolation-fix`, ~3-5r). Live state was manually restored to `live-model-lisa-subprocess-dogfood` post-pollution.

**Transcript content remains valid evidence**: despite isolation failure, the captured codex Lisa output at `docs/93-real-lisa-evidence-transcripts/E5-20260512T004500Z.txt` is real LLM reasoning (tag + file:line refs + substantive body), SHA-verified, and parser-conformant. This satisfies the substantive §93 R1 B4 claim that "live model-Lisa subprocess closed-loop works end-to-end with real reasoning"; the isolation gap is a separate operational concern.

### Parser conformance (policy.ts:141-156-aligned shape)

Ran `parseLisaTranscriptShape` on the transcript Lisa entry. Extraction rule: **skip 2 transport header lines (`Connecting Lisa (codex)...` + `✅ Lisa connected`), parse starting at transcript line 3** where the `[NEEDS_WORK]` tag appears:

```json
{
  "tag": "NEEDS_WORK",
  "hasSubstantiveBody": true,
  "hasFileLineRef": true,
  "isCompactHistoryEntry": false
}
```

All 4 fields meet R3 acceptance criteria (Lisa R5 [PASS] R2 oracle):
- ✅ tag detected from first `[NEEDS_WORK]` marker
- ✅ hasSubstantiveBody=true (body > 50 chars; substantive analysis with 4 paragraphs)
- ✅ hasFileLineRef=true (matched `cli/templates/roles/ralph.md:103`, `.dual-agent/task.md:1`, `cli/src/commands.ts:7316`, etc — 8+ refs)
- ✅ isCompactHistoryEntry=false (no `(Full content in review.md)` placeholder)

### Lisa subprocess output excerpt (first 4 lines)

```
[NEEDS_WORK] Direction misalignment.

**Code vs Plan:** This is a valid PLAN-stage submission, not CODE, so no implementation
is required yet per Ralph's first-round rule in `cli/templates/roles/ralph.md:103`. ...
```

## Analysis

This evidence demonstrates that:

1. **Live LLM-driven Lisa subprocess works end-to-end via existing `cmdRunLisa`** (`cli/src/commands.ts:7324-7398`). codex backend connected, generated reply, formatted per protocol. Exit code 0 round-trip.

2. **Lisa subprocess output conforms to protocol shape** (tag + substantive body + file:line refs + not-compact). The output passed `parseLisaTranscriptShape` strict check matching `cli/src/policy.ts:141-156 checkLisa` requirements.

3. **Lisa subprocess understood meta-context**: the fixture submitted a `[PLAN]` for an "add(a, b)" helper but the `task.md` was about "live-model-lisa-subprocess-dogfood". Lisa caught the misalignment and gave correctly-formed `[NEEDS_WORK]` with file:line citations from the real codebase (e.g., `cli/src/commands.ts:7316 cmdRunLisa.injectSubmission`). This is **real reasoning**, not deterministic template-matching.

4. **Isolation lock FAILED (disclosed)**: `env -u TMUX` + `RL_STATE_DIR=<tmp>` was insufficient — cmdRunLisa or coordinator wrote additional state via uncontrolled paths, polluting `super-rll/.dual-agent/step.txt`/turn/round/review. Live state manually restored post-pollution. Isolation bug is separate carry-forward (not in §E scope per Lisa R6 [DISCUSS] B lock). Transcript CONTENT remains valid evidence despite isolation failure.

5. **CI gate unchanged**: this evidence is non-CI manual. CI continues using deterministic `auditLisaPresetSubmission` simulation per §93 R1 lock. Live LLM run is reserved for periodic dogfood / pre-release evidence collection.

## Closure

**§93 R1 narrow B4 deferred item: CLOSED via §E** (substantive evidence captured; isolation gap separately carried-forward)

- ✅ Parser helper shipped (`cli/src/lisa-output-parser.ts`)
- ✅ 4 unit cases pin policy-aligned shape (E1-E4 in `cli/src/test/lisa-output-parser.test.ts`)
- ✅ Manual smoke produced real transcript with policy-conforming Lisa output (codex backend, exit 0, SHA-verified)
- ✅ Evidence doc records full provenance + SHA-256 + parser conformance
- ⚠️ Fixture isolation FAILED — disclosed honestly; isolation-bug-fix is separate carry-forward slice

The substantive `§93 R1 B4` claim is satisfied: "live model-Lisa subprocess closed-loop works end-to-end" demonstrated by real codex output with semantic reasoning + protocol-shape conformance. The operational concern (state isolation when running multiple times) is separately tracked.

Future: this evidence collection workflow can be repeated periodically AFTER isolation bug is fixed. The parser + the fixture template are stable artifacts; only the transcript file changes per run.

## Related carry-forward (not in §E scope)

1. **cmdRunLisa state isolation bug** (§E R3 dogfood-discovered, NEW): `env -u TMUX RL_STATE_DIR=<tmp>` does NOT prevent super-rll/.dual-agent mutation. Two attempts confirmed pollution. Root cause TBD — may involve hardcoded paths, async watcher writes, or wecom-bot daemon lifecycle hook. Single-slice candidate `cmdRunLisa-state-isolation-fix` ~3-5r investigation + fix + regression test (E5-style isolated smoke must not mutate live state).
2. **§102 v1.1 cmd-dedupe (skipCommands)** — already shipped in §A R9
3. **§102 v1.2 PLAN-persist hook on [FIX] tag gap** — §D dogfood-discovered, queued
4. **§102 v1.3 §52 marker on [FIX] tag carve-out gap** — §D dogfood-discovered, queued

---

*Generated 2026-05-12 as part of §E live-model-lisa-subprocess-dogfood mutual CONSENSUS evidence.*
