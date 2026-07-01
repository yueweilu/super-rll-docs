# Test-Harness + 测试门禁: 综合现状梳理与落地方案

> **§F testharness-gate-comprehensive-survey-and-plan** — 2026-05-12 research deliverable.
> Research-only doc; impl slice queue at Section 4 (proposed slice IDs).

## Table of Contents
1. [现状梳理](#1-现状梳理) (measurement-based)
2. [4 个 observations](#2-4-个-observations) (O1-O4)
3. [整合架构](#3-整合架构) (dependency graph)
4. [落地 plan](#4-落地-plan) (4 phases / ~57-80r)
5. [Phase 退出判断](#5-phase-退出判断) (dogfood checkpoints)
6. [Risks + 缓解](#6-risks-缓解)
7. [Open questions](#7-open-questions) (Lisa lock)

---

## 1. 现状梳理

**Methodology**: 所有数据 2026-05-12 `rg`/`find`/`wc` 实测. **本节自包含** (Lisa R3 B1): 每个数字附带可复现的 grep/find 命令.

### 1.0 可复现 measurement 命令

```bash
# Test file inventory (1.1)
find cli/src/test -name "*.test.ts" | wc -l                # → 98
find rll-team-platform/server/test -name "*.test.ts" | wc -l  # → 99
find wecom-bot/src/test -name "*.test.ts" | wc -l           # → 24

# Test block count — clarification (Lisa R3 B2):
rg -c '^(\s*)(it|test)\(' cli/src/test/*.test.ts | awk -F: '{s+=$2} END {print s}'   # → 1556 (it/test only)
rg -c '^(\s*)(describe|it|test)\(' cli/src/test/*.test.ts | awk -F: '{s+=$2} END {print s}'  # → 2063 (incl describe suites)
# `node:test` reports 1542 pass + 8 todo = 1550 actual test invocations.
# Use 1556 = grep "it/test" blocks (≈ matches node:test). 2063 includes describe containers.

# L3 functional (exact pattern, Lisa R3 B2)
rg -l "execFileSync\(\s*['\"]node['\"]|spawnSync\(\s*['\"]node['\"]" cli/src/test/*.test.ts | sort -u
# → 7 files (list below 1.2)

# L4 system (exact pattern, Lisa R3 B2)
rg -l "watcher\.sh|cli-pty-daemon\s+(start|attach)|spawnDaemon" cli/src/test/*.test.ts | sort -u
# → 8 files (list below 1.2; 2 are DI-spawn-logic tests not real-spawn per Lisa R4 B2 caveat)

# L5 e2e (real Playwright/chromium/claude API)
rg -l "chromium\.launch\(|real.*Playwright.*execution|real.*claude.*API|real.*codex.*API" cli/src/test/ 2>/dev/null
# → 0 files in src/test/; 1 dedicated runner at cli/test-e2e/run-e2e.ts (324 LOC, spawns real claude+codex)

# Helper duplication (1.3)
rg -c 'mkdtempSync' cli/src/test/*.test.ts | awk -F: '{s+=$2} END {print s}'        # → 260 calls
rg -l 'const prev.*process\.env|saved\[k\] = process\.env|delete process\.env' cli/src/test/ | wc -l   # → 23 files
rg -l 'function snapshot[A-Z]' cli/src/test/ | wc -l                  # → 1 file

# Gate inventory (1.4)
rg -c "§(52|70|78|79|92|102|104|F14)" cli/src/commands.ts             # → 42 refs

# Production DI seam files (1.4)
rg -l "interface.*Opts\b" cli/src/ | grep -v test | wc -l             # → 29 files

# Presets / templates (1.5)
ls cli/templates/presets/*.json | wc -l                               # → 7
ls -d cli/templates/test-*/ | wc -l                                   # → 9
ls cli/templates/roles/*.md | wc -l                                   # → 2
```

### 1.1 测试文件 + 测试块 inventory

| 包 | .test.ts 文件数 | it/test 块数 (measured) |
|----|----------------|------------------------|
| cli/src/test/ | **98** | **1556** |
| rll-team-platform/server/test/ | 99 | (not counted, blocked on parallel grep) |
| wecom-bot/src/test/ | 24 | (not counted) |
| cli/test-e2e/ (dedicated) | 1 (run-e2e.ts, 324 LOC) | runs real claude+codex AI |

**总计**: ~221 test files; cli 主体 1556 个 it/test 块.

### 1.2 测试金字塔分层 (rubric + measured + per-file classification)

**Rubric** (codified, **strongest-tier-wins** to avoid double-counting per Lisa R3 B3):
- **L1 unit**: 无 temp dir + 无 spawn + 无 fastify.listen + 无 DI Opts (pure 调用)
- **L2 in-process integration**: 含 mkdtempSync / DI Opts seam / fastify.listen ephemeral (但不 spawn 真 node CLI)
- **L3 functional**: spawn 真 `node` CLI (execFileSync/spawnSync 真 node + cli/dist or template) — 真 exit code / stdout / state file
- **L4 system**: spawn watcher.sh / cli-pty-daemon / multi-process (spawnDaemon)
- **L5 e2e**: 真 Playwright / chromium / 真 LLM API

**Strongest-tier files (exact, sorted, file-by-file)**:

**L5 (0 files in src/test/)**:
- `cli/src/test/`: 0
- Dedicated runner `cli/test-e2e/run-e2e.ts` (324 LOC, real claude + codex; not part of cli/src/test count)

**L4 (8 files, Lisa R3 B2 + R4 B2 exact)** — `rg -l "watcher\.sh|cli-pty-daemon\s+(start|attach)|spawnDaemon"`:
1. `cli/src/test/auto-engine-wecom-spawn.test.ts`
2. `cli/src/test/cli-start-daemon.test.ts`
3. `cli/src/test/cli.test.ts`
4. `cli/src/test/daemon-spawn.test.ts`
5. `cli/src/test/inbox-wake-tmux.test.ts`
6. `cli/src/test/watcher.test.ts`
7. `cli/src/test/watchdog-restart.test.ts`
8. `cli/src/test/wecom-lifecycle-llm-removal.test.ts`

**Caveat** (per Lisa R4 B2): 部分文件 (auto-engine-wecom-spawn, wecom-lifecycle-llm-removal) 实际是**测 spawn-daemon 代码路径** (via DI), 不**真 spawn**. 严格 L4 (真 spawn daemon 进程) 可能仅 ~4-5 文件; 但 grep pattern 不能用 source-grep 区分意图 vs 实际 spawn, 所以 doc 数 = pattern 输出 = 8.

**L3 (7 files, Lisa R3 B2 exact)** — `rg -l "execFileSync\(\s*['\"]node['\"]|spawnSync\(\s*['\"]node['\"]"`:
1. `cli/src/test/doctor-watcher-health.test.ts`
2. `cli/src/test/preset-closed-loop-dogfood.test.ts`
3. `cli/src/test/preset-show-cli.test.ts`
4. `cli/src/test/preset-submit-integration.test.ts`
5. `cli/src/test/preset-test-auto-stub.test.ts`
6. `cli/src/test/quality-gate.test.ts`
7. `cli/src/test/sandbox.test.ts`

**L2 (≈ 60-65 files, broader heuristic — Lisa R3 B3)** — files NOT in L3/L4/L5 with any of `mkdtempSync` OR `fastify.listen` OR DI Opts (`executeGateImpl|fetchFn|pushFn|harnessFn|cascadeFn`); approximate due to overlapping signals.

**L1 (deduced ≈ 19-23 files)** — remainder = 98 cli test files − 8 L4 − 7 L3 − 0 L5 − 60-65 L2 ≈ 19-23 pure-unit files (R4 B2 update).

**Tier counts (strongest-wins, no double-count per Lisa R3 B3)**:

| Tier | Files | % of cli/src/test (98 total) |
|------|-------|-----------|
| L5 e2e | 0 (src/test only); 1 dedicated runner | 0% |
| L4 system | **8** | ~8% |
| L3 functional | **7** | ~7% |
| L2 in-process integration | ≈ 60-65 (heuristic, overlapping signals) | ~60-65% |
| L1 unit | ≈ 19-23 (deduced remainder) | ~19-23% |

**Hypothesis vs measured**:

| Pre-R2 hypothesis | Measured reality | Delta |
|-------------------|------------------|-------|
| L1 unit ~75% | ~19-23% | **-52%** (大幅 overestimated) |
| L2 DI-integration ~20% | ~60-65% | **+40-45%** (underestimated; vast L2 territory) |
| L3 functional ~5% | ~7% (7 files listed) | +2% |
| L4 system 0% | ~8% (8 files listed; some test-spawn-logic-via-DI not real-spawn) | +8% |
| L5 e2e 0% (in test/) | 0 in test/ + 1 dedicated runner | accurate |

**核心发现**: L1+L2 占绝大多数 (~85-88%); L3 7%; L4 ~8%; L5 几乎 0%. 真 gap 在 L4 扩大 + L5 几乎空白. 注意 L1/L2 是 heuristic 分类 (Lisa R3 B3), 重叠 signal 不算 exact; **不当 phase baseline metric 单独引用**, 仅作 architecture 视角.

### 1.3 helper duplication (asset mgmt 真痛点)

| Pattern | cli/src/test/ 出现 |
|---------|--------------------|
| `mkdtempSync` 调用 | **260 处** (across files) |
| env save/restore (`const prev.*process.env`, `delete process.env`, `saved[k]`) | **23 文件** |
| `snapshotXxx` 自写 helper | 1 文件 (cmd-run-lisa-isolation 的 `snapshotDualAgent`) — 但 conceptually similar tmp-dir cleanup in 23+ files |
| `makeMockTransport` / `MockTransport` interface | 0 (说明 Lisa subprocess mock 没库化) |

**真痛点**: 23 文件各自写 env save/restore + 260 处 mkdtempSync, 显然有大量复制粘贴.

### 1.4 当前 gate 实现 (architecture)

10 gate 实现 entry, 跨 8 个 §IDs (Lisa R3 B4 — rename from "7 层"), 全部在 `cli/src/commands.ts` (42 处 §xx 引用 — `rg -c "§(52|70|78|79|92|102|104|F14)" cli/src/commands.ts` → 42):

| Gate | §ID | file:line | 触发时机 |
|------|-----|-----------|---------|
| Submit-time `runGate` + §52 marker | §52 | `commands.ts:1085-1104` | 每 `[CODE]/[FIX]` submit |
| Post-consensus harness | §70 | `commands.ts:6364-6519 handleMutualCompletion` | mutual CONSENSUS |
| Tier cascade halt-on-fail | §78 | `commands.ts:6428-6444` + `cli/src/test-cascade.ts` | 在 §70 内 |
| Loopback to Ralph on cascade fail | §79 | `commands.ts:6447-6463 + cli/src/loopback.ts` | cascade 失败 |
| Preset auto-invoke | §92 | `commands.ts:1927-2000` + `cli/src/preset/*` | `[CODE]/[FIX]` 含 testHarness config |
| Auto-TDD protocol R1 PLAN | §102 | `commands.ts:1830-1844 + cli/src/policy.ts + cli/src/auto-tdd.ts` | `[PLAN]` submit |
| Auto-TDD R2 §52 marker check | §102 v1.3 | `commands.ts:1099-1108` (today fixed) | `[CODE]/[FIX]` |
| PLAN-persist hook | §102 v1.2 | `commands.ts:2125-2140` (today fixed) | `[PLAN]/[FIX]+table` |
| User-manual gate (opt-in) | §104 | `commands.ts:6480-6510 handleMutualCompletion 集成 + cli/src/user-manual-*.ts` | mutual CONSENSUS w/ config |
| Watcher escalation multi-channel | §F14 | `commands.ts:5696-5777 cmdAgentStuckPush + cli/src/agent-stuck-fanout.ts` | watcher detects stale cursor |

**DI seams** in production: **29 files** have `interface ...Opts` with fn-typed fields. 每个 gate 都被 DI 切开 — 这正是 unit-with-DI 测能覆盖很多 logic 的原因.

### 1.5 当前 preset / template / 资产 inventory

**Bundled presets** (`cli/templates/presets/*.json` — 7):
- cli-cmd.json
- cli-schema.json
- desktop.json
- mobile.json
- platform-server-cmd.json
- plugin.json
- web-ui.json

**Bundled test-* templates** (9 — 比 R1 [FIX] hypothesis 3 多得多):
- test-ai/
- test-cli/
- test-desktop/
- test-miniprogram/
- test-mobile/
- test-security/
- test-server/
- test-visual/
- test-web/

**Role templates** (`cli/templates/roles/*.md` — 2):
- lisa.md
- ralph.md

**Inventory 复用度**: `ralph-lisa init --platform X` 拷贝 templates 进项目, 但**没 lifecycle**: 拷贝后用户改 templates, 不回流; 跨项目 fork 漂移度无监控.

### 1.6 §83 capability matrix 复用

`§83 test-harness-capability-evaluation` 已有 **9 stack × 8 test-type = 72-cell matrix** (✅15 / 🟡16 / 🟠38 / ❌3). Section 1 现状梳理直接复用这个矩阵作为"哪些 cell 已 ship vs 半成品 vs 缺"基线; 不重做.

---

## 2. 4 个 observations

### O1 Missing Middle (unit 满 + e2e 零, 中间缺)

**Measured reality** (per 1.2):
- L1 (~19-23%) + L2 (~60-65%) = **~85-88% 是单元 + 进程内集成** (per Section 1.2 measured)
- L3 (~7%, 7 files listed Section 1.2) — 部分 functional
- L4 (~8%, 8 files listed Section 1.2) — system 局部 (daemon-spawn / cli-start-daemon / watcher / auto-engine-wecom-spawn 等)
- L5 (~0%) — 真 e2e 几乎没有

**Gap 在 L4-L5**, 不是"missing middle" 完全空; 而是 **L4 system + L5 e2e 严重不足**.

**真痛点示例** (今天 dogfood 暴露):
- WezTerm + TMUX env leak (L4 cross-platform 测试缺) — 今天踩坑了
- daemon spawn 默认无 --full-auto (L4 配置默认值测试缺)
- §104 真 Playwright 没跑过 (L5 真打缺) — 用户接 §104 第一个项目会暴露
- 真 claude/codex Lisa subprocess (L5 真 LLM 缺) — §93 R1 B4 dogfood 1 次手工后没自动化

### O2 Compose Agent (rule-based → agent-based)

**现状**: `§91 stack-detect` + `§91 change-type-detect` + `§91 preset-loader` 是 **rule-based** — path pattern → preset key, 静态 7 个 preset.

**Vision**: agent 主动读 codebase + dev-progress + Lisa 历史 narrows → 推理 tier 组合 + oracle 选 + helper 复用.

**Agent 工作流** (per session discussion):
1. 感知 codebase + change scope (R1 Ralph 草案上下文)
2. 选 tier 组合 (compose)
3. 写 plan + 用例
4. 写脚本 (or template)
5. 执行 + 出报告

**现状完成度** (per 1.4 + 1.5):
- 步 1 (感知): rule-based ~70% (stack-detect + change-type-detect)
- 步 2 (compose): 静态 preset ~60% (7 个); 不动态适应
- 步 3 (plan): §102 强制 Ralph 写; §93 Lisa audit; agent 不主动产 ~50%
- 步 4 (scripts): §102 R2 [CODE] Ralph 写; 0 模板生成器 ~40%
- 步 5 (执行+报告): §70 cascade + gate-results.md ~85%

**关键 missing**: 步 2-3 的 agent-active compose layer.

### O3 Asset Management (5 层, 全部缺)

| 层 | 应有 | 现状 |
|----|------|------|
| L1 共享 test-lib (helper 库) | `cli/test-lib/index.ts` 导出 tempProject / withClearedEnv / snapshotDualAgent / makeMockTransport / startTestServer 等 | ❌ 没; 23 文件 + 260 mkdtempSync 各写各的 |
| L2 oracle catalog | `docs/test-oracle-catalog.md` 常见 oracle pattern 库 | ❌ 没; 散落在各 PLAN.md |
| L3 test corpus | `~/.rll/test-corpus/` 累积过的测试设计 | ❌ 没; 跨 session 不可查询 |
| L4 template lifecycle | `ralph-lisa test-template list/update/diff/reuse` 管 fork 漂移 | ❌ 没; 拷贝即 fork |
| L5 asset tracking | 每 slice 记录用了哪些 asset (version + key) | ❌ 没 |

**真痛点 (今天 evidence)**: 我一天写 5+ 个 `withClearedEnv` 类似 helper, 每个 50-150 LOC, 累计数百 LOC duplicated.

### O4 Methodology Explicit (今天 47 round Lisa narrow 隐式教学 → 抽显)

**今天 Lisa 教 Ralph 的 5-step 方法论** (抽出自 6 slices 47 rounds Lisa narrows):

**Step 1 — 风险面分析**:
- 环境状态隔离边界 (cmdRunLisa R9: stateDir(cwd) 绕 env)
- 认证/权限边界 (F3 R1 B2: Bearer cross-team leak)
- 集成边界 (§104 R8 B17: exported≠wired dead code)
- 第三方契约边界 (§104 R8 B18: 发明的 --reporter=json:path 语法)
- 路径解析边界 (F14 R6 B1: path.dirname ≠ project root)

→ 规则: 先列**边界**, 每边界至少 1 个 oracle.

**Step 2 — 假阳辨别**:
- vacuous-pass (T3: production missing → TypeError → 假通过)
- substring 太松 (M5: 允许发明语法 pass)
- 结构化 assert 缺失 (W6: 只数 call count 不查 argv)
- mock 假阳 (M6 stub Playwright 真 chromium 漏)

→ 规则: 每 assert 问 "production 有 bug 这测试会假通过吗"

**Step 3 — Hermeticity**:
- env 污染 (F14 R4 B1: 4 个 channel env vars 没 save/restore)
- 共享 fs 污染 (T2: 真 super-rll/.dual-agent 被并发活动改)
- 真打副作用 (M10 真 spawn Playwright)

→ 规则: 每测试明确输入空间边界 + save/restore

**Step 4 — 契约 vs 实现**:
- contract 改时 pin 必须同步 (§52 C3 pin update with v1.3 fix)
- 测试用 API 必须真存在 (M5 invented printFn seam)
- shape 校验必须遍历嵌套 (F3 B7 byType inner 漏检)

→ 规则: 每 API/seam grep 源码确认真存在 + 真签名

**Step 5 — 资产复用**:
- 5 次 withClearedEnv 重写
- 多次 snapshot/tempDir 重写

→ 规则: 写前 grep 类似 helper, 复用/提取

**Step 6 — 跨 slice 一致性 check** (Lisa R6 lock 6):
- prior Lisa locks 是否还成立 (本 plan 引用的契约/seam/canonical-path 没被悄改)
- SOR (PLAN.md / canonical row / runtime task.md) 三者同步
- artifact currency (auto-tdd-plan-*.json 反映当前 plan rows/escape)

→ 规则: PLAN R1 写之前 + Lisa narrow 落地之后, grep history.md 找过去同文件/同 surface 的 lock, 主动维持; 不让本 slice 改动 silently 推翻之前定的约束 (F14 / §102 / §104 / cmdRunLisa 都被这点反复 narrow 过).

---

## 3. 整合架构

```
            §112 test-strategist-agent (vision)
                       ↑ 必须基于
              +--------+--------+
              ↓                 ↓
   methodology playbook   asset library
   (O4 § 5-step doc)      (O3 L1+L2+L3)
              ↓                 ↓
              +--------+--------+
                       ↓
              missing middle 覆盖
              (O1 L4 + L5 真打)

各 obs 之间依赖:
- O3 (资产) 是 O2 (agent) 的输入材料
- O4 (方法论) 是 O2 (agent) 的决策框架
- O1 (覆盖层) 与 O2-O4 独立但同等优先 (无 L4-L5 即使 agent 完美也只在 mock 上聪明)
```

**关键洞察**: 4 个 obs 不能孤立做, 必须有先后. O3 + O4 是 O2 的前置; O1 跟 O2-O4 平行做.

---

## 4. 落地 plan (4 phases)

### Slice ID provenance (per Lisa R1 B4)

| 状态 | Slice IDs |
|------|----------|
| Active (本 slice) | §F testharness-gate-comprehensive-survey-and-plan |
| Existing queued | §103 telemetry privacy opt-in |
| **New proposed** | §106 §107 §109 §110 §112 §116 §117 §118 §119 §120 |

**所有 new proposed ID 锁定**: 等本 plan mutual CONSENSUS 后, 每个 slice 自己 R1 [PLAN] 时再 finalize 设计 + 确认 ID (§105 unused, §106+ 顺延).

### Phase 1 — 资产基础 + 方法论 (估 13-18r)

| Slice | 内容 | 估时 |
|-------|------|------|
| **§116 cli-test-lib-extraction** | NEW `cli/test-lib/index.ts` 导出: `tempProject(opts)` + `withClearedEnv(keys, fn)` + `snapshotDualAgent(dir)` + `makeMockTransport(opts)` + `startTestServer()` (复用现有) + `seedTeam/issueToken` (复用现有) — 从今天 5+ 个重复 helper 提取 | 5-7r |
| **§117 oracle-catalog** | NEW `docs/test-oracle-catalog.md` — per-tier 常见 oracle pattern 库 (smoke "page loads + no console err" / e2e "API 200 + schema match" / functional "exit 0 + state file equal" / perf "p95<500ms@rps50" / security "401 on missing auth"). Ralph 写 PLAN 时引用 | 3-5r |
| **§120 test-plan-methodology-doc** | NEW `docs/test-plan-methodology.md` — 把 O4 5-step 显式化; 嵌入 `cli/templates/roles/{ralph,lisa}.md` 当自检 list | 4-6r |

**Phase 1 完成后解锁**: 后续每 slice 写 helper 减 80%; Ralph R1 PLAN 自带 5-step 自检; agent 后续有 catalog 可查.

### Phase 2 — Missing Middle (估 14-20r)

| Slice | 内容 | 估时 |
|-------|------|------|
| **§109 daemon-spawn-env-hygiene-fix** | 修今天 WezTerm 踩的 TMUX env leak; `cli-pty-daemon start` 默认 `env -u TMUX RL_STATE_DIR=<resolved>`; 加 L4 test 1-2 个 spawn 真 daemon + 验环境 | 3-5r |
| **§110 cli-functional-spawn-tests** | NEW L3 test 套 — `execFileSync(node, ['cli/dist/cli.js', 'submit-ralph', '--file', ...])` 等 15-20 关键 cmd; 验真 exit code + stdout + state effects | 5-7r |
| **§107 watcher-bash-e2e** | NEW L4 — spawn 真 `cli/templates/watcher.sh` + 模拟 turn flip + 验 wake fires + escalation triggers | 6-10r |

**Phase 2 完成后解锁**: cross-platform 类 bug (TMUX leak, path encoding) 有 e2e 抓; functional spawn 类 bug (CLI args, exit codes) 有自动化覆盖.

### Phase 3 — Corpus + Agent (估 16-20r)

| Slice | 内容 | 估时 |
|-------|------|------|
| **§118 test-corpus** | NEW `~/.rll/test-corpus/<slice-slug>.json` 累积 (PLAN section + oracle 选 + helper 用 + Lisa narrows + 最终通过条件); `ralph-lisa test-corpus query <intent>` 拉取过去类似 design | 6-8r |
| **§112 test-strategist-agent** | NEW agent (`cli/templates/roles/test-strategist.md` system prompt + `ralph-lisa strategize-tests <step>` cmd) — 用 L1+L2+L3+methodology doc 当工作材料; emit R1 PLAN 测试 table 草稿 + 标 risk + 推荐 helper 复用 | 10-12r |

**Phase 3 完成后解锁**: 真 agent compose; Ralph R1 PLAN 从手工写 → agent 草稿 + Ralph 改; trust-coding 闭环关键最后一块.

### Phase 4 — Customer-ship readiness (估 14-22r)

| Slice | 内容 | 估时 | 0.7.0 状态 (Lisa R6 lock 7) |
|-------|------|------|---------------------------|
| **§103 telemetry privacy opt-in** | (existing queued) — `ralph-lisa init --telemetry <yes/no/ask>` + 第一次 telemetry post 前 console prompt + `--telemetry-opt-out` flag | 6-10r | **MUST-DO** (release blocker) |
| **§106 playwright-real-e2e-test** | NEW L5 — 装 Playwright + 跑 1 真 page test + §104 manual.md 真出验证 | 5-8r | **MUST-DO** (release blocker; 等 Phase 2 evidence 后开) |
| **§119 template-lifecycle** | NEW `ralph-lisa test-template diff/update/reuse` — 检测 fork 漂移 + 拉新版本 + reuse 已有 | 3-5r | conditional (等 Phase 2 evidence; customer pilot 依赖才 blocker) |

**Phase 4 完成后**: customer-ship-ready 级别 — 隐私合规 + 真 e2e + asset lifecycle 完整.

**注 (Lisa R6 lock 7)**: §109 (Phase 2) 也是 0.7.0 MUST-DO (daemon/env hygiene). 0.7.0 release-blocker = **§103 + §106 + §109** 三件套. §116/§117/§120 (Phase 1) 算"internal leverage" — 时间够就做, 不 block 0.7.0 unless customer pilot 显示依赖.

### Total: ~57-80 rounds across 4 phases

---

## 5. Phase 退出判断

每 phase 退出有 dogfood checkpoint, 不靠主观觉得"差不多":

| Phase | 退出 checkpoint (机械可验) | Failure 触发 |
|-------|---------------------------|--------------|
| 1 | 跑 1 个真 slice 用 cli/test-lib + methodology; **测重复 helper LOC 降幅 ≥ 60%** (vs 历史 baseline) | <60% → §116 helper 库 scope 不够, 补 |
| 2 | WezTerm Windows / WezTerm macOS / iTerm + tmux 三套环境跑 cli/test-e2e/run-e2e.ts; 跨平台 0 regression | 任 1 环境 fail → §109/§107 漏覆盖, 补 L4 |
| 3 | agent 真为 1 个新 slice 推荐 tier; Ralph 跑通 mutual CONSENSUS; **Lisa narrow 数 vs baseline 降 ≥ 30%** | <30% → §112 agent 没产生杠杆, methodology doc 或 corpus 不够丰富 |
| 4 | customer pilot 试用 0.7.0 — 0 隐私投诉 + 0 跨平台 install fail + 全 §104 manual.md 真出 | 任 1 → 回 Phase 2-3 补 |

---

## 6. Risks + 缓解

| Risk | 缓解 |
|------|------|
| 资产库 over-design (写一堆没人用的 helper) | 提取从今天 session **真用过 ≥3 次** 的 helper, 不预测未来 |
| methodology doc 过厚没人读 | 嵌进 ralph.md / lisa.md role system prompt (≤200 行); 单独 doc 当 reference |
| agent compose 跑偏 (推荐烂 tier 组合) | 先 advisor 模式 (Ralph 看 agent 建议 + 自己决定); 待 trust-coding loop 稳了再升 decider |
| 跨 slice asset version 管理复杂 | in-tree (`cli/test-lib/`) 不发独立 npm 包; 跟 cli release 同步; 不引入 lockfile 复杂 |
| Phase 顺序 lock 太严, 阻塞并行 | Per Lisa R6 lock 5: Phase 1 + Phase 2 部分并行 (asset 提取 + L4 测试无依赖); Phase 3 等"足够 Phase 1 assets + ≥1 Phase 2 L4/L5 dogfood"; Phase 4 §103 privacy 可独立, §106/§119 等 Phase 2 evidence 澄清 e2e/template gap |
| 不修今天 WezTerm TMUX bug 长期发酵 | §109 在 Phase 2 最早做, 估 3-5r 短小 |

---

## 7. Open questions (Lisa lock 必答)

### 7.1 Lisa decisions (R6 lock)

All 7 open questions below have been locked by Lisa R6 [PASS]. **These are the authoritative answers** — 我推荐 / 等 Lisa 拍 段保留只作历史 (R1-R5 design intent).

1. **Asset 库位置**: **in-tree `cli/test-lib/` for v1**. 不发独立 npm package. 等 ≥2 个项目消费它再开 extraction option.

2. **Methodology 形式**: **doc + role-template 两者都**. Role template embedded section 保持 compact + actionable; 完整 examples 放 `docs/test-plan-methodology.md`.

3. **Corpus 存储位置**: **用户级 `~/.rll/test-corpus/` for v1**. 显式隐私控制: **local-only by default, no sync/upload**. `ralph-lisa test-corpus export --redact` 留给未来 opt-in slice (不在 §118 v1 scope).

4. **Agent compose 触发时机**: **manual `ralph-lisa strategize-tests <step>` first**. 不在每个 R1 PLAN 自动触发 — 等 advisor 有 dogfood evidence + latency/cost bound 后再开 auto-trigger 当 opt-in config.

5. **Phase 严格顺序**: **Phase 1 + Phase 2 部分并行**; Phase 3 depends on "enough Phase 1 assets + ≥1 Phase 2 L4/L5 dogfood"; Phase 4 §103 privacy independent, §106/§119 等 Phase 2 evidence 澄清 e2e/template gap.

6. **Methodology 5 step 完备**: 5 step 是 good v1. **加 1 step**: "**cross-slice consistency check** — does this plan preserve prior Lisa locks / SOR / artifact currency?" (本要点跨 F14, §102, §104, cmdRunLisa 反复 narrow 过). 已落 Section 2 O4 Step 6.

7. **超 ship 关键路径**: **0.7.0 MUST-DO** = **§103 privacy + §109 daemon/env hygiene + §106 real Playwright/e2e** (release-blocker 三件套). §116/§117/§120 = internal leverage — 时间够就做, 不算 release blocker unless customer pilot 显示依赖. 已落 Section 4 Phase 4 table 的 "0.7.0 状态" 列.

### 7.2 R1-R5 design defaults (历史 — Lisa R6 lock 已覆盖)

(保留下方原文当 design intent 历史; runtime 决策 supersede by 7.1.)

1. **Asset 库位置**: in-tree `cli/test-lib/` (无 npm 发布) vs 独立 npm package `@yw1975/rll-test-lib`?
   - 我推荐: in-tree (复杂度低 + 跟 cli release 同步; 跨项目用户可手工 vendor) → **Lisa lock: in-tree v1, no npm package**

2. **Methodology 形式**: 单独 `docs/test-plan-methodology.md` / 嵌入 `cli/templates/roles/ralph.md` + `lisa.md` / 两者都?
   - 我推荐: 两者都 → **Lisa lock: both (doc full + role compact)**

3. **Corpus 存储位置**: 用户级 `~/.rll/test-corpus/` (跨项目) / 项目级 `.rll/test-corpus/` (per-project) / 中央 github gist 公共?
   - 我推荐: 用户级 → **Lisa lock: 用户级 + local-only + privacy controls**

4. **Agent compose 触发时机**: R1 [PLAN] 自动触发 / Ralph 手动 `ralph-lisa strategize-tests` / 两都?
   - 我推荐: 两都 → **Lisa lock: manual-first; auto 等 dogfood evidence**

5. **Phase 严格顺序**: Phase 1 → 2 → 3 → 4 严格串 vs 部分并行?
   - 我推荐: 部分并行 → **Lisa lock: Phase 1+2 partial parallel; Phase 3 等 enough Phase 1 + ≥1 Phase 2 L4/L5; Phase 4 §103 independent**

6. **Methodology 5 step 完备**: 5 step 够吗?
   - 等 Lisa 拍 → **Lisa lock: 加 cross-slice consistency check 第 6 step**

7. **超 ship 关键路径**: 0.7.0 前必做 vs 可选?
   - 我推荐必做: §109 + §103 + §106 → **Lisa lock: §103 + §109 + §106 (MUST-DO); §116/§117/§120 internal leverage**

---

## 附录: 今天 47 round Lisa narrow — index into history (per Lisa R3 B4)

**Scope clarification**: 这是 history.md 的**索引** + 每个narrow class 的 1-2 个**真例样本** (file:line + 摘要内容), 不是 raw dump. §120 (methodology doc) 真做时**直接 grep history.md + per-slice closeout commit message** 抽 narrow content.

**Index** (跳跃 super-rll/.dual-agent/history.md):

| Slice (rounds) | Lisa narrow rounds + Class | 真例 (file:line; 摘要) |
|----------------|---------------------------|------------------------|
| §cmdRunLisa-isolation (11) | R1 narrow 1-5 (architectural lock); R2 B1-B5 (test fidelity); R3 B1-B4 (artifact sync); R4 B1 (scope-line stale); R6 B1-B4 (broad snapshot + B2 vacuous-pass + B3 tmp snapshot + B4 semantic doc); R7 B1 (mock contract); R9 B1-B3 (stateDir(cwd) bypass); R10 B1 (count drift) | 真例: R9 B1 — `cli/src/commands.ts:7385-7388` 代码 `const dir = deps.stateDirOverride ?? stateDir(effectiveCwd)` 调 `stateDir(projectDir)` 绕过 env-router; 修法用 bare `stateDir()` (`cli/src/state.ts:132-155`). |
| §102 v1.2+v1.3 (6) | R1 B1-B4 (SOR + format + escape literal + env-spec); R2 B1-B3 (zero-leak + --file + round.txt); R6 B14-B16 (reporter augment + hierarchy required + exact placeholder) | 真例: R2 B1 — escape-literal trap, body 解释 bug 同时触发 bug 的 regex `\*\*Tests\*\*:\s*none\s*\(`; 修法 dynamic build pattern. |
| §104 closed-loop-screenshot... (10) | R1 B1-B4 (SOR + data-source + cmd builder + path lock); R2 B5-B7 (Option B + reporter path + Playwright JSON shape); R3 B8-B10 (config required + no-copy + unified path); R4 B11-B13 (artifact stale + caseId stale + status stale); R6 B14-B16 (M7 reporter augment + M8 hierarchy + M3 exact defaults); R8 B17-B18 (handleMutualCompletion 没 wire + invented json:path syntax); R9 B19 (mkdir parent) | 真例: R8 B17 — `cli/src/commands.ts:6489` handleMutualCompletion 没调 `maybeRunUserManualGate`; rg 找 caller 只 test references 命中, 0 production. 修法 wire 进 §70 post-cascade path. |
| F3 weekly-digest remote-team (9) | R1 B1-B2 (SOR + cross-team auth leak); R2 B3 (fixture count); R4 B4-B5 (writeFn seam + ephemeral port); R5 B6 (ESM await import); R7 B7-B9 (shape validation + null sentinel + option-looking) | 真例: R1 B2 — `rll-team-platform/server/src/auth.ts:12-39` 不含 admin/scope; 任 team Bearer 跨 team 读 = auth 漏. 修法 `WHERE team_id = identity.team_id` 单 team 锁. |
| F14 watcher 完整 escalation (7) | R1 B1-B3 (orchestration ownership + cooldown layer + config contract); R3 B1 (secret/argv 覆盖); R4 B1 (env hermeticity); R6 B1 (project-root resolution) | 真例: R6 B1 — `cli/src/commands.ts:5718-5728` `path.dirname(dir)` ≠ project root with external `RL_STATE_DIR`; Lisa 真打 manual repro 显示 lark/dingtalk silently 不 fire. 修法 `loadTestConfig(dir)`. |
| docs-0.6.8-review-and-rebuild (4) | R1 B1-B4 (cli/package.json honest + migration wording + i18n stubs); R2 B4 (package-lock drift 5 versions behind) | 真例: R1 B1 — 我说 ".md-only" 但 diff 含 cli/package.json 0.6.7→0.6.8; release-metadata 该 disclose. |

**总计**: ~80 unique Lisa narrows 跨 47 rounds 跨 6 slices. §120 methodology doc 把这 80+ narrow 按 5-step (边界/假阳/hermeticity/契约/复用) 分类, 各 step 选 8-15 真例作 illustrative.
