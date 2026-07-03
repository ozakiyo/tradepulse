function e5Sign_(nonce, message) {
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

function e5PrivateRequest_(method, path, query, bodyObj) {
  var key = PropertiesService.getScriptProperties().getProperty('BITBANK_API_KEY');
  if (!key) throw new Error('BITBANK_API_KEY が未設定です');
  var nonce = String(Date.now());
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var signPath = '/v1' + path;
  var signMsg = body ? nonce + body : nonce + signPath + (query ? '?' + query : '');
  var signature = e5Sign_(nonce, signMsg);
  var url = E5_CONFIG.PRIVATE_API + path + (query ? '?' + query : '');
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

function e5PublicGet_(path) {
  var url = E5_CONFIG.PUBLIC_API + path;
  var res;
  try {
    res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  } catch (e) {
    var msg = String(e.message || e);
    if (msg.indexOf('urlfetch') >= 0 || msg.indexOf('UrlFetch') >= 0) {
      throw new Error(
        'GASのUrlFetch日次上限に達しました。明日まで待つか、他チームの10分トリガーを一時停止してください。'
      );
    }
    throw new Error('bitbank公開API接続失敗: ' + msg);
  }
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('bitbank public HTTP ' + code);
  }
  var json = JSON.parse(text);
  if (!json.success) throw new Error('bitbank public error');
  return json.data;
}

function e5GetFetchDayCount_(candleType, minBars) {
  var barsPerDay = candleType === '15min' ? 96 : 24;
  var need = Math.ceil(minBars / barsPerDay) + 1;
  var cap =
    candleType === '15min'
      ? E5_CONFIG.CANDLE_FETCH_MAX_DAYS_15M || 3
      : E5_CONFIG.CANDLE_FETCH_MAX_DAYS || 5;
  return Math.min(cap, Math.max(need, 1));
}

function e5DedupeCandles_(all) {
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

function e5GetTicker_() {
  var cache = CacheService.getScriptCache();
  var ckey = 'e5_ticker_' + E5_CONFIG.PAIR;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = e5PublicGet_('/' + E5_CONFIG.PAIR + '/ticker');
  var ticker = { last: Number(data.last), high: Number(data.high), low: Number(data.low) };
  cache.put(ckey, JSON.stringify(ticker), E5_CONFIG.TICKER_CACHE_TTL_SEC || 60);
  return ticker;
}

function e5FetchCandlesDay_(daysAgo, candleType) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
  var type = candleType === '1hour' ? '1hour' : '15min';
  var cache = CacheService.getScriptCache();
  var ckey = 'e5_cd_' + E5_CONFIG.PAIR + '_' + type + '_' + ymd;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = e5PublicGet_('/' + E5_CONFIG.PAIR + '/candlestick/' + type + '/' + ymd);
  var rows = (data.candlestick && data.candlestick[0] && data.candlestick[0].ohlcv) || [];
  var candles = rows.map(function (r) {
    return {
      open: Number(r[0]),
      high: Number(r[1]),
      low: Number(r[2]),
      close: Number(r[3]),
      volume: Number(r[4]),
      time: Number(r[5]),
    };
  });
  cache.put(ckey, JSON.stringify(candles), 900);
  return candles;
}

function e5GetCandles_(cfg) {
  var candleType = (cfg && cfg.candleType) || '15min';
  var minBars = (cfg && cfg.minCandles) || e5GetMinCandles_(candleType);
  var cache = CacheService.getScriptCache();
  var bkey = 'e5_cb_' + E5_CONFIG.PAIR + '_' + candleType + '_' + minBars;
  var bundled = cache.get(bkey);
  if (bundled) {
    try {
      var parsed = JSON.parse(bundled);
      if (parsed.length >= minBars) return parsed;
    } catch (e) {}
  }

  var maxDays = e5GetFetchDayCount_(candleType, minBars);
  var all = [];
  for (var daysAgo = 0; daysAgo < maxDays; daysAgo++) {
    var day = e5FetchCandlesDay_(daysAgo, candleType);
    if (day.length) all = day.concat(all);
    if (all.length >= minBars) break;
  }
  var deduped = e5DedupeCandles_(all);
  if (deduped.length >= minBars) {
    cache.put(bkey, JSON.stringify(deduped), E5_CONFIG.CANDLE_CACHE_TTL_SEC || 600);
  }
  return deduped;
}

/** @deprecated e5GetCandles_(cfg) を使用 */
function e5GetCandles1h_() {
  return e5GetCandles_(e5GetConfig_());
}

function e5InitPaperWallet_(state) {
  var cap = Number(
    PropertiesService.getScriptProperties().getProperty('PAPER_JPY') || E5_CONFIG.PAPER_JPY_DEFAULT
  );
  if (!state.paperWallet) {
    state.paperWallet = { jpy: cap, btc: 0, initial: cap };
  }
  return state.paperWallet;
}

function e5ApplyPaperTrade_(state, side, price, amount) {
  var w = e5InitPaperWallet_(state);
  var fee = E5_CONFIG.PAPER_FEE_RATE;
  if (side === 'buy' || side === '買い') {
    w.jpy -= price * amount * (1 + fee);
    w.btc += amount;
  } else {
    w.btc = Math.max(0, w.btc - amount);
    w.jpy += price * amount * (1 - fee);
  }
}

function e5GetAssetsForRun_(cfg, state) {
  if (cfg.dryRun) {
    var w = e5InitPaperWallet_(state);
    return { jpy: w.jpy, btc: w.btc, paper: true };
  }
  return e5GetAssets_();
}

function e5GetAssets_() {
  var data = e5PrivateRequest_('get', '/user/assets', null, null);
  var jpy = 0;
  var btc = 0;
  (data.assets || []).forEach(function (a) {
    if (a.asset === 'jpy') jpy = Number(a.free_amount);
    if (a.asset === 'btc') btc = Number(a.free_amount);
  });
  return { jpy: jpy, btc: btc };
}

function e5CancelAllOrders_(cfg) {
  if (cfg.dryRun) {
    e5Log_('[DRY_RUN] 全キャンセル（スキップ）');
    return;
  }
  var data = e5PrivateRequest_('get', '/user/spot/active_orders', 'pair=' + E5_CONFIG.PAIR, null);
  (data.orders || []).forEach(function (o) {
    if (o.user_cancelable) {
      e5PrivateRequest_('post', '/user/spot/cancel_order', null, {
        pair: E5_CONFIG.PAIR,
        order_id: Number(o.order_id),
      });
    }
  });
}

function e5PlaceLimit_(side, price, amount, cfg) {
  var body = {
    pair: E5_CONFIG.PAIR,
    side: side,
    type: 'limit',
    price: String(Math.round(price)),
    amount: amount.toFixed(E5_CONFIG.BTC_AMOUNT_DECIMALS),
  };
  if (cfg.dryRun) {
    e5Log_('[DRY_RUN] ' + side + ' limit price=' + body.price + ' amount=' + body.amount);
    return;
  }
  e5PrivateRequest_('post', '/user/spot/order', null, body);
}
