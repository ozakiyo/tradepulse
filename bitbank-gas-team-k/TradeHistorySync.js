/**
 * TEAM-K — bitbank API 取引履歴同期・移動平均法 税務明細（申告用）
 */

var K_LAST_API_TRADE_MS_KEY = 'K_LAST_API_TRADE_MS';
var K_API_TRADE_SYNC_OVERLAP_MS = 3600000;
var K_TAX_DETAIL_DATA_ROW = 3;

function kFetchSpotTradeHistory_(opts) {
  opts = opts || {};
  var parts = [];
  if (opts.pair) parts.push('pair=' + encodeURIComponent(opts.pair));
  if (opts.count) parts.push('count=' + opts.count);
  if (opts.order_id) parts.push('order_id=' + opts.order_id);
  if (opts.since != null) parts.push('since=' + opts.since);
  if (opts.end != null) parts.push('end=' + opts.end);
  parts.push('order=' + (opts.order || 'asc'));
  var data = kPrivateRequest_('get', '/user/spot/trade_history', parts.join('&'), null);
  return data.trades || [];
}

/** since 以降の約定を最大 maxPages×1000 件まで取得 */
function kFetchSpotTradesSince_(sinceMs, maxPages) {
  sinceMs = sinceMs || 0;
  maxPages = maxPages || 20;
  var all = [];
  var cursor = sinceMs;
  for (var page = 0; page < maxPages; page++) {
    var batch = kFetchSpotTradeHistory_({ since: cursor, count: 1000, order: 'asc' });
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

function kEnsureApiTradeSheetHeader_(sheet) {
  if (!sheet) return;
  if (sheet.getLastRow() >= 1 && String(sheet.getRange(1, 1).getValue()) === '約定ID') return;
  sheet.clear();
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
}

function kGetApiTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(K_SHEET_TRADE);
  }
  kEnsureApiTradeSheetHeader_(sheet);
  return sheet;
}

function kGetTaxDetailSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_TAX_DETAIL);
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
    sheet = ss.insertSheet(K_SHEET_TAX_DETAIL);
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
function kGetOwnOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_OWN_ORDERS);
  if (!sheet) {
    sheet = ss.insertSheet(K_SHEET_OWN_ORDERS);
    sheet.appendRow(['注文ID', '銘柄', '売買', '記録日時']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 本番発注した order_id を台帳へ記録（同一口座での分離用） */
function kRecordOwnOrderId_(orderId, pair, side) {
  if (orderId == null || orderId === '') return;
  var idStr = String(orderId);
  if (idStr.indexOf('dry-') === 0) return;
  try {
    kGetOwnOrdersSheet_().appendRow([
      idStr,
      pair || '',
      side || '',
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ]);
  } catch (e) {
    kLog_('自注文ID記録失敗: ' + (e.message || e));
  }
}

/** 台帳の自注文IDを集合で読込 */
function kLoadOwnOrderIds_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_OWN_ORDERS);
  var ids = {};
  if (!sheet || sheet.getLastRow() < 2) return ids;
  var col = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  col.forEach(function (r) {
    if (r[0] != null && r[0] !== '') ids[String(r[0])] = true;
  });
  return ids;
}

function kLoadKnownTradeIds_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(K_SHEET_TRADE);
  var ids = {};
  if (!sheet || sheet.getLastRow() < 2) return ids;
  if (String(sheet.getRange(1, 1).getValue()) !== '約定ID') return ids;
  var col = sheet.getRange(2, 1, sheet.getLastRow(), 1).getValues();
  col.forEach(function (r) {
    if (r[0] != null && r[0] !== '') ids[String(r[0])] = true;
  });
  return ids;
}

function kFormatApiTradeRow_(trade) {
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
 * API から新規約定を K_売買履歴 へ追記
 * @return {{ added: number, total: number, skippedDryRun: boolean, initialized?: boolean }}
 */
function kSyncTradeHistoryFromApi_(opts) {
  opts = opts || {};
  var cfg = kGetConfig_();
  if (cfg.dryRun && !opts.force) {
    return { added: 0, total: 0, skippedDryRun: true };
  }

  kGetApiTradeSheet_();
  var props = PropertiesService.getScriptProperties();
  var sinceMs = opts.sinceMs != null ? opts.sinceMs : null;
  if (sinceMs == null) {
    var raw = props.getProperty(K_LAST_API_TRADE_MS_KEY);
    if (!raw) {
      var now = Date.now();
      props.setProperty(K_LAST_API_TRADE_MS_KEY, String(now));
      kLog_('取引履歴同期: 初回のため過去分はスキップ（以降のみ記録）');
      return { added: 0, total: 0, skippedDryRun: false, initialized: true };
    }
    sinceMs = Math.max(0, Number(raw) - K_API_TRADE_SYNC_OVERLAP_MS);
  }

  var trades = kFetchSpotTradesSince_(sinceMs, opts.maxPages || 5);
  if (!trades.length) {
    return { added: 0, total: 0, skippedDryRun: false, initialized: false };
  }

  var known = kLoadKnownTradeIds_();
  var sheet = kGetApiTradeSheet_();
  var rows = [];
  var maxExecuted = sinceMs;
  // 同一口座で他Bot/手動の約定を除外: 自注文IDに一致する約定のみ取込
  var ownOnly = !!cfg.ownOrdersOnly;
  var owned = ownOnly ? kLoadOwnOrderIds_() : null;
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
    rows.push(kFormatApiTradeRow_(t));
  });
  if (ownOnly && skippedForeign) {
    kLog_('自注文フィルタ: 他Bot/手動 ' + skippedForeign + '件を除外');
  }

  if (rows.length) {
    var start = sheet.getLastRow() + 1;
    sheet.getRange(start, 1, start + rows.length - 1, 11).setValues(rows);
    kLog_('API取引履歴 +' + rows.length + '件（since=' + sinceMs + '）');
  }

  if (maxExecuted > sinceMs) {
    props.setProperty(K_LAST_API_TRADE_MS_KEY, String(maxExecuted));
  }

  return { added: rows.length, total: trades.length, skippedDryRun: false };
}

function kParseTradeTimeMs_(cell) {
  if (cell == null || cell === '') return 0;
  if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) {
    return cell.getTime();
  }
  if (typeof cell === 'number' && isFinite(cell)) {
    if (cell > 100000000000) return Math.floor(cell);
    if (cell > 1000000000) return Math.floor(cell * 1000);
    return Math.floor((cell - 25569) * 86400000);
  }
  var s = String(cell).trim();
  if (!s) return 0;
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

function kReadApiTradeRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(K_SHEET_TRADE);
  if (!sheet || sheet.getLastRow() < 2) return [];
  if (String(sheet.getRange(1, 1).getValue()) !== '約定ID') return [];
  var n = sheet.getLastRow() - 1;
  var values = sheet.getRange(2, 1, n, 11).getValues();
  var out = [];
  values.forEach(function (r) {
    if (!r[0]) return;
    out.push({
      trade_id: String(r[0]),
      executed_at: kParseTradeTimeMs_(r[1]),
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

function kPairToAsset_(pair) {
  var inst = kGetInstrument_(pair);
  if (inst && inst.asset) return inst.asset;
  return String(pair || '').split('_')[0];
}

/**
 * 移動平均法で譲渡損益行を生成（銘柄＝暗号資産単位）
 * 買い: 簿価合計・数量を更新し平均単価を再計算（買手数料を簿価に算入）
 * 売り: 売却時点の平均単価×数量を取得価額とし、売手数料を売却価額から控除
 */
function kMovingAverageMatchTaxRows_(trades) {
  var books = {};
  var taxRows = [];
  var warnings = [];

  trades.forEach(function (t) {
    var asset = kPairToAsset_(t.pair);
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
      warnings.push(
        asset +
          ' 未売却残 ' +
          b.qty +
          '（移動平均単価≈' +
          (b.qty > 0 ? (b.costExFee + b.fees) / b.qty : 0) +
          '）'
      );
    }
  });

  return { taxRows: taxRows, warnings: warnings };
}

/** @deprecated 互換: 移動平均法へ委譲 */
function kFifoMatchTaxRows_(trades) {
  return kMovingAverageMatchTaxRows_(trades);
}

/** K_売買履歴 から K_税務明細 を移動平均法で再生成 */
function kRebuildTaxDetailFromApi_() {
  kGetTaxDetailSheet_();
  var trades = kReadApiTradeRows_();
  var sheet = kGetTaxDetailSheet_();
  if (sheet.getLastRow() >= K_TAX_DETAIL_DATA_ROW) {
    sheet.deleteRows(K_TAX_DETAIL_DATA_ROW, sheet.getLastRow() - K_TAX_DETAIL_DATA_ROW + 1);
  }
  if (!trades.length) {
    return { taxRows: 0, warnings: ['取引履歴が空です'] };
  }

  var result = kMovingAverageMatchTaxRows_(trades);
  if (result.taxRows.length) {
    sheet
      .getRange(K_TAX_DETAIL_DATA_ROW, 1, K_TAX_DETAIL_DATA_ROW + result.taxRows.length - 1, 17)
      .setValues(result.taxRows);
  }
  kLog_('税務明細 移動平均再計算: ' + result.taxRows.length + '行');
  return { taxRows: result.taxRows.length, warnings: result.warnings };
}

/** K_税務明細（API実績）から K_税務集計 を再計算 */
function kRefreshTaxSummaryFromDetail_(detailSheetName) {
  kGetTaxSummarySheet_();
  var detail = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(detailSheetName);
  if (!detail || detail.getLastRow() < K_TAX_DETAIL_DATA_ROW) {
    return false;
  }

  var rows = detail.getRange(K_TAX_DETAIL_DATA_ROW, 1, detail.getLastRow(), 15).getValues();
  var byYear = {};
  var byMonth = {};
  var byAssetYear = {};

  rows.forEach(function (r) {
    if (!r[0]) return;
    var dateStr = String(r[0] || '');
    var asset = String(r[4] || '');
    var buyCost = Number(r[8]) || 0;
    var sellProceeds = Number(r[9]) || 0;
    var feeBuy = Number(r[10]) || 0;
    var feeSell = Number(r[11]) || 0;
    var profit = Number(r[12]) || 0;
    var year = dateStr.length >= 4 ? dateStr.slice(0, 4) : '不明';
    var month = dateStr.length >= 7 ? dateStr.slice(0, 7) : year;

    function bump_(map, key) {
      if (!map[key]) {
        map[key] = { count: 0, buyCost: 0, sellProceeds: 0, fee: 0, profit: 0, asset: asset };
      }
      map[key].count += 1;
      map[key].buyCost += buyCost;
      map[key].sellProceeds += sellProceeds;
      map[key].fee += feeBuy + feeSell;
      map[key].profit += profit;
    }

    bump_(byYear, year);
    bump_(byMonth, month);
    bump_(byAssetYear, year + '\t' + asset);
  });

  var summary = kGetTaxSummarySheet_();
  if (summary.getLastRow() > 2) {
    summary.deleteRows(3, summary.getLastRow() - 2);
  }

  var out = [];

  Object.keys(byYear)
    .sort()
    .forEach(function (y) {
      var a = byYear[y];
      out.push([
        '年次',
        y,
        '',
        '(全銘柄)',
        a.count,
        Math.round(a.buyCost),
        Math.round(a.sellProceeds),
        Math.round(a.fee),
        Math.round(a.profit),
        '確定申告用 年間譲渡損益合計（bitbank API実績）',
      ]);
    });

  Object.keys(byMonth)
    .sort()
    .forEach(function (m) {
      var a = byMonth[m];
      var parts = m.split('-');
      out.push([
        '月次',
        parts[0] || '',
        parts[1] || '',
        '(全銘柄)',
        a.count,
        Math.round(a.buyCost),
        Math.round(a.sellProceeds),
        Math.round(a.fee),
        Math.round(a.profit),
        'bitbank API実績',
      ]);
    });

  Object.keys(byAssetYear)
    .sort()
    .forEach(function (k) {
      var parts = k.split('\t');
      var a = byAssetYear[k];
      out.push([
        '年次×銘柄',
        parts[0],
        '',
        parts[1],
        a.count,
        Math.round(a.buyCost),
        Math.round(a.sellProceeds),
        Math.round(a.fee),
        Math.round(a.profit),
        'bitbank API実績',
      ]);
    });

  if (out.length) {
    summary.getRange(3, 1, 2 + out.length, 10).setValues(out);
  }

  kLog_('税務集計更新(API実績): 年' + Object.keys(byYear).length);
  return true;
}

/** 同期 → 移動平均税務明細 → 集計 を一括 */
function kSyncApiTradeAndTax_(opts) {
  opts = opts || {};
  var sync = kSyncTradeHistoryFromApi_(opts);
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
    rebuild = kRebuildTaxDetailFromApi_();
    kRefreshTaxSummaryFromDetail_(K_SHEET_TAX_DETAIL);
  }
  return {
    added: sync.added,
    taxRows: rebuild.taxRows,
    warnings: rebuild.warnings,
    skippedDryRun: false,
    initialized: sync.initialized,
  };
}
