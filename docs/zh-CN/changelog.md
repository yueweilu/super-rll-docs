[English](../en/changelog.md) | [日本語](../ja/changelog.md) | [中文](../zh-CN/changelog.md)
<!-- Translated from: docs/en/changelog.md -->

# 更新日志

## v0.9.13 (2026-05-25) — 非代码任务 fast-path + session-anchor canonical root (§206 + §207)

**翻译延期** (deferred translation per §143 Lisa R2 B1 lock); 详见英文 [docs/en/changelog.md](../en/changelog.md) v0.9.13 章节. 概要:

解决 CCL D4 retrospective (纯 review 任务卡 14 轮 / 1 小时 / 0 产出) — 让分析/文档/规划任务绕开 TDD 6-artifact 完整礼仪, **同时** 不削弱真正含代码的 slice 的执行强度.

新 cli: `ralph-lisa next-step "slug" --type <review-task|doc-task|process-task|code-task>`. omit `--type` 等价 code-task (完整 TDD/§102/§149/§70/§123 不变).

4-class 文件白名单 + mode-locked 3 条新策略规则 (`task-type-file-mismatch` / `task-type-declaration-mismatch` / `non-code-task-evidence-missing`), `RL_POLICY_MODE=warn` 不能 bypass, 无 `RL_TASK_TYPE_OFF` 环境变量 (trust-boundary, mirroring §202/§205).

新用户文档 `docs/non-coding-task-quickstart.md` (~140 行) — 5 个验收关键词 + 3 个 body skeleton + 中途分类 flip 协议 + 无 opt-out 明示.

13 个测试 C1-C13 (含 Lisa R19 B1 paired regression: review-task 改 `.rll/PLAN.md` 必 block, process-task 改 `.rll/PLAN.md` 必 pass).

§206 (commit `146d5bc`): `state.ts:resolveStateDir()` 不再向上行走父目录; `.dual-agent/.session-anchor` fingerprint JSON 由 `cmdInit` 写入, `cmdStart`/`cmdAuto` 拒绝 silent rebind. 闭 2026-05-23 rll-dev 第 3 次 ack-shape-change.

版本号: §143 规则 1 (additive contract / 新 cli sub-cmd / 默认带 opt-out) → patch 升 0.9.12 → 0.9.13. `--type` 是 opt-in, legacy 项目不写就完全不变.

测试: cli 2375/2375 / wecom-bot 250/250 / cli-e2e 68/68 / quality-gate 5/5 PASS / plan validate 双仓 PASS.

## v0.9.0 (2026-05-17) — testing-gate 全闭环 batch (§149 / §150 / §151 / §154 / §152 / §153)

**翻译延期** (deferred translation per §143 Lisa R2 B1 lock); 详见英文 [docs/en/changelog.md](../en/changelog.md) v0.9.0 章节, 涵盖 §150 smoke-auto-loop / §151 visual-evidence-tier / §154 wecom-push-on-policy-block (PRIORITY 修复 — v0.7.0 §133 默认 block 翻转引起的微信推送静默回归) / §152 project-type-tiers / §153 lisa-watchdog 共 5 slice + 1 hotfix. 新增约 30 个测试 + zero-failure regression baseline. 翻译将在后续 slice 补齐.

## v0.8.0 (2026-05-16) — gate-bypass 修复 bundle

**翻译延期** (deferred translation per §143 Lisa R2 B1 lock); 详见英文 [docs/en/changelog.md](../en/changelog.md) v0.8.0 章节, 涵盖 §141/§133/§137+§134+§144/§145/§139/§138/§140 七步 gate-bypass 修复 + 4 个新 cli 子命令 + 3 项默认行为翻转 (含 opt-out env). 翻译将在后续 slice 补齐.

## v0.7.0 (2026-05-14) — 🎉 milestone 发布

**0.7.0 release-blocker 三件套 (§103+§106+§109 per Lisa R6 lock 7) + trust-coding 机制硬化 §122/§123/§127/§125 全部 mutual CONSENSUS 闭环。** cli 1283→1753 (+470 tests since 0.6.7, 0 regression)。

### Release-blocker 三件套

- **§103 telemetry-privacy-opt-in** (closed R7) — `ralph-lisa init --telemetry yes|no|ask`; 默认 deny 保留; `~/.config/ralph-lisa/telemetry.json`
- **§106 playwright-real-e2e-test** (closed R8) — `@playwright/test ^1.60.0` + 1 真 chromium page test; `npm run test:e2e:web` → 1 passed; §104 manual-gate 已 wire
- **§109 daemon-spawn-env-hygiene-fix** (closed R4) — `DAEMON_SCRUB_KEYS = ['RL_STATE_DIR', 'TMUX', 'TMUX_PANE']` scrub (修 WezTerm TMUX env leak)

### Trust-coding 机制硬化

- **§122 task-capability** — `ralph-lisa task new <slug>` + `task capability ack-user --signature <T>` (R2 [CODE] 前必须); H1+H2 hook; F0 watcher 修复
- **§123 complexity-judge / complexity-verify** — Layer 1 LLM-primary artifact + Layer 2 确定性硬 gate + Layer 3 Lisa rerun; NEW `gate-manifest.json`
- **§127 testharness cleanup discipline** — `tempProject({tmuxSessionName, daemonPids})` mutable handle + SIGTERM→SIGKILL + descendant sweep + zombie-aware liveness; NEW `loadPresetByNameWithDiagnostics`; `residual-cleanup-missing` audit narrow
- **§125 phase-lifecycle-orchestration** — `ralph-lisa phase-gate --enter <id>` cli; allowed transition graph; fail-closed precondition; `.dual-agent/phase-state.json` runtime SOR; `.dual-agent/smoke-results.md` mandatory

Carry-forwards: (17) testharness 设计层必须内置 cleanup discipline; (18) PLAN-phase PASS ≠ end-of-slice CONSENSUS-eligible; (19) test table row IDs 必须用 `C\d+` 前缀。

Migration: 零破坏性变更 — `task`/`phase-gate` subcommand 新增的; gate-manifest.json schema 向后兼容; trust-coding 机制仅在 `task new` 后自动触发。

## v0.6.9 — 跳过 (合并进 0.7.0)

- **§122 task-capability** — `ralph-lisa task new <slug>` + `task capability ack-user --signature <T>`（R2 [CODE] 前必须）; H1+H2 hook 在 task launch 时触发 plan-keeper + recordProgress; F0 watcher review.md/work.md sentinel 探测修复
- **§123 complexity-judge / complexity-verify** — Layer 1 LLM-primary 判断 artifact + Layer 2 确定性硬 gate + Layer 3 Lisa rerun bounded-blocking; NEW `gate-manifest.json` (canonical_tier_ids whitelist + default_baseline + phases)
- **§127 testharness cleanup 内置纪律** — 用户铁律 2026-05-13: testharness 设计层必须内置清残留/孤儿进程。`tempProject({tmuxSessionName, daemonPids})` mutable handle + SIGTERM→500ms→SIGKILL + defensive descendant sweep + zombie-aware liveness; NEW `loadPresetByNameWithDiagnostics`; NEW `residual-cleanup-missing` audit narrow; 4 role-template 更新
- **§125 phase-lifecycle-orchestration** — `ralph-lisa phase-gate --enter <id> [--json]` cli; 受控转移图 (null→design→tests-only→impl→{fix,consensus}); fail-closed 前置条件 (缺 testTiers → block); `.dual-agent/phase-state.json` 运行时 SOR (tracked manifest 永不变更); `.dual-agent/smoke-results.md` mandatory (RL_SMOKE_CMD 缺失时写 SKIPPED-row, 非静默 no-op)
- **§103 telemetry** — `ralph-lisa init --telemetry yes|no|ask` consent flag (默认 deny 保留)

Carry-forwards: (17) testharness 设计层必须内置 cleanup discipline; (18) PLAN-phase PASS ≠ end-of-slice CONSENSUS-eligible; (19) test table row IDs 必须用 `C\d+` 前缀。

Migration: 零破坏性变更 — `task`/`phase-gate` subcommand 是新增的; gate-manifest.json schema 向后兼容; trust-coding 机制仅在 `task new` 后自动触发。

## v0.6.8 (2026-05-12)

§102 协议 gap 修复 — auto-TDD artifact 持久化 + tests-only gate carve-out 现在对 `[FIX]` tag 也生效。2 个 sub-slice 全部 mutual CONSENSUS (17 rounds total, 0 regression), cli 1515→1526 (+11 tests)。详情见 [English changelog](../en/changelog.md#v068-2026-05-12)。

主要变更：
- **§102 v1.2**: Ralph 提交 `[FIX]` + 非空 PLAN 测试 table → artifact JSON 自动 refresh (不再需手工 edit)
- **§102 v1.3**: `[FIX]` tag + §52 marker (`Convention: tests-only / expected-fail (§49 §C)`) → submit gate 走 warn-mode (不再需 `RL_RALPH_GATE=false` workaround)
- **§cmdRunLisa-isolation**: `env -u TMUX RL_STATE_DIR=<tmp> ralph-lisa run-lisa` 现在真正 isolate 写入到 env 指定 dir (修复 §E dogfood-discovered 的 leak 回 repo `.dual-agent` 问题)

迁移：无破坏性变更。所有 v0.6.7 工作流不变；上述 2 个 `[FIX]` carve-out 是 additive；cmdRunLisa 行为只在使用 `RL_STATE_DIR` / tmux state-dir override 时改变 (env override 现在真正生效)。

## v0.6.7 (2026-05-11)

Trust-coding 闭环 §90→§94 — 一夜之间 5 个 sub-slice 全部 mutual CONSENSUS。详情见 [English changelog](../en/changelog.md#v067-2026-05-11)。

主要变更：
- §90 trust-coding-closed-loop-research（设计文档）
- §91 preset 基础设施（stack-detect + cmdTestAuto stub）
- §92 auto-invoke + policy gate
- §93 Lisa 侧 preset audit
- §94 WeCom 协议 P0 强制（whose-turn 自动打印 unread inbox）

cli 测试：1283 → 1415（+132，0 回归）。用户指南：`docs/trust-coding-user-guide.md`。

## v0.4.1

### v0.4.1 新增内容

- `ralph-lisa auto --engine` 现已支持原生 Windows，无需 WSL、tmux 或 bash。
- 新增 `--ui wt`，可在 Windows Terminal 中提供 Ralph / Lisa 双面板视图；如果不在 Windows Terminal 宿主内，会自动回退到 `split`。
- 将 engine-first 架构合并进 `main`，同时保留 TestPro 命令与测试平台工作流。
- 将 CLI 中残留的 POSIX 假设替换为 Node.js 平台 shim，覆盖进程检查、临时目录、URL 探测与命令查找。

## v0.3.x

### v0.3 新增功能

- **`update-task` 命令**：无需重启即可在会话中途更改任务方向。追加到 task.md 以保留历史记录。任务上下文会自动注入到提交内容和 watcher 触发消息中。
- **第 1 轮强制 `[PLAN]`**：Ralph 的第一次提交必须是 `[PLAN]`，让 Lisa 有机会在编码开始前验证理解是否正确。
- **Goal Guardian**：Lisa 现在在每次审查前都会阅读 task.md，并检查方向是否偏离。尽早发现目标偏差的优先级高于代码级审查。
- **事实验证**：Lisa 在声称某些内容"缺失"或"未实现"时，必须提供 `file:line` 证据。
- **Policy 层**：可配置的提交质量检查，支持 `warn`/`block` 模式。
- **Watcher v3**：即发即忘触发、30 秒冷却时间、checkpoint 系统（`RL_CHECKPOINT_ROUNDS`）、崩溃自动重启、可配置日志阈值（`RL_LOG_MAX_MB`）、心跳文件。
- **Deadlock 逃逸**：5 轮内未达成 consensus 时，agent 可以使用 `[OVERRIDE]` 或 `[HANDOFF]`。
- **最小化初始化**：`ralph-lisa init --minimal` 仅创建会话状态（零项目文件）。
- **`doctor` 命令**：使用 `ralph-lisa doctor` 验证所有依赖项。

### 错误修复（v0.3）

- 修复了生成的 `watcher.sh` 中的 case 模式转义问题——JS 模板字面量默默吞掉了 case 模式中的反斜杠，导致 watcher 在自动模式下每次启动时都崩溃循环。
- 修复了 `check-next-step` 的 consensus 逻辑，使其与 `step` 命令行为一致。
- 修复了测试隔离问题：在测试子进程中屏蔽 tmux 环境变量。
- 增强了 watcher 的 send-keys 传递机制，以兼容 TUI agent。

### 未能解决的问题

分享失败与分享成果同样重要：

- **Agent 崩溃尚无自动恢复机制。** 一旦 agent 崩溃（可能由于上下文过长或系统资源耗尽），循环就会停止，你必须手动重启。目前尚无自愈能力。
- **Agent 之间的状态不同步。** 早期版本中 Lisa 曾失控——她自己写代码而不是审查，导致状态混乱。现在已大幅改善，但教训依然深刻。
- **没有领域判断力，循环就毫无用处。** 两个 AI 会愉快地就一个糟糕的设计达成一致。这不是自主开发——这是结构化的 AI 辅助开发。人类仲裁者不是可选的。
- **Git 纪律不可妥协。** 小提交、清晰的信息、频繁提交。当出问题时（一定会出问题的），你唯一的安全网是能够 `git reset` 到已知的良好状态。
