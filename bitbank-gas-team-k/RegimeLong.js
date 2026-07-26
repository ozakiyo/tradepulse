/**
 * 長期（週足・月足）ダウントレンド除外
 * bitbank: 1week / 1month キャンドル
 */

function kSma_(closes, period) {
  if (!closes || closes.length < period) return null;
  var sum = 0;
  for (var i = closes.length - period; i < closes.length; i++) sum += closes[i];
  return sum / period;
}

function kSmaAt_(closes, period, endIndex) {
  if (endIndex + 1 < period) return null;
  var sum = 0;
  for (var i = endIndex - period + 1; i <= endIndex; i++) sum += closes[i];
  return sum / period;
}

/**
 * SMA下方かつ傾きが下向き → ダウントレンド
 * 確定足のみ（直近形成中を除外）
 */
function kIsSmaDowntrend_(candles, smaPeriod, slopeBars) {
  if (!candles || candles.length < smaPeriod + slopeBars + 1) {
    return { down: false, reason: '足不足', sma: null };
  }
  var confirmed = candles.slice(0, candles.length - 1);
  if (confirmed.length < smaPeriod + slopeBars) {
    return { down: false, reason: '確定足不足', sma: null };
  }
  var closes = confirmed.map(function (c) {
    return c.close;
  });
  var lastIdx = closes.length - 1;
  var smaNow = kSmaAt_(closes, smaPeriod, lastIdx);
  var smaPrev = kSmaAt_(closes, smaPeriod, lastIdx - slopeBars);
  if (smaNow == null || smaPrev == null) {
    return { down: false, reason: 'SMA不可', sma: null };
  }
  var close = closes[lastIdx];
  var below = close < smaNow;
  var slopingDown = smaNow < smaPrev;
  var down = below && slopingDown;
  return {
    down: down,
    reason: down
      ? '終値<' + smaPeriod + 'SMA かつ SMA下降'
      : below
        ? '終値<SMAだがSMA非下降'
        : '終値>=SMA',
    sma: smaNow,
    close: close,
    smaPrev: smaPrev,
  };
}

/** 週足 or 月足がダウントレンドなら除外対象（既定: 週1回キャッシュ） */
function kLongTermWeekKey_() {
  // Apps Script: Y=week year, w=week in year
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', "YYYY-'W'w");
}

function kLongTermCacheKey_(pair) {
  return 'K_LT_' + String(pair || '').replace(/[^a-z0-9]/gi, '_');
}

function kEvaluateLongTermRegime_(pair, cfg) {
  cfg = cfg || kGetConfig_();
  var useWeeklyCache = K_CONFIG.LONG_TERM_CACHE_WEEKLY !== false;
  var weekKey = kLongTermWeekKey_();
  var props = PropertiesService.getScriptProperties();
  var ckey = kLongTermCacheKey_(pair);

  if (useWeeklyCache) {
    var raw = props.getProperty(ckey);
    if (raw) {
      try {
        var cached = JSON.parse(raw);
        if (cached && cached.weekKey === weekKey && cached.result) {
          return cached.result;
        }
      } catch (e) {}
    }
  }

  var weekly = kFetchHtfCandles_(pair, '1week', K_CONFIG.HTF_YEARS_BACK);
  var monthly = kFetchHtfCandles_(pair, '1month', K_CONFIG.HTF_YEARS_BACK);
  var w = kIsSmaDowntrend_(weekly, K_CONFIG.WEEKLY_SMA, K_CONFIG.WEEKLY_SLOPE_BARS);
  var m = kIsSmaDowntrend_(monthly, K_CONFIG.MONTHLY_SMA, K_CONFIG.MONTHLY_SLOPE_BARS);
  var excluded = !!(w.down || m.down);
  var parts = [];
  if (w.down) parts.push('週足↓(' + w.reason + ')');
  if (m.down) parts.push('月足↓(' + m.reason + ')');
  if (!excluded) {
    parts.push('週:' + w.reason + ' / 月:' + m.reason);
  }
  var result = {
    pair: pair,
    excluded: excluded,
    weeklyDown: w.down,
    monthlyDown: m.down,
    weekly: w,
    monthly: m,
    note: parts.join(' '),
    cachedWeek: weekKey,
  };

  if (useWeeklyCache) {
    try {
      props.setProperty(ckey, JSON.stringify({ weekKey: weekKey, result: result, at: new Date().toISOString() }));
    } catch (e2) {
      // ScriptProperties容量超過時は握りつぶし（次回再取得）
    }
  }
  return result;
}

function kIsLongTermDownExcluded_(pair, cfg) {
  return kEvaluateLongTermRegime_(pair, cfg).excluded;
}
