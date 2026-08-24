/**
 * Team-M 専用スプレッドシート — 法人帳票（税務）と運用損益を分離
 * Team-K/L のブックとは別プロジェクト・別シートで運用する。
 */

var M_SHEET_LOG = 'M_運用ログ';
var M_SHEET_LOT_PROFIT = 'M_運用損益';
var M_SHEET_LOT_YEAR = 'M_運用損益年次';
var M_SHEET_LOT_MONTH_PREFIX = 'M_運用損益月次_';
var M_SHEET_LOT_DAY_PREFIX = 'M_運用損益日次_';
var M_SHEET_TRADE = 'M_売買履歴';
var M_SHEET_OPEN_LOTS = 'M_オープンロット';
var M_SHEET_CRASH_RULES = 'M_急落判定基準';
var M_SHEET_CRASH_RULE_HIST = 'M_急落判定変更履歴';
var M_SHEET_TAX_DETAIL = 'M_税務明細';
var M_SHEET_TAX_SUMMARY = 'M_税務集計';
var M_SHEET_TAX_MONTHLY = 'M_税務月次';
var M_SHEET_TAX_DAILY = 'M_税務日次';
var M_SHEET_TAX_DAILY_ASSET = 'M_税務日次銘柄';
var M_SHEET_OWN_ORDERS = 'M_自注文ID';
var M_SHEET_GUIDE = 'M_法人申告ガイド';
var M_SHEET_METHOD = 'M_手法説明';
var M_SHEET_METHOD_REV = 'M_手法改修履歴';
var M_SHEET_BUY_RANK = 'M_買いランキング';
var M_SHEET_PAIR_STATUS = 'M_ペア状態';
var M_SHEET_ASSET_STR = 'M_銘柄強弱';
var M_SHEET_PNL_DAY = 'M_損益日次';
var M_SHEET_PNL_MONTH = 'M_損益月次';
var M_SHEET_PNL_YEAR = 'M_損益年次';
var M_TAX_DETAIL_DATA_ROW = 3;

var M_TAX_METRICS_HEADERS_ = [
  '取引回数',
  '取得価額合計(円)',
  '売却価額合計(円)',
  '手数料合計(円)',
  '譲渡損益合計(円)',
];

var M_LOT_METRICS_HEADERS_ = [
  '利確回数',
  '買代金合計(円)',
  '売代金合計(円)',
  '手数料合計(円)',
  '粗利合計(円)',
  '純損益合計(円)',
];

function mParseTradeTimeMs_(cell) {
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

function mWeekdayJaFromYmd_(ymd) {
  var p = String(ymd || '').split('-');
  if (p.length < 3) return '';
  var t = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 3, 0, 0);
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(t).getUTCDay()] || '';
}

function mEnsureAggSheet_(name, headers, note) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    if (sheet.getFilter()) sheet.getFilter().remove();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  sheet.getRange(1, 1).setNote(note || '');
  return sheet;
}

/** ヘッダ行を残して本文をクリア（deleteRows は固定行絡みで失敗するため使わない） */
function mClearSheetBodyKeepHeader_(sheet, headerRows, numCols) {
  headerRows = headerRows != null ? headerRows : 1;
  if (!sheet) return 0;
  try {
    if (sheet.getFilter()) sheet.getFilter().remove();
  } catch (eFilter) {
    /* ignore */
  }
  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRows) return 0;
  var lastCol = Math.max(numCols || 0, sheet.getLastColumn(), 1);
  var numRows = lastRow - headerRows;
  var startRow = headerRows + 1;
  sheet.getRange(startRow, 1, numRows, lastCol).clearContent();
  return numRows;
}

function mClearAggBody_(sheet) {
  mClearSheetBodyKeepHeader_(sheet, 1);
}

function mWriteAggBody_(sheet, rows, cols) {
  mClearAggBody_(sheet);
  if (rows && rows.length) {
    sheet.getRange(2, 1, rows.length, cols).setValues(rows);
    sheet.getRange(1, 1, rows.length + 1, cols).createFilter();
  }
}

function mMovingAverageMatchTaxRows_(trades) {
  var books = {};
  var taxRows = [];
  trades.forEach(function (t) {
    var asset = String(t.pair || 'multi_pair').split('_')[0];
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
      var buyCostRaw = avgUnit * take;
      var sellFeePart = sellAmtTotal > 0 ? (sellFeeTotal * take) / sellAmtTotal : 0;
      var sellProceedsRaw = (Number(t.price) || 0) * take - sellFeePart;
      var buyCost = Math.round(buyCostRaw);
      var sellProceeds = Math.round(sellProceedsRaw);
      var profit = Math.round(sellProceedsRaw - buyCostRaw);
      var at = new Date(t.executed_at);
      if (isNaN(at.getTime())) at = new Date();
      taxRows.push([
        Utilities.formatDate(at, 'Asia/Tokyo', 'yyyy-MM-dd'),
        Utilities.formatDate(at, 'Asia/Tokyo', 'HH:mm:ss'),
        'bitbank',
        t.pair,
        asset,
        take,
        Math.round(avgUnit * 1e8) / 1e8,
        Number(t.price) || 0,
        buyCost,
        sellProceeds,
        Math.round(buyFeePart * 10000) / 10000,
        Math.round(sellFeePart * 10000) / 10000,
        profit,
        'API実績移動平均',
        'Team-M専用ブック',
        t.trade_id,
        book.lastBuyId,
      ]);
      var remRatio = 1 - ratio;
      book.qty -= take;
      book.costExFee *= remRatio;
      book.fees *= remRatio;
      sellLeft -= take;
    }
  });
  return { taxRows: taxRows, warnings: [] };
}

function mEnsureGuideSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(M_SHEET_GUIDE);
  if (!sheet) sheet = ss.insertSheet(M_SHEET_GUIDE, 0);
  sheet.clear();
  var lines = [
    ['Team-M（Bitbank現物・買い専用スイング）法人帳票ガイド — Team-K / Team-L とは別ブック'],
    [''],
    ['【申告の正本（税理士提出用）】'],
    ['M_税務明細 … 移動平均法の譲渡損益明細'],
    ['M_税務集計 / M_税務月次 / M_税務日次 / M_税務日次銘柄'],
    ['M_売買履歴 … 約定の生データ（税務明細の入力元）'],
    [''],
    ['【運用成績（申告に使わない）】'],
    ['M_運用損益 … Bot建玉の決済成績'],
    ['M_運用損益年次 / 月次_年 / 日次_年月 / M_オープンロット'],
    ['M_損益日次・月次・年次 … 運用PnLの簡易集計'],
    [''],
    ['【選定・手法（申告に使わない）】'],
    ['M_ペア状態 / M_買いランキング / M_銘柄強弱'],
    ['M_手法説明 / M_手法改修履歴'],
    [''],
    ['【他チーム】'],
    ['Team-K（グリッド）・Team-L（Saxo個人）は別スプレッドシート。このブックには入れない。'],
    [''],
    ['【データ投入】'],
    ['Node 自動同期（SHEETS_WEBAPP_URL）→ 必要時「税務明細を再計算」→「税務集計を更新」'],
  ];
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sheet.setColumnWidth(1, 720);
  return sheet;
}

function mEnsureHeaderSheet_(name, headers, note, opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    if (opts.noteRow2) sheet.appendRow([opts.noteRow2]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    if (opts.noteRow2) {
      if (sheet.getLastRow() < 2) sheet.appendRow([opts.noteRow2]);
      else sheet.getRange(2, 1).setValue(opts.noteRow2);
    }
  }
  if (note) sheet.getRange(1, 1).setNote(note);
  if (opts.bg) sheet.getRange(1, 1, 1, headers.length).setBackground(opts.bg);
  return sheet;
}

function mGetLogSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_LOG,
    ['日時', '銘柄', 'モード', '現値', '間隔', '本数', 'JPY', 'コイン', '詳細'],
    'Team-M 運用ログ（申告用ではない）',
    { bg: '#e8f5e9' }
  );
}

function mGetLotProfitSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_LOT_PROFIT,
    [
      '決済日時',
      '銘柄',
      '買値',
      '売値',
      '数量',
      '買代金(円)',
      '売代金(円)',
      '買手数料(円)',
      '売手数料(円)',
      '粗利(円)',
      '純損益(円)',
      '手数料前提',
      '買注文ID',
      '売注文ID',
      'trapStep',
      'feeWidth',
      'slipWidth',
      'メモ',
    ],
    '【税務申告には使わない】Botロット成績。申告正本は M_税務明細。',
    { bg: '#fff3e0' }
  );
}

function mGetTradeSheet_() {
  var sheet = mEnsureHeaderSheet_(
    M_SHEET_TRADE,
    [
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
      'セット換算',
    ],
    'Team-M 約定。税務明細の入力元。',
    { bg: '#e3f2fd' }
  );
  sheet.getRange('B:B').setNumberFormat('@');
  return sheet;
}

function mGetOpenLotsSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_OPEN_LOTS,
    [
      '建玉時刻',
      '銘柄',
      '売買',
      '数量',
      '建値',
      'ハードSL',
      '買注文ID',
      'ID',
      'メモ',
      '現値',
      '含み損益(円)',
      '含み%',
      '評価時刻',
    ],
    '【税務申告には使わない】Team-M ボット建玉のみ。含みは同期時点の現値。最小ロットは円額がごく小さいので含み%を見る。',
    { bg: '#fffde7' }
  );
}

function mGetCrashRulesSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_CRASH_RULES,
    ['区分', '基準名', '現在値', '説明', '最終更新日時(UTC)'],
    '【税務申告には使わない】急落STOP／再開の現在基準（Bot同期）',
    { bg: '#e8eaf6' }
  );
}

function mGetCrashRuleHistorySheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_CRASH_RULE_HIST,
    ['変更日時(JST)', '更新元', '理由', '変更内容'],
    '【税務申告には使わない】急落判定パラメータの変更履歴（Bot同期）',
    { bg: '#f3e5f5' }
  );
}

function mGetTaxDetailSheet_() {
  var noteRow2 =
    '【申告用・正本・法人】移動平均法。M_運用損益は使わない。Team-M専用ブック。';
  return mEnsureHeaderSheet_(
    M_SHEET_TAX_DETAIL,
    [
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
    ],
    noteRow2,
    { noteRow2: noteRow2, bg: '#fce4ec' }
  );
}

function mGetOwnOrdersSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_OWN_ORDERS,
    ['注文ID', '銘柄', '売買', '記録日時'],
    'Team-M 発注 order_id',
    { bg: '#f3e5f5' }
  );
}

function mGetTaxSummarySheet_() {
  return mEnsureAggSheet_(
    M_SHEET_TAX_SUMMARY,
    ['年', '暗号資産'].concat(M_TAX_METRICS_HEADERS_),
    '※ 年次。メニュー「税務集計を更新」。Team-K/Lブックとは別'
  );
}

function mGetTaxMonthlySheet_() {
  return mEnsureAggSheet_(
    M_SHEET_TAX_MONTHLY,
    ['年', '月', '暗号資産'].concat(M_TAX_METRICS_HEADERS_),
    '※ 月次'
  );
}

function mGetTaxDailySheet_() {
  return mEnsureAggSheet_(
    M_SHEET_TAX_DAILY,
    ['年月日', '曜日'].concat(M_TAX_METRICS_HEADERS_),
    '※ 日次合計'
  );
}

function mGetTaxDailyAssetSheet_() {
  return mEnsureAggSheet_(
    M_SHEET_TAX_DAILY_ASSET,
    ['年月日', '曜日', '暗号資産'].concat(M_TAX_METRICS_HEADERS_),
    '※ 日次×銘柄'
  );
}

function mGetAssetStrSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_ASSET_STR,
    ['順位', '銘柄', '強弱', 'スコア', '件数', '日足上', '日足下', '更新時刻'],
    '【税務申告には使わない】*_jpy 基軸の強弱。再計算は12時間ごと',
    { bg: '#e0f7fa' }
  );
}

function mGetBuyRankSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_BUY_RANK,
    [
      '順位',
      '銘柄',
      '売買',
      'レジーム',
      '日足方向',
      '4H方向',
      'スコア',
      '最小ロット',
      '理由',
      '更新時刻',
    ],
    '【税務申告には使わない】1D+4Hアップの買い候補順位',
    { bg: '#e8f5e9' }
  );
}

function mGetPairStatusSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_PAIR_STATUS,
    [
      '銘柄',
      '状態',
      '売買',
      'レジーム',
      '日足方向',
      '日足レジーム',
      '4H方向',
      '4Hレジーム',
      'スコア',
      '建玉',
      '理由',
      '更新時刻',
    ],
    '【税務申告には使わない】ユニバース全ペア状態',
    { bg: '#f1f8e9' }
  );
}

function mGetMethodSheet_() {
  return mEnsureHeaderSheet_(M_SHEET_METHOD, ['項目', '内容'], '【税務申告には使わない】', {
    bg: '#fafafa',
  });
}

function mGetMethodRevSheet_() {
  return mEnsureHeaderSheet_(
    M_SHEET_METHOD_REV,
    ['変更時刻', '提供者', '要約', 'ロジックJSON'],
    '【税務申告には使わない】',
    { bg: '#fafafa' }
  );
}

function mGetPnlDaySheet_() {
  return mEnsureAggSheet_(M_SHEET_PNL_DAY, ['日付(JST)', '損益合計(JPY)', '備考'], '※ 運用PnL。申告正本ではない');
}
function mGetPnlMonthSheet_() {
  return mEnsureAggSheet_(M_SHEET_PNL_MONTH, ['月(JST)', '損益合計(JPY)', '備考'], '※ 運用PnL。申告正本ではない');
}
function mGetPnlYearSheet_() {
  return mEnsureAggSheet_(M_SHEET_PNL_YEAR, ['年(JST)', '損益合計(JPY)', '備考'], '※ 運用PnL。申告正本ではない');
}

function mIsLedgerSheetName_(name) {
  var n = String(name || '');
  if (
    n === M_SHEET_LOG ||
    n === M_SHEET_LOT_PROFIT ||
    n === M_SHEET_LOT_YEAR ||
    n === M_SHEET_TRADE ||
    n === M_SHEET_OPEN_LOTS ||
    n === M_SHEET_CRASH_RULES ||
    n === M_SHEET_CRASH_RULE_HIST ||
    n === M_SHEET_TAX_DETAIL ||
    n === M_SHEET_TAX_SUMMARY ||
    n === M_SHEET_TAX_MONTHLY ||
    n === M_SHEET_TAX_DAILY ||
    n === M_SHEET_TAX_DAILY_ASSET ||
    n === M_SHEET_OWN_ORDERS ||
    n === M_SHEET_GUIDE ||
    n === M_SHEET_METHOD ||
    n === M_SHEET_METHOD_REV ||
    n === M_SHEET_BUY_RANK ||
    n === M_SHEET_PAIR_STATUS ||
    n === M_SHEET_ASSET_STR ||
    n === M_SHEET_PNL_DAY ||
    n === M_SHEET_PNL_MONTH ||
    n === M_SHEET_PNL_YEAR
  ) {
    return true;
  }
  return (
    n.indexOf(M_SHEET_LOT_MONTH_PREFIX) === 0 ||
    n.indexOf(M_SHEET_LOT_DAY_PREFIX) === 0
  );
}

/** 帳票以外の旧シートを削除（少なくとも1枚は残す） */
function mPurgeNonLedgerSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var victims = [];
  for (var i = 0; i < sheets.length; i++) {
    if (!mIsLedgerSheetName_(sheets[i].getName())) victims.push(sheets[i]);
  }
  if (!victims.length) return 0;

  var hasLedger = false;
  for (var j = 0; j < sheets.length; j++) {
    if (mIsLedgerSheetName_(sheets[j].getName())) {
      hasLedger = true;
      break;
    }
  }
  if (!hasLedger) mEnsureGuideSheet_();

  var removed = 0;
  for (var k = 0; k < victims.length; k++) {
    if (ss.getSheets().length <= 1) break;
    ss.deleteSheet(victims[k]);
    removed++;
  }
  return removed;
}

function mEnsureAllSheets_() {
  mPurgeNonLedgerSheets_();
  mEnsureGuideSheet_();
  mGetLogSheet_();
  mGetLotProfitSheet_();
  mGetTradeSheet_();
  mGetOpenLotsSheet_();
  mGetCrashRulesSheet_();
  mGetCrashRuleHistorySheet_();
  mGetTaxDetailSheet_();
  mGetOwnOrdersSheet_();
  mGetTaxSummarySheet_();
  mGetTaxMonthlySheet_();
  mGetTaxDailySheet_();
  mGetTaxDailyAssetSheet_();
  mGetMethodSheet_();
  mGetMethodRevSheet_();
  mGetBuyRankSheet_();
  mGetPairStatusSheet_();
  mGetAssetStrSheet_();
  mGetPnlDaySheet_();
  mGetPnlMonthSheet_();
  mGetPnlYearSheet_();
  mEnsureAggSheet_(
    M_SHEET_LOT_YEAR,
    ['年', '銘柄'].concat(M_LOT_METRICS_HEADERS_),
    '※ Bot運用損益年次。税務申告には使わない'
  );
  return true;
}

function mInitSheetsMenu() {
  mEnsureAllSheets_();
  SpreadsheetApp.getUi().alert(
    'Team-M 帳票シートを用意しました（Team-K / Team-L とは別ブック）\n\n' +
      '【申告正本】M_税務明細 / 集計 / 月次 / 日次 / 日次銘柄 / 売買履歴\n' +
      '【運用】M_運用損益* / オープン / ランキング / ペア状態（申告に使わない）'
  );
}

function mRefreshTaxSummaryFromDetail_() {
  mGetTaxSummarySheet_();
  mGetTaxMonthlySheet_();
  mGetTaxDailySheet_();
  mGetTaxDailyAssetSheet_();
  var detail = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(M_SHEET_TAX_DETAIL);
  if (!detail || detail.getLastRow() < M_TAX_DETAIL_DATA_ROW) return false;

  var rows = detail
    .getRange(M_TAX_DETAIL_DATA_ROW, 1, detail.getLastRow() - M_TAX_DETAIL_DATA_ROW + 1, 15)
    .getValues();
  var byYear = {};
  var byMonth = {};
  var byDay = {};
  var byAssetYear = {};
  var byAssetMonth = {};
  var byAssetDay = {};

  function bump_(map, key, buyCost, sellProceeds, fee, profit) {
    if (!map[key]) map[key] = { count: 0, buyCost: 0, sellProceeds: 0, fee: 0, profit: 0 };
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
    var ms = mParseTradeTimeMs_(r[0]);
    var ymd =
      ms > 0 ? Utilities.formatDate(new Date(ms), 'Asia/Tokyo', 'yyyy-MM-dd') : String(r[0]);
    if (ymd.indexOf(' ') >= 0) ymd = ymd.split(' ')[0];
    var year = ymd.length >= 4 ? ymd.slice(0, 4) : '不明';
    var month = ymd.length >= 7 ? ymd.slice(0, 7) : year;
    var asset = String(r[4] || 'btc');
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
  mWriteAggBody_(mGetTaxSummarySheet_(), yearOut, 7);

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
    if (idx < monthKeys.length - 1) monthOut.push(['', '', '', '', '', '', '', '']);
  });
  mWriteAggBody_(mGetTaxMonthlySheet_(), monthOut, 8);

  var dayOut = [];
  var dayKeys = Object.keys(byDay).sort().reverse();
  dayKeys.forEach(function (d) {
    dayOut.push([d, mWeekdayJaFromYmd_(d)].concat(metrics_(byDay[d])));
  });
  mWriteAggBody_(mGetTaxDailySheet_(), dayOut, 7);

  var dayAssetOut = [];
  dayKeys.forEach(function (d, idx) {
    var wd = mWeekdayJaFromYmd_(d);
    Object.keys(byAssetDay)
      .filter(function (k) {
        return k.indexOf(d + '\t') === 0;
      })
      .sort()
      .forEach(function (k) {
        var parts = k.split('\t');
        dayAssetOut.push([d, wd, parts[1]].concat(metrics_(byAssetDay[k])));
      });
    if (idx < dayKeys.length - 1) dayAssetOut.push(['', '', '', '', '', '', '', '']);
  });
  mWriteAggBody_(mGetTaxDailyAssetSheet_(), dayAssetOut, 8);
  return true;
}

function mRefreshTaxSummaryMenu() {
  mEnsureAllSheets_();
  if (!mRefreshTaxSummaryFromDetail_()) {
    SpreadsheetApp.getUi().alert('M_税務明細にデータがありません。CSV取込後に再計算してください。');
    return;
  }
  SpreadsheetApp.getUi().alert(
    '税務集計を更新しました（申告向け・Team-M専用ブック）\n\n※ M_運用損益は見ないでください'
  );
}

function mReadLotProfitAggRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(M_SHEET_LOT_PROFIT);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  var out = [];
  values.forEach(function (r) {
    if (!r[0]) return;
    var ms = mParseTradeTimeMs_(r[0]);
    var ymd =
      ms > 0
        ? Utilities.formatDate(new Date(ms), 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(r[0]).slice(0, 10);
    out.push({
      year: ymd.slice(0, 4),
      month: ymd.slice(0, 7),
      ymd: ymd,
      pair: String(r[1] || 'multi_pair'),
      buyNotional: Number(r[5]) || 0,
      sellNotional: Number(r[6]) || 0,
      fee: (Number(r[7]) || 0) + (Number(r[8]) || 0),
      gross: Number(r[9]) || 0,
      net: Number(r[10]) || 0,
    });
  });
  return out;
}

function mRefreshLotProfitSummary_() {
  mGetLotProfitSheet_();
  var rows = mReadLotProfitAggRows_();
  var byYear = {};
  var byYearPair = {};
  var byMonth = {};
  var byMonthPair = {};
  var byDay = {};
  var byDayPair = {};
  var years = {};
  var months = {};

  function bump(map, key, row) {
    if (!map[key]) map[key] = { count: 0, buy: 0, sell: 0, fee: 0, gross: 0, net: 0 };
    map[key].count += 1;
    map[key].buy += row.buyNotional;
    map[key].sell += row.sellNotional;
    map[key].fee += row.fee;
    map[key].gross += row.gross;
    map[key].net += row.net;
  }
  function arr(a) {
    return [
      a.count,
      Math.round(a.buy),
      Math.round(a.sell),
      Math.round(a.fee),
      Math.round(a.gross),
      Math.round(a.net),
    ];
  }

  rows.forEach(function (row) {
    years[row.year] = true;
    months[row.month] = true;
    bump(byYear, row.year, row);
    bump(byYearPair, row.year + '\t' + row.pair, row);
    bump(byMonth, row.month, row);
    bump(byMonthPair, row.month + '\t' + row.pair, row);
    bump(byDay, row.ymd, row);
    bump(byDayPair, row.ymd + '\t' + row.pair, row);
  });

  var yearSheet = mEnsureAggSheet_(
    M_SHEET_LOT_YEAR,
    ['年', '銘柄'].concat(M_LOT_METRICS_HEADERS_),
    '※ Bot運用損益年次。税務申告には使わない'
  );
  var yearOut = [];
  Object.keys(byYear)
    .sort()
    .forEach(function (y) {
      yearOut.push([y, '(全銘柄)'].concat(arr(byYear[y])));
      Object.keys(byYearPair)
        .filter(function (k) {
          return k.indexOf(y + '\t') === 0;
        })
        .sort()
        .forEach(function (k) {
          yearOut.push([y, k.split('\t')[1]].concat(arr(byYearPair[k])));
        });
    });
  mWriteAggBody_(yearSheet, yearOut, 8);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var keepMonth = {};
  var keepDay = {};
  Object.keys(years).forEach(function (y) {
    keepMonth[M_SHEET_LOT_MONTH_PREFIX + y] = true;
  });
  Object.keys(months).forEach(function (ym) {
    keepDay[M_SHEET_LOT_DAY_PREFIX + ym] = true;
  });
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (n.indexOf(M_SHEET_LOT_MONTH_PREFIX) === 0 && !keepMonth[n]) ss.deleteSheet(sh);
    else if (n.indexOf(M_SHEET_LOT_DAY_PREFIX) === 0 && !keepDay[n]) ss.deleteSheet(sh);
  });

  Object.keys(years)
    .sort()
    .forEach(function (y) {
      var mSheet = mEnsureAggSheet_(
        M_SHEET_LOT_MONTH_PREFIX + y,
        ['月', '銘柄'].concat(M_LOT_METRICS_HEADERS_),
        '※ ' + y + '年 月次（税務用ではない）'
      );
      var monthOut = [];
      Object.keys(byMonth)
        .filter(function (m) {
          return m.indexOf(y + '-') === 0;
        })
        .sort()
        .reverse()
        .forEach(function (m, idx, mKeys) {
          var mm = m.slice(5, 7);
          monthOut.push([mm, '(全銘柄)'].concat(arr(byMonth[m])));
          Object.keys(byMonthPair)
            .filter(function (k) {
              return k.indexOf(m + '\t') === 0;
            })
            .sort()
            .forEach(function (k) {
              monthOut.push([mm, k.split('\t')[1]].concat(arr(byMonthPair[k])));
            });
          if (idx < mKeys.length - 1) monthOut.push(['', '', '', '', '', '', '', '']);
        });
      mWriteAggBody_(mSheet, monthOut, 8);
    });

  Object.keys(months)
    .sort()
    .forEach(function (ym) {
      var dSheet = mEnsureAggSheet_(
        M_SHEET_LOT_DAY_PREFIX + ym,
        ['日', '銘柄'].concat(M_LOT_METRICS_HEADERS_),
        '※ ' + ym + ' 日次（税務用ではない）'
      );
      var dayOut = [];
      Object.keys(byDay)
        .filter(function (d) {
          return d.indexOf(ym + '-') === 0;
        })
        .sort()
        .reverse()
        .forEach(function (d, idx, dKeys) {
          var dd = d.slice(8, 10);
          dayOut.push([dd, '(全銘柄)'].concat(arr(byDay[d])));
          Object.keys(byDayPair)
            .filter(function (k) {
              return k.indexOf(d + '\t') === 0;
            })
            .sort()
            .forEach(function (k) {
              dayOut.push([dd, k.split('\t')[1]].concat(arr(byDayPair[k])));
            });
          if (idx < dKeys.length - 1) dayOut.push(['', '', '', '', '', '', '', '']);
        });
      mWriteAggBody_(dSheet, dayOut, 8);
    });

  return { rows: rows.length, years: Object.keys(years).length, months: Object.keys(months).length };
}

function mRefreshLotProfitSummaryMenu() {
  mEnsureAllSheets_();
  var r = mRefreshLotProfitSummary_();
  SpreadsheetApp.getUi().alert(
    '運用損益集計を更新しました（税務用ではありません）\n\n明細: ' +
      (r.rows || 0) +
      '\n※ 申告正本は M_税務明細 / M_税務集計'
  );
}

function mRebuildTaxDetailFromTradesMenu() {
  mEnsureAllSheets_();
  var tradeSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(M_SHEET_TRADE);
  if (!tradeSheet || tradeSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('M_売買履歴が空です');
    return;
  }
  var values = tradeSheet.getRange(2, 1, tradeSheet.getLastRow() - 1, 9).getValues();
  var trades = values
    .filter(function (r) {
      return r[0] != null && r[0] !== '';
    })
    .map(function (r) {
      return {
        trade_id: r[0],
        executed_at: mParseTradeTimeMs_(r[1]),
        pair: String(r[2] || 'multi_pair'),
        side: String(r[3] || '').toLowerCase(),
        price: Number(r[4]) || 0,
        amount: Number(r[5]) || 0,
        fee_quote: Number(r[6]) || 0,
        order_id: r[8],
      };
    })
    .sort(function (a, b) {
      return a.executed_at - b.executed_at;
    });

  var result = mMovingAverageMatchTaxRows_(trades);
  var sheet = mGetTaxDetailSheet_();
  mClearSheetBodyKeepHeader_(sheet, M_TAX_DETAIL_DATA_ROW - 1, 17);
  if (result.taxRows.length) {
    sheet.getRange(M_TAX_DETAIL_DATA_ROW, 1, result.taxRows.length, 17).setValues(result.taxRows);
  }
  mRefreshTaxSummaryFromDetail_();
  SpreadsheetApp.getUi().alert(
    'M_税務明細を再計算しました（法人・移動平均法）\n行数: ' + result.taxRows.length
  );
}
