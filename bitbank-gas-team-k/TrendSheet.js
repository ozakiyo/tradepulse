/**
 * K_トレンド: 短期（日足）と長期（週/月）を同一シートで一覧
 * ダウン入り（赤）／解除（緑）を強調。USD/JPY は参照行（BUY対象外）
 */

function kGetTrendSheet_() {
  var name = K_CONFIG.TREND_SHEET_NAME || 'K_トレンド';
  var legacy = K_CONFIG.TREND_SHEET_LEGACY_NAME || 'K_日足トレンド';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    var old = ss.getSheetByName(legacy);
    if (old) {
      old.setName(name);
      sheet = old;
    } else {
      sheet = ss.insertSheet(name);
    }
  }
  return sheet;
}

function kEnsureTrendSheetHeader_(sheet) {
  var headers = [
    '銘柄',
    '取引可否',
    '理由',
    '更新日',
    '短期・局面',
    '短期・ダウン',
    '短期・差分',
    '短期・entry可',
    '短期・ダウン解除',
    '終値',
    'SMA20',
    '箱高',
    '箱安',
    '幅%',
    '長期・除外',
    '長期・週足',
    '長期・月足',
    '長期・詳細',
    '短期・詳細',
  ];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 2).setNote(
    '取引可否の見方:\n' +
      '✅ 取引可 … 今BUYできる条件（日足OK・長期OK・上限帯外）\n' +
      '👀 監視のみ … 見るだけ。長期↓ or レンジ上限で新規BUYしない\n' +
      '⛔ 対象外 … 買えない。日足ダウン / 出来高・板が薄い / データ不足\n' +
      '参照 … USD/JPY（BUY対象外）\n' +
      '「理由」列に対象外・監視の具体理由を表示します。'
  );
  return headers.length;
}

/** 長期トレンドのシート表示セル [除外, 週足, 月足, 詳細] */
function kLongTermSheetCells_(lt) {
  if (!lt) return ['—', '—', '—', ''];
  return [
    lt.excluded ? 'true' : 'false',
    lt.weeklyDown ? '↓' : '非↓',
    lt.monthlyDown ? '↓' : '非↓',
    lt.note || '',
  ];
}

/**
 * Yahoo 日足（USDJPY=X 等）
 * @return {Array<{open,high,low,close,time}>}
 */
function kFetchYahooDailyBars_(symbol, lookbackDays) {
  lookbackDays = lookbackDays || K_CONFIG.DAILY_LOOKBACK || 60;
  var period2 = Math.floor(Date.now() / 1000);
  var period1 = period2 - Math.ceil(lookbackDays * 1.6) * 86400;
  var url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=1d&period1=' +
    period1 +
    '&period2=' +
    period2 +
    '&includePrePost=false';
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Yahoo HTTP ' + res.getResponseCode());
  }
  var json = JSON.parse(res.getContentText());
  var result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) return [];
  var q = result.indicators && result.indicators.quote && result.indicators.quote[0];
  var ts = result.timestamp || [];
  if (!q || !ts.length) return [];
  var out = [];
  for (var i = 0; i < ts.length; i++) {
    if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
    out.push({
      time: ts[i] * 1000,
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
    });
  }
  return out;
}

function kEvaluateUsdJpyTrend_(cfg) {
  cfg = cfg || kGetConfig_();
  var symbol = K_CONFIG.USDJPY_YAHOO_SYMBOL || 'USDJPY=X';
  var bars = kFetchYahooDailyBars_(symbol, K_CONFIG.DAILY_LOOKBACK || 60);
  if (!bars.length) {
    return {
      pair: K_CONFIG.USDJPY_SHEET_LABEL || 'USD/JPY',
      allowEntry: false,
      regime: 'unknown',
      isDailyDown: false,
      downtrendCleared: false,
      note: 'USDJPY取得失敗',
    };
  }
  // 形成中の当日足を除外（末尾が当日なら落とす）
  var confirmed = bars;
  if (bars.length >= 2) {
    var lastDay = Utilities.formatDate(new Date(bars[bars.length - 1].time), 'Asia/Tokyo', 'yyyy-MM-dd');
    var today = kTodayYmd_();
    if (lastDay === today) confirmed = bars.slice(0, bars.length - 1);
  }
  var r = kEvaluateDailyBars_(confirmed, cfg);
  r.pair = K_CONFIG.USDJPY_SHEET_LABEL || 'USD/JPY';
  r.refOnly = true;
  return r;
}

function kTrendDownLabel_(r) {
  if (!r) return '不明';
  if (r.isDailyDown || r.regime === 'daily_down') return 'ダウントレンド-';
  if (r.downtrendCleared) return '解除済';
  return '対象外';
}

function kTrendDiffFlag_(prevRegime, prevDown, r) {
  var prevFamily = kRegimeFamily_(prevRegime, prevDown === true);
  var nowDown = !!(r && (r.isDailyDown || r.regime === 'daily_down'));
  var nowFamily = kRegimeFamily_(r && r.regime, nowDown);
  // 前日なしは定常コメントのみ（チェンジ扱いしない）
  if (prevRegime == null || prevRegime === '') return '—';
  return kRegimeChangeCommentJa_(prevFamily, nowFamily);
}

function kLoadTrendPrevMap_() {
  var raw = PropertiesService.getScriptProperties().getProperty(K_CONFIG.TREND_SHEET_PREV_KEY || 'K_TREND_PREV');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function kSaveTrendPrevMap_(map) {
  PropertiesService.getScriptProperties().setProperty(
    K_CONFIG.TREND_SHEET_PREV_KEY || 'K_TREND_PREV',
    JSON.stringify(map)
  );
}

/**
 * 取引可否の一言判定
 * ✅取引可 / 👀監視のみ（買わない） / ⛔対象外（買えない） / 参照
 * @return {{ mark: string, reason: string }}
 */
function kTradeJudgment_(r, longTerm, liq, isReference) {
  if (isReference) return { mark: '参照', reason: 'BUY対象外（USD/JPY参照）' };
  r = r || {};
  if (r.regime === 'error') return { mark: '⛔ 対象外', reason: r.note || '取得エラー' };
  if (liq && liq.ok === false) {
    return { mark: '⛔ 対象外', reason: liq.reason || '出来高・板が薄い' };
  }
  if (r.isDailyDown || r.regime === 'daily_down') {
    return { mark: '⛔ 対象外', reason: '日足ダウントレンド（entry不可）' };
  }
  if (r.regime === 'unknown') {
    return { mark: '⛔ 対象外', reason: r.note || 'データ不足' };
  }
  if (longTerm && longTerm.excluded) {
    var p = [];
    if (longTerm.weeklyDown) p.push('週足↓');
    if (longTerm.monthlyDown) p.push('月足↓');
    return { mark: '👀 監視のみ', reason: '長期' + (p.join('・') || '↓') + '＝新規BUY禁止' };
  }
  if (r.nearTop || r.regime === 'range_upper') {
    return { mark: '👀 監視のみ', reason: 'レンジ上限帯（枠移行・BUYなし）' };
  }
  if (r.allowEntry) {
    return { mark: '✅ 取引可', reason: r.regimeComment || 'entry可' };
  }
  return { mark: '👀 監視のみ', reason: r.regimeComment || '判定待ち' };
}

function kBuildTrendRow_(label, r, ymd, prevMap, longTerm, liq) {
  var prev = prevMap[label] || {};
  var comment = (r && r.regimeComment) || kRegimeCommentJa_(r && r.regime, r && r.isDailyDown);
  var diff = kTrendDiffFlag_(prev.regime, prev.isDailyDown, r);
  // 差分がある日は局面列にもチェンジコメントを出す
  var display = diff !== '—' ? diff : comment;
  var ltCells = kLongTermSheetCells_(longTerm);
  var judge = kTradeJudgment_(r, longTerm, liq, longTerm === null);
  return {
    label: label,
    row: [
      label,
      judge.mark,
      judge.reason,
      ymd,
      display,
      kTrendDownLabel_(r),
      diff,
      r.allowEntry ? 'true' : 'false',
      r.downtrendCleared ? 'true' : 'false',
      r.lastClose != null ? r.lastClose : '',
      r.sma != null ? Math.round(r.sma * 1e6) / 1e6 : '',
      r.rangeHigh != null ? r.rangeHigh : '',
      r.rangeLow != null ? r.rangeLow : '',
      r.widthPct != null ? Math.round(r.widthPct * 10) / 10 : '',
      ltCells[0],
      ltCells[1],
      ltCells[2],
      ltCells[3],
      r.note || '',
    ],
    diff: diff,
    regime: r.regime,
    regimeComment: comment,
    judgmentMark: judge.mark,
    isDailyDown: !!(r.isDailyDown || r.regime === 'daily_down'),
    excludedLong: !!(longTerm && longTerm.excluded),
    // スナップショット用（列順に依存しない）
    allowEntry: !!r.allowEntry,
    downtrendCleared: !!r.downtrendCleared,
    lastClose: r.lastClose != null ? Number(r.lastClose) : null,
    sma: r.sma != null ? Number(r.sma) : null,
    weeklyDown: !!(longTerm && longTerm.weeklyDown),
    monthlyDown: !!(longTerm && longTerm.monthlyDown),
    longNote: (longTerm && longTerm.note) || '',
    note: r.note || '',
  };
}

/** 取引可否セルの色 */
function kJudgmentColor_(mark) {
  if (!mark) return null;
  if (mark.indexOf('✅') === 0) return '#d9ead3';
  if (mark.indexOf('👀') === 0) return '#fff2cc';
  if (mark.indexOf('⛔') === 0) return '#f4cccc';
  return '#efefef';
}

function kApplyTrendRowColors_(sheet, rowIndex, diff, regime, isDailyDown, excludedLong, judgmentMark) {
  var ncols = 19;
  var range = sheet.getRange(rowIndex, 1, 1, ncols);
  range.setFontWeight('normal');
  range.setBackground(null);
  // 取引可否セル（2列目）は判定色で常に塗る
  var jc = kJudgmentColor_(judgmentMark);
  if (jc) sheet.getRange(rowIndex, 2).setBackground(jc);
  if (diff === 'チェンジダウントレンド-') {
    range.setBackground('#f4cccc');
    range.setFontWeight('bold');
  } else if (diff === 'チェンジアップトレンド-') {
    range.setBackground('#d9ead3');
    range.setFontWeight('bold');
  } else if (diff === 'チェンジレンジ-') {
    range.setBackground('#fff2cc');
    range.setFontWeight('bold');
  } else if (isDailyDown || regime === 'daily_down') {
    range.setBackground('#fce8e6');
  } else if (regime === 'range_upper') {
    range.setBackground('#fce5cd');
  }
  // 長期除外は長期列のみ薄い赤（長期・除外〜長期・詳細 = 15〜18列）
  if (excludedLong) {
    sheet.getRange(rowIndex, 15, 1, 4).setBackground('#fadbd8');
  }
  // 取引可否セルは行全体の色より優先して判定色を再適用（一目で分かるように）
  if (jc) sheet.getRange(rowIndex, 2).setBackground(jc);
}

/**
 * 日次トレンドシート更新（未完了ならバッチ継続。force で当日やり直す）
 * @return {{ done: boolean, progress: string, rows: number }}
 */
function kUpdateTrendSheetDaily_(cfg, opts) {
  opts = opts || {};
  cfg = cfg || kGetConfig_();
  var props = PropertiesService.getScriptProperties();
  var ymd = kTodayYmd_();
  var ymdKey = K_CONFIG.TREND_SHEET_YMD_KEY || 'K_TREND_SHEET_YMD';
  var offsetKey = K_CONFIG.TREND_SHEET_OFFSET_KEY || 'K_TREND_OFFSET';
  var maxMs = opts.maxMs || K_CONFIG.TREND_SHEET_BATCH_MAX_MS || 180000;

  if (!opts.force && props.getProperty(ymdKey) === ymd) {
    return { done: true, progress: '本日更新済み', rows: 0 };
  }

  kEnsureInstrumentsSyncedDaily_();
  var pairs = kAllPairs_().sort();
  var offset = Number(props.getProperty(offsetKey) || 0);
  if (opts.force && offset === 0) {
    // restart
  } else if (opts.force && props.getProperty(ymdKey) === ymd) {
    props.deleteProperty(ymdKey);
    props.deleteProperty(offsetKey);
    props.deleteProperty(K_CONFIG.TREND_SNAPSHOT_KEY || 'K_TREND_SNAPSHOT');
    offset = 0;
  }

  if (opts.force && offset === 0) {
    props.deleteProperty(K_CONFIG.TREND_SNAPSHOT_KEY || 'K_TREND_SNAPSHOT');
  }

  var sheet = kGetTrendSheet_();
  var ncols = kEnsureTrendSheetHeader_(sheet);

  var prevMap = kLoadTrendPrevMap_();
  var nextPrev = offset === 0 ? {} : kLoadTrendPrevMap_();
  // 途中再開用バッファ
  var bufKey = 'K_TREND_BUF';
  var buf = [];
  if (offset > 0) {
    try {
      buf = JSON.parse(props.getProperty(bufKey) || '[]');
    } catch (e) {
      buf = [];
    }
  } else {
    props.deleteProperty(bufKey);
    nextPrev = {};
  }

  var started = Date.now();
  for (var i = offset; i < pairs.length; i++) {
    if (Date.now() - started > maxMs) {
      props.setProperty(offsetKey, String(i));
      props.setProperty(bufKey, JSON.stringify(buf));
      kSaveTrendPrevMap_(Object_assign_({}, prevMap, nextPrev));
      return {
        done: false,
        progress: '取得中 ' + i + '/' + pairs.length,
        rows: buf.length,
      };
    }
    var pair = pairs[i];
    try {
      var up = kEvaluateUpRegime_(pair, cfg, { forceRefresh: !!opts.force });
      var lt = null;
      try {
        lt = kEvaluateLongTermRegime_(pair, cfg);
      } catch (lte) {
        lt = { excluded: false, weeklyDown: false, monthlyDown: false, note: '長期取得失敗: ' + (lte.message || lte) };
      }
      // 流動性（出来高・板）→ 取引可否の理由に反映。失敗時は判定に含めない
      var liq = null;
      try {
        var tk = kGetTicker_(pair);
        liq = kCheckLiquidity_(pair, cfg, tk);
      } catch (lqe) {
        liq = null;
      }
      var built = kBuildTrendRow_(pair, up, ymd, prevMap, lt, liq);
      buf.push(built);
      nextPrev[pair] = { regime: up.regime, isDailyDown: built.isDailyDown };
    } catch (err) {
      buf.push({
        label: pair,
        row: [
          pair,
          '⛔ 対象外',
          String(err.message || err),
          ymd,
          'error',
          '不明',
          '—',
          'false',
          'false',
          '',
          '',
          '',
          '',
          '',
          '—',
          '—',
          '—',
          '',
          String(err.message || err),
        ],
        diff: '—',
        regime: 'error',
        judgmentMark: '⛔ 対象外',
        isDailyDown: false,
        excludedLong: false,
      });
    }
  }

  // USD/JPY 参照行（長期は bitbank なし → —）
  try {
    var fx = kEvaluateUsdJpyTrend_(cfg);
    var fxBuilt = kBuildTrendRow_(fx.pair, fx, ymd, prevMap, null);
    buf.push(fxBuilt);
    nextPrev[fx.pair] = { regime: fx.regime, isDailyDown: fxBuilt.isDailyDown };
  } catch (e2) {
    buf.push({
      label: K_CONFIG.USDJPY_SHEET_LABEL || 'USD/JPY',
      row: [
        K_CONFIG.USDJPY_SHEET_LABEL || 'USD/JPY',
        '参照',
        'BUY対象外（USD/JPY参照）',
        ymd,
        'error',
        '不明',
        '—',
        'false',
        'false',
        '',
        '',
        '',
        '',
        '',
        '—',
        '—',
        '—',
        '',
        String(e2.message || e2),
      ],
      diff: '—',
      regime: 'error',
      judgmentMark: '参照',
      isDailyDown: false,
      excludedLong: false,
    });
  }

  // シート書込（ヘッダ残してクリア）
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, ncols).clearContent();
    sheet.getRange(2, 1, lastRow - 1, ncols).setBackground(null);
    sheet.getRange(2, 1, lastRow - 1, ncols).setFontWeight('normal');
  }
  var values = buf.map(function (b) {
    return b.row;
  });
  if (values.length) {
    sheet.getRange(2, 1, values.length, ncols).setValues(values);
    for (var r = 0; r < buf.length; r++) {
      kApplyTrendRowColors_(
        sheet,
        r + 2,
        buf[r].diff,
        buf[r].regime,
        buf[r].isDailyDown,
        buf[r].excludedLong,
        buf[r].judgmentMark
      );
    }
  }

  kSaveTrendPrevMap_(nextPrev);
  props.setProperty(ymdKey, ymd);
  props.deleteProperty(offsetKey);
  props.deleteProperty(bufKey);

  // ランキング共用スナップショット（allowEntry 候補の元）
  try {
    kSaveTrendSnapshotFromBuf_(ymd, buf);
  } catch (se) {
    kLog_('トレンドスナップ保存失敗: ' + (se.message || se));
  }

  kLog_('トレンドシート更新完了: ' + values.length + '行');
  return { done: true, progress: '完了 ' + values.length + '行', rows: values.length };
}

function kSaveTrendSnapshotFromBuf_(ymd, buf) {
  var pairs = {};
  (buf || []).forEach(function (b) {
    if (!b || !b.label) return;
    // USD/JPY など参照行はランク対象外（_jpy ペアのみ）
    if (String(b.label).indexOf('_') < 0) return;
    // 列順に依存せず built オブジェクトの値を使う
    pairs[b.label] = {
      regime: b.regime || '',
      allowEntry: !!b.allowEntry,
      downtrendCleared: !!b.downtrendCleared,
      lastClose: b.lastClose != null ? Number(b.lastClose) : null,
      sma: b.sma != null ? Number(b.sma) : null,
      excludedLong: !!b.excludedLong,
      weeklyDown: !!b.weeklyDown,
      monthlyDown: !!b.monthlyDown,
      longNote: b.longNote || '',
      note: b.note || '',
      isDailyDown: !!b.isDailyDown,
    };
  });
  var snap = {
    ymd: ymd,
    complete: true,
    updatedAt: Date.now(),
    pairs: pairs,
  };
  PropertiesService.getScriptProperties().setProperty(
    K_CONFIG.TREND_SNAPSHOT_KEY || 'K_TREND_SNAPSHOT',
    JSON.stringify(snap)
  );
  // ランクは次回トレンドから組み直す
  PropertiesService.getScriptProperties().deleteProperty(K_RANK_CACHE_KEY);
  PropertiesService.getScriptProperties().deleteProperty(K_RANK_OFFSET_KEY);
}

function kLoadTrendSnapshot_() {
  var raw = PropertiesService.getScriptProperties().getProperty(
    K_CONFIG.TREND_SNAPSHOT_KEY || 'K_TREND_SNAPSHOT'
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function kIsTrendSnapshotReadyToday_() {
  var snap = kLoadTrendSnapshot_();
  return !!(snap && snap.complete && snap.ymd === kTodayYmd_() && snap.pairs);
}

/** Object.assign polyfill-ish for GAS old runtime */
function Object_assign_(target, a, b) {
  var o = target || {};
  [a, b].forEach(function (src) {
    if (!src) return;
    Object.keys(src).forEach(function (k) {
      o[k] = src[k];
    });
  });
  return o;
}
