> **VENDORED RESEARCH SOURCE** — verbatim copy of miaoji relay spec (bus corr `miaoji-th-stale-oracle-fix-1782037256`).
> Original: `周会分析/docs/testharness-stale-oracle-fix-spec-2026-06-21.md`. Copied into this repo 2026-06-21 for reproducibility (Lisa x7 R1 NEEDS_WORK).

# Testharness 可靠性修复 spec —— stale-oracle / EFFECT 用例不终态 / 无 INFRA-FAIL 终态

> 交付对象:**A 线 testharness 可靠性(super-rll)**,纳入 X 系列。
> 起草:喵吉(周会分析 session)。日期:2026-06-21。
> 动因:margay-standard 全量 e2e 反复重跑同样 2-3 个用例(L1-chat / L1-skill-docx / L1-qa),老板令排查。
> 排查结论:**是 testharness 缺陷**(3 类),margay-standard 已暂停,等本 spec 落地后再续修+测。

---

## 0. 一句话

成功判定(oracle)绑在**易变的后端日志格式**上、EFFECT 用例**结构上无法终态化**、且**无「基建阻塞」终态与重试上限** —— 三者叠加,使任何采不到证据的用例都呈现为「非 PASS」并被无限手动重跑。这是 X 系列「oracle/gate 可靠性」要根治的类别。

## 1. 现场与证据(margay-standard `tools/e2e/`,bespoke harness)

实际现象:`run-batch.mjs` 每用例只跑一次、无内部循环(`run-batch.mjs:44-50`);「重复跑」是 margay-standard 的 Ralph **手动反复重跑**,因为 3 个用例里 2 个到不了干净终态。

### 缺陷 D1 —— artifact 定位 oracle 绑死易变后端日志(主因)
- harness 用「grep 后端 `"subtype":"init"` 日志行里的 `"cwd"` → 在该目录 `find` 产物」定位生成的 docx/pptx:
  - `runner.mjs:363-364`(pptx 轮询)、`runner.mjs:373-374`、`runner.mjs:507-509`、`runner.mjs:521-522`(通用 artifact 用例)。
- **硬证据**:最近 3 次运行日志 `subtype:init`=0、`cwd:`=0 行(新版后端只剩 20B stderr / 8 行 stdout)。重构后端**改了/去掉**该 init 行 → `cwd` 正则取空 → `findArtifact('')` 返回空 → **文件真生成也判「未找到」** → 无法判定 → 重跑。
- **本质**:oracle 该绑 **harness 自己掌控的 workspace 路径**(harness 自己 spawn 会话/设定 cwd),而非从后端日志反推。

### 缺陷 D2 —— EFFECT 用例停在非终态 PENDING_JUDGING,第二阶段没接线
- capture-only EFFECT 用例(L1-qa C5-live、skill-docx、skill-pptx)被故意停在 `final_verdict='PENDING_JUDGING'`(`runner.mjs:741-743`,Architecture A:延后给 live judge panel)。
- 但 runner 对任何 ≠PASS 一律 `exit 1`(`runner.mjs:758`),且**无人自动召集 judge panel** —— `decideFinalVerdict`(`judgepanel.mjs`)从不被 runner 调用。
- 结果:除非 agent 每次手动跑判定,这些用例**结构上跑不完** → 永远非 PASS → 重跑。

### 缺陷 D3 —— 无重试上限 / 无 INFRA-FAIL 终态 + 超时过短
- `run-batch.mjs` 与 `runner.mjs` 都**不区分**「测试真失败」与「harness 采不到证据(无产物路径/超时)」,两者都呈现非 PASS,且无「停止重试、基建阻塞/越界」信号 → 无限重跑同 2-3 个。
- 默认每用例超时 5min(`run-batch.mjs:13`)< docx OOXML skill 真实运行(实测 5.67min 未完)→ TIMEOUT,和「真挂」不可区分。
- margay-standard 该 slice negative-scope 明确红线「不改/不测 CCL 内部实现」—— 慢 docx skill **本就越界**,但 harness **无法表达「越界/基建阻塞」**,只能当失败 churn。

> L1-chat 是确定性、稳定绿(15s),只是每 batch 陪跑被连带重跑。

## 2. X 系列要补的可靠性保证(请 A 线判定落点:新 X7 或并入 X2/X5/X6)

| # | 保证 | 验收 oracle(anti-vacuous) |
|---|---|---|
| R1 **oracle 不得绑易变外部格式** | 产物/工作区定位走 harness 掌控的路径(spawn 时已知/注入的 workspace),不得 grep 被测系统的日志格式来反推路径 | negative control:把后端 init 日志行改名/删除,产物判定**仍**正确(不因日志变更而 false-negative) |
| R2 **每个用例必有终态化路径** | 任何用例从单次 run 出发,必能到达 PASS/FAIL/INFRA-FAIL/INCONCLUSIVE 之一;PENDING 必须有 owner+自动推进或超时降级 | negative control:不接 live judge 单跑一遍,EFFECT 用例**不得**停在永久 PENDING |
| R3 **INFRA-FAIL 与 test-FAIL 分流 + 重试上限** | 采不到证据(无 artifact 路径/超时/被测越界)归 INFRA-FAIL,与「测试真失败」分开计数;每用例 attempt cap,超限即终态 INFRA-FAIL,停止重跑 | negative control:制造一次「产物路径取不到」,harness 在 ≤N 次内给 INFRA-FAIL 终态,**不**无限重试 |
| R4 **out-of-scope 可表达** | 允许用例声明「依赖越界子系统(如 CCL skill 内部)」→ 越界导致的失败标 OUT-OF-SCOPE,不计入红 | 标 OOS 的用例失败不污染 pass 率,且报告显式列出 |

## 3. margay-standard 侧待 A 线落地后自行采纳的即时修(归 margay-standard Ralph,现暂停)
1. artifact 定位改用 harness 掌控的 workspace 路径,弃 `"cwd"` 日志正则(改 `runner.mjs:363-374/507-522`)。
2. EFFECT 用例加终态化:单跑给 INCONCLUSIVE 或就地调用 judge panel,不留永久 PENDING(改 `runner.mjs:741-743`)。
3. 加 attempt cap + INFRA-FAIL/OUT-OF-SCOPE 终态;docx skill 类超时调大或标 OOS(改 `run-batch.mjs:13` + 终态枚举)。

## 4. 协同
- margay-standard:**已暂停**,等本 spec 经 A 线落地(给出 R1-R4 的范式/校验)后,再续其 e2e 修复+全测。
- A 线(super-rll):请判定 R1-R4 的 X 落点与排期,回 bus-outbox。
- 关键路径:这阻塞 margay 大版本升级的可信全测(D 线 margay 升级吃 A 线可靠 QA)。
