import { saxoRequest } from './saxo.mjs';

const HORIZON_5M = 5;
const HORIZON_1H = 60;
const HORIZON_DAILY = 1440;

export function parseSaxoBar(bar) {
  const mid = (a, b) => {
    if (a != null && b != null) return (a + b) / 2;
    return a ?? b ?? 0;
  };
  const high = Math.max(bar.HighBid ?? bar.HighAsk ?? 0, bar.HighAsk ?? bar.HighBid ?? 0);
  let low = Math.min(
    bar.LowBid ?? bar.LowAsk ?? Infinity,
    bar.LowAsk ?? bar.LowBid ?? Infinity
  );
  if (!Number.isFinite(low)) low = mid(bar.LowBid, bar.LowAsk);
  return {
    time: new Date(bar.Time).getTime(),
    open: mid(bar.OpenBid, bar.OpenAsk),
    high: high || mid(bar.HighBid, bar.HighAsk),
    low: low || mid(bar.LowBid, bar.LowAsk),
    close: mid(bar.CloseBid, bar.CloseAsk),
    volume: 0,
  };
}

export async function getChartCandles(cfg, uic, assetType, horizon, count) {
  const params = new URLSearchParams({
    AssetType: assetType,
    Uic: String(uic),
    Horizon: String(horizon),
    Count: String(count),
    FieldGroups: 'Data',
  });
  const data = await saxoRequest(cfg, 'GET', `/chart/v3/charts?${params}`);
  return (data.Data || []).map(parseSaxoBar);
}

/** 指定時刻までの履歴足（Mode=UpTo）。損切時点のチャート確認用 */
export async function getChartCandlesAtTime_(cfg, uic, assetType, horizon, timeIso, count) {
  const params = new URLSearchParams({
    AssetType: assetType,
    Uic: String(uic),
    Horizon: String(horizon),
    Count: String(count),
    Mode: 'UpTo',
    Time: timeIso,
    FieldGroups: 'Data',
  });
  const data = await saxoRequest(cfg, 'GET', `/chart/v3/charts?${params}`);
  return (data.Data || []).map(parseSaxoBar);
}

/** 指定時刻以降の履歴足（Mode=From）。損切後の動き確認用 */
export async function getChartCandlesFromTime_(cfg, uic, assetType, horizon, timeIso, count) {
  const params = new URLSearchParams({
    AssetType: assetType,
    Uic: String(uic),
    Horizon: String(horizon),
    Count: String(count),
    Mode: 'From',
    Time: timeIso,
    FieldGroups: 'Data',
  });
  const data = await saxoRequest(cfg, 'GET', `/chart/v3/charts?${params}`);
  return (data.Data || []).map(parseSaxoBar);
}

export async function getCandles1h_(cfg, uic, assetType, minBars = 55) {
  const count = Math.max(minBars + 5, 70);
  return getChartCandles(cfg, uic, assetType, HORIZON_1H, count);
}

export async function getCandlesDaily_(cfg, uic, assetType, lookbackDays = 20) {
  const count = lookbackDays + 5;
  return getChartCandles(cfg, uic, assetType, HORIZON_DAILY, count);
}

export async function getCandles5m_(cfg, uic, assetType, minBars = 12) {
  const count = Math.max(minBars + 5, 30);
  return getChartCandles(cfg, uic, assetType, HORIZON_5M, count);
}

function toTokyoDay(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(ts));
}

export function aggregateDailyFrom1h_(candles1h, lookbackDays) {
  const byDay = {};
  for (const c of candles1h) {
    const day = toTokyoDay(c.time);
    if (!byDay[day]) {
      byDay[day] = { open: c.open, high: c.high, low: c.low, close: c.close, time: c.time };
    } else {
      const d = byDay[day];
      d.high = Math.max(d.high, c.high);
      d.low = Math.min(d.low, c.low);
      d.close = c.close;
    }
  }
  let keys = Object.keys(byDay).sort();
  if (lookbackDays && keys.length > lookbackDays) {
    keys = keys.slice(keys.length - lookbackDays);
  }
  return keys.map((k) => byDay[k]);
}

/** 確定済み直近5分足（末尾は形成中のため length-2） */
export function getLastClosed5m_(candles5m) {
  if (!candles5m || candles5m.length < 2) return null;
  const c = candles5m[candles5m.length - 2];
  return { close: c.close, time: c.time, high: c.high, low: c.low };
}

/** 確定済み5分足を新しい順で count 本（損切確認用） */
export function getLastClosed5mList_(candles5m, count) {
  const n = Math.max(1, Math.floor(count));
  if (!candles5m || candles5m.length < n + 1) return [];
  const end = candles5m.length - 2;
  const start = end - n + 1;
  if (start < 0) return [];
  return candles5m.slice(start, end + 1).map((c) => ({
    close: c.close,
    time: c.time,
    high: c.high,
    low: c.low,
  }));
}

export function getTickerFromCandles_(candles1h) {
  if (!candles1h.length) return null;
  const last = candles1h[candles1h.length - 1].close;
  return { last, high: last, low: last };
}
