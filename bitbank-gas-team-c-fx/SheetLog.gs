var C3F_SHEET_LOG = 'C3F_運用ログ';
var C3F_SHEET_TRADE = 'C3F_売買履歴';

function c3fGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(C3F_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(C3F_SHEET_LOG);
    sheet.appendRow([
      '日時',
      'USD/JPY',
      'モード',
      'P&F信号',
      '箱',
      'ATR%',
      '列数',
      'JPY残高',
      'USD残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function c3fGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(C3F_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(C3F_SHEET_TRADE);
    sheet.appendRow(['日時', '売買', '価格', '数量(USD)', '約定', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function c3fGetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('C3F_週次レポート');
  if (!sheet) { sheet = ss.insertSheet('C3F_週次レポート'); }
  return sheet;
}

function c3fInitSheets_() {
  c3fGetLogSheet_();
  c3fGetTradeSheet_();
  c3fGetReportSheet_();
}

function c3fAppendRunLog_(ticker, assets, state, pf) {
  c3fGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ticker.last,
    state.mode || '',
    pf.signal || '',
    pf.boxSize || '',
    pf.atrPct != null ? pf.atrPct : '',
    pf.columnCount || '',
    Math.round(assets.jpy),
    assets.usd,
    pf.note || '',
  ]);
}

function c3fAppendTradeLog_(side, price, amount, note) {
  c3fGetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    'PAPER',
    note || '',
  ]);
}
