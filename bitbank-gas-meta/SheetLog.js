var META_SHEET_ALLOC = 'META_配分';
var META_SHEET_LOG = 'META_運用ログ';
var META_SHEET_WEEKLY = 'META_週次成績';

function metaGetAllocSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET_ALLOC);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET_ALLOC);
    sheet.appendRow([
      '日時',
      '環境',
      'BTC価格',
      'ER',
      'ADX',
      'A%',
      'B%',
      'C%',
      'D%',
      'E%',
      '現金%',
      '週次調整',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function metaGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET_LOG);
    sheet.appendRow(['日時', 'カテゴリ', '内容']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function metaGetWeeklySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET_WEEKLY);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET_WEEKLY);
    sheet.appendRow(['週終了日', 'A損益', 'B損益', 'C損益', 'D損益', 'E損益', 'メモ']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A2').setNote('最新行の損益(円)が週次 +/-5pt 調整に使われます');
  }
  return sheet;
}

function metaGetIntegratedReportSheet_init_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('META_統合レポート');
  if (!sheet) {
    sheet = ss.insertSheet('META_統合レポート');
    sheet.appendRow(['日時', 'チーム', '期間', '取引数', '勝率%', 'PF', '純損益', '平均保有h', '改善提案']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function metaGetAutoVerdictSheet_init_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('META_オート総括');
  if (!sheet) {
    sheet = ss.insertSheet('META_オート総括');
  }
  return sheet;
}

function metaInitSheets_() {
  metaGetAllocSheet_();
  metaGetLogSheet_();
  metaGetWeeklySheet_();
  metaGetPaperTradesSheet_();
  metaGetCompetitionSheet_();
  metaGetIntegratedReportSheet_init_();
  metaGetAutoVerdictSheet_init_();
  metaGetLeagueSheet_();
  metaGetLeagueAdviceSheet_();
  metaGetLeagueWeekSheet_();
  metaInitLeagueKnobsSheet_();
  metaGetGoNoGoSheet_();
}

function metaAppendAllocRow_(regime, ticker, allocation) {
  metaGetAllocSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    allocation.regimeLabel,
    ticker.last,
    regime.er != null ? regime.er : '',
    regime.adx != null ? regime.adx : '',
    allocation.teams.A,
    allocation.teams.B,
    allocation.teams.C,
    allocation.teams.D,
    allocation.teams.E,
    allocation.cash,
    allocation.adjustmentNote,
    allocation.detail,
  ]);
}

function metaAppendLog_(category, content) {
  metaGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    category,
    content,
  ]);
}

/**
 * 稼働チーム以外のシートを削除し、統合レポートの停止チーム行も除去
 * @return {{ deletedSheets: string[], removedRows: number }}
 */
function metaPruneInactiveSheetsAndRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var deletedSheets = [];
  var sheets = ss.getSheets().slice();
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    if (META_KEEP_SHEETS.indexOf(name) >= 0) continue;
    if (ss.getSheets().length <= 1) break;
    ss.deleteSheet(sheet);
    deletedSheets.push(name);
  }

  var removedRows = metaPruneInactiveReportRows_();
  metaLog_(
    '不要シート削除: ' +
      (deletedSheets.length ? deletedSheets.join(', ') : 'なし') +
      ' / 統合レポート停止チーム行削除: ' +
      removedRows
  );
  return { deletedSheets: deletedSheets, removedRows: removedRows };
}

/** META_統合レポートから稼働外チームの行を削除 */
function metaPruneInactiveReportRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(META_SHEET_INTEGRATED);
  if (!sheet) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var values = sheet.getRange(2, 1, last - 1, 9).getValues();
  var keep = [];
  var removed = 0;
  for (var r = 0; r < values.length; r++) {
    var team = String(values[r][1] || '').trim();
    if (!team || !metaIsTeamValidationPaused_(team)) {
      keep.push(values[r]);
    } else {
      removed += 1;
    }
  }
  if (removed === 0) return 0;
  if (last > 1) sheet.getRange(2, 1, last - 1, 9).clearContent();
  if (keep.length) {
    sheet.getRange(2, 1, keep.length, 9).setValues(keep);
  }
  return removed;
}

function metaMaybeNotifyLine_(allocation, changed) {
  if (!changed) return;
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var userId = PropertiesService.getScriptProperties().getProperty('LINE_USER_ID');
  if (!token || !userId) return;

  var text =
    '【メタ層】資金配分更新\n' +
    allocation.recommendation +
    '\n' +
    allocation.adjustmentNote;

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: text }],
    }),
    muteHttpExceptions: true,
  });
  metaLog_('LINE送信: 配分更新');
}
