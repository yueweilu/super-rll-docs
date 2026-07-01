# RCA: RLL tmux frontends detached and watchers died by SIGTERM

Date: 2026-06-26

## Executive Summary

This was not a macOS sleep/reboot incident and not evidence that the tmux panes
were killed. The affected tmux sessions and Ralph/Lisa pane processes survived,
but their watcher/watchdog supervision layer died. Once that layer is gone, the
dual-pane loop no longer injects turn changes, so the frontend appears alive or
detached but cannot drive the Ralph/Lisa cycle.

The recurring failure class is process-group SIGTERM leakage from RLL tooling.
Previous fixes only isolated part of the supervision tree and skipped one known
negative-PID test path. They did not remove all remaining in-repo negative-PID
kill paths, and the watchdog wrapper was still launched through a non-detached
shell wrapper. That left live sessions vulnerable to broad SIGTERM delivery
during test/gate execution.

I did not find a macOS log entry that records the exact sender PID for the
2026-06-26 00:03:54 kill. The evidence below proves the kill type, affected
process class, timing, and remaining source hazards. The exact sender process is
not recoverable from the available local logs, so this report does not pretend
otherwise.

## Impact

- `margay-gateway`: tmux session and both panes survived, watcher/watchdog died.
- `周会分析`: tmux session and both panes survived, watcher/watchdog died.
- `margay-standard`: tmux session and both panes survived; its older incident
  happened on 2026-06-24 12:12:56.
- `super-rll`: tmux panes survived; watcher was later restarted manually during
  this investigation, but its watchdog had also logged SIGTERM at 00:03:54.

Current tmux evidence after the incident:

```text
rll-margay-gateway-ce32b7: attached=0, panes alive
rll-margay-standard-28e88b: attached=1, panes alive
rll-project-7d4cfe: attached=0, panes alive
rll-super-rll-647d25: attached=0, panes alive
```

The "three panes were detached" observation maps to `session_attached=0`.
tmux detach can be caused by a client disconnect, terminal window loss, `tmux
detach-client`, `tmux switch-client`, network/PTY closure, or terminal process
exit. In this incident, detach is a symptom, not the root cause: the pane
processes were still alive, while the loop driver processes were dead.

## Timeline

All local times are Asia/Shanghai (`+0800`).

### 2026-06-24 12:12:56: margay-standard

`../margay-standard/docs/RCA-watcher-death-2026-06-24.md` correctly identifies
that watcher/watchdog received SIGTERM. I disagree with any conclusion that the
tmux session/server itself was killed: the `rll-margay-standard-28e88b` tmux
session and both panes were still alive during this investigation.

Evidence from `~/Projects/ChatLLM/margay-standard/.dual-agent`:

```text
.watcher_heartbeat mtime: 2026-06-24 12:12:56 +0800
watcher.log mtime:   2026-06-24 12:12:56 +0800
watchdog.log mtime:  2026-06-24 12:12:56 +0800
watcher.log tail:    Terminated: 15 / Shutting down / Unexpected exit
watchdog.log tail:   Terminated: 15 / shutdown pid=98156 at 2026-06-24 12:12:56
```

### 2026-06-25 16:58:08: prior confirmed same-class bug

Commit `36f63b308162576...` records a prior confirmed RCA:

```text
test(watcher): C4.b skip stopgap — 暂禁负-pid 进程组广播,止 16:58 误杀
```

The commit message states that `process.kill(-launcherPid, SIGTERM)` killed
live RLL supervision processes after PID/process-group reuse under load. This is
important because it proves the same failure class had already happened once:
negative-PID process-group broadcast can kill unrelated live RLL sessions.

This does not prove that C4.b itself caused the 2026-06-26 00:03:54 incident.
It proves the mechanism is real and had already been confirmed in this repo.

### 2026-06-26 00:03:54: gateway + 周会 + watchdogs

`margay-gateway` and `周会分析` died in the same second. Their tmux panes stayed
alive.

Evidence from `~/Projects/ChatLLM/margay-gateway/.dual-agent`:

```text
.watcher_heartbeat mtime: 2026-06-26 00:03:53 +0800
watcher.log mtime:   2026-06-26 00:03:54 +0800
watchdog.log mtime:  2026-06-26 00:03:54 +0800
watcher.log tail:    Terminated: 15 / Shutting down / Unexpected exit
watchdog.log tail:   Terminated: 15 / shutdown pid=29620 at 2026-06-26 00:03:54
```

Evidence from `/Users/yinaruto/WorkSpace/周会分析/.dual-agent`:

```text
.watcher_heartbeat mtime: 2026-06-26 00:03:54 +0800
watcher.log mtime:   2026-06-26 00:03:54 +0800
watchdog.log mtime:  2026-06-26 00:03:54 +0800
watcher.log tail:    Terminated: 15 / Shutting down / Unexpected exit
watchdog.log tail:   shutdown pid=56247 at 2026-06-26 00:03:54
```

At the same time, `super-rll` was executing a submit/gate run:

```text
.dual-agent/command-events.jsonl:
2026-06-25T16:03:46.114Z plan exit 0
2026-06-25T16:03:51.977Z wecom-feedback
2026-06-25T16:03:57.744Z feishu-poll
2026-06-25T16:05:49.806Z submit-ralph duration 124074 exit 1

.dual-agent/test-logs/L2-exec/mqtoz9mv-7f1ab4f3.json:
command: npm test --prefix cli
started_at: 2026-06-25T16:03:46.183Z
duration_ms: 120006
exit_code: 1
```

`2026-06-25T16:03:54Z` is `2026-06-26 00:03:54 +0800`, exactly matching the
watcher/watchdog deaths.

System evidence:

- `pmset -g log` around 23:45-00:20 showed no sleep/wake/shutdown event.
- `last` showed no reboot/shutdown around the incident.
- The Mac was awake; the "user was asleep" condition is consistent with the
  evidence. This was caused by autonomous local processes, not manual operation.

## Root Cause

The root cause was incomplete elimination of process-group SIGTERM hazards in
RLL's local tooling.

Confirmed source hazards before this fix:

- E2E setup timeout used negative-PID process-group kill:
  `process.kill(isWindows ? child.pid : -child.pid, "SIGTERM")`.
- E2E teardown used negative-PID process-group kill:
  `process.kill(-setupPid, "SIGTERM")`.
- Watchdog wrapper was started via a shell `nohup bash -c ... &` wrapper rather
  than a detached Node child process. The watcher supervisor had been isolated,
  but watchdog remained exposed to process-group SIGTERM.
- Existing live sessions could be running stale generated `watcher.sh`, with no
  doctor signal telling the operator to refresh/restart the live watcher.

Why previous fixes did not solve it:

- Commit `677dd4a` fixed one real problem: watcher supervisor detachment after
  the 2026-06-24 incident. It did not detach the watchdog wrapper.
- Commit `36f63b3` skipped one known dangerous C4.b test path. It did not remove
  the other negative-PID kill sites from E2E setup/teardown.
- Because only part of the process tree was isolated, a later gate/test run
  could still deliver SIGTERM into live watcher/watchdog processes.

## Fix Implemented

Code changes:

- `cli/src/commands.ts:546` adds `descendantPids(rootPid)`.
- `cli/src/commands.ts:573` adds `terminateSpawnedProcessTree(rootPid, label)`.
- `cli/src/commands.ts:620` changes E2E setup timeout cleanup to terminate only
  the spawned descendant tree, not a process group.
- `cli/src/commands.ts:6942` changes watchdog wrapper launch to detached Node
  `spawn("bash", ["-c", watchdogLoop], { detached: true, ... })`.
- `cli/src/commands.ts:10496` changes E2E teardown cleanup to terminate only the
  spawned descendant tree.
- `cli/src/commands.ts:8001` detects stale live `watcher.sh`.
- `cli/src/commands.ts:11936` supports `ralph-lisa update-watcher --force --restart`.
- `cli/src/cli.ts:1579` exposes the refresh command in help.

Regression coverage:

- `cli/src/test/watcher.test.ts:1708` asserts the watchdog wrapper is detached
  and no E2E setup/teardown path still contains the two negative-PID kill sites.
- `cli/src/test/watcher.test.ts:2126` verifies `update-watcher --force --restart`
  rewrites the live watcher and SIGTERMs only the owned watcher process.
- `cli/src/test/doctor-watcher-health.test.ts:226` verifies stale `watcher.sh`
  becomes yellow with an actionable `update-watcher --force --restart` hint.
- `cli/src/test/watcher-supervisor.test.ts:211` still contains the old
  `process.kill(-launcherPid, "SIGTERM")` reproducer, but it is explicitly
  `it.skip(...)` and documented as the 2026-06-25 16:58 RCA hazard. It is not an
  executing production or normal test path.

Validation run:

```text
npm run build
exit: 0

node --test dist/test/watcher.test.js dist/test/doctor-watcher-health.test.js
tests: 154
pass: 154
fail: 0

node --test dist/test/cli.test.js
tests: 273
pass: 273
fail: 0
duration_ms: 102109.827292
```

Live repair performed during investigation:

```text
node cli/dist/cli.js update-watcher --force --restart
```

This refreshed/restarted the current `super-rll` watcher. It does not resurrect
watcher/watchdog processes that already died in other project sessions; those
sessions need an explicit restart/recovery.

## Residual Risk and Follow-up

- Exact SIGTERM sender PID for 2026-06-26 00:03:54 was not recorded by the
  available macOS logs. The RCA is therefore based on direct kill evidence,
  same-second correlation with `super-rll` gate execution, prior confirmed
  same-class failure, and source hazards that remained before this patch.
- Existing already-dead sessions (`margay-gateway`, `周会分析`, and older
  `margay-standard`) need operational recovery. This fix prevents newly started
  or refreshed sessions from carrying the identified hazards; it does not
  restart dead supervision trees retroactively.
- If we need sender-PID proof for future incidents, add an audit wrapper around
  all internal kill paths and log `{caller, target_pid, target_pgid, command,
  timestamp}` before delivery. macOS unified logs did not provide enough detail
  after the fact.
