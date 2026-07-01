# Test Harness 分享文档

**分享日期**: 2026-06-05  
**主题**: RLL 中的 test harness 是什么、怎么运行、怎么用它提升工作质量和效率  
**适用听众**: RLL 使用者、维护者、需要验证 AI 产出质量的工程同学  
**材料依据**: 本文只基于当前仓库中的 README、docs、cli 源码、harness 验证报告和示例夹具整理。

---

## 1. 先给结论

在这个项目里，test harness 不是一个单独的测试框架，也不是替代 Jest、Pytest、Playwright 的新工具。

它更准确的定位是：

```text
把 AI 产出接到真实执行环境里运行，并把结果变成可复查证据的质量闭环机制。
```

RLL 的核心流程是：

```text
Ralph 写代码 / 产出
        ↓
test harness 真实执行验证
        ↓
生成 artifact / harness-results
        ↓
Lisa 基于证据审查
        ↓
共识后进入下一步，失败则回灌给 Ralph 修复
```

所以 test harness 解决的不是“有没有测试脚本”这个单点问题，而是“AI 说完成了，我们如何知道是真的完成了”的问题。

---

## 2. RLL 的背景: 为什么需要 test harness

RLL 的产品模型是 Ralph-Lisa 双 Agent 协作：

- Ralph 是主开发者，负责理解需求、写计划、改代码、跑测试。
- Lisa 是 Reviewer，负责审查 Ralph 的计划、实现、测试证据和边界风险。
- 人是 Tech Lead，负责目标、架构、范围和最终判断。

项目 README 里的核心原则是：

```text
An agent never reviews its own output.
```

单 Agent 最大的问题是“自己写、自己判定完成”。RLL 通过 Lisa 分离 reviewer 角色，但这还不够。如果 Lisa 只看 Ralph 的自然语言描述，仍然可能变成“相信 AI 说法”。test harness 的作用就是把 review 从“听描述”推进到“看真实证据”。

没有 harness 时，常见风险是：

- Ralph 写“测试通过”，但没有真实命令和输出。
- 只跑了 unit，没有跑 smoke / integration / e2e。
- Lisa PASS 时没有引用任何可复查 artifact。
- 测试失败只是一段散文描述，Ralph 下轮修复时拿不到结构化上下文。
- 共识后没有再跑一遍 required tiers，导致未验证的代码进入 closeout。

有 harness 后，RLL 会要求：

- Ralph 提交时说明 `Test-Process`、`Test-Cases`、`Test-Results`。
- Lisa PASS 时引用 `Verified: <trusted artifact>`。
- 双方共识后，`test-cascade` 可以按 tier 再跑 required tests。
- 失败结果写入 `.dual-agent/harness-results/`，并可回灌给 Ralph 修复。

---

## 3. Test harness 在 RLL 中的三层位置

`docs/zh-CN/test-harness-and-gates.md` 对 RLL 的质量门禁有一个清晰分层。可以把它讲成三层：

```text
第 1 层: 提交时门禁
第 2 层: 双向 attest 门禁
第 3 层: 共识后 cascade 门禁
```

### 3.1 第 1 层: 提交时门禁

Ralph 或 Lisa 每次 submit 时，`cli/src/commands.ts` 会调用 policy 检查。典型限制包括：

- Ralph 的 `[CODE]` / `[FIX]` 必须有测试证据三件套。
- 测试结果声明必须和 `.dual-agent/test-execution-log.jsonl` 中的真实执行记录匹配。
- 复杂任务不能跳过 PLAN / tests-only / expected-fail 协议。
- 非代码任务不能借 `doc-task` 或 `review-task` 偷改代码文件。

这一层解决的是“提交内容是否符合机制要求”。

### 3.2 第 2 层: 双向 attest 门禁

Ralph 侧必须写：

```text
Test-Process: 怎么验证
Test-Cases: 覆盖哪些 case
Test-Results: 真实命令和结果
```

Lisa 侧必须写：

```text
Verified: <trusted artifact path>
```

可信 artifact 主要包括：

- `.dual-agent/gate-results.md`
- `.dual-agent/gate-results.json`
- `.dual-agent/harness-results/*`
- `.dual-agent/auto-tdd-plan-*.json`

这层防的是“Ralph 编测试结果”和“Lisa 空口 PASS”。

`harness-verification/VERIFY_REPORT.md` 里有实际验证：没有 `Verified:` 的 Lisa PASS 会被 policy block；引用 fresh `.dual-agent/harness-results/...json` 的 PASS 可以通过。

### 3.3 第 3 层: 共识后 cascade 门禁

双方都 `[CONSENSUS]` 后，RLL 可以触发 post-consensus cascade。

核心实现是：

- `cli/src/test-cascade.ts`
- `cli/src/test-failure-context.ts`
- `cli/src/commands.ts` 中的 `handleMutualCompletion`

`test-cascade` 会读取 `.ralph-lisa.json` 中的：

```json
{
  "testHarness": {
    "tests": {
      "pass-test": { "command": "true" },
      "fail-test": { "command": "false" }
    }
  },
  "testTiers": [
    {
      "name": "smoke",
      "order": 1,
      "tests": ["pass-test"],
      "halt_on_fail": true
    },
    {
      "name": "integration",
      "order": 2,
      "tests": ["fail-test"],
      "halt_on_fail": true
    }
  ]
}
```

然后按 tier 顺序和依赖执行。失败时会生成结构化 JSON：

```text
.dual-agent/harness-results/<step>-<tier>-<timestamp>.json
```

这个 JSON 的 schema 在 `cli/src/test-failure-context.ts` 中定义，包含：

- `schema_version`
- `test_id`
- `tier`
- `type`
- `file`
- `error_excerpt`
- `retry_count`
- `converge_status`
- `occurred_at`

这层解决的是“即使双方都觉得完成了，也必须过 required tests 才能 closeout”。

---

## 4. 这个项目里有哪些 test harness 能力

### 4.1 通用命令型 harness

这是最基础的能力。用户在 `.ralph-lisa.json` 中配置命令：

```json
{
  "testHarness": {
    "tests": {
      "smoke": { "command": "npm test" },
      "web": { "command": "npx playwright test" },
      "security": {
        "commands": ["npm audit", "npx semgrep scan"]
      }
    }
  }
}
```

运行：

```bash
ralph-lisa test --list
ralph-lisa test smoke
ralph-lisa test all
ralph-lisa test --results
```

实现位置在 `cli/src/commands.ts` 的 `cmdTest` 和 `runHarnessTest` 路径。

### 4.2 Preset-aware test harness

RLL 可以根据 stack 和 change type 自动选择 preset。对应命令：

```bash
ralph-lisa test --auto
ralph-lisa test --auto --dry-run
ralph-lisa test --auto --preset cli-cmd
ralph-lisa test --auto --tier unit,smoke
```

比如 `cli/templates/presets/cli-cmd.json` 定义了 CLI 命令变更的 required tiers：

```json
{
  "stack": "cli",
  "changeType": "cmd",
  "requiredTiers": ["unit", "smoke", "integration"],
  "optionalTiers": ["functional"]
}
```

其中：

- `unit`: `npm test --prefix cli`
- `smoke`: `ralph-lisa smoke-check`
- `integration`: `ralph-lisa contract-check --json`

这套机制的价值是：Ralph 只提交 unit 证据时，preset gate 可以发现 smoke / integration 缺失，并提示或自动补齐。

### 4.3 Test cascade

运行方式：

```bash
ralph-lisa test-cascade --strategy halt-on-fail
ralph-lisa test-cascade --strategy full
ralph-lisa test-cascade --strategy smoke-only
ralph-lisa test-cascade --tier integration
ralph-lisa test-cascade --fail-fast
ralph-lisa test-cascade --dry-run --json
```

策略含义：

| 策略 | 含义 |
|---|---|
| `halt-on-fail` | 默认策略，某层失败且 `halt_on_fail=true` 时停止后续层 |
| `full` | 尽量跑完所有层 |
| `smoke-only` | 只跑最低 order 的 tier |
| `--tier <name>` | 只跑指定 tier，但不会自动包含它的依赖 |
| `--dry-run --json` | 只输出执行计划，不真实运行 |

`harness-verification/VERIFY_REPORT.md` 中验证过：`test-cascade` 能跑配置的 tests，发现失败，并写入 `.dual-agent/harness-results/`。

### 4.4 Quality gate

运行方式：

```bash
ralph-lisa quality-gate
ralph-lisa quality-gate --strategy full
ralph-lisa quality-gate --warn
ralph-lisa quality-gate --block
```

它是 submit-time auto-gate 的手动入口。根据 `cli/src/commands.ts` 注释，它会复用 submit-time 的 gate engine。默认是 block 模式，失败会返回非零退出码。

使用建议：

- `[CODE]` / `[FIX]` 提交前先跑。
- 跑完尽快提交，因为部分 test result verifier 有 freshness 要求。
- 需要调试时可以用 `--warn` 观察失败项，但不要把 warn 当成通过。

### 4.5 Phase gate

根目录 `gate-manifest.json` 定义了默认 baseline 和 phase 需要的 tiers：

```json
{
  "default_baseline": ["unit", "smoke", "integration"],
  "phases": [
    { "id": "design", "required_tiers": ["unit"] },
    { "id": "tests-only", "required_tiers": ["unit"] },
    { "id": "impl", "required_tiers": ["unit", "smoke"] },
    { "id": "fix", "required_tiers": ["unit"] },
    { "id": "consensus", "required_tiers": ["unit", "smoke", "integration"] }
  ]
}
```

运行：

```bash
ralph-lisa phase-gate --enter impl --json
ralph-lisa phase-gate --enter consensus --json
```

根据 `cli/src/commands.ts` 的实现注释，phase-gate 会读取 phase 的 `required_tiers`，通过真实 `runTierCascade` 执行。缺少 required tier 配置时是 fail-closed。

---

## 5. CLI / Skill / Web 的夹具式 harness

除了 `.ralph-lisa.json` 里的命令型 harness，当前仓库还有夹具式测试能力。

### 5.1 WezTerm macro: 终端 / CLI / Skill 场景

用途：

- 真实打开终端 pane。
- 发送命令。
- 等待输出。
- 检查输出。
- 清理 pane。

示例来自 `harness-project-validation/cli-pass.macro.json`：

```json
{
  "name": "cli-demo-pass",
  "steps": [
    { "type": "spawn", "name": "cli", "cwd": "/Users/fugur/work/ai-program/super-rll/harness-project-validation/cli-demo" },
    { "type": "send", "target": "cli", "text": "bash cli-tool.sh Harness\n" },
    { "type": "wait-for", "target": "cli", "text": "CLI_DEMO_OK", "timeout_ms": 5000 },
    { "type": "assert-contains", "target": "cli", "text": "CLI_DEMO_RESULT: Hello, Harness" },
    { "type": "kill", "target": "cli" }
  ]
}
```

运行：

```bash
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test --macro harness-project-validation/cli-pass.macro.json --json
```

常用参数见 `docs/wezterm-test-harness-guide.md`：

```bash
ralph-lisa skill wezterm-test --macro <path> --json
ralph-lisa skill wezterm-test --macro <path> --keep-pane
ralph-lisa skill wezterm-test --macro <path> --env KEY=VAL
ralph-lisa skill wezterm-test --macro <path> --ansi-cast <path>
ralph-lisa skill wezterm-test --macro-schema
```

注意事项：

- `spawn.cwd` 必须存在。
- `wait-for.text` 是 literal substring，不是正则。
- 不要等待命令行里已经出现的 marker，否则会假通过。
- 推荐用 `--ansi-cast` 保存终端输出证据，避免 macOS 截图权限和前台窗口问题。
- `try/finally` 清理 pane，但宏里显式 `kill` 更清晰。

### 5.2 Playwright spec: Web / 浏览器场景

用途：

- 打开页面。
- 填表。
- 点击。
- 等待文本。
- 截图。

示例来自 `harness-project-validation/web-pass.spec.json`：

```json
{
  "name": "web-demo-pass",
  "goal": "Verify a basic web form updates the result text.",
  "steps": [
    { "type": "navigate", "url": "file:///Users/fugur/work/ai-program/super-rll/harness-project-validation/web-demo/index.html" },
    { "type": "fill", "selector": "[data-testid='name-input']", "text": "Harness" },
    { "type": "click", "selector": "[data-testid='submit-button']" },
    { "type": "wait-for-text", "selector": "[data-testid='result']", "text": "WEB_DEMO_OK Harness", "timeout_ms": 5000 },
    { "type": "assert-text", "selector": "[data-testid='result']", "text": "WEB_DEMO_OK Harness" },
    { "type": "screenshot", "path": "/tmp/rll-web-demo-pass.png" }
  ]
}
```

运行：

```bash
RL_PLAYWRIGHT_SKILL_REAL=1 ralph-lisa skill playwright-test --spec harness-project-validation/web-pass.spec.json --json
```

当前验证状态要如实说明：`harness-project-validation/PROJECT_VALIDATION_REPORT.md` 记录 Web path 存在，但当时安装的 `ralph-lisa` runtime 无法加载 Playwright，所以 Web 验证被依赖缺口阻塞。也就是说，机制和 spec 示例存在，但分享时不要宣称该路径在当前环境已完整验证通过。

### 5.3 Skill happy path

Skill 场景本质上常用 WezTerm macro 做黑盒验证：

- 进入 skill demo 目录。
- 运行 happy path 命令。
- 等待稳定成功标记。
- 检查业务 artifact。

`harness-project-validation/PROJECT_VALIDATION_REPORT.md` 记录过 Skill 场景：

- 正例 macro 等到 `SKILL_DEMO_OK`，通过。
- 反例 macro 等待 `SKILL_DEMO_NEVER_OK`，超时失败。
- 业务 artifact `skill-result.md` 被生成并包含成功 marker。

这证明 harness 不只适合测 RLL CLI 自身，也可以测 skill 类黑盒主链路。

---

## 6. 日常如何使用 test harness

### 6.1 开始前检查环境

最低前提来自 `harness-training-2026-06-06/minimum-prerequisites.md` 和 README：

```bash
ralph-lisa --version
wezterm --version
wezterm cli list
```

如果要跑 Web path，还需要 Playwright 在当前 `ralph-lisa` runtime 可用。

重要提醒：

```text
不要为了测试 harness 随手运行 ralph-lisa init。
```

`docs/test-author-guide.md` 明确提醒：`ralph-lisa init` 会重建 `.dual-agent/`，可能删除历史、harness-results、日志和复杂度判断 artifact。只有准备开启全新 RLL 协作时才应该 init。

### 6.2 写 PLAN 时先定义测试计划

RLL 推荐在 `[PLAN]` 阶段写测试表：

```markdown
| ID | Tier | Command | Oracle | Required |
|----|------|---------|--------|----------|
| C1 | unit | npm test --prefix cli -- --test-name-pattern="MyFeature" | 3/3 pass | true |
| C2 | smoke | ralph-lisa smoke-check | CLI binary spawns and command appears in help | true |
| C3 | integration | ralph-lisa contract-check --json | no contract drift | true |
```

重点是：

- Tier 要使用项目白名单里的词汇，例如 `unit`、`smoke`、`functional`、`integration`、`e2e`、`perf`、`stability`、`security`。
- Command 要真实可运行。
- Oracle 要写“通过证明了什么”，不要写“测试通过”这种同义反复。
- Required 决定是否进入 required gate。

### 6.3 开发中先跑窄测试，再跑 gate

常见节奏：

```bash
# 先跑和当前改动最相关的测试
npm test --prefix cli -- --test-name-pattern="MyCase"

# 再跑项目质量门
ralph-lisa quality-gate

# 如果配置了 cascade，预览或执行
ralph-lisa test-cascade --dry-run --json
ralph-lisa test-cascade --strategy halt-on-fail --json

# 如果是 preset 支持的项目
ralph-lisa test --auto --dry-run
ralph-lisa test --auto --tier unit,smoke
```

### 6.4 提交 Ralph 工作时写清楚证据

推荐格式：

```markdown
### Test Results

Test-Process: file://.dual-agent/harness-results/my-run.md
Test-Cases: C1, C2, C3
Test-Results: cmd="npm test --prefix cli" passed=2374 failed=0 total=2374
Test-Results: cmd="ralph-lisa test-cascade --strategy halt-on-fail --json" passed=2 failed=0 total=2
```

注意：

- `cmd="..."` 要和真实执行日志里的命令一致。
- 不要在散文里写容易被 parser 误判的 `12/12 pass`。
- 没跑测试时要明确 `Skipped:` 和理由，不能伪造。

### 6.5 Lisa PASS 时引用可信 artifact

推荐格式：

```markdown
[PASS]

Reviewed-PLAN-rows: C1, C2, C3
Reviewed-test-files: cli/src/test/foo.test.ts:42
Reviewed-test-log: cmd="npm test --prefix cli" passed=3 failed=0 total=3
Pass-Rationale: 代码路径和测试覆盖匹配，失败分支有回归用例，harness artifact 可复查。
Verified: .dual-agent/harness-results/cascade-integration-2026-06-02T100503973Z.json
```

---

## 7. 它如何提升工作质量

### 7.1 把“声称完成”变成“证据完成”

Ralph 不能只写“我测过了”。提交必须写明：

- 怎么测。
- 测了哪些 case。
- 命令是什么。
- 结果是什么。
- 证据文件在哪里。

Lisa 也不能只写“看起来没问题”。PASS 必须引用 fresh trusted artifact。

### 7.2 把测试覆盖从单层扩展到多层

传统 AI 开发容易只跑 unit。RLL 的 preset 和 cascade 会把 required tiers 显性化：

- unit: 局部逻辑正确。
- smoke: 主流程能启动。
- integration: 跨模块契约没有漂移。
- e2e / functional: 用户路径或系统路径可用。
- security / perf / stability: 对高风险场景可配置扩展。

这让团队讨论质量时，不再只问“有没有跑测试”，而是问“哪些 tier 是 required，哪些证据已经覆盖”。

### 7.3 失败信息结构化，修复更快

`test-cascade` 失败时不是只给一段日志，而是结构化记录：

```text
test_id
tier
type
file
error_excerpt
retry_count
converge_status
occurred_at
```

Ralph 下一轮修复时能直接知道哪个 tier、哪个 test、什么错误、重试次数是多少。这比从一大段终端日志里人工找线索更高效。

### 7.4 共识后仍然有最终 gate

Ralph 和 Lisa 都 `[CONSENSUS]` 不代表可以直接结束。post-consensus cascade 让“双方同意”再经过 required tests 验证，减少“口头共识但实际坏了”的风险。

### 7.5 保留可复查历史

harness 输出的 artifact 通常在：

```text
.dual-agent/harness-results/
.dual-agent/gate-results.md
.dual-agent/gate-results.json
.dual-agent/test-execution-log.jsonl
```

这些文件可以用于：

- Lisa review。
- 人类复盘。
- 失败定位。
- 后续质量追踪。

---

## 8. 它如何提升效率

### 8.1 减少无效 review

没有证据的提交会被挡在 submit-time gate，而不是进入 Lisa review 后再靠人指出“请补测试”。这减少了 review 往返。

### 8.2 降低重复沟通成本

失败报告里有 step、reason、artifact、raw output。支持人员不用反复问“你怎么跑的”“失败在哪里”“有没有截图”。

### 8.3 让 happy path 验证标准化

对 Skill / CLI / Web 这类主链路，harness 可以先建立一个最小可运行 happy path。先确认主链路能跑通，再逐步补异常分支和深层测试。

### 8.4 让复杂任务有分阶段质量门

`gate-manifest.json` 把 design、tests-only、impl、fix、consensus 这些阶段的 required tiers 写清楚。不同阶段跑不同强度的测试，避免一开始就全量测试，也避免最后没有集成验证。

### 8.5 让 AI 自己修复更多问题

cascade 失败后，失败上下文可以回灌给 Ralph。常见小问题可以由 Ralph 自己进入 `[FIX]` 解决；连续失败超过预算时再升级给人处理。

---

## 9. 现场演示建议

建议选一个 10 分钟以内能稳定跑的演示，不要现场讲完整 schema。

### 演示 A: CLI 正反例

目标：证明 harness 能通过真实 CLI happy path，也能发现错误期望。

```bash
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test \
  --macro harness-project-validation/cli-pass.macro.json \
  --json
```

预期：

```text
ok=true
spawn/send/wait-for/assert-contains/kill 全部通过
```

反例：

```bash
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test \
  --macro harness-project-validation/cli-fail.macro.json \
  --json
```

预期：

```text
ok=false
failedStep.type=wait-for
reason=timed out
```

讲解点：

- 它跑的是真终端，不是 mock。
- 成功标记必须稳定。
- 失败原因能定位到具体 step。

### 演示 B: Cascade 失败 artifact

进入验证项目：

```bash
cd harness-verification/cascade-project
env RL_LEGACY_SESSION_OK=1 ralph-lisa test-cascade --json
```

预期：

```text
overall_passed=false
tiers_run=["smoke","integration"]
failure test_id=integration:fail-test
```

然后查看：

```bash
ls .dual-agent/harness-results
```

讲解点：

- smoke 通过后继续 integration。
- integration 故意失败。
- 失败被写成结构化 artifact。
- Lisa 可以引用这个 artifact 做 `Verified:`。

### 演示 C: Preset dry-run

在仓库根目录：

```bash
ralph-lisa test --auto --preset cli-cmd --dry-run
```

讲解点：

- `cli-cmd` preset 要求 unit / smoke / integration。
- preset 让 required tiers 变成标准，不依赖 Ralph 临时想起。

---

## 10. 已知限制和风险

### 10.1 Web path 依赖 Playwright runtime

项目级验证报告显示，Web spec 示例存在，但当时 installed `ralph-lisa` runtime 无法加载 Playwright，导致 Web 验证未完成。分享时应说明：

```text
Web harness 路径存在，但需要确保 Playwright 安装在 ralph-lisa runtime 可加载的位置。
```

### 10.2 WezTerm 环境可能受 mux / GUI / 权限影响

`docs/wezterm-test-harness-guide.md` 记录了 macOS screenshot route 的问题：

- mux pane 不一定有 GUI window。
- 前台 tab 不一定是测试 pane。
- `wezterm window_id` 不是 macOS CGWindowID。

建议优先用：

```bash
--ansi-cast <path>
```

而不是依赖截图。

### 10.3 Unit testing 很多时候仍靠项目原生框架

`docs/test-harness-capability-evaluation.md` 指出，Unit 列很多 stack 是 generic command-runner only。也就是说，RLL 不替代项目已有 unit 框架，而是把项目自己的测试纳入 RLL 质量闭环。

### 10.4 不要把 harness 当成“一次覆盖所有风险”

第一步通常是 happy path。复杂异常矩阵、性能、稳定性、安全测试应该根据风险逐步加入 preset / tier，而不是一开始把所有测试都塞进去。

### 10.5 不要破坏已有 `.dual-agent`

不要为了跑 harness 执行 `ralph-lisa init`。已有文档明确指出 init 会重建 `.dual-agent/`，可能破坏历史证据。

---

## 11. 分享时可以使用的表达

### 11.1 一句话版

```text
Test harness 是 RLL 里把 AI 工作结果接到真实环境运行，并产出可复查证据的机制。
```

### 11.2 面向工程师版

```text
它不是取代 Jest、Pytest、Playwright，而是把这些测试命令、终端宏、浏览器 spec 编排到 RLL 的 submit gate、review gate 和 post-consensus cascade 里，让“完成”必须有真实 artifact 支撑。
```

### 11.3 面向管理者版

```text
它把 AI 交付从口头承诺变成证据交付。人不需要盯每一步，但关键节点能看到真实运行结果、失败原因和风险边界。
```

---

## 12. 30 分钟分享节奏

| 时间 | 内容 | 重点 |
|---:|---|---|
| 0-3 min | 为什么需要 harness | AI 不能只靠自述完成 |
| 3-8 min | RLL 中 Ralph / Lisa / Harness 的关系 | harness 产证据，Lisa 审证据 |
| 8-14 min | 三层门禁 | submit-time、attest、post-consensus cascade |
| 14-20 min | 怎么运行 | `quality-gate`、`test --auto`、`test-cascade`、`wezterm-test` |
| 20-25 min | 现场演示 | CLI 正反例或 cascade failure artifact |
| 25-28 min | 如何提升质量效率 | 证据化、多层覆盖、结构化失败、少返工 |
| 28-30 min | 限制和下一步 | Web runtime、WezTerm 环境、先 happy path |

---

## 13. 项目依据索引

建议分享前快速过一遍这些文件：

| 文件 | 作用 |
|---|---|
| `README.md` | RLL 产品定位、Ralph/Lisa 角色、test harness release notes |
| `docs/zh-CN/testing.md` | 日常怎么写测试计划、怎么跑、怎么提交证据 |
| `docs/zh-CN/test-harness-and-gates.md` | 三层门禁和常见 block 原因 |
| `docs/dev-harness-closed-loop-design.md` | 全闭环 harness 架构和失败回灌机制 |
| `docs/trust-coding-user-guide.md` | preset-aware gate 使用方式 |
| `docs/test-author-guide.md` | macro/spec 编写规则和常见坑 |
| `docs/wezterm-test-harness-guide.md` | wezterm-test flags、macOS caveat、evidence convention |
| `docs/test-harness-capability-evaluation.md` | 9 stack × 8 test type 能力评估 |
| `cli/src/test-cascade.ts` | cascade 执行、tier 排序、失败 artifact 生成 |
| `cli/src/test-failure-context.ts` | 结构化失败上下文 schema |
| `cli/src/preset/runner.ts` | preset required tiers 执行和结果聚合 |
| `cli/templates/presets/cli-cmd.json` | CLI 命令变更的 preset 示例 |
| `harness-verification/VERIFY_REPORT.md` | installed harness path 和 Lisa Verified gate 的验证记录 |
| `harness-project-validation/PROJECT_VALIDATION_REPORT.md` | CLI / Skill / Web 项目级验证记录 |
| `harness-training-2026-06-06/harness-quick-guide.md` | 面向培训的简版说明 |

---

## 14. 最后总结

Test harness 在 RLL 中的本质价值是：

```text
让 AI 交付变成可执行、可复查、可回灌的证据链。
```

它带来的质量提升是：

- 提交前有真实验证。
- Review 时有可信 artifact。
- 共识后仍有 required cascade。
- 失败后有结构化上下文。

它带来的效率提升是：

- 少做无证据 review。
- 少靠人工追问日志。
- happy path 验证标准化。
- 常见失败可以自动回灌给 Ralph 修复。

最适合团队先落地的做法是：

```text
先为每个 CLI / Skill / Web 主链路建立一个稳定 happy path harness。
再把它接入 required tier 和 Lisa Verified evidence。
最后逐步扩展异常、集成、安全、性能等高风险 tier。
```
