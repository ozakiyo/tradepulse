function bbCalcEma_(values, period) {
  var k = 2 / (period + 1);
  var ema = values[0];
  var out = [ema];
  for (var i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function bbCalcEfficiencyRatio_(closes, period) {
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

function bbCalcAdx_(candles, period) {
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

function bbCountEmaCrosses_(closes, fastP, slowP, lookback) {
  var emaFast = bbCalcEma_(closes, fastP);
  var emaSlow = bbCalcEma_(closes, slowP);
  var start = Math.max(1, closes.length - lookback);
  var crosses = 0;
  for (var i = start; i < closes.length; i++) {
    var up = emaFast[i - 1] <= emaSlow[i - 1] && emaFast[i] > emaSlow[i];
    var down = emaFast[i - 1] >= emaSlow[i - 1] && emaFast[i] < emaSlow[i];
    if (up || down) crosses += 1;
  }
  return crosses;
}

function bbCalcTrendBias_(closes, fastP, slowP) {
  if (closes.length < slowP + 2) return 'neutral';
  var emaFast = bbCalcEma_(closes, fastP);
  var emaSlow = bbCalcEma_(closes, slowP);
  var n = closes.length - 1;
  var price = closes[n];
  var fast = emaFast[n];
  var slow = emaSlow[n];
  if (price > slow && fast > slow) return 'bullish';
  if (price < slow && fast < slow) return 'bearish';
  return 'neutral';
}

function bbTrendBiasLabelJa_(bias) {
  if (bias === 'bullish') return 'アップトレンド';
  if (bias === 'bearish') return 'ダウントレンド';
  return '方向不明';
}

/**
 * 急変 / トレンド / レンジ / 中立
 */
function bbDetectRegime_(candles, ticker, cfg) {
  if (candles.length < 55) {
    return { regime: 'mixed', action: 'wait', detail: 'ローソク不足' };
  }

  var closed = candles.slice(0, -1);
  if (closed.length < 30) closed = candles;

  var last = ticker.last;
  var prevClose = closed[closed.length - 2].close;
  var movePct = (Math.abs(last - prevClose) / prevClose) * 100;
  if (movePct >= cfg.shockMovePct) {
    return {
      regime: 'shock',
      action: 'stop',
      detail: '急変: 1H変動 ' + movePct.toFixed(2) + '%',
      movePct: movePct,
    };
  }

  var closes = closed.map(function (c) {
    return c.close;
  });
  var er = bbCalcEfficiencyRatio_(closes, 20);
  var adx = bbCalcAdx_(closed, 14);
  var crosses = bbCountEmaCrosses_(closes, 20, 50, 24);

  var trendScore = 0;
  var rangeScore = 0;
  if (er != null && er >= BB_CONFIG.ER_TREND_MIN) trendScore += 1;
  if (adx != null && adx >= BB_CONFIG.ADX_TREND_MIN) trendScore += 1;
  if (crosses <= 2) trendScore += 1;

  if (er != null && er <= BB_CONFIG.ER_RANGE_MAX) rangeScore += 1;
  if (adx != null && adx <= BB_CONFIG.ADX_RANGE_MAX) rangeScore += 1;
  if (crosses >= 4) rangeScore += 1;

  var regime = 'mixed';
  if (trendScore >= 2 && trendScore > rangeScore) regime = 'trend';
  else if (rangeScore >= 2 && rangeScore > trendScore) regime = 'range';

  var trendBias = regime === 'trend' ? bbCalcTrendBias_(closes, 20, 50) : null;
  var action = 'wait';
  var detail = '';
  if (regime === 'range') {
    action = 'toraripi_full';
    detail = 'レンジ→トラリピ（フル） ER=' + er + ' ADX=' + adx;
  } else if (regime === 'mixed') {
    action = 'toraripi_half';
    detail = '中立→トラリピ（縮小） ER=' + er + ' ADX=' + adx;
  } else if (regime === 'trend') {
    action = 'swing';
    detail =
      'トレンド→スイング（' +
      bbTrendBiasLabelJa_(trendBias) +
      '） ER=' +
      er +
      ' ADX=' +
      adx;
  }

  return {
    regime: regime,
    action: action,
    detail: detail,
    er: er,
    adx: adx,
    crosses: crosses,
    movePct: movePct,
    trendBias: trendBias,
  };
}

function bbActionLabelJa_(action) {
  if (action === 'stop') return 'STOP（全停止）';
  if (action === 'toraripi_full') return 'トラリピ（フル）';
  if (action === 'toraripi_half') return 'トラリピ（縮小）';
  if (action === 'swing') return 'スイング';
  return '様子見';
}
