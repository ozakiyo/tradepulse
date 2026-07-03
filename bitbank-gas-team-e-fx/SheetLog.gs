var E5F_SHEET_LOG = 'E5F_運用ログ';
var E5F_SHEET_TRADE = 'E5F_売買履歴';

function e5fGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(E5F_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(E5F_SHEET_LOG);
    sheet.appendRow([
      '日時',
      'USD/JPY',
      'モード',
      '信号',
      'ADX',
      'ER',
      '4H方向',
      'ドンチアン高',
      'ドンチアン低',
      'JPY残高',
      'USD残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function e5fGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(E5F_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(E5F_SHEET_TRADE);
    sheet.appendRow(['日時', '売買', '価格', '数量(USD)', '約定', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function e5fGetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('E5F_週次レポート');
  if (!sheet) { sheet = ss.insertSheet('E5F_週次レポート'); }
  return sheet;
}

function e5fInitSheets_() {
  e5fGetLogSheet_();
  e5fGetTradeSheet_();
  e5fGetReportSheet_();
}

function e5fAppendRunLog_(ticker, assets, state, analysis) {
  e5fGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ticker.last,
    state.mode || '',
    analysis.signal || '',
    analysis.adx != null ? analysis.adx : '',
    analysis.er != null ? analysis.er.toFixed(3) : '',
    e5fBiasLabelJa_(analysis.bias4h),
    analysis.donchianHigh != null ? e5fFormatPrice_(analysis.donchianHigh) : '',
    analysis.donchianLow != null ? e5fFormatPrice_(analysis.donchianLow) : '',
    Math.round(assets.jpy),
    assets.usd,
    analysis.note || '',
  ]);
}

function e5fAppendTradeLog_(side, price, amount, note) {
  e5fGetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    'PAPER',
    note || '',
  ]);
}
