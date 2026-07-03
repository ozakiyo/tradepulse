#!/usr/bin/env node
/**
 * 損切ウォッチを state から手動解除
 *
 *   npm run gsaxo:clear-watch -- eur_aud aud_usd           # 確認のみ
 *   npm run gsaxo:clear-watch -- eur_aud aud_usd --confirm # 実行
 */
import { readFile } from 'fs/promises';
import { clearTrendStopWatch_ } from './lib/trend-stop-watch.mjs';
import { gsaxoStatePath_, saveGsaxoState } from './lib/gsaxo-state.mjs';

function parsePairIds_(argv) {
  const ids = [];
  for (const a of argv.slice(2)) {
    if (a === '--confirm') continue;
    if (a.startsWith('--')) {
      throw new Error(`不明な引数: ${a}`);
    }
    ids.push(a.trim().toLowerCase());
  }
  return ids;
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const pairIds = parsePairIds_(process.argv);
  if (!pairIds.length) {
    console.error('使い方: npm run gsaxo:clear-watch -- <pairId> [pairId ...] [--confirm]');
    process.exit(1);
  }

  const path = gsaxoStatePath_();
  const raw = await readFile(path, 'utf8');
  const state = JSON.parse(raw);

  console.log('=== 損切ウォッチ解除 ===');
  console.log(`state: ${path}`);
  console.log('');

  for (const pairId of pairIds) {
    const ps = state.pairs?.[pairId];
    if (!ps) {
      console.log(`${pairId}: ペア state なし → スキップ`);
      continue;
    }
    const w = ps.trendStopWatch;
    if (!w?.active) {
      console.log(`${pairId}: ウォッチなし → スキップ`);
      continue;
    }
    console.log(
      `${pairId}: 解除予定 方向=${w.expectedSide} ` +
        `旧L=${w.refDailyLow} H=${w.refDailyHigh}`
    );
    if (confirm) {
      clearTrendStopWatch_(ps, {
        log: (msg) => console.log(msg),
        pairId,
        reason: 'manual',
      });
    }
  }

  if (!confirm) {
    console.log('');
    console.log('※ 変更は行いません。実行例:');
    console.log(`  npm run gsaxo:clear-watch -- ${pairIds.join(' ')} --confirm`);
    process.exit(0);
  }

  await saveGsaxoState(state);
  console.log('');
  console.log('完了。次: pm2 restart gsaxo --update-env');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
