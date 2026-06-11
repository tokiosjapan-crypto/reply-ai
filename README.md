# スマリブ返信AI（reply-ai）

楽待・健美家・メール等の問い合わせに対する返信文を、AIが「丁寧版」「簡潔版」の2パターンで作成するアプリです。
iPhoneのホーム画面に追加すれば、アプリのように使えます（PWA）。

> **✅ 設置済み（2026-06-11）**
> - アプリ画面: https://tokiosjapan-crypto.github.io/reply-ai/
> - 中継API: https://reply-ai-api.sumalive.workers.dev （APIキー設定済み・モデルは claude-sonnet-4-6 を使用）
>
> 以下の手順書は、作り直し・引っ越しの際に使ってください。

---

## 1. これは何か（全体の仕組み）

```
┌──────────────┐      ┌─────────────────┐      ┌──────────────────────┐      ┌────────────────┐
│ iPhone / PC  │ ───▶ │ GitHub Pages     │ ───▶ │ Cloudflare Workers   │ ───▶ │ Anthropic API  │
│ （ブラウザ） │      │ （アプリ画面）   │      │ （中継・キー管理）   │      │ （AI本体）     │
└──────────────┘      └─────────────────┘      └──────────────────────┘      └────────────────┘
```

- **GitHub Pages**: アプリの画面（index.html）を無料で公開する場所
- **Cloudflare Workers**: AIへの中継役。**APIキーはここだけに保存**するので、画面側にキーが漏れません
- **Anthropic API**: 返信文を作るAI（Claude）

---

## 2. 必要なもの

| 必要なもの | 費用 | 用途 |
|---|---|---|
| GitHubアカウント | 無料 | アプリ画面の公開 |
| Cloudflareアカウント | 無料 | 中継APIの設置 |
| Anthropic APIキー | 従量課金（使った分だけ） | AI生成 |

Anthropic APIキーは https://console.anthropic.com/ で取得できます（`sk-ant-` で始まる文字列）。

---

## 3. Cloudflare Workers の設置手順

### A. ダッシュボードでコピペする方法（おすすめ・非エンジニア向け）

1. https://dash.cloudflare.com/ にログイン
2. 左メニューの **「Workers & Pages」** をクリック
3. **「Create（作成）」** ボタン → **「Create Worker」** を選択
4. 名前の入力欄に `reply-ai-api` と入力して **「Deploy（デプロイ）」** をクリック
   （まずはサンプルコードのままデプロイされます。これでOK）
5. デプロイ完了画面で **「Edit code（コードを編集）」** をクリック
6. 画面に出ているサンプルコードを **全部削除** して、このフォルダの `worker.js` の中身を **全部コピーして貼り付け**
7. 右上の **「Deploy（デプロイ）」** をクリック
8. 画面上部に表示される URL（例: `https://reply-ai-api.あなたの名前.workers.dev`）を**メモする**
   → これが後で index.html に書く API URL です

### B. wrangler CLI を使う方法（コマンドが使える人向け）

```bash
# このフォルダに移動
cd ~/Desktop/Claude/reply-ai

# Cloudflareにログイン（ブラウザが開きます）
npx wrangler login

# APIキーをSecretとして登録（聞かれたらキーを貼り付け）
npx wrangler secret put ANTHROPIC_API_KEY

# デプロイ
npx wrangler deploy
```

デプロイ後に表示される URL をメモしてください。

---

## 4. 環境変数の設定方法（ダッシュボードの場合）

Workers の管理画面 → `reply-ai-api` → **「Settings（設定）」** → **「Variables and Secrets（変数とシークレット）」** で設定します。

| 変数名 | 種類 | 必須？ | 内容 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **Secret（暗号化）** | **必須** | Anthropic のAPIキー（`sk-ant-...`）。**必ずSecretタイプで登録** |
| `ANTHROPIC_MODEL` | 変数（Text） | 任意 | 使うAIモデル名。未設定なら `claude-sonnet-4-20250514` が使われます |
| `ALLOWED_ORIGIN` | 変数（Text） | 推奨 | アプリのURL（例: `https://tokiosjapan-crypto.github.io`）。設定すると**第三者があなたのAPIを勝手に使うのを防げます** |

設定を変えたら「Deploy」を押し直すと反映されます。

---

## 5. index.html の API URL を書き換える

`index.html` をテキストエディタで開き、`<script>` のすぐ下にあるこの部分を探します：

```js
const CONFIG = {
  API_URL: "https://reply-ai-api.YOUR-SUBDOMAIN.workers.dev"
};
```

`YOUR-SUBDOMAIN` の部分を、手順3でメモした自分のWorkers URLに書き換えて保存します。
**書き換えるのはこの1か所だけです。**

---

## 6. GitHub Pages で公開する

1. https://github.com/ にログインし、右上の「＋」→ **「New repository」**
2. リポジトリ名を `reply-ai` などにして **「Create repository」**（Publicのまま）
3. **「uploading an existing file」** のリンクをクリックし、このフォルダの以下のファイルをドラッグ＆ドロップしてアップロード：
   - `index.html` / `manifest.json` / `service-worker.js`
   - `icon-192.png` / `icon-512.png` / `apple-touch-icon.png`
   - （`worker.js` と `wrangler.toml` はCloudflare用なので上げなくてもOK。上げても害はありません）
4. **「Commit changes」** をクリック
5. リポジトリの **「Settings」** → 左メニュー **「Pages」**
6. 「Branch」を `main` / フォルダを `/(root)` にして **「Save」**
7. 数分待つと `https://あなたのID.github.io/reply-ai/` でアプリが開けます

---

## 7. iPhoneのホーム画面に追加する

1. iPhoneの **Safari** で上記のURLを開く
2. 画面下の **共有ボタン（四角に↑のマーク）** をタップ
3. **「ホーム画面に追加」** をタップ
4. 名前が「返信AI」になっていることを確認して **「追加」**

これでホーム画面のアイコンから、アプリのように起動できます。

---

## 8. AIモデル名の変更方法

新しいモデルに切り替えたい場合は、どちらか1か所を変えるだけです：

- **方法1（おすすめ）**: Cloudflareダッシュボードで環境変数 `ANTHROPIC_MODEL` に新しいモデル名を設定 → Deploy
- **方法2**: `worker.js` の冒頭にある `DEFAULT_MODEL = "..."` を書き換えて再デプロイ

> **注意**: 初期設定の `claude-sonnet-4-20250514` は **2026年6月15日に提供終了予定**です。
> それ以降は `ANTHROPIC_MODEL` に後継モデル（例: `claude-sonnet-4-6`）を設定してください。

---

## 9. よくあるトラブル

| 症状 | 原因と対処 |
|---|---|
| 「API URLが未設定です」と出る | index.html の `CONFIG.API_URL` が初期値のまま。手順5を実施 |
| 「生成に失敗しました」と出る | ① Workers のURLが正しいか確認 ② `ANTHROPIC_API_KEY` がSecretで登録されているか確認 ③ Anthropicの残高・利用制限を確認 |
| 「アクセスが集中しています」と出る | AI側が混雑中。1分ほど待って再実行 |
| index.html を更新したのに画面が変わらない | PWAのキャッシュが原因。**アプリを一度完全に閉じて再起動**（それでもダメならSafariの履歴削除）。開発者は `service-worker.js` の `CACHE_VERSION` を `reply-ai-v2` に上げると全員に強制反映 |
| ホーム画面に追加できない | Safari以外のブラウザ（Chrome等）では追加メニューが出ないことがあります。Safariで開いてください |
| 他人に使われていないか心配 | 環境変数 `ALLOWED_ORIGIN` に自分のGitHub PagesのURLを設定（手順4） |

---

## 10. セキュリティの注意（重要）

- **APIキー（sk-ant-...）を index.html に書かない**でください。画面のコードは誰でも見られます
- **APIキーをGitHubにアップロードしない**でください（このフォルダの `.gitignore` で `.env` は除外済みですが、コード内に直書きしたら防げません）
- キーは **Cloudflare Workers の Secret だけ** に置くのがルールです
- 万一キーが漏れたら、Anthropicのコンソールで該当キーを無効化して作り直してください
