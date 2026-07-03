function d4fFetchYahooChart_(symbol, interval, range) {
  var url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=' +
    interval +
    '&range=' +
    range;
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

function d4fGetTicker_(interval) {
  var iv = interval || d4fGetConfig_().candleInterval || '15m';
  var result = d4fFetchYahooChart_(D4F_CONFIG.YAHOO_SYMBOL, iv, '1d');
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
  if (!last) throw new Error('USD/JPY 価格が取得できません');
  return { last: last, high: last, low: last };
}

function d4fParseYahooCandles_(result) {
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

function d4fGetCandles_(cfg) {
  var interval = (cfg && cfg.candleInterval) || '15m';
  var minBars = (cfg && cfg.minCandles) || d4fGetMinCandles_(interval);
  var symbol = D4F_CONFIG.YAHOO_SYMBOL;
  var range = minBars > 200 ? '60d' : '30d';
  var candles = d4fParseYahooCandles_(d4fFetchYahooChart_(symbol, interval, range));
  if (candles.length < minBars) {
    candles = d4fParseYahooCandles_(d4fFetchYahooChart_(symbol, interval, '60d'));
  }
  if (candles.length < minBars) {
    throw new Error(symbol + ': ' + interval + '足データ不足 (' + candles.length + '本)');
  }
  return candles;
}

/** @deprecated d4fGetCandles_(cfg) を使用 */
function d4fGetCandles1h_() {
  return d4fGetCandles_(d4fGetConfig_());
}

function d4fInitPaperWallet_(state) {
  var cap = Number(
    PropertiesService.getScriptProperties().getProperty('PAPER_JPY') || D4F_CONFIG.PAPER_JPY_DEFAULT
  );
  if (!state.paperWallet) {
    state.paperWallet = { jpy: cap, usd: 0, initial: cap };
  }
  return state.paperWallet;
}

function d4fApplyPaperTrade_(state, side, price, amount) {
  var w = d4fInitPaperWallet_(state);
  var fee = D4F_CONFIG.PAPER_FEE_RATE;
  if (side === 'buy' || side === '買い') {
    w.jpy -= price * amount * (1 + fee);
    w.usd += amount;
  } else {
    w.usd = Math.max(0, w.usd - amount);
    w.jpy += price * amount * (1 - fee);
  }
}

function d4fGetAssetsForRun_(cfg, state) {
  var w = d4fInitPaperWallet_(state);
  return { jpy: w.jpy, usd: w.usd, paper: true };
}

function d4fPlacePaperOrder_(side, price, amount) {
  d4fLog_('[PAPER] ' + side + ' @ ' + d4fFormatPrice_(price) + ' usd=' + amount.toFixed(D4F_CONFIG.USD_DECIMALS));
}
