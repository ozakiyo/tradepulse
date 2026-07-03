function e5fCalcEma_(values, period) {
  if (!values.length) return [];
  var k = 2 / (period + 1);
  var ema = values[0];
  var out = [ema];
  for (var i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function e5fCalcRsi_(closes, period) {
  if (closes.length < period + 1) return null;
  var gains = 0;
  var losses = 0;
  for (var i = closes.length - period; i < closes.length; i++) {
    var diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  var avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + gains / period / avgLoss);
}

function e5fCalcEr_(closes, period) {
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

function e5fCalcAdx_(candles, period) {
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

function e5fBarsPer4h_(candleInterval) {
  return candleInterval === '15m' ? 16 : 4;
}

function e5fAggregate4h_(candles, barsPer4h) {
  var n = barsPer4h || 4;
  var out = [];
  var start = candles.length % n;
  for (var i = start; i + n - 1 < candles.length; i += n) {
    var chunk = candles.slice(i, i + n);
    var high = chunk[0].high;
    var low = chunk[0].low;
    for (var j = 1; j < chunk.length; j++) {
      if (chunk[j].high > high) high = chunk[j].high;
      if (chunk[j].low < low) low = chunk[j].low;
    }
    out.push({
      open: chunk[0].open,
      high: high,
      low: low,
      close: chunk[chunk.length - 1].close,
      time: chunk[0].time,
    });
  }
  return out;
}

function e5fCalc4hBias_(candles, candleInterval) {
  var bars4h = e5fAggregate4h_(candles, e5fBarsPer4h_(candleInterval));
  if (bars4h.length < 55) return 'neutral';
  var closes = bars4h.map(function (c) {
    return c.close;
  });
  var ema20 = e5fCalcEma_(closes, 20);
  var ema50 = e5fCalcEma_(closes, 50);
  var n = closes.length - 1;
  var price = closes[n];
  if (price > ema20[n] && ema20[n] > ema50[n]) return 'bullish';
  if (price < ema20[n] && ema20[n] < ema50[n]) return 'bearish';
  return 'neutral';
}

function e5fBiasLabelJa_(bias) {
  if (bias === 'bullish') return '上昇';
  if (bias === 'bearish') return '下降';
  return '中立';
}

function e5fDonchianHigh_(candles, lookback, endIdx) {
  var start = Math.max(0, endIdx - lookback);
  var high = candles[start].high;
  for (var i = start + 1; i < endIdx; i++) {
    if (candles[i].high > high) high = candles[i].high;
  }
  return high;
}

function e5fDonchianLow_(candles, lookback, endIdx) {
  var start = Math.max(0, endIdx - lookback);
  var low = candles[start].low;
  for (var i = start + 1; i < endIdx; i++) {
    if (candles[i].low < low) low = candles[i].low;
  }
  return low;
}
