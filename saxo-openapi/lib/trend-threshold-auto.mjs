/**
 * 日足損切時の ADX/ER から銘柄別閾値を自動調整（外れ値は採用しない）
 */

const ADX_VALID = { min: 8, max: 60 };
const ER_VALID = { min: 0.08, max: 0.85 };

function round1_(n) {
  return Math.round(n * 10) / 10;
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

/** @param {number} adx @param {number} er */
export function isTrendStopSampleValid_(adx, er) {
  if (adx == null || er == null) return false;
  if (!Number.isFinite(adx) || !Number.isFinite(er)) return false;
  return adx >= ADX_VALID.min && adx <= ADX_VALID.max && er >= ER_VALID.min && er <= ER_VALID.max;
}

function percentile_(sorted, pct) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * (pct / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** IQR 法で外れ値を除外（4件未満は妥当性チェックのみ） */
export function filterOutlierSamples_(samples) {
  const valid = samples.filter((s) => isTrendStopSampleValid_(s.adx, s.er));
  if (valid.length < 4) return valid;

  const adxSorted = valid.map((s) => s.adx).sort((a, b) => a - b);
  const erSorted = valid.map((s) => s.er).sort((a, b) => a - b);
  const adxQ1 = percentile_(adxSorted, 25);
  const adxQ3 = percentile_(adxSorted, 75);
  const erQ1 = percentile_(erSorted, 25);
  const erQ3 = percentile_(erSorted, 75);
  const adxIqr = adxQ3 - adxQ1;
  const erIqr = erQ3 - erQ1;
  const adxLo = adxQ1 - 1.5 * adxIqr;
  const adxHi = adxQ3 + 1.5 * adxIqr;
  const erLo = erQ1 - 1.5 * erIqr;
  const erHi = erQ3 + 1.5 * erIqr;

  return valid.filter((s) => s.adx >= adxLo && s.adx <= adxHi && s.er >= erLo && s.er <= erHi);
}

/**
 * @param {object} ps pair state
 * @param {{ adx: number, er: number }} trend evaluateTrendFilter_ の戻り値
 * @param {object} cfg
 * @param {(msg: string) => void} log
 * @returns {boolean} 閾値が更新された
 */
export function recordTrendStopSample_(pairId, ps, trend, cfg, log) {
  if (!cfg.trendAutoEnabled) return false;
  if (!isTrendStopSampleValid_(trend?.adx, trend?.er)) {
    log(
      `${pairId} 閾値自動: 損切ADX/ERを記録せず（異常値 ADX=${trend?.adx} ER=${trend?.er}）`
    );
    return false;
  }

  if (!ps.trendAuto) {
    ps.trendAuto = { samples: [], adxTrendMin: null, erTrendMin: null, updatedAt: null };
  }
  const ta = ps.trendAuto;
  ta.samples.push({
    adx: trend.adx,
    er: trend.er,
    at: new Date().toISOString(),
  });
  const maxN = cfg.trendAutoMaxSamples ?? 15;
  if (ta.samples.length > maxN) {
    ta.samples = ta.samples.slice(-maxN);
  }

  const minSamples = cfg.trendAutoMinSamples ?? 2;
  const filtered = filterOutlierSamples_(ta.samples);
  if (filtered.length < minSamples) {
    log(
      `${pairId} 閾値自動: 損切記録 ADX=${trend.adx} ER=${trend.er.toFixed(2)} ` +
        `(${filtered.length}/${minSamples}件・調整待ち)`
    );
    return false;
  }

  const baseAdx = cfg.adxTrendMin;
  const baseEr = cfg.erTrendMin;
  const adxMargin = cfg.trendAutoAdxMargin ?? 1;
  const erMargin = cfg.trendAutoErMargin ?? 0.02;
  const adxFloor = cfg.trendAutoAdxFloor ?? 18;
  const erFloor = cfg.trendAutoErFloor ?? 0.15;
  const maxStepAdx = cfg.trendAutoMaxStepAdx ?? 3;
  const maxStepEr = cfg.trendAutoMaxStepEr ?? 0.05;

  const minAdx = Math.min(...filtered.map((s) => s.adx));
  const minEr = Math.min(...filtered.map((s) => s.er));
  let targetAdx = Math.min(baseAdx, minAdx - adxMargin);
  let targetEr = Math.min(baseEr, minEr - erMargin);
  targetAdx = round1_(Math.max(adxFloor, targetAdx));
  targetEr = round2_(Math.max(erFloor, targetEr));

  const prevAdx = ta.adxTrendMin;
  const prevEr = ta.erTrendMin;
  if (prevAdx != null && targetAdx < prevAdx - maxStepAdx) {
    targetAdx = round1_(prevAdx - maxStepAdx);
  }
  if (prevEr != null && targetEr < prevEr - maxStepEr) {
    targetEr = round2_(prevEr - maxStepEr);
  }

  const changed =
    ta.adxTrendMin !== targetAdx ||
    ta.erTrendMin !== targetEr ||
    filtered.length === minSamples;

  ta.adxTrendMin = targetAdx;
  ta.erTrendMin = targetEr;
  ta.updatedAt = new Date().toISOString();
  ta.lastFilteredCount = filtered.length;
  ta.rejectedOutliers = ta.samples.length - filtered.length;

  log(
    `${pairId} 閾値自動調整 ADX≥${targetAdx} ER≥${targetEr.toFixed(2)} ` +
      `(損切${filtered.length}件` +
      (ta.rejectedOutliers > 0 ? ` 外れ値${ta.rejectedOutliers}件除外` : '') +
      ` 最小損切ADX=${minAdx} ER=${minEr.toFixed(2)})`
  );
  return changed;
}

/**
 * @param {object|null|undefined} ps
 * @param {object} baseCfg
 * @returns {{ adxTrendMin?: number, erTrendMin?: number, source?: string }|null}
 */
export function getTrendAutoOverride_(ps, baseCfg) {
  if (!baseCfg.trendAutoEnabled || !ps?.trendAuto) return null;
  const { adxTrendMin, erTrendMin } = ps.trendAuto;
  if (adxTrendMin == null && erTrendMin == null) return null;
  return {
    adxTrendMin: adxTrendMin ?? undefined,
    erTrendMin: erTrendMin ?? undefined,
    source: 'auto',
  };
}
