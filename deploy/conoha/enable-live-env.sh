#!/usr/bin/env bash
# サーバー専用 .env.server を生成・更新（/opt/tradePulseNode で実行）
# Mac から push しても .env.server は上書きされない（ローカル .env の scp より優先）
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_SERVER=".env.server"

set_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_SERVER" 2>/dev/null; then
    # sed -i は GNU/BSD で挙動が違うため grep で書き換え（Mac/Linux 両対応）
    grep -v "^${key}=" "$ENV_SERVER" > "${ENV_SERVER}.tmp"
    echo "${key}=${val}" >> "${ENV_SERVER}.tmp"
    mv "${ENV_SERVER}.tmp" "$ENV_SERVER"
  else
    echo "${key}=${val}" >> "$ENV_SERVER"
  fi
}

[[ -f .env ]] || { echo "ERROR: .env がありません"; exit 1; }
touch "$ENV_SERVER"

set_kv SAXO_ACCOUNT_KEY CHowgQPhFuNoHNklja5kqQ==
set_kv GSAXO_DRY_RUN false
set_kv GSAXO_INCLUDE_INDEX false
set_kv GSAXO_EXCLUDE_HEAVY_FX true
set_kv GSAXO_PAPER_JPY 200000
set_kv GSAXO_MAX_OPEN_POSITIONS 4
set_kv GSAXO_DAILY_STOP_COOLDOWN_HOURS 24
set_kv GSAXO_H1_STOP_BUFFER_PCT 0.2
set_kv GSAXO_H1_STOP_CONFIRM_BARS 1
set_kv GSAXO_H1_STOP_SPREAD_MULT 1.5
set_kv GSAXO_VOL_SPIKE_FILTER true
set_kv GSAXO_H1_VOL_SPIKE_RATIO 2.0
set_kv GSAXO_TREND_FILTER true
set_kv GSAXO_ADX_PERIOD 14
set_kv GSAXO_ADX_TREND_MIN 25
set_kv GSAXO_ER_PERIOD 14
set_kv GSAXO_ER_TREND_MIN 0.30
set_kv GSAXO_TREND_AUTO true
set_kv GSAXO_META_LEAGUE_AUTO true

echo "=== G-SAXO .env.server（サーバー専用・Mac同期対象外）==="
grep -E '^(SAXO_ACCOUNT_KEY|GSAXO_(DRY_RUN|INCLUDE_INDEX|EXCLUDE_HEAVY_FX|PAPER_JPY|MAX_OPEN_POSITIONS|DAILY_STOP_COOLDOWN_HOURS|H1_STOP_|VOL_SPIKE|H1_VOL_SPIKE|TREND_FILTER|TREND_AUTO|META_LEAGUE|ADX_|ER_))=' "$ENV_SERVER"
echo ""
echo "次: pm2 restart gsaxo --update-env"
