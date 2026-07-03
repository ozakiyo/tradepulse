const path = require('path');

const appRoot = path.join(__dirname, '../..');

/**
 * pm2 — /opt/tradePulseNode で実行:
 *   pm2 start deploy/conoha/ecosystem.config.cjs
 *
 * プロセス名 gsaxo のみ。articleappNode 等の他 pm2 アプリには触れない。
 */
module.exports = {
  apps: [
    {
      name: 'gsaxo',
      cwd: appRoot,
      script: 'saxo-openapi/run-gsaxo.mjs',
      args: '--daemon',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '30s',
      out_file: path.join(appRoot, 'logs/gsaxo-out.log'),
      error_file: path.join(appRoot, 'logs/gsaxo-err.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
