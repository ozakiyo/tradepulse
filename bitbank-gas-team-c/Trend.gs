/**
 * P&F順張り: 買いシグナルでロング、売り/損切/トレールで決済
 */
function c3RunTrend_(candles1h, ticker, assets, cfg, state, pf) {
  var price = ticker.last;
  var amount = c3FormatBtc_(cfg.positionBtc);
  var holding = assets.btc >= C3_CONFIG.MIN_BTC_AMOUNT && state.entryPrice != null;

  if (holding) {
    return c3ManagePosition_(ticker, assets, cfg, state, pf, price, amount);
  }

  c3CancelAllOrders_(cfg);

  if (pf.signal !== 'buy') {
    c3Log_('エントリー待ち: ' + pf.note);
    state.mode = 'wait';
    state.lastSignal = pf.signal;
    return pf;
  }

  var needJpy = price * amount * 1.02;
  if (!cfg.dryRun && assets.jpy < needJpy) {
    c3Log_('JPY不足 必要約' + Math.round(needJpy) + ' 残' + assets.jpy);
    state.mode = 'flat';
    return pf;
  }
  if (cfg.dryRun && assets.jpy < needJpy) {
    c3Log_('紙JPY不足 残' + Math.round(assets.jpy));
    state.mode = 'flat';
    return pf;
  }

  c3PlaceLimit_('buy', Math.round(price), amount, cfg);
  if (cfg.dryRun) {
    c3ApplyPaperTrade_(state, 'buy', price, amount);
  }
  c3AppendTradeLog_('買い', Math.round(price), amount, 'C3 P&F買い');
  state.entryPrice = Math.round(price);
  state.trailHigh = price;
  state.mode = 'long';
  state.lastSignal = 'buy';
  c3Log_('P&F買い entry=' + state.entryPrice + ' ' + pf.note);
  return pf;
}

function c3ManagePosition_(ticker, assets, cfg, state, pf, price, amount) {
  var entry = state.entryPrice;
  var pct = ((price - entry) / entry) * 100;
  var amt = c3FormatBtc_(assets.btc);
  if (amt < C3_CONFIG.MIN_BTC_AMOUNT) amt = c3FormatBtc_(cfg.positionBtc);

  if (!state.trailHigh || price > state.trailHigh) state.trailHigh = price;

  if (pct <= -cfg.stopLossPct) {
    c3ClosePosition_(price, amt, cfg, state, '損切り', pct);
    return pf;
  }

  if (pf.signal === 'sell') {
    c3ClosePosition_(price, amt, cfg, state, 'P&F売り', pct);
    return pf;
  }

  var activate = entry * (1 + cfg.trailActivatePct / 100);
  if (price >= activate) {
    var trailSell = Math.round(state.trailHigh * (1 - cfg.trailCallbackPct / 100));
    if (price <= trailSell) {
      c3ClosePosition_(price, amt, cfg, state, 'トレール', pct);
      return pf;
    }
    c3CancelAllOrders_(cfg);
    c3PlaceLimit_('sell', trailSell, amt, cfg);
    c3AppendTradeLog_('売り', trailSell, amt, 'C3トレール指値');
    state.mode = 'long_trail';
    c3Log_('トレール sell=' + trailSell + ' 含み' + pct.toFixed(2) + '%');
    return pf;
  }

  c3Log_('保有中 含み' + pct.toFixed(2) + '% ' + pf.note);
  state.mode = 'long_hold';
  state.lastSignal = pf.signal;
  return pf;
}

function c3ClosePosition_(price, amount, cfg, state, reason, pct) {
  c3CancelAllOrders_(cfg);
  c3PlaceLimit_('sell', Math.round(price), amount, cfg);
  if (cfg.dryRun) {
    c3ApplyPaperTrade_(state, 'sell', price, amount);
  }
  c3AppendTradeLog_('売り', Math.round(price), amount, 'C3' + reason);
  c3Log_('決済(' + reason + ') pct=' + (pct != null ? pct.toFixed(2) : '-') + '%');
  state.entryPrice = null;
  state.trailHigh = null;
  state.mode = 'flat';
}
