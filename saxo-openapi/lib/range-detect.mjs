export function rangeWidthPct_(high, low) {
  if (!high || !low || high <= 0) return null;
  const mid = (high + low) / 2;
  if (mid <= 0) return null;
  return ((high - low) / mid) * 100;
}

export function detectDailyRange_(candlesDaily, cfg) {
  if (!candlesDaily || candlesDaily.length < 5) {
    return { isRange: false, high: null, low: null, widthPct: null, note: '日足不足' };
  }
  const slice = candlesDaily.slice(-cfg.dailyLookback);
  let high = slice[0].high;
  let low = slice[0].low;
  for (let i = 1; i < slice.length; i++) {
    high = Math.max(high, slice[i].high);
    low = Math.min(low, slice[i].low);
  }
  const widthPct = rangeWidthPct_(high, low);
  const minW = cfg.dailyRangeMinPct ?? 0;
  const isRange =
    widthPct != null && widthPct <= cfg.dailyRangeMaxPct && widthPct >= minW;
  return {
    isRange,
    high,
    low,
    widthPct,
    note: `日足${slice.length}日 幅${widthPct != null ? widthPct.toFixed(2) : '-'}%`,
  };
}

export function detectH1Range_(candles1h, daily, cfg) {
  if (!daily.isRange || !daily.high || !daily.low) {
    return { isRange: false, high: null, low: null, widthPct: null, note: '日足非レンジ' };
  }
  if (!candles1h || candles1h.length < cfg.h1Lookback) {
    return { isRange: false, high: null, low: null, widthPct: null, note: '1H不足' };
  }
  const slice = candles1h.slice(-cfg.h1Lookback);
  let high = slice[0].high;
  let low = slice[0].low;
  for (let i = 1; i < slice.length; i++) {
    high = Math.max(high, slice[i].high);
    low = Math.min(low, slice[i].low);
  }
  const buf = cfg.h1InsideDailyBufferPct / 100;
  const inside = low >= daily.low * (1 - buf) && high <= daily.high * (1 + buf);
  const widthPct = rangeWidthPct_(high, low);
  const minW = cfg.h1RangeMinPct ?? 0;
  const maxW = cfg.h1RangeMaxPct;
  const widthOk = widthPct != null && widthPct <= maxW && widthPct >= minW;
  const isRange = inside && widthOk;
  let widthNote = widthPct != null ? widthPct.toFixed(2) : '-';
  if (inside && widthPct != null && widthPct < minW) {
    widthNote += `(min${minW}未満)`;
  }
  return {
    isRange,
    high,
    low,
    widthPct,
    insideDaily: inside,
    note: `1H${slice.length}本 幅${widthNote}% 日足内${inside ? 'OK' : 'NG'}`,
  };
}

function spreadAmount_(spreadOpts) {
  if (!spreadOpts) return 0;
  const rate = Number(spreadOpts.spreadRate) || 0;
  const mult = spreadOpts.spreadMult != null ? Number(spreadOpts.spreadMult) : 1;
  return Math.max(0, rate) * Math.max(0, mult);
}

/** ロング新規: Ask ≈ 終値 + スプレッド幅で下限タッチ判定 */
export function isNearLower_(price, h1Low, touchPct, spreadOpts) {
  const band = h1Low * (touchPct / 100);
  const spread = spreadAmount_(spreadOpts);
  const ask = spread > 0 ? price + spread : price;
  return ask <= h1Low + band;
}

/** ショート新規: Bid ≈ 終値 − スプレッド幅で上限タッチ判定 */
export function isNearUpper_(price, h1High, touchPct, spreadOpts) {
  const band = h1High * (touchPct / 100);
  const spread = spreadAmount_(spreadOpts);
  const bid = spread > 0 ? price - spread : price;
  return bid >= h1High - band;
}

/** ロング損切: Bid が日足下限 − buffer% を下回る */
export function isDailyAdverseBreakBuffered_(close, daily, side, spreadOpts, bufferPct = 0) {
  if (!daily.high || !daily.low) return false;
  const buf = Math.max(0, Number(bufferPct) || 0) / 100;
  const spread = spreadAmount_(spreadOpts);
  if (side === 'long') {
    const bid = spread > 0 ? close - spread : close;
    return bid < daily.low * (1 - buf);
  }
  if (side === 'short') {
    const ask = spread > 0 ? close + spread : close;
    return ask > daily.high * (1 + buf);
  }
  return false;
}

/** @deprecated 互換。buffer 0% のみ */
export function isDailyAdverseBreak_(close, daily, side, spreadOpts) {
  return isDailyAdverseBreakBuffered_(close, daily, side, spreadOpts, 0);
}

/** 直近 confirmBars 本の5分足終値がすべてバッファ付き日足ブレイク */
export function isDailyAdverseBreakConfirmed_(closed5mBars, daily, side, spreadOpts, bufferPct, confirmBars) {
  const n = Math.max(1, Math.floor(confirmBars) || 1);
  if (!closed5mBars?.length || closed5mBars.length < n) return false;
  const slice = closed5mBars.slice(-n);
  return slice.every((bar) =>
    isDailyAdverseBreakBuffered_(bar.close, daily, side, spreadOpts, bufferPct)
  );
}

/** ロング損切: Bid が 1H 下限割れ */
export function isH1AdverseBreak_(close, h1, side, spreadOpts) {
  if (!h1?.high || !h1?.low) return false;
  const spread = spreadAmount_(spreadOpts);
  if (side === 'long') {
    const bid = spread > 0 ? close - spread : close;
    return bid < h1.low;
  }
  if (side === 'short') {
    const ask = spread > 0 ? close + spread : close;
    return ask > h1.high;
  }
  return false;
}

export function clampTpRatio_(ratio) {
  if (Number.isNaN(ratio) || ratio < 0.5) return 0.5;
  if (ratio > 1) return 1;
  return ratio;
}

export function calcTakeProfit_(side, h1, tpRatio) {
  if (!h1?.high || !h1?.low || h1.high <= h1.low) return null;
  const w = h1.high - h1.low;
  const ratio = clampTpRatio_(tpRatio);
  if (side === 'long') return h1.low + w * ratio;
  return h1.high - w * ratio;
}

/**
 * 利確判定。spreadRate × spreadMult は Saxo Bid-Ask 幅（レート差）。
 * ロング: Bid（終値−スプレッド）が TP 到達かつエントリー+スプレッド以上で利確。
 */
export function isAtOrPastTakeProfit_(price, tpPrice, side, touchPct, opts = {}) {
  if (tpPrice == null || price == null) return false;
  const band = tpPrice * (touchPct / 100);
  const spread = spreadAmount_(opts);
  const entry = opts.entryPrice;

  if (side === 'long') {
    const bid = spread > 0 ? price - spread : price;
    if (bid < tpPrice - band) return false;
    if (entry != null && spread > 0 && bid < entry + spread) return false;
    return true;
  }
  if (side === 'short') {
    const ask = spread > 0 ? price + spread : price;
    if (ask > tpPrice + band) return false;
    if (entry != null && spread > 0 && ask > entry - spread) return false;
    return true;
  }
  return false;
}
