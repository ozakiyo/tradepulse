var GFX_SHEET_LOG = 'GFX_運用ログ';
var GFX_SHEET_TRADE = 'GFX_売買履歴';

function gfxGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GFX_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(GFX_SHEET_LOG);
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

function gfxGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GFX_SHEET_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(GFX_SHEET_TRADE);
    sheet.appendRow(['日時', '銘柄', '売買', '価格', '数量', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function gfxInitSheets_() {
  gfxGetLogSheet_();
  gfxGetTradeSheet_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('GFX_週次レポート')) ss.insertSheet('GFX_週次レポート');
  if (!ss.getSheetByName('GFX_日次レポート')) ss.insertSheet('GFX_日次レポート');
  if (!ss.getSheetByName('GFX_月次レポート')) ss.insertSheet('GFX_月次レポート');
}

function gfxBuildRangeSnapshot_(daily, h1) {
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

function gfxShouldAppendRunLog_(ps, result) {
  if (result.active) return true;
  if (!result.daily && !result.h1) return false;
  var snap = gfxBuildRangeSnapshot_(result.daily, result.h1);
  if (!ps.lastLogSnapshot) {
    ps.lastLogSnapshot = snap;
    return false;
  }
  return ps.lastLogSnapshot !== snap;
}

function gfxUpdateLogSnapshot_(ps, result) {
  if (!result.daily && !result.h1) return;
  ps.lastLogSnapshot = gfxBuildRangeSnapshot_(result.daily, result.h1);
}

function gfxFormatLogPrice_(pairId, price) {
  if (price == null || price === '') return '';
  return gfxRoundPrice_(pairId, price);
}

function gfxAppendRunLog_(pairId, result, assets, signal) {
  var inst = gfxGetInstrument_(pairId);
  var daily = result.daily || {};
  var h1 = result.h1 || {};
  gfxGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label,
    result.price != null ? gfxFormatLogPrice_(pairId, result.price) : '',
    daily.isRange ? 'YES' : 'NO',
    gfxFormatLogPrice_(pairId, daily.high),
    gfxFormatLogPrice_(pairId, daily.low),
    h1.isRange ? 'YES' : 'NO',
    gfxFormatLogPrice_(pairId, h1.high),
    gfxFormatLogPrice_(pairId, h1.low),
    daily.widthPct != null ? daily.widthPct.toFixed(2) : '',
    h1.widthPct != null ? h1.widthPct.toFixed(2) : '',
    assets ? Math.round(assets.jpy) : '',
    assets ? Math.round(assets.reserved || 0) : '',
    signal || '',
    result.activeNote || '',
  ]);
}

function gfxAppendTradeLog_(pairId, sideLabel, price, units, memo) {
  var inst = gfxGetInstrument_(pairId);
  gfxGetTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    inst.label,
    sideLabel,
    price,
    units,
    memo || '',
  ]);
}
