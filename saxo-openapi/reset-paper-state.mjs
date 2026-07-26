#!/usr/bin/env node
/**
 * G-SAXO 紙トレ状態を初期化（本番切替用）
 *
 *   npm run gsaxo:reset-state              # 確認のみ（変更なし）
 *   npm run gsaxo:reset-state -- --confirm # 実行
 */
import { mkdir, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { loadGsaxoConfig } from './lib/gsaxo-config.mjs';
import { gsaxoStatePath_ } from './lib/gsaxo-state.mjs';

const TRADES_PATH = process.env.GSAXO_TRADES_PATH?.trim() || 'data/gsaxo-trades.jsonl';

function stamp_() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .format(new Date())
    .replace(/[:\s]/g, '-');
}

async function archiveIfExists_(path, suffix) {
  try {
    const archived = `${path}.${suffix}`;
    await rename(path, archived);
    return archived;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const cfg = loadGsaxoConfig();
  const statePath = gsaxoStatePath_();
  const initial = cfg.paperJpyDefault;

  console.log('=== G-SAXO 状態リセット ===');
  console.log(`状態ファイル: ${statePath}`);
  console.log(`売買履歴: ${TRADES_PATH}`);
  console.log(`dryRun: ${cfg.dryRun}`);
  if (cfg.dryRun) console.log(`初期資金: ${initial.toLocaleString()} 円`);
  console.log(`モード: includeIndex=${cfg.includeIndex} excludeHeavyFx=${cfg.excludeHeavyFx}`);
  console.log(`同時建玉上限: ${cfg.maxOpenPositions}`);
  console.log('');

  if (!confirm) {
    console.log('※ 変更は行いません。実行する場合:');
    console.log('  npm run gsaxo:reset-state -- --confirm');
    process.exit(0);
  }

  const suffix = stamp_();
  await mkdir(dirname(statePath), { recursive: true });
  await mkdir(dirname(TRADES_PATH), { recursive: true });

  const archivedState = await archiveIfExists_(statePath, `bak-${suffix}`);
  const archivedTrades = await archiveIfExists_(TRADES_PATH, `bak-${suffix}`);

  const fresh = {
    pairs: {},
    resolved: {},
    lastRunAt: null,
    lastError: null,
  };
  if (cfg.dryRun) {
    fresh.paperWallet = { jpy: initial, initial, reserved: 0 };
  }
  await writeFile(statePath, JSON.stringify(fresh, null, 2), 'utf8');
  await writeFile(TRADES_PATH, '', 'utf8');

  console.log('完了。');
  if (archivedState) console.log(`  旧 state → ${archivedState}`);
  if (archivedTrades) console.log(`  旧 trades → ${archivedTrades}`);
  if (cfg.dryRun) {
    console.log(`  新 state: 建玉0・現金 ${initial.toLocaleString()} 円`);
  } else {
    console.log('  新 state: ローカル建玉0（Saxo口座の実建玉はそのまま・起動時に同期）');
  }
  console.log('');
  console.log('次: pm2 restart gsaxo --update-env');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
