/**
 * チームF: Yahoo Finance データ取得 + ペーパートレード管理（マルチ銘柄対応）
 */

/* ---------- Yahoo Finance ---------- */

function f6FetchYahooChart_(symbol, interval, range) {
  var url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=' + interval +
    '&range=' + range;
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
    },
  });
  if (res.getResponseCode() >= 400) {
    throw new Error('Yahoo ' + symbol + ' 取得失敗 (' + res.getResponseCode() + ')');
  }
  var json = JSON.parse(res.getContentText());
  var result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('Yahoo ' + symbol + ' チャートデータが空です');
  return result;
}

function f6ParseYahooCandles_(result) {
  var timestamps = result.timestamp || [];
  var quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  if (!quote || !quote.close || !quote.close.length) {
    throw new Error('Yahoo チャートデータが空です');
  }
  var candles = [];
  for (var i = 0; i < timestamps.length; i++) {
    var close = quote.close[i];
    if (close == null || isNaN(close)) continue;
    var c = Number(close);
    var high = quote.high && quote.high[i] != null ? Number(quote.high[i]) : c;
    var low = quote.low && quote.low[i] != null ? Number(quote.low[i]) : c;
    var open = quote.open && quote.open[i] != null ? Number(quote.open[i]) : c;
    candles.push({
      open: open,
      high: high,
      low: low,
      close: c,
      volume: 0,
      time: timestamps[i] * 1000,
    });
  }
  return candles;
}

/* ---------- Ticker ---------- */

function f6GetTicker_(symbol) {
  var result = f6FetchYahooChart_(symbol, '1h', '1d');
  var meta = result.meta || {};
  var last = Number(meta.regularMarketPrice || meta.previousClose);
  if (!last) {
    var quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
    var closes = quote && quote.close ? quote.close : [];
    for (var i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) {
        last = Number(closes[i]);
        break;
      }
    }
  }
  if (!last) throw new Error(symbol + ' 価格が取得できません');
  return { last: last, high: last, low: last };
}

/* ---------- 1H足 ---------- */

function f6GetCandles1h_(symbol) {
  var minBars = F6_CONFIG.MIN_CANDLES_1H;
  var range = minBars > 200 ? '60d' : '30d';
  var candles = f6ParseYahooCandles_(f6FetchYahooChart_(symbol, '1h', range));
  if (candles.length < minBars) {
    candles = f6ParseYahooCandles_(f6FetchYahooChart_(symbol, '1h', '60d'));
  }
  if (candles.length < minBars) {
    throw new Error(symbol + ': 1時間足データ不足 (' + candles.length + '本)');
  }
  return candles;
}

/* ---------- 日足 ---------- */

function f6GetCandlesDaily_(symbol) {
  var minBars = F6_CONFIG.MIN_CANDLES_DAILY;
  var candles = f6ParseYahooCandles_(f6FetchYahooChart_(symbol, '1d', '1y'));
  if (candles.length < minBars) {
    throw new Error(symbol + ': 日足データ不足 (' + candles.length + '本)');
  }
  return candles;
}

/* ---------- ペーパートレード ---------- */

function f6ApplyPaperTrade_(side, price, amount) {
  var w = f6InitPaperWallet_();
  var fee = F6_CONFIG.PAPER_FEE_RATE;
  var cost = price * amount;
  if (side === 'buy' || side === '買い') {
    w.jpy -= cost * (1 + fee);
  } else {
    w.jpy += cost * (1 - fee);
  }
  f6SavePaperWallet_(w);
}

function f6GetAssetsForRun_() {
  var w = f6InitPaperWallet_();
  return { jpy: w.jpy, paper: true };
}

function f6PlacePaperOrder_(side, price, amount) {
  var inst = f6_ctx.inst || {};
  f6Log_('[PAPER] ' + side + ' @ ' + f6FormatPrice_(price) + ' ' + (inst.posUnit || '') + '=' + amount);
}
