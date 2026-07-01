# AI-Native SDLC 与动态门禁系统方案（增强版）

## 适用场景

- Electron + React + TypeScript
- AI Agent Orchestration
- Business Harness
- Multi-Agent Workflow
- 自动化测试平台
- Tool / MCP / Plugin 编排系统

---

# 一、核心目标

构建一个真正适合 AI Coding Agent 的软件工程体系，使 AI：

- 理解工程结构
- 自动识别风险
- 自动生成测试门禁
- 先测试后开发（TDD）
- 自动回归验证
- 自动积累工程经验
- 自动形成长期工程记忆

目标不是“让 AI 多写代码”，而是：

```text
让 AI 持续交付：
可验证、可回归、可恢复、可发布、可演化的工程增量。
```

---

# 二、核心理念

## 1. 风险驱动，而不是流程驱动

并非所有任务都走完整门禁。

真正合理的 AI-native SDLC：

```text
风险越高 → 门禁越严格
风险越低 → 流程越轻量
```

否则会导致：

- AI 被流程拖慢
- 上下文被测试淹没
- 大量无意义测试
- 开发效率下降

因此：

```text
不是所有任务都需要严格流程，
但所有高风险任务必须被严格约束。
```

---

## 2. AI 不允许直接实现功能

AI 必须先：

```text
任务分析
→ 风险分析
→ 生成门禁
→ 写失败测试
→ 最小实现
→ 通过门禁
→ 输出报告
```

没有通过门禁的代码：

```text
不视为完成。
```

---

## 3. 门禁是动态生成的

门禁不应是固定 CI。

而应该根据：

- 今日任务
- Git Diff
- 修改模块
- 风险标签
- Agent 类型
- 历史事故

自动生成。

即：

```text
Dynamic Gate Generation
```

---

## 4. 每次事故都必须沉淀

每一次：

- 回归 bug
- 发布事故
- 无限循环
- 权限绕过
- 数据损坏

都必须转化为：

- 新的 regression case
- 新的风险标签
- 新的门禁规则
- 新的 anti-pattern

最终形成：

```text
工程免疫系统
```

---

# 三、任务分级系统（Risk-Based Workflow）

## Level 0：Spike / Exploration

适用于：

- POC
- 实验
- 临时脚本
- 方案验证

门禁：

- typecheck
- lint
- optional unit test

目标：

```text
速度优先
```

---

## Level 1：低风险开发

适用于：

- UI 微调
- 样式修改
- 文案
- 非核心组件

门禁：

- related unit
- component test
- smoke e2e

---

## Level 2：普通功能开发

适用于：

- 普通业务逻辑
- workflow 功能
- 非核心 orchestrator 改动

门禁：

- unit
- component
- workflow regression
- related e2e

---

## Level 3：高风险系统开发

适用于：

- orchestrator
- tool system
- Electron IPC
- storage
- permission
- migration

门禁：

- security baseline
- migration test
- restart recovery
- agent regression
- workflow replay

---

## Level 4：Release / Infra

适用于：

- release
- installer
- auto-update
- schema migration
- build infra

门禁：

- cross-platform regression
- rollback test
- installer test
- package signing
- full E2E

---

# 四、仓库结构设计

建议：

```text
.ai/
  policies/
  maps/
  workflows/
  regression/
  risk/
  agents/
```

---

## 目录建议

```text
.ai/
├── policies/
│   ├── gate-policy.md
│   ├── security-policy.md
│   ├── release-policy.md
│   ├── fast-path-policy.md
│   └── coding-policy.md
│
├── maps/
│   ├── test-map.yaml
│   ├── architecture-map.yaml
│   └── ownership-map.yaml
│
├── workflows/
│   ├── daily-gate-planner.md
│   ├── level-0-spike.md
│   ├── level-1-ui.md
│   ├── level-2-feature.md
│   ├── level-3-core.md
│   └── level-4-release.md
│
├── regression/
│   ├── corpus/
│   ├── replay/
│   └── golden-cases/
│
├── risk/
│   ├── risk-taxonomy.md
│   ├── risk-scoring.yaml
│   ├── incident-db.yaml
│   └── anti-patterns.md
│
└── agents/
    ├── profiles/
    ├── reliability/
    ├── routing-policy.md
    └── collaboration-policy.md
```

---

# 五、test-map.yaml

作用：

```text
代码结构 → 风险结构 → 测试门禁
```

示例：

```yaml
modules:

  renderer:
    paths:
      - src/renderer/**
    risks:
      - ui-break
      - state-sync
    gates:
      - pnpm test:component
      - pnpm test:e2e:smoke

  electron-main:
    paths:
      - src/main/**
    risks:
      - ipc-security
      - privilege-escalation
    gates:
      - pnpm test:ipc
      - pnpm test:security

  orchestrator:
    paths:
      - src/orchestrator/**
      - src/agent/**
    risks:
      - infinite-loop
      - tool-overcall
      - context-corruption
    gates:
      - pnpm test:agent-regression
      - pnpm test:workflow
```

---

# 六、gate-policy.md

作用：

```text
AI 工程宪法
```

示例：

```md
# Forbidden

- skipping tests
- weakening assertions
- bypassing IPC validation
- unsafe shell execution
- deleting regression cases
- direct fs access from renderer
```

---

# 七、Risk Taxonomy

作用：

```text
定义所有已知风险
```

示例：

```md
# Agent Risks

- infinite-loop
- retry-storm
- hallucinated-tool
- missing-human-approval

# Electron Risks

- ipc-escape
- preload-leak
- renderer-node-access
```

---

# 八、Daily Gate Planner

这是整个系统核心。

输入：

- 今日任务
- Git Diff
- test-map
- risk-taxonomy
- existing tests
- agent profile

输出：

```text
Daily Gate Plan
```

---

## Daily Gate Plan 示例

```md
# Daily Gate Plan

## Task
Add retry support for orchestrator.

## Impacted Modules
- orchestrator
- workflow-engine

## Risks
- retry-storm
- infinite-loop
- duplicated-tool-call

## Existing Tests
- workflow regression
- orchestrator unit tests

## New Tests Required
- retry limit test
- restore after retry
- duplicate tool prevention

## Required Gates
- typecheck
- lint
- regression replay
- workflow replay
```

---

# 九、Agent Capability Profile（新增）

这是 AI-native SDLC 非常关键的一层。

核心理念：

```text
项目风险决定“要测什么”
Agent 能力决定“怎么测、谁来测、能不能自动测”
```

不同 AI Coding Agent：

- 能力不同
- 风险不同
- 工程习惯不同
- 上下文能力不同
- 自主性不同

因此：

```text
不能假设所有 AI Agent 是同质的。
```

---

## Agent Profile 示例

```yaml
agent: claude-code

strengths:
  - architecture-analysis
  - long-context-review
  - refactor-planning

risks:
  - over-refactor
  - overengineering
  - may-explain-instead-of-execute

required_guards:
  - must-run-tests
  - no-large-refactor-without-plan

best_tasks:
  - architecture-review
  - planning
  - debugging
```

---

## Codex 示例

```yaml
agent: codex-cli

strengths:
  - patch-generation
  - terminal-loop
  - iterative-test-fix

risks:
  - narrow-context-focus
  - may-miss-product-context

required_guards:
  - read-architecture-map-first
  - mandatory-gate-report

best_tasks:
  - implementation
  - test-fix-loop
  - CI repair
```

---

# 十、Agent Reliability Database（新增）

目前不存在真正权威的 AI Coding Agent 能力边界数据。

公开 benchmark：

- SWE-bench
- HumanEval
- LiveCodeBench
- TerminalBench

只能说明：

```text
某类标准任务上的能力
```

但真正重要的是：

```text
AI 在你们项目中的工程可靠性
```

因此建议建立：

```text
.ai/agents/reliability/
```

---

## 示例

```yaml
agent: claude-code
version: sonnet-x

metrics:
  task_success_rate: 0.82
  regression_introduced_rate: 0.11
  skipped_test_rate: 0.07
  infinite_loop_rate: 0.03

strengths:
  - architecture-analysis
  - repository-understanding

weaknesses:
  - over-refactor
  - excessive-abstraction

recommended_roles:
  - planner
  - reviewer

forbidden_roles:
  - release-automation
```

---

# 十一、事故数据库（Incident DB）

每次 AI 工程事故都必须记录。

示例：

```yaml
incidents:

  - id: INC-2026-014
    agent: claude-code
    type: architecture-over-refactor
    impact: high
    module: orchestrator

  - id: INC-2026-018
    agent: codex
    type: skipped-migration
    impact: critical
```

作用：

```text
让系统逐渐形成真实工程经验
而不是依赖互联网印象。
```

---

# 十二、动态 Agent Routing

最终系统应该能够：

根据：

- 风险等级
- 历史表现
- 模块经验
- 当前上下文规模
- 最近失败率

自动选择 Agent。

例如：

```text
高风险 orchestrator 修改
→ Claude 做架构分析
→ Codex 做 patch loop
→ Claude 做 review
→ Regression Agent 做 replay
```

即：

```text
AI Software Engineering Team
```

---

# 十三、Agent Regression Corpus

目录：

```text
.ai/regression/corpus/
```

示例：

```json
{
  "name": "retry_limit_guard",
  "task": "Generate a React page and run tests",
  "expectedToolCalls": [
    "readFile",
    "writeFile",
    "runTests"
  ],
  "forbiddenToolCalls": [
    "rm -rf"
  ],
  "maxSteps": 12,
  "expectedFinalState": "completed"
}
```

---

# 十四、CI/CD 门禁层级

```text
PR Gate
↓
Nightly Gate
↓
RC Gate
↓
Production Gate
```

---

## PR Gate

快速：

- typecheck
- lint
- related tests

---

## Nightly Gate

中等：

- agent regression
- workflow replay
- Electron smoke

---

## RC Gate

完整：

- migration
- cross-platform
- security baseline
- full E2E

---

## Production Gate

最终：

- installer
- rollback
- auto-update
- package signing

---

# 十五、最关键的系统 Prompt

```text
You are not allowed to directly implement features.

You must:
1. analyze impact
2. identify risks
3. generate a task-specific gate plan
4. write failing tests first
5. implement the smallest safe change
6. execute all required gates
7. produce a gate report

Code without passing gates is not considered complete.
```

---

# 十六、最终目标

最终会形成：

```text
AI-native Software Development Lifecycle
```

其核心特征：

```text
规则机器可读
架构机器可读
风险机器可读
事故机器可读
测试机器可读
Agent 能力机器可读
```

最终：

```text
AI Coding Agent 不只是“写代码”
而是：
“理解整个工程系统并安全演化它”
```

