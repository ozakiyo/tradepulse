/**
 * 日足レンジ・トラップ外れ判定
 */

/** 確定済み日足（直近1本は形成中のため除外） */
function jGetConfirmedDaily_(daily) {
  if (!daily || !daily.length) return [];
  if (daily.length >= 2) return daily.slice(0, daily.length - 1);
  return daily;
}

function jIsDailyTrapBroken_(daily, refLow, bufferPct) {
  if (refLow == null || refLow <= 0) return false;
  var confirmed = jGetConfirmedDaily_(daily);
  if (!confirmed.length) return false;
  var last = confirmed[confirmed.length - 1];
  var buf = (bufferPct != null ? bufferPct : J_CONFIG.TRAP_BREAK_BUFFER_PCT) / 100;
  return last.close < refLow * (1 - buf);
}

function jEvaluatePairRegime_(pair, cfg) {
  cfg = cfg || jGetConfig_();
  var candles1h = jGetCandles1h_(pair, (cfg.dailyLookback || 20) * 24);
  var daily = jAggregateDailyFrom1h_(candles1h, cfg.dailyLookback);
  var dailyRange = jDetectDailyRange_(daily, cfg);
  var refLow = dailyRange.low;
  var broken = dailyRange.isRange && jIsDailyTrapBroken_(daily, refLow, J_CONFIG.TRAP_BREAK_BUFFER_PCT);
  return {
    pair: pair,
    daily: daily,
    dailyRange: dailyRange,
    isRange: dailyRange.isRange,
    broken: broken,
    refDailyLow: refLow,
    refDailyHigh: dailyRange.high,
    widthPct: dailyRange.widthPct,
    note: dailyRange.note,
  };
}
