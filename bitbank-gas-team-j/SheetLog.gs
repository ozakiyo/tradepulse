var J_SHEET_LOG = 'J_運用ログ';
var J_SHEET_TRADE = 'J_売買履歴';
var J_SHEET_PROFIT = 'J_損益履歴';

function jGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_LOG);
    sheet.appendRow([
      '日時',
      '銘柄',
      'モード',
      '現値',
      '間隔',
      '本数',
      'JPY',
      'コイン',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_TRADE);
    sheet.appendRow(['日時', '銘柄', '売買', '価格', '数量', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jGetProfitSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_PROFIT);
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_PROFIT);
    sheet.appendRow([
      '日付',
      '時間',
      '通貨',
      '買い約定価格',
      '利益確定約定価格',
      '数量',
      '損益JPY',
      'メモ',
    ]);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jInitSheets_() {
  jGetLogSheet_();
  jGetTradeSheet_();
  jGetProfitSheet_();
}

function jAppendTradeLog_(pair, side, price, amount, memo) {
  jGetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    pair,
    side,
    price,
    amount,
    memo || '',
  ]);
}

function jAppendProfitLog_(pair, buyPrice, sellPrice, amount, cfg, memo) {
  cfg = cfg || jGetConfig_();
  var now = new Date();
  var role = cfg.feeRoleProfit || J_CONFIG.FEE_ROLE_FOR_PROFIT || 'maker';
  var buyCost = jCalcBuyCostJpy_(pair, buyPrice, amount, role);
  var sellProceeds = jCalcSellProceedsJpy_(pair, sellPrice, amount, role);
  var profitJpy = Math.round(sellProceeds - buyCost);
  jGetProfitSheet_().appendRow([
    Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd'),
    Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm:ss'),
    pair,
    buyPrice,
    sellPrice,
    amount,
    profitJpy,
    memo || '',
  ]);
}

function jShouldAppendRunLog_(global, cfg, hasActivity) {
  if (hasActivity) return true;
  var intervalMin = cfg.runLogIntervalMin || J_CONFIG.RUN_LOG_INTERVAL_MIN;
  if (!global.lastRunLogAt) return true;
  var elapsed = (Date.now() - new Date(global.lastRunLogAt).getTime()) / 60000;
  return elapsed >= intervalMin;
}

function jAppendRunLog_(pair, ticker, assets, state, detail) {
  var inst = jGetInstrument_(pair);
  jGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    pair,
    state.mode || '',
    ticker ? ticker.last : '',
    state.lastTrapStep || '',
    state.lastLevels || '',
    assets.jpy != null ? Math.round(assets.jpy) : '',
    assets.coin != null ? assets.coin : '',
    detail || '',
  ]);
}
