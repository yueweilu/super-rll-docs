# Test Harness 分享稿

**分享日期**: 2026-06-05  
**建议时长**: 30 分钟  
**主题**: Test Harness 是什么，以及它如何帮助 RLL 提升交付质量和效率  
**定位**: 面向团队分享的主稿。详细源码和实现细节见原深度文档 `docs/test-harness-sharing-2026-06-05.md`。

---

## 1. 一句话解释

Test Harness 是 RLL 里把 AI 工作结果接到真实环境运行，并产出可复查证据的机制。

它不是一个新的测试框架，也不是替代 Jest、Pytest、Playwright、k6 这些工具。它更像一层验证和证据管理机制：把项目原本就有的测试命令、终端操作、浏览器流程接进 RLL 的质量闭环。

可以这样理解：

```text
AI 产出
-> Harness 真实运行验证
-> 生成报告 / artifact
-> Lisa 基于证据审查
-> 人基于报告判断风险
```

---

## 2. 为什么需要 Test Harness

RLL 的核心是 Ralph-Lisa 双 Agent 协作：

- Ralph 负责开发、修改、运行验证。
- Lisa 负责审查、质疑、判断是否通过。
- 人负责目标、范围、架构和最终风险判断。

这里最大的问题是：AI 不能只靠自己说“我完成了”“我测试过了”。

没有 harness 时，团队经常遇到的问题是：

- AI 写了“测试通过”，但没有真实命令和真实输出。
- 只跑了最容易跑的 unit，没有覆盖 smoke、integration 或 e2e。
- Reviewer 只能看描述，很难判断是不是真的验证过。
- 失败结果散在日志里，下一轮修复很难快速定位。

Test Harness 要解决的就是这些问题。它把判断标准从：

```text
相信 AI 怎么说
```

变成：

```text
查看真实执行结果和证据
```

---

## 3. 它在 RLL 流程中的位置

可以用这张图讲清楚：

```text
Ralph 写代码 / 产出
        ↓
Harness 真实执行验证
        ↓
生成证据: 测试结果、日志、截图、harness-results
        ↓
Lisa 基于证据 review
        ↓
通过则继续；失败则回到 Ralph 修复
```

Harness 不替代 Ralph，也不替代 Lisa。它的职责是产出证据。

Ralph 仍然要负责把任务做出来。Lisa 仍然要负责审查设计、代码、边界和风险。Harness 只是让双方的判断建立在真实执行结果上，而不是自然语言描述上。

---

## 4. Harness 和门禁的关系

可以把 RLL 的质量机制简化成四句话：

```text
Harness 负责产生证据。
Gate 负责要求证据。
Lisa 负责审查证据。
Human 负责判断风险。
```

Ralph 提交时，应该能说明三件事：

```text
Test-Process: 怎么验证的
Test-Cases: 覆盖了哪些场景
Test-Results: 结果是什么
```

Lisa PASS 时，应该引用可信证据：

```text
Verified: <artifact>
```

这个机制的意义是：Ralph 不能只说“我测了”，Lisa 也不能只说“我看了”。双方都要围绕真实 artifact 工作。

---

## 5. 常见 Harness 类型

当前项目里，日常最容易理解的是两类：

| 类型 | 适合场景 | 可以怎么理解 |
|---|---|---|
| `wezterm-test` | CLI、终端、REPL、Skill happy path | 模拟人在终端里操作 |
| `playwright-test` | Web 页面、浏览器流程 | 模拟人在浏览器里操作 |

除此之外，还有更偏 RLL 门禁编排的命令：

| 命令 | 用途 |
|---|---|
| `ralph-lisa quality-gate` | 提交前跑统一质量门 |
| `ralph-lisa test --auto` | 自动选择 preset，运行 required tiers |
| `ralph-lisa test-cascade` | 按 smoke / integration / e2e 等层级执行 |
| `ralph-lisa phase-gate` | 按 design / impl / consensus 等阶段执行 required tiers |

分享时不需要展开源码，只要让大家知道：有些命令负责“跑真实测试”，有些命令负责“把测试纳入质量门”。

---

## 6. 如何运行

### 6.1 最低环境检查

使用终端类 harness 前，先确认：

```bash
ralph-lisa --version
wezterm --version
wezterm cli list
```

如果要跑 Web harness，还需要 Playwright 能被当前 `ralph-lisa` runtime 加载。

### 6.2 跑 CLI / Skill happy path

示例：

```bash
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test \
  --macro harness-project-validation/cli-pass.macro.json \
  --json
```

它会做几件事：

```text
打开终端
进入指定目录
发送命令
等待成功标记
检查输出
关闭终端
返回 JSON 结果
```

### 6.3 跑 Web happy path

示例：

```bash
RL_PLAYWRIGHT_SKILL_REAL=1 ralph-lisa skill playwright-test \
  --spec harness-project-validation/web-pass.spec.json \
  --json
```

它会做几件事：

```text
打开页面
填写输入框
点击按钮
等待页面文本
断言结果
截图
```

注意：当前项目级验证报告里，Web 路径存在，但当时受 Playwright runtime 依赖缺口阻塞。正式演示前要先确认 Playwright 安装位置正确。

### 6.4 跑质量门

常用命令：

```bash
ralph-lisa quality-gate
ralph-lisa test --auto --dry-run
ralph-lisa test --auto --preset cli-cmd
ralph-lisa test-cascade --dry-run --json
ralph-lisa test-cascade --strategy halt-on-fail --json
```

推荐顺序：

```text
先跑最小相关测试
再跑 quality-gate
需要多层验证时跑 test-cascade
提交时引用生成的证据
```

---

## 7. 如何使用 Harness 做一次验证

可以把一次 harness 使用拆成五步：

### 第一步: 明确 happy path

先不要一开始就覆盖所有边界条件。先定义主链路：

```text
这个 CLI 命令能不能跑通？
这个 Skill 能不能产出预期 artifact？
这个 Web 表单能不能完成一次核心操作？
```

### 第二步: 找到稳定成功标记

成功标记必须稳定，例如：

```text
CLI_DEMO_OK
SKILL_DEMO_OK
WEB_DEMO_OK Harness
```

不要依赖容易变化的 banner、欢迎语、颜色输出。

### 第三步: 写 macro 或 spec

终端场景写 `.macro.json`：

```json
{
  "name": "cli-demo-pass",
  "steps": [
    { "type": "spawn", "name": "cli", "cwd": "/path/to/demo" },
    { "type": "send", "target": "cli", "text": "bash cli-tool.sh Harness\n" },
    { "type": "wait-for", "target": "cli", "text": "CLI_DEMO_OK", "timeout_ms": 5000 },
    { "type": "assert-contains", "target": "cli", "text": "CLI_DEMO_RESULT: Hello, Harness" },
    { "type": "kill", "target": "cli" }
  ]
}
```

浏览器场景写 `.spec.json`：

```json
{
  "name": "web-demo-pass",
  "steps": [
    { "type": "navigate", "url": "file:///path/to/index.html" },
    { "type": "fill", "selector": "[data-testid='name-input']", "text": "Harness" },
    { "type": "click", "selector": "[data-testid='submit-button']" },
    { "type": "wait-for-text", "selector": "[data-testid='result']", "text": "WEB_DEMO_OK Harness" },
    { "type": "assert-text", "selector": "[data-testid='result']", "text": "WEB_DEMO_OK Harness" }
  ]
}
```

### 第四步: 运行并保存结果

运行后重点看：

```text
Result / ok
Step Results
Failure Reason
Artifacts
Raw Output
```

如果失败，不要只看“失败了”，要看失败在哪一步：

- spawn 失败：环境或目录问题。
- send 后没反应：命令问题。
- wait-for 超时：成功标记不对，或程序没有跑到预期状态。
- assert 失败：输出和预期不一致。
- screenshot / artifact 缺失：业务产物没生成。

### 第五步: 把证据带回 RLL 流程

Ralph 提交时写：

```text
Test-Process: file://.dual-agent/harness-results/xxx.md
Test-Cases: C1, C2
Test-Results: cmd="ralph-lisa skill wezterm-test --macro xxx --json" passed=1 failed=0 total=1
```

Lisa PASS 时写：

```text
Verified: .dual-agent/harness-results/xxx.json
```

---

## 8. 它如何提升工作质量

### 8.1 从口头完成变成证据完成

过去可能是：

```text
Ralph: 我已经测过了。
Lisa: 看起来没问题。
```

现在应该是：

```text
Ralph: 我跑了这个命令，覆盖 C1/C2，结果在这个 artifact。
Lisa: 我审查了这个 artifact，并引用 Verified 路径。
```

### 8.2 从单层测试变成多层验证

RLL 可以把测试分成不同层级：

```text
unit        验证局部逻辑
smoke       验证主流程能启动
integration 验证跨模块契约
e2e         验证用户路径
security    验证安全风险
perf        验证性能阈值
stability   验证稳定性
```

不是每个任务都要全部跑，但 required tiers 要说清楚。

### 8.3 失败信息更容易定位

Harness 报告不是一句“失败了”。它会告诉我们：

```text
哪一步失败
等待什么失败
输出里有什么
有没有 artifact
失败原因是什么
```

这能减少大量“你是怎么跑的”“日志在哪里”“截图有没有”的沟通。

### 8.4 共识后还有兜底

Ralph 和 Lisa 都同意，不代表一定没问题。`test-cascade` 可以在共识后再跑 required tiers。这样能减少“双方口头通过，但实际测试挂了”的情况。

---

## 9. 它如何提升效率

### 9.1 减少无效 review

没有证据的提交会被门禁挡住，不会浪费 Lisa 的 review 轮次。

### 9.2 减少人工追问

报告里已经有命令、结果、失败步骤和 artifact。人不用反复问上下文。

### 9.3 标准化 happy path 验证

对 CLI、Skill、Web 主流程，团队可以先建立统一 happy path harness。以后每次修改都可以复用。

### 9.4 让 AI 自己修复更多问题

失败上下文可以回灌给 Ralph。简单问题让 Ralph 自己修，连续失败再升级给人。

### 9.5 更适合渐进式提升质量

第一阶段先覆盖 happy path。

第二阶段加入关键异常。

第三阶段加入 integration / e2e。

第四阶段再考虑 security / perf / stability。

这样不会一开始就把测试成本拉满，也不会长期停留在“只测最简单路径”。

---

## 10. 现场演示建议

### 演示 A: CLI 正例

命令：

```bash
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test \
  --macro harness-project-validation/cli-pass.macro.json \
  --json
```

讲解：

```text
它打开真实终端，运行真实命令，等到 CLI_DEMO_OK，并检查输出。
```

预期：

```text
ok=true
每个 step 都通过
```

### 演示 B: CLI 反例

命令：

```bash
RL_WEZTERM_SKILL_REAL=1 ralph-lisa skill wezterm-test \
  --macro harness-project-validation/cli-fail.macro.json \
  --json
```

讲解：

```text
这个 case 故意等待一个不会出现的 marker，所以会超时失败。
```

预期：

```text
ok=false
failedStep.type=wait-for
reason=timed out
```

这个演示的价值是证明：harness 不只是能报成功，也能发现错误期望。

### 演示 C: Cascade artifact

命令：

```bash
cd harness-verification/cascade-project
env RL_LEGACY_SESSION_OK=1 ralph-lisa test-cascade --json
```

讲解：

```text
这个项目里 smoke 通过，integration 故意失败。
失败后会生成 harness-results artifact。
Lisa 可以引用这个 artifact 做 Verified。
```

---

## 11. 已知限制

### 11.1 Web harness 依赖 Playwright runtime

项目里有 Web spec 示例，但项目级验证报告显示，当时 installed `ralph-lisa` runtime 无法加载 Playwright。所以 Web 演示前必须先确认依赖安装正确。

### 11.2 WezTerm 环境可能影响终端 harness

`wezterm-test` 依赖 WezTerm。mux、GUI、权限、前台窗口都会影响某些能力。当前文档建议优先使用 ANSI text capture，而不是依赖截图。

### 11.3 Harness 不替代项目原生测试框架

Unit 测试仍然通常由项目自己的测试框架负责。Harness 负责把这些测试纳入 RLL 质量闭环。

### 11.4 不要随便运行 `ralph-lisa init`

`ralph-lisa init` 会重建 `.dual-agent/`，可能删除历史记录、harness-results 和日志。只是跑 harness 时，不需要 init。

### 11.5 不要一开始追求覆盖所有风险

更实际的路径是：

```text
先 happy path
再关键异常
再 integration / e2e
最后补安全、性能、稳定性
```

---

## 12. 30 分钟分享节奏

| 时间 | 内容 | 重点 |
|---:|---|---|
| 0-3 min | 背景问题 | AI 不能只靠自述完成 |
| 3-7 min | Harness 是什么 | 真实执行验证和证据机制 |
| 7-12 min | 在 RLL 中的位置 | Ralph 产出，Harness 验证，Lisa 审查 |
| 12-17 min | 怎么运行 | `quality-gate`、`test --auto`、`test-cascade`、`wezterm-test` |
| 17-23 min | 现场演示 | CLI 正反例，或 cascade artifact |
| 23-27 min | 如何提升质量和效率 | 证据化、多层验证、失败可定位 |
| 27-30 min | 限制和下一步 | Playwright、WezTerm、先 happy path |

---

## 13. 最后总结

Test Harness 的核心价值不是“多写测试”，而是：

```text
让 AI 的工作结果有真实、可复查、可回灌的证据。
```

对团队来说，它带来的变化是：

```text
从相信描述，到查看证据。
从一次性口头通过，到分层质量门。
从失败后人工猜问题，到根据报告定位问题。
从人盯每一步，到人只处理边界和风险。
```

最推荐的落地方式：

```text
先为每个 CLI / Skill / Web 主链路建立一个稳定 happy path harness。
把结果接入 Ralph 的 Test-Process / Test-Cases / Test-Results。
让 Lisa PASS 时引用 Verified artifact。
之后再逐步扩展异常、集成、安全、性能等更高风险场景。
```

---

## 14. 项目依据

这份分享稿主要参考当前仓库中的以下材料：

| 文件 | 用途 |
|---|---|
| `README.md` | RLL 定位、Ralph/Lisa 角色、test harness release notes |
| `docs/zh-CN/testing.md` | 使用者如何写测试计划、运行测试和提交证据 |
| `docs/zh-CN/test-harness-and-gates.md` | 门禁和 Verified 机制 |
| `docs/dev-harness-closed-loop-design.md` | 全闭环 harness 的产品视角 |
| `docs/trust-coding-user-guide.md` | preset-aware gate 使用方式 |
| `docs/test-author-guide.md` | macro/spec 编写规则和常见坑 |
| `docs/wezterm-test-harness-guide.md` | wezterm-test 使用说明和环境注意事项 |
| `harness-verification/VERIFY_REPORT.md` | installed harness path 和 Verified gate 验证记录 |
| `harness-project-validation/PROJECT_VALIDATION_REPORT.md` | CLI / Skill / Web 项目级验证记录 |

源码细节和更完整的实现分析保留在：

```text
docs/test-harness-sharing-2026-06-05.md
```
