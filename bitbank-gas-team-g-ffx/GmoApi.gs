/**
 * GMOコイン API（外国為替FX）
 */
var GMO_API_CONFIG = {
  PUBLIC_API: 'https://forex-api.coin.z.com/public',
  PRIVATE_API: 'https://forex-api.coin.z.com/private',
  /** 日次 klines（変わらない） */
  KLINE_DAY_CACHE_SEC: 3600,
  /** 4H戦略向け — 1H足バンドル */
  KLINE_BUNDLE_CACHE_SEC: 1800,
  /** 全銘柄ティッカー一括 */
  TICKER_CACHE_SEC: 300,
};

function gmoNormalizeFxEndpoint_(raw, kind) {
  var fallback = kind === 'private' ? GMO_API_CONFIG.PRIVATE_API : GMO_API_CONFIG.PUBLIC_API;
  var base = String(raw || fallback).trim().replace(/\/+$/, '');
  if (!base) return fallback;
  if (base.indexOf('api.coin.z.com') >= 0) return fallback;
  if (base.indexOf('forex-api.coin.z.com') < 0) return fallback;
  var suffix = kind === 'private' ? '/private' : '/public';
  if (base.slice(-suffix.length) === suffix) return base;
  return base + suffix;
}

function gmoGetEndpoints_() {
  var p = PropertiesService.getScriptProperties();
  return {
    public: gmoNormalizeFxEndpoint_(p.getProperty('GMO_PUBLIC_API'), 'public'),
    private: gmoNormalizeFxEndpoint_(p.getProperty('GMO_PRIVATE_API'), 'private'),
  };
}

function gmoGetKlinePriceType_() {
  return PropertiesService.getScriptProperties().getProperty('GMO_KLINE_PRICE_TYPE') || 'ASK';
}

function gmoGetApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('GMO_API_KEY');
  if (!key) throw new Error('GMO_API_KEY が未設定です');
  return String(key).trim();
}

function gmoGetApiSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('GMO_API_SECRET');
  if (!secret) throw new Error('GMO_API_SECRET が未設定です');
  return String(secret).trim();
}

function gmoSign_(timestamp, method, path, body) {
  var secret = gmoGetApiSecret_();
  var text = timestamp + method + path + (body || '');
  var sig = Utilities.computeHmacSha256Signature(text, secret);
  return sig
    .map(function (b) {
      var v = b < 0 ? b + 256 : b;
      return ('0' + v.toString(16)).slice(-2);
    })
    .join('');
}

function gmoPrivateRequest_(method, path, query, bodyObj) {
  var key = gmoGetApiKey_();
  var signMethod = String(method || 'GET').toUpperCase();
  var fetchMethod = signMethod.toLowerCase();

  var ep = gmoGetEndpoints_();
  var timestamp = String(Date.now());
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var signPath = path;
  var signature = gmoSign_(timestamp, signMethod, signPath, body);

  var url = ep.private + path + (query ? '?' + query : '');
  var options = {
    method: fetchMethod,
    muteHttpExceptions: true,
    headers: {
      'API-KEY': key,
      'API-TIMESTAMP': timestamp,
      'API-SIGN': signature,
    },
  };
  if (body) {
    options.contentType = 'application/json';
    options.payload = body;
  }

  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  var text = res.getContentText();
  var json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('GMO private parse error HTTP' + code + ': ' + text.slice(0, 200));
  }
  if (code >= 400 || json.status !== 0) {
    var hint = '';
    if (text.indexOf('ERR-5010') >= 0) {
      hint =
        '（外国為替FX用 APIキー/シークレットか確認。G-CFXの暗号資産用キーは不可）';
    }
    throw new Error('GMO private error ' + code + ': ' + text.slice(0, 300) + hint);
  }
  return json.data;
}

var gmoMarginRunCache_ = null;
var gmoTickerMapRunCache_ = null;

function gmoResetMarginRunCache_() {
  gmoMarginRunCache_ = null;
  gmoTickerMapRunCache_ = null;
}

function gmoGetMarginCached_() {
  if (!gmoMarginRunCache_) gmoMarginRunCache_ = gmoGetMargin_();
  return gmoMarginRunCache_;
}

function gmoPublicGet_(path, options) {
  options = options || {};
  var ep = gmoGetEndpoints_();
  var url = ep.public + path;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code === 404 && options.allow404) return null;
  if (code < 200 || code >= 300) {
    throw new Error('GMO public HTTP ' + code + ' @ ' + url + ': ' + text.slice(0, 200));
  }
  var json = JSON.parse(text);
  if (json.status !== 0) throw new Error('GMO public error @ ' + url + ': ' + text.slice(0, 200));
  return json.data;
}

function gmoParseKlines_(rows) {
  if (!rows || !rows.length) return [];
  return rows.map(function (r) {
    return {
      time: Number(r.openTime),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume || 0),
    };
  });
}

function gmoFetchKlinesDay_(symbol, interval, ymd) {
  var cache = CacheService.getScriptCache();
  var ckey = 'gmo_fx_k_' + symbol + '_' + interval + '_' + ymd;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  var path =
    '/v1/klines?symbol=' +
    encodeURIComponent(symbol) +
    '&priceType=' +
    encodeURIComponent(gmoGetKlinePriceType_()) +
    '&interval=' +
    encodeURIComponent(interval) +
    '&date=' +
    ymd;
  var data = gmoPublicGet_(path, { allow404: true });
  var candles = gmoParseKlines_(data || []);
  if (candles.length) {
    cache.put(ckey, JSON.stringify(candles), GMO_API_CONFIG.KLINE_DAY_CACHE_SEC);
  }
  return candles;
}

function gmoGetCandles_(symbol, interval, minBars) {
  var cache = CacheService.getScriptCache();
  var bkey = 'gmo_fx_cb_' + symbol + '_' + interval + '_' + minBars;
  var bundled = cache.get(bkey);
  if (bundled) {
    try {
      var parsed = JSON.parse(bundled);
      if (parsed.length >= minBars) return parsed;
    } catch (e) {}
  }

  var maxDays = Math.min(14, Math.ceil(minBars / (interval === '5min' ? 288 : 24)) + 2);
  var all = [];
  for (var daysAgo = 0; daysAgo < maxDays; daysAgo++) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
    var day = gmoFetchKlinesDay_(symbol, interval, ymd);
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
  if (deduped.length >= minBars) {
    cache.put(bkey, JSON.stringify(deduped), GMO_API_CONFIG.KLINE_BUNDLE_CACHE_SEC);
  }
  return deduped;
}

function gmoGetCandles1h_(symbol, minBars) {
  return gmoGetCandles_(symbol, '1hour', minBars || GFFX_CONFIG.MIN_CANDLES_1H);
}

function gmoParseTickerRow_(row) {
  if (!row) return null;
  var last = Number(row.last || row.ask || row.bid);
  if (!last || isNaN(last)) return null;
  return {
    last: last,
    bid: Number(row.bid || last),
    ask: Number(row.ask || last),
    high: Number(row.high || last),
    low: Number(row.low || last),
  };
}

/** 全銘柄ティッカーを1回の UrlFetch で取得（GAS日次上限対策） */
function gmoGetAllTickersCached_() {
  if (gmoTickerMapRunCache_) return gmoTickerMapRunCache_;

  var cache = CacheService.getScriptCache();
  var ckey = 'gmo_fx_tickers_all';
  var cached = cache.get(ckey);
  if (cached) {
    try {
      gmoTickerMapRunCache_ = JSON.parse(cached);
      return gmoTickerMapRunCache_;
    } catch (e) {}
  }

  var data = gmoPublicGet_('/v1/ticker');
  var rows = Array.isArray(data) ? data : data ? [data] : [];
  var map = {};
  rows.forEach(function (row) {
    if (!row || !row.symbol) return;
    var parsed = gmoParseTickerRow_(row);
    if (parsed) map[String(row.symbol)] = parsed;
  });
  if (!Object.keys(map).length) throw new Error('GMO ティッカー一括取得が空');
  cache.put(ckey, JSON.stringify(map), GMO_API_CONFIG.TICKER_CACHE_SEC);
  gmoTickerMapRunCache_ = map;
  return map;
}

function gmoGetTicker_(symbol) {
  var map = gmoGetAllTickersCached_();
  var row = map[symbol];
  if (row) return row;

  var data = gmoPublicGet_('/v1/ticker?symbol=' + encodeURIComponent(symbol));
  var single = Array.isArray(data) ? data[0] : data;
  var parsed = gmoParseTickerRow_(single);
  if (!parsed) throw new Error(symbol + ' ティッカー空');
  return parsed;
}

function gmoGetStatus_() {
  return gmoPublicGet_('/v1/status');
}

function gmoGetMargin_() {
  return gmoPrivateRequest_('get', '/v1/account/assets', null, null);
}

function gmoGetOpenPositions_(symbol) {
  var query = symbol ? 'symbol=' + encodeURIComponent(symbol) : null;
  var data = gmoPrivateRequest_('get', '/v1/openPositions', query, null);
  return data.list || data || [];
}

function gmoSideFromGfx_(side) {
  return side === 'long' ? 'BUY' : 'SELL';
}

function gmoCloseSideFromGfx_(side) {
  return side === 'long' ? 'SELL' : 'BUY';
}

function gmoPlaceMarketOpen_(symbol, gffxSide, size) {
  return gmoPrivateRequest_('post', '/v1/order', null, {
    symbol: symbol,
    side: gmoSideFromGfx_(gffxSide),
    executionType: 'MARKET',
    size: String(size),
  });
}

function gmoPlaceMarketClose_(symbol, gffxSide, positionId, size) {
  return gmoPrivateRequest_('post', '/v1/closeOrder', null, {
    symbol: symbol,
    side: gmoCloseSideFromGfx_(gffxSide),
    executionType: 'MARKET',
    settlePosition: [
      {
        positionId: Number(positionId),
        size: String(size),
      },
    ],
  });
}

function gmoFindOpenPosition_(symbol, gffxSide, sizeHint) {
  Utilities.sleep(400);
  var want = gmoSideFromGfx_(gffxSide);
  var list = gmoGetOpenPositions_(symbol);
  var matches = (list || []).filter(function (p) {
    return String(p.symbol) === symbol && String(p.side) === want;
  });
  if (!matches.length) return null;
  matches.sort(function (a, b) {
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });
  var pos = matches[0];
  return {
    positionId: Number(pos.positionId),
    side: gffxSide,
    units: Number(pos.size),
    entryPrice: Number(pos.price),
    orderedSize: Number(pos.orderedSize || pos.orderdSize || 0),
  };
}

function gmoTestConnection_() {
  var symbol = 'USD_JPY';
  var ep = gmoGetEndpoints_();
  var ticker = gmoGetTicker_(symbol);
  var candles1h = gmoGetCandles1h_(symbol);
  var status = gmoGetStatus_();
  var margin = null;
  try {
    margin = gmoGetMargin_();
  } catch (e) {
    margin = { error: e.message };
  }
  return {
    symbol: symbol,
    last: ticker.last,
    candles1h: candles1h.length,
    endpoints: ep,
    status: status,
    margin: margin,
  };
}
