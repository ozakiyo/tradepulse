function c3RoundBox_(price, boxSize, up) {
  if (up) return Math.ceil(price / boxSize) * boxSize;
  return Math.floor(price / boxSize) * boxSize;
}

function c3CalcAtrPct_(candles, period) {
  if (candles.length < period + 2) return null;
  var tr = [];
  for (var i = 1; i < candles.length; i++) {
    var hl = candles[i].high - candles[i].low;
    var hc = Math.abs(candles[i].high - candles[i - 1].close);
    var lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  var start = Math.max(0, tr.length - period);
  var sum = 0;
  var count = 0;
  for (var j = start; j < tr.length; j++) {
    var close = candles[j + 1].close;
    if (close > 0) {
      sum += tr[j] / close;
      count += 1;
    }
  }
  if (!count) return null;
  return (sum / count) * 100;
}

function c3ResolveBoxSize_(closed, cfg, lastPrice) {
  var base = cfg.pfBoxJpy;
  var atrPct = c3CalcAtrPct_(closed, 14);
  if (atrPct == null) return { boxSize: base, atrPct: null };
  var factor = atrPct / cfg.pfAtrRefPct;
  factor = Math.max(0.6, Math.min(1.6, factor));
  var raw = base * factor;
  var boxSize = Math.round(raw / 5000) * 5000;
  boxSize = Math.max(cfg.pfBoxMinJpy, Math.min(cfg.pfBoxMaxJpy, boxSize));
  return { boxSize: boxSize, atrPct: atrPct };
}

/**
 * 3箱反転法のP&F列を構築（1H終値）
 */
function c3BuildPfColumns_(closes, boxSize, reversalBoxes) {
  if (!closes.length) return [];
  var revDist = boxSize * reversalBoxes;
  var columns = [];
  var col = {
    type: 'X',
    high: c3RoundBox_(closes[0], boxSize, true),
    low: c3RoundBox_(closes[0], boxSize, false),
    boxes: 1,
  };
  col.low = col.high - boxSize;

  for (var i = 1; i < closes.length; i++) {
    var p = closes[i];
    if (col.type === 'X') {
      while (p >= col.high + boxSize) {
        col.high += boxSize;
        col.boxes += 1;
      }
      if (p <= col.high - revDist) {
        columns.push(col);
        var newHigh = col.high - boxSize;
        col = {
          type: 'O',
          high: newHigh,
          low: c3RoundBox_(p, boxSize, false),
          boxes: 1,
        };
        while (p <= col.low - boxSize) {
          col.low -= boxSize;
          col.boxes += 1;
        }
      }
    } else {
      while (p <= col.low - boxSize) {
        col.low -= boxSize;
        col.boxes += 1;
      }
      if (p >= col.low + revDist) {
        columns.push(col);
        var newLow = col.low + boxSize;
        col = {
          type: 'X',
          low: newLow,
          high: c3RoundBox_(p, boxSize, true),
          boxes: 1,
        };
        while (p >= col.high + boxSize) {
          col.high += boxSize;
          col.boxes += 1;
        }
      }
    }
  }
  columns.push(col);
  return columns;
}

/**
 * 順張りシグナル
 * - 買い: 最新X列の高値が、直前X列の高値を1箱以上更新（ブレイク）
 * - 売り: 最新O列の安値が、直前O列の安値を1箱以上更新
 */
function c3DetectPfSignal_(columns, boxSize) {
  if (columns.length < 2) {
    return { signal: 'none', note: 'P&F列不足' };
  }
  var last = columns[columns.length - 1];
  var prevSame = null;
  for (var i = columns.length - 2; i >= 0; i--) {
    if (columns[i].type === last.type) {
      prevSame = columns[i];
      break;
    }
  }
  if (!prevSame) {
    return {
      signal: 'none',
      note: 'P&F ' + last.type + '列' + last.boxes + '箱 高' + last.high + '/安' + last.low,
    };
  }

  if (last.type === 'X' && last.high >= prevSame.high + boxSize) {
    return {
      signal: 'buy',
      note: 'P&F買い Xブレイク ' + prevSame.high + '→' + last.high + '（' + last.boxes + '箱）',
    };
  }
  if (last.type === 'O' && last.low <= prevSame.low - boxSize) {
    return {
      signal: 'sell',
      note: 'P&F売り Oブレイク ' + prevSame.low + '→' + last.low + '（' + last.boxes + '箱）',
    };
  }

  return {
    signal: 'none',
    note: 'P&F ' + last.type + '列 高' + last.high + '/安' + last.low + '（待機）',
  };
}

function c3AnalyzePointFigure_(candles1h, cfg, lastPrice) {
  var closed = candles1h.slice(0, -1);
  if (closed.length < 30) closed = candles1h;
  var closes = closed.map(function (c) {
    return c.close;
  });
  var boxInfo = c3ResolveBoxSize_(closed, cfg, lastPrice);
  var columns = c3BuildPfColumns_(closes, boxInfo.boxSize, cfg.pfReversalBoxes);
  var sig = c3DetectPfSignal_(columns, boxInfo.boxSize);
  sig.boxSize = boxInfo.boxSize;
  sig.atrPct = boxInfo.atrPct;
  sig.columnCount = columns.length;
  return sig;
}
