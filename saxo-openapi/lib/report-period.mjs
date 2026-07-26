import { readAllTradeRows_, readTrendTradeRows_ } from './trade-log.mjs';
import { loadGsaxoConfig } from './gsaxo-config.mjs';
import { G_SAXO_INSTRUMENTS, gsaxoGetInstrument_ } from './gsaxo-instruments.mjs';
import { calcPnlJpy_ } from './paper-wallet.mjs';

function jstYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date);
}

function parseJstMidnight(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0);
}

export function getPeriodRange_(kind) {
  const now = new Date();
  const todayYmd = jstYmd(now);

  if (kind === '7d') {
    return {
      kind: '7d',
      label: '7日間',
      from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      to: now,
    };
  }

  if (kind === 'yesterday') {
    const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ymd = jstYmd(y);
    return {
      kind: 'yesterday',
      label: `前日(${ymd})`,
      from: parseJstMidnight(ymd),
      to: parseJstMidnight(todayYmd),
    };
  }

  if (kind === 'month') {
    const ym = todayYmd.slice(0, 7);
    return {
      kind: 'month',
      label: `${ym}月`,
      from: parseJstMidnight(`${ym}-01`),
      to: now,
    };
  }

  throw new Error(`unknown period kind: ${kind}`);
}

function rowInRange_(rowDate, from, to) {
  if (Number.isNaN(rowDate.getTime())) return false;
  return rowDate >= from && rowDate < to;
}

function resolveInstForRow_(row) {
  if (row.pairId) return gsaxoGetInstrument_(row.pairId);
  const sym = row.symbol || '';
  for (const inst of Object.values(G_SAXO_INSTRUMENTS)) {
    if (inst.label === sym || inst.searchKeyword === sym) return inst;
  }
  return null;
}

function gfxFxPnlJpy_(row, side, entryPrice, exitPrice, units, cfg) {
  const inst = resolveInstForRow_(row);
  if (inst) return calcPnlJpy_(inst, side, entryPrice, exitPrice, units, cfg);
  const diff = side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  const ref = cfg.usdJpyRef;
  if (Math.max(entryPrice, exitPrice) >= 20) return diff * units;
  return diff * units * ref;
}

function lotKey_(symbol, side) {
  return `${symbol}\0${side}`;
}

function pushLot_(queues, symbol, side, row) {
  const key = lotKey_(symbol, side);
  if (!queues[key]) queues[key] = [];
  queues[key].push({
    time: row.time,
    price: row.price,
    amount: row.amount,
    memo: row.memo,
    symbol,
  });
}

function consumeClose_(queues, symbol, side, row, cfg, trades) {
  const key = lotKey_(symbol, side);
  const queue = queues[key];
  if (!queue?.length) return;

  let remainToClose = row.amount > 0 ? row.amount : queue[0].amount;

  while (remainToClose > 0.0001 && queue.length) {
    const lot = queue[0];
    const closedUnits = Math.min(remainToClose, lot.amount);
    const pnlJpy = gfxFxPnlJpy_(row, side, lot.price, row.price, closedUnits, cfg);
    const pnlPct =
      side === 'long'
        ? ((row.price - lot.price) / lot.price) * 100
        : ((lot.price - row.price) / lot.price) * 100;

    trades.push({
      symbol,
      entryTime: lot.time,
      exitTime: row.time,
      side,
      entryPrice: lot.price,
      exitPrice: row.price,
      amount: closedUnits,
      pnlJpy,
      pnlPct,
      reason: row.memo || '',
    });

    lot.amount -= closedUnits;
    remainToClose -= closedUnits;
    if (lot.amount < 0.0001) queue.shift();
  }
}

export function pairGfxFxRangeTrades_(rows, cfg) {
  const queues = {};
  const trades = [];

  for (const r of rows) {
    const sym = r.symbol || '_';
    const label = String(r.side || '');

    if (label.includes('ロング新規')) {
      pushLot_(queues, sym, 'long', r);
    } else if (label.includes('ショート新規')) {
      pushLot_(queues, sym, 'short', r);
    } else if (label.includes('ロング決済')) {
      consumeClose_(queues, sym, 'long', r, cfg, trades);
    } else if (label.includes('ショート決済')) {
      consumeClose_(queues, sym, 'short', r, cfg, trades);
    }
  }

  return trades;
}

export async function collectTradesForPeriod_(from, to) {
  const all = await readAllTradeRows_();
  const rows = all.filter((r) => rowInRange_(new Date(r.time), from, to));
  const cfg = loadGsaxoConfig();
  return pairGfxFxRangeTrades_(rows, cfg);
}

export async function collectTrendTradesForPeriod_(from, to) {
  const all = await readTrendTradeRows_();
  const rows = all.filter((r) => rowInRange_(new Date(r.time), from, to));
  const cfg = loadGsaxoConfig();
  return pairGfxFxRangeTrades_(rows, cfg);
}

function roundTripKey_(trade) {
  return [trade.symbol, trade.side, trade.entryTime, trade.entryPrice].join('\0');
}

export function calcGfxFxStats_(trades) {
  const groups = {};
  const groupHoldH = {};
  let openCount = 0;

  for (const t of trades) {
    if (t.pnlJpy == null) {
      openCount++;
      continue;
    }
    const key = roundTripKey_(t);
    groups[key] = (groups[key] || 0) + t.pnlJpy;
    if (t.entryTime && t.exitTime) {
      const holdH = (new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / 3600000;
      groupHoldH[key] = Math.max(groupHoldH[key] || 0, holdH);
    }
  }

  let wins = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let totalHold = 0;
  const keys = Object.keys(groups);

  for (const key of keys) {
    const pnl = groups[key];
    if (pnl >= 0) {
      wins++;
      totalProfit += pnl;
    } else {
      totalLoss += Math.abs(pnl);
    }
    if (groupHoldH[key]) totalHold += groupHoldH[key];
  }

  const roundCount = keys.length;
  const netPnl = totalProfit - totalLoss;
  const pf = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : totalProfit > 0 ? '∞' : '-';

  return {
    closedCount: roundCount,
    openCount,
    wins,
    winRate: roundCount > 0 ? (wins / roundCount) * 100 : 0,
    pf,
    netPnl,
    avgHoldH: roundCount > 0 ? Math.round((totalHold / roundCount) * 10) / 10 : 0,
  };
}
