var G_SHEET_LOG = 'G_運用ログ';
var G_SHEET_TRADE = 'G_売買履歴';

function gGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(G_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(G_SHEET_LOG);
    sheet.appendRow([
      '日時',
      '銘柄',
      '価格',
      '日足レンジ',
      '日足上限',
      '日足下限',
      '1Hレンジ',
      '1H上限',
      '1H下限',
      '日足幅%',
      '1H幅%',
      'JPY残高',
      'コイン残高',
      'シグナル',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function gGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(G_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(G_SHEET_TRADE);
    sheet.appendRow(['日時', '銘柄', '売買', '価格', '数量', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function gInitSheets_() {
  gGetLogSheet_();
  gGetTradeSheet_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('G_週次レポート')) ss.insertSheet('G_週次レポート');
  if (!ss.getSheetByName('G_日次レポート')) ss.insertSheet('G_日次レポート');
  if (!ss.getSheetByName('G_月次レポート')) ss.insertSheet('G_月次レポート');
}

/** 日足・1Hレンジ状態のスナップショット（前回ログと比較用） */
function gBuildRangeSnapshot_(daily, h1) {
  daily = daily || {};
  h1 = h1 || {};
  return [
    daily.isRange ? '1' : '0',
    daily.high != null ? Math.round(daily.high) : '',
    daily.low != null ? Math.round(daily.low) : '',
    h1.isRange ? '1' : '0',
    h1.high != null ? Math.round(h1.high) : '',
    h1.low != null ? Math.round(h1.low) : '',
  ].join('|');
}

/**
 * G_運用ログ: 売買実行時、または日足/1Hレンジが前回記録から変わったときのみ true
 */
function gShouldAppendRunLog_(ps, result) {
  if (result.active) return true;
  if (!result.daily && !result.h1) return false;
  var snap = gBuildRangeSnapshot_(result.daily, result.h1);
  if (!ps.lastLogSnapshot) {
    ps.lastLogSnapshot = snap;
    return false;
  }
  return ps.lastLogSnapshot !== snap;
}

function gUpdateLogSnapshot_(ps, result) {
  if (!result.daily && !result.h1) return;
  ps.lastLogSnapshot = gBuildRangeSnapshot_(result.daily, result.h1);
}

function gAppendRunLog_(pair, result, assets, signal) {
  var inst = gGetInstrument_(pair);
  var daily = result.daily || {};
  var h1 = result.h1 || {};
  gGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label,
    result.price != null ? gRoundPrice_(pair, result.price) : '',
    daily.isRange ? 'YES' : 'NO',
    daily.high != null ? gRoundPrice_(pair, daily.high) : '',
    daily.low != null ? gRoundPrice_(pair, daily.low) : '',
    h1.isRange ? 'YES' : 'NO',
    h1.high != null ? gRoundPrice_(pair, h1.high) : '',
    h1.low != null ? gRoundPrice_(pair, h1.low) : '',
    daily.widthPct != null ? daily.widthPct.toFixed(2) : '',
    h1.widthPct != null ? h1.widthPct.toFixed(2) : '',
    assets ? Math.round(assets.jpy) : '',
    assets ? assets.coin : '',
    signal || '',
    result.activeNote || '',
  ]);
}

function gAppendTradeLog_(pair, side, price, amount, memo) {
  var inst = gGetInstrument_(pair);
  gGetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label,
    side,
    price,
    amount,
    memo || '',
  ]);
}
