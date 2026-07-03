function gffxGetCandles1h_(pairId) {
  return gmoGetCandles1h_(gffxGetGmoSymbol_(pairId), GFFX_CONFIG.MIN_CANDLES_1H);
}

function gffxAggregate4hFrom1h_(candles1h) {
  if (!candles1h || candles1h.length < 4) return [];
  var buckets = {};
  candles1h.forEach(function (c) {
    var parts = Utilities.formatDate(new Date(c.time), 'Asia/Tokyo', 'yyyy,MM,dd,HH').split(',');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var day = Number(parts[2]);
    var h = Math.floor(Number(parts[3]) / 4) * 4;
    var key = y + '-' + m + '-' + day + '-' + h;
    if (!buckets[key]) {
      buckets[key] = { open: c.open, high: c.high, low: c.low, close: c.close, time: c.time };
    } else {
      var b = buckets[key];
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.time = c.time;
    }
  });
  return Object.keys(buckets)
    .sort()
    .map(function (k) {
      return buckets[k];
    });
}

function gffxGetLastClosed4h_(candles4h) {
  if (!candles4h || candles4h.length < 2) return null;
  return candles4h[candles4h.length - 2];
}

function gffxAggregateDailyFrom1h_(candles1h, lookbackDays) {
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

function gffxGetTicker_(pairId) {
  return gmoGetTicker_(gffxGetGmoSymbol_(pairId));
}

function gffxInitPaperWallet_(state, cfg) {
  if (!state.paperWallet) {
    state.paperWallet = {
      jpy: cfg.paperJpyDefault || GFFX_CONFIG.PAPER_JPY_DEFAULT,
      initial: cfg.paperJpyDefault || GFFX_CONFIG.PAPER_JPY_DEFAULT,
      reserved: 0,
    };
  }
  return state.paperWallet;
}

function gffxInitLiveBaseline_(state, equity) {
  if (!state.liveBaseline && equity > 0) {
    state.liveBaseline = equity;
  }
}

/** 想定損益（円）— 円建ては (価格差)×数量、非円建ては USD/JPY 参照で換算 */
function gffxCalcPnlJpy_(pairId, side, entryPrice, exitPrice, units, cfg) {
  var inst = gffxGetInstrument_(pairId);
  var diff = side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  if (inst.quoteJpy) {
    return diff * units;
  }
  var ref = (cfg && cfg.usdJpyRef) || GFFX_CONFIG.USD_JPY_REF;
  return diff * units * ref;
}

function gffxMarginJpy_(pairId, price, units, cfg) {
  var inst = gffxGetInstrument_(pairId);
  var lev = (cfg && cfg.leverage) || GFFX_CONFIG.LEVERAGE_DEFAULT;
  if (!lev || lev <= 0) lev = GFFX_CONFIG.LEVERAGE_DEFAULT;
  var notional;
  if (inst.quoteJpy) {
    notional = price * units;
  } else {
    var ref = (cfg && cfg.usdJpyRef) || GFFX_CONFIG.USD_JPY_REF;
    notional = price * units * ref;
  }
  return notional / lev;
}

function gffxApplyPaperOpen_(state, pairId, side, price, units, cfg) {
  var w = gffxInitPaperWallet_(state, cfg);
  var margin = gffxMarginJpy_(pairId, price, units, cfg);
  w.jpy -= margin;
  w.reserved = (w.reserved || 0) + margin;
}

function gffxApplyPaperClose_(state, pairId, side, entryPrice, exitPrice, units, cfg) {
  var w = gffxInitPaperWallet_(state, cfg);
  var margin = gffxMarginJpy_(pairId, entryPrice, units, cfg);
  var pnl = gffxCalcPnlJpy_(pairId, side, entryPrice, exitPrice, units, cfg);
  var fee = GFFX_CONFIG.PAPER_FEE_RATE;
  w.jpy += margin + pnl * (1 - fee);
  w.reserved = Math.max(0, (w.reserved || 0) - margin);
}

function gffxPaperEquity_(state) {
  var w = state && state.paperWallet;
  if (!w) return 0;
  return (w.jpy || 0) + (w.reserved || 0);
}

function gffxLiveEquity_(marginData) {
  if (!marginData || marginData.error) return 0;
  if (marginData.equity != null) return Number(marginData.equity || 0);
  return Number(marginData.availableAmount || 0) + Number(marginData.margin || 0);
}

function gffxAccountEquity_(cfg, state) {
  if (cfg.dryRun) return gffxPaperEquity_(state);
  try {
    var m = gmoGetMarginCached_();
    gffxInitLiveBaseline_(state, gffxLiveEquity_(m));
    return gffxLiveEquity_(m);
  } catch (e) {
    gffxLog_('残高照会失敗: ' + e.message);
    return state.liveBaseline || 0;
  }
}

function gffxGetAssetsForRun_(cfg, state) {
  if (cfg.dryRun) {
    var w = gffxInitPaperWallet_(state, cfg);
    return {
      jpy: w.jpy,
      reserved: w.reserved || 0,
      paper: true,
    };
  }
  var m = gmoGetMarginCached_();
  gffxInitLiveBaseline_(state, gffxLiveEquity_(m));
  return {
    jpy: Number(m.availableAmount || 0),
    reserved: Number(m.margin || 0),
    marginRatio: Number(m.marginRatio || 0),
    marginCallStatus: m.marginCallStatus || 'UNKNOWN',
    paper: false,
  };
}

function gffxPlaceOrder_(pairId, action, side, price, units, cfg, state, ps) {
  var inst = gffxGetInstrument_(pairId);
  var symbol = inst.gmoSymbol;
  var sizeStr = gffxFormatUnitsStr_(pairId, units);

  if (cfg.dryRun) {
    gffxLog_(
      '[DRY_RUN] ' +
        inst.label +
        ' ' +
        action +
        ' ' +
        side +
        ' @' +
        gffxRoundPrice_(pairId, price) +
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
    gffxLog_(inst.label + ' 新規約定 positionId=' + opened.positionId);
    return opened;
  }

  var pos = ps && ps.position;
  if (!pos || !pos.positionId) throw new Error(symbol + ' positionId 未設定');
  gmoPlaceMarketClose_(symbol, pos.side, pos.positionId, sizeStr);
  gffxLog_(inst.label + ' 決済約定 positionId=' + pos.positionId + ' x' + sizeStr);

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
