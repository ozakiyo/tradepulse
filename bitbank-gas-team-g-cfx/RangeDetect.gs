function gcfxRangeWidthPct_(high, low) {
  if (!high || !low || high <= 0) return null;
  var mid = (high + low) / 2;
  if (mid <= 0) return null;
  return ((high - low) / mid) * 100;
}

function gcfxDetectDailyRange_(candlesDaily, cfg) {
  if (!candlesDaily || candlesDaily.length < 5) {
    return { isRange: false, high: null, low: null, widthPct: null, note: '日足不足' };
  }
  var slice = candlesDaily.slice(-cfg.dailyLookback);
  var high = slice[0].high;
  var low = slice[0].low;
  for (var i = 1; i < slice.length; i++) {
    high = Math.max(high, slice[i].high);
    low = Math.min(low, slice[i].low);
  }
  var widthPct = gcfxRangeWidthPct_(high, low);
  var isRange = widthPct != null && widthPct <= cfg.dailyRangeMaxPct;
  return {
    isRange: isRange,
    high: high,
    low: low,
    widthPct: widthPct,
    note:
      '日足' +
      slice.length +
      '日 幅' +
      (widthPct != null ? widthPct.toFixed(2) : '-') +
      '%',
  };
}

function gcfxDetectH1Range_(candles1h, daily, cfg) {
  if (!daily.isRange || !daily.high || !daily.low) {
    return { isRange: false, high: null, low: null, widthPct: null, note: '日足非レンジ' };
  }
  if (!candles1h || candles1h.length < cfg.h1Lookback) {
    return { isRange: false, high: null, low: null, widthPct: null, note: '1H不足' };
  }
  var slice = candles1h.slice(-cfg.h1Lookback);
  var high = slice[0].high;
  var low = slice[0].low;
  for (var i = 1; i < slice.length; i++) {
    high = Math.max(high, slice[i].high);
    low = Math.min(low, slice[i].low);
  }
  var buf = cfg.h1InsideDailyBufferPct / 100;
  var inside = low >= daily.low * (1 - buf) && high <= daily.high * (1 + buf);
  var widthPct = gcfxRangeWidthPct_(high, low);
  var isRange = inside && widthPct != null && widthPct <= cfg.h1RangeMaxPct;
  return {
    isRange: isRange,
    high: high,
    low: low,
    widthPct: widthPct,
    insideDaily: inside,
    note:
      '1H' +
      slice.length +
      '本 幅' +
      (widthPct != null ? widthPct.toFixed(2) : '-') +
      '% 日足内' +
      (inside ? 'OK' : 'NG'),
  };
}

function gcfxIsNearLower_(price, h1Low, touchPct) {
  var band = h1Low * (touchPct / 100);
  return price <= h1Low + band;
}

function gcfxIsNearUpper_(price, h1High, touchPct) {
  var band = h1High * (touchPct / 100);
  return price >= h1High - band;
}

function gcfxIsDailyBreak_(close, daily) {
  if (!daily.high || !daily.low) return false;
  return close > daily.high || close < daily.low;
}

function gcfxIsDailyAdverseBreak_(close, daily, side) {
  if (!daily.high || !daily.low) return false;
  if (side === 'long') return close < daily.low;
  if (side === 'short') return close > daily.high;
  return false;
}

function gcfxIsH1AdverseBreak_(close, h1, side) {
  if (!h1 || !h1.high || !h1.low) return false;
  if (side === 'long') return close < h1.low;
  if (side === 'short') return close > h1.high;
  return false;
}

/** 1Hレンジ幅の tpRatio 位置（ロング: 下から / ショート: 上から） */
function gcfxCalcTakeProfit_(side, h1, tpRatio) {
  if (!h1 || !h1.high || !h1.low || h1.high <= h1.low) return null;
  var w = h1.high - h1.low;
  var ratio = gcfxClampTpRatio_(tpRatio);
  if (side === 'long') return h1.low + w * ratio;
  return h1.high - w * ratio;
}

function gcfxIsAtOrPastTakeProfit_(price, tpPrice, side, touchPct) {
  if (tpPrice == null || price == null) return false;
  var band = tpPrice * (touchPct / 100);
  if (side === 'long') return price >= tpPrice - band;
  return price <= tpPrice + band;
}