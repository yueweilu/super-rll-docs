# RLL Clarify Phase — 设计说明 (§128)

> **目的**: 在 AI agent 写代码之前, 先 grill 用户 / 自己 grill 自己, 把 "我以为我懂了" 变成 "我们 confirmed 我懂了"。
> **目标用户**: RLL 操作员 (用户) + Ralph (Claude Code) + Lisa (Codex)
> **状态**: §128 R1 [PLAN] draft 阶段; 等用户 review 此文档后 submit 给 Lisa.

---

## 1. 为什么要加 Clarify Phase

### 1.1 现有问题（structural gap）

当前 RLL 流程：

```
用户拍方向 (1-2 句)
  ↓
ralph-lisa task new <slug>
  ↓
R1 [PLAN]   ← AI 自己脑补 scope, 直接开始写
  ↓
R2 [CODE] tests-only
R3 [CODE] impl
...
mutual CONSENSUS
```

**Gap**: 用户 brief 和 R1 [PLAN] 之间，AI 没有任何机会 confirm "我理解对了"。AI 脑补走完一整个 slice (~7-15 rounds, ~3 小时), 才发现：

- 跟用户想的不是一回事 (重做)
- Lisa narrow 出来一堆 "应该 cover 的" 把 scope 膨胀 (over-engineering)
- 边界没人锁, AI 默认 "more rigor / more coverage" 倾向覆盖全面

### 1.2 真实事故 (2026-05-14 margay)

写 margay 设计文档时, AI 反复多轮 narrow, 最后产出了一套非常复杂的设计文档, **明显 over-engineering**, 今早重做了。根因不是 AI 笨, 是机制问题: **TDD-first + Lisa rerun + complexity-judge 这套 narrow 机制是为代码实现优化的, 在 *设计/澄清* 阶段会反向放大复杂度**。

### 1.3 业界参考: grill-me skill

Matt Pocock 的 [`grill-me` skill](https://github.com/mattpocock/skills) 是这个 gap 的开源对照解。核心 6 原则:

1. **One Q at a time** — 不批量问, 避免用户认知过载
2. **AI 给 recommended answer** — 用户 confirm/redirect, 不是空白填空
3. **Codebase explore first** — 能 read 的不要问
4. **Upstream → downstream** — blocking deps 先问
5. **Push back on ambiguity/risk/contradiction** — 主动质疑
6. **Until shared understanding reached** — 直到达成共识 (有上限)

RLL §128 吸收这 6 条 + 加 1 条 (AI 知识 freshness gate) = 7 条规则。

---

## 2. Clarify Phase 工作流程

### 2.1 R0 [CLARIFY] 新 round（复杂任务强制）

```
用户拍方向
  ↓
ralph-lisa task new <slug>       ← 创建 draft (acked=false)
  ↓
R0 [CLARIFY]                     ← NEW! 5 阶段:
  ├─ Stage 0: 复杂度 confirmation (LLM 判完后让用户 confirm, override)
  ├─ Stage 1: codebase 探索      (AI 内部, read 相关代码/PLAN/git log)
  ├─ Stage 2: 决策树映射          (AI 内部, 列 architecture/scope/data/risk 决策点)
  ├─ Stage 3: 1-Q-at-a-time grill (与用户对话, 一次 1 个 Q + AI 推荐答案)
  └─ Stage 4: 共识 deliverable    (写 5 必填字段的 R0 submit body)
  ↓
用户 confirm R0 → 写 .dual-agent/clarify-locked-<step>.json
  ↓
ralph-lisa task capability ack-user --signature "<...>"
  ↓
R1 [PLAN]                        ← 此时 AI 有 negative scope 防过度
R2 [CODE] tests-only
...
```

**复杂 vs 简单任务判定**: **LLM-primary multi-dimensional 判定** (复用 §123 complexity-judge 机制, 扩展输出字段). Keyword/regex 不可信 — 比如"写抖音运营规划"看似 doc-only 但实际需要外部数据抓取 + 竞品研究 + 政策时效性, 是 complex/expert 任务。

判定流程:
```
task new → §123 complexity-judge --mode llm (默认 LLM-primary)
            ↓
            输出 task_complexity_class: simple | standard | complex | expert
            +  6 维度评分 (见下)
            +  confidence: high | medium | low
            +  reasoning + evidence
            ↓
   simple/standard          complex/expert
   ↓                        ↓
   skip R0 (允许用户         强制 R0 [CLARIFY]
   主动 --invoke-clarify)
```

**6 维度评分 (LLM 判 + heuristic fallback)**:

| 维度 | 含义 | 触发 complex 信号 |
|---|---|---|
| `scope_breadth` | 跨多少文件/模块 | few-files / medium / **wide** / cross-stack |
| `external_data_fetch` | 需要抓取外部时效性数据 | none / low / medium / **high** |
| `domain_expertise_required` | 需要专业领域知识 (商业/法律/平台规则) | generic / medium / **high** / specialist |
| `audit_stakes` | 错误后果严重度 | low / medium / **medium-high** / critical |
| `iteration_volume_expected` | 预期迭代轮数 | 1-2 / 3-5 / **6-10** / >10 rounds |
| `knowledge_freshness_dependency` | 依赖训练截止后的最新信息 | none / low / medium / **high** |

任一维度命中加粗档及以上 → complex / expert.

**抖音运营规划例**:
```
scope_breadth: medium (1 doc file but covering broad strategy)
external_data_fetch: high (抖音政策 + 账号 + 竞品过程)
domain_expertise_required: high (平台规则 + 商业运营)
audit_stakes: medium-high (商业决策)
iteration_volume_expected: 6-10 (复杂规划反复修)
knowledge_freshness_dependency: high (2026 抖音政策训练截止后)
→ task_complexity_class: complex
```

**Heuristic fallback** (LLM unavailable / opt-out):
- `--mode heuristic` 启用 keyword 命中, 但输出强制 `confidence: low`
- confidence=low → R0 Stage 0 必问用户 confirm, 不静默归类
- 防止 LLM 不可用时 silent misjudgment

**用户 override 机制**: LLM 也会错; R0 Stage 0 让用户最终确认 (见 §2.2).

**显式 escape**: 用户可以 `ralph-lisa clarify --skip` 跳过, 但 RLL 会 stderr warn:
> ⚠ 没提清楚需求就进入下一步, 这次可能只是验证思路, 结果不一定正式可用

### 2.2 R0 内部 5 阶段详细

#### Stage 0: 复杂度 confirmation (与用户对话, 一个 Q; **用户不能 naked override**)

R0 一进入就先 confirm AI 的复杂度判断:

```
[Stage 0/5] 复杂度 confirmation

我判断这个任务是: complex (confidence: high)
based on dimensions:
  - scope_breadth: medium
  - external_data_fetch: high (需要抓抖音政策 + 账号数据)
  - domain_expertise_required: high (商业运营 + 平台规则)
  - audit_stakes: medium-high (商业决策影响)
  - iteration_volume_expected: 6-10
  - knowledge_freshness_dependency: high (2026 政策 stale)

evidence:
  - 任务描述含 "运营规划" + "竞品" + "政策" 三关键词
  - 抖音 platform 2026 政策训练截止后, 必须 fetch

你确认此判断吗?
  A) Yes, 同意 LLM 判断 (继续 Stage 1)
  B) 不同意 — 我想改任务描述/目标 → 触发 task amendment
     ↳ 进入 task description revision dialog
     ↳ 用户 edit 任务描述 (短一句 / 加边界)
     ↳ 重跑 §123 LLM complexity-judge --extended
     ↳ 拿到新 task_complexity_class, 重显 Stage 0 (可能再循环)
  C) 跳 R0 phase, 但保留 LLM 判的 complex 不动
     ↳ ralph-lisa clarify --skip
     ↳ stderr warning: "没提清楚需求就进入下一步, 可能只是验证思路, 结果不一定正式可用"
     ↳ R1 [PLAN] 仍标 task_complexity_class=complex (复杂度不变, 只是没走 R0)
     ↳ 后续 Lisa narrow 仍按 complex 严格度走
```

**关键 lock (per 用户 2026-05-15 Q6)**: 用户不能 say "我说它简单" — **没有 naked complexity override**。改判定的唯一合法路径是 **改任务描述/目标 → LLM 重判**。

`clarify-locked-<step>.json` schema:

```json
{
  "schema_version": 1,
  "complexity_decision": "complex",         // ← 来自 LLM, 用户不能直接改
  "complexity_confidence": "high",
  "user_choice_at_stage_0": "A",            // A | B | C
  "task_description_revisions": [           // ← Q6 路径 B 的记录
    {
      "timestamp": "2026-05-15T...",
      "old_description": "做一个 douyin 工具",
      "new_description": "做一个 douyin 工具 — 只 cover 数据可视化, 不做政策分析",
      "llm_reclassification": "standard"    // ← 重判后的结果
    }
  ],
  "skip_clarify": false,                    // ← Q6 路径 C 的标记
  ...
}
```

confidence=low (heuristic fallback 或 LLM 不确定) → 强制 Stage 0 询问 (不 silent default).

#### Stage 1: Codebase 探索 (AI 内部, 不打扰用户)

AI 必须先做的功课（不能不读直接问用户）:

- Read 任务关联文件 (file:line 引用)
- Read `.rll/PLAN.md` 同方向已 closed slices
- `git log --oneline -10` 看最近 commits
- 读 memory 里相关 carry-forwards
- 检查 §10 Agent Reliability (若 available) 历史指标

输出 `R0-stage1-evidence.md`: codebase 探索证据清单, Lisa 可验证 AI 不是空想问问题。

#### Stage 2: 决策树映射 (AI 内部, output for review)

AI 列出 5 类决策点 (upstream → downstream 排序):

| 类别 | 例 | upstream-ness |
|---|---|---|
| Architecture | 新 module 放哪? 走 RPC 还是 in-process? | 1 (blocking) |
| Scope | 这个功能覆盖 cli only 还是 cli+webui? | 2 |
| Data | 用哪个 schema? 字段类型? 必填 vs 可选? | 3 |
| Risk | 接外部 API 失败兜底? 用户隐私数据? | 4 |
| UX | 命令名? --flag 名? error msg 文案? | 5 |

每个决策点带 AI 的推荐答案 (基于 Stage 1 evidence)。

#### Stage 3: 1-Q-at-a-time Grill (与用户对话)

一次 **只问一个问题**, 用 `AskUserQuestion` (RLL 已有), 模板:

```
Q (N/10): [问题文字]
  推荐: [AI 的默认答, 基于 Stage 1+2]
  reasoning: [为什么推荐这个]
  替代方案: 
    A) ...
    B) ...
    C) Other (自定义)
```

AI 在等回答时**不继续问下一个**, 不并发 grill。

**Push back 触发**: 用户答案如果含 ambiguity / risky / contradictory 信号 (跟 Stage 1 evidence 矛盾), AI 必须 push back:

```
[PUSH BACK] 你的回答里有 X, 但 codebase Y 显示 Z, 这两个怎么调和? 
  我建议: ...
  你确认仍按你的答案走吗?
```

不是 silent accept。

**默认 max 10 Q**, 超 10 自动 prompt:

```
我已 grill 10 次了。剩余我打算问的问题:
  - ...
  - ...
选择:
  A) Continue grilling (再问 N 个)
  B) Stop, 我们 confirmed 够了, 进 Stage 4
  C) 你来定 — 显式告诉我哪些 Q 还要问, 哪些 skip
```

#### Stage 4: 共识 Deliverable (R0 submit body)

R0 submit body 5 必填字段:

```markdown
[CLARIFY] §128 R0 — clarify-phase-r0

## 1. 任务理解 (1-2 句, user-quoted)
> 用户原话引用: "<...>"
> 我的理解: <...>

## 2. 已 cover 范围
- ...

## 3. ⚠ Negative scope (本 slice 不 cover)  ← 最关键字段, 防 over-engineering
- ✗ ...
- ✗ ...
- ✗ ...

## 4. 用户 confirmed decisions (Stage 3 输出)
| Q | A | confirmed_at |
|---|---|---|
| ... | ... | 2026-05-15 ... |

## 5. 已知 risk + 边界 trade-off
- Risk: ...
- 边界: ...
```

最后 AI 写 `.dual-agent/clarify-locked-<step>.json` artifact (machine-readable, schema-versioned), policy 检测此 artifact 存在 + acked=true 才让 R1 [PLAN] submit 过。

### 2.3 `/clarify` Slash Command（任何 round 触发）

用户在任何 round 输入 `/clarify` → AI 暂停当前进度, 进 grill-me dialog。

**用途**:
- Round-mid 发现 spec 不清楚, 用户主动 trigger
- 用户 review 时觉得 AI 走偏, push 回来 re-grill

**影响面判定: LLM-based impactAnalysis** (复用 §123 complexity-judge 同套 prompt template, 不同 mode):

```
新 clarification 文字 + 已 narrow 内容 (Lisa B1..Bn)
  ↓ feed LLM
  ↓
LLM 语义分析输出:
  {
    "impact_class": "append-safe" | "partial-conflict" | "full-rebuild",
    "confidence": "high|medium|low",
    "affected_narrows": ["B3", "B7"],   // 哪些 narrow 受影响
    "reasoning": "...",
    "user_confirm_required": true|false
  }
  ↓
  append-safe         → 回原 round + incremental record append 到 R0 artifact
  partial-conflict    → 用户决定 (再 grill 1 个 Q)
  full-rebuild        → 新 round + re-narrow trigger
```

**为什么 LLM-based 而非 keyword overlap**: 用户中途澄清"抖音政策需求改为只看 2026 年的政策, 不看 2025"。Keyword overlap 会判 "政策" 命中已 narrow Bn → 影响 → 新 round。但语义上可能只是缩小数据采集范围 (append-safe), 不需要 re-narrow 已 ship 的产品定位决策。LLM 看完整上下文才能判得准。

**Conservative bias**: 
- confidence=low → 升级一档 (append-safe → partial-conflict, partial-conflict → full-rebuild) 避免漏检
- 用户在 partial-conflict 时可显式 override 为 append-safe 或 full-rebuild

**Heuristic fallback** (LLM 不 available): keyword overlap 跑, 但**强制 confidence=low**, 走 conservative bias 升一档 (避免 silent miss)。

### 2.4 Negative-scope Guard (Lisa narrow 硬约束)

R0 输出的 `negative_scope` 字段是后续 Lisa narrow 的**硬约束**:

- Lisa 在 narrow 时, 如果该 narrow 会**扩大 negative_scope 边界**
- 必须改用 `[NEEDS_USER_ACK]` 而不是 `[NEEDS_WORK]`
- 决策权交回用户 — 用户可以选: A) 同意扩大 scope (signed user ack); B) 拒绝, Lisa 必须找 within-scope 的方案

这是 "minimal-viable bias" 的 mechanical 实现, 解决 margay 设计文档反复 over-engineering 的核心机制。

### 2.5 AI 知识 Freshness Gate (living memory, not static list)

AI 训练截止 **2025-12-31**。Grill / Stage 1 explore 过程中, AI 自评每个 Q / cite 是否依赖**常变信息**。

**核心设计 (per 用户 2026-05-15 Q2 lock)**: 不维护一个 hard-coded "常变 vs 稳定" 全列表 — 反实际, 列表本身就会 stale。改用 **living memory 模型**:

```
查询 topic 的 freshness:
  ↓
1) topic 在 bootstrap 稳定列表? 
     ├─ Yes → 用 cached, 不 fetch
     └─ No → step 2
2) topic 在 runtime log? log entry 在 TTL 期内?
     ├─ Yes → 用 log cite 的 source, 不再 fetch  
     ├─ No (stale) → WebSearch refresh + update log entry
     └─ Not found → WebSearch fresh + append new log entry
```

#### 2.5.1 Bootstrap 稳定列表 (RLL ship 时带, locked)

只列**真正稳定**的信息:
- OS 命令 / shell 内置 (bash builtin / ls / grep / find / awk / sed / ...)
- 编程语言核心 syntax (TypeScript / Python / Go / Rust 等核心语法)
- 文件系统操作语义 (chmod / signal / fd / etc.)
- 算法 / 数据结构基础
- 数学 / 统计基础
- 历史已 ship 代码 (RLL 本身的 commit 历史可读)

文件: `cli/templates/knowledge-freshness-bootstrap.json` (跟 RLL release 一起 ship)

```json
{
  "schema_version": 1,
  "stable_topics": [
    { "pattern": "/^(ls|grep|find|awk|sed|cat|head|tail)\\s/", "category": "shell-builtin" },
    { "pattern": "/typescript syntax|interface|generic/i", "category": "language-core" },
    ...
  ]
}
```

#### 2.5.2 Runtime log (living, 每次 fetch / cite 时 update)

文件: `.dual-agent/knowledge-freshness/log.jsonl`

每次 fetch volatile topic, append entry:

```jsonl
{"topic": "claude opus 4.7 features", "fetched_at": "2026-05-15T07:00:00Z", "source": "https://...", "ttl_days": 7, "cite_count": 1, "first_seen_at": "2026-05-15T07:00:00Z"}
{"topic": "next.js 16 app router", "fetched_at": "2026-05-15T07:15:00Z", "source": "https://...", "ttl_days": 30, "cite_count": 1, "first_seen_at": "2026-05-15T07:15:00Z"}
```

后续遇相同 topic:
- log 里 fetched_at + ttl_days > now → cite_count++ 不 fetch
- log 里 stale → 重 fetch, 更新 fetched_at + source

#### 2.5.3 TTL 启发 (initial; 后续靠数据调)

| topic 类型 | 默认 TTL | 例 |
|---|---|---|
| AI model 能力/版本 | 7 天 | Claude / Codex / GPT / Gemini 最新 |
| 第三方 SDK / framework version | 30 天 | next.js / react / vue / playwright |
| 政策 / 法规 / 合规 | 14 天 | 抖音 / GDPR / EU AI Act |
| 第三方 service API doc | 30 天 | OpenAI API / Anthropic API / Stripe |
| 行业 trend / 竞品分析 | 7 天 | 创业公司动态 / 平台运营情报 |

用户可在 R0 Stage 1 explore 时为特定 topic override TTL (e.g. `--ttl-override "claude opus 4.7"=1` 强制每天 refresh).

#### 2.5.4 Bootstrap 进化 (自我扩展)

如果某 topic 在 log 里观察到 **N 个 cycle (e.g. 5 个 TTL 周期) 内 source URL 内容稳定 (hash 没变)**, 自动提议加入 bootstrap. AI 在 §128 closeout / weekly digest 时建议:

```
建议加入 bootstrap stable list (5 cycle 稳定):
  - "go context.Background() usage" (5 cycle 内 source hash 不变)
  - "tmux kill-session syntax" (5 cycle 内 source hash 不变)
  
用户 ack? [Y/n/skip]
```

Lisa 在 §128 closeout 阶段 review 此建议清单。

#### 2.5.5 Lisa review oracle

R0 grill / R1 PLAN body 中, Ralph 若 cite 任何**信息**:
- 来自 bootstrap 稳定列表 → ok
- 来自 runtime log (in-TTL) → ok, cite source URL + log entry id
- 不在两者中 → Lisa narrow [NEEDS_WORK]: "请 WebSearch 该 topic 并 update freshness log"

mechanical regression 防止 stale-knowledge over-engineering (e.g. 引用 2024 旧 framework API 设计现代 codebase).

---

## 3. CLI 接口

### 3.1 `ralph-lisa clarify <subcommand>`

```bash
# 进 grill 模式 (Stage 1+2 自动, Stage 3 互动开始)
ralph-lisa clarify --start

# 查看当前进度
ralph-lisa clarify --status
# 输出: stage / 已问 Q 数 / negative_scope 已 lock 项 / decisions 已 confirm 项

# 添加用户答案 (cli-mode; 通常通过 AskUserQuestion 自动)
ralph-lisa clarify --add-answer Q-id "用户答案"

# 完成澄清, 写 5 必填字段 + ack
ralph-lisa clarify --commit

# 跳过澄清 (复杂任务 strongly discouraged; warning printed)
ralph-lisa clarify --skip

# 帮助
ralph-lisa clarify --help
```

### 3.2 `/clarify` slash command (任何 round)

在 Claude Code / Codex 任何 round 里输入:

```
/clarify
```

→ AI 暂停, 进 grill mode, 走完后回原 round (或新 round, 视影响面)。

---

## 4. 跟现有 RLL 机制的交互

### 4.0 §123 complexity-judge 扩展 — **路径 C: --extended flag + extension block** (per 用户 2026-05-15 Q7 lock)

**问题**: §123 是 0.7.0 已 ship 的稳定机制。§128 要加 task_complexity_class + 6 dimensions, 不能 breaking change 现有 §123 consumer (complexity-verify / plan-keeper Rule 9 / Lisa rerun).

**路径 C 设计 (用户 2026-05-15 拍)**: backwards-compat 嵌套 extension block, 一次 LLM 调用拿全。

**用法**:
```bash
ralph-lisa task complexity-judge --slice X                  # legacy, schema v1 only (无 extension)
ralph-lisa task complexity-judge --slice X --extended       # NEW, schema v1 + extension block
```

**输出**:
```json
{
  "schema_version": 1,                                        ← 不变
  "model_id": "...",
  "input_hash": "...",
  "tiers": [                                                  ← 不变
    {"tier": "integration", "confidence": "high", "auto_required": true, ...}
  ],
  "extension": {                                              ← NEW, --extended 才有
    "schema_version": 1,                                      ← extension 自己有 schema_version
    "task_complexity_class": "complex",
    "complexity_confidence": "high",
    "complexity_dimensions": {
      "scope_breadth": "medium",
      "external_data_fetch": "high",
      "domain_expertise_required": "high",
      "audit_stakes": "medium-high",
      "iteration_volume_expected": "6-10",
      "knowledge_freshness_dependency": "high"
    },
    "complexity_evidence": ["...", "..."]
  }
}
```

**Backwards-compat**:
- 旧 consumer 读 `.tiers` 不变, 完全不知道 extension 存在 → §123 stable
- 新 consumer (`§128 R0 policy gate`) 读 `.extension.task_complexity_class`
- artifact freshness check (Rule 9) 沿用现有 input_hash 机制, 不变

**新增 cli `task impact-analysis`** (单独 cli, 复用同 LLM client + 不同 prompt template):
```bash
ralph-lisa task impact-analysis --slice X --new-clarification "新澄清文字" --already-narrowed-file "..."
# Output: { "impact_class": "append-safe|partial-conflict|full-rebuild", "confidence": "...", "affected_narrows": [...] }
```

为什么 impact-analysis 是新 cli 不嵌进 complexity-judge:
- 调用语义不同 (judge 判 task, impact 判 diff between clarification + narrows)
- 输入不同 (judge: task body; impact: 2 个文本 diff)
- 调用频次不同 (judge: 1 次 per slice; impact: N 次 per /clarify trigger)

改动到 §128 R3 [CODE] 一并 ship.

### 4.1 Policy gate (cli/src/policy.ts)

新增 policy rule:

```typescript
{
  rule: 'clarify-not-completed',
  trigger: (ctx) => {
    // 1. 读 §123 artifact 拿 task_complexity_class (Q7 路径 C: 在 .extension 嵌套块)
    const judge = readComplexityJudge(step);
    const taskClass = judge?.extension?.task_complexity_class;
    if (!taskClass) {
      // §128 R0 要求 --extended 输出, 缺则需用户重跑 complexity-judge --extended
      return { block: true, message: 'task complexity-judge --extended not run; run first to assess complexity_class' };
    }
    if (taskClass === 'simple' || taskClass === 'standard') {
      return false;  // simple/standard escape (R0 strongly recommended but not blocked)
    }
    // 2. complex/expert 必须 clarify-locked OR --skip-clarify 显式 flag
    const artifact = `.dual-agent/clarify-locked-${step}.json`;
    if (existsSync(artifact)) {
      const locked = JSON.parse(readFileSync(artifact, 'utf8'));
      // R0 commit 完 OR 用户显式 skip 都算 satisfied
      return !locked.skip_clarify && !locked.committed;
    }
    return true;  // block
  },
  action: 'block-submit-R1-PLAN',
  message: 'complex/expert task requires R0 [CLARIFY] complete first; run `ralph-lisa clarify --start`. (Override: `clarify --skip` with warning)',
}
```

**关键点**: 用户不能 silent skip — 必须显式跑 `clarify --skip` 才能 bypass; bypass 也不改 complexity_class (per Q6 lock).

### 4.2 Lisa narrow 的 negative-scope guard

Lisa role-template 新增 discipline section:

```markdown
## Negative-scope guard (§128)

Before submitting [NEEDS_WORK], grep R0 negative_scope field:
- If your narrow's required change is within negative_scope → use [NEEDS_USER_ACK] tag, 
  NOT [NEEDS_WORK]
- User must explicitly ack scope expansion before you proceed
- Mechanical implementation of minimal-viable bias (margay 2026-05-14 over-engineering)
```

### 4.3 Round 序列变化

复杂任务:

```
R0 [CLARIFY] (NEW)
  → R1 [PLAN]
  → R1.x [FIX]
  → R2 [CODE] tests-only
  → R3 [CODE] impl
  → R3.x [FIX]
  → mutual [CONSENSUS]
```

简单任务:

```
R1 [PLAN]
  → R3 [CODE]
  → mutual [CONSENSUS]
```

(简单任务原本就跳 R2 tests-only, 现在也跳 R0)

### 4.4 `[NEEDS_USER_ACK]` 新 tag

Lisa side 新 tag, RLL policy 识别:
- 出现 `[NEEDS_USER_ACK]` → cascade 暂停
- 等用户在 wecom-feedback 或终端答 `/ack-scope-expansion "<reason>"` 解锁
- 用户 ack 后 Lisa tag 自动转 `[NEEDS_WORK]`, Ralph 进 [FIX]

---

## 5. 工作流示例

### 5.1 用户开新 slice (example: §AAA)

```
用户: 帮我加一个 ralph-lisa 命令叫 inspect-slice, 能 show 当前 slice 的状态

Claude (Ralph):
  $ ralph-lisa task new inspect-slice-cli
  $ ralph-lisa clarify --start

  [Stage 1: Codebase explore]
  Reading: cli/src/commands.ts (cmdStatus, cmdRecap)
  Reading: .rll/PLAN.md (recent slices §125 §127 §128)
  Reading: docs/trust-coding-user-guide.md
  Found 17 evidence items.

  [Stage 2: Decision tree]
  - Architecture: 复用 cmdStatus 的 dispatcher 还是新建 inspect-slice subcmd?
  - Scope: cli only, 还是 wecom-push 同时?
  - Data: show 哪些字段? task-capability + PLAN section + recent commits + test results?
  - UX: 输出 markdown 还是 JSON --json?

  [Stage 3: 1-Q-at-a-time grill]
  
  Q (1/10): inspect-slice 是新 cli subcommand 还是扩展 cmdStatus?
    推荐: 新 subcommand `inspect-slice <slug>`
    reasoning: cmdStatus 是当前 step, inspect-slice 是任意 slice (含已 closed) — 不同 scope
    替代: A) 扩 cmdStatus 加 --slice flag; B) 新 subcommand (推荐); C) Other
  
  用户: B

  Q (2/10): 输出格式?
    推荐: 默认 markdown table, 加 --json 走结构化
    reasoning: cli 既要 human-readable 又要 ci-script-friendly
    替代: A) 推荐; B) JSON only; C) markdown only; D) Other
  
  用户: A

  ... (continue until 用户 stop or 决策树跑完)

  [Stage 4: Commit]
  R0 deliverable:
    1. 任务理解: "新 ralph-lisa subcommand inspect-slice <slug> show slice status"
    2. Covered: cli surface + markdown/json output + task-capability + PLAN section info
    3. ⚠ Negative scope:
       ✗ 不 wecom-push (后续 slice 添加)
       ✗ 不 modify existing cmdStatus (zero regression)
       ✗ 不 cover historical pre-§122 slices (无 task-capability artifact)
    4. Decisions: [Q1→B, Q2→A, ...]
    5. Risk: 解析 closed slice PLAN section 时 §1 row drift 可能 mismatch

  $ ralph-lisa clarify --commit
  ✓ clarify-locked-inspect-slice-cli.json written
  ✓ Policy: R1 [PLAN] now unblocked

  → 进 R1 [PLAN], 此时 AI 有 negative scope 防过度
```

### 5.2 Lisa narrow 触发 negative-scope guard

```
R3 [CODE] impl 完成, Lisa review:

Lisa (after grep negative_scope):
  Found: 我想 narrow "inspect-slice 应该同时 wecom-push"
  But: R0 negative_scope has "✗ 不 wecom-push"
  → Switching tag to [NEEDS_USER_ACK]
  
[NEEDS_USER_ACK] 用户, 我建议扩 scope 加 wecom-push:
  reasoning: ...
  你 ack 扩 scope 吗? 
    A) Yes, 加 wecom-push (Lisa narrow 转 NEEDS_WORK)
    B) No, 保持 negative_scope, Lisa 找 within-scope 方案
    C) Yes 但延后到 followup slice

用户: B (保持原 scope)

→ Lisa 必须找 within-scope 的 narrow (e.g. cli output 加 cite link 让用户手动 wecom-push)
```

---

## 6. 不 cover 的 (本设计 negative scope)

- ✗ 不 implement §10 Agent Reliability metrics (后续 slice)
- ✗ 不 implement §129 design-doc fast-path (后续 slice)
- ✗ 不 implement §130 carry-forward 进化机制 (后续 slice)
- ✗ 不改 R1/R2/R3 tag 含义, 只新增 R0
- ✗ 不强制 retroactive 给已 closed slices 加 R0
- ✗ 不 cover non-Chinese clarify dialog (中文优先; 英文 future slice)
- ✗ 不集成 voice / wecom-multi-turn grill (只 cli + tmux pane 模式)

---

## 7. Open Questions — 所有 resolved (v3 update 后)

### v1 → v2 (用户 2026-05-15 第二轮 push back) resolved:
- ~~complexity 判定 keyword/regex~~ → LLM-primary multi-dim (§2.1)
- ~~impactAnalysis keyword overlap~~ → LLM semantic (§2.3)
- ~~design-doc 算简单 escape 吗~~ → 由 LLM 6 维度评分判 (抖音运营规划例)

### v2 → v3 (用户 2026-05-15 第三轮 1-7 答复) resolved:

| Q | 用户答 | v3 实现 |
|---|---|---|
| 1 `[NEEDS_USER_ACK]` 新 tag | ✓ 同意 | §4.4 加 tag, cli/wecom/watcher 协议识别 |
| 2 freshness 列表 | living memory, bootstrap stable only + runtime log + 持续更新 | §2.5 重写 (bootstrap + log.jsonl + TTL + self-evolving bootstrap) |
| 3 negative scope 写法 | ✓ free-form + LLM-semantic match | §4.2 Lisa narrow 用 LLM impact-analysis match 而非 keyword |
| 4 Grill max cap 10 | ✓ 可以 | §2.2 Stage 3 默认 10, 用户 --continue/--stop |
| 5 6 维度够否 | 试试, 数据后调 | §2.1 暂时 6 维度, §10 数据反查后期调 |
| 6 complexity user override | **不能 naked override; 只能改任务描述/目标 → 重判** | §2.2 Stage 0 选项 A/B/C 重写 + schema 删 complexity_user_override 字段, 加 task_description_revisions 数组 |
| 7 §123 schema breaking | **路径 C: --extended flag + extension nested block** | §4.0 重写, backwards-compat extension 嵌套 + 单独 `task impact-analysis` cli |

### 长期未 resolved (依赖数据收集, 留 §10 后再 revise):

- 6 维度评分是否够 → §10 Agent Reliability data 反查 6 维度对 task_complexity_class 预测准确率
- Grill max cap 10 是否合理 → §10 数据收集
- TTL 启发值是否合理 → §2.5.4 self-evolving bootstrap 自动调

### 没问但需要 Lisa narrow 时关注的:

- Stage 0 选项 B (改任务描述) 触发的 LLM 重判可能进入循环 (用户改 → LLM 仍判 complex → 用户再改 → ...). Lisa narrow 关注循环 cap (e.g. 3 次循环后强制 Stage 0 A 或 C).
- Freshness log entry "5 cycle 稳定" 自动 promote 到 bootstrap 的逻辑, 怎么 detect "source hash 不变" (URL 同 ≠ content 同; 需要 content hash). 实现细节 R3 时再敲。

---

## 8. 路径前瞻

```
现在:                   §128 ship R0 [CLARIFY] + /clarify + negative-scope guard
                        ↓
下一个 (P1 ③):          §129 design-doc fast-path (跳 R0 + 跳 TDD; minimal-viable bias)
                        ↓
下一个 (P1 ①):          §10 Agent Reliability metrics (开始收集 task_success_rate / 
                        regression_introduced_rate, 给后续 dynamic routing 用)
                        ↓
下一个 (P2 ④):          §130 carry-forward 进化机制 (trial 期 + counter-evidence)
```

§128 ship 后 RLL 就有了完整的 "user-brief → grill → consensus → plan → impl → cascade → CONSENSUS" 链路, 是 AI-native SDLC 方向上最重要的一块缺位补齐。

---

**文档版本**: v3 final draft (2026-05-15, post 用户第三轮 Q1-Q7 答复 + 路径 C 拍)
**作者**: Ralph (Claude Code) based on user 2026-05-15 三轮对话 lock
**Review status**: 等用户最终 ack v3; OK 后 submit §128 R1 [PLAN] 给 Lisa

**版本演进**:
- **v1** (initial): keyword/regex 复杂度判定 + keyword impactAnalysis + complexity_user_override naked field
- **v2** (post 用户 push back #1: keyword 不够准): LLM-primary multi-dim + LLM semantic impact + §123 schema v1→v2 breaking
- **v3** (post 用户答 Q1-Q7): 
  - Q1 ✓ `[NEEDS_USER_ACK]` 加 tag
  - Q2 重大改: freshness 静态列表 → **living memory** (bootstrap + runtime log.jsonl + TTL + self-evolving promote)
  - Q3 ✓ free-form + LLM-semantic match
  - Q4 ✓ Grill max cap 10
  - Q5 ✓ 6 维度试用, 数据后调
  - Q6 重大改: complexity_user_override 字段删除; 用户不能 naked override; 必须改任务描述/目标重判
  - Q7 拍板路径 C: §123 `--extended` flag + extension nested block (backwards-compat) + 单独 `task impact-analysis` cli
