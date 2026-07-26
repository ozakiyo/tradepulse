#!/usr/bin/env node
/**
 * G-SAXO 損切時の相場を 1H チャートで確認
 *
 *   npm run gsaxo:stop-review
 *   npm run gsaxo:stop-review -- --daily-only --days=14
 *   npm run gsaxo:stop-review -- --list
 *   npm run gsaxo:stop-review -- --stops=data/stops-20260630-daily.json --yahoo --center --bars=48
 */
import { reloadRootEnv_ } from './lib/env.mjs';
import { gsaxoStopReview_ } from './lib/gsaxo-stop-review.mjs';

async function main() {
  reloadRootEnv_();
  await gsaxoStopReview_();
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
