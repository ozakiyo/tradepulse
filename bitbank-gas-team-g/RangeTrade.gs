/**
 * チームG レンジ売買（買いのみ）
 * - 1H下限付近: 買い
 * - 1H幅×TP_RATIO: 売り（利確）
 * - 1H下限割れ: 半分損切 / 日足下抜け: 残り損切
 */

function gSellAmount_(pair, ps, sellAmt, price, cfg, state, memo) {
  var inst = gGetInstrument_(pair);
  var amt = gFormatAmount_(pair, sellAmt);
  if (amt < inst.minAmount) return false;
  var sellPrice = gRoundPrice_(pair, price);
  gPlaceLimit_(pair, 'sell', sellPrice, amt, cfg);
  if (cfg.dryRun) {
    gApplyPaperTrade_(state, pair, 'sell', sellPrice, amt);
  }
  gAppendTradeLog_(pair, '売り', sellPrice, amt, memo);
  gLog_(pair + ' ' + memo + ' sell @' + sellPrice + ' x' + amt);
  var remain = gFormatAmount_(pair, ps.position.amount - amt);
  if (remain >= inst.minAmount) {
    ps.position.amount = remain;
  } else {
    ps.position = null;
  }
  return true;
}

/** 保有ポジションの決済判定。決済時はメモ文字列、未決済は null */
function gManageOpenPosition_(pair, ps, price, daily, h1, cfg, state) {
  var inst = gGetInstrument_(pair);
  if (!ps.position || ps.position.amount < inst.minAmount) return null;

  if (gIsDailyBreakBelow_(price, daily.low)) {
    var dailyMemo = ps.position.h1PartialDone ? 'G日足損切(残り)' : 'G日足損切';
    gSellAmount_(pair, ps, ps.position.amount, price, cfg, state, dailyMemo);
    return '日足損切';
  }

  if (!ps.position.h1PartialDone && h1.low && gIsH1BreakBelow_(price, h1.low)) {
    var split = gCalcPartialCloseAmount_(pair, ps.position.amount, cfg.partialStopRatio);
    var pctLabel = Math.round(cfg.partialStopRatio * 100) + '%';
    if (split.canSplit) {
      gSellAmount_(pair, ps, split.closeAmount, price, cfg, state, 'G1H損切(' + pctLabel + ')');
      if (ps.position) ps.position.h1PartialDone = true;
      return '1H損切(' + pctLabel + ')';
    }
    gSellAmount_(pair, ps, ps.position.amount, price, cfg, state, 'G1H損切(全量)');
    return '1H損切(全量)';
  }

  if (h1.high && h1.low) {
    var tpPrice = gCalcTakeProfit_(h1, cfg.tpRatio);
    if (gIsAtOrPastTakeProfit_(price, tpPrice, cfg.touchPct, ps.position.entryPrice)) {
      var tpPctLabel = Math.round(cfg.tpRatio * 100) + '%';
      var tpMemo = ps.position.h1PartialDone
        ? 'Gレンジ利確(残りTP' + tpPctLabel + ')'
        : 'Gレンジ利確(TP' + tpPctLabel + ')';
      gSellAmount_(pair, ps, ps.position.amount, price, cfg, state, tpMemo);
      return '利確';
    }
  }

  return null;
}

function gRunRangeForPair_(pair, cfg, state) {
  var inst = gGetInstrument_(pair);
  var ps = gGetPairState_(state, pair);
  var active = false;
  var notes = [];

  var ticker = gGetTicker_(pair);
  var candles1h = gGetCandles1h_(pair);
  var candles5m = gGetCandles5m_(pair);
  var candlesDaily = gAggregateDailyFrom1h_(candles1h, cfg.dailyLookback + 5);
  var closed5m = gGetLastClosed5m_(candles5m);

  if (candles1h.length < G_CONFIG.MIN_CANDLES_1H) {
    return { active: false, activeNote: '1Hローソク不足', ticker: ticker, daily: null, h1: null };
  }
  if (!closed5m) {
    return { active: false, activeNote: '5分足不足', ticker: ticker, daily: null, h1: null };
  }

  var daily = gDetectDailyRange_(candlesDaily, cfg);
  var h1 = gDetectH1Range_(candles1h, daily, cfg);
  var price = closed5m.close;
  var assets = gGetAssetsForRun_(cfg, state, pair);

  ps.lastDailyNote = daily.note;
  ps.lastH1Note = h1.note;

  var hasPos = ps.position && ps.position.amount >= inst.minAmount;

  if (hasPos) {
    var exitNote = gManageOpenPosition_(pair, ps, price, daily, h1, cfg, state);
    if (exitNote) {
      active = true;
      notes.push(exitNote);
    } else {
      ps.lastSignal = ps.position.h1PartialDone ? '保有中(残)' : '保有中';
    }
    return {
      active: active,
      activeNote: notes.join(', ') || ps.lastSignal,
      ticker: ticker,
      daily: daily,
      h1: h1,
      price: price,
      assets: assets,
    };
  }

  if (!daily.isRange || !h1.isRange) {
    ps.lastSignal = '待機(' + (daily.isRange ? '' : '日足NG') + (h1.isRange ? '' : '1HNG') + ')';
    return {
      active: false,
      activeNote: ps.lastSignal,
      ticker: ticker,
      daily: daily,
      h1: h1,
      price: price,
      assets: assets,
    };
  }

  /** 新規買い: 1H下限付近 */
  if (gIsNearLower_(price, h1.low, cfg.touchPct)) {
    if (cfg.leaguePauseNew) {
      ps.lastSignal = 'リーグ新規停止';
      return {
        active: false,
        activeNote: ps.lastSignal,
        ticker: ticker,
        daily: daily,
        h1: h1,
        price: price,
        assets: assets,
      };
    }
    if (gCountOpenPositions_(state) >= cfg.maxOpenPositions) {
      ps.lastSignal = '買い見送り(保有上限)';
      return {
        active: false,
        activeNote: ps.lastSignal,
        ticker: ticker,
        daily: daily,
        h1: h1,
        price: price,
        assets: assets,
      };
    }
    var buyAmt = gFormatAmount_(pair, inst.defaultAmount);
    if (buyAmt < inst.minAmount) buyAmt = inst.minAmount;
    var buyPx = gRoundPrice_(pair, price);
    var needJpy = buyPx * buyAmt * 1.02;
    if (assets.jpy < needJpy) {
      ps.lastSignal = 'JPY不足';
      return {
        active: false,
        activeNote: 'JPY不足 必要約' + Math.round(needJpy),
        ticker: ticker,
        daily: daily,
        h1: h1,
        price: price,
        assets: assets,
      };
    }
    if (needJpy > cfg.maxJpyPerPair) {
      ps.lastSignal = '銘柄上限超過';
      return {
        active: false,
        activeNote: '1銘柄上限' + cfg.maxJpyPerPair + '円超',
        ticker: ticker,
        daily: daily,
        h1: h1,
        price: price,
        assets: assets,
      };
    }
    gPlaceLimit_(pair, 'buy', buyPx, buyAmt, cfg);
    if (cfg.dryRun) {
      gApplyPaperTrade_(state, pair, 'buy', buyPx, buyAmt);
    }
    gAppendTradeLog_(pair, '買い', buyPx, buyAmt, 'Gレンジ下限買い');
    ps.position = {
      amount: buyAmt,
      entryPrice: buyPx,
      entryAt: new Date().toISOString(),
      h1PartialDone: false,
    };
    gLog_(pair + ' 下限買い buy @' + buyPx + ' x' + buyAmt);
    active = true;
    notes.push('下限買い');
    ps.lastSignal = '買い@' + buyPx;
  } else {
    ps.lastSignal = 'レンジ内待機';
  }

  return {
    active: active,
    activeNote: notes.join(', ') || ps.lastSignal,
    ticker: ticker,
    daily: daily,
    h1: h1,
    price: price,
    assets: assets,
  };
}
