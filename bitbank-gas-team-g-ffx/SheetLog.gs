var GFFX_SHEET_LOG = 'GFFX_運用ログ';
var GFFX_SHEET_TRADE = 'GFFX_売買履歴';

function gffxGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GFFX_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(GFFX_SHEET_LOG);
    sheet.appendRow([
      '日時',
      '銘柄',
      '価格',
      'PO成立',
      '抵抗線',
      '支持線',
      '保ち合い',
      'EMA20',
      '—',
      '保ち合い幅%',
      '—',
      'JPY残高',
      '拘束証拠金',
      'ポジション',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function gffxGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GFFX_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(GFFX_SHEET_TRADE);
    sheet.appendRow(['日時', '銘柄', '売買', '価格', '数量', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function gffxInitSheets_() {
  gffxGetLogSheet_();
  gffxGetTradeSheet_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('GFFX_週次レポート')) ss.insertSheet('GFFX_週次レポート');
  if (!ss.getSheetByName('GFFX_日次レポート')) ss.insertSheet('GFFX_日次レポート');
  if (!ss.getSheetByName('GFFX_月次レポート')) ss.insertSheet('GFFX_月次レポート');
}

function gffxBuildRangeSnapshot_(daily, h1) {
  daily = daily || {};
  h1 = h1 || {};
  return [
    daily.isRange ? '1' : '0',
    daily.high != null ? Math.round(daily.high * 10000) : '',
    daily.low != null ? Math.round(daily.low * 10000) : '',
    h1.isRange ? '1' : '0',
    h1.high != null ? Math.round(h1.high * 10000) : '',
    h1.low != null ? Math.round(h1.low * 10000) : '',
  ].join('|');
}

function gffxShouldAppendRunLog_(ps, result) {
  if (result.active) return true;
  if (!result.daily && !result.h1) return false;
  var snap = gffxBuildRangeSnapshot_(result.daily, result.h1);
  if (!ps.lastLogSnapshot) {
    ps.lastLogSnapshot = snap;
    return false;
  }
  return ps.lastLogSnapshot !== snap;
}

function gffxUpdateLogSnapshot_(ps, result) {
  if (!result.daily && !result.h1) return;
  ps.lastLogSnapshot = gffxBuildRangeSnapshot_(result.daily, result.h1);
}

function gffxFormatLogPrice_(pairId, price) {
  if (price == null || price === '') return '';
  return gffxRoundPrice_(pairId, price);
}

function gffxAppendRunLog_(pairId, result, assets, signal) {
  var inst = gffxGetInstrument_(pairId);
  var daily = result.daily || {};
  var h1 = result.h1 || {};
  gffxGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label,
    result.price != null ? gffxFormatLogPrice_(pairId, result.price) : '',
    daily.isRange ? 'YES' : 'NO',
    gffxFormatLogPrice_(pairId, daily.high),
    gffxFormatLogPrice_(pairId, daily.low),
    h1.isRange ? 'YES' : 'NO',
    gffxFormatLogPrice_(pairId, h1.high),
    gffxFormatLogPrice_(pairId, h1.low),
    daily.widthPct != null ? daily.widthPct.toFixed(2) : '',
    h1.widthPct != null ? h1.widthPct.toFixed(2) : '',
    assets ? Math.round(assets.jpy) : '',
    assets ? Math.round(assets.reserved || 0) : '',
    signal || '',
    result.activeNote || '',
  ]);
}

function gffxAppendTradeLog_(pairId, sideLabel, price, units, memo) {
  var inst = gffxGetInstrument_(pairId);
  gffxGetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label,
    sideLabel,
    price,
    units,
    memo || '',
  ]);
}
