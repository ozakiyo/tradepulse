/**
 * 柴田罫線順張り: 買いシグナルでロング、売り/損切/トレールで決済（紙トレード）
 */
function d4fRunTrend_(candles1h, ticker, assets, cfg, state, analysis) {
  var price = ticker.last;
  var amount = d4fFormatUsd_(cfg.positionUsd);
  var holding = assets.usd >= D4F_CONFIG.MIN_USD && state.entryPrice != null;

  if (holding) {
    return d4fManagePosition_(ticker, assets, cfg, state, analysis, price, amount);
  }

  if (analysis.signal !== 'buy') {
    d4fLog_('エントリー待ち: ' + analysis.note);
    state.mode = 'wait';
    state.lastSignal = analysis.signal;
    return analysis;
  }

  if (cfg.leaguePauseNew) {
    d4fLog_('リーグ新規停止');
    state.mode = 'flat';
    return analysis;
  }

  var needJpy = price * amount * 1.02;
  if (assets.jpy < needJpy) {
    d4fLog_('紙JPY不足 残' + Math.round(assets.jpy));
    state.mode = 'flat';
    return analysis;
  }

  var entryPrice = d4fFormatPrice_(price);
  d4fPlacePaperOrder_('buy', entryPrice, amount);
  d4fApplyPaperTrade_(state, 'buy', price, amount);
  d4fAppendTradeLog_('買い', entryPrice, amount, 'D4F 柴田買い転換');
  state.entryPrice = entryPrice;
  state.trailHigh = price;
  state.mode = 'long';
  state.lastSignal = 'buy';
  d4fLog_('柴田買い entry=' + state.entryPrice + ' ' + analysis.note);
  return analysis;
}

function d4fManagePosition_(ticker, assets, cfg, state, analysis, price, amount) {
  var entry = state.entryPrice;
  var pct = ((price - entry) / entry) * 100;
  var amt = d4fFormatUsd_(assets.usd);
  if (amt < D4F_CONFIG.MIN_USD) amt = d4fFormatUsd_(cfg.positionUsd);

  if (!state.trailHigh || price > state.trailHigh) state.trailHigh = price;

  if (pct <= -cfg.stopLossPct) {
    d4fClosePosition_(price, amt, cfg, state, '損切り', pct);
    return analysis;
  }

  if (analysis.signal === 'sell') {
    d4fClosePosition_(price, amt, cfg, state, '柴田売り転換', pct);
    return analysis;
  }

  var activate = entry * (1 + cfg.trailActivatePct / 100);
  if (price >= activate) {
    var trailSell = d4fFormatPrice_(state.trailHigh * (1 - cfg.trailCallbackPct / 100));
    if (price <= trailSell) {
      d4fClosePosition_(price, amt, cfg, state, 'トレール', pct);
      return analysis;
    }
    d4fPlacePaperOrder_('sell', trailSell, amt);
    d4fAppendTradeLog_('売り', trailSell, amt, 'D4Fトレール指値');
    state.mode = 'long_trail';
    d4fLog_('トレール sell=' + trailSell + ' 含み' + pct.toFixed(2) + '%');
    return analysis;
  }

  d4fLog_('保有中 含み' + pct.toFixed(2) + '% ' + analysis.note);
  state.mode = 'long_hold';
  state.lastSignal = analysis.signal;
  return analysis;
}

function d4fClosePosition_(price, amount, cfg, state, reason, pct) {
  var exitPrice = d4fFormatPrice_(price);
  d4fPlacePaperOrder_('sell', exitPrice, amount);
  d4fApplyPaperTrade_(state, 'sell', price, amount);
  d4fAppendTradeLog_('売り', exitPrice, amount, 'D4F' + reason);
  d4fLog_('決済(' + reason + ') pct=' + (pct != null ? pct.toFixed(2) : '-') + '%');
  state.entryPrice = null;
  state.trailHigh = null;
  state.mode = 'flat';
}
