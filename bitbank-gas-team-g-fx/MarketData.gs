/** CacheService 1キー上限約100KB — 生JSONは入れず圧縮ローソクのみ */
var GFX_CACHE_MAX_BYTES = 90000;

function gfxCompactCandles_(candles, maxBars) {
  var slice = maxBars && candles.length > maxBars ? candles.slice(-maxBars) : candles;
  return slice.map(function (c) {
    return [c.time, c.open, c.high, c.low, c.close];
  });
}

function gfxExpandCandles_(compact) {
  if (!compact || !compact.length) return [];
  return compact.map(function (r) {
    return {
      time: r[0],
      open: r[1],
      high: r[2],
      low: r[3],
      close: r[4],
      volume: 0,
    };
  });
}

function gfxCachePutCandles_(key, candles, maxBars, ttlSec) {
  try {
    var payload = JSON.stringify(gfxCompactCandles_(candles, maxBars));
    if (payload.length <= GFX_CACHE_MAX_BYTES) {
      CacheService.getScriptCache().put(key, payload, ttlSec || 600);
    }
  } catch (e) {
    gfxLog_('cache skip ' + key + ': ' + (e.message || e));
  }
}

function gfxFetchYahooCandles_(symbol, interval, range, maxCacheBars) {
  var cache = CacheService.getScriptCache();
  var key = 'gfx_c_' + symbol + '_' + interval + '_' + range;
  var cached = cache.get(key);
  if (cached) {
    try {
      var expanded = gfxExpandCandles_(JSON.parse(cached));
      if (expanded.length) return expanded;
    } catch (e) {}
  }

  var url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=' +
    interval +
    '&range=' +
    range;
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
    },
  });
  if (res.getResponseCode() >= 400) {
    throw new Error('Yahoo ' + symbol + ' HTTP ' + res.getResponseCode());
  }
  var json = JSON.parse(res.getContentText());
  var result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('Yahoo ' + symbol + ' データ空');

  var candles = gfxParseYahooCandles_(result);
  gfxCachePutCandles_(key, candles, maxCacheBars, GFX_CONFIG.YAHOO_CHART_CACHE_SEC || 600);
  return candles;
}

function gfxParseYahooCandles_(result) {
  var timestamps = result.timestamp || [];
  var quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  if (!quote || !quote.close) return [];
  var candles = [];
  for (var i = 0; i < timestamps.length; i++) {
    var close = quote.close[i];
    if (close == null || isNaN(close)) continue;
    var c = Number(close);
    var high = quote.high && quote.high[i] != null ? Number(quote.high[i]) : c;
    var low = quote.low && quote.low[i] != null ? Number(quote.low[i]) : c;
    var open = quote.open && quote.open[i] != null ? Number(quote.open[i]) : c;
    candles.push({
      open: open,
      high: high,
      low: low,
      close: c,
      volume: 0,
      time: timestamps[i] * 1000,
    });
  }
  return candles;
}

function gfxGetCandles_(pairId, interval, minBars) {
  var inst = gfxGetInstrument_(pairId);
  var range = interval === '5m' ? '5d' : '30d';
  var cacheBars = interval === '5m' ? 400 : 100;
  var candles = gfxFetchYahooCandles_(inst.yahoo, interval, range, cacheBars);
  if (candles.length < minBars && interval !== '5m') {
    candles = gfxFetchYahooCandles_(inst.yahoo, interval, '60d', 120);
  }
  return candles;
}

function gfxGetCandles1h_(pairId) {
  return gfxGetCandles_(pairId, '1h', GFX_CONFIG.MIN_CANDLES_1H);
}

function gfxGetCandles5m_(pairId) {
  return gfxGetCandles_(pairId, '5m', GFX_CONFIG.MIN_CANDLES_5M);
}

function gfxAggregateDailyFrom1h_(candles1h, lookbackDays) {
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

function gfxGetLastClosed5m_(candles5m) {
  if (!candles5m || candles5m.length < 2) return null;
  var c = candles5m[candles5m.length - 2];
  return { close: c.close, time: c.time, high: c.high, low: c.low };
}

function gfxGetTicker_(pairId) {
  var candles = gfxGetCandles1h_(pairId);
  if (!candles.length) throw new Error(gfxGetInstrument_(pairId).label + ' 価格取得失敗');
  var last = candles[candles.length - 1].close;
  return { last: last, high: last, low: last };
}

function gfxInitPaperWallet_(state, cfg) {
  if (!state.paperWallet) {
    state.paperWallet = {
      jpy: cfg.paperJpyDefault || GFX_CONFIG.PAPER_JPY_DEFAULT,
      initial: cfg.paperJpyDefault || GFX_CONFIG.PAPER_JPY_DEFAULT,
      reserved: 0,
    };
  }
  return state.paperWallet;
}

/** 想定損益（円） */
function gfxCalcPnlJpy_(pairId, side, entryPrice, exitPrice, units, cfg) {
  var inst = gfxGetInstrument_(pairId);
  var diff = side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  if (inst.quoteJpy) {
    return diff * units;
  }
  var ref = (cfg && cfg.usdJpyRef) || GFX_CONFIG.USD_JPY_REF;
  return diff * units * ref;
}

function gfxMarginJpy_(pairId, price, units, cfg) {
  var inst = gfxGetInstrument_(pairId);
  var notional;
  if (inst.quoteJpy) {
    notional = price * units;
  } else {
    var ref = (cfg && cfg.usdJpyRef) || GFX_CONFIG.USD_JPY_REF;
    notional = price * units * ref;
  }
  return notional * ((cfg && cfg.marginRate) || GFX_CONFIG.MARGIN_RATE);
}

function gfxApplyPaperOpen_(state, pairId, side, price, units, cfg) {
  var w = gfxInitPaperWallet_(state, cfg);
  var margin = gfxMarginJpy_(pairId, price, units, cfg);
  w.jpy -= margin;
  w.reserved = (w.reserved || 0) + margin;
}

function gfxApplyPaperClose_(state, pairId, side, entryPrice, exitPrice, units, cfg) {
  var w = gfxInitPaperWallet_(state, cfg);
  var margin = gfxMarginJpy_(pairId, entryPrice, units, cfg);
  var pnl = gfxCalcPnlJpy_(pairId, side, entryPrice, exitPrice, units, cfg);
  var fee = GFX_CONFIG.PAPER_FEE_RATE;
  w.jpy += margin + pnl * (1 - fee);
  w.reserved = Math.max(0, (w.reserved || 0) - margin);
}

function gfxPaperEquity_(state) {
  var w = state && state.paperWallet;
  if (!w) return 0;
  return (w.jpy || 0) + (w.reserved || 0);
}

function gfxGetAssetsForRun_(cfg, state) {
  var w = gfxInitPaperWallet_(state, cfg);
  return {
    jpy: w.jpy,
    reserved: w.reserved || 0,
    paper: true,
  };
}

function gfxPlacePaperOrder_(pairId, action, side, price, units) {
  gfxLog_(
    '[PAPER] ' +
      gfxGetInstrument_(pairId).label +
      ' ' +
      action +
      ' ' +
      side +
      ' @' +
      gfxRoundPrice_(pairId, price) +
      ' x' +
      units
  );
}
