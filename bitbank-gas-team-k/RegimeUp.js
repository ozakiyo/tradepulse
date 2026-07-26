/**
 * 日足エントリー局面:
 * - BUY: 日足ダウンでなく、日足レンジ箱の上から RANGE_UPPER_FROM_TOP_PCT% 以外
 *   （押し目・戻り判定は使わない）
 * - 監視: 日足ダウン以外を広く対象（BUYは上の条件のみ）
 * 長期ダウントレンド除外は RegimeLong.js（新規BUYのみ）
 */

function kSmaSlopeNonDown_(closes, smaPeriod, slopeBars) {
  if (!closes || closes.length < smaPeriod + slopeBars) return false;
  var lastIdx = closes.length - 1;
  var smaNow = kSmaAt_(closes, smaPeriod, lastIdx);
  var smaPrev = kSmaAt_(closes, smaPeriod, lastIdx - slopeBars);
  if (smaNow == null || smaPrev == null) return false;
  return smaNow >= smaPrev;
}

function kSmaSlopeDown_(closes, smaPeriod, slopeBars) {
  if (!closes || closes.length < smaPeriod + slopeBars) return false;
  var lastIdx = closes.length - 1;
  var smaNow = kSmaAt_(closes, smaPeriod, lastIdx);
  var smaPrev = kSmaAt_(closes, smaPeriod, lastIdx - slopeBars);
  if (smaNow == null || smaPrev == null) return false;
  return smaNow < smaPrev;
}

/**
 * 左右 N 本より高い／低い確定スイングを抽出（時系列昇順）
 * @return {{ highs: Array<{i:number,price:number}>, lows: Array<{i:number,price:number}> }}
 */
function kFindSwingPoints_(bars, leftRight) {
  var lr = leftRight != null ? leftRight : K_CONFIG.SWING_LEFT_RIGHT || 2;
  var highs = [];
  var lows = [];
  if (!bars || bars.length < lr * 2 + 1) return { highs: highs, lows: lows };
  for (var i = lr; i < bars.length - lr; i++) {
    var isHigh = true;
    var isLow = true;
    for (var j = 1; j <= lr; j++) {
      if (bars[i].high < bars[i - j].high || bars[i].high < bars[i + j].high) isHigh = false;
      if (bars[i].low > bars[i - j].low || bars[i].low > bars[i + j].low) isLow = false;
    }
    if (isHigh) highs.push({ i: i, price: bars[i].high });
    if (isLow) lows.push({ i: i, price: bars[i].low });
  }
  return { highs: highs, lows: lows };
}

/**
 * 確定日足配列から局面判定（bitbank / USDJPY 共通）
 * @param {Array<{open,high,low,close}>} confirmed 確定足のみ・時系列昇順
 */
function kEvaluateDailyBars_(confirmed, cfg) {
  cfg = cfg || kGetConfig_();
  var smaPeriod = K_CONFIG.DAILY_SMA || 20;
  var rangeLook = K_CONFIG.DAILY_RANGE_LOOKBACK || 20;
  var slopeBars = K_CONFIG.DAILY_SMA_SLOPE_BARS || 3;
  var pullbackPct = cfg.pullbackToSmaPct != null ? cfg.pullbackToSmaPct : K_CONFIG.PULLBACK_TO_SMA_PCT;
  var rangeMaxPct = cfg.dailyRangeMaxPct != null ? cfg.dailyRangeMaxPct : K_CONFIG.DAILY_RANGE_MAX_PCT;
  var upperFromTop =
    cfg.rangeUpperFromTopPct != null ? cfg.rangeUpperFromTopPct : K_CONFIG.RANGE_UPPER_FROM_TOP_PCT;
  var swingLr = K_CONFIG.SWING_LEFT_RIGHT || 2;

  if (!confirmed || confirmed.length < smaPeriod + slopeBars + swingLr * 2 + 2) {
    return {
      allowEntry: false,
      regime: 'unknown',
      regimeComment: 'レンジ-',
      isDailyDown: false,
      downtrendCleared: false,
      note: 'レンジ- 日足不足',
    };
  }

  var closes = confirmed.map(function (c) {
    return c.close;
  });
  var last = confirmed[confirmed.length - 1];
  var sma = kSma_(closes, smaPeriod);
  if (sma == null || sma <= 0) {
    return {
      allowEntry: false,
      regime: 'unknown',
      regimeComment: 'レンジ-',
      isDailyDown: false,
      downtrendCleared: false,
      note: 'レンジ- SMA不足',
    };
  }

  var look = Math.min(rangeLook, confirmed.length);
  var slice = confirmed.slice(confirmed.length - look);
  var hi = slice[0].high;
  var lo = slice[0].low;
  slice.forEach(function (c) {
    hi = Math.max(hi, c.high);
    lo = Math.min(lo, c.low);
  });
  var mid = (hi + lo) / 2;
  var widthPct = mid > 0 ? ((hi - lo) / mid) * 100 : 999;
  var boxH = hi - lo;
  var nearTop = boxH > 0 && last.close >= hi - boxH * ((upperFromTop || 5) / 100);
  var inMidOrLower = last.close <= mid;
  var aboveSma = last.close >= sma;
  var smaFlatOrUp = kSmaSlopeNonDown_(closes, smaPeriod, slopeBars);
  var smaDown = kSmaSlopeDown_(closes, smaPeriod, slopeBars);
  var nearSma = last.close <= sma * (1 + pullbackPct / 100);
  var brokenBelow = last.close < lo * (1 - (K_CONFIG.RANGE_BREAK_BUFFER_PCT || 0.3) / 100);

  var swings = kFindSwingPoints_(confirmed, swingLr);
  var lh = false;
  var ll = false;
  var hlBud = false;
  var lastSwingHigh = null;
  var lastSwingLow = null;
  if (swings.highs.length >= 2) {
    var hA = swings.highs[swings.highs.length - 2];
    var hB = swings.highs[swings.highs.length - 1];
    lh = hB.price < hA.price;
    lastSwingHigh = hB.price;
  } else if (swings.highs.length === 1) {
    lastSwingHigh = swings.highs[0].price;
  }
  if (swings.lows.length >= 2) {
    var lA = swings.lows[swings.lows.length - 2];
    var lB = swings.lows[swings.lows.length - 1];
    ll = lB.price < lA.price;
    hlBud = lB.price > lA.price;
    lastSwingLow = lB.price;
  } else if (swings.lows.length === 1) {
    lastSwingLow = swings.lows[0].price;
    hlBud = true;
  }

  var brokeSwingLow = lastSwingLow != null && last.close < lastSwingLow;
  var reclaimedSwingHigh = lastSwingHigh != null && last.close > lastSwingHigh;

  var enterMain = (lh && ll) || brokeSwingLow || brokenBelow;
  var enterSub = !aboveSma || smaDown;
  var isDailyDown = enterMain && enterSub;

  var exitMain = reclaimedSwingHigh && hlBud;
  if (!lastSwingHigh) {
    exitMain = aboveSma && hlBud;
  }
  var exitSub = aboveSma && smaFlatOrUp && !brokenBelow;
  var downtrendCleared = !isDailyDown && exitMain && exitSub;

  var isUptrend = aboveSma && smaFlatOrUp && !isDailyDown;
  var isRange = !brokenBelow && widthPct <= rangeMaxPct && !isDailyDown;

  // 押し目・戻りは見ない。上限帯以外かつ日足ダウンでなければ BUY 可
  var allow = !isDailyDown && !nearTop;
  var regime = 'neutral';
  if (isDailyDown) {
    regime = 'daily_down';
  } else if (nearTop) {
    regime = 'range_upper';
  } else if (isUptrend) {
    regime = 'uptrend';
  } else if (isRange) {
    regime = 'range';
  } else {
    regime = 'wait';
  }

  if (!isDailyDown && !downtrendCleared && (isUptrend || isRange)) {
    downtrendCleared = aboveSma && smaFlatOrUp && !brokenBelow;
  }

  var comment = kRegimeCommentJa_(regime, isDailyDown);
  var upperPct = upperFromTop != null ? upperFromTop : 10;

  return {
    allowEntry: allow,
    regime: regime,
    regimeComment: comment,
    isUptrend: isUptrend,
    isRange: isRange,
    isDailyDown: isDailyDown,
    downtrendCleared: downtrendCleared,
    lh: lh,
    ll: ll,
    hlBud: hlBud,
    nearTop: !!nearTop,
    note:
      comment +
      (allow ? ' entry可' : ' entry不可') +
      (isDailyDown ? ' （下降中）' : downtrendCleared ? ' （解除済）' : '') +
      ' close=' +
      last.close +
      ' SMA' +
      smaPeriod +
      '=' +
      Math.round(sma * 1e6) / 1e6 +
      ' 幅' +
      widthPct.toFixed(1) +
      '%' +
      (nearTop ? ' 上' + upperPct + '%' : ' 上限帯外'),
    sma: sma,
    lastClose: last.close,
    rangeHigh: hi,
    rangeLow: lo,
    widthPct: widthPct,
  };
}

/**
 * 局面コメント（表示用）
 * アップトレンド / ダウントレンド / レンジ
 */
function kRegimeFamily_(regime, isDailyDown) {
  if (isDailyDown || regime === 'daily_down') return 'down';
  if (regime === 'uptrend' || regime === 'uptrend_pullback' || regime === 'uptrend_extended') {
    return 'up';
  }
  if (regime === 'range' || String(regime || '').indexOf('range_') === 0) return 'range';
  return 'range';
}

function kRegimeCommentJa_(regime, isDailyDown) {
  var fam = kRegimeFamily_(regime, isDailyDown);
  if (fam === 'down') return 'ダウントレンド-';
  if (fam === 'up') return 'アップトレンド-';
  return 'レンジ-';
}

/**
 * 局面チェンジコメント（差分表示）
 * チェンジダウントレンド- / チェンジレンジ- / チェンジアップトレンド-
 */
function kRegimeChangeCommentJa_(prevFamily, nowFamily) {
  if (!prevFamily || prevFamily === nowFamily) return '—';
  if (nowFamily === 'down') return 'チェンジダウントレンド-';
  if (nowFamily === 'up') return 'チェンジアップトレンド-';
  if (nowFamily === 'range') return 'チェンジレンジ-';
  return '—';
}

function kEvaluateUpRegime_(pair, cfg, opts) {
  cfg = cfg || kGetConfig_();
  opts = opts || {};
  if (!opts.forceRefresh) {
    var cached = kGetDailyRegimeCache_(pair);
    if (cached) return cached;
  }

  var lookback = K_CONFIG.DAILY_LOOKBACK || 60;
  var candles1h = kGetCandles1h_(pair, lookback * 24);
  var daily = kAggregateDailyFrom1h_(candles1h, lookback);
  if (!daily || daily.length < 5) {
    var miss = {
      pair: pair,
      allowEntry: false,
      regime: 'unknown',
      regimeComment: 'レンジ-',
      isDailyDown: false,
      downtrendCleared: false,
      note: 'レンジ- 日足不足',
      daily: daily,
    };
    kPutDailyRegimeCache_(pair, miss);
    return miss;
  }
  var confirmed = daily.slice(0, daily.length - 1);
  var r = kEvaluateDailyBars_(confirmed, cfg);
  r.pair = pair;
  r.daily = daily;
  kPutDailyRegimeCache_(pair, r);
  return r;
}

/** キャッシュ用に巨大な daily 配列を除いたコピー */
function kStripRegimeForCache_(r) {
  if (!r) return r;
  return {
    pair: r.pair,
    allowEntry: !!r.allowEntry,
    regime: r.regime,
    regimeComment: r.regimeComment || kRegimeCommentJa_(r.regime, r.isDailyDown),
    isUptrend: !!r.isUptrend,
    isRange: !!r.isRange,
    isDailyDown: !!r.isDailyDown,
    downtrendCleared: !!r.downtrendCleared,
    lh: !!r.lh,
    ll: !!r.ll,
    hlBud: !!r.hlBud,
    note: r.note || '',
    sma: r.sma,
    lastClose: r.lastClose,
    rangeHigh: r.rangeHigh,
    rangeLow: r.rangeLow,
    widthPct: r.widthPct,
    fromCache: true,
  };
}

function kDailyRegimeCacheKey_(pair) {
  var prefix = K_CONFIG.DAILY_REGIME_CACHE_PREFIX || 'k_dr_';
  return prefix + kTodayYmd_() + '_' + String(pair || '').replace(/[^a-z0-9]/gi, '_');
}

function kGetDailyRegimeCache_(pair) {
  try {
    var raw = CacheService.getScriptCache().get(kDailyRegimeCacheKey_(pair));
    if (!raw) return null;
    var o = JSON.parse(raw);
    if (o) o.fromCache = true;
    return o;
  } catch (e) {
    return null;
  }
}

function kPutDailyRegimeCache_(pair, regime) {
  try {
    var slim = kStripRegimeForCache_(regime);
    slim.pair = pair;
    CacheService.getScriptCache().put(
      kDailyRegimeCacheKey_(pair),
      JSON.stringify(slim),
      K_CONFIG.DAILY_REGIME_CACHE_SEC || 21600
    );
  } catch (e) {}
}

/** 塩漬け: 日足ダウン / 不明 */
function kIsDailyWeakForSalt_(regimeResult) {
  if (!regimeResult) return true;
  return !!(
    regimeResult.isDailyDown ||
    regimeResult.regime === 'daily_down' ||
    regimeResult.regime === 'unknown'
  );
}

/** 枠解放（レンジ上限＝上から5%） */
function kShouldRotateAway_(regimeResult) {
  if (!regimeResult) return false;
  return !!(regimeResult.nearTop || regimeResult.regime === 'range_upper');
}

/** 休眠復帰: ダウン解除済みかつ戻りentry可 */
function kCanWakeForEntry_(regimeResult) {
  if (!regimeResult) return false;
  // 押し目解除条件は使わない。BUY可（上限帯外・ダウンでない）なら復帰
  return !!regimeResult.allowEntry;
}
