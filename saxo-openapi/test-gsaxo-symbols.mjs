#!/usr/bin/env node
/**
 * G-SAXO 銘柄一括接続テスト（Simulation、既定25本リーン・指数なし）
 *
 *   npm run saxo:test:gsaxo
 *   npm run saxo:test:gsaxo -- --precheck
 */
import {
  buildMarketOrder,
  getMarketQuote,
  getSessionUser,
  loadSaxoConfig,
  pickOrderAmount,
  precheckOrder,
  resolveAccountKey,
  resolveInstrumentByDef,
  resolveSaxoConfig,
} from './lib/saxo.mjs';
import { loadGsaxoConfig } from './lib/gsaxo-config.mjs';
import {
  G_SAXO_INSTRUMENTS,
  gsaxoGetActivePairIds_,
  gsaxoModeLabel_,
} from './lib/gsaxo-instruments.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    precheck: args.includes('--precheck'),
    pairFilter: args
      .filter((a) => a.startsWith('--only='))
      .map((a) => a.split('=')[1])
      .join(','),
  };
}

function formatQuote(quote, source) {
  if (!quote) return '(quote なし)';
  const bid = quote.Bid ?? quote.BidPrice;
  const ask = quote.Ask ?? quote.AskPrice;
  const mid = quote.Mid ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
  const src = source === 'chart' ? ' (chart)' : '';
  const time = quote.Time ? ` @${quote.Time}` : '';
  return `Bid=${bid} Ask=${ask}${mid != null ? ` Mid=${mid}` : ''}${src}${time}`;
}

async function main() {
  const { precheck, pairFilter } = parseArgs();
  const saxoCfg = await resolveSaxoConfig();
  const gsaxoCfg = loadGsaxoConfig();
  const pairIds = gsaxoGetActivePairIds_(pairFilter || process.env.GSAXO_PAIRS, {
    includeIndex: gsaxoCfg.includeIndex,
    excludeHeavyFx: gsaxoCfg.excludeHeavyFx,
  });

  console.log('=== G-SAXO 銘柄一括テスト ===');
  console.log(`チーム: G-SAXO`);
  console.log(`モード: ${gsaxoModeLabel_(gsaxoCfg)}`);
  console.log(`認証: ${saxoCfg.authMode}`);
  console.log(`銘柄数: ${pairIds.length}`);
  console.log(`注文: ${precheck ? 'precheck' : 'なし（価格のみ）'}`);
  console.log('');

  await getSessionUser(saxoCfg);
  const accountKey = await resolveAccountKey(saxoCfg);
  console.log(`AccountKey: ${accountKey}`);
  console.log('');

  const results = [];
  let failed = 0;
  let skipped = 0;

  for (const pairId of pairIds) {
    const def = G_SAXO_INSTRUMENTS[pairId];
    process.stdout.write(`[${pairId}] ${def.label} … `);
    try {
      const inst = await resolveInstrumentByDef(saxoCfg, accountKey, def);
      let quote;
      let source;
      try {
        ({ quote, source } = await getMarketQuote(saxoCfg, accountKey, inst.uic, inst.assetType));
      } catch (e) {
        if (def.simUnavailable) {
          skipped += 1;
          console.log('SKIP (Simulation未提供)');
          console.log(
            `    ${inst.symbol} Uic=${inst.uic} ${inst.assetType} | 本番 LIVE 口座で有効化予定`
          );
          results.push({ pairId, ok: true, skipped: true, inst });
          continue;
        }
        throw e;
      }
      let precheckOk = null;

      if (precheck) {
        if (def.simUnavailable) {
          precheckOk = false;
        } else {
          const amount = pickOrderAmount(saxoCfg, inst.details);
          const order = buildMarketOrder({
            accountKey,
            uic: inst.uic,
            assetType: inst.assetType,
            amount,
            buySell: 'Buy',
          });
          const checked = await precheckOrder(saxoCfg, order);
          precheckOk = checked.PreCheckResult === 'Ok';
        }
      }

      console.log('OK');
      const tier = def.rangeTier ? ` tier=${def.rangeTier}` : '';
      console.log(
        `    ${inst.symbol} Uic=${inst.uic} ${inst.assetType}${tier} | ${formatQuote(quote, source)}` +
          (precheckOk != null ? ` | precheck=${precheckOk ? 'Ok' : 'NG'}` : '')
      );
      results.push({ pairId, ok: true, inst, quote, source });
    } catch (e) {
      failed += 1;
      console.log('NG');
      console.log(`    ${e.message || e}`);
      results.push({ pairId, ok: false, error: e.message || String(e) });
    }
  }

  console.log('');
  const ok = results.filter((r) => r.ok && !r.skipped).length;
  console.log(`完了: ${ok}/${results.length} 成功` + (skipped ? `, ${skipped} SKIP (Simulation)` : ''));
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('');
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
