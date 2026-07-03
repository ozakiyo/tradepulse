# チームD-FX — USD/JPY 柴田罫線順張り（紙トレード）

**BTC/JPY とは別スプレッドシート・別GAS** で運用。  
対応BTC版: `bitbank-gas-team-d/`

参考: [清光社「柴田罫線を学ぶ」シリーズ](https://www.seiko-eri.co.jp/lib/manabu/index.html)

## 方針

| 項目 | 内容 |
|------|------|
| 銘柄 | **USD/JPY**（Yahoo Finance） |
| 戦略 | チームDと同じ **柴田鈎足 + 2法則 + 斜線** |
| 実行 | **紙トレードのみ**（bitbank API 不要） |
| 試験 | 紙JPY 30万円 |

## ファイル（8つ）

`Config.gs` / `MarketData.gs` / `ShibataKagi.gs` / `ShibataLaw.gs` / `Trend.gs` / `SheetLog.gs` / `Main.gs` / `appsscript.json`

## プロパティ

```
KAGI_BASE_STEP_FX=0.25
LAW_LOOKBACK_SEGS=12
POSITION_USD=1000
PAPER_JPY=300000
```

## 手順

1. **別スプレッドシート**を作成し `.gs` 8ファイルをコピー
2. `d4fTestConnection` → 権限許可
3. **6. シート初期化** → **2. 1回実行**
4. トリガー: **`d4fRunOnce`** 5分

## シート

- `D4F_運用ログ` / `D4F_売買履歴`

META 層への報告は行いません（BTCチームDと独立）。
