function gcboGetCandles1h_(pairId) {
  return gmoGetCandles1h_(gcboGetGmoSymbol_(pairId), GCBO_CONFIG.MIN_CANDLES_1H);
}

function gcboAggregate4hFrom1h_(candles1h) {
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

function gcboGetLastClosed4h_(candles4h) {
  if (!candles4h || candles4h.length < 2) return null;
  return candles4h[candles4h.length - 2];
}

function gcboAggregateDailyFrom1h_(candles1h, lookbackDays) {
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

function gcboGetTicker_(pairId) {
  return gmoGetTicker_(gcboGetGmoSymbol_(pairId));
}

function gcboInitPaperWallet_(state, cfg) {
  if (!state.paperWallet) {
    state.paperWallet = {
      jpy: cfg.paperJpyDefault || GCBO_CONFIG.PAPER_JPY_DEFAULT,
      initial: cfg.paperJpyDefault || GCBO_CONFIG.PAPER_JPY_DEFAULT,
      reserved: 0,
    };
  }
  return state.paperWallet;
}

function gcboInitLiveBaseline_(state, equity) {
  if (!state.liveBaseline && equity > 0) {
    state.liveBaseline = equity;
  }
}

/** 想定損益（円）— 円建て (価格差)×数量 */
function gcboCalcPnlJpy_(pairId, side, entryPrice, exitPrice, units, cfg) {
  var diff = side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return diff * units;
}

function gcboMarginJpy_(pairId, price, units, cfg) {
  var lev = (cfg && cfg.leverage) || GCBO_CONFIG.LEVERAGE_DEFAULT;
  if (!lev || lev <= 0) lev = GCBO_CONFIG.LEVERAGE_DEFAULT;
  return (price * units) / lev;
}

function gcboApplyPaperOpen_(state, pairId, side, price, units, cfg) {
  var w = gcboInitPaperWallet_(state, cfg);
  var margin = gcboMarginJpy_(pairId, price, units, cfg);
  w.jpy -= margin;
  w.reserved = (w.reserved || 0) + margin;
}

function gcboApplyPaperClose_(state, pairId, side, entryPrice, exitPrice, units, cfg) {
  var w = gcboInitPaperWallet_(state, cfg);
  var margin = gcboMarginJpy_(pairId, entryPrice, units, cfg);
  var pnl = gcboCalcPnlJpy_(pairId, side, entryPrice, exitPrice, units, cfg);
  var fee = GCBO_CONFIG.PAPER_FEE_RATE;
  w.jpy += margin + pnl * (1 - fee);
  w.reserved = Math.max(0, (w.reserved || 0) - margin);
}

function gcboPaperEquity_(state) {
  var w = state && state.paperWallet;
  if (!w) return 0;
  return (w.jpy || 0) + (w.reserved || 0);
}

function gcboLiveEquity_(marginData) {
  if (!marginData || marginData.error) return 0;
  if (marginData.equity != null) return Number(marginData.equity || 0);
  return Number(marginData.availableAmount || 0) + Number(marginData.margin || 0);
}

function gcboAccountEquity_(cfg, state) {
  if (cfg.dryRun) return gcboPaperEquity_(state);
  try {
    var m = gmoGetMarginCached_();
    gcboInitLiveBaseline_(state, gcboLiveEquity_(m));
    return gcboLiveEquity_(m);
  } catch (e) {
    gcboLog_('残高照会失敗: ' + e.message);
    return state.liveBaseline || 0;
  }
}

function gcboGetAssetsForRun_(cfg, state) {
  if (cfg.dryRun) {
    var w = gcboInitPaperWallet_(state, cfg);
    return {
      jpy: w.jpy,
      reserved: w.reserved || 0,
      paper: true,
    };
  }
  var m = gmoGetMarginCached_();
  gcboInitLiveBaseline_(state, gcboLiveEquity_(m));
  return {
    jpy: Number(m.availableAmount || 0),
    reserved: Number(m.margin || 0),
    marginRatio: Number(m.marginRatio || 0),
    marginCallStatus: m.marginCallStatus || 'UNKNOWN',
    paper: false,
  };
}

function gcboPlaceOrder_(pairId, action, side, price, units, cfg, state, ps) {
  var inst = gcboGetInstrument_(pairId);
  var symbol = inst.gmoSymbol;
  var sizeStr = gcboFormatUnitsStr_(pairId, units);

  if (cfg.dryRun) {
    gcboLog_(
      '[DRY_RUN] ' +
        inst.label +
        ' ' +
        action +
        ' ' +
        side +
        ' @' +
        gcboRoundPrice_(pairId, price) +
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
    gcboLog_(inst.label + ' 新規約定 positionId=' + opened.positionId);
    return opened;
  }

  var pos = ps && ps.position;
  if (!pos || !pos.positionId) throw new Error(symbol + ' positionId 未設定');
  gmoPlaceMarketClose_(symbol, pos.side, pos.positionId, sizeStr);
  gcboLog_(inst.label + ' 決済約定 positionId=' + pos.positionId + ' x' + sizeStr);

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
