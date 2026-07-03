function jSign_(nonce, message) {
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

function jPrivateRequest_(method, path, query, bodyObj) {
  var key = PropertiesService.getScriptProperties().getProperty('BITBANK_API_KEY');
  if (!key) throw new Error('BITBANK_API_KEY が未設定です');

  var nonce = String(Date.now());
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var signPath = '/v1' + path;
  var signMsg = body ? nonce + body : nonce + signPath + (query ? '?' + query : '');
  var signature = jSign_(nonce, signMsg);

  var url = J_CONFIG.PRIVATE_API + path + (query ? '?' + query : '');
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

function jPublicGet_(path) {
  var url = J_CONFIG.PUBLIC_API + path;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('bitbank public HTTP ' + code + ': ' + text.slice(0, 200));
  }
  var json = JSON.parse(text);
  if (!json.success) throw new Error('bitbank public error: ' + text.slice(0, 200));
  return json.data;
}

function jPublicGetCandlesDay_(path) {
  var url = J_CONFIG.PUBLIC_API + path;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
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

function jParseOhlcvRows_(data) {
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

function jYmdDaysAgo_(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
}

function jFetchCandlesDay_(pair, interval, daysAgo) {
  var ymd = jYmdDaysAgo_(daysAgo);
  var cache = CacheService.getScriptCache();
  var ckey = 'j_cd_' + pair + '_' + interval + '_' + ymd;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = jPublicGetCandlesDay_('/' + pair + '/candlestick/' + interval + '/' + ymd);
  if (!data) return [];
  var candles = jParseOhlcvRows_(data);
  if (candles.length) {
    cache.put(ckey, JSON.stringify(candles), J_CONFIG.CANDLE_DAY_CACHE_SEC || 900);
  }
  return candles;
}

/** 未取得日を fetchAll でまとめて取得 */
function jFetchCandlesDaysParallel_(pair, interval, maxDays) {
  var cache = CacheService.getScriptCache();
  var pending = [];
  var merged = [];

  for (var daysAgo = 0; daysAgo < maxDays; daysAgo++) {
    var ymd = jYmdDaysAgo_(daysAgo);
    var ckey = 'j_cd_' + pair + '_' + interval + '_' + ymd;
    var cached = cache.get(ckey);
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        if (parsed.length) merged = merged.concat(parsed);
        continue;
      } catch (e) {}
    }
    pending.push({
      daysAgo: daysAgo,
      ymd: ymd,
      ckey: ckey,
      url: J_CONFIG.PUBLIC_API + '/' + pair + '/candlestick/' + interval + '/' + ymd,
    });
  }

  if (pending.length) {
    var reqs = pending.map(function (p) {
      return { url: p.url, muteHttpExceptions: true, followRedirects: true };
    });
    var responses = UrlFetchApp.fetchAll(reqs);
    var ttl = J_CONFIG.CANDLE_DAY_CACHE_SEC || 900;
    for (var i = 0; i < responses.length; i++) {
      var res = responses[i];
      var candles = [];
      if (res.getResponseCode() !== 404) {
        try {
          var json = JSON.parse(res.getContentText());
          if (json.success && json.data) candles = jParseOhlcvRows_(json.data);
        } catch (e2) {}
      }
      if (candles.length) {
        cache.put(pending[i].ckey, JSON.stringify(candles), ttl);
        merged = merged.concat(candles);
      }
    }
  }
  return merged;
}

function jDedupeCandlesByTime_(all) {
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
  return deduped;
}

function jGetCandles1h_(pair, minBars) {
  minBars = minBars || J_CONFIG.MIN_CANDLES_1H;
  var lookback = J_CONFIG.DAILY_LOOKBACK || 20;
  var daysForDaily = lookback + 5;
  var daysForMinBars = Math.ceil(minBars / 24) + 1;
  var maxDays = Math.min(
    J_CONFIG.CANDLE_FETCH_MAX_DAYS,
    Math.max(daysForDaily, daysForMinBars)
  );

  var bundleKey = 'j_c1h_' + pair + '_' + maxDays;
  var cache = CacheService.getScriptCache();
  var bundled = cache.get(bundleKey);
  if (bundled) {
    try {
      var hit = JSON.parse(bundled);
      if (hit.length >= Math.min(minBars, lookback * 20)) return hit;
    } catch (e) {}
  }

  var all = jFetchCandlesDaysParallel_(pair, '1hour', maxDays);
  var deduped = jDedupeCandlesByTime_(all);
  if (deduped.length) cache.put(bundleKey, JSON.stringify(deduped), 600);
  return deduped;
}

function jAggregateDailyFrom1h_(candles1h, lookbackDays) {
  var byDay = {};
  candles1h.forEach(function (c) {
    var day = Utilities.formatDate(new Date(c.time), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (!byDay[day]) {
      byDay[day] = { open: c.open, high: c.high, low: c.low, close: c.close, time: c.time };
    } else {
      byDay[day].high = Math.max(byDay[day].high, c.high);
      byDay[day].low = Math.min(byDay[day].low, c.low);
      byDay[day].close = c.close;
    }
  });
  var keys = Object.keys(byDay).sort();
  if (lookbackDays && keys.length > lookbackDays) keys = keys.slice(keys.length - lookbackDays);
  return keys.map(function (k) {
    return byDay[k];
  });
}

function jGetTicker_(pair) {
  var cache = CacheService.getScriptCache();
  var tkey = 'j_tk_' + pair;
  var cached = cache.get(tkey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = jPublicGet_('/' + pair + '/ticker');
  var ticker = {
    last: Number(data.last),
    buy: Number(data.buy),
    sell: Number(data.sell),
  };
  cache.put(tkey, JSON.stringify(ticker), J_CONFIG.TICKER_CACHE_SEC || 120);
  return ticker;
}

/** ランキング用: 複数ペアの ticker を fetchAll */
function jGetTickersBulk_(pairs) {
  var cache = CacheService.getScriptCache();
  var out = {};
  var pending = [];
  var ttl = J_CONFIG.TICKER_CACHE_SEC || 120;

  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    var tkey = 'j_tk_' + pair;
    var cached = cache.get(tkey);
    if (cached) {
      try {
        out[pair] = JSON.parse(cached);
        continue;
      } catch (e) {}
    }
    pending.push({
      pair: pair,
      tkey: tkey,
      url: J_CONFIG.PUBLIC_API + '/' + pair + '/ticker',
    });
  }

  if (pending.length) {
    var reqs = pending.map(function (p) {
      return { url: p.url, muteHttpExceptions: true, followRedirects: true };
    });
    var responses = UrlFetchApp.fetchAll(reqs);
    for (var j = 0; j < responses.length; j++) {
      var res = responses[j];
      try {
        var json = JSON.parse(res.getContentText());
        if (!json.success) continue;
        var ticker = {
          last: Number(json.data.last),
          buy: Number(json.data.buy),
          sell: Number(json.data.sell),
        };
        out[pending[j].pair] = ticker;
        cache.put(pending[j].tkey, JSON.stringify(ticker), ttl);
      } catch (e2) {}
    }
  }
  return out;
}

function jFetchSpotPairs_() {
  var url = J_CONFIG.PRIVATE_API + '/spot/pairs';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var json = JSON.parse(res.getContentText());
  if (!json.success) throw new Error('spot/pairs error: ' + res.getContentText().slice(0, 200));
  var list = json.data.pairs || json.data || [];
  return list.filter(function (p) {
    return p.is_enabled && String(p.name).endsWith('_jpy');
  });
}

function jGetAssets_(asset) {
  var data = jPrivateRequest_('get', '/user/assets', null, null);
  var jpy = 0;
  var coin = 0;
  (data.assets || []).forEach(function (a) {
    if (a.asset === 'jpy') jpy = Number(a.free_amount);
    if (a.asset === asset) coin = Number(a.free_amount);
  });
  return { jpy: jpy, coin: coin };
}

function jInitPaperWallet_(global, cfg) {
  cfg = cfg || jGetConfig_();
  if (!global.paperWallet) {
    global.paperWallet = {
      jpy: cfg.paperJpyDefault || J_CONFIG.PAPER_JPY_DEFAULT,
      coins: {},
      initial: cfg.paperJpyDefault || J_CONFIG.PAPER_JPY_DEFAULT,
    };
  }
  if (!global.paperWallet.coins) global.paperWallet.coins = {};
  return global.paperWallet;
}

/** 紙トレ: 公式手数料率を適用（TradingFees.gs） */
function jApplyPaperTrade_(global, pair, side, price, amount, role) {
  var inst = jGetInstrument_(pair);
  var w = jInitPaperWallet_(global, jGetConfig_());
  var amt = jFormatAmount_(pair, amount);
  role = role || J_CONFIG.FEE_ROLE_FOR_PROFIT;
  if (side === 'buy') {
    w.jpy -= jCalcBuyCostJpy_(pair, price, amt, role);
    w.coins[inst.asset] = jFormatAmount_(pair, (w.coins[inst.asset] || 0) + amt);
  } else {
    var tradable = jGetTradableCoin_(pair, w.coins[inst.asset] || 0, jGetConfig_());
    var sellAmt = jFormatAmount_(pair, Math.min(amt, tradable));
    w.coins[inst.asset] = jFormatAmount_(pair, Math.max(0, (w.coins[inst.asset] || 0) - sellAmt));
    w.jpy += jCalcSellProceedsJpy_(pair, price, sellAmt, role);
  }
}

function jGetAssetsForPair_(pair, cfg, global) {
  var inst = jGetInstrument_(pair);
  if (cfg.dryRun) {
    var w = jInitPaperWallet_(global, cfg);
    return {
      jpy: w.jpy,
      coin: jGetTradableCoin_(pair, w.coins[inst.asset] || 0, cfg),
      totalCoin: w.coins[inst.asset] || 0,
      paper: true,
    };
  }
  var raw = jGetAssets_(inst.asset);
  return {
    jpy: raw.jpy,
    coin: jGetTradableCoin_(pair, raw.coin, cfg),
    totalCoin: raw.coin,
    reservedCoin: inst.asset === 'btc' ? jGetBtcReserve_(cfg) : 0,
    paper: false,
  };
}

function jGetActiveOrders_(pair) {
  var data = jPrivateRequest_('get', '/user/spot/active_orders', 'pair=' + pair, null);
  return data.orders || [];
}

function jCancelOrder_(pair, orderId, cfg) {
  if (cfg.dryRun) {
    jLog_('[DRY_RUN] cancel ' + pair + ' order=' + orderId);
    return;
  }
  jPrivateRequest_('post', '/user/spot/cancel_order', null, {
    pair: pair,
    order_id: Number(orderId),
  });
}

function jCancelPairBuyOrders_(pair, cfg) {
  if (cfg.dryRun) return 0;
  var orders = jGetActiveOrders_(pair);
  var n = 0;
  orders.forEach(function (o) {
    if (o.side === 'buy' && o.user_cancelable) {
      jCancelOrder_(pair, o.order_id, cfg);
      n += 1;
    }
  });
  if (n) jLog_(pair + ' 買い指値キャンセル ' + n + '件');
  return n;
}

function jPlaceLimit_(pair, side, price, amount, cfg) {
  var inst = jGetInstrument_(pair);
  var amt = jFormatAmount_(pair, amount);
  var body = {
    pair: pair,
    side: side,
    type: 'limit',
    price: String(jRoundPrice_(pair, price)),
    amount: amt.toFixed(inst.amountDecimals),
  };
  if (cfg.dryRun) {
    jLog_('[DRY_RUN] ' + pair + ' ' + side + ' limit price=' + body.price + ' amount=' + body.amount);
    return { order_id: 'dry-' + Date.now(), dryRun: true };
  }
  return jPrivateRequest_('post', '/user/spot/order', null, body);
}

function jTestConnection() {
  var ticker = jGetTicker_('btc_jpy');
  jLog_('接続OK btc_jpy last=' + ticker.last);
  SpreadsheetApp.getUi().alert('接続OK\nBTC/JPY=' + ticker.last + '円');
}

function jShowReserveStatus_() {
  var cfg = jGetConfig_();
  var reserve = jGetBtcReserve_(cfg);
  var lines = [
    'BTC 長期保有（トラップ対象外）',
    'BTC_RESERVE_AMOUNT = ' + reserve,
    'J_EXCLUDE_PAIRS = ' + (cfg.excludePairs || []).join(', '),
  ];
  if (!cfg.dryRun) {
    try {
      var raw = jGetAssets_('btc');
      var tradable = jGetTradableCoin_('btc_jpy', raw.coin, cfg);
      lines.push('');
      lines.push('口座BTC合計: ' + raw.coin);
      lines.push('トラップ可: ' + tradable);
      lines.push('保護分: ' + reserve);
    } catch (e) {
      lines.push('残高取得: APIキー要');
    }
  }
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}
