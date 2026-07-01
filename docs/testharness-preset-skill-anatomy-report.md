# testharness preset & skill 解剖报告（原文 / 构成 / 组合 / 注入 / 合成产物）

> 2026-06-20。供用户逐一核对。所有内容 verbatim 引自源码，标 file:line。Lisa 独立按源码核对。

## §0 关键澄清（先看这条，免得按错前提核对）
用户问"最后合成的 prompt"。**诚实结论：wezterm-test 和 playwright-test 都不合成任何 LLM prompt。**
- **wezterm-test**：把 macro JSON「编译」成一串 `wezterm cli ...` 子进程调用（spawn/send-text/get-text/kill-pane）。
- **playwright-test**：把 spec JSON「编译」成一串 Playwright API 调用（page.goto/fill/click/textContent/screenshot）。
- 唯一出现的 LLM prompt 是 **macro 作者自己写在 `send` step 里的** `claude -p '<prompt>'` 文本（见 d1 fixture），那是被原样敲进终端的输入，**不是 skill 合成的**。

所以下文 §7 给的"合成产物"两个例子 = **wezterm cli 命令序列** 和 **playwright API 调用序列**（不是 prompt）。

---

## §1 PRESET — schema 原文
`cli/src/preset/schema.ts:10-46`：
```typescript
export type Tier = "unit" | "smoke" | "functional" | "integration" | "e2e" | "perf" | "stability" | "security";

export interface TierConfig {
  cmd: string;                          // shell 命令，verbatim 经 spawnSync(cmd,{shell:true}) 执行
  parser?: string;                      // 输出解析 adapter: k6 | playwright | ai-eval | security
  threshold?: Record<string, number>;  // 指标阈值 e.g. {p95:500, rps:50}
  oracle: string;                       // 人读判据（判什么）
  locallyRunnable: boolean;             // 本机能否跑
  requiredBinary?: string;              // 需在 PATH 的独立 binary e.g. k6/gitleaks
}

export interface Preset {
  stack: string;
  changeType: string;
  requiredTiers: Tier[];               // 必跑（阻断）
  optionalTiers: Tier[];               // 可选
  perTierConfig: Partial<Record<Tier, TierConfig>>;
}
```

## §2 PRESET — 组合 / 选择 / 加载 / 执行 / 注入 逻辑

### 2.1 选择（哪个 preset 被选中）
- `stack-detect.ts:105-213` 探测栈（electron→react-native→web→bin→server→fallback web）。
- `change-type-detect.ts:30-90` 探测改动类型（doc/process-only → null 豁免；否则模式匹配 web-ui / platform-server-cmd / cli-schema / cli-cmd；**fallback=cli-cmd**）。
- `resolvePresetKey(stack)`（commands.ts:12112）映射：cli→cli-cmd, web→web-ui, server→platform-server-cmd, desktop→desktop, mobile→mobile, plugin→plugin。
- 白名单 `BUNDLED_PRESET_KEYS`（commands.ts:12102）：v1 只允许 bundled。

### 2.2 加载（是否动态生成？**否**）
`preset-loader.ts:44-77` `loadPresetByName`：读 `cli/templates/presets/<key>.json` → `JSON.parse` → `validatePreset` 校验 → **原样返回**。**无模板、无占位符替换、无动态生成**。缺文件→null；坏 schema→throw。

### 2.3 执行（命令怎么跑）
`preset/runner.ts:47-54,145-222` `runPreset`：逐 requiredTier 取 `cfg`；若 `cfg.requiredBinary` 缺→错；否则 `spawnSync(cfg.cmd, {shell:true})` **逐字执行**（无占位符展开）→ `parseTierOutput(cfg.parser)` 抽指标 → `thresholdPass`。
- ⚠ **核对要点（真坑）**：cli-cmd 的 functional `cmd` 含字面 `<sub-cmd>`/`<happy-args>` 占位符；runPreset **不替换**，逐字跑会失败。即这些 cmd 是给作者**抄改的范本**，不是开箱即跑（functional 是 optional，默认不在 required 跑）。

### 2.4 注入提交（preset gate）
`commands.ts:2911-3012`：仅当 `.ralph-lisa.json preset.enabled===true` 且 tag∈{CODE,FIX}：
- requireAll=true(默认)+autoInvokeFn → 缺 tier 自动 `runPreset` 补，把证据**追加进提交 body**，格式：`- <tier>: <cmd> → exit <code>, all_required_pass=true (auto-invoked by §92 preset hook)`（applyPresetHook，commands.ts:12064-12092）。
- requireAll=true+dryRunOnly=true → reject + cmd 提示。
- **requireAll=false → warn-only proceed**（本仓 X3 设的就是这个）。
- enabled=false(默认) → noop。
- 证据解析回读：`parseTierEvidence`（policy.ts:1281-1293）正则 `/^[-*]\s+(unit|smoke|...)\s*:\s*(.+?)\s*(?:→|->)\s*(.+?)$/gim`；`validateTierCoverage`（policy.ts:1312-1340）查每个 requiredTier 有非空 cmd+result。

### 2.5 计划期暴露（X3）
`cmdPresetShow`（commands.ts:12150-12229）：human 输出在 stack/changeType/tiers 后，列每个有 oracle 的 tier 的 `cmd`+`oracle` 范本（"plan-authoring canon — paste into PLAN C-row Oracle"）。`--json` 原样 dump preset。

---

## §3 PRESET — 全 7 个原文（verbatim，逐字 from cli/templates/presets/）

### 3.1 cli-cmd.json（本仓默认 preset）
```json
{
  "stack": "cli",
  "changeType": "cmd",
  "requiredTiers": ["unit", "smoke", "integration"],
  "optionalTiers": ["functional"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test --prefix cli",
      "oracle": "All vitest cases for cli/src/test/*.ts pass; new cmd's unit test ≥1 case covers happy path + 1 negative",
      "locallyRunnable": true
    },
    "smoke": {
      "cmd": "ralph-lisa smoke-check",
      "oracle": "CLI binary spawns + new sub-cmd surfaces in --help; no crash on bare invocation",
      "locallyRunnable": true
    },
    "integration": {
      "cmd": "ralph-lisa contract-check --json",
      "oracle": "No drift between cli sub-cmd dispatch table and wecom-bot/lark-bot/dingtalk-bot accept-list",
      "locallyRunnable": true
    },
    "functional": {
      "cmd": "node cli/dist/cli.js <sub-cmd> --help && node cli/dist/cli.js <sub-cmd> <happy-args>",
      "oracle": "End-to-end invocation succeeds with realistic args; exit code 0 + stdout matches expected",
      "locallyRunnable": true
    }
  }
}
```

### 3.2 cli-schema.json
```json
{
  "stack": "cli",
  "changeType": "schema",
  "requiredTiers": ["unit", "smoke", "integration"],
  "optionalTiers": ["functional"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test --prefix cli -- schema",
      "oracle": "Schema-shape unit tests cover: valid / invalid-extra-field / invalid-missing-field / invalid-type-mismatch (≥4 cases)",
      "locallyRunnable": true
    },
    "smoke": {
      "cmd": "ralph-lisa smoke-check",
      "oracle": "Schema-consuming binaries don't crash on existing on-disk artifacts (backward-compat smoke)",
      "locallyRunnable": true
    },
    "integration": {
      "cmd": "ralph-lisa contract-check --strict",
      "oracle": "Schema-version bump propagates: cli writers + cli readers + wecom-bot consumers all updated atomically",
      "locallyRunnable": true
    },
    "functional": {
      "cmd": "ralph-lisa <related-cmd> --json | jq <new-field-path>",
      "oracle": "End-to-end roundtrip: write schema artifact via cmd A, read via cmd B, new field present + correct",
      "locallyRunnable": true
    }
  }
}
```

### 3.3 desktop.json
```json
{
  "stack": "desktop",
  "changeType": "app",
  "requiredTiers": ["unit", "smoke"],
  "optionalTiers": ["functional"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test",
      "oracle": "jest/vitest passes; ≥1 case per changed source file",
      "locallyRunnable": true
    },
    "smoke": {
      "cmd": "node -e \"require('./')\"",
      "oracle": "electron entrypoint loads without throw",
      "locallyRunnable": true
    },
    "functional": {
      "cmd": "npx electron-builder --dir",
      "oracle": "`dist/` packaged folder exists",
      "locallyRunnable": true
    }
  }
}
```

### 3.4 mobile.json
```json
{
  "stack": "mobile",
  "changeType": "app",
  "requiredTiers": ["unit", "smoke"],
  "optionalTiers": ["integration"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test",
      "oracle": "jest passes",
      "locallyRunnable": true
    },
    "smoke": {
      "cmd": "npx tsc --noEmit",
      "oracle": "type-check or parse succeeds",
      "locallyRunnable": true
    },
    "integration": {
      "cmd": "npx metro build-bundle --platform ios --dev false --entry-file index.js -o /tmp/_rll_mobile_bundle.js",
      "oracle": "metro bundler produces non-empty output",
      "locallyRunnable": true
    }
  }
}
```

### 3.5 platform-server-cmd.json（最重，含 e2e/perf/security）
```json
{
  "stack": "server",
  "changeType": "cmd",
  "_appliesTo": "Targets rll-team-platform/server/ specifically (uses npm workspaces — `npm test --prefix rll-team-platform` runs all workspace tests). The wecom-bot/lark-bot/dingtalk-bot sibling packages have a different test-runner shape (`node --test dist/test/*.test.js` per their package.json); §91 may add a separate `wecom-bot-cmd.json` preset rather than overload this one. cwd convention: super-rll/ (repo root).",
  "requiredTiers": ["unit", "functional", "integration"],
  "optionalTiers": ["e2e", "perf", "security"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test --prefix rll-team-platform",
      "oracle": "Workspace test runner exercises all server unit suites; new endpoint handler has ≥3 cases (happy / 4xx-validation / 5xx-internal-error)",
      "locallyRunnable": true
    },
    "functional": {
      "cmd": "cd rll-team-platform/server && node --test --test-reporter=spec 'test/routes/**/*.test.ts' 'test/dispatch/**/*.test.ts' 'test/web/**/*.test.ts'",
      "oracle": "Endpoint functional contract: status 200 + response shape matches OpenAPI/IPC; ≥1 happy + ≥1 4xx case per new endpoint",
      "locallyRunnable": true
    },
    "integration": {
      "cmd": "ralph-lisa contract-check && cd rll-team-platform/server && node --test --test-reporter=spec 'test/data/**/*.test.ts' 'test/loop/**/*.test.ts' 'test/adapters/**/*.test.ts' 'test/migrations/**/*.test.ts'",
      "oracle": "Cross-module: schema/IPC accept-list synced (contract-check 0 blocking); integration coverage exercises DB writes + reads + adapter dispatch + migrations",
      "locallyRunnable": true
    },
    "e2e": {
      "cmd": "k6 run cli/templates/test-server/load.js --vus 1 --iterations 1",
      "parser": "k6",
      "oracle": "Single full request lifecycle from external client through server to DB and back",
      "locallyRunnable": false,
      "requiredBinary": "k6"
    },
    "perf": {
      "cmd": "k6 run cli/templates/test-server/load.js",
      "parser": "k6",
      "threshold": { "p95": 200, "rps": 100 },
      "oracle": "Endpoint sustains 100 rps with p95 < 200ms",
      "locallyRunnable": false,
      "requiredBinary": "k6"
    },
    "security": {
      "cmd": "npm audit --json && gitleaks detect --report-format json",
      "parser": "security",
      "threshold": { "critical": 0, "high": 0 },
      "oracle": "No critical/high CVEs in deps + no leaked credentials in repo",
      "locallyRunnable": false,
      "requiredBinary": "gitleaks"
    }
  }
}
```

### 3.6 plugin.json
```json
{
  "stack": "plugin",
  "changeType": "extension",
  "requiredTiers": ["unit", "smoke"],
  "optionalTiers": ["integration"],
  "perTierConfig": {
    "unit": {
      "cmd": "npm test",
      "oracle": "mocha/jest passes",
      "locallyRunnable": true
    },
    "smoke": {
      "cmd": "node -e \"require('./package.json').main\"",
      "oracle": "manifest/entry resolvable",
      "locallyRunnable": true
    },
    "integration": {
      "cmd": "npx vscode-test",
      "oracle": "vscode-test host runs",
      "locallyRunnable": true
    }
  }
}
```

### 3.7 web-ui.json
```json
{
  "stack": "web",
  "changeType": "ui",
  "requiredTiers": ["smoke", "e2e"],
  "optionalTiers": ["functional", "perf", "stability"],
  "perTierConfig": {
    "smoke": {
      "cmd": "npx playwright test cli/templates/test-web/smoke.spec.ts",
      "parser": "playwright",
      "oracle": "Page loads + key-elements render + no console errors",
      "locallyRunnable": true
    },
    "e2e": {
      "cmd": "npx playwright test cli/templates/test-web/api.spec.ts",
      "parser": "playwright",
      "oracle": "Critical user-flow exercised end-to-end against real backend",
      "locallyRunnable": true
    },
    "functional": {
      "cmd": "npx playwright test --grep '@functional'",
      "parser": "playwright",
      "oracle": "Tagged @functional suite covers UI-bound business logic (form validation / state transition / route guards)",
      "locallyRunnable": true
    },
    "perf": {
      "cmd": "k6 run cli/templates/test-server/load.js --duration 30s",
      "parser": "k6",
      "threshold": { "p95": 500, "rps": 50 },
      "oracle": "Backend endpoint serving the UI sustains target rps + p95 < 500ms under 30s load",
      "locallyRunnable": false,
      "requiredBinary": "k6"
    },
    "stability": {
      "cmd": "k6 run cli/templates/test-server/stress.js --duration 4h",
      "parser": "k6",
      "oracle": "4-hour stress shows no error-rate drift > 1% beyond baseline",
      "locallyRunnable": false,
      "requiredBinary": "k6"
    }
  }
}
```

---

## §4 SKILL — wezterm-test（§171）

### 4.1 macro schema 原文 `wezterm-test-skill.ts:42-57`
```typescript
export type MacroStep =
  | { type:'spawn'; name:string; cwd?:string }
  | { type:'send'; target:string; text:string }
  | { type:'wait-for'; target:string; text:string; timeout_ms?:number; occurrence?:number }
  | { type:'assert-contains'; target:string; text:string }
  | { type:'assert-not-contains'; target:string; text:string }
  | { type:'kill'; target:string };
export interface Macro { name:string; steps:MacroStep[]; }
```

### 4.2 流程
`cmdWeztermTestSkill`（:424-515）：解析 `--macro <path>` → `fs.readFileSync` → `parseMacro`（:144-173，JSON-only，校验 step.type）→ `runMacro`（:179-330）逐 step 调 `DefaultWezTermRunner`（:343-418）。

### 4.3 step → wezterm cli 映射（**这就是"合成产物"**）
- `spawn` → `wezterm cli --prefer-mux spawn --new-window [--cwd <cwd>] [-- env K=V ... shell]` → 返回 paneId
- `send`  → `wezterm cli --prefer-mux send-text --pane-id <id> --no-paste`（text 经 stdin）
- `wait-for` → 轮询 `wezterm cli --prefer-mux get-text --pane-id <id> --start-line -1000`，每 50ms，直到出现第 occurrence 次 text 或超时
- `assert-contains/not-contains` → 对 get-text 结果断言
- `kill` → `wezterm cli --prefer-mux kill-pane --pane-id <id>`
- 产出 `RunResult{ ok, steps[], rawL1(pane文本), ansiCast? }` + `captureWezTermL1` 落 harness L1。

## §5 SKILL — playwright-test（§173）

### 5.1 spec schema 原文 `playwright-test-skill.ts:16-45`
```typescript
export type SpecStep =
  | { type:'navigate'; url:string }
  | { type:'fill'; selector:string; text:string }
  | { type:'click'; selector:string }
  | { type:'wait-for-text'; selector:string; text:string; timeout_ms?:number }
  | { type:'assert-text'; selector:string; text:string }
  | { type:'assert-not-contains'; selector:string; text:string }
  | { type:'assert-visible'; selector:string }
  | { type:'assert-no-console-error' }
  | { type:'assert-visual-match'; baseline:string; threshold?:number }
  | { type:'assert-ui-goal'; goal?:string; network_expect?:{url_pattern:string}; dom_expect?:{selector:string;text?:string}; negative?:boolean; screenshot_path?:string; llm_mode?:'heuristic'|'llm'|'off'; llm_threshold?:number; llm_rubric?:{must_contain?:string[];must_not_contain?:string[]} }
  | { type:'screenshot'; path:string };
export interface Spec { name:string; goal?:string; steps:SpecStep[]; }
```
> 注：`assert-ui-goal` 的 `llm_mode:'llm'` 是唯一会调 LLM 的地方（llmJudgeRunner 判 UI 目标），但它是**判定 oracle**，不是"合成 prompt 去驱动测试"。

### 5.2 流程
`cmdPlaywrightTestSkill`（:552-632）：`--spec <path>` → `parseSpec`（:108-144）→ `runSpec`（:162-437）逐 step 调 `DefaultPlaywrightRunner`（:464-546）。

### 5.3 step → Playwright API 映射（**"合成产物"**）
- `navigate` → `page.goto(url,{waitUntil:'load'})`
- `fill` → `page.fill(selector,text)`；`click` → `page.click(selector)`
- `wait-for-text` → 轮询 `page.textContent(selector)` 每 50ms 直到含 text 或超时
- `assert-text/not-contains/visible` → 对 textContent/isVisible 断言
- `assert-no-console-error` → 查 `page.on('console'|'pageerror')` 捕获流
- `assert-visual-match` → 截图对 baseline 比阈值；`screenshot` → `page.screenshot({path})`
- 产出 `RunResult{ ok, steps[], rawL1(console/network/pageerror 事件流) }` + `capturePlaywrightL1`。

---

## §6 SKILL FIXTURES — 全 3 个原文（verbatim，逐字 from cli/templates/skill-fixtures/）

### 6.1 d1-todo-app.macro.json（wezterm；注意 send step 里嵌的 `claude -p` prompt 是作者写的，非 skill 合成）
```json
{
  "name": "d1-todo-app-build",
  "description": "§159 D1 full-stack todo-app build macro — drives the real `claude` CLI in non-interactive print mode to scaffold server.js + index.html + test.sh. SCHEMA fixture; runnable via RL_WEZTERM_SKILL_REAL=1. NOTE 2026-05-19: (1) switched from interactive REPL (`claude\\n` + wait-for banner) to `claude -p` non-interactive pattern after Claude Code 2.1.144 banner-text drift broke the original anchor. (2) Marker uses shell single-quote concat trick `'D1''-DONE'` so the typed command does NOT contain literal substring `D1-DONE`; only the post-claude `printf` OUTPUT does. Prevents wait-for from matching the typed echo line immediately (which would short-circuit the macro in 49ms).",
  "steps": [
    { "type": "spawn", "name": "claude", "cwd": "/tmp/d1-todo-app-build" },
    { "type": "send", "target": "claude", "text": "claude --dangerously-skip-permissions -p 'Build a small todo-list web app from scratch in this working directory. Backend: Node.js + Express; single file server.js; MUST listen on port from process.env.PORT (no default; error and exit 1 if unset); routes GET /todos (returns JSON array) + POST /todos (accepts {title:string}, returns added todo with id); persists to local SQLite data.db. Frontend: single index.html with vanilla JS using selectors id=\"new-todo\" for input and id=\"add-button\" for button and class=\"todos\" on ul element; MUST read backend via relative URL /todos. Test: test.sh shell starts server with PORT from env, curls POST + GET, asserts response contains title, kills server. Run npm init -y + npm install express sqlite3 before writing server.js. Make sure PORT=3001 bash test.sh exits 0. Complete autonomously.' && printf 'D1''-DONE\\n'\n" },
    { "type": "wait-for", "target": "claude", "text": "D1-DONE", "timeout_ms": 900000 },
    { "type": "assert-contains", "target": "claude", "text": "D1-DONE" },
    { "type": "kill", "target": "claude" }
  ]
}
```

### 6.2 d1-todo-app.spec.json（playwright）
```json
{
  "name": "d1-todo-app-verify",
  "description": "§159 D1 verification playwright spec — exercises the todo-app HTTP+frontend produced by D1 macro. Assumes server already running on PORT=3001; SCHEMA fixture only; full execution requires §159 D1 dogfood slice.",
  "steps": [
    { "type": "navigate", "url": "http://localhost:3001" },
    { "type": "fill", "selector": "#new-todo", "text": "buy milk" },
    { "type": "click", "selector": "#add-button" },
    { "type": "wait-for-text", "selector": "ul.todos", "text": "buy milk", "timeout_ms": 5000 },
    { "type": "assert-text", "selector": "ul.todos li", "text": "buy milk" },
    { "type": "screenshot", "path": "/tmp/d1-todo-after.png" }
  ]
}
```

### 6.3 d3-codebase-extend.macro.json（wezterm；交互式 claude REPL + 多行需求）
```json
{
  "name": "d3-codebase-extend",
  "description": "§159 D3 codebase-extend macro — drives a CLI agent in a wezterm pane to add a new GET /health endpoint (returning {status:'ok', uptime_sec: <process.uptime() integer>}) plus a test/server.test.js assertion to a pre-seeded Express server. SCHEMA fixture only; full runnable execution (requires pre-seeded codebase + multi-minute agent run) OUT-OF-SCOPE per §172 — see README.md. Per docs/§159-3cli-macro-dev-tasks-design.md:216-237.",
  "steps": [
    { "type": "spawn", "name": "agent", "cwd": "/tmp/§159-D3-agent" },
    { "type": "send", "target": "agent", "text": "claude\n" },
    { "type": "wait-for", "target": "agent", "text": "How can I help", "timeout_ms": 30000 },
    { "type": "send", "target": "agent", "text": "This Express server has GET /todos and POST /todos. Add a new endpoint: GET /health → returns JSON {status: \"ok\", uptime_sec: <number>} where uptime_sec is the integer seconds since the process started (use process.uptime()). Also add a test in test/server.test.js asserting GET /health returns HTTP 200, response body has status === \"ok\", response body has uptime_sec >= 0. Existing tests must continue to pass. Do not modify unrelated code.\n" },
    { "type": "wait-for", "target": "agent", "text": "tests pass", "timeout_ms": 300000 },
    { "type": "assert-contains", "target": "agent", "text": "/health" },
    { "type": "kill", "target": "agent" }
  ]
}
```

---

## §7 两个"合成产物"实例（用户要的两个例子）

### 例 A：wezterm-test 跑 d1-todo-app.macro.json → 实际合成的 wezterm cli 序列
1. `wezterm cli --prefer-mux spawn --new-window --cwd /tmp/d1-todo-app-build`  → 得 paneId=N
2. `wezterm cli --prefer-mux send-text --pane-id N --no-paste`  （stdin = `claude --dangerously-skip-permissions -p '...(整段 todo-app prompt)...' && printf 'D1''-DONE\n'\n`）
3. 轮询 `wezterm cli --prefer-mux get-text --pane-id N --start-line -1000`，每 50ms，≤900000ms，直到含 `D1-DONE`
4. 对第 3 步文本断言含 `D1-DONE`
5. `wezterm cli --prefer-mux kill-pane --pane-id N`
→ 产物 `RunResult{ok, steps:[spawn/send/wait-for/assert-contains/kill 各 pass], rawL1:"=== pane N ===\n<整窗文本>"}`。
**没有 LLM prompt 被本 skill 合成**；唯一 prompt 是第 2 步 stdin 里作者手写的 `claude -p '...'`。

### 例 B：playwright-test 跑 d1-todo-app.spec.json → 实际合成的 Playwright API 序列
1. `chromium.launch({headless:true})` → `context.newPage()`（挂 console/pageerror/network 监听）
2. `page.goto("http://localhost:3001",{waitUntil:'load'})`
3. `page.fill("#new-todo","buy milk")`
4. `page.click("#add-button")`
5. 轮询 `page.textContent("ul.todos")` 每 50ms ≤5000ms 直到含 `buy milk`
6. `page.textContent("ul.todos li")` 断言含 `buy milk`
7. `page.screenshot({path:"/tmp/d1-todo-after.png"})` → `context.close()`+`browser.close()`
→ 产物 `RunResult{ok, steps:[navigate/fill/click/wait-for-text/assert-text/screenshot 各 pass], rawL1:"[console]...[network]http://localhost:3001/todos ..."}`。
**没有 LLM prompt 被合成**（除非 spec 用 `assert-ui-goal llm_mode:'llm'`，那是判定期调 LLM 判 UI，不在本 fixture）。

---

## §8 核对要点速查（最容易踩的判断）
1. **没有"合成 LLM prompt"** —— 两个 skill 都是 macro/spec → 命令序列/API 序列；"prompt"只存在于 macro 作者手写的 `claude -p` step。
2. **preset 读取零动态** —— JSON verbatim，无模板替换；`<sub-cmd>` 占位符不替换（functional cmd 是范本非即跑）。
3. **preset 注入只在 preset.enabled=true** —— 本仓 X3 设 warn-only（requireAll=false）。
4. **本次升级对 preset/skill 文件零编辑** —— 仅 X3 cmdPresetShow + .ralph-lisa.json 启用、X4 runHarnessTest 加 readiness 预检（详见 testharness-skill-preset-changes-walkthrough.md）。
