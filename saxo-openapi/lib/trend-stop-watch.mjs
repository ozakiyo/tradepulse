/**
 * G-SAXO 日足損切 → G-SAXO-TREND 損切ウォッチ + 旧レンジ回帰損切
 */

/** レンジ損切方向の逆がトレンド追随方向（ロング損切＝下降ブレイク→ショート） */
export function expectedTrendSideFromRangeStop_(stoppedSide) {
  if (stoppedSide === 'long') return 'short';
  if (stoppedSide === 'short') return 'long';
  return null;
}

export function dailyTrendFromSide_(side) {
  if (side === 'long') return 'up';
  if (side === 'short') return 'down';
  return 'range';
}

/**
 * @param {object} ps pair state
 * @param {{ side: string }} pos 決済したレンジ建玉
 * @param {{ high: number, low: number, widthPct?: number }} daily detectDailyRange_
 * @param {number} stopPrice
 * @param {object} cfg
 * @param {(msg: string) => void} log
 * @param {string} pairId
 */
export function applyTrendStopWatch_(pairId, ps, pos, daily, stopPrice, cfg, log) {
  if (!cfg.trendStopWatchEnabled) return;

  const expectedSide = expectedTrendSideFromRangeStop_(pos.side);
  if (!expectedSide || daily?.high == null || daily?.low == null) return;

  const hours = cfg.trendStopWatchHours ?? 48;
  ps.trendStopWatch = {
    active: true,
    triggeredAt: new Date().toISOString(),
    until: Date.now() + hours * 3600000,
    stoppedSide: pos.side,
    expectedSide,
    stopPrice,
    refDailyHigh: daily.high,
    refDailyLow: daily.low,
    refWidthPct: daily.widthPct ?? null,
  };

  log(
    `${pairId} [TREND] 損切ウォッチ開始 方向=${expectedSide} ` +
      `旧レンジL=${daily.low} H=${daily.high} ${hours}h`
  );
}

/** @param {number|null|undefined} until */
export function normalizeTrendStopWatchUntil_(until) {
  if (until == null || !Number.isFinite(Number(until))) return null;
  const n = Number(until);
  // 秒タイムスタンプ誤保存（10桁）を ms（13桁）に補正
  return n < 1e12 ? n * 1000 : n;
}

/** @returns {object|null} */
export function getTrendStopWatch_(ps, cfg, { log, pairId } = {}) {
  if (!cfg.trendStopWatchEnabled) return null;
  const w = ps.trendStopWatch;
  if (!w?.active) return null;

  const until = normalizeTrendStopWatchUntil_(w.until);
  if (until != null && until !== w.until) w.until = until;

  if (until != null && until <= Date.now()) {
    ps.trendStopWatch = null;
    if (log && pairId) {
      log(`${pairId} [TREND] 損切ウォッチ期限切れ until=${new Date(until).toISOString()}`);
    }
    return null;
  }
  return w;
}

/** ③ 旧日足レンジ内に価格が戻った */
export function isOldRangeRegression_(price, refDailyLow, refDailyHigh) {
  if (price == null || refDailyLow == null || refDailyHigh == null) return false;
  return price >= refDailyLow && price <= refDailyHigh;
}

export function clearTrendStopWatch_(ps, { log, pairId, reason } = {}) {
  if (!ps.trendStopWatch) return;
  ps.trendStopWatch = null;
  if (log && pairId) {
    log(`${pairId} [TREND] 損切ウォッチ解除 reason=${reason || 'clear'}`);
  }
}
