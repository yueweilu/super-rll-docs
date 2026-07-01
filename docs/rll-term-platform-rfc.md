# rll-term as a product — platform RFC / roadmap

**Status:** draft for decision (2026-06-02). **Author:** working session.
**Companion:** `docs/rll-term-ralph-lisa-contract.md` (the stable seam this builds on).

## Goal (user-stated, 2026-06-02)

Make **rll-term the main, push-forward operating platform** and ship it as a
**product**:

- **one cross-platform app** (one install for macOS / Linux / Windows),
- **multi-agent**: pluggable agent invocation + config (claude / codex / ccl /
  aliyun-backed kimi·qwen·glm / gemini / aider …), user-selectable per role,
- **multi-stack dev + test**: drive development and run tests across many tech
  stacks (node / python / go / rust / web / mobile …).

## TL;DR recommendation

1. **Do NOT merge source trees.** Keep two repos. rll-term (wezterm fork, Rust)
   is the **front-door app**; `super-rll` (`ralph-lisa`, Node/TS) is the
   **engine**. They already talk over a deliberate, tested contract. Merging
   would (a) make the wezterm fork un-rebaseable on upstream, and (b) throw away
   a mature 2479-test TS engine to rewrite in Rust. Both are anti-patterns.
2. **"One app" = bundle, not merge.** Compile `ralph-lisa` to a single
   sidecar binary (bun/pkg/deno-compile) and ship it **inside the wezterm-fork
   app bundle**. rll-term already spawns `ralph-lisa`; it just needs to resolve
   the bundled path instead of `$PATH`. This keeps the TS engine + its tests and
   still gives users a single install.
3. **The vision is mostly productization, not new architecture** — a lot is
   already built (see Inventory). The work is 5 pillars below.

## Inventory — what already exists (don't rebuild)

| Capability | Where | State |
|---|---|---|
| Native WezTerm app, cross-platform | `wezterm/` fork (macOS/Linux/Win) | ✅ upstream |
| Native "RLL" menubar + command palette | `wezterm-gui` fork commits `e9319c06f`, `d5136cb8d` | ✅ Phase 1+2 |
| Thin coordinator (poll → tag-detect → spawn CLI) | `wezterm-rll/` (40 modules) | ✅ mature |
| **Declarative agent config** | `agent_config.rs` `AgentSpec{command_line,prompt_template}` + `agents.toml` + 3-tier resolver | 🟡 v1 (single cmd string/role) |
| Loop engine + policy gates + state authority | `super-rll/cli` (`ralph-lisa`) | ✅ 2479 tests |
| Stable seam (turn.txt / submit-* --file / VALID_TAGS / RL_STATE_DIR) | `docs/rll-term-ralph-lisa-contract.md` | ✅ pinned |
| Test harness (terminal-e2e + web-e2e + presets) | §187 wezterm-test / playwright-test skills; `cli/templates/presets/*.json`; §152 gate-manifest `project_type` | 🟡 seeds |
| Off-laptop channels (feishu/wecom/dingtalk), voice (DashScope), sandbox (landlock) | `wezterm-rll/{feishu_*,wecom,dingtalk,voice,sandbox}.rs` | ✅ built |
| Onboarding seeds (wsl, doctor hints, preflight) | `wezterm-rll/{wsl_onboard,doctor_hints,preflight}.rs` | 🟡 seeds |

## Target architecture (one app)

```
┌──────────────── rll-term.app  (wezterm fork — the product) ────────────────┐
│  wezterm-gui (native menubar / palette: pick Ralph & Lisa agent, project)  │
│  wezterm-rll coordinator  ── spawns ──►  ralph-lisa (bundled sidecar bin)  │
│      ▲ agent profiles (registry)              │ submit-* --file / --json    │
│      │ agents.toml + provider keys            ▼                             │
│   [Ralph pane: claude|ccl|…] [Lisa pane: codex|…]   .dual-agent/ (engine SoR)│
│                              │ stack presets (node/py/go/rust/web/mobile)   │
└──────────────────────────────┴─────────────────────────────────────────────┘
       sidecar = `ralph-lisa` compiled single binary, shipped in the bundle
```

Two repos, one shipped artifact. The contract is the only coupling.

## The 5 pillars

### P-A. Single-app packaging (cross-platform)
- Compile `ralph-lisa` → single binary with **bun `--compile`** (locked). P0
  spike confirms the whole CLI (spawns, fs, dynamic requires) survives; pkg/deno
  are fallbacks only if bun hits a wall. **macOS first**, then Linux + Windows.
- Embed the sidecar in the wezterm app bundle; rll-term resolves the bundled
  path first, `$PATH` fallback for dev (extend the `which::which` preflight).
- Per-OS bundle: macOS `.app`/dmg, Windows `.msi`/exe, Linux AppImage/deb.

### P-B. Multi-agent invocation + config (productize `AgentSpec`)
- Evolve `AgentSpec` from one `command_line` string → an **agent-profile
  registry**: named profiles `{id, launch_cmd, args, env, provider, key_ref,
  capabilities}`. Wire provider keys from the existing `3rd_Party_LLM_Keys`.
- Add the **cross-platform shell-quoting layer** the v1 R74 lock punted on
  (a product can't ask users to hand-write wrapper scripts).
- UI: menubar/palette picker for Ralph backend + Lisa backend per session.
- Seed profiles: claude-code, codex, ccl, codex-aliyun (kimi/qwen/glm/deepseek),
  gemini, aider.

### P-C. Multi-stack dev + test (productize the harness)
- Expand the preset library (`cli/templates/presets/`) into **per-stack packs**
  (node/python/go/rust/web/mobile), each declaring gate tiers + test commands.
- Make `project_type` detection (§152) + preset selection first-class in
  onboarding (auto-detect from repo, confirm in UI).
- Keep the two e2e tiers (terminal via wezterm-test, web via playwright-test);
  add stack-native unit/integration runners per pack.

### P-D. Contract hardening (close G1/G2/G3)
- **G1** `submit-* --json` → structured block reasons (fixable vs fatal), so the
  app can show actionable errors instead of truncated stderr.
- **G2** structured turn signaling to replace fragile pane-text `[TAG]` scraping
  (e.g. the engine emits a turn-event file the coordinator watches).
- **G3** `ralph-lisa --contract-version` handshake so a version mismatch between
  the bundled sidecar and rll-term is detected, not silent.
- (This batch's policy CRLF/false-block fix, cli 0.9.16, was a prerequisite —
  the seam must not choke on cross-env line endings.)

### P-E. Distribution / onboarding / upgrade
- Code signing + notarization (macOS), per-OS installers, auto-update channel.
- First-run wizard: detect agents (doctor_hints), collect provider keys, pick
  default profiles + project type. Grow `wsl_onboard`/`preflight` into this.

## Phased roadmap

| Phase | Deliverable | Gate to next |
|---|---|---|
| **P0** packaging spike | `ralph-lisa` compiles to a single binary; rll-term runs the bundled sidecar end-to-end on one OS | loop reaches CONSENSUS driven by the bundled binary |
| **P1** agent profiles | profile registry + shell-quoting + UI picker; 4–6 seed profiles | switch Ralph/Lisa backend from the menubar, run a slice |
| **P2** contract harden | G1 `--json` + G3 version handshake (G2 if budget) | app shows structured block reasons; mismatch detected |
| **P3** multi-stack packs | 3–4 stack preset packs + auto project-type detect | run real tests for node + python + one of go/rust |
| **P4** distribution | signed installers (macOS+1) + first-run wizard + auto-update | a non-dev installs one artifact and runs a slice |

## Locked decisions (user, 2026-06-02)

1. **Bundler = bun `--compile`.** P0 spike compiles `ralph-lisa` to a single
   binary with bun; pkg/deno only as fallback if bun hits a Node-compat wall.
2. **OS priority: macOS first (v1), then Linux + Windows.** P-A/P-E target a
   working signed macOS artifact first; Linux + Windows follow in the same
   phase structure (the wezterm fork is already cross-platform, so the marginal
   cost is packaging/signing per-OS, not core work).
3. **Profile schema home = rll-term (`agents.toml`).** Confirmed. The engine
   (`ralph-lisa`) stays agent-agnostic — it only ever sees `submit-*`, never
   which backend produced the body.
4. **This RFC is authoritative in `super-rll/docs`.** The wezterm fork does NOT
   copy it — it carries a one-line **pointer** back here (see
   `wezterm-rll/RLL_PLATFORM.md`) so the fork always resolves to the latest,
   single source of truth. Mirrors the existing contract cross-check pattern.

## Risks

- **Node→single-binary edge cases** (dynamic requires, spawn of self, native
  deps) — de-risk in P0 before committing.
- **wezterm upstream drift** — keep fork changes minimal/modular; rebase cadence.
- **Provider-key handling in a distributed app** — never bundle keys; wizard +
  OS keychain. (Security review before P4.)
- **Scope** — this is a multi-month program; ship per-phase, keep each behind a
  working-slice gate. Don't big-bang.

## Immediate next step

**P0 packaging spike** (small, reversible, high-information): compile `ralph-lisa`
to a single binary with bun, have `wezterm-rll` resolve+spawn it, and drive one
real slice to CONSENSUS. Result decides the bundler and proves the "one app"
thesis before any productization work.
