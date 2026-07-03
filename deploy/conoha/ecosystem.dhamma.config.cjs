const path = require('path');

/**
 * ダンマ指針アプリ専用 pm2 設定
 *
 * 使い方（/opt/dhamma または /opt/tradePulseNode 内）:
 *   pm2 start deploy/conoha/ecosystem.dhamma.config.cjs
 *
 * ※ gsaxo / articleappNode には一切触れない。プロセス名は dhamma のみ。
 */
module.exports = {
  apps: [
    {
      name: 'dhamma',
      cwd: path.join(__dirname, '../..'),
      script: 'deploy/conoha/dhamma-serve.mjs',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      out_file: path.join(__dirname, '../../logs/dhamma-out.log'),
      error_file: path.join(__dirname, '../../logs/dhamma-err.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        DHAMMA_PORT: '3053',
        DHAMMA_ROOT: '/opt/dhamma',
      },
    },
  ],
};
