# §211 task-intake-skill — Design Document (Phase 0)

**Status**: DRAFT (R2 — Lisa R1 narrows adopted)
**Date**: 2026-05-26
**Authors**: Ralph (Claude Opus 4.7) + user direction (2026-05-26 conversation)
**Reviewer**: Lisa

**§211 = Phase 0 = design-only**. **No code, no cli, no skill files ship in this sub-slice.** Implementation lives in §212 (skill foundation), §213 (test-plan co-creation), §214 (clarify merge), §215 (monitoring). This document is the contract those slices implement.

---

## Problem statement

RLL 当前在简单任务上有显著 friction。用户实际观察：一个简单修改任务 Ralph + Lisa 花 1 小时讨论测试设计，**0 行真代码**，主要因为 policy-gate 强制 §128 clarify + §123 complexity-verify + §102 auto-TDD + 5-col 测试表 + doc-oracle-spec + §149 attest 等一连串协议礼仪。

CCL D4 retrospective (`docs/d4-review-startup-retrospective.md`) 是早期信号——纯 review 任务卡 14 round / 1 小时 / 0 work。§207 task_type fast-path 部分解决（review / doc / process 跳 auto-tdd-plan + Required test row），但**没有解决以下两个根因**：

1. **complexity-judge over-judges**：LLM 把"动 3 个文件"或"改个 API 签名"判成 complex → 强制 §128 R0 clarify + §102 R2 tests-only + §123 PLAN-time judge JSON。即使任务实际就是 1-2 commit 能搞定。
2. **测试计划 nitpick 死循环**：R1 [PLAN] 阶段 Lisa 反复 narrow Ralph 的 5-col 表 oracle / Required 分布 / tier 选择。每轮 +5-10 min friction，3-5 round 才 PASS。Lisa 也不知道用户真要什么，凭模型 instinct nitpick。

---

## Design goal

引入 **task-intake skill**：用户在每个新 sub-slice 开始时通过 agent-driven dialog 显式锁定：

1. **Mode**：simple / standard / strict（替代 complexity-judge LLM 自动判）
2. **Scope**：复用 §128 clarify Stage 1-3 codebase grill（仅 strict mode）
3. **Test plan**（仅 strict mode）：agent 提议 + 用户共创 + lock 到 SoR；Lisa 不能 second-guess

输出权威：`.dual-agent/clarify-locked-<step>.json` 含 `{mode, understanding, scope, user_locked_tests}`。Lisa R1 review 限于"实现是否符合 locked plan"，不能 narrow "plan 不够 specific"。

---

## Non-goals

- 不破坏 §207 task-type fast-path（review/doc/process 仍走 task_type whitelist）
- 不改变 §122 task-capability ack（仍要求用户独立 ack）
- 不改 §137 / §144 / §149 双向 attest 机制
- 不破坏 §70 post-consensus cascade
- 不删除 cli flag backdoor（`--mode simple --user-signature "<...>"` 仍可显式 set, 跳 skill；但 `--user-signature` 强制必填）

---

## Three modes (the core abstraction)

### `mode = simple` (efficiency-first)

**Semantics**: 用户显式 ack "我信我自己 + 信 ralph，跳掉所有 protocol 礼仪"。

**Behavior**:
- §128 clarify 跳过（mode 已 ack，无需 5-stage grill）
- §122 task-capability gate 降级为 warn（mode-locked 锁本身被 user ack 替代）
- §102 auto-TDD 跳过（不要求 R2 tests-only + 5-col 表）
- §123 complexity-judge JSON 跳过（不要求 paste judge JSON in PLAN body）
- §134 tests-only marker plan-bound 跳过
- doc-oracle-spec 5-col 表跳过（仅 doc-task 时本来就要的）
- §149 attest 三件套保留，允许 `Skipped: simple-mode` justification
- §144 Lisa verified-cite 保留
- §207 task-type file whitelist 保留（fast-path 不被 simple mode 削弱）
- §70 post-consensus cascade 保留 (Required ✓ rows still gate; simple mode usually escapes via `**Tests**: none (...)` route)

**Trust boundary lock (Lisa R1 B2 narrow — concrete enforcement spec)**:

mode=simple **必须** carry a verifiable user-provenance signature. Current §122 ack-user pattern is the prior art. Concrete mechanism:

1. **CLI flag requires `--user-signature` field**:
   ```bash
   ralph-lisa task-intake --commit --mode simple --user-signature "<token>"
   ralph-lisa next-step "fix-x" --mode simple --user-signature "<token>"
   ```
   Without `--user-signature`, cli exits 2 with `mode-set-requires-user-signature`.

2. **Signature requirements** (mechanically validated by cli):
   - Length ≥10 chars
   - Must contain ≥1 audit keyword OR ISO date (`simple` / `efficiency-first` / `trivial` / `YYYY-MM-DD`)
   - Recorded verbatim into `clarify-locked-<step>.json` `decided_by_signature` field
   - Recorded into audit log `.dual-agent/audit-log.jsonl` with timestamp + step + invocation source
   
3. **Source detection** (best-effort, defense in depth):
   - cli checks `process.env.RL_SESSION_ID` — if invocation comes from same RLL session as the active sub-slice, mark `source: agent-context-suspected`
   - This doesn't block the call but flags it in audit log for post-hoc Lisa narrow
   - Ralph CAN forge the signature (he has shell access), BUT doing so creates auditable trace:
     - audit-log entry with timestamp
     - clarify-locked json with signature
     - §149 Lisa-attest body must cite the mode change; Lisa narrow can ask "where did this signature come from?"

4. **Skill-driven path** (the recommended path):
   - User answers "A" / "B" / "C" in conversation to Ralph's Stage 0 prompt
   - Ralph runs `task-intake --commit --mode simple --user-signature "<user's literal message preview>"` 
   - The signature becomes the user's actual chat reply (10+ chars naturally)
   - If Ralph forges this without real user message, the chat transcript shows the discrepancy

5. **Anti-loophole tests (C12 + C13 + C14)**:
   - C12: Ralph submit body declaring `Task type: simple-task` / `Mode: simple` is **ignored**; only SoR JSON is authoritative
   - C13: cli without `--user-signature` → block `mode-set-requires-user-signature`
   - C14: signature <10 chars or missing audit keyword → block `user-signature-too-weak`

6. **Comparison with §122**: this is weaker than §122 ack-user (which mandates a fresh interactive prompt). The difference is intentional — §122 is a one-time per-slice trust-anchor for testing capability; simple mode is a frequent per-slice "let's go fast" signal. A heavier mechanism would defeat the UX purpose. The audit log + Lisa-narrow combo is the secondary defense.

**Trigger condition for proper use**:
- 修 typo / formatting / comment
- 单文件 ≤50 行 diff
- update 单行 config 值
- README / doc 改个标题
- 改 1-2 行 if 判断

**Mechanical 防滥用**:
- `computeStepDiff()` 算出来 >3 文件或 >200 行 diff → simple mode 自动升级到 standard (warning)
- 该 mechanic 在 R3+ submit 时触发（用户开始时可能不知道范围会膨胀）

### `mode = standard` (default)

**Semantics**: 当前默认行为。LLM 自动判复杂度，complex/expert 类任务进 §128 clarify 流程。

**Behavior**:
- 等价于现状（§128 / §123 / §102 / §122 / §149 全套）
- 任务声明 `next-step` 时未指定 `--mode` → standard
- skill Stage 0 提示用户："我可以快速判（standard），你也可以选 simple 或 strict"

### `mode = strict` (quality-first)

**Semantics**: 用户显式声明 "请你帮我把关，即使任务简单也走全套 + 我们一起把测试计划 lock 死"。

**Behavior**:
- §128 clarify 完整 5-stage 走（即使 LLM 判 simple）
- 强制 task-intake skill Stage 4 测试计划共创
- 输出 `user_locked_tests[]` 进 clarify-locked json
- Ralph R1 PLAN body 必须 cite locked tests, 不能自由扩展
- Lisa R1 review scope 限于 "实现符合 locked plan"，不能 narrow "测试设计"
- §149 lisa-attest quality_score 算法识别 user-locked plan，narrow scope 限制

**Use case**:
- 安全敏感 / 多并发 / 跨多系统的 task
- 用户明知任务表面简单但底下有坑（e.g. refactor 认证流程, schema migration）
- 用户没把握想让 RLL 帮把关

---

## Skill design

### File layout

```
cli/templates/skills/task-intake/
└── SKILL.md                 # manifest with frontmatter
```

### Manifest content

```markdown
---
name: task-intake
description: >
  Use this skill at the start of every new sub-slice to grill the user on
  simple-vs-complex mode + optionally co-create the test plan. Agent should
  auto-invoke when starting a new sub-slice that has no clarify-locked-<step>.json
  in .dual-agent/.
triggers:
  - new sub-slice
  - user says start / begin / work on / fix / refactor / review
  - .dual-agent/clarify-locked-<step>.json absent
---

# Task Intake

When you (Ralph) start a new sub-slice and there is no
`.dual-agent/clarify-locked-<current-step>.json`, your first message must be the
Stage 0 prompt below.

## Stage 0 — Mode selection

Ask the user, single message, in their preferred language:

```
我准备开始这个任务. 你想用哪种模式?

A. 简单 (efficiency-first)
   信任我直接做, 跳过完整 TDD 礼仪 + clarify grill.
   适合: 修 typo / 改单行 config / 单文件少量改动

B. 标准 (default)
   让我自己判. 复杂的话会走完整 grill + TDD.

C. 严格 (quality-first)
   即使任务看起来简单也走全套, 我们先一起把测试计划 lock 死.
   适合: 我没把握 / 安全敏感 / 跨系统改动

回复 A / B / C.
```

### Stage 0.5 — When mode is A or B, commit immediately

If user picks A → invoke `ralph-lisa task-intake --commit --mode simple --user-signature "<user's literal A-reply or ≥10 char audit token>"`
If user picks B → invoke `ralph-lisa task-intake --commit --mode standard --user-signature "<user's literal B-reply or ≥10 char audit token>"`

These two finalize the skill. Ralph proceeds to R1 PLAN.

### Stage 1-3 — Codebase grill (only when mode = C / strict)

Reuse §128 clarify Stage 1-3:
- Stage 1: explore relevant codebase files
- Stage 2: build decision tree
- Stage 3: 1-question-at-a-time grill the user on scope (covered / negative-scope / risks)

### Stage 4 — Test plan co-creation (only when mode = C / strict)

After Stage 1-3 builds understanding, propose test plan:

```
基于上面探索, 我建议以下测试 case:

C1: <tier> - <file path> - <oracle 描述>
C2: <tier> - <file path> - <oracle 描述>
C3: <tier> - <file path> - <oracle 描述>

确认 / 改 / 加 / 删?
```

User can:
- "全部确认" → all C1-Cn locked as-is
- "C1 改 oracle 成 X" → modify single case
- "C3 改成 e2e tier" → modify tier
- "加 C4 测 ..." → add case
- "删 C2" → remove case

Loop until user "all good".

### Stage 5 — Commit

Invoke `ralph-lisa task-intake --commit --mode strict --user-signature "<≥10 char audit token>" --understanding "..." --scope-covered "..." --scope-excluded "..." --risks "..." --tests "<json>"`.

Output: `.dual-agent/clarify-locked-<step>.json` with full schema.
```

### Auto-fire mechanism (Lisa R1 decision — concrete text-append spec)

Lisa R1 narrow: do not rely on hidden model memory. Specify the exact file Ralph must read or text appended. Concrete spec:

`cmdStep()` (next-step) 写完 SoR + 设 turn=ralph 后, 检查：

```typescript
const lockPath = path.join(stateDir, `clarify-locked-${step}.json`);
const modeArg = parseModeArg(args);  // --mode simple/standard/strict

if (!fs.existsSync(lockPath) && !modeArg && !args.includes("--skip-intake")) {
  // 1. Print Stage 0 prompt to stdout (so user sees it in terminal)
  printStage0Prompt();
  
  // 2. APPEND verbatim Stage 0 prompt to .dual-agent/task.md under section "## §211 task-intake stage 0"
  //    This is the SoR for Ralph's first message; Ralph reads task.md as standard practice.
  appendStage0ToTaskMd(stateDir, step);
}
```

Where `appendStage0ToTaskMd()` writes (literal verbatim, no template interpolation beyond `<step>` name):

```markdown

---

## §211 task-intake stage 0 — please respond before R1 [PLAN]

Ralph: your first message in this sub-slice MUST be the Stage 0 prompt below
to the user. Wait for user's response before submitting R1 [PLAN].

Prompt (post this verbatim to the user):
```
我准备开始这个任务 "<step>". 你想用哪种模式?

A. 简单 (efficiency-first)
   信任我直接做, 跳过完整 TDD 礼仪 + clarify grill.
   适合: 修 typo / 改单行 config / 单文件少量改动

B. 标准 (default)
   让我自己判. 复杂的话会走完整 grill + TDD.

C. 严格 (quality-first)
   即使任务看起来简单也走全套, 我们先一起把测试计划 lock 死.
   适合: 我没把握 / 安全敏感 / 跨系统改动

回复 A / B / C.
```

After user replies, invoke:
- A → `ralph-lisa task-intake --commit --mode simple --user-signature "<user's literal reply preview>"`
- B → `ralph-lisa task-intake --commit --mode standard --user-signature "<user's literal reply preview>"`
- C → `ralph-lisa task-intake --commit --mode strict --user-signature "<...>"` then proceed to Stage 1 (codebase grill)

Then submit R1 [PLAN].
```

如果用户 cli 显式 `--mode X --user-signature "..."`：跳过 skill (Stage 0 不附加到 task.md), 等价于 skill 已 commit 过 mode=X，直接进 R1 PLAN。

**Why text-append not in-memory injection**: per Lisa R1 — text in task.md is persistent, version-able, auditable; in-memory prompt vanishes after restart and isn't reproducible.

---

## clarify-locked JSON schema v2

```json
{
  "schema_version": 2,
  "step": "task-intake-skill-design",
  "mode": "strict",
  "decided_at": "2026-05-26T07:00:00Z",
  "decided_by": "user-via-task-intake-skill",
  "decided_by_signature": "user-said-A-2026-05-26-simple-go",
  
  "understanding": "Build the task-intake skill foundation that auto-fires...",
  "scope_covered": ["skill manifest", "cli runner", "auto-fire from next-step", "..."],
  "scope_excluded": ["test plan co-creation (Phase 2)", "clarify merge (Phase 3)", "..."],
  "risks": ["skill auto-fire integration with claude-code skill system", "..."],
  
  "user_locked_tests": [
    {
      "id": "C1",
      "tier": "unit",
      "file": "cli/src/test/task-intake.test.ts",
      "command": "node --test --test-name-pattern=\"C1\" dist/test/task-intake.test.js",
      "oracle": "task-intake --start writes clarify-locked-<step>.json with mode field",
      "required": true
    }
  ]
}
```

**Schema migration (Lisa R1 decision — default, no heuristic)**: existing §128 v1 clarify-locked json lacks `mode` and `decided_by_signature` fields. Loader (`readClarifyLocked()`) shall:
- v1 missing `mode` → default `"standard"`
- v1 missing `decided_by_signature` → default `null`
- **NO heuristic inference from understanding/scope text**

For `mode === "simple"`, `decided_by_signature` MUST be non-null and ≥10 chars; loader throws `simple-mode-requires-signature` otherwise. This is the runtime enforcement of the trust-boundary.

---

## CLI surface

### New: `ralph-lisa task-intake`

```bash
ralph-lisa task-intake --start                                              # Print Stage 0 prompt (no signature required for start)

# ALL --commit invocations setting any mode REQUIRE --user-signature (≥10 chars + audit keyword/ISO date):
ralph-lisa task-intake --commit --mode simple --user-signature "user-A-2026-05-27-simple-go"
ralph-lisa task-intake --commit --mode standard --user-signature "user-B-2026-05-27-standard"
ralph-lisa task-intake --commit --mode strict --user-signature "user-C-2026-05-27-strict" \
    --understanding "..." \
    --scope-covered "..." \
    --scope-excluded "..." \
    --risks "..." \
    --tests <jsonfile>

ralph-lisa task-intake --status              # Show current step's mode + lock state (no signature)
```

**Without `--user-signature` on any `--commit --mode X`**: cli exits 2 with `mode-set-requires-user-signature` (per Trust boundary spec).

### Modified: `ralph-lisa next-step`

```bash
ralph-lisa next-step "name"                                                 # Auto-fire skill (no mode set; default = standard at commit)
ralph-lisa next-step "name" --mode simple --user-signature "<≥10 chars>"    # Skip skill, lock mode=simple; signature REQUIRED
ralph-lisa next-step "name" --mode standard --user-signature "<...>"        # Skip skill, lock mode=standard; signature REQUIRED
ralph-lisa next-step "name" --mode strict --user-signature "<...>"          # Skip Stage 0, fire Stage 1-4; signature REQUIRED
ralph-lisa next-step "name" --skip-intake                                   # Skip skill entirely (legacy behavior; mode defaults to standard at first submit)
ralph-lisa next-step "name" --type doc-task --mode simple --user-signature "<...>"   # Combine flags; signature REQUIRED when --mode set
```

**Trust-boundary lock**: any `--mode X` set on `next-step` requires `--user-signature`. Same enforcement rule + audit log + signature validation as `task-intake --commit`. Without it: cli exits 2 with `mode-set-requires-user-signature`. This closes the bypass path Lisa R1 B2 flagged (Ralph self-invoking `next-step --mode simple` from his agent shell).

### Backward compat

**Phase 1 (§212): `ralph-lisa clarify --start` 保持现状不变**（Lisa R1 decision: 保持 stable until task-intake 自己被 dogfood proven）。**Phase 3 (§214) 才**做 alias / merge: clarify --start 内部 route 到 task-intake --start + warn deprecation。

---

## Policy integration

### Where each mode is checked

`cli/src/policy.ts:runPolicyCheck()` adds new pre-check:

```typescript
const lock = readClarifyLocked(stateRoot, step);
const mode = lock?.mode ?? "standard";  // default if no lock

if (mode === "simple") {
  // Downgrade these mode-locked rules to warn:
  // - §128 clarify-not-completed
  // - §122 task-capability-unacked
  // - §102 auto-tdd-protocol
  // - §123 complexity-judge-missing
  // - §134 marker-plan-bound
  // - doc-oracle-spec (when doc-task)
  // STILL ENFORCED:
  // - §207 task-type-file-mismatch (file whitelist independent)
  // - §149 ralph-attest (Skipped: justification allowed)
  // - §144 lisa-verified-cite
  // - §70 post-consensus cascade (Required ✓ rows still gate)
}

if (mode === "strict" && tag === "PLAN") {
  // Require: user_locked_tests cite in body
  const cite = parseLockedTestsCite(body);
  if (!cite) violations.push({
    rule: "strict-mode-locked-tests-not-cited",
    message: "[PLAN] mode=strict requires citing user_locked_tests from clarify-locked-<step>.json"
  });
}
```

### Lisa narrow scope restriction (mode=strict)

`cli/src/lisa-attest.ts:verifyLisaAttest()` adds new quality_score component:

```typescript
if (mode === "strict") {
  // Lisa cannot narrow on "test design"
  const narrowsOnTestDesign = checkForTestDesignNarrows(lisaBody);
  if (narrowsOnTestDesign && lockedTests.length > 0) {
    quality_score -= penalty;  // Lisa can't second-guess user-locked tests
  }
}
```

This prevents the "Lisa nitpicks oracle for 5 rounds" pathology.

---

## Phase decomposition (per user 一步步做 directive)

**Phase 0 (THIS slice §211)**: design doc only — what you're reading. No code/cli/skill files. Lisa-approved contract for subsequent slices.

**Phase 1 (next slice §212)**: skill foundation + mode=simple救急
- D1 NEW `cli/templates/skills/task-intake/SKILL.md`
- D2 NEW `cli/src/task-intake.ts` runner + cli `ralph-lisa task-intake [--start|--commit --mode X|--status]`
- D3 `cmdStep` auto-fire mechanism (Lisa R1 decision: **task.md text-append**, not hidden memory; see "Auto-fire mechanism" section)
- D4 `policy.ts` 加 simple mode bypass (§128/§122/§102/§123/§134 降级)
- D5 trust-boundary enforcement: `--user-signature` field on CLI + spawn-source detection (see "Trust boundary" section)
- D6 docs zh-CN + EN (guide / faq / quickstart 加 mode + skill 用法)
- D7 test plan: 14 cases (see "Phase 1 test plan" section)
- Estimate: 10-12r

**Phase 2 (slice §213)**: strict mode + test plan co-creation
- skill Stage 1-4 实现
- clarify-locked json schema v2 (`mode` field default `standard` per Lisa R1 decision; no heuristics)
- PLAN-keeper 读 user_locked_tests 作 5-col 表 SoR
- §149 lisa-attest 算法识别 user-locked plan
- mode=strict 强制 PLAN cite locked tests
- Estimate: 10-12r

**Phase 3 (slice §214)**: clarify merge
- Until §214 ships: `clarify --start` keeps current behavior unchanged (Lisa R1 decision: "keep stable until task-intake is proven")
- §214: §128 clarify → task-intake alias
- 旧 cli backward compat
- Schema v1 → v2 migration (missing `mode` defaults `standard`)
- Estimate: 5-8r

**Phase 4 (slice §215 optional)**: 监测 + 自适应
- standard mode 卡 PLAN 阶段早期 warning
- complexity-judge threshold 默认 raise
- Estimate: 5r

---

## Phase 1 (=§212 implementation slice) test plan

This is the test contract §212 will implement. **Not §211**. §211 ships zero code.

| ID | Tier | Command | Oracle | Required |
|----|------|---------|--------|----------|
| C1 | unit | node --test --test-name-pattern="C1" dist/test/task-intake.test.js | task-intake --start prints Stage 0 prompt; exit 0 | ✓ |
| C2 | unit | C2 | task-intake --commit --mode simple --user-signature "<≥10 chars>" writes clarify-locked json with mode + signature fields | ✓ |
| C3 | unit | C3 | task-intake --status reads json + reports current mode | ✓ |
| C4 | unit | C4 | parseModeArg correctly extracts --mode flag from next-step args | ✓ |
| C5 | integration | C5 spawn | cmdStep auto-appends Stage 0 prompt to .dual-agent/task.md (verbatim text) when no lock exists + no --mode set | ✓ |
| C6 | integration | C6 spawn | cmdStep with --mode simple --user-signature "..." writes lock + skips skill injection | ✓ |
| C7 | integration | C7 spawn | cmdStep with --skip-intake skips skill + skips lock write (legacy path) | ✓ |
| C8 | unit | C8 | policy.ts: mode=simple downgrades §128 / §122 / §102 / §123 / §134 to warn (5 violations not blocking) | ✓ |
| C9 | unit | C9 | policy.ts: mode=simple still blocks §207 / §149 / §144 / §70 cascade (4 categories blocking) | ✓ |
| C10 | unit | C10 | policy.ts: mode=standard preserves current behavior (regression pin) — every existing §128/§122/§102/§123/§134 test still passes | ✓ |
| C11 | integration | C11 spawn | end-to-end: next-step --mode simple --user-signature "<sig>" → PLAN [CODE] [CONSENSUS] without §128 grill | ✓ |
| C12 | security | C12 | mode=simple cannot be set by Ralph submit body declaration (only SoR JSON is authoritative; body-decl ignored or block) | ✓ |
| C13 | security | C13 (Lisa R1 decision) | bypass-attempt via CLI: spawn `task-intake --commit --mode simple` WITHOUT `--user-signature` field → block `mode-set-requires-user-signature` | ✓ |
| C14 | security | C14 (Lisa R1 decision) | bypass-attempt: signature too short (<10 chars) or missing audit keyword → block `user-signature-too-weak` | ✓ |

Estimate: 10-12 rounds for §212 (Phase 1).

---

## Open questions — RESOLVED by Lisa R1

All 6 open questions decided by Lisa in R1 review:

1. **Skill auto-fire mechanism**: ✅ **text-append to `.dual-agent/task.md`** (not hidden memory). Spec verbatim above in "Auto-fire mechanism" section.

2. **mode=simple file/diff guardrail**: ✅ **3 files / 200 lines** as initial hard cap. Make configurable only AFTER fixed cap is dogfooded (so don't add config in Phase 1).

3. **Trust boundary**: ✅ SoR JSON alone is **insufficient**; require `--user-signature` field on cli, ≥10 chars + audit keyword/ISO date, recorded in audit log. Specified verbatim above in "Trust boundary lock" section.

4. **§128 clarify cli alias**: ✅ **keep stable**. `clarify --start` keeps current behavior unchanged until §214 (Phase 3); don't alias in Phase 1.

5. **CI / dogfood-gate scenario**: ✅ **yes**, add bypass-attempt cases covering **both** submit-body declaration AND CLI-path self-set attempts (C12 + C13 + C14 in Phase 1 test plan).

6. **Schema migration**: ✅ **v1 missing `mode` defaults to `standard`**; **no heuristics**. Specified above.

---

## Phase 1 (§212) acceptance criteria

§212 implementation slice acceptance criteria. **Not §211 (this design slice)** which only ships this doc.

- [ ] 14 test cases C1-C14 all green
- [ ] Lisa-side independent verification: `task-intake --commit --mode simple --user-signature "<≥10 chars>"` then `next-step` followup runs WITHOUT hitting §128 / §122 / §102 / §123 / §134 BLOCKED
- [ ] Lisa-side regression pin: `task-intake --commit --mode standard --user-signature "..."` triggers current §128 / §123 etc. behavior unchanged
- [ ] Bypass-attempt C13: cli without `--user-signature` exits 2 `mode-set-requires-user-signature`
- [ ] Bypass-attempt C14: signature <10 chars or missing keyword exits 2 `user-signature-too-weak`
- [ ] Audit log written at `.dual-agent/audit-log.jsonl` for every `--mode simple` invocation
- [ ] Doc updates pass `ralph-lisa doc-update-gate run --strict`
- [ ] Full quality-gate (5/5 commands) PASS
- [ ] No regression in §207 / §149 / §144 / §70 cascade behavior
- [ ] dogfood-gate scenarios extended with `mode=simple-bypass-attempt` (covers both body-decl and cli-path)

---

## §211 (this design slice) acceptance criteria

- [ ] `docs/211-task-intake-skill-design.md` ships with all 6 Lisa R1 decisions incorporated
- [ ] Phase 0/1/2/3/4 boundaries unambiguous (no contradictory "Phase 1 this slice" wording)
- [ ] Trust-boundary mechanism concrete + auditable (user-signature spec'd; signature validation rules; audit log path)
- [ ] Auto-fire mechanism concrete (text-append to task.md, exact text spec'd)
- [ ] Schema migration explicit (v1 missing → default standard; no heuristic)
- [ ] §212 test plan rows reflect Lisa decisions (C13/C14 added; C12 expanded)
- [ ] plan validate green
- [ ] Lisa R3 substantive PASS (achieved 2026-05-26 16:03:49Z; see review.md R3)
