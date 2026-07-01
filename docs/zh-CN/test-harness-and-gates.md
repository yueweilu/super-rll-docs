[English](../en/test-harness-and-gates.md) | [中文](../zh-CN/test-harness-and-gates.md)

# 测试 harness 和质量门禁：原理 + 怎么破

**这篇是给谁看的**：（1）需要 debug "为什么我提交被 block" 的用户；（2）需要改 / 加 / 删 enforcement rule 的维护者。
**看完能做什么**：理解每条 gate 在卡什么、原理是什么；遇到 block 知道怎么排查；想加新 rule 知道往哪个文件加、要写什么测试。

---

## TL;DR 心智模型

RLL 把 "Ralph 写代码 / Lisa 评审 / 双方共识" 这个流程拆成**3 层门禁**：

```
[1] 提交时门禁 (submit-time gate)
    └─ cli/src/policy.ts:checkRalph() / checkLisa()
       每次 submit-ralph / submit-lisa 必过
       不通过 → process.exit(1) → 用户看到 BLOCKED 信息

[2] 双向 attest 门禁 (bidirectional attest)
    └─ §149 ralph-attest + §144 lisa-verified-cite
       Ralph 必须 self-cite Test-Process/Cases/Results 三件套
       Lisa 必须 cite Verified: <可信 artifact 路径>
       两侧互相验，谁也不能单边rubber stamp

[3] 共识后门禁 (post-consensus cascade)
    └─ §70 handleMutualCompletion → cli/src/test-cascade.ts:runTierCascade()
       Ralph + Lisa 都 [CONSENSUS] 才算 mutual
       然后真跑测试 cascade (unit/smoke/integration/e2e 分层)
       全 pass 才能进 slice closeout；某层 fail → §79 loopback 回 Ralph
```

**为什么要 3 层而不是 1 层**：第 1 层防机制内部规则违规（语法 / 顺序 / 必填字段），第 2 层防"虚假叙述"（说跑了测试但其实没跑），第 3 层防"测试本身就有问题"（一个层级过了但其它层级会挂）。

---

## 第 1 层：提交时门禁 (submit-time policy)

### 原理

`cli/src/commands.ts:cmdSubmitRalph()` 和 `cmdSubmitLisa()` 在写 work.md / review.md / 翻转 turn 之前调 `runPolicyCheck(role, tag, content, ctx)`（`cli/src/policy.ts:838`）。这个函数收集所有 rule 触发的 `violations[]`，按 `RL_POLICY_MODE` 决定 block 还是 warn。

`RL_POLICY_MODE` 默认 `block`（§133 since 2026-05-16），原因：v0.7.0 之前默认 warn 让 mech enforcement 被静默绕过，详见 `docs/gate-bypass-diagnostic-2026-05-16.md`。

部分 rule 是 **mode-locked**（trust-boundary 锁）—— `RL_POLICY_MODE=warn` 也 block：

- `task-capability-missing` / `task-capability-unacked` / `unsupported-tier-no-consent`（§122）
- `complexity-judge-missing` / `complexity-verify-failed` / `mode-off-without-user-ack` / `lisa-rerun-high-confidence-missing` / `expected-tier-not-in-required`（§123）
- `task-type-file-mismatch` / `task-type-declaration-mismatch` / `non-code-task-evidence-missing`（§207）
- `auto-tdd-protocol`（§102）

这些是 mech 保证，不能被开发模式 escape 绕过。设计原因：trust-boundary 必须由用户显式 ack（`ack-user` / `ack-scope-expansion` / `--type` 等 user-driven CLI），Ralph 自己不能 self-fake。

### 主要规则索引

下面按提交体里的检查顺序列。每条规则配（a）原理（b）触发样例（c）怎么破。

---

#### §149 ralph-attest（Ralph 三件套）

**原理**：每个 Ralph 的 `[CODE]` / `[FIX]` body 必须含：
- `Test-Process: <inline | file://path | git-diff HEAD~N..HEAD>` — 测试是怎么跑的
- `Test-Cases: C1, C3, C7` — 跑了哪些 case（对应 PLAN.md 5-col 表的 ID）
- `Test-Results: cmd="npm test --prefix cli" passed=N failed=0 total=M` — 真实结果

防的是：Ralph 在 body 里写散文式"测试都过了"但不提供可机械 verify 的字段。

**典型 BLOCKED 信息**：
```
[FIX] §149: must include Test-Process: <inline|file-path|git-diff>
[FIX] §149: must include Test-Cases: C1, C2, ...
[FIX] §149: must include Test-Results: counts|file-path|log-cite
```

**怎么破**：

1. 在 body 加这三行（必须 verbatim，包括 colon 和参数）：
   ```
   Test-Process: file://.dual-agent/visual-evidence/<step>.md
   Test-Cases: C1, C2, C3
   Test-Results: cmd="npm test --prefix cli" passed=N failed=0 total=M
   ```
2. 如果是 doc-task / process-task fast-path，仍然要这三行（§207 fast-path 跳的是 auto-tdd-plan，不是 §149）；可以写：
   ```
   Test-Process: file://.dual-agent/work.md
   Test-Cases: D1, D2, D3
   Test-Results: cmd="node cli/dist/cli.js plan validate" Exit code: 0
   ```
3. **没有真跑测试**（比如 pure prose 修订）→ `Skipped:` + 理由：
   ```
   ### Test Results
   Skipped: pure-prose fix per Lisa narrow; no executable test path
   Exit code: 0 (no commands executed)
   ```

**实现位置**：`cli/src/policy.ts:60-90`（rule 名 `ralph-test-process-missing` / `ralph-test-cases-missing` / `ralph-test-results-missing`）。

---

#### §137 test-results-unverified

**原理**：`Test-Results: cmd="X" passed=N total=M` 必须在 `.dual-agent/test-execution-log.jsonl` 的最近 10 分钟内有对应执行记录。防"伪造测试结果"——你写"passed=100"但其实 10 分钟内没跑过这个 cmd。

`cli/src/policy.ts:280-299` 调 `verifyTestResultsClaims()`，把 body 里的 claim 跟 log 对比；mismatch → block。

**典型 BLOCKED 信息**：
```
[CODE] Test Results contains unverified claims (no matching execution log entry in last 10min): `npm test --prefix cli`. Run test before submitting or cite Skipped: with justification.
```

**怎么破**：

1. 真跑一次门禁让它写 log：`ralph-lisa quality-gate`（这会写若干 `cmd` entries 到 jsonl）
2. 然后立刻 submit（10min 内）
3. body 里 cmd 字符串必须**完全匹配** log entry 的 cmd（包括 `--prefix cli` 这种 flag；log 里只有 `npm test --prefix cli`，body 写 `npm test` 不匹配）
4. 你的 `passed=` `total=` 必须跟 log entry 的数字一致；写不一致也算 unverified（这是设计的，防止 "用旧 log 蒙混"）

**关于 `cmd='?'` 陷阱**：parser (`cli/src/test-results-claim-verifier.ts:39`) 用 backtick 抓 cmd。如果你在散文里写 `12/12 pass`、`Actions in this step: 3` 这种模式，parser 会把它解析成一个无 cmd 的 claim → cmd='?' → 任何 log 都不匹配 → block。

解决：要么用显式 `Test-Results: cmd="X" passed=N total=M` 行（不会触发散文 parser），要么干掉散文里所有 `\d+/\d+ pass` 类字面。

**实现位置**：`cli/src/test-results-claim-verifier.ts:31-99`。

---

#### §144 lisa-verified-cite

**原理**：Lisa 的 `[PASS]` / `[CONSENSUS]` body 必须含 `Verified: <path>`，且 path 必须在 trusted-paths 白名单内：
- `.dual-agent/gate-results.{md,json}`
- `.dual-agent/harness-results/*`
- `.dual-agent/auto-tdd-plan-*.json`

且文件 mtime 必须 ≤5 分钟。

防的是：Lisa PASS 一句"看过了挺好"但其实没看任何 artifact（touch 个空文件也不行——必须 trusted 路径 + 鲜度）。

**典型 BLOCKED 信息**：
```
[PASS] §144: lisa-rerun-not-verified (no `Verified: <trusted-path>` cite within last 5min)
```

**怎么破**：

可信 cite 路径有 3 类（按场景选）：

1. **跑过 quality-gate / runGate** → `Verified: .dual-agent/gate-results.md`（也可以 `gate-results.json`）。这是最常见的真测过 round。
2. **跑过 test-harness（cascade / loopback / preset）** → `Verified: .dual-agent/harness-results/<your-evidence-file>.md`。Lisa 自己写评审 notes 可以放这个目录然后 cite 同一个文件，对 PLAN-only round 也适用。
3. **§70 cascade 或 §102 持久化场景** → `Verified: .dual-agent/auto-tdd-plan-<step>.json`

⚠️ **常见误区**：`plan validate` **不会** 写 `.dual-agent/gate-results.md`（只是 PLAN.md 语法/锚校验）。如果你只是跑了 `plan validate`，要 cite 就 cite `.dual-agent/harness-results/<...>.md`（Lisa 自己写个评审摘要文件进去），或者把 `.dual-agent/review.md` 之外的可信路径作为 cite 锚。`.dual-agent/review.md` 本身不在 trusted 白名单——cite 它会 block。

5min 鲜度：mtime ≤5 分钟。先生成 artifact 再立刻 submit；如果中间被打断，重新跑一次再 submit。

**实现位置**：`cli/src/policy.ts:535-583`（trusted-paths 白名单 + mtime 检查）。

---

#### §134 marker-plan-bound（§52 tests-only marker）

**原理**：Ralph R2 [CODE] 的 "tests-only / expected-fail" round 可以在 body 里加这一行：

```
Convention: tests-only / expected-fail (§49 §C)
```

加了这行，门禁切换到 warn 模式（允许测试 fail 通过 submit），让 R2 真正只写测试不写实现成为可能。

**但**：marker 不能裸用——必须满足以下任一：

1. `.rll/PLAN.md` 当前 sub-slice row body 显式声明 `tests-only: true`
2. body 内含 `R2 [CODE] tests-only` 自声明
3. 当前 step 已有 R2 [CODE] 带 marker 的 round（后续 [FIX] 继承）

否则 marker 不生效，碰上测试 fail 还是 block。

**典型 BLOCKED 信息**：
```
[CODE] §134: tests-only marker present but plan row does not declare `tests-only: true`; marker unbound
```

**怎么破**：

- R2 [CODE]：在 PLAN.md 当前 row 加 `tests-only: true` flag，或在 body 里写 `## R2 [CODE] tests-only`
- R3 [CODE]（真打 round）：**不要带 marker**（带了也没用，且暴露你想绕 enforcement）

**实现位置**：`cli/src/policy.ts:1140-1180` + `cli/src/commands.ts:1152`。

---

#### §207 task-type-file-mismatch（task_type 文件白名单）

**原理**：每个 sub-slice 有一个 task_type（`code-task` / `review-task` / `doc-task` / `process-task`），每种 type 有自己的文件写白名单：

- `code-task`：anywhere（默认完整 TDD）
- `review-task`：仅 `docs/**` + `.dual-agent/**`
- `doc-task`：+ 顶层 `*.md` + `CLAUDE.md` / `CODEX.md` / `README.md`
- `process-task`：+ `.rll/**` + `docs/**`

policy 在每次 Ralph submit 时跑 `computeStepDiff()` 拿当前 slice 的所有变更文件，跟 task_type 白名单对比；越界 → block。

防的是：声明 `--type review-task` 跑 fast-path 跳 TDD，但偷偷改 `cli/src/foo.ts`。

**典型 BLOCKED 信息**：
```
[CODE] task-type-file-mismatch: review-task cannot modify forbidden path(s) cli/src/foo.ts; rerun as code-task or split into follow-up code slice.
```

**怎么破**：

1. 真要改代码 → 开 code-task slice：`ralph-lisa next-step "fix-foo" --type code-task` 走完整 TDD
2. 真的只是 review 但被 spurious 触发（比如某个 auto-write 文件） → 检查 `.dual-agent/step-start-dirty-<step>.txt` snapshot 是不是漏了某个 pre-existing 文件
3. **不能** `RL_POLICY_MODE=warn` 绕（mode-locked）；不能 `RL_TASK_TYPE_OFF=1` 绕（这个 env 不存在，C12 anti-loophole regression 锁住）

**重要 nuance**（§207 R3 fix lock）：policy 只根据**显式声明**（SoR JSON 或 body `Task type:` line）决定是不是 non-code-task；**不靠 inference**。这避免了 `.rll/progress/<date>.md` 这类 auto-write 文件把 code-slice 误判成 process-task。

**实现位置**：`cli/src/policy.ts:300-353` + `cli/src/task-type.ts`。

---

#### §202 first-tag enforcement

**原理**：进入新 sub-slice 后，Ralph 第一次 submit 必须是 `[PLAN]` / `[RESEARCH]` / `[CLARIFY]`（`[QUESTION]` 例外不算 round-starting）。防"上来就 [CODE] 跳过 plan"。

**怎么破**：第一次 submit 写 [PLAN]。或者紧急/legacy 场景 `RL_R1_FIRST_TAG_OFF=1` 绕（这个有 env opt-out，跟 task-type 不同）。

---

#### §122 task-capability-ack（user-driven trust-boundary）

**原理**：sub-slice 通过 `ralph-lisa task new <slug>` 开始时会做一次 capability detect（cli / web / mobile / e2e 等测试能力），结果写 `.dual-agent/task-harness-capability.json`。在 R2 [CODE] 提交前，用户必须显式 ack：

```bash
ralph-lisa task capability ack-user --signature "<token>"
```

防的是：Ralph 自己声称 "我能测 e2e"，但项目其实没装 Playwright。必须用户独立验证。

**典型 BLOCKED 信息**：
```
[CODE] task-capability-unacked: §122 acked=false — user must run `ralph-lisa task capability ack-user --signature "<token>"` before R2 [CODE]
```

**怎么破**：跑 `task capability ack-user` 显式 ack。**Ralph 不能 self-fake**（trust-boundary）。

---

#### §128 clarify-not-completed

**原理**：复杂任务（complexity-judge `task_complexity_class=complex|expert`）必须先走 R0 [CLARIFY] phase 才能进 R1 [PLAN]：

```bash
ralph-lisa clarify --start  # 5 阶段 grill
# ...
ralph-lisa clarify --commit --understanding "..." --covered "..." --negative-scope "..." --risks "..."
# 写 .dual-agent/clarify-locked-<step>.json
```

否则 R1 [PLAN] submit 被 block：`clarify-not-completed`。

**怎么破**：跑完 clarify 5 阶段；或简单任务用 `clarify --skip`（warning 但不 block，complexity_class 不变）。

---

#### §123 complexity-verify-failed

**原理**：R1 [PLAN] body 必须含 complexity-judge JSON（`ralph-lisa task complexity-judge --slice X --json` 的输出 paste 进 body）；提交前必须跑 `complexity-verify`（hard gate, deterministic 验 schema / canonical_tier_ids / Required 覆盖等）。

防 Ralph 在 PLAN 阶段乱报复杂度避开 §102 TDD-first 升级。

**怎么破**：按 PLAN 模板 paste judge JSON + 跑 `task complexity-verify --slice X` 至 exit 0。

---

#### `doc-oracle-spec`（doc-task 专用 5-col 表）

**原理**：doc-task PLAN 必须含一个 5-col 表（独立于 §102 6-col phase 表）：

```
| ID | Dimension | Verification Method | Pass Criteria | Required |
|----|-----------|---------------------|---------------|----------|
| D1 | topic-coverage | <how to verify> | <pass criteria> | ✓ |
```

`Dimension` 列只能用 `cli/src/doc-oracle-spec.ts:21` 的 `CANONICAL_DOC_ORACLE_DIMENSIONS` 9 个之一：`data-accuracy` / `source-authority` / `source-freshness` / `logical-coherence` / `compliance-with-user-spec` / `ai-slop` / `style` / `topic-coverage` / `depth-detail`。

防的是：doc-task 跳了 5-col test 表，但还是要有个 oracle 表（不然 §70 cascade 不知道怎么核对 doc 质量）。

**怎么破**：按上面格式写 5-col 表，至少 1 行 Required ✓。`Dimension` 必须用 canonical 9 选项之一。

**Verification Method 列不能含字面 `|`**（即使在 backtick 里）—— markdown table parser 把 `|` 当列分隔符。如果你要写 grep 命令含 `\|`，改写成空格分隔的关键词列表。

---

### 怎么加新规则

1. **设计阶段**：在 `.rll/PLAN.md` 开新 §xxx sub-slice，写"为什么要这个规则"+ trigger 条件 + 错误信息模板 + 例外情况
2. **实现**：`cli/src/policy.ts` `checkRalph()` 或 `checkLisa()` 里加 violation push 块；如果是 trust-boundary 类（mode-locked），加到 `runPolicyCheck()` 里的 mechanical-bypass 过滤列表 + always-block 检查
3. **测试**：`cli/src/test/` 加 spawn 类测试，至少 1 个正向（不触发不 block）+ 1 个反向（触发必 block）+ 1 个 anti-loophole（`RL_POLICY_MODE=warn` 不能绕）
4. **文档**：在本文件加一段（原理 / 触发样例 / 怎么破 / 实现位置）+ 在 `docs/zh-CN/maintainer-handoff.md` 关键 enforcement 索引表加行
5. **静态审计**：`cli/src/test/policy-block-static-audit.test.ts` 自动扫描 policy.ts 找未覆盖的 rule；新加的 rule 必须在白名单里登记

---

## 第 2 层：双向 attest（§149）

### 原理

§149 让 Ralph 和 Lisa**互相 attest**对方做的事：

- Ralph 必须 cite 自己跑的 Test-Process / Cases / Results（上面 §149 ralph-attest 段已讲）
- Lisa 必须 cite 自己看的 Reviewed-PLAN-rows / Reviewed-test-files / Reviewed-test-log + Pass-Rationale (≥40 char 含 ≥1 file:line) + Verified path
- Ralph 在 [CONSENSUS] 之前必须**counter-attest**：跑 `verifyLisaAttest()` 检查 Lisa 上一条 PASS 的 quality_score；分数太低 → block `ralph-must-challenge-rubber-stamp-pass`，要求 Ralph [CHALLENGE] 而非 [CONSENSUS]

防的是：Ralph + Lisa 进入合谋"都 PASS 走人"的 rubber-stamp 状态。

### 怎么破 / 调

- Ralph 拿到 thin Lisa PASS 第一反应应该是 [CHALLENGE]（at most once per round），不是 [CONSENSUS]
- Lisa narrow 不够 specific → Ralph [CHALLENGE] 要求引 file:line + 真核对 oracle
- 实在卡死（rubber stamp loop）→ `RL_LISA_ATTEST_OFF=1` / `RL_RALPH_ATTEST_OFF=1`（audit-named opt-out；overnight autonomous 不建议用，本质是 escape）

**实现位置**：`cli/src/lisa-attest.ts` + `cli/src/policy.ts:443-528`。

---

## 第 3 层：共识后门禁（§70 post-consensus cascade）

### 原理

Ralph 和 Lisa 都 `[CONSENSUS]` 后 `cli/src/commands.ts:handleMutualCompletion()` 触发**真跑测试 cascade**：

1. 优先读 `.dual-agent/auto-tdd-plan-<step>.json`（§102 R1 PLAN 持久化的 5-col 表）
2. `escape: {tests: 'none', reason: '...'}` → 跳 cascade，status=passed
3. 有 rows → 调 `runTierCascade()`（`cli/src/test-cascade.ts`），按 unit → smoke → integration → e2e → perf → stability → security 顺序跑
4. 任何 Required ✓ row 失败 → **§79 loopback**：写结构化 failure context 到 `.dual-agent/loopback-<step>.json`，翻 turn 回 Ralph，让 Ralph 看 cascade 失败原因再 [FIX]
5. ≥3 连续 cascade fail → §71 ESCALATE：write `task_failed` event，wecom-push 给用户

防的是：双方 [CONSENSUS] 但其实测试根本没真跑过 / 跑过但部分失败被忽略。

### 怎么破 / 调

- cascade fail 看 `.dual-agent/loopback-<step>.json` 里 `failure_context` 字段，原文是 stderr + stdout 摘要
- `RL_GATE_INCLUDE_OPTIONAL=true` 把 Required=✗ 的 row 也纳入 cascade（默认跳）
- 完全 escape（仅特殊场景）：R1 PLAN body 写 `**Tests**: none (<reason>)`，需 escape reason 在白名单 `doc-only` / `config-only` / `single-rename` / `process-only`

**实现位置**：`cli/src/commands.ts:7619-7820`（`handleMutualCompletion`）+ `cli/src/test-cascade.ts`（`runTierCascade`）+ `cli/src/loopback.ts`。

---

## 附录：quality-gate 命令清单

维护者最常用：

```bash
# 全套门禁（推荐每次 commit 前跑）
ralph-lisa quality-gate
# 等价：plan validate + plan validate (sibling repo) + npm test --prefix cli + wecom-bot + cli-e2e

# 提交时门禁（policy.ts checkRalph 单独跑，不真跑测试）
ralph-lisa task complexity-verify --slice X
ralph-lisa plan validate-phase-tests --slice X

# 发版门禁（release 前必跑）
ralph-lisa dogfood-gate run --strict      # 端到端 enforcement scenarios
ralph-lisa doc-update-gate run --strict   # doc claim vs code impl drift detector
ralph-lisa release-report emit            # 汇总 evidence 出 release-report-<slug>.md
```

`ralph-lisa doctor` 看依赖 + watcher health。`ralph-lisa status` 一行 turn/round/step 状态。
