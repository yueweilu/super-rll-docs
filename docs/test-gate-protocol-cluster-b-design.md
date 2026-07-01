# Cluster B — 测试门禁流程协议 设计 (item ②④)

**状态**: 用户已拍方向 (2026-06-01)，进入实现。走 Ralph↔Lisa。
**来源**: 用户 2026-06-01 给的 4 点 spec + 决策(见 memory `project-test-gate-protocol-cluster-b`)。
**纪律**: 这本身是"改进"→ 全程要经 Lisa 审核;user-in-loop 环节需用户实时参与。

## 用户决策 (2026-06-01 锁定)

- test-report 存 **`.dual-agent/test-reports/`**(不是 docs/)。
- 其它 follow 设计建议:test-plan 文档落 `docs/test-plans/`(随 repo 备查);proposal 既给 flag-based 也给 json-edit;report 保留 final + 失败 round;备查 = wecom-push 摘要 + docs 索引;slice 顺序 B1→B2→B3→B4。
- **★ 关键新要求 — policy gate 必须由用户的测试门禁决定驱动**:
  1. gate 强制的 tier/用例 = **用户 confirm 的 test-gate-locked**,不是固定 baseline。用户加/减 tier → gate 跟着变。
  2. **用户授权 skip 测试过程 → gate 必须遵守**(不能 block)。即 test-gate-locked `skip: true (user-signed)` 时,§102/§128/§70/complexity-verify 全部放行 skip,不报 baseline-missing。
  3. 这是 trust-boundary: 用户对自己项目的测试要求有最终决定权,包括"这个我不想测"。gate 退化成"执行+核验用户决定的内容",而非"强加固定标准"。
  - 实现: 新 `test-gate-locked-<slug>.json` 成为 policy gate 的**权威输入源**(优先于 gate-manifest baseline + complexity-judge auto_required)。`checkRalph` / `complexity-verify` / `handleMutualCompletion(§70)` 读它。user-signed skip 走 audit-ledger 留痕(类似 §157 ack-downgrade)。

---

## 用户 4 点 → 设计映射

### 点 1 — 门禁选择 Ralph 建议、用户可调整

**现状**: `task-intake` Stage 0 给 A/B/C(simple/standard/strict)模式 + `complexity-judge` 产 tier 建议。但用户只能选模式,不能调具体门禁内容。

**新增**: **test-gate 提案 (proposal) + 用户编辑环**。
- Ralph 在 R0/R1 跑 `complexity-judge` 后,生成一份**具体门禁提案**:建议的 tiers(unit/smoke/integration/e2e/…)+ 每个 tier 的测试范围 + 预估用例数。
- 新 CLI: `ralph-lisa test-gate propose --slice <slug>` → 打印提案 + 写 `.dual-agent/test-gate-proposal-<slug>.json`。
- 用户**可调整**: `ralph-lisa test-gate adjust --slice <slug> --add-tier e2e --drop-tier perf --set-required smoke=✓` (或直接编辑 json + `test-gate confirm`)。
- 锁定: `ralph-lisa test-gate confirm --slice <slug> --user-signature "<…>"` → 写 `test-gate-locked-<slug>.json`(含 user 调整记录 + 签名)。
- 这是 trust-boundary: **门禁内容最终由用户拍**(Ralph 建议默认,用户可改)。

### 点 2 — 门禁含测试计划(内容/范围/infra)+ 用例三件套经 Lisa 审

**现状**: §102 5-col 表(ID/Tier/Command/Oracle/Required);Oracle ≈ 预期但混了断言。

**新增**: **测试计划 header + 三件套用例 schema**。
- 测试计划 header(写进 PLAN.md slice 段 + test-plan 文档):
  - **测试内容**: 测什么行为/契约。
  - **测试范围**: 覆盖边界(happy/negative/edge/parity),不覆盖什么(negative-scope)。
  - **测试基础设施**: 用哪个 harness(§187 wezterm/playwright / node:test / cargo),mock vs real,cleanup(§127)。
- 用例三件套(扩 §102 表为显式 3 字段,或新增列):
  - **用例 (case)**: 输入 / 触发条件。
  - **预期结果 (expected)**: 应得到什么。
  - **断言描述 (assertion)**: 怎么机械判定(assert.X(...) 语义,anti-vacuous)。
- **Lisa 审**: §149 已有 Lisa 验 test-files + assertion;新增 Lisa 必须独立确认每个 Required 用例的**三件套齐全且断言非 vacuous**(扩 lisa.md oracle)。

### 点 3 — 确定的测试计划+用例写入文档

**现状**: PLAN.md 表 + auto-tdd-plan artifact(机器读)。

**新增**: **人读 test-plan 文档持久化**。
- `ralph-lisa test-plan emit --slice <slug>` → 写 `docs/test-plans/<slug>.md`(或 `.dual-agent/test-plans/`):测试计划 header + 三件套用例表 + 门禁 tiers + infra + cleanup。
- 在 R1 [PLAN] consensus 后自动 emit(handoff hook)。备查 + 可 diff。

### 点 4 — 执行过程+结果写测试目录;报告+证据经 Lisa 审后存档,提交用户备查

**★ 用户强调 (2026-06-01)**: 
- **测试进程回收**: 跑测试(尤其 harness/spawn 类)绝不留孤儿测试进程(§127 + 复用 crash-fix 的 `killOurProcessTree`/`tempProject` cleanup)。每个 test-report run 末尾 sweep 残留。
- **记录过程+证据,不只结果**: 必须持久化**完整执行过程**(命令 + stdout + stderr + exit + 耗时 + env 关键项)+ **证据**(artifact/截图/log),**流式落盘**(边跑边写 test-reports/),关掉测试进程也不丢。**绝不只留一个 pass/fail 结果**。目的: 可检查 + 可复现。
- 即: 现状 gate-results.md/test-execution-log.jsonl 只留结果摘要 → B4 要补全 per-command full 过程 + 证据 bundle。


**现状**: gate-results.{md,json} / harness-results/ / test-execution-log.jsonl(散落,无统一报告,无 user 备查入口)。

**新增**: **测试报告 + 证据 bundle + Lisa 审 + user 备查**。
- 执行过程/结果统一写 `.dual-agent/test-reports/<slug>/`:
  - `run-<round>.md`: 执行命令 + 结果 + 耗时 + pass/fail。
  - `evidence/`: gate-results 快照、harness 截图(§151 visual)、test-execution-log 切片。
- **Lisa 审后存档**: Lisa [PASS] 时验报告真实(§144 Verified: 已有)→ 标 `reviewed: true` → 归档到稳定位置(不被下轮覆盖)。
- **提交用户备查**: `ralph-lisa test-report submit-user --slice <slug>` → wecom-push 报告摘要 + 路径 + 生成 `docs/test-reports/<slug>/index.md` 索引。off-laptop user 也能查。

---

## 复用 vs 新建

| 能力 | 复用现有 | 新建 |
|---|---|---|
| 门禁 tier 建议 | complexity-judge §123 | test-gate propose/adjust/confirm + 用户编辑环 |
| 测试计划 | §102 表 / §145 phase | 测试计划 header(内容/范围/infra)+ 文档 emit |
| 用例三件套 | §102 Oracle 列 | 显式 case/expected/assertion 3 字段 + Lisa 审 oracle |
| 执行+门禁 | §70 cascade / §187 harness | test-reports/ 统一目录 |
| 证据+审核 | gate-results / §144 Verified | 报告归档 reviewed-flag + user 备查入口 |

## 实现 slice 拆分建议(每个走 Ralph↔Lisa)

- **B1** test-gate-proposal: propose/adjust/confirm CLI + schema + 用户签名(扩 task-intake)。**user-in-loop**。
- **B2** test-case-triple-schema: 三件套 schema + PLAN 表扩展 + Lisa 审 oracle(扩 lisa.md/§149)。
- **B3** test-plan-document: `test-plan emit` + handoff hook + docs/test-plans/。
- **B4** test-report-archival: test-reports/ 目录 + 报告生成 + Lisa reviewed-flag + `test-report submit-user` wecom-push。

依赖: B2 → B3(文档要三件套)。B1 独立。B4 依赖 §70 gate。建议顺序 B1 → B2 → B3 → B4。

## 待用户拍的设计决策

1. 门禁提案/调整 CLI 粒度: flag-based (`--add-tier`) vs 直接编辑 json + confirm? (建议两者都给)
2. test-plan 文档落 `docs/test-plans/` (随 repo) vs `.dual-agent/test-plans/` (session-local)? (建议 docs/ 备查 + 随 repo)
3. test-report 归档保留策略: 每 round 留 vs 仅留 final consensus round? (建议 final + 失败 round)
4. "提交用户备查": 仅 wecom-push 摘要 vs 也生成 docs/ 索引? (建议都要)
5. B 四个 slice 是否都今晚开做,还是先 B1 走通验证流程?
