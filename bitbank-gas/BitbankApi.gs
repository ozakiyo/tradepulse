function bbSign_(nonce, message) {
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

function bbPrivateRequest_(method, path, query, bodyObj) {
  var key = PropertiesService.getScriptProperties().getProperty('BITBANK_API_KEY');
  if (!key) throw new Error('BITBANK_API_KEY が未設定です');

  var nonce = String(Date.now());
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var signPath = '/v1' + path;
  var signMsg = body ? nonce + body : nonce + signPath + (query ? '?' + query : '');
  var signature = bbSign_(nonce, signMsg);

  var url = BB_CONFIG.PRIVATE_API + path + (query ? '?' + query : '');
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

function bbPublicGet_(path) {
  var url = BB_CONFIG.PUBLIC_API + path;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var json = JSON.parse(res.getContentText());
  if (!json.success) throw new Error('bitbank public error: ' + res.getContentText().slice(0, 200));
  return json.data;
}

function bbGetTicker_() {
  var data = bbPublicGet_('/' + BB_CONFIG.PAIR + '/ticker');
  return {
    last: Number(data.last),
    buy: Number(data.buy),
    sell: Number(data.sell),
    high: Number(data.high),
    low: Number(data.low),
  };
}

function bbFetchCandles1hDay_(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
  var data = bbPublicGet_('/' + BB_CONFIG.PAIR + '/candlestick/1hour/' + ymd);
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

function bbGetCandles1h_() {
  var today = bbFetchCandles1hDay_(0);
  if (today.length < 40) {
    var yest = bbFetchCandles1hDay_(1);
    return yest.concat(today);
  }
  return today;
}

function bbGetAssets_() {
  var data = bbPrivateRequest_('get', '/user/assets', null, null);
  var jpy = 0;
  var btc = 0;
  (data.assets || []).forEach(function (a) {
    if (a.asset === 'jpy') jpy = Number(a.free_amount);
    if (a.asset === 'btc') btc = Number(a.free_amount);
  });
  return { jpy: jpy, btc: btc };
}

function bbGetActiveOrders_() {
  var data = bbPrivateRequest_('get', '/user/spot/active_orders', 'pair=' + BB_CONFIG.PAIR, null);
  return data.orders || [];
}

function bbPlaceLimit_(side, price, amount, cfg) {
  var body = {
    pair: BB_CONFIG.PAIR,
    side: side,
    type: 'limit',
    price: String(Math.round(price)),
    amount: amount.toFixed(BB_CONFIG.BTC_AMOUNT_DECIMALS),
  };
  if (cfg.dryRun) {
    bbLog_('[DRY_RUN] ' + side + ' limit price=' + body.price + ' amount=' + body.amount);
    return { order_id: 'dry-' + Date.now(), dryRun: true };
  }
  return bbPrivateRequest_('post', '/user/spot/order', null, body);
}

function bbCancelOrder_(orderId, cfg) {
  var body = { pair: BB_CONFIG.PAIR, order_id: Number(orderId) };
  if (cfg.dryRun) {
    bbLog_('[DRY_RUN] cancel order_id=' + orderId);
    return;
  }
  bbPrivateRequest_('post', '/user/spot/cancel_order', null, body);
}

function bbCancelAllOrders_(cfg) {
  var orders = bbGetActiveOrders_();
  orders.forEach(function (o) {
    if (o.user_cancelable) bbCancelOrder_(o.order_id, cfg);
  });
  bbLog_('キャンセル件数: ' + orders.length);
}
