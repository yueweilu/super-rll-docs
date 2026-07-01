# RCA: 测试套件孤儿进程泄漏 → `fork: resource temporarily unavailable`

**日期**: 2026-05-30
**严重度**: P0 — 跑完 e2e/集成测试后整个 shell 会话无法 fork，开发被锁死（连 `git` / `ps` / `sleep` 都失败）。
**调查者**: Ralph（待 Lisa 独立复核根因）
**状态**: P0 止血已应用并验证（见 §10）；P1/P2 + 全局 sweep 的协议化收尾待 Lisa 审核 + 用户 gate

---

## 0. 症状

用户报告："好像每次都是在做端到端测试以后，系统进程上限耗尽。" 本会话亲历：`npm test --prefix cli` 后，任何子进程调用返回：

```
(eval):1: fork failed: resource temporarily unavailable   # EAGAIN
```

`/exit` 重启会话后短暂恢复，说明是**进程数累积撞上每用户上限**，非内存/磁盘问题。

## 1. 真实天花板（实锤）

```
$ sysctl kern.maxproc kern.maxprocperuid
kern.maxproc: 12000
kern.maxprocperuid: 8000
```

`fork EAGAIN` 的实际触发点是 **`kern.maxprocperuid = 8000`**（每 uid 进程上限），不是 `ulimit -u`（也恰为 8000，但 macOS 由 sysctl 兜底）。一旦本 uid 进程数逼近 8000 → fork 失败。

## 2. 触发命令（实锤：源码行号）

`cli/src/test/cli.test.ts:3492`：

```js
// describe("CLI: ... stale PID", afterEach @ :3472)
const r = run("auto", "test");   // 真实 legacy auto 模式，非 --engine、非 --help
```

legacy `ralph-lisa auto` 在 cwd = `cli/.test-tmp-${process.pid}/`（`cli.test.ts:14`）派生**完整守护三件套**：

- tmux session，名字取自 dir basename → `rll-test-tmp-<pid>-<hex>`
- **watcher wrapper**：`bash -c 'while tmux has-session -t <session>; do bash watcher.sh; …; sleep 5; done'`
- **watchdog wrapper**：同形 `bash -c 'while tmux has-session …; do bash watchdog.sh; …; sleep 5; done'`

这两个 wrapper 是**自重生循环**：只要 tmux session 存在，就每 5 秒重启内层 `.sh`。

## 3. 缺陷 teardown（实锤：源码对比）

`cli/src/test/cli.test.ts:3472-3484` 的 afterEach 手搓了一个**残缺**清理：

```js
afterEach(async () => {
  const dualAgent = path.join(TMP, ".dual-agent");
  for (const pidFile of ["watchdog.pid", "watcher_wrapper.pid", "watcher.pid"]) {
    try {
      const pid = parseInt(fs.readFileSync(path.join(dualAgent, pidFile), "utf-8").trim(), 10);
      if (pid > 0) process.kill(pid, "SIGTERM");
    } catch { /* … */ }
  }
  await new Promise((r) => setTimeout(r, 200));
  fs.rmSync(TMP, { recursive: true, force: true });
});
```

对比 canonical 的 `cmdStop`（`cli/src/commands.ts:3947-4034`）—— 它正确处理 **4 个** pid 文件：
`watcher.pid` / `watcher_wrapper.pid` / `watchdog.pid` / **`watchdog_wrapper.pid`**（`commands.ts:3950`）。

**缺陷 1**：afterEach 的列表 **漏了 `watchdog_wrapper.pid`** → watchdog wrapper 永不被杀。
**缺陷 2**：afterEach **从不 `tmux kill-session`** → tmux session 永久存活。
**缺陷 3**：afterEach 是 `async` + `await 200ms`，会被 `--test-force-exit` 截断（见 §4）。

## 4. 放大器：`--test-force-exit`（实锤：package.json）

`cli/package.json` test 脚本：

```
"test": "RL_COMMAND_EVENT_OFF=1 RL_LEGACY_SESSION_OK=1 node --test --test-force-exit dist/test/*.js"
```

- 并发度 = CPU 核数 = **12**（同时跑 12 个测试文件）。
- `--test-force-exit` 在测试结束时**强制 `process.exit()`**，**不等待**未完成的 async afterEach（§3 的 `await 200ms` + SIGTERM 循环会被截断）。
- 任何 crash / 我手动 `pkill -9 node --test`（安全阀）也跳过 afterEach。

→ 在 force-exit 撞上 cleanup 半途的那次运行，tmux session + 两个 wrapper **整体孤儿化**（reparent 到 launchd，ppid=1）。

## 5. 自维持机制（实锤：抓到的活体孤儿）

孤儿 watchdog wrapper 的循环条件 `tmux has-session -t rll-test-tmp-<pid>-<hex>` **永真**（session 没人杀）→ 每 5 秒永久重生。**即使目录被 `rmSync` 删掉**（watchdog.sh 文件没了），它仍：

```
tmux has-session (真) → bash watchdog.sh (文件不存在, 失败) → sleep 5 → 循环
```

每轮约 3 次 fork（`tmux` + `bash` + `sleep`）+ ≥2 个常驻进程。**永不自终止。**

### 抓到的两次复现证据

带进程采样器跑 `npm test` 两次：

- Run1 残留 tmux session：`rll-test-tmp-8665-9ff33d`
- Run2 残留：
  - tmux session `rll-test-tmp-52704-7927ec`
  - 孤儿 wrapper（ppid=1）：
    ```
    bash -c while tmux has-session -t "rll-test-tmp-52704-7927ec" …;
      do bash ".../cli/.test-tmp-52704/.dual-agent/watchdog.sh"; …; sleep 5; done
    ```
- baseline 单调泄漏：375 → 386 → 391（**每跑一次漏一组**）
- 单次干净跑峰值仅 443（基线 386）→ **单跑不会爆 8000；是跨多次运行 + 自维持累积**。

> 注：单次跑只漏「1 组三件套」看似不致命，但 (a) 每组每 5 秒持续 fork churn；(b) 跨几十次 e2e 运行累积；(c) 见 §7 跨会话叠加 → 共同逼近 8000。

## 6. §182 现有防御为何没兜住（实锤：temp-project.ts）

`cli/src/test-lib/temp-project.ts` 的 §182 防御有两层，但**都不覆盖本路径**：

- **Layer A**（`process.on('exit'/'SIGTERM')` → `cleanupAllRegisteredSessions`，:148-170）：只清经 `tempProject()` 注册进 `liveHandles` 的 session。**cli.test.ts 用自己的 `.test-tmp-${pid}` + 手动 spawn，不走 tempProject → 完全没注册 → 没覆盖**。且 Layer A **只 `tmux kill-session`，从不杀 wrapper 进程**。
- **Layer B**（`sweepDeadPidSessionsOnce`，:179-210）：扫 `rll-test-tmp-<pid>-*`，pid 死才 kill。但 (a) **被动**——只在下次某测试调 `tempProject()` 时跑一次；(b) **只清 session 不清 wrapper**；(c) 若不再跑测试，孤儿永存。

## 7. 跨会话叠加（实锤：共享 uid 池）

`kern.maxprocperuid` 是**每 uid** 而非每会话。用户提的方向 1（rll-term 开发会话跑 wezterm 测试）成立：任何**另一个项目/会话**里 spawn 守护三件套 / wezterm-mux 又没硬 teardown 的测试，孤儿进入**同一个 8000 池** → super-rll 的泄漏 + rll-term 的泄漏**叠加**。

## 8. 结论

| 维度 | 判定 |
|------|------|
| 主因（用户方向 2）| ✅ 确认：`cli.test.ts:3492` legacy `auto` spawn + `:3472` 残缺 teardown（漏 `watchdog_wrapper.pid` + 无 kill-session）+ `--test-force-exit` 截断 cleanup |
| 自维持 | ✅ 确认：孤儿 watchdog wrapper `while tmux has-session; do …; sleep 5` 永久空转，删目录也不停 |
| 放大器（用户方向 1）| ✅ 确认：跨会话/项目共享 `kern.maxprocperuid=8000` 池，叠加 |
| §182 覆盖盲区 | ✅ 确认：非 tempProject 路径未注册；两层都不杀 wrapper |

## 9. 修复方向（待 Lisa 审核后编入 PLAN）

1. **cli.test.ts teardown 复用 `cmdStop`/`ralph-lisa stop`** —— 别手搓；或补全 `watchdog_wrapper.pid` + `tmux kill-session -t <session>`。
2. **同步 exit-handler 兜底扩展** —— §182 Layer A 覆盖「非 tempProject 测试」+ 也杀 wrapper 进程（按命令行含 `rll-test-tmp-` 匹配）；放在 `process.on('exit')` **同步**执行（force-exit 也触发 exit handler）。
3. **wrapper 自终止** —— 循环加「脚本文件不存在 → break」+ 最大重启次数上限，杜绝删目录后永久空转。
4. **全局 pretest/posttest sweep** —— 跑测试前后扫杀所有 `rll-test-tmp-*` session + 含该串的孤儿 wrapper。
5. **stale-pid case 改 stub** —— 该 case 只测 stale-pid 清理逻辑，不需真起守护三件套。
6. **评估 `--test-force-exit`** —— 去掉，或确保所有 teardown 同步化（exit handler 内完成）。

### 测试计划（防回归）
- 复现 oracle：跑测试套件前后 `pgrep -f rll-test-tmp-` 计数差必须 = 0。
- wrapper 自终止：手动起一个绑定不存在 session 的 wrapper → 必须在 N 次/脚本缺失时退出。
- exit-handler 兜底：模拟 force-exit（`process.exit()` 中途）→ 注册的 session + wrapper 必须被同步清掉。

---

## 10. P0 止血已应用 (2026-05-30, 待 Lisa 审核)

按用户决策"先打 P0 止血再走协议"直接应用以下 5 项（surgical，向后兼容），并逐项验证：

### 10.1 改动清单

| # | 文件 | 改动 | 对应缺陷 |
|---|------|------|---------|
| #1 | `cli/src/test/cli.test.ts` (stale-detection afterEach) | 杀**全部 4 个** pid (watcher/watcher_wrapper/watchdog/watchdog_wrapper) SIGTERM→SIGKILL + `tmux kill-session -t generateSessionName(TMP)` | §3 缺陷1+2 |
| #2 | `cli/package.json` | `test` 脚本改为 `node --test …; rc=$?; bash scripts/sweep-test-orphans.sh; exit $rc` —— sweep **无论测试成败都跑**（不去掉 `--test-force-exit`，避免 hang 风险，改用 sweep 兜底 force-exit 截断的孤儿）；`pretest` 也加 sweep；新增 `sweep-orphans` 脚本入口 | §4 放大器 |
| #3 | `cli/src/commands.ts` (watcher+watchdog wrapper 生成串) | 循环体首加自愈 guard：`if [[ ! -f "<script>" ]]; then echo …; break; fi` —— 脚本文件被 rmSync 删掉后 wrapper 立即自退，**根除"删目录后永久空转"** | §5 自维持 + 修复方向#3 |
| #4 | `cli/src/commands.ts` `cleanStaleFiles` | 补 `watchdog.pid` + `watchdog_wrapper.pid`（原列表只清 watcher 两个） | §6 盲区 |
| #5 | `cli/scripts/sweep-test-orphans.sh` (新) | 全局清扫：kill `rll-test-tmp-*` tmux session + 引用它的 wrapper 进程 + `.test-tmp-*` 下的 watcher/watchdog.sh。**安全边界**：只匹配 `rll-test-tmp-` 前缀，绝不碰开发者 live 的 `rll-super-rll-*` / `rll-wezterm-*` attached session | 修复方向#2+#4 |

回归守护：`cli/src/test/process-leak-regression.test.ts`（新，gated on tmux）—— 机械 pin 三条不变式：(1) 脚本删除后 wrapper 自退；(2) sweep 杀孤儿 session+wrapper；(3) sweep 不碰 live `rll-super-rll-*` session。

### 10.2 验证证据

- **自愈隔离验证**：手工起 wrapper 绑真 session + 脚本，删脚本目录后 wrapper **2s 自退**（旧码会永久空转）。
- **sweep 隔离验证**：起孤儿 `rll-test-tmp-*` session+wrapper + 一个 `rll-super-rll-*` "live" session → sweep 后孤儿全杀、live session **完好**。
- **全量回归 + 泄漏 oracle**：`npm test` 全跑 **2402 tests / 2394 pass / 1 fail / 7 skip**；唯一 fail 是 `cli-functional-spawn-submit-lisa` 的 `command-event-log` snapshot **既有并发污染 flake（隔离单跑 pass，与本改动无关）**。跑前/跑后 `pgrep rll-test-tmp-` = **0/0**，tmux test-session = **0/0**，uid 进程数 492→486（不升反降）。

### 10.3 关于"内存耗尽"

生产代码（daemon/timer/listener/递归/loopback）独立审计**未发现真实内存泄漏**：所有 setInterval 带 clearInterval+unref；监听器有 removeListener；递归/loopback/重连都有 budget/退避上限；dedup 缓存有 cap 或 TTL。"内存耗尽"症状最可能是 fork-exhaustion 的连带表现（无法 fork 时各种分配/操作以类资源耗尽方式失败）。低优后续（非本因）：`wecom-inbox.md` append 无 rotation、`daemon.ts` 三个 dedup Map 超长生命周期理论增长——operational，留 follow-up。

### 10.4 待协议化收尾（需 Lisa 审核 + 用户 gate）

- temp-project.ts exit-handler 增杀 wrapper（当前靠 #3 self-heal + session-kill 已覆盖，belt-and-suspenders）。
- `ralph-lisa sweep-orphans` 提升为 cli 子命令（比 shell 脚本更可测）。
- §122/§128 等 slice-open gate 需用户在场拍 A/B/C，无法在 autonomous overnight 完成。
