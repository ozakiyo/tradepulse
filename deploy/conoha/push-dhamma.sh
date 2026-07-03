#!/usr/bin/env bash
# ダンマ指針アプリのみ ConoHa に同期（G-SAXO / articleappNode には触れない）
#
#   bash deploy/conoha/push-dhamma.sh root@160.251.173.118
#
# 配置先: /opt/dhamma（tradePulseNode とは別フォルダ）
# pm2: プロセス名 dhamma のみ（gsaxo は再起動しない）
set -euo pipefail

DEST="${1:?使い方: bash deploy/conoha/push-dhamma.sh ユーザー@サーバーIP}"
REMOTE_DIR="${2:-/opt/dhamma}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

SSH_CTL="${TMPDIR:-/tmp}/dhamma-ssh-%r@%h:%p"
SSH_OPTS=(
  -o ControlMaster=auto
  -o "ControlPath=${SSH_CTL}"
  -o ControlPersist=120
)

cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "$DEST" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== ダンマ指針アプリ同期 → ${DEST} ==="
echo "※ /opt/tradePulseNode・articleappNode・gsaxo には触れません"

node "${REPO_ROOT}/scripts/validate-dhamma-json.mjs"

ssh "${SSH_OPTS[@]}" "$DEST" "mkdir -p ${REMOTE_DIR}/data ${REMOTE_DIR}/logs"

rsync -avz --delete -e "ssh ${SSH_OPTS[*]}" \
  "${REPO_ROOT}/public/dhamma/" \
  "${DEST}:${REMOTE_DIR}/"

# pm2 用ファイル（tradePulseNode 側に置き、DHAMMA_ROOT で /opt/dhamma を指す）
ssh "${SSH_OPTS[@]}" "$DEST" "mkdir -p /opt/tradePulseNode/deploy/conoha /opt/tradePulseNode/logs"
rsync -avz -e "ssh ${SSH_OPTS[*]}" \
  "${REPO_ROOT}/deploy/conoha/dhamma-serve.mjs" \
  "${REPO_ROOT}/deploy/conoha/ecosystem.dhamma.config.cjs" \
  "${DEST}:/opt/tradePulseNode/deploy/conoha/"

echo ""
echo "完了。次（サーバー上）:"
echo "  ssh ${DEST}"
echo "  pm2 describe dhamma >/dev/null 2>&1 && pm2 restart dhamma || pm2 start /opt/tradePulseNode/deploy/conoha/ecosystem.dhamma.config.cjs"
echo "  pm2 save"
echo ""
echo "アクセス: http://サーバーIP:3053/"
echo "※ ConoHa ファイアウォールで TCP 3053 を開くか、nginx で別パスにプロキシ"
