#!/usr/bin/env bash
# Mac から ConoHa へ G-SAXO 関連を /opt/tradePulseNode に同期（上書き OK）
# articleappNode フォルダには触れない
#
#   bash deploy/conoha/push-from-mac.sh root@160.251.173.118
#   bash deploy/conoha/push-from-mac.sh ユーザー@サーバーIP /opt/tradePulseNode
#
# パスワードは原則1回（SSH鍵登録済みなら不要）:
#   ssh-copy-id ユーザー@サーバーIP
set -euo pipefail

DEST="${1:?使い方: bash deploy/conoha/push-from-mac.sh ユーザー@サーバーIP [リモートDir]}"
REMOTE_DIR="${2:-/opt/tradePulseNode}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# 接続を再利用してパスワード入力を1回に抑える
SSH_CTL="${TMPDIR:-/tmp}/gsaxo-ssh-%r@%h:%p"
SSH_OPTS=(
  -o ControlMaster=auto
  -o "ControlPath=${SSH_CTL}"
  -o ControlPersist=120
)

cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "$DEST" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== G-SAXO 同期 → ${DEST}:${REMOTE_DIR}（上書き） ==="
echo "※ articleappNode には触れません"

ssh "${SSH_OPTS[@]}" "$DEST" "mkdir -p ${REMOTE_DIR}/data ${REMOTE_DIR}/logs ${REMOTE_DIR}/deploy/conoha"

# --relative で deploy/conoha → .../deploy/conoha/ を維持（conoha/ 直下に落ちない）
cd "$REPO_ROOT"
rsync -avz --relative -e "ssh ${SSH_OPTS[*]}" \
  package.json \
  package-lock.json \
  saxo-openapi \
  deploy/conoha \
  "${DEST}:${REMOTE_DIR}/"

# .env.server は Mac から送らない。サーバー専用設定を維持・再適用
ssh "${SSH_OPTS[@]}" "$DEST" "cd ${REMOTE_DIR} && bash deploy/conoha/enable-live-env.sh"

echo ""
echo "完了。次（サーバー上）:"
echo "  ssh ${DEST}"
echo "  cd ${REMOTE_DIR} && bash deploy/conoha/setup.sh"
echo "  pm2 restart gsaxo --update-env"
echo ""
echo "※ .env.server（口座・本番設定）は同期しません。Mac から scp するのは .env のみ:"
echo "  scp -o ControlPath=${SSH_CTL} .env ${DEST}:${REMOTE_DIR}/.env"
echo "  scp -o ControlPath=${SSH_CTL} data/saxo-oauth-tokens.json ${DEST}:${REMOTE_DIR}/data/  # OAuth時"
