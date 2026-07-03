/**
 * 銘柄ローテーション — 日中変動/trapStep↑ × 必要資金↓ を優先
 * ランキングはバッチ更新 + キャッシュ（GAS 6分制限対策）
 */

var J_RANK_CACHE_KEY = 'J_RANK_CACHE';
var J_RANK_OFFSET_KEY = 'J_RANK_OFFSET';

function jCalcSelectScore_(analysis) {
  if (!analysis || !analysis.dailyRangeOk || !analysis.levels || analysis.oneSetJpy <= 0) return 0;
  var trapPct = analysis.trapStep / analysis.last;
  var roundProfit = analysis.roundProfitMaker ? analysis.roundProfitMaker.netJpy : 0;
  var roundYield = roundProfit / analysis.oneSetJpy;
  var levelBonus = Math.sqrt(analysis.levels);
  var capitalPenalty = Math.sqrt(analysis.oneSetJpy / 1000);
  return (roundYield * levelBonus) / Math.max(0.001, capitalPenalty * trapPct);
}

function jEmptyRankStats_() {
  return { scanned: 0, rangeOk: 0, hasLevels: 0, dailyShort: 0, rangeNg: 0, errors: 0 };
}

function jLoadRankCache_() {
  var raw = PropertiesService.getScriptProperties().getProperty(J_RANK_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function jSaveRankCache_(cache) {
  PropertiesService.getScriptProperties().setProperty(J_RANK_CACHE_KEY, JSON.stringify(cache));
}

function jSortRankRows_(rows) {
  rows.sort(function (a, b) {
    var ar = a.moveStepRatio != null ? a.moveStepRatio : 0;
    var br = b.moveStepRatio != null ? b.moveStepRatio : 0;
    return (
      br - ar ||
      a.worstCaseJpy - b.worstCaseJpy ||
      a.oneSetJpy - b.oneSetJpy ||
      b.levels - a.levels ||
      a.trapStep - b.trapStep ||
      b.selectScore - a.selectScore
    );
  });
  return rows;
}

function jIsRankCacheFresh_(cache) {
  if (!cache || !cache.complete) return false;
  var ttl = (J_CONFIG.RANK_CACHE_TTL_SEC || 3600) * 1000;
  return cache.updatedAt && Date.now() - cache.updatedAt < ttl;
}

/**
 * 銘柄をバッチで分析しキャッシュを更新（タイムアウト手前で中断→続きは次回）
 */
function jRefreshRankCache_(cfg, opts) {
  opts = opts || {};
  cfg = cfg || jGetConfig_();
  var maxMs = opts.maxMs || J_CONFIG.RANK_BATCH_MAX_MS || 270000;
  var started = Date.now();

  jSyncInstrumentsFromApi_();
  var pairs = jAllPairs_().sort();
  var props = PropertiesService.getScriptProperties();
  var offset = Number(props.getProperty(J_RANK_OFFSET_KEY) || 0);
  if (offset >= pairs.length) offset = 0;

  var cache = jLoadRankCache_();
  if (!cache || offset === 0) {
    cache = {
      updatedAt: 0,
      complete: false,
      rows: [],
      stats: jEmptyRankStats_(),
      progress: 0,
      total: pairs.length,
    };
  }

  var stats = cache.stats || jEmptyRankStats_();
  var rows = cache.rows || [];

  for (var i = offset; i < pairs.length; i++) {
    if (Date.now() - started > maxMs) break;
    var pair = pairs[i];
    stats.scanned += 1;
    try {
      var a = jAnalyzePairCosts_(pair, cfg);
      if (!a.dailyRangeOk) {
        if (a.note && String(a.note).indexOf('日足不足') >= 0) stats.dailyShort += 1;
        else stats.rangeNg += 1;
      } else {
        stats.rangeOk += 1;
        if (a.levels > 0) {
          stats.hasLevels += 1;
          a.selectScore = Math.round(jCalcSelectScore_(a) * 10000) / 10000;
          rows.push(a);
        }
      }
    } catch (e) {
      stats.errors += 1;
      jLog_('rank skip ' + pair + ': ' + e.message);
    }
    offset = i + 1;
  }

  var complete = offset >= pairs.length;
  if (complete) {
    rows = jSortRankRows_(rows);
    props.deleteProperty(J_RANK_OFFSET_KEY);
  } else {
    props.setProperty(J_RANK_OFFSET_KEY, String(offset));
  }

  cache.rows = rows;
  cache.stats = stats;
  cache.complete = complete;
  cache.progress = offset;
  cache.total = pairs.length;
  cache.updatedAt = Date.now();
  jSaveRankCache_(cache);
  return cache;
}

function jRankCandidatePairs_(cfg, opts) {
  opts = opts || {};
  cfg = cfg || jGetConfig_();

  var cache = jLoadRankCache_();
  if (!opts.forceRefresh && jIsRankCacheFresh_(cache)) {
    cache.rows = jSortRankRows_(cache.rows || []);
    cache.rows._stats = cache.stats;
    return cache.rows;
  }

  cache = jRefreshRankCache_(cfg, opts);
  var rows = cache.rows || [];
  rows._stats = cache.stats;
  rows._cache = {
    complete: cache.complete,
    progress: cache.progress,
    total: cache.total,
    updatedAt: cache.updatedAt,
  };
  return rows;
}

/**
 * 口座 JPY 内で同時稼働可能な銘柄を選定
 */
function jPickPairsForBudget_(budgetJpy, cfg, activePairs) {
  cfg = cfg || jGetConfig_();
  var budget = Math.floor(budgetJpy * (cfg.accountBudgetPct || J_CONFIG.ACCOUNT_BUDGET_PCT));
  var ranked = jRankCandidatePairs_(cfg, { activePairs: activePairs || [] });
  var picked = [];
  var used = 0;
  var maxActive = cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  ranked.forEach(function (r) {
    if (picked.length >= maxActive) return;
    if (used + r.worstCaseJpy <= budget) {
      picked.push(r);
      used += r.worstCaseJpy;
    }
  });
  return {
    picked: picked,
    usedJpy: used,
    budgetJpy: budget,
    candidates: ranked.length,
    cache: ranked._cache,
  };
}

function jFormatRankRow_(r) {
  var fees = r.fees;
  var net = r.roundProfitMaker ? r.roundProfitMaker.netJpy : 0;
  return (
    r.pair +
    ' 変動=' +
    (r.moveStepRatio != null ? r.moveStepRatio + 'x' : '-') +
    ' 1セット=' +
    r.oneSetJpy +
    '円 間隔=' +
    r.trapStep +
    ' (' +
    (r.trapStepPct != null ? r.trapStepPct.toFixed(2) : '-') +
    '%) 本=' +
    r.levels +
    ' 日中幅=' +
    (r.intradayMoveJpy != null ? r.intradayMoveJpy : '-') +
    ' 1R(net/maker)=' +
    net +
    '円 最悪=' +
    r.worstCaseJpy +
    '円 [M' +
    jFormatFeePct_(fees.makerPct) +
    ' T' +
    jFormatFeePct_(fees.takerPct) +
    ']'
  );
}

function jClearRankCache_() {
  PropertiesService.getScriptProperties().deleteProperty(J_RANK_CACHE_KEY);
  PropertiesService.getScriptProperties().deleteProperty(J_RANK_OFFSET_KEY);
}

function jFormatRankCacheStatus_(cacheInfo) {
  if (!cacheInfo) return '';
  if (cacheInfo.complete) {
    var ageMin = Math.round((Date.now() - (cacheInfo.updatedAt || 0)) / 60000);
    return 'キャッシュ完了（' + ageMin + '分前）';
  }
  return '取得中 ' + (cacheInfo.progress || 0) + '/' + (cacheInfo.total || '?') + ' — もう一度実行で続き';
}

/**
 * 必要資金の少ない順にアクティブ銘柄を追加
 */
function jTryActivateNewPairs_(cfg, global) {
  var maxActive = cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  if (global.activePairs.length >= maxActive) return [];

  var exclude = (cfg.excludePairs || []).concat(global.activePairs).concat(global.dormantPairs);
  var ranked = jRankCandidatePairs_(cfg, { forceRefresh: false });
  var added = [];

  var budgetJpy = cfg.paperJpyDefault;
  if (!cfg.dryRun) {
    try {
      budgetJpy = jGetAssets_('jpy').jpy;
    } catch (e) {
      jLog_('残高取得失敗: ' + e.message);
      return [];
    }
  } else if (global.paperWallet) {
    budgetJpy = global.paperWallet.jpy;
  }

  var budgetCap = Math.floor(budgetJpy * (cfg.accountBudgetPct || 0.8));
  var used = 0;
  global.activePairs.forEach(function (p) {
    var st = jLoadState_(p);
    if (st.lastTrapStep && st.lastLevels) {
      var plan = { levels: st.lastLevels, trapStep: st.lastTrapStep, refDailyLow: st.refDailyLow };
      var amt = jResolveLevelAmount_(p, jGetTicker_(p).last, cfg.minLevelJpy);
      used += jCalcWorstCaseGridJpy_(p, jGetTicker_(p).last, plan, amt, cfg.feeRoleCapital);
    }
  });

  for (var i = 0; i < ranked.length; i++) {
    if (global.activePairs.length >= maxActive) break;
    var r = ranked[i];
    if (exclude.indexOf(r.pair) >= 0) continue;
    if (used + r.worstCaseJpy > budgetCap) continue;
    global.activePairs.push(r.pair);
    exclude.push(r.pair);
    used += r.worstCaseJpy;
    var st = jLoadState_(r.pair);
    if (!st.mode || st.mode === 'idle') {
      st.mode = 'active';
      jSaveState_(r.pair, st);
    }
    added.push(r.pair);
    jLog_(
      'アクティブ追加: ' +
        r.pair +
        ' 変動=' +
        (r.moveStepRatio != null ? r.moveStepRatio + 'x' : '-') +
        ' worst=' +
        r.worstCaseJpy +
        ' levels=' +
        r.levels
    );
  }
  return added;
}
