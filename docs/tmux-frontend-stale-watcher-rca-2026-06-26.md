# RCA: tmux frontend repeated hang caused by stale live watcher

Date: 2026-06-26

## Summary

The RLL tmux frontend kept entering a degraded/hung state after prior RCA fixes because the running session was still using an older generated `.dual-agent/watcher.sh`.

The source and built CLI already contained the newer bounded pipe-pane give-up logic, but the live watcher process is long-running and does not automatically reload the regenerated template. The existing `update-watcher` command only rewrote `.dual-agent/watcher.sh`; it did not restart the currently running watcher. A second bug prevented a manual restart path from working: ownership detection only matched an absolute watcher path, while the actual live process command was `bash .dual-agent/watcher.sh`.

Net effect: fixes landed in code, but the live tmux frontend kept running the old watcher behavior.

## Impact

- tmux frontend panes could appear to "all hang" or stop progressing reliably.
- `watcher.log` continued to show repeated pipe-pane rebuild cycles:
  - `Pipe-pane appears dead ... rebuilding`
  - `Pipe-pane backoff ... suppressing rebuild for 60s`
- The previous fix reduced the rebuild rate but did not stop repeated cycles in already-running sessions.
- Health diagnostics did not clearly distinguish "source is fixed" from "live watcher script is stale".

## Timeline Evidence

- Recent commits showed prior fixes around tmux socket isolation and watcher process-group death:
  - `4889850 fix(tmux): isolate test tmux onto a dedicated -L socket`
  - `677dd4a fix(watcher): detached singleton supervisor`
  - `36f63b3 test(watcher): C4.b skip stopgap`
- Live `.dual-agent/watcher.log` still emitted the old message:
  - `Pipe-pane backoff: 6 rebuild attempts ... suppressing rebuild for 60s`
- Current source/built CLI generated newer watcher text containing:
  - `Pipe-pane give-up`
  - `suppressing rebuild for 60s (cycle $total)`
- Live `.dual-agent/watcher.sh` was older than the source-generated template and lacked that newer behavior.
- Attempting `node cli/dist/cli.js update-watcher --force --restart` initially printed:
  - `Watcher: PID 96551 is not ours (stale PID file), skipping signal`
- Process inspection showed the real watcher command was:
  - `bash .dual-agent/watcher.sh`

## Root Cause

### Root Cause 1: stale generated watcher script in live sessions

`watcher.sh` is generated into `.dual-agent/` at session start. Once the watcher is running, source fixes to `generateWatcherScript()` do not affect the active process.

The old `update-watcher` command wrote a fresh `.dual-agent/watcher.sh`, but did not restart the running watcher, so the live tmux frontend continued executing stale logic.

### Root Cause 2: restart ownership check rejected relative watcher paths

The process ownership guard checked whether `ps -p <pid> -o args=` contained the absolute path:

```text
<state-dir>/watcher.sh
```

The live watcher was launched as:

```text
bash .dual-agent/watcher.sh
```

That is the same watcher, but the guard rejected it as "not ours", so restart/stop-style signaling skipped the actual process.

### Root Cause 3: health check did not surface template drift

`doctor`/`status` reported heartbeat, ACKED_TURN sync, and pipe-pane rebuild density, but did not compare the on-disk `.dual-agent/watcher.sh` against the current CLI-generated template.

That made the operational state ambiguous: source could be fixed while production remained stale.

## Fix

### 1. Accept relative watcher process paths

Updated watcher ownership detection in `cli/src/commands.ts` so owned watcher processes are recognized when their argv contains any of:

- absolute watcher path
- `.dual-agent/watcher.sh`
- cwd-relative watcher path

Also tightened the `__supervise` ownership path so supervisor stop/restart remains scoped to the active state dir.

### 2. Add live watcher restart mode

Added:

```bash
ralph-lisa update-watcher --force --restart
```

Behavior:

1. Regenerate `.dual-agent/watcher.sh` from current CLI code.
2. Preserve the existing "do not spawn a watcher directly" contract.
3. If `.dual-agent/watcher.pid` points to an owned watcher, send `SIGTERM`.
4. Let the detached singleton supervisor restart the watcher using the freshly written script.

### 3. Detect stale watcher scripts in health checks

`checkWatcherHealth()` now compares:

- actual `.dual-agent/watcher.sh`
- expected `generateWatcherScript(generateSessionName(projectRoot))`

If they differ, health becomes yellow and reports:

```text
Watcher script: STALE (disk watcher.sh differs from current CLI template; run `ralph-lisa update-watcher --force --restart`)
```

### 4. Document the command in help

`ralph-lisa help` now includes:

```text
ralph-lisa update-watcher --force --restart  Refresh live tmux watcher script
```

## Live Remediation Performed

Ran against the active `super-rll` session:

```bash
node cli/dist/cli.js update-watcher --force --restart
```

Observed:

```text
old=96551
Watcher: sent SIGTERM to PID 96551
new=61591
```

Follow-up health check:

```text
Watcher Health:
  PID:               61591 (alive)
  Heartbeat:         2s ago (OK)
  ACKED_TURN sync:   matches turn.txt=ralph (OK)
  Main loop:         19/100 recent rebuild attempts (OK)
  Watcher script:    current (OK)

  Overall: OK
```

## Tests

Commands run:

```bash
npm run build
node --test dist/test/doctor-watcher-health.test.js dist/test/watcher.test.js
```

Results:

```text
npm run build: pass
doctor-watcher-health + watcher tests: 153/153 pass
```

New/updated test coverage:

- `doctor-watcher-health.test.ts`
  - current watcher template reports `scriptStale=false`
  - stale `.dual-agent/watcher.sh` reports yellow with actionable restart hint
- `watcher.test.ts`
  - `update-watcher --force --restart` rewrites watcher template
  - relative-path process command `bash .dual-agent/watcher.sh` is recognized as owned
  - owned watcher receives `SIGTERM`

## Residual Risks

- The global installed command at `/opt/homebrew/bin/ralph-lisa` points to the npm-installed package. The live remediation used local `node cli/dist/cli.js`, so the fix is active for this session but still needs normal release/install propagation before global `ralph-lisa update-watcher --force --restart` is available everywhere.
- `watcher.log` retains historical old-format lines, so short-term log tails can still show pre-fix messages. `doctor` is the source of truth for current watcher state.
- A running watcher can still enter pipe-pane degradation if tmux pipe capture is unhealthy, but the newer generated script bounds the rebuild loop and eventually gives up without blocking turn detection, which uses `capture-pane`.

## Operational Guidance

When tmux frontend behavior looks stale after watcher fixes:

1. Run:

```bash
ralph-lisa doctor
```

2. If it reports stale watcher script, run:

```bash
ralph-lisa update-watcher --force --restart
```

3. Confirm:

```bash
ralph-lisa doctor
```

Expected:

```text
Watcher script:    current (OK)
Overall: OK
```

