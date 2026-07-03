function c3fRunTrend_(candles1h, ticker, assets, cfg, state, pf) {
  var price = ticker.last;
  var amount = c3fFormatUsd_(cfg.positionUsd);
  var holding = assets.usd >= C3F_CONFIG.MIN_USD && state.entryPrice != null;

  if (holding) {
    return c3fManagePosition_(ticker, assets, cfg, state, pf, price, amount);
  }

  if (pf.signal !== 'buy') {
    c3fLog_('エントリー待ち: ' + pf.note);
    state.mode = 'wait';
    state.lastSignal = pf.signal;
    return pf;
  }

  if (cfg.leaguePauseNew) {
    c3fLog_('リーグ新規停止');
    state.mode = 'flat';
    return pf;
  }

  var needJpy = price * amount * 1.02;
  if (assets.jpy < needJpy) {
    c3fLog_('紙JPY不足 残' + Math.round(assets.jpy));
    state.mode = 'flat';
    return pf;
  }

  var entryPrice = c3fFormatPrice_(price);
  c3fPlacePaperOrder_('buy', entryPrice, amount);
  c3fApplyPaperTrade_(state, 'buy', price, amount);
  c3fAppendTradeLog_('買い', entryPrice, amount, 'C3F P&F買い');
  state.entryPrice = entryPrice;
  state.trailHigh = price;
  state.mode = 'long';
  state.lastSignal = 'buy';
  c3fLog_('P&F買い entry=' + state.entryPrice + ' ' + pf.note);
  return pf;
}

function c3fManagePosition_(ticker, assets, cfg, state, pf, price, amount) {
  var entry = state.entryPrice;
  var pct = ((price - entry) / entry) * 100;
  var amt = c3fFormatUsd_(assets.usd);
  if (amt < C3F_CONFIG.MIN_USD) amt = c3fFormatUsd_(cfg.positionUsd);

  if (!state.trailHigh || price > state.trailHigh) state.trailHigh = price;

  if (pct <= -cfg.stopLossPct) {
    c3fClosePosition_(price, amt, cfg, state, '損切り', pct);
    return pf;
  }

  if (pf.signal === 'sell') {
    c3fClosePosition_(price, amt, cfg, state, 'P&F売り', pct);
    return pf;
  }

  var activate = entry * (1 + cfg.trailActivatePct / 100);
  if (price >= activate) {
    var trailSell = c3fFormatPrice_(state.trailHigh * (1 - cfg.trailCallbackPct / 100));
    if (price <= trailSell) {
      c3fClosePosition_(price, amt, cfg, state, 'トレール', pct);
      return pf;
    }
    c3fPlacePaperOrder_('sell', trailSell, amt);
    c3fAppendTradeLog_('売り', trailSell, amt, 'C3Fトレール指値');
    state.mode = 'long_trail';
    c3fLog_('トレール sell=' + trailSell + ' 含み' + pct.toFixed(2) + '%');
    return pf;
  }

  c3fLog_('保有中 含み' + pct.toFixed(2) + '% ' + pf.note);
  state.mode = 'long_hold';
  state.lastSignal = pf.signal;
  return pf;
}

function c3fClosePosition_(price, amount, cfg, state, reason, pct) {
  var exitPrice = c3fFormatPrice_(price);
  c3fPlacePaperOrder_('sell', exitPrice, amount);
  c3fApplyPaperTrade_(state, 'sell', price, amount);
  c3fAppendTradeLog_('売り', exitPrice, amount, 'C3F' + reason);
  c3fLog_('決済(' + reason + ') pct=' + (pct != null ? pct.toFixed(2) : '-') + '%');
  state.entryPrice = null;
  state.trailHigh = null;
  state.mode = 'flat';
}
