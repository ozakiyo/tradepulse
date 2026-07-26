#!/usr/bin/env node
/**
 * Saxo OpenAPI Simulation 接続テスト
 * 認証 → 口座 → ティッカー → 紙トレ（precheck または sim 注文）
 *
 * 使い方:
 *   1. https://developer.saxobank.com/openapi/ で Simulation アカウント作成
 *   2. OpenAPI token（24h）を .env の SAXO_ACCESS_TOKEN に設定
 *   3. npm run saxo:test
 *
 * オプション:
 *   --symbol=XAUUSD
 *   --mode=precheck|sim|skip
 */
import {
  buildMarketOrder,
  getInfoPrice,
  getSessionUser,
  listAccounts,
  loadSaxoConfig,
  pickOrderAmount,
  placeSimOrder,
  precheckOrder,
  resolveAccountKey,
  resolveInstrument,
  resolveSaxoConfig,
} from './lib/saxo.mjs';

function applyCliOverrides(cfg) {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--symbol=')) cfg.symbol = arg.split('=')[1].trim().toUpperCase();
    if (arg.startsWith('--mode=')) cfg.orderMode = arg.split('=')[1].trim().toLowerCase();
    if (arg.startsWith('--amount=')) cfg.orderAmount = Number(arg.split('=')[1]);
  }
  return cfg;
}

function formatQuote(quote) {
  if (!quote) return '(quote なし)';
  const bid = quote.Bid ?? quote.BidPrice;
  const ask = quote.Ask ?? quote.AskPrice;
  const mid = quote.Mid ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
  return `Bid=${bid} Ask=${ask}${mid != null ? ` Mid=${mid}` : ''}`;
}

async function main() {
  const cfg = applyCliOverrides(await resolveSaxoConfig(loadSaxoConfig()));
  const isSim = cfg.baseUrl.includes('/sim/');

  console.log('=== Saxo OpenAPI 接続テスト ===');
  console.log(`環境: ${isSim ? 'Simulation (紙トレ)' : 'LIVE ⚠'}`);
  console.log(`API: ${cfg.baseUrl}`);
  console.log(`認証: ${cfg.authMode}`);
  console.log(`銘柄: ${cfg.symbol}`);
  console.log(`注文モード: ${cfg.orderMode}`);
  console.log('');

  console.log('[1/4] 認証 …');
  const user = await getSessionUser(cfg);
  console.log(`  OK UserKey=${user.UserKey} Name=${user.Name || '(n/a)'}`);
  console.log('');

  console.log('[2/4] 口座 …');
  const accounts = await listAccounts(cfg);
  const accountKey = await resolveAccountKey(cfg);
  const account = accounts.find((a) => a.AccountKey === accountKey) || accounts[0];
  console.log(`  口座数: ${accounts.length}`);
  console.log(
    `  使用 AccountKey=${accountKey} Id=${account?.AccountId || '?'} Currency=${account?.Currency || '?'} Trial=${account?.IsTrialAccount ?? '?'}`
  );
  console.log('');

  console.log('[3/4] ティッカー …');
  const inst = await resolveInstrument(cfg, accountKey);
  const price = await getInfoPrice(cfg, accountKey, inst.uic, inst.assetType);
  const quote = price.Quote || price;
  console.log(`  ${inst.symbol} Uic=${inst.uic} AssetType=${inst.assetType}`);
  console.log(`  ${formatQuote(quote)}`);
  if (price.DelayedByMinutes != null) {
    console.log(`  DelayedByMinutes=${price.DelayedByMinutes}`);
  }
  console.log('');

  console.log('[4/4] 紙トレ注文 …');
  if (cfg.orderMode === 'skip') {
    console.log('  スキップ (SAXO_ORDER_MODE=skip)');
    return;
  }

  const amount = pickOrderAmount(cfg, inst.details);
  const order = buildMarketOrder({
    accountKey,
    uic: inst.uic,
    assetType: inst.assetType,
    amount,
    buySell: 'Buy',
  });

  if (cfg.orderMode === 'sim') {
    if (!isSim) {
      throw new Error('本番環境では sim 注文は拒否しました。Simulation の SAXO_API_BASE を使用してください。');
    }
    console.log(`  POST /trade/v2/orders  Amount=${amount} Buy`);
    const placed = await placeSimOrder(cfg, order);
    console.log('  OK シミュレーション約定リクエスト送信');
    console.log(JSON.stringify(placed, null, 2));
    return;
  }

  if (cfg.orderMode !== 'precheck') {
    throw new Error(`不明な SAXO_ORDER_MODE: ${cfg.orderMode} （precheck | sim | skip）`);
  }

  console.log(`  POST /trade/v2/orders/precheck  Amount=${amount} Buy`);
  const checked = await precheckOrder(cfg, order);
  console.log('  OK プリチェック成功（実注文は未送信）');
  if (checked.Cost) {
    console.log(`  Cost: ${JSON.stringify(checked.Cost)}`);
  }
  if (checked.EstimatedPriceDistanceToMarket != null) {
    console.log(`  EstimatedPriceDistanceToMarket: ${checked.EstimatedPriceDistanceToMarket}`);
  }
  console.log(JSON.stringify(checked, null, 2));

  console.log('');
  console.log('完了。Simulation で実際に建玉を作る場合: SAXO_ORDER_MODE=sim npm run saxo:test');
}

main().catch((e) => {
  console.error('');
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
