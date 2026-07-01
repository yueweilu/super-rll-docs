# RCA: 2026-06-26 RLL tmux 前端 SIGTERM 事件时间线

Date: 2026-06-26
Timezone: Asia/Shanghai (+0800)
Author: Codex investigation notes

## 结论

这次不是人工操作、不是 macOS 睡眠/重启、不是 Terminal 崩溃、不是 tmux server 崩溃，也不是 tmux pane 里的 `claude.exe` / `node` 业务进程死亡。

确认死亡的是 RLL 的 watcher / watchdog / supervisor 前端驱动层。tmux session 和 pane 进程仍然存活，但多个 session 的 watcher/watchdog 在 2026-06-26 00:03:54 同秒收到 SIGTERM。结果是 Ralph/Lisa 双 pane 看起来还在，实际 turn 推进和投递能力已经停掉。

最贴近且证据链自洽的触发源是 `super-rll` 在 00:03:45 发起的：

```bash
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

该 submit gate 启动了 `npm test --prefix cli`，死亡发生在 gate 启动约 9 秒后。后续 `super-rll` 自己的复盘也记录：当时清理了 14 个泄漏的 `feishu-poll` loop；旧版 `runFeishuPollHook` 缺少 singleton / §127 cleanup，gate 跑 `--feishu` 测试会泄漏轮询进程。

macOS unified log 没有记录普通 `kill(2)` 的 sender PID，所以现有日志无法恢复“精确发送 SIGTERM 的 PID”。但从时间窗、死亡指纹、命令链和后续 RCA，可以定位到触发命令级别：`super-rll` 的 submit gate / `npm test --prefix cli`，不是人干预。

## 影响范围

- `rll-margay-gateway-ce32b7`: tmux pane 存活；watcher/watchdog 在 00:03:54 死亡。
- `rll-project-7d4cfe` / `周会分析`: tmux pane 存活；watcher/watchdog 在 00:03:54 死亡。
- `rll-super-rll-647d25`: tmux pane 存活；watchdog 在 00:03:54 记录 shutdown，后续被手动重启恢复。
- `rll-margay-standard-28e88b`: 本次检查时仍 attached；其旧 watcher 问题属于更早的 2026-06-24 事件，不纳入 6 月 25 日 23:00 后主时间线。

当前 pane 证据显示业务进程未死：

```text
rll-margay-gateway-ce32b7  pane_pid=29582  current=claude.exe  dead=0
rll-margay-gateway-ce32b7  pane_pid=29589  current=node        dead=0
rll-margay-standard-28e88b pane_pid=98106  current=claude.exe  dead=0
rll-margay-standard-28e88b pane_pid=98111  current=node        dead=0
rll-project-7d4cfe         pane_pid=56211  current=claude.exe  dead=0
rll-project-7d4cfe         pane_pid=56219  current=node        dead=0
rll-super-rll-647d25       pane_pid=7927   current=claude.exe  dead=0
rll-super-rll-647d25       pane_pid=7932   current=node        dead=0
```

## 时间线

只列 2026-06-25 23:00 之后的关键事件。UTC 日志时间需加 8 小时换算为本地时间。

| 本地时间 | 事件 | 证据 |
|---|---|---|
| 23:32-23:57 | `周会分析` RLL 正常活动，连续 `submit-ralph/lisa`、gate、consensus 等。 | `/Users/yinaruto/WorkSpace/周会分析/.dual-agent/command-events.jsonl` |
| 00:00:02 | `周会分析` 最后一条 23:00 后 RLL 命令是 `whose-turn`，无 `stop`。 | `captured_at=2026-06-25T16:00:02.931Z` |
| 00:02:26 | WorkSpace Claude 定时任务 `军师巡检` 触发。 | Claude transcript: `scheduled_task_fire`, `Running scheduled task (Jun 26 12:02am)` |
| 00:02:48 | 定时巡检执行 `tmux ls`，当时 4 个 RLL session 均可见。 | WorkSpace transcript 中 `tmux ls` 输出 |
| 00:03:35 | `super-rll` 写入 `[FIX]` 提交说明，其中提到清 `.stop`、旧 wrapper kill、新 wrapper pid 68419、驱动 `ralph-lisa feishu-poll`。 | super-rll Claude transcript |
| 00:03:45 | `super-rll` 执行 `ralph-lisa submit-ralph --file .dual-agent/submit.md`，submit gate 开始。 | super-rll transcript tool_use |
| 00:03:54 | `gateway`、`周会分析/project`、`super-rll` watcher/watchdog 前端层同秒出现 SIGTERM/shutdown。 | 各 `.dual-agent/watchdog.log` / `watcher.log` |
| 00:04:08 | WorkSpace 巡检仍能继续报告 session 状态，说明系统和 Claude 前台没有在 00:03:54 崩溃。 | WorkSpace transcript |
| 00:05:49 | `super-rll` submit gate 返回：`npm test --prefix cli` 失败，Gate BLOCKED。 | super-rll transcript tool_result |
| 之后 | `super-rll` 自复盘记录 watcher + supervisor 双死、手动重启、清理 14 个泄漏 `feishu-poll` loop。 | super-rll transcript / memory |

## 直接证据

### 1. watcher/watchdog 收到 SIGTERM

`margay-gateway`:

```text
Terminated: 15
tup pid=29620 at 2026-06-25 21:25:14 — monitoring watcher ...
[Watchdog] shutdown pid=29620 at 2026-06-26 00:03:54
[Watchdog] shutdown pid=29620 at 2026-06-26 00:03:54
```

`周会分析/project`:

```text
Terminated: 15
tup pid=56247 at 2026-06-25 19:27:51 — monitoring watcher ...
[Watchdog] shutdown pid=56247 at 2026-06-26 00:03:54
[Watchdog] shutdown pid=56247 at 2026-06-26 00:03:54
```

`super-rll`:

```text
Terminated: 15
tup pid=7963 at 2026-06-25 20:11:15 — monitoring watcher ...
[Watchdog] shutdown pid=7963 at 2026-06-26 00:03:54
[Watchdog] shutdown pid=7963 at 2026-06-26 00:03:54
```

这说明是信号 15（SIGTERM），不是 Node OOM、panic、tmux pane exit 或普通命令自然退出。

### 2. 没有正常 `ralph-lisa stop` 证据

- 23:00 后相关 `command-events.jsonl` 未见这些 session 的 `stop`。
- watcher 日志出现 `Unexpected exit`，而不是正常 graceful stop 路径。
- `.graceful_stop` 正常停止标记没有参与这次事件。

### 3. `super-rll` submit gate 与死亡同窗

`super-rll` transcript 中 00:03:45 的命令：

```bash
cd ~/Projects/ChatLLM/super-rll
ralph-lisa submit-ralph --file .dual-agent/submit.md 2>&1 | tail -10
```

00:05:49 返回：

```text
PASS plan validate
PASS rll-team-platform plan validate
FAIL npm test --prefix cli
PASS npm test --prefix wecom-bot
PASS npm test --prefix cli-e2e
Gate BLOCKED submission:
  - npm test --prefix cli: exit code 1
```

死亡发生在 submit gate 启动后约 9 秒。

### 4. 后续自复盘与泄漏进程清理

`super-rll` 后续记录：

```text
watcher 双死复盘 (2026-06-26): session 中 watcher + supervisor(pid 7953)双死("Terminated:15")→ loop 停 30min。
我手动重启 supervisor(...) detached)复活。
清理了 14 个泄漏 feishu-poll loop(runFeishuPollHook 旧版无 singleton/§127,gate 跑 --feishu 测试每次泄漏一个)。
关键 carry-forward: gate(npm test)清掉泄漏 loop 后不再杀 watcher;poll loop 必须 singleton + §127 opt-out。
```

这不是独立原始日志，但它和 00:03:45 submit gate / 00:03:54 SIGTERM / 00:05:49 gate blocked 的时间线一致。

## 排除项

### 排除 tmux server 崩溃

tmux session 仍可列出，pane 进程 `dead=0`。如果 tmux server 崩，pane 不会以这种形态继续存在。

### 排除 pane 内业务进程崩溃

`tmux list-panes` 显示 `claude.exe` 与 `node` 均仍存活，`dead=0`。死亡的是 watcher/watchdog，不是 pane 内任务。

### 排除人手动 stop

23:00 后没有对应 `ralph-lisa stop` 命令事件；死亡日志也不是 graceful stop。

### 排除系统睡眠/重启/终端整体崩溃

WorkSpace Claude 在 00:04 仍继续运行并输出巡检结果，说明系统和该前台 session 未在 00:03:54 崩溃。现有系统日志也没有显示该窗口有 sleep/reboot/shutdown。

## 根因链

确认事实：

1. 00:03:54 多个 watcher/watchdog 同秒收到 SIGTERM。
2. tmux server、tmux panes、pane 内 `claude.exe/node` 均未死。
3. 23:00 后没有人工 `stop` 命令证据。
4. 00:03:45 `super-rll` 发起 submit gate，00:05:49 gate 因 `npm test --prefix cli` blocked。
5. 后续 `super-rll` 自复盘记录清理 14 个泄漏 `feishu-poll` loop，来源是旧版 `runFeishuPollHook` 无 singleton / cleanup。

推断链：

1. `super-rll` 的 submit gate 启动 `npm test --prefix cli`。
2. gate/test/cleanup 路径处理了泄漏的 `feishu-poll` wrapper 或相关子进程。
3. 旧 watcher/watchdog/supervisor 隔离不足，仍可能被进程组级 SIGTERM 连根杀。
4. SIGTERM 在 00:03:54 命中多个 session 的 watcher/watchdog 前端层。
5. tmux pane 继续存活，但 loop 驱动消失，所以表现为“前端挂掉 / 双 pane 接不回来 / turn 不再推进”。

## 不能从现有日志恢复的内容

不能恢复精确 sender PID。macOS unified log 默认不记录普通 `kill(2)` 的发送者 PID；RLL gate 输出也被后续运行覆盖，无法还原当时哪个子测试或 cleanup 分支直接调用了 kill。

因此本报告只给出可证实的命令级定位：`super-rll` 的 submit gate / `npm test --prefix cli` 是触发窗口内唯一与 SIGTERM 同步、且后续复盘自洽的进程链。

## 后续建议

1. 所有内部 kill 路径在发送信号前写审计日志：`caller`, `target_pid`, `target_pgid`, `signal`, `cwd`, `argv`, `timestamp`。
2. 禁止 live session gate/test 使用负 PID 广播，或必须放进一次性隔离进程组/沙箱。
3. `feishu-poll` 这类后台 loop 必须 singleton，并纳入 §127 cleanup。
4. watcher/watchdog/supervisor 必须 detached，且 supervisor 与被守护 watcher 不在同一可被测试 cleanup 命中的进程组。
5. 对已死的 watcher/watchdog session 做显式 operational recovery；tmux pane 活着不代表 RLL loop 活着。
