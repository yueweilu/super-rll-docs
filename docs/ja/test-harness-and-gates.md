[English](../en/test-harness-and-gates.md) | [中文](../zh-CN/test-harness-and-gates.md) | [日本語](../ja/test-harness-and-gates.md)
<!-- Translated from: docs/en/test-harness-and-gates.md -->

# テストハーネスと品質ゲート: 仕組みとブロック解除方法

**対象読者**: (1)「なぜ提出がブロックされたのか」をデバッグしたいユーザー; (2) 実施ルールを追加/変更/削除するメンテナー。
**読後に得られるもの**: 各ゲートが何を実施しているか、その理由。ブロックされた時の解除手順。メンテナー向け: 新しいルールを追加する場所と書くべきテスト。

---

## TL;DR メンタルモデル

RLL は「Ralph が書き / Lisa がレビューし / 両者が合意する」フローを**3層のゲート**に分割する:

```
[1] 提出時ゲート (submit-time gate)
    └─ cli/src/policy.ts:checkRalph() / checkLisa()
       毎回の submit-ralph / submit-lisa で実行
       失敗 → process.exit(1) → ユーザーに BLOCKED 表示

[2] 双方向 attest ゲート (bidirectional attest)
    └─ §149 ralph-attest + §144 lisa-verified-cite
       Ralph は自身の Test-Process/Cases/Results を自己引用必須
       Lisa は Verified: <信頼済みアーティファクト> を引用必須
       各側が相手を検証。どちらも単独でゴム印を押せない

[3] 合意後カスケード (post-consensus cascade)
    └─ §70 handleMutualCompletion → cli/src/test-cascade.ts:runTierCascade()
       Ralph + Lisa 両方が [CONSENSUS] になった後にのみ発火
       実際にテストカスケードを実行（unit/smoke/integration/e2e）
       Required ✓ 行が1つでも失敗 → §79 ループバックで Ralph に戻る
```

**なぜ1層ではなく3層か**: 第1層はプロトコル違反（構文、順序、フィールド欠落）を捕捉。第2層は虚偽の報告（「テスト実行した」と言ったが実際はしていない）を捕捉。第3層はテスト設計の問題（「1つの tier は通るが他が失敗する」）を捕捉。

---

## 第1層: 提出時ポリシー

### 仕組み

`cli/src/commands.ts:cmdSubmitRalph()` と `cmdSubmitLisa()` は work.md / review.md の書き込みやターンフリップの前に `runPolicyCheck(role, tag, content, ctx)` (`cli/src/policy.ts:838`) を呼び出す。この関数は全ルールトリガーの `violations[]` を収集し、`RL_POLICY_MODE` に従ってブロックか警告かを決定する。

`RL_POLICY_MODE` はデフォルトで `block`（2026-05-16 より §133）。v0.7.0 以前は `warn` がデフォルトで、実施が黙ってバイパス可能だった。事後分析は `docs/gate-bypass-diagnostic-2026-05-16.md` 参照。

一部のルールは**モードロック**（信頼境界）: `RL_POLICY_MODE=warn` でもブロックする:

- `task-capability-missing` / `task-capability-unacked` / `unsupported-tier-no-consent` (§122)
- `complexity-judge-missing` / `complexity-verify-failed` / `mode-off-without-user-ack` / `lisa-rerun-high-confidence-missing` / `expected-tier-not-in-required` (§123)
- `task-type-file-mismatch` / `task-type-declaration-mismatch` / `non-code-task-evidence-missing` (§207)
- `auto-tdd-protocol` (§102)

これらは dev モードでも回避を許すべきでない機械的保証。設計理由: 信頼境界アクションはユーザー開始必須（`ack-user`、`ack-scope-expansion`、`--type` 等）— Ralph は自己偽装できない。

### 主要ルール

以下、提出本文に対して発火する順に記載。各ルールに (a) 仕組み (b) トリガー例 (c) ブロック解除方法 を付記。

---

#### §149 ralph-attest（Ralph の3行）

**仕組み**: Ralph の全 `[CODE]` / `[FIX]` 本文に以下が必須:
- `Test-Process: <inline | file://path | git-diff HEAD~N..HEAD>` — テスト実行方法
- `Test-Cases: C1, C3, C7` — 対象ケース（PLAN.md の5列表の ID と一致）
- `Test-Results: cmd="npm test --prefix cli" passed=N failed=0 total=M` — 実際の結果

散文形式の「テスト合格」を機械検証可能なフィールドなしで書くのを防止。

**典型的な BLOCKED メッセージ**:
```
[FIX] §149: must include Test-Process: <inline|file-path|git-diff>
[FIX] §149: must include Test-Cases: C1, C2, ...
[FIX] §149: must include Test-Results: counts|file-path|log-cite
```

**ブロック解除方法**:

1. 以下の3行を逐語的に追加（コロン + 引数を含む）:
   ```
   Test-Process: file://.dual-agent/visual-evidence/<step>.md
   Test-Cases: C1, C2, C3
   Test-Results: cmd="npm test --prefix cli" passed=N failed=0 total=M
   ```
2. doc-task / process-task ファストパスでもこれらは必要（§207 ファストパスは auto-tdd-plan をスキップするが §149 はスキップしない）。許容形式:
   ```
   Test-Process: file://.dual-agent/work.md
   Test-Cases: D1, D2, D3
   Test-Results: cmd="node cli/dist/cli.js plan validate" Exit code: 0
   ```
3. **実際にテストを実行していない**（例: 純粋な文章修正）→ `Skipped:` + 理由:
   ```
   ### Test Results
   Skipped: pure-prose fix per Lisa narrow; no executable test path
   Exit code: 0 (no commands executed)
   ```

**実装**: `cli/src/policy.ts:60-90`（ルール `ralph-test-process-missing` / `ralph-test-cases-missing` / `ralph-test-results-missing`）。

---

#### §137 test-results-unverified

**仕組み**: `Test-Results: cmd="X" passed=N total=M` は直近10分以内の `.dual-agent/test-execution-log.jsonl` に一致する実行レコードが必要。偽のテスト結果主張（`passed=100` を実際に実行せずに主張）を防止。

`cli/src/policy.ts:280-299` が `verifyTestResultsClaims()` を呼び出し、本文の主張とログを比較。不一致 → ブロック。

**典型的な BLOCKED**:
```
[CODE] Test Results contains unverified claims (no matching execution log entry in last 10min): `npm test --prefix cli`. Run test before submitting or cite Skipped: with justification.
```

**ブロック解除方法**:

1. 実際にゲートを実行してログを書かせる: `ralph-lisa quality-gate`（複数の cmd エントリを jsonl に書き込む）
2. 直後に提出（10分以内）
3. 本文の cmd 文字列がログエントリの cmd と**完全一致**すること（`--prefix cli` を含む。ログには `npm test --prefix cli` と記録され、`npm test` ではマッチしない）
4. `passed=` / `total=` がログの数値と一致すること。不一致は未検証扱い（意図的 — 古いログの使い回しを防止）

**`cmd='?'` の罠**: パーサー（`cli/src/test-results-claim-verifier.ts:39`）はバックティック経由でコマンドを抽出する。`12/12 pass` や `Actions in this step: 3` のような散文を書くと、パーサーは cmd `?` の主張として扱い → 決してログとマッチしない → ブロック。

修正: 明示的な `Test-Results: cmd="X" passed=N total=N` 行を使う（散文パーサーを使わない）か、すべての `\d+/\d+ pass` リテラルを本文から削除する。

**実装**: `cli/src/test-results-claim-verifier.ts:31-99`。

---

#### §144 lisa-verified-cite

**仕組み**: Lisa の `[PASS]` / `[CONSENSUS]` 本文に `Verified: <path>` が必須。パスは信頼済みパスのホワイトリストに含まれる必要がある:
- `.dual-agent/gate-results.{md,json}`
- `.dual-agent/harness-results/*`
- `.dual-agent/auto-tdd-plan-*.json`

ファイルの mtime が5分以内であること。

Lisa が「良さそう」と言うだけでアーティファクトなしに PASS するのを防止（空ファイルを作ってもダメ — パスが信頼済みで新鮮である必要がある）。

**典型的な BLOCKED**:
```
[PASS] §144: lisa-rerun-not-verified (no `Verified: <trusted-path>` cite within last 5min)
```

**ブロック解除方法**:

3つの信頼済み引用パターン（シナリオに応じて1つ選択）:

1. **quality-gate / runGate を実行した** → `Verified: .dual-agent/gate-results.md`（`gate-results.json` も可）。最も一般的。
2. **テストハーネスを実行した（カスケード / ループバック / プリセット）** → `Verified: .dual-agent/harness-results/<証拠ファイル>.md`。Lisa がこのディレクトリにレビューサマリーファイルを書いて引用することも可 — PLAN のみのラウンドで有効。
3. **§70 カスケードまたは §102 永続化** → `Verified: .dual-agent/auto-tdd-plan-<step>.json`

⚠️ **よくあるミス**: `plan validate` は `.dual-agent/gate-results.md` を**書き込まない**（PLAN.md の構文/アンカーを検証するだけ）。`plan validate` だけ実行した場合は、代わりに `.dual-agent/harness-results/<...>.md` ファイルを引用すること（Lisa がそこにレビューサマリーを書く）。`.dual-agent/review.md` は信頼済みホワイトリストに含まれていない — 引用するとブロックされる。

5分の鮮度: ファイル mtime ≤5分。アーティファクトを生成したらすぐに提出すること。中断された場合は再生成してから再提出。

**実装**: `cli/src/policy.ts:535-583`（信頼済みパス ホワイトリスト + mtime チェック）。

---

#### §134 marker-plan-bound（§52 tests-only マーカー）

**仕組み**: Ralph の R2 [CODE] "tests-only / expected-fail" ラウンドに以下の行を含めることができる:

```
Convention: tests-only / expected-fail (§49 §C)
```

マーカーがあると、ゲートが warn モードに切り替わり（テスト失敗でも提出通過）、純粋なテストファーストラウンドを可能にする。

**ただし**: マーカーは無条件には機能しない。以下の少なくとも1つが成立している必要がある:

1. `.rll/PLAN.md` の現在のサブスライス行が `tests-only: true` を宣言
2. 本文に `R2 [CODE] tests-only` の自己宣言を含む
3. 現在のステップに既にマーカー付き R2 [CODE] ラウンドがある（後続の [FIX] が継承）

上記がない場合、マーカーはバインドされず、テスト失敗は依然ブロックされる。

**典型的な BLOCKED**:
```
[CODE] §134: tests-only marker present but plan row does not declare `tests-only: true`; marker unbound
```

**ブロック解除方法**:

- R2 [CODE]: PLAN.md 行に `tests-only: true` を追加するか、本文に `## R2 [CODE] tests-only` と書く
- R3 [CODE]（本番ラウンド）: **マーカーを持ち越さない**（効果がない上、バイパス意図のシグナルになる）

**実装**: `cli/src/policy.ts:1140-1180` + `cli/src/commands.ts:1152`。

---

#### §207 task-type-file-mismatch（task_type ファイルホワイトリスト）

**仕組み**: 各サブスライスに task_type（`code-task` / `review-task` / `doc-task` / `process-task`）があり、各タイプにファイル書き込みホワイトリストがある:

- `code-task`: どこでも可（デフォルト 完全TDD）
- `review-task`: `docs/**` + `.dual-agent/**` のみ
- `doc-task`: + トップレベル `*.md` + `CLAUDE.md` / `CODEX.md` / `README.md`
- `process-task`: + `.rll/**` + `docs/**`

Ralph の全提出時に、ポリシーが `computeStepDiff()` を実行してスライスの変更ファイルを列挙し、ホワイトリストと照合。範囲外 → ブロック。

防止対象: `--type review-task` と宣言してファストパスを使いつつ、密かに `cli/src/foo.ts` を編集する行為。

**典型的な BLOCKED**:
```
[CODE] task-type-file-mismatch: review-task cannot modify forbidden path(s) cli/src/foo.ts; rerun as code-task or split into follow-up code slice.
```

**ブロック解除方法**:

1. 本当にコードを編集する必要がある → code-task スライスを開く: `ralph-lisa next-step "fix-foo" --type code-task`（完全TDD）
2. 正当なレビューだが誤検出（例: 自動書き込みファイル）→ `.dual-agent/step-start-dirty-<step>.txt` スナップショットで既存ファイルの欠落を確認
3. `RL_POLICY_MODE=warn` では**バイパス不可**（モードロック）。`RL_TASK_TYPE_OFF=1` でも不可（env は存在しない、C13 リグレッションでアンチループホールロック済み）

**重要なニュアンス**（§207 R3 修正ロック）: ポリシーは task_type を**明示的宣言のみ**で決定（SoR JSON または本文の `Task type:` 行）。推論は行わない。これにより `.rll/progress/<date>.md` の自動書き込みがコードスライスを process-task と誤分類するのを防止。

**実装**: `cli/src/policy.ts:300-353` + `cli/src/task-type.ts`。

---

#### §202 first-tag enforcement

**仕組み**: 新しいサブスライスに入った後、Ralph の最初の提出は `[PLAN]` / `[RESEARCH]` / `[CLARIFY]` でなければならない（`[QUESTION]` は例外、ラウンド開始ではない）。プランなしで直接 [CODE] に飛ぶのを防止。

**ブロック解除方法**: まず [PLAN] を書く。緊急/レガシー用: `RL_R1_FIRST_TAG_OFF=1`（このルールには env オプトアウトあり。task-type とは異なる）。

---

#### §122 task-capability-ack（ユーザー駆動の信頼境界）

**仕組み**: `ralph-lisa task new <slug>` でサブスライスを開くと、能力検出（cli / web / mobile / e2e testing）がトリガーされ、`.dual-agent/task-harness-capability.json` が書き込まれる。R2 [CODE] の前に、ユーザーが明示的に ack する必要がある:

```bash
ralph-lisa task capability ack-user --signature "<token>"
```

Playwright がインストールされていないのに Ralph が「E2E テストできます」と主張するのを防止。ユーザーが独立に検証する必要がある。

**典型的な BLOCKED**:
```
[CODE] task-capability-unacked: §122 acked=false — user must run `ralph-lisa task capability ack-user --signature "<token>"` before R2 [CODE]
```

**ブロック解除方法**: `task capability ack-user` を明示的に実行。**Ralph は自己偽装不可**（信頼境界）。

---

#### §128 clarify-not-completed

**仕組み**: 複雑タスク（complexity-judge `task_complexity_class=complex|expert`）は R1 [PLAN] の前に R0 [CLARIFY] を通過する必要がある:

```bash
ralph-lisa clarify --start  # 5ステージグリル
# ...
ralph-lisa clarify --commit --understanding "..." --covered "..." --negative-scope "..." --risks "..."
# .dual-agent/clarify-locked-<step>.json を書き込み
```

これがないと R1 [PLAN] 提出が `clarify-not-completed` でブロックされる。

**ブロック解除方法**: 完全な clarify 5ステージを実行。または単純タスクなら `ralph-lisa clarify --skip`（警告は出るがブロックなし。complexity_class は不変）。

---

#### §123 complexity-verify-failed

**仕組み**: R1 [PLAN] 本文に complexity-judge JSON（`ralph-lisa task complexity-judge --slice X --json` の出力を貼り付け）が必須。提出前に `complexity-verify` が決定論的ハードゲートとして実行される（スキーマ / canonical_tier_ids / Required カバレッジ）。

Ralph が PLAN 時に低複雑度と宣言して §102 TDD-first エスカレーションを回避するのを防止。

**ブロック解除方法**: テンプレートに従って judge JSON を貼り付け + `task complexity-verify --slice X` を実行して exit 0。

---

#### `doc-oracle-spec`（doc-task 専用 5列表）

**仕組み**: doc-task PLAN に 5列表（§102 の6列フェーズ表とは別）が必須:

```
| ID | Dimension | Verification Method | Pass Criteria | Required |
|----|-----------|---------------------|---------------|----------|
| D1 | topic-coverage | <検証方法> | <合格基準> | ✓ |
```

`Dimension` 列は `cli/src/doc-oracle-spec.ts:21` `CANONICAL_DOC_ORACLE_DIMENSIONS` の9つの正規値のみ受け付ける: `data-accuracy` / `source-authority` / `source-freshness` / `logical-coherence` / `compliance-with-user-spec` / `ai-slop` / `style` / `topic-coverage` / `depth-detail`。

doc-task が 5列表をスキップしつつ oracle テーブルも提供しないのを防止（§70 カスケードの検証対象がなくなるため）。

**ブロック解除方法**: 5列表を ≥1 の Required ✓ 行付きで書く。Dimension は9つの正規値のいずれかであること。

**`Verification Method` 列にリテラルの `|` を含めてはいけない**（バックティック内でも）— markdown テーブルパーサーが `|` を列区切りと解釈する。`\|` を含む grep コマンドを書く必要がある場合は、スペース区切りのキーワードリストに言い換えること。

---

### 新しいルールの追加方法

1. **設計**: `.rll/PLAN.md` に新しい §xxx サブスライスを開き、ルールの理由、トリガー条件、エラーテンプレート、エッジケースを文書化
2. **実装**: `cli/src/policy.ts` の `checkRalph()` または `checkLisa()` に違反プッシュを追加。信頼境界ルール（モードロック）の場合は、ルール名を `runPolicyCheck()` の機械的バイパスフィルターと常時ブロックリストの両方に追加
3. **テスト**: `cli/src/test/` に spawn ベースのテストを追加 — 少なくとも1つの陽性（トリガーなし/ブロックなし）、1つの陰性（トリガー → ブロック）、1つのアンチループホール（`RL_POLICY_MODE=warn` でバイパス不可）
4. **ドキュメント**: このファイルにセクションを追加（仕組み / トリガー例 / ブロック解除方法 / 実装）+ [`maintainer-handoff.md`](./maintainer-handoff.md) のキー実施インデックスに行追加
5. **静的監査**: `cli/src/test/policy-block-static-audit.test.ts` が policy.ts を自動スキャンして未カバーのルールを検出。新しいルールを許可リストに登録すること

---

## 第2層: 双方向 attest (§149)

### 仕組み

§149 は Ralph と Lisa に**相互の作業を attest させる**:

- Ralph は自身のテスト3点セット（Test-Process / Cases / Results — 上記 §149 ralph-attest でカバー）を引用必須
- Lisa は自身の Reviewed-PLAN-rows / Reviewed-test-files / Reviewed-test-log + Pass-Rationale（≥40文字 + ≥1 の file:line 引用）+ Verified パスを引用必須
- Ralph は [CONSENSUS] 提出前に**カウンター attest**: Lisa の最新 PASS に対して `verifyLisaAttest()` を実行。quality_score が低すぎる場合 → `ralph-must-challenge-rubber-stamp-pass` が [CONSENSUS] をブロックし、代わりに [CHALLENGE] を要求

Ralph + Lisa が共謀して「両方 PASS」のゴム印モードに入るのを防止。

### ブロック解除 / 調整方法

- Ralph が薄い Lisa PASS を受け取った → 最初のアクションは [CHALLENGE]（1ラウンドにつき最大1回）。[CONSENSUS] ではない
- Lisa の指摘が不十分に具体性に欠ける → Ralph は file:line 引用 + 検証済み oracle を要求する [CHALLENGE] を提出
- 詰まった場合（ゴム印ループ）→ `RL_LISA_ATTEST_OFF=1` / `RL_RALPH_ATTEST_OFF=1`（監査名付きオプトアウト。夜間自律走行では非推奨。実質的に緊急脱出用）

**実装**: `cli/src/lisa-attest.ts` + `cli/src/policy.ts:443-528`。

---

## 第3層: 合意後カスケード (§70)

### 仕組み

Ralph と Lisa の両方が `[CONSENSUS]` に達すると、`cli/src/commands.ts:handleMutualCompletion()` が**実際のテストカスケード**をトリガーする:

1. まず `.dual-agent/auto-tdd-plan-<step>.json`（§102 R1 PLAN から永続化された5列表）を読み取り
2. `escape: {tests: 'none', reason: '...'}` → カスケードスキップ、status=passed
3. 行がある場合 → `runTierCascade()` (`cli/src/test-cascade.ts`) を呼び出し、unit → smoke → integration → e2e → perf → stability → security の順に実行
4. Required ✓ 行が1つでも失敗 → **§79 ループバック**: 構造化された失敗コンテキストを `.dual-agent/loopback-<step>.json` に書き込み、ターンを Ralph に戻す。Ralph はカスケード失敗を読み取り [FIX] を提出
5. 3回連続のカスケード失敗 → §71 ESCALATE: `task_failed` イベントを書き込み、ユーザーに wecom-push

両者が [CONSENSUS] だがテストが実際に実行されていない/一部が黙って失敗しているのを防止。

### ブロック解除 / 調整方法

- カスケード失敗 → `.dual-agent/loopback-<step>.json` の `failure_context` フィールドを確認（生 stderr + stdout サマリー）
- `RL_GATE_INCLUDE_OPTIONAL=true` で Required=✗ 行もカスケードに含める（デフォルトではスキップ）
- 完全な escape（稀）: R1 PLAN 本文に `**Tests**: none (<reason>)` と書く。reason はホワイトリスト `doc-only` / `config-only` / `single-rename` / `process-only` のいずれか

**実装**: `cli/src/commands.ts:7619-7820` (`handleMutualCompletion`) + `cli/src/test-cascade.ts` (`runTierCascade`) + `cli/src/loopback.ts`。

---

## 付録: quality-gate コマンドチートシート

メンテナーが最もよく使うもの:

```bash
# フルゲート（毎コミット前に推奨）
ralph-lisa quality-gate
# 同等: plan validate + plan validate (sibling repo) + npm test --prefix cli + wecom-bot + cli-e2e

# 提出時ゲート（policy.ts checkRalph 単独、実際のテスト実行なし）
ralph-lisa task complexity-verify --slice X
ralph-lisa plan validate-phase-tests --slice X

# リリースゲート（リリース前必須）
ralph-lisa dogfood-gate run --strict      # エンドツーエンド実施シナリオ
ralph-lisa doc-update-gate run --strict   # ドキュメント主張 vs コード実装のドリフト検出
ralph-lisa release-report emit            # 証拠集約 → release-report-<slug>.md
```

依存関係と watcher 健全性は `ralph-lisa doctor`。1行のターン/ラウンド/ステップスナップショットは `ralph-lisa status`。
