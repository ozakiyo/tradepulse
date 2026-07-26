function metaPublicGet_(path) {
  var url = META_CONFIG.PUBLIC_API + path;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var json = JSON.parse(res.getContentText());
  if (!json.success) throw new Error('bitbank public error: ' + res.getContentText().slice(0, 200));
  return json.data;
}

function metaGetTicker_() {
  var data = metaPublicGet_('/' + META_CONFIG.PAIR + '/ticker');
  return {
    last: Number(data.last),
    high: Number(data.high),
    low: Number(data.low),
    open: Number(data.open),
  };
}

function metaFetchCandles1hDay_(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
  var data = metaPublicGet_('/' + META_CONFIG.PAIR + '/candlestick/1hour/' + ymd);
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

function metaGetCandles1h_() {
  var minBars = META_CONFIG.MIN_CANDLES_1H;
  var maxDays = META_CONFIG.CANDLE_FETCH_MAX_DAYS;
  var all = [];
  for (var daysAgo = maxDays - 1; daysAgo >= 0; daysAgo--) {
    var day = metaFetchCandles1hDay_(daysAgo);
    if (day.length) all = all.concat(day);
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
  return deduped;
}