#!/usr/bin/env node
/**
 * G-SAXO レンジBot
 *
 *   npm run gsaxo:run          # 1回実行
 *   npm run gsaxo:daemon       # 5分間隔で常駐
 *   npm run gsaxo:run -- --only=xauusd,us500
 */
import { gsaxoRunDaemon, gsaxoRunOnce } from './lib/gsaxo-runner.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    daemon: args.includes('--daemon'),
    pairFilter: args
      .filter((a) => a.startsWith('--only='))
      .map((a) => a.split('=')[1])
      .join(','),
  };
}

async function main() {
  const { daemon, pairFilter } = parseArgs();
  if (daemon) {
    await gsaxoRunDaemon();
    return;
  }
  const { errors } = await gsaxoRunOnce({ pairFilter: pairFilter || undefined });
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
