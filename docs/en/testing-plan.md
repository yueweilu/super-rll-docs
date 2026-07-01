# Ralph-Lisa Loop v0.4.0 — Complete Test Plan

## Overview

This plan covers all features from the v0.4.0 release cycle:
- Fix A: TmuxUI file-tail rewrite
- Fix B: Transport debug logging
- Fix C: Codex 0.40+ compatibility (sandbox + UUID + threadId)
- Fix D: Transport → UI direct streaming
- P0: watch-lisa (persistent connection watcher)
- P1: ralph-lisa review (stateless one-shot)
- P2: Git post-commit hook
- P4: MCP truncation + handoff fixes
- P5: Multi-IDE rule files (Windsurf, Cline)
- P6: IDE Integration documentation
- Layer 2: Phase completion triggers in Ralph template

---

## 1. Prerequisites

### Mac

```bash
node -v          # >= 18
git --version
claude --version # Claude Code CLI
codex --version  # Codex CLI
tmux -V          # for --ui tmux tests
```

### Windows

```powershell
node -v          # >= 18
git --version
claude --version
codex --version
echo $env:WT_SESSION  # non-empty if inside Windows Terminal
```

---

## 2. Automated Tests (Run First)

```bash
cd cli
npm run build
npm test
```

**Expected**: 627/627 pass, 0 fail

---

## 3. Init / Uninit (All Platforms)

### 3.1 Init creates all IDE files

```bash
mkdir /tmp/rll-test-init && cd /tmp/rll-test-init && git init
ralph-lisa init    # or: node <path>/cli/dist/cli.js init
```

**Verify**:
- [ ] `CLAUDE.md` exists, contains `RALPH-LISA-LOOP` marker
- [ ] `.cursorrules` exists, contains marker
- [ ] `.windsurfrules` exists, contains marker
- [ ] `.clinerules` exists, contains marker
- [ ] `.github/copilot-instructions.md` exists, contains marker
- [ ] `CODEX.md` exists, contains marker
- [ ] `.git/hooks/post-commit` exists, contains `ralph-lisa review`
- [ ] `.dual-agent/` directory exists with turn.txt, round.txt, step.txt
- [ ] Console shows all files created + usage instructions (IDE / CLI / one-shot)

### 3.2 Phase completion triggers in template

```bash
grep "When to Submit" CLAUDE.md
grep "Phase Completion Triggers" .cursorrules
```

**Verify**:
- [ ] Both files contain the mandatory triggers table (PLAN/CODE/FIX/commit/CONSENSUS)
- [ ] Both mention `auto-review.md` advisory channel

### 3.3 Re-init is idempotent

```bash
ralph-lisa init   # run again
```

**Verify**:
- [ ] Console shows "Updating" not "Creating" for existing files
- [ ] File contents are fresh (latest template)
- [ ] No duplicate marker blocks

### 3.4 Uninit cleans everything

```bash
ralph-lisa uninit
```

**Verify**:
- [ ] `CLAUDE.md` removed (or cleaned if had pre-existing content)
- [ ] `.cursorrules` removed
- [ ] `.windsurfrules` removed
- [ ] `.clinerules` removed
- [ ] `.github/copilot-instructions.md` removed
- [ ] `CODEX.md` removed
- [ ] `.git/hooks/post-commit` removed
- [ ] `.dual-agent/` removed
- [ ] `.claude/` cleaned
- [ ] `.codex/` cleaned

---

## 4. Engine Mode — Quiet (Mac + Windows)

### 4.1 Ralph=Claude, Lisa=Codex

```bash
mkdir /tmp/rll-test-quiet && cd /tmp/rll-test-quiet && git init
ralph-lisa auto --engine --ralph-backend claude --lisa-backend codex \
  --task "say hello and exit" --max-rounds 3 --auto-approve --debug --ui quiet
```

**Verify**:
- [ ] Ralph connected, Lisa connected
- [ ] Round 1: Ralph [PLAN], Lisa responds with tag ([NEEDS_WORK] or [PASS])
- [ ] Round 2+: Ralph responds, Lisa responds
- [ ] No `invalid type: boolean false` errors (Fix C v1)
- [ ] No `Failed to parse thread_id` errors (Fix C v1)
- [ ] No `Session not found` errors (Fix C follow-up)
- [ ] Debug logs created in `.dual-agent/debug/`:
  - [ ] `coordinator.log` has prompt_sent/prompt_response events
  - [ ] `ralph-raw-io.log` has spawn/stdin_raw/stdout_raw/exit events
  - [ ] `lisa-raw-io.log` has spawn/stdin_raw/stdout_raw/exit + `thread_id_adopted` event
- [ ] Exit with max-rounds or consensus (not crash)

### 4.2 Windows-specific checks

- [ ] Run from local drive (D:\), not SMB share (Z:) — avoids EBADF
- [ ] DEP0190 warning appears but doesn't break functionality
- [ ] `.dual-agent/debug/*.log` files are non-empty

---

## 5. Engine Mode — tmux (Mac Only)

```bash
mkdir /tmp/rll-test-tmux && cd /tmp/rll-test-tmux && git init
ralph-lisa auto --engine --ralph-backend claude --lisa-backend codex \
  --task "say hello" --max-rounds 3 --auto-approve --ui tmux
```

Then in another terminal: `tmux attach -t rll-engine`

**Verify**:
- [ ] tmux session created, attach works
- [ ] Left pane: Ralph's **full submission text** streams live (not just `─── [TAG] Round N ───` divider)
- [ ] Right pane: Lisa's **full review text** streams live
- [ ] No `zsh: command not found` errors in panes (Fix A)
- [ ] Status bar shows `Round N | turn | step | status`
- [ ] Special characters in submissions render correctly ([CODE], $HOME, backticks)

---

## 6. Engine Mode — wt (Windows Only)

Must run inside Windows Terminal:

```powershell
mkdir D:\temp\rll-test-wt; cd D:\temp\rll-test-wt; git init
node <path>\cli\dist\cli.js auto --engine --ralph-backend claude --lisa-backend codex `
  --task "say hello" --max-rounds 3 --auto-approve --ui wt
```

**Verify**:
- [ ] Windows Terminal opens a new tab with two panes
- [ ] Left pane: Ralph output streams (not garbled — UTF-8 fix)
- [ ] Right pane: Lisa output streams
- [ ] No PowerShell `;` parsing errors (script-file fix)
- [ ] Fallback: running outside WT shows warning + falls back to split mode

---

## 7. run-lisa (Single Round)

```bash
cd /tmp/rll-test-init   # a project with init done
ralph-lisa init
# Submit some work as Ralph
echo "[PLAN] Test plan for hello world" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
# Now run Lisa
ralph-lisa run-lisa --lisa-backend codex --auto-approve
```

**Verify**:
- [ ] Lisa connects and returns a review to stdout
- [ ] Review contains a tag ([PASS] or [NEEDS_WORK])
- [ ] `.dual-agent/review.md` is updated
- [ ] `turn.txt` flips back to `ralph`

---

## 8. watch-lisa (Persistent Watcher)

### Terminal 1:

```bash
cd /tmp/rll-test-init
ralph-lisa watch-lisa --lisa-backend codex --auto-approve
```

**Verify**:
- [ ] Console shows "Lisa connected — watching for Ralph's submissions"
- [ ] Process stays alive (doesn't exit)

### Terminal 2:

```bash
cd /tmp/rll-test-init
echo "[PLAN] Watch test plan" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

**Verify in Terminal 1**:
- [ ] Watcher detects turn change: `📥 Ralph [PLAN] Round N — sending to Lisa...`
- [ ] Lisa responds: `📤 Lisa [NEEDS_WORK/PASS] Round N — review written`
- [ ] Watcher continues watching (doesn't exit)

### Round 2 (same Terminal 2):

```bash
echo "[FIX] Addressing Lisa's feedback" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

**Verify**:
- [ ] Watcher picks up again automatically
- [ ] Lisa has context from Round 1 (persistent connection — mentions previous review)

### Error recovery:

- [ ] Ctrl+C in Terminal 1: "Stopping Lisa watcher... Lisa disconnected." clean exit
- [ ] If Lisa transport errors: watcher logs error but continues (doesn't crash)

---

## 9. review (Stateless One-Shot)

### 9.1 With changes

```bash
cd /tmp/rll-test-init
echo "console.log('hello')" > hello.js
git add hello.js
ralph-lisa review --auto-approve --lisa-backend codex
```

**Verify**:
- [ ] Review output appears on stdout
- [ ] Contains [PASS] or [NEEDS_WORK] tag
- [ ] References the actual file changes

### 9.2 With --scope

```bash
echo "test" > src/test.js
git add src/test.js
ralph-lisa review --auto-approve --scope "src/"
```

**Verify**:
- [ ] Review only covers `src/` changes
- [ ] Does NOT fall back to unscoped diff if `src/` has no changes (reports error instead)

### 9.3 No changes

```bash
git stash  # clear all changes
ralph-lisa review --auto-approve
```

**Verify**:
- [ ] Error message: "no changes found"
- [ ] Exit code non-zero

### 9.4 Security: scope injection

```bash
ralph-lisa review --scope '$(echo pwned)'
```

**Verify**:
- [ ] No shell command execution (execFileSync prevents injection)
- [ ] Either reviews files matching literal path or reports no changes

---

## 10. Git Post-Commit Hook

```bash
cd /tmp/rll-test-init
ralph-lisa init
echo "test" > hooktest.txt
git add hooktest.txt
git commit -m "test hook"
```

**Verify**:
- [ ] Console shows `[ralph-lisa] Post-commit: triggering Lisa review...`
- [ ] After ~30-60 seconds, `.dual-agent/auto-review.md` contains a review
- [ ] Review does NOT appear on terminal stdout (redirected to file)

---

## 11. MCP Server

```bash
ralph-lisa mcp-server
```

Send JSON-RPC via stdin:
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
```

**Verify**:
- [ ] Server responds with valid initialize result
- [ ] `rll_lisa_review` returns full review (not truncated to 500 chars — P4 fix)
- [ ] `rll_handoff` returns `final_work` and `final_review` fields (P4 fix)

---

## 12. Debug Logging (--debug)

Run any engine command with `--debug`:

```bash
ralph-lisa auto --engine --task "test" --max-rounds 2 --auto-approve --debug --ui quiet
```

**Verify**:
- [ ] Console shows `🔎 Debug logging enabled → <path>/debug/`
- [ ] `coordinator.log`: NDJSON with prompt_sent, prompt_response, resend_attempt (if any)
- [ ] `ralph-raw-io.log`: spawn, stdin_raw (full payload, not truncated), stdout_raw, exit
- [ ] `lisa-raw-io.log`: same + thread_id_adopted event
- [ ] Raw payloads are NOT truncated (no `...truncated N chars` in transport logs)
- [ ] Coordinator previews ARE truncated (promptPreview, outputPreview — expected)

---

## 13. Cross-Platform Path Handling

### Mac/Linux
- [ ] All paths use `/` separator
- [ ] `os.tmpdir()` used (not hardcoded `/tmp`)

### Windows
- [ ] Paths work with `\` separator
- [ ] No EBADF errors on local drives
- [ ] SMB drives (Z:) work for code but NOT for state files (known limitation, documented)

---

## 14. Documentation Verification

```bash
# Check all three languages have IDE Integration chapter
grep "IDE Integration" docs/en/guide.md
grep "IDE 集成" docs/zh-CN/guide.md
grep "IDE 連携" docs/ja/guide.md
```

**Verify**:
- [ ] All three contain: Quick Start, How It Works, One-Shot Review, Modes Overview table
- [ ] FAQ mentions Win10 22H2 support
- [ ] FAQ describes WT_SESSION requirement for --ui wt
- [ ] FAQ mentions Git is recommended (not required)

---

## Test Result Summary

| # | Test Area | Mac | Windows | Pass/Fail |
|---|-----------|-----|---------|-----------|
| 2 | Automated tests (627) | | | |
| 3 | Init / Uninit | | | |
| 4 | Engine quiet | | | |
| 5 | Engine tmux | | N/A | |
| 6 | Engine wt | N/A | | |
| 7 | run-lisa | | | |
| 8 | watch-lisa | | | |
| 9 | review one-shot | | | |
| 10 | Git hook | | | |
| 11 | MCP server | | | |
| 12 | Debug logging | | | |
| 13 | Cross-platform paths | | | |
| 14 | Documentation | | | |
