var D4_SHEET_LOG = 'D4_運用ログ';
var D4_SHEET_TRADE = 'D4_売買履歴';

function d4GetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(D4_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(D4_SHEET_LOG);
    sheet.appendRow([
      '日時',
      'BTC価格',
      'モード',
      '信号',
      '買法則数',
      '売法則数',
      '鈎足本数',
      '下値斜線',
      '二の膳',
      'JPY残高',
      'BTC残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function d4GetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(D4_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(D4_SHEET_TRADE);
    sheet.appendRow(['日時', '売買', '価格', '数量(BTC)', '約定', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function d4GetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('D4_週次レポート');
  if (!sheet) {
    sheet = ss.insertSheet('D4_週次レポート');
  }
  return sheet;
}

function d4InitSheets_() {
  d4GetLogSheet_();
  d4GetTradeSheet_();
  d4GetReportSheet_();
}

function d4AppendRunLog_(ticker, assets, state, analysis) {
  d4GetLogSheet_().appendRow([
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
    assets.btc,
    analysis.note || '',
  ]);
}

function d4AppendTradeLog_(side, price, amount, note) {
  var cfg = d4GetConfig_();
  d4GetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    cfg.dryRun ? 'DRY_RUN' : '',
    note || '',
  ]);
  if (cfg.dryRun) {
    d4QueuePaperTradeToMeta_(side, price, amount);
  }
}

var d4MetaTradeBuffer_ = null;

function d4QueuePaperTradeToMeta_(side, price, amount) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) return;
  if (!d4MetaTradeBuffer_) d4MetaTradeBuffer_ = [];
  d4MetaTradeBuffer_.push([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    'D',
    side,
    price,
    amount,
    '',
  ]);
}

function d4FlushPaperTradesToMeta_() {
  if (!d4MetaTradeBuffer_ || !d4MetaTradeBuffer_.length) return;
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) {
    d4MetaTradeBuffer_ = null;
    return;
  }
  try {
    var sheet = SpreadsheetApp.openById(sheetId).getSheetByName('META_紙トレード');
    if (!sheet) return;
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, startRow + d4MetaTradeBuffer_.length - 1, 6).setValues(d4MetaTradeBuffer_);
    d4Log_('META報告 ' + d4MetaTradeBuffer_.length + ' 件');
  } catch (e) {
    d4Log_('META報告失敗: ' + String(e.message || e));
  } finally {
    d4MetaTradeBuffer_ = null;
  }
}
