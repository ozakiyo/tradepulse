function b2CalcAtrPct_(candles, period) {
  if (candles.length < period + 2) return null;
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

function b2CalcRsi_(closes, period) {
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

function b2CalcBollinger_(closes, period, stdDevMult) {
  if (closes.length < period) return null;
  var slice = closes.slice(closes.length - period);
  var sum = 0;
  for (var i = 0; i < slice.length; i++) sum += slice[i];
  var middle = sum / period;
  var sq = 0;
  for (var j = 0; j < slice.length; j++) {
    var d = slice[j] - middle;
    sq += d * d;
  }
  var std = Math.sqrt(sq / period);
  return {
    upper: middle + stdDevMult * std,
    middle: middle,
    lower: middle - stdDevMult * std,
    widthPct: middle > 0 ? ((2 * stdDevMult * std) / middle) * 100 : null,
  };
}
