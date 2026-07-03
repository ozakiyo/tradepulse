/**
 * チームF: エントリー・決済（マルチ銘柄対応）
 * ロング/ショート両対応。
 * エントリー: 日足トレンド方向 + 1H戻り確定
 * 決済: 1Hダウ理論でトレンド崩壊/反転を検出（Main.gsで判定）
 */

function f6RunTrend_(candles1h, ticker, assets, cfg, state, analysis) {
  var price = ticker.last;
  var inst = f6_ctx.inst;
  var amount = f6FormatPos_(metaLeagueScaleAmount_(inst.defaultPos, cfg));
  var holding = state.mode === 'long' || state.mode === 'short';

  if (holding) {
    return { signal: 'hold', note: '保有中（決済はMain.gsで判定）' };
  }

  if (cfg.leaguePauseNew) {
    f6Log_('リーグ新規停止');
    state.lastSignal = 'pause';
    return analysis;
  }

  if (analysis.signal === 'none') {
    f6Log_('エントリー待ち: ' + analysis.note);
    state.lastSignal = 'none';
    return analysis;
  }

  if (analysis.signal === 'buy') {
    var needJpy = price * amount * 1.02;
    if (assets.jpy < needJpy) {
      f6Log_('紙JPY不足 残' + Math.round(assets.jpy));
      return analysis;
    }
    var entryPrice = f6FormatPrice_(price);

    f6PlacePaperOrder_('buy', entryPrice, amount);
    f6ApplyPaperTrade_('buy', price, amount);
    f6AppendTradeLog_('買い', entryPrice, amount, 'F6 押し目買い');
    f6NotifyEntry_(inst, 'long', entryPrice, '-');

    state.mode = 'long';
    state.positionSide = 'long';
    state.entryPrice = entryPrice;
    state.lastSignal = 'buy';
    f6Log_('買い entry=' + entryPrice + ' ' + analysis.note);
    return analysis;
  }

  if (analysis.signal === 'sell') {
    var needJpy = price * amount * 1.02;
    if (assets.jpy < needJpy) {
      f6Log_('紙JPY不足 残' + Math.round(assets.jpy));
      return analysis;
    }
    var entryPrice = f6FormatPrice_(price);

    f6PlacePaperOrder_('sell', entryPrice, amount);
    f6ApplyPaperTrade_('sell', price, amount);
    f6AppendTradeLog_('売り', entryPrice, amount, 'F6 戻り売り');
    f6NotifyEntry_(inst, 'short', entryPrice, '-');

    state.mode = 'short';
    state.positionSide = 'short';
    state.entryPrice = entryPrice;
    state.lastSignal = 'sell';
    f6Log_('売り entry=' + entryPrice + ' ' + analysis.note);
    return analysis;
  }

  return analysis;
}

/* ---------- 決済 ---------- */

function f6ClosePosition_(price, cfg, state, reason, pct) {
  var inst = f6_ctx.inst;
  var exitPrice = f6FormatPrice_(price);
  var amount = f6FormatPos_(metaLeagueScaleAmount_(inst.defaultPos, cfg));
  var side = state.positionSide;

  if (side === 'long') {
    f6PlacePaperOrder_('sell', exitPrice, amount);
    f6ApplyPaperTrade_('sell', price, amount);
    f6AppendTradeLog_('売り', exitPrice, amount, 'F6 ' + reason);
  } else {
    f6PlacePaperOrder_('buy', exitPrice, amount);
    f6ApplyPaperTrade_('buy', price, amount);
    f6AppendTradeLog_('買い', exitPrice, amount, 'F6 ' + reason);
  }

  f6NotifyExit_(inst, side, exitPrice, reason, pct);
  f6Log_('決済(' + reason + ') ' + side + ' pct=' + (pct != null ? pct.toFixed(2) : '-') + '%');
  state.mode = 'none';
  state.positionSide = null;
  state.entryPrice = null;
  state.stopLoss = null;
  state.pullbackSwing = null;
}
