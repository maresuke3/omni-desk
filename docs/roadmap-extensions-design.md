# 拡張機能設計方針（予定管理 / Jira / AI 連携）

[アーキテクチャ方針](architecture.md)（マイクロフロントエンド・依存境界・メインプロセス正の状態管理）に沿って、今後追加する 3 つの機能群の設計方針をまとめます。

---

## 1. 予定管理（Google Calendar 連携）

### 目的
メッセージ・タスクと同じ画面内で「今日・今週の予定」を把握し、予定の作成・編集・空き時間確認まで行えるようにする。

### 構成案
- **Contracts (`packages/contracts`)**:
  - `CalendarEvent` 型（id, calendarId, title, startAt, endAt, isAllDay, location, meetUrl, attendees, status, htmlLink）を追加
  - `FEATURE_IDS.calendar` / `routes.calendar()` を追加
  - IPC 契約にカレンダー一覧・予定取得・作成・更新・削除・空き時間照会を追加
- **Connector (`connectors/google-calendar`)**:
  - メインプロセス側で Google Calendar API を呼び出す `SyncEngine` を実装
  - **認証**: OAuth 2.0（Desktop app フロー + ローカルループバックリダイレクト / PKCE）。リフレッシュトークンは `safeStorage` で暗号化して `settings.json` に保存し、レンダラーには渡さない
  - **同期**: 対象カレンダーと取得期間（例: 前後 2 週間）を絞って定期同期し、`StateHub` 経由でストアへ差分配信
- **Feature (`features/calendar` + `features/home` 連携)**:
  - `features/calendar`: 日 / 週ビュー、予定詳細パネル、予定の作成・編集モーダル、会議リンク（Google Meet 等）へのワンクリック参加
  - `features/home`: 「今日の予定 / 次の予定」サマリーカードを追加（`StateHub` から同じ正規化済みデータを参照）

---

## 2. Jira 連携（Atlassian CLI 活用）

### 目的
既存のローカル認証・CLI 資産（Atlassian CLI: `acli`）を活かし、アプリ内から Jira チケットの検索・作成・編集・コメントを行えるようにする。

### 構成案
- **前提と実行境界**:
  - `acli` は OS 上の外部バイナリとして **メインプロセス（`connectors/jira`）からのみ** `child_process`（`execFile` / `spawn`、シェル経由なし）で実行する
  - レンダラーは `contextIsolation` + `sandbox` 下のまま IPC 経由で操作を依頼する
  - 認証自体は `acli` 側の既存セッションを利用しつつ、設定画面で `acli` のパスや接続確認（`acli jira auth status` 等）とデフォルトプロジェクト・JQL プリセットを管理する
- **Contracts (`packages/contracts`)**:
  - `JiraIssue` / `JiraComment` / `JiraSearchQuery` 型を追加
  - `FEATURE_IDS.jira` / `routes.jira(issueKey?)` を追加
  - IPC 契約にチケット検索（JQL / プリセット）、詳細取得、作成、編集（ステータス遷移・担当者・フィールド更新）、コメント投稿を追加
- **Connector (`connectors/jira`)**:
  - `acli` の JSON 出力オプション（または構造化パーサー）を使って `JiraIssue` に正規化
  - 「自分の担当チケット」「最近更新されたチケット」などを `SyncEngine` で定期同期し、検索・作成・編集・コメントはオンデマンド IPC で即時実行＋結果でキャッシュ更新
- **Feature (`features/jira` + `features/inbox` / `features/tasks` 連携)**:
  - `features/jira`: JQL 検索バー・フィルタ、チケット一覧・詳細ペイン、作成モーダル、インライン編集・コメント投稿
  - 将来的に、Slack / Chatwork のメッセージからワンクリックで Jira チケット起票（下書きにメッセージ本文・リンクを転記）できる導線も追加可能

---

## 3. AI 連携（個人利用の API キー / OAuth 認証）

### 目的
個人が契約している AI サービス（API キーまたは OAuth 認証）を安全に組み込み、受信箱の要約・返信下書き生成・Jira チケット起票文面の作成などをアプリ内から利用できるようにする。

### 構成案
- **認証とセキュリティ**:
  - API キーおよび OAuth トークン（リフレッシュトークン含む）は、既存の Slack / Chatwork トークンと同様に **メインプロセスの `safeStorage` で暗号化保存** し、レンダラーには公開しない
  - プロバイダー単位（例: Gemini / OpenAI / Anthropic / OAuth 連携プロバイダー）で設定を切り替え・テストできる仕組みを用意
- **Connector / Core (`connectors/ai` または `packages/ai-core` + `apps/desktop/src/main/ai`)**:
  - プロバイダー抽象化インターフェース（テキスト生成・ストリーミング応答・構造化出力）をメインプロセスに配置
  - IPC 経由でストリーミングチャンクをレンダラーへ返すチャンネル（`ai:stream` 等）を追加
  - レート制限・エラー正規化は `connectors/core/errors.ts` の仕組みを踏襲
- **UI / Feature 導線**:
  - **設定画面 (`features/settings`)**: プロバイダー選択、API キー入力 / OAuth ログインボタン、利用モデル選択、接続テスト
  - **横断アクション（`packages/message-kit` / `features/inbox` / `features/jira`）**:
    - 受信箱のメッセージに対する「要約」「返信案の作成」（作成結果は `drafts` に流し込み、送信は必ずユーザー操作で行う）
    - 会話・未読のキャッチアップ要約
    - メッセージ内容から Jira チケットのタイトル・説明文を生成
  - **専用アシスタント画面またはドロワー（任意）**: 予定・タスク・受信箱を横断して質問できる簡易チャット UI

---

## 4. 実装の進め方（推奨フェーズ）

1. **基盤整備（共通）**: `packages/contracts` の型・`FEATURE_IDS`・IPC 契約の拡張方針を確定
2. **Phase 1 — Google Calendar 連携**: OAuth PKCE 認証と `connectors/google-calendar` + `features/calendar` + ホーム連携
3. **Phase 2 — Jira 連携（`acli`）**: `connectors/jira` の CLI ラッパー・正規化と `features/jira`（検索・詳細・作成・編集・コメント）
4. **Phase 3 — AI 連携**: メインプロセスのプロバイダー抽象化・`safeStorage` 認証基盤と、受信箱 / Jira / 予定へのアシスト導線組み込み
