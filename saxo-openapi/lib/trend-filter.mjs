/**
 * 1H足 ADX + ER によるトレンド判定（新規エントリー停止用）
 * レンジ新規は ADX・ER がともに閾値未満のときのみ（どちらか一方でも閾値以上なら見送り）
 * ADX/ER 計算は bitbank-gas/Regime.gs と同系統
 */

/** @param {number[]} closes @param {number} period */
export function calcEfficiencyRatio_(closes, period) {
  if (!closes || closes.length < period + 1) return null;
  const n = closes.length - 1;
  const change = Math.abs(closes[n] - closes[n - period]);
  let path = 0;
  for (let i = n - period + 1; i <= n; i++) {
    path += Math.abs(closes[i] - closes[i - 1]);
  }
  if (path === 0) return 0;
  return change / path;
}

/** @param {{ high: number, low: number, close: number }[]} candles @param {number} period */
export function calcAdx_(candles, period) {
  if (!candles || candles.length < period + 3) return null;
  const tr = [];
  const plusDm = [];
  const minusDm = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  let atr = 0;
  let sp = 0;
  let sm = 0;
  for (let j = 0; j < period; j++) {
    atr += tr[j];
    sp += plusDm[j];
    sm += minusDm[j];
  }
  const dxList = [];
  for (let t = period; t < tr.length; t++) {
    atr = atr - atr / period + tr[t];
    sp = sp - sp / period + plusDm[t];
    sm = sm - sm / period + minusDm[t];
    const pdi = atr === 0 ? 0 : (100 * sp) / atr;
    const mdi = atr === 0 ? 0 : (100 * sm) / atr;
    const sum = pdi + mdi;
    dxList.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  }
  if (!dxList.length) return null;
  let adx = 0;
  for (let d = 0; d < Math.min(period, dxList.length); d++) adx += dxList[d];
  adx /= Math.min(period, dxList.length);
  for (let u = period; u < dxList.length; u++) {
    adx = (adx * (period - 1) + dxList[u]) / period;
  }
  return Math.round(adx * 10) / 10;
}

/**
 * @param {{ high: number, low: number, close: number }[]} candles1h
 * @param {{ trendFilterEnabled?: boolean, adxPeriod?: number, adxTrendMin?: number, erPeriod?: number, erTrendMin?: number }} cfg
 */
export function evaluateTrendFilter_(candles1h, cfg) {
  if (!cfg.trendFilterEnabled) {
    return { blockNew: false, adx: null, er: null, note: '' };
  }

  const adxPeriod = cfg.adxPeriod ?? 14;
  const erPeriod = cfg.erPeriod ?? 14;
  const minBars = Math.max(adxPeriod + 3, erPeriod + 5);
  if (!candles1h || candles1h.length < minBars) {
    return { blockNew: false, adx: null, er: null, note: 'ADX/ER不足' };
  }

  const closed = candles1h.length > 1 ? candles1h.slice(0, -1) : candles1h;
  if (closed.length < minBars - 1) {
    return { blockNew: false, adx: null, er: null, note: 'ADX/ER不足' };
  }

  const closes = closed.map((c) => c.close);
  const erRaw = calcEfficiencyRatio_(closes, erPeriod);
  const adx = calcAdx_(closed, adxPeriod);
  if (erRaw == null || adx == null) {
    return { blockNew: false, adx, er: erRaw, note: 'ADX/ER不足' };
  }

  const er = Math.round(erRaw * 100) / 100;
  const adxMin = cfg.adxTrendMin ?? 25;
  const erMin = cfg.erTrendMin ?? 0.3;
  const adxHigh = adx >= adxMin;
  const erHigh = er >= erMin;
  const blockNew = adxHigh || erHigh;
  const thresh = `<${adxMin}/<${erMin.toFixed(2)}`;
  const note = `ADX=${adx.toFixed(1)} ER=${er.toFixed(2)} ${thresh}`;
  let trendTag = '';
  if (blockNew) {
    if (adxHigh && erHigh) trendTag = ' トレンド(ADX+ER)';
    else if (adxHigh) trendTag = ' トレンド(ADX)';
    else trendTag = ' トレンド(ER)';
  }

  return {
    blockNew,
    adx,
    er,
    adxTrendMin: adxMin,
    erTrendMin: erMin,
    note: note + trendTag,
  };
}

/** @param {{ blockNew?: boolean, note?: string }} trend */
export function trendFilterBlockSignal_(trend) {
  if (!trend?.blockNew) return null;
  return `新規見送り(トレンド ${trend.note})`;
}

/**
 * 1H足の直近バー幅が平均より急伸しているか（新規エントリー停止）
 * @param {{ high: number, low: number, close: number }[]} candles1h
 */
export function evaluateVolSpike_(candles1h, cfg) {
  if (!cfg.volSpikeFilterEnabled) {
    return { blockNew: false, ratio: null, note: '' };
  }

  const lookback = cfg.h1VolSpikeLookback ?? 5;
  const minPct = cfg.h1VolSpikeMinPct ?? 0.2;
  const minBars = lookback + 2;
  if (!candles1h || candles1h.length < minBars) {
    return { blockNew: false, ratio: null, note: 'ボラ不足' };
  }

  const closed = candles1h.length > 1 ? candles1h.slice(0, -1) : candles1h;
  if (closed.length < lookback + 1) {
    return { blockNew: false, ratio: null, note: 'ボラ不足' };
  }

  const last = closed[closed.length - 1];
  const prev = closed.slice(-lookback - 1, -1);
  const trLast = last.high - last.low;
  const mid = (last.high + last.low) / 2;
  const lastPct = mid > 0 ? (trLast / mid) * 100 : 0;

  if (lastPct < minPct) {
    return { blockNew: false, ratio: null, note: '' };
  }

  const avgTr = prev.reduce((s, c) => s + (c.high - c.low), 0) / prev.length;
  const ratio = avgTr > 0 ? trLast / avgTr : 0;
  const threshold = cfg.h1VolSpikeRatio ?? 2;
  const blockNew = ratio >= threshold;

  return {
    blockNew,
    ratio: Math.round(ratio * 100) / 100,
    lastPct: Math.round(lastPct * 100) / 100,
    note: blockNew
      ? `ボラ急伸 ${ratio.toFixed(1)}x(幅${lastPct.toFixed(2)}%)`
      : `ボラ${ratio.toFixed(1)}x`,
  };
}

/** @param {{ blockNew?: boolean, note?: string }} vol */
export function volSpikeBlockSignal_(vol) {
  if (!vol?.blockNew) return null;
  return `新規見送り(${vol.note})`;
}
