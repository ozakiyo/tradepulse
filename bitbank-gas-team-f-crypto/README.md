# BITBANK × GAS — **チームF-Crypto**（マルチTF トレンドフォロー・暗号資産）

## 戦略概要

日足ダウ理論でトレンド方向を判定し、1時間足のスイングポイントで戻り確定を検出してエントリー。
暗号資産10銘柄を監視する。**24/7稼働**。

| 項目 | 内容 |
|------|------|
| 対象 | BTC, ETH, XRP, SOL, ADA, DOT, AVAX, LINK, DOGE, BNB（10銘柄） |
| データソース | Yahoo Finance |
| トレンド判定 | 日足ダウ理論（HH+HL=アップ, LH+LL=ダウン） |
| エントリー | 1H スイングハイ/ロー超え |
| 利食い | 終値トレンドライン割れ |
| 損切り | 戻り高安値 ± N pips（銘柄ごとに設定） |
| 実行間隔 | **24/7** 5分ごと（10銘柄を1バッチで処理） |
| 通知 | LINE Notify（エントリー/決済/トレンド変化） |
| 売買 | 紙トレード（DRY_RUN のみ） |

## 関連チーム

| チーム | ディレクトリ | 対象 |
|--------|-------------|------|
| F-FX | `bitbank-gas-team-f/` | FX 40ペア |
| F-Crypto | `bitbank-gas-team-f-crypto/` | 暗号資産 10銘柄（本チーム） |
| F-Index | `bitbank-gas-team-f-idx/` | コモディティ6 + 株価指数7 |

## デプロイ手順

1. Google スプレッドシートを新規作成
2. 拡張機能 → Apps Script を開く
3. `bitbank-gas-team-f-crypto/` 内の `.gs` ファイルと `appsscript.json` をコピー
4. スクリプトプロパティを設定
5. メニュー「チームF-Crypto Bot」→「6. シート初期化」
6. メニュー「チームF-Crypto Bot」→「7. 接続テスト」で動作確認
7. メニュー「チームF-Crypto Bot」→「3. 5分トリガーを設置」

## スクリプトプロパティ

| プロパティ | デフォルト | 説明 |
|------------|-----------|------|
| `INSTRUMENTS` | (空=全暗号資産) | 監視銘柄をカンマ区切り |
| `BATCH_SIZE` | 15 | 1回の実行で処理する銘柄数 |
| `SWING_STRENGTH` | 2 | スイングポイント検出強度 |
| `PAPER_JPY` | 300000 | 紙トレード初期資金（JPY） |
| `LINE_NOTIFY_TOKEN` | (任意) | LINE Notify トークン |

## 銘柄一覧

| シンボル | 名称 | pipSize | 損切り幅 |
|----------|------|---------|----------|
| BTC-USD | Bitcoin | 1.0 | 100 pips |
| ETH-USD | Ethereum | 0.1 | 100 pips |
| XRP-USD | XRP | 0.0001 | 50 pips |
| SOL-USD | Solana | 0.01 | 50 pips |
| ADA-USD | Cardano | 0.0001 | 50 pips |
| DOT-USD | Polkadot | 0.01 | 50 pips |
| AVAX-USD | Avalanche | 0.01 | 50 pips |
| LINK-USD | Chainlink | 0.01 | 50 pips |
| DOGE-USD | Dogecoin | 0.00001 | 50 pips |
| BNB-USD | BNB | 0.01 | 50 pips |
