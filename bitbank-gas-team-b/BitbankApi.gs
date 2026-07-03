function b2Sign_(nonce, message) {
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

function b2PrivateRequest_(method, path, query, bodyObj) {
  var key = PropertiesService.getScriptProperties().getProperty('BITBANK_API_KEY');
  if (!key) throw new Error('BITBANK_API_KEY が未設定です');

  var nonce = String(Date.now());
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var signPath = '/v1' + path;
  var signMsg = body ? nonce + body : nonce + signPath + (query ? '?' + query : '');
  var signature = b2Sign_(nonce, signMsg);

  var url = B2_CONFIG.PRIVATE_API + path + (query ? '?' + query : '');
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

function b2PublicGet_(path) {
  var url = B2_CONFIG.PUBLIC_API + path;
  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
    });
  } catch (e) {
    throw new Error(
      'bitbank公開APIに接続できません（' +
        url +
        '）。\n' +
        '対処: Apps Scriptエディタで b2TestConnection を実行 → 「外部サービスへのアクセス」を許可。\n' +
        '詳細: ' +
        String(e.message || e)
    );
  }
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('bitbank public HTTP ' + code + ': ' + text.slice(0, 200));
  }
  var json = JSON.parse(text);
  if (!json.success) throw new Error('bitbank public error: ' + text.slice(0, 200));
  return json.data;
}

/** 日次ローソク用。当日未生成など code 10000 / 404 は空扱い */
function b2PublicGetCandlesDay_(path, ymd) {
  var url = B2_CONFIG.PUBLIC_API + path;
  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
    });
  } catch (e) {
    throw new Error('bitbank公開APIに接続できません: ' + String(e.message || e));
  }
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 404) {
    b2Log_('ローソク未取得(404) ' + ymd);
    return null;
  }
  var json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('bitbank public parse error: ' + text.slice(0, 200));
  }
  if (!json.success) {
    if (json.data && json.data.code === 10000) {
      b2Log_('ローソク未取得(code10000) ' + ymd + ' — 前日以前から取得');
      return null;
    }
    throw new Error('bitbank public error: ' + text.slice(0, 200));
  }
  return json.data;
}

function b2GetTicker_() {
  var data = b2PublicGet_('/' + B2_CONFIG.PAIR + '/ticker');
  return {
    last: Number(data.last),
    buy: Number(data.buy),
    sell: Number(data.sell),
    high: Number(data.high),
    low: Number(data.low),
  };
}

function b2FetchCandles1hDay_(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
  var cache = CacheService.getScriptCache();
  var ckey = 'b2_cd_' + B2_CONFIG.PAIR + '_1hour_' + ymd;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = b2PublicGetCandlesDay_('/' + B2_CONFIG.PAIR + '/candlestick/1hour/' + ymd, ymd);
  if (!data) return [];
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

function b2GetCandles1h_() {
  var minBars = B2_CONFIG.MIN_CANDLES_1H || 55;
  var cache = CacheService.getScriptCache();
  var bkey = 'b2_cb_' + B2_CONFIG.PAIR + '_1hour_' + minBars;
  var bundled = cache.get(bkey);
  if (bundled) {
    try {
      var parsed = JSON.parse(bundled);
      if (parsed.length >= minBars) return parsed;
    } catch (e) {}
  }
  var maxDays = Math.min(B2_CONFIG.CANDLE_FETCH_MAX_DAYS || 5, Math.ceil(minBars / 24) + 1);
  var all = [];
  for (var daysAgo = 0; daysAgo < maxDays; daysAgo++) {
    var day = b2FetchCandles1hDay_(daysAgo);
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

function b2InitPaperWallet_(state) {
  var cap = Number(
    PropertiesService.getScriptProperties().getProperty('PAPER_JPY') ||
      B2_CONFIG.PAPER_JPY_DEFAULT
  );
  if (!state.paperWallet) {
    state.paperWallet = { jpy: cap, btc: 0, initial: cap };
  }
  return state.paperWallet;
}

function b2ApplyPaperTrade_(state, side, price, amount) {
  var w = b2InitPaperWallet_(state);
  var fee = B2_CONFIG.PAPER_FEE_RATE;
  if (side === 'buy' || side === '買い') {
    w.jpy -= price * amount * (1 + fee);
    w.btc += amount;
  } else {
    w.btc = Math.max(0, w.btc - amount);
    w.jpy += price * amount * (1 - fee);
  }
}

/** DRY_RUN: 実残高は見ない。紙ウォレット（既定30万円）のみ使用 */
function b2GetAssetsForRun_(cfg, state) {
  if (cfg.dryRun) {
    var w = b2InitPaperWallet_(state);
    return { jpy: w.jpy, btc: w.btc, paper: true };
  }
  return b2GetAssets_();
}

function b2GetAssets_() {
  var data = b2PrivateRequest_('get', '/user/assets', null, null);
  var jpy = 0;
  var btc = 0;
  (data.assets || []).forEach(function (a) {
    if (a.asset === 'jpy') jpy = Number(a.free_amount);
    if (a.asset === 'btc') btc = Number(a.free_amount);
  });
  return { jpy: jpy, btc: btc };
}

function b2GetActiveOrders_() {
  var data = b2PrivateRequest_('get', '/user/spot/active_orders', 'pair=' + B2_CONFIG.PAIR, null);
  return data.orders || [];
}

function b2PlaceLimit_(side, price, amount, cfg) {
  var body = {
    pair: B2_CONFIG.PAIR,
    side: side,
    type: 'limit',
    price: String(Math.round(price)),
    amount: amount.toFixed(B2_CONFIG.BTC_AMOUNT_DECIMALS),
  };
  if (cfg.dryRun) {
    b2Log_('[DRY_RUN] ' + side + ' limit price=' + body.price + ' amount=' + body.amount);
    return { order_id: 'dry-' + Date.now(), dryRun: true };
  }
  return b2PrivateRequest_('post', '/user/spot/order', null, body);
}

function b2CancelOrder_(orderId, cfg) {
  var body = { pair: B2_CONFIG.PAIR, order_id: Number(orderId) };
  if (cfg.dryRun) {
    b2Log_('[DRY_RUN] cancel order_id=' + orderId);
    return;
  }
  b2PrivateRequest_('post', '/user/spot/cancel_order', null, body);
}

function b2CancelUnfilledBuyOrders_(cfg) {
  if (cfg.dryRun) {
    b2Log_('[DRY_RUN] 未約定買いキャンセル（APIスキップ）');
    return 0;
  }
  var orders = b2GetActiveOrders_();
  var n = 0;
  orders.forEach(function (o) {
    if (o.side === 'buy' && o.user_cancelable) {
      b2CancelOrder_(o.order_id, cfg);
      n += 1;
    }
  });
  b2Log_('未約定買いキャンセル: ' + n + ' 件');
  return n;
}

function b2CancelAllOrders_(cfg) {
  if (cfg.dryRun) {
    b2Log_('[DRY_RUN] 全キャンセル（APIスキップ）');
    return;
  }
  var orders = b2GetActiveOrders_();
  orders.forEach(function (o) {
    if (o.user_cancelable) b2CancelOrder_(o.order_id, cfg);
  });
  b2Log_('キャンセル件数: ' + orders.length);
}
