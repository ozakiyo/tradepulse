/**
 * レンジ: 1H下限→ロング / 1H上限→ショート / 幅×TP_RATIOで利確
 * 1H逆方向ブレイク→半分損切 / 日足逆方向ブレイク→残り損切
 */

function gcfxClosePosition_(pairId, pos, price, cfg, state, ps, memo) {
  var units = gcfxFormatUnits_(pairId, pos.units);
  gcfxPlaceOrder_(pairId, '決済', pos.side, price, units, cfg, state, ps);
  if (cfg.dryRun) {
    gcfxApplyPaperClose_(state, pairId, pos.side, pos.entryPrice, price, units, cfg);
  }
  var sideLabel = pos.side === 'long' ? 'ロング決済' : 'ショート決済';
  gcfxAppendTradeLog_(pairId, sideLabel, price, units, memo);
  gcfxLog_(pairId + ' ' + memo + ' ' + pos.side + ' @' + price);
  ps.position = null;
}

function gcfxClosePartial_(pairId, pos, closeUnits, price, cfg, state, ps, memo) {
  var inst = gcfxGetInstrument_(pairId);
  var units = gcfxFormatUnits_(pairId, closeUnits);
  if (units < inst.minUnits) return false;
  gcfxPlaceOrder_(pairId, '決済', pos.side, price, units, cfg, state, ps);
  if (cfg.dryRun) {
    gcfxApplyPaperClose_(state, pairId, pos.side, pos.entryPrice, price, units, cfg);
  }
  var sideLabel = pos.side === 'long' ? 'ロング決済' : 'ショート決済';
  gcfxAppendTradeLog_(pairId, sideLabel, price, units, memo);
  gcfxLog_(pairId + ' ' + memo + ' ' + pos.side + ' @' + price + ' x' + units);
  var remain = gcfxFormatUnits_(pairId, pos.units - units);
  if (remain >= inst.minUnits) {
    pos.units = remain;
    pos.h1PartialDone = true;
    ps.position = pos;
  } else {
    ps.position = null;
  }
  return true;
}

function gcfxOpenPosition_(pairId, side, price, cfg, state, ps, memo) {
  var inst = gcfxGetInstrument_(pairId);
  var units = gcfxFormatUnits_(pairId, gcfxResolveOrderUnits_(pairId, cfg));
  if (units < inst.minUnits) units = inst.minUnits;
  var margin = gcfxMarginJpy_(pairId, price, units, cfg);
  var assets = gcfxGetAssetsForRun_(cfg, state);
  if (!cfg.dryRun && assets.marginCallStatus && assets.marginCallStatus !== 'NORMAL') {
    ps.lastSignal = '追証/' + assets.marginCallStatus;
    return false;
  }
  if (assets.jpy < margin * 1.05) {
    ps.lastSignal = '証拠金不足';
    return false;
  }
  if (margin > cfg.maxMarginJpyPerPair) {
    ps.lastSignal = '銘柄上限超過';
    return false;
  }
  var entryPx = gcfxRoundPrice_(pairId, price);
  ps.position = {
    side: side,
    units: units,
    entryPrice: entryPx,
    entryAt: new Date().toISOString(),
    h1PartialDone: false,
    positionId: null,
  };
  gcfxPlaceOrder_(pairId, '新規', side, entryPx, units, cfg, state, ps);
  if (cfg.dryRun) {
    gcfxApplyPaperOpen_(state, pairId, side, entryPx, units, cfg);
  }
  var label = side === 'long' ? 'ロング新規' : 'ショート新規';
  gcfxAppendTradeLog_(pairId, label, entryPx, units, memo);
  ps.lastSignal = label + '@' + entryPx;
  gcfxLog_(pairId + ' ' + memo + ' ' + side + ' @' + entryPx + ' x' + units);
  return true;
}

/** 保有ポジションの決済判定。決済時はメモ文字列、未決済は null */
function gcfxManageOpenPosition_(pairId, ps, price, daily, h1, cfg, state) {
  var pos = ps.position;
  if (!pos || !pos.side) return null;
  var inst = gcfxGetInstrument_(pairId);
  if (pos.units < inst.minUnits) return null;

  if (gcfxIsDailyAdverseBreak_(price, daily, pos.side)) {
    var dailyMemo = pos.h1PartialDone ? 'GCFX日足損切(残り)' : 'GCFX日足損切';
    gcfxClosePosition_(pairId, pos, price, cfg, state, ps, dailyMemo);
    return '日足損切';
  }

  if (!pos.h1PartialDone && gcfxIsH1AdverseBreak_(price, h1, pos.side)) {
    var split = gcfxCalcPartialCloseUnits_(pairId, pos.units, cfg.partialStopRatio);
    var pctLabel = Math.round(cfg.partialStopRatio * 100) + '%';
    if (split.canSplit) {
      gcfxClosePartial_(pairId, pos, split.closeUnits, price, cfg, state, ps, 'GCFX1H損切(' + pctLabel + ')');
      if (ps.position) ps.position.h1PartialDone = true;
      return '1H損切(' + pctLabel + ')';
    }
    gcfxClosePosition_(pairId, pos, price, cfg, state, ps, 'GCFX1H損切(全量)');
    return '1H損切(全量)';
  }

  var tpPrice = gcfxCalcTakeProfit_(pos.side, h1, cfg.tpRatio);
  if (gcfxIsAtOrPastTakeProfit_(price, tpPrice, pos.side, cfg.touchPct)) {
    var tpPctLabel = Math.round(cfg.tpRatio * 100) + '%';
    var tpMemo =
      pos.side === 'long'
        ? pos.h1PartialDone
          ? 'GCFXロング利確(残りTP' + tpPctLabel + ')'
          : 'GCFXロング利確(TP' + tpPctLabel + ')'
        : pos.h1PartialDone
          ? 'GCFXショート利確(残りTP' + tpPctLabel + ')'
          : 'GCFXショート利確(TP' + tpPctLabel + ')';
    gcfxClosePosition_(pairId, pos, price, cfg, state, ps, tpMemo);
    return pos.side === 'long' ? 'ロング利確' : 'ショート利確';
  }

  return null;
}

function gcfxSyncPositionFromGmo_(pairId, ps, cfg) {
  if (cfg.dryRun || !ps.position || ps.position.positionId) return;
  try {
    var symbol = gcfxGetGmoSymbol_(pairId);
    var found = gmoFindOpenPosition_(symbol, ps.position.side, ps.position.units);
    if (found) {
      ps.position.positionId = found.positionId;
      ps.position.entryPrice = found.entryPrice || ps.position.entryPrice;
      ps.position.units = found.units || ps.position.units;
      gcfxLog_(pairId + ' 建玉同期 positionId=' + found.positionId);
    }
  } catch (e) {
    gcfxLog_(pairId + ' 建玉同期失敗: ' + e.message);
  }
}

function gcfxRunRangeForPair_(pairId, cfg, state) {
  var ps = gcfxGetPairState_(state, pairId);
  var active = false;
  var notes = [];

  var ticker = gcfxGetTicker_(pairId);
  var candles1h = gcfxGetCandles1h_(pairId);
  var pos = ps.position;
  var hasPos = pos && pos.side && pos.units > 0;
  var closed5m;
  if (hasPos || !gmoIsScanMode_()) {
    var candles5m = gcfxGetCandles5m_(pairId);
    closed5m = gcfxGetLastClosed5m_(candles5m);
  } else {
    closed5m = { close: ticker.last, time: Date.now(), high: ticker.high, low: ticker.low };
  }
  var candlesDaily = gcfxAggregateDailyFrom1h_(candles1h, cfg.dailyLookback + 5);

  if (candles1h.length < GCFX_CONFIG.MIN_CANDLES_1H) {
    return { active: false, activeNote: '1H不足', ticker: ticker, daily: null, h1: null };
  }
  if (!closed5m) {
    return { active: false, activeNote: '5分足不足', ticker: ticker, daily: null, h1: null };
  }

  var daily = gcfxDetectDailyRange_(candlesDaily, cfg);
  var h1 = gcfxDetectH1Range_(candles1h, daily, cfg);
  var price = closed5m.close;
  var assets = gcfxGetAssetsForRun_(cfg, state);

  ps.lastDailyNote = daily.note;
  ps.lastH1Note = h1.note;

  if (hasPos) gcfxSyncPositionFromGmo_(pairId, ps, cfg);

  if (hasPos) {
    var exitNote = gcfxManageOpenPosition_(pairId, ps, price, daily, h1, cfg, state);
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

  if (gcfxCountOpenPositions_(state) >= cfg.maxOpenPositions) {
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

  if (gcfxIsNearLower_(price, h1.low, cfg.touchPct)) {
    if (cfg.leaguePauseNew) {
      ps.lastSignal = 'リーグ新規停止';
    } else if (gcfxOpenPosition_(pairId, 'long', price, cfg, state, ps, 'GCFXレンジ下限ロング')) {
      active = true;
      notes.push('下限ロング');
    }
  } else if (gcfxIsNearUpper_(price, h1.high, cfg.touchPct)) {
    if (cfg.leaguePauseNew) {
      ps.lastSignal = 'リーグ新規停止';
    } else if (gcfxOpenPosition_(pairId, 'short', price, cfg, state, ps, 'GCFXレンジ上限ショート')) {
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
