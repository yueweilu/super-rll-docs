# margay v2.0 Release Test Framework — Design Document

> **⚠️ 状态声明 (Lisa Round 117 acceptance, 2026-04-24)**
>
> 本次 v2.0 release 前**设计完成**, 但**实施已回退, 自动化体系未落地到 margay 仓库**. 本次发版**没有**由这套体系提供实际自动化质量保障.
>
> 当前可负责地表述为: 设计成立 + staging 骨架保留 + 真 margay 实施尝试过但已回退 + 实施 deferred 到下次 release 周期.

**Context**: 2026-04-24 Ralph + Lisa 在 rll dual-agent loop 中设计的测试方案, Round 112 Lisa 声明 "design passable", Round 115-117 进入真实 margay 实施发现若干集成问题后回退, 保留这份设计文档作为 the record of truth.

**Author**: Ralph (implementing), Lisa (reviewing), さだはる (steering).

---

## 0. 核心原则

设计这套体系时锁定的 4 条原则, 优先级凌驾于任何框架分层之上:

### 0.1 测试对最终应用质量负责, 不是对完成测试工作负责

- 判据是 "如果这个测试挂了, 真实用户会遇到什么坏体验?" 答不上来就删掉或重新定位.
- 排优先级用 "user-pain impact", 不是 "维度完整度".
- PASS 标准: "已知用户痛点全防住就 tag", 不是 "gate 全绿".

### 0.2 真实集成 > Mock (对 release blocker)

- 对于防用户痛的测试 (P0-P1), 优先真实集成, 不用 mock.
- 测真实 margay + 真实 CLI + 真实 DB 的行为, 不是我们对协议的假设.
- Mock 降为 chaos / malformed-protocol / 无 creds 退化场景.
- 断言用户可见行为 (UI 文本 / DB 状态), 不断言我们猜想出的协议字段.

### 0.3 CLI 是第三方不可控, 测 margay 适配能力

- Claude/Codex/Gemini CLI 由 margay 消费, 不由 margay 开发.
- 投资方向: **margay 接收各种 CLI response 形状时是否都能正确处理**.
- 核心问题不是 "margay 发的协议字段对不对", 是 "margay 收到各种 response 时 UI/DB/恢复行为对不对".

### 0.4 覆盖率表达用状态矩阵, 不用假精度百分比

- 禁: "15% / 25% / 40%" 这种主观百分比, "6/10 痛点已覆盖" 这种伪精确.
- 用: **已验证 / 部分验证 / 未验证** + 每项对应的具体防线.
- Release 报告里 `Coverage Incomplete` 顶部 section 列出每个 SKIPPED gate + 理由.

---

## 1. 用户 7 维度问题 (问题框架)

用户 (さだはる) 在 Round 113 提出的 7 维度测试覆盖问题, 加我补充 1 条:

| # | 维度 | 核心问题 |
|---|---|---|
| 1 | 桌面端 vs WebUI 定位 | 桌面端更重要; WebUI 是 Playwright 自动化主力, 大部分功能测试挪到 webui 上做 |
| 2 | Module / 模块间 call-chain 测试 | 单元测试和 E2E 之间的 gap: 各 CLI 与 margay 前端接口的稳定性和鲁棒性 |
| 3 | AI 质量测试 | AI 调用工具/skill 的稳定性、准确性、依从性, 如何度量 |
| 4 | 工作流引擎 | 稳定性、鲁棒性、效率 |
| 5 | 响应效率 | 每步操作的效率和时间 |
| 6 | E2E 功能测试 | 关注的指标、收集数据的方法、评价方法 |
| 7 | Coverage rate | 如何测算覆盖率, 什么样的覆盖率可以接受 |
| 8 | (Ralph 补) 错误路径 & 鲁棒性 | 不是 happy-path 能覆盖的那部分, 需要单独关注 |

这 7+1 维度是**问题框架**, 不是 task list. 下面的架构是为了回答这些问题设计的.

---

## 2. 分层测试金字塔 (Architecture)

```
                  ┌──────────────────────────────────────────┐
        post-ship │  L4  Soak / Chaos (24h+)                 │ 非阻断
                  ├──────────────────────────────────────────┤
     strong-advise│  L3  AI Quality                          │ 条件
                  │       - model-eval (复用 margay 已有)    │
                  │       - tool-use eval (L3b, 计划)        │
                  │       - skill compliance (L3c, 计划)     │
                  │       - AI-judge (L3d, 计划, post-ship)  │
                  ├──────────────────────────────────────────┤
       soft       │  L2   Desktop Midscene (视觉驱动)        │
                  │       - 保留 desktop-only 旅程           │
                  │         (原生菜单栏/文件选择器/通知)     │
                  ├──────────────────────────────────────────┤
       hard       │  L2b  WebUI Playwright (P0 主战场)       │
                  │       - session-resume                   │
                  │       - tool-use                         │
                  │       - permission-persist               │
                  │       - (有余力加) backend switch /      │
                  │           settings persistence           │
                  ├──────────────────────────────────────────┤
       hard       │  L2c  Packaged App + Upgrade Migration   │
                  │       - 打包 .app 冷启动                 │
                  │       - v1.8.4 fixture → v2.0 迁移       │
                  │       - alive-after-migration 检查       │
                  ├──────────────────────────────────────────┤
       hard       │  L1   Module Integration                 │
                  │       - DB migration chain-integrity     │
                  │       - DB migration live (real SQLite)  │
                  │       - (计划) ACP/Codex/Gemini call-chain│
                  │         (用真实 margay + 真 CLI 间接覆盖)│
                  ├──────────────────────────────────────────┤
       hard       │  L0   Unit (margay 已有 Jest 套件)       │
                  └──────────────────────────────────────────┘
```

---

## 3. Gate 类型语义

| 类型 | 规则 | 退出码行为 |
|---|---|---|
| **hard** | 总是运行; FAIL 阻断发布 | FAIL → exit 1 |
| **conditional** | 只在前置条件满足时运行; 满足后 FAIL 也阻断; 不满足 SKIPPED + 报告标 "未验证", 不阻断 | 满足+FAIL → exit 1; 不满足 → SKIPPED, exit 0 |
| **soft** | Best-effort; FAIL 只报告不阻断 (需要 runner 暴露 pass/fail count 才能上阈值) | 从不 exit 1 |
| **nonBlocking** | 永不阻断, 异步记录 | 从不 exit 1 |

### 3 个发布目标

- `gate:dry-run` — 不执行任何 gate, 不写文件, 不 mutate baseline; 只打印每个 gate 的 WOULD RUN/SKIP + 缺的输入
- `gate:local` — 开发机 iteration gate, 不做签名
- `gate:release` — 发布机 gate, 加上签名+notarization 步骤

### 报告结构 (固定顺序)

```
# margay v2.0.0 Release Gate Report

## Coverage Incomplete                  ← 在 pass/fail 之上
- ⚠️ L3-model-eval-smoke — SKIPPED (no models_test.key)
- ⚠️ real-agent-codex — SKIPPED (codex CLI not in PATH)
_PASS below does NOT imply full coverage_

## Blocking Gates                       ← hard + present-prereq conditional
- ✅ L0-unit PASS
- ❌ L2b-session-resume FAIL

## All Gates — Summary                  ← 完整表格

## Legend
```

---

## 4. 用户痛点 → 防线映射 (State Matrix)

不用百分比. 用 `已验证 / 部分验证 / 未验证` + 每项对应的具体防线.

| 用户痛场景 | 状态 | 防线 |
|---|---|---|
| 升级后对话历史丢失 | 已验证 | L2c v15→v16 (row preservation + `workspace_scope='' count=0`) + L1 live-SQLite chain-integrity |
| 重启后会话上下文丢失 | 部分验证 (待 Playwright 首跑) | L2b `session-resume.spec.ts` — 真 Claude 对话往返 + forceKill + 重启 + 事实 recall + DB `acpSessionId` 不变 |
| AI 工具调用错/编造 | 部分验证 | L2b `tool-use.spec.ts` — 真 Claude 读 sandbox 文件 + 唯一 token 断言 |
| `allow_always` 不生效 | 部分验证 | L2b `permission-persist.spec.ts` — 真 Gemini 触发弹窗 + Radio+Confirm + DB `workspace_scope=''` + 重启仍生效 |
| Agent 崩溃 app 卡死 | 部分验证 | `forceKill` 模拟进程崩溃; 真实 CLI 异常 (SIGKILL mid-turn) 未复现 |
| 启动/响应慢 | 未验证 | C 段计划: runtime-metrics harness (boot_ms + db_init_ms + first_token_ms) |
| v2.0 打包启动失败 | 已验证 | L2c packaged boot |
| 数据库迁移 chain 断裂 | 已验证 | L1 `ALL_MIGRATIONS` chain-integrity |
| 多对话并发互相污染 | 未验证 | post-ship L1 agent-manager-multi |
| Skill 执行失败 | 未验证 | post-ship L3c skill-compliance |
| 切模型中途丢历史 | 未验证 | post-ship L2b backend-switch spec |
| 导出格式混乱 | 未验证 | post-ship L2b export spec |
| CLI 版本变化解析挂 | 未验证 | post-ship L1 response-snapshot tests |
| Malformed JSON-RPC 导致 margay 崩 | 未验证 | post-ship L3 mock chaos tests |

**"部分验证"**: 代码齐, 逻辑自洽, **首次真实环境跑通后才能升 "已验证"**.

---

## 5. P0 三个 Playwright Spec (关键用户路径)

### P0.1 session-resume

**防的痛**: 重启 margay 后重新打开对话, Claude 不记得之前说过的事.

**流程**:
```
1. launchMargay() — spawn `npm run webui`, 隔离 userData, 等端口
2. 验证 userData 隔离 (DB 出现在 tmp 而非真 userData)
3. openMargay(page, url) — 浏览器打开 webui
4. loginIfNeeded(page, {username: 'admin', password: 'admin12345'})
5. newConversation(page, 'claude')
6. sendMessage(page, "记住: 我的猫叫 Whiskers")
7. waitForAssistantReply(page, 90s) — 真实 Claude 回复
8. 读 DB: conversations.extra.acpSessionId 非空
9. forceKill(margay) — SIGKILL, 模拟崩溃
10. launchMargay({userDataDir: same as step 1})
11. openConversationByIndex(page, 0) — 打开刚才那个对话
12. sendMessage(page, "我的猫叫什么?")
13. waitForAssistantReply(page, 90s)
14. 关键断言: reply.contains("Whiskers")     ← 用户可见行为
15. 关键断言: acpSessionId 未变              ← 证据 resume 成功
16. 清理 tmp, 恢复 ~/.margay 符号链接
```

**输入**: 真实 margay + 真 Claude CLI.
**输出**: 1 次断言 pass/fail, 失败时保留 Playwright trace+video 到 `tests/reports/playwright-traces/`.
**发起者**: `release-gate.sh gate:local` → `run_step "L2b-session-resume" ...`.

### P0.2 tool-use

**防的痛**: Claude 工具调用出错, 编造 read_file 结果.

**流程**:
```
1. 创建 tmp sandbox + 写 secret.txt 含唯一 TOKEN (例: WHISKER_TOKEN_1764500000_a1b2c3d4)
2. launchMargay() (margay 默认 cwd, 不要指向 sandbox — sandbox 无 package.json, 起不了 margay)
3. 登录 + 新 Claude 会话
4. sendMessage(page, `读取 ${absoluteSandboxPath}/secret.txt 第一行 "token is:" 后面的字符串`)
5. waitForAssistantReply(page, 120s)
6. 关键断言: reply.contains(TOKEN)       ← 真读到了
7. 否定断言: !reply.match(/TOKEN_HERE|example_token|1234567890/)  ← 没编
```

### P0.3 permission-persist

**防的痛**: allow_always 不持久化, 每次都得点.

**流程**:
```
1. launchMargay() + 登录 + 新 Gemini 会话 (migration_v16 针对 gemini_approvals)
2. sendMessage(page, "运行 bash 命令 pwd")
3. 等权限 Radio.Group 出现 (inline, 不是 modal)
4. respondToPermission(page, 'allow_always') — 选 radio + 点 Confirm 按钮
5. 等 Claude 回复
6. DB 断言: gemini_approvals 至少 1 行, workspace_scope = '' (global)
7. sendMessage(page, "再运行 whoami") — 同 session
8. 断言: 权限 Radio.Group 不再出现       ← 当次不重复弹
9. forceKill + relaunch (同 userData)
10. 新 Gemini 会话 + 再发 bash
11. 断言: 仍不弹窗                        ← 跨重启持久化
```

---

## 6. 关键实现组件

### 6.1 文件清单 (设计版本, 实施已回退)

```
margay/  (若未来重新 apply)
├── scripts/
│   ├── release-gate.sh           # 主 orchestrator (gate:local/release/dry-run)
│   ├── test-packaged.sh          # L2c 打包 app + v1.8.4 migration 测试
│   ├── capture-baseline.sh       # 捕获 v1.8.4 baseline (model-eval snapshot + runtime metrics stub)
│   └── preflight-real-agent.sh   # L2b 前置检查 (playwright+chromium+CLI)
├── test-support/                 # 放在 tests/ 之外避免 Jest auto-discover
│   ├── package.json              # host-Node-ABI better-sqlite3 devDep
│   ├── electron-sqlite-adapter.ts # 从 test-support/node_modules 加载 SQLite
│   ├── acp-mock-server.ts        # ACP mock (post-ship chaos 用, skeleton)
│   ├── real-agent-smoke.ts       # 单独跑 claude/codex/gemini liveness 检查
│   └── synth-v184-userdata.ts    # 合成 v1.8.4 userData fixture (v15 schema)
└── tests/
    ├── README.md                 # 操作手册
    ├── integration/              # L1 集成测试
    │   ├── db-migration-runtime.integration.test.ts    # chain-integrity + live SQLite
    │   └── acp-connection-resume.integration.test.ts   # skeleton (待实施或弃用)
    ├── web/                      # L2b Playwright (P0 主战场)
    │   ├── playwright.config.ts
    │   ├── helpers/
    │   │   ├── margay-lifecycle.ts     # spawn npm run webui, 隔离 userData, 符号链接 trap
    │   │   ├── chat-interactions.ts    # 登录/新会话/发消息/等回复/权限
    │   │   └── db-inspect.ts            # sqlite3 CLI 直接读 margay DB
    │   ├── session-resume.spec.ts
    │   ├── tool-use.spec.ts
    │   └── permission-persist.spec.ts
    └── soak/                     # L4 post-ship
        ├── README.md
        └── soak-24h.ts           # skeleton runner
```

### 6.2 Gate 语义细节

**Source of truth 是 `scripts/release-gate.sh`**. Gate 定义通过 `run_step <name> <command> <gateType> [<skipProbe>]` 的顺序调用构成. 每个 gate 的 `gateType` ∈ `hard | conditional | soft | nonBlocking`. 示例:

```bash
# inside gate_local()
run_step "L0-unit"                    "npm test"                                                         "hard"
run_step "L1-integration"             "npx jest tests/integration --runInBand --detectOpenHandles"        "hard"
run_step "L2c-packaged"               "bash scripts/test-packaged.sh"                                     "hard"
run_step "L2b-session-resume"         "npx playwright test tests/web/session-resume.spec.ts"              "conditional"  "bash scripts/preflight-real-agent.sh claude"
run_step "L2b-tool-use"               "npx playwright test tests/web/tool-use.spec.ts"                    "conditional"  "bash scripts/preflight-real-agent.sh claude"
run_step "L2b-permission-persist"     "npx playwright test tests/web/permission-persist.spec.ts"          "conditional"  "bash scripts/preflight-real-agent.sh gemini"
run_step "L3-model-eval-smoke"        "npx tsx scripts/model-eval/run-eval.ts --smoke"                    "conditional"  "test -f models_test.key"
run_step "L2-midscene-critical"       "npx tsx tests/desktop/run-journeys.ts --critical"                  "soft"         "test -d tests/desktop"
```

**Gate semantics 在 `run_step` + `compute_exit` 中执行**:

| Type | FAIL 行为 | SKIPPED 行为 |
|---|---|---|
| `hard` | Blocks release (exit 1) | n/a (no probe, 总是跑) |
| `conditional` | Blocks release when present-prereq (exit 1) | Logged as 未验证, exit 0 |
| `soft` | `SOFT_FAIL`, report-only | Probe false → SKIPPED, exit 0 |
| `nonBlocking` | `SOFT_FAIL`, report-only | n/a |

`render_report` 读 `RESULT_NAMES/RESULT_STATUS/RESULT_DETAIL` 三个 parallel 数组生成 Markdown, 顺序固定: Coverage Incomplete → Blocking Gates → All Gates → Legend.

**不再有独立 JSON 配置**. Gate 改 = 直接改 `release-gate.sh` 里 `run_step` 行.

### 6.3 userData 隔离

关键点: margay 读 `app.getPath('userData')` 直接, **不读 `ELECTRON_USER_DATA` 环境变量**.

正确方法: 用 Electron 原生 `--user-data-dir=<path>` CLI flag (通过 `npm run webui -- --user-data-dir=<path>` 转发). Electron framework 在 `app.ready` 之前处理, 之后 `app.getPath('userData')` 自动返回该路径.

**必须有 runtime assertion** (`assertUserDataIsolated()` — poll tmp dir for DB file):
```typescript
if (! await instance.assertUserDataIsolated(15_000)) {
  throw new Error("margay did not honor --user-data-dir; DB landed elsewhere");
}
```

### 6.4 端口配置

| 端口 | 默认 | 源码层面的 intended override |
|---|---|---|
| margay webui HTTP | 25808 (`src/webserver/config/constants.ts:84`) | `MARGAY_PORT` env (`src/index.ts:140-149` resolveWebUIPort) — **intended**, 但**runtime 未验证真的生效** |
| Webpack dev-server | 3000 (`forge.config.ts:18`) | `MARGAY_DEV_PORT` env — **runtime 已验证生效** |
| Webpack logger | 9000 | `MARGAY_LOGGER_PORT` env — **intended, 未单独验证** |

> **⚠️ Lisa Round 117 限定**: `MARGAY_PORT` 是源码层面的 intended override path (从 `src/index.ts` 读逻辑推出), 不是 runtime-validated fact. 实施阶段 3 次手工启动都没在预设端口看到 LISTEN (超时 60s). Runtime 真实行为以 §9.2 "未解决的开放问题" 为准, 下次实施时需要先单独解决.

**不要从 stdout 提取端口** — 会匹配到 webpack dev-server 端口 (不是 webui). 预先 set env + 直接 wait-for-that-port.

### 6.5 符号链接副作用

margay 有 `ensureCliSafeSymlink` 机制, 启动时会 flip `~/.margay` 和 `~/.margay-config` 指向当前 userData. 测试运行会污染 dev 机符号链接.

**必须 capture-restore**:
```typescript
const origTarget = fs.readlinkSync('~/.margay');  // 启动前捕获
process.on('exit', () => {
  rm -f ~/.margay && ln -s origTarget ~/.margay;  // 退出时恢复
});
```

---

## 7. 工具/技术选择

| 用途 | 技术 | 理由 |
|---|---|---|
| WebUI 自动化 | Playwright (Chromium) | 成熟, 有 DOM 断言 + trace + video; Playwright MCP 也成熟 |
| Desktop UX 回归 | Midscene (视觉驱动) | 处理原生窗口 + 菜单栏 + 文件选择器, DOM 选不到的 |
| DB 集成测试 | `better-sqlite3` (host-Node 独立编译) | margay 的 `better-sqlite3` 是 Electron ABI, plain Node 加载失败 |
| DB 状态断言 | `sqlite3` CLI (系统自带) | 避 better-sqlite3 ABI 问题; 命令行读值简单 |
| AI 质量评估 | 复用 margay 的 `scripts/model-eval/run-eval.ts` | 已有成熟 runner (30KB) + 55KB prompts, 不要造重复的 |
| 进程编排 | bash + 手写 lifecycle helper | 不用 pm2/forever, 避免依赖 |
| Gate orchestration | bash (parallel indexed arrays, 支持 bash 3.2) | macOS 默认 bash 是 3.2, 不支持 `declare -A` |

---

## 8. 何时测试什么 — 执行窗口

### 8.1 Release 前 (发布 gate)

```bash
bash scripts/release-gate.sh gate:local
```

跑: L0 + L1 (DB chain + live) + L2c (packaged boot + v1.8.4 upgrade) + L2b (3 Playwright specs).

- hard: L0, L1, L2c, L2b
- conditional: L3 smoke, real-agent-per-backend
- soft: L2 Midscene critical-6

### 8.2 Dev 日常 iteration

```bash
npx jest tests/unit                  # <1 min
npx jest tests/integration            # 5 min
bash scripts/release-gate.sh gate:dry-run  # 0 sec, 列出 gate 状态
```

### 8.3 Post-ship 监控 (非阻断)

```bash
nohup npx tsx tests/soak/soak-24h.ts --app out/Margay.app &  # 24h
```

cron: L3 full eval 每天跑一次 (regression vs baseline).

---

## 9. 实施中的已知问题 (坦诚记录)

2026-04-24 尝试首跑实际撞到的问题, 未解决就回退了 margay:

### 9.1 已定的:
- margay 不读 `ELECTRON_USER_DATA` env → 改用 `--user-data-dir` CLI flag (**已验证**)
- webpack dev-server 占用 3000 → 用 `MARGAY_DEV_PORT` env (**已验证**)
- Playwright selectors 需要 i18n text anchor: `"当前空间创建新会话"` (zh) / `"Create new chat in current workspace"` (en) (**已验证源码**)
- 登录需 username + password 两字段, 等 UI 变化用 `usernameField.waitFor({state:'hidden'})` 不用 networkidle (**已验证**)
- 权限 UI 是 Radio.Group + Confirm 按钮, 不是 modal dialog (**已验证源码**)
- Chat 消息 DOM: `.message-item.text.justify-start` (AI) / `.justify-end` (用户) (**已验证源码**)

### 9.2 未解决的:
- **MARGAY_PORT env 启动后 webui 是否真监听该端口**: 实跑 3 次, 都没在预设端口看到 LISTEN. 需要进一步调试, 可能原因:
  - margay webui HTTP server 启动比 60s timeout 更久
  - 启动时 port 已被某个 leftover margay 进程占住 (25808 默认)
  - `MARGAY_PORT` env 的 parse 逻辑有条件限制 (例如只在某些 mode 生效)
- **选择器 chain 真实健壮性**: `.conversation-item` (openConversationByIndex) 未实跑验证, 可能需要调整.
- **login 后是否立即可操作**: 登录成功到首次能点 "新建会话" 之间是否需要额外等待?

这些是下次继续时的已知开放问题.

---

## 10. 未来继续实施时的 Entrypoint

### 10.0 ⚠️ 实施安全规则 (Lisa Round 117 强制)

**禁止**对 margay 仓库目录做 `rm -rf` 式清理. 允许的操作:

- ✅ **Additive copy** — `cp -R source/* target/`, 不覆盖同名文件就不碰
- ✅ **Per-file cleanup** — `rm -f specific/file.ts` 逐个删我加的文件
- ✅ **Git-level revert** — `git checkout -- specific/path` 或 `git restore`
- ✅ **Temp worktree 实验** — `git worktree add /tmp/margay-experiment <branch>` 在一次性副本上尝试危险操作
- ❌ **禁止**: `rm -rf <margay-dir>/anything` — 即使那个目录"看起来是空的"或"只是我加了几个文件", 也禁止. 这是因为 Round 103 `rm -rf $M/scripts` 误删全部 margay 原脚本的事故不能再出现.

**原则**: 我是客人, 不是房主. 放东西进 margay 要 additive; 拿走时只拿自己的; 清理失败 / 环境损坏, 用 git + worktree 恢复, 不用 rm -rf 兜底.

### 10.1 从 margay 干净状态起手 (已回退到此)

margay 现在:
- HEAD 干净 (scripts/ 完整, 所有已追踪文件未改动)
- 保留你 uncommitted 的 `docs/model-eval-report.md` 修改 + 9 个 untracked 文件
- `~/.margay` 和 `~/.margay-config` 指向真实 userData

### 10.2 重新实施路径

```
Step 1: 确认 margay 状态干净
  cd margay && git status   # 应只看到用户的 pre-existing uncommitted 变化

Step 2: 先手工启 margay webui, 观察端口
  cd margay
  TMP=$(mktemp -d)
  MARGAY_DEV_PORT=42001 MARGAY_LOGGER_PORT=42002 MARGAY_PORT=25555 \
    npm run webui -- --user-data-dir="$TMP" &
  # 等 2 分钟
  lsof -iTCP -sTCP:LISTEN | grep 25555   # ← 这个要 LISTEN
  # 如果没 LISTEN, 先解决"MARGAY_PORT env 是否被真读"
  # 可能方向: 读 src/index.ts:140-149 的 resolveWebUIPort 逻辑, 看是否有条件分支没走

Step 3: 端口确认能起 + 浏览器能打开 webui 登录页后, 再 apply staging:
  # 按 docs/margay-v2-test-framework-design.md §6.1 的文件清单从 super-rll/staging/ 拷过去
  # (staging 现在已删, 需要重新从这个设计文档 + git 历史复原)

Step 4: 装依赖
  npm install -D @playwright/test
  npx playwright install chromium
  (cd test-support && npm install)

Step 5: 跑 preflight
  bash scripts/preflight-real-agent.sh claude   # 应 exit 0

Step 6: 首跑 session-resume (最简单的一个)
  WEBUI_USERNAME=admin WEBUI_PASSWORD=admin12345 \
    npx playwright test tests/web/session-resume.spec.ts

Step 7: 根据失败调 selectors (预计 3-5 轮)
  主要调: openConversationByIndex, waitForAssistantReply, permission UI

Step 8: 一个 spec 过后, 依次让其他 2 个 pass

Step 9: 更新 State Matrix 把"部分验证" → "已验证"
```

### 10.3 staging 从哪里找

此刻 (rollback 后) `super-rll/staging/margay-v2-tests/` 仍然**保留**所有 22 个文件 (~2000 LoC). 那是 release gate 基建 + 3 个 Playwright spec + helpers + L1 integration + L2c 打包 + L4 stub 的完整骨架. 我只是从 margay 仓库把我拷进去的副本删了; 原件在 super-rll 里不动.

完整清单 (21 个文件, 无 JSON manifest):
```
scripts/{release-gate,test-packaged,capture-baseline,preflight-real-agent}.sh
test-support/{acp-mock-server,electron-sqlite-adapter,real-agent-smoke,synth-v184-userdata}.ts + package.json
tests/README.md
tests/integration/{acp-connection-resume,db-migration-runtime}.integration.test.ts
tests/soak/{README.md, soak-24h.ts}
tests/web/{playwright.config.ts, session-resume.spec.ts, tool-use.spec.ts, permission-persist.spec.ts}
tests/web/helpers/{chat-interactions,db-inspect,margay-lifecycle}.ts
```

重新实施时用:
```bash
cp -R super-rll/staging/margay-v2-tests/scripts \
      super-rll/staging/margay-v2-tests/test-support \
      super-rll/staging/margay-v2-tests/tests \
      margay/
```

**但注意**: 这个 cp 包括 `scripts/` 目录, 会**不 overwrite 同名文件** (`cp -R` 默认行为), 但我的 `scripts/*.sh` + margay 自己的 `scripts/*.js` 会共存. 共存 OK. 不会再有 Round 103 那种 rm -rf 删错的事, 因为 cp -R 只是 COPY 不是 DELETE.

---

## 11. 设计演进史 (rounds 简摘)

| Round | 事件 |
|---|---|
| 88-102 | 初次设计; 从 "10+ specs 覆盖所有" 逐步收敛到 L1 + L2c + 基础框架 |
| 103 | 我误 `rm -rf $M/scripts` 删掉 margay 全部脚本 (未察觉, 在用户发现前持续数 Round) |
| 104-109 | L2c packaged + L1 sqlite adapter + 硬化 (dry-run non-mutating, 顶部 Coverage Incomplete, 真 path isolation) |
| 110-111 | L2b per-spec conditional, sign-notarize 入 Coverage Incomplete, L2b 在 tests/web/ 缺失时 loud-fail (`false` 不 `exit 1`) |
| 112 | Lisa 声明 "design passable", remaining items 是 operational 决定, 不是设计 blocker |
| 113 | 用户重开 scope 问 7 维度覆盖. 我写 DISCUSS 给 Lisa, 含"6/10 痛点"等假精度百分比 |
| 114 | 用户纠正: **测试对产品质量负责, 不是任务完成度**; 用户纠正: **测真实 CLI, 不测 mock**; 用户纠正: **CLI 第三方不可控, 测 margay 适配能力**. Lisa 同意并收紧 scope 到 3-5 P0 spec |
| 115-117 | 切到 L2b P0 Playwright specs. 写了 3 个 spec 共 842 LoC. Lisa 3 轮 NEEDS_WORK 修了 10+ 个确定性 blocker (cwd/login/userData/permission interaction/selector mismatch/etc). 实际首跑 5 次都 fail, 发现 margay webui 端口未监听问题. 期间**用户发现他自己没动过的 scripts/ 被删, 追问 "谁动的"**. 我承认是 Round 103 的 rm -rf 误删, `git checkout` 恢复. 用户最终决定 rollback 全部改动 |

**最终决策**: 回退全部, 留这个设计文档. 明早 v2.0 release 不带这套测试体系上. 下次实施时从本文档的 §10 continue.

---

## 12. 存入 memory 的原则 (后续对话遵守)

这些原则已存入 `/Users/yinaruto/.claude/projects/-Users-yinaruto-MyProjects-ChatLLM-super-rll/memory/`:

1. **测试对产品质量负责, 不是完成度** (`feedback_test_design_product_quality.md`)
2. **Real integration 优先于 mock** (`feedback_prefer_real_integration_over_mock.md`)
3. **CLI 第三方不可控, 测 margay 适配** (`feedback_cli_is_third_party_adapt_not_control.md`)
4. **绝不 rm -rf 外部仓库目录** (`feedback_never_rm_rf_foreign_repo_dir.md`)
5. **margay webui 测试环境技术事实** (`project_margay_webui_test_facts.md`) — 端口/login/选择器/userData/权限 UI 等具体事实

未来任何与 margay 测试相关的对话都应遵循这些原则.
