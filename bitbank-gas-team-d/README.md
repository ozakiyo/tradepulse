# BITBANK × GAS — **チームD**（柴田罫線順張り・BTC/JPY）

**資金配分はメタ層**（`bitbank-gas-meta/`）が決定。  
**別スプレッドシート・別GAS** で運用。

参考: [清光社「柴田罫線を学ぶ」シリーズ（全24回）](https://www.seiko-eri.co.jp/lib/manabu/index.html)

**USD/JPY** は `bitbank-gas-team-d-fx/` を使用。

## 方針（サイト準拠の要点）

| 項目 | 内容 |
|------|------|
| 戦略 | **柴田鈎足法則** + **谷畑流2法則転換** + **斜線法** |
| 銘柄 | **BTC/JPY**（bitbank） |
| 時間足 | 1時間足（試験用。本家は週足中心） |
| 鈎足 | 値幅以上の終値変動で引線（[第4回](https://www.seiko-eri.co.jp/lib/manabu/series04.html)） |
| 買い | 鈎足**買い法則2回以上** + 下値斜線上 + **二の膳**（押し後） |
| 補助 | 上値斜線を陽線実体で上抜け（**いき買い**）+ 鈎足1法則（[第7回](https://www.seiko-eri.co.jp/lib/manabu/series07.html)） |
| 売り | 鈎足**売り法則2回以上**、または下値斜線を**陰線実体**で下抜け |
| 試験 | DRY_RUN + 紙JPY 30万円 |

## ファイル（7つ）

`Config.gs` / `BitbankApi.gs` / `ShibataKagi.gs` / `ShibataLaw.gs` / `Trend.gs` / `SheetLog.gs` / `Main.gs`

## プロパティ（試験）

```
BITBANK_API_KEY / BITBANK_API_SECRET
DRY_RUN=true
KAGI_BASE_STEP_JPY=50000
POSITION_BTC=0.0001
PAPER_JPY=300000
META_SPREADSHEET_ID=（任意）
```

## 手順

1. `.gs` 7ファイルをコピー
2. `d4TestConnection` → 権限許可
3. **6. シート初期化** → **2. 1回実行**
4. トリガー: **`d4RunOnce`** 5分
