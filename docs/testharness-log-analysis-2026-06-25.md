# testharness-log.zip 分析 (2026-06-25)

> 来源:`super-rll/testharness-log.zip`(642KB)→ 解压是 **margay 机** session `margay-version-upgrade-purge-auto` 的 `.dual-agent/` 快照(385 文件;机器 user=apple,path=`/Users/apple/rll`)。
> session 跑 margay e2e 测试 harness(`tools/e2e/runner.mjs` + `cases.registry.mjs`,63 cases / 47 implemented),phases:fakes → a0-e2e → a1-e2e → perf-fault → upgrade-nightly → version-upgrade。
> 目的:诊断 testharness 测试过程碰到的问题 + 修可修部分。

## 分类:基础设施问题(super-rll 共享 harness,**可修**)vs 测试设计问题(margay 业务码,**不碰**,仅报告)

---

## A. 基础设施问题(super-rll/cli + build-release.sh,可修)

### P1 — dist mtime = 1985-10-26(stale-artifact 时间戳)
- **证据**:`reliability-hook-diagnostic.log` 全部 entry `"dist_commands_mtime":"1985-10-26T08:15:00.000Z"`。
- **根因**:tarball(`rll-release-vX.tar.gz`)解压不保留 mtime → dist 文件落地为 epoch-ish 1985。`build-release.sh` 打包/`install.sh` 解包均未 `touch` dist。
- **影响**:目前 `agent-reliability.ts:350` 用的是 `step.txt` mtime(非 dist),故 1985 **当前仅被记录、未用于门禁判定**(低影响)。但任何"dist 比 src 旧 → stale/rebuild"类逻辑会被它永久触发。
- **修法**:`install.sh` 解包后 `find <dist> -exec touch {} +`(或 `tar` 用保留 mtime + 打包时 `touch`);或 reliability/freshness 判定显式忽略绝对 mtime、只用相对 source-vs-dist 且容忍 1985 sentinel。**优先级:低**(目前不破坏),但廉价、防未来踩。

### P2 — watcher pipe-pane rebuild thrash(**最高频**)
- **证据**:`watcher.log` 1076× `Pipe-pane appears dead (pane active but log stale), rebuilding`,772 stale / 772 dead;backoff(`5 rebuild attempts → suppress 60s`)反复触发但不 recover。本机当前 session 也 YELLOW(28/100 rebuild)。
- **根因**:watcher v5 检测 `pane_changed && !log_grew`(`commands.ts:12450` 附近)→ 判 pipe-pane 死 → rebuild。**假阳性**:TUI 重绘(spinner / 状态行 / token 计数刷新)让 capture-pane diff 显示"变了",但这些重绘不进 pipe-pane 的 stdout log(log 不长)→ 永远 `pane_changed && !log_grew` → 无限 rebuild+backoff 循环。rebuild 不 recover 因为"变化"只是屏幕重绘、不是丢 stdout。
- **影响**:watcher 持续 churn、log 噪声淹没真信号、CPU 浪费;且这种 churn 与之前的 watcher 崩溃/误杀类问题同源(进程压力)。
- **修法**(super-rll watcher 脚本):区分"pane 安静但活着"(TUI 重绘 / agent 思考中)与"pipe-pane 真断"。候选:(a) 仅当 capture-pane 显示**裸 shell 提示符**(agent 真退出)才判死,不靠 `!log_grew`;(b) rebuild 后验证 log 真的恢复增长再清 streak,否则升级到"不再 rebuild、只告警";(c) 提高 log-stale 判定窗口 + 要求连续 N 次裸 shell。**优先级:高**(最高频、影响所有 session 含飞书"稳定可靠")。

### P3 — reliability-hook 触发滞后(最多 32 分钟)
- **证据**:`reliability-hook-diagnostic.log`:`commands_module_load_at` → `hook_fired_at` 最大差 32min(13:04:17 → 13:36:10),多条 1-2min。
- **根因**:hook 在 agent session 启动/某事件后 fire;滞后 = agent session 本身慢启动 / 卡住(与 P4 Lisa STUCK 同源:agent 长时间无响应)。非 hook 自身 bug,是上游 agent 卡。
- **修法**:与 P4 合并看 — 根因是 agent(Claude session)长时间无进展。缓解:lisa-watchdog(§153)已有;可考虑更早的 stuck 探测 + 自动 nudge。**优先级:中**。

### P4 — Lisa STUCK 30min × 3
- **证据**:`watcher.log` 3× `STUCK: Lisa has not responded for ~1806s. Manual intervention needed.`(§153 阈值 1800s)。
- **根因**:Lisa agent session 真卡了 30min(API 延迟 / 长 context / 卡在某步)。watcher 正确探测并告警(机制 work)。
- **修法**:机制已对(告警触发)。改善方向:STUCK 时除告警外自动 recovery(restart Lisa pane / nudge),减少"等人工"。**优先级:中**。

---

## B. 测试设计问题(margay `tools/e2e/`,**不修**,仅报告给 margay)

### T1 — 大批 E2E 环境阻塞(C5-C49 pending ACP backend)
- **证据**:`review.md` R27 "C5-C49 chat-based E2E rows 是 environment-blocked pending ACP backend provisioning";`.rll/PLAN.md:178` 标 BLOCKED。
- **性质**:E2E 真跑需 ACP backend,未 provision → 大半 chat-E2E 跑不了,只能 doc-as-blocked。**margay 测试环境依赖问题**,非 harness bug。

### T2 — blocked C-row ID 与 diagnostic probe 碰撞(已在 margay 侧 R26/R27 修)
- **证据**:`review.md` R26/R27:blocked C-row runner ID 经 NODE_SPECS/diagnostic 仍可 dispatch → 覆盖率 overclaim。margay 已分离成 `diagnostic-ccl-*` 非计数 ID。
- **性质**:margay registry 设计问题,margay 已自修。

### T3 — skill 行 registered 但未实现 / "unknown case"
- **证据**:`runner.mjs --only skill-academic-paper-search` / `L1-multiturn` → exit 1 "unknown case";CCL_DISPATCHED_SKILLS 缺失,skill 行 impl pending。
- **性质**:margay 测试覆盖缺口(registered≠implemented)。报告 margay。

### T4 — 同 case 反复重跑(C1 ×25,C2/C3 ×十几)
- **证据**:`harness-results/` C1 有 ~25 个时间戳结果(06-23→06-25),C2/C3 类似。
- **根因**:每次 session 重启(reliability-hook fire 30 次)+ post-consensus cascade 重跑 smoke/unit。部分是正常多轮回归,部分是 watcher 重启 churn(P2/P4)放大的重复。**与 A 类基础设施 churn 交叉**。

---

## 结论 + 行动

**super-rll 可修(优先级)**:
1. **P2 pipe-pane thrash(高)** — watcher 假阳性 rebuild,影响所有 session 稳定性(含飞书"上线稳定可靠")。
2. P1 dist mtime(低,廉价防未来) — install.sh touch dist。
3. P3/P4 agent-stuck recovery(中) — STUCK 自动缓解。

**margay 侧(仅报告,不碰其码)**:T1 ACP backend provisioning、T3 skill 未实现;T2 已自修。

**执行**:P1-P4 修复将作为 super-rll 新 sub-slice(`testharness-reliability-fixes`),在 feishu-inbound-to-ralph CONSENSUS 后开,走完整 TDD 门禁。margay 侧 T1/T3 经 bus / issue 报告给 margay owner。
