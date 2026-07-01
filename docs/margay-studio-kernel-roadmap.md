# RLL → Margay Studio Kernel — Roadmap (draft for review)

North star: RLL becomes the margay-studio kernel — a safe, governed, multi-backend,
multi-channel collaboration engine where **Ralph does the work and Lisa guarantees the
work + behavior meets norms, hits the spec, breaks no rules, leaks no secrets, does nothing
destructive** — for dev AND non-dev tasks.

Guiding principle (drives the priority): **rails before exposure.** Do not open a session
to outsiders until the safety rails (authz + Lisa behavioral review + destructive-guard +
backup) exist, and prefer the auditable async channel (GitHub issues) over live chat.

---

## The 4 epics mapped to what already exists (verified, file:line)

| Epic | Already EXISTS (reuse) | MISSING (build) |
|---|---|---|
| **E1** session ↔ Feishu/WeCom external + Lisa behavioral review | outbound channels: `user-channel.ts:246` (buildDefaultChannelSeams), `wecom-hook.ts`/`lark-hook.ts`/`dingtalk-hook.ts`; inbound owner: `wecom-feedback.ts` (Target: ralph/lisa/both); owner identity `user-identity.ts` | **multi-sender authz** (outsider≠owner), **Lisa outbound behavioral-review gate** (privacy scrub + destructive veto + scope), **destructive-op guard + backup/restore** |
| **E2** multi-session/outsider collab via GitHub issues | inbound issue→task: `gh-issue-consumer.ts` + `gh-poller.ts` + skill `gh-issue-task-consumer`; inter-agent bus `rll-bus.ts` (busInject/TaskReply/sidecar) | **outward issue-filing skill**, **collect→analyze→triage→process skill/flow**, **policy: non-owner/boss/喵吉 collab MUST go via issue** |
| **E3** generalize to non-dev tasks | task-type taxonomy `task-type.ts:20` (code/review/doc/process) + per-type whitelist; Lisa rubric `lisa.md:94-200` is **already general** (Goal Guardian, not code-only); `test-review`/`lisa-review` skills | **non-code quality gates** (doc-oracle/process-task acceptance), **generalized Lisa norm rubric** docs |
| **E4** backend CLI switching (codex/ccl/claude-code/kimi-code) | launch layer `commands.ts:288-340` (buildCodexCmd/buildAgentLaunchCmd/buildAgentSpawnArgs); daemon spawn `cli-pty-daemon` (backend-agnostic) | **role→backend config** (RL_RALPH_BACKEND/RL_LISA_BACKEND), **backend abstraction** (claude/codex/ccl/kimi command+role-injection), no kimi/ccl refs yet |

---

## P0 — Safety substrate + hygiene (prerequisite; the heart of E1's safety asks)

Everything external (E1/E2) rests on these. Build FIRST; they are shared rails.

1. **Identity & authz tiers** — resolve a message sender into a tier and pin an explicit
   **capability matrix** UPFRONT (Lisa R1: define these before P0/P1/P2 drift into different
   authz meanings). Extend `user-identity.ts` + inbound (`wecom-feedback.ts`) to carry an
   authenticated `sender` + tier.

   | tier | who | may ASK | may INSTRUCT | destructive | privacy view |
   |---|---|---|---|---|---|
   | **owner** | 主人 | anything | yes (non-destructive direct; destructive → confirm+backup) | only w/ explicit multi-factor confirm + backup | full |
   | **boss** | 老板 | anything | yes (same as owner, per owner delegation) | same as owner | full |
   | **miaoji** | orchestrator | anything | yes (relayed owner/boss intent) | no (relay only; destructive still needs owner confirm) | full |
   | **outsider** | 外人/other session | session status/progress Q&A only | **no direct** — must file a GitHub issue (E2) | never | redacted (no secrets/paths/other-session/file contents) |

2. **Lisa behavioral-review gate (outbound)** — NEW review surface: before Ralph sends ANY
   message to an external party, Lisa reviews it → **PASS / REDACT / VETO** (Lisa R1 oracle):
   - **PASS** only when: no secret/privacy pattern, no destructive/external-write instruction,
     no scope expansion, and recipient/context match is clear.
   - **REDACT** when: content is useful but needs deterministic privacy scrubbing first.
   - **VETO** when: destructive intent, unauthorized recipient, cross-session leakage,
     credentials, private paths/contents, or unverifiable claims are present.
   Reuse the existing secret-scrub patterns (`§197 SECRET_PATTERNS`, test-log `scrubSecrets`) +
   the lisa-review loop.
3. **Destructive-op guard + backup/restore + verification** — a classifier for destructive
   actions (rm/overwrite/push/external-write/...); destructive ops are BLOCKED by default and
   require explicit owner multi-factor confirm; before executing ANY instruction, snapshot a
   restorable backup (git stash/tag or a `.rll/backups/` snapshot) so a mistaken action is
   reversible. Generalizes the existing init-overwrite guard (`commands.ts:8205`).
4. **Hygiene** — fix Problem A (self-repo sync clobber, already root-caused + Lisa-confirmed).
   (Loop convergence was investigated and dropped — see Locked decision #2: the 3 `auto`
   processes are 3 separate projects, not contention on one tree.)

## P1 — E2: GitHub-issue governed collaboration (the SAFE async channel)

Lower risk than live chat (async, reviewable, every collab traceable). Build before opening
live external chat so there's a governed default path.
- **Outward**: `file-issue` skill + CLI — open/comment issues via `gh` CLI (reuse gh spawn in
  `gh-poller.ts`) / oauth. Lisa behavioral-review (P0.2) gates the issue body before it posts.
- **Inbound**: extend `gh-issue-consumer` into collect → **analyze/triage** → route to RLL task
  (busInject) → reply on issue (TaskReply). Add a triage skill + a "collect & analyze" flow.
- **Policy**: any collaboration request from a non-(owner/boss/miaoji) party — whether outsider
  or another session — MUST be filed as a GitHub issue (auditable); free-chat collab is refused
  with a "please file an issue" pointer.

## P2 — E1: live Feishu/WeCom external-facing (riskiest; built on P0 + P1)

- Inbound multi-sender (P0.1 authz) → route: outsider question about THIS session's work →
  answer **read-only, privacy-filtered** (P0.2 Lisa gate); owner/miaoji instruction → execute
  with backup+verify (P0.3), destructive blocked.
- Every outbound to an external party passes the P0.2 Lisa behavioral-review gate.
- Auto-connect each session on launch (reuse channel substrate); per-session inbound listener.

## P3 — E4: backend CLI switching (independent; parallelizable quick-win)

- `RL_RALPH_BACKEND` / `RL_LISA_BACKEND` config (claude | codex | ccl | kimi-code) + a backend
  registry (command template + role-doc injection per backend), wired into
  `buildAgentSpawnArgs` (`commands.ts:336`) — currently hardcodes claude/codex.
- Low risk, doesn't block P0-P2; can run as a parallel track if you want multi-backend sooner.

## E3 — generalization (cross-cutting, woven through P1-P3, not standalone)

- task-type taxonomy + Lisa's general rubric ALREADY support non-code tasks. Remaining: add
  non-code **quality gates** (doc-oracle/process-task acceptance criteria) + a short
  "Lisa norms beyond code" rubric doc so Lisa's guarantee (meets spec / follows rules / no harm)
  applies uniformly to any task domain.

---

## Recommended priority (safety-first)
**P0 (rails+hygiene) → P1 (issue governance) → P2 (live external) → P3 (backend switch, parallel).**
Rationale: never expose a session to outsiders before the authz + Lisa-veto + backup rails
exist; prefer the auditable issue channel before live chat; backend-switch is independent and
can run in parallel as a quick win.

## Open questions for the owner (decisions only you can make)
1. **Outsider identity & privacy boundary**: how is an "outsider" authenticated on Feishu/WeCom
   (platform sender id? a token?), and exactly what may an outsider learn about a session
   (status/progress only? file contents? never secrets/paths/other-sessions)?
2. **"Destructive op" definition + backup mechanism**: git-based (stash/tag) vs a `.rll/backups/`
   snapshot dir? which ops count (push? external API writes? file deletes?)?
3. **E4 backends now**: are `ccl` and `kimi-code` CLIs actually installed/available, or scope
   E4 to claude+codex first and add ccl/kimi when their CLIs land?
4. **E4 priority**: keep P3, or pull forward as a parallel track (it's low-risk, high "kernel" value)?
5. **Loop convergence**: OK to kill the 2 extra `ralph-lisa auto` instances now (keep 1)?
6. **Scope of "answer outsiders"**: read-only Q&A only, or also let outsiders trigger work
   (which would then be forced through the E2 issue channel)?

---

## Locked decisions (owner-confirmed 2026-06-21)

1. **Priority**: P0 → P1 → P2 → P3 (approved). E4 stays P3.
2. **Loop convergence — N/A (correction)**: the 3 `ralph-lisa auto` processes are 3 SEPARATE
   projects (super-rll / WorkSpace周会分析 / margay-standard), each with its own tree+tmux.
   super-rll has exactly ONE normal loop. The earlier "3 loops fighting over one tree" was an
   inference error (ps without cwd check). Nothing to converge; must NOT kill the other projects.
   The Problem-A clobber fix is trigger-independent and still the right durable fix.
3. **Backup/restore (P0.3)**: git (stash/tag) for tracked + `.rll/backups/` snapshot for
   untracked/state — combined.
4. **Destructive ops (P0.3)**: delete/overwrite + git push + external-API-write ALL count →
   blocked-by-default, require confirm+backup. **Confirm has a TTL/validity-window** — one
   confirmation covers a time-window of similar ops; do NOT re-prompt per-op.
5. **E4 backends**: claude + codex + **ccl** first (all installed); kimi-code deferred until its
   CLI lands (keep the backend registry extensible). E4 stays P3.
6. **Outsider capability (E1/P2)**: read-only Q&A (progress/status, redacted) **+ may file
   requests — forced through the E2 GitHub-issue channel** (never direct execution).
7. **Outsider identity (E1/P2)**: platform (Feishu/WeCom) sender id + whitelist
   (owner/boss/miaoji on the whitelist; everyone else = outsider → redacted read-only).
