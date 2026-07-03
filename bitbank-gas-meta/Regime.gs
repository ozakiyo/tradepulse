function metaCalcEma_(values, period) {
  var k = 2 / (period + 1);
  var ema = values[0];
  var out = [ema];
  for (var i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function metaCalcEfficiencyRatio_(closes, period) {
  if (closes.length < period + 1) return null;
  var n = closes.length - 1;
  var change = Math.abs(closes[n] - closes[n - period]);
  var path = 0;
  for (var i = n - period + 1; i <= n; i++) {
    path += Math.abs(closes[i] - closes[i - 1]);
  }
  if (path === 0) return 0;
  return change / path;
}

function metaCalcAdx_(candles, period) {
  if (candles.length < period + 3) return null;
  var tr = [];
  var plusDm = [];
  var minusDm = [];
  for (var i = 1; i < candles.length; i++) {
    var up = candles[i].high - candles[i - 1].high;
    var down = candles[i - 1].low - candles[i].low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    var hl = candles[i].high - candles[i].low;
    var hc = Math.abs(candles[i].high - candles[i - 1].close);
    var lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  var atr = 0;
  var sp = 0;
  var sm = 0;
  for (var j = 0; j < period; j++) {
    atr += tr[j];
    sp += plusDm[j];
    sm += minusDm[j];
  }
  var dxList = [];
  for (var t = period; t < tr.length; t++) {
    atr = atr - atr / period + tr[t];
    sp = sp - sp / period + plusDm[t];
    sm = sm - sm / period + minusDm[t];
    var pdi = atr === 0 ? 0 : (100 * sp) / atr;
    var mdi = atr === 0 ? 0 : (100 * sm) / atr;
    var sum = pdi + mdi;
    dxList.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  }
  if (!dxList.length) return null;
  var adx = 0;
  for (var d = 0; d < Math.min(period, dxList.length); d++) adx += dxList[d];
  adx /= Math.min(period, dxList.length);
  for (var u = period; u < dxList.length; u++) {
    adx = (adx * (period - 1) + dxList[u]) / period;
  }
  return Math.round(adx * 10) / 10;
}

function metaCountEmaCrosses_(closes, fastP, slowP, lookback) {
  var emaFast = metaCalcEma_(closes, fastP);
  var emaSlow = metaCalcEma_(closes, slowP);
  var start = Math.max(1, closes.length - lookback);
  var crosses = 0;
  for (var i = start; i < closes.length; i++) {
    var up = emaFast[i - 1] <= emaSlow[i - 1] && emaFast[i] > emaSlow[i];
    var down = emaFast[i - 1] >= emaSlow[i - 1] && emaFast[i] < emaSlow[i];
    if (up || down) crosses += 1;
  }
  return crosses;
}

function metaCalcTrendBias_(closes, fastP, slowP) {
  if (closes.length < slowP + 2) return 'neutral';
  var emaFast = metaCalcEma_(closes, fastP);
  var emaSlow = metaCalcEma_(closes, slowP);
  var n = closes.length - 1;
  var price = closes[n];
  if (price > emaSlow[n] && emaFast[n] > emaSlow[n]) return 'bullish';
  if (price < emaSlow[n] && emaFast[n] < emaSlow[n]) return 'bearish';
  return 'neutral';
}

function metaRegimeLabelJa_(key) {
  var map = {
    shock_down: '急落',
    shock_up: '急騰',
    range: 'レンジ',
    mixed: '中立',
    trend_bull: '上昇トレンド',
    trend_bear: '下降トレンド',
    wait: 'データ不足',
  };
  return map[key] || key;
}

/**
 * メタ層用環境判定（チーム配分の入力）
 */
function metaDetectRegime_(candles, ticker, cfg) {
  var minBars = META_CONFIG.MIN_CANDLES_1H;
  if (candles.length < minBars) {
    return {
      regimeKey: 'wait',
      regimeLabel: metaRegimeLabelJa_('wait'),
      detail: 'ローソク不足（' + candles.length + '/' + minBars + '本）',
      er: null,
      adx: null,
      movePct: null,
      trendBias: null,
    };
  }

  var closed = candles.slice(0, -1);
  if (closed.length < 30) closed = candles;

  var last = ticker.last;
  var prevClose = closed[closed.length - 2].close;
  var moveSigned = last - prevClose;
  var movePct = (Math.abs(moveSigned) / prevClose) * 100;

  if (movePct >= cfg.shockMovePct && moveSigned < 0) {
    return {
      regimeKey: 'shock_down',
      regimeLabel: metaRegimeLabelJa_('shock_down'),
      detail: '1H -' + movePct.toFixed(2) + '% → 全チーム縮小・現金増',
      er: null,
      adx: null,
      movePct: movePct,
      trendBias: null,
    };
  }

  var closes = closed.map(function (c) {
    return c.close;
  });
  var er = metaCalcEfficiencyRatio_(closes, 20);
  var adx = metaCalcAdx_(closed, 14);
  var crosses = metaCountEmaCrosses_(closes, 20, 50, 24);

  var trendScore = 0;
  var rangeScore = 0;
  if (er != null && er >= META_CONFIG.ER_TREND_MIN) trendScore += 1;
  if (adx != null && adx >= META_CONFIG.ADX_TREND_MIN) trendScore += 1;
  if (crosses <= 2) trendScore += 1;
  if (er != null && er <= META_CONFIG.ER_RANGE_MAX) rangeScore += 1;
  if (adx != null && adx <= META_CONFIG.ADX_RANGE_MAX) rangeScore += 1;
  if (crosses >= 4) rangeScore += 1;

  var regimeKey = 'mixed';
  if (trendScore >= 2 && trendScore > rangeScore) regimeKey = 'trend';
  else if (rangeScore >= 2 && rangeScore > trendScore) regimeKey = 'range';

  var trendBias = regimeKey === 'trend' ? metaCalcTrendBias_(closes, 20, 50) : null;

  if (movePct >= cfg.shockMovePct && moveSigned > 0) {
    regimeKey = 'shock_up';
    trendBias = metaCalcTrendBias_(closes, 20, 50);
  } else if (regimeKey === 'trend') {
    regimeKey = trendBias === 'bearish' ? 'trend_bear' : 'trend_bull';
  }

  var detail =
    metaRegimeLabelJa_(regimeKey) +
    ' ER=' +
    (er != null ? er.toFixed(3) : '-') +
    ' ADX=' +
    (adx != null ? adx : '-') +
    ' crosses=' +
    crosses;
  if (movePct >= cfg.shockMovePct && moveSigned > 0) {
    detail = '1H +' + movePct.toFixed(2) + '% ' + detail;
  }

  return {
    regimeKey: regimeKey,
    regimeLabel: metaRegimeLabelJa_(regimeKey),
    detail: detail,
    er: er,
    adx: adx,
    crosses: crosses,
    movePct: movePct,
    trendBias: trendBias,
  };
}
