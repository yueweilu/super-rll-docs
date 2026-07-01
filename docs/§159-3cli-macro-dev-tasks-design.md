# §159 — 3-CLI Macro Dev Task Design Doc

**Status**: design (per user WeCom 2026-05-17 14:48 direction "先定义测试用例和评估标准，出文档给我看").
**Predecessor**: §158 micro-task baseline (T1/T2/T3 = sanity / code-gen / explain) shipped; this doc designs the **macro** layer.

## Goal

Extend cli-e2e dogfood from one-shot string-validators (§158) to **real development workflows** that exercise each CLI as a software-engineering tool — not just a Q&A bot. Three categories cover the most common dev modes:

- **D1 full-stack app dev** — build something nontrivial from scratch
- **D2 bug debug + fix** — find + patch a known defect in given code
- **D3 codebase extend feature** — add a feature to an existing codebase

For each category, this doc defines (per CLAUDE.md research-doc convention):
1. Task spec — concrete repo / prompt template per cli
2. Test cases — specific inputs + expected outputs
3. Evaluation criteria — mechanical oracles (file presence / regex / test-pass count / latency / token cost)
4. Per-cli flag dispatch — each cli's auto-confirm / tool-use / sandbox flag
5. Risks — timing / cost / variance / cli-specific quirks

After user review + approval, separate §160+ slices implement each category end-to-end.

## Common framework

### Three CLIs under test (same as §158, verified working)

| CLI | Binary | Invocation pattern | Verified in §158 |
|-----|--------|--------------------|------------------|
| Claude | `/opt/homebrew/bin/claude` (Anthropic Claude Code) | `claude --print <prompt>` OR interactive REPL | T1/T2/T3 PASS |
| Codex | `/opt/homebrew/bin/codex` (OpenAI Codex CLI) | `codex exec <prompt>` (non-interactive) | T1/T2/T3 PASS |
| CCL | `/opt/homebrew/bin/ccl` (margay-ccl-core, Anthropic-API-compat fork) | `ccl --print --model deepseek-v3.2` via `ANTHROPIC_BASE_URL=https://...apps/anthropic` + aliyun key | T1/T2/T3 PASS |

CCL key MUST live in mode-0o700 tmp wrapper script (per §158 R7 Lisa B2 lock — never in process argv).

### Cost / latency budget per dev task

§158 baseline measured: Claude 7.6s mean / Codex 9.7s / CCL→deepseek 15.7s for micro Q&A. Macro dev tasks should multiply by:
- D1 full-stack: 5-15 min wall-clock per cli (multi-step code-gen + tests + iteration)
- D2 bug fix: 2-5 min per cli (read + diagnose + patch)
- D3 feature extend: 3-8 min per cli (read existing + add new)

Total budget per full §160+ run: **3 categories × 3 clis × 5min avg = ~45 min wall-clock**, **~$2-10 token cost** (claude+codex+ccl mix).

Per acceptance contract (§158 inherited): `RL_CLI_E2E_REAL_SKIP=1` for PR-CI; local pre-CONSENSUS real run; cron weekly drift catch.

### Sandbox / cwd convention

Each task runs in a fresh `/tmp/cli-e2e-§16X-<task-id>-<cli-id>/` working directory, populated by the runner before cli spawn. After run, the runner:
1. captures pane-text + screenshot (per §158 R7 lock)
2. evaluates oracles against the working directory state (file existence, test pass count, etc.)
3. preserves the working directory for human inspection
4. records latency + cost + pass/fail in report

The cli runs with full read+write inside its working directory only. Each cli's relevant flag:

| CLI | Flag for unattended file-edit | Flag for unattended shell exec |
|-----|------------------------------|-------------------------------|
| Claude | `--dangerously-skip-permissions` (verified in §158 R7 + §160 R7 real-dogfood) | same flag covers both |
| Codex | `--dangerously-bypass-approvals-and-sandbox` (per §73 lock; verified §158 R7 + §160 R7) | same |
| CCL | `--dangerously-skip-permissions` (same as Claude — same binary lineage) | same |

§73 codex-full-auto-flag-fix lesson reused. **§161 correction (2026-05-17)**: this table previously listed Claude/CCL as using `--dangerously-bypass-approvals-and-sandbox`. That flag is **codex-only**. Claude and CCL use `--dangerously-skip-permissions`. Empirical verification: see `cli-e2e/examples/_d2-bug-fix-runner.js:240-252` `buildCmd()` impl (shipped + Lisa-PASS'd in §160).

## D1 full-stack app dev

### Task spec

**Prompt template (verbatim per cli)** — port contract mechanical per Lisa R3 narrow B2:
```
Build a small todo-list web app from scratch in this working directory.
Requirements:
- Backend: Node.js + Express; single file `server.js`; **MUST listen on
  port from `process.env.PORT` (no default — let the runner set it; if
  PORT unset, error and exit 1)**; routes GET /todos (returns JSON array)
  + POST /todos (accepts {title:string}, returns the added todo with id);
  persists to a local SQLite database `data.db`.
- Frontend: single HTML file `index.html` with vanilla JS; **MUST read the
  backend port from a relative URL `/todos` (so the frontend works regardless
  of port)** — use fetch('/todos'); the runner will reverse-proxy via the
  same port.
- Test: `test.sh` shell script that starts the server with `PORT` from env,
  curls POST /todos, curls GET /todos, asserts response contains the added
  title, kills server. Test MUST use `${PORT}` from env or fail clearly.
- Run `npm init -y` and `npm install express sqlite3` before writing
  server.js.
- Make sure `PORT=<chosen> bash test.sh` exits 0 when run from this directory.
Do not ask for confirmation; complete autonomously.
```

Runner sets `PORT=<random-free>` via env when invoking each cli's pane so each cell uses an isolated port. D1.f live-curl uses that same PORT.

### Test cases

| ID | Input | Expected output |
|----|-------|-----------------|
| D1.a | (after task) | File `server.js` exists |
| D1.b | (after task) | File `index.html` exists |
| D1.c | (after task) | File `test.sh` exists and is executable |
| D1.d | (after task) | `package.json` exists with `express` + `sqlite3` deps |
| D1.e | run `bash test.sh` in working dir | exit 0 + stdout contains POSTed title literal |
| D1.f | curl http://localhost:${PORT}/todos (PORT set by runner) | HTTP 200 + JSON array shape |
| D1.g | open `index.html` in headless browser | DOM contains an input + a button + a list element |

### Evaluation criteria

Mechanical oracles per cell:
- **D1.a-d** = `fs.existsSync` checks (instant, deterministic)
- **D1.e** = `spawnSync('bash', ['test.sh'])` exit code 0 (the cli itself wrote this test; passing = cli's own test reflects working code)
- **D1.f** = subprocess curl + JSON.parse; oracle = array contains object with title from D1.e POST
- **D1.g** = headless wezterm pane spawning `python3 -m http.server 0` then `node -e "fetch('http://localhost:N/').then(r=>r.text())..."` checking for `<input` + `<button` + `<ul>|<ol>`

**Pass = all 7 sub-checks green**.

### Per-cli flag dispatch

```
claude:  claude --dangerously-skip-permissions --print '<prompt>'
codex:   codex exec --dangerously-bypass-approvals-and-sandbox '<prompt>'
ccl:     /tmp/wrapper.sh:
           export ANTHROPIC_API_KEY=...; ANTHROPIC_BASE_URL=...
           ccl --dangerously-skip-permissions --print --model deepseek-v3.2 '<prompt>'
```

### Risks

- **Variance**: model output varies per run; the cli might write valid-but-different code each time. Mitigation: run each cell 3 times in cron, report median pass rate.
- **Long latency**: full-stack from scratch is 5-15 min per cli. Mitigation: 20 min per-cell timeout.
- **Cost**: each D1 run = ~50K-200K tokens × 3 clis = $1-5 per category.
- **Port conflict**: per Lisa R3 narrow B2 lock — prompt now requires `process.env.PORT` (no default); runner assigns a random free port via `PORT=<random>` env when spawning each pane. Concurrent runs use different ports → no collision.
- **CCL via deepseek may lack tool-use / file-edit**: deepseek-v3.2 over anthropic-compat might not support claude's tool-use protocol. If so, CCL fails D1.a-d gracefully; report shows the limitation honestly rather than spuriously.
- **Sandbox escape concerns**: `--dangerously-bypass-approvals-and-sandbox` lets cli run arbitrary shell commands in working dir. Working dir is `/tmp/...` so blast radius is bounded; but cli could still curl external services / read `~/.ssh`. Mitigation: per-cell working dir + post-run `chmod 0` on `~/.ssh` is overkill; document the risk + run on a dedicated test box if paranoid.

## D2 bug debug + fix

### Task spec

Pre-seed working directory with a small Node.js repo containing a **reproducible off-by-one bug**:

```
/tmp/§159-D2-<cli>/
├── package.json     # name=paginator, deps=jest
├── src/
│   └── paginate.js   # buggy paginate(items, page, perPage)
└── test/
    └── paginate.test.js  # 3 tests; test C ("last page") FAILS
```

Buggy code (intentional — real off-by-one that actually fails per Lisa R3 narrow B1):
```js
// paginate.js — manual loop (slice-clamp behavior intentionally avoided)
function paginate(items, page, perPage) {
  const start = (page - 1) * perPage;
  const result = [];
  for (let i = 0; i <= perPage; i++) {  // BUG: should be `i < perPage` (off-by-one)
    if (start + i < items.length) {
      result.push(items[start + i]);
    }
  }
  return result;
}
```

Test that fails (deterministic):
```js
test('returns exactly perPage items on a full page', () => {
  // page 1 of [1..10] with perPage=3 should return [1,2,3] (3 elements)
  // buggy off-by-one returns [1,2,3,4] (4 elements) — test fails
  expect(paginate([1,2,3,4,5,6,7,8,9,10], 1, 3)).toEqual([1,2,3]);
});
```
Reproduction verified: with `i <= perPage` loop bound, page=1 perPage=3 returns 4 elements (one extra). The bounded `if (start + i < items.length)` filter only suppresses out-of-range items, not the off-by-one count.

Correct fix expected: change `i <= perPage` to `i < perPage`. ≤2-line diff.

**Prompt template**:
```
This repository contains a Node.js paginator with one failing jest test
in test/paginate.test.js. Run `npm install && npm test` to see the
failure, then read src/paginate.js to find the bug, then patch it. The
fix must be minimal (≤ 5 lines diff). After patching, `npm test` must
pass all tests. Do not change unrelated files. Do not ask for confirmation.
```

### Test cases

| ID | Input | Expected |
|----|-------|---------|
| D2.a | pre-run `npm test` | exit non-zero (the seeded failing test is broken initially) |
| D2.b | post-run `npm test` | exit 0 (all tests pass; bug fixed) |
| D2.c | `git diff --stat` | ≤ 5 lines changed in src/paginate.js; zero lines outside src/paginate.js |
| D2.d | `git diff src/paginate.js` | does NOT delete the function signature line; the fix is local |

### Evaluation criteria

- **D2.a + D2.b** = node test runner exit codes (mechanical pre/post)
- **D2.c** = `git diff --stat | grep -oP '\d+ files changed, \d+ insertions, \d+ deletions'` parse; assert files=1 + insertions+deletions ≤ 5
- **D2.d** = grep on diff; function signature line must remain

**Pass = all 4 sub-checks green**.

### Per-cli flag dispatch

Same as D1 (each cli auto-confirm + unattended).

### Risks

- **Bug too obvious / too hidden**: hard to calibrate. Mitigation: trial-run on a known-strong cli (claude) before locking task; aim for "passes for ≥1 cli, fails for ≥1 cli" so the test discriminates.
- **Cli might rewrite the whole function**: D2.c diff-size oracle catches; cli is forced to be minimal.
- **Cli might "fix" by modifying the test**: D2.d should also assert `test/paginate.test.js` is unchanged via `git diff test/`.
- **Race condition**: bug-trigger is deterministic (test runner). Low risk.

## D3 codebase extend feature

### Task spec

Pre-seed working directory with a small **working** Express server (no bugs):
```
/tmp/§159-D3-<cli>/
├── package.json
├── server.js  # GET /todos + POST /todos (working)
└── test/
    └── server.test.js
```

**Prompt template**:
```
This Express server has GET /todos and POST /todos. Add a new endpoint:

  GET /health  →  returns JSON {status: "ok", uptime_sec: <number>}

where uptime_sec is the integer seconds since the process started (use
process.uptime()). Also add a test in test/server.test.js asserting:
  - GET /health returns HTTP 200
  - response body has status === "ok"
  - response body has uptime_sec >= 0

Existing tests must continue to pass. Do not modify unrelated code.
```

### Test cases

| ID | Input | Expected |
|----|-------|---------|
| D3.a | post-run `npm test` | exit 0; new test passes |
| D3.b | post-run `git diff --stat` | shows `server.js` AND `test/server.test.js` changed; original tests unchanged |
| D3.c | post-run `curl http://localhost:N/health` | HTTP 200 + JSON with `status:"ok"` + `uptime_sec` (integer ≥ 0) |
| D3.d | `wc -l server.js` post-run vs pre-run | added ≤ 30 lines (minimality check) |

### Evaluation criteria

- **D3.a** = `npm test` exit 0 + at least 1 new test name matches `/health/i` in output
- **D3.b** = git diff filter; assert server.js + server.test.js modified; check no other files touched
- **D3.c** = boot server in background + curl + parse JSON + validate schema
- **D3.d** = pre-line-count from seed, post-line-count from result; delta ≤ 30

**Pass = all 4 sub-checks green**.

### Per-cli flag dispatch

Same as D1+D2.

### Risks

- **Cli might mock the test instead of implementing real route**: D3.c live-curl catches.
- **Cli might add `/health` AND change `/todos` behavior**: D3.b "only 2 files modified" oracle catches.
- **Server start race**: server might still be initializing when curl fires. Mitigation: `wait-on tcp:N` before curl OR retry 3× with backoff.

## Cross-category considerations

### Variance handling

LLM outputs vary per run. Two ways to handle:

**Option A — single-shot per cell** (cheaper):
Run each cell once; record pass/fail. Don't repeat. Trust §158-style aggregate-mean reports.

**Option B — N=3 per cell with quorum** (more robust):
Run each cell 3× ; pass if ≥2/3 pass. Surfaces flaky tasks.

§160+ impl should default to A; offer `--repeat N` flag for B mode for robustness studies.

### Token / latency cost ceiling

Per-cell soft limit: 20 min wall-clock. Hard kill at 30 min.
Per-run soft budget: ~$10 total token spend; hard kill if accumulated cost exceeds $20 (estimated from token counts; not enforced server-side).

### Aggregated report shape

```
| Category | Claude | Codex | CCL→deepseek |
|----------|--------|-------|--------------|
| D1 full-stack (7 oracles) | 5/7 ✓ 8min | 7/7 ✓ 6min | 3/7 ✓ 15min |
| D2 bug fix (4 oracles) | 4/4 ✓ 3min | 4/4 ✓ 4min | 4/4 ✓ 6min |
| D3 extend feature (4 oracles) | 4/4 ✓ 5min | 4/4 ✓ 7min | 3/4 ✓ 9min |
```

Plus per-cell artifact directory: pane-text + screenshot + working-dir snapshot tarball.

### Security

Same SECRET_PATTERNS scan as §158 C5 — extended to walk `.js / .ts / .jsx / .py / .json / .md / .sh / .ccl-wrapper-*` (working-dir code files). No API keys / no Bearer tokens / no aliyun/kimi prefixes allowed in any committed artifact.

Per-cell working dirs in `/tmp/` are LOCAL only — never committed.
Per-cell pane-text + screenshot ARE committed (small text + ~4MB PNG each).
Per-cell working-dir tarballs are NOT committed by default (too large; opt-in `--commit-tarball` flag).

## Implementation roadmap (§160+ slices)

After user reviews + approves this doc:

- **§160** D1 full-stack impl + first 3-cli run + report
- **§161** D2 bug-fix impl + first 3-cli run + report
- **§162** D3 feature-extend impl + first 3-cli run + report
- (Optional **§163**) variance study (N=3 repeats) per category
- (Optional **§164**) extended cli set (gemini-cli / aider / cody / qwen-coder)

Each §16X slice is independent; can be merged out-of-order based on user priority.

## Open questions for user review

1. **Which category first?** D1 most ambitious; D2 cheapest + most concrete. Recommend §160=D2 to validate the framework on the smallest task before D1's 5-15min budget.
2. **Variance handling default?** A (single-shot, cheap) vs B (N=3, robust). I recommend A for first impl + B as opt-in.
3. **Repo seeding mechanism?** Inline in runner JS (small, no extra files), OR template repo in `cli-e2e/fixtures/§159-D2-bug-paginator/` (cleaner, version-controlled). Recommend the fixture-template approach for ≥D2 (the seed-bug needs to be exact).
4. **Per-cli flag table is current best-guess** — needs verification by reading each cli's `--help` output. §160+ R1 [PLAN] should include `<cli> --help | head -50` evidence.

Pending user direction before §160+ work begins.
