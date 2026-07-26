# G-SAXO — ConoHa VPS 常時稼働

ConoHa 上の **`/opt/tradePulseNode` に配置・上書きして OK** です。  
**`/opt/articleappNode` だけは触らない**（別フォルダ・別 pm2 プロセス）。

## サーバー構成（この VPS）

```
/opt/tradePulseNode/     ← G-SAXO（この手順で上書き同期）
/opt/articleappNode/     ← 既存アプリ（触らない）
```

## 他アプリ（articleappNode）との隔離

| 項目 | G-SAXO | articleappNode |
|------|--------|----------------|
| フォルダ | `/opt/tradePulseNode` | `/opt/articleappNode`（そのまま） |
| pm2 名 | **`gsaxo`** のみ操作 | 既存名のまま |
| 受信ポート | なし | 既存のまま |
| node_modules | `/opt/tradePulseNode/node_modules` | 既存のまま |
| ログ | `/opt/tradePulseNode/logs/` | 既存のまま |

### やってはいけないこと

- `pm2 delete all` / `pm2 kill`
- `/opt/articleappNode` 内のファイル変更
- articleappNode 用 pm2 プロセスの stop / restart

### 安全な pm2 操作（G-SAXO だけ）

```bash
pm2 start deploy/conoha/ecosystem.config.cjs   # gsaxo だけ追加
pm2 restart gsaxo
pm2 stop gsaxo
pm2 logs gsaxo
pm2 save
```

---

## 1. Mac から同期（`/opt/tradePulseNode` 上書き）

```bash
cd ~/tradePulseNode
bash deploy/conoha/push-from-mac.sh root@160.251.173.118
scp .env root@160.251.173.118:/opt/tradePulseNode/.env
# 任意: 紙トレ状態を引き継ぐ
scp data/gsaxo-state.json root@160.251.173.118:/opt/tradePulseNode/data/
```

`root@160.251.173.118` は ConoHa の SSH 接続情報（articleappNode と同じ）。  
パスワードが何度も聞かれる場合は **SSH 鍵**を登録すると以後不要:

```bash
ssh-copy-id root@160.251.173.118
```

同期対象: `package.json`, `package-lock.json`, `saxo-openapi/`, `deploy/conoha/`  
（`articleappNode` には送らない）

## 2. サーバー上でセットアップ

```bash
ssh root@160.251.173.118
cd /opt/tradePulseNode
bash deploy/conoha/setup.sh
```

setup.sh は **既存の Node / pm2 をそのまま使う**（システムや articleappNode 用 Node の変更はしない）。

## 3. 動作確認

```bash
cd /opt/tradePulseNode
npm run saxo:test:gsaxo
npm run gsaxo:meta:test
npm run gsaxo:run
```

## 4. pm2 起動

```bash
cd /opt/tradePulseNode
pm2 list                         # articleappNode が稼働中か確認
pm2 start deploy/conoha/ecosystem.config.cjs
pm2 list                         # gsaxo が追加されただけか確認
pm2 save
```

`pm2 startup` は articleappNode 用に済んでいれば **再実行不要**。

## 5. META 日次レポート（cron・毎朝6時）

pm2 の `gsaxo` は **5分ごとの売買判定**だけ。cron は **1日1回 META に成績を送る**ための別ジョブです。

### 手順（サーバー上）

**① 手動テスト（必ず先に）**

```bash
cd /opt/tradePulseNode
npm run gsaxo:report
```

エラーなく終わり、スプレッドシート `META_統合レポート` に行が増えれば OK。

**② npm の場所を確認**

```bash
which npm
# 例: /usr/bin/npm
```

**③ crontab に1行だけ追加**

```bash
crontab -e
```

開いたエディタの **一番下** に貼る（**articleappNode 用の既存行は消さない**）:

```cron
# サーバーが UTC のとき → 日本時間 毎朝 6:00
0 21 * * * cd /opt/tradePulseNode && /usr/bin/npm run gsaxo:report >> /opt/tradePulseNode/logs/gsaxo-report.log 2>&1
```

- `/usr/bin/npm` → ②の `which npm` の結果に置き換え
- `date` で **すでに JST (+0900)** なら `0 21` を `0 6` に変更

保存後:

```bash
crontab -l          # 行が増えているか確認
```

**④ 翌朝またはログで確認**

```bash
tail -30 /opt/tradePulseNode/logs/gsaxo-report.log
```

詳細・タイムゾーンの説明: `deploy/conoha/crontab.example`

## 6. `.env` と `.env.server`（LIVE OAuth・20万円・リーン25本）

**`.env`** … Mac から `scp` してよい共通設定（OAuth キー、META 等）

**`.env.server`** … **サーバー専用**（Mac からは送らない）。`.env` より優先。

| キー | 置き場所 |
|------|----------|
| `SAXO_ACCOUNT_KEY` | **`.env.server` のみ**（口座取り違え防止） |
| `GSAXO_DRY_RUN` 等本番値 | `.env.server`（`enable-live-env.sh` で設定） |
| `SAXO_APP_KEY` 等 | `.env` |

初回・push 後にサーバーで:

```bash
cd /opt/tradePulseNode
bash deploy/conoha/enable-live-env.sh   # .env.server を生成・更新
pm2 restart gsaxo --update-env
```

`.env` 必須例:

```env
SAXO_API_BASE=https://gateway.saxobank.com/openapi
SAXO_AUTH_URL=https://live.logonvalidation.net
SAXO_APP_KEY=
SAXO_APP_SECRET=
SAXO_REDIRECT_URI=http://localhost:3000/saxo/callback
GSAXO_META_WEBAPP_URL=
GSAXO_META_SECRET=
```

OAuth トークン: `data/saxo-oauth-tokens.json`（Mac で `npm run saxo:oauth:import` 後に scp）

`GSAXO_DRY_RUN` はログ表示用です。G-SAXO は Saxo **LIVE 価格**を API 取得し、建玉はローカル紙トレで管理します。

## 7. 本番切替（来週開始）

**Mac → 最新コード同期**

```bash
bash deploy/conoha/push-from-mac.sh root@160.251.173.118
# push 時に enable-live-env.sh がサーバーで自動実行（.env.server 維持）
scp .env root@160.251.173.118:/opt/tradePulseNode/.env
scp data/saxo-oauth-tokens.json root@160.251.173.118:/opt/tradePulseNode/data/
```

**サーバー（切替当日）**

```bash
ssh root@160.251.173.118
cd /opt/tradePulseNode
bash deploy/conoha/setup.sh          # 初回 or package 更新時
bash deploy/conoha/go-live.sh        # 接続・1回実行テスト
bash deploy/conoha/go-live.sh --go   # 状態リセット（10万・建玉0）＋ pm2 再起動
```

ログに `mode=FX+金リーン(25) pairs=25` と `紙トレ 現金JPY=100000` が出れば OK。

**毎日**: Saxo 24h トークン更新（401 が出たら `.env` 更新 → `pm2 restart gsaxo`）

## 8. Mac 側

`gsaxo:daemon` は **停止**（ConoHa と二重実行しない）。

## 9. ダンマ指針アプリ（別デプロイ）

G-SAXO / articleappNode とは **完全隔離**（`/opt/dhamma`・pm2 `dhamma`・ポート 3053）。  
手順: [`deploy/conoha/DHAMMA.md`](DHAMMA.md)

## トラブルシュート

| 症状 | 確認 |
|------|------|
| articleappNode が止まった | `pm2 delete all` していないか |
| 401 | Saxo トークン期限 → `.env` 更新 |
| gsaxo のみ再起動 | `pm2 restart gsaxo` |
| ファイルが見つからない | `~/tradePulseNode` ではなく `/opt/tradePulseNode` を確認 |
| `deploy/conoha/setup.sh` がない | 誤って `conoha/` 直下に同期された場合 → Mac で `push-from-mac.sh` を再実行 |
