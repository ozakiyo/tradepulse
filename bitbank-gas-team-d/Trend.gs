/**
 * 柴田罫線順張り: 買いシグナルでロング、売り/損切/トレールで決済
 */
function d4RunTrend_(candles1h, ticker, assets, cfg, state, analysis) {
  var price = ticker.last;
  var amount = d4FormatBtc_(cfg.positionBtc);
  var holding = assets.btc >= D4_CONFIG.MIN_BTC_AMOUNT && state.entryPrice != null;

  if (holding) {
    return d4ManagePosition_(ticker, assets, cfg, state, analysis, price, amount);
  }

  d4CancelAllOrders_(cfg);

  if (analysis.signal !== 'buy') {
    d4Log_('エントリー待ち: ' + analysis.note);
    state.mode = 'wait';
    state.lastSignal = analysis.signal;
    return analysis;
  }

  var needJpy = price * amount * 1.02;
  if (!cfg.dryRun && assets.jpy < needJpy) {
    d4Log_('JPY不足 必要約' + Math.round(needJpy) + ' 残' + assets.jpy);
    state.mode = 'flat';
    return analysis;
  }
  if (cfg.dryRun && assets.jpy < needJpy) {
    d4Log_('紙JPY不足 残' + Math.round(assets.jpy));
    state.mode = 'flat';
    return analysis;
  }

  var entryPrice = Math.round(price);
  d4PlaceLimit_('buy', entryPrice, amount, cfg);
  if (cfg.dryRun) {
    d4ApplyPaperTrade_(state, 'buy', price, amount);
  }
  d4AppendTradeLog_('買い', entryPrice, amount, 'D4 柴田買い転換');
  state.entryPrice = entryPrice;
  state.trailHigh = price;
  state.mode = 'long';
  state.lastSignal = 'buy';
  d4Log_('柴田買い entry=' + state.entryPrice + ' ' + analysis.note);
  return analysis;
}

function d4ManagePosition_(ticker, assets, cfg, state, analysis, price, amount) {
  var entry = state.entryPrice;
  var pct = ((price - entry) / entry) * 100;
  var amt = d4FormatBtc_(assets.btc);
  if (amt < D4_CONFIG.MIN_BTC_AMOUNT) amt = d4FormatBtc_(cfg.positionBtc);

  if (!state.trailHigh || price > state.trailHigh) state.trailHigh = price;

  if (pct <= -cfg.stopLossPct) {
    d4ClosePosition_(price, amt, cfg, state, '損切り', pct);
    return analysis;
  }

  if (analysis.signal === 'sell') {
    d4ClosePosition_(price, amt, cfg, state, '柴田売り転換', pct);
    return analysis;
  }

  var activate = entry * (1 + cfg.trailActivatePct / 100);
  if (price >= activate) {
    var trailSell = Math.round(state.trailHigh * (1 - cfg.trailCallbackPct / 100));
    if (price <= trailSell) {
      d4ClosePosition_(price, amt, cfg, state, 'トレール', pct);
      return analysis;
    }
    d4CancelAllOrders_(cfg);
    d4PlaceLimit_('sell', trailSell, amt, cfg);
    d4AppendTradeLog_('売り', trailSell, amt, 'D4トレール指値');
    state.mode = 'long_trail';
    d4Log_('トレール sell=' + trailSell + ' 含み' + pct.toFixed(2) + '%');
    return analysis;
  }

  d4Log_('保有中 含み' + pct.toFixed(2) + '% ' + analysis.note);
  state.mode = 'long_hold';
  state.lastSignal = analysis.signal;
  return analysis;
}

function d4ClosePosition_(price, amount, cfg, state, reason, pct) {
  var exitPrice = Math.round(price);
  d4CancelAllOrders_(cfg);
  d4PlaceLimit_('sell', exitPrice, amount, cfg);
  if (cfg.dryRun) {
    d4ApplyPaperTrade_(state, 'sell', price, amount);
  }
  d4AppendTradeLog_('売り', exitPrice, amount, 'D4' + reason);
  d4Log_('決済(' + reason + ') pct=' + (pct != null ? pct.toFixed(2) : '-') + '%');
  state.entryPrice = null;
  state.trailHigh = null;
  state.mode = 'flat';
}
