#!/usr/bin/env node
/**
 * G-SAXO 日次レポート → META_統合レポート
 *
 *   npm run gsaxo:report
 *   npm run gsaxo:meta:test
 */
import { reloadRootEnv_ } from './lib/env.mjs';
import { gsaxoRunReport_ } from './lib/gsaxo-report.mjs';
import { testMetaConnection_ } from './lib/meta-sheets.mjs';

const testOnly = process.argv.includes('--test');

async function main() {
  reloadRootEnv_();
  if (testOnly) {
    console.log('META接続テスト中…（最大30秒）');
    const info = await testMetaConnection_();
    console.log(`META接続OK: ${info.title}`);
    console.log(`URL: ${info.url}`);
    return;
  }
  await gsaxoRunReport_();
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
