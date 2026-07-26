#!/usr/bin/env bash
# G-SAXO 本番切替（/opt/tradePulseNode で実行）
#   bash deploy/conoha/go-live.sh          # 確認のみ
#   bash deploy/conoha/go-live.sh --go     # リセット＋再起動
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_ROOT"
GO=false
[[ "${1:-}" == "--go" ]] && GO=true

echo "=== G-SAXO 本番切替チェック ==="
echo "作業: ${APP_ROOT}"
echo ""

if [[ ! -f .env ]]; then
  echo "ERROR: .env がありません"
  exit 1
fi

for key in SAXO_API_BASE; do
  if ! grep -q "^${key}=." .env; then
    echo "ERROR: .env に ${key} がありません"
    exit 1
  fi
done

if grep -q '^SAXO_APP_KEY=.' .env; then
  if [[ ! -f data/saxo-oauth-tokens.json ]]; then
    echo "ERROR: OAuth モードですが data/saxo-oauth-tokens.json がありません"
    echo "  npm run saxo:oauth:import -- --file=tokens.json"
    exit 1
  fi
elif ! grep -q '^SAXO_ACCESS_TOKEN=.' .env; then
  echo "ERROR: SAXO_ACCESS_TOKEN または SAXO_APP_KEY が必要です"
  exit 1
fi

echo "[.env]"
node -e "
import { loadGsaxoConfig } from './saxo-openapi/lib/gsaxo-config.mjs';
import { gsaxoModeLabel_ } from './saxo-openapi/lib/gsaxo-instruments.mjs';
const c = loadGsaxoConfig();
console.log('  mode=' + gsaxoModeLabel_(c));
console.log('  GSAXO_PAPER_JPY=' + c.paperJpyDefault);
console.log('  GSAXO_MAX_OPEN_POSITIONS=' + c.maxOpenPositions);
console.log('  GSAXO_DRY_RUN=' + c.dryRun);
"
echo ""

echo "[1/4] Saxo 接続テスト…"
if grep -q '^SAXO_APP_KEY=.' .env; then
  npm run saxo:oauth:test
else
  npm run saxo:test:gsaxo -- --precheck
fi

if grep -q '^GSAXO_META_WEBAPP_URL=.' .env && grep -q '^GSAXO_META_SECRET=.' .env; then
  echo ""
  echo "[2/4] META 接続テスト…"
  npm run gsaxo:meta:test
else
  echo ""
  echo "[2/4] META 未設定（スキップ）"
fi

PM2_WAS_RUNNING=false
if command -v pm2 >/dev/null 2>&1 && pm2 describe gsaxo >/dev/null 2>&1; then
  PM2_WAS_RUNNING=true
  echo ""
  echo "pm2 gsaxo を一時停止（API レート制限回避）…"
  pm2 stop gsaxo
fi

echo ""
echo "[3/4] 1回実行テスト…"
npm run gsaxo:run

if ! $GO; then
  if $PM2_WAS_RUNNING && command -v pm2 >/dev/null 2>&1; then
    pm2 restart gsaxo --update-env
    echo "pm2 gsaxo を再開しました"
  fi
  echo ""
  echo "確認完了。本番切替（状態リセット＋pm2再起動）:"
  echo "  bash deploy/conoha/go-live.sh --go"
  if node -e "import { loadGsaxoConfig } from './saxo-openapi/lib/gsaxo-config.mjs'; process.exit(loadGsaxoConfig().dryRun ? 0 : 1)"; then
    echo ""
    echo "※ 実発注するには .env で GSAXO_DRY_RUN=false を設定してください"
  fi
  exit 0
fi

if node -e "import { loadGsaxoConfig } from './saxo-openapi/lib/gsaxo-config.mjs'; process.exit(loadGsaxoConfig().dryRun ? 1 : 0)"; then
  echo ""
  echo "ERROR: GSAXO_DRY_RUN が true のままです。実発注するには .env で GSAXO_DRY_RUN=false"
  exit 1
fi

echo ""
echo "⚠  実発注モード（GSAXO_DRY_RUN=false）で切替します"
echo ""
echo "[4/4] 状態リセット…"
npm run gsaxo:reset-state -- --confirm

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe gsaxo >/dev/null 2>&1; then
    pm2 restart gsaxo --update-env
  elif $PM2_WAS_RUNNING; then
    pm2 start gsaxo --update-env
  else
    pm2 start deploy/conoha/ecosystem.config.cjs
  fi
  echo ""
  pm2 logs gsaxo --lines 8 --nostream
else
  echo "pm2 なし。手動で gsaxo を再起動してください。"
fi

echo ""
echo "本番切替完了。"
echo "※ OAuth モードならトークンは自動更新（24h 手動更新不要）"
