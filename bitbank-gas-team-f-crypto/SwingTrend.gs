/**
 * チームF: スイングポイント検出・ダウ理論トレンド判定・トレンドライン計算
 *
 * スイングポイント = 左右 strength 本よりも高い/低い足
 * ダウ理論: 全スイング時系列の重み付きスコアリングでトレンド判定
 * トレンドライン: 直近2つのスイングポイントを結ぶ延長線
 */

/* ---------- スイングポイント検出 ---------- */

/**
 * ローソク足配列からスイングHigh/Lowを検出する。
 * strength=2 なら、左右2本よりhighが高い足がスイングHigh。
 * @return {Array<{type:'high'|'low', index:number, value:number, time:number}>}
 */
function f6DetectSwings_(candles, strength) {
  var swings = [];
  for (var i = strength; i < candles.length - strength; i++) {
    var isHigh = true;
    var isLow = true;
    for (var j = 1; j <= strength; j++) {
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

/* ---------- ダウ理論トレンド判定（汎用・全スイング時系列分析） ---------- */

/**
 * ローソク足をダウ理論で分析しトレンドを判定する（日足・1H足共通）。
 *
 * 1. 全スイングハイの連続ペアを HH/LH に分類
 * 2. 全スイングローの連続ペアを HL/LL に分類
 * 3. 直近ほど重みを大きくしたスコアリングで方向を算出
 * 4. 直近の連続一致数でトレンド強度を算出
 *
 * @return {{trend:'up'|'down'|'range', strength:number, note:string}}
 */
function f6JudgeTrend_(candles, strength) {
  var swings = f6DetectSwings_(candles, strength);
  var highs = [];
  var lows = [];
  for (var i = 0; i < swings.length; i++) {
    if (swings[i].type === 'high') highs.push(swings[i]);
    else lows.push(swings[i]);
  }

  if (highs.length < 2 || lows.length < 2) {
    return { trend: 'range', strength: 0, note: 'スイング不足 H=' + highs.length + ' L=' + lows.length };
  }

  var highMarks = [];
  for (var i = 1; i < highs.length; i++) {
    highMarks.push(highs[i].value > highs[i - 1].value ? 'HH' : 'LH');
  }

  var lowMarks = [];
  for (var i = 1; i < lows.length; i++) {
    lowMarks.push(lows[i].value > lows[i - 1].value ? 'HL' : 'LL');
  }

  var upScore = 0;
  var downScore = 0;

  for (var i = 0; i < highMarks.length; i++) {
    var w = i + 1;
    if (highMarks[i] === 'HH') upScore += w;
    else downScore += w;
  }
  for (var i = 0; i < lowMarks.length; i++) {
    var w = i + 1;
    if (lowMarks[i] === 'HL') upScore += w;
    else downScore += w;
  }

  var consecutiveUp = 0;
  for (var i = highMarks.length - 1; i >= 0; i--) {
    if (highMarks[i] === 'HH') consecutiveUp++;
    else break;
  }
  for (var i = lowMarks.length - 1; i >= 0; i--) {
    if (lowMarks[i] === 'HL') consecutiveUp++;
    else break;
  }

  var consecutiveDown = 0;
  for (var i = highMarks.length - 1; i >= 0; i--) {
    if (highMarks[i] === 'LH') consecutiveDown++;
    else break;
  }
  for (var i = lowMarks.length - 1; i >= 0; i--) {
    if (lowMarks[i] === 'LL') consecutiveDown++;
    else break;
  }

  var trend = 'range';
  var trendStrength = 0;
  var scoreNote = 'up=' + upScore + ' down=' + downScore;

  if (upScore > downScore * 1.5) {
    trend = 'up';
    trendStrength = consecutiveUp;
  } else if (downScore > upScore * 1.5) {
    trend = 'down';
    trendStrength = consecutiveDown;
  }

  var hSeq = highMarks.join(',');
  var lSeq = lowMarks.join(',');
  var trendLabel = { up: 'アップ', down: 'ダウン', range: 'レンジ' };
  var note = trendLabel[trend] + '(強度' + trendStrength + ') H=[' + hSeq + '] L=[' + lSeq + '] ' + scoreNote;

  return { trend: trend, strength: trendStrength, note: note };
}

/* ---------- エントリーシグナル（1H） ---------- */

/**
 * 1Hスイングを使って戻り確定シグナルを検出する。
 *
 * アップトレンド:
 *   SwingHigh → SwingLow（押し目） → 終値がSwingHighを上抜け → 買い
 * ダウントレンド:
 *   SwingLow → SwingHigh（戻り） → 終値がSwingLowを下抜け → 売り
 *
 * @return {{signal:'buy'|'sell'|'none', swingHigh:number|null, swingLow:number|null, note:string}}
 */
function f6GetEntrySignal_(hourlyCandles, dailyTrend, strength) {
  var swings = f6DetectSwings_(hourlyCandles, strength);
  var highs = [];
  var lows = [];
  for (var i = 0; i < swings.length; i++) {
    if (swings[i].type === 'high') highs.push(swings[i]);
    else lows.push(swings[i]);
  }

  var lastCandle = hourlyCandles[hourlyCandles.length - 1];
  var closePrice = lastCandle.close;
  var noSignal = { signal: 'none', swingHigh: null, swingLow: null };

  if (dailyTrend === 'up' && highs.length >= 1 && lows.length >= 1) {
    var sh = highs[highs.length - 1];
    var sl = lows[lows.length - 1];
    if (sl.index > sh.index && closePrice > sh.value) {
      return {
        signal: 'buy',
        swingHigh: sh.value,
        swingLow: sl.value,
        note: '押し目確定→ハイ上抜け SH=' + f6FormatPrice_(sh.value) + ' SL=' + f6FormatPrice_(sl.value),
      };
    }
    noSignal.note = '押し目待ち SH=' + f6FormatPrice_(sh.value) + ' SL=' + f6FormatPrice_(sl.value);
    return noSignal;
  }

  if (dailyTrend === 'down' && highs.length >= 1 && lows.length >= 1) {
    var sh = highs[highs.length - 1];
    var sl = lows[lows.length - 1];
    if (sh.index > sl.index && closePrice < sl.value) {
      return {
        signal: 'sell',
        swingHigh: sh.value,
        swingLow: sl.value,
        note: '戻り確定→ロー下抜け SH=' + f6FormatPrice_(sh.value) + ' SL=' + f6FormatPrice_(sl.value),
      };
    }
    noSignal.note = '戻り待ち SH=' + f6FormatPrice_(sh.value) + ' SL=' + f6FormatPrice_(sl.value);
    return noSignal;
  }

  noSignal.note = dailyTrend === 'range' ? 'レンジ: エントリー見送り' : 'スイング不足';
  return noSignal;
}

/* ---------- トレンドライン計算 ---------- */

/**
 * 2つのスイングポイントからトレンドラインの現在値を算出する。
 * ロング時: 直近2つの1HスイングLowを結ぶ上昇ライン
 * ショート時: 直近2つの1HスイングHighを結ぶ下降ライン
 *
 * @param {Array} swingPoints 同種のスイングポイント配列（high or low）
 * @param {number} currentIndex 現在のキャンドルインデックス
 * @return {{value:number, slope:number}|null} ライン上の値と傾き、ポイント不足時null
 */
function f6CalcTrendline_(swingPoints, currentIndex) {
  if (swingPoints.length < 2) return null;

  var p1 = swingPoints[swingPoints.length - 2];
  var p2 = swingPoints[swingPoints.length - 1];

  if (p1.index === p2.index) return null;

  var slope = (p2.value - p1.value) / (p2.index - p1.index);
  var value = p2.value + slope * (currentIndex - p2.index);

  return { value: value, slope: slope, p1: p1.value, p2: p2.value };
}

/**
 * ポジション保持中にトレンドライン割れをチェックする。
 *
 * @param {Array} hourlyCandles 1H足
 * @param {string} positionSide 'long' | 'short'
 * @param {number} strength スイング強度
 * @return {{shouldExit:boolean, trendlineValue:number|null, note:string}}
 */
function f6CheckTrendlineExit_(hourlyCandles, positionSide, strength) {
  var swings = f6DetectSwings_(hourlyCandles, strength);
  var lastIndex = hourlyCandles.length - 1;
  var lastClose = hourlyCandles[lastIndex].close;

  var targetSwings = [];
  for (var i = 0; i < swings.length; i++) {
    if (positionSide === 'long' && swings[i].type === 'low') targetSwings.push(swings[i]);
    if (positionSide === 'short' && swings[i].type === 'high') targetSwings.push(swings[i]);
  }

  var tl = f6CalcTrendline_(targetSwings, lastIndex);
  if (!tl) {
    return { shouldExit: false, trendlineValue: null, note: 'TL算出不可' };
  }

  var tlPrice = f6FormatPrice_(tl.value);

  if (positionSide === 'long' && lastClose < tl.value) {
    return {
      shouldExit: true,
      trendlineValue: tlPrice,
      note: '終値' + f6FormatPrice_(lastClose) + ' < TL' + tlPrice + ' → 利食い',
    };
  }
  if (positionSide === 'short' && lastClose > tl.value) {
    return {
      shouldExit: true,
      trendlineValue: tlPrice,
      note: '終値' + f6FormatPrice_(lastClose) + ' > TL' + tlPrice + ' → 利食い',
    };
  }

  return {
    shouldExit: false,
    trendlineValue: tlPrice,
    note: 'TL' + tlPrice + ' slope=' + tl.slope.toFixed(4),
  };
}
