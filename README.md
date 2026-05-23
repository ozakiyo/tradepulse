# tradePulseNode

USD/JPY・BTC現物の監視。**相場環境が変わったときのみ LINE 通知**（試験運用）。売買・損益はスプレッドシート。**articleappNode とは別アプリ**です。

## ローカル

```bash
cd tradePulseNode
cp .env.example .env
# LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID を設定

npm install
npm run dev
```

http://localhost:3052（既定ポート **3052**。articleappNode は 3050）

## ConoHa 同一サーバーでの運用例

| アプリ | ディレクトリ | 既定 PORT |
|--------|--------------|-----------|
| 記事・ランキング | `articleappNode` | 3050 |
| 配信メトリクス | `tradePulseNode` | 3052 |

### 1. デプロイ

```bash
# サーバー上
cd /path/to/tradePulseNode
cp .env.example .env
# .env を編集（PORT=3052, LINE, BASIC_AUTH など）
npm install --production
```

### 2. systemd（例）

`/etc/systemd/system/trade-pulse.service`

```ini
[Unit]
Description=Trade Pulse Node
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/tradePulseNode
Environment=NODE_ENV=production
ExecStart=/usr/bin/node app.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable trade-pulse
sudo systemctl start trade-pulse
```

### 3. nginx リバースプロキシ（例）

サブドメインで分ける場合:

```nginx
server {
    listen 443 ssl;
    server_name pulse.example.com;

    location / {
        proxy_pass http://127.0.0.1:3052;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

articleapp と同じドメインでパス分けする場合:

```nginx
location /pulse/ {
    proxy_pass http://127.0.0.1:3052/;
}
```

### 4. データ

試験状態は `data/trade-pulse-state.json` に保存されます（git 除外）。

articleappNode から移行した `content-pulse-state.json` があれば初回起動時に自動コピーします。

## 戦略（v3・試験）

**相場環境の自動判定**（1時間足）:

| 環境 | 判定の目安 | 手法 |
|------|------------|------|
| トレンド | 効率比(ER)・ADXが高い、BB幅拡大、EMAクロス少 | EMAクロス + 4Hフィルタ（順張り） |
| レンジ | ER・ADXが低い、BB幅縮小、EMAクロス多 | RSIの売られすぎ/買われすぎ（逆張り） |
| 中立 | 上記が拮抗 | 新規エントリー見送り（保有中は手仕舞いルール継続） |

- **トレンド手仕舞い**: 損切 1% / 利確 2.5% / 4H逆行
- **レンジ手仕舞い**: 損切 0.75% / 利確 1.2% / RSI中央回帰
- **コスト抑制**: 試験スプレッド、クールダウン3時間、ドテン既定オフ

`.env` の `TRADE_PULSE_*` で調整できます（`.env.example` 参照）。

## API

- `GET /api/pulse/status`
- `POST /api/pulse/check`
- `POST /api/pulse/test-line`
- `POST /api/pulse/reset-trial`
