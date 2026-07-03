#!/usr/bin/env node
/**
 * Saxo infoprices から G-SAXO 対象銘柄の Bid-Ask スプレッドを取得し data/gsaxo-spreads.json に保存
 *
 *   npm run gsaxo:fetch-spreads
 *   npm run gsaxo:fetch-spreads -- --only=usd_cad,eur_usd
 */
import { loadGsaxoConfig } from './lib/gsaxo-config.mjs';
import {
  fetchAllSpreads_,
  formatSpreadCacheSnippet_,
  gsaxoGetActivePairIdsForSpreads_,
} from './lib/gsaxo-spread.mjs';
import { gsaxoModeLabel_ } from './lib/gsaxo-instruments.mjs';
import {
  getSessionUser,
  resolveAccountKey,
  resolveSaxoConfig,
} from './lib/saxo.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.split('=')[1] || '';
  return { pairFilter: only };
}

async function main() {
  const { pairFilter } = parseArgs();
  const saxoCfg = await resolveSaxoConfig();
  const gsaxoCfg = loadGsaxoConfig();
  const pairIds = gsaxoGetActivePairIdsForSpreads_(pairFilter);

  console.log('=== G-SAXO スプレッド取得 (Saxo infoprices) ===');
  console.log(`モード: ${gsaxoModeLabel_(gsaxoCfg)}`);
  console.log(`認証: ${saxoCfg.authMode}`);
  console.log(`銘柄数: ${pairIds.length}`);
  console.log('');

  await getSessionUser(saxoCfg);
  const accountKey = await resolveAccountKey(saxoCfg);
  console.log(`AccountKey: ${accountKey}`);
  console.log('');

  const { cache, path, errors } = await fetchAllSpreads_(saxoCfg, accountKey, pairIds, {
    log: (msg) => console.log(msg),
    onProgress: (pairId, n, total) => process.stdout.write(`[${n}/${total}] `),
  });

  console.log('');
  console.log(`保存: ${path}`);
  console.log(`成功: ${Object.keys(cache.spreads).length}/${pairIds.length}`);
  if (errors.length) {
    console.log(`失敗: ${errors.length}`);
    for (const e of errors) console.log(`  ${e.pairId}: ${e.error}`);
  }
  console.log('');
  console.log('--- SAXO_JP_SPREAD_RATE 参考 (手動反映用) ---');
  console.log(formatSpreadCacheSnippet_(cache));

  if (errors.length && Object.keys(cache.spreads).length === 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('');
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
