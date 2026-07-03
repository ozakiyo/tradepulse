var B2_SHEET_LOG = 'B2_運用ログ';
var B2_SHEET_TRADE = 'B2_売買履歴';

function b2GetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(B2_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(B2_SHEET_LOG);
    sheet.appendRow([
      '日時',
      'BTC価格',
      'モード',
      '間隔(円)',
      '本数',
      '下限幅(円)',
      'ATR%',
      'RSI',
      'BB幅%',
      'JPY残高',
      'BTC残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function b2GetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(B2_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(B2_SHEET_TRADE);
    sheet.appendRow(['日時', '売買', '価格', '数量(BTC)', '約定', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function b2GetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('B2_週次レポート');
  if (!sheet) {
    sheet = ss.insertSheet('B2_週次レポート');
  }
  return sheet;
}

function b2InitSheets_() {
  b2GetLogSheet_();
  b2GetTradeSheet_();
  b2GetReportSheet_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(B2_SHEET_DAILY)) ss.insertSheet(B2_SHEET_DAILY);
  if (!ss.getSheetByName(B2_SHEET_MONTHLY)) ss.insertSheet(B2_SHEET_MONTHLY);
}

/** 動きあり、または前回シート記録から interval 分経過なら true */
function b2ShouldAppendRunLog_(state, cfg, hasActivity) {
  if (hasActivity) return true;
  var intervalMin = cfg.runLogIntervalMin || B2_CONFIG.RUN_LOG_INTERVAL_MIN;
  if (!state.lastRunLogAt) return true;
  var elapsed = (Date.now() - new Date(state.lastRunLogAt).getTime()) / 60000;
  return elapsed >= intervalMin;
}

function b2AppendRunLog_(ticker, assets, state, plan, detailNote) {
  var note = detailNote != null ? detailNote : plan.note;
  b2GetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ticker.last,
    state.mode || '',
    plan.trapStep,
    plan.levels,
    plan.rangeSpan,
    plan.atrPct != null ? plan.atrPct : '',
    plan.rsi != null ? plan.rsi : '',
    plan.bbWidthPct != null ? plan.bbWidthPct : '',
    assets.jpy,
    assets.btc,
    note,
  ]);
}

function b2AppendTradeLog_(side, price, amount, note) {
  var cfg = b2GetConfig_();
  b2GetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    cfg.dryRun ? 'DRY_RUN' : '',
    note || '',
  ]);
  if (cfg.dryRun) {
    b2QueuePaperTradeToMeta_(side, price, amount);
  }
}

/** メタ層への紙トレード報告（SheetLog.gs に統合） */
var b2MetaTradeBuffer_ = null;

function b2QueuePaperTradeToMeta_(side, price, amount) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) return;

  if (!b2MetaTradeBuffer_) b2MetaTradeBuffer_ = [];
  b2MetaTradeBuffer_.push([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    'B',
    side,
    price,
    amount,
    '',
  ]);
}

function b2FlushPaperTradesToMeta_() {
  if (!b2MetaTradeBuffer_ || !b2MetaTradeBuffer_.length) return;

  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) {
    b2MetaTradeBuffer_ = null;
    return;
  }

  try {
    var sheet = SpreadsheetApp.openById(sheetId).getSheetByName('META_紙トレード');
    if (!sheet) {
      b2Log_('META: META_紙トレード シートが見つかりません');
      return;
    }
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, startRow + b2MetaTradeBuffer_.length - 1, 6).setValues(b2MetaTradeBuffer_);
    b2Log_('META報告 ' + b2MetaTradeBuffer_.length + ' 件');
  } catch (e) {
    b2Log_('META報告失敗: ' + String(e.message || e));
  } finally {
    b2MetaTradeBuffer_ = null;
  }
}

function b2TestMetaSpreadsheet() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) {
    SpreadsheetApp.getUi().alert('META_SPREADSHEET_ID が未設定です');
    return;
  }
  var ss = SpreadsheetApp.openById(sheetId);
  SpreadsheetApp.getUi().alert('メタ層SS接続OK: ' + ss.getName());
}
