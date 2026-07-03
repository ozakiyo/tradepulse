/**
 * 4H パーフェクトオーダー + 保ち合い + ブレイクアウト検出
 */

function gcboEmaSeries_(closes, period) {
  if (!closes || closes.length < period) return [];
  var k = 2 / (period + 1);
  var ema = [closes[0]];
  for (var i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function gcboAvgBody_(candles, lookback) {
  if (!candles || candles.length < 2) return 0;
  var n = Math.min(lookback || 20, candles.length - 1);
  var sum = 0;
  for (var i = candles.length - 1 - n; i < candles.length - 1; i++) {
    if (i < 0) continue;
    sum += Math.abs(candles[i].close - candles[i].open);
  }
  return n > 0 ? sum / n : 0;
}

function gcboDetectPerfectOrder_(ema10, ema20, ema50, slopeBars) {
  var i = ema10.length - 2;
  if (i < slopeBars) return { ok: false, side: null, note: 'EMA不足' };

  var longPo = ema10[i] > ema20[i] && ema20[i] > ema50[i];
  var shortPo = ema10[i] < ema20[i] && ema20[i] < ema50[i];
  if (!longPo && !shortPo) return { ok: false, side: null, note: 'PO未成立' };

  var side = longPo ? 'long' : 'short';
  var i0 = i - slopeBars;
  var slopeOk;
  if (side === 'long') {
    slopeOk = ema10[i] > ema10[i0] && ema20[i] > ema20[i0] && ema50[i] > ema50[i0];
  } else {
    slopeOk = ema10[i] < ema10[i0] && ema20[i] < ema20[i0] && ema50[i] < ema50[i0];
  }
  if (!slopeOk) return { ok: false, side: null, note: 'PO傾きNG' };

  return {
    ok: true,
    side: side,
    ema10: ema10[i],
    ema20: ema20[i],
    ema50: ema50[i],
    note: 'PO' + (side === 'long' ? '上昇' : '下降'),
  };
}

function gcboDetectConsolidation_(candles4h, cfg, breakoutIndex) {
  var look = cfg.consolidationBars;
  var end = breakoutIndex;
  if (!candles4h || end < look + 1) {
    return { ok: false, resistance: null, support: null, widthPct: null, note: '保ち合い不足' };
  }
  var slice = candles4h.slice(end - look, end);
  var high = slice[0].high;
  var low = slice[0].low;
  for (var j = 1; j < slice.length; j++) {
    high = Math.max(high, slice[j].high);
    low = Math.min(low, slice[j].low);
  }
  var mid = (high + low) / 2;
  var widthPct = mid > 0 ? ((high - low) / mid) * 100 : null;
  var ok = widthPct != null && widthPct <= cfg.consolidationMaxPct;
  return {
    ok: ok,
    resistance: high,
    support: low,
    widthPct: widthPct,
    note:
      '保ち合い' +
      look +
      '本 幅' +
      (widthPct != null ? widthPct.toFixed(2) : '-') +
      '%' +
      (ok ? '' : 'NG'),
  };
}

function gcboIsBreakoutCandle_(candle, cons, side, cfg, candles4h) {
  if (!candle || !cons || !cons.ok) return false;
  var body = Math.abs(candle.close - candle.open);
  var avgBody = gcboAvgBody_(candles4h, 20);
  if (avgBody > 0 && body < avgBody * cfg.breakoutBodyMult) return false;
  if (side === 'long') {
    return candle.close > candle.open && candle.close > cons.resistance;
  }
  return candle.close < candle.open && candle.close < cons.support;
}

function gcboCalcStopLoss_(pairId, side, breakoutCandle, cfg) {
  var buf = (cfg.stopBufferPct || 0.02) / 100;
  if (side === 'long') {
    return gcboRoundPrice_(pairId, breakoutCandle.low * (1 - buf));
  }
  return gcboRoundPrice_(pairId, breakoutCandle.high * (1 + buf));
}

function gcboIsStopHit_(price, stopLoss, side) {
  if (price == null || stopLoss == null) return false;
  if (side === 'long') return price <= stopLoss;
  return price >= stopLoss;
}

function gcboIsEma20BodyExit_(candle, ema20, side) {
  if (!candle || ema20 == null) return false;
  if (side === 'long') return candle.close < ema20 && candle.open < ema20;
  return candle.close > ema20 && candle.open > ema20;
}

function gcboBuildBreakoutSetup_(candles4h, cfg) {
  if (!candles4h || candles4h.length < cfg.minCandles4h) {
    return {
      ok: false,
      po: { ok: false, note: '4H不足' },
      cons: { ok: false, note: '4H不足' },
      breakout: false,
      side: null,
      closed4h: null,
      ema20: null,
      note: '4H不足',
    };
  }

  var closes = candles4h.map(function (c) {
    return c.close;
  });
  var ema10 = gcboEmaSeries_(closes, cfg.emaFast);
  var ema20 = gcboEmaSeries_(closes, cfg.emaMid);
  var ema50 = gcboEmaSeries_(closes, cfg.emaSlow);
  var breakoutIndex = candles4h.length - 2;
  var closed4h = candles4h[breakoutIndex];

  var po = gcboDetectPerfectOrder_(ema10, ema20, ema50, cfg.slopeBars);
  var cons = gcboDetectConsolidation_(candles4h, cfg, breakoutIndex);
  var breakout = false;
  var side = null;

  if (po.ok && cons.ok) {
    side = po.side;
    breakout = gcboIsBreakoutCandle_(closed4h, cons, side, cfg, candles4h);
  }

  var note = po.note;
  if (cons.ok) note += ' / ' + cons.note;
  if (breakout) note += ' / ブレイク' + (side === 'long' ? '上' : '下');

  return {
    ok: po.ok && cons.ok && breakout,
    po: po,
    cons: cons,
    breakout: breakout,
    side: side,
    closed4h: closed4h,
    ema20: ema20[breakoutIndex],
    ema10: ema10,
    ema20s: ema20,
    ema50: ema50,
    note: note,
  };
}

function gcboMapSetupToLog_(setup) {
  setup = setup || {};
  var po = setup.po || {};
  var cons = setup.cons || {};
  return {
    daily: {
      isRange: po.ok,
      high: cons.resistance,
      low: cons.support,
      widthPct: cons.widthPct,
      note: po.note || '',
    },
    h1: {
      isRange: cons.ok,
      high: setup.ema20,
      low: null,
      widthPct: null,
      note: cons.note || '',
    },
  };
}
