[English](../en/changelog.md) | [日本語](../ja/changelog.md) | [中文](../zh-CN/changelog.md)
<!-- Translated from: docs/en/changelog.md -->

# 変更履歴

## v0.9.13 (2026-05-25) — non-code-task fast-path + session-anchor canonical root (§206 + §207)

**翻訳延期** (deferred translation per §143 Lisa R2 B1 lock); 詳細は英語版 [docs/en/changelog.md](../en/changelog.md) v0.9.13 セクション参照. 概要:

CCL D4 retrospective (純レビュータスクが 14 ラウンド / 1 時間 / 成果ゼロで stall) を根本解決 — analysis / doc / process タスクが TDD 6-artifact フル儀礼を回避できるルートを追加. 実コード含む slice は従来通り完全 enforcement.

新 cli: `ralph-lisa next-step "slug" --type <review-task|doc-task|process-task|code-task>`. `--type` 省略は code-task と等価 (TDD/§102/§149/§70/§123 不変).

4-class ファイル whitelist + mode-locked な 3 新規ポリシールール; `RL_POLICY_MODE=warn` で bypass 不可, `RL_TASK_TYPE_OFF` 環境変数なし (§202/§205 と同じ trust-boundary).

新ユーザードキュメント `docs/non-coding-task-quickstart.md` (~140 行).

13 テスト C1-C13 (Lisa R19 B1 paired regression 含む: review-task の `.rll/PLAN.md` 編集は必ず block / process-task は必ず pass).

§206 (commit `146d5bc`): `state.ts:resolveStateDir()` 親ディレクトリ向き探索廃止 + `.dual-agent/.session-anchor` fingerprint JSON.

バージョン: §143 規則 1 → patch 0.9.12 → 0.9.13.

テスト: cli 2375/2375 / wecom-bot 250/250 / cli-e2e 68/68 / quality-gate 5/5 PASS.

## v0.9.0 (2026-05-17) — testing-gate 全閉環 batch (§149 / §150 / §151 / §154 / §152 / §153)

**翻訳延期** (deferred translation per §143 Lisa R2 B1 lock); 詳細は英語版 [docs/en/changelog.md](../en/changelog.md) v0.9.0 セクション参照. §150 smoke-auto-loop / §151 visual-evidence-tier / §154 wecom-push-on-policy-block (PRIORITY hotfix — v0.7.0 §133 silence regression 修復) / §152 project-type-tiers / §153 lisa-watchdog の 5 slice + 1 hotfix をカバー. 約 30 個の新規テスト + zero-failure regression baseline 達成. 翻訳は後続 slice で補完予定.

## v0.8.0 (2026-05-16) — gate-bypass 修復 bundle

**翻訳延期** (deferred translation per §143 Lisa R2 B1 lock); 詳細は英語版 [docs/en/changelog.md](../en/changelog.md) v0.8.0 セクション参照. §141/§133/§137+§134+§144/§145/§139/§138/§140 の 7 ステップ gate-bypass 修復 + 4 つの新 cli サブコマンド + 3 つのデフォルト動作切り替え (opt-out env 含む) をカバー. 翻訳は後続 slice で補完予定.

## v0.7.0 (2026-05-14) — 🎉 milestone リリース

**0.7.0 release-blocker 三点セット (§103+§106+§109 per Lisa R6 lock 7) + Trust-coding 機械的強制実行アーク §122/§123/§127/§125 全て mutual CONSENSUS 完了。** cli 1283→1753 (+470 tests since 0.6.7, 0 regression)。

### Release-blocker 三点セット

- **§103 telemetry-privacy-opt-in** (closed R7) — `ralph-lisa init --telemetry yes|no|ask`; default-deny 保持
- **§106 playwright-real-e2e-test** (closed R8) — `@playwright/test` + chromium 1 real page test; `npm run test:e2e:web` → 1 passed
- **§109 daemon-spawn-env-hygiene-fix** (closed R4) — `DAEMON_SCRUB_KEYS` scrub for cli-pty-daemon (WezTerm TMUX env leak 修正)

### Trust-coding 機械的強制実行

- **§122 task-capability** + **§123 complexity-judge/verify** — Layer 1/2/3 mechanism; `task new` + `ack-user` + `complexity-judge` + `complexity-verify`
- **§127 testharness cleanup discipline** — `tempProject({tmuxSessionName, daemonPids})` mutable handle + defensive sweep
- **§125 phase-lifecycle-orchestration** — `ralph-lisa phase-gate --enter <id>` cli + fail-closed precondition

詳細は [English changelog](../en/changelog.md#v070-2026-05-14--milestone-release) 参照。Migration: zero (additive subcommands; backwards-compat schema)。

## v0.6.9 — skipped (folded into 0.7.0)

- **§122 task-capability** — `ralph-lisa task new <slug>` + `task capability ack-user --signature <T>` (R2 [CODE] 前必須); H1+H2 hooks; F0 watcher 修正
- **§123 complexity-judge / complexity-verify** — Layer 1 (LLM-primary artifact) + Layer 2 (deterministic gate) + Layer 3 (Lisa rerun bounded-blocking); NEW `gate-manifest.json`
- **§127 testharness cleanup discipline** — `tempProject({tmuxSessionName, daemonPids})` mutable handle + SIGTERM→SIGKILL + descendant sweep; NEW `loadPresetByNameWithDiagnostics`; `residual-cleanup-missing` audit narrow
- **§125 phase-lifecycle-orchestration** — `ralph-lisa phase-gate --enter <id>` cli; allowed transition graph; fail-closed precondition; `.dual-agent/smoke-results.md` mandatory (SKIPPED-row 含む)
- **§103 telemetry** — `ralph-lisa init --telemetry yes|no|ask` consent flag

詳細は [English changelog](../en/changelog.md#v069-2026-05-14) を参照。Migration: zero (additive subcommands; backwards-compat schema)。

## v0.6.8 (2026-05-12)

§102 プロトコル gap 修正 — auto-TDD artifact 永続化 + tests-only gate carve-out が `[FIX]` タグでも有効化。2 sub-slice mutual CONSENSUS 完了 (17 rounds total, 0 regression), cli 1515→1526 (+11 tests)。詳細は [English changelog](../en/changelog.md#v068-2026-05-12) を参照。

主な変更：
- **§102 v1.2**: Ralph が `[FIX]` + 非空 PLAN テストテーブルを提出 → artifact JSON が自動 refresh (手動編集不要)
- **§102 v1.3**: `[FIX]` タグ + §52 marker (`Convention: tests-only / expected-fail (§49 §C)`) → submit gate が warn-mode で動作 (`RL_RALPH_GATE=false` workaround 不要)
- **§cmdRunLisa-isolation**: `env -u TMUX RL_STATE_DIR=<tmp> ralph-lisa run-lisa` が env 指定 dir に正しく isolate (§E dogfood で発見された repo `.dual-agent` への leak バグ修正)

マイグレーション：破壊的変更なし。v0.6.7 のワークフローはそのまま動作；上記 2 つの `[FIX]` carve-out は additive；cmdRunLisa の挙動は `RL_STATE_DIR` / tmux state-dir override を使用する場合のみ変化 (env override が正しく機能するようになった)。

## v0.6.7 (2026-05-11)

Trust-codingクローズドループアーク §90→§94 — 一晩で5つのsub-sliceがmutual CONSENSUS。詳細は[English changelog](../en/changelog.md#v067-2026-05-11)を参照。

主な変更：
- §90 trust-coding-closed-loop-research（設計ドキュメント）
- §91 presetインフラ（stack-detect + cmdTestAuto stub）
- §92 auto-invoke + policy gate
- §93 Lisa-side preset audit
- §94 WeCom protocol P0強制（whose-turn自動unread inbox印刷）

cli tests: 1283 → 1415 (+132, 0 regression). 詳細：`docs/trust-coding-user-guide.md`.

## v0.4.1

### v0.4.1 の新機能

- `ralph-lisa auto --engine` が Windows でネイティブ動作するようになりました。WSL、tmux、bash は不要です。
- `--ui wt` を追加し、Windows Terminal 上で Ralph / Lisa の 2 ペイン表示を利用できます。Windows Terminal 外では `split` にフォールバックします。
- engine-first アーキテクチャを `main` に統合しつつ、TestPro コマンドとテストハーネスのワークフローを維持しました。
- CLI に残っていた POSIX 依存を Node.js ベースのプラットフォーム shim に置き換え、プロセス確認、一時ディレクトリ、URL 到達確認、コマンド検出をクロスプラットフォーム化しました。

## v0.3.x

### v0.3 の新機能

- **`update-task` コマンド**: セッションを再起動せずにタスクの方針を変更できます。task.md に追記されるため履歴が保持されます。タスクコンテキストは提出内容や watcher のトリガーメッセージに自動注入されます。
- **ラウンド 1 の `[PLAN]` 必須化**: Ralph の最初の提出は `[PLAN]` でなければならず、コーディング開始前に Lisa が理解を確認する機会を与えます。
- **Goal Guardian**: Lisa はレビューのたびに task.md を読み、方針のドリフトを確認するようになりました。コードレベルのレビューよりもミスアラインメントの早期発見が優先されます。
- **事実の検証**: Lisa が「未実装」や「不足している」と主張する場合、`file:line` のエビデンスを提示する必要があります。
- **Policy レイヤー**: `warn`/`block` モードで設定可能な提出品質チェック。
- **Watcher v3**: Fire-and-forget トリガー、30秒クールダウン、checkpoint システム（`RL_CHECKPOINT_ROUNDS`）、クラッシュ時の自動再起動、設定可能なログ閾値（`RL_LOG_MAX_MB`）、heartbeat ファイル。
- **Deadlock の回避**: consensus なしに 5 ラウンド経過後、エージェントは `[OVERRIDE]` または `[HANDOFF]` を使用できます。
- **ミニマルセットアップ**: `ralph-lisa init --minimal` でセッション状態のみを作成（プロジェクトファイルなし）。
- **`doctor` コマンド**: `ralph-lisa doctor` ですべての依存関係を確認。

### バグ修正（v0.3）

- 生成された `watcher.sh` の case パターンエスケープを修正 — JS テンプレートリテラルが case パターンからバックスラッシュを暗黙的に除去し、auto モードで起動のたびに watcher がクラッシュループに陥っていた問題を修正。
- `check-next-step` の consensus ロジックを `step` コマンドの動作に一致するよう修正。
- テスト分離の修正：テストサブプロセスで tmux 環境変数を無効化。
- TUI エージェントの互換性のために watcher の send-keys 配信を強化。

### うまくいかなかったこと

失敗の共有は結果の共有と同様に重要です：

- **エージェントのクラッシュに自動回復がない。** エージェントがクラッシュすると（長いコンテキストやシステムリソースの枯渇が原因の可能性あり）、ループが停止し、手動で再起動する必要があります。まだ自己修復機能はありません。
- **エージェント間の状態の不整合。** 初期バージョンでは Lisa が暴走し、レビューではなく自分でコードを書いてしまい、状態の混乱を引き起こしていました。現在は大幅に改善されていますが、教訓として残っています。
- **ドメイン知識がなければループは無意味。** 2つの AI は悪い設計でも喜んで合意します。これは自律的な開発ではなく、構造化された AI 支援開発です。人間の裁定者は省略できません。
- **Git の規律は絶対に必要。** 小さなコミット、明確なメッセージ、頻繁なコミット。問題が起きたとき（必ず起きます）、唯一のセーフティネットは既知の良好な状態に `git reset` できることです。
