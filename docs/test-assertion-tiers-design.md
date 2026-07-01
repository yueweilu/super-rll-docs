# Test Assertion Tiers — Design (§192)

Research/design deliverable. **Zero code in this slice** — implementation is
the §193+ queue (§9), and starts only after the user approves this design.

## 0. Problem

The test harness's assertion vocabulary is a single primitive — substring
containment. A test "passes" when an expected string appears; the harness
cannot assert structure, absence, a numeric budget, or a contract shape. The
gate compounds this: a tier is "green" when its runner exits 0 — assertion
*strength* is never checked. For `integration` / `perf` / `stability` /
`security` there is no primitive at all. Net effect: for the harder tiers,
tests are 走过场 (rubber-stamp).

The user named four concrete needs (2026-05-22):
1. per-tier assertion requirements — so a tier's tests must actually assert;
2. detecting **UX breakage** (the UI "works" technically but is broken to a human);
3. writing assertions for **AI-generated output** (non-deterministic);
4. determining whether a **UI achieved its intended goal** (not an incidental string).

## 1. Current state (audited)

- **WezTerm assertions are substring-only.** `assert-contains` = `paneText.includes(step.text)`; `wait-for` polls the same. *Verified:* `cli/src/wezterm-test-skill.ts:45-46` (step types), `:194` (`text.includes(step.text)`), `:169` (wait-for poll).
- **Playwright assertions are substring-only.** `assert-text` = `selectorText.includes(step.text)`; `wait-for-text` polls. *Verified:* `cli/src/playwright-test-skill.ts:20-21` (step types), `:161` (`text.includes(step.text)`), `:148` (wait-for poll).
- **No negative assertion** in either harness — no `assert-not-contains` / `assert-no-error`. *Verified:* `grep -n "assert-not" cli/src/{wezterm,playwright}-test-skill.ts` → no match.
- **The gate treats "tier passed" = runner process exit 0** — it never inspects whether the runner's assertions were anti-vacuous. *Verified:* `cli/src/commands.ts:1609` (`passed: rr.exit_code === 0` in the runGate per-runner loop).
- **§81 tdd-test-spec-helper lints test-spec SHAPE, not assertion STRENGTH.** Its rules (`no-test-plan`, test-case count, table columns) inspect whether the PLAN/spec has the right *structure* — not what the test code asserts. *Verified:* `cli/src/test-spec-eval.ts:157-197` (Rule 1 `no-test-plan` onward — shape rules, no assertion-strength classification). This is exactly the gap §3 fills.
- **§123 complexity-judge is the in-repo LLM-as-judge template** — "LLM is the judgement *artifact*, NOT the gate; complexity-verify (Layer 2) owns the gate." *Verified:* `cli/src/complexity-judge.ts:1-12`.
- **§151 captures screenshots as EVIDENCE, not as an assertion.** *Verified:* `cli/src/policy.ts:188` (`visual-evidence-missing`).
- **§190-followup now captures the raw pane scrollback + browser console/network/page-error streams into L1** — the data for negative/UX assertions exists; nothing asserts on it yet. *Verified:* `cli/src/wezterm-test-skill.ts:221` (pane capture), `cli/src/playwright-test-skill.ts:253` (event listeners).
- Prior capability survey: `docs/test-harness-capability-evaluation.md` (§83, 9×8 matrix).

## 2. The 8-tier assertion contract

For each §102 tier: the assertion KIND that qualifies, and the anti-vacuous
minimum bar. A tier's tests must satisfy its row; the §3 linter enforces it.

| Tier | Qualifying assertion kind | Anti-vacuous minimum bar |
|------|---------------------------|--------------------------|
| unit | structural — `deepEqual` / `throws` / exact value / `match` on pure functions or data shapes | ≥1 assertion per test; no test that only constructs/calls without asserting |
| smoke | positive presence **+ a negative "no fatal error"** assertion | the negative half is mandatory — "it rendered" alone is insufficient |
| functional | the feature's **specific state change** (the asserted value is the feature's output) + a negative (no new error) | the asserted string/value must be the feature's actual output, not an incidental constant |
| e2e | the **end-state of the user journey**, asserted precisely, + no console/network/page error captured during the run | must consume the §190 L1 event stream for the negative half |
| integration | the **boundary contract shape** — the payload/IPC/API structure & types | a rendered-text proxy does NOT satisfy integration |
| perf | a **measured budget** — duration/memory `< X` with the measured value recorded | "did not time out" does NOT satisfy perf |
| stability | **repeat-N consistency** — run N times, all pass; flake rate `< X` | a single run does NOT satisfy stability |
| security | a **security property** — no secret in output / auth required / injection rejected | — |

## 3. tier-assertion-linter

**Mechanism.** A static analyzer that, per test file mapped to a tier, parses
the test bodies and classifies each assertion into a kind (structural /
presence / negative / numeric-budget / repeat / contract-shape / llm-judge).
It then checks the tier's row in §2 is satisfied — e.g. a `perf`-tier test with
no numeric-budget assertion fails the lint; a `smoke` test with no negative
assertion fails.

**Relation to §81.** §81 lints the test-spec *shape* (does the PLAN table /
spec have the right columns, counts, IDs). This linter lints the *assertion
strength inside the test code* — a strictly deeper check. It runs as a gate
runner (its own tier `unit`) or as a submit-time policy check.

**block-vs-warn.** Proposed: `warn` for `unit`/`smoke`/`functional` initially
(high test volume, gradual adoption); `block` for `integration`/`perf`/
`stability`/`security` (low volume, and these are exactly where 走过场 hides).
Env opt-out `RL_TIER_ASSERTION_LINT_OFF=1` (audit-named, per §143). The
warn/block split per tier is a **§9 surfaced decision**.

## 4. UX-breakage detection — 3 layers

UX breakage = the UI is technically "working" (strings present, no JS error)
but broken to a human (overlap, invisible text, off-screen control, a modal
that will not close). Substring containment catches none of it. Three layers,
deterministic → semantic:

- **Layer A — DOM-visibility assertions (deterministic).** A new
  `assert-visible <selector>` step: the element exists AND is truly visible —
  not `display:none`, bounding-box non-zero, within the viewport, not occluded
  by another element. Playwright exposes `isVisible()` + `boundingBox()`;
  occlusion is checked via `elementFromPoint` at the box center. Catches "in the
  DOM but the human cannot see/use it".
- **Layer B — visual-regression diff (semi-deterministic).** A new
  `assert-visual-match <baseline>` step: screenshot the page/region, pixel-diff
  against a committed baseline, fail if the changed-pixel ratio exceeds a
  threshold. This upgrades §151 — screenshots already get captured, today only
  as evidence; this makes them an assertion. Baseline storage/refresh policy is
  a **§9 surfaced decision**.
- **Layer C — LLM-as-judge on a screenshot (semantic).** Give a screenshot +
  the test's intent to an LLM: "does this look like a working `<intent>`?".
  Catches "it just looks broken" that A/B miss. Governed by §7.

## 5. AI-output assertions

AI output is non-deterministic — `assert.equal(output, expected)` is wrong.
Four mechanisms, used together:

- **Property / invariant assertions.** Assert properties that must hold for any
  valid output regardless of exact prose: is valid JSON / contains a fenced code
  block / cites a real `file:line` / length within range / references no
  non-existent API / contains no secret. These are deterministic.
- **Schema contracts.** When the AI is asked for structured output, assert the
  JSON Schema — deterministic.
- **LLM-as-judge + rubric.** A second model grades the output against a fixed
  rubric ("does this answer the question? 0-5; threshold ≥4"). Templated
  exactly on §123 complexity-judge (§7).
- **Run-N variance bounding.** Run the generation N times; assert every
  invariant holds on every run (the prose may vary; the invariants may not),
  and that the rubric score variance is bounded.

## 6. UI-goal-achievement assertions

"Did the UI achieve its intended goal" is outcome-oriented; `assert-text
"Success"` is only a proxy. Three elements per UI test:

- **Explicit intent/goal statement.** Each UI test declares, in a structured
  field, what the user must be able to *accomplish* (e.g. "submit the contact
  form and see confirmation").
- **Outcome assertion.** Verify the goal's *result*, composed of: the behavioral
  effect (the network request fired with the expected payload — readable from
  the §190 L1 network stream), the end-state (the DOM/persisted state), and the
  negative (no error during the journey).
- **LLM-judge(screenshot, goal).** For the residual fuzzy "did it really work",
  give the LLM the final screenshot + the goal statement: "is this goal
  achieved?" — governed by §7.

## 7. LLM-as-judge non-determinism discipline

§4C, §5, §6 all use an LLM judge, which cannot be mechanically replayed. It is
governed by the §123 pattern (`cli/src/complexity-judge.ts:1-12`):

- the judgement is an **artifact, not a gate** — it is recorded, not trusted blind;
- it carries `model_id` + `prompt_template_hash` + `input_hash`, and is **cached** on that tuple (same input → same cached verdict, replayable);
- a **deterministic verify layer** backs it — for AI-output, the property/schema assertions (§5) are the deterministic floor; the LLM verdict is advisory above that floor;
- it is **bounded** — a fixed rubric, a numeric threshold, a cost/iteration cap.

A test must never pass on an LLM verdict *alone*; the deterministic layer is the
gate, the LLM verdict is an annotated signal. The exact blocking weight of the
LLM verdict is a **§9 surfaced decision**.

## 8. Why this is staged, not one slice

The contract (§2) + linter (§3) are mechanical and self-contained. The three
capabilities (§4/§5/§6) each need new harness step primitives and the §7
machinery, and §4B/§6 need baseline/screenshot infrastructure. They are
independent and individually shippable — hence the §9 queue.

## 9. Implementation slice queue (§193+)

Proposed, ordered by dependency. Each is its own slice; none starts before the
user approves this design.

| Slice | Scope | Likely files | Policy | Min test oracle | Est |
|-------|-------|--------------|--------|-----------------|-----|
| §193 tier-assertion-contract | §2 contract written into a machine-readable form (`gate-manifest.json` or a new `tier-assertion-contract.json`) + docs | `gate-manifest.json`, `docs/测试作者指南.md` | n/a (data+doc) | the contract file parses + has all 8 tiers | 3r |
| §194 tier-assertion-linter | §3 — the analyzer + gate/policy wiring | `cli/src/tier-assertion-lint.ts` (NEW), `cli/src/policy.ts`, `cli/src/commands.ts` | warn for unit/smoke/functional; block for integration/perf/stability/security; `RL_TIER_ASSERTION_LINT_OFF` | a vacuous perf test → lint flags it; a budget-asserting one → passes | 6r |
| §195 negative + DOM-visibility assertions | `assert-not-contains` (both harnesses) + `assert-visible` (playwright, §4A); consume the §190 L1 stream for `assert-no-console-error` | `cli/src/wezterm-test-skill.ts`, `cli/src/playwright-test-skill.ts` | block (it is a test primitive) | a hidden element fails `assert-visible`; a console error fails `assert-no-console-error` | 6r |
| §196 visual-regression assert | `assert-visual-match` (§4B) + baseline store under a git-committed path `cli/test-fixtures/visual-baseline/` (NOT `.dual-agent/`, which `.gitignore:2` ignores) | `cli/src/playwright-test-skill.ts`, baseline tooling | block; `RL_VISUAL_MATCH_OFF` | a deliberately shifted layout exceeds the diff threshold | 6r |
| §197 ai-output assertions | §5 — property/invariant + schema assertion primitives | `cli/src/ai-output-assert.ts` (NEW) | block | invalid JSON / hallucinated API / secret-leak each fail | 6r |
| §198 llm-judge harness | §7 — the LLM-judge primitive (§123-templated) consumed by §4C/§5/§6 | `cli/src/llm-judge.ts` (NEW), reuse §123 provider plumbing | artifact-not-gate (advisory) | same input → cached identical verdict; deterministic floor still gates | 7r |
| §199 ui-goal-achievement | §6 — intent statement field + outcome assertion + wire §198 | `cli/src/playwright-test-skill.ts`, spec schema | block (deterministic part) / advisory (llm part) | a goal met → pass; a goal not met (missing network call) → fail | 7r |

Total ≈ 41r across 7 slices. §193→§194 first (the contract + enforcement);
§198 before §199 (the judge before its consumer).

## 10. Surfaced design decisions (for user sign-off)

1. **tier-assertion-linter strictness** — the proposed warn/block split (warn for
   unit/smoke/functional, block for integration/perf/stability/security).
   Accept, or block everything, or warn everything first?
2. **LLM-judge non-determinism budget** — the LLM verdict is advisory above a
   deterministic floor (§7). Acceptable, or should the LLM verdict never affect
   pass/fail at all (pure annotation)?
3. **visual baseline management** — visual baselines must be shared/committed
   to be meaningful, so they CANNOT live under `.dual-agent/` (`.gitignore:2`
   ignores that tree). Proposed: a git-committed path `cli/test-fixtures/
   visual-baseline/`; refreshed via an explicit `ralph-lisa visual-baseline
   update` (not auto-on-first-run, which would silently bless a regression);
   diff threshold default TBD. Confirm the path + the refresh command.
4. **scope/ordering of the §193+ queue** — all 7 slices, or a subset; the
   proposed order; whether any should be merged or cut.

---

*§192 research deliverable. Implementation deferred to §193+ pending user
approval of this design.*
