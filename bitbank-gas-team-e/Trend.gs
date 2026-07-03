/**
 * ドンチャン・ブレイクアウト順張り: シグナル分析
 */
function e5AnalyzeTrend_(candles1h, cfg, lastPrice) {
  var closed = candles1h.slice(0, -1);
  var need = Math.max(cfg.donchianEntry, cfg.donchianExit) + 5;
  if (closed.length < need) {
    return {
      signal: null,
      note: 'ローソク不足',
      adx: null,
      er: null,
      bias4h: 'neutral',
      donchianHigh: null,
      donchianLow: null,
    };
  }

  var n = closed.length - 1;
  var closes = closed.map(function (c) {
    return c.close;
  });
  var price = lastPrice != null ? lastPrice : closed[n].close;
  var entryHigh = e5DonchianHigh_(closed, cfg.donchianEntry, n);
  var exitLow = e5DonchianLow_(closed, cfg.donchianExit, n);
  var adx = e5CalcAdx_(closed, 14);
  var er = e5CalcEr_(closes, 10);
  var rsi = e5CalcRsi_(closes, 14);
  var candleType = cfg.candleType || '15min';
  var bias4h = e5Calc4hBias_(closed, candleType);

  var trendOk = adx != null && adx >= cfg.adxMin && er != null && er >= cfg.erMin;
  var rsiOk = rsi == null || rsi <= cfg.rsiBuyMax;
  var biasOk = cfg.biasAllowNeutral
    ? bias4h !== 'bearish'
    : bias4h === 'bullish';
  var breakUp = price > entryHigh;
  var breakDown = price < exitLow;

  var signal = null;
  var noteParts = [];

  if (breakUp && trendOk && biasOk && rsiOk) {
    signal = 'buy';
    noteParts.push('ドンチャン上抜け');
  } else if (breakDown) {
    signal = 'sell';
    noteParts.push('ドンチャン下抜け');
  } else {
    noteParts.push('待機');
  }

  if (adx != null) noteParts.push('ADX=' + adx);
  if (er != null) noteParts.push('ER=' + er.toFixed(2));
  noteParts.push('4H=' + e5BiasLabelJa_(bias4h));
  if (rsi != null) noteParts.push('RSI=' + rsi.toFixed(1));
  noteParts.push('高' + Math.round(entryHigh) + '/低' + Math.round(exitLow));

  if (breakUp && !signal) {
    if (!trendOk) noteParts.push('(トレンド弱)');
    if (!biasOk) noteParts.push(cfg.biasAllowNeutral ? '(4H下降)' : '(4H非上昇)');
    if (!rsiOk) noteParts.push('(RSI過熱)');
  }

  return {
    signal: signal,
    note: noteParts.join(' '),
    adx: adx,
    er: er,
    rsi: rsi,
    bias4h: bias4h,
    donchianHigh: entryHigh,
    donchianLow: exitLow,
    price: price,
  };
}

/**
 * 順張り: 買いシグナルでロング、売り/損切/トレールで決済
 */
function e5RunTrend_(candles1h, ticker, assets, cfg, state, analysis) {
  var price = ticker.last;
  var amount = e5FormatBtc_(cfg.positionBtc);
  var holding = assets.btc >= E5_CONFIG.MIN_BTC_AMOUNT && state.entryPrice != null;

  if (holding) {
    return e5ManagePosition_(ticker, assets, cfg, state, analysis, price, amount);
  }

  e5CancelAllOrders_(cfg);

  if (analysis.signal !== 'buy') {
    e5Log_('エントリー待ち: ' + analysis.note);
    state.mode = 'wait';
    state.lastSignal = analysis.signal;
    return analysis;
  }

  var needJpy = price * amount * 1.02;
  if (!cfg.dryRun && assets.jpy < needJpy) {
    e5Log_('JPY不足 必要約' + Math.round(needJpy) + ' 残' + assets.jpy);
    state.mode = 'flat';
    return analysis;
  }
  if (cfg.dryRun && assets.jpy < needJpy) {
    e5Log_('紙JPY不足 残' + Math.round(assets.jpy));
    state.mode = 'flat';
    return analysis;
  }

  var entryPrice = Math.round(price);
  e5PlaceLimit_('buy', entryPrice, amount, cfg);
  if (cfg.dryRun) {
    e5ApplyPaperTrade_(state, 'buy', price, amount);
  }
  e5AppendTradeLog_('買い', entryPrice, amount, 'E5 ドンチャン買い');
  state.entryPrice = entryPrice;
  state.trailHigh = price;
  state.mode = 'long';
  state.lastSignal = 'buy';
  e5Log_('ドンチャン買い entry=' + state.entryPrice + ' ' + analysis.note);
  return analysis;
}

function e5ManagePosition_(ticker, assets, cfg, state, analysis, price, amount) {
  var entry = state.entryPrice;
  var pct = ((price - entry) / entry) * 100;
  var amt = e5FormatBtc_(assets.btc);
  if (amt < E5_CONFIG.MIN_BTC_AMOUNT) amt = e5FormatBtc_(cfg.positionBtc);

  if (!state.trailHigh || price > state.trailHigh) state.trailHigh = price;

  if (pct <= -cfg.stopLossPct) {
    e5ClosePosition_(price, amt, cfg, state, '損切り', pct);
    return analysis;
  }

  if (analysis.signal === 'sell') {
    e5ClosePosition_(price, amt, cfg, state, 'ドンチャン売り', pct);
    return analysis;
  }

  var activate = entry * (1 + cfg.trailActivatePct / 100);
  if (price >= activate) {
    var trailSell = Math.round(state.trailHigh * (1 - cfg.trailCallbackPct / 100));
    if (price <= trailSell) {
      e5ClosePosition_(price, amt, cfg, state, 'トレール', pct);
      return analysis;
    }
    e5CancelAllOrders_(cfg);
    e5PlaceLimit_('sell', trailSell, amt, cfg);
    e5AppendTradeLog_('売り', trailSell, amt, 'E5トレール指値');
    state.mode = 'long_trail';
    e5Log_('トレール sell=' + trailSell + ' 含み' + pct.toFixed(2) + '%');
    return analysis;
  }

  e5Log_('保有中 含み' + pct.toFixed(2) + '% ' + analysis.note);
  state.mode = 'long_hold';
  state.lastSignal = analysis.signal;
  return analysis;
}

function e5ClosePosition_(price, amount, cfg, state, reason, pct) {
  e5CancelAllOrders_(cfg);
  e5PlaceLimit_('sell', Math.round(price), amount, cfg);
  if (cfg.dryRun) {
    e5ApplyPaperTrade_(state, 'sell', price, amount);
  }
  e5AppendTradeLog_('売り', Math.round(price), amount, 'E5' + reason);
  e5Log_('決済(' + reason + ') pct=' + (pct != null ? pct.toFixed(2) : '-') + '%');
  state.entryPrice = null;
  state.trailHigh = null;
  state.mode = 'flat';
}
