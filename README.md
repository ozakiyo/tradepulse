# tradePulseNode

USD/JPY・BTC現物のシグナル監視と LINE 通知（試験運用）。**articleappNode とは別アプリ**です。

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

## API

- `GET /api/pulse/status`
- `POST /api/pulse/check`
- `POST /api/pulse/test-line`
- `POST /api/pulse/reset-trial`
