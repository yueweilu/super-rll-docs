# cli-e2e → Skill+Lua Layered Architecture (§170-§172 design)

**Status**: design — pre-§170 R1 PLAN
**Date**: 2026-05-17
**Author**: Ralph (under user 2026-05-17 21:50+ directive)
**Reviewed**: Lisa §163 R6 (pivot rationale sound; sequence affirmed)

## Target

Pivot cli-e2e from "test-library with fixed TS API" → "**layered infrastructure** where coding agents declare test intent and skills materialize platform-specific execution".

After pivot, the typical flow becomes:

```
Ralph (coding agent):  "测一下 §160 D2 paginator bug-fix, 3 cli 对比"
   ↓
wezterm-test skill:    [analyzes intent] → generates Lua test script
                       (uses templates: spawn-cli / wait-pattern / save-screenshot / oracle / report)
   ↓
cli-e2e TS lib:        spawn wezterm-gui with Lua plugin injected
   ↑↓                  IPC bridge: dispatches generated Lua, collects evidence
Layer 2 (Lua plugin):  executes inside wezterm process
                       → pane:get_lines_as_escapes()  (asciicast snapshot, cross-platform, no OS perms; replaces save_screenshot which does not exist as wezterm Lua API per wezterm#513)
                       → pane:send_text() / mux:spawn_window / pane:get_dimensions / wait_for_pattern
   ↓
Returns to Ralph:      evidence bundle (PNGs + diffs + report.md + per-oracle pass/fail)
```

## Why this pivot

### Direct trigger (§163 deadend)

§163 R6 real C4 dogfood produced 5120×2880 full-display PNGs instead of per-pane crops. Code path was correct (4/4 unit pins; Lisa R4+R5 PASS), but real execution falls back to full-display because `osascript ... tell System Events ...` returned `-609 connection invalid` — Cursor lacks Accessibility permission.

### Deeper-cause analysis

Even fixing macOS Accessibility doesn't help cross-platform: AppleScript path is macOS-only. Linux X11 (`xwininfo` + `import`), Wayland (grim/portal), Windows (PowerShell P/Invoke) each need separate impl. **Per-OS branching at the library layer is the wrong abstraction for cli-e2e because wezterm itself runs the same Lua API on all platforms.** Visual evidence via `pane:get_lines_as_escapes()` (asciicast text+ANSI snapshot — verified API per wezterm docs) works on macOS/Linux/Windows with zero OS-level permissions and zero per-platform glue. (Initial design assumed `gui_window:save_screenshot` would handle this; verified against installed wezterm — that API does not exist; tracked at [wezterm#513](https://github.com/wezterm/wezterm/issues/513).)

### Paradigm fit for AI-native codebase

cli-e2e's intended user is **coding agents (Ralph)**, not human engineers writing test files. For agents:

- Fixed TS API requires agents to learn `Pilot.spawnPane / Pane.waitFor / pilot.screenshot` etc.
- Skill-mediated intent ("test that 3 clis can fix this off-by-one bug") matches how agents already think
- Skill+template generation produces deterministic Lua scripts when given the same intent + RNG seed (vs. each invocation regenerating from scratch — design choice: cache generated scripts as test artifacts, allow human override)

## 4-Layer architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Ralph (coding agent / RLL)                     │
│   - Declares test intent                                │
│   - Calls wezterm-test skill (or playwright-test, etc.) │
│   - Reviews returned evidence + makes ship decision     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: wezterm-test skill                             │
│   - Markdown prompt + Lua templates library             │
│   - Generates concrete Lua test script from intent      │
│   - Triggers via Layer 1 IPC bridge                     │
│   - Collects evidence + formats markdown report         │
└─────────────────────────────────────────────────────────┘
                          ↓ (Layer 1 mediates)
┌─────────────────────────────────────────────────────────┐
│ Layer 2: cli-e2e-plugin.lua (in wezterm process)        │
│   - Exposes capability set                              │
│   - Receives commands via IPC, returns results          │
│   - All OS-level work (screenshot, window mgmt) here    │
└─────────────────────────────────────────────────────────┘
                          ↕ IPC
┌─────────────────────────────────────────────────────────┐
│ Layer 1: cli-e2e TS pkg (current §156-§163 evolved)     │
│   - Pilot.launch(): spawn wezterm-gui + inject plugin   │
│   - IPC bridge: OSC 1337 SetUserVar / user-var-changed  │
│   - Pane lifecycle (spawn / kill / list)                │
│   - Direct passthrough operations for simple cases      │
└─────────────────────────────────────────────────────────┘
                          ↓ spawnSync('wezterm', ['cli', ...])
                      wezterm-gui process
```

### Layer 2 Lua plugin capability set (MVP) — REVISED per Lisa §170 R1 narrow

**Critical correction (2026-05-17 R1 review)**: original design assumed `gui_window:save_screenshot(path)` and arbitrary escape-marker → custom event. Both are **unverified / wrong**:

- `save_screenshot` does **NOT exist** as wezterm Lua API. Open feature request [wezterm#513](https://github.com/wezterm/wezterm/issues/513) since 2021. Verified by web-search + grepping installed binary `wezterm 20240203-110809-5046fc22`.
- Pane → Lua IPC documented path is **`OSC 1337;SetUserVar=<name>=<base64-value>`** emitted via `printf`, which fires `user-var-changed` event in Lua ([docs](https://wezterm.org/config/lua/window-events/user-var-changed.html); [recipe](https://wezterm.org/recipes/passing-data.html)). NOT custom escape-marker.

Revised capability set:

```lua
-- cli-e2e/lua/cli-e2e-plugin.lua
local wezterm = require 'wezterm'
local M = {}

-- IPC via documented OSC 1337 SetUserVar / user-var-changed (verified API)
wezterm.on('user-var-changed', function(window, pane, name, value)
  if name ~= 'cli-e2e-cmd' then return end
  -- value is base64-encoded JSON: { op, args }
  local cmd = json_decode(base64_decode(value))
  local result = dispatch(cmd, window, pane)
  -- write ack to tmp file polled by Node side
  write_ack(cmd.req_id, result)
end)

-- Capability set (MVP, 6 ops incl ping; save_screenshot REMOVED, replaced by snapshot_pane_ascii)
M.ping = function() return 'pong' end
M.snapshot_pane_ascii = function(pane_id, out_path)
  -- pane:get_lines_as_escapes() returns content with ANSI; dump to out_path
end
M.get_pane_dimensions = function(pane_id) ... end     -- pane:get_dimensions
M.send_text          = function(pane_id, text) ... end  -- pane:send_text
M.spawn_in_window    = function(opts) ... end           -- mux:spawn_window
M.wait_for_pattern   = function(pane_id, regex, timeout_ms) ... end
-- ping op for round-trip smoke
return M
```

**Visual evidence revised**: asciicast-style snapshot (text+ANSI) replaces PNG. Advantages:
- Byte-diffable across cli runs (real "看3个cli的区别" use case)
- Cross-platform via wezterm Lua, zero OS perms
- Renders to PNG via asciinema → svg-term-cli pipeline if pixel evidence needed (separate optional tool, NOT cli-e2e responsibility)
- File size 10-100× smaller than full-display PNG

### Layer 1 enhancement (additive)

Keep current API for backward compat. Add:

```ts
class Pilot {
  // NEW
  injectLuaConfig(pluginPath: string): void   // wezterm --config-file <merged>
  dispatchLua(cmd: { op: string, args: any }): Promise<any>  // IPC bridge
}
```

IPC strategy options (decision pending §170 R1):
- **CHOSEN (per Lisa R1 narrow B1) — OSC 1337 SetUserVar**: Node emits `\033]1337;SetUserVar=cli-e2e-cmd=<base64-json>\007` via send-text; wezterm fires `user-var-changed` event in Lua with `(window, pane, name='cli-e2e-cmd', value=<base64-json>)`; Lua handler decodes + dispatches + writes ack file Node polls. Documented + verified API ([recipe](https://wezterm.org/recipes/passing-data.html); [user-var-changed event](https://wezterm.org/config/lua/window-events/user-var-changed.html)).
- **Future migration (unix socket)**: Lua plugin opens socket; Node connects + sends JSON-RPC. Avoids tmp-file poll overhead. Capability schema is transport-agnostic so swap is mechanical.

Original design proposed custom escape-marker + `wezterm.on('cli-e2e-command', ...)` event. Both are unverified — `wezterm.on(...)` only fires for documented events, not arbitrary pane output. Replaced with documented SetUserVar transport.

## Asset disposition (verified inventory 2026-05-17)

| Asset | Disposition |
|---|---|
| `cli-e2e/src/backends/wezterm.ts` (155 LOC, wezterm cli wiring) | **Retain** — Layer 1 core |
| `cli-e2e/src/pilot.ts` `Pilot.launch/close/spawnPane/killPane` | **Retain** — Layer 1 lifecycle |
| `cli-e2e/src/pane.ts` `send/getText/waitFor` | **Retain (simplified)** — raw ops for simple use; complex tests go via Layer 2 Lua |
| `cli-e2e/src/screenshot.ts` OS-platform helpers (179 LOC) | **Reduce** — drop `getWeztermWindowBoundsByPid` + `screenshotMacOSRegion` + `screenshotMacOS` (full-display path) in favor of Lua `pane:get_lines_as_escapes()` asciicast snapshot. **Keep** `getPngDimensions` + `hashPng` + `parseAppleScriptBounds` as oracle utilities (in case external asciinema-to-PNG renders generate PNG that needs validation) |
| `cli-e2e/src/backends/mock.ts` | **Retain** — unit-test stub |
| 5 example runners (1026 LOC) | **Reference-only** — knowledge (timing / flags / wrapper) extracted into skill templates + Lua templates; runners themselves stay as "how it used to work" artifact |
| 34 unit tests | **Mostly retain** + add ~5-8 Layer 2 Lua plugin tests + ~3-5 Layer 1 IPC tests |
| `cli-e2e/fixtures/§160-D2-bug-paginator/` (16KB) | **Retain** — skill uses directly |
| `docs/§159-3cli-macro-dev-tasks-design.md` | **Retain** — design doc is orthogonal to driver layer |
| `.dual-agent/c4-evidence-§160/`, `c4-evidence-§163-r6/` | **Retain** — historical evidence; new evidence via skill |

## Execution plan (§170-§172 slice sequence)

### §170 cli-e2e-skill-pivot-foundation (~10-13r)

R1 PLAN — design IPC bridge contract + Lua capability schema + Layer 1 changes
R2-R3 tests-only — pin contract: `injectLuaConfig` + `dispatchLua` shape; capability schema validation
R4 CODE — Layer 1 IPC bridge impl (Option A or B)
R5 CODE — Layer 2 `cli-e2e-plugin.lua` MVP (user-var-changed handler + ping + snapshot_pane_ascii + spawn + send + get_pane_dimensions + wait_for_pattern)
R6 CODE — Layer 1 ↔ Layer 2 wire-up; round-trip smoke test (no real LLM yet)
R7+ FIX rounds per Lisa
RN [CONSENSUS]

Tarball checkpoint after §170 close — Layer 1+2 stable foundation.

### §171 wezterm-test-skill-mvp (~5-10r)

R1 PLAN — skill `.claude/skills/wezterm-test/SKILL.md` design + first 2 Lua templates (cli-spawn-and-fix-bug / cli-3-way-comparison)
R2-R3 tests-only — skill output shape pin; template render correctness
R4 CODE — skill impl
R5 CODE — §160 D2 dogfood re-run via skill (replaces `_d2-bug-fix-runner.js` 418 LOC with ~30 line skill invocation)
R6+ FIX + [CONSENSUS]

Validates: skill abstraction + per-pane screenshot finally working cross-platform.

### §172 dx2-feature-extend-via-skill (~8-15r)

Use the skill to execute §159 D1 (full-stack app) + D3 (feature-extend) tasks that were previously deferred for being too expensive to hand-code. Skill makes them tractable. Real-dogfood across 3 cli × 2 macro tasks.

### §161 doc fix (§159 Table 3 flag dispatch correction)

**Done as part of this current round** (2026-05-17 22:25 — see `docs/§159-3cli-macro-dev-tasks-design.md:58-62,117-121` edits).

## Tarball checkpoint (current state, pre-pivot)

Sealed at:
- `dist-pack-XXX/cli-e2e-v0.1.0-alpha-pre-§170-pivot.tar.gz` — current cli-e2e source + dist + examples + fixtures + README
- Includes: git commit hash, `.dual-agent/c4-evidence-§160/`, `.dual-agent/c4-evidence-§163-r6/`
- Purpose: preserve known-good current capabilities for rollback / comparison post-pivot

## Risk register

| Risk | Mitigation |
|---|---|
| **Lua plugin coupling to wezterm fork variations** (RllTerm etc.) | Test plugin against vanilla wezterm + at least one fork before §170 [CONSENSUS] |
| **IPC tmp-file race conditions** (concurrent ack writes from multiple dispatchLua calls) | Each cmd has unique `req_id` in JSON payload; ack file path includes req_id; Node polls specific ack-file path. Migration to unix socket eliminates entirely |
| **Skill non-determinism** (same intent → different generated Lua next time) | Cache generated scripts as test-artifact files under `.dual-agent/skill-output-cache/`; allow human override; treat regen as warning |
| **wezterm not running when test fires** | Layer 1 `Pilot.launch` handles spawn; document `WEZTERM_REQUIRED=1` env for CI |
| **CI cannot run skill (no LLM access)** | Cache generated Lua scripts; CI runs cached scripts only; agent regenerates locally |
| **Sunk-cost bias on cli-e2e current code** | Asset disposition table above; each retain decision must cite §156-§163 verification |

## Open questions for §170 R1 PLAN

1. IPC choice: A (escape marker) vs B (unix socket)?
2. Skill generated-Lua artifact cache strategy: per-invocation regen vs commit-stable?
3. Lua test framework choice: busted (popular but external dep) vs hand-rolled (in-plugin) vs no Lua tests (test outcomes via Node side only)?
4. Multi-platform CI strategy: do we set up Linux runner before §172, or accept macOS-only validation through §171?

## Cross-references

- §156 cli-e2e-wezterm-pilot-mvp (closed) — foundation pieces being retained
- §158 cli-e2e-3cli-comparison-dogfood (closed) — knowledge migrating to skill templates
- §159 cli-e2e-3cli-macro-dev-tasks-design (closed) — design doc orthogonal, fully reusable
- §160 cli-e2e-d2-bug-fix-impl (closed) — D2 fixture + oracle logic migrating to skill
- §161-pending §159 doc Table 3 flag fix — **done 2026-05-17 22:25 as part of this checkpoint**
- §163 cli-e2e-pane-screenshot-fix (blocked/deferred) — superseded by §170+
- CLAUDE.md §49+§52 — TDD-first protocol applies to §170+ slices
