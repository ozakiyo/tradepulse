/**
 * Team-J — 月足ダウントレンド除外（新規選定・再開・優先アクティブ）
 * bitbank: 1month キャンドル。週足は見ない。
 */

function jSmaAt_(closes, period, endIndex) {
  if (endIndex + 1 < period) return null;
  var sum = 0;
  for (var i = endIndex - period + 1; i <= endIndex; i++) sum += closes[i];
  return sum / period;
}

/**
 * SMA下方かつ傾きが下向き → ダウントレンド
 * 確定足のみ（直近形成中を除外）
 */
function jIsSmaDowntrend_(candles, smaPeriod, slopeBars) {
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
  var smaNow = jSmaAt_(closes, smaPeriod, lastIdx);
  var smaPrev = jSmaAt_(closes, smaPeriod, lastIdx - slopeBars);
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

function jMonthlyWeekKey_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', "YYYY-'W'w");
}

function jMonthlyCacheKey_(pair) {
  return 'J_LT_' + String(pair || '').replace(/[^a-z0-9]/gi, '_');
}

/**
 * 月足↓なら excluded（新規トラップ対象外）
 * 既定: 週1回キャッシュ
 */
function jEvaluateMonthlyRegime_(pair, cfg) {
  cfg = cfg || jGetConfig_();
  var enabled = cfg.monthlyDownExclude !== false && J_CONFIG.MONTHLY_DOWN_EXCLUDE !== false;
  if (!enabled) {
    return {
      pair: pair,
      excluded: false,
      monthlyDown: false,
      note: '月足除外オフ',
    };
  }

  var useWeeklyCache = J_CONFIG.LONG_TERM_CACHE_WEEKLY !== false;
  var weekKey = jMonthlyWeekKey_();
  var props = PropertiesService.getScriptProperties();
  var ckey = jMonthlyCacheKey_(pair);

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

  var monthly = jFetchHtfCandles_(pair, '1month', J_CONFIG.HTF_YEARS_BACK);
  var m = jIsSmaDowntrend_(
    monthly,
    cfg.monthlySma != null ? cfg.monthlySma : J_CONFIG.MONTHLY_SMA,
    cfg.monthlySlopeBars != null ? cfg.monthlySlopeBars : J_CONFIG.MONTHLY_SLOPE_BARS
  );
  var excluded = !!m.down;
  var result = {
    pair: pair,
    excluded: excluded,
    monthlyDown: m.down,
    monthly: m,
    note: excluded ? '月足↓除外(' + m.reason + ')' : '月:' + m.reason,
    cachedWeek: weekKey,
  };

  if (useWeeklyCache) {
    try {
      props.setProperty(
        ckey,
        JSON.stringify({ weekKey: weekKey, result: result, at: new Date().toISOString() })
      );
    } catch (e2) {
      // ScriptProperties容量超過時は握りつぶし
    }
  }
  return result;
}

function jIsMonthlyDownExcluded_(pair, cfg) {
  return jEvaluateMonthlyRegime_(pair, cfg).excluded;
}
