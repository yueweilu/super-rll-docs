[English](../en/maintainer-handoff.md) | [中文](../zh-CN/maintainer-handoff.md)

# RLL 维护者交接手册

**这篇是给谁看的**：刚接手 super-rll (Ralph-Lisa Loop, 简称 RLL) 项目的工程师。
**看完能做什么**：知道这个项目大概有几块、各块负责什么、改某一块会影响谁、出问题去哪里查、怎么不踩坑。

---

## TL;DR — 30 秒看完

RLL 是一个**双 agent 协作工具**：让两个 AI（Ralph = 开发，Lisa = 评审）按"提交→评审→修改→共识"的回合制工作，强制人类工程师的纪律落到 AI 上（写测试、跑门禁、不靠拍脑袋）。代码主要是 TypeScript，CLI 工具叫 `ralph-lisa`。

- **核心仓库**：`super-rll/`（你现在在的这个）
- **核心包**：`cli/`（主 CLI，~80 个 sub-command，~2400 个测试）+ `wecom-bot/`（企业微信桥接 daemon，WebSocket 长连）
- **运行模式**：用户在某个项目里 `ralph-lisa init` 之后 `ralph-lisa start --auto`，CLI 在两个 tmux pane 里分别拉起 Claude/Codex 跑 Ralph 和 Lisa 两个角色，CLI 自己当裁判
- **状态**：放在 `<project>/.dual-agent/` 目录，全是本地文件（`step.txt` / `turn.txt` / `work.md` / `review.md` / `history.md` + JSON artifacts）
- **质量门禁**：每次 Ralph 提交都过一组检查（测试有没有真跑、Lisa 评审够不够实、有没有走旁门绕过纪律）；不通过就 block，详见 [`test-harness-and-gates.md`](./test-harness-and-gates.md)

---

## 项目要解决什么问题（产品视角）

让 AI 写出来的代码**真的能用**——不靠每次都人肉 review，也不靠模型自己自吹"我搞定了"。具体做法是**双 agent 互检 + 机械门禁**：

- **Ralph**（开发 agent）：写代码、跑测试、自己提交结果
- **Lisa**（评审 agent）：独立读 Ralph 提交的内容、核对测试真实性、给 PASS 或 NEEDS_WORK
- **CLI 门禁**：在两者中间当裁判，确保 Ralph 不会偷懒（不写测试、伪造测试结果、跳过失败用例），确保 Lisa 不会rubber stamp（PASS 而没有真核对）

这一套机制的设计原因在 [`docs/trustcoding-product-definition.md`](../trustcoding-product-definition.md)，本文不展开；维护者主要知道这是项目的根本卖点，所有"为什么要加这么多检查"的问题都回到这里。

---

## 仓库结构（你需要知道的 6 个目录）

| 路径 | 干啥的 | 改这里要小心什么 |
|---|---|---|
| `cli/` | 主 CLI 包，发布到用户机器的就是这个。源码 `src/`，编译到 `dist/`，测试 `src/test/`。 | 改任何 cli 行为都要写测试 + 跑 quality-gate；新增 sub-cmd 要在 `cli/src/cli.ts` 的 switch 里加 case + 在 `docs/zh-CN/reference.md` 加文档 |
| `wecom-bot/` | 企业微信 daemon，独立 npm 包。负责把用户在微信里的消息（文本/语音）拉进 RLL inbox，和把 RLL 的状态推给用户。走 WebSocket，**不需要公网回调**。 | 改协议要同步改 `cli/src/wecom-hook.ts`（CLI 侧的 IPC client）；强 schema check 见 §80 cross-module-contract-check |
| `cli-pty-daemon/` `cli-pty-daemon-vscode/` | 跨平台 IDE 集成（VSCode 插件 + PTY daemon），让 Ralph/Lisa 不必依赖 tmux 也能跑。 | 早期 MVP，改动相对独立；动核心要先看 §46-§48 carry-forward 文档 |
| `rll-team-platform/` | 后端平台（多用户监控、token 使用统计、企业管理）。独立 npm workspace。 | 跟 cli 关系不大；自己一套 PLAN.md + 测试 |
| `lark-bot/` `dingtalk-bot/` | 飞书 / 钉钉 outbound webhook MVP。目前**仅推送**，没做 inbound。 | 想做双向交互参考 wecom-bot 架构（WebSocket smart-robot + 本地 HTTP IPC） |
| `docs/` | 用户文档 + 设计文档。**用户文档在 `zh-CN/` / `en/` / `ja/` 三语**；设计文档（`*-design.md` 等）在 `docs/` 根目录，单语，作为历史 SoR | 用户文档跨语同步走 §143 翻译延期约定（核心先 ship，翻译可后补） |

不在表上的小目录（`scripts/` / `deploy/` / `test-e2e/`）按需查。

---

## 三个跑 RLL 的"启动模式"

用户在一个目标项目里跑 RLL 有三种姿势，维护者需要知道每种走哪条代码：

### 1. `ralph-lisa start --auto`（推荐 / 主流）

- 入口：`cli/src/cli.ts` case `start` → `cmdStart()` (`cli/src/commands.ts:3500+`)
- 行为：用 tmux 开 4 pane（Ralph claude、Lisa claude/codex、watcher 状态、日志），CLI 自己用 watcher 监听 `.dual-agent/turn.txt` 触发各 agent 工作
- 进 `--engine` 模式（§51）：watcher 内置 TurnCoordinator，省 tmux 启动一些细节
- 启动后用户基本不用碰，跑到 8 连 NEEDS_WORK deadlock 或 mutual CONSENSUS 时 watcher 自动暂停

### 2. `ralph-lisa start --daemon`（IDE 集成 / §47-§48）

- 入口：`cmdStartDaemonFirst()`，先拉起 `cli-pty-daemon` 后台进程，再让 VSCode 插件 / `ralph-lisa attach <role>` thin client 连接
- 跨平台（macOS/Windows/Linux），不依赖 tmux
- 适合：用户在 IDE 里跑、SSH 远程跑、容器跑

### 3. 手动 `ralph-lisa init` + `ralph-lisa submit-ralph` / `submit-lisa` / `read review.md`

- 给写脚本 / 测试场景用的低层 API
- 全部 cli sub-cmd 见 [`reference.md`](./reference.md)

---

## 数据流：一次"Ralph 提交"完整路径

了解这个就能定位 80% 的 bug：

```
用户在 Ralph pane 里跑 claude/codex
  ↓
Ralph 写 submission body 到 .dual-agent/submit.md
  ↓
跑 `ralph-lisa submit-ralph --file .dual-agent/submit.md`
  ↓
cli/src/commands.ts cmdSubmitRalph():
  ├─ 1. 读 step.txt / turn.txt（必须是 ralph）
  ├─ 2. 读 task-type-<step>.json（§207）→ 决定走完整 TDD 还是 fast-path
  ├─ 3. runPolicyCheck() → cli/src/policy.ts checkRalph()
  │     ├─ §137 test-results-claim-verifier  (Test-Results 行 vs test-execution-log.jsonl 比对)
  │     ├─ §149 ralph-attest                  (Test-Process / Test-Cases / Test-Results 三件套)
  │     ├─ §207 task-type-file-mismatch       (review-task 改 cli/src/** 直接 block)
  │     ├─ §202 first-tag enforcement         (新 step 第一次必须 [PLAN]/[RESEARCH]/[CLARIFY])
  │     ├─ §134 marker-plan-bound             (§52 tests-only marker 必须 PLAN.md 显式声明)
  │     └─ ...（详见 test-harness-and-gates.md）
  ├─ 4. runPlanKeeperGate()  → .rll/PLAN.md SOR currency 检查
  ├─ 5. autoTdd.persistPlanTestTable()  → 提取 5-col 表持久化 auto-tdd-plan-<step>.json
  ├─ 6. runGate()  → 真跑 npm test / lint / build (可选, RL_RALPH_GATE)
  ├─ 7. 写 work.md / history.md / append last_action
  ├─ 8. 翻转 turn.txt 给 lisa
  └─ 9. pushWecomEvent ralph_submit  → wecom-bot daemon → 用户微信

任何一步失败 → process.exit(1) → 用户看到 BLOCKED 信息
```

`cmdSubmitLisa` 镜像类似，再加 §144 Verified: cite + Lisa-attest verify。

详见 [`test-harness-and-gates.md`](./test-harness-and-gates.md) 里"提交时机门禁"和"提交后门禁"两章。

---

## 关键 enforcement 索引（§xxx 一句话）

下面这些"§xxx"是项目内部的 sub-slice 编号，每个对应一条已经 ship 的机械规则。维护者改 cli 行为时大概率会触碰其中一条；不要自己揣测，**直接看 [`test-harness-and-gates.md`](./test-harness-and-gates.md) 里对应锚的"原理 + 怎么破"段**。

| 锚 | 一句话作用 | 详细在哪 |
|---|---|---|
| §70 | mutual CONSENSUS 后强制跑测试 cascade 才算结束 | test-harness-and-gates.md §post-consensus-gate |
| §102 | 复杂任务必须先写测试（tests-only round）再写实现 | test-harness-and-gates.md §auto-tdd |
| §122 | sub-slice 开始前必须显式 ack 测试能力（防"假装能测"） | test-harness-and-gates.md §task-capability |
| §123 | 复杂度判断三层（complexity-judge + verify + Lisa rerun） | test-harness-and-gates.md §complexity-gates |
| §128 | 复杂任务必须先经 R0 [CLARIFY] 才能进 R1 [PLAN] | test-harness-and-gates.md §clarify-phase |
| §133 | policy 默认 block 不是 warn（保护机制不被静默绕过） | test-harness-and-gates.md §policy-block-default |
| §137 | Test-Results 行必须能在 test-execution-log.jsonl 找到对应执行记录 | test-harness-and-gates.md §test-results-claim |
| §144 | Lisa PASS/CONSENSUS 必须 cite `Verified:` 到可信 artifact 路径 | test-harness-and-gates.md §lisa-verified-cite |
| §149 | Ralph + Lisa 双向 attest（防止单边rubber stamp） | test-harness-and-gates.md §bidirectional-attest |
| §150 | 中间过程 smoke 失败连续 3 次自动 task_failed 升级 | test-harness-and-gates.md §smoke-auto-loop |
| §151 | UI / web slice 必须附带 screenshot artifact | test-harness-and-gates.md §visual-evidence |
| §200 §201 §202 | 非编码任务（review/doc/process）的 propose-agree 协议 | test-harness-and-gates.md §propose-agree |
| §206 | session-anchor canonical root（state 目录不再瞎找） | test-harness-and-gates.md §session-anchor |
| §207 | task_type fast-path（review/doc/process 不走完整 TDD 礼仪） | test-harness-and-gates.md §task-type-fast-path |

完整 §xxx 历史在 `.rll/PLAN.md` 顶部「ID Anchor Ledger」段，按时间倒序排列。

---

## 出问题去哪里查（debug runbook）

按现场症状对号入座，能 cover 大多数情况：

### 症状 1：用户提交被 block，错误信息提到 `§xxx` 或 `rule: xxx-xxx`

1. 看 BLOCKED 信息里完整的 rule 名（比如 `task-type-file-mismatch`）
2. 在 `cli/src/policy.ts` grep 这个 rule 名，找到触发位置
3. 看 rule 的 message 模板，对照用户提交 body 哪一段触发的
4. 如果是"规则本身判断错了"（user 没违规但被 block）→ 修 rule 的判断逻辑 + 加 regression test
5. 如果是"规则判断对的，user 真违规了"→ 在 `docs/zh-CN/faq.md` 加一条新 FAQ + 在 `docs/zh-CN/test-harness-and-gates.md` 检查"怎么破"段是否清楚

### 症状 2：watcher / daemon 莫名挂了，Ralph 或 Lisa 不响应

1. `ralph-lisa doctor` 看依赖 + Watcher Health 段（heartbeat 多旧、ACKED_TURN 是否漂）
2. `ralph-lisa daemon-health-check` 看 wecom-bot daemon 是否还活着
3. `cat .dual-agent/.watcher_heartbeat` 看时间戳（>300s 就异常）
4. 看 `.dual-agent/watchdog.log` 是否 SIGKILL 重启过
5. 还不行就 `ralph-lisa start --auto` 重启（state 都在 `.dual-agent/`，重启不丢）

### 症状 3：测试在本地过、CI 红 / 反过来

- 本地过 CI 红 →大概率是 CI checkout 浅克隆（depth=1）影响了 git diff 类测试 / CI 没装 Playwright / CI 没装 codex 等三方 CLI
- 本地红 CI 过 → 大概率是本地 tmux env 污染（`RL_STATE_DIR` 残留指向 §184 tempProject 旧目录）。修：`tmux setenv -u RL_STATE_DIR && tmux setenv -u RL_SESSION_ID`
- 都红 → 优先怀疑 concurrent 测试污染 `super-rll/.dual-agent/command-events.jsonl` 这类 snapshot 类测试（§cmdRunLisa-isolation T2 是已知 flake）

### 症状 4：用户报"我跑 RLL 觉得太繁琐 / 卡在写测试计划上"

- 大概率是非编码任务（review/doc/process）走了完整 TDD
- 让用户 `ralph-lisa next-step "slug" --type review-task`（或 doc-task / process-task）走 §207 fast-path
- 详见 [`guide.md`](./guide.md) "任务类型 fast-path" 段 + [`non-coding-task-quickstart.md`](../non-coding-task-quickstart.md)

### 症状 5：CLAUDE.md / CODEX.md 里的协议看不懂

- 这两个文件是给 agent 看的协议规范，不是给人看的文档。强行从头读会爆炸
- 实际维护时按需查：知道有 §xxx 锚（看 ID Anchor Ledger）→ grep CLAUDE.md / CODEX.md 找对应段
- 系统性想理解协议设计意图 → 看 `docs/*-design.md`（设计文档目录）

### 症状 6：要加新 cli sub-cmd

1. `cli/src/cli.ts` 加 switch case
2. `cli/src/commands.ts` 加 `cmdXxx()` 函数 + 必要的 helper
3. 写 `cli/src/test/xxx.test.ts`（spawn 真 cli 跑 + 在 `cli/src/test/policy-block-static-audit.test.ts` 加 allowlist 如果会触发 §149 等）
4. 在 `docs/zh-CN/reference.md` + `docs/en/reference.md` 加文档行
5. 跑 `ralph-lisa quality-gate` 全过
6. 跟 PLAN.md current sub-slice 顺路就直接 commit；否则开新 sub-slice 走完整流程

### 症状 7：要发版

**关键约束**：版本号 bump 涉及改 `cli/package.json` / `cli/package-lock.json`（不在 process-task 白名单里——见 `cli/src/task-type.ts:42` 注释 "not blanket package.json"）。所以发版**必须**走 `code-task`，不能用 process-task 取巧。

1. `ralph-lisa next-step "vX.Y.Z-bump" --type code-task` 开 sub-slice（注意 code-task 是默认；写出来是为了显式）
2. 改 `cli/package.json` + `cli/package-lock.json` 版本号；按 §143 规则定 patch/minor/major
3. `docs/{en,zh-CN,ja}/changelog.md` 加版本段（ja 可延期翻译）
4. `cli/src/test/version-decision.test.ts` 把 pinned 版本字符串同步（包括行内 `assert.match(out, /0\.X\.Y/, ...)` 这种字面）
5. `bash build-release.sh` 出 `rll-release-vX.Y.Z.tar.gz`（约 891K）
6. 跑 `ralph-lisa dogfood-gate run --strict` + `doc-update-gate run --strict` + `release-report emit`
7. PR / merge / `git tag -a vX.Y.Z -m "..."` / `gh release create vX.Y.Z rll-release-vX.Y.Z.tar.gz`

如果你 sub-slice 主体就是改 doc（比如修 changelog 错别字），用 `--type doc-task`。如果纯改 `.rll/PLAN.md` / CLAUDE.md / docs（不动 cli 代码不动 package.json）用 `--type process-task`。判别原则：**有没有改 `cli/**` 任何东西？有就 code-task**。

---

## 设计文档索引（按需查，不必通读）

`docs/` 根目录的 `*-design.md` 是过去 sub-slice 留下的设计 SoR，按主题大致归类：

- **trust-coding 立项**：`trustcoding-product-definition.md` / `trustcoding-product-definition.md` / `trust-coding-closed-loop-design.md`
- **测试 harness 设计**：`test-harness-completion-design.md` / `test-harness-capability-evaluation.md` / `testharness-cli-webui-gate-composition.md` / `testharness-gate-comprehensive-plan.md` / `test-assertion-tiers-design.md`
- **门禁机制**：`non-coding-gate-and-mutual-attest-design.md` / `gate-bypass-diagnostic-2026-05-16.md` / `dev-harness-closed-loop-design.md`
- **数据闭环 (§D)**：`d2-phase2-event-ingestion-design.md` / `d4-review-startup-retrospective.md`
- **跨平台 PTY**：`cross-platform-terminal-backend-matrix.md` / `cli-e2e-skill-pivot-design.md` / `playwright-skill-pivot-design.md`
- **CLI 平台规划**：`rll-cli-full-platform-plan.md` / `rll-stack-proposal.md` / `super-rll-roadmap-0.7-1.0.md`
- **clarify / planning**：`clarify-phase-design.md` / `ai_native_sdlc_and_dynamic_gate_system_v_2.md`
- **第三方集成评估**：`lark-dingtalk-cli-agent-eval.md`

碰到具体 §xxx 想看原始设计也可以 grep `.rll/PLAN.md` 里的 sub-slice 段（每条都有完整 design narrative）。

---

## 常见踩坑（前任工程师血泪）

1. **绝不 `rm -rf` 外部仓库目录** — 清理临时文件用 per-file。曾经误删 margay 的 `scripts/` 整个目录（[内存：feedback-never-rm-rf-foreign-repo-dir]）
2. **绝不 premature SOR atomic flip** — `.rll/PLAN.md` 状态行从 active → closed 必须等 mutual CONSENSUS（Ralph + Lisa 双方都 [CONSENSUS]）才能改；单边 PASS 不算
3. **commit / push 仅在用户明确要求时** — 不要看到工作做完就自动提交
4. **`npm publish` 永远不做** — 发布走 GitHub Release + tarball
5. **tmux env 污染** — 跑过 §184 类 tempProject 测试后 `RL_STATE_DIR` 会残留指向已删除的 tmp 目录；后续 cli 命令都解析到错的 stateDir。`tmux setenv -u RL_STATE_DIR && tmux setenv -u RL_SESSION_ID` 修
6. **Test-Results 提交体 parse 陷阱** — `cli/src/test-results-claim-verifier.ts:39` parseTestResultClaims 用 backtick 抓 cmd，散文里 `42/42 passed` 没有 backtick cmd 在附近会被 parse 成 `cmd='?'`；写 submit body 用显式 `Test-Results: cmd="X" passed=N total=N` 行最稳
7. **`.rll/**` 不是 session-state** — 是 process slice 的 SoR，code/review/doc-task 不能改它；要改 PLAN 必须 process-task slice。曾经 §207 R3 把它 exclude 出 classification 造成 review-task 偷改 PLAN 的 bypass（Lisa R19 B1 catch）
8. **doc-task 也要过 §149 attest + doc-oracle-spec 5-col 表** — 不是说 doc-task 完全 skip 所有 gate；它 skip 的是 auto-tdd-plan + Required test row。具体见 test-harness-and-gates.md §task-type-fast-path

---

## 紧急联系

- 项目所有者邮箱：见 git log `user.email`（`さだはる` / `xiaomicytest@gmail.com`）
- Sub-slice 状态：`ralph-lisa task list` 或直接看 `.rll/PLAN.md` 顶部
- 当前 round / turn：`ralph-lisa status` 一行就清楚

如果你接手时一片混乱：先 `ralph-lisa status` + `ralph-lisa doctor` 看健康；再 `git log --oneline -20` 看最近 commit 路径；最后回到 `.rll/PLAN.md` 看 active sub-slice 是什么、停在第几 round。
