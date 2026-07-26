/**
 * リーグ順位・成績から数値調整を決定論的に計算
 * 助言テキスト（LeagueAdvisor）と併用。適用先は META_リーグ調整 シート
 */

var META_LEAGUE_ADJUST_SHEET = 'META_リーグ調整';

function metaClampNum_(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function metaClampAdjust_(adj) {
  adj.sizeMult = metaClampNum_(adj.sizeMult, 0.75, 1.0);
  adj.tpRatioDelta = metaClampNum_(adj.tpRatioDelta, -0.05, 0.05);
  adj.touchPctDelta = metaClampNum_(adj.touchPctDelta, -0.03, 0.05);
  return adj;
}

function metaLeagueGapPct_(row, block) {
  if (!block || !block.rows || !block.rows.length) return 0;
  var leader = null;
  for (var i = 0; i < block.rows.length; i++) {
    if (block.rows[i].qualified) {
      leader = block.rows[i];
      break;
    }
  }
  if (!leader) return 0;
  return (Number(row.pnlPct) || 0) - (Number(leader.pnlPct) || 0);
}

function metaTeamIsRange_(team) {
  return team === 'G' || team === 'G-FX' || team === 'G-CFX' || team === 'G-SAXO';
}

function metaTeamIsBreakout_(team) {
  return team === 'G-FFX' || team === 'G-CBO';
}

function metaTeamIsTrendFx_(team) {
  return (
    team === 'E-FX' ||
    team === 'F-FX' ||
    team === 'F-Short' ||
    team === 'F-Crypto' ||
    team === 'F-Index' ||
    team === 'C-FX' ||
    team === 'D-FX'
  );
}

/**
 * @return {{ sizeMult, tpRatioDelta, touchPctDelta, pauseNew, note, advice, appliedBy, gapPct }}
 */
function metaComputeLeagueAdjust_(row, block) {
  var advice = metaGenerateTeamAdvice_(row, block);
  var gapPct = metaLeagueGapPct_(row, block);
  var adj = {
    sizeMult: 1,
    tpRatioDelta: 0,
    touchPctDelta: 0,
    pauseNew: false,
    note: advice.summary,
    advice: advice,
    appliedBy: 'auto',
    gapPct: gapPct,
  };

  if (!row.qualified || (Number(row.trades) || 0) < META_LEAGUE_MIN_TRADES) {
    adj.note = '分析材料不足のため調整なし';
    return adj;
  }

  var wr = Number(row.winRate) || 0;
  var pf = metaLeaguePfNum_(row);
  var pnl = Number(row.pnlPct) || 0;
  var rank = row.rank;
  var qc = block ? block.qualifiedCount : 0;
  var team = row.team;
  var isRange = metaTeamIsRange_(team);
  var isBreakout = metaTeamIsBreakout_(team);
  var isTrend = metaTeamIsTrendFx_(team);

  if (pnl <= -10) {
    adj.pauseNew = true;
    adj.sizeMult = 0.8;
    adj.note = '大損週: 新規停止+ロット20%縮小';
    return metaClampAdjust_(adj);
  }

  if (pnl <= -8) {
    adj.sizeMult = 0.85;
    adj.note = '大損週: ロット15%縮小';
  } else if (pnl <= -3) {
    adj.sizeMult = 0.92;
  }

  if (qc >= 2 && rank === qc && gapPct <= -2) {
    adj.sizeMult = Math.min(adj.sizeMult, 0.9);
    adj.note += '｜最下位かつ1位差' + Math.abs(gapPct).toFixed(1) + '%';
    if (isRange) adj.touchPctDelta += 0.02;
  }

  if (wr >= 55 && !isNaN(pf) && pf < 1.0) {
    adj.tpRatioDelta = 0.02;
    adj.note += '｜勝率高PF低→利確延伸';
  }

  if (pnl < 0 && wr < 35) {
    if (isRange || isBreakout) {
      adj.tpRatioDelta = -0.02;
      adj.touchPctDelta += 0.02;
    }
    if (isTrend) {
      adj.sizeMult = Math.min(adj.sizeMult, 0.88);
    }
  }

  if (row.trades <= 5 && pnl >= 0 && rank !== 1) {
    if (isRange) adj.touchPctDelta -= 0.02;
  }

  if (rank === 1 && pnl >= 2 && !isNaN(pf) && pf >= 1.0) {
    adj.sizeMult = 1;
    adj.tpRatioDelta = 0;
    adj.touchPctDelta = 0;
    adj.note = '1位好調: 現行維持';
  }

  if (rank === 1 && pnl >= 0 && qc >= 2) {
    adj.sizeMult = 1;
  }

  // 1位との差が大きい → 追い上げ（エントリー・利確を戦略別に調整）
  if (qc >= 2 && rank > 1 && gapPct <= -5) {
    if (isRange || isBreakout) {
      adj.touchPctDelta -= 0.03;
      adj.tpRatioDelta -= 0.01;
    }
    if (isTrend) {
      adj.tpRatioDelta = Math.max(adj.tpRatioDelta, 0.02);
    }
    adj.sizeMult = Math.min(adj.sizeMult, 0.88);
    adj.note += '｜1位差' + Math.abs(gapPct).toFixed(1) + '%→追い上げ';
  } else if (qc >= 2 && rank > 1 && gapPct <= -3) {
    if (isRange || isBreakout) adj.touchPctDelta -= 0.02;
    adj.note += '｜1位差' + Math.abs(gapPct).toFixed(1) + '%→様子見強化';
  }

  if (!isNaN(pf) && pf < 0.75 && wr >= 50) {
    adj.tpRatioDelta = Math.max(adj.tpRatioDelta, 0.03);
    adj.note += '｜PF<' + pf.toFixed(2) + '→利確延伸';
  }

  if (pnl < 0 && rank > 1 && rank < qc) {
    adj.sizeMult = Math.min(adj.sizeMult, 0.95);
  }

  return metaClampAdjust_(adj);
}

function metaGetLeagueAdjustSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_LEAGUE_ADJUST_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_LEAGUE_ADJUST_SHEET);
    sheet.appendRow([
      '更新日時',
      'チーム',
      'リーグ',
      '週開始',
      '順位',
      '7日損益%',
      'gapPct',
      'sizeMult',
      'tpRatioDelta',
      'touchPctDelta',
      'pauseNew',
      'note',
      'appliedBy',
    ]);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function metaWriteLeagueAdjustSheet_(adjustRows) {
  var sheet = metaGetLeagueAdjustSheet_();
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).clearContent();
  }
  if (adjustRows.length > 0) {
    sheet.getRange(2, 1, adjustRows.length, 13).setValues(adjustRows);
  }
}
