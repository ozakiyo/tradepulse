var E5_SHEET_LOG = 'E5_運用ログ';
var E5_SHEET_TRADE = 'E5_売買履歴';

function e5GetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(E5_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(E5_SHEET_LOG);
    sheet.appendRow([
      '日時',
      'BTC価格',
      'モード',
      '信号',
      'ADX',
      'ER',
      '4H方向',
      'ドンチアン高',
      'ドンチアン低',
      'JPY残高',
      'BTC残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function e5GetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(E5_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(E5_SHEET_TRADE);
    sheet.appendRow(['日時', '売買', '価格', '数量(BTC)', '約定', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function e5GetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('E5_週次レポート');
  if (!sheet) {
    sheet = ss.insertSheet('E5_週次レポート');
  }
  return sheet;
}

function e5InitSheets_() {
  e5GetLogSheet_();
  e5GetTradeSheet_();
  e5GetReportSheet_();
}

function e5AppendRunLog_(ticker, assets, state, analysis) {
  e5GetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ticker.last,
    state.mode || '',
    analysis.signal || '',
    analysis.adx != null ? analysis.adx : '',
    analysis.er != null ? analysis.er.toFixed(3) : '',
    e5BiasLabelJa_(analysis.bias4h),
    analysis.donchianHigh != null ? Math.round(analysis.donchianHigh) : '',
    analysis.donchianLow != null ? Math.round(analysis.donchianLow) : '',
    Math.round(assets.jpy),
    assets.btc,
    analysis.note || '',
  ]);
}

function e5AppendTradeLog_(side, price, amount, note) {
  var cfg = e5GetConfig_();
  e5GetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    cfg.dryRun ? 'DRY_RUN' : '',
    note || '',
  ]);
  if (cfg.dryRun) {
    e5QueuePaperTradeToMeta_(side, price, amount);
  }
}

var e5MetaTradeBuffer_ = null;

function e5QueuePaperTradeToMeta_(side, price, amount) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) return;
  if (!e5MetaTradeBuffer_) e5MetaTradeBuffer_ = [];
  e5MetaTradeBuffer_.push([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    'E',
    side,
    price,
    amount,
    '',
  ]);
}

function e5FlushPaperTradesToMeta_() {
  if (!e5MetaTradeBuffer_ || !e5MetaTradeBuffer_.length) return;
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) {
    e5MetaTradeBuffer_ = null;
    return;
  }
  try {
    var sheet = SpreadsheetApp.openById(sheetId).getSheetByName('META_紙トレード');
    if (!sheet) return;
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, startRow + e5MetaTradeBuffer_.length - 1, 6).setValues(e5MetaTradeBuffer_);
    e5Log_('META報告 ' + e5MetaTradeBuffer_.length + ' 件');
  } catch (e) {
    e5Log_('META報告失敗: ' + String(e.message || e));
  } finally {
    e5MetaTradeBuffer_ = null;
  }
}
