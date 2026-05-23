function bbCalcRsi_(closes, period) {
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

function bbTrendBias4h_(candles) {
  var closes = candles.map(function (c) {
    return c.close;
  });
  if (closes.length < 55) return 'neutral';
  var ema20 = bbCalcEma_(closes, 20);
  var ema50 = bbCalcEma_(closes, 50);
  var n = closes.length - 1;
  var price = closes[n];
  if (price > ema50[n] && ema20[n] > ema50[n]) return 'bullish';
  if (price < ema50[n] && ema20[n] < ema50[n]) return 'bearish';
  return 'neutral';
}

/**
 * トレンド時: 現物ロングの簡易スイング（買い→利確/損切り）
 */
function bbRunSwing_(candles1h, ticker, assets, cfg, state) {
  bbCancelAllOrders_(cfg);

  var closed = candles1h.slice(0, -1);
  var closes = closed.map(function (c) {
    return c.close;
  });
  var ema20 = bbCalcEma_(closes, 20);
  var ema50 = bbCalcEma_(closes, 50);
  var n = closes.length - 1;
  var prev = n - 1;
  var price = ticker.last;
  var rsi = bbCalcRsi_(closes, 14);
  var crossUp = ema20[prev] <= ema50[prev] && ema20[n] > ema50[n];

  if (assets.btc >= BB_CONFIG.MIN_BTC_AMOUNT && state.swingEntry) {
    var entry = state.swingEntry;
    var pct = ((price - entry) / entry) * 100;
    if (pct <= -cfg.swingStopLossPct || pct >= cfg.swingTakeProfitPct) {
      var amt = bbFormatBtc_(assets.btc);
    bbPlaceLimit_('sell', Math.round(price), amt, cfg);
    bbAppendTradeLog_('売り', Math.round(price), amt, 'スイング手仕舞い');
    bbLog_('スイング手仕舞い pct=' + pct.toFixed(2) + '%');
      state.swingEntry = null;
      state.mode = 'swing_flat';
      return;
    }
    bbLog_('スイング保有中 含み' + pct.toFixed(2) + '%');
    state.mode = 'swing_hold';
    return;
  }

  var swingAmount = bbFormatBtc_(cfg.swingBtc);
  var needJpy = price * swingAmount * 1.02;

  if (
    crossUp &&
    rsi != null &&
    rsi >= 42 &&
    rsi <= 65 &&
    assets.btc < BB_CONFIG.MIN_BTC_AMOUNT &&
    swingAmount >= BB_CONFIG.MIN_BTC_AMOUNT &&
    assets.jpy >= needJpy
  ) {
    var buyPrice = Math.round(price);
    bbPlaceLimit_('buy', buyPrice, swingAmount, cfg);
    bbAppendTradeLog_('買い', buyPrice, swingAmount, 'スイング');
    state.swingEntry = buyPrice;
    state.mode = 'swing_entry';
    bbLog_('スイング買い price=' + buyPrice + ' amount=' + swingAmount + ' BTC');
    return;
  }

  bbLog_('スイング: エントリー条件未達');
  state.mode = 'swing_wait';
}
