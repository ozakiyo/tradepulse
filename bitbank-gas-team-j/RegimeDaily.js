/**
 * 日足レンジ・エントリー箱（案D）判定
 */

/** 確定済み日足（直近1本は形成中のため除外） */
function jGetConfirmedDaily_(daily) {
  if (!daily || !daily.length) return [];
  if (daily.length >= 2) return daily.slice(0, daily.length - 1);
  return daily;
}

/**
 * 案D: エントリー時に固定した下限を、確定日足終値が下抜けたか
 */
function jIsEntryBoxBroken_(daily, entryLow, bufferPct) {
  if (entryLow == null || entryLow <= 0) return false;
  var confirmed = jGetConfirmedDaily_(daily);
  if (!confirmed.length) return false;
  var last = confirmed[confirmed.length - 1];
  var buf = (bufferPct != null ? bufferPct : J_CONFIG.TRAP_BREAK_BUFFER_PCT) / 100;
  return last.close < entryLow * (1 - buf);
}

/** @deprecated 互換用。案Dでは jIsEntryBoxBroken_ を使う */
function jIsDailyTrapBroken_(daily, refLow, bufferPct) {
  return jIsEntryBoxBroken_(daily, refLow, bufferPct);
}

function jEvaluatePairRegime_(pair, cfg) {
  cfg = cfg || jGetConfig_();
  var candles1h = jGetCandles1h_(pair, (cfg.dailyLookback || 20) * 24);
  var daily = jAggregateDailyFrom1h_(candles1h, cfg.dailyLookback);
  var dailyRange = jDetectDailyRange_(daily, cfg, pair);
  return {
    pair: pair,
    daily: daily,
    dailyRange: dailyRange,
    isRange: dailyRange.isRange,
    refDailyLow: dailyRange.low,
    refDailyHigh: dailyRange.high,
    widthPct: dailyRange.widthPct,
    note: dailyRange.note,
  };
}
