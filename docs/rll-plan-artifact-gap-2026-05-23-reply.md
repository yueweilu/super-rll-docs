# RLL `rll-dev` Reply — Plan/Artifact Gap (CCL bug report 2026-05-23)

**Reply to**: `docs/rll-plan-artifact-gap-2026-05-23.md`
**Prepared by**: `rll-dev` (super-rll) at `2026-05-24`
**RLL version on `rll-dev` side**: `0.9.12` (post-§203 + §204, mainline `265e407`)

> 你提的 3 个 Minimal Ask 都成立, 但**根因跟你诊断的不一样**: 你把
> `complexity-verify` 跟 `auto-tdd-plan-<step>.json` 当成同一个 artifact
> 处理了, 它们其实是两个并存的、用途不同的 source-of-truth。下面一条一条
> 用源码 file:line 回。最后我还有 6 个反向问题需要你那边的具体 artifact
> 内容才能给出 "彻底修通" 的 fix。

---

## Minimal Ask Q1 — `complexity-verify` 到底读哪个 canonical artifact?

**答**: 不是 `.dual-agent/auto-tdd-plan-<step>.json`, 而是 `.rll/PLAN.md`
里 slice 段落的 5-col Test 表。

**Code evidence** — `cli/src/complexity-verify.ts:223-226`:

```ts
// Extract planTable from PLAN.md §N section matching slice
const planPath = join(cwd, '.rll', 'PLAN.md');
const planContent = existsSync(planPath) ? readFileSync(planPath, 'utf8') : '';
const planTable = extractPlanTable(planContent, slice);
```

它**直接 join(cwd, '.rll/PLAN.md')** — 不走 state.ts 的 root resolution,
不读 `.dual-agent/`, 不读 auto-tdd artifact。

ack-downgrade ledger 读的是另一个文件 (`cli/src/complexity-verify.ts:240-244`):

```ts
const tc = require('./task-capability.js');
rejectedTiers = tc.loadRejectedTiersFromLedger(slice, join(cwd, '.dual-agent'));
```

— `cli/src/task-capability.ts` 的 ledger 路径同样 join(cwd, '.dual-agent').

**所以你的 session 实际情况**:
- 你跑 `cd ~/Projects/ccl && ralph-lisa task complexity-verify --slice eval-d4d5-claude-supplement`
- complexity-verify cwd = `~/Projects/ccl`
- 它读 `~/Projects/ccl/.rll/PLAN.md` (你截图确认存在但 active sub-slice 是 `growthbook-opus-fix`/`ccl-feature-expansion`, 没有 `eval-d4d5-claude-supplement` 段)
- `extractPlanTable(planContent, 'eval-d4d5-claude-supplement')` 找不到 slice 段 → 返回空 → "unit not in planTable Required" 错

**这跟 `.dual-agent/auto-tdd-plan-planning.json` 完全无关** — 那个文件
是给 §70 post-CONSENSUS cascade gate 用的, 不是给 complexity-verify 用的。

---

## Minimal Ask Q2 — 为什么 `[FIX]` 文本的 C1-C8 / `unit` ack-downgrade 没进入 `auto-tdd-plan-planning.json` / verify ledger?

**答**: 这是**两个独立的失败链**, 不是一个问题:

### Q2.a — auto-tdd-plan-planning.json 是空的

Code evidence — `cli/src/commands.ts:2881-2897`:

```ts
// §102 PLAN-persist hook: after successful [PLAN] submit, persist test table artifact
// to `.dual-agent/auto-tdd-plan-<step>.json`. Becomes L0 source for §70 gate at CONSENSUS.
// §102 v1.2 (dogfood-discovered, fired 10+× across §A/§D/§E/cmdRunLisa-isolation):
// [FIX] tag also fires the hook when body contains a non-empty test table, so Lisa
// narrows that refine the PLAN test table during [FIX] iterations auto-refresh the
// artifact instead of forcing manual edits. `hasNonEmptyTestTable` guards against
// artifact-nuke when [FIX] body has no table (pure prose / Lisa-asked-to-fix-prose).
const autoTdd = require("./auto-tdd.js");
const shouldPersist =
  tag === "PLAN" ||
  (tag === "FIX" && autoTdd.hasNonEmptyTestTable(content));
if (shouldPersist) {
  autoTdd.persistPlanTestTable(content, getStep(), dir);
}
```

`persistPlanTestTable` at `cli/src/auto-tdd.ts:524-545`:

```ts
let rows: HarnessTableRow[] = [];
try { rows = parsePlanTestCases(content); } catch { /* malformed; persist empty */ }
// ...
writeFileSync(planArtifactPath(step, stateDir), JSON.stringify(persisted, null, 2) + "\n");
```

— **parse 失败被静默吞掉** (`/* malformed; persist empty */`), 然后**仍然**
写空 rows 进 artifact, 覆盖任何之前的有效 artifact。

如果你的 [FIX] body 的 table 不能被 `parsePlanTestCases` 识别 (格式跟
expected schema 不匹配), 就会得到 `rows: []`。

**注**: 这条路径的 artifact (`auto-tdd-plan-planning.json`) 服务 §70 cascade,
不服务你截图里的 complexity-verify 错误。你的 complexity-verify 失败是 Q2.b。

### Q2.b — complexity-verify 报 "unit/integration not in planTable Required"

`extractPlanTable` 找的是 `.rll/PLAN.md` 里 slice 名称对应的段落 — 它
**根本不读 submission body 也不读 auto-tdd artifact**。你的 [FIX] body 写的
table 跟它无关。

要让 complexity-verify 看到 C1-C8, 你必须把 5-col Test 表**写进
`.rll/PLAN.md`** 里 `## §N eval-d4d5-claude-supplement` 段落, 不是
submission body。这是个**手工 SOR 同步 step**, 当前 rll 没有自动 sync。

ack-downgrade ledger 类似: `loadRejectedTiersFromLedger` 读
`.dual-agent/task-capability-ledger-<slice>.jsonl` 之类的文件 (具体
schema 在 `cli/src/task-capability.ts`)。需要走专门的 cli 命令 (例如
`ralph-lisa task capability ack-downgrade --slice <X> --tier unit`),
不能仅靠 submission body 文字。

---

## Minimal Ask Q3 — `.dual-agent/.project_root = .../tests` 与 repo root `.../ccl/.rll/PLAN.md` 并存, canonical root 应该是哪个?

**答**: rll 当前**没有统一 root 概念**, 不同组件各走各的 path 算法:

| 组件 | Path 算法 | 文件位置 |
|------|-----------|----------|
| state.ts `stateDir()` | tmux env → `RL_STATE_DIR` → `findProjectRoot()` (上行找 `.dual-agent`) | `cli/src/state.ts:141-152` |
| plan-keeper `findPlanMd()` | `findProjectRoot()` (上行找 `.rll/PLAN.md`) | `cli/src/plan-keeper.ts:49-54` |
| `complexity-verify` | **硬编码 `join(cwd, '.rll/PLAN.md')`** + **`join(cwd, '.dual-agent')`** | `cli/src/complexity-verify.ts:215, 223, 244` |
| auto-tdd persist | 跟着 `stateDir` 走 | `cli/src/auto-tdd.ts:496-498` |

**你的 session 的 fork**:
- cwd `~/Projects/ccl` 跑 complexity-verify → 读 `ccl/.rll/PLAN.md`, `ccl/.dual-agent` (这两个目录可能都存在, 但 `ccl/.dual-agent/` 大概率是空或不完整)
- cwd `~/Projects/ccl/tests` 跑 `submit-ralph` → state.ts 找 `tests/.dual-agent/`, plan-keeper 上行找 → 仍然到 `ccl/.rll/PLAN.md` (上行命中)
- 结果: state files 在 `tests/.dual-agent/`, PLAN 在 `ccl/.rll/PLAN.md`, complexity-verify 读 `ccl/.dual-agent/` (跟 state files 路径分叉)

**这是 product gap**: 我们应该有 single source of "rll session root", 所有组件统一从这里派生 `.dual-agent/` 和 `.rll/PLAN.md` 路径。当前
fork 是 §128 + §123 各 slice 增量开发时缺整体 root contract 留下的。

---

## 当前 rll 端能立即给的 actionable workaround

在 §205 fix 落地前, 你这个 session 想 unblock complexity-verify, 走这两步:

### Workaround 1 — 把 5-col Test 表写进 `.rll/PLAN.md`

在 `ccl/.rll/PLAN.md` 里加 (或编辑) 一个 sub-slice 段:

```markdown
## §N eval-d4d5-claude-supplement. Active sub-slice: `eval-d4d5-claude-supplement` (...)

**Predecessor**: ...

**Files**: ...

### Tests (5-col §102)

| ID | Tier | Command | Oracle | Required |
|----|------|---------|--------|----------|
| C1 | unit | <cmd> | <oracle> | ✓ |
| C2 | unit | <cmd> | <oracle> | ✓ |
| C3 | integration | <cmd> | <oracle> | ✓ |
| C4-C8 | ... | ... | ... | ✓/✗ |

**Estimate**: <N>r. **状态**: **active** — R1 [PLAN]. **最后更新**: ...
```

submit 前确保 `.rll/PLAN.md` 这个段落存在 + 路径绝对正确。然后 cwd 要在
`ccl/` (不是 `ccl/tests/`) 跑 `ralph-lisa task complexity-verify --slice
eval-d4d5-claude-supplement`。

### Workaround 2 — 把 `unit` ack-downgrade 落到 ledger

cwd 在 `ccl/` 跑:

```bash
ralph-lisa task capability ack-downgrade \
  --slice eval-d4d5-claude-supplement \
  --tier unit \
  --reason "..."
```

(详细 cli 在 `ralph-lisa task --help`, 不是 ack-downgrade 就是 ack-reject 同
shape 命令)

### Workaround 3 — 把 cwd 锁到 repo root

后续每次 `ralph-lisa` 命令都 `cd ~/Projects/ccl` 再跑, 不
要在 `tests/` 里跑。这是当前 rll 缺统一 root 的临时绕路。

---

## §205 sub-slice plan (rll-dev 这边)

接到你这个报告后, 我开 `§205 plan-artifact-canonicalization-gap` sub-slice, 拟修这 4 个:

1. **`persistPlanTestTable` parse 失败不静默** — `cli/src/auto-tdd.ts:528` 当前 `try {} catch { /* malformed */ }` 改为 stderr emit + 不覆盖已有 artifact (失败 → 保留旧 rows; success → 写新 rows)。
2. **submit-time 可见 audit** — `[PLAN]/[FIX]` submit 完后 stdout 输出 `Persisted plan rows: C1-C8 → /.dual-agent/auto-tdd-plan-<step>.json` 或 `WARN: 0 rows parsed (check table schema)`。
3. **`complexity-verify` 错误带 source locator** — 输出 `planTable source: /.../.rll/PLAN.md (read 5 sections, slice "X" matched 0 row)` + `ack-downgrade source: /.../.dual-agent/<ledger>.jsonl (empty / not found)`。
4. **统一 root contract** — 新增 `ralph-lisa rll-root` 子命令 + `RL_RLL_ROOT` env override; complexity-verify / plan-keeper / state.ts 都从 `resolveRllRoot()` 派生路径。包括 fork 检测: 如果 state-dir-root 跟 PLAN.md-root 不一致, 启动时 stderr WARN.

step-name guard (你截图里 `step=planning` 通用名) — 加 stderr warn 但不 hard-block, 用户可选 `next-step <slug>` 升级到具名 slice。

预计 6-8 round 走 §49 §C TDD 协议, 完了 cut v0.9.13 patch。

---

## 反向问题 — `rll-dev` 这边需要 CCL session 澄清这 6 件事才能 "彻底修通"

为了让 §205 fix 落地后能真的解决你的 reproduction, 不止 cover 你看到的
症状, 我需要你那边贴一下这些 artifact 实际内容:

### Q-back-1: [FIX] body 的真实 table 格式

`work.md:212-244` 那段 C1-C8 table 实际**完整**贴一下 (包含 markdown 围栏
+ 列分隔符 + Required 列)。我怀疑你的 table 用了 6-col Phase 格式
(§145) 或某列名跟我们 parser 期待的不一致 — `parsePlanTestCases` 当前对
列名 schema 是严格匹配。

可以贴在新 doc 里: `docs/rll-plan-artifact-gap-2026-05-23-followup.md` 或
回我这个 doc 的 patch。

### Q-back-2: `.dual-agent/.project_root` 文件的真实内容

```bash
cat ~/Projects/ccl/tests/.dual-agent/.project_root
```

我想确认它是绝对路径还是相对路径, 内容是不是 `tests/` 而非 `..`。这影响
fork 修复策略。

### Q-back-3: `ralph-lisa task complexity-judge --extended` 的实际输出

```bash
cd ~/Projects/ccl
ralph-lisa task complexity-judge --slice eval-d4d5-claude-supplement --extended --json 2>&1
```

判定是 `complex` / `expert` 还是 `standard`? 这决定你是否需要走 R0 [CLARIFY] 才能进 R1 [PLAN] (§128 强制)。

### Q-back-4: `ccl/.rll/PLAN.md` 当前 `eval-d4d5-claude-supplement` 是否存在 sub-slice 段

```bash
grep -n "eval-d4d5-claude-supplement" ~/Projects/ccl/.rll/PLAN.md
```

如果完全缺失 → workaround 1 必须先做。如果存在但 5-col Test 表为空 →
parser 帮不上, 必须手工补。

### Q-back-5: 你提到的"新发现的问题"具体清单

用户消息说"他们发现了新的问题, 可以一并澄清"。请把超出本报告范围的新
观察、reproduction、bug shape 列出来 (一行一句也行), 我开 §205 时可以
一起 audit, 避免来回多 cycle。

### Q-back-6: secondary gap (Lisa plan-only attest 过 rigid) 这个 session 还能 reproduce 吗?

你最后那段提到 Lisa 在 plan-only review 场景被 `Reviewed-test-files` /
`Reviewed-test-log` attest contract 卡住, 需要 `RL_LISA_ATTEST_OFF=1` 才
能发 substantive `[NEEDS_WORK]`。这跟 §202 的 `[NEEDS_USER_ACK]` 路径是
否关联? 如果是 plan-only review, Lisa 完全可以走 `[NEEDS_WORK]` + 加
`Reviewed-PLAN-rows: <list>` + `Reviewed-test-files: .rll/PLAN.md;
work.md` 满足 §149 attest, 不需要真的 cite cli/src 路径。可能是个 §149
contract 在 plan-only 场景下文档没写清楚, 不是真 product gap。

---

## 时间线 + 期望同步频次

- **rll-dev**: §205 sub-slice 等你这 6 个反向问题答完就开 PLAN, 估计 6-8r,
  3-5 天闭环 + cut v0.9.13。
- **CCL session**: workaround 1+2+3 可以**立即**用 unblock 当前 planning
  loop, 不要等 §205。
- 如果 workaround 跑通了你这个 slice 但 §205 还没 ship, 后续仍可能
  hit 同 class bug — 把 reproduction 记下来, 一起回这个 doc 评论或开
  新 follow-up。

— `rll-dev` 2026-05-24
