/**
 * TEAM-J — bitbank API 取引履歴同期・移動平均法 税務明細（申告用）
 */

var J_LAST_API_TRADE_MS_KEY = 'J_LAST_API_TRADE_MS';
var J_API_TRADE_SYNC_OVERLAP_MS = 3600000;
var J_TAX_DETAIL_DATA_ROW = 3;

function jFetchSpotTradeHistory_(opts) {
  opts = opts || {};
  var parts = [];
  if (opts.pair) parts.push('pair=' + encodeURIComponent(opts.pair));
  if (opts.count) parts.push('count=' + opts.count);
  if (opts.order_id) parts.push('order_id=' + opts.order_id);
  if (opts.since != null) parts.push('since=' + opts.since);
  if (opts.end != null) parts.push('end=' + opts.end);
  parts.push('order=' + (opts.order || 'asc'));
  var data = jPrivateRequest_('get', '/user/spot/trade_history', parts.join('&'), null);
  return data.trades || [];
}

/** since 以降の約定を最大 maxPages×1000 件まで取得 */
function jFetchSpotTradesSince_(sinceMs, maxPages) {
  sinceMs = sinceMs || 0;
  maxPages = maxPages || 20;
  var all = [];
  var cursor = sinceMs;
  for (var page = 0; page < maxPages; page++) {
    var batch = jFetchSpotTradeHistory_({ since: cursor, count: 1000, order: 'asc' });
    if (!batch.length) break;
    batch.forEach(function (t) {
      all.push(t);
    });
    var lastAt = Number(batch[batch.length - 1].executed_at) || 0;
    if (batch.length < 1000 || lastAt <= cursor) break;
    cursor = lastAt + 1;
  }
  return all;
}

function jGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_TRADE);
    sheet.appendRow([
      '約定ID',
      '約定日時',
      '銘柄',
      '売買',
      '価格',
      '数量',
      '手数料JPY',
      'maker/taker',
      '注文ID',
      '注文種別',
      '同期日時',
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('B:B').setNumberFormat('@'); // 約定日時を文字列のまま保持
  }
  return sheet;
}

function jGetTaxDetailSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_TAX_DETAIL);
  var headers = [
    '取引年月日',
    '取引時刻',
    '取引所',
    '銘柄ペア',
    '暗号資産',
    '売却数量',
    '取得単価(円)',
    '売却単価(円)',
    '取得価額(円)',
    '売却価額(円)',
    '手数料_買(円)',
    '手数料_売(円)',
    '譲渡損益(円)',
    '区分',
    'メモ',
    '売約定ID',
    '直近買約定ID',
  ];
  var note =
    '※ bitbank API trade_history から移動平均法で再計算（申告用・法人デフォルト寄り）\n' +
    '取得単価＝売却時点の移動平均単価（買手数料込み）。売手数料は売却価額から控除。';
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_TAX_DETAIL);
    sheet.appendRow(headers);
    sheet.appendRow([note]);
    sheet.getRange(1, 1, 1, 17).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(5, 80);
  } else {
    sheet.getRange(1, 1, 1, 17).setValues([headers]);
    sheet.getRange(2, 1, 1, 17).setValue(note);
  }
  return sheet;
}

/** 自注文IDシート（本番発注した order_id の台帳） */
function jGetOwnOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_OWN_ORDERS);
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_OWN_ORDERS);
    sheet.appendRow(['注文ID', '銘柄', '売買', '記録日時']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 本番発注した order_id を台帳へ記録（同一口座での分離用） */
function jRecordOwnOrderId_(orderId, pair, side) {
  if (orderId == null || orderId === '') return;
  var idStr = String(orderId);
  if (idStr.indexOf('dry-') === 0) return;
  try {
    jGetOwnOrdersSheet_().appendRow([
      idStr,
      pair || '',
      side || '',
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ]);
  } catch (e) {
    jLog_('自注文ID記録失敗: ' + (e.message || e));
  }
}

/** 台帳の自注文IDを集合で読込 */
function jLoadOwnOrderIds_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_OWN_ORDERS);
  var ids = {};
  if (!sheet || sheet.getLastRow() < 2) return ids;
  var col = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  col.forEach(function (r) {
    if (r[0] != null && r[0] !== '') ids[String(r[0])] = true;
  });
  return ids;
}

function jLoadKnownTradeIds_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(J_SHEET_TRADE);
  var ids = {};
  if (!sheet || sheet.getLastRow() < 2) return ids;
  var col = sheet.getRange(2, 1, sheet.getLastRow(), 1).getValues();
  col.forEach(function (r) {
    if (r[0] != null && r[0] !== '') ids[String(r[0])] = true;
  });
  return ids;
}

function jFormatApiTradeRow_(trade) {
  var at = new Date(Number(trade.executed_at));
  return [
    trade.trade_id,
    Utilities.formatDate(at, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    trade.pair,
    trade.side,
    Number(trade.price),
    Number(trade.amount),
    Number(trade.fee_amount_quote) || 0,
    trade.maker_taker || '',
    trade.order_id || '',
    trade.type || '',
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
  ];
}

/**
 * J_売買履歴の約定日時セル → epoch ms
 * Sheets が Date オブジェクトやシリアル値に変換することがあるため、複数形式に対応
 */
function jParseTradeTimeMs_(cell) {
  if (cell == null || cell === '') return 0;
  if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) {
    return cell.getTime();
  }
  if (typeof cell === 'number' && isFinite(cell)) {
    // Sheets シリアル日（おおよそ 20000〜60000）or epoch
    if (cell > 100000000000) return Math.floor(cell); // ms
    if (cell > 1000000000) return Math.floor(cell * 1000); // sec
    // Excel/Sheets serial: days since 1899-12-30
    return Math.floor((cell - 25569) * 86400000);
  }
  var s = String(cell).trim();
  if (!s) return 0;
  // "yyyy-MM-dd HH:mm:ss"
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    var d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6])
    );
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  var t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * API から新規約定を J_売買履歴 へ追記
 * @return {{ added: number, total: number, skippedDryRun: boolean }}
 */
function jSyncTradeHistoryFromApi_(opts) {
  opts = opts || {};
  var cfg = jGetConfig_();
  if (cfg.dryRun && !opts.force) {
    return { added: 0, total: 0, skippedDryRun: true };
  }

  jGetTradeSheet_();
  var props = PropertiesService.getScriptProperties();
  var sinceMs = opts.sinceMs != null ? opts.sinceMs : null;
  if (sinceMs == null) {
    var raw = props.getProperty(J_LAST_API_TRADE_MS_KEY);
    if (!raw) {
      var now = Date.now();
      props.setProperty(J_LAST_API_TRADE_MS_KEY, String(now));
      jLog_('取引履歴同期: 初回のため過去分はスキップ（以降のみ記録）');
      return { added: 0, total: 0, skippedDryRun: false, initialized: true };
    }
    sinceMs = Math.max(0, Number(raw) - J_API_TRADE_SYNC_OVERLAP_MS);
  }

  var trades = jFetchSpotTradesSince_(sinceMs, opts.maxPages || 5);
  if (!trades.length) {
    return { added: 0, total: 0, skippedDryRun: false, initialized: false };
  }

  var known = jLoadKnownTradeIds_();
  var sheet = jGetTradeSheet_();
  var rows = [];
  var maxExecuted = sinceMs;
  // 同一口座で他Bot/手動の約定を除外: 自注文IDに一致する約定のみ取込
  var ownOnly = !!cfg.ownOrdersOnly;
  var owned = ownOnly ? jLoadOwnOrderIds_() : null;
  var skippedForeign = 0;

  trades.forEach(function (t) {
    var id = String(t.trade_id);
    var at = Number(t.executed_at) || 0;
    if (at > maxExecuted) maxExecuted = at;
    if (known[id]) return;
    if (ownOnly && !(owned && owned[String(t.order_id)])) {
      skippedForeign += 1;
      return;
    }
    known[id] = true;
    rows.push(jFormatApiTradeRow_(t));
  });
  if (ownOnly && skippedForeign) {
    jLog_('自注文フィルタ: 他Bot/手動 ' + skippedForeign + '件を除外');
  }

  if (rows.length) {
    var start = sheet.getLastRow() + 1;
    // getRange(row, column, numRows, numColumns)
    sheet.getRange(start, 1, rows.length, 11).setValues(rows);
    jLog_('API取引履歴 +' + rows.length + '件（since=' + sinceMs + '）');
  }

  if (maxExecuted > sinceMs) {
    props.setProperty(J_LAST_API_TRADE_MS_KEY, String(maxExecuted));
  }

  return { added: rows.length, total: trades.length, skippedDryRun: false };
}

function jReadApiTradeRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(J_SHEET_TRADE);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var n = sheet.getLastRow() - 1;
  var values = sheet.getRange(2, 1, n, 11).getValues();
  var out = [];
  values.forEach(function (r) {
    if (!r[0]) return;
    out.push({
      trade_id: String(r[0]),
      executed_at: jParseTradeTimeMs_(r[1]),
      pair: String(r[2] || ''),
      side: String(r[3] || ''),
      price: Number(r[4]) || 0,
      amount: Number(r[5]) || 0,
      fee_quote: Number(r[6]) || 0,
      maker_taker: String(r[7] || ''),
      order_id: String(r[8] || ''),
      type: String(r[9] || ''),
    });
  });
  out.sort(function (a, b) {
    return a.executed_at - b.executed_at || Number(a.trade_id) - Number(b.trade_id);
  });
  return out;
}

function jPairToAsset_(pair) {
  var inst = jGetInstrument_(pair);
  if (inst && inst.asset) return inst.asset;
  return String(pair || '').split('_')[0];
}

/**
 * 移動平均法で譲渡損益行を生成（銘柄＝暗号資産単位）
 * 買い: 簿価合計・数量を更新し平均単価を再計算（買手数料を簿価に算入）
 * 売り: 売却時点の平均単価×数量を取得価額とし、売手数料を売却価額から控除
 */
function jMovingAverageMatchTaxRows_(trades) {
  var books = {};
  var taxRows = [];
  var warnings = [];

  trades.forEach(function (t) {
    var asset = jPairToAsset_(t.pair);
    if (!books[asset]) {
      books[asset] = { qty: 0, costExFee: 0, fees: 0, lastBuyId: '', lastPair: t.pair };
    }
    var book = books[asset];

    if (t.side === 'buy') {
      var buyAmt = Number(t.amount) || 0;
      var buyFee = Number(t.fee_quote) || 0;
      if (buyAmt <= 0) return;
      book.qty += buyAmt;
      book.costExFee += (Number(t.price) || 0) * buyAmt;
      book.fees += buyFee;
      book.lastBuyId = String(t.trade_id || '');
      book.lastPair = t.pair;
      return;
    }

    if (t.side !== 'sell') return;

    var sellLeft = Number(t.amount) || 0;
    var sellFeeTotal = Number(t.fee_quote) || 0;
    var sellAmtTotal = Number(t.amount) || 0;

    while (sellLeft > 1e-12 && book.qty > 1e-12) {
      var take = Math.min(sellLeft, book.qty);
      if (take <= 0) break;

      var bookTotal = book.costExFee + book.fees;
      var avgUnit = book.qty > 0 ? bookTotal / book.qty : 0;
      var ratio = book.qty > 0 ? take / book.qty : 0;
      var buyFeePart = book.fees * ratio;
      var buyCost = avgUnit * take;
      var sellFeePart = sellAmtTotal > 0 ? (sellFeeTotal * take) / sellAmtTotal : 0;
      var sellProceeds = (Number(t.price) || 0) * take - sellFeePart;
      var profit = Math.round(sellProceeds - buyCost);

      var at = new Date(t.executed_at);
      if (isNaN(at.getTime()) || t.executed_at < 10000000000) {
        warnings.push(t.pair + ' 日付不正 trade_id=' + t.trade_id);
        at = new Date();
      }

      taxRows.push([
        Utilities.formatDate(at, 'Asia/Tokyo', 'yyyy-MM-dd'),
        Utilities.formatDate(at, 'Asia/Tokyo', 'HH:mm:ss'),
        'bitbank',
        t.pair,
        asset,
        take,
        Math.round(avgUnit * 1e8) / 1e8,
        Number(t.price) || 0,
        Math.round(buyCost),
        Math.round(sellProceeds),
        Math.round(buyFeePart),
        Math.round(sellFeePart),
        profit,
        'API実績移動平均',
        'trade_history同期',
        t.trade_id,
        book.lastBuyId || '',
      ]);

      book.costExFee -= book.costExFee * ratio;
      book.fees -= buyFeePart;
      book.qty -= take;
      if (book.qty < 1e-12) {
        book.qty = 0;
        book.costExFee = 0;
        book.fees = 0;
      }
      sellLeft -= take;
    }

    if (sellLeft > 1e-8) {
      warnings.push(t.pair + ' 売り' + sellLeft + ' 保有不足 trade_id=' + t.trade_id);
    }
  });

  Object.keys(books).forEach(function (asset) {
    var b = books[asset];
    if (b.qty > 1e-8) {
      warnings.push(asset + ' 未売却残 ' + b.qty + '（移動平均単価≈' + (b.qty > 0 ? (b.costExFee + b.fees) / b.qty : 0) + '）');
    }
  });

  return { taxRows: taxRows, warnings: warnings };
}

/** @deprecated 互換: 移動平均法へ委譲 */
function jFifoMatchTaxRows_(trades) {
  return jMovingAverageMatchTaxRows_(trades);
}

/** J_売買履歴 から J_税務明細 を移動平均法で再生成 */
function jRebuildTaxDetailFromApi_() {
  jGetTaxDetailSheet_();
  var trades = jReadApiTradeRows_();
  var sheet = jGetTaxDetailSheet_();
  if (sheet.getLastRow() >= J_TAX_DETAIL_DATA_ROW) {
    sheet.deleteRows(J_TAX_DETAIL_DATA_ROW, sheet.getLastRow() - J_TAX_DETAIL_DATA_ROW + 1);
  }
  if (!trades.length) {
    return { taxRows: 0, warnings: ['取引履歴が空です'] };
  }

  var result = jMovingAverageMatchTaxRows_(trades);
  if (result.taxRows.length) {
    sheet
      .getRange(J_TAX_DETAIL_DATA_ROW, 1, result.taxRows.length, 17)
      .setValues(result.taxRows);
  }
  jLog_('税務明細 移動平均再計算: ' + result.taxRows.length + '行');
  return { taxRows: result.taxRows.length, warnings: result.warnings };
}

/** J_税務明細（API実績）から 年次 / 月次 / 日次 シートを再計算 */
function jRefreshTaxSummaryFromDetail_(detailSheetName) {
  jGetTaxSummarySheet_();
  jGetTaxMonthlySheet_();
  jGetTaxDailySheet_();
  jGetTaxDailyAssetSheet_();
  var detail = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(detailSheetName);
  if (!detail || detail.getLastRow() < J_TAX_DETAIL_DATA_ROW) {
    return false;
  }

  var rows = detail
    .getRange(J_TAX_DETAIL_DATA_ROW, 1, detail.getLastRow() - J_TAX_DETAIL_DATA_ROW + 1, 15)
    .getValues();
  var byYear = {};
  var byMonth = {};
  var byDay = {};
  var byAssetYear = {};
  var byAssetMonth = {};
  var byAssetDay = {};

  function bump_(map, key, buyCost, sellProceeds, fee, profit) {
    if (!map[key]) {
      map[key] = { count: 0, buyCost: 0, sellProceeds: 0, fee: 0, profit: 0 };
    }
    map[key].count += 1;
    map[key].buyCost += buyCost;
    map[key].sellProceeds += sellProceeds;
    map[key].fee += fee;
    map[key].profit += profit;
  }

  function metrics_(a) {
    return [
      a.count,
      Math.round(a.buyCost),
      Math.round(a.sellProceeds),
      Math.round(a.fee),
      Math.round(a.profit),
    ];
  }

  rows.forEach(function (r) {
    if (!r[0] && r[0] !== 0) return;
    var ms = jParseTradeTimeMs_(r[0]);
    var ymd =
      ms > 0 ? Utilities.formatDate(new Date(ms), 'Asia/Tokyo', 'yyyy-MM-dd') : '不明';
    var year = ymd.length >= 4 && ymd !== '不明' ? ymd.slice(0, 4) : '不明';
    var month = ymd.length >= 7 && ymd !== '不明' ? ymd.slice(0, 7) : year;
    var asset = String(r[4] || '');
    var buyCost = Number(r[8]) || 0;
    var sellProceeds = Number(r[9]) || 0;
    var fee = (Number(r[10]) || 0) + (Number(r[11]) || 0);
    var profit = Number(r[12]) || 0;

    bump_(byYear, year, buyCost, sellProceeds, fee, profit);
    bump_(byMonth, month, buyCost, sellProceeds, fee, profit);
    bump_(byDay, ymd, buyCost, sellProceeds, fee, profit);
    bump_(byAssetYear, year + '\t' + asset, buyCost, sellProceeds, fee, profit);
    bump_(byAssetMonth, month + '\t' + asset, buyCost, sellProceeds, fee, profit);
    bump_(byAssetDay, ymd + '\t' + asset, buyCost, sellProceeds, fee, profit);
  });

  var yearOut = [];
  Object.keys(byYear)
    .sort()
    .forEach(function (y) {
      yearOut.push([y, '(全銘柄)'].concat(metrics_(byYear[y])));
    });
  Object.keys(byAssetYear)
    .sort()
    .forEach(function (k) {
      var parts = k.split('\t');
      yearOut.push([parts[0], parts[1]].concat(metrics_(byAssetYear[k])));
    });
  jWriteTaxAggBody_(jGetTaxSummarySheet_(), yearOut, 7);

  // 月次: 月ごとに「全銘柄」→銘柄別（空行で区切り）
  var monthOut = [];
  var monthKeys = Object.keys(byMonth).sort().reverse();
  monthKeys.forEach(function (m, idx) {
    var ym = String(m).split('-');
    monthOut.push([ym[0] || '', ym[1] || '', '(全銘柄)'].concat(metrics_(byMonth[m])));
    Object.keys(byAssetMonth)
      .filter(function (k) {
        return k.indexOf(m + '\t') === 0;
      })
      .sort()
      .forEach(function (k) {
        var parts = k.split('\t');
        monthOut.push([ym[0] || '', ym[1] || '', parts[1]].concat(metrics_(byAssetMonth[k])));
      });
    if (idx < monthKeys.length - 1) {
      monthOut.push(['', '', '', '', '', '', '', '']);
    }
  });
  jWriteTaxAggBody_(jGetTaxMonthlySheet_(), monthOut, 8);

  // 日次合計: 1日1行
  var dayOut = [];
  var dayKeys = Object.keys(byDay).sort().reverse();
  dayKeys.forEach(function (d) {
    dayOut.push([d, jWeekdayJaFromYmd_(d)].concat(metrics_(byDay[d])));
  });
  jWriteTaxAggBody_(jGetTaxDailySheet_(), dayOut, 7);

  // 日次×銘柄: 同じ日の銘柄を連続表示（空行で区切り）
  var dayAssetOut = [];
  var emptyDayAsset = ['', '', '', '', '', '', '', ''];
  dayKeys.forEach(function (d, idx) {
    var wd = jWeekdayJaFromYmd_(d);
    Object.keys(byAssetDay)
      .filter(function (k) {
        return k.indexOf(d + '\t') === 0;
      })
      .sort()
      .forEach(function (k) {
        var parts = k.split('\t');
        dayAssetOut.push([d, wd, parts[1]].concat(metrics_(byAssetDay[k])));
      });
    if (idx < dayKeys.length - 1) {
      dayAssetOut.push(emptyDayAsset);
    }
  });
  jWriteTaxAggBody_(jGetTaxDailyAssetSheet_(), dayAssetOut, 8);

  jLog_(
    '税務集計更新: 年' +
      Object.keys(byYear).length +
      ' 月' +
      Object.keys(byMonth).length +
      ' 日' +
      Object.keys(byDay).length
  );
  return true;
}

/** 同期 → 移動平均税務明細 → 集計 を一括 */
function jSyncApiTradeAndTax_(opts) {
  opts = opts || {};
  var sync = jSyncTradeHistoryFromApi_(opts);
  if (sync.skippedDryRun) {
    return {
      added: 0,
      taxRows: 0,
      warnings: ['DRY_RUN=true のため API 同期はスキップ（force=true で強制可）'],
      skippedDryRun: true,
    };
  }
  var rebuild = { taxRows: 0, warnings: [] };
  if (sync.added > 0 || opts.forceRebuild) {
    rebuild = jRebuildTaxDetailFromApi_();
    jRefreshTaxSummaryFromDetail_(J_SHEET_TAX_DETAIL);
  }
  return {
    added: sync.added,
    taxRows: rebuild.taxRows,
    warnings: rebuild.warnings,
    skippedDryRun: false,
  };
}
