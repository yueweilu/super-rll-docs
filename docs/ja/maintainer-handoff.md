[English](../en/maintainer-handoff.md) | [中文](../zh-CN/maintainer-handoff.md) | [日本語](../ja/maintainer-handoff.md)
<!-- Translated from: docs/en/maintainer-handoff.md -->

# RLL メンテナー引き継ぎ書

**対象読者**: super-rll（Ralph-Lisa Loop、略称 RLL）を初めて引き継ぐエンジニア。
**読後に得られるもの**: プロジェクトの全体像、各コンポーネントの役割、ある部分を変更した時の影響範囲、問題が起きた時の調査ポイント、過去のメンテナーが時間を取られた落とし穴。

---

## TL;DR — 30秒版

RLL は**2エージェント協調ツール**で、2つのAIをターン制の「submit → review → fix → consensus」ループに通し、標準的なエンジニアリング規律（テストを書く、ゲートを通す、結果を偽装しない）をモデルに強制する。コードは主に TypeScript。CLI は `ralph-lisa`。

- **メインリポジトリ**: `super-rll/`（これ）
- **コアパッケージ**: `cli/`（メインCLI、約80のサブコマンド、約2400テスト）と `wecom-bot/`（WeCom メッセージを RLL に橋渡しする WebSocket デーモン）
- **ランタイム**: ユーザーが対象プロジェクト内で `ralph-lisa init` → `ralph-lisa start --auto` を実行。CLI が Claude/Codex を Ralph/Lisa として2つの tmux ペインに spawn し、CLI 自体がレフェリーとなる
- **状態管理**: すべて `<project>/.dual-agent/` にプレーンファイルとして保存（`step.txt` / `turn.txt` / `work.md` / `review.md` / `history.md` + JSON アーティファクト）
- **品質ゲート**: Ralph の全 submit が一連のチェックを通過（テストは実際に実行されたか？Lisa のレビューは実質的か？誰かが規律をバイパスしようとしていないか？）。[`test-harness-and-gates.md`](./test-harness-and-gates.md) を参照。

---

## このプロジェクトが実際に解決する問題（プロダクト視点）

AIが生成したコードを**実際に使える状態**で手に入れる——コミットごとの人間によるレビューなしで、かつモデルの自己評価を信用せずに。その仕組みは**2エージェントの相互チェック + 機械的ゲート**:

- **Ralph**（開発エージェント）: コードを書き、テストを実行し、結果を提出
- **Lisa**（レビューエージェント）: Ralph の提出を独立に読み、テストの主張を検証し、PASS または NEEDS_WORK を返す
- **CLI ゲート**: 仲介者として間に座り、Ralph の手抜き（テストスキップ、結果の偽装）と Lisa のゴム印（実質的チェックなしの PASS）を防ぐ

設計の根拠は [`docs/trustcoding-product-definition.md`](../trustcoding-product-definition.md) に記載。この引き継ぎ書では繰り返さない。メンテナーが知っておくべきこと: これがプロジェクトのコアバリューであり、「なぜこんなにチェックが多いのか」の答えは常にここに帰着する。

---

## リポジトリ構造（触る6つのディレクトリ）

| パス | 内容 | 編集時の注意点 |
|---|---|---|
| `cli/` | メインCLIパッケージ。ソースは `src/`、コンパイル先は `dist/`、テストは `src/test/`。 | CLIの動作変更にはテスト + `quality-gate` 必須。新しいサブコマンドは `cli/src/cli.ts` に case 追加 + `docs/en/reference.md` に行追加 |
| `wecom-bot/` | WeCom デーモン、独立npmパッケージ。WeCom からのユーザーメッセージ（テキスト/音声）を RLL 受信箱に引き込み、RLL 状態をプッシュバック。WebSocket ベース、**公開コールバック不要**。 | プロトコル変更は `cli/src/wecom-hook.ts`（CLI側IPCクライアント）と同期必須。`§80 cross-module-contract-check` により実施 |
| `cli-pty-daemon/` `cli-pty-daemon-vscode/` | クロスプラットフォーム IDE 統合（VSCode 拡張 + PTY デーモン）— tmux なしで Ralph/Lisa を実行可能に。 | 初期MVP、比較的独立。深く変更する前に `§46-§48` キャリーフォワードドキュメントを確認 |
| `rll-team-platform/` | バックエンドプラットフォーム（マルチユーザー監視、トークン使用量統計、エンタープライズ管理）。独立npmワークスペース。 | cli とはほぼ直交。独自の PLAN.md + テストあり |
| `lark-bot/` `dingtalk-bot/` | Lark / DingTalk 送信 webhook MVP。**プッシュ専用、インバウンド未対応**。 | 双方向化する場合は wecom-bot アーキテクチャをコピー（WebSocket スマートロボット + ローカル HTTP IPC） |
| `docs/` | ユーザードキュメント + 設計ドキュメント。**ユーザードキュメントは `zh-CN/` / `en/` / `ja/` の3言語**。設計ドキュメント（`*-design.md` 等）は `docs/` 直下に単一言語で配置、履歴SoR | 言語間同期は `§143` "translation defer" ルールに従う（コア優先、翻訳は後続） |

小さいディレクトリ（`scripts/` / `deploy/` / `test-e2e/`）は必要に応じて参照。

---

## RLL の3つの実行方法

メンテナーは各方法がどのコードパスを通るか把握すべき:

### 1. `ralph-lisa start --auto`（推奨 / 一般的）

- エントリ: `cli/src/cli.ts` case `start` → `cmdStart()` at `cli/src/commands.ts:3500+`
- 4つの tmux ペインを spawn（Ralph claude, Lisa claude/codex, watcher ステータス, ログ）。watcher が `.dual-agent/turn.txt` を監視しエージェントをトリガー
- `--engine`（`§51`）: watcher が TurnCoordinator を内包、よりシンプルな tmux 構成
- 8連続 NEEDS_WORK デッドロックまたは相互 CONSENSUS まで自律走行

### 2. `ralph-lisa start --daemon`（IDE 統合 / §47–§48）

- エントリ: `cmdStartDaemonFirst()`、`cli-pty-daemon` をバックグラウンドプロセスとして spawn。VSCode 拡張または `ralph-lisa attach <role>` シンクライアントが接続
- クロスプラットフォーム（macOS/Windows/Linux）、tmux 不要
- ユースケース: IDE内、SSHリモート、コンテナ

### 3. 手動 `ralph-lisa init` + `submit-ralph` / `submit-lisa` / `read review.md`

- スクリプトやテスト用の低レベルAPI
- 全サブコマンド一覧は [`reference.md`](./reference.md) 参照

---

## データフロー: 完全な「Ralph が submit」パス

これを理解すればバグ診断の8割はカバーできる:

```
ユーザーが Ralph ペインで claude/codex を実行
  ↓
Ralph が提出本文を .dual-agent/submit.md に書き込む
  ↓
ralph-lisa submit-ralph --file .dual-agent/submit.md を実行
  ↓
cli/src/commands.ts cmdSubmitRalph():
  ├─ 1. step.txt / turn.txt を読み取り（ralph である必要あり）
  ├─ 2. task-type-<step>.json を読み取り（§207）→ 完全TDDかファストパスか判断
  ├─ 3. runPolicyCheck() → cli/src/policy.ts checkRalph()
  │     ├─ §137 test-results-claim-verifier  (Test-Results 行 vs test-execution-log.jsonl)
  │     ├─ §149 ralph-attest                  (Test-Process / Cases / Results の3点セット)
  │     ├─ §207 task-type-file-mismatch       (review-task が cli/src/** を編集 → ブロック)
  │     ├─ §202 first-tag enforcement         (新ステップの最初のタグは [PLAN]/[RESEARCH]/[CLARIFY] 必須)
  │     ├─ §134 marker-plan-bound             (§52 tests-only マーカーは PLAN.md で宣言必須)
  │     └─ …(その他、test-harness-and-gates.md 参照)
  ├─ 4. runPlanKeeperGate()  → .rll/PLAN.md SoR 通貨チェック
  ├─ 5. autoTdd.persistPlanTestTable()  → 5列テストテーブルを auto-tdd-plan-<step>.json に書き出し
  ├─ 6. runGate()  → npm test / lint / build を実際に実行（オプション、RL_RALPH_GATE）
  ├─ 7. work.md / history.md を書き込み / last_action を追記
  ├─ 8. turn.txt を lisa にフリップ
  └─ 9. pushWecomEvent ralph_submit  → wecom-bot デーモン → ユーザーの WeCom
  
いずれかのステップが失敗 → process.exit(1) → ユーザーに BLOCKED 出力が表示される
```

`cmdSubmitLisa` はこれをミラーし、さらに §144 Verified: cite + Lisa-attest 検証が追加される。

ゲートごとの詳細は [`test-harness-and-gates.md`](./test-harness-and-gates.md) を参照。

---

## 主要実施インデックス（§xxx 一行解説）

各 `§xxx` は実装済みの機械的ルールに対応。CLI の動作を変更する際はほぼ確実にどれかに触れる——**推測せずに [`test-harness-and-gates.md`](./test-harness-and-gates.md) の該当セクションを確認すること**。

| アンカー | 一行の目的 | 詳細場所 |
|---|---|---|
| §70 | 相互 CONSENSUS 後、スライスを実際にクローズするためにテストカスケードを実行必須 | test-harness-and-gates.md §post-consensus-gate |
| §102 | 複雑タスクは実装前にテストを先に書く（tests-only ラウンド） | test-harness-and-gates.md §auto-tdd |
| §122 | サブスライスは R2 前にテスト能力を明示的に ack する必要あり | test-harness-and-gates.md §task-capability |
| §123 | 複雑度判定の3層（complexity-judge + verify + Lisa 再実行） | test-harness-and-gates.md §complexity-gates |
| §128 | 複雑タスクは R1 [PLAN] 前に R0 [CLARIFY] を通過必須 | test-harness-and-gates.md §clarify-phase |
| §133 | ポリシーデフォルトは block（warn ではない） | test-harness-and-gates.md §policy-block-default |
| §137 | Test-Results 行は test-execution-log.jsonl のエントリと対応必須 | test-harness-and-gates.md §test-results-claim |
| §144 | Lisa の PASS/CONSENSUS は `Verified:` で信頼済みアーティファクトパスを引用必須 | test-harness-and-gates.md §lisa-verified-cite |
| §149 | Ralph + Lisa 双方向 attest（片方だけのゴム印を防止） | test-harness-and-gates.md §bidirectional-attest |
| §150 | 3回連続の中間プロセススモーク失敗で task_failed にエスカレーション | test-harness-and-gates.md §smoke-auto-loop |
| §151 | UI / web スライスはスクリーンショットアーティファクトを添付必須 | test-harness-and-gates.md §visual-evidence |
| §200 §201 §202 | 非コーディングタスクの提案-合意プロトコル | test-harness-and-gates.md §propose-agree |
| §206 | セッションアンカー正規ルート | test-harness-and-gates.md §session-anchor |
| §207 | task_type ファストパス（review/doc/process は完全TDD儀式をスキップ） | test-harness-and-gates.md §task-type-fast-path |

完全な §xxx 台帳は `.rll/PLAN.md` の先頭に逆時系列で記載。

---

## 症状別デバッグランブック

症状に合わせて参照。ほとんどのケースはこれでカバーできる:

### 症状1: ユーザーの提出がブロックされ、エラーに `§xxx` または `rule: xxx-xxx` が含まれる

1. BLOCKED メッセージ内のルール名を読み取る（例: `task-type-file-mismatch`）
2. `cli/src/policy.ts` でそのルール名を grep し、トリガー箇所を特定
3. ルールのメッセージテンプレートとユーザーの提出本文を比較
4. ルールが誤判定（ユーザーは違反していないのにブロックされた）→ ルールロジックを修正 + リグレッションテスト追加
5. ルールが正しい（ユーザーが実際に違反）→ `docs/en/faq.md` にFAQエントリ追加 + `docs/en/test-harness-and-gates.md` に明確な「発動条件」セクションがあるか確認

### 症状2: Watcher / デーモンが停止、Ralph または Lisa が応答しない

1. `ralph-lisa doctor` — Watcher Health セクションを確認（ハートビート経過時間、ACKED_TURN ドリフト）
2. `ralph-lisa daemon-health-check` — wecom-bot デーモンは生きているか？
3. `cat .dual-agent/.watcher_heartbeat` — タイムスタンプ（>300s は異常）
4. `.dual-agent/watchdog.log` に SIGKILL/respawn がないか確認
5. 最終手段: `ralph-lisa start --auto` で再起動 — 状態は `.dual-agent/` にあるので再起動は安全

### 症状3: テストがローカルで通過 / CI で失敗（またはその逆）

- ローカル通過、CI 失敗 → CI の shallow checkout（depth=1）が git-diff テストに影響 / Playwright が CI に未インストール / `codex` 不在等の可能性
- ローカル失敗、CI 通過 → ローカルの tmux 環境汚染の可能性（`RL_STATE_DIR` が削除済みの §184 tempProject を指したまま）。修正: `tmux setenv -u RL_STATE_DIR && tmux setenv -u RL_SESSION_ID`
- 両方失敗 → 並行テストが `super-rll/.dual-agent/command-events.jsonl` を汚染している可能性（スナップショット形式のテスト — `§cmdRunLisa-isolation T2` は既知のフレーク）

### 症状4: ユーザーが「RLL が重すぎる / テスト計画を書くのに詰まっている」と報告

- 非コードタスク（review/doc/process）が完全TDDを走らされている可能性が高い
- ユーザーに `ralph-lisa next-step "slug" --type review-task`（または doc-task / process-task）で §207 ファストパスを使うよう伝える
- [`guide.md`](./guide.md)「タスクタイプ ファストパス」セクション + [`non-coding-task-quickstart.md`](../non-coding-task-quickstart.md) 参照

### 症状5: CLAUDE.md / CODEX.md が理解不能

- これらはエージェント向けプロトコル仕様であり、人間向けドキュメントではない。上から下まで読むと混乱する。
- §xxx で検索: `.rll/PLAN.md` ID Anchor Ledger でアンカーを見つける → CLAUDE.md / CODEX.md で該当セクションを grep
- 体系的なプロトコル理解には → `docs/*-design.md`（設計ドキュメント）を読む

### 症状6: 新しい CLI サブコマンドを追加する

1. `cli/src/cli.ts` に switch case を追加
2. `cli/src/commands.ts` に `cmdXxx()` 関数 + 必要なヘルパーを追加
3. `cli/src/test/xxx.test.ts` を作成（spawn ベースの実 CLI テスト + §149 が発火する場合は `cli/src/test/policy-block-static-audit.test.ts` の許可リストに行追加）
4. `docs/en/reference.md` + `docs/zh-CN/reference.md` に行追加
5. `ralph-lisa quality-gate` をクリーンになるまで実行
6. 現在のサブスライスに付随的なら → コミットするだけ。そうでなければ新しいサブスライスを開いてフルフローを踏む

### 症状7: リリースを切る

**重要な制約**: バージョン更新には `cli/package.json` / `cli/package-lock.json` の編集が必要だが、これらは process-task のホワイトリストに**含まれない**（`cli/src/task-type.ts:42` に「パッケージファイルは対象外」と明記）。したがってリリース作業は**必ず `code-task` を使用すること**。

1. `ralph-lisa next-step "vX.Y.Z-bump" --type code-task`
2. `cli/package.json` + `cli/package-lock.json` を編集。パッチ/マイナー/メジャーは §143 に従って選択
3. `docs/{en,zh-CN,ja}/changelog.md` を更新（ja は延期可）
4. `cli/src/test/version-decision.test.ts` の固定バージョン文字列を更新（インラインの `assert.match(out, /0\.X\.Y/, ...)` リテラルを含む）
5. `bash build-release.sh` で `rll-release-vX.Y.Z.tar.gz`（約891K）を生成
6. `ralph-lisa dogfood-gate run --strict` + `doc-update-gate run --strict` + `release-report emit` を実行
7. PR / マージ / `git tag -a vX.Y.Z -m "..."` / `gh release create vX.Y.Z rll-release-vX.Y.Z.tar.gz`

スライスが純粋にドキュメントのみ（例: 変更履歴のタイプミス修正）なら `--type doc-task` を使用。純粋に `.rll/PLAN.md` / CLAUDE.md / ドキュメントのみ（`cli/**` に触れず、パッケージファイルにも触れない）なら `--type process-task` を使用。経験則: **`cli/**` 配下の何かに触れるなら？ code-task**。

---

## 設計ドキュメント索引（必要に応じて読む、通読不要）

`docs/` 直下の `*-design.md` ファイルは過去のサブスライス設計 SoR で、大まかにグループ化されている:

- **Trust-coding 起源**: `trustcoding-product-definition.md` / `trustcoding-product-definition.md` / `trust-coding-closed-loop-design.md`
- **テストハーネス設計**: `test-harness-completion-design.md` / `test-harness-capability-evaluation.md` / `testharness-cli-webui-gate-composition.md` / `testharness-gate-comprehensive-plan.md` / `test-assertion-tiers-design.md`
- **ゲート機構**: `non-coding-gate-and-mutual-attest-design.md` / `gate-bypass-diagnostic-2026-05-16.md` / `dev-harness-closed-loop-design.md`
- **データループ (§D)**: `d2-phase2-event-ingestion-design.md` / `d4-review-startup-retrospective.md`
- **クロスプラットフォーム PTY**: `cross-platform-terminal-backend-matrix.md` / `cli-e2e-skill-pivot-design.md` / `playwright-skill-pivot-design.md`
- **CLI プラットフォーム計画**: `rll-cli-full-platform-plan.md` / `rll-stack-proposal.md` / `super-rll-roadmap-0.7-1.0.md`
- **Clarify / 計画**: `clarify-phase-design.md` / `ai_native_sdlc_and_dynamic_gate_system_v_2.md`
- **サードパーティ統合評価**: `lark-dingtalk-cli-agent-eval.md`

特定の §xxx については `.rll/PLAN.md` のサブスライスセクションを grep — 各セクションに完全な設計ナラティブが含まれている。

---

## よくある落とし穴（血で購った教訓）

1. **外部リポジトリのディレクトリを絶対に `rm -rf` しない** — ファイル単位でクリーンアップすること。（過去に margay の `scripts/` 全体を誤削除した事故あり。メモリー `feedback-never-rm-rf-foreign-repo-dir` 参照。）
2. **時期尚早な SOR アトミックフリップ禁止** — `.rll/PLAN.md` の行情報 `active → closed` は相互 CONSENSUS（Ralph と Lisa 両方の [CONSENSUS]）を待つ必要あり。片方の PASS だけでは不十分。
3. **コミット/プッシュはユーザーが明示的に要求した場合のみ** — 作業完了後に自動コミットしない。
4. **絶対に `npm publish` しない** — リリースは GitHub Release + tarball 経由。
5. **tmux 環境汚染** — §184 形式の tempProject テスト実行後、`RL_STATE_DIR` が削除済みの一時ディレクトリを指したままになる。後続の CLI コマンドが誤った stateDir を解決する。修正: `tmux setenv -u RL_STATE_DIR && tmux setenv -u RL_SESSION_ID`。
6. **Test-Results パーサーの罠** — `cli/src/test-results-claim-verifier.ts:39` `parseTestResultClaims` はバックティックでコマンドを抽出する。バックティック付きコマンドが近くにない散文形式の `42/42 passed` は `cmd='?'` にパースされ、決してログとマッチしない。安全なパターン: 明示的な `Test-Results: cmd="X" passed=N total=N` 行。
7. **`.rll/**` はセッション状態ではない** — プロセススライス SoR。code/review/doc-task は触れない。PLAN.md を編集するには process-task スライスが必要。§207 R3 に `.rll/**` を分類から除外し忘れて review-task が密かに PLAN.md を編集できたバグあり（Lisa R19 B1 で捕捉）。
8. **doc-task でも §149 attest + doc-oracle-spec 5列表を通過する必要あり** — 完全にゲートをスキップするわけではない。auto-tdd-plan + Required テスト行をスキップするだけ。test-harness-and-gates.md §task-type-fast-path 参照。

---

## 緊急連絡先

- プロジェクトオーナーのメール: `git log` `user.email` を参照（`さだはる` / `xiaomicytest@gmail.com`）
- サブスライス状態: `ralph-lisa task list` または `.rll/PLAN.md` の先頭
- 現在のラウンド / ターン: `ralph-lisa status` で一行スナップショット

混乱した状態を引き継いだ場合: まず `ralph-lisa status` + `ralph-lisa doctor` を実行。次に `git log --oneline -20` で最近のアクティビティを確認。その後 `.rll/PLAN.md` に戻ってアクティブなサブスライスのラウンド/状態を確認。
