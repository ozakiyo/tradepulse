function kGetApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('BITBANK_API_KEY');
  if (!key) throw new Error('BITBANK_API_KEY が未設定です');
  key = String(key).trim();
  if (!key) throw new Error('BITBANK_API_KEY が空です');
  return key;
}

function kGetApiSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('BITBANK_API_SECRET');
  if (!secret) throw new Error('BITBANK_API_SECRET が未設定です');
  secret = String(secret).trim();
  if (!secret) throw new Error('BITBANK_API_SECRET が空です');
  return secret;
}

function kSign_(message) {
  var secret = kGetApiSecret_();
  var sig = Utilities.computeHmacSha256Signature(message, secret);
  return sig
    .map(function (b) {
      var v = b < 0 ? b + 256 : b;
      return ('0' + v.toString(16)).slice(-2);
    })
    .join('');
}

function kPrivateRequest_(method, path, query, bodyObj) {
  var key = kGetApiKey_();
  var nonce = String(Date.now());
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var signPath = '/v1' + path;
  var signMsg = body ? nonce + body : nonce + signPath + (query ? '?' + query : '');
  var signature = kSign_(signMsg);
  var url = K_CONFIG.PRIVATE_API + path + (query ? '?' + query : '');
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
    var apiCode = json.data && json.data.code;
    if (apiCode === 20001) {
      throw new Error('bitbank 認証エラー(20001): APIキー/権限を確認してください');
    }
    throw new Error('bitbank API error ' + code + ': ' + text.slice(0, 300));
  }
  return json.data;
}

function kPublicGet_(path) {
  var url = K_CONFIG.PUBLIC_API + path;
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

function kPublicGetCandles_(path) {
  var url = K_CONFIG.PUBLIC_API + path;
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

function kParseOhlcvRows_(data) {
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

/** 1week / 1month は YYYY 指定。複数年を結合 */
function kFetchHtfCandles_(pair, candleType, yearsBack) {
  yearsBack = yearsBack != null ? yearsBack : K_CONFIG.HTF_YEARS_BACK;
  var cache = CacheService.getScriptCache();
  var ckey = 'k_htf_' + pair + '_' + candleType + '_' + yearsBack;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var yearNow = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy'));
  var all = [];
  for (var y = yearNow - yearsBack; y <= yearNow; y++) {
    var data = kPublicGetCandles_('/' + pair + '/candlestick/' + candleType + '/' + y);
    if (!data) continue;
    all = all.concat(kParseOhlcvRows_(data));
  }
  all.sort(function (a, b) {
    return a.time - b.time;
  });
  var deduped = [];
  var lastT = null;
  all.forEach(function (c) {
    if (c.time === lastT) return;
    lastT = c.time;
    deduped.push(c);
  });
  if (deduped.length) cache.put(ckey, JSON.stringify(deduped), 3600);
  return deduped;
}

function kYmdDaysAgo_(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
}

function kFetchCandlesDay_(pair, interval, daysAgo) {
  var ymd = kYmdDaysAgo_(daysAgo);
  var cache = CacheService.getScriptCache();
  var ckey = 'k_cd_' + pair + '_' + interval + '_' + ymd;
  var cached = cache.get(ckey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = kPublicGetCandles_('/' + pair + '/candlestick/' + interval + '/' + ymd);
  if (!data) return [];
  var candles = kParseOhlcvRows_(data);
  if (candles.length) {
    cache.put(ckey, JSON.stringify(candles), K_CONFIG.CANDLE_DAY_CACHE_SEC || 900);
  }
  return candles;
}

function kGetCandles1h_(pair, minBars) {
  minBars = minBars || 55;
  var maxDays = Math.min(K_CONFIG.CANDLE_FETCH_MAX_DAYS || 50, Math.ceil(minBars / 24) + 2);
  var all = [];
  for (var d = 0; d < maxDays; d++) {
    all = kFetchCandlesDay_(pair, '1hour', d).concat(all);
  }
  all.sort(function (a, b) {
    return a.time - b.time;
  });
  var out = [];
  var lastT = null;
  all.forEach(function (c) {
    if (c.time === lastT) return;
    lastT = c.time;
    out.push(c);
  });
  return out;
}

function kAggregateDailyFrom1h_(candles1h, lookbackDays) {
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

function kGetTicker_(pair) {
  var cache = CacheService.getScriptCache();
  var tkey = 'k_tk_' + pair;
  var cached = cache.get(tkey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var data = kPublicGet_('/' + pair + '/ticker');
  var last = Number(data.last);
  var buy = Number(data.buy);
  var sell = Number(data.sell);
  var vol = Number(data.vol != null ? data.vol : data.volume);
  var mid = buy > 0 && sell > 0 ? (buy + sell) / 2 : last;
  var spreadPct = mid > 0 && sell >= buy ? ((sell - buy) / mid) * 100 : 999;
  var volumeJpy = vol > 0 && last > 0 ? vol * last : 0;
  var ticker = {
    last: last,
    buy: buy,
    sell: sell,
    vol: vol,
    volumeJpy: volumeJpy,
    spreadPct: spreadPct,
  };
  cache.put(tkey, JSON.stringify(ticker), K_CONFIG.TICKER_CACHE_SEC || 120);
  return ticker;
}

/**
 * 薄い板判定。不合格なら { ok:false, reason }
 * 優先銘柄は流動性フィルタ対象外（呼び出し側で skip 可）
 */
function kCheckLiquidity_(pair, cfg, ticker) {
  cfg = cfg || kGetConfig_();
  if (cfg.liquidityFilterEnabled === false) return { ok: true, reason: '' };
  ticker = ticker || kGetTicker_(pair);
  var minVol =
    cfg.minVolumeJpy != null ? Number(cfg.minVolumeJpy) : Number(K_CONFIG.MIN_VOLUME_JPY || 0);
  var maxSp =
    cfg.maxSpreadPct != null ? Number(cfg.maxSpreadPct) : Number(K_CONFIG.MAX_SPREAD_PCT || 999);
  var volJpy = ticker.volumeJpy;
  if (volJpy == null && ticker.vol != null && ticker.last) {
    volJpy = Number(ticker.vol) * Number(ticker.last);
  }
  var sp = ticker.spreadPct;
  if (sp == null && ticker.buy > 0 && ticker.sell > 0 && ticker.last > 0) {
    sp = ((ticker.sell - ticker.buy) / ((ticker.buy + ticker.sell) / 2)) * 100;
  }
  if (minVol > 0 && !(volJpy >= minVol)) {
    return {
      ok: false,
      reason: '出来高不足 vol¥' + Math.round(volJpy || 0) + '<' + minVol,
      volumeJpy: volJpy,
      spreadPct: sp,
    };
  }
  if (maxSp < 999 && !(sp <= maxSp)) {
    return {
      ok: false,
      reason: 'スプレッド広い ' + (sp != null ? sp.toFixed(3) : '?') + '%>' + maxSp + '%',
      volumeJpy: volJpy,
      spreadPct: sp,
    };
  }
  return { ok: true, reason: '', volumeJpy: volJpy, spreadPct: sp };
}

function kFetchSpotPairs_() {
  var url = K_CONFIG.PRIVATE_API + '/spot/pairs';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var json = JSON.parse(res.getContentText());
  if (!json.success) throw new Error('spot/pairs error: ' + res.getContentText().slice(0, 200));
  var list = json.data.pairs || json.data || [];
  return list.filter(function (p) {
    return p.is_enabled && String(p.name).endsWith('_jpy');
  });
}

function kGetAssets_(asset) {
  var data = kPrivateRequest_('get', '/user/assets', null, null);
  var jpy = 0;
  var coin = 0;
  (data.assets || []).forEach(function (a) {
    if (a.asset === 'jpy') jpy = Number(a.free_amount);
    if (a.asset === asset) coin = Number(a.free_amount);
  });
  return { jpy: jpy, coin: coin };
}

function kInitPaperWallet_(global, cfg) {
  cfg = cfg || kGetConfig_();
  var cap = cfg.paperJpyDefault || K_CONFIG.PAPER_JPY_DEFAULT;
  if (!global.paperWallet) {
    global.paperWallet = { jpy: cap, coins: {}, initial: cap };
  }
  if (!global.paperWallet.coins) global.paperWallet.coins = {};
  return global.paperWallet;
}

function kApplyPaperTrade_(global, pair, side, price, amount, role) {
  var w = kInitPaperWallet_(global, kGetConfig_());
  var asset = String(pair).split('_')[0];
  var feePct = kGetFeePct_(pair, role || 'maker');
  if (side === 'buy') {
    var cost = price * amount * (1 + Math.max(0, feePct));
    w.jpy -= cost;
    w.coins[asset] = (w.coins[asset] || 0) + amount;
  } else {
    w.coins[asset] = Math.max(0, (w.coins[asset] || 0) - amount);
    w.jpy += price * amount * (1 - Math.max(0, feePct));
  }
}

function kGetAssetsForPair_(pair, cfg, global) {
  cfg = cfg || kGetConfig_();
  var asset = kGetInstrument_(pair).asset;
  if (cfg.dryRun) {
    var w = kInitPaperWallet_(global, cfg);
    return { jpy: w.jpy, coin: w.coins[asset] || 0, paper: true };
  }
  return kGetAssets_(asset);
}

function kPlaceLimit_(pair, side, price, amount, cfg) {
  cfg = cfg || kGetConfig_();
  var body = {
    pair: pair,
    side: side,
    type: 'limit',
    price: String(kRoundPrice_(pair, price)),
    amount: String(kFormatAmount_(pair, amount)),
  };
  if (cfg.dryRun) {
    kLog_('[DRY_RUN] ' + pair + ' ' + side + ' ' + body.price + ' x' + body.amount);
    return { order_id: 'dry-' + Date.now(), dryRun: true };
  }
  var resp = kPrivateRequest_('post', '/user/spot/order', null, body);
  try {
    if (resp && resp.order_id != null) kRecordOwnOrderId_(resp.order_id, pair, side);
  } catch (e) {
    kLog_('自注文ID記録スキップ: ' + (e.message || e));
  }
  return resp;
}

function kTestConnection() {
  var ticker = kGetTicker_('btc_jpy');
  var lines = ['公開API OK', 'BTC/JPY=' + ticker.last + '円'];
  try {
    kGetApiKey_();
    kGetApiSecret_();
    lines.push('APIキー: 設定済み');
    var assets = kPrivateRequest_('get', '/user/assets', null, null);
    var jpy = 0;
    (assets.assets || []).forEach(function (a) {
      if (String(a.asset).toLowerCase() === 'jpy') {
        jpy = Number(a.free_amount != null ? a.free_amount : a.onhand_amount) || 0;
      }
    });
    lines.push('プライベートAPI OK');
    lines.push('JPY残高=' + Math.round(jpy) + '円');
  } catch (e) {
    lines.push('プライベートAPI NG: ' + (e.message || e));
  }
  kLog_(lines.join(' | '));
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}
