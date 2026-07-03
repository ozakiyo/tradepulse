# チームG-FFX — 4Hブレイクアウト（パーフェクトオーダー・外国為替FX）

GMOコイン **外国為替FX** での実践用チームです。  
**暗号資産FX** は別チーム **G-CFX**（`bitbank-gas-team-g-cfx/`）を使用してください。  
**検証（紙トレ）** は **G-FX**（`bitbank-gas-team-g-fx/`・Yahoo FX10通貨）を使用してください。

**G-SAXO**（Saxo・レンジ逆張り）と役割分担します。G-FFX は **4H パーフェクトオーダー + 保ち合いブレイクアウト** を検証します。

## 戦略概要（4H）

| 項目 | 内容 |
|------|------|
| 時間足 | 4H（GMO 1H足から集約） |
| フィルター | EMA10 > 20 > 50（下降は逆）+ 傾き一致 |
| セットアップ | トレンド後の保ち合い（幅 ≤ 4% 既定） |
| エントリー | 保ち合いを実体でブレイクした確定4H足 |
| 損切 | ブレイク足の安値/高値の外側 |
| 利確1 | 5本後に半分決済 → SLを建値へ |
| 利確2 | 残りは20EMAを実体が逆クロスで決済 |

## 3チームの分担

| チーム | フォルダ | 市場 | 方式 |
|--------|----------|------|------|
| **G-FX** | `bitbank-gas-team-g-fx/` | FX10通貨 | Yahoo 紙トレ |
| **G-FFX** | `bitbank-gas-team-g-ffx/` | FX10通貨 | GMO ブレイクアウト |
| **G-CFX** | `bitbank-gas-team-g-cfx/` | 暗号10銘柄 | GMO レンジ逆張り |
| **G-CBO** | `bitbank-gas-team-g-cbo/` | 暗号10銘柄 | GMO ブレイクアウト |
| **G-SAXO** | `saxo-openapi/` | FX25通貨 | Saxo レンジ逆張り（本番） |

**G-FFX と G-CFX は別 GAS プロジェクト・別スプレッドシート・別 APIキー** で同時稼働します。

## 対象銘柄（既定10）

`eur_usd`, `usd_jpy`, `usd_chf`, `aud_usd`, `nzd_usd`, `eur_gbp`, `eur_chf`, `usd_cad`, `eur_jpy`, `gbp_usd`

API 最小新規: **10,000通貨**（Bot は 20,000通貨で部分利確対応）

## セットアップ

1. **新しい GAS + スプレッドシート**（G-CFX・G-FXとは別）
2. 本フォルダの `.gs` をすべてコピー（または `gas-clasp` で push）
3. [会員ページ](https://coin.z.com/jp/member/) で **外国為替FXの APIキー** を発行
4. スクリプトプロパティ:

| キー | 例 | 説明 |
|------|-----|------|
| `GMO_API_KEY` | （本番必須） | **外国為替FX用** APIキー |
| `GMO_API_SECRET` | （本番必須） | |
| `GMO_PUBLIC_API` | `https://forex-api.coin.z.com/public` | G-CFX からコピーした場合は **必ず上書き** |
| `GMO_PRIVATE_API` | `https://forex-api.coin.z.com/private` | 同上 |
| `GMO_KLINE_PRICE_TYPE` | `ASK` | klines 取得に必須 |
| `DRY_RUN` | `true` | デモ推奨。本番は `false` |
| `PAPER_JPY` | `500000` | 紙トレ初期JPY |
| `GFFX_USD_JPY_REF` | `150` | 非円建て損益換算 |
| `META_SPREADSHEET_ID` | （推奨） | メタ層SSのID |
| `GFFX_PAIRS` | 省略可 | 例 `usd_jpy,eur_usd` |
| `GFFX_MAX_MARGIN_JPY_PER_PAIR` | `50000` | 1銘柄あたり最大証拠金 |
| `GFFX_MAX_OPEN_POSITIONS` | `7` | 同時建玉数 |
| `GFFX_EMA_FAST` | `10` | 短期EMA |
| `GFFX_EMA_MID` | `20` | 中期EMA |
| `GFFX_EMA_SLOW` | `50` | 長期EMA |
| `GFFX_CONSOLIDATION_BARS` | `10` | 保ち合い判定本数 |
| `GFFX_PARTIAL_TP_BARS` | `5` | 部分利確までの4H本数 |
| `GFFX_PARTIAL_TP_RATIO` | `0.5` | 部分利確比率 |

5. **6. シート初期化** → **7. 接続テスト** → **2. 1回実行**（DRY_RUN=true）
6. 本番移行: **13. 本番モードに切替** → **2. 1回実行**
7. **3. 15分トリガー**（4H向け・推奨）→ **10. 日次レポートトリガー**

### UrlFetch 日次上限（重要）

GAS の `UrlFetch` は **Googleアカウント全体で1日約2万回**（無料枠）。G-FFX + G-CFX + META 等を同一アカウントで回すと上限に達します。

| 対策 | 内容 |
|------|------|
| **15分トリガー** | 5分より UrlFetch を約1/3に（メニュー **3.**） |
| **ティッカー一括取得** | 10通貨×10回 → **1回/実行**（コード済み） |
| **KLineキャッシュ** | 日次3600秒・バンドル1800秒 |
| 上限到達後 | **翌日0時（太平洋時間）頃**にリセット。当日は手動実行も不可 |

## 本番稼働チェックリスト

| # | 作業 | 確認 |
|---|------|------|
| 1 | G-FX を停止（トリガー削除・META STOP） | 下記「G-FX 停止」参照 |
| 2 | 外国為替FX用 APIキー設定 | 接続テスト Private OK |
| 3 | メニュー **13. 本番モード** | `DRY_RUN=false` |
| 4 | **2. 1回実行** | ログに `DRY_RUN=false`、エラーなし |
| 5 | **3. 15分トリガー** + **10. 日次レポート** | 設置済み |
| 6 | META に `G-FFX` 行が増える | 翌朝レポート確認 |

## G-FX 停止（紙トレ）

G-FFX 本番と併せて実施:

1. G-FX スプレッドシート → **4. トリガー削除** + **11. 日次レポートトリガー削除**
2. スクリプトプロパティ `VALIDATION_PAUSED=true`（既定で停止）
3. META: `G-FX` は `META_VALIDATION_PAUSED_TEAMS` に登録済み

## 最低資金テスト

メニュー **「14. 最低資金テスト設定」** で最小構成に切り替えられます。

| 項目 | 最低資金モード |
|------|----------------|
| ロット | **本番同様 2万通貨**（5本後に半分利確） |
| 同時建玉 | **2** |
| 監視銘柄 | **全10通貨** |
| 証拠金計算 | `GFFX_LEVERAGE=25`（GMO 4%） |
| 1銘柄上限 | 15万円 |
| 紙トレ資金 | 30万円 |
| **GMO入金目安（本番）** | **30万円** |

数日テスト時は **DRY_RUN=true** のまま **15分トリガー** を回してください。

## META

- チーム名: **G-FFX**
- 純損益: 口座残高の **変化率（%）**

## API

- [外国為替FX API](https://api.coin.z.com/fxdocs/)
