var GCFX_SHEET_LOG = 'GCFX_運用ログ';
var GCFX_SHEET_TRADE = 'GCFX_売買履歴';

function gcfxGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GCFX_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(GCFX_SHEET_LOG);
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
      '拘束証拠金',
      'ポジション',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function gcfxGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GCFX_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(GCFX_SHEET_TRADE);
    sheet.appendRow(['日時', '銘柄', '売買', '価格', '数量', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function gcfxInitSheets_() {
  gcfxGetLogSheet_();
  gcfxGetTradeSheet_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('GCFX_週次レポート')) ss.insertSheet('GCFX_週次レポート');
  if (!ss.getSheetByName('GCFX_日次レポート')) ss.insertSheet('GCFX_日次レポート');
  if (!ss.getSheetByName('GCFX_月次レポート')) ss.insertSheet('GCFX_月次レポート');
}

function gcfxBuildRangeSnapshot_(daily, h1) {
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

function gcfxShouldAppendRunLog_(ps, result) {
  if (result.active) return true;
  if (!result.daily && !result.h1) return false;
  var snap = gcfxBuildRangeSnapshot_(result.daily, result.h1);
  if (!ps.lastLogSnapshot) {
    ps.lastLogSnapshot = snap;
    return false;
  }
  return ps.lastLogSnapshot !== snap;
}

function gcfxUpdateLogSnapshot_(ps, result) {
  if (!result.daily && !result.h1) return;
  ps.lastLogSnapshot = gcfxBuildRangeSnapshot_(result.daily, result.h1);
}

function gcfxFormatLogPrice_(pairId, price) {
  if (price == null || price === '') return '';
  return gcfxRoundPrice_(pairId, price);
}

function gcfxAppendRunLog_(pairId, result, assets, signal) {
  var inst = gcfxGetInstrument_(pairId);
  var daily = result.daily || {};
  var h1 = result.h1 || {};
  gcfxGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label,
    result.price != null ? gcfxFormatLogPrice_(pairId, result.price) : '',
    daily.isRange ? 'YES' : 'NO',
    gcfxFormatLogPrice_(pairId, daily.high),
    gcfxFormatLogPrice_(pairId, daily.low),
    h1.isRange ? 'YES' : 'NO',
    gcfxFormatLogPrice_(pairId, h1.high),
    gcfxFormatLogPrice_(pairId, h1.low),
    daily.widthPct != null ? daily.widthPct.toFixed(2) : '',
    h1.widthPct != null ? h1.widthPct.toFixed(2) : '',
    assets ? Math.round(assets.jpy) : '',
    assets ? Math.round(assets.reserved || 0) : '',
    signal || '',
    result.activeNote || '',
  ]);
}

function gcfxAppendTradeLog_(pairId, sideLabel, price, units, memo) {
  var inst = gcfxGetInstrument_(pairId);
  gcfxGetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label,
    sideLabel,
    price,
    units,
    memo || '',
  ]);
}
