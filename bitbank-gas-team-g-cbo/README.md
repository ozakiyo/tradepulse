# チームG-CBO — 4Hブレイクアウト（パーフェクトオーダー・暗号資産FX）

GMOコイン **暗号資産FX** でのブレイクアウト検証チームです。  
手法は [よし＠AIxICTトレーダー氏の記事](https://note.com/ailucky/n/n7d70f9c4ee4a) に基づく **EMAパーフェクトオーダー + 保ち合いブレイクアウト** です。

**G-CFX**（レンジ逆張り）・**G-FFX**（外国為替ブレイクアウト）とは別 GAS プロジェクトで運用します。

## 戦略概要（4H）

| 項目 | 内容 |
|------|------|
| 時間足 | 4H（GMO 1H足から集約） |
| フィルター | EMA10 > 20 > 50（下降は逆）+ 傾き一致 |
| セットアップ | トレンド後の保ち合い（幅 ≤ 6% 既定） |
| エントリー | 保ち合いを実体でブレイクした確定4H足 |
| 損切 | ブレイク足の安値/高値の外側 |
| 利確1 | 5本後に半分決済 → SLを建値へ |
| 利確2 | 残りは20EMAを実体が逆クロスで決済 |

## チームG の分担

| チーム | フォルダ | 市場 | 方式 |
|--------|----------|------|------|
| **G-CFX** | `bitbank-gas-team-g-cfx/` | 暗号10銘柄 | GMO レンジ逆張り |
| **G-CBO** | `bitbank-gas-team-g-cbo/` | 暗号10銘柄 | GMO ブレイクアウト |
| **G-FFX** | `bitbank-gas-team-g-ffx/` | FX10通貨 | GMO ブレイクアウト |
| **G-SAXO** | `saxo-openapi/` | FX25通貨 | Saxo レンジ逆張り（本番） |

**G-CBO と G-CFX は別スプレッドシート・別 APIキー** で同時稼働できます（同一GMO口座の場合は同時建玉に注意）。

## 対象銘柄（既定10）

`btc_jpy`, `eth_jpy`, `xrp_jpy`, `sol_jpy`, `doge_jpy`, `link_jpy`, `ada_jpy`, `ltc_jpy`, `sui_jpy`, `dot_jpy`

## セットアップ

1. **新しい GAS + スプレッドシート**（G-CFX・G-FFXとは別）
2. 本フォルダの `.gs` をすべてコピー（または `gas-clasp` で push）
3. [会員ページ](https://coin.z.com/jp/member/) で **暗号資産FXの APIキー** を発行
4. スクリプトプロパティ:

| キー | 例 | 説明 |
|------|-----|------|
| `GMO_API_KEY` | （本番必須） | **暗号資産FX用** APIキー |
| `GMO_API_SECRET` | （本番必須） | |
| `GMO_PUBLIC_API` | `https://api.coin.z.com/public` | G-FFX からコピーした場合は **必ず上書き** |
| `GMO_PRIVATE_API` | `https://api.coin.z.com/private` | 同上 |
| `DRY_RUN` | `true` | デモ推奨。本番は `false` |
| `PAPER_JPY` | `500000` | 紙トレ初期JPY |
| `META_SPREADSHEET_ID` | （推奨） | メタ層SSのID |
| `GCBO_PAIRS` | 省略可 | 例 `btc_jpy,eth_jpy` |
| `GCBO_MAX_MARGIN_JPY_PER_PAIR` | `50000` | 1銘柄あたり最大証拠金 |
| `GCBO_MAX_OPEN_POSITIONS` | `7` | 同時建玉数 |
| `GCBO_EMA_FAST` | `10` | 短期EMA |
| `GCBO_CONSOLIDATION_MAX_PCT` | `6` | 保ち合い最大幅（%） |
| `GCBO_PARTIAL_TP_BARS` | `5` | 部分利確までの4H本数 |

5. **6. シート初期化** → **7. 接続テスト** → **2. 1回実行**（DRY_RUN=true）
6. **3. 5分トリガー** → **10. 日次レポートトリガー**

## clasp デプロイ

```bash
npm run gas:setup          # 初回: scriptId 登録後
npm run gas:push -- G-CBO  # このチームだけ push
```

## 最低資金テスト

メニュー **「14. 最低資金テスト設定」** — 30万円・紙トレ向け。

### 1万円本番トライアル（G-CFX と併用）

| チーム | メニュー | 銘柄 |
|--------|----------|------|
| **G-CFX** | 15 / **15b** 全銘柄探索 | XRP または 9銘柄 | 1 |
| **G-CBO** | **16. 1万円本番トライアル** | DOGE/JPY | 1 |
| **G-CBO** | **16b. 1万円・全銘柄探索** | 9銘柄（BTC除外） | 1 |

**16b** は4Hブレイクの機会を増やすため、複数銘柄を監視しつつ `GCBO_MAX_OPEN_POSITIONS=1` で1建玉のみエントリーします。

設定後: **7. 接続テスト** → **2. 1回実行** → **3. 15分トリガー** → **10. 日次レポート**

## META

- チーム名: **G-CBO**
- 純損益: 口座残高の **変化率（%）**

## API

- [暗号資産FX API](https://api.coin.z.com/docs/)
