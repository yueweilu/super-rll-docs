[English](../en/testing-plan.md) | [日本語](../ja/testing-plan.md)
<!-- Translated from: docs/en/testing-plan.md -->

# Ralph-Lisa Loop v0.4.0 — 完全テスト計画

## 概要

この計画は v0.4.0 リリースサイクルの全機能をカバーする:
- Fix A: TmuxUI file-tail 書き直し
- Fix B: Transport デバッグログ
- Fix C: Codex 0.40+ 互換性（sandbox + UUID + threadId）
- Fix D: Transport → UI 直接ストリーミング
- P0: watch-lisa（永続接続ウォッチャー）
- P1: ralph-lisa review（ステートレスワンショット）
- P2: Git post-commit hook
- P4: MCP 切り詰め + handoff 修正
- P5: マルチIDEルールファイル（Windsurf, Cline）
- P6: IDE 統合ドキュメント
- Layer 2: Ralph テンプレートのフェーズ完了トリガー

---

## 1. 前提条件

### Mac

```bash
node -v          # >= 18
git --version
claude --version # Claude Code CLI
codex --version  # Codex CLI
tmux -V          # --ui tmux テスト用
```

### Windows

```powershell
node -v          # >= 18
git --version
claude --version
codex --version
echo $env:WT_SESSION  # Windows Terminal 内で実行時は非空
```

---

## 2. 自動テスト（最初に実行）

```bash
cd cli
npm run build
npm test
```

**期待値**: 627/627 合格, 0 失敗

---

## 3. Init / Uninit（全プラットフォーム）

### 3.1 Init がすべての IDE ファイルを作成

```bash
mkdir /tmp/rll-test-init && cd /tmp/rll-test-init && git init
ralph-lisa init    # または: node <path>/cli/dist/cli.js init
```

**確認項目**:
- [ ] `CLAUDE.md` が存在し、`RALPH-LISA-LOOP` マーカーを含む
- [ ] `.cursorrules` が存在し、マーカーを含む
- [ ] `.windsurfrules` が存在し、マーカーを含む
- [ ] `.clinerules` が存在し、マーカーを含む
- [ ] `.github/copilot-instructions.md` が存在し、マーカーを含む
- [ ] `CODEX.md` が存在し、マーカーを含む
- [ ] `.git/hooks/post-commit` が存在し、`ralph-lisa review` を含む
- [ ] `.dual-agent/` ディレクトリが存在し、turn.txt、round.txt、step.txt を含む
- [ ] コンソールに全作成ファイル + 使用説明（IDE / CLI / one-shot）が表示される

### 3.2 テンプレートのフェーズ完了トリガー

```bash
grep "When to Submit" CLAUDE.md
grep "Phase Completion Triggers" .cursorrules
```

**確認項目**:
- [ ] 両方のファイルに必須トリガーテーブル（PLAN/CODE/FIX/commit/CONSENSUS）が含まれる
- [ ] 両方に `auto-review.md` advisory channel への言及がある

### 3.3 再 init は冪等

```bash
ralph-lisa init   # 再度実行
```

**確認項目**:
- [ ] 既存ファイルに対してコンソールに "Updating" と表示される（"Creating" ではない）
- [ ] ファイル内容が最新（最新テンプレート）
- [ ] 重複マーカーブロックがない

### 3.4 Uninit がすべてをクリーンアップ

```bash
ralph-lisa uninit
```

**確認項目**:
- [ ] `CLAUDE.md` が削除済み（または既存内容があった場合はクリーンアップ済み）
- [ ] `.cursorrules` が削除済み
- [ ] `.windsurfrules` が削除済み
- [ ] `.clinerules` が削除済み
- [ ] `.github/copilot-instructions.md` が削除済み
- [ ] `CODEX.md` が削除済み
- [ ] `.git/hooks/post-commit` が削除済み
- [ ] `.dual-agent/` が削除済み
- [ ] `.claude/` がクリーンアップ済み
- [ ] `.codex/` がクリーンアップ済み

---

## 4. Engine モード — Quiet（Mac + Windows）

### 4.1 Ralph=Claude, Lisa=Codex

```bash
mkdir /tmp/rll-test-quiet && cd /tmp/rll-test-quiet && git init
ralph-lisa auto --engine --ralph-backend claude --lisa-backend codex \
  --task "say hello and exit" --max-rounds 3 --auto-approve --debug --ui quiet
```

**確認項目**:
- [ ] Ralph 接続済み、Lisa 接続済み
- [ ] Round 1: Ralph [PLAN]、Lisa がタグ（[NEEDS_WORK] または [PASS]）で応答
- [ ] Round 2+: Ralph が応答、Lisa が応答
- [ ] `invalid type: boolean false` エラーなし（Fix C v1）
- [ ] `Failed to parse thread_id` エラーなし（Fix C v1）
- [ ] `Session not found` エラーなし（Fix C フォローアップ）
- [ ] デバッグログが `.dual-agent/debug/` に作成される:
  - [ ] `coordinator.log` に prompt_sent/prompt_response イベントあり
  - [ ] `ralph-raw-io.log` に spawn/stdin_raw/stdout_raw/exit イベントあり
  - [ ] `lisa-raw-io.log` に spawn/stdin_raw/stdout_raw/exit + `thread_id_adopted` イベントあり
- [ ] max-rounds または consensus で終了（クラッシュではない）

### 4.2 Windows 固有チェック

- [ ] ローカルドライブ（D:\）から実行、SMB 共有（Z:）ではない — EBADF 回避
- [ ] DEP0190 警告が表示されるが機能は妨げない
- [ ] `.dual-agent/debug/*.log` ファイルが空でない

---

## 5. Engine モード — tmux（Mac のみ）

```bash
mkdir /tmp/rll-test-tmux && cd /tmp/rll-test-tmux && git init
ralph-lisa auto --engine --ralph-backend claude --lisa-backend codex \
  --task "say hello" --max-rounds 3 --auto-approve --ui tmux
```

別のターミナルで: `tmux attach -t rll-engine`

**確認項目**:
- [ ] tmux セッションが作成され、attach 可能
- [ ] 左ペイン: Ralph の**完全な提出テキスト**がリアルタイムでストリーミングされる（`─── [TAG] Round N ───` 区切り線だけではない）
- [ ] 右ペイン: Lisa の**完全なレビューテキスト**がリアルタイムでストリーミングされる
- [ ] ペインに `zsh: command not found` エラーなし（Fix A）
- [ ] ステータスバーに `Round N | turn | step | status` が表示される
- [ ] 提出内の特殊文字が正しくレンダリングされる（[CODE], $HOME, backticks）

---

## 6. Engine モード — wt（Windows のみ）

Windows Terminal 内で実行すること:

```powershell
mkdir D:\temp\rll-test-wt; cd D:\temp\rll-test-wt; git init
node <path>\cli\dist\cli.js auto --engine --ralph-backend claude --lisa-backend codex `
  --task "say hello" --max-rounds 3 --auto-approve --ui wt
```

**確認項目**:
- [ ] Windows Terminal が新しいタブを2ペインで開く
- [ ] 左ペイン: Ralph の出力がストリーミングされる（文字化けなし — UTF-8 修正）
- [ ] 右ペイン: Lisa の出力がストリーミングされる
- [ ] PowerShell `;` パースエラーなし（script-file 修正）
- [ ] フォールバック: WT 外で実行すると警告表示 + split モードにフォールバック

---

## 7. run-lisa（単一ラウンド）

```bash
cd /tmp/rll-test-init   # init 済みのプロジェクト
ralph-lisa init
# Ralph として作業を提出
echo "[PLAN] Test plan for hello world" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
# Lisa を実行
ralph-lisa run-lisa --lisa-backend codex --auto-approve
```

**確認項目**:
- [ ] Lisa が接続し、レビューを stdout に返す
- [ ] レビューにタグ（[PASS] または [NEEDS_WORK]）が含まれる
- [ ] `.dual-agent/review.md` が更新される
- [ ] `turn.txt` が `ralph` に戻る

---

## 8. watch-lisa（永続ウォッチャー）

### ターミナル 1:

```bash
cd /tmp/rll-test-init
ralph-lisa watch-lisa --lisa-backend codex --auto-approve
```

**確認項目**:
- [ ] コンソールに "Lisa connected — watching for Ralph's submissions" と表示
- [ ] プロセスが生存し続ける（終了しない）

### ターミナル 2:

```bash
cd /tmp/rll-test-init
echo "[PLAN] Watch test plan" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

**ターミナル 1 で確認**:
- [ ] ウォッチャーがターン変更を検出: `📥 Ralph [PLAN] Round N — sending to Lisa...`
- [ ] Lisa が応答: `📤 Lisa [NEEDS_WORK/PASS] Round N — review written`
- [ ] ウォッチャーが監視を継続（終了しない）

### Round 2（同じターミナル 2）:

```bash
echo "[FIX] Addressing Lisa's feedback" > .dual-agent/submit.md
ralph-lisa submit-ralph --file .dual-agent/submit.md
```

**確認項目**:
- [ ] ウォッチャーが自動的に再受信
- [ ] Lisa が Round 1 のコンテキストを保持（永続接続 — 前回のレビューに言及）

### エラー回復:

- [ ] ターミナル 1 で Ctrl+C: "Stopping Lisa watcher... Lisa disconnected." クリーン終了
- [ ] Lisa transport エラー時: ウォッチャーはエラーをログに記録するが継続（クラッシュしない）

---

## 9. review（ステートレスワンショット）

### 9.1 変更あり

```bash
cd /tmp/rll-test-init
echo "console.log('hello')" > hello.js
git add hello.js
ralph-lisa review --auto-approve --lisa-backend codex
```

**確認項目**:
- [ ] レビュー出力が stdout に表示される
- [ ] [PASS] または [NEEDS_WORK] タグを含む
- [ ] 実際のファイル変更を参照している

### 9.2 --scope 付き

```bash
echo "test" > src/test.js
git add src/test.js
ralph-lisa review --auto-approve --scope "src/"
```

**確認項目**:
- [ ] レビューが `src/` の変更のみをカバー
- [ ] `src/` に変更がない場合、スコープなし diff にフォールバックしない（エラーを報告）

### 9.3 変更なし

```bash
git stash  # 全変更をクリア
ralph-lisa review --auto-approve
```

**確認項目**:
- [ ] エラーメッセージ: "no changes found"
- [ ] 終了コードが非ゼロ

### 9.4 セキュリティ: scope インジェクション

```bash
ralph-lisa review --scope '$(echo pwned)'
```

**確認項目**:
- [ ] シェルコマンド実行なし（execFileSync がインジェクションを防止）
- [ ] リテラルパスに一致するファイルをレビューするか、変更なしを報告

---

## 10. Git Post-Commit Hook

```bash
cd /tmp/rll-test-init
ralph-lisa init
echo "test" > hooktest.txt
git add hooktest.txt
git commit -m "test hook"
```

**確認項目**:
- [ ] コンソールに `[ralph-lisa] Post-commit: triggering Lisa review...` と表示
- [ ] 約30-60秒後、`.dual-agent/auto-review.md` にレビューが含まれる
- [ ] レビューは端末の stdout に表示されない（ファイルにリダイレクト）

---

## 11. MCP Server

```bash
ralph-lisa mcp-server
```

stdin 経由で JSON-RPC を送信:
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
```

**確認項目**:
- [ ] サーバーが有効な initialize 結果で応答
- [ ] `rll_lisa_review` が完全なレビューを返す（500文字に切り詰められない — P4 修正）
- [ ] `rll_handoff` が `final_work` と `final_review` フィールドを返す（P4 修正）

---

## 12. デバッグログ（--debug）

任意の engine コマンドを `--debug` 付きで実行:

```bash
ralph-lisa auto --engine --task "test" --max-rounds 2 --auto-approve --debug --ui quiet
```

**確認項目**:
- [ ] コンソールに `🔎 Debug logging enabled → <path>/debug/` と表示
- [ ] `coordinator.log`: prompt_sent, prompt_response, resend_attempt（該当する場合）の NDJSON
- [ ] `ralph-raw-io.log`: spawn, stdin_raw（完全なペイロード、切り詰めなし）, stdout_raw, exit
- [ ] `lisa-raw-io.log`: 同上 + thread_id_adopted イベント
- [ ] 生ペイロードが切り詰められない（transport ログに `...truncated N chars` がない）
- [ ] Coordinator プレビューは切り詰められる（promptPreview, outputPreview — 想定通り）

---

## 13. クロスプラットフォームパス処理

### Mac/Linux
- [ ] すべてのパスが `/` 区切りを使用
- [ ] `os.tmpdir()` を使用（ハードコードされた `/tmp` ではない）

### Windows
- [ ] パスが `\` 区切りで動作
- [ ] ローカルドライブで EBADF エラーなし
- [ ] SMB ドライブ（Z:）はコード用に動作するが状態ファイル用ではない（既知の制限、文書化済み）

---

## 14. ドキュメント検証

```bash
# 3言語すべてに IDE Integration 章があることを確認
grep "IDE Integration" docs/en/guide.md
grep "IDE 集成" docs/zh-CN/guide.md
grep "IDE 連携" docs/ja/guide.md
```

**確認項目**:
- [ ] 3言語すべてに含まれる: クイックスタート、仕組み、ワンショットレビュー、モード概要テーブル
- [ ] FAQ が Win10 22H2 サポートに言及
- [ ] FAQ が --ui wt に必要な WT_SESSION 要件を説明
- [ ] FAQ が Git は推奨だが必須ではないと言及

---

## テスト結果サマリー

| # | テスト領域 | Mac | Windows | 合格/失敗 |
|---|---------|-----|---------|----------|
| 2 | 自動テスト (627) | | | |
| 3 | Init / Uninit | | | |
| 4 | Engine quiet | | | |
| 5 | Engine tmux | | N/A | |
| 6 | Engine wt | N/A | | |
| 7 | run-lisa | | | |
| 8 | watch-lisa | | | |
| 9 | review one-shot | | | |
| 10 | Git hook | | | |
| 11 | MCP server | | | |
| 12 | デバッグログ | | | |
| 13 | クロスプラットフォームパス | | | |
| 14 | ドキュメント | | | |
