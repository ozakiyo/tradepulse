var C3_SHEET_LOG = 'C3_運用ログ';
var C3_SHEET_TRADE = 'C3_売買履歴';

function c3GetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(C3_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(C3_SHEET_LOG);
    sheet.appendRow([
      '日時',
      'BTC価格',
      'モード',
      'P&F信号',
      '箱(円)',
      'ATR%',
      '列数',
      'JPY残高',
      'BTC残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function c3GetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(C3_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(C3_SHEET_TRADE);
    sheet.appendRow(['日時', '売買', '価格', '数量(BTC)', '約定', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function c3GetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('C3_週次レポート');
  if (!sheet) {
    sheet = ss.insertSheet('C3_週次レポート');
  }
  return sheet;
}

function c3InitSheets_() {
  c3GetLogSheet_();
  c3GetTradeSheet_();
  c3GetReportSheet_();
}

function c3AppendRunLog_(ticker, assets, state, pf) {
  c3GetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ticker.last,
    state.mode || '',
    pf.signal || '',
    pf.boxSize || '',
    pf.atrPct != null ? pf.atrPct : '',
    pf.columnCount || '',
    Math.round(assets.jpy),
    assets.btc,
    pf.note || '',
  ]);
}

function c3AppendTradeLog_(side, price, amount, note) {
  var cfg = c3GetConfig_();
  c3GetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    cfg.dryRun ? 'DRY_RUN' : '',
    note || '',
  ]);
  if (cfg.dryRun) {
    c3QueuePaperTradeToMeta_(side, price, amount);
  }
}

var c3MetaTradeBuffer_ = null;

function c3QueuePaperTradeToMeta_(side, price, amount) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) return;
  if (!c3MetaTradeBuffer_) c3MetaTradeBuffer_ = [];
  c3MetaTradeBuffer_.push([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    'C',
    side,
    price,
    amount,
    '',
  ]);
}

function c3FlushPaperTradesToMeta_() {
  if (!c3MetaTradeBuffer_ || !c3MetaTradeBuffer_.length) return;
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) {
    c3MetaTradeBuffer_ = null;
    return;
  }
  try {
    var sheet = SpreadsheetApp.openById(sheetId).getSheetByName('META_紙トレード');
    if (!sheet) return;
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, startRow + c3MetaTradeBuffer_.length - 1, 6).setValues(c3MetaTradeBuffer_);
    c3Log_('META報告 ' + c3MetaTradeBuffer_.length + ' 件');
  } catch (e) {
    c3Log_('META報告失敗: ' + String(e.message || e));
  } finally {
    c3MetaTradeBuffer_ = null;
  }
}
