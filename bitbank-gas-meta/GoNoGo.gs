/**
 * META — 稼働中チーム向け Go / No-Go 判定シート
 * 検証停止チームは掲載しない（MetaReport.gs META_ACTIVE_TEAMS）
 */

var META_SHEET_GONOGO = 'META_GoNoGo';

var META_GONOGO_CHECKS = [
  { id: 1, category: '運用安定', item: 'DRY_RUNで10日以上稼働', criteria: 'GAS実行失敗 週1回未満', manual: true },
  { id: 2, category: '運用安定', item: 'STOP / 損切りの動作', criteria: 'ログ上で設計どおり確認（発生時）', manual: true },
  { id: 3, category: 'ルール', item: 'ルール遵守', criteria: '手動介入・検証中の設定変更なし', manual: true },
  { id: 4, category: 'ルール', item: '日次記録', criteria: '運用ログまたは日次集計 10日分以上', manual: true },
  { id: 5, category: '成績', item: '取引数', criteria: '10約定以上（本番前は30推奨）', auto: 'trades', autoMin: 10 },
  { id: 6, category: '成績', item: 'PF', criteria: 'PF ≥ 1.0', auto: 'pf', autoMin: 1.0 },
  { id: 7, category: '成績', item: '勝率', criteria: '勝率 ≥ 40%', auto: 'winRate', autoMin: 40 },
  { id: 8, category: '本番準備', item: 'APIキー', criteria: '出金権限なし（bitbankチーム）', manual: true },
  { id: 9, category: '本番準備', item: '残高', criteria: '本番用JPY 3〜5万円確保', manual: true },
  { id: 10, category: '本番準備', item: '監視', criteria: '本番初日は日中に監視できる日', manual: true },
];

var META_GONOGO_TEAM_LEAGUE = {
  A: 'L1',
  B: 'L1',
  E: 'L1',
  'G-FFX': 'L5',
  'G-CFX': 'L4',
  'G-CBO': 'L5',
  'G-SAXO': 'L4',
  'E-FX': 'L2',
  'F-FX': 'L2',
  'F-Short': 'L3',
};

function metaGetGoNoGoSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET_GONOGO);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET_GONOGO);
  }
  return sheet;
}

function metaGoNoGoAutoCheck_(check, teamData) {
  if (!check.auto || !teamData) return '未';
  if (check.auto === 'trades') {
    return teamData.trades >= check.autoMin ? '○' : '×';
  }
  if (check.auto === 'pf') {
    if (teamData.trades < 3) return '未';
    return metaPfMeets_(teamData.pf, check.autoMin) ? '○' : '×';
  }
  if (check.auto === 'winRate') {
    if (teamData.trades < 3) return '未';
    return teamData.winRate >= check.autoMin ? '○' : '×';
  }
  return '未';
}

function metaSuggestGoNoGo_(teamData) {
  if (!teamData || teamData.trades === 0) return '未判定';

  var pass = 0;
  var autoTotal = 0;
  for (var i = 0; i < META_GONOGO_CHECKS.length; i++) {
    var c = META_GONOGO_CHECKS[i];
    if (!c.auto) continue;
    autoTotal++;
    if (metaGoNoGoAutoCheck_(c, teamData) === '○') pass++;
  }

  if (pass === autoTotal && teamData.trades >= 30 && metaPfMeets_(teamData.pf, 1.0)) {
    return 'Go候補';
  }
  if (pass >= 2 && teamData.trades >= 10) {
    return '継続DRY_RUN';
  }
  if (teamData.trades >= 3 && !metaPfMeets_(teamData.pf, 1.0)) {
    return 'No-Go候補';
  }
  return '未判定';
}

function metaRefreshGoNoGoSheet_() {
  var sheet = metaGetGoNoGoSheet_();
  sheet.clear();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var teamData = metaGetLatestTeamData_();
  var teams = metaGetActiveTeams_();

  sheet.getRange(1, 1).setValue('META Go / No-Go — 稼働中チーム').setFontWeight('bold').setFontSize(13);
  sheet.getRange(2, 1).setValue('更新: ' + now + '  |  手動項目は「判定(手動)」列に ○ / × を入力');
  sheet.getRange(3, 1).setValue('検証停止チーム（C/D/F-Crypto等）は掲載しません');

  var sumHeaders = ['チーム', 'リーグ', '7日取引数', '7日PF', '7日勝率%', '自動判定', '判定(手動)', '最終Go/No-Go', 'メモ'];
  var sumRow = 5;
  sheet.getRange(sumRow, 1, 1, sumHeaders.length).setValues([sumHeaders]);
  sheet.getRange(sumRow, 1, 1, sumHeaders.length).setFontWeight('bold');
  sumRow++;

  for (var t = 0; t < teams.length; t++) {
    var team = teams[t];
    var d = teamData[team];
    var autoVerdict = metaSuggestGoNoGo_(d);
    var trades = d ? d.trades : 0;
    var pf = d ? d.pf : '-';
    var winRate = d ? d.winRate.toFixed(1) : '-';

    sheet.getRange(sumRow, 1, 1, sumHeaders.length).setValues([[
      team,
      META_GONOGO_TEAM_LEAGUE[team] || '-',
      trades,
      pf,
      winRate,
      autoVerdict,
      '',
      '',
      '',
    ]]);
    sumRow++;
  }

  var checkStart = sumRow + 2;
  sheet.getRange(checkStart, 1).setValue('■ 共通チェック項目').setFontWeight('bold');
  checkStart++;

  var checkHeaders = ['#', 'カテゴリ', 'チェック項目', '合格基準', '確認方法'];
  sheet.getRange(checkStart, 1, 1, checkHeaders.length).setValues([checkHeaders]);
  sheet.getRange(checkStart, 1, 1, checkHeaders.length).setFontWeight('bold');
  checkStart++;

  for (var c = 0; c < META_GONOGO_CHECKS.length; c++) {
    var chk = META_GONOGO_CHECKS[c];
    var how = chk.manual ? 'リーダー手動確認' : '統合レポートから自動';
    sheet.getRange(checkStart, 1, 1, 5).setValues([[
      chk.id, chk.category, chk.item, chk.criteria, how,
    ]]);
    checkStart++;
  }

  checkStart++;
  sheet.getRange(checkStart, 1).setValue('■ 自動成績チェック（最新7日）').setFontWeight('bold');
  checkStart++;

  var autoHeaders = ['チーム', '#', '項目', '基準', '自動'];
  sheet.getRange(checkStart, 1, 1, autoHeaders.length).setValues([autoHeaders]);
  sheet.getRange(checkStart, 1, 1, autoHeaders.length).setFontWeight('bold');
  checkStart++;

  for (var t2 = 0; t2 < teams.length; t2++) {
    var team2 = teams[t2];
    var d2 = teamData[team2];
    for (var c2 = 0; c2 < META_GONOGO_CHECKS.length; c2++) {
      var chk2 = META_GONOGO_CHECKS[c2];
      if (!chk2.auto) continue;
      sheet.getRange(checkStart, 1, 1, 5).setValues([[
        team2,
        chk2.id,
        chk2.item,
        chk2.criteria,
        metaGoNoGoAutoCheck_(chk2, d2),
      ]]);
      checkStart++;
    }
  }

  sheet.setFrozenRows(5);
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 200);
  metaLog_('Go/No-Goシート更新完了（稼働' + teams.length + 'チーム）');
}

function metaInitGoNoGoSheet_() {
  metaRefreshGoNoGoSheet_();
}
