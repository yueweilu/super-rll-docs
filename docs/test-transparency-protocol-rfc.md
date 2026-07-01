# Test Transparency Protocol — RFC / design

**Status:** draft for build (2026-06-02). **Author:** working session.
**Companion:** CLAUDE.md §102/§123/§137/§140/§145/§149 (the existing test-gate
machinery this surfaces), `docs/rll-term-platform-rfc.md`.

## Problem (user-stated, 2026-06-02)

The test gate "feels unreliable / black-box":
1. No **test-plan confirmation** step for the user during the process.
2. The **TDD-first requirement is silently skipped, without a reason**.
3. **Test cases are never listed out for the user to confirm.**
4. **No rationale** is given for why the gate is configured the way it is.
5. After execution, **no proactive test report / process / evidence** — opaque,
   which makes the user feel unsafe.

## Root cause

All the gate machinery is **agent-to-agent (Ralph ↔ Lisa)**; the **user is never
a participant**. The project already *produces* every artifact the user wants —
it just never surfaces them to the user or invites confirmation. So this is a
**user-in-the-loop transparency + confirmation layer on top of existing
artifacts**, NOT a new test engine.

| Pain | Existing artifact (already generated) | Missing |
|---|---|---|
| no plan confirmation | `.dual-agent/auto-tdd-plan-<step>.json` (5/6-col case table) | never shown to the **user** |
| TDD skipped w/o reason | §102 `resolveTddMode` + `Estimate` + escape whitelist | decision internal, **reason not surfaced** |
| cases not listed | the C1..Cn table in R1 [PLAN] | only Lisa sees it |
| no gate rationale | §123 complexity-judge `evidence[]` + `recommendations[]` | not rendered for the user |
| no post-exec report | `gate-results.md`, `test-execution-log.jsonl`, §140 release-report | release-time only; not per-slice, not pushed, not readable |

## Locked decisions (user, 2026-06-02)

1. **Two modes**: `supervised` (attended) → CP1 **blocks** for user ack;
   `transparent` (autonomous/overnight) → CP1/CP4 **push but auto-proceed**
   (logged). The off-laptop user always *sees* the plan/report; only attended
   runs block.
2. **Delivery = multi-channel** (terminal + wecom now), via a **channel
   abstraction** (below) — not hardcoded to wecom. Future channels (feishu /
   lark / dingtalk / rll-term menubar) plug in without touching the protocol.
3. **Confirmation granularity = whole-plan**: user confirms/adjusts the plan as
   a unit with free-text adjustment. Per-case interactive editing is deferred.
4. **v1 scope = CP1 (plan card) + CP4 (report card)** + the channel abstraction.
   CP2/CP3 are content *inside* CP1. Per-case editing → v2.

## The 4 checkpoints

### CP1 — Test Plan Card (pre-code, on R1 [PLAN] submit)
Renders `auto-tdd-plan-<step>.json` + complexity-judge + the §102 TDD decision
into a human card, delivered via the channel layer:

```
📋 测试计划确认 — slice: <slug>
任务: <one-line goal>
TDD 决策: ✅ 走 TDD-first   理由: Estimate=6r ≥ 阈值4r, 复杂度=complex
        (或) ⏭ 跳过 TDD      理由: doc-only (escape 白名单)      ← 必带理由 [CP2]
测试用例 (N):
  C1 [unit] <desc>   输入 <x>  期望 <y>  失败信号 <z>
  ...
门禁分层 + 为什么 [CP3]:
  unit ✓ 必跑 — 防 <什么> 回归 (complexity-judge high-conf, 引用 file:line)
  e2e  ✗ 跳过 — <理由>
不覆盖 (negative scope): <...>
👉 [确认] / [改用例] / [改门禁] / [要求跳 TDD 并给理由]
```
- `supervised`: blocks until ack (confirm/adjust).
- `transparent`: push + auto-proceed after timeout; decision logged.

### CP2 — TDD decision always explicit + reasoned
§102 must always emit `TDD: required|skipped` + a **reason** (estimate +
complexity class, or an escape-whitelist member: doc-only / config-only /
single-rename / process-only). Never silent. Rendered in CP1. Fixes pain #2.

### CP3 — Gate rationale ("why this test, what it protects")
Each tier + case carries a one-line rationale sourced from §123 complexity-judge
`evidence[]`/`recommendations[]`. Rendered in CP1. Fixes pain #4.

### CP4 — Test Report Card (post-gate, proactive)
After the §70 cascade, renders `gate-results.md` + `test-execution-log.jsonl` +
planned cases into a report, delivered via the channel layer:

```
✅ 测试报告 — <slug>  (R3 [CODE])
计划 N 用例 → 执行 N → 通过 N → 失败 0
  C1 ✅ <cmd> → <result>   证据: test-execution-log.jsonl#L<n>
  ...
门禁: unit✓ lint✓ typecheck✓ | 回归 <a>/<b>
覆盖核对: 计划 N 用例全部执行 ✅ (无漏跑 / 无谎报)
证据链: gate-results.md(<mtime>), test-execution-log.jsonl
```
The **coverage cross-check** (planned vs actually-executed, via §137 log) is the
anti-black-box core — it catches "claimed but didn't run". Fixes pain #5.

## Multi-channel interaction abstraction (new shared substrate)

Today user-facing pushes are hardcoded to wecom (§154 policy-block, §150 smoke,
§153 lisa-watchdog, the 主动求救 scenarios). Per decision #2, introduce a channel
layer that the test cards (and later, those existing pushes) consume.

```ts
interface UserChannel {
  id: string;                                  // 'terminal' | 'wecom' | 'lark' | ...
  push(msg: ChannelMessage): Promise<void>;    // one-way notify
  prompt(q: ChannelPrompt): Promise<Ack|null>; // two-way (CP1 supervised); null = no reply in window
  available(): boolean;                        // daemon up / configured?
}
```
- **Registry + config**: `.ralph-lisa.json` `channels: ['terminal','wecom']`;
  push fans out to all `available()`; an ack from **any** channel resolves a
  `prompt` (first-wins).
- **v1 implementations**: `TerminalChannel` (pane print + inbox read),
  `WecomChannel` (wraps existing `wecom-push` + `wecom-feedback` inbox).
- **Later**: `LarkChannel` / `DingtalkChannel` (the `lark-bot` / `dingtalk-bot`
  sibling pkgs already exist), `RllTermChannel` (menubar card).
- **Migration**: after v1, move §154/§150/§153/求救 pushes onto `channel.push`
  so there's one delivery path, not N hardcoded wecom calls.

This keeps the protocol channel-agnostic and makes "support more channels" an
additive implementation, never a protocol change.

## Implementation (surfacing layer; reuses existing artifacts)

- **New CLI**: `ralph-lisa test-plan-card [--slice <s>] [--push] [--block]` and
  `ralph-lisa test-report-card [--slice <s>] [--push]` — render the artifacts
  into cards; deliver via the channel registry.
- **Hooks**: CP1 fires in `cmdSubmitRalph` on R1 [PLAN]; CP4 fires after
  `handleMutualCompletion` (§70 cascade).
- **Mode**: `ralph-lisa start --supervised-tests` or `.ralph-lisa.json`
  `test_supervision: supervised|transparent` (default: supervised attended,
  transparent under `--engine`/autonomous).
- **Audit ledger**: `.dual-agent/test-transparency/<slice>.jsonl` — one entry
  per checkpoint (`{cp, slice, round, decision, acked_by, channel, ts}`).
- **Does NOT weaken** the Ralph↔Lisa mechanical gates (§102/§123/§137/§149) —
  this adds a user window + confirmation on top.

## Phased plan

| Phase | Deliverable | Gate to next |
|---|---|---|
| **T0** channel abstraction | `UserChannel` + registry + Terminal/Wecom impls + tests | push fans out, ack from either resolves a prompt |
| **T1** CP4 report card | `test-report-card` + post-gate hook + coverage cross-check | a real slice auto-pushes a readable report w/ evidence cites |
| **T2** CP1 plan card | `test-plan-card` + R1 hook + CP2/CP3 content + supervised block | attended run blocks for plan ack; overnight pushes + proceeds |
| **T3** migrate legacy pushes | move §154/§150/§153/求救 onto `channel.push` | one delivery path; no hardcoded wecom in those paths |
| **v2** | per-case interactive edit; lark/dingtalk/rll-term channels | — |

T1 before T2 deliberately: the report card (CP4) is the biggest pain-relief and
has no blocking semantics, so it ships value fastest and de-risks the channel
layer before adding the blocking prompt path.

## Open questions (for the user / build time)

1. **Supervised ack UX in terminal**: a `[y/adjust]` prompt in the pane, or a
   `ralph-lisa test-plan ack --slice <s>` command the user runs? (Latter is
   loop-safe; former is smoother attended.)
2. **Transparent-mode timeout**: how long does CP1 wait before auto-proceed
   (e.g. 0s = pure push, or N min grace)? Default 0s (pure push) for overnight.
3. **Per-case editing (v2)**: free-text "change C2 to assert X" → Ralph re-plans,
   or structured row edits? Defer.

## Next step

Build **T0 (channel abstraction)** first — small, foundational, unblocks both
cards and the later legacy-push migration. Then T1 (report card) for fastest
pain relief.
