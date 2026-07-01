# Trustcoding Product Definition

**Status**: Working draft, locked 2026-05-05 by user + Lisa CONSENSUS on `trustcoding-comprehensive-plan` sub-slice.

---

## One-line definition

> **Trustcoding 是一套 AI 协同开发产品体系：用 Ralph + Lisa 双 agent loop 把 TDD 工作流端到端自动化，让人离开后开发任务依然按既定门禁推进。**

---

## Three-paragraph supplement

### 1. 产品本体是工作流，不是平台

Trustcoding 的核心交付不是 "一台 server" 也不是 "一个 IDE 插件"，而是 **TDD-driven 协同开发流程本身**。每个项目在 trustcoding 上跑都会经历 8 个固定阶段（需求→设计→测试设计→实现→测试环境→用户文档→生产部署→数据反哺），每个阶段都是 Ralph 写、Lisa 审、双 CONSENSUS 锁。流程跑通 = 产品交付。

测试组合（test harness + 测试方法 + 用例 + 通过标准）和用户文档不是平台预置功能，而是**项目设计阶段的 deliverable**——由 Ralph 和 Lisa 在每个项目里现场设计、审核、锁定。当前实现里的 `test_spec` 字段、`tdd-gate` (T6)、`tdd-retrospective` (T7) 是这套工作流的**参考实现**，不是产品语义。换句话：换一套实现（比如换语言、换部署模式）只要保留 8 阶段 + 双 CONSENSUS + 两道门禁，就还是 trustcoding。

### 2. RLL 是 Trustcoding 的胞核，不是平级两个产品

Ralph-Lisa Loop（`cli/`）提供的 agent 协作协议（轮换 / 标签 / quality-gate / plan-keeper / atomic flip / wecom-feedback）是 trustcoding 整个产品的**最小可执行内核**。所有外围组件——`rll-team-platform/server`（多租户调度）、worker docker（隔离）、MCP tools（IDE 入口）、`wecom-bot`（异步介入）、analytics（任务级数据）、PostHog（应用级数据）、部署 hook（生产链路）——都是为了把这个胞核装成"能给真团队用"的完整生物。

胞核不变，外围可以替换：tmux backend 可以换成 node-pty 或 Wezterm；server 可以换成 SaaS 也可以本地；MCP 可以换成 VSCode extension。但 trustcoding 不是这些外围的 "and 的总和"，是 **"双 agent loop + TDD 8 阶段 + 双门禁" 这个最小内核**。

### 3. 信任来自门禁，不是来自数据

Trustcoding 的"信任"建立在两道**显式门禁**：

- **Gate 1（功能门禁）**：测试设计阶段（Phase 3）双 CONSENSUS 锁定的 test_spec + 通过标准。Phase 4 实现的每一轮 CODE 必须过 Gate 1，否则 Lisa NEEDS_WORK 把它打回去。
- **Gate 2（上线门禁）**：用户文档阶段（Phase 6）双 CONSENSUS 锁定。前置是 Phase 5 测试环境跑通 + 业务流程验证 + 功能达预期，然后才能拍真截图、写真用户手册。如果文档写不出来或截图不真，说明前面阶段没真过——Gate 2 fail。

不是 "AI 写完了就交付"，而是 "过了 Gate 1 + Gate 2 + 后续生产监控才算交付"。这是 trustcoding 跟"AI 一键生成代码"产品的根本区别。

---

## RLL / Trustcoding / 集成 关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Trustcoding (产品愿景)                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  RLL 胞核 (cli/)                                           │  │
│  │  - ralph-lisa-loop 协议                                    │  │
│  │  - plan-keeper / quality-gate / watchdog                   │  │
│  │  - auto-step-ref / wecom-feedback                          │  │
│  │  - cross-platform engine (tmux/SplitUI/WtUI/headless)      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↑                                     │
│                            │ 所有外围组件围绕胞核                 │
│                            │                                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  调度 + 隔离     │  │  入口        │  │  通信 + 介入      │   │
│  │  rll-team-       │  │  - MCP tools │  │  - WeCom 双向    │   │
│  │  platform/server │  │  - rll-stack │  │  - 语音 hook     │   │
│  │  worker-base     │  │    extension │  │  - email (TBD)  │   │
│  │  docker          │  │  - rll-cli   │  │                  │   │
│  └─────────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  持久 + 闭环     │  │  部署 + 灰度  │  │  数据反哺        │   │
│  │  - audit         │  │  - PostHog   │  │  - analytics     │   │
│  │  - retrospective │  │    flag rule │  │  - 自动 task 触发 │   │
│  │  - SQLite WAL    │  │  - Sentry    │  │                  │   │
│  └─────────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  跨平台 Terminal Backend (UI 层, 可换)                      │ │
│  │  TmuxUI / SplitUI / WtUI / node-pty+Pseudoterminal         │ │
│  │  / Wezterm / Zellij  (5+ 候选, 见 backend matrix doc)      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 边界

### Trustcoding 范围内
- 双 agent loop 协议
- 8 阶段项目生命周期
- 两道门禁（功能 + 上线）
- 跨平台 terminal backend 架构
- 团队多租户控制平面（v1）
- IDE 集成（MCP / extension）
- 异步介入（WeCom / 语音）
- 任务级 + 应用级 telemetry 链路
- 生产部署 + 灰度发布闭环
- 数据反哺迭代

### 不在 Trustcoding 范围内（v1）
- 替代 git/GitHub（trustcoding push 分支到现有 git host）
- 替代 IDE（trustcoding 是 IDE 插件 + server，不是新 IDE）
- 替代 LLM（trustcoding 用现有 Claude / Codex / 国产 ACP agents）
- 替代云厂商（trustcoding 跑在用户自己的 cloud / 本机）
- 替代项目管理（trustcoding 不是 Jira/Linear，是开发执行层）

---

## 类比（帮助理解）

| 类比 | 说明 |
|---|---|
| RLL ≈ 胞核 / git CLI / 引擎 | 提供基础协作协议; 单独可用但价值有限 |
| Trustcoding ≈ 完整生物 / GitHub / 整车 | RLL + 全套外围 = 真产品 |
| TDD 工作流 ≈ DNA | 跑哪个项目都是这个流程; 内容不同, 形态相同 |
| Gate 1 / Gate 2 ≈ 海关 | 不过门禁不能进下个阶段; 不是建议是强制 |

---

**最后更新**: 2026-05-05  
**版本**: v1.0  
**依赖**: `docs/trustcoding-project-lifecycle.md` (8-phase 详细规范), `docs/cross-platform-terminal-backend-matrix.md` (terminal 选型)
