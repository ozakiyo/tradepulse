# Saxo OpenAPI — Simulation / G-SAXO

[Saxo Developer Portal](https://developer.saxobank.com/openapi/) の **Simulation 環境**向けスクリプトです。

## チーム G-SAXO（FX + 指数 + 金）

暗号資産は **G-CFX（GMO）** 側。G-SAXO は Saxo Simulation で **FX・指数CFD・金スポット** のみ。

| 区分 | 内容 | 本数 |
|------|------|------|
| 金 | XAUUSD（銀 XAG は対象外） | 1 |
| A メジャー | EUR/USD, GBP/USD, USD/JPY 等 | 7 |
| B G10クロス | EUR/GBP, EUR/JPY, GBP/JPY 等 | 12 |
| C 準メジャー | USD/SEK, EUR/PLN 等（TRY/ZAR/MXN/RUB 除外） | 10 |
| 指数◎ | US500, NAS100, GER40 | 3 |
| 指数○ | US30, EU50, FRA40, SWISS20 | 4 |
| **合計（指数あり）** | UK100 は Simulation 未提供で除外 | **37** |
| **合計（FX全30）** | 金 + FX A/B/C のみ | **30** |
| **合計（リーン・既定）** | 北欧4 + USD/DKK + 指数を除外 | **25** |

銘柄定義・ティア: `saxo-openapi/lib/gsaxo-instruments.mjs`

### 稼働モード（`.env` で切替）

| モード | `GSAXO_INCLUDE_INDEX` | `GSAXO_EXCLUDE_HEAVY_FX` | 監視銘柄 | 同時建玉（既定） |
|--------|----------------------|--------------------------|----------|------------------|
| **リーン（既定）** | `false` | `true` | 25（FX+金・北欧/DKK除外） | **4** |
| FX全30 | `false` | `false` | 30 | 2 |
| **フル** | `true` | `false` | 37（+指数7） | `20` 推奨 |

除外銘柄（`GSAXO_EXCLUDE_HEAVY_FX=true`）: USD/SEK, EUR/SEK, USD/NOK, EUR/NOK, USD/DKK

```env
# 本番運用（20万円）
GSAXO_INCLUDE_INDEX=false
GSAXO_EXCLUDE_HEAVY_FX=true
GSAXO_MAX_OPEN_POSITIONS=4
GSAXO_PAPER_JPY=200000
GSAXO_DRY_RUN=false

# 後から指数を足すとき
GSAXO_INCLUDE_INDEX=true
GSAXO_EXCLUDE_HEAVY_FX=false
GSAXO_MAX_OPEN_POSITIONS=20
GSAXO_MAX_MARGIN_JPY_PER_PAIR=60000
GSAXO_PAPER_JPY=500000
```

### ティア別レンジ幅（C 準メジャー向け）

| Tier | h1RangeMinPct | h1RangeMaxPct | dailyRangeMaxPct | touchPct |
|------|---------------|---------------|------------------|----------|
| A | 0 | 3.5（既定） | 10 | 0.1 |
| B | 0.6 | 3.5 | 10 | 0.1 |
| C | 1.0 | 4.5 | 12 | 0.12 |
| index / metal | 0 | 3.5 | 10 | 0.1 |

## レンジBot

G-FX と同ロジック（日足レンジ → 1Hレンジ → 5分確定足でエントリー）の **紙トレ** Bot。

```bash
# 1回実行
npm run gsaxo:run

# 5分間隔で常駐（完了後は待機。Ctrl+C で停止）
npm run gsaxo:daemon

# 特定銘柄のみ
npm run gsaxo:run -- --only=xauusd,us500
```

状態ファイル: `data/gsaxo-state.json`（`.gitignore` 対象）  
売買履歴: `data/gsaxo-trades.jsonl`（レンジ） / `data/gsaxo-trend-trades.jsonl`（トレンドモード）

### トレンドモード（F-FX式・ペーパー・損切連動）

**G-SAXO 日足損切** 後、その銘柄を **48h ウォッチ** し、**1H押し目** で順張りエントリーします（追いかけではなく確認後の押し目）。方向は損切と整合（ロング損切→ショート、ショート損切→ロング）。本番口座でも **別紙ウォレット** のみ。

| 項目 | 内容 |
|------|------|
| 有効化 | `GSAXO_TREND_MODE=true` |
| 建玉 | `state.trendPaperWallet`（レンジと独立） |
| 同時上限 | `GSAXO_TREND_MAX_OPEN_POSITIONS`（既定 2） |
| エントリー | 日足損切→ウォッチ → 日足方向確認 + 1H押し目 |
| 決済 | 1Hダウ崩壊/反転 + **旧日足レンジ内回帰**（③） |
| META | チーム **`G-SAXO-TREND`**（`G-SAXO` レンジとは別行） |

```env
GSAXO_TREND_MODE=true
GSAXO_TREND_PAPER_ONLY=true
GSAXO_TREND_STOP_WATCH=true
GSAXO_TREND_STOP_WATCH_HOURS=48
GSAXO_TREND_STOP_WATCH_ONLY=true
GSAXO_TREND_OLD_RANGE_STOP=true
GSAXO_TREND_MAX_OPEN_POSITIONS=2
GSAXO_TREND_PAPER_JPY=200000
```

`GSAXO_TREND_STOP_WATCH_ONLY=false` にすると、従来どおり ADX/ER フィルタ発動銘柄への一般エントリーも有効（`GSAXO_TREND_REQUIRE_FILTER_BLOCK`）。

ログ例: `usd_jpy [TREND] 損切ウォッチ開始 方向=short 旧レンジL=... H=... 48h`

### トレンドフィルタ（ADX + ER）

1H足で **ADX または ER のどちらかが閾値以上** のとき、新規エントリーを見送ります（**両方とも閾値未満のときだけ**レンジ新規可）。保有中の決済・利確は従来どおり。
ログに `ADX=… ER=… <25/<0.30` のように **その銘柄の有効閾値** が毎サイクル出ます。見送り時は `トレンド(ADX)` / `トレンド(ER)` / `トレンド(ADX+ER)` を付記します。

**閾値の優先順位:** グローバル → ティア → **自動（state・日足損切から学習）** → 手動 env

自動調整は `data/gsaxo-state.json` の `pairs.<id>.trendAuto` に保存されます。外れ値（ADX 8–60、ER 0.08–0.85 外、IQR 法）は採用しません。

```env
GSAXO_TREND_AUTO=true
GSAXO_TREND_AUTO_MIN_SAMPLES=2
```

損切時ログ例:

```
usd_cad 閾値自動調整 ADX≥20 ER≥0.26 (損切2件 最小損切ADX=21 ER=0.28)
```

```env
# グローバル既定
GSAXO_ADX_TREND_MIN=25
GSAXO_ER_TREND_MIN=0.30

# 銘柄別（セミコロン区切り）。off = その銘柄だけフィルタ無効
GSAXO_TREND_PAIR_OVERRIDES=usd_cad:adx=22,er=0.28;gbp_usd:adx=22,er=0.28;usd_jpy:off
```

```
新規見送り(トレンド ADX=24.1 ER=0.32 <22/<0.28 トレンド(ADX))
```


G-FX / G-CFX と同様 `META_統合レポート` へ送信。認証は **メタ層 GAS の Webアプリ** 経由です。

```bash
npm run gsaxo:report      # 日次レポート → META
npm run gsaxo:meta:test   # 接続テスト
```

### セットアップ

1. `npm run gas:push` で `bitbank-gas-meta` をデプロイ（`GsaxoMetaIngest.gs` 含む）
2. メタ層 SS → メニュー **「14. G-SAXO META共有鍵設定」** で共有鍵を設定
3. Apps Script → **デプロイ → 新しいデプロイ → ウェブアプリ**  
   - 実行ユーザー: 自分 / アクセス: 全員  
   - メニュー **「15. G-SAXO Webアプリ手順」** も参照
4. `.env` に設定:

```env
GSAXO_META_WEBAPP_URL=https://script.google.com/macros/s/xxxx/exec
GSAXO_META_SECRET=（手順2と同じ文字列）
```

## 常時稼働について

G-SAXO は **Node**（`npm run gsaxo:daemon`）で動きます。  
ローカル Mac がスリープ／電源オフの間は Bot も止まります。

| チーム | 実行場所 | Mac 不要？ |
|--------|----------|-----------|
| G-FX / G-CFX | Google Apps Script（5分トリガー） | **不要**（Google 側で稼働） |
| G-SAXO | ConoHa VPS + pm2 | **不要**（VPS 常駐） |

24時間稼働: [deploy/conoha/README.md](../../deploy/conoha/README.md)（ConoHa + pm2）

### Simulation での価格取得

| 銘柄 | 価格ソース |
|------|-----------|
| FX / XAUUSD | Chart API（1H / 5分） |
| 指数CFD | Chart API（infoprices は NoAccess のため） |

## 接続テスト

```bash
npm run saxo:test:gsaxo
npm run saxo:test:gsaxo -- --precheck
npm run saxo:test:gsaxo -- --only=us500
```

## セットアップ

### A. LIVE（日本口座・OAuth — 推奨）

1. Developer Portal で **LIVE アプリ**を申請・承認
2. ブラウザで OAuth ログイン → `code` をトークンに交換済みの JSON を用意
3. `.env`:

```env
SAXO_API_BASE=https://gateway.saxobank.com/openapi
SAXO_AUTH_URL=https://live.logonvalidation.net
SAXO_APP_KEY=（LIVE App Key）
SAXO_APP_SECRET=（LIVE App Secret）
SAXO_REDIRECT_URI=（Portal 登録と完全一致）
GSAXO_INCLUDE_INDEX=false
GSAXO_EXCLUDE_HEAVY_FX=true
GSAXO_PAPER_JPY=200000
GSAXO_MAX_OPEN_POSITIONS=4
```

4. トークン保存（交換済み JSON を `tokens.json` に保存した場合）:

```bash
npm run saxo:oauth:import -- --file=tokens.json
npm run saxo:oauth:test
npm run saxo:test:gsaxo
```

未保存の場合は `code` から:

```bash
npm run saxo:oauth:exchange -- --code=xxxx
```

ConoHa へは `data/saxo-oauth-tokens.json` も scp してください。以降 **refresh token で自動更新**（毎日の手動更新不要）。

### B. SIM（24h トークン・検証用）

1. [Developer Portal](https://developer.saxobank.com/openapi/) で Simulation アカウントを作成
2. [24h トークン](https://developer.saxobank.com/openapi/token) を発行
3. `.env`:

```env
SAXO_ACCESS_TOKEN=（24hトークン）
SAXO_API_BASE=https://gateway.saxobank.com/sim/openapi
GSAXO_DRY_RUN=true
GSAXO_INCLUDE_INDEX=false
GSAXO_EXCLUDE_HEAVY_FX=true
GSAXO_MAX_OPEN_POSITIONS=4
GSAXO_PAPER_JPY=200000
```

## 環境変数（Saxo 認証）

| 変数 | 説明 |
|------|------|
| `SAXO_APP_KEY` / `SAXO_APP_SECRET` | LIVE OAuth（設定時は 24h トークン不要） |
| `SAXO_REDIRECT_URI` | Developer Portal の AppUrl と一致 |
| `SAXO_AUTH_URL` | LIVE: `https://live.logonvalidation.net` |
| `SAXO_API_BASE` | LIVE: `https://gateway.saxobank.com/openapi` |
| `SAXO_OAUTH_TOKEN_PATH` | 既定 `data/saxo-oauth-tokens.json` |
| `SAXO_ACCESS_TOKEN` | SIM 24h トークンのみ |

## 環境変数（Bot）

| 変数 | 既定 | 説明 |
|------|------|------|
| `GSAXO_INCLUDE_INDEX` | `false` | `true` で指数CFD 7本を追加 |
| `GSAXO_EXCLUDE_HEAVY_FX` | `true` | `true` で北欧4+USD/DKKを除外（リーン25本） |
| `GSAXO_PAIRS` | モードに応じた全銘柄 | カンマ区切りで個別指定可 |
| `GSAXO_DRY_RUN` | `true` | 紙トレ（Simulation 注文は送らない） |
| `GSAXO_PAPER_JPY` | `200000` | 紙トレ初期資金（円） |
| `GSAXO_MAX_OPEN_POSITIONS` | `4` | 同時建玉数上限 |
| `GSAXO_DAILY_STOP_COOLDOWN_HOURS` | `24` | 日足損切後、同一銘柄の新規を止める時間（`0`=無効） |
| `GSAXO_DAILY_STOP_BUFFER_PCT` | `0.3` | 日足レンジ境界からの損切余白% |
| `GSAXO_DAILY_STOP_CONFIRM_BARS` | `2` | 日足損切: 連続する確定5分足の本数 |
| `GSAXO_H1_STOP_BUFFER_PCT` | `0.2` | 1Hレンジ境界からの損切余白%（ダマシ回避） |
| `GSAXO_H1_STOP_CONFIRM_BARS` | `1` | 1H損切: 連続する確定1H足の本数 |
| `GSAXO_H1_STOP_SPREAD_MULT` | `1.5` | 1H損切判定のスプレッド倍率（利確より広め） |
| `GSAXO_VOL_SPIKE_FILTER` | `true` | 直近1H足のボラ急伸時に新規停止 |
| `GSAXO_H1_VOL_SPIKE_RATIO` | `2.0` | 直近1H足TR / 過去5本平均TR の閾値 |
| `GSAXO_H1_VOL_SPIKE_LOOKBACK` | `5` | ボラ平均の参照本数（確定1H足） |
| `GSAXO_H1_VOL_SPIKE_MIN_PCT` | `0.2` | ボラ急伸判定の最低バー幅%（ノイズ除外） |
| `GSAXO_TREND_FILTER` | `true` | `true` で ADX または ER が閾値以上なら新規停止（**両方未満のみ**レンジ新規可） |
| `GSAXO_ADX_PERIOD` | `14` | ADX 計算期間（1H足本数） |
| `GSAXO_ADX_TREND_MIN` | `25` | この ADX 以上で新規停止（ER と独立） |
| `GSAXO_ER_PERIOD` | `14` | ER 計算期間（1H足本数） |
| `GSAXO_ER_TREND_MIN` | `0.30` | この ER 以上で新規停止（ADX と独立） |
| `GSAXO_TREND_PAIR_OVERRIDES` | （空） | 銘柄別 `pair:adx=25,er=0.30;pair2:off`（**手動・自動より優先**） |
| `GSAXO_TREND_AUTO` | `true` | 日足損切時の ADX/ER から銘柄別閾値を自動調整 |
| `GSAXO_TREND_AUTO_MIN_SAMPLES` | `2` | 自動調整に必要な損切サンプル数 |
| `GSAXO_TREND_AUTO_MAX_SAMPLES` | `15` | 保持する損切サンプル上限 |
| `GSAXO_MAX_MARGIN_JPY_PER_PAIR` | `50000` | 銘柄あたり証拠金上限 |
| `GSAXO_TP_RATIO` | `0.55` | 1H幅に対する利確位置 |
| `GSAXO_RUN_INTERVAL_MS` | `300000` | デーモン実行間隔（5分） |
| `GSAXO_STATE_PATH` | `data/gsaxo-state.json` | 状態ファイル |

## 損切時のチャート確認

取引ログ `data/gsaxo-trades.jsonl` から損切を抽出し、**損切時点の 1H 足**と日足/1H レンジ境界を HTML チャートに描画します。

```bash
# サーバーで（OAuth / .env 済み）
cd /opt/tradePulseNode
npm run gsaxo:stop-review -- --daily-only --days=14

# Mac でサーバーデータを使う場合
scp root@160.251.173.118:/opt/tradePulseNode/data/gsaxo-trades.jsonl data/
scp root@160.251.173.118:/opt/tradePulseNode/data/gsaxo-state.json data/
npm run gsaxo:stop-review -- --daily-only

# 一覧だけ（API 不要）
npm run gsaxo:stop-review -- --list --daily-only
```

出力: `data/gsaxo-stop-review.html`（ブラウザで開く）

**ウィンドウ:** 1H足 72本 = **損切前 24本（1/3）+ 損切後 48本（2/3）**。赤縦線が損切時刻。

| オプション | 説明 |
|------------|------|
| `--daily-only` | 日足損切のみ |
| `--days=30` | 直近 N 日 |
| `--bars=72` | 合計本数（前1/3・後2/3） |
| `--from-html=path` | 既存 HTML から損切一覧を再利用 |
| `--yahoo` | Saxo 不可時に Yahoo Finance で取得（Mac 向け） |
| `--list` | 一覧表示のみ |
| `--no-fetch` | API なし |
| `--out=path` | 出力先（例: `~/Desktop/gsaxo-stop-review.html`） |

チャート上の線: **青=日足レンジ上下 · 緑=1Hレンジ上下 · 紫=損切価格**

## 注意

- 24h トークンは **Simulation のみ** 有効（本番 LIVE には使えない）
- 本番 LIVE は OAuth アプリ登録が別途必要
- UK100（FTSE 100）は Simulation 未提供。本番 LIVE 口座で追加予定
