# チームF-FX-Short — 1H+5m ダウ理論トレンドフォロー（FX）

F-FXの派生版。短い時間足（1H+5m）でFX通貨ペアを売買する紙トレード専用Bot。

## 戦略

| 役割 | 時間足 | strength | 説明 |
|------|--------|----------|------|
| **トレンド方向** | 1H | 15 | ダウ理論で売買方向を決定 |
| **エントリー** | 5m | 7 | 1Hトレンド方向に沿った戻り確定でエントリー |
| **決済（利食い/損切り）** | 5m | 7 | 5mダウ理論でトレンド崩壊/反転を検出 |

### F-FXとの違い

| | F-FX | F-FX-Short |
|--|------|------------|
| トレンド判定 | 日足 (strength=15) | **1H** (strength=15) |
| エントリー・決済 | 1H (strength=7) | **5m** (strength=7) |
| 取引頻度 | 低 | **高** |
| 保有期間 | 数日〜数週間 | **数時間〜数日** |

## セットアップ

1. 新規スプレッドシートを作成 → Apps Script エディタを開く
2. `bitbank-gas-team-f-short/` の `.gs` と `appsscript.json` をすべてコピー
3. メニュー **チームF-FX-Short Bot** → **6. シート初期化**
4. **7. 接続テスト** で Yahoo Finance との接続確認
5. **3. 5分トリガーを設置**

### スクリプトプロパティ

| キー | 既定 | 説明 |
|------|------|------|
| `SWING_STRENGTH_TREND` | 15 | 1Hトレンド判定のスイング強度 |
| `SWING_STRENGTH_ENTRY` | 7 | 5mエントリー/決済のスイング強度 |
| `BATCH_SIZE` | 15 | 1回の実行で処理する銘柄数 |
| `INSTRUMENTS` | (全40ペア) | カンマ区切りで監視銘柄を限定 |
| `PAPER_JPY` | 300000 | 紙トレード初期資金 |
| `LINE_CHANNEL_ACCESS_TOKEN` | — | LINE通知（任意） |
| `LINE_USER_ID` | — | LINE通知（任意） |

## ファイル構成

| ファイル | 内容 |
|----------|------|
| `Config.gs` | 設定・状態管理・ペーパーウォレット |
| `Instruments.gs` | FX 40ペアの定義 |
| `MarketData.gs` | Yahoo Finance データ取得（1H/5m） |
| `SwingTrend.gs` | スイングポイント検出・ダウ理論判定 |
| `Trend.gs` | エントリー・決済ロジック |
| `Main.gs` | メニュー・バッチ処理・メインループ |
| `SheetLog.gs` | スプレッドシート記録 |
| `LineNotify.gs` | LINE Messaging API 通知 |
