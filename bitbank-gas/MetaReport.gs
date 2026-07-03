/**
 * メタ層スプレッドシートへ紙トレードを報告（DRY_RUN用）
 * スクリプトプロパティ META_SPREADSHEET_ID にメタ層SSのIDを設定
 */
function bbReportPaperTradeToMeta_(side, price, amount) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) return;

  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('META_紙トレード');
    if (!sheet) return;
    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
      'A',
      side,
      price,
      amount,
      '',
    ]);
  } catch (e) {
    bbLog_('META報告失敗: ' + String(e.message || e));
  }
}
