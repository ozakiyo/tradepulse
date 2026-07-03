function c3Sign_(nonce, message) {
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

function c3PrivateRequest_(method, path, query, bodyObj) {
  var key = PropertiesService.getScriptProperties().getProperty('BITBANK_API_KEY');
  if (!key) throw new Error('BITBANK_API_KEY が未設定です');
  var nonce = String(Date.now());
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var signPath = '/v1' + path;
  var signMsg = body ? nonce + body : nonce + signPath + (query ? '?' + query : '');
  var signature = c3Sign_(nonce, signMsg);
  var url = C3_CONFIG.PRIVATE_API + path + (query ? '?' + query : '');
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

function c3PublicGet_(path) {
  var url = C3_CONFIG.PUBLIC_API + path;
  var res;
  try {
    res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  } catch (e) {
    throw new Error('bitbank公開API接続失敗: ' + String(e.message || e));
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

function c3GetTicker_() {
  var data = c3PublicGet_('/' + C3_CONFIG.PAIR + '/ticker');
  return { last: Number(data.last), high: Number(data.high), low: Number(data.low) };
}

function c3FetchCandles1hDay_(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
  var cache = CacheService.getScriptCache();
  var ckey = 'c3_cd_' + C3_CONFIG.PAIR + '_1hour_' + ymd;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = c3PublicGet_('/' + C3_CONFIG.PAIR + '/candlestick/1hour/' + ymd);
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

function c3GetCandles1h_() {
  var minBars = C3_CONFIG.MIN_CANDLES_1H;
  var cache = CacheService.getScriptCache();
  var bkey = 'c3_cb_' + C3_CONFIG.PAIR + '_1hour_' + minBars;
  var bundled = cache.get(bkey);
  if (bundled) {
    try {
      var parsed = JSON.parse(bundled);
      if (parsed.length >= minBars) return parsed;
    } catch (e) {}
  }
  var maxDays = Math.min(C3_CONFIG.CANDLE_FETCH_MAX_DAYS || 5, Math.ceil(minBars / 24) + 1);
  var all = [];
  for (var daysAgo = 0; daysAgo < maxDays; daysAgo++) {
    var day = c3FetchCandles1hDay_(daysAgo);
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

function c3InitPaperWallet_(state) {
  var cap = Number(
    PropertiesService.getScriptProperties().getProperty('PAPER_JPY') || C3_CONFIG.PAPER_JPY_DEFAULT
  );
  if (!state.paperWallet) {
    state.paperWallet = { jpy: cap, btc: 0, initial: cap };
  }
  return state.paperWallet;
}

function c3ApplyPaperTrade_(state, side, price, amount) {
  var w = c3InitPaperWallet_(state);
  var fee = C3_CONFIG.PAPER_FEE_RATE;
  if (side === 'buy' || side === '買い') {
    w.jpy -= price * amount * (1 + fee);
    w.btc += amount;
  } else {
    w.btc = Math.max(0, w.btc - amount);
    w.jpy += price * amount * (1 - fee);
  }
}

function c3GetAssetsForRun_(cfg, state) {
  if (cfg.dryRun) {
    var w = c3InitPaperWallet_(state);
    return { jpy: w.jpy, btc: w.btc, paper: true };
  }
  return c3GetAssets_();
}

function c3GetAssets_() {
  var data = c3PrivateRequest_('get', '/user/assets', null, null);
  var jpy = 0;
  var btc = 0;
  (data.assets || []).forEach(function (a) {
    if (a.asset === 'jpy') jpy = Number(a.free_amount);
    if (a.asset === 'btc') btc = Number(a.free_amount);
  });
  return { jpy: jpy, btc: btc };
}

function c3CancelAllOrders_(cfg) {
  if (cfg.dryRun) {
    c3Log_('[DRY_RUN] 全キャンセル（スキップ）');
    return;
  }
  var data = c3PrivateRequest_('get', '/user/spot/active_orders', 'pair=' + C3_CONFIG.PAIR, null);
  (data.orders || []).forEach(function (o) {
    if (o.user_cancelable) {
      c3PrivateRequest_('post', '/user/spot/cancel_order', null, {
        pair: C3_CONFIG.PAIR,
        order_id: Number(o.order_id),
      });
    }
  });
}

function c3PlaceLimit_(side, price, amount, cfg) {
  var body = {
    pair: C3_CONFIG.PAIR,
    side: side,
    type: 'limit',
    price: String(Math.round(price)),
    amount: amount.toFixed(C3_CONFIG.BTC_AMOUNT_DECIMALS),
  };
  if (cfg.dryRun) {
    c3Log_('[DRY_RUN] ' + side + ' limit price=' + body.price + ' amount=' + body.amount);
    return;
  }
  c3PrivateRequest_('post', '/user/spot/order', null, body);
}
