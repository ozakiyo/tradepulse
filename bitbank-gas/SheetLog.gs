var BB_SHEET_NAME = '運用ログ';

function bbGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BB_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(BB_SHEET_NAME);
    sheet.appendRow([
      '日時',
      '環境',
      '操作',
      'BTC価格',
      'モード',
      'ADX',
      'ER',
      'JPY残高',
      'BTC残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  }
  return sheet;
}

/** 毎回のチェック結果を1行記録（損益はユーザーが別シートで集計） */
function bbAppendRunLog_(regime, ticker, assets, state) {
  var sheet = bbGetLogSheet_();
  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    bbRegimeLabelJa_(regime.regime, regime.trendBias),
    bbActionLabelJa_(regime.action),
    ticker.last,
    state.mode || '',
    regime.adx != null ? regime.adx : '',
    regime.er != null ? regime.er : '',
    assets.jpy,
    assets.btc,
    regime.detail || '',
  ]);
}

/** 売買イベント用（任意・手動集計向け） */
function bbAppendTradeLog_(side, price, amount, note) {
  var sheet = bbGetLogSheet_();
  var tradeSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('売買履歴');
  if (!tradeSheet) {
    tradeSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('売買履歴');
    tradeSheet.appendRow(['日時', '売買', '価格', '数量(BTC)', 'メモ']);
    tradeSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  tradeSheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    note || '',
  ]);
}
