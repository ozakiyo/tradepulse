/**
 * メタ層 — 全チーム統合レポート + オート総括
 *
 * 各チームGASが META_統合レポート シートに成績サマリーを1行追記し、
 * META層が集約して「オートの見解」を出力する。
 *
 * 送信フォーマット（各チーム → META）:
 *   [日時, チーム名, 期間, 取引数, 勝率%, PF, 純損益, 平均保有時間h, 改善提案]
 */

var META_SHEET_INTEGRATED = 'META_統合レポート';
var META_TEAMS_ALL = ['F-Short', 'J', 'G-SAXO', 'G-SAXO-TREND'];

/**
 * 稼働中（統合レポート・リーグ・Go/No-Go の集計対象）
 * それ以外は metaIsTeamValidationPaused_ で除外（過去行も読み飛ばし）
 */
var META_ACTIVE_TEAMS = ['F-Short', 'J', 'G-SAXO', 'G-SAXO-TREND'];

/** META スプレッドシートに残すシート（これ以外は削除対象） */
var META_KEEP_SHEETS = [
  'META_統合レポート',
  'META_オート総括',
  'META_リーグ',
  'META_週次リーグ',
  'META_リーグ調整',
  'META_リーダー助言',
  'META_GoNoGo',
  'META_配分',
  'META_運用ログ',
  'META_週次成績',
  'META_紙トレード',
  'META_競争比較',
];

/** @deprecated META_ACTIVE_TEAMS 以外はすべて停止扱い。再開時は META_ACTIVE_TEAMS に追加 */
var META_VALIDATION_PAUSED_TEAMS = [];

var META_REPORT_HEADERS = ['日時', 'チーム', '期間', '取引数', '勝率%', 'PF', '純損益', '平均保有h', '改善提案'];

function metaIsTeamValidationPaused_(team) {
  var t = String(team || '').trim();
  if (!t) return true;
  for (var i = 0; i < META_ACTIVE_TEAMS.length; i++) {
    if (META_ACTIVE_TEAMS[i] === t) return false;
  }
  return true;
}

/** METAレポート・Go/No-Go・リーグに載せる稼働中チームのみ */
function metaGetActiveTeams_() {
  var active = [];
  for (var i = 0; i < META_ACTIVE_TEAMS.length; i++) {
    var t = META_ACTIVE_TEAMS[i];
    if (META_TEAMS_ALL.indexOf(t) >= 0) active.push(t);
  }
  return active;
}

/** F系は純損益を % で送信（円換算は DUMMY_CAPITAL_PER_TEAM 基準） */
var META_PCT_PNL_TEAMS = { 'G-FX': true, 'G-FFX': true, 'G-CFX': true, 'G-CBO': true, 'G-SAXO': true, 'G-SAXO-TREND': true, 'F-FX': true, 'F-Crypto': true, 'F-Index': true, 'F-Short': true };

function metaIsPercentPnlTeam_(team) {
  return !!META_PCT_PNL_TEAMS[team];
}

function metaParsePf_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (s === '' || s === '-') return NaN;
  if (s === '∞' || s.indexOf('∞') >= 0) return 999;
  var n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function metaPfMeets_(raw, threshold) {
  var pf = metaParsePf_(raw);
  return !isNaN(pf) && pf >= threshold;
}

/**
 * 統合レポートの純損益セルを解析
 * @return {{ jpy: number, pct: number|null, display: string }}
 */
function metaParsePnlFromRow_(raw, team) {
  var allocJpy = META_CONFIG.DUMMY_CAPITAL_PER_TEAM;

  if (raw === '' || raw === '-' || raw == null) {
    return { jpy: 0, pct: null, display: '-' };
  }

  if (typeof raw === 'number' && !isNaN(raw)) {
    if (metaIsPercentPnlTeam_(team)) {
      var jpyFromPct = allocJpy * (raw / 100);
      return {
        jpy: jpyFromPct,
        pct: raw,
        display: raw.toFixed(3) + '% (約' + Math.round(jpyFromPct) + '円)',
      };
    }
    return { jpy: raw, pct: null, display: Math.round(raw) + '円' };
  }

  var str = String(raw).trim();
  if (str.indexOf('%') >= 0) {
    var pctVal = parseFloat(str.replace('%', ''));
    if (isNaN(pctVal)) pctVal = 0;
    var jpyVal = allocJpy * (pctVal / 100);
    return {
      jpy: jpyVal,
      pct: pctVal,
      display: pctVal.toFixed(3) + '% (約' + Math.round(jpyVal) + '円)',
    };
  }

  var num = Number(str);
  if (!isNaN(num)) {
    return { jpy: num, pct: null, display: Math.round(num) + '円' };
  }

  return { jpy: 0, pct: null, display: str };
}

/* ====================================================================
 * 1. 統合レポートシート取得・初期化
 * ==================================================================== */

function metaGetIntegratedReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET_INTEGRATED);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET_INTEGRATED);
    sheet.appendRow(META_REPORT_HEADERS);
    sheet.getRange(1, 1, 1, META_REPORT_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ====================================================================
 * 2. 各チームの最新データを取得
 * ==================================================================== */

function metaGetLatestTeamData_() {
  var sheet = metaGetIntegratedReportSheet_();
  if (sheet.getLastRow() < 2) return {};

  var data = sheet.getDataRange().getValues();
  var latest7 = {};
  var latestAny = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var team = String(row[1]).trim();
    if (!team || metaIsTeamValidationPaused_(team)) continue;

    var period = String(row[2]).trim();
    var pnlParsed = metaParsePnlFromRow_(row[6], team);
    var entry = {
      time: String(row[0]),
      team: team,
      period: period,
      trades: Number(row[3]) || 0,
      winRate: Number(row[4]) || 0,
      pf: String(row[5]),
      pfNum: metaParsePf_(row[5]),
      pnl: pnlParsed.jpy,
      pnlPct: pnlParsed.pct,
      pnlDisplay: pnlParsed.display,
      avgHoldH: Number(row[7]) || 0,
      recommendation: String(row[8] || ''),
    };

    if (!latestAny[team] || entry.time >= latestAny[team].time) {
      latestAny[team] = entry;
    }
    if (period === '7日間' || period === '24時間') {
      if (!latest7[team] || entry.time >= latest7[team].time) {
        latest7[team] = entry;
      }
    }
  }

  var latest = {};
  for (var t = 0; t < META_TEAMS_ALL.length; t++) {
    var teamName = META_TEAMS_ALL[t];
    if (metaIsTeamValidationPaused_(teamName)) continue;
    latest[teamName] = latest7[teamName] || latestAny[teamName] || null;
  }
  return latest;
}

/* ====================================================================
 * 3. オート総括見解生成
 * ==================================================================== */

function metaGenerateAutoVerdict_(teamData) {
  var lines = [];
  var allocation = metaLoadAllocation_();
  var rankings = [];

  lines.push('════════════════════════════════════');
  lines.push('【オート総括見解】');
  lines.push('生成日時: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'));
  lines.push('目標: 少ない資金で多くの利益を得ること');
  lines.push('════════════════════════════════════');
  lines.push('');

  var activeTeams = metaGetActiveTeams_();
  for (var i = 0; i < activeTeams.length; i++) {
    var team = activeTeams[i];
    var d = teamData[team];
    if (!d) {
      rankings.push({ team: team, efficiency: -999, verdict: '未稼働', pnl: 0, trades: 0 });
      continue;
    }

    var allocPct = 0;
    if (allocation && allocation.teams) {
      allocPct = allocation.teams[team] || allocation.teams[team.replace('F-', '')] || 0;
    }
    var allocJpy = allocPct > 0 ? (META_CONFIG.DUMMY_TOTAL_CAPITAL * allocPct / 100) : META_CONFIG.DUMMY_CAPITAL_PER_TEAM;

    var efficiency = allocJpy > 0 ? (d.pnl / allocJpy) * 100 : 0;

    var verdict;
    if (d.trades === 0) {
      verdict = '様子見';
    } else if (d.winRate >= 50 && metaPfMeets_(d.pf, 1.5)) {
      verdict = '増配推奨';
    } else if (d.winRate >= 40 && metaPfMeets_(d.pf, 1.0)) {
      verdict = '継続';
    } else if (d.winRate >= 30) {
      verdict = '減配・パラメータ調整';
    } else {
      verdict = '停止検討';
    }

    rankings.push({
      team: team,
      efficiency: efficiency,
      verdict: verdict,
      pnl: d.pnl,
      trades: d.trades,
      winRate: d.winRate,
      pf: d.pf,
      avgHoldH: d.avgHoldH,
    });
  }

  rankings.sort(function (a, b) { return b.efficiency - a.efficiency; });

  lines.push('■ 資金効率ランキング（純損益/配分資金）');
  lines.push('─────────────────────────────');
  for (var r = 0; r < rankings.length; r++) {
    var rk = rankings[r];
    var rank = r + 1;
    if (rk.efficiency === -999) {
      lines.push(rank + '位 チーム' + rk.team + ': 未稼働（データなし）');
    } else {
      lines.push(
        rank + '位 チーム' + rk.team +
        ' | 効率 ' + rk.efficiency.toFixed(3) + '%' +
        ' | 損益 ' + (teamData[rk.team] ? teamData[rk.team].pnlDisplay : Math.round(rk.pnl)) +
        ' | 取引 ' + rk.trades +
        ' | 勝率 ' + rk.winRate.toFixed(1) + '%' +
        ' | PF ' + rk.pf
      );
    }
  }
  lines.push('');

  lines.push('■ 各チーム判定');
  lines.push('─────────────────────────────');
  for (var v = 0; v < rankings.length; v++) {
    var rv = rankings[v];
    var icon = '';
    if (rv.verdict === '増配推奨') icon = '▲';
    else if (rv.verdict === '継続') icon = '→';
    else if (rv.verdict === '減配・パラメータ調整') icon = '▼';
    else if (rv.verdict === '停止検討') icon = '×';
    else if (rv.verdict === '様子見') icon = '…';
    else icon = '?';

    lines.push(icon + ' チーム' + rv.team + ': ' + rv.verdict);

    var d = teamData[rv.team];
    if (d && d.recommendation && d.recommendation !== '-') {
      lines.push('  └ ' + d.recommendation);
    }
  }
  lines.push('');

  lines.push('■ 推奨アクション');
  lines.push('─────────────────────────────');

  var topTeam = rankings[0];
  var worstTeam = rankings[rankings.length - 1];

  if (topTeam && topTeam.efficiency > 0) {
    lines.push('・チーム' + topTeam.team + ' が最高効率 → 配分増加を検討');
  }

  if (worstTeam && worstTeam.efficiency !== -999 && worstTeam.efficiency < 0) {
    lines.push('・チーム' + worstTeam.team + ' が最低効率 → 配分縮小またはパラメータ見直し');
  }

  var noTradeTeams = [];
  for (var n = 0; n < rankings.length; n++) {
    if (rankings[n].trades === 0 && rankings[n].efficiency !== -999) {
      noTradeTeams.push(rankings[n].team);
    }
  }
  if (noTradeTeams.length > 0) {
    lines.push('・取引0件のチーム: ' + noTradeTeams.join(', ') + ' → 戦略条件が厳しすぎる可能性。パラメータ緩和を検討');
  }

  var activeCount = 0;
  var totalPnl = 0;
  for (var ac = 0; ac < rankings.length; ac++) {
    if (rankings[ac].efficiency !== -999) {
      activeCount++;
      totalPnl += rankings[ac].pnl;
    }
  }
  lines.push('');
  lines.push('■ 全体サマリー');
  lines.push('─────────────────────────────');
  lines.push('稼働チーム数: ' + activeCount + ' / ' + activeTeams.length);
  lines.push('全チーム合計損益: ' + Math.round(totalPnl) + ' 円');

  if (totalPnl > 0) {
    lines.push('→ 全体として利益。効率の良いチームへの集中を検討。');
  } else if (totalPnl === 0) {
    lines.push('→ まだ取引データなし。各チームの稼働を確認。');
  } else {
    lines.push('→ 全体として損失。リスク管理を強化し、現金比率を上げることを推奨。');
  }

  return lines.join('\n');
}

/* ====================================================================
 * 4. 統合レポートシートにオート総括を出力
 * ==================================================================== */

function metaWriteIntegratedReport_() {
  var teamData = metaGetLatestTeamData_();
  var verdict = metaGenerateAutoVerdict_(teamData);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var reportSheet = ss.getSheetByName('META_オート総括');
  if (!reportSheet) {
    reportSheet = ss.insertSheet('META_オート総括');
  }
  reportSheet.clear();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var row = 1;

  reportSheet.getRange(row, 1).setValue('【META統合レポート — オート総括】').setFontWeight('bold');
  reportSheet.getRange(row, 1).setFontSize(14);
  row += 2;

  /* --- セクションA: 全チームサマリー比較表 --- */
  reportSheet.getRange(row, 1).setValue('■ 全チーム成績比較（最新）').setFontWeight('bold');
  row++;

  var headers = ['チーム', '期間', '取引数', '勝率%', 'PF', '純損益', '平均保有h', '判定', '更新日時'];
  reportSheet.getRange(row, 1, 1, headers.length).setValues([headers]);
  reportSheet.getRange(row, 1, 1, headers.length).setFontWeight('bold');
  row++;

  var rankings = [];
  var reportTeams = metaGetActiveTeams_();
  for (var i = 0; i < reportTeams.length; i++) {
    var team = reportTeams[i];
    var d = teamData[team];

    if (!d) {
      reportSheet.getRange(row, 1, 1, headers.length).setValues([[
        team, '-', 0, '-', '-', 0, '-', '未稼働', '-'
      ]]);
    } else {
      var verdict2 = '継続';
      if (d.trades === 0) verdict2 = '様子見';
      else if (d.winRate >= 50 && metaPfMeets_(d.pf, 1.5)) verdict2 = '▲ 増配推奨';
      else if (d.winRate >= 40 && metaPfMeets_(d.pf, 1.0)) verdict2 = '→ 継続';
      else if (d.winRate >= 30) verdict2 = '▼ 減配';
      else verdict2 = '× 停止検討';

      reportSheet.getRange(row, 1, 1, headers.length).setValues([[
        team, d.period, d.trades,
        d.winRate.toFixed(1), d.pf,
        d.pnlDisplay || Math.round(d.pnl) + '円',
        d.avgHoldH > 0 ? d.avgHoldH.toFixed(1) : '-',
        verdict2, d.time,
      ]]);
    }
    row++;
  }
  row++;

  /* --- セクションB: オート総括見解 --- */
  reportSheet.getRange(row, 1).setValue('■ オート総括見解').setFontWeight('bold');
  row++;

  var verdictLines = verdict.split('\n');
  for (var v = 0; v < verdictLines.length; v++) {
    reportSheet.getRange(row, 1).setValue(verdictLines[v]);
    row++;
  }

  reportSheet.setColumnWidth(1, 300);
  for (var c = 2; c <= headers.length; c++) {
    reportSheet.setColumnWidth(c, 120);
  }

  metaLog_('統合レポート + オート総括出力完了');
}

/* ====================================================================
 * 公開関数
 * ==================================================================== */

function metaRunIntegratedReport_() {
  metaWriteIntegratedReport_();
  metaUpdateLeagues_();
  metaRefreshGoNoGoSheet_();
}
