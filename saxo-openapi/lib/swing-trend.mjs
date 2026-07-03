/**
 * F-FX ダウ理論トレンド判定（SwingTrend.gs 移植）
 * 日足で方向 → 1Hスイングで押し目/戻りエントリー
 */

/** @param {{ high: number, low: number }[]} candles @param {number} strength */
export function detectSwings_(candles, strength) {
  const swings = [];
  if (!candles || candles.length < strength * 2 + 1) return swings;

  for (let i = strength; i < candles.length - strength; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isLow = false;
      }
    }
    if (isHigh) swings.push({ type: 'high', index: i, value: candles[i].high, time: candles[i].time });
    if (isLow) swings.push({ type: 'low', index: i, value: candles[i].low, time: candles[i].time });
  }
  return swings;
}

/**
 * @param {{ high: number, low: number }[]} candles
 * @param {number} strength
 * @returns {{ trend: 'up'|'down'|'range', strength: number, note: string }}
 */
export function judgeTrend_(candles, strength) {
  const swings = detectSwings_(candles, strength);
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');

  if (highs.length < 2 || lows.length < 2) {
    return { trend: 'range', strength: 0, note: `スイング不足 H=${highs.length} L=${lows.length}` };
  }

  const highMarks = [];
  for (let i = 1; i < highs.length; i++) {
    highMarks.push(highs[i].value > highs[i - 1].value ? 'HH' : 'LH');
  }
  const lowMarks = [];
  for (let i = 1; i < lows.length; i++) {
    lowMarks.push(lows[i].value > lows[i - 1].value ? 'HL' : 'LL');
  }

  let upScore = 0;
  let downScore = 0;
  for (let i = 0; i < highMarks.length; i++) {
    const w = i + 1;
    if (highMarks[i] === 'HH') upScore += w;
    else downScore += w;
  }
  for (let i = 0; i < lowMarks.length; i++) {
    const w = i + 1;
    if (lowMarks[i] === 'HL') upScore += w;
    else downScore += w;
  }

  let consecutiveUp = 0;
  for (let i = highMarks.length - 1; i >= 0; i--) {
    if (highMarks[i] === 'HH') consecutiveUp++;
    else break;
  }
  for (let i = lowMarks.length - 1; i >= 0; i--) {
    if (lowMarks[i] === 'HL') consecutiveUp++;
    else break;
  }

  let consecutiveDown = 0;
  for (let i = highMarks.length - 1; i >= 0; i--) {
    if (highMarks[i] === 'LH') consecutiveDown++;
    else break;
  }
  for (let i = lowMarks.length - 1; i >= 0; i--) {
    if (lowMarks[i] === 'LL') consecutiveDown++;
    else break;
  }

  let trend = 'range';
  let trendStrength = 0;
  const scoreNote = `up=${upScore} down=${downScore}`;

  if (upScore > downScore * 1.5) {
    trend = 'up';
    trendStrength = consecutiveUp;
  } else if (downScore > upScore * 1.5) {
    trend = 'down';
    trendStrength = consecutiveDown;
  }

  const trendLabel = { up: 'アップ', down: 'ダウン', range: 'レンジ' };
  const note =
    `${trendLabel[trend]}(強度${trendStrength}) ` +
    `H=[${highMarks.join(',')}] L=[${lowMarks.join(',')}] ${scoreNote}`;

  return { trend, strength: trendStrength, note };
}

/**
 * @param {{ close: number }[]} hourlyCandles 確定1H足
 * @param {'up'|'down'|'range'} dailyTrend
 * @param {number} strength
 * @param {(n: number) => string} [fmtPrice]
 */
export function getEntrySignal_(hourlyCandles, dailyTrend, strength, fmtPrice = (n) => String(n)) {
  const noSignal = { signal: 'none', swingHigh: null, swingLow: null, note: '' };
  if (!hourlyCandles?.length) {
    noSignal.note = '1H不足';
    return noSignal;
  }

  const swings = detectSwings_(hourlyCandles, strength);
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');
  const lastCandle = hourlyCandles[hourlyCandles.length - 1];
  const closePrice = lastCandle.close;

  if (dailyTrend === 'up' && highs.length >= 1 && lows.length >= 1) {
    const sh = highs[highs.length - 1];
    const sl = lows[lows.length - 1];
    if (sl.index > sh.index && closePrice > sh.value) {
      return {
        signal: 'buy',
        swingHigh: sh.value,
        swingLow: sl.value,
        note: `押し目確定→ハイ上抜け SH=${fmtPrice(sh.value)} SL=${fmtPrice(sl.value)}`,
      };
    }
    noSignal.note = `押し目待ち SH=${fmtPrice(sh.value)} SL=${fmtPrice(sl.value)}`;
    return noSignal;
  }

  if (dailyTrend === 'down' && highs.length >= 1 && lows.length >= 1) {
    const sh = highs[highs.length - 1];
    const sl = lows[lows.length - 1];
    if (sh.index > sl.index && closePrice < sl.value) {
      return {
        signal: 'sell',
        swingHigh: sh.value,
        swingLow: sl.value,
        note: `戻り確定→ロー下抜け SH=${fmtPrice(sh.value)} SL=${fmtPrice(sl.value)}`,
      };
    }
    noSignal.note = `戻り待ち SH=${fmtPrice(sh.value)} SL=${fmtPrice(sl.value)}`;
    return noSignal;
  }

  noSignal.note = dailyTrend === 'range' ? 'レンジ: エントリー見送り' : 'スイング不足';
  return noSignal;
}

/** 確定済み足（末尾の形成中を除外） */
export function closedCandles_(candles) {
  if (!candles || candles.length <= 1) return candles || [];
  return candles.slice(0, -1);
}
