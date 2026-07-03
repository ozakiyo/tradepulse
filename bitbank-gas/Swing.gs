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

/** 直近 lookback 本以内に EMA20 が EMA50 を上抜けしたか */
function bbHasRecentEmaCrossUp_(ema20, ema50, n, lookback) {
  if (ema20[n - 1] <= ema50[n - 1] && ema20[n] > ema50[n]) return true;
  var start = Math.max(1, n - (lookback || 0));
  for (var k = start; k <= n; k++) {
    if (ema20[k - 1] <= ema50[k - 1] && ema20[k] > ema50[k]) return true;
  }
  return false;
}

/**
 * スイング買い条件（緩和版）
 * - 上昇構造: EMA20 > EMA50 かつ 価格 > EMA50
 * - エントリー契機: 直近クロス or トレンド継続（SWING_ALLOW_TREND_CONTINUATION）
 * - RSI: SWING_RSI_MIN ～ SWING_RSI_MAX
 */
function bbSwingEntrySignal_(ema20, ema50, n, price, rsi, cfg) {
  var bullishStructure = ema20[n] > ema50[n] && price > ema50[n];
  if (!bullishStructure) {
    return { ok: false, reason: '上昇構造未成立(EMA20<=EMA50 or 価格<=EMA50)' };
  }

  var recentCross = bbHasRecentEmaCrossUp_(ema20, ema50, n, cfg.swingEmaCrossLookback);
  var trendOk = recentCross || cfg.swingAllowTrendContinuation;
  if (!trendOk) {
    return {
      ok: false,
      reason:
        'EMAクロス未確認(lookback=' +
        cfg.swingEmaCrossLookback +
        '本) かつ 継続エントリーOFF',
    };
  }

  if (rsi == null) {
    return { ok: false, reason: 'RSI未取得' };
  }
  if (rsi < cfg.swingRsiMin || rsi > cfg.swingRsiMax) {
    return {
      ok: false,
      reason: 'RSI=' + rsi.toFixed(1) + '(許容' + cfg.swingRsiMin + '～' + cfg.swingRsiMax + ')',
    };
  }

  var trigger = recentCross ? 'EMAクロス' : 'トレンド継続';
  return { ok: true, reason: trigger + ' RSI=' + rsi.toFixed(1) };
}

/**
 * トレンド時: 現物ロング（買い→損切り or トレール利確）
 */
function bbRunSwing_(candles1h, ticker, assets, cfg, state) {
  var closed = candles1h.slice(0, -1);
  var closes = closed.map(function (c) {
    return c.close;
  });
  var ema20 = bbCalcEma_(closes, 20);
  var ema50 = bbCalcEma_(closes, 50);
  var n = closes.length - 1;
  var price = ticker.last;
  var rsi = bbCalcRsi_(closes, 14);
  var entrySignal = bbSwingEntrySignal_(ema20, ema50, n, price, rsi, cfg);

  var holding =
    assets.btc >= BB_CONFIG.MIN_BTC_AMOUNT && state.swingEntry != null && state.swingEntry > 0;

  if (holding) {
    bbManageSwingPosition_(ticker, assets, cfg, state, price);
    return;
  }

  if (cfg.leaguePauseNew) {
    bbLog_('リーグ新規停止: スイングエントリースキップ');
    return;
  }

  bbCancelAllOrders_(cfg);

  var swingAmount = bbFormatBtc_(cfg.swingBtc);
  var needJpy = price * swingAmount * 1.02;

  if (
    entrySignal.ok &&
    assets.btc < BB_CONFIG.MIN_BTC_AMOUNT &&
    swingAmount >= BB_CONFIG.MIN_BTC_AMOUNT &&
    assets.jpy >= needJpy
  ) {
    var buyPrice = Math.round(price);
    bbPlaceLimit_('buy', buyPrice, swingAmount, cfg);
    bbAppendTradeLog_('買い', buyPrice, swingAmount, 'スイング');
    state.swingEntry = buyPrice;
    state.swingTrailHigh = buyPrice;
    state.mode = 'swing_entry';
    bbLog_(
      'スイング買い price=' +
        buyPrice +
        ' amount=' +
        swingAmount +
        ' BTC / ' +
        entrySignal.reason
    );
    return;
  }

  bbLog_('スイング: エントリー条件未達 — ' + entrySignal.reason);
  state.mode = 'swing_wait';
}

/** 保有中: 損切り固定、利確はトレール（上限%オプション） */
function bbManageSwingPosition_(ticker, assets, cfg, state, price) {
  var entry = state.swingEntry;
  var pct = ((price - entry) / entry) * 100;
  var amt = bbFormatBtc_(assets.btc);

  if (!state.swingTrailHigh || price > state.swingTrailHigh) {
    state.swingTrailHigh = price;
  }

  if (pct <= -cfg.swingStopLossPct) {
    bbCancelAllOrders_(cfg);
    bbPlaceLimit_('sell', Math.round(price), amt, cfg);
    bbAppendTradeLog_('売り', Math.round(price), amt, 'スイング損切り');
    bbLog_('スイング損切り pct=' + pct.toFixed(2) + '%');
    state.swingEntry = null;
    state.swingTrailHigh = null;
    state.mode = 'swing_flat';
    return;
  }

  if (cfg.swingMaxProfitPct > 0 && pct >= cfg.swingMaxProfitPct) {
    bbCancelAllOrders_(cfg);
    bbPlaceLimit_('sell', Math.round(price), amt, cfg);
    bbAppendTradeLog_('売り', Math.round(price), amt, 'スイング上限利確');
    bbLog_('スイング上限利確 pct=' + pct.toFixed(2) + '%');
    state.swingEntry = null;
    state.swingTrailHigh = null;
    state.mode = 'swing_flat';
    return;
  }

  var activateFromEntry = entry * (1 + cfg.swingTrailActivatePct / 100);
  if (price >= activateFromEntry) {
    var trailSell = Math.round(state.swingTrailHigh * (1 - cfg.swingTrailCallbackPct / 100));
    if (price <= trailSell) {
      bbCancelAllOrders_(cfg);
      bbPlaceLimit_('sell', Math.round(price), amt, cfg);
      bbAppendTradeLog_('売り', Math.round(price), amt, 'スイングトレール決済');
      bbLog_(
        'スイングトレール決済 pct=' +
          pct.toFixed(2) +
          '% high=' +
          state.swingTrailHigh +
          ' sell=' +
          trailSell
      );
      state.swingEntry = null;
      state.swingTrailHigh = null;
      state.mode = 'swing_flat';
      return;
    }
    bbCancelAllOrders_(cfg);
    bbPlaceLimit_('sell', trailSell, amt, cfg);
    bbAppendTradeLog_('売り', trailSell, amt, 'スイングトレール指値');
    bbLog_(
      'スイングトレール指値 sell=' +
        trailSell +
        ' high=' +
        state.swingTrailHigh +
        ' 含み' +
        pct.toFixed(2) +
        '%'
    );
    state.mode = 'swing_trail';
    return;
  }

  bbLog_('スイング保有中 含み' + pct.toFixed(2) + '%（トレール未稼働）');
  state.mode = 'swing_hold';
}
