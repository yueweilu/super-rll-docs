[English](../en/testing-plan.md) | [中文](../zh-CN/testing-plan.md)

# Super RLL v0.26.1 — 测试计划

## 概述

本计划覆盖当前 v0.26.1 版本的完整测试面。项目包含约 550 个源测试文件，分布在 5 个包中，由 8 层标准测试体系和 15+ 质量门禁管理。

**受测包：**

| 包 | 测试文件数 | 关注领域 |
|------|-----------|-------|
| `cli/` | 395 | 核心 CLI、命令、策略、门禁、计划验证 |
| `cli-e2e/` | 16 | CLI 端到端行为、WezTerm/Playwright 测试框架 |
| `wecom-bot/` | 28 | 企微收发、消息路由、守护进程 |
| `cli-pty-daemon/` | 5 | PTY 管理、终端会话、tmux 集成 |
| `cli-pty-daemon-vscode/` | 1 | VSCode 扩展 PTY 桥接 |

---

## 8 层标准测试体系

项目在 `gate-manifest.json` 中定义了 8 个标准层。CLI 原型的基础基线为 `[unit, smoke, integration]`。

| 层 | 范围 | 何时需要 |
|------|-------|---------------|
| **unit** | 纯函数 / 模块测试 | 每个阶段 |
| **smoke** | 快速集成健康检查 | 实现 + 共识阶段 |
| **functional** | 功能级行为 | 复杂切片 |
| **integration** | 跨包交互 | 共识阶段 |
| **e2e** | 完整用户工作流 | 发布验证 |
| **perf** | 性能基准 | 性能敏感变更 |
| **stability** | 浸泡 / 压力 / 竞态 | 长运行服务 |
| **security** | 认证 / 密钥扫描 / 注入 | 安全敏感变更 |

**按阶段要求**（来自 `gate-manifest.json` phases）：
- `design` → 仅 unit
- `tests-only` → 仅 unit
- `impl` → unit + smoke
- `fix` → 仅 unit
- `consensus` → unit + smoke + integration

---

## 质量门禁

### 提交时门禁（每次 [CODE]/[FIX]）

| 门禁 | § 参考 | 检查内容 |
|------|-------|----------------|
| 策略默认拦截 | §133 | 缺失 attest、测试结果、file:line 引用 |
| 测试执行日志 | §137 | 测试声明 vs 实际执行日志条目 |
| 双向 attest | §149 | Ralph Test-Process / Test-Cases / Test-Results + Lisa Reviewed-* / Verified |
| 视觉证据 | §151 | UI/前端切片需截图 |
| 项目类型层 | §152 | 基线 vs 原型不匹配（仅警告） |
| 冒烟自动循环 | §150 | RL_SMOKE_CMD 提交后健康检查 |

### 计划时门禁（TDD-PLAN 轮）

| 门禁 | § 参考 | 检查内容 |
|------|-------|----------------|
| 复杂度判定 | §123 | 3 层：LLM 判定 → 确定性验证 → Lisa 复跑 |
| 澄清阶段 | §128 | 复杂/expert 任务需在 TDD-PLAN 前完成 R0 5 阶段问答 |
| 阶段测试覆盖 | §145 | 多阶段切片需按阶段拆分测试用例 |
| 基线自检 | §155 | PLAN 正文须确认 project_type 基线对齐 |

### 发布门禁

| 门禁 | § 参考 | 覆盖范围 |
|------|-------|----------|
| 自测门禁 | §139 | 端到端执行检查：正常路径、伪造声明、缺失 Verified |
| 文档更新门禁 | §138 | 文档/代码漂移检测 |
| 发布报告 | §140 | 聚合证据：测试 + 计划 + 自测 + 文档 + 复杂度 |
| 测试框架确认 | §157 | 真实场景、重复理由、设计 ≠ 机制审查 |

---

## 测试框架

### Node.js 内置 (`node --test`)

主测试运行器。所有 `cli/src/test/*.test.ts` 文件使用 Node.js 原生测试运行器。

```bash
cd cli && npm test
```

覆盖：命令、策略、计划验证、门禁执行、IPC、状态管理。

### WezTerm E2E 框架

通过 WezTerm 驱动真实终端进行 CLI 端到端测试。用例在 `cli-e2e/` 目录。

```bash
ralph-lisa skill wezterm-test --macro <path>
```

### Playwright 浏览器 E2E

浏览器自动化框架。用例在 `harness-project-validation/` 和 `harness-verification/` 目录。

```bash
ralph-lisa skill playwright-test --spec <path>
```

### 自测门禁 (§139)

用门禁自身来测试门禁。验证：
- `happy`：完整 PLAN→CODE→PASS→CONSENSUS 流程
- `bypass-fake-claim`：§137 捕获伪造的测试声明
- `bypass-missing-Verified`：§144 捕获缺失的 Verified 引用

### 发布报告 (§140)

从 6 个来源聚合发布前证据：cli 测试、wecom-bot 测试、计划验证、自测门禁、文档更新门禁、复杂度判定。

---

## 按功能划分的关键测试区域

| 区域 | § / 功能 | 测试覆盖 |
|------|-------------|---------------|
| 命令 | auto, start, submit-ralph/lisa, init/uninit | cli/src/test/commands*.test.ts |
| 策略 | §133/§137/§144/§149 | cli/src/test/policy*.test.ts |
| 计划验证 | §102/§145 计划表解析 | cli/src/test/plan*.test.ts |
| 复杂度 | §123 判定 + 验证 | cli/src/test/complexity*.test.ts |
| 门禁级联 | §78/§79 层级级联 + 回环 | cli/src/test/gate*.test.ts |
| 企微传输 | 收发、推送、守护进程 | wecom-bot/src/test/*.test.ts |
| PTY 守护进程 | tmux 会话、管道窗格、attach | cli-pty-daemon/src/test/*.test.ts |
| 飞书转发 | Lark 外发、决策卡片 | cli/src/test/feishu*.test.ts |
| 文档发布 | 发布工作流 | cli/src/test/docs-publisher*.test.ts |
| 清理 | §127 spawn/fork 清理 | cli/src/test/cleanup*.test.ts |
| 知识新鲜度 | §128 易变信息 TTL | cli/src/test/knowledge*.test.ts |

---

## 质量审查维度（15 项）

来自 `gate-manifest.json` `canonical_doc_oracle_dimensions`：

1. **data-accuracy** — 事实与来源一致
2. **source-authority** — 引用指向一手来源
3. **source-freshness** — 信息最新（TTL 感知）
4. **logical-coherence** — 无内部矛盾
5. **compliance-with-user-spec** — 符合需求声明
6. **ai-slop** — 无 AI 生成的填充或幻觉内容
7. **style** — 一致的文风和格式
8. **topic-coverage** — 所有声明的范围均已覆盖
9. **depth-detail** — 适合受众的详细程度
10. **public-safety** — 无密钥泄露，适合公开发布
11. **locale-parity** — en/zh-CN/ja 内容同步
12. **link-integrity** — 所有交叉引用可解析
13. **build-readiness** — 内容可无错误编译/部署
14. **destination-liveness** — 外部链接可访问
15. **public-authorization** — 发布内容已获公开授权

---

## 环境要求

- **Node.js** >= 18
- **Claude Code**（Ralph 后端）
- **Codex CLI**（Lisa 后端）
- 可选：`tmux`（tmux UI）、`wezterm`（WezTerm E2E）、`playwright`（浏览器 E2E）

```bash
node -v          # >= 18
git --version
claude --version
codex --version
ralph-lisa doctor  # 完整环境检查
```

---

## 运行测试

### 快速检查

```bash
cd cli && npm test
```

### 完整门禁序列

```bash
ralph-lisa quality-gate --full-uaot
```

### 发布前检查清单

```bash
npm test --prefix cli           # 核心测试
npm test --prefix wecom-bot     # 企微传输
ralph-lisa dogfood-gate run --strict   # 执行端到端
ralph-lisa doc-update-gate run --strict # 文档/代码漂移
ralph-lisa release-report emit          # 聚合证据
```

### 门禁策略模式

```bash
# 默认：block（生产 / 自动运行）
RL_POLICY_MODE=block ralph-lisa auto --engine --task "..."

# 开发逃生：warn（仅交互式开发）
RL_POLICY_MODE=warn ralph-lisa submit-ralph --file .dual-agent/submit.md
```

---

## 测试结果汇总

| # | 测试区域 | 运行器 | 门禁层级 |
|---|---------|--------|-----------|
| 1 | CLI 单元测试 (~395 文件) | node --test | unit |
| 2 | CLI E2E 测试 (~16 文件) | wezterm / playwright | e2e |
| 3 | 企微机器人测试 (~28 文件) | node --test | unit + integration |
| 4 | PTY 守护进程测试 (~5 文件) | node --test | unit + smoke |
| 5 | 自测门禁 (§139) | ralph-lisa dogfood-gate | e2e |
| 6 | 文档更新门禁 (§138) | ralph-lisa doc-update-gate | functional |
| 7 | 发布报告 (§140) | ralph-lisa release-report | integration |
| 8 | 测试框架确认 (§157) | ralph-lisa testharness-gate | functional |

---

> 本计划反映 v0.26.1 的测试面。关于按切片制定测试计划，请参见[用户指南](guide.html) §102 自动 TDD 模式及 [CLI 参考](reference.html)。
