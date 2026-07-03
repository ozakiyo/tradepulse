# BITBANK × GAS — **チームF-Index**（マルチTF トレンドフォロー・コモディティ+株価指数）

## 戦略概要

日足ダウ理論でトレンド方向を判定し、1時間足のスイングポイントで戻り確定を検出してエントリー。
コモディティ6銘柄 + 株価指数7銘柄を監視する。

| 項目 | 内容 |
|------|------|
| 対象 | Gold, Silver, Oil, Nat Gas, Copper, Platinum, S&P500, Dow, NASDAQ, Nikkei, FTSE, DAX, HSI（13銘柄） |
| データソース | Yahoo Finance |
| トレンド判定 | 日足ダウ理論（HH+HL=アップ, LH+LL=ダウン） |
| エントリー | 1H スイングハイ/ロー超え |
| 利食い | 終値トレンドライン割れ |
| 損切り | 戻り高安値 ± N pips（銘柄ごとに設定） |
| 実行間隔 | 5分ごと（13銘柄を1バッチで処理） |
| 通知 | LINE Notify（エントリー/決済/トレンド変化） |
| 売買 | 紙トレード（DRY_RUN のみ） |

## 関連チーム

| チーム | ディレクトリ | 対象 |
|--------|-------------|------|
| F-FX | `bitbank-gas-team-f/` | FX 40ペア |
| F-Crypto | `bitbank-gas-team-f-crypto/` | 暗号資産 10銘柄 |
| F-Index | `bitbank-gas-team-f-idx/` | コモディティ6 + 株価指数7（本チーム） |

## デプロイ手順

1. Google スプレッドシートを新規作成
2. 拡張機能 → Apps Script を開く
3. `bitbank-gas-team-f-idx/` 内の `.gs` ファイルと `appsscript.json` をコピー
4. スクリプトプロパティを設定
5. メニュー「チームF-Index Bot」→「6. シート初期化」
6. メニュー「チームF-Index Bot」→「7. 接続テスト」で動作確認
7. メニュー「チームF-Index Bot」→「3. 5分トリガーを設置」

## スクリプトプロパティ

| プロパティ | デフォルト | 説明 |
|------------|-----------|------|
| `INSTRUMENTS` | (空=全銘柄) | 監視銘柄をカンマ区切り |
| `BATCH_SIZE` | 15 | 1回の実行で処理する銘柄数 |
| `SWING_STRENGTH` | 2 | スイングポイント検出強度 |
| `PAPER_JPY` | 300000 | 紙トレード初期資金（JPY） |
| `LINE_NOTIFY_TOKEN` | (任意) | LINE Notify トークン |

## 銘柄一覧

### コモディティ (6)

| シンボル | 名称 | pipSize | 損切り幅 |
|----------|------|---------|----------|
| GC=F | Gold | 0.10 | 50 pips |
| SI=F | Silver | 0.005 | 50 pips |
| CL=F | Crude Oil | 0.01 | 50 pips |
| NG=F | Nat Gas | 0.001 | 50 pips |
| HG=F | Copper | 0.0005 | 50 pips |
| PL=F | Platinum | 0.10 | 50 pips |

### 株価指数 (7)

| シンボル | 名称 | pipSize | 損切り幅 |
|----------|------|---------|----------|
| ^GSPC | S&P 500 | 0.25 | 50 pips |
| ^DJI | Dow Jones | 1.0 | 50 pips |
| ^IXIC | NASDAQ | 0.25 | 50 pips |
| ^N225 | Nikkei | 5.0 | 50 pips |
| ^FTSE | FTSE 100 | 0.5 | 50 pips |
| ^GDAXI | DAX | 0.5 | 50 pips |
| ^HSI | Hang Seng | 1.0 | 50 pips |
