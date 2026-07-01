[English](../en/testing-plan.md) | [日本語](../ja/testing-plan.md)

# Super RLL v0.26.1 — テスト計画

## 概要

この計画は現在の v0.26.1 リリースのテスト全範囲をカバーする。プロジェクトは5つのパッケージに約550のソーステストファイルを持ち、8層の標準テストシステムと15以上の品質ゲートで管理されている。

**テスト対象パッケージ:**

| パッケージ | テストファイル数 | 対象領域 |
|---------|-----------|-------|
| `cli/` | 395 | コア CLI、コマンド、ポリシー、ゲート、プラン検証 |
| `cli-e2e/` | 16 | CLI エンドツーエンド動作、WezTerm/Playwright ハーネス |
| `wecom-bot/` | 28 | WeCom 送受信、メッセージルーティング、デーモン |
| `cli-pty-daemon/` | 5 | PTY 管理、端末セッション、tmux 統合 |
| `cli-pty-daemon-vscode/` | 1 | VSCode 拡張 PTY ブリッジ |

---

## 8層標準テストシステム

プロジェクトは `gate-manifest.json` で8つの標準層を定義。CLI アーキタイプのデフォルトベースラインは `[unit, smoke, integration]`。

| 層 | スコープ | 必要なタイミング |
|------|-------|---------------|
| **unit** | 純粋関数・モジュールテスト | 全フェーズ |
| **smoke** | 高速統合健全性チェック | impl + consensus フェーズ |
| **functional** | 機能レベルの動作 | 複雑なスライス |
| **integration** | パッケージ間連携 | consensus フェーズ |
| **e2e** | 完全なユーザーワークフロー | リリース検証 |
| **perf** | パフォーマンスベンチマーク | パフォーマンス影響のある変更 |
| **stability** | ソーク・ストレス・競合 | 長時間稼働サービス |
| **security** | 認証・シークレットスキャン・インジェクション | セキュリティ影響のある変更 |

**フェーズ別要件**（`gate-manifest.json` phases より）:
- `design` → unit のみ
- `tests-only` → unit のみ
- `impl` → unit + smoke
- `fix` → unit のみ
- `consensus` → unit + smoke + integration

---

## 品質ゲート

### 提出時ゲート（[CODE]/[FIX] 毎回）

| ゲート | § 参照 | チェック内容 |
|------|-------|----------------|
| ポリシーブロックデフォルト | §133 | 欠落した attest、テスト結果、file:line 引用 |
| テスト実行ログ | §137 | テスト申告 vs 実際の実行ログエントリ |
| 双方向 attest | §149 | Ralph Test-Process / Test-Cases / Test-Results + Lisa Reviewed-* / Verified |
| 視覚的証拠 | §151 | UI/フロントエンドスライスにスクリーンショット必須 |
| プロジェクトタイプ層 | §152 | ベースラインとアーキタイプの不一致（警告のみ） |
| スモーク自動ループ | §150 | RL_SMOKE_CMD 提出後ヘルスチェック |

### 計画時ゲート（TDD-PLAN ラウンド）

| ゲート | § 参照 | チェック内容 |
|------|-------|----------------|
| 複雑度判定 | §123 | 3層: LLM 判定 → 決定論的検証 → Lisa 再実行 |
| 明確化フェーズ | §128 | 複雑/expert タスクは TDD-PLAN 前に R0 5段階グリル必須 |
| フェーズ別テストカバレッジ | §145 | 複数フェーズのスライスはフェーズ別テストケースが必要 |
| ベースライン自己チェック | §155 | PLAN 本文に project_type ベースライン整合性の明言必須 |

### リリースゲート

| ゲート | § 参照 | カバレッジ |
|------|-------|----------|
| ドッグフードゲート | §139 | 実行チェックの E2E: 正常系、偽造申告、Verified 欠落 |
| ドキュメント更新ゲート | §138 | ドキュメント/コードの乖離検出 |
| リリースレポート | §140 | 6ソースからの証拠集約: テスト + プラン + ドッグフード + ドキュメント + 複雑度 |
| テストハーネス確認 | §157 | 実シナリオ、繰り返し正当化、設計 ≠ 機構レビュー |

---

## テストハーネス

### Node.js 組み込み (`node --test`)

主要テストランナー。`cli/src/test/*.test.ts` ファイルはすべて Node.js ネイティブランナーを使用。

```bash
cd cli && npm test
```

カバー対象: コマンド、ポリシー、プラン検証、ゲート実行、IPC、状態管理。

### WezTerm E2E ハーネス

WezTerm 経由で実端末を駆動する CLI エンドツーエンドテスト。スペックは `cli-e2e/` に配置。

```bash
ralph-lisa skill wezterm-test --macro <path>
```

### Playwright ブラウザ E2E

ブラウザ自動化ハーネス。スペックは `harness-project-validation/` と `harness-verification/` に配置。

```bash
ralph-lisa skill playwright-test --spec <path>
```

### ドッグフードゲート (§139)

強制ゲート自体をテストする。検証項目:
- `happy`: 完全な PLAN→CODE→PASS→CONSENSUS フロー
- `bypass-fake-claim`: §137 が偽造テスト申告を捕捉
- `bypass-missing-Verified`: §144 が Verified 引用欠落を捕捉

### リリースレポート (§140)

6ソースからのリリース前証拠集約: cli テスト、wecom-bot テスト、プラン検証、ドッグフードゲート、ドキュメント更新ゲート、複雑度判定。

---

## 機能別主要テスト領域

| 領域 | § / 機能 | テストカバレッジ |
|------|-------------|---------------|
| コマンド | auto, start, submit-ralph/lisa, init/uninit | cli/src/test/commands*.test.ts |
| ポリシー | §133/§137/§144/§149 | cli/src/test/policy*.test.ts |
| プラン検証 | §102/§145 プランテーブルパース | cli/src/test/plan*.test.ts |
| 複雑度 | §123 判定 + 検証 | cli/src/test/complexity*.test.ts |
| ゲートカスケード | §78/§79 層カスケード + ループバック | cli/src/test/gate*.test.ts |
| WeCom トランスポート | 送受信、プッシュ、デーモン | wecom-bot/src/test/*.test.ts |
| PTY デーモン | tmux セッション、パイプペイン、attach | cli-pty-daemon/src/test/*.test.ts |
| Feishu リレー | Lark アウトバウンド、決定カード | cli/src/test/feishu*.test.ts |
| ドキュメントパブリッシャー | 公開ワークフロー | cli/src/test/docs-publisher*.test.ts |
| クリーンアップ | §127 spawn/fork クリーンアップ | cli/src/test/cleanup*.test.ts |
| 知識鮮度 | §128 揮発性情報 TTL | cli/src/test/knowledge*.test.ts |

---

## 品質オラクル（15次元）

`gate-manifest.json` `canonical_doc_oracle_dimensions` より:

1. **data-accuracy** — 事実がソースと一致
2. **source-authority** — 引用が一次ソースを参照
3. **source-freshness** — 情報が最新（TTL 対応）
4. **logical-coherence** — 内部矛盾なし
5. **compliance-with-user-spec** — 要求仕様に準拠
6. **ai-slop** — AI 生成の水増しや幻覚なし
7. **style** — 一貫した文体とフォーマット
8. **topic-coverage** — 宣言された範囲をすべてカバー
9. **depth-detail** — 対象読者に適した詳細度
10. **public-safety** — シークレット漏洩なし、公開安全
11. **locale-parity** — en/zh-CN/ja コンテンツが同期
12. **link-integrity** — すべての相互参照が解決可能
13. **build-readiness** — コンテンツがエラーなくコンパイル/デプロイ可能
14. **destination-liveness** — 外部リンクが到達可能
15. **public-authorization** — 公開コンテンツが公開認可済み

---

## 前提条件

- **Node.js** >= 18
- **Claude Code**（Ralph バックエンド）
- **Codex CLI**（Lisa バックエンド）
- オプション: `tmux`（tmux UI）、`wezterm`（WezTerm E2E）、`playwright`（ブラウザ E2E）

```bash
node -v          # >= 18
git --version
claude --version
codex --version
ralph-lisa doctor  # 完全な環境チェック
```

---

## テストの実行

### クイックチェック

```bash
cd cli && npm test
```

### 完全ゲートシーケンス

```bash
ralph-lisa quality-gate --full-uaot
```

### リリース前チェックリスト

```bash
npm test --prefix cli           # コアテスト
npm test --prefix wecom-bot     # WeCom トランスポート
ralph-lisa dogfood-gate run --strict   # 強制 E2E
ralph-lisa doc-update-gate run --strict # ドキュメント/コード乖離
ralph-lisa release-report emit          # 証拠集約
```

### ゲートポリシーモード

```bash
# デフォルト: block（本番 / 自動運転）
RL_POLICY_MODE=block ralph-lisa auto --engine --task "..."

# 開発用エスケープ: warn（対話型開発のみ）
RL_POLICY_MODE=warn ralph-lisa submit-ralph --file .dual-agent/submit.md
```

---

## テスト結果サマリー

| # | テスト領域 | ランナー | ゲート層 |
|---|---------|--------|-----------|
| 1 | CLI ユニットテスト (~395 ファイル) | node --test | unit |
| 2 | CLI E2E テスト (~16 ファイル) | wezterm / playwright | e2e |
| 3 | WeCom ボットテスト (~28 ファイル) | node --test | unit + integration |
| 4 | PTY デーモンテスト (~5 ファイル) | node --test | unit + smoke |
| 5 | ドッグフードゲート (§139) | ralph-lisa dogfood-gate | e2e |
| 6 | ドキュメント更新ゲート (§138) | ralph-lisa doc-update-gate | functional |
| 7 | リリースレポート (§140) | ralph-lisa release-report | integration |
| 8 | テストハーネス確認 (§157) | ralph-lisa testharness-gate | functional |

---

> この計画は v0.26.1 のテスト面を反映しています。スライスごとのテスト計画については、[ユーザーガイド](guide.html) §102 自動 TDD モードと [CLI リファレンス](reference.html) を参照してください。
