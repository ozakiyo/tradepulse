#!/usr/bin/env bash
# G-SAXO 初回セットアップ（/opt/tradePulseNode 内のみ。articleappNode には触れない）
# 使い方: cd /opt/tradePulseNode && bash deploy/conoha/setup.sh
set -euo pipefail

echo "=== G-SAXO セットアップ（隔離インストール）==="

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node が見つかりません。"
  echo "articleappNode 等で既に入っているはずです。PATH を確認してください。"
  echo "（このスクリプトは Node のバージョン変更・システム更新は行いません）"
  exit 1
fi

echo "Node: $(node -v)  npm: $(npm -v)（既存環境を共有）"

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_ROOT"

echo "作業ディレクトリ: ${APP_ROOT}"
echo "依存関係インストール（このフォルダの node_modules のみ）..."
npm ci --omit=dev

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 が未インストールです。グローバルに追加します（既存 pm2 プロセスは停止しません）。"
  npm install -g pm2
else
  echo "pm2: 既存を利用（pm2 list で articleappNode 等と併存）"
fi

if [[ ! -f .env ]]; then
  echo ""
  echo "⚠️  .env がありません。Mac から scp してください。"
  echo "   必須: SAXO_ACCESS_TOKEN, GSAXO_META_WEBAPP_URL, GSAXO_META_SECRET"
fi

if [[ ! -f .env.server ]]; then
  echo ""
  echo "本番サーバー: bash deploy/conoha/enable-live-env.sh で .env.server を作成してください"
fi

mkdir -p data logs

echo ""
echo "=== 次のステップ ==="
echo "1. .env を配置"
echo "2. npm run saxo:test:gsaxo && npm run gsaxo:meta:test"
echo "3. pm2 start deploy/conoha/ecosystem.config.cjs   # プロセス名 gsaxo のみ起動"
echo "4. pm2 save   # 既存プロセスと一緒に保存（pm2 delete all は禁止）"
echo ""
echo "詳細: deploy/conoha/README.md"
