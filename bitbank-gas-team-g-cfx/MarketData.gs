function gcfxGetCandles1h_(pairId) {
  return gmoGetCandles1h_(gcfxGetGmoSymbol_(pairId));
}

function gcfxGetCandles5m_(pairId) {
  return gmoGetCandles5m_(gcfxGetGmoSymbol_(pairId));
}

function gcfxAggregateDailyFrom1h_(candles1h, lookbackDays) {
  var byDay = {};
  candles1h.forEach(function (c) {
    var day = Utilities.formatDate(new Date(c.time), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (!byDay[day]) {
      byDay[day] = { open: c.open, high: c.high, low: c.low, close: c.close, time: c.time };
    } else {
      var d = byDay[day];
      d.high = Math.max(d.high, c.high);
      d.low = Math.min(d.low, c.low);
      d.close = c.close;
    }
  });
  var keys = Object.keys(byDay).sort();
  if (lookbackDays && keys.length > lookbackDays) {
    keys = keys.slice(keys.length - lookbackDays);
  }
  return keys.map(function (k) {
    return byDay[k];
  });
}

function gcfxGetLastClosed5m_(candles5m) {
  if (!candles5m || candles5m.length < 2) return null;
  var c = candles5m[candles5m.length - 2];
  return { close: c.close, time: c.time, high: c.high, low: c.low };
}

function gcfxGetTicker_(pairId) {
  return gmoGetTicker_(gcfxGetGmoSymbol_(pairId));
}

function gcfxInitPaperWallet_(state, cfg) {
  if (!state.paperWallet) {
    state.paperWallet = {
      jpy: cfg.paperJpyDefault || GCFX_CONFIG.PAPER_JPY_DEFAULT,
      initial: cfg.paperJpyDefault || GCFX_CONFIG.PAPER_JPY_DEFAULT,
      reserved: 0,
    };
  }
  return state.paperWallet;
}

function gcfxInitLiveBaseline_(state, equity) {
  if (!state.liveBaseline && equity > 0) {
    state.liveBaseline = equity;
  }
}

/** 想定損益（円）— 円建ては (価格差)×数量、非円建ては USD/JPY 参照で換算 */
function gcfxCalcPnlJpy_(pairId, side, entryPrice, exitPrice, units, cfg) {
  var inst = gcfxGetInstrument_(pairId);
  var diff = side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  if (inst.quoteJpy) {
    return diff * units;
  }
  var ref = (cfg && cfg.usdJpyRef) || GCFX_CONFIG.USD_JPY_REF;
  return diff * units * ref;
}

function gcfxMarginJpy_(pairId, price, units, cfg) {
  var inst = gcfxGetInstrument_(pairId);
  var lev = (cfg && cfg.leverage) || GCFX_CONFIG.LEVERAGE_DEFAULT;
  if (!lev || lev <= 0) lev = GCFX_CONFIG.LEVERAGE_DEFAULT;
  var notional;
  if (inst.quoteJpy) {
    notional = price * units;
  } else {
    var ref = (cfg && cfg.usdJpyRef) || GCFX_CONFIG.USD_JPY_REF;
    notional = price * units * ref;
  }
  return notional / lev;
}

function gcfxApplyPaperOpen_(state, pairId, side, price, units, cfg) {
  var w = gcfxInitPaperWallet_(state, cfg);
  var margin = gcfxMarginJpy_(pairId, price, units, cfg);
  w.jpy -= margin;
  w.reserved = (w.reserved || 0) + margin;
}

function gcfxApplyPaperClose_(state, pairId, side, entryPrice, exitPrice, units, cfg) {
  var w = gcfxInitPaperWallet_(state, cfg);
  var margin = gcfxMarginJpy_(pairId, entryPrice, units, cfg);
  var pnl = gcfxCalcPnlJpy_(pairId, side, entryPrice, exitPrice, units, cfg);
  var fee = GCFX_CONFIG.PAPER_FEE_RATE;
  w.jpy += margin + pnl * (1 - fee);
  w.reserved = Math.max(0, (w.reserved || 0) - margin);
}

function gcfxPaperEquity_(state) {
  var w = state && state.paperWallet;
  if (!w) return 0;
  return (w.jpy || 0) + (w.reserved || 0);
}

function gcfxLiveEquity_(marginData) {
  if (!marginData || marginData.error) return 0;
  if (marginData.equity != null) return Number(marginData.equity || 0);
  return Number(marginData.availableAmount || 0) + Number(marginData.margin || 0);
}

function gcfxAccountEquity_(cfg, state) {
  if (cfg.dryRun) return gcfxPaperEquity_(state);
  try {
    var m = gmoGetMarginCached_();
    gcfxInitLiveBaseline_(state, gcfxLiveEquity_(m));
    return gcfxLiveEquity_(m);
  } catch (e) {
    gcfxLog_('残高照会失敗: ' + e.message);
    return state.liveBaseline || 0;
  }
}

function gcfxGetAssetsForRun_(cfg, state) {
  if (cfg.dryRun) {
    var w = gcfxInitPaperWallet_(state, cfg);
    return {
      jpy: w.jpy,
      reserved: w.reserved || 0,
      paper: true,
    };
  }
  var m = gmoGetMarginCached_();
  gcfxInitLiveBaseline_(state, gcfxLiveEquity_(m));
  return {
    jpy: Number(m.availableAmount || 0),
    reserved: Number(m.margin || 0),
    marginRatio: Number(m.marginRatio || 0),
    marginCallStatus: m.marginCallStatus || 'UNKNOWN',
    paper: false,
  };
}

function gcfxPlaceOrder_(pairId, action, side, price, units, cfg, state, ps) {
  var inst = gcfxGetInstrument_(pairId);
  var symbol = inst.gmoSymbol;
  var sizeStr = gcfxFormatUnitsStr_(pairId, units);

  if (cfg.dryRun) {
    gcfxLog_(
      '[DRY_RUN] ' +
        inst.label +
        ' ' +
        action +
        ' ' +
        side +
        ' @' +
        gcfxRoundPrice_(pairId, price) +
        ' x' +
        sizeStr
    );
    return { dryRun: true };
  }

  if (action === '新規') {
    gmoPlaceMarketOpen_(symbol, side, sizeStr);
    var opened = gmoFindOpenPosition_(symbol, side, units);
    if (!opened) throw new Error(symbol + ' 建玉同期失敗');
    if (ps && ps.position) {
      ps.position.positionId = opened.positionId;
      ps.position.entryPrice = opened.entryPrice || price;
      ps.position.units = opened.units || units;
    }
    gcfxLog_(inst.label + ' 新規約定 positionId=' + opened.positionId);
    return opened;
  }

  var pos = ps && ps.position;
  if (!pos || !pos.positionId) throw new Error(symbol + ' positionId 未設定');
  gmoPlaceMarketClose_(symbol, pos.side, pos.positionId, sizeStr);
  gcfxLog_(inst.label + ' 決済約定 positionId=' + pos.positionId + ' x' + sizeStr);

  if (pos.units - units >= inst.minUnits) {
    Utilities.sleep(300);
    var remain = gmoFindOpenPosition_(symbol, pos.side, pos.units - units);
    if (remain && ps.position) {
      ps.position.positionId = remain.positionId;
      ps.position.units = remain.units;
    }
  }
  return { closed: true };
}
