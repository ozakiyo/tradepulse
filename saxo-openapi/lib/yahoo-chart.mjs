/** Saxo 不可時の 1H 足フォールバック（損切レビュー用） */

const YAHOO_SYMBOL = {
  usd_cad: 'USDCAD=X',
  gbp_usd: 'GBPUSD=X',
  gbp_chf: 'GBPCHF=X',
  usd_jpy: 'USDJPY=X',
  usd_chf: 'USDCHF=X',
  chf_jpy: 'CHFJPY=X',
  aud_usd: 'AUDUSD=X',
  eur_aud: 'EURAUD=X',
  nzd_usd: 'NZDUSD=X',
  aud_jpy: 'AUDJPY=X',
  eur_usd: 'EURUSD=X',
  xauusd: 'GC=F',
};

function midBar_(q) {
  return {
    time: q.date * 1000,
    open: q.open,
    high: q.high,
    low: q.low,
    close: q.close,
    volume: q.volume || 0,
  };
}

export function yahooSymbolForPair_(pairId) {
  return YAHOO_SYMBOL[pairId] || null;
}

/** @param {number} fromMs @param {number} toMs */
export async function getYahooCandles1h_(pairId, fromMs, toMs) {
  const symbol = yahooSymbolForPair_(pairId);
  if (!symbol) throw new Error(`Yahoo 未対応: ${pairId}`);
  const period1 = Math.floor(fromMs / 1000);
  const period2 = Math.ceil(toMs / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=60m&period1=${period1}&period2=${period2}&includePrePost=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const q = result?.indicators?.quote?.[0];
  const ts = result?.timestamp;
  if (!q || !ts?.length) return [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const open = q.open[i];
    const high = q.high[i];
    const low = q.low[i];
    const close = q.close[i];
    if ([open, high, low, close].some((v) => v == null)) continue;
    out.push(midBar_({ date: ts[i], open, high, low, close, volume: q.volume?.[i] || 0 }));
  }
  return out;
}
