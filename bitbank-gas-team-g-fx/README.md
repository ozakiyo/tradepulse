# チームG-FX — FXレンジ（ロング・ショート・10通貨）

> **現在は停止（既定）** — `VALIDATION_PAUSED=true`。META からも除外。  
> **外国為替FX 実践** は **G-FFX**（`bitbank-gas-team-g-ffx/`）。  
> **暗号資産FX 実践** は **G-CFX**（`bitbank-gas-team-g-cfx/`）。

チームG（bitbank現物・買いのみ）の **FX版**。Yahoo Finance の紙トレードで、**ロングとショート** の両建てが可能です（検証用）。

## 選定10通貨（レンジ相場になりやすいペア）

| ID | ペア | 選定理由 |
|----|------|----------|
| eur_usd | EUR/USD | 世界最大出来高・レンジ日が多い |
| usd_jpy | USD/JPY | アジア時間のレンジ |
| usd_chf | USD/CHF | 安定したクロス |
| aud_usd | AUD/USD | 緩やかなレンジ |
| nzd_usd | NZD/USD | AUDと相関しつつ独立レンジ |
| eur_gbp | EUR/GBP | 代表的レンジ通貨 |
| eur_chf | EUR/CHF | 低ボラレンジ |
| usd_cad | USD/CAD | 原油連動だが日中レンジ |
| eur_jpy | EUR/JPY | 円クロス・レンジ帯 |
| gbp_usd | GBP/USD | メジャー・日中レンジ |

## ロジック（チームG + ショート追加）

```
日足レンジ + 1Hレンジ（日足内）
  ├ 5分終値 ≈ 1H下限 → ロング新規（2000通貨）
  ├ 5分終値 ≈ 1H上限 → ショート新規（2000通貨）
  ├ ロング保有 & 1H幅×TP_RATIO → ロング決済（利確）
  ├ ショート保有 & 1H幅×TP_RATIO → ショート決済（利確）
  ├ 1H逆方向ブレイク → 半分損切
  └ 日足逆方向ブレイク → 残り損切
```

## セットアップ

1. **新しい GAS + スプレッドシート**（チームG・チームBとは別）
2. 本フォルダの `.gs` をすべてコピー（`appsscript.json` は不要）
3. プロパティ:

| キー | 例 |
|------|-----|
| `PAPER_JPY` | `500000` |
| `META_SPREADSHEET_ID` | メタ層SSのID |
| `GFX_PAIRS` | 省略で10通貨すべて |
| `GFX_TP_RATIO` | `0.55`（0.5=中間, 0.667=2/3, 1.0=反対端） |
| `GFX_PARTIAL_STOP_RATIO` | `0.5`（1H損切比率、残りは日足損切） |

4. **6. シート初期化** → **7. 接続テスト** → **2. 1回実行**
5. **10. 日次レポートトリガー**（6時・META送信）
6. **3. 5分トリガー**

## シート

- `GFX_運用ログ` — 売買時・レンジ変化時のみ
- `GFX_売買履歴` — ロング新規/決済、ショート新規/決済
- `GFX_週次レポート` ほか

## META

- チーム名: **G-FX**
- 純損益: 口座残高の **変化率（%）**（F系と同様）

## 注意

- **紙トレード専用**（GMO/OANDA API 未接続）
- レバーは `GFX_MARGIN_RATE=0.05`（5%証拠金想定）の簡易モデル
- USD建てペアの円換算は `GFX_USD_JPY_REF=150` を使用

## ファイル

| ファイル | 役割 |
|----------|------|
| `Config.gs` | 定数・状態 |
| `Instruments.gs` | 10通貨 |
| `MarketData.gs` | Yahoo・紙トレ |
| `RangeDetect.gs` | レンジ判定 |
| `RangeTrade.gs` | 売買 |
| `SheetLog.gs` | ログ |
| `WeeklyReport.gs` | META |
| `ReportPeriodLib.gs` | 集計 |
| `Main.gs` | メニュー |
