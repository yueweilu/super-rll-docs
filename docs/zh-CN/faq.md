[English](../en/faq.md) | [日本語](../ja/faq.md) | [中文](../zh-CN/faq.md)

# 常见问题

**怎么用这篇**：按"我现在卡在哪"对号入座。每个问题独立可读，不需要从头读到尾。

---

## 安装

### npm install 因权限错误失败

用 nvm 装 Node（推荐）或加 `--prefix`：

```bash
nvm install 18 && nvm use 18 && npm i -g ralph-lisa-loop
# 或
npm i -g ralph-lisa-loop --prefix ~/.npm-global
```

### 我需要哪个版本的 Node.js？

Node.js ≥ 18。`node --version` 看。

### 怎么装 tmux 和 fswatch？

```bash
# macOS
brew install tmux fswatch
# Linux (Debian/Ubuntu)
apt install tmux inotify-tools
```

只有 `--auto` 模式需要。手动模式 / `--engine` 模式不需要。

### `ralph-lisa doctor` 报缺东西

它的输出会精确告诉你缺什么 + 怎么装。CI 里加 `--strict`（缺依赖退 1）：

```bash
ralph-lisa doctor
ralph-lisa doctor --strict
```

---

## 启动模式

### auto / engine / start 哪个用哪个？

| 模式 | 适合场景 | 命令 |
|---|---|---|
| `ralph-lisa start --auto` | macOS / Linux 桌面，有 tmux | 最常用，自动跑直到 deadlock / CONSENSUS |
| `ralph-lisa auto --engine` | Windows / IDE / 远程 / 容器 | 不依赖 tmux，原生跨平台 |
| `ralph-lisa start` | 学习 / debug / 不想自动 | 手动跑每个 round |

`--auto` 等价于 `start --auto`。详见 [`guide.md`](./guide.md)。

### Ralph 用 Claude Code，Lisa 用 Codex，必须吗？

**强烈推荐**。两个模型各自盲点不同 —— Claude Code 长 context 易跳错处理，Codex 偏好抽象但能抓 edge case。互查能 cover 单模型遗漏的失败模式。

理论上 Lisa 能用任何能读写文件 + 跑 shell 的 agent，但 `CODEX.md` 角色 prompt 要重写。

### 我能用同一个模型同时跑 Ralph 和 Lisa 吗？

可以，但效果差。两 agent 同模型时双方"盲点重合"，类似自我评分。**不推荐生产使用**。

### `--minimal` 和默认 init 区别？

- `ralph-lisa init`（完整）：写 CLAUDE.md / CODEX.md / commands/ / skills/ / `.dual-agent/`
- `ralph-lisa init --minimal`：只写 `.dual-agent/`，假设你的 Claude Code plugin 或 Codex 全局配置已经提供角色定义

---

## 任务类型 fast-path (§207)

### "我只是想 review 一份设计文档，怎么不被强制写测试？"

用 `--type review-task`：

```bash
ralph-lisa next-step "review-the-design" --type review-task
```

跳过完整 TDD 礼仪（auto-tdd-plan / 5-列测试表 / tests-only round）。详见 [`../non-coding-task-quickstart.md`](../non-coding-task-quickstart.md)。

### 4 个 task type 选哪个？

- **`code-task`**（默认）：动 `cli/**` 或任何源代码 → 走完整 TDD
- **`review-task`**：纯 review，写报告到 `docs/**` 或 `.dual-agent/**`，不动代码
- **`doc-task`**：写 / 改文档（`docs/**`、顶层 `*.md`、CLAUDE.md / CODEX.md / README.md）
- **`process-task`**：改 `.rll/PLAN.md` / `CLAUDE.md` / `CODEX.md` 等协议文档（**不**能改 `cli/package.json` 这类 package files）

判别原则：**有没有改 `cli/**` 任何东西？有就 code-task**。

### "我经常简单任务被门禁卡住, 怎么破?"

**最快路径** (v0.9.14+): `--mode simple --user-signature` 跳礼仪：

```bash
ralph-lisa next-step "fix-typo" --mode simple --user-signature "trivial-2026-05-26-simple-go"
```

`--mode simple` 跳 §128 clarify / §122 task-capability / §102 auto-TDD / §123 complexity-verify / §134 marker-plan-bound 五条礼仪 rule。但 §207 file whitelist / §149 attest / §144 Lisa verified / §70 cascade 仍然 enforce (trust-boundary lock 设计)。

**`--user-signature` 强制必填**: ≥10 字符 + audit 关键词 (simple/efficiency-first/trivial/standard/strict/quality-first) 或 ISO 日期。Ralph 自己不能 self-fake。

**或者更自然**: 直接 `ralph-lisa next-step "..."` 不加 flag, Ralph 第一句话会问"A 简单 / B 标准 / C 严格?", 你回答 A 即可。

### "我开了 review-task 但中途发现要改 cli 代码，怎么办？"

**不要硬改** —— policy 会立刻 block `task-type-file-mismatch`。正确做法：

1. 把当前 review 部分跑到 [CONSENSUS] 干净 close
2. 开新 sub-slice `ralph-lisa next-step "fix-x-from-review" --type code-task`
3. 完整 TDD 走 code 改动

---

## 提交被 block 怎么办

### `§149: must include Test-Process` / `Test-Cases` / `Test-Results`

Ralph 三件套缺一个。即使纯 doc/process 任务也要写，可以 `Skipped:` justification。详见 [`testing.md`](./testing.md) "提交 [CODE] / [FIX] 时怎么写测试段" 段。

### `Test Results contains unverified claims (no matching execution log entry)`

§137 verifier 找不到匹配 log。常见原因：

- 没在最近 10 分钟跑过 `quality-gate` / 跑了但 cmd 字符串不一致
- 散文里写 `12/12 pass` 这种数字，parser 当成独立 claim cmd='?' 不匹配
- 跑了不同 prefix（`npm test` vs `npm test --prefix cli`）

修：跑 `ralph-lisa quality-gate` → 立刻 submit → `cmd="X"` 完全照抄 jsonl 里的 cmd。

### `lisa-rerun-not-verified`

Lisa 缺 `Verified: <可信路径>` 或 path 不可信。可信只有 3 类：
- `.dual-agent/gate-results.{md,json}`
- `.dual-agent/harness-results/*`
- `.dual-agent/auto-tdd-plan-*.json`

`plan validate` **不**写 gate-results.md。

### `task-type-file-mismatch`

§207 文件白名单越界。看上面 "task 类型 fast-path" 段。**不能** `RL_POLICY_MODE=warn` 绕，**不能** `RL_TASK_TYPE_OFF` 绕（这个 env 不存在）。

### `clarify-not-completed`

§128：复杂任务（complexity-judge 判断成 complex/expert）必须先 R0 [CLARIFY]：

```bash
ralph-lisa clarify --start  # 5 阶段 grill
ralph-lisa clarify --commit --understanding "..." --covered "..." --negative-scope "..." --risks "..."
```

简单任务（你自己很确定）：`ralph-lisa clarify --skip`（warning 但不 block）。

### `task-capability-unacked`

§122：用户必须独立 ack 测试能力：

```bash
ralph-lisa task capability ack-user --signature "<token>"
```

Ralph 不能 self-fake；trust-boundary 锁。

### `phase-test-coverage-missing`

§145：你声明了 ≥2 phase 但用 5-列测试表。改成 6-列加 Phase 列。详见 [`testing.md`](./testing.md) "复杂任务" 段。

### `doc-oracle-spec table missing`

doc-task PLAN / [FIX] 必须有 5-列 oracle 表（独立于 5-列 test 表）：

```
| ID | Dimension | Verification Method | Pass Criteria | Required |
```

Dimension 必须 ∈ 9 canonical：`data-accuracy` / `source-authority` / `source-freshness` / `logical-coherence` / `compliance-with-user-spec` / `ai-slop` / `style` / `topic-coverage` / `depth-detail`。

---

## RLL 进入"卡死"了

### watcher 不响应了 / heartbeat 很久没更新

```bash
ralph-lisa doctor                      # 看 Watcher Health 段
ralph-lisa daemon-health-check         # wecom-bot daemon 状态
cat .dual-agent/.watcher_heartbeat     # heartbeat 时间戳
cat .dual-agent/watchdog.log | tail    # 是否被 SIGKILL 重启
```

最简单解法：`ralph-lisa start --auto` 重启。state 都在 `.dual-agent/`，重启不丢。

### 连续 8 轮 NEEDS_WORK，watcher 自动暂停了

正常行为。Deadlock detect 触发，等用户介入。看 `.dual-agent/review.md` 里 Lisa 5+ 轮的 narrow，思考：

- 真的是 Ralph 反复改不对 → 帮 Ralph 看代码，给 hint
- 路线错了 → `ralph-lisa scope-update` 调整 scope
- Lisa 钻牛角尖 → Ralph 用 `[CHALLENGE]` 反驳

恢复：让 Ralph 跑 `[CHALLENGE]` 或 `[FIX]` 继续。

### 跑到一半 agent 自己 crash 了

```bash
tmux ls                                # 看 session
ralph-lisa logs                        # 看 pane 输出
ralph-lisa force-turn ralph            # 手动设 turn（必要时）
```

`auto --engine` 模式：watcher 内置 TurnCoordinator，agent crash 后 watcher 通常会自动暂停等人介入。

---

## CI / 测试

### 本地测试过了，CI 红

常见原因：

- CI 浅克隆（`fetch-depth=1`）影响 git diff 类测试 → CI workflow 改 `fetch-depth: 0`
- CI 没装 Playwright / codex / 其它三方 CLI → skip 这些测试或 mock
- 你本地 tmux env 污染（`RL_STATE_DIR` 残留指 §184 tempProject）→ 修：`tmux setenv -u RL_STATE_DIR && tmux setenv -u RL_SESSION_ID`

### 本地红 / CI 绿

大概率 concurrent 测试污染 `super-rll/.dual-agent/command-events.jsonl` 这类 snapshot 类测试（`§cmdRunLisa-isolation T2` 是已知 flake）。

### 怎么跑单个 test？

```bash
cd cli
node --test --test-name-pattern="MyCase" dist/test/foo.test.js
```

---

## 费用

### 一次会话花多少？

| 组件 | 每轮 |
|---|---|
| Ralph (Claude Code) | ~$0.15–0.50 |
| Lisa (Codex) | ~$0.05–0.20 |
| **每轮合计** | **~$0.20–0.70** |

典型 10-15 轮 ≈ $3-10。最坏 25+ 轮 deadlock ≈ $15-20。

### 怎么省 token？

- **任务拆小**：`ralph-lisa next-step "small-piece"` 分步而不是一次性
- **`update-task` 调方向**而不是从头开新 step
- **设 checkpoint**：`RL_CHECKPOINT_ROUNDS=5` 每 5 轮暂停人审
- **简单任务用 fast-path**：review/doc/process 走 `--type` 跳 TDD
- **手动模式 debug**：复杂决策时手动 step-through 看每个 agent 在干嘛

---

## 平台支持

### Windows 能跑吗？

**能**。`auto --engine` 原生跨平台，不需要 tmux / WSL：

```bash
ralph-lisa auto --engine --task "implement feature" --auto-approve
```

Windows Terminal 内还能开专用双 pane UI：

```bash
ralph-lisa auto --engine --task "..." --ui wt
```

`--ui wt` 自动检测 Windows Terminal host；不在 WT 内会回退 `--ui split`。

Legacy `ralph-lisa auto`（tmux 模式）在原生 Windows 上仍然**不可用**；要 tmux 用 WSL2。

### Windows 哪些版本？

- **Windows 11** 完整支持
- **Windows 10 22H2** 完整支持（要装 Windows Terminal 用 `--ui wt`）
- 更老的 Win10 没测

### Linux 用 inotify-tools 代替 fswatch

```bash
apt install tmux inotify-tools
```

---

## 架构 / 设计

### 跟 Ralph Wiggum Loop 区别？

| 维度 | Ralph Wiggum Loop | Ralph-Lisa Loop |
|---|---|---|
| Agent 数 | 1（自循环） | 2（开发 + 评审） |
| 验证 | `<promise>` tag | Lisa 独立裁判 + consensus |
| review 频率 | 无 | 每轮强制 |
| 偏差 | 高（自评） | 低（外部审） |
| 适合 | 简单明确任务 | 复杂模糊任务 |

两个工具不冲突，可同项目共存。

### 为什么不直接用 Claude Code？

单 agent 既写代码又决定完成 = 自己给自己改卷。RLL 同时引入：

- 外部审查（Lisa 独立判断）
- 机械门禁（不靠模型自觉）
- 双向 attest（防 Lisa rubber stamp）

设计原理详见 [`../trustcoding-product-definition.md`](../trustcoding-product-definition.md)。

### 两个 agent 会陷入无限循环吗？

不会。三层防线：

1. 5 轮没 consensus → `[OVERRIDE]` / `[HANDOFF]` 升级
2. 8 轮连续 NEEDS_WORK → watcher 自动 deadlock 暂停
3. `RL_CHECKPOINT_ROUNDS=N` 强制每 N 轮 checkpoint

### 我能改 enforcement rule 吗？

能。Sub-slice 路径：开 `--type code-task` slice → 改 `cli/src/policy.ts` → 加 spawn 测试 → 至少正向反向 + anti-loophole 一个 → 在 [`test-harness-and-gates.md`](./test-harness-and-gates.md) 加文档段。

详见 [`maintainer-handoff.md`](./maintainer-handoff.md) "怎么加新 cli sub-cmd" 段（regression test 套路类似）。
