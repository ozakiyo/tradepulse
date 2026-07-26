/**
 * 銘柄ローテーション — 日中変動/trapStep↑ × 必要資金↓ を優先
 * ランキングはバッチ更新 + キャッシュ（GAS 6分制限対策）
 */

var J_RANK_CACHE_KEY = 'J_RANK_CACHE';
var J_RANK_OFFSET_KEY = 'J_RANK_OFFSET';
var J_RANK_SKIP_KEY = 'J_RANK_SKIP_LISTS';

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
  return {
    scanned: 0,
    rangeOk: 0,
    hasLevels: 0,
    dailyShort: 0,
    rangeNg: 0,
    monthlyDown: 0,
    errors: 0,
  };
}

function jEmptyRankSkipLists_() {
  return {
    monthlyDown: [],
    rangeNg: [],
    dailyShort: [],
    noLevels: [],
    errors: [],
  };
}

/** キャッシュ肥大防止: シート／選定に必要な項目だけ残す */
function jSlimRankRow_(a) {
  if (!a) return a;
  return {
    pair: a.pair,
    label: a.label,
    dailyRangeOk: !!a.dailyRangeOk,
    moveStepRatio: a.moveStepRatio,
    trapStep: a.trapStep,
    trapStepPct: a.trapStepPct,
    levels: a.levels,
    intradayMoveJpy: a.intradayMoveJpy,
    oneSetJpy: a.oneSetJpy,
    worstCaseJpy: a.worstCaseJpy,
    dailyWidthPct: a.dailyWidthPct,
    last: a.last,
    refDailyLow: a.refDailyLow,
    refDailyHigh: a.refDailyHigh,
    selectScore: a.selectScore,
    roundProfitMaker: a.roundProfitMaker
      ? { netJpy: a.roundProfitMaker.netJpy }
      : null,
    fees: a.fees
      ? { makerPct: a.fees.makerPct, takerPct: a.fees.takerPct }
      : null,
  };
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
  var props = PropertiesService.getScriptProperties();
  var slim = {
    updatedAt: cache.updatedAt,
    complete: cache.complete,
    progress: cache.progress,
    total: cache.total,
    topN: cache.topN,
    stats: cache.stats,
    rows: (cache.rows || []).map(jSlimRankRow_),
  };
  try {
    props.setProperty(J_RANK_CACHE_KEY, JSON.stringify(slim));
  } catch (e) {
    // それでも大きい場合は上位だけ
    slim.rows = jTakeTopRankRows_(slim.rows, J_CONFIG.RANK_TOP_N || 5);
    try {
      props.setProperty(J_RANK_CACHE_KEY, JSON.stringify(slim));
    } catch (e2) {
      jLog_('ランキングキャッシュ保存失敗: ' + (e2.message || e2));
    }
  }
}

function jNormalizeRankSkipLists_(parsed) {
  parsed = parsed || {};
  return {
    monthlyDown: parsed.monthlyDown || [],
    rangeNg: parsed.rangeNg || [],
    dailyShort: parsed.dailyShort || [],
    noLevels: parsed.noLevels || [],
    errors: parsed.errors || [],
  };
}

/** 理由を短くして Script Properties 9KB 制限を避ける */
function jSlimSkipListsForStore_(skipLists) {
  function slimArr_(arr) {
    return (arr || []).map(function (item) {
      if (!item) return { pair: '', reason: '' };
      if (typeof item === 'string') return { pair: item, reason: '' };
      return {
        pair: item.pair || '',
        reason: String(item.reason || '').slice(0, 80),
      };
    });
  }
  return {
    monthlyDown: slimArr_(skipLists.monthlyDown),
    rangeNg: slimArr_(skipLists.rangeNg),
    dailyShort: slimArr_(skipLists.dailyShort),
    noLevels: slimArr_(skipLists.noLevels),
    errors: slimArr_(skipLists.errors),
  };
}

function jLoadRankSkipLists_() {
  var raw = PropertiesService.getScriptProperties().getProperty(J_RANK_SKIP_KEY);
  if (!raw) {
    try {
      raw = CacheService.getScriptCache().get(J_RANK_SKIP_KEY);
    } catch (eCache) {
      raw = null;
    }
  }
  if (!raw) return jEmptyRankSkipLists_();
  try {
    return jNormalizeRankSkipLists_(JSON.parse(raw));
  } catch (e) {
    return jEmptyRankSkipLists_();
  }
}

function jSaveRankSkipLists_(skipLists) {
  var slim = jSlimSkipListsForStore_(skipLists || jEmptyRankSkipLists_());
  var json = JSON.stringify(slim);
  try {
    CacheService.getScriptCache().put(J_RANK_SKIP_KEY, json, 21600);
  } catch (eCache) {
    /* ignore */
  }
  try {
    if (json.length > 8500) {
      // Properties は 9KB/キー上限。大きい場合は件数の多いレンジNGを間引く
      slim.rangeNg = slim.rangeNg.slice(0, 80);
      slim.dailyShort = slim.dailyShort.slice(0, 40);
      json = JSON.stringify(slim);
    }
    if (json.length > 8500) {
      PropertiesService.getScriptProperties().deleteProperty(J_RANK_SKIP_KEY);
      jLog_('除外リストが大きいため Cache のみ保存 (' + json.length + '字)');
      return;
    }
    PropertiesService.getScriptProperties().setProperty(J_RANK_SKIP_KEY, json);
  } catch (e) {
    jLog_('除外リスト保存失敗: ' + (e.message || e));
  }
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

/** 上位 N 件だけ残す（選定・表示用） */
function jTakeTopRankRows_(rows, topN) {
  topN = topN != null ? topN : J_CONFIG.RANK_TOP_N || 5;
  if (!rows || !rows.length || rows.length <= topN) return rows || [];
  return rows.slice(0, topN);
}

function jIsRankCacheFresh_(cache) {
  if (!cache || !cache.complete) return false;
  var ttl = (J_CONFIG.RANK_CACHE_TTL_SEC || 3600) * 1000;
  return cache.updatedAt && Date.now() - cache.updatedAt < ttl;
}

/**
 * 銘柄をバッチで分析しキャッシュを更新（タイムアウト手前で中断→続きは次回）
 * 全件スキャン後は上位 RANK_TOP_N 件だけ保持
 */
function jRefreshRankCache_(cfg, opts) {
  opts = opts || {};
  cfg = cfg || jGetConfig_();
  var maxMs = opts.maxMs || J_CONFIG.RANK_BATCH_MAX_MS || 270000;
  var topN = J_CONFIG.RANK_TOP_N || 5;
  var started = Date.now();

  jEnsureInstrumentsSyncedDaily_();
  var excluded = {};
  (cfg.excludePairs || []).forEach(function (p) {
    excluded[String(p).toLowerCase()] = true;
  });
  var pairs = jAllPairs_()
    .filter(function (p) {
      return !excluded[String(p).toLowerCase()];
    })
    .sort();
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
      skipLists: jEmptyRankSkipLists_(),
      progress: 0,
      total: pairs.length,
    };
  }

  var stats = cache.stats || jEmptyRankStats_();
  var rows = cache.rows || [];
  var skipLists = cache.skipLists || jLoadRankSkipLists_();
  if (!cache.skipLists) cache.skipLists = skipLists;

  for (var i = offset; i < pairs.length; i++) {
    if (Date.now() - started > maxMs) break;
    var pair = pairs[i];
    stats.scanned += 1;
    try {
      var a = jAnalyzePairCosts_(pair, cfg);
      if (!a.dailyRangeOk) {
        if (a.note && String(a.note).indexOf('日足不足') >= 0) {
          stats.dailyShort += 1;
          skipLists.dailyShort.push({ pair: pair, reason: String(a.note || '日足不足') });
        } else {
          stats.rangeNg += 1;
          skipLists.rangeNg.push({ pair: pair, reason: String(a.note || 'レンジNG') });
        }
      } else {
        var mt = jEvaluateMonthlyRegime_(pair, cfg);
        if (mt.excluded) {
          stats.monthlyDown += 1;
          skipLists.monthlyDown.push({ pair: pair, reason: String(mt.note || '月足↓') });
          jLog_('rank skip ' + pair + ': 月足↓除外');
        } else {
          stats.rangeOk += 1;
          if (a.levels > 0) {
            stats.hasLevels += 1;
            a.selectScore = Math.round(jCalcSelectScore_(a) * 10000) / 10000;
            rows.push(jSlimRankRow_(a));
          } else {
            skipLists.noLevels.push({ pair: pair, reason: 'グリッド本数0' });
          }
        }
      }
    } catch (e) {
      stats.errors += 1;
      skipLists.errors.push({ pair: pair, reason: String(e.message || e).slice(0, 120) });
      jLog_('rank skip ' + pair + ': ' + e.message);
    }
    offset = i + 1;
  }

  var complete = offset >= pairs.length;
  if (complete) {
    rows = jTakeTopRankRows_(jSortRankRows_(rows), topN);
    props.deleteProperty(J_RANK_OFFSET_KEY);
    jLog_(
      'ランキング完了: 上位' +
        rows.length +
        '/' +
        topN +
        '件 / 月足↓' +
        skipLists.monthlyDown.length +
        ' / レンジNG' +
        skipLists.rangeNg.length
    );
  } else {
    props.setProperty(J_RANK_OFFSET_KEY, String(offset));
  }

  cache.rows = rows;
  cache.stats = stats;
  cache.skipLists = skipLists;
  cache.complete = complete;
  cache.progress = offset;
  cache.total = pairs.length;
  cache.topN = topN;
  cache.updatedAt = Date.now();
  jSaveRankSkipLists_(skipLists);
  jSaveRankCache_(cache);
  try {
    jWriteRankSheet_(rows, { stats: stats, cache: cache, cfg: cfg, skipLists: skipLists });
  } catch (eSheet) {
    jLog_('J_ランキング書込失敗: ' + (eSheet.message || eSheet));
  }
  return cache;
}

function jRankCandidatePairs_(cfg, opts) {
  opts = opts || {};
  cfg = cfg || jGetConfig_();
  var topN = J_CONFIG.RANK_TOP_N || 5;

  var cache = jLoadRankCache_();
  if (!opts.forceRefresh && jIsRankCacheFresh_(cache)) {
    var freshSkip = (cache && cache.skipLists) || jLoadRankSkipLists_();
    var freshRows = jTakeTopRankRows_(jSortRankRows_(cache.rows || []), topN);
    freshRows._stats = cache.stats;
    freshRows._cache = {
      complete: true,
      progress: cache.progress || cache.total,
      total: cache.total,
      updatedAt: cache.updatedAt,
      topN: topN,
      skipLists: freshSkip,
    };
    return freshRows;
  }

  cache = jRefreshRankCache_(cfg, opts);
  var rows = cache.rows || [];
  if (cache.complete) rows = jTakeTopRankRows_(jSortRankRows_(rows), topN);
  else rows = jSortRankRows_(rows.slice());
  rows._stats = cache.stats;
  rows._cache = {
    complete: cache.complete,
    progress: cache.progress,
    total: cache.total,
    updatedAt: cache.updatedAt,
    topN: topN,
    skipLists: cache.skipLists || jLoadRankSkipLists_(),
  };
  return rows;
}

/**
 * 口座 JPY 内で同時稼働可能な銘柄を選定
 */
function jPickPairsForBudget_(budgetJpy, cfg, activePairs, global) {
  cfg = cfg || jGetConfig_();
  var budget;
  var pairSlot;
  if (cfg.autoLotSizing) {
    var snap = jCalcTrapCapitalSnapshot_(cfg, global || jLoadGlobalState_());
    pairSlot = jGetPairBudgetCap_(cfg, snap);
    budget = pairSlot * (cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS);
  } else {
    budget = Math.floor(budgetJpy * (cfg.accountBudgetPct || J_CONFIG.ACCOUNT_BUDGET_PCT));
    pairSlot =
      (cfg.pairBudgetJpy > 0 ? cfg.pairBudgetJpy : null) ||
      Math.floor(budget / (cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS));
  }
  var ranked = jRankCandidatePairs_(cfg, { activePairs: activePairs || [] });
  var picked = [];
  var used = 0;
  var maxActive = cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  ranked.forEach(function (r) {
    if (picked.length >= maxActive) return;
    if (cfg.autoLotSizing) jRefreshRankRowWorstCase_(r, cfg);
    if (r.worstCaseJpy > pairSlot) return;
    if (used + pairSlot <= budget) {
      picked.push(r);
      used += pairSlot;
    }
  });
  return {
    picked: picked,
    usedJpy: used,
    budgetJpy: budget,
    pairSlotJpy: pairSlot,
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
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(J_RANK_CACHE_KEY);
  props.deleteProperty(J_RANK_OFFSET_KEY);
  props.deleteProperty(J_RANK_SKIP_KEY);
  try {
    CacheService.getScriptCache().remove(J_RANK_SKIP_KEY);
  } catch (e) {
    /* ignore */
  }
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
 * 日足レンジOK候補のうち、変動倍率上位 N 銘柄に含まれるか
 * （再開条件: 上位 MAX_ACTIVE_PAIRS 必須）
 */
function jIsPairInTopRanked_(pair, cfg, limit) {
  cfg = cfg || jGetConfig_();
  var pri = (cfg.priorityPair || J_CONFIG.PRIORITY_PAIR || 'btc_jpy').toLowerCase();
  // 優先銘柄はランク外でも再開対象（レンジは呼び出し側で判定）
  if (pri && String(pair || '').toLowerCase() === pri) return true;
  limit = limit != null ? limit : cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  var ranked = jRankCandidatePairs_(cfg, { forceRefresh: false });
  if (!ranked || !ranked.length) return false;
  var n = Math.min(limit, ranked.length);
  for (var i = 0; i < n; i++) {
    if (ranked[i].pair === pair) return true;
  }
  return false;
}

function jCountBtcActive_(pairs) {
  var n = 0;
  (pairs || []).forEach(function (p) {
    if (p === 'btc_jpy') n += 1;
  });
  return n;
}

/** 新規アクティブ化の除外リスト（休眠は jTryReopenDormant_ で再開） */
function jListActivationExcluded_(cfg, global) {
  return (cfg.excludePairs || [])
    .slice()
    .concat(global.activePairs || [])
    .concat(global.dormantPairs || []);
}

function jPrepareReactivatedPairState_(st) {
  jClearEntryBox_(st);
  st.mode = 'active';
  st.settled = false;
  st.gridLots = [];
  st.lastTrapStep = null;
  st.lastLevels = null;
  st.lastRebuildAt = null;
}

/**
 * 変動上位からアクティブ銘柄を追加
 */
function jTryActivateNewPairs_(cfg, global) {
  var maxActive = cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  if (global.activePairs.length >= maxActive) return [];

  var maxBtc = J_CONFIG.MAX_BTC_ACTIVE_PAIRS != null ? J_CONFIG.MAX_BTC_ACTIVE_PAIRS : 1;
  var exclude = jListActivationExcluded_(cfg, global);
  var ranked = jRankCandidatePairs_(cfg, { forceRefresh: false });
  if (ranked._cache && !ranked._cache.complete && global.activePairs.length === 0) {
    jRefreshRankCache_(cfg);
    ranked = jRankCandidatePairs_(cfg, { forceRefresh: false });
  }
  if (ranked._cache && !ranked._cache.complete) {
    jLog_(
      'ランキング取得中 ' +
        (ranked._cache.progress || 0) +
        '/' +
        (ranked._cache.total || '?') +
        ' — 選定は暫定'
    );
  }
  var added = [];

  var budgetJpy;
  try {
    budgetJpy = jGetAccountBudgetJpy_(cfg, global);
  } catch (e) {
    jLog_('残高取得失敗: ' + e.message);
    return [];
  }

  var budgetCap;
  var pairSlot;
  var snapAlloc = null;
  if (cfg.autoLotSizing) {
    snapAlloc = global.capitalSnapshot || jCalcTrapCapitalSnapshot_(cfg, global);
    pairSlot = jGetPairBudgetCap_(cfg, snapAlloc);
    budgetCap = pairSlot * maxActive;
  } else {
    budgetCap = Math.floor(budgetJpy * (cfg.accountBudgetPct || J_CONFIG.ACCOUNT_BUDGET_PCT));
    pairSlot =
      (cfg.pairBudgetJpy > 0 ? cfg.pairBudgetJpy : null) ||
      (maxActive > 0 ? Math.floor(budgetCap / maxActive) : budgetCap);
  }
  /** 稼働枠は固定スロット消費（1銘柄が実ワーストで全枠を食わない） */
  var used = (global.activePairs || []).length * pairSlot;
  var btcSlots = jCountBtcActive_(global.activePairs);

  // 日足レンジ有効な PRIORITY_PAIR（既定 btc_jpy）を他銘柄より先に枠へ
  var pri = jTryActivatePriorityPair_(cfg, global, {
    exclude: exclude,
    maxActive: maxActive,
    maxBtc: maxBtc,
    pairSlot: pairSlot,
    budgetCap: budgetCap,
    used: used,
    btcSlots: btcSlots,
  });
  if (pri) {
    added.push(pri.pair);
    used = pri.used;
    btcSlots = pri.btcSlots;
    exclude = pri.exclude;
  }

  if (global.activePairs.length >= maxActive) return added;

  ranked = jPreferPriorityInRanked_(ranked, cfg);
  for (var i = 0; i < ranked.length; i++) {
    if (global.activePairs.length >= maxActive) break;
    var r = ranked[i];
    if (cfg.autoLotSizing) jRefreshRankRowWorstCase_(r, cfg);
    if (exclude.indexOf(r.pair) >= 0) continue;
    if (jIsMonthlyDownExcluded_(r.pair, cfg)) {
      jLog_('月足↓除外スキップ: ' + r.pair);
      continue;
    }
    if (r.pair === 'btc_jpy' && btcSlots >= maxBtc) continue;
    if (r.worstCaseJpy > pairSlot) {
      jLog_(
        '銘柄枠超過スキップ: ' +
          r.pair +
          ' worst=' +
          r.worstCaseJpy +
          ' > 枠' +
          pairSlot
      );
      continue;
    }
    if (used + pairSlot > budgetCap) {
      jLog_(
        '予算超過スキップ: ' +
          r.pair +
          ' slot=' +
          pairSlot +
          ' used=' +
          used +
          ' cap=' +
          budgetCap
      );
      continue;
    }
    global.activePairs.push(r.pair);
    exclude.push(r.pair);
    used += pairSlot;
    if (r.pair === 'btc_jpy') btcSlots += 1;

    var dIdx = global.dormantPairs.indexOf(r.pair);
    if (dIdx >= 0) global.dormantPairs.splice(dIdx, 1);

    var st = jLoadState_(r.pair);
    if (st.mode === 'dormant' || st.mode === 'idle' || !st.mode) {
      jPrepareReactivatedPairState_(st);
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
        ' 枠=' +
        pairSlot +
        ' levels=' +
        r.levels
    );
  }
  return added;
}

/** ランク候補内の PRIORITY_PAIR を先頭へ */
function jPreferPriorityInRanked_(ranked, cfg) {
  var pair = ((cfg && cfg.priorityPair) || J_CONFIG.PRIORITY_PAIR || 'btc_jpy').toLowerCase();
  if (!ranked || !ranked.length || !pair) return ranked || [];
  var idx = -1;
  for (var i = 0; i < ranked.length; i++) {
    if (ranked[i] && ranked[i].pair === pair) {
      idx = i;
      break;
    }
  }
  if (idx <= 0) return ranked;
  var copy = ranked.slice();
  var row = copy.splice(idx, 1)[0];
  copy.unshift(row);
  return copy;
}

/**
 * 日足レンジ有効なら PRIORITY_PAIR を他銘柄より先にアクティブへ入れる
 * @return {{pair:string, used:number, btcSlots:number, exclude:string[]}|null}
 */
function jTryActivatePriorityPair_(cfg, global, ctx) {
  cfg = cfg || jGetConfig_();
  ctx = ctx || {};
  var pair = (cfg.priorityPair || J_CONFIG.PRIORITY_PAIR || 'btc_jpy').toLowerCase();
  if (!pair) return null;

  var exclude = (ctx.exclude || []).slice();
  var maxActive = ctx.maxActive != null ? ctx.maxActive : cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  var maxBtc = ctx.maxBtc != null ? ctx.maxBtc : J_CONFIG.MAX_BTC_ACTIVE_PAIRS != null ? J_CONFIG.MAX_BTC_ACTIVE_PAIRS : 1;
  var pairSlot = ctx.pairSlot;
  var budgetCap = ctx.budgetCap;
  var used = ctx.used != null ? ctx.used : 0;
  var btcSlots = ctx.btcSlots != null ? ctx.btcSlots : jCountBtcActive_(global.activePairs);

  if ((global.activePairs || []).indexOf(pair) >= 0) return null;
  if (exclude.indexOf(pair) >= 0) return null;
  if ((global.activePairs || []).length >= maxActive) return null;
  if (pair === 'btc_jpy' && btcSlots >= maxBtc) {
    jLog_('優先銘柄見送り: ' + pair + ' BTC枠満杯 (' + btcSlots + '/' + maxBtc + ')');
    return null;
  }

  var analysis;
  try {
    analysis = jAnalyzePairCosts_(pair, cfg);
  } catch (e) {
    jLog_('優先銘柄分析失敗: ' + pair + ' ' + (e.message || e));
    return null;
  }
  if (!analysis || !analysis.dailyRangeOk) {
    jLog_('優先銘柄見送り: ' + pair + ' レンジ無効 ' + ((analysis && analysis.note) || ''));
    return null;
  }
  if (jIsMonthlyDownExcluded_(pair, cfg)) {
    jLog_('優先銘柄見送り: ' + pair + ' 月足↓除外');
    return null;
  }
  if (cfg.autoLotSizing) {
    // ロット再計算後の worst を使う（ランク行と同様）
    try {
      jRefreshRankRowWorstCase_(analysis, cfg);
    } catch (e2) {
      /* analysis の worstCaseJpy のまま */
    }
  }
  if (analysis.worstCaseJpy > pairSlot) {
    jLog_(
      '優先銘柄見送り: ' +
        pair +
        ' worst=' +
        analysis.worstCaseJpy +
        ' > 枠' +
        pairSlot
    );
    return null;
  }
  if (used + pairSlot > budgetCap) {
    jLog_(
      '優先銘柄見送り: ' +
        pair +
        ' 予算超過 slot=' +
        pairSlot +
        ' used=' +
        used +
        ' cap=' +
        budgetCap
    );
    return null;
  }

  global.activePairs.unshift(pair);
  exclude.push(pair);
  used += pairSlot;
  if (pair === 'btc_jpy') btcSlots += 1;

  var dIdx = (global.dormantPairs || []).indexOf(pair);
  if (dIdx >= 0) global.dormantPairs.splice(dIdx, 1);

  var st = jLoadState_(pair);
  if (st.mode === 'dormant' || st.mode === 'idle' || !st.mode) {
    jPrepareReactivatedPairState_(st);
    jSaveState_(pair, st);
  }
  jLog_(
    '優先アクティブ: ' +
      pair +
      ' 変動=' +
      (analysis.moveStepRatio != null ? analysis.moveStepRatio + 'x' : '-') +
      ' worst=' +
      analysis.worstCaseJpy +
      ' 枠=' +
      pairSlot +
      ' levels=' +
      analysis.levels
  );
  return { pair: pair, used: used, btcSlots: btcSlots, exclude: exclude };
}
