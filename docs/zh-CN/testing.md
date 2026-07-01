[English](../en/testing.md) | [日本語](../ja/testing.md) | [中文](../zh-CN/testing.md)

# 测试指南

**这篇是给谁看的**：用 RLL 开发某个项目的工程师 —— 不是 RLL 项目本身的维护者（那个看 [`test-harness-and-gates.md`](./test-harness-and-gates.md)）。
**看完能做什么**：知道 RLL 怎么"逼"你写测试、怎么跑测试、被门禁挡住时怎么排查、什么时候可以合理 escape。

---

## TL;DR

RLL 不是测试框架，它是一个"按你项目原本的测试体系（jest / pytest / vitest / Playwright / 任何）跑测试 + 把结果机械核对"的工具。流程是：

1. 你在 `[PLAN]` 阶段写一张 5-列测试用例清单（C1, C2, ...）
2. 复杂任务先写测试（R2 tests-only round），测试 fail 是预期
3. 写实现（R3）让测试转绿
4. 提交 `[CODE]` 时必须给出真实测试输出，门禁会跟测试执行日志对比
5. Lisa 评审 → 双方共识 → 测试 cascade 跑完才算 sub-slice ship

**最常见的踩坑**：写散文式"测试通过"但不给具体 `cmd="X" passed=N total=M`，门禁拒收。

---

## 你不用知道但应该听过一次的概念

- **§102 auto-TDD**：复杂任务（estimate ≥4 round）默认强制 tests-first；不想 TDD 就在 `[PLAN]` body 显式写 `**Tests**: none (<reason>)` 加白名单 reason
- **§70 post-consensus cascade**：双方都 [CONSENSUS] 后真跑测试；任何 Required ✓ row 失败就 loopback 回 Ralph 修
- **§137 test-results-unverified**：Ralph 提交体里的 `Test-Results: cmd="X" passed=N` 必须在 `.dual-agent/test-execution-log.jsonl` 最近 10 分钟找到匹配执行；防伪造
- **§149 双向 attest**：Ralph 必须 cite 测试三件套（Test-Process / Test-Cases / Test-Results）；Lisa 必须 cite `Verified: <可信路径>` —— 任何一边偷懒都被门禁挡

详细 enforcement 表 + 怎么 debug 在 [`test-harness-and-gates.md`](./test-harness-and-gates.md)。本文只讲日常怎么写、怎么跑、怎么破。

---

## 怎么写一个 sub-slice 的测试计划

### 简单任务（estimate <4 round 或纯 doc/config/rename）

直接走 R1 [PLAN] → R3 [CODE]（跳 R2 tests-only），body 里有最小测试段就行：

```
### Test Plan

| ID | Tier | Command | Oracle | Required |
|----|------|---------|--------|----------|
| C1 | unit | npm test --prefix cli -- --test-name-pattern="MyFeature" | 3/3 pass | ✓ |
```

或者真的不需要测（doc-only / config-only / single-rename / process-only），用 escape 白名单：

```
**Tests**: none (doc-only)
```

### 复杂任务（estimate ≥4 round 或跨多文件代码）

走 R1 [PLAN] → R2 tests-only → R3 [CODE] 实现 → R4+ [FIX] → [CONSENSUS]。

R1 [PLAN] 必须含完整测试用例清单（5 列或 6 列；6 列适用于多 phase 任务）：

**5-列（单 phase）**：
```
| ID | Tier | Command | Oracle | Required |
|----|------|---------|--------|----------|
| C1 | unit | <how to run> | <pass criteria> | ✓ |
| C2 | smoke | npx playwright test web/smoke.spec.ts | renders + no console err | ✓ |
| C3 | e2e | curl -s X.example.com/api | 200 + payload.id present | ✗ |
```

**6-列（多 phase, 加 Phase 列）**：
```
| ID | Phase | Tier | Command | Oracle | Required |
|----|-------|------|---------|--------|----------|
| C1 | P1-parser-schema | unit | npm test ... | 6/6 pass | ✓ |
| C2 | P2-rule10-cli    | unit | npm test ... | 4/4 pass | ✓ |
```

Phase 列要求 `P[0-9]+-<slug>` 格式，PLAN body 另需 phases 声明段：

```
**Phases declared**:
- **P1-parser-schema**: 第一阶段做啥
- **P2-rule10-cli**: 第二阶段做啥
```

### Tier 词汇

只能用白名单里的 8 个：`unit` / `smoke` / `functional` / `e2e` / `integration` / `perf` / `stability` / `security`。其它字段 plan validate 会 block。

### Required 列

- `✓` = §70 cascade 必跑（fail 必须 fix）
- `✗` = 默认跳（除非 `RL_GATE_INCLUDE_OPTIONAL=true`）

### Command 列含 `|` 的注意

markdown table parser 把裸 `|` 当列分隔符。即使在 backtick 里也会出问题。改写成不含 `|` 的形式或拆成多个 Test-Results 行。

---

## 怎么跑测试

### 项目原生测试（你最常用的）

按你项目原本的方式跑就行。例：

```bash
# Node 项目
npm test
npm test --prefix cli  # 项目在子目录时

# Python
pytest -v
pytest tests/test_foo.py::test_bar  # 单条

# Playwright (web E2E)
npx playwright test
npx playwright test e2e/login.spec.ts --headed  # 看着跑
```

### RLL 提供的辅助命令

```bash
# 全套质量门禁（推荐 [CODE]/[FIX] 提交前跑一次）
ralph-lisa quality-gate

# 跑后写日志到 .dual-agent/test-execution-log.jsonl
# 这是 §137 verifier 的 SoR；提交体里的 cmd="X" 必须能在日志里找到匹配

# 跑 cascade（--strategy 取值：full | smoke-only | halt-on-fail）
ralph-lisa test-cascade --strategy full          # = §70 post-consensus 跑的那个
ralph-lisa test-cascade --strategy smoke-only    # 只跑 smoke 层
ralph-lisa test-cascade --strategy halt-on-fail  # 任意层 fail 立刻停

# 试跑（不真执行）+ JSON 输出，任何项目都能跑（无需 testTiers 配置）：
ralph-lisa test-cascade --strategy full --dry-run --json

# 按 tier 过滤（不是 strategy）—— 仅在项目根 `.ralph-lisa.json` 配过
# `testTiers` 时才能用；本仓库 cli/.ralph-lisa.json 没配，所以下面这两条
# 在本仓库会 exit 2 `unknown --tier 'X'; available: (none)`。在 web-app 类
# 项目配了 testTiers 之后就能用：
ralph-lisa test-cascade --tier unit              # 只跑 unit 层（需配置）
ralph-lisa test-cascade --tier integration       # 只跑 integration 层（需配置）

# 冒烟（项目级 smoke 命令，需 RL_SMOKE_CMD 配置）
ralph-lisa smoke-check
```

### 调试单个失败用例

```bash
# 本项目用 Node.js 内置 test runner（cli/package.json scripts.test 也是 node --test）
cd cli
node --test --test-name-pattern="MyCase" dist/test/foo.test.js

# 全套（按 cli/package.json）
RL_COMMAND_EVENT_OFF=1 RL_LEGACY_SESSION_OK=1 node --test --test-force-exit dist/test/*.js
```

---

## 提交 [CODE] / [FIX] 时怎么写测试段

最常见格式：

```markdown
### Test Results

`npm test --prefix cli` — Exit code: 0. All 13 §207 cases C1-C13 green. Full
`ralph-lisa quality-gate` (5/5 commands) PASS.

Test-Process: file://.dual-agent/visual-evidence/207-r3.md
Test-Cases: C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13
Test-Results: cmd="npm test --prefix cli" passed=2374 failed=0 total=2374
Test-Results: cmd="npm test --prefix wecom-bot" passed=250 failed=0 total=250
```

**几个雷**（提交被 block 时先检查这些）：

1. `Test-Process` / `Test-Cases` / `Test-Results` 三行**必须全有**，缺一个 §149 block
2. `Test-Results: cmd="X" passed=N total=M` 里的 `cmd` 必须**完全匹配** `.dual-agent/test-execution-log.jsonl` 里的 `cmd` 字段（包括 `--prefix cli` 这种 flag；`npm test` ≠ `npm test --prefix cli`）
3. `passed` / `total` 必须跟日志里数字**一致**；不一致也算 §137 unverified
4. 散文里写 `12/12 pass` 这种 `\d+/\d+ pass` 模式会被 parser 当独立 claim，cmd 解析成 `?`，永远不匹配日志 → block。**最稳的做法**：散文里不写数字，只在 `Test-Results:` 行写
5. 真没跑测试 → `Skipped: <理由>`：

```markdown
### Test Results

Skipped: pure-prose narrow per Lisa R3; no executable test path.
Exit code: 0 (no commands executed).

Test-Process: file://.dual-agent/work.md
Test-Cases: D1, D2
Test-Results: cmd="node cli/dist/cli.js plan validate" Exit code: 0
```

---

## Tests-only round 怎么写

复杂任务 R2 [CODE] 是"只写测试 + 不写实现"round，测试 fail 是预期。这是 §49 §C 协议，搭配 marker：

```markdown
[CODE]

Convention: tests-only / expected-fail (§49 §C)

## R2 [CODE] tests-only — 13 cases all expected-fail

### Test Results

`npm test --prefix cli` — Exit code: 1. 13 §207 cases all expected-fail
(contract failures: missing task-type.ts module / missing policy rule / ...).
0 regression in baseline.

Test-Process: file://cli/src/test/non-code-task-fast-path.test.ts
Test-Cases: C1, C2, ..., C13
Test-Results: cmd="npm test --prefix cli" passed=2362 failed=13 total=2375
```

⚠️ Marker 必须 verbatim：`Convention: tests-only / expected-fail (§49 §C)` —— 大小写敏感、空格 / 括号 / §49 §C 锚必须 EXACTLY 一致。

⚠️ Marker 不是万能 escape：`§134 marker-plan-bound` 要求 PLAN.md 里当前 row 显式声明 `tests-only: true`，否则 marker 不绑定。详见 [`test-harness-and-gates.md`](./test-harness-and-gates.md) §134 段。

---

## 双向 attest（§149）：Lisa 和 Ralph 都要 cite

Ralph 已经讲过（Test-Process / Cases / Results 三件套）。Lisa 那边的要求：

```markdown
[PASS]

## ... Review

Reviewed-PLAN-rows: C1, C3, C7
Reviewed-test-files: cli/src/test/foo.test.ts:42-67
Reviewed-test-log: cmd="npm test --prefix cli" passed=N failed=0 total=M
Pass-Rationale: <≥40 字符 + ≥1 file:line cite>
Verified: .dual-agent/gate-results.md
```

可信 `Verified:` 路径只有 3 类：

- `.dual-agent/gate-results.{md,json}`（quality-gate / runGate 写）
- `.dual-agent/harness-results/*`（cascade / preset / Lisa 评审 notes 可放这里）
- `.dual-agent/auto-tdd-plan-*.json`

⚠️ `plan validate` **不**写 `gate-results.md`。如果 PLAN-only round 想 cite，要 Lisa 自己在 `harness-results/` 写个评审摘要文件然后 cite。

---

## 常见门禁 BLOCKED 信息 + 对应处理

| 错误信息含 | 大概率原因 | 怎么破 |
|---|---|---|
| `§149: must include Test-Process` | 缺三件套之一 | 加 `Test-Process: file://...` 行 |
| `Test Results contains unverified claims` | §137：cmd 跟日志不匹配 / 没在 10min 内跑 | 跑 `quality-gate` 刷新日志立刻 submit；cmd 字符串完全照抄日志 |
| `task-type-file-mismatch` | §207：当前 task_type 改了白名单外的文件 | 见 [`test-harness-and-gates.md`](./test-harness-and-gates.md) §207 段 |
| `lisa-rerun-not-verified` | §144：Lisa 缺 `Verified:` cite 或 path 不可信 | cite 3 类可信路径之一 |
| `phase-test-coverage-missing` | §145：声明了 ≥2 phase 但用 5-列表 | 改成 6-列 Phase table |
| `complexity-judge-missing` | §123：复杂任务 R1 [PLAN] body 缺 judge JSON | 跑 `task complexity-judge --slice X --json` paste 进 body |
| `clarify-not-completed` | §128：复杂任务没走 R0 [CLARIFY] | 跑 `clarify --start` 5 阶段；或 simple 任务 `clarify --skip` |
| `task-capability-unacked` | §122：没显式 ack 测试能力 | 跑 `task capability ack-user --signature "..."` |
| `doc-oracle-spec table missing` | doc-task PLAN/[FIX] 缺 5-列 oracle 表 | 加 5-列表 with ≥1 Required ✓ + Dimension ∈ 9 canonical |
| `auto-tdd-protocol` | §102：复杂任务 estimate 没写或 missing tests-only marker | R1 [PLAN] 加 `**Estimate**: <N>r`；R2 [CODE] 加 §49 §C marker |

---

## 什么时候可以合理 escape

不是所有任务都该走完整 TDD。下面这些**真的不需要测**：

- 改 `*.md` doc / 注释 → `**Tests**: none (doc-only)` 或直接用 `--type doc-task`
- 改 `*.json` / `*.yaml` / `*.toml` 配置（不含 schema 变更）→ `**Tests**: none (config-only)`
- 纯文件重命名（无内容改动）→ `**Tests**: none (single-rename)`
- 改 `.rll/PLAN.md` / `CLAUDE.md` / `CODEX.md` 协议文档 → `**Tests**: none (process-only)` 或 `--type process-task`

只要 reason 在白名单四选一里就 OK。reason 不能瞎编（plan validate 会 reject）。

**任何代码改动（cli/src 等）都不能 escape**——必须真测。

---

## 看测试报告

```bash
ralph-lisa test-report          # 最新报告
ralph-lisa test-report --list   # 所有报告
```

报告自动存 `.dual-agent/test-reports/`。每份包含环境信息（Node 版本 / OS / 当前 step+round）和最后 50 行测试输出。

---

## 还卡住 → 维护者通道

如果你按上面所有 advice 改了仍然被 block，且能稳定 reproduce —— 这可能是 RLL 本身的 bug。**不要绕 enforcement**（`RL_POLICY_MODE=warn` 跟 `RL_TASK_TYPE_OFF` 这种偷懒 escape 反而把根因藏起来）。正确做法：

1. 把完整 BLOCKED 输出 + 复现步骤截图发 wecom 给 RLL 维护者
2. 或在 super-rll 仓库提 Issue 附 reproduce
3. 临时绕开：跟维护者 confirm 后用对应 audit-named opt-out env（详见 [`test-harness-and-gates.md`](./test-harness-and-gates.md)）
