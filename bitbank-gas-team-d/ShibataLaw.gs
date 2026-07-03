/**
 * 柴田鈎足法則 + 谷畑流2法則転換 + 斜線法
 * 参考: series03(2法則), series04(2文), series07(斜線切り)
 */
function d4LawLabelJa_(code) {
  if (code === 'buy_roku') return 'ろく買い';
  if (code === 'buy_roe') return 'ろゑ買い';
  if (code === 'buy_rosa') return 'ろさ買い';
  if (code === 'sell_roku') return 'ろく売り';
  if (code === 'sell_roe') return 'ろゑ売り';
  if (code === 'sell_rosa') return 'ろさ売り';
  if (code === 'iki_buy') return 'いき買い(上値斜線)';
  return code;
}

function d4DetectHookLaws_(segs, cfg) {
  var events = [];
  if (segs.length < 3) return events;

  var priorHigh = null;
  var priorLow = null;
  var lastUpPeak = null;
  var lastDownTrough = null;

  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i];
    var band = d4GetKagiBand_(seg.to, cfg.kagiBaseStep);
    var threshold = band.mon * cfg.lawTickMult;

    if (seg.dir === 'up') {
      if (priorHigh != null && seg.to >= priorHigh + threshold) {
        events.push({ idx: i, side: 'buy', code: 'buy_roku', price: seg.to });
      }
      if (lastDownTrough != null && seg.from <= lastDownTrough && seg.to >= lastDownTrough + threshold) {
        events.push({ idx: i, side: 'buy', code: 'buy_roe', price: seg.to });
      }
      lastUpPeak = seg.to;
    } else {
      if (priorLow != null && seg.to <= priorLow - threshold) {
        events.push({ idx: i, side: 'sell', code: 'sell_roku', price: seg.to });
      }
      if (lastUpPeak != null && seg.from >= lastUpPeak && seg.to <= lastUpPeak - threshold) {
        events.push({ idx: i, side: 'sell', code: 'sell_roe', price: seg.to });
      }
      lastDownTrough = seg.to;
    }

    if (seg.dir === 'up') {
      priorHigh = priorHigh == null ? seg.to : Math.max(priorHigh, seg.to);
    } else {
      priorLow = priorLow == null ? seg.to : Math.min(priorLow, seg.to);
    }

    if (i >= 2) {
      var s0 = segs[i - 2];
      var s1 = segs[i - 1];
      var s2 = segs[i];
      if (s0.dir === 'down' && s1.dir === 'up' && s2.dir === 'down' && s1.to - s1.from >= threshold * 0.8) {
        events.push({ idx: i, side: 'buy', code: 'buy_rosa', price: s1.to });
      }
      if (s0.dir === 'up' && s1.dir === 'down' && s2.dir === 'up' && s1.from - s1.to >= threshold * 0.8) {
        events.push({ idx: i, side: 'sell', code: 'sell_rosa', price: s1.to });
      }
    }
  }

  return events;
}

function d4CountRecentLaws_(events, side, fromIdx) {
  var count = 0;
  var codes = [];
  for (var i = 0; i < events.length; i++) {
    if (events[i].idx < fromIdx) continue;
    if (events[i].side !== side) continue;
    count += 1;
    codes.push(events[i].code);
  }
  return { count: count, codes: codes };
}

function d4HadPullback_(segs, lookback) {
  if (segs.length < 3) return false;
  var slice = segs.slice(Math.max(0, segs.length - lookback));
  for (var i = 0; i < slice.length; i++) {
    if (slice[i].dir === 'down') return true;
  }
  return false;
}

function d4AnalyzeShibata_(candles1h, cfg, lastPrice) {
  var closed = candles1h.slice(0, -1);
  if (closed.length < 30) {
    return {
      signal: null,
      note: 'ローソク不足',
      buyLawCount: 0,
      sellLawCount: 0,
      kagiSegs: 0,
      trendline: null,
      secondStage: false,
    };
  }

  var segs = d4BuildShibataKagi_(closed, cfg.kagiBaseStep);
  var events = d4DetectHookLaws_(segs, cfg);
  var fromIdx = Math.max(0, segs.length - cfg.lawLookback);
  var buyRecent = d4CountRecentLaws_(events, 'buy', fromIdx);
  var sellRecent = d4CountRecentLaws_(events, 'sell', fromIdx);

  var n = closed.length - 1;
  var price = lastPrice != null ? lastPrice : closed[n].close;
  var lowerLine = d4BuildLowerTrendline_(candles1h, D4_CONFIG.TRENDLINE_LOOKBACK);
  var upperLine = d4BuildUpperTrendline_(candles1h, D4_CONFIG.TRENDLINE_LOOKBACK);
  var lineVal = lowerLine ? lowerLine.valueAt(n) : null;
  var aboveSupport = lineVal == null || price > lineVal;

  var ikiBuy = false;
  if (upperLine && d4IsBullishBody_(closed[n])) {
    var upperVal = upperLine.valueAt(n);
    var bodyTop = Math.max(closed[n].open, closed[n].close);
    if (bodyTop > upperVal) ikiBuy = true;
  }

  var secondStage = d4HadPullback_(segs, cfg.lawLookback);
  var buyMin = cfg.lawBuyMin != null ? cfg.lawBuyMin : 2;
  var buyConversion = buyRecent.count >= buyMin;
  var sellConversion = sellRecent.count >= 2;

  var lowerBreakSell = false;
  if (lowerLine && d4IsBearishBody_(closed[n])) {
    var bodyBottom = Math.min(closed[n].open, closed[n].close);
    if (bodyBottom < lowerLine.valueAt(n)) lowerBreakSell = true;
  }

  var signal = null;
  var noteParts = [];

  if (buyConversion && aboveSupport && (secondStage || ikiBuy)) {
    signal = 'buy';
    noteParts.push('鈎足2法則買い転換');
  } else if (sellConversion || lowerBreakSell) {
    signal = 'sell';
    if (sellConversion) noteParts.push('鈎足2法則売り転換');
    if (lowerBreakSell) noteParts.push('下値斜線切下(陰線)');
  } else if (ikiBuy && buyRecent.count >= 1 && aboveSupport) {
    signal = 'buy';
    noteParts.push('いき買い+鈎足1法則');
  } else {
    noteParts.push('待機');
  }

  noteParts.push('買法則' + buyRecent.count + '/売' + sellRecent.count);
  if (secondStage) noteParts.push('二の膳');
  if (lineVal != null) noteParts.push('下値斜線' + Math.round(lineVal));
  if (buyRecent.codes.length) {
    noteParts.push(
      buyRecent.codes
        .slice(-2)
        .map(d4LawLabelJa_)
        .join('+')
    );
  }

  if (buyConversion && signal !== 'buy') {
    if (!aboveSupport) noteParts.push('(下値斜線下)');
    if (!secondStage && !ikiBuy) noteParts.push('(二の膳未確認)');
  }

  return {
    signal: signal,
    note: noteParts.join(' '),
    buyLawCount: buyRecent.count,
    sellLawCount: sellRecent.count,
    buyLawCodes: buyRecent.codes,
    sellLawCodes: sellRecent.codes,
    kagiSegs: segs.length,
    trendline: lineVal != null ? Math.round(lineVal) : null,
    secondStage: secondStage,
    ikiBuy: ikiBuy,
    aboveSupport: aboveSupport,
    price: price,
  };
}
