# RLL 0.7.1 — New Features User Guide (2026-05-16)

Version 0.7.0 ships 5 new mechanisms post-§125 phase-lifecycle. This guide covers user-facing usage.

> **Status note**: features documented here are mechanically tested (1915 tests / 0 fail) and have R0 [CLARIFY] + mutual CONSENSUS closeout. However, **one production hook (§10 agent-reliability) had a silent-failure dogfood finding** — see `docs/test-report-2026-05-16.md` for details. Treat reliability collection as best-effort until §137/§139 ship.

---

## 1. R0 [CLARIFY] phase (§128) — 复杂任务防 over-engineering

复杂或专家任务 (`task_complexity_class` ∈ {complex, expert}) 在进 R1 [PLAN] 之前**必须**走 R0 [CLARIFY] phase. Simple/standard 任务跳过.

### 触发条件

- `ralph-lisa task complexity-judge --slice <slug> --extended --json` 输出 `extension.task_complexity_class` ∈ {complex, expert}
- AND `.dual-agent/clarify-locked-<slug>.json` 不存在 OR `committed=false`

### 5-stage 流程

```bash
# Stage 0: 复杂度 confirmation (A/B/C)
ralph-lisa clarify --start
# AI 显示 LLM 复杂度判断
# 答 A 同意 / B 改任务描述 / C 显式 skip
```

```bash
# Stage 1-3: AI codebase 探索 + 决策树 + 1-Q-at-a-time grill
# (主要在 AI 端发生, 用户 1 个 Q 1 个 Q 答)
```

```bash
# Stage 4: finalize 共识 deliverable
ralph-lisa clarify --commit \
  --understanding "用户级任务理解 (引用 user)" \
  --covered "已 cover 范围 (csv)" \
  --negative-scope "✗ 不 cover 范围 (csv)" \
  --risks "已知 risk (csv)"
```

### Bypass path: user-direct-bounded-scope-statement (CF26)

If user provides explicit covered + negative scope in a single conversation turn before R1 PLAN, that statement IS R0 deliverable. Capture as clarify-locked artifact with `user_choice_at_stage_0="user-direct-bounded-scope-statement"` + `committed=true`. checkClarifyGate honors it.

例 (我本夜 §128-followup / §129-followup / §10 都用这条 bypass):

> User: "Scope is bounded — single mechanism. Negative scope: no auto-accept, no LLM stability detection."

Ralph 写 clarify-locked-<slug>.json 包含上述 quotation → checkClarifyGate proceeds → R1 PLAN unblocked.

### Skip explicit (不推荐)

```bash
ralph-lisa clarify --skip
# warning printed; complexity_class 不变; R0 跳过
```

---

## 2. Knowledge-freshness self-evolving promotion (§128-followup)

§128 ship 了 bootstrap (static 稳定列表) + runtime log (AI fetch 历史) + TTL refetch. **§128-followup 加了 self-evolution**: 反复 fetch 同一 topic+content 5 次后, 自动提议升入 stable list (用户审批后接纳).

### 触发 (auto-fire)

当 AI agent (Ralph) 调 `logFreshFetch(topic, content_hash)` 5 次, 且 content_hash + ttl_category 都一致, **自动** 写 `.dual-agent/knowledge-freshness/promotion-proposals.jsonl` 一条 `status:pending` proposal.

环境变量: `RL_KNOWLEDGE_STABILITY_THRESHOLD=3` 可改阈值 (默认 5).

### 用户 cli

```bash
# 看待批 proposals
ralph-lisa knowledge-freshness propose-promote --list

# 看历史 (accepted / rejected)
ralph-lisa knowledge-freshness propose-promote --list --status accepted
ralph-lisa knowledge-freshness propose-promote --list --status rejected

# 接纳 → topic 进 union stable list (checkFreshness 后续视为 cached)
ralph-lisa knowledge-freshness propose-promote --accept <proposal-id>

# 拒绝 → 留 audit ledger
ralph-lisa knowledge-freshness propose-promote --reject <id> --reason "noise / fad"
```

⚠️ **NEVER auto-accept** (per §128-followup R0 negative scope). 用户必须显式 `--accept`.

### Dogfood note

目前没有 `knowledge-freshness simulate-fetch` cli 入口供操作员直接测试. 必须等 AI 实际多次 fetch 后才有 proposal 出现. 这是 usability gap, 见 test-report.

---

## 3. Doc-oracle-spec framework (§129 + §129-followup)

代码任务有多 tier 测试 (unit/smoke/integration/e2e/perf/security); **doc 任务也能有 multi-dimension 审核** (数据准确性 / 信源权威性 / 信源时效 / 逻辑通顺 / 用户依从性 / +AI 味 / 风格 / 主题 / 详实).

### Canonical 9-dim whitelist

ship 在 `gate-manifest.json:canonical_doc_oracle_dimensions`:

**Core 5** (强 starter):
- `data-accuracy`
- `source-authority`
- `source-freshness`
- `logical-coherence`
- `compliance-with-user-spec`

**Recommended 4** (项目可选):
- `ai-slop`
- `style`
- `topic-coverage`
- `depth-detail`

### 6 verification methods

ship 在 `cli/src/verification-methods/`:

| Method | Verification | Status |
|---|---|---|
| `text-check` | read doc + heading check | ✅ shipped |
| `grep` | literal substring | ✅ shipped |
| `lint` | spawn lint command | ✅ shipped |
| `ai-slop` | regex banlist + LLM-judge mock-aware | ✅ shipped (§129-followup; live LLM provider deferred) |
| `source-freshness` | wires §128 checkFreshness Layer 1.5 union | ✅ shipped (§129-followup) |
| `source-search-websearch` | URL extract + auth-score | 🟡 mock-aware only (live WebSearch needs API key, deferred) |
| `llm-judge` | semantic judge | 🟡 mock-aware only (live provider deferred) |

### 用户工作流

#### Step 1: 写 doc-oracle-spec file

```bash
cat > .dual-agent/doc-oracle-spec-<slice>.md <<EOF
| ID | Dimension | Verification Method | Pass Criteria | Required |
|----|-----------|---------------------|---------------|----------|
| D1 | data-accuracy | source-search-websearch | >=95% sources verified | ✓ |
| D2 | source-authority | grep | grep \\.gov\\|\\.edu | ✓ |
| D3 | source-freshness | source-freshness | all topics stable | ✓ |
| D4 | logical-coherence | text-check | has heading | ✓ |
| D5 | compliance-with-user-spec | grep | user-requirement-keyword | ✓ |
| D6 | ai-slop | ai-slop | no banned phrases | ✗ |
EOF
```

#### Step 2: validate spec

```bash
ralph-lisa task doc-oracle-spec validate --slice <slice>
# 检 schema + canonical dim 白名单 + ≥1 Required ✓
# exit 0 valid / exit 1 invalid
```

#### Step 3: run cascade

```bash
ralph-lisa task doc-oracle-spec run --slice <slice> --doc docs/<your-doc>.md
# 跑 spec 中所有 Required ✓ 的 dim; halt-on-fail
# 输出 JSON: { status, ranDimensions, failedDimensions, invalidRows? }
# exit 0 pass / exit 1 fail
```

### 项目级 ai-slop banlist override

`.ralph-lisa.json` 加:
```json
{
  "docOracle": {
    "aiSlopBanlist": ["project-specific-bad-phrase", "another-pattern"]
  }
}
```

`task doc-oracle-spec run` 自动 merge 项目 banlist + 默认 `cli/templates/ai-slop-banlist.json`.

### 真实示例 (本夜 dogfood)

```bash
# Pass case: clarify-phase design doc 干净
$ node cli/dist/cli.js task doc-oracle-spec run --slice dogfood-test --doc docs/clarify-phase-design.md
{
  "status": "pass",
  "ranDimensions": ["ai-slop", "logical-coherence", "compliance-with-user-spec"],
  "failedDimensions": []
}
# exit 0

# Fail case: doc with "In conclusion, this is important to note. Let's dive deep into the topic."
$ node cli/dist/cli.js task doc-oracle-spec run --slice dogfood-test --doc /tmp/test-slop.md
{
  "status": "fail",
  "ranDimensions": ["ai-slop"],
  "failedDimensions": ["ai-slop"]
}
# exit 1 (halt-on-fail; 2nd dim 不跑)
```

### Doc-task 自动检测

当 R1 [PLAN] body 或 task.md 含以下任一信号, `cmdSubmitRalph` 自动 detect 为 doc-task → 要求 doc-oracle-spec:
- `Task type: doc-task` explicit
- 输出文件结尾 `.md` (e.g. `Deliverable: docs/handbook.md`)
- 强词命中 `docs/` / `README` / `handbook` / `guide` / `manual` / `specification` / `运营规划`

显式 override:
```bash
# CLI flag (per future doc-task slice opens):
--shape doc | code | mixed
```

---

## 4. Agent Reliability metrics (§10)

每次 sub-slice mutual CONSENSUS 自动 emit 一条 `agent-reliability.jsonl` 事件; cli 出汇总表.

⚠️ **Production hook 当前有 silent-failure bug** (见 test-report-2026-05-16.md §10 节). 直到 §137/§139 ship 之前, 可靠性数据收集 **可能不会发生**. 不要依赖.

### 事件 schema

11 字段 jsonl line:
```
{event_id, agent, model, task_type, task_complexity_class, outcome, round_count, rounds_to_consensus, narrows_count, wall_clock_ms, fetched_at}
```

`agent` 默认 `claude` (env `RL_AGENT` override).
`model` 默认 `unknown` (env `RL_MODEL` 或 `LLM_MODEL` override).
`task_type` 自动 derive: override > clarify-locked.covered_scope[0].split(' ')[0] > step.split('-')[0..2] join > 'unknown'.

### 查询

```bash
# 全部 events 汇总 (default 7 day window)
ralph-lisa reliability-metrics show

# 过滤
ralph-lisa reliability-metrics show --days 30
ralph-lisa reliability-metrics show --agent claude
ralph-lisa reliability-metrics show --model opus-4-7
ralph-lisa reliability-metrics show --task-type design-doc

# 帮助
ralph-lisa reliability-metrics --help
```

### 输出

ASCII 表, 每行 (agent, model, task_type) + count + pass% + avg_rounds + avg_narrows + p50/p90 wall_clock_ms.

### Secret redaction

`recordReliabilityEvent` boundary 自动 strip `sk-...` + `api[_-]?key:VALUE` patterns. 不会落 jsonl.

---

## 5. 测试 + 验证状态

完整 cli suite: **1915 tests / 1907 pass / 0 fail / 8 todo** (5/16 03:00).
Zero pre-existing regression across 5 slice closures.

详细 per-slice + dogfood 结果见 `docs/test-report-2026-05-16.md`.

## 6. 已知缺陷 + 下一步 (待用户拍方向)

| Gap | 影响 | 候选 slice |
|---|---|---|
| user-manual gate 无强制 / opt-in only | 5 个新 cli 没 ship 用户文档前用户不可见 | §138 user-manual-gate-mandatory |
| end-to-end dogfood gate 缺 | 测试绿 ≠ 真打外部 ≠ 用户体验绿 | §139 e2e-dogfood-gate |
| Test report 不自动生成 | 每次 close 都靠 Ralph 手动写 (本次也是) | §140 standalone-test-report-emit |
| §10 hook 静默失败 (本次 dogfood 发现) | mutual CONSENSUS 报告 emit 但 jsonl 不存在 | §137 prose-claim verification gate |
| Default policy mode warn 不 block | 测试失败的 submit 照过 | §133 policy-block-default |
| §52 marker carve-out 过宽 | Ralph 黏 marker 就 silent test fail | §134 §52 marker tighten |
| 一直 retry 直到 gate 过 (没 retry-counter) | 反复 retry 直到运气好 | §135 gate retry counter |

等用户拍方向 (推荐打包 §137+§138+§139+§140 一次性堵).
