# チームE-FX — USD/JPY ドンチャン順張り（紙トレード）

**BTC/JPY とは別スプレッドシート・別GAS** で運用。  
対応BTC版: `bitbank-gas-team-e/`

## 方針

| 項目 | 内容 |
|------|------|
| 銘柄 | **USD/JPY**（Yahoo Finance） |
| 戦略 | チームEと同じ **ドンチャン順張り** + ADX/ER + 4Hフィルタ |
| 実行 | **紙トレードのみ**（bitbank API 不要） |
| 試験 | 紙JPY 30万円 |
| 価格表示 | 小数3桁 |

## ファイル（7つ）

`Config.gs` / `MarketData.gs` / `Indicators.gs` / `Trend.gs` / `SheetLog.gs` / `Main.gs` / `appsscript.json`

## プロパティ

```
DONCHIAN_ENTRY_BARS=20
DONCHIAN_EXIT_BARS=10
POSITION_USD=1000
PAPER_JPY=300000
```

## 手順

1. **別スプレッドシート**を作成し `.gs` 7ファイルをコピー
2. `e5fTestConnection` → 権限許可
3. **6. シート初期化** → **2. 1回実行**
4. トリガー: **`e5fRunOnce`** 5分

## シート

- `E5F_運用ログ` / `E5F_売買履歴`

META 層への報告は行いません（BTCチームEと独立）。
