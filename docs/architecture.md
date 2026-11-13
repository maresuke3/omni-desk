# アーキテクチャ（マイクロフロントエンド）

Omni Desk は pnpm ワークスペースのモノレポで、画面を機能単位の **Feature（マイクロフロントエンド）** に分割し、
シェル（`apps/desktop`）が**ビルド時に統合**します。

## なぜビルド時統合か

- Electron の `contextIsolation` / `sandbox` / CSP を緩めずに済む（実行時に外部コードを読み込まない）
- 型がパッケージをまたいで通るので、契約の変更がコンパイルエラーとして見える
- 配布物は 1 つ。それでも Feature ごとにチャンクが分かれ、`React.lazy` で遅延読み込みされる

## レイヤーと依存ルール

```
                    ┌──────────────── apps/desktop（シェル） ────────────────┐
                    │  main: IPC・設定・コネクタの切り替え                   │
                    │  renderer: レイアウト・ナビ・テーマ・エラー境界         │
                    └───────┬───────────────────────────────┬────────────┘
             renderer 側    │                               │   main 側
     ┌──────────────────────┴─────┐                ┌────────┴─────────┐
     │ features/*（MFE）          │                │ connectors/slack │
     │ home inbox tasks           │                │ connectors/chatwork
     │ conversations settings     │                └────────┬─────────┘
     └──────┬─────────────────────┘                         │
            │                                       connectors/core
   packages/message-kit                                     │
     │         │                                            │
 packages/ui  packages/client                               │
     └─────────┴──────────── packages/contracts ────────────┘
```

| 種類 | import してよいもの |
| --- | --- |
| `apps/*`（シェル） | すべて |
| `features/*` | contracts / ui / client / message-kit |
| `packages/message-kit` | contracts / ui / client |
| `packages/ui` | contracts |
| `packages/client` | contracts |
| `packages/contracts` | なし |
| `connectors/core` | contracts |
| `connectors/*` | contracts / connectors/core |

このほか次の 2 点も `pnpm lint:boundaries` で検査します。

- import しているワークスペースパッケージが `package.json` に宣言されていること
- 相対パスでパッケージの外を参照していないこと

## Feature 契約（`@omni-desk/contracts/feature`）

各 Feature は `FeatureModule` を 1 つ export します。

```ts
export const inboxFeature: FeatureModule = {
  id: FEATURE_IDS.inbox,
  nav: [{ id: 'inbox', label: '受信箱', section: 'primary', order: 20, icon: Inbox,
          route: routes.inbox(), useBadge: useInboxBadge }],
  View: lazy(() => import('./InboxView').then((m) => ({ default: m.InboxView })))
}
```

- **ナビゲーション**: サイドバーの項目・バッジ・接続状態は Feature が `nav` で宣言し、シェルが描画する。
- **画面遷移**: Feature 同士は import しない。`navigate(routes.conversations('slack', id))` のように
  `routes`（contracts）で宛先を作ってシェルに渡す。
- **データ**: `@omni-desk/client` の中央ストア（Zustand）とフック経由で読む。API はメインプロセスの同期エンジンだけが呼び、
  結果は状態ハブから差分（`state:patch`）としてストアに届く。Feature が API 回数に影響することはない（詳細は下の「状態管理」）。
  受信箱の「非表示にする送信者」は `useUnifiedInbox` の中で除外済みなので、Feature 側で個別に絞り込まない
  （受信箱・ホーム・サイドバーのバッジで件数が一致する）。
- **障害の分離**: シェルは Feature ごとにエラー境界と Suspense を置くので、1 画面が落ちても他は動き続ける。

## よくある変更の手順

### 画面（Feature）を追加する

1. `features/<name>/` を作り、`package.json`（`@omni-desk/feature-<name>`）と `src/index.ts` で `FeatureModule` を export
2. `packages/contracts/src/routes.ts` に `FEATURE_IDS` と `routes.<name>()` を追加
3. `apps/desktop/package.json` に依存を追加し、`apps/desktop/src/renderer/src/features.ts` に 1 行登録

### サービス（Teams・メールなど）を追加する

1. `connectors/<service>/` にメインプロセス側の実装（API クライアント・正規化・デモデータ）を作る
2. `packages/contracts` の `Source` 型と IPC 契約（`ipc.ts`）にチャンネルを追加
3. `connectors/<service>/src/sync.ts` に同期エンジン（`SyncEngine`）を作り、シェルの `main/sync/manager.ts` に登録する
4. 結果は `ServiceSnapshot`（contracts）の形で状態ハブに書くので、ストアと画面はほぼそのまま使える
5. 各 Feature は正規化済みの `Message` / `Task` / `Conversation` を扱うので、表示の追加は最小限で済む

## パッケージの作り方の約束

- ワークスペースのパッケージはビルドせず、`exports` で TypeScript ソースを直接公開する（シェルの Vite がまとめてバンドルする）
- React は `peerDependencies` にし、React と Zustand はシェル側の `resolve.dedupe` で 1 インスタンスに揃える
- 依存バージョンは `pnpm-workspace.yaml` の `catalog` で一元管理し、各 `package.json` では `"catalog:"` と書く

## 状態管理（Zustand）

状態は「メインプロセスが正、レンダラーの Zustand ストアはその写し」という一方向の流れで管理する。

```
同期エンジン ──▶ StateHub（main） ──state:patch（seq 付き）──▶ Zustand ストア（renderer） ──▶ 画面
                     ▲                                               │
                     └──────────── invoke（送信・設定・会話の監視） ◀──┘
```

| ストアの領域 | 中身 | 書き換えるのは |
| --- | --- | --- |
| `settings` / `services` / `histories` | 設定・同期済みデータ・開いている会話の履歴 | メインからの差分だけ（画面からは書き換えない） |
| `ui` | 画面遷移・絞り込み（ローカルに保存して復元） | `actions.navigate` / `actions.setUi` |
| `drafts` / `outbox` / `sentAt` | 入力中の返信・送信状況 | `actions.setDraft` / `actions.send` |
| `activeReply` | 受信箱で返信欄を開いているメッセージ | `actions.openReply` / `closeReply` |

- 起動時は**先に差分の購読を始めてからスナップショットを取り**、取得中に届いた差分は `seq` で重複を除いて適用する（取りこぼし防止）。
- 画面はセレクターで必要な部分だけ読む。配列の加工（受信箱の統合・ブラックリストの除外など）は `useMemo` で行う
  （セレクターで毎回新しい配列を返すと、再描画が止まらなくなるため）。
- 入力中のトークンや検索欄の文字列など、画面だけの一時的な値はコンポーネントのローカル状態に置く（トークンはストアにもディスクにも置かない）。
- Chatwork の取得・送信の設計は [`docs/chatwork-sync-design.md`](chatwork-sync-design.md) を参照。
