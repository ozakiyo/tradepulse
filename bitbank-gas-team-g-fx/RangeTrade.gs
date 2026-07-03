/**
 * FXレンジ: 1H下限→ロング / 1H上限→ショート / 幅×TP_RATIOで利確
 * 1H逆方向ブレイク→半分損切 / 日足逆方向ブレイク→残り損切
 */

function gfxClosePosition_(pairId, pos, price, cfg, state, ps, memo) {
  var units = gfxFormatUnits_(pairId, pos.units);
  gfxPlacePaperOrder_(pairId, '決済', pos.side, price, units);
  gfxApplyPaperClose_(state, pairId, pos.side, pos.entryPrice, price, units, cfg);
  var sideLabel = pos.side === 'long' ? 'ロング決済' : 'ショート決済';
  gfxAppendTradeLog_(pairId, sideLabel, price, units, memo);
  gfxLog_(pairId + ' ' + memo + ' ' + pos.side + ' @' + price);
  ps.position = null;
}

function gfxClosePartial_(pairId, pos, closeUnits, price, cfg, state, ps, memo) {
  var inst = gfxGetInstrument_(pairId);
  var units = gfxFormatUnits_(pairId, closeUnits);
  if (units < inst.minUnits) return false;
  gfxPlacePaperOrder_(pairId, '決済', pos.side, price, units);
  gfxApplyPaperClose_(state, pairId, pos.side, pos.entryPrice, price, units, cfg);
  var sideLabel = pos.side === 'long' ? 'ロング決済' : 'ショート決済';
  gfxAppendTradeLog_(pairId, sideLabel, price, units, memo);
  gfxLog_(pairId + ' ' + memo + ' ' + pos.side + ' @' + price + ' x' + units);
  var remain = gfxFormatUnits_(pairId, pos.units - units);
  if (remain >= inst.minUnits) {
    pos.units = remain;
    pos.h1PartialDone = true;
    ps.position = pos;
  } else {
    ps.position = null;
  }
  return true;
}

function gfxOpenPosition_(pairId, side, price, cfg, state, ps, memo) {
  var inst = gfxGetInstrument_(pairId);
  var units = gfxFormatUnits_(pairId, inst.defaultUnits);
  if (units < inst.minUnits) units = inst.minUnits;
  var margin = gfxMarginJpy_(pairId, price, units, cfg);
  var assets = gfxGetAssetsForRun_(cfg, state);
  if (assets.jpy < margin * 1.05) {
    ps.lastSignal = '証拠金不足';
    return false;
  }
  if (margin > cfg.maxMarginJpyPerPair) {
    ps.lastSignal = '銘柄上限超過';
    return false;
  }
  var entryPx = gfxRoundPrice_(pairId, price);
  gfxPlacePaperOrder_(pairId, '新規', side, entryPx, units);
  gfxApplyPaperOpen_(state, pairId, side, entryPx, units, cfg);
  var label = side === 'long' ? 'ロング新規' : 'ショート新規';
  gfxAppendTradeLog_(pairId, label, entryPx, units, memo);
  ps.position = {
    side: side,
    units: units,
    entryPrice: entryPx,
    entryAt: new Date().toISOString(),
    h1PartialDone: false,
  };
  ps.lastSignal = label + '@' + entryPx;
  gfxLog_(pairId + ' ' + memo + ' ' + side + ' @' + entryPx + ' x' + units);
  return true;
}

/** 保有ポジションの決済判定。決済時はメモ文字列、未決済は null */
function gfxManageOpenPosition_(pairId, ps, price, daily, h1, cfg, state) {
  var pos = ps.position;
  if (!pos || !pos.side) return null;
  var inst = gfxGetInstrument_(pairId);
  if (pos.units < inst.minUnits) return null;

  if (gfxIsDailyAdverseBreak_(price, daily, pos.side)) {
    var dailyMemo = pos.h1PartialDone ? 'GFX日足損切(残り)' : 'GFX日足損切';
    gfxClosePosition_(pairId, pos, price, cfg, state, ps, dailyMemo);
    return '日足損切';
  }

  if (!pos.h1PartialDone && gfxIsH1AdverseBreak_(price, h1, pos.side)) {
    var split = gfxCalcPartialCloseUnits_(pairId, pos.units, cfg.partialStopRatio);
    var pctLabel = Math.round(cfg.partialStopRatio * 100) + '%';
    if (split.canSplit) {
      gfxClosePartial_(pairId, pos, split.closeUnits, price, cfg, state, ps, 'GFX1H損切(' + pctLabel + ')');
      if (ps.position) ps.position.h1PartialDone = true;
      return '1H損切(' + pctLabel + ')';
    }
    gfxClosePosition_(pairId, pos, price, cfg, state, ps, 'GFX1H損切(全量)');
    return '1H損切(全量)';
  }

  var tpPrice = gfxCalcTakeProfit_(pos.side, h1, cfg.tpRatio);
  if (gfxIsAtOrPastTakeProfit_(price, tpPrice, pos.side, cfg.touchPct)) {
    var tpPctLabel = Math.round(cfg.tpRatio * 100) + '%';
    var tpMemo =
      pos.side === 'long'
        ? pos.h1PartialDone
          ? 'GFXロング利確(残りTP' + tpPctLabel + ')'
          : 'GFXロング利確(TP' + tpPctLabel + ')'
        : pos.h1PartialDone
          ? 'GFXショート利確(残りTP' + tpPctLabel + ')'
          : 'GFXショート利確(TP' + tpPctLabel + ')';
    gfxClosePosition_(pairId, pos, price, cfg, state, ps, tpMemo);
    return pos.side === 'long' ? 'ロング利確' : 'ショート利確';
  }

  return null;
}

function gfxRunRangeForPair_(pairId, cfg, state) {
  var ps = gfxGetPairState_(state, pairId);
  var active = false;
  var notes = [];

  var ticker = gfxGetTicker_(pairId);
  var candles1h = gfxGetCandles1h_(pairId);
  var candles5m = gfxGetCandles5m_(pairId);
  var candlesDaily = gfxAggregateDailyFrom1h_(candles1h, cfg.dailyLookback + 5);
  var closed5m = gfxGetLastClosed5m_(candles5m);

  if (candles1h.length < GFX_CONFIG.MIN_CANDLES_1H) {
    return { active: false, activeNote: '1H不足', ticker: ticker, daily: null, h1: null };
  }
  if (!closed5m) {
    return { active: false, activeNote: '5分足不足', ticker: ticker, daily: null, h1: null };
  }

  var daily = gfxDetectDailyRange_(candlesDaily, cfg);
  var h1 = gfxDetectH1Range_(candles1h, daily, cfg);
  var price = closed5m.close;
  var assets = gfxGetAssetsForRun_(cfg, state);

  ps.lastDailyNote = daily.note;
  ps.lastH1Note = h1.note;

  var pos = ps.position;
  var hasPos = pos && pos.side && pos.units > 0;

  if (hasPos) {
    var exitNote = gfxManageOpenPosition_(pairId, ps, price, daily, h1, cfg, state);
    if (exitNote) {
      active = true;
      notes.push(exitNote);
    } else {
      ps.lastSignal = pos.h1PartialDone ? '保有(' + pos.side + '残)' : '保有(' + pos.side + ')';
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

  if (gfxCountOpenPositions_(state) >= cfg.maxOpenPositions) {
    ps.lastSignal = '新規見送り(保有上限)';
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

  if (gfxIsNearLower_(price, h1.low, cfg.touchPct)) {
    if (cfg.leaguePauseNew) {
      ps.lastSignal = 'リーグ新規停止';
    } else if (gfxOpenPosition_(pairId, 'long', price, cfg, state, ps, 'GFXレンジ下限ロング')) {
      active = true;
      notes.push('下限ロング');
    }
  } else if (gfxIsNearUpper_(price, h1.high, cfg.touchPct)) {
    if (cfg.leaguePauseNew) {
      ps.lastSignal = 'リーグ新規停止';
    } else if (gfxOpenPosition_(pairId, 'short', price, cfg, state, ps, 'GFXレンジ上限ショート')) {
      active = true;
      notes.push('上限ショート');
    }
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
