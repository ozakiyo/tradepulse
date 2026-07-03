# ダンマ指針アプリ — ConoHa デプロイ（隔離構成）

G-SAXO（`gsaxo`）・articleappNode とは **完全に別** に動かします。

## 隔離の要点

| 項目 | ダンマアプリ | G-SAXO | articleappNode |
|------|-------------|--------|----------------|
| フォルダ | `/opt/dhamma` | `/opt/tradePulseNode` | `/opt/articleappNode` |
| pm2 名 | **`dhamma`** | `gsaxo` | 既存のまま |
| ポート | **3053** | なし（常駐のみ） | 既存のまま |
| 同期スクリプト | `push-dhamma.sh` | `push-from-mac.sh` | 触らない |
| npm ci | **不要** | setup.sh で実施 | 既存のまま |

### やってはいけないこと

- `push-from-mac.sh` でダンマを混ぜない（別スクリプトを使う）
- `pm2 restart gsaxo` をダンマ更新のために実行しない
- `ecosystem.config.cjs`（gsaxo 用）を変更しない
- `/opt/articleappNode` を触らない

### 安全な pm2 操作（ダンマだけ）

```bash
pm2 start /opt/tradePulseNode/deploy/conoha/ecosystem.dhamma.config.cjs
pm2 restart dhamma
pm2 stop dhamma
pm2 logs dhamma
pm2 save
```

---

## 1. Mac から初回デプロイ

```bash
cd ~/tradePulseNode
bash deploy/conoha/push-dhamma.sh root@160.251.173.118
```

## 2. サーバー上で初回起動

```bash
ssh root@160.251.173.118

# gsaxo / articleappNode が動いているか確認（触らない）
pm2 list

# ダンマだけ起動
pm2 start /opt/tradePulseNode/deploy/conoha/ecosystem.dhamma.config.cjs
pm2 list    # dhamma が追加されただけか確認
pm2 save
```

## 3. スマホからアクセス

```
http://160.251.173.118:3053/
```

ConoHa のセキュリティグループで **TCP 3053** を開く必要があります。  
（既存の articleappNode / gsaxo 用ポートは変更不要）

### ホーム画面に追加

Safari / Chrome で上記 URL を開き →「ホーム画面に追加」

---

## 4. 更新時（日常）

Mac:

```bash
bash deploy/conoha/push-dhamma.sh root@160.251.173.118
```

サーバー:

```bash
pm2 restart dhamma
```

**`pm2 restart gsaxo` は不要です。**

---

## 5. ローカル開発

tradePulseNode の Express 経由（ポート 3052）:

```
http://localhost:3052/dhamma/
```

ConoHa 本番は `/opt/dhamma` + ポート 3053 で独立稼働。

## 6. データ更新（全26章）

南伝大蔵経テキストから JSON を再生成:

```bash
npm run dhamma:build
```

- 第1章: 手作り35ペア（`ch1.json` は上書きしない）
- 第2〜26章: 偈ごとに観察→行動ペアを自動生成（計423偈）
- 出典: `scripts/dhammapada-nanden-source.txt`

デプロイ:

```bash
bash deploy/conoha/push-dhamma.sh root@160.251.173.118
ssh root@160.251.173.118 pm2 restart dhamma
```

スマホで一度開き直すと Service Worker が v2 に更新されます。

---

## トラブルシュート

| 症状 | 確認 |
|------|------|
| gsaxo が止まった | `pm2 restart gsaxo`（ダンマ更新とは無関係のはず。`pm2 delete all` していないか） |
| 3053 に繋がらない | ConoHa ファイアウォール / セキュリティグループ |
| ファイルが古い | `push-dhamma.sh` 再実行 → `pm2 restart dhamma` |
| オフラインが効かない | 一度ブラウザで開いてからトンネル内で再表示 |
