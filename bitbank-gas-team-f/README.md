# BITBANK × GAS — **チームF-FX**（マルチTF トレンドフォロー・FX 40ペア）

## 戦略概要

日足ダウ理論でトレンド方向を判定し、1時間足のスイングポイントで戻り確定を検出してエントリー。
FX メジャー・クロス円・マイナー・エキゾチック計40ペアをバッチ処理で監視する。

| 項目 | 内容 |
|------|------|
| 対象 | FX メジャー7 + クロス円6 + マイナー14 + エキゾチック13 = 40ペア |
| データソース | Yahoo Finance |
| トレンド判定 | 日足ダウ理論（HH+HL=アップ, LH+LL=ダウン） |
| エントリー | 1H スイングハイ/ロー超え |
| 利食い | 終値トレンドライン割れ |
| 損切り | 戻り高安値 ± N pips（銘柄ごとに設定） |
| 実行間隔 | 平日のみ 5分ごと（バッチ15銘柄/回、全銘柄1周 ≒ 15分） |
| 通知 | LINE Notify（エントリー/決済/トレンド変化） |
| 売買 | 紙トレード（DRY_RUN のみ） |

## 関連チーム

| チーム | ディレクトリ | 対象 |
|--------|-------------|------|
| F-FX | `bitbank-gas-team-f/` | FX 40ペア（本チーム） |
| F-Crypto | `bitbank-gas-team-f-crypto/` | 暗号資産 10銘柄 |
| F-Index | `bitbank-gas-team-f-idx/` | コモディティ6 + 株価指数7 |

3チームとも同一の戦略ロジックを使用。銘柄定義とトリガー設定のみ異なる。

## デプロイ手順

1. Google スプレッドシートを新規作成
2. 拡張機能 → Apps Script を開く
3. `bitbank-gas-team-f/` 内の `.gs` ファイルと `appsscript.json` をコピー
4. スクリプトプロパティを設定（下記参照）
5. メニュー「チームF-FX Bot」→「6. シート初期化」
6. メニュー「チームF-FX Bot」→「7. 接続テスト」で動作確認
7. メニュー「チームF-FX Bot」→「3. 5分トリガーを設置」

## スクリプトプロパティ

| プロパティ | デフォルト | 説明 |
|------------|-----------|------|
| `INSTRUMENTS` | (空=全FXペア) | 監視ペアをカンマ区切り |
| `BATCH_SIZE` | 15 | 1回の実行で処理する銘柄数 |
| `SWING_STRENGTH` | 2 | スイングポイント検出強度 |
| `PAPER_JPY` | 300000 | 紙トレード初期資金（JPY） |
| `LINE_NOTIFY_TOKEN` | (任意) | LINE Notify トークン |

## ファイル構成

| ファイル | 役割 |
|----------|------|
| `Config.gs` | 定数・コンテキスト管理・状態管理・ウォレット |
| `Instruments.gs` | FX 40ペア定義テーブル |
| `MarketData.gs` | Yahoo Finance データ取得・紙トレード |
| `SwingTrend.gs` | スイング検出・ダウ理論判定・トレンドライン計算 |
| `Trend.gs` | エントリー・決済・ポジション管理 |
| `Main.gs` | メニュー・トリガー・バッチ処理ループ |
| `SheetLog.gs` | スプレッドシート運用ログ・売買履歴 |
| `LineNotify.gs` | LINE Notify 連携 |

## 銘柄一覧

### FX メジャー (7)
USD/JPY, EUR/USD, GBP/USD, AUD/USD, NZD/USD, USD/CAD, USD/CHF

### FX クロス円 (6)
EUR/JPY, GBP/JPY, AUD/JPY, NZD/JPY, CAD/JPY, CHF/JPY

### FX マイナー (14)
EUR/GBP, EUR/AUD, EUR/CAD, EUR/CHF, EUR/NZD, GBP/AUD, GBP/CAD, GBP/CHF, GBP/NZD, AUD/CAD, AUD/CHF, AUD/NZD, NZD/CAD, NZD/CHF

### FX エキゾチック (13)
USD/TRY, USD/ZAR, USD/MXN, USD/SGD, USD/HKD, USD/CNY, USD/INR, USD/PLN, USD/SEK, USD/NOK, EUR/SEK, EUR/NOK, EUR/HUF
