/**
 * 環境別基本配分 + 週次成績調整 → 100%正規化
 */
function metaBaseAllocation_(regimeKey) {
  var map = {
    range: META_CONFIG.ALLOC_RANGE,
    mixed: META_CONFIG.ALLOC_MIXED,
    trend_bull: META_CONFIG.ALLOC_TREND_BULL,
    trend_bear: META_CONFIG.ALLOC_TREND_BEAR,
    shock_down: META_CONFIG.ALLOC_SHOCK_DOWN,
    shock_up: META_CONFIG.ALLOC_SHOCK_UP,
    wait: META_CONFIG.ALLOC_MIXED,
  };
  return map[regimeKey] || META_CONFIG.ALLOC_MIXED;
}

function metaReadWeeklyScores_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('META_週次成績');
  if (!sheet || sheet.getLastRow() < 2) return null;

  var lastRow = sheet.getLastRow();
  var row = sheet.getRange(lastRow, 1, lastRow, 6).getValues()[0];
  var teams = ['A', 'B', 'C', 'D', 'E'];
  var scores = {};
  var hasAny = false;
  for (var i = 0; i < teams.length; i++) {
    var v = Number(row[i + 1]);
    if (!isNaN(v) && row[i + 1] !== '') {
      scores[teams[i]] = v;
      hasAny = true;
    }
  }
  return hasAny ? scores : null;
}

function metaApplyWeeklyAdjustment_(alloc, cfg) {
  var scores = metaReadWeeklyScores_();
  if (!scores) return { alloc: alloc, note: '週次成績なし→基本配分' };

  var teams = ['A', 'B', 'C', 'D', 'E'];
  var ranked = teams.slice().sort(function (a, b) {
    return (scores[b] || 0) - (scores[a] || 0);
  });
  var best = ranked[0];
  var worst = ranked[ranked.length - 1];
  var bonus = cfg.weeklyBonusPct;

  alloc[best] = (alloc[best] || 0) + bonus;
  alloc[worst] = (alloc[worst] || 0) - bonus;

  teams.forEach(function (t) {
    alloc[t] = Math.max(META_CONFIG.TEAM_ALLOC_MIN, Math.min(META_CONFIG.TEAM_ALLOC_MAX, alloc[t] || 0));
  });

  return {
    alloc: alloc,
    note: '週次調整: ' + best + ' +' + bonus + 'pt / ' + worst + ' -' + bonus + 'pt',
  };
}

function metaNormalizeAlloc_(alloc) {
  var keys = ['A', 'B', 'C', 'D', 'E', 'cash'];
  var sum = 0;
  keys.forEach(function (t) {
    alloc[t] = Math.max(0, Math.round(alloc[t] || 0));
    sum += alloc[t];
  });
  if (sum === 0) {
    return { A: 0, B: 0, C: 0, D: 0, E: 0, cash: 100 };
  }
  if (sum !== 100) {
    alloc.cash = (alloc.cash || 0) + (100 - sum);
    if (alloc.cash < 0) {
      var largest = 'A';
      ['A', 'B', 'C', 'D', 'E'].forEach(function (t) {
        if (alloc[t] > alloc[largest]) largest = t;
      });
      alloc[largest] += alloc.cash;
      alloc.cash = 0;
    }
  }
  return alloc;
}

function metaComputeAllocation_(regime, cfg) {
  var base = metaBaseAllocation_(regime.regimeKey);
  var alloc = {
    A: base.A,
    B: base.B,
    C: base.C,
    D: base.D,
    E: base.E,
    cash: base.cash,
  };

  var adj = metaApplyWeeklyAdjustment_(alloc, cfg);
  alloc = metaNormalizeAlloc_(adj.alloc);

  return {
    updatedAt: new Date().toISOString(),
    regimeKey: regime.regimeKey,
    regimeLabel: regime.regimeLabel,
    teams: {
      A: alloc.A,
      B: alloc.B,
      C: alloc.C,
      D: alloc.D,
      E: alloc.E,
    },
    cash: alloc.cash,
    detail: regime.detail,
    adjustmentNote: adj.note,
    recommendation:
      '環境「' +
      regime.regimeLabel +
      '」→ A' +
      alloc.A +
      '% B' +
      alloc.B +
      '% C' +
      alloc.C +
      '% D' +
      alloc.D +
      '% E' +
      alloc.E +
      '% 現金' +
      alloc.cash +
      '%',
    inactiveTeamsNote: 'C/D/E 未稼働時は該当配分を現金扱い推奨',
  };
}

function metaAllocationChanged_(prev, next) {
  if (!prev || !prev.teams) return true;
  var teams = ['A', 'B', 'C', 'D', 'E'];
  for (var i = 0; i < teams.length; i++) {
    var t = teams[i];
    if (Math.abs((prev.teams[t] || 0) - (next.teams[t] || 0)) >= 5) return true;
  }
  if (Math.abs((prev.cash || 0) - (next.cash || 0)) >= 5) return true;
  if (prev.regimeKey !== next.regimeKey) return true;
  return false;
}

function metaSuggestImprovements_(regime, allocation) {
  var lines = [];
  lines.push('【メタ層所見】' + allocation.recommendation);

  if (regime.regimeKey === 'range' || regime.regimeKey === 'mixed') {
    lines.push('→ トラリピ向き: チームB ' + allocation.teams.B + '% を優先。Aは環境切替でサポート。');
  } else if (regime.regimeKey === 'trend_bull') {
    lines.push(
      '→ 順張り向き: C+D+E = ' +
        (allocation.teams.C + allocation.teams.D + allocation.teams.E) +
        '%。C/D/E稼働を推奨。'
    );
  } else if (regime.regimeKey === 'trend_bear') {
    lines.push('→ 下降トレンド: 現金 ' + allocation.cash + '% を厚く。A/Bは縮小。');
  } else if (regime.regimeKey === 'shock_down') {
    lines.push('→ 急落: 全チーム最小。現金 ' + allocation.cash + '% 維持。');
  } else if (regime.regimeKey === 'shock_up') {
    lines.push('→ 急騰: 順張り C/D/E へ一時シフト。');
  }

  lines.push('【改善ループ】META_週次成績 に純損益を入力 → 自動 +/-5pt 調整。');
  return lines.join('\n');
}
