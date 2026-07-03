/**
 * カテゴリ別リーグ — 週次（7日間）純損益率で競争
 * 全チーム一律 LEAGUE_CAPITAL（既定50万円）換算
 */
var META_LEAGUE_SHEET = 'META_リーグ';
var META_LEAGUE_WEEK_SHEET = 'META_週次リーグ';

var META_LEAGUES = {
  L1: {
    id: 'L1',
    label: 'bitbank現物',
    teams: ['A', 'B'],
  },
  L2: {
    id: 'L2',
    label: 'FX紙',
    teams: ['E-FX', 'F-FX'],
  },
  L3: {
    id: 'L3',
    label: 'マルチ資産',
    teams: ['F-Short'],
  },
  L4: {
    id: 'L4',
    label: 'レンジ多資産',
    teams: ['G-SAXO'],
  },
  L5: {
    id: 'L5',
    label: 'ブレイクアウト',
    teams: ['G-FFX', 'G-CBO'],
  },
};

/** 順位対象の最低取引数（7日間） */
var META_LEAGUE_MIN_TRADES = 3;

function metaLeagueCapital_() {
  return Number(META_CONFIG.LEAGUE_CAPITAL_PER_TEAM || META_CONFIG.DUMMY_CAPITAL_PER_TEAM || 500000);
}

function metaGetTeam7dEntry_(teamData, team) {
  var d = teamData[team];
  if (!d) return null;
  var cap = metaLeagueCapital_();
  var pnlPct = d.pnlPct;
  if (pnlPct == null && cap > 0) {
    pnlPct = (d.pnl / cap) * 100;
  }
  return {
    team: team,
    trades: d.trades || 0,
    winRate: d.winRate || 0,
    pf: d.pf,
    pnl: d.pnl || 0,
    pnlPct: pnlPct != null ? pnlPct : 0,
    pnlDisplay: d.pnlDisplay || '',
    time: d.time || '',
  };
}

function metaBuildLeagueRankings_(teamData) {
  var result = {};
  var leagueIds = Object.keys(META_LEAGUES);
  for (var li = 0; li < leagueIds.length; li++) {
    var league = META_LEAGUES[leagueIds[li]];
    var rows = [];
    for (var ti = 0; ti < league.teams.length; ti++) {
      var team = league.teams[ti];
      if (metaIsTeamValidationPaused_(team)) continue;
      var entry = metaGetTeam7dEntry_(teamData, team);
      if (!entry) {
        rows.push({
          team: team,
          trades: 0,
          pnlPct: 0,
          pnl: 0,
          qualified: false,
          rank: null,
        });
        continue;
      }
      rows.push({
        team: team,
        trades: entry.trades,
        winRate: entry.winRate,
        pf: entry.pf,
        pfNum: entry.pfNum,
        pnlPct: entry.pnlPct,
        pnl: entry.pnl,
        pnlDisplay: entry.pnlDisplay,
        time: entry.time,
        qualified: entry.trades >= META_LEAGUE_MIN_TRADES,
        rank: null,
      });
    }
    rows.sort(function (a, b) {
      return b.pnlPct - a.pnlPct;
    });
    var rank = 0;
    for (var ri = 0; ri < rows.length; ri++) {
      if (rows[ri].qualified) {
        rank += 1;
        rows[ri].rank = rank;
      }
    }
    var leaderPct = 0;
    for (var lj = 0; lj < rows.length; lj++) {
      if (rows[lj].qualified) {
        leaderPct = rows[lj].pnlPct;
        break;
      }
    }
    var qualifiedCount = 0;
    for (var q = 0; q < rows.length; q++) {
      if (rows[q].qualified) qualifiedCount += 1;
    }
    result[league.id] = {
      league: league,
      rows: rows,
      leaderPct: leaderPct,
      qualifiedCount: qualifiedCount,
    };
  }
  return result;
}

function metaGetLeagueSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_LEAGUE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_LEAGUE_SHEET);
  }
  return sheet;
}

function metaGetLeagueWeekSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_LEAGUE_WEEK_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_LEAGUE_WEEK_SHEET);
    sheet.appendRow(['週開始', 'リーグ', '1位', '損益率%', '2位', '損益率%', '3位', '損益率%', 'メモ']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function metaWeekStartKey_(date) {
  var d = date || new Date();
  var tz = 'Asia/Tokyo';
  var day = Number(Utilities.formatDate(d, tz, 'u'));
  var mondayOffset = day === 7 ? -6 : 1 - day;
  var monday = new Date(d.getTime());
  monday.setDate(monday.getDate() + mondayOffset);
  return Utilities.formatDate(monday, tz, 'yyyy-MM-dd');
}

function metaWriteLeagueSheets_(rankings) {
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var weekStart = metaWeekStartKey_();
  var cap = metaLeagueCapital_();

  var leagueSheet = metaGetLeagueSheet_();
  leagueSheet.clear();
  var row = 1;
  leagueSheet.getRange(row, 1).setValue('META カテゴリ別リーグ（7日間・仮想資金 ' + cap.toLocaleString() + '円）');
  leagueSheet.getRange(row, 1).setFontWeight('bold');
  row += 1;
  leagueSheet.getRange(row, 1).setValue('更新: ' + now + '  週開始: ' + weekStart);
  row += 2;

  var adviceSheet = metaGetLeagueAdviceSheet_();
  if (adviceSheet.getLastRow() > 1) {
    adviceSheet.getRange(2, 1, adviceSheet.getLastRow() - 1, 16).clearContent();
  }
  var adviceRows = [];
  var adjustRows = [];

  var leagueIds = ['L1', 'L2', 'L3', 'L4', 'L5'];
  for (var li = 0; li < leagueIds.length; li++) {
    var lid = leagueIds[li];
    var block = rankings[lid];
    if (!block) continue;

    leagueSheet.getRange(row, 1).setValue('■ ' + lid + ' ' + block.league.label).setFontWeight('bold');
    row++;
    var headers = ['順位', 'チーム', '7日損益率%', '7日損益', '取引数', '勝率%', 'PF', '参加', 'オート助言'];
    leagueSheet.getRange(row, 1, 1, headers.length).setValues([headers]);
    leagueSheet.getRange(row, 1, 1, headers.length).setFontWeight('bold');
    row++;

    for (var ri = 0; ri < block.rows.length; ri++) {
      var r = block.rows[ri];
      var advice = metaGenerateTeamAdvice_(r, block);
      var tune = metaComputeLeagueAdjust_(r, block);
      var rankLabel = r.qualified ? String(r.rank) : '-';
      var adviceShort = advice.summary;
      if (advice.suggestions.length) {
        adviceShort += '｜' + advice.suggestions[0];
      }
      leagueSheet.getRange(row, 1, 1, headers.length).setValues([[
        rankLabel,
        r.team,
        r.pnlPct.toFixed(3),
        r.pnlDisplay || Math.round(r.pnl),
        r.trades,
        r.winRate ? r.winRate.toFixed(1) : '-',
        r.pf || '-',
        r.qualified ? '○' : '様子見',
        adviceShort,
      ]]);
      adviceRows.push([
        now,
        r.team,
        lid,
        weekStart,
        rankLabel,
        r.pnlPct.toFixed(3),
        r.trades,
        r.winRate ? r.winRate.toFixed(1) : '-',
        r.pf || '-',
        advice.priority,
        advice.summary,
        advice.suggestions.join('\n'),
        advice.candidates.join('\n'),
        advice.focus,
        '',
        advice.note,
      ]);
      adjustRows.push([
        now,
        r.team,
        lid,
        weekStart,
        rankLabel,
        r.pnlPct.toFixed(3),
        tune.gapPct != null ? tune.gapPct.toFixed(3) : '0',
        tune.sizeMult,
        tune.tpRatioDelta,
        tune.touchPctDelta,
        tune.pauseNew ? 'YES' : 'NO',
        tune.note,
        tune.appliedBy || 'auto',
      ]);
      row++;
    }
    row++;
  }

  if (adviceRows.length > 0) {
    adviceSheet.getRange(2, 1, adviceRows.length, 16).setValues(adviceRows);
  }
  metaWriteLeagueAdjustSheet_(adjustRows);

  metaLogLeagueAdviceSummary_(adviceRows, now);
  metaMaybeAppendWeekWinner_(rankings, weekStart);
}

function metaLogLeagueAdviceSummary_(adviceRows, updatedAt) {
  if (!adviceRows.length) return;
  var high = [];
  for (var i = 0; i < adviceRows.length; i++) {
    if (String(adviceRows[i][9]) === '高') {
      high.push(adviceRows[i][1] + ':' + adviceRows[i][10]);
    }
  }
  var msg = 'リーダー助言更新 ' + updatedAt;
  if (high.length) msg += ' 【要確認】' + high.join(' / ');
  metaAppendLog_('リーグ助言', msg);
}

function metaMaybeAppendWeekWinner_(rankings, weekStart) {
  var sheet = metaGetLeagueWeekSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === weekStart) return;
  }
  var leagueIds = ['L1', 'L2', 'L3', 'L4', 'L5'];
  for (var li = 0; li < leagueIds.length; li++) {
    var block = rankings[leagueIds[li]];
    if (!block || block.qualifiedCount === 0) continue;
    var top = [];
    for (var r = 0; r < block.rows.length && top.length < 3; r++) {
      if (block.rows[r].qualified) {
        top.push(block.rows[r]);
      }
    }
    sheet.appendRow([
      weekStart,
      leagueIds[li],
      top[0] ? top[0].team : '',
      top[0] ? top[0].pnlPct.toFixed(3) : '',
      top[1] ? top[1].team : '',
      top[1] ? top[1].pnlPct.toFixed(3) : '',
      top[2] ? top[2].team : '',
      top[2] ? top[2].pnlPct.toFixed(3) : '',
      '自動記録',
    ]);
  }
}

function metaUpdateLeagues_() {
  var teamData = metaGetLatestTeamData_();
  var rankings = metaBuildLeagueRankings_(teamData);
  metaWriteLeagueSheets_(rankings);
  metaLog_('リーグ更新完了 L1-L5 + 自動調整シート');
  return rankings;
}
