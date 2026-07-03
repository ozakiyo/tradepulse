# BITBANK × GAS — **チームE**（ドンチャン順張り）

**資金配分はメタ層**（`bitbank-gas-meta/`）が決定。  
**別スプレッドシート・別GAS** で運用（A/B/C/Meta と独立）。

## 方針

| 項目 | 内容 |
|------|------|
| 戦略 | **ドンチャン・ブレイクアウト順張り**（現物ロングのみ） |
| 銘柄 | **BTC/JPY**（bitbank） |
| 時間足 | 1時間足（4H方向は1Hを4本合成） |
| 買い | 20本高値ブレイク + ADX≥22 + ER≥0.32 + 4H上昇 + RSI≤68 |
| 売り | 10本安値ブレイク、損切り、トレール |
| 試験 | DRY_RUN + 紙JPY 30万円 |

**USD/JPY** は別プロジェクト `bitbank-gas-team-e-fx/`（紙トレード・Yahoo）。

## 他チームとの違い

| チーム | 順張り手法 |
|--------|------------|
| **C** | ポイント＆フィギュア（3箱反転） |
| **D** | 柴田罫線（`bitbank-gas-team-d/`） |
| **E** | **ドンチャン・チャネル** + ADX/ER + 4Hフィルタ |

## ファイル（6つ）

`Config.gs` / `BitbankApi.gs` / `Indicators.gs` / `Trend.gs` / `SheetLog.gs` / `Main.gs`

## プロパティ（試験）

```
BITBANK_API_KEY / BITBANK_API_SECRET
DRY_RUN=true
DONCHIAN_ENTRY_BARS=20
DONCHIAN_EXIT_BARS=10
POSITION_BTC=0.0001
PAPER_JPY=300000
META_SPREADSHEET_ID=（任意）
```

## 手順

1. `.gs` 6ファイルをコピー
2. `e5TestConnection` → 権限許可
3. **6. シート初期化** → **2. 1回実行**
4. トリガー: **`e5RunOnce`** 5分
