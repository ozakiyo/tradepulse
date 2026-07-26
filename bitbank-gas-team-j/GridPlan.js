/**
 * 日足レンジ判定・グリッド計画（手数料込み）
 */

function jCalcAtrPct_(candles, period) {
  period = period || J_CONFIG.ATR_PERIOD;
  if (!candles || candles.length < period + 2) return null;
  var tr = [];
  for (var i = 1; i < candles.length; i++) {
    var hl = candles[i].high - candles[i].low;
    var hc = Math.abs(candles[i].high - candles[i - 1].close);
    var lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  var start = Math.max(0, tr.length - period);
  var sum = 0;
  var count = 0;
  for (var j = start; j < tr.length; j++) {
    var close = candles[j + 1].close;
    if (close > 0) {
      sum += tr[j] / close;
      count += 1;
    }
  }
  if (!count) return null;
  return (sum / count) * 100;
}

/** 確定済み日足の高安幅の平均（日中変動 JPY） */
function jCalcIntradayMoveAvg_(daily, lookbackDays) {
  if (!daily || daily.length < 2) return null;
  lookbackDays = lookbackDays || J_CONFIG.INTRADAY_MOVE_LOOKBACK_DAYS || 5;
  var confirmed = daily.slice(0, daily.length - 1);
  if (!confirmed.length) return null;
  var slice = confirmed.slice(-lookbackDays);
  if (!slice.length) return null;
  var sum = 0;
  slice.forEach(function (c) {
    sum += c.high - c.low;
  });
  return sum / slice.length;
}

function jCalcMoveStepRatio_(intradayMoveJpy, trapStep) {
  if (intradayMoveJpy == null || !trapStep || trapStep <= 0) return null;
  return Math.round((intradayMoveJpy / trapStep) * 100) / 100;
}

function jDetectDailyRange_(daily, cfg, pair) {
  cfg = cfg || jGetConfig_();
  var lookback = cfg.dailyLookback || J_CONFIG.DAILY_LOOKBACK;
  var maxPct = jGetDailyRangeMaxPct_(pair, cfg);
  if (!daily || daily.length < 5) {
    return { isRange: false, high: null, low: null, widthPct: null, note: '日足不足' };
  }
  var slice = daily.slice(-lookback);
  var high = slice[0].high;
  var low = slice[0].low;
  slice.forEach(function (c) {
    high = Math.max(high, c.high);
    low = Math.min(low, c.low);
  });
  var mid = (high + low) / 2;
  var widthPct = mid > 0 ? ((high - low) / mid) * 100 : null;
  return {
    isRange: widthPct != null && widthPct <= maxPct,
    high: high,
    low: low,
    widthPct: widthPct,
    note: '日足' + slice.length + '日 幅' + (widthPct != null ? widthPct.toFixed(2) : '-') + '%',
  };
}

function jRoundTrapStep_(step, priceDigits, last) {
  if (step >= 10000) return Math.round(step / 1000) * 1000;
  if (step >= 1000) return Math.round(step / 100) * 100;
  if (step >= 100) return Math.round(step / 10) * 10;
  if (step >= 1) return Math.round(step);
  var pow = Math.pow(10, Math.max(2, priceDigits || 2));
  return Math.max(0.01, Math.round(step * pow) / pow);
}

/** 銘柄別トラップ間隔の上限（円）。未定義は null */
function jGetTrapStepMax_(pair) {
  var map = J_CONFIG.TRAP_STEP_MAX_BY_PAIR || {};
  if (map[pair] == null) return null;
  return Number(map[pair]);
}

/** 日足レンジ内: 現値 → refDailyLow まで trapStep 刻み */
function jCalcDailyGridPlan_(last, dailyRange, atrPct, pair) {
  var inst = jGetInstrument_(pair);
  var cfg = jGetConfig_();
  var refLow = dailyRange.low;
  var refHigh = dailyRange.high;
  var atr = atrPct != null ? atrPct : 1.0;
  var trapStep = jRoundTrapStep_((last * atr) / 100, inst.priceDecimals, last);
  var minStep = Math.max(0.01, last * (J_CONFIG.TRAP_STEP_MIN_PCT / 100));
  if (trapStep < minStep) trapStep = jRoundTrapStep_(minStep, inst.priceDecimals, last);

  // BTCなど: 間隔が広すぎると約定しにくいので上限で抑える
  var maxStep = jGetTrapStepMax_(pair);
  if (maxStep != null && maxStep > 0 && trapStep > maxStep) {
    trapStep = jRoundTrapStep_(maxStep, inst.priceDecimals, last);
  }

  var spanToLow = Math.max(0, last - refLow);
  var minLevels = Math.max(1, cfg.minGridLevels || J_CONFIG.MIN_GRID_LEVELS || 1);
  if (minLevels >= 2 && spanToLow > 0) {
    var targetStep = spanToLow / (minLevels - 1);
    if (targetStep > 0 && targetStep < trapStep) {
      trapStep = jRoundTrapStep_(targetStep, inst.priceDecimals, last);
      if (trapStep <= 0) trapStep = targetStep;
    }
  }

  var levels = 0;
  for (var i = 0; i < (cfg.maxLevels || J_CONFIG.MAX_LEVELS); i++) {
    var buyPrice = last - i * trapStep;
    if (buyPrice < refLow) break;
    if (buyPrice <= 0) break;
    levels += 1;
  }

  return {
    trapStep: trapStep,
    levels: levels,
    refDailyLow: refLow,
    refDailyHigh: refHigh,
    atrPct: atr,
    rangeSpan: levels > 1 ? (levels - 1) * trapStep : 0,
  };
}

/** エントリー箱内の全トラップ価格（refLow から trapStep 刻み） */
function jListFullBoxLevelPrices_(refLow, refHigh, trapStep, pair) {
  var cfg = jGetConfig_();
  var maxN = cfg.maxLevels || J_CONFIG.MAX_LEVELS || 30;
  var prices = [];
  if (refLow == null || refHigh == null || !trapStep || trapStep <= 0) return prices;
  var p = jRoundPrice_(pair, refLow);
  var hi = Number(refHigh);
  var guard = 0;
  while (p <= hi + trapStep * 0.0001 && prices.length < maxN && guard < maxN + 5) {
    guard += 1;
    if (p >= refLow && p <= hi) prices.push(p);
    var next = jRoundPrice_(pair, p + trapStep);
    if (next <= p) break;
    p = next;
  }
  return prices;
}

/** 箱全体グリッド計画（現値下=指値・現値上=逆指値） */
function jCalcFullBoxGridPlan_(last, dailyRange, atrPct, pair) {
  var base = jCalcDailyGridPlan_(last, dailyRange, atrPct, pair);
  var levelPrices = jListFullBoxLevelPrices_(base.refDailyLow, base.refDailyHigh, base.trapStep, pair);
  var span =
    levelPrices.length > 1 ? levelPrices[levelPrices.length - 1] - levelPrices[0] : 0;
  return {
    trapStep: base.trapStep,
    levels: levelPrices.length,
    levelPrices: levelPrices,
    refDailyLow: base.refDailyLow,
    refDailyHigh: base.refDailyHigh,
    atrPct: base.atrPct,
    rangeSpan: span,
    fullBox: true,
  };
}

function jCalcGridPlanForPair_(last, dailyRange, atrPct, pair, cfg) {
  cfg = cfg || jGetConfig_();
  if (cfg.fullBoxTrap) {
    return jCalcFullBoxGridPlan_(last, dailyRange, atrPct, pair);
  }
  return jCalcDailyGridPlan_(last, dailyRange, atrPct, pair);
}

/**
 * 箱がトラップとして成立するか（3点チェック）
 *  1. 箱幅がゼロ/極小でない（refHigh > refLow）
 *  2. トラップ本数が最低本数以上
 *  3. 現値ちょうどの1本だけ（即約定）ではない
 */
function jIsBoxTradeable_(plan, cfg) {
  cfg = cfg || jGetConfig_();
  if (!plan) return false;
  var minLevels = Math.max(2, cfg.minGridLevels || J_CONFIG.MIN_GRID_LEVELS || 4);
  var low = plan.refDailyLow;
  var high = plan.refDailyHigh;
  if (low == null || high == null) return false;
  // 1. 箱幅ゼロ/極小（間隔未満）は不可
  if (high - low < (plan.trapStep || 0)) return false;
  // 2. 本数不足は不可
  var levels = plan.levelPrices ? plan.levelPrices.length : plan.levels;
  if (!levels || levels < minLevels) return false;
  return true;
}

function jBoxRejectNote_(plan, cfg) {
  cfg = cfg || jGetConfig_();
  var minLevels = Math.max(2, cfg.minGridLevels || J_CONFIG.MIN_GRID_LEVELS || 4);
  var levels = plan && (plan.levelPrices ? plan.levelPrices.length : plan.levels);
  if (!plan || plan.refDailyLow == null || plan.refDailyHigh == null) return '箱情報なし';
  if (plan.refDailyHigh - plan.refDailyLow < (plan.trapStep || 0)) return '箱幅不足';
  return '本数不足(' + (levels || 0) + '<' + minLevels + ')';
}

/**
 * 銘柄の資金・利益見積（手数料込み）
 * @return {Object}
 */
function jAnalyzePairCosts_(pair, cfg, preload) {
  cfg = cfg || jGetConfig_();
  preload = preload || {};
  var candles1h = preload.candles1h || jGetCandles1h_(pair, (cfg.dailyLookback || 20) * 24);
  var daily = jAggregateDailyFrom1h_(candles1h, cfg.dailyLookback);
  var dailyRange = jDetectDailyRange_(daily, cfg, pair);
  var ticker = preload.ticker || jGetTicker_(pair);
  var last = ticker.last;
  var atrPct = jCalcAtrPct_(daily, J_CONFIG.ATR_PERIOD);
  var levelAmount = jResolveLevelAmount_(pair, last, jGetEffectiveMinLevelJpy_(cfg));
  var fees = jGetSpotTradingFees_(pair);

  if (!dailyRange.isRange) {
    return {
      pair: pair,
      dailyRangeOk: false,
      last: last,
      levelAmount: levelAmount,
      fees: fees,
      note: dailyRange.note,
    };
  }

  var plan = jCalcGridPlanForPair_(last, dailyRange, atrPct, pair, cfg);
  // 箱がトラップとして成立しない銘柄は選定対象外
  if (!jIsBoxTradeable_(plan, cfg)) {
    return {
      pair: pair,
      dailyRangeOk: false,
      last: last,
      levelAmount: levelAmount,
      fees: fees,
      note: '箱NG: ' + jBoxRejectNote_(plan, cfg),
    };
  }
  var capitalRole = cfg.feeRoleCapital || 'taker';
  var profitRole = cfg.feeRoleProfit || 'maker';
  var oneSetJpy = jCalcOneSetCapitalJpy_(pair, last, levelAmount, capitalRole);
  var worstJpy = jCalcWorstCaseGridJpy_(pair, last, plan, levelAmount, capitalRole);
  var roundMaker = jCalcTrapRoundProfit_(pair, last, plan.trapStep, levelAmount, profitRole);
  var roundTaker = jCalcTrapRoundProfit_(pair, last, plan.trapStep, levelAmount, 'taker');
  var minStep = jMinProfitableTrapStep_(pair, last, levelAmount, profitRole);
  var intradayMoveJpy = jCalcIntradayMoveAvg_(daily, cfg.intradayMoveLookbackDays);
  var moveStepRatio = jCalcMoveStepRatio_(intradayMoveJpy, plan.trapStep);

  return {
    pair: pair,
    label: jGetInstrument_(pair).label,
    dailyRangeOk: true,
    dailyWidthPct: dailyRange.widthPct,
    last: last,
    levelAmount: levelAmount,
    trapStep: plan.trapStep,
    trapStepPct: last > 0 ? (plan.trapStep / last) * 100 : null,
    intradayMoveJpy: intradayMoveJpy != null ? Math.round(intradayMoveJpy * 10000) / 10000 : null,
    moveStepRatio: moveStepRatio,
    levels: plan.levels,
    refDailyLow: plan.refDailyLow,
    refDailyHigh: plan.refDailyHigh,
    fees: fees,
    oneSetJpy: oneSetJpy,
    worstCaseJpy: worstJpy,
    roundProfitMaker: roundMaker,
    roundProfitTaker: roundTaker,
    minProfitableTrapStep: minStep,
    trapProfitable: plan.trapStep >= minStep,
  };
}
