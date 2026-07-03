#!/usr/bin/env node
/**
 * 損切ウォッチを state に手動復元（消失バグ対応・ログ値から復旧）
 *
 *   npm run gsaxo:restore-watch              # 確認のみ
 *   npm run gsaxo:restore-watch -- --confirm # 実行
 */
import { readFile } from 'fs/promises';
import { loadGsaxoConfig } from './lib/gsaxo-config.mjs';
import { gsaxoStatePath_, saveGsaxoState } from './lib/gsaxo-state.mjs';

/** 6/30 朝ログから復元（損切ウォッチ開始行） */
const RESTORE_FROM_LOG = [
  {
    pairId: 'eur_aud',
    triggeredAt: '2026-06-29T21:06:00.062Z',
    stoppedSide: 'short',
    expectedSide: 'long',
    stopPrice: 1.65885,
    refDailyLow: 1.61767,
    refDailyHigh: 1.66061,
  },
  {
    pairId: 'aud_usd',
    triggeredAt: '2026-06-30T00:30:37.062Z',
    stoppedSide: 'long',
    expectedSide: 'short',
    stopPrice: 0.68736,
    refDailyLow: 0.68735,
    refDailyHigh: 0.71833,
  },
];

function buildWatch_(row, hours) {
  const triggeredMs = Date.parse(row.triggeredAt);
  return {
    active: true,
    triggeredAt: row.triggeredAt,
    until: triggeredMs + hours * 3600000,
    stoppedSide: row.stoppedSide,
    expectedSide: row.expectedSide,
    stopPrice: row.stopPrice,
    refDailyHigh: row.refDailyHigh,
    refDailyLow: row.refDailyLow,
    refWidthPct: null,
  };
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const cfg = loadGsaxoConfig();
  const hours = cfg.trendStopWatchHours ?? 48;
  const path = gsaxoStatePath_();
  const raw = await readFile(path, 'utf8');
  const state = JSON.parse(raw);

  console.log('=== 損切ウォッチ復元 ===');
  console.log(`state: ${path}`);
  console.log(`watchHours: ${hours}`);
  console.log('');

  for (const row of RESTORE_FROM_LOG) {
    const ps = state.pairs?.[row.pairId] || {};
    const cur = ps.trendStopWatch;
    const next = buildWatch_(row, hours);
    const untilJst = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(next.until));
    console.log(
      `${row.pairId}: ${cur?.active ? '既存ウォッチあり → 上書き' : 'なし → 復元'} ` +
        `方向=${next.expectedSide} until≈${untilJst} JST`
    );
    if (!state.pairs) state.pairs = {};
    if (!state.pairs[row.pairId]) state.pairs[row.pairId] = {};
    state.pairs[row.pairId].trendStopWatch = next;
  }

  if (!confirm) {
    console.log('');
    console.log('※ 変更は行いません。実行: npm run gsaxo:restore-watch -- --confirm');
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
