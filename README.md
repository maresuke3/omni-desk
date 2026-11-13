# Omni Desk

Slack・Chatwork（今後 Teams・メールも）のメッセージとタスクを 1 か所で確認するためのデスクトップアプリです。
Electron + React + TypeScript で作っています。

## できること（v0.1）

| 画面 | 内容 |
| --- | --- |
| ホーム | あなた宛て件数・未読・未完了タスク・期限切れのサマリー、最新メッセージ、期限が近いタスク |
| 受信箱 | Slack のメンション（＋未読 DM）と Chatwork の To / 返信 / 全員宛て / DM を「未対応 / あとで / 対応済み」で仕分け。キーボード操作（J/K・E・S・R・Z など）、検索・サービス・期間の絞り込み、一括で対応済み、元に戻す。返信すると自動で対応済み。設定で ON にすると対応済みにしたときサービス側も既読にする |
| タスク | Chatwork のマイタスクと Slack の To-dos を「期限切れ / 今日 / 明日 / 今週中 / それ以降 / 期限なし」で表示 |
| Slack / Chatwork | チャンネル・ルーム一覧と直近のメッセージ（読み取り専用） |
| 設定 | 接続、テーマ（自動 / ライト / ダーク）、自動更新間隔、デモ表示 |
| 返信・投稿 | 受信箱のカードから直接返信、会話画面の入力欄から投稿（Slack / Chatwork） |
| 送信者の非表示 | メッセージのホバー操作で Slack / Chatwork の送信者を受信箱・ホームの「あなた宛て」から除外（会話画面には表示されたまま）。設定画面で一覧・解除 |

- サービス未接続のあいだはデモデータ（架空の人物・会社）を表示します。
- メッセージ本文は Slack の mrkdwn（メンション・リンク・絵文字・カスタム絵文字・コードブロック・引用）と
  Chatwork 記法（`[To]` `[rp]` `[info]` `[title]` `[qt]` `[code]` `[download]` など）を整形して表示します。
- 返信・投稿は、受信箱のカードから直接、または会話画面の入力欄から行えます（⌘ / Ctrl + Enter で送信）。
  Chatwork は返信タグ付き、Slack はチャンネルならスレッドへの返信になります。
- タスクの完了などの操作は、今のところ各サービスで行ってください（設計は `docs/chatwork-sync-design.md`）。

## 開発

Node.js / pnpm のバージョンは [`mise.toml`](mise.toml) で固定しています（Node 26.9.0 / pnpm 12.18.0）。

```bash
mise install            # 指定バージョンの Node / pnpm を入れる
pnpm install
pnpm dev                # 開発起動（HMR）
pnpm check              # 依存境界チェック + 型チェック + テスト
pnpm build              # ビルド（apps/desktop/out/）
pnpm start              # ビルド済みアプリを起動
pnpm dist:mac           # macOS 用 dmg を作成（apps/desktop/dist/）
```

> - Electron 45 以降は初回起動時にバイナリをダウンロードします。手動で取得する場合は
>   `node apps/desktop/node_modules/electron/install.js` を実行してください。
> - pnpm の `minimumReleaseAge` により、公開直後（1 日未満）のパッケージはインストールされません。
> - 初回起動時やパッケージ更新で Electron の実行ファイルが変わったとき、macOS が
>   「Omni Desk Safe Storage」へのキーチェーンアクセスを確認します（トークン暗号化用）。「常に許可」を選んでください。

## 接続方法

トークンはアプリ内で入力し、`safeStorage`（macOS ではキーチェーン）で暗号化して
`~/Library/Application Support/Omni Desk/settings.json` に保存します。
平文でディスクに書いたり、レンダラー（画面側）に渡したりはしません。

### Chatwork

1. Chatwork の「サービス連携」→「API トークン」でトークンを発行（組織によっては管理者の許可が必要）
2. 設定画面に貼り付けて「接続をテストして保存」

API 上限は 5 分あたり 300 回です。全ルームの変化をルーム一覧（30 秒ごとに 1 回）で検知し、本文は自分宛てが増えたルーム・開いているルームを優先して取得します（詳細は `docs/chatwork-sync-design.md`）。

### Slack

Slack には 2 つの接続方式があります。**To-dos を表示したい場合はブラウザセッション方式が必要**です。

| | ユーザートークン（xoxp） | ブラウザセッション（xoxc + d Cookie） |
| --- | --- | --- |
| 根拠 | 公式 Web API | Slack Web クライアントと同じ認証（非公式） |
| メンション・チャンネル・DM | ○ | ○ |
| 未読状態・最近順の並び・未読 DM | × | ○（`client.counts`） |
| To-dos | ×（公開 API が無い） | ○（`saved.list`） |
| 注意点 | アプリのインストールに管理者承認が必要な場合あり | Slack 側の変更で動かなくなる可能性あり。ログアウトで無効。**社内ポリシーを確認のうえ利用** |

**ユーザートークン方式**: [api.slack.com/apps](https://api.slack.com/apps) で「From a manifest」を選び
[`docs/slack-app-manifest.yml`](docs/slack-app-manifest.yml) を貼り付けて作成 → ワークスペースにインストール →
User OAuth Token（`xoxp-…`）を設定画面に登録します。

**ブラウザセッション方式**: 手順は設定画面に表示されます（DevTools から `d` Cookie と `xoxc-…` トークンを取得）。

#### Slack To-dos について

2026 年 10 月に Slack の「後で（Later）」は「To-dos」に変わりましたが、To-dos を取得する公開 API はありません。
このアプリは Web クライアントが内部で使う `saved.list`（`todo_state` が `to_do` / `completed` のもの）と
`messages.list` で本文を取得しています。非公開 API なので仕様が変わると取得できなくなることがあり、その場合は
タスク画面に理由を表示します。

## 構成（マイクロフロントエンド）

pnpm ワークスペースのモノレポで、画面を **機能単位の Feature（MFE）** に分け、シェルがビルド時に組み込みます。
詳しいルールは [`docs/architecture.md`](docs/architecture.md) を参照してください。

```
apps/desktop/            シェル: Electron 本体（main / preload / renderer の外枠）
packages/
  contracts/             共通の型・IPC 契約・Feature 契約・画面遷移（routes）
  client/                レンダラーの中央ストア（Zustand）と IPC クライアント
  ui/                    デザインシステム（トークン CSS・基本コンポーネント）
  message-kit/           メッセージ・タスク表示の共有部品（Slack / Chatwork 記法の描画）
features/                画面ごとの MFE
  home/ inbox/ tasks/ conversations/ settings/
connectors/              メインプロセス側のサービス連携
  core/ slack/ chatwork/
```

- 依存の向きは `scripts/check-boundaries.mjs`（`pnpm lint:boundaries`）で機械的にチェックします。
  Feature 同士の import、Feature からコネクタへの import、パッケージ外への相対 import は CI 相当のチェックで失敗します。
- API 呼び出しはすべてメインプロセス（connectors）で行い、レンダラーは `contextIsolation` + `sandbox` 下で IPC だけを使います。

## 今後

- Microsoft Teams（Microsoft Graph）・メール（Gmail / Outlook）連携
- 予定管理（Google Calendar 連携による予定の確認・作成・更新）
- Jira 連携（Atlassian CLI を利用したチケットの検索・作成・編集・コメント）
- AI 連携（個人利用の API キー / OAuth 認証を用いたアプリ内からの AI 活用）
- タスクの完了・作成（Chatwork タスク / Slack To-dos）
- メッセージごとの返信（会話画面。`TODO(reply-per-message)` の箇所に実装方針あり）
- Slack の Socket Mode 対応
- デスクトップ通知
