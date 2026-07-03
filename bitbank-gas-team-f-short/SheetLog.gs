/**
 * チームF: スプレッドシートログ（マルチ銘柄統合シート）
 */
var F6_SHEET_LOG = 'F6_運用ログ';
var F6_SHEET_TRADE = 'F6_売買履歴';

function f6GetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(F6_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(F6_SHEET_LOG);
    sheet.appendRow([
      '日時',
      '銘柄',
      '価格',
      'モード',
      '日足トレンド',
      'シグナル',
      'TL値',
      'SL値',
      'JPY残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function f6GetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(F6_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(F6_SHEET_TRADE);
    sheet.appendRow(['日時', '銘柄', '売買', '価格', '数量', '約定', 'メモ']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function f6GetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('F6_日次レポート');
  if (!sheet) {
    sheet = ss.insertSheet('F6_日次レポート');
  }
  return sheet;
}

function f6InitSheets_() {
  f6GetLogSheet_();
  f6GetTradeSheet_();
  f6GetReportSheet_();
}

function f6AppendRunLog_(ticker, assets, state, dailyResult, trendResult) {
  var inst = f6_ctx.inst || {};
  f6GetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label || f6_ctx.symbol || '',
    ticker.last,
    state.mode || '',
    dailyResult.trend || '',
    trendResult.signal || '',
    trendResult.trendlineValue || '',
    state.stopLoss || '',
    Math.round(assets.jpy),
    (dailyResult.note || '') + ' | ' + (trendResult.note || ''),
  ]);
}

function f6AppendTradeLog_(side, price, amount, note) {
  var inst = f6_ctx.inst || {};
  f6GetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label || f6_ctx.symbol || '',
    side,
    price,
    amount + ' ' + (inst.posUnit || ''),
    'PAPER',
    note || '',
  ]);
}
