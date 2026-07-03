/**
 * ドンチャン・ブレイクアウト順張り: シグナル分析（USD/JPY）
 */
function e5fAnalyzeTrend_(candles1h, cfg, lastPrice) {
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
  var entryHigh = e5fDonchianHigh_(closed, cfg.donchianEntry, n);
  var exitLow = e5fDonchianLow_(closed, cfg.donchianExit, n);
  var adx = e5fCalcAdx_(closed, 14);
  var er = e5fCalcEr_(closes, 10);
  var rsi = e5fCalcRsi_(closes, 14);
  var candleInterval = cfg.candleInterval || '15m';
  var bias4h = e5fCalc4hBias_(closed, candleInterval);

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
  noteParts.push('4H=' + e5fBiasLabelJa_(bias4h));
  if (rsi != null) noteParts.push('RSI=' + rsi.toFixed(1));
  noteParts.push('高' + e5fFormatPrice_(entryHigh) + '/低' + e5fFormatPrice_(exitLow));

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
function e5fRunTrend_(candles1h, ticker, assets, cfg, state, analysis) {
  var price = ticker.last;
  var amount = e5fFormatUsd_(cfg.positionUsd);
  var holding = assets.usd >= E5F_CONFIG.MIN_USD && state.entryPrice != null;

  if (holding) {
    return e5fManagePosition_(ticker, assets, cfg, state, analysis, price, amount);
  }

  if (analysis.signal !== 'buy') {
    e5fLog_('エントリー待ち: ' + analysis.note);
    state.mode = 'wait';
    state.lastSignal = analysis.signal;
    return analysis;
  }

  if (cfg.leaguePauseNew) {
    e5fLog_('リーグ新規停止');
    state.mode = 'flat';
    return analysis;
  }

  var needJpy = price * amount * 1.02;
  if (assets.jpy < needJpy) {
    e5fLog_('紙JPY不足 残' + Math.round(assets.jpy));
    state.mode = 'flat';
    return analysis;
  }

  var entryPrice = e5fFormatPrice_(price);
  e5fPlacePaperOrder_('buy', entryPrice, amount);
  e5fApplyPaperTrade_(state, 'buy', price, amount);
  e5fAppendTradeLog_('買い', entryPrice, amount, 'E5F ドンチャン買い');
  state.entryPrice = entryPrice;
  state.trailHigh = price;
  state.mode = 'long';
  state.lastSignal = 'buy';
  e5fLog_('ドンチャン買い entry=' + state.entryPrice + ' ' + analysis.note);
  return analysis;
}

function e5fManagePosition_(ticker, assets, cfg, state, analysis, price, amount) {
  var entry = state.entryPrice;
  var pct = ((price - entry) / entry) * 100;
  var amt = e5fFormatUsd_(assets.usd);
  if (amt < E5F_CONFIG.MIN_USD) amt = e5fFormatUsd_(cfg.positionUsd);

  if (!state.trailHigh || price > state.trailHigh) state.trailHigh = price;

  if (pct <= -cfg.stopLossPct) {
    e5fClosePosition_(price, amt, cfg, state, '損切り', pct);
    return analysis;
  }

  if (analysis.signal === 'sell') {
    e5fClosePosition_(price, amt, cfg, state, 'ドンチャン売り', pct);
    return analysis;
  }

  var activate = entry * (1 + cfg.trailActivatePct / 100);
  if (price >= activate) {
    var trailSell = e5fFormatPrice_(state.trailHigh * (1 - cfg.trailCallbackPct / 100));
    if (price <= trailSell) {
      e5fClosePosition_(price, amt, cfg, state, 'トレール', pct);
      return analysis;
    }
    e5fPlacePaperOrder_('sell', trailSell, amt);
    e5fAppendTradeLog_('売り', trailSell, amt, 'E5Fトレール指値');
    state.mode = 'long_trail';
    e5fLog_('トレール sell=' + trailSell + ' 含み' + pct.toFixed(2) + '%');
    return analysis;
  }

  e5fLog_('保有中 含み' + pct.toFixed(2) + '% ' + analysis.note);
  state.mode = 'long_hold';
  state.lastSignal = analysis.signal;
  return analysis;
}

function e5fClosePosition_(price, amount, cfg, state, reason, pct) {
  var exitPrice = e5fFormatPrice_(price);
  e5fPlacePaperOrder_('sell', exitPrice, amount);
  e5fApplyPaperTrade_(state, 'sell', price, amount);
  e5fAppendTradeLog_('売り', exitPrice, amount, 'E5F' + reason);
  e5fLog_('決済(' + reason + ') pct=' + (pct != null ? pct.toFixed(2) : '-') + '%');
  state.entryPrice = null;
  state.trailHigh = null;
  state.mode = 'flat';
}
