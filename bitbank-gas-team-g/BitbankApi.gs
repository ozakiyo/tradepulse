function gSign_(nonce, message) {
  var secret = PropertiesService.getScriptProperties().getProperty('BITBANK_API_SECRET');
  if (!secret) throw new Error('BITBANK_API_SECRET が未設定です');
  var sig = Utilities.computeHmacSha256Signature(message, secret);
  return sig
    .map(function (b) {
      var v = b < 0 ? b + 256 : b;
      return ('0' + v.toString(16)).slice(-2);
    })
    .join('');
}

function gPrivateRequest_(method, path, query, bodyObj) {
  var key = PropertiesService.getScriptProperties().getProperty('BITBANK_API_KEY');
  if (!key) throw new Error('BITBANK_API_KEY が未設定です');

  var nonce = String(Date.now());
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var signPath = '/v1' + path;
  var signMsg = body ? nonce + body : nonce + signPath + (query ? '?' + query : '');
  var signature = gSign_(nonce, signMsg);

  var url = G_CONFIG.PRIVATE_API + path + (query ? '?' + query : '');
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      'ACCESS-KEY': key,
      'ACCESS-NONCE': nonce,
      'ACCESS-SIGNATURE': signature,
    },
  };
  if (body) {
    options.contentType = 'application/json';
    options.payload = body;
  }

  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  var text = res.getContentText();
  var json = JSON.parse(text);
  if (code >= 400 || !json.success) {
    throw new Error('bitbank API error ' + code + ': ' + text.slice(0, 300));
  }
  return json.data;
}

function gPublicGet_(path) {
  var url = G_CONFIG.PUBLIC_API + path;
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('bitbank public HTTP ' + code + ': ' + text.slice(0, 200));
  }
  var json = JSON.parse(text);
  if (!json.success) throw new Error('bitbank public error: ' + text.slice(0, 200));
  return json.data;
}

function gPublicGetCandlesDay_(path, ymd) {
  var url = G_CONFIG.PUBLIC_API + path;
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 404) return null;
  var json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('bitbank public parse error: ' + text.slice(0, 200));
  }
  if (!json.success) {
    if (json.data && json.data.code === 10000) return null;
    throw new Error('bitbank public error: ' + text.slice(0, 200));
  }
  return json.data;
}

function gParseOhlcvRows_(data) {
  var rows = (data.candlestick && data.candlestick[0] && data.candlestick[0].ohlcv) || [];
  return rows.map(function (r) {
    return {
      open: Number(r[0]),
      high: Number(r[1]),
      low: Number(r[2]),
      close: Number(r[3]),
      volume: Number(r[4]),
      time: Number(r[5]),
    };
  });
}

function gFetchCandlesDay_(pair, interval, daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
  var cache = CacheService.getScriptCache();
  var ckey = 'g_cd_' + pair + '_' + interval + '_' + ymd;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = gPublicGetCandlesDay_('/' + pair + '/candlestick/' + interval + '/' + ymd, ymd);
  if (!data) return [];
  var candles = gParseOhlcvRows_(data);
  if (candles.length) cache.put(ckey, JSON.stringify(candles), 900);
  return candles;
}

function gGetCandles_(pair, interval, minBars) {
  var cache = CacheService.getScriptCache();
  var bkey = 'g_cb_' + pair + '_' + interval + '_' + minBars;
  var bundled = cache.get(bkey);
  if (bundled) {
    try {
      var parsed = JSON.parse(bundled);
      if (parsed.length >= minBars) return parsed;
    } catch (e) {}
  }
  var maxDays = Math.min(G_CONFIG.CANDLE_FETCH_MAX_DAYS || 5, Math.ceil(minBars / 24) + 1);
  var all = [];
  for (var daysAgo = 0; daysAgo < maxDays; daysAgo++) {
    var day = gFetchCandlesDay_(pair, interval, daysAgo);
    if (day.length) all = day.concat(all);
    if (all.length >= minBars) break;
  }
  all.sort(function (a, b) {
    return a.time - b.time;
  });
  var deduped = [];
  var lastTime = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].time === lastTime) continue;
    lastTime = all[i].time;
    deduped.push(all[i]);
  }
  if (deduped.length >= minBars) cache.put(bkey, JSON.stringify(deduped), 600);
  return deduped;
}

function gGetCandles1h_(pair) {
  return gGetCandles_(pair, '1hour', G_CONFIG.MIN_CANDLES_1H || 55);
}

function gGetCandles5m_(pair) {
  return gGetCandles_(pair, '5min', G_CONFIG.MIN_CANDLES_5M || 3);
}

/** 1時間足から日足を合成（直近 lookback 日） */
function gAggregateDailyFrom1h_(candles1h, lookbackDays) {
  var byDay = {};
  candles1h.forEach(function (c) {
    var day = Utilities.formatDate(new Date(c.time), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (!byDay[day]) {
      byDay[day] = {
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        time: c.time,
      };
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

/** 確定済みの直近5分足終値（形成中足は除外） */
function gGetLastClosed5m_(candles5m) {
  if (!candles5m || candles5m.length < 2) return null;
  var c = candles5m[candles5m.length - 2];
  return { close: c.close, time: c.time, high: c.high, low: c.low };
}

function gGetTicker_(pair) {
  var data = gPublicGet_('/' + pair + '/ticker');
  return {
    last: Number(data.last),
    buy: Number(data.buy),
    sell: Number(data.sell),
    high: Number(data.high),
    low: Number(data.low),
  };
}

function gInitPaperWallet_(state, cfg) {
  if (!state.paperWallet) {
    state.paperWallet = {
      jpy: cfg.paperJpyDefault || G_CONFIG.PAPER_JPY_DEFAULT,
      coins: {},
      initial: cfg.paperJpyDefault || G_CONFIG.PAPER_JPY_DEFAULT,
    };
  }
  if (!state.paperWallet.coins) state.paperWallet.coins = {};
  return state.paperWallet;
}

function gGetPaperCoin_(state, asset) {
  var w = gInitPaperWallet_(state, gGetConfig_());
  if (!w.coins[asset]) w.coins[asset] = 0;
  return w.coins[asset];
}

function gApplyPaperTrade_(state, pair, side, price, amount) {
  var inst = gGetInstrument_(pair);
  var w = gInitPaperWallet_(state, gGetConfig_());
  var fee = G_CONFIG.PAPER_FEE_RATE;
  var amt = gFormatAmount_(pair, amount);
  if (side === 'buy' || side === '買い') {
    w.jpy -= price * amt * (1 + fee);
    w.coins[inst.asset] = (w.coins[inst.asset] || 0) + amt;
  } else {
    w.coins[inst.asset] = Math.max(0, (w.coins[inst.asset] || 0) - amt);
    w.jpy += price * amt * (1 - fee);
  }
}

function gGetAssetsForRun_(cfg, state, pair) {
  var inst = gGetInstrument_(pair);
  if (cfg.dryRun) {
    var w = gInitPaperWallet_(state, cfg);
    return {
      jpy: w.jpy,
      coin: gGetPaperCoin_(state, inst.asset),
      paper: true,
    };
  }
  return gGetAssets_(inst.asset);
}

function gGetAssets_(asset) {
  var data = gPrivateRequest_('get', '/user/assets', null, null);
  var jpy = 0;
  var coin = 0;
  (data.assets || []).forEach(function (a) {
    if (a.asset === 'jpy') jpy = Number(a.free_amount);
    if (a.asset === asset) coin = Number(a.free_amount);
  });
  return { jpy: jpy, coin: coin, paper: false };
}

function gPlaceLimit_(pair, side, price, amount, cfg) {
  var inst = gGetInstrument_(pair);
  var amt = gFormatAmount_(pair, amount);
  var body = {
    pair: pair,
    side: side,
    type: 'limit',
    price: String(gRoundPrice_(pair, price)),
    amount: amt.toFixed(inst.amountDecimals),
  };
  if (cfg.dryRun) {
    gLog_('[DRY_RUN] ' + pair + ' ' + side + ' limit price=' + body.price + ' amount=' + body.amount);
    return { order_id: 'dry-' + Date.now(), dryRun: true };
  }
  return gPrivateRequest_('post', '/user/spot/order', null, body);
}

function gCancelPairBuyOrders_(pair, cfg) {
  if (cfg.dryRun) return 0;
  var data = gPrivateRequest_('get', '/user/spot/active_orders', 'pair=' + pair, null);
  var n = 0;
  (data.orders || []).forEach(function (o) {
    if (o.side === 'buy' && o.user_cancelable) {
      gPrivateRequest_('post', '/user/spot/cancel_order', null, {
        pair: pair,
        order_id: Number(o.order_id),
      });
      n += 1;
    }
  });
  return n;
}
