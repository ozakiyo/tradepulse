/**
 * 柴田鈎足の引線 — USD/JPY 向け（固定値幅）
 */
function d4fGetKagiBand_(price, baseStep) {
  var step = Math.max(0.05, baseStep);
  return { step: step, mon: step };
}

/**
 * @returns {Array<{dir:string, from:number, to:number, endIdx:number}>}
 */
function d4fBuildShibataKagi_(candles, baseStep) {
  var segs = [];
  if (!candles.length) return segs;

  var pos = candles[0].close;
  var dir = null;

  for (var i = 1; i < candles.length; i++) {
    var close = candles[i].close;
    var guard = 0;
    while (guard++ < 300) {
      var step = d4fGetKagiBand_(pos, baseStep).step;
      if (step <= 0) break;

      if (dir === null) {
        if (close >= pos + step) {
          dir = 'up';
          var next = pos + step;
          segs.push({ dir: 'up', from: pos, to: next, endIdx: i });
          pos = next;
        } else if (close <= pos - step) {
          dir = 'down';
          var nextDn = pos - step;
          segs.push({ dir: 'down', from: pos, to: nextDn, endIdx: i });
          pos = nextDn;
        } else {
          break;
        }
      } else if (dir === 'up') {
        if (close >= pos + step) {
          var upNext = pos + step;
          segs.push({ dir: 'up', from: pos, to: upNext, endIdx: i });
          pos = upNext;
        } else if (close <= pos - step) {
          dir = 'down';
          var revDn = pos - step;
          segs.push({ dir: 'down', from: pos, to: revDn, endIdx: i });
          pos = revDn;
        } else {
          break;
        }
      } else {
        if (close <= pos - step) {
          var dnNext = pos - step;
          segs.push({ dir: 'down', from: pos, to: dnNext, endIdx: i });
          pos = dnNext;
        } else if (close >= pos + step) {
          dir = 'up';
          var revUp = pos + step;
          segs.push({ dir: 'up', from: pos, to: revUp, endIdx: i });
          pos = revUp;
        } else {
          break;
        }
      }
    }
  }

  return segs;
}

function d4fBuildLowerTrendline_(candles, lookback) {
  var closed = candles.slice(0, -1);
  if (closed.length < 10) return null;

  var start = Math.max(0, closed.length - lookback);
  var slice = closed.slice(start);
  var pivots = [];

  for (var i = 2; i < slice.length - 2; i++) {
    var c = slice[i];
    if (
      c.low <= slice[i - 1].low &&
      c.low <= slice[i - 2].low &&
      c.low <= slice[i + 1].low &&
      c.low <= slice[i + 2].low
    ) {
      pivots.push({ idx: start + i, price: c.low });
    }
  }

  if (pivots.length < 2) {
    var lows = slice.map(function (x, j) {
      return { idx: start + j, price: x.low };
    });
    lows.sort(function (a, b) {
      return a.price - b.price;
    });
    pivots = lows.slice(0, 2);
    pivots.sort(function (a, b) {
      return a.idx - b.idx;
    });
  } else {
    pivots = pivots.slice(-2);
  }

  if (pivots.length < 2) return null;

  var a = pivots[0];
  var b = pivots[1];
  if (b.idx === a.idx) return null;

  var slope = (b.price - a.price) / (b.idx - a.idx);
  return {
    i0: a.idx,
    p0: a.price,
    slope: slope,
    valueAt: function (idx) {
      return this.p0 + this.slope * (idx - this.i0);
    },
  };
}

function d4fIsBearishBody_(candle) {
  return candle.close < candle.open;
}

function d4fIsBullishBody_(candle) {
  return candle.close > candle.open;
}

function d4fBuildUpperTrendline_(candles, lookback) {
  var closed = candles.slice(0, -1);
  if (closed.length < 10) return null;

  var start = Math.max(0, closed.length - lookback);
  var slice = closed.slice(start);
  var pivots = [];

  for (var i = 2; i < slice.length - 2; i++) {
    var c = slice[i];
    if (
      c.high >= slice[i - 1].high &&
      c.high >= slice[i - 2].high &&
      c.high >= slice[i + 1].high &&
      c.high >= slice[i + 2].high
    ) {
      pivots.push({ idx: start + i, price: c.high });
    }
  }

  if (pivots.length < 2) return null;
  pivots = pivots.slice(-2);
  var a = pivots[0];
  var b = pivots[1];
  if (b.idx === a.idx) return null;
  var slope = (b.price - a.price) / (b.idx - a.idx);
  return {
    i0: a.idx,
    p0: a.price,
    slope: slope,
    valueAt: function (idx) {
      return this.p0 + this.slope * (idx - this.i0);
    },
  };
}
