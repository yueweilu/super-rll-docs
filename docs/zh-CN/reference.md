[English](../en/reference.md) | [日本語](../ja/reference.md) | [中文](../zh-CN/reference.md)

# 命令参考

**这篇是给谁看的**：忘了某个 cli 子命令长啥样想快速查的人。
**看完能做什么**：找到要的命令 + 看到它的 flag + 知道它属于哪一类。

完整 cli 表面 ≈ 108 个子命令（`ralph-lisa --help` 列全），按用途分组如下。详细行为见 [`guide.md`](./guide.md) 和 [`testing.md`](./testing.md)。

---

## 项目初始化 / 启动

| 命令 | 说明 |
|---|---|
| `ralph-lisa init [dir]` | 完整初始化：写角色文件 (CLAUDE.md / CODEX.md) + commands/ + skills/ + .dual-agent/ |
| `ralph-lisa init --minimal [dir]` | 仅写 .dual-agent/（角色文件假设来自 Claude Code plugin / Codex 全局配置） |
| `ralph-lisa uninit` | 从项目移除 RLL 文件 |
| `ralph-lisa start "task"` | 手动模式（你自己跑 round） |
| `ralph-lisa start --auto "task"` | 自动模式（tmux + fswatch） |
| `ralph-lisa auto "task"` | `start --auto` 的别名 |
| `ralph-lisa auto --engine --task "description"` | Engine 模式（原生跨平台，不依赖 tmux）|
| `ralph-lisa auto --engine --task "..." --ui wt` | Engine + Windows Terminal 专用双 pane UI |
| `ralph-lisa start --daemon` | IDE 集成模式（cli-pty-daemon 后台） |
| `ralph-lisa mcp-server` | MCP server 模式（让其它 LLM 工具调用 RLL） |
| `ralph-lisa stop` | 停掉当前 session |

---

## 回合 / 提交

| 命令 | 说明 |
|---|---|
| `ralph-lisa whose-turn` | 当前是谁的回合（ralph / lisa） |
| `ralph-lisa check-turn` | 别名 |
| `ralph-lisa status` | 一行状态：step / round / turn / last action / watcher health |
| `ralph-lisa submit-ralph --file f.md` | Ralph 提交（**推荐**用 `--file`） |
| `ralph-lisa submit-lisa --file f.md` | Lisa 提交 |
| `ralph-lisa submit-ralph --stdin` | 从 stdin 读 |
| `ralph-lisa submit-lisa --stdin` | 同 |
| `ralph-lisa force-turn ralph\|lisa` | 强制设 turn（debug 用） |

inline 模式 `submit-ralph "[TAG] ..."` 已**弃用**（shell escape 问题），用 `--file`。

---

## 阅读 / 历史 / recap

| 命令 | 说明 |
|---|---|
| `ralph-lisa read work.md` | 看 Ralph 最新提交 |
| `ralph-lisa read review.md` | 看 Lisa 最新评审 |
| `ralph-lisa read review --round N` | 看第 N 轮评审 |
| `ralph-lisa read-review` | `read review.md` 别名 |
| `ralph-lisa history` | 完整 session history |
| `ralph-lisa recap` | context 恢复摘要（compact 后用） |
| `ralph-lisa logs` | 列 session 日志 |
| `ralph-lisa logs cat <name>` | 看具体某条 |

---

## 流程 / 阶段

| 命令 | 说明 |
|---|---|
| `ralph-lisa next-step "name"` | 进新 sub-slice（要求当前 sub-slice 已 mutual CONSENSUS） |
| `ralph-lisa next-step "name" --type <X>` | 同上 + 显式声明 task_type（§207） |
| `ralph-lisa next-step --force "name"` | 跳过 consensus 检查 |
| `ralph-lisa next-step "name" --task "first task"` | 同时设第一个 subtask |
| `ralph-lisa step` | `next-step` 别名 |
| `ralph-lisa update-task "new direction"` | 中途调整任务方向 |
| `ralph-lisa subtask add\|done\|list` | subtask 管理 |
| `ralph-lisa scope-update` | 让 Ralph 重新提交 [PLAN]（用于 8 连 NEEDS_WORK deadlock 后调方向） |
| `ralph-lisa archive [name]` | 归档 session |
| `ralph-lisa clean` | 清 session state |

---

## 任务类型 fast-path（§207）

| 命令 | 说明 |
|---|---|
| `ralph-lisa next-step "x" --type code-task` | 默认完整 TDD（等价不写 --type）|
| `ralph-lisa next-step "x" --type review-task` | 跳 TDD，writes 仅限 docs/** + .dual-agent/** |
| `ralph-lisa next-step "x" --type doc-task` | + 顶层 *.md + CLAUDE.md / CODEX.md / README.md |
| `ralph-lisa next-step "x" --type process-task` | + .rll/** + docs/** （**不**含 cli/package.json） |

详见 [`../non-coding-task-quickstart.md`](../non-coding-task-quickstart.md)。

---

## task / complexity / clarify

| 命令 | 说明 |
|---|---|
| `ralph-lisa task new <slug>` | 开 sub-slice（§122 capability detect） |
| `ralph-lisa task list` | 列所有 sub-slice |
| `ralph-lisa task capability ack-user --signature "<token>"` | 用户独立 ack 测试能力（§122 trust-boundary） |
| `ralph-lisa task capability ack-install --tier <X>` | ack 安装计划 |
| `ralph-lisa task capability ack-downgrade --tier <X> --consent "..."` | ack 降级方案 |
| `ralph-lisa task complexity-judge --slice <X> --json` | LLM 复杂度判断（§123） |
| `ralph-lisa task complexity-verify --slice <X>` | deterministic 复杂度验证（hard gate） |
| `ralph-lisa task-state list\|set` | task-level state（done/failed/pending-user） |
| `ralph-lisa clarify --start` | 进 R0 [CLARIFY] 5 阶段 grill（§128 复杂任务必走） |
| `ralph-lisa clarify --commit --understanding "..." --covered "..." --negative-scope "..." --risks "..."` | finalize clarify |
| `ralph-lisa clarify --skip` | 简单任务跳过 R0（warning 但不 block） |
| `ralph-lisa ack-scope-expansion --reason "..."` | 用户 ack Lisa 扩大的 scope |
| `ralph-lisa ack-shape-change` | 用户 ack schema/shape 变化 |

---

## 质量门禁 / 测试

| 命令 | 说明 |
|---|---|
| `ralph-lisa quality-gate` | 全套门禁（plan validate + npm test 多包）|
| `ralph-lisa gate` | 别名 |
| `ralph-lisa quality-gate --strategy full\|smoke-only\|affected` | 策略选择 |
| `ralph-lisa quality-gate --full-uaot` | + watcher health verification |
| `ralph-lisa quality-gate --warn` / `--block` | mode 覆盖（默认 block）|
| `ralph-lisa test-cascade --strategy full\|smoke-only\|halt-on-fail [--dry-run] [--json]` | 单跑 cascade |
| `ralph-lisa test-cascade --tier <X>` | 按 tier 过滤（**仅在 .ralph-lisa.json 配 testTiers 时有效**） |
| `ralph-lisa smoke-check` | 项目级 smoke（需 RL_SMOKE_CMD 配置） |
| `ralph-lisa smoke-test` | 跑预定义 smoke 场景 |
| `ralph-lisa smoke-fail list\|clear` | 中间过程 smoke 失败 captures 管理（§150） |
| `ralph-lisa test-report` | 最新测试报告 |
| `ralph-lisa test-report --list` | 列所有报告 |
| `ralph-lisa test-spec-eval --slice <X>` | 测试 spec 静态规则审计 |
| `ralph-lisa test-log` | 看 .dual-agent/test-execution-log.jsonl |
| `ralph-lisa tier-assertion-lint` | §194 tier-assertion-strength 静态审计 |
| `ralph-lisa visual-evidence add --file <screenshot>` | UI/web slice 添加 screenshot 证据（§151） |
| `ralph-lisa visual-baseline` | 视觉回归 baseline 管理 |
| `ralph-lisa loopback list\|inspect <step>` | §79 loopback 状态查看 |
| `ralph-lisa phase-gate` | 单跑 phase gate |

---

## 发版门禁

| 命令 | 说明 |
|---|---|
| `ralph-lisa dogfood-gate run [--strict]` | 端到端 enforcement scenarios（§139）|
| `ralph-lisa doc-update-gate run [--strict] [--doc-set <paths>]` | doc claim vs code impl drift detector（§138） |
| `ralph-lisa release-report emit --slug <X> [--format md\|json\|both]` | 汇总 6 类 evidence 出 release report（§140） |
| `ralph-lisa plan validate` | PLAN.md SOR currency / 5-列表 / phase-coverage 校验 |
| `ralph-lisa plan validate-phase-tests --slice <X>` | §145 Rule 10 phase-test-coverage 单独跑 |
| `ralph-lisa gate-manifest --type <cli\|web-app\|mobile-app\|library\|service>` | 写 project_type 到 gate-manifest.json（§152） |

---

## Policy / 健康

| 命令 | 说明 |
|---|---|
| `ralph-lisa policy check ralph\|lisa` | 单跑 policy.ts checkRalph/Lisa（独立 sub-cmd 始终 exit 非 0 on violation，无视 RL_POLICY_MODE） |
| `ralph-lisa policy check-consensus` | 双方都 [CONSENSUS] 吗 |
| `ralph-lisa policy check-next-step` | next-step 前综合检查（consensus + policy） |
| `ralph-lisa doctor` | 依赖 + watcher health + sandbox + artifacts 全检 |
| `ralph-lisa doctor --strict` | CI 模式（缺东西 exit 1） |
| `ralph-lisa daemon-health-check` | wecom-bot daemon pid/heartbeat 检查 |
| `ralph-lisa lisa-watchdog tick` | Lisa silent-stall 检测一次 |
| `ralph-lisa repeat-edit-check` | 同一文件连续 3 round 被改的检测 oracle |
| `ralph-lisa watcher-unread-age-check` | wecom-feedback unread 老化检测 |

---

## WeCom / Lark / DingTalk 集成

| 命令 | 说明 |
|---|---|
| `ralph-lisa wecom-feedback unread` | 看 WeCom inbox 未读 |
| `ralph-lisa wecom-push --file <f>` | 推消息给用户（fire-and-forget） |
| `ralph-lisa wecom-push --body "..."` | 短消息 |
| `ralph-lisa wecom-bot start\|stop` | wecom-bot daemon 控制 |
| `ralph-lisa voice transcribe` | 语音转文字（macOS Swabble） |
| `ralph-lisa lark-push --webhook <url> [--secret <s>] --file <f>` | 飞书 outbound push（§63）|
| `ralph-lisa dingtalk-push --webhook <url> [--secret <s>] --file <f>` | 钉钉 outbound push（§64）|
| `ralph-lisa oauth-authorize-url --provider github` | OAuth first-leg URL 生成（§65） |
| `ralph-lisa oauth-test --code <code>` | OAuth 完整流程测试 |

---

## token / 数据闭环

| 命令 | 说明 |
|---|---|
| `ralph-lisa token-usage show\|summary` | token 使用查询（§55）|
| `ralph-lisa token-record --agent X --role X --prompt N --completion N` | 程序化 record（§56）|
| `ralph-lisa token-parse-pane --file <pane.log>` | 从 tmux pane 日志抓 token（§57）|
| `ralph-lisa token-capture --pane 0\|1` | 自动 wiring §57 → §56（§58）|
| `ralph-lisa session-capture --agent claude\|codex --role ralph\|lisa` | 从 claude/codex session jsonl 抓 token（§61）|
| `ralph-lisa weekly-digest [--days N] [--push] [--since/--until]` | 周报 markdown（§59）|
| `ralph-lisa daily-summary [--date YYYY-MM-DD] [--push]` | 日报 |
| `ralph-lisa my-stats` | 个人统计 |
| `ralph-lisa user-identity [--refresh]` | git user.email/name capture（§54）|
| `ralph-lisa user-behavior-analyze` | 用户行为分析（§203）|
| `ralph-lisa user-behavior-backfill` | 历史数据回填 |
| `ralph-lisa reliability-metrics` | 可靠性指标 |
| `ralph-lisa telemetry-push` | telemetry 推送 |

---

## 会话 / 状态 debug

| 命令 | 说明 |
|---|---|
| `ralph-lisa state-dir` | 解析当前 stateDir |
| `ralph-lisa rll-root` | 解析当前 RLL 项目根 |
| `ralph-lisa session-role` | 当前 session 的 role |
| `ralph-lisa rebind` | 重建 session anchor（§206） |
| `ralph-lisa sync-project` | 安装 / 刷新项目 artifacts |
| `ralph-lisa add-context --file <f>` | 临时给 agent 加 context 文件 |
| `ralph-lisa preset show [--preset <name>] [--json]` | 列 / 看具体 preset |
| `ralph-lisa preset audit --file <body.md> --preset <name> [--json]` | Lisa 侧 preset 审查 |
| `ralph-lisa skill list\|run <name>` | skill 系统 |
| `ralph-lisa contract-check` | §80 cross-module-contract-check |
| `ralph-lisa knowledge-freshness` | §128 living-memory 知识鲜度检查 |

---

## 其它 cli

| 命令 | 说明 |
|---|---|
| `ralph-lisa --help` / `-h` | 帮助 |
| `ralph-lisa --version` / `-v` | 版本 |
| `ralph-lisa run-lisa [--state-dir <d>]` | Lisa 一次性运行（程序化） |
| `ralph-lisa watch-lisa` | watcher 触发 Lisa（debug） |
| `ralph-lisa review` | 评审 helper |
| `ralph-lisa notify` | 通知 |
| `ralph-lisa emergency-msg` | 紧急消息 |
| `ralph-lisa agent-stuck-push` | agent_stuck 事件推送 |
| `ralph-lisa inbox-wake-decide` | inbox-wake routing 决策 |
| `ralph-lisa update-watcher` | watcher 升级 |
| `ralph-lisa remote` | 远程访问 |
| `ralph-lisa progress` | 进度跟踪 |
| `ralph-lisa report` | 报告 |
| `ralph-lisa analyze` | 静态分析 |
| `ralph-lisa baseline` | baseline 管理 |
| `ralph-lisa affected` | affected files 计算 |
| `ralph-lisa test` | 测试调度 |
| `ralph-lisa llm-judge` | LLM-as-judge 子工具 |
| `ralph-lisa ai-output-check` | AI 输出质量检查 |

---

## 环境变量（最常用）

| 变量 | 默认 | 说明 |
|---|---|---|
| `RL_POLICY_MODE` | `block` | `off` / `warn` / `block`；§133 默认 block |
| `RL_RALPH_GATE` | `auto` | submit-time 跑 gate 否：`true` / `false` |
| `RL_GATE_COMMANDS` | (空) | 自定义 gate 命令清单（覆盖 .ralph-lisa.json） |
| `RL_SMOKE_CMD` | (空) | 中间过程 smoke 命令（§150 用） |
| `RL_SMOKE_AUTO_LOOP_OFF` | `0` | 禁用 §150 自动 smoke loop |
| `RL_CHECKPOINT_ROUNDS` | `0` | 每 N 轮 checkpoint 人审 |
| `RL_LOG_MAX_MB` | `5` | pane 日志截断阈值 MB |
| `RL_LISA_WATCHDOG_THRESHOLD_SEC` | `1800` | Lisa silent-stall 阈值 |
| `RL_LISA_WATCHDOG_OFF` | `0` | 禁用 Lisa watchdog |
| `RL_VISUAL_EVIDENCE_OFF` | `0` | 禁用 §151 visual-evidence 强制 |
| `RL_TEST_EXECUTION_LOG_OFF` | `0` | 禁用 test-execution-log.jsonl 写入（测试用） |
| `RL_TEST_RESULTS_VERIFY_OFF` | `0` | 禁用 §137 verifier |
| `RL_LISA_VERIFIED_OFF` | `0` | 禁用 §144 Lisa Verified cite 要求 |
| `RL_LISA_ATTEST_OFF` | `0` | 禁用 §149 Lisa attest |
| `RL_RALPH_ATTEST_OFF` | `0` | 禁用 §149 Ralph attest |
| `RL_R1_FIRST_TAG_OFF` | `0` | 禁用 §202 first-tag enforcement |
| `RL_TASK_CAPABILITY_GATE` | `auto` | §122 模式：`auto` / `block` / `off` |
| `RL_PROJECT_TYPE_TIERS_OFF` | `0` | 禁用 §152 archetype baseline hint |
| `RL_PRESUBMIT_UNREAD_CHECK` | `on` | pre-submit WeCom unread check |
| `RL_PLAN_GATE` | `on` | plan-keeper gate |
| `RL_LEGACY_SESSION_OK` | `0` | 跳过 §206 session-anchor 校验（仅 legacy session） |
| `RL_STATE_DIR` | (auto) | 强制指定 stateDir |
| `RL_SESSION_ID` | (auto) | session id |
| `RL_GATE_INCLUDE_OPTIONAL` | `false` | cascade 是否纳入 Required=✗ 行 |
| `RL_TDD_MODE` / `RL_TDD_COMPLEX_THRESHOLD` | `off` / `4` | §102 auto-TDD 模式 / 复杂度阈值 |

audit-named opt-out env 默认是 `OFF` 后缀，意味着启用 = 禁用对应 enforcement。这些 env 一旦被 set 会进 audit log，方便 debug 时定位用户绕了哪条规则。

完整 env 表见 `cli/src/state.ts` + `cli/src/policy.ts` 的 process.env 引用。
