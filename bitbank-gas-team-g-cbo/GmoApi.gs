/**
 * GMOコイン API（暗号資産FX / レバレッジ）
 */
var GMO_API_CONFIG = {
  PUBLIC_API: 'https://api.coin.z.com/public',
  PRIVATE_API: 'https://api.coin.z.com/private',
  KLINE_DAY_CACHE_SEC: 3600,
  KLINE_BUNDLE_CACHE_SEC: 1800,
  TICKER_CACHE_SEC: 300,
  /** scan モード: Properties に足バンドルを保持（ScriptCache より長く・安定） */
  PROPS_BUNDLE_TTL_SEC: 10800,
};

function gmoNormalizeCryptoEndpoint_(raw, kind) {
  var fallback = kind === 'private' ? GMO_API_CONFIG.PRIVATE_API : GMO_API_CONFIG.PUBLIC_API;
  var base = String(raw || fallback).trim().replace(/\/+$/, '');
  if (!base) return fallback;
  if (base.indexOf('forex-api.coin.z.com') >= 0) return fallback;
  if (base.indexOf('api.coin.z.com') < 0) return fallback;
  var suffix = kind === 'private' ? '/private' : '/public';
  if (base.slice(-suffix.length) === suffix) return base;
  return base + suffix;
}

function gmoGetEndpoints_() {
  var p = PropertiesService.getScriptProperties();
  return {
    public: gmoNormalizeCryptoEndpoint_(p.getProperty('GMO_PUBLIC_API'), 'public'),
    private: gmoNormalizeCryptoEndpoint_(p.getProperty('GMO_PRIVATE_API'), 'private'),
  };
}

/** G-FFX 由来の forex-api 設定を暗号資産FX用に矯正 */
function gmoEnsureCryptoEndpoints_() {
  var p = PropertiesService.getScriptProperties();
  var pub = String(p.getProperty('GMO_PUBLIC_API') || '');
  var priv = String(p.getProperty('GMO_PRIVATE_API') || '');
  if (pub.indexOf('forex-api') >= 0 || priv.indexOf('forex-api') >= 0) {
    p.setProperty('GMO_PUBLIC_API', GMO_API_CONFIG.PUBLIC_API);
    p.setProperty('GMO_PRIVATE_API', GMO_API_CONFIG.PRIVATE_API);
  }
}

function gmoNormalizeLeverageSymbol_(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\//g, '_');
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

  var res = gmoFetchUrl_(url, options);
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
        '（暗号資産FX用APIキー/シークレット、エンドポイント api.coin.z.com、キー前後の空白を確認）';
    }
    throw new Error('GMO private error ' + code + ': ' + text.slice(0, 300) + hint);
  }
  return json.data;
}

var gmoMarginRunCache_ = null;
var gmoTickerMapRunCache_ = null;
var gmoOpenPositionsRunCache_ = null;

function gmoIsUrlFetchQuotaError_(msg) {
  msg = String(msg || '');
  return msg.indexOf('urlfetch') >= 0 || msg.indexOf('UrlFetch') >= 0;
}

function gmoUrlFetchQuotaDayKey_() {
  return Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
}

function gmoMarkUrlFetchQuotaExceeded_() {
  PropertiesService.getScriptProperties().setProperty('GMO_URLFETCH_QUOTA_DAY', gmoUrlFetchQuotaDayKey_());
}

function gmoClearUrlFetchQuotaIfNewDay_() {
  var p = PropertiesService.getScriptProperties();
  var marked = p.getProperty('GMO_URLFETCH_QUOTA_DAY');
  if (marked && marked !== gmoUrlFetchQuotaDayKey_()) {
    p.deleteProperty('GMO_URLFETCH_QUOTA_DAY');
  }
}

/** 本日（太平洋時間）すでに UrlFetch 上限に達したら true */
function gmoIsUrlFetchQuotaBlocked_() {
  gmoClearUrlFetchQuotaIfNewDay_();
  return PropertiesService.getScriptProperties().getProperty('GMO_URLFETCH_QUOTA_DAY') === gmoUrlFetchQuotaDayKey_();
}

function gmoFetchUrl_(url, options) {
  try {
    return UrlFetchApp.fetch(url, options);
  } catch (e) {
    if (gmoIsUrlFetchQuotaError_(e.message)) gmoMarkUrlFetchQuotaExceeded_();
    throw e;
  }
}

function gmoIsScanMode_() {
  return PropertiesService.getScriptProperties().getProperty('MICRO_LIVE_SCAN_MODE') === 'true';
}

function gmoCacheTtl_(baseSec) {
  if (!gmoIsScanMode_()) return baseSec;
  if (baseSec === GMO_API_CONFIG.KLINE_DAY_CACHE_SEC) return 21600;
  if (baseSec === GMO_API_CONFIG.KLINE_BUNDLE_CACHE_SEC) return GMO_API_CONFIG.PROPS_BUNDLE_TTL_SEC;
  if (baseSec === GMO_API_CONFIG.TICKER_CACHE_SEC) return 1800;
  return baseSec * 4;
}

function gmoPropsBundleKey_(symbol, interval, minBars) {
  return 'GMO_CB_' + symbol + '_' + interval + '_' + minBars;
}

function gmoPropsBundleTsKey_(symbol, interval, minBars) {
  return 'GMO_CBTS_' + symbol + '_' + interval + '_' + minBars;
}

function gmoLoadBundleFromProps_(symbol, interval, minBars) {
  if (!gmoIsScanMode_()) return null;
  var ttl = GMO_API_CONFIG.PROPS_BUNDLE_TTL_SEC;
  var p = PropertiesService.getScriptProperties();
  var ts = Number(p.getProperty(gmoPropsBundleTsKey_(symbol, interval, minBars)) || 0);
  if (!ts || Date.now() - ts > ttl * 1000) return null;
  var raw = p.getProperty(gmoPropsBundleKey_(symbol, interval, minBars));
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    if (parsed.length >= minBars) return parsed;
  } catch (e) { /* ignore */ }
  return null;
}

function gmoSaveBundleToProps_(symbol, interval, minBars, candles) {
  if (!gmoIsScanMode_() || !candles || !candles.length) return;
  var json = JSON.stringify(candles);
  if (json.length > 450000) return;
  var p = PropertiesService.getScriptProperties();
  p.setProperty(gmoPropsBundleKey_(symbol, interval, minBars), json);
  p.setProperty(gmoPropsBundleTsKey_(symbol, interval, minBars), String(Date.now()));
}

function gmoAsArray_(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  return [];
}

function gmoNormalizePositionList_(data) {
  if (!data) return [];
  if (data.list != null) return gmoAsArray_(data.list);
  return gmoAsArray_(data);
}

function gmoResetMarginRunCache_() {
  gmoMarginRunCache_ = null;
  gmoTickerMapRunCache_ = null;
  gmoOpenPositionsRunCache_ = null;
}

function gmoGetMarginCached_() {
  if (!gmoMarginRunCache_) gmoMarginRunCache_ = gmoGetMargin_();
  return gmoMarginRunCache_;
}

function gmoPublicGet_(path, opts) {
  opts = opts || {};
  var ep = gmoGetEndpoints_();
  var url = ep.public + path;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    if (opts.allowNotFound && code === 404) return null;
    throw new Error('GMO public HTTP ' + code + ': ' + text.slice(0, 200));
  }
  var json = JSON.parse(text);
  if (json.status !== 0) {
    if (opts.allowNotFound && json.status === 2) return null;
    throw new Error('GMO public error: ' + text.slice(0, 200));
  }
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
  symbol = gmoNormalizeLeverageSymbol_(symbol);
  if (!symbol) return [];

  var cache = CacheService.getScriptCache();
  var ckey = 'gmo_crypto_k_' + symbol + '_' + interval + '_' + ymd;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  var path =
    '/v1/klines?symbol=' +
    encodeURIComponent(symbol) +
    '&interval=' +
    encodeURIComponent(interval) +
    '&date=' +
    ymd;
  var data = gmoPublicGet_(path, { allowNotFound: true });
  if (!data) return [];
  var candles = gmoParseKlines_(data);
  if (candles.length) {
    cache.put(ckey, JSON.stringify(candles), gmoCacheTtl_(GMO_API_CONFIG.KLINE_DAY_CACHE_SEC));
  }
  return candles;
}

function gmoGetCandles_(symbol, interval, minBars) {
  symbol = gmoNormalizeLeverageSymbol_(symbol);
  if (!symbol) return [];

  var fromProps = gmoLoadBundleFromProps_(symbol, interval, minBars);
  if (fromProps) return fromProps;

  var cache = CacheService.getScriptCache();
  var bkey = 'gmo_crypto_cb_' + symbol + '_' + interval + '_' + minBars;
  var bundled = cache.get(bkey);
  if (bundled) {
    try {
      var parsed = JSON.parse(bundled);
      if (parsed.length >= minBars) return parsed;
    } catch (e) {}
  }

  var maxDays = Math.min(12, Math.ceil(minBars / (interval === '5min' ? 288 : 24)) + 1);
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
  if (deduped.length) {
    cache.put(bkey, JSON.stringify(deduped), gmoCacheTtl_(GMO_API_CONFIG.KLINE_BUNDLE_CACHE_SEC));
    gmoSaveBundleToProps_(symbol, interval, minBars, deduped);
  }
  return deduped;
}

var gmoCandlesRunCache_ = {};

function gmoResetCandlesRunCache_() {
  gmoCandlesRunCache_ = {};
}

function gmoGetCandles1h_(symbol, minBars) {
  minBars = minBars || GCBO_CONFIG.MIN_CANDLES_1H;
  var runKey = symbol + '_' + minBars;
  if (gmoCandlesRunCache_[runKey]) return gmoCandlesRunCache_[runKey];
  var candles = gmoGetCandles_(symbol, '1hour', minBars);
  gmoCandlesRunCache_[runKey] = candles;
  return candles;
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

function gmoGetAllTickersCached_() {
  if (gmoTickerMapRunCache_) return gmoTickerMapRunCache_;

  var cache = CacheService.getScriptCache();
  var ckey = 'gmo_crypto_tickers_all';
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
  cache.put(ckey, JSON.stringify(map), gmoCacheTtl_(GMO_API_CONFIG.TICKER_CACHE_SEC));
  gmoTickerMapRunCache_ = map;
  return map;
}

function gmoGetTicker_(symbol) {
  symbol = gmoNormalizeLeverageSymbol_(symbol);
  if (!symbol) throw new Error('GMO symbol 未設定');

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
  return gmoPrivateRequest_('get', '/v1/account/margin', null, null);
}

function gmoFetchOpenPositionsForSymbol_(symbol, page) {
  var sym = gmoNormalizeLeverageSymbol_(symbol);
  if (!sym) return [];
  page = page || 1;
  var query = 'symbol=' + encodeURIComponent(sym) + '&page=' + page + '&count=100';
  var data = gmoPrivateRequest_('get', '/v1/openPositions', query, null);
  return gmoNormalizePositionList_(data);
}

function gmoGetAllOpenPositionsCached_() {
  if (gmoOpenPositionsRunCache_) return gmoOpenPositionsRunCache_;

  var all = [];
  try {
    var summary = gmoPrivateRequest_('get', '/v1/positionSummary', null, null);
    var rows = summary && summary.list != null ? gmoAsArray_(summary.list) : gmoAsArray_(summary);
    var symbols = {};
    rows.forEach(function (row) {
      if (!row || !row.symbol) return;
      if (Number(row.sumPositionQuantity || 0) > 0) {
        symbols[gmoNormalizeLeverageSymbol_(row.symbol)] = true;
      }
    });
    Object.keys(symbols).forEach(function (sym) {
      try {
        all = all.concat(gmoFetchOpenPositionsForSymbol_(sym, 1));
      } catch (e) {
        /* 銘柄単位で失敗しても他銘柄は継続 */
      }
    });
  } catch (e) {
    all = [];
  }
  gmoOpenPositionsRunCache_ = all;
  return gmoOpenPositionsRunCache_;
}

function gmoGetOpenPositions_(symbol) {
  if (symbol) {
    return gmoFetchOpenPositionsForSymbol_(symbol, 1);
  }
  return gmoGetAllOpenPositionsCached_().slice();
}

function gmoSideFromGfx_(side) {
  return side === 'long' ? 'BUY' : 'SELL';
}

function gmoCloseSideFromGfx_(side) {
  return side === 'long' ? 'SELL' : 'BUY';
}

function gmoPlaceMarketOpen_(symbol, gcboSide, size) {
  symbol = gmoNormalizeLeverageSymbol_(symbol);
  return gmoPrivateRequest_('post', '/v1/order', null, {
    symbol: symbol,
    side: gmoSideFromGfx_(gcboSide),
    executionType: 'MARKET',
    size: String(size),
  });
}

function gmoPlaceMarketClose_(symbol, gcboSide, positionId, size) {
  symbol = gmoNormalizeLeverageSymbol_(symbol);
  return gmoPrivateRequest_('post', '/v1/closeOrder', null, {
    symbol: symbol,
    side: gmoCloseSideFromGfx_(gcboSide),
    executionType: 'MARKET',
    settlePosition: [
      {
        positionId: Number(positionId),
        size: String(size),
      },
    ],
  });
}

function gmoFindOpenPosition_(symbol, gcboSide, sizeHint) {
  Utilities.sleep(400);
  symbol = gmoNormalizeLeverageSymbol_(symbol);
  var want = gmoSideFromGfx_(gcboSide);
  var list = gmoGetOpenPositions_(symbol);
  var matches = list.filter(function (p) {
    return gmoNormalizeLeverageSymbol_(p.symbol) === symbol && String(p.side) === want;
  });
  if (!matches.length) return null;
  matches.sort(function (a, b) {
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });
  var pos = matches[0];
  return {
    positionId: Number(pos.positionId),
    side: gcboSide,
    units: Number(pos.size),
    entryPrice: Number(pos.price),
    orderedSize: Number(pos.orderdSize || 0),
  };
}

function gmoTestConnection_() {
  gmoEnsureCryptoEndpoints_();
  var symbol = 'BTC_JPY';
  var ep = gmoGetEndpoints_();
  var ticker = gmoGetTicker_(symbol);
  var ymd = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  var candlesToday = gmoFetchKlinesDay_(symbol, '1hour', ymd);
  var margin = null;
  try {
    margin = gmoGetMargin_();
  } catch (e) {
    margin = { error: e.message };
  }
  return {
    symbol: symbol,
    last: ticker.last,
    candles1h: candlesToday.length,
    candlesNote: '本日1Hのみ（軽量）',
    endpoints: ep,
    margin: margin,
  };
}
