var D4F_SHEET_LOG = 'D4F_運用ログ';
var D4F_SHEET_TRADE = 'D4F_売買履歴';

function d4fGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(D4F_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(D4F_SHEET_LOG);
    sheet.appendRow([
      '日時',
      'USD/JPY',
      'モード',
      '信号',
      '買法則数',
      '売法則数',
      '鈎足本数',
      '下値斜線',
      '二の膳',
      'JPY残高',
      'USD残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function d4fGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(D4F_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(D4F_SHEET_TRADE);
    sheet.appendRow(['日時', '売買', '価格', '数量(USD)', '約定', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function d4fGetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('D4F_週次レポート');
  if (!sheet) { sheet = ss.insertSheet('D4F_週次レポート'); }
  return sheet;
}

function d4fInitSheets_() {
  d4fGetLogSheet_();
  d4fGetTradeSheet_();
  d4fGetReportSheet_();
}

function d4fAppendRunLog_(ticker, assets, state, analysis) {
  d4fGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ticker.last,
    state.mode || '',
    analysis.signal || '',
    analysis.buyLawCount != null ? analysis.buyLawCount : '',
    analysis.sellLawCount != null ? analysis.sellLawCount : '',
    analysis.kagiSegs || '',
    analysis.trendline != null ? analysis.trendline : '',
    analysis.secondStage ? 'Y' : '',
    Math.round(assets.jpy),
    assets.usd,
    analysis.note || '',
  ]);
}

function d4fAppendTradeLog_(side, price, amount, note) {
  d4fGetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    'PAPER',
    note || '',
  ]);
}
