# チームC-FX — USD/JPY P&F順張り（紙トレード）

**BTC/JPY とは別スプレッドシート・別GAS** で運用。  
対応BTC版: `bitbank-gas-team-c/`

## 方針

| 項目 | 内容 |
|------|------|
| 銘柄 | **USD/JPY**（Yahoo Finance） |
| 戦略 | チームCと同じ **P&F順張り** |
| 実行 | **紙トレードのみ**（bitbank API 不要） |
| 試験 | 紙JPY 30万円 |

## ファイル（6つ）

`Config.gs` / `MarketData.gs` / `PointFigure.gs` / `Trend.gs` / `SheetLog.gs` / `Main.gs`

## プロパティ

```
PF_BOX=0.25
PF_REVERSAL_BOXES=3
POSITION_USD=1000
PAPER_JPY=300000
```

## 手順

1. **別スプレッドシート**を作成し `.gs` 6ファイルをコピー
2. `c3fTestConnection` → 権限許可
3. **6. シート初期化** → **2. 1回実行**
4. トリガー: **`c3fRunOnce`** 5分

## シート

- `C3F_運用ログ` / `C3F_売買履歴`

META 層への報告は行いません（BTCチームCと独立）。
