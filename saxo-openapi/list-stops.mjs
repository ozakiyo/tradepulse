#!/usr/bin/env node
/**
 * 指定期間の損切取引一覧（gsaxo-trades.jsonl）
 *
 *   node saxo-openapi/list-stops.mjs
 *   node saxo-openapi/list-stops.mjs --from=2026-06-30 --to=2026-07-01
 *   node saxo-openapi/list-stops.mjs --from=2026-06-30 --daily-only
 */
import { readAllTradeRows_ } from './lib/trade-log.mjs';
import { isDailyStopRow_, isStopTradeRow_ } from './lib/gsaxo-stop-review.mjs';

function parseArgs(argv) {
  const get = (key) => {
    const hit = argv.find((a) => a.startsWith(`--${key}=`));
    return hit ? hit.split('=').slice(1).join('=') : null;
  };
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  return {
    from: get('from') || today,
    to: get('to') || get('from') || today,
    dailyOnly: argv.includes('--daily-only'),
  };
}

function inRangeJst_(timeStr, from, to) {
  const d = timeStr.slice(0, 10);
  return d >= from && d <= to;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rows = await readAllTradeRows_();
  let stops = rows.filter(isStopTradeRow_);
  if (opts.dailyOnly) stops = stops.filter(isDailyStopRow_);
  stops = stops.filter((r) => inRangeJst_(r.time, opts.from, opts.to));
  stops.sort((a, b) => a.time.localeCompare(b.time));

  const label = opts.dailyOnly ? '日足損切' : '損切';
  console.log(`=== G-SAXO ${label} ${opts.from} 〜 ${opts.to} ===`);
  console.log(`件数: ${stops.length}`);
  console.log('');
  if (!stops.length) {
    console.log('（該当なし — サーバーでは cd /opt/tradePulseNode して実行してください）');
    return;
  }
  console.log('時刻(JST)          銘柄        方向          価格      数量   memo');
  console.log('-'.repeat(88));
  for (const s of stops) {
    console.log(
      `${s.time}  ${(s.symbol || s.pairId).padEnd(10)}  ${String(s.side).padEnd(12)}  ` +
        `${String(s.price).padEnd(10)}  ${String(s.amount).padEnd(5)}  ${s.memo}`
    );
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
