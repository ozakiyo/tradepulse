/**
 * 4H ブレイクアウト: PO + 保ち合い → ブレイクエントリー
 * SL=ブレイク足外 / 5本後に半分利確+建値 / 残りは20EMA逆クロスで決済
 */

function gffxClosePosition_(pairId, pos, price, cfg, state, ps, memo) {
  var units = gffxFormatUnits_(pairId, pos.units);
  gffxPlaceOrder_(pairId, '決済', pos.side, price, units, cfg, state, ps);
  if (cfg.dryRun) {
    gffxApplyPaperClose_(state, pairId, pos.side, pos.entryPrice, price, units, cfg);
  }
  var sideLabel = pos.side === 'long' ? 'ロング決済' : 'ショート決済';
  gffxAppendTradeLog_(pairId, sideLabel, price, units, memo);
  gffxLog_(pairId + ' ' + memo + ' ' + pos.side + ' @' + price);
  ps.position = null;
}

function gffxClosePartial_(pairId, pos, closeUnits, price, cfg, state, ps, memo) {
  var inst = gffxGetInstrument_(pairId);
  var units = gffxFormatUnits_(pairId, closeUnits);
  if (units < inst.minUnits) return false;
  gffxPlaceOrder_(pairId, '決済', pos.side, price, units, cfg, state, ps);
  if (cfg.dryRun) {
    gffxApplyPaperClose_(state, pairId, pos.side, pos.entryPrice, price, units, cfg);
  }
  var sideLabel = pos.side === 'long' ? 'ロング決済' : 'ショート決済';
  gffxAppendTradeLog_(pairId, sideLabel, price, units, memo);
  gffxLog_(pairId + ' ' + memo + ' ' + pos.side + ' @' + price + ' x' + units);
  var remain = gffxFormatUnits_(pairId, pos.units - units);
  if (remain >= inst.minUnits) {
    pos.units = remain;
    pos.partialDone = true;
    ps.position = pos;
  } else {
    ps.position = null;
  }
  return true;
}

function gffxOpenBreakoutPosition_(pairId, side, price, stopLoss, cfg, state, ps, entry4hTime, memo) {
  var inst = gffxGetInstrument_(pairId);
  var units = gffxFormatUnits_(pairId, gffxResolveOrderUnits_(pairId, cfg));
  if (units < inst.minUnits) units = inst.minUnits;
  var margin = gffxMarginJpy_(pairId, price, units, cfg);
  var assets = gffxGetAssetsForRun_(cfg, state);
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
  var entryPx = gffxRoundPrice_(pairId, price);
  ps.position = {
    side: side,
    units: units,
    entryPrice: entryPx,
    entryAt: new Date().toISOString(),
    stopLossPrice: stopLoss,
    partialDone: false,
    breakevenMoved: false,
    barsHeld: 0,
    last4hBarTime: entry4hTime,
    entry4hBarTime: entry4hTime,
    positionId: null,
  };
  gffxPlaceOrder_(pairId, '新規', side, entryPx, units, cfg, state, ps);
  if (cfg.dryRun) {
    gffxApplyPaperOpen_(state, pairId, side, entryPx, units, cfg);
  }
  var label = side === 'long' ? 'ロング新規' : 'ショート新規';
  gffxAppendTradeLog_(pairId, label, entryPx, units, memo);
  ps.lastSignal = label + '@' + entryPx;
  ps.lastEntry4hTime = entry4hTime;
  gffxLog_(pairId + ' ' + memo + ' ' + side + ' @' + entryPx + ' SL=' + stopLoss + ' x' + units);
  return true;
}

function gffxIsFavorable_(side, entryPrice, price) {
  if (side === 'long') return price > entryPrice;
  return price < entryPrice;
}

function gffxManageBreakoutPosition_(pairId, ps, price, closed4h, setup, cfg, state) {
  var pos = ps.position;
  if (!pos || !pos.side) return null;
  var inst = gffxGetInstrument_(pairId);
  if (pos.units < inst.minUnits) return null;

  if (gffxIsStopHit_(price, pos.stopLossPrice, pos.side)) {
    var slMemo = pos.partialDone ? 'GFFX損切(残り)' : 'GFFX損切';
    gffxClosePosition_(pairId, pos, price, cfg, state, ps, slMemo);
    return '損切';
  }

  if (!closed4h || !setup) return null;

  var barTime = closed4h.time;
  if (barTime && pos.last4hBarTime !== barTime) {
    pos.barsHeld = (pos.barsHeld || 0) + 1;
    pos.last4hBarTime = barTime;

    if (!pos.partialDone && pos.barsHeld >= cfg.partialTpBars && gffxIsFavorable_(pos.side, pos.entryPrice, closed4h.close)) {
      var split = gffxCalcPartialCloseUnits_(pairId, pos.units, cfg.partialTpRatio);
      var pctLabel = Math.round(cfg.partialTpRatio * 100) + '%';
      if (split.canSplit) {
        gffxClosePartial_(pairId, pos, split.closeUnits, closed4h.close, cfg, state, ps, 'GFFX部分利確(' + pctLabel + ')');
        if (ps.position) {
          ps.position.stopLossPrice = ps.position.entryPrice;
          ps.position.breakevenMoved = true;
        }
        return '部分利確(' + pctLabel + ')';
      }
    }

    if (setup.ema20 != null && gffxIsEma20BodyExit_(closed4h, setup.ema20, pos.side)) {
      var emaMemo = pos.partialDone ? 'GFFX20EMA決済(残り)' : 'GFFX20EMA決済';
      gffxClosePosition_(pairId, pos, closed4h.close, cfg, state, ps, emaMemo);
      return '20EMA決済';
    }
  }

  return null;
}

function gffxSyncPositionFromGmo_(pairId, ps, cfg) {
  if (cfg.dryRun || !ps.position || ps.position.positionId) return;
  try {
    var symbol = gffxGetGmoSymbol_(pairId);
    var found = gmoFindOpenPosition_(symbol, ps.position.side, ps.position.units);
    if (found) {
      ps.position.positionId = found.positionId;
      ps.position.entryPrice = found.entryPrice || ps.position.entryPrice;
      ps.position.units = found.units || ps.position.units;
      gffxLog_(pairId + ' 建玉同期 positionId=' + found.positionId);
    }
  } catch (e) {
    gffxLog_(pairId + ' 建玉同期失敗: ' + e.message);
  }
}

function gffxRunBreakoutForPair_(pairId, cfg, state) {
  var ps = gffxGetPairState_(state, pairId);
  var active = false;
  var notes = [];

  var ticker = gffxGetTicker_(pairId);
  var candles1h = gffxGetCandles1h_(pairId);
  var candles4h = gffxAggregate4hFrom1h_(candles1h);
  var closed4h = gffxGetLastClosed4h_(candles4h);
  var price = ticker.last;

  if (candles4h.length < cfg.minCandles4h) {
    return { active: false, activeNote: '4H不足', ticker: ticker, daily: null, h1: null };
  }
  if (!closed4h) {
    return { active: false, activeNote: '4H確定足不足', ticker: ticker, daily: null, h1: null };
  }

  var setup = gffxBuildBreakoutSetup_(candles4h, cfg);
  var logMap = gffxMapSetupToLog_(setup);
  var daily = logMap.daily;
  var h1 = logMap.h1;
  var assets = gffxGetAssetsForRun_(cfg, state);

  ps.lastSetupNote = setup.note;
  ps.lastDailyNote = daily.note;
  ps.lastH1Note = h1.note;

  var pos = ps.position;
  var hasPos = pos && pos.side && pos.units > 0;
  if (hasPos) gffxSyncPositionFromGmo_(pairId, ps, cfg);

  if (hasPos) {
    var exitNote = gffxManageBreakoutPosition_(pairId, ps, price, closed4h, setup, cfg, state);
    if (exitNote) {
      active = true;
      notes.push(exitNote);
    } else {
      var sl = pos.stopLossPrice != null ? ' SL=' + pos.stopLossPrice : '';
      ps.lastSignal = pos.partialDone ? '保有(' + pos.side + '残)' + sl : '保有(' + pos.side + ')' + sl;
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

  if (!setup.ok) {
    ps.lastSignal = '待機(' + setup.note + ')';
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

  if (ps.lastEntry4hTime === closed4h.time) {
    ps.lastSignal = 'エントリー済(同一4H)';
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

  if (gffxCountOpenPositions_(state) >= cfg.maxOpenPositions) {
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

  var side = setup.side;
  var stopLoss = gffxCalcStopLoss_(pairId, side, closed4h, cfg);
  var memo = side === 'long' ? 'GFFXブレイク上昇ロング' : 'GFFXブレイク下降ショート';
  if (cfg.leaguePauseNew) {
    ps.lastSignal = 'リーグ新規停止';
  } else if (gffxOpenBreakoutPosition_(pairId, side, price, stopLoss, cfg, state, ps, closed4h.time, memo)) {
    active = true;
    notes.push(side === 'long' ? 'ブレイクロング' : 'ブレイクショート');
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
