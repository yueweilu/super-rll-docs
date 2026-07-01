# wecom ↔ ralph-lisa interaction state matrix + failure-mode catalog

§66 deliverable. Maps 9 state axes × 16 failure modes with per-mode test-design proposals. Implementation defers to §67+ separate slices per failure-mode category.

## State axes (9)

| # | Axis | Values | Code anchor |
|---|------|--------|-------------|
| 1 | Ralph state | idle / actively-thinking-LLM / submitting / waiting-Lisa-review / interactive-menu / paused (RL_PAUSED) / dead-hung | `cli/src/commands.ts:4138 check_for_interactive_prompt` |
| 2 | Lisa state | same as Ralph + codex markers ("Working (Xs)", "esc to interrupt", "Messages to be submitted") | same regex with codex variants |
| 3 | Inbound message kind | text / voice (auto STT'd) / `/task` / `/feedback` / `/ralph` / `/lisa` / `/cmd` / freeform-no-prefix | `wecom-bot/src/feedback.ts` parser |
| 4 | Resolved routing target | ralph / lisa / both | `wecom-bot/src/feedback.ts` (§50 default → ralph) |
| 5 | Current turn owner | ralph / lisa | `.dual-agent/turn.txt`; `cli/src/plan.ts:444-446`; `.dual-agent/watcher.sh:423` |
| 6 | Delivery pipeline state | 8 stages each may succeed/fail/suppress | see Pipeline Stages section below |
| 7 | Watcher state | running-normal / paused / dead-no-heartbeat / sandbox-restricted | `cli/src/sandbox.ts` per §11.X |
| 8 | wecom-bot daemon state | alive-healthy / alive-stale-heartbeat / dead-no-pidfile-write | `wecom-bot/src/daemon.ts:484` writes `<stateRoot>/wecom-bot.pid` |
| 9 | Concurrency | serial msg / rapid burst (N msgs in <1s) / multi-target-mixed | (no explicit code; emergent property) |

## Pipeline Stages (axis 6 expansion)

Each msg traverses these stages; stranding can happen at any point:

| # | Stage | Code anchor | Failure modes |
|---|-------|-------------|---------------|
| P1 | webhook-accept | `wecom-bot/src/callback.ts` | F9 daemon dead → POST returns 5xx; user side fail-silent |
| P2 | daemon-reply (✓ 已记录 ack to user) | `wecom-bot/src/feedback.ts` reply path | F9; F11 daemon write but reply send fails |
| P3 | inbox-append | `wecom-bot/src/feedback.ts:147-169` | F8 rapid burst race; F11 disk full |
| P4 | inbox-cursor-state (per side) | `cli/src/wecom-feedback.ts:89-109` read; `:170-220` resolve | F3 cursor stale; F15 Lisa cursor never advanced |
| P5 | watcher-mtime-observe | `.dual-agent/watcher.sh:839-905` | F10 watcher dead; F11 sandbox-restricted (capture-pane fails) |
| P6 | wake-fire-or-suppress | `.dual-agent/watcher.sh:839-905` | F1 interactive-prompt suppress; F4 Lisa-side mirror |
| P7 | cursor-advance (after wake fired AND consumed) | `cli/src/wecom-feedback.ts:170-220` | F3 wake fired but agent not run unread cmd |
| P8 | agent-consume | tool-call invocation | F13 mid-LLM-call delay |

## Failure mode catalog (F1-F16)

### F1 — 5-hour-stall (real bug; user-reported 2026-05-08)

- **Setup**: Ralph state = interactive-menu (e.g., `next-step` user-options menu); turn=ralph; msg target=ralph; daemon alive; watcher running
- **Trigger**: user sends wecom msg
- **Pipeline traversal**: P1 OK → P2 OK (user sees "✓ 已记录") → P3 OK (inbox.md appended) → P4 cursor stale (Ralph hasn't read) → P5 watcher observes mtime change → **P6 watcher suppresses wake** because `check_for_interactive_prompt` returns true → P7 cursor never advances → P8 Ralph never consumes
- **Expected behavior**: msg eventually consumed; user gets actual Ralph response within X minutes
- **Current behavior**: indefinite stall (5+ hours); user only sees daemon ack, no Ralph reply
- **Test seam (unit-DI)**: simulate `check_for_interactive_prompt` returns true + simulate inbox-mtime change + assert wake suppressed AND escalation flag set
- **Test seam (integration)**: real tmux pane in interactive-prompt state + write to wecom-inbox.md + observe watcher behavior over 30s; assert wecom-push escalation fires (after fix lands)
- **Test category**: unit-DI (P6 logic) + integration-tmux (full pipeline traversal)

### F2 — daemon-health-check false-negative (real bug)

- **Setup**: daemon alive at pid X; pidfile at `.rll/wecom-bot.pid` (correct); cli check looks at `wecom-bot/.wecom-bot.pid` (wrong path per `cli/src/daemon-health.ts:108`)
- **Trigger**: operator runs `ralph-lisa daemon-health-check`
- **Expected**: status=healthy + pid=X
- **Current**: status=not-started (false negative)
- **Test seam (unit-DI)**: inject readFileFn that returns content at `.rll/wecom-bot.pid` path; assert health-check returns healthy
- **Test category**: unit-DI

### F3 — Ralph discipline gap (real bug; recurred 23:50 this session)

- **Setup**: Ralph state = idle; cursor stale (inbox has unread); user sends "继续"
- **Trigger**: Ralph composes reply WITHOUT running `ralph-lisa wecom-feedback unread`
- **Expected**: machine block ralph from submitting if inbox unread > cursor
- **Current**: no enforcement; relies on CLAUDE.md AUTO-START mental discipline (fails)
- **Test seam (unit-DI)**: inject inbox.md mtime > cursor file mtime + assert `ralph-lisa policy check ralph` returns blocked + reason mentions "wecom unread"
- **Test category**: unit-DI

### F4 — Lisa-side mirror of F1

- **Setup**: Lisa state = interactive-menu (codex "Messages to be submitted" prompt); turn=lisa; msg target=lisa; same as F1 mirrored
- Otherwise identical to F1 with Ralph→Lisa swap
- **Test seam**: same as F1 with target=lisa
- **Test category**: same as F1

### F5 — target=both with one side in menu

- **Setup**: target=both; Ralph in menu; Lisa idle
- **Trigger**: msg arrives
- **Expected**: Lisa cursor advances + Lisa consumes; Ralph cursor stays; once Ralph exits menu, Ralph consumes too (independent cursors)
- **Current**: ?? need to verify code path — Lisa-side wake may also be suppressed if check_for_interactive_prompt is global vs per-pane
- **Test seam (unit-DI)**: simulate target=both + Ralph menu detected + Lisa not menu + assert Lisa wake fires + Ralph cursor stays
- **Test category**: unit-DI

### F6 — turn-transition race

- **Setup**: Ralph just called submit-ralph (turn flips ralph→lisa); msg target=ralph arrives mid-transition (during 100ms-window)
- **Trigger**: turn.txt write + new wecom msg simultaneously
- **Expected**: msg lands in inbox; consumed when Ralph gets next turn (Lisa's review pushes turn back)
- **Current**: ?? possible race in turn.txt read (P5 may read stale turn value)
- **Test seam (integration-fs-mock)**: simulate turn.txt write + concurrent wecom-feedback append + assert msg eventually consumed correctly
- **Test category**: integration

### F7 — /task while Ralph mid-slice

- **Setup**: Ralph mid-slice (e.g. R5 [FIX] of §X); user sends `/task <Y>`
- **Trigger**: /task command arrives
- **Expected per CLAUDE.md**: "强信号开新 sub-slice — next-step + 写 PLAN, 不只是当 feedback"
- **Current**: Ralph reads as freeform; no automatic next-step trigger; depends on Ralph mental discipline
- **Test seam (unit-DI)**: parse /task message + assert `ralph-lisa policy check ralph` flags "pending /task → expect next-step before submit"
- **Test category**: unit-DI

### F8 — rapid burst race

- **Setup**: N=10 msgs in <1s; daemon writes inbox.md sequentially
- **Trigger**: 10 callbacks
- **Expected**: all 10 msgs in inbox.md (no race-loss)
- **Current**: ?? need to verify file-lock semantics in `wecom-bot/src/feedback.ts:147-169`
- **Test seam (unit)**: stress test daemon append with concurrent writes; assert linecount = N
- **Test category**: unit

### F9 — daemon silent death

- **Setup**: daemon-state=dead; pidfile may be stale (process gone but file remains)
- **Trigger**: msg arrives
- **Expected**: webhook callback returns 5xx; user-side wecom shows error + retry; OR cli `daemon-health-check` flags dead → operator restart
- **Current**: F2 false-negative compounds; user gets silent ack-only behavior; no operator alert
- **Test seam (integration)**: kill daemon process + send mock callback + assert health-check status=dead + (after fix) auto-respawn fires
- **Test category**: integration

### F10 — watcher silent death

- **Setup**: watcher dead (heartbeat stale); Ralph alive but never wakes
- **Trigger**: turn-change OR inbox-write
- **Expected**: watchdog auto-respawn fires (per existing `cli/src/commands.ts` watchdog block)
- **Current**: §53 daemon-death-alert exists but F2 health-check bug breaks detection chain
- **Test seam (integration)**: kill watcher + assert watchdog respawn within 30s
- **Test category**: integration

### F11 — sandbox-restricted pane

- **Setup**: pane sandbox-restricted (per §11.X); pipe-pane bind fails
- **Trigger**: capture-pane (P5) + send-keys (P6)
- **Expected**: capture-pane works (read-only OK in sandbox); send-keys may fail; watcher logs failure + escalates
- **Current**: §11.X sandbox detection exists; some send-keys silently fail
- **Test seam (unit)**: mock sandbox-restricted env var + assert watcher detects + uses fallback wake (e.g. file-flag)
- **Test category**: unit

### F12 — voice STT path

- **Setup**: user sends voice msg via wecom; STT in daemon-side
- **Trigger**: voice payload arrives
- **Pipeline**: P1 OK → STT (variable latency 1-30s) → text → P3 inbox.md append (delayed)
- **Expected**: same as text path, just delayed by STT
- **Current**: STT failure cases? large-voice timeout? Need verify
- **Test seam (unit)**: mock voice payload + STT seam returning text/error/timeout; assert text path follows
- **Test category**: unit

### F13 — mid-LLM-call wecom arrival

- **Setup**: Ralph actively-thinking (LLM call in flight, e.g. 30s tool-call); msg arrives during this window
- **Trigger**: msg arrives
- **Expected**: msg lands in inbox; Ralph consumes after current tool-call returns (tool-result triggers re-poll)
- **Current**: depends on Ralph's discipline to run wecom-feedback unread on next turn
- **Test seam (integration)**: simulate Ralph tool-call duration + concurrent wecom-feedback append + assert Ralph consumes within next-tool-call window
- **Test category**: integration

### F14 — escalation kick-in for off-laptop

- **Setup**: msg landed > 5 min ago; cursor still stale; user sees daemon ack but no Ralph response
- **Expected**: watcher detects stale cursor + auto-wecom-push warning to user "agent stuck, recommend check"
- **Current**: NO escalation; user has to manually realize there's a problem
- **Test seam (integration)**: time-mock watcher loop with cursor stale > 5 min + assert wecom-push fires
- **Test category**: integration

### F15 — Lisa cursor stale (Lisa-side mirror of F3)

- **Setup**: Lisa state = idle; lisa cursor stale (msgs target=lisa unread); Lisa about to submit-lisa
- **Expected**: machine block Lisa submit if inbox-cursor.lisa stale
- **Current**: no enforcement (same as F3, mirrored)
- **Test seam**: same as F3 with side=lisa
- **Test category**: unit-DI

### F16 — Ralph reads inbox but message has typo / wrong markers / unparseable

- **Setup**: user sends "/tsak" (typo of /task) or formatting variation
- **Trigger**: Ralph reads
- **Expected**: graceful fallback (treat as freeform) + inform user via wecom-push "did you mean /task?"
- **Current**: silently treated as freeform; user not told their command didn't trigger
- **Test seam (unit)**: parse common typos + assert suggested-command response generated
- **Test category**: unit

## Test-design summary

| Category | Count | Test type |
|----------|-------|-----------|
| unit-DI | 10 (F1, F2, F3, F4, F5, F7, F11, F12, F15, F16) | Pure-fn injection seam testable; no real wecom |
| integration-tmux/fs | 7 (F1 alt, F6, F8, F9, F10, F13, F14) | Real tmux pane / real fs / time-mock; no real wecom server |
| e2e-real-wecom | 0 | None at this stage; defer to dogfood |

Note: F1 appears in both rows because it has two test seams: `unit-DI` for the suppress-logic + `integration-tmux` for full pipeline traversal. Total distinct failure modes = 16.

## §67+ implementation slice queue (handoff after §66 close)

Per CLAUDE.md "don't bundle" + Lisa carry-forward "≥1 slice per failure-mode category":

- **§67** = `daemon-health-check-pidfile-fix` (mechanical, F2) — fix `cli/src/daemon-health.ts:108` `DEFAULT_PID_FILE`. ~5 rounds.
- **§68** = `watcher-inbox-mtime-polling-and-escalation` (architectural, F1+F4+F14) — watcher inbox-mtime poll + interactive-prompt-skip detection + escalation wecom-push. ~10 rounds.
- **§69** = `ralph-lisa-discipline-cursor-stale-block` (discipline, F3+F15) — `ralph-lisa policy check` blocks submit if inbox.cursor.{ralph,lisa} stale. ~6 rounds.
- **§70** = `task-command-strong-signal-handling` (F7) — auto next-step on `/task` + Ralph/Lisa preset notice. ~8 rounds.
- **§71** = `daemon-respawn-watchdog` (F9+F10) — auto-respawn for dead daemon/watcher. ~7 rounds.
- **§72** = `command-typo-fallback-suggestion` (F16) — typo correction hint via wecom-push. ~5 rounds.
- F5/F6/F8/F11/F12/F13: defer to follow-ups or roll-up depending on Lisa narrow.

Total estimated rounds for §67-§72 backlog: ~41 rounds.

## Out-of-scope

- ANY code change in §66
- Real wecom-bot server testing (defer to §67+ when impl lands)
- Refactoring sibling-pkg cli-ships-standalone constraint (§65 carry-forward; separate architecture slice)

## References

- Trigger: user-reported 5-hour stall 2026-05-08 23:50; missed scope-guidance 22:36 / 22:40 / 23:03
- Lisa r1 narrows accepted: turn-owner axis + delivery-pipeline-state axis + event-kind/routing-target split
- Lisa r3 narrows accepted: 9-axis matrix
- Lisa r4 PASS: canonical current-stage sync
