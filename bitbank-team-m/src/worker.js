/**
 * Team-M worker: 最大3建玉・エネルギー＋AI入出・決済学習。
 */
import { loadConfig, DEFAULT_CRASH_PARAMS } from './config.js';
import {
  openDb,
  listOpenBotPositions,
  getCrashState,
  getCrashParams,
  getKv,
  setKv,
  insertBotPosition,
  closeBotPosition,
  updateBotPositionMeta,
  insertEpisode,
} from './db/sqlite.js';
import { BitbankClient } from './bitbank/client.js';
import { refreshBuyRankIfNeeded, selectTradeSlots, getCachedBuyRank } from './pairs/rankBuy.js';
import { computeMetrics } from './crash/metrics.js';
import { assessDirectionalEnergy } from './pairs/energy.js';
import { judgeEntry, judgeExit } from './ai/swingJudge.js';
import {
  energyPolicyFromExit,
  ensureAsymmetricExitPolicy,
  getExitPolicy,
} from './learn/exitPolicy.js';
import { maybeLearnExits } from './learn/reviewExits.js';
import { getEntryPolicy, passesEntryPolicyGate } from './learn/entryPolicy.js';
import { maybeLearnEntries } from './learn/reviewEntries.js';
import { adversePct, reverseEnergyAllowsCutNow } from './risk/scratch.js';
import { syncSheetsToWebApp } from './ledger/sheetsSync.js';
import {
  ensureLedgerTables,
  recordOpsProfit,
  recordTradeFill,
} from './ledger/sheetsExport.js';

function log(msg) {
  console.log(`[M][${new Date().toISOString()}] ${msg}`);
}

function kvSwingAt(pair) {
  return `last_swing_ai_at_${String(pair || '').toLowerCase()}`;
}

function swingAiIntervalMs(cfg, db, energy) {
  const normal = Number(cfg.swingAiIntervalMs) || 15 * 60 * 1000;
  const urgent = Number(cfg.swingAiUrgentIntervalMs) || 5 * 60 * 1000;
  const revUrgent =
    energy?.reverse?.intensity === 'strong' || reverseEnergyAllowsCutNow(energy, getExitPolicy(db), 0.7);
  return revUrgent ? Math.min(normal, urgent) : normal;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function unrealizedPnlJpy(side, amount, entry, last) {
  const a = Number(amount);
  const e = Number(entry);
  const x = Number(last);
  if (![a, e, x].every(Number.isFinite)) return null;
  if (side === 'sell') return (e - x) * a;
  return (x - e) * a;
}

function pnlPct(side, entry, exit) {
  const e = Number(entry);
  const x = Number(exit);
  if (![e, x].every(Number.isFinite) || e <= 0) return null;
  return side === 'sell' ? (e - x) / e : (x - e) / e;
}

function passesHardEntryGate(metrics) {
  if (!metrics) return false;
  if (!(Number(metrics.last) >= Number(metrics.sma20))) return false;
  if (metrics.smaSlopeNeg) return false;
  return true;
}

function pairEnergyContext(db, { pair, metrics, candles, entry, last, unrealizedPnl }) {
  const rank = getCachedBuyRank(db);
  const st = (rank?.universeStatus || []).find(
    (x) => String(x.pair || '').toLowerCase() === String(pair || '').toLowerCase()
  );
  const topHit = (rank?.top || []).find(
    (x) => String(x.pair || '').toLowerCase() === String(pair || '').toLowerCase()
  );
  const energy = assessDirectionalEnergy({
    side: 'buy',
    metrics,
    candles,
    dailyDir: st?.dailyDir || topHit?.dailyDir,
    h4Dir: st?.h4Dir || topHit?.h4Dir,
    regime: st?.regime || topHit?.regime,
    entry,
    last,
    unrealizedPnl,
    policy: energyPolicyFromExit(getExitPolicy(db)),
  });
  try {
    setKv(db, `last_energy_${String(pair).toLowerCase()}`, JSON.stringify(energy));
  } catch {
    /* ignore */
  }
  return energy;
}

function lastEnergySnapshot(db, pair) {
  try {
    const raw = getKv(db, `last_energy_${String(pair).toLowerCase()}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function closeBotLong(deps, pos, reason, exitPrice = null) {
  const { cfg, db, bitbank } = deps;
  const pair = String(pos.pair).toLowerCase();
  const ticker = await bitbank.getTicker(pair);
  const px = exitPrice != null ? exitPrice : ticker.buy || ticker.last;
  const order = await bitbank.placeMarket(pair, 'sell', pos.amount, cfg.dryRun);
  const pnl = unrealizedPnlJpy('buy', pos.amount, pos.entry_price, px);
  const pct = pnlPct('buy', pos.entry_price, px);
  const energy = lastEnergySnapshot(db, pair);
  const sellOrderId = order?.order_id != null ? String(order.order_id) : null;
  const buyNotional = (Number(pos.entry_price) || 0) * (Number(pos.amount) || 0);
  const sellNotional = (Number(px) || 0) * (Number(pos.amount) || 0);
  const gross = sellNotional - buyNotional;
  const now = new Date().toISOString();

  closeBotPosition(db, pos.id, {
    reason,
    exitPrice: px,
    realizedPnl: pnl,
    sellOrderId,
    meta: { energy, pnlPct: pct, dryRun: !!cfg.dryRun },
  });
  recordTradeFill(db, {
    tradeId: `sell-${pos.id}-${sellOrderId || now}`,
    executedAt: now,
    pair,
    side: 'sell',
    price: px,
    amount: pos.amount,
    feeJpy: 0,
    orderId: sellOrderId,
  });
  recordOpsProfit(db, {
    settledAt: now,
    pair,
    buyPrice: pos.entry_price,
    sellPrice: px,
    amount: pos.amount,
    buyNotional,
    sellNotional,
    buyFee: 0,
    sellFee: 0,
    gross,
    net: pnl ?? gross,
    buyOrderId: pos.buy_order_id,
    sellOrderId,
    memo: cfg.dryRun ? `dry:${reason}` : reason,
  });
  insertEpisode(db, 'bot_close', {
    id: pos.id,
    pair,
    reason,
    amount: pos.amount,
    exitPrice: px,
    realizedPnl: pnl,
    pnlPct: pct,
    energy,
  });
  deps.sheetsSyncSoon = true;
  log(`CLOSED ${pair} reason=${reason} pnl≈${pnl != null ? pnl.toFixed(2) : '?'}J (${pct != null ? (pct * 100).toFixed(2) : '?'}%)`);
  await maybeLearnExits(cfg, db, log, { reason: 'after_close' }).catch((e) =>
    log(`exit learn: ${e.message}`)
  );
  await maybeLearnEntries(cfg, db, log, { reason: 'after_close' }).catch((e) =>
    log(`entry learn: ${e.message}`)
  );
}

async function openBotLong(deps, pair, price, energy) {
  const { cfg, db, bitbank } = deps;
  const lot = await bitbank.getMinLot(pair);
  const hardSlPct = Number(cfg.hardSlPct) || DEFAULT_CRASH_PARAMS.hardSlPct;
  const hardSl = price * (1 - hardSlPct);
  const order = await bitbank.placeLimit(pair, 'buy', price, lot, cfg.dryRun);
  const buyOrderId = order?.order_id != null ? String(order.order_id) : null;
  const now = new Date().toISOString();
  const id = insertBotPosition(db, {
    pair,
    amount: lot,
    entryPrice: price,
    hardSlPrice: hardSl,
    buyOrderId,
    note: cfg.dryRun ? 'dry_run' : null,
    meta: { energy, dryRun: !!cfg.dryRun, source: 'ai_entry' },
  });
  recordTradeFill(db, {
    tradeId: `buy-${id}-${buyOrderId || now}`,
    executedAt: now,
    pair,
    side: 'buy',
    price,
    amount: lot,
    feeJpy: 0,
    orderId: buyOrderId,
  });
  insertEpisode(db, 'bot_open', {
    id,
    pair,
    amount: lot,
    entryPrice: price,
    hardSlPrice: hardSl,
    energy,
    dryRun: !!cfg.dryRun,
  });
  deps.sheetsSyncSoon = true;
  log(`OPEN ${pair} amount=${lot} entry≈${price} hardSl≈${hardSl.toFixed(4)} dry=${cfg.dryRun} id=${id}`);
  return id;
}

async function maybeSyncSheets(deps, { force = false } = {}) {
  const { cfg, db } = deps;
  if (!cfg.sheetsWebappUrl || !cfg.sheetsSyncToken) {
    if (force) log('sheets sync skipped: URL/TOKEN 未設定');
    return;
  }
  const now = Date.now();
  const last = Number(getKv(db, 'last_sheets_sync_at') || deps.lastSheetsSyncAt || 0);
  const dueSoon = deps.sheetsSyncSoon;
  const hasOpen = listOpenBotPositions(db).length > 0;
  const interval = hasOpen
    ? cfg.sheetsOpenSyncIntervalMs || 15 * 60 * 1000
    : cfg.sheetsSyncIntervalMs || 12 * 3600000;
  if (!force && !dueSoon && now - last < interval) {
    return;
  }
  deps.lastSheetsSyncAt = now;
  deps.sheetsSyncSoon = false;
  setKv(db, 'last_sheets_sync_at', String(now));
  try {
    await syncSheetsToWebApp(cfg, db, log);
  } catch (e) {
    log(`sheets sync ERROR ${e.message || e}`);
  }
}

async function manageOpenPosition(deps, pos) {
  const { cfg, db, bitbank } = deps;
  const pair = String(pos.pair).toLowerCase();
  const h4 = await bitbank.getCandles4h(pair, 0);
  const candles = h4.slice(-48);
  const ticker = await bitbank.getTicker(pair);
  const last = ticker.last;
  const metrics = computeMetrics(candles, last, { barHours: 4 });
  const uPnL = unrealizedPnlJpy('buy', pos.amount, pos.entry_price, last);
  const energy = pairEnergyContext(db, {
    pair,
    metrics,
    candles,
    entry: pos.entry_price,
    last,
    unrealizedPnl: uPnL,
  });

  const maePrev = Number(JSON.parse(pos.meta_json || '{}').maePct);
  const adv = adversePct('buy', pos.entry_price, last);
  const maePct = Number.isFinite(adv) && adv > 0 ? Math.max(Number.isFinite(maePrev) ? maePrev : 0, adv) : maePrev;
  updateBotPositionMeta(db, pos.id, {
    lastEnergy: energy,
    lastPrice: last,
    unrealizedPnl: uPnL,
    maePct: Number.isFinite(maePct) ? maePct : undefined,
    updatedAt: new Date().toISOString(),
  });

  if (pos.hard_sl_price != null && last <= pos.hard_sl_price) {
    await closeBotLong(deps, pos, `hard_sl@${last}`, last);
    return;
  }

  const interval = swingAiIntervalMs(cfg, db, energy);
  const lastAi = Number(getKv(db, kvSwingAt(pair)) || 0);
  if (Date.now() - lastAi < interval) {
    return;
  }
  setKv(db, kvSwingAt(pair), String(Date.now()));

  const j = await judgeExit(cfg, db, {
    pair,
    side: 'buy',
    last,
    energy,
    metrics,
    position: pos,
    unrealizedPnlQuote: uPnL,
    maePct,
    aiGuide: energy.aiGuide,
  });
  log(
    `exit? ${pair} ${j.verdict}/${j.action}/${j.path || '-'} conf=${j.confidence} hyb=${energy.score} ${energy.alignment} | ${j.reason || ''}`
  );
  if (j.verdict === 'close' && j.action !== 'hold') {
    await closeBotLong(deps, pos, `ai_exit:${j.action}:${j.path || ''}:${j.reason || ''}`, last);
  }
}

async function tryEnterSlot(deps, slot) {
  const { cfg, db, bitbank } = deps;
  if (slot.source === 'open_position') return;
  const pair = slot.pair;
  if (!pair) return;
  if (listOpenBotPositions(db, pair).length) return;

  const lastAi = Number(getKv(db, kvSwingAt(pair)) || 0);
  const interval = Number(cfg.swingAiIntervalMs) || 15 * 60 * 1000;
  if (Date.now() - lastAi < interval) return;

  const h4 = await bitbank.getCandles4h(pair, 0);
  const candles = h4.slice(-48);
  const ticker = await bitbank.getTicker(pair);
  const last = ticker.sell || ticker.last;
  const metrics = computeMetrics(candles, last, { barHours: 4 });
  if (!passesHardEntryGate(metrics)) {
    log(`entry skip ${pair}: hard gate (SMA/slope)`);
    return;
  }
  const energy = pairEnergyContext(db, {
    pair,
    metrics,
    candles,
    last,
    unrealizedPnl: 0,
  });
  if (!String(energy.alignment || '').endsWith('with')) {
    log(`entry skip ${pair}: energy ${energy.alignment} hyb=${energy.score}`);
    return;
  }

  const entryPolicy = getEntryPolicy(db);
  const gate = passesEntryPolicyGate(energy, entryPolicy);
  if (!gate.ok) {
    log(`entry skip ${pair}: ${gate.reason}`);
    return;
  }

  setKv(db, kvSwingAt(pair), String(Date.now()));
  const j = await judgeEntry(cfg, db, {
    pair,
    side: 'buy',
    last,
    energy,
    metrics,
    rank: slot.rank1,
    reason: slot.reason,
    entryPolicy,
    aiGuide: energy.aiGuide,
  });
  log(`entry? ${pair} ${j.verdict} conf=${j.confidence} | ${j.reason || ''}`);
  if (j.verdict !== 'enter') return;

  // 予算ソフトチェック（概算）
  if (cfg.budgetJpy > 0) {
    const opens = listOpenBotPositions(db);
    let used = 0;
    for (const p of opens) used += (Number(p.entry_price) || 0) * (Number(p.amount) || 0);
    const lot = await bitbank.getMinLot(pair);
    if (used + last * lot > cfg.budgetJpy) {
      log(`entry skip ${pair}: budget ${used.toFixed(0)}+${(last * lot).toFixed(0)}>${cfg.budgetJpy}`);
      return;
    }
  }

  await openBotLong(deps, pair, last, energy);
}

async function tick(deps) {
  const { cfg, db, bitbank } = deps;
  const crash = getCrashState(db);
  await refreshBuyRankIfNeeded(cfg, db, bitbank, { log });

  const opens = listOpenBotPositions(db);
  for (const pos of opens) {
    try {
      await manageOpenPosition(deps, pos);
    } catch (e) {
      log(`manage ${pos.pair}: ${e.message}`);
    }
  }

  if (crash?.mode === 'crash_pause') {
    log(`crash_pause — 新規買い停止 (${crash.reason || ''})`);
    await maybeLearnExits(cfg, db, log).catch((e) => log(`exit learn: ${e.message}`));
    await maybeLearnEntries(cfg, db, log).catch((e) => log(`entry learn: ${e.message}`));
    await maybeSyncSheets(deps);
    return;
  }

  const { slots, maxN } = selectTradeSlots(cfg, db);
  const openNow = listOpenBotPositions(db);
  log(`slots ${slots.map((s) => `${s.pair}:${s.source}`).join(' ') || '-'} open=${openNow.length}/${maxN}`);

  for (const slot of slots) {
    if (listOpenBotPositions(db).length >= maxN) break;
    try {
      await tryEnterSlot(deps, slot);
    } catch (e) {
      log(`enter ${slot.pair}: ${e.message}`);
    }
  }

  await maybeLearnExits(cfg, db, log).catch((e) => log(`exit learn: ${e.message}`));
  await maybeLearnEntries(cfg, db, log).catch((e) => log(`entry learn: ${e.message}`));
  await maybeSyncSheets(deps);
}

async function main() {
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  ensureLedgerTables(db);
  ensureAsymmetricExitPolicy(db);
  const bitbank = new BitbankClient(cfg);
  const deps = {
    cfg,
    db,
    bitbank,
    lastSheetsSyncAt: 0,
    sheetsSyncSoon: true,
  };

  log(
    `start dryRun=${cfg.dryRun} maxPos=${cfg.maxPositions} poll=${cfg.pollIntervalMs}ms swingAi=${cfg.swingAiIntervalMs}ms urgent=${cfg.swingAiUrgentIntervalMs}ms rank=${cfg.rankIntervalMs}ms budgetJpy=${cfg.budgetJpy} once=${cfg.once} sheets=${cfg.sheetsWebappUrl ? 'on' : 'off'}`
  );
  log(`params ${JSON.stringify(getCrashParams(db))}`);

  if (!cfg.geminiApiKey && !cfg.cursorApiKey) {
    log('WARN: GEMINI_API_KEY / CURSOR_API_KEY 未設定 — AI判断は skip/hold フォールバック');
  }
  if (cfg.sheetsWebappUrl) {
    log(`sheets sync enabled (interval ms=${cfg.sheetsSyncIntervalMs})`);
  } else {
    log('sheets sync disabled (set SHEETS_WEBAPP_URL + SHEETS_SYNC_TOKEN)');
  }

  await tick(deps);
  if (cfg.once) {
    log('ONCE=true — 終了');
    return;
  }

  for (;;) {
    await sleep(cfg.pollIntervalMs);
    try {
      await tick(deps);
    } catch (e) {
      log(`tick error: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
