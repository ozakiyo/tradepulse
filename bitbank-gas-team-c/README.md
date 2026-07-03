# BITBANK × GAS — **チームC**（P&F順張り・BTC/JPY）

**資金配分はメタ層**（`bitbank-gas-meta/`）が決定。  
**USD/JPY 版は別プロジェクト**: `bitbank-gas-team-c-fx/`

## 方針

| 項目 | 内容 |
|------|------|
| 銘柄 | **BTC/JPY**（bitbank） |
| 戦略 | ポイント＆フィギュア順張り（現物ロング） |
| 試験 | DRY_RUN + 紙JPY 30万円 |

## ファイル（6つ）

`Config.gs` / `BitbankApi.gs` / `PointFigure.gs` / `Trend.gs` / `SheetLog.gs` / `Main.gs`

## プロパティ

```
BITBANK_API_KEY / BITBANK_API_SECRET
DRY_RUN=true
PF_BOX_JPY=50000
POSITION_BTC=0.0001
PAPER_JPY=300000
META_SPREADSHEET_ID=（任意）
```

## 手順

1. `.gs` 6ファイルをコピー
2. `c3TestConnection` → 権限許可
3. **6. シート初期化** → **2. 1回実行**
4. トリガー: **`c3RunOnce`** 5分

## USD/JPY を動かす場合

別スプレッドシート + 別GAS に `bitbank-gas-team-c-fx/` をデプロイしてください。
