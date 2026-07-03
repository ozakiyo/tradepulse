/**
 * 日足レンジ / 1Hレンジ（日足内）の判定
 */

function gRangeWidthPct_(high, low) {
  if (!high || !low || high <= 0) return null;
  var mid = (high + low) / 2;
  if (mid <= 0) return null;
  return ((high - low) / mid) * 100;
}

function gDetectDailyRange_(candlesDaily, cfg) {
  if (!candlesDaily || candlesDaily.length < 5) {
    return {
      isRange: false,
      high: null,
      low: null,
      widthPct: null,
      note: '日足不足',
    };
  }
  var slice = candlesDaily.slice(-cfg.dailyLookback);
  var high = slice[0].high;
  var low = slice[0].low;
  for (var i = 1; i < slice.length; i++) {
    high = Math.max(high, slice[i].high);
    low = Math.min(low, slice[i].low);
  }
  var widthPct = gRangeWidthPct_(high, low);
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
      '% 上限' +
      high +
      ' 下限' +
      low,
  };
}

function gDetectH1Range_(candles1h, daily, cfg) {
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
  var inside =
    low >= daily.low * (1 - buf) && high <= daily.high * (1 + buf);
  var widthPct = gRangeWidthPct_(high, low);
  var isRange =
    inside && widthPct != null && widthPct <= cfg.h1RangeMaxPct;
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
      (inside ? 'OK' : 'NG') +
      ' 上' +
      Math.round(high) +
      ' 下' +
      Math.round(low),
  };
}

function gTouchBand_(price, level, touchPct) {
  var band = level * (touchPct / 100);
  return { upper: level + band, lower: level - band };
}

function gIsNearLower_(price, h1Low, touchPct) {
  var b = gTouchBand_(h1Low, h1Low, touchPct);
  return price <= b.upper;
}

function gIsNearUpper_(price, h1High, touchPct) {
  var b = gTouchBand_(h1High, h1High, touchPct);
  return price >= b.lower;
}

function gIsDailyBreak_(close, daily) {
  if (!daily.high || !daily.low) return false;
  return close > daily.high || close < daily.low;
}

function gIsDailyBreakBelow_(close, dailyLow) {
  return dailyLow != null && close < dailyLow;
}

function gIsH1BreakBelow_(close, h1Low) {
  return h1Low != null && close < h1Low;
}

/** 1Hレンジ幅の tpRatio 位置（買い: 下から） */
function gCalcTakeProfit_(h1, tpRatio) {
  if (!h1 || !h1.high || !h1.low || h1.high <= h1.low) return null;
  var w = h1.high - h1.low;
  return h1.low + w * gClampTpRatio_(tpRatio);
}

function gIsAtOrPastTakeProfit_(price, tpPrice, touchPct, entryPrice) {
  if (tpPrice == null || price == null || entryPrice == null) return false;
  if (price <= entryPrice) return false;
  var band = tpPrice * (touchPct / 100);
  return price >= tpPrice - band;
}
