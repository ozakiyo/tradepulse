/**
 * TEAM-K ランキング
 * 原則: 当日の K_トレンド スナップショットから組み立て（二重スキャンしない）
 * スナップ未完了時のみフォールバックで分割スキャン
 */

var K_RANK_CACHE_KEY = 'K_RANK_CACHE';
var K_RANK_OFFSET_KEY = 'K_RANK_OFFSET';

function kLoadRankCache_() {
  var raw = PropertiesService.getScriptProperties().getProperty(K_RANK_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function kSaveRankCache_(cache) {
  PropertiesService.getScriptProperties().setProperty(K_RANK_CACHE_KEY, JSON.stringify(cache));
}

function kIsRankCacheFresh_(cache) {
  if (!cache || !cache.complete) return false;
  var ttl = (K_CONFIG.RANK_CACHE_TTL_SEC || 86400) * 1000;
  return cache.updatedAt && Date.now() - cache.updatedAt < ttl;
}

function kScoreFromRegime_(up, last) {
  var score = 0;
  if (!up || up.isDailyDown) return score;
  var sma = up.sma || last;
  score = sma > 0 && last != null ? (sma - last) / sma : 0;
  if (up.allowEntry) score += 0.05;
  return score;
}

function kAnalyzePairForRank_(pair, cfg, upHint) {
  cfg = cfg || kGetConfig_();
  var longTerm = kEvaluateLongTermRegime_(pair, cfg);
  var up = upHint || kEvaluateUpRegime_(pair, cfg);
  var ticker;
  try {
    ticker = kGetTicker_(pair);
  } catch (e) {
    ticker = { last: up.lastClose };
  }
  var last = ticker && ticker.last != null ? ticker.last : up.lastClose;

  var liq = kCheckLiquidity_(pair, cfg, ticker);
  if (!liq.ok) {
    return {
      pair: pair,
      ok: false,
      allowEntry: false,
      excludedLong: !!longTerm.excluded,
      thinBook: true,
      note: liq.reason + ' | ' + (up.note || ''),
      score: -1,
      entryNeedJpy: null,
      volumeJpy: liq.volumeJpy,
      spreadPct: liq.spreadPct,
    };
  }

  var entryJpy = cfg.entryJpy != null ? cfg.entryJpy : K_CONFIG.ENTRY_JPY;
  var need = kCalcEntryNeedJpy_(pair, last, entryJpy, cfg.feeRoleCapital);
  var dailyDown = !!(up.isDailyDown || up.regime === 'daily_down');
  // 監視: 日足ダウン以外（長期↓も監視枠に入れる。BUYは Strategy で禁止）
  return {
    pair: pair,
    ok: !dailyDown,
    allowEntry: !!up.allowEntry && !longTerm.excluded,
    excludedLong: !!longTerm.excluded,
    thinBook: false,
    regime: up.regime,
    note: (up.note || '') + ' | HTF:' + longTerm.note,
    score: kScoreFromRegime_(up, last) - (longTerm.excluded ? 0.1 : 0),
    last: last,
    sma: up.sma,
    entryNeedJpy: need.needJpy,
    entryAmount: need.amount,
    volumeJpy: liq.volumeJpy,
    spreadPct: liq.spreadPct,
  };
}

/** トレンドスナップショットからランク行を構築（本命ルート） */
function kBuildRankFromTrendSnapshot_(cfg, opts) {
  opts = opts || {};
  cfg = cfg || kGetConfig_();
  var topN = K_CONFIG.RANK_TOP_N || 15;
  var snap = kLoadTrendSnapshot_();
  if (!snap || !snap.complete || snap.ymd !== kTodayYmd_() || !snap.pairs) {
    return null;
  }

  var rows = [];
  var excluded = 0;
  var thinSkipped = 0;
  var labels = Object.keys(snap.pairs).sort();
  for (var i = 0; i < labels.length; i++) {
    var pair = labels[i];
    if ((cfg.excludePairs || []).indexOf(pair) >= 0) continue;
    var p = snap.pairs[pair];
    // 監視は広く: 日足ダウン以外を候補（BUY可に限定しない）
    if (!p || p.isDailyDown) continue;
    try {
      var upHint = {
        pair: pair,
        allowEntry: !!p.allowEntry,
        regime: p.regime,
        note: p.note,
        sma: p.sma,
        lastClose: p.lastClose,
        isDailyDown: !!p.isDailyDown,
        downtrendCleared: p.downtrendCleared,
      };
      var a = kAnalyzePairForRank_(pair, cfg, upHint);
      if (a.thinBook) thinSkipped += 1;
      else if (a.excludedLong) excluded += 1; // 監視候補には入れる（件数だけ記録）
      if (a.ok) rows.push(a);
    } catch (e) {
      kLog_('rank-from-trend skip ' + pair + ': ' + (e.message || e));
    }
  }

  rows.sort(function (a, b) {
    var ea = a.allowEntry ? 1 : 0;
    var eb = b.allowEntry ? 1 : 0;
    if (ea !== eb) return eb - ea;
    var la = a.excludedLong ? 0 : 1;
    var lb = b.excludedLong ? 0 : 1;
    if (la !== lb) return lb - la;
    var na = a.entryNeedJpy != null ? a.entryNeedJpy : 1e15;
    var nb = b.entryNeedJpy != null ? b.entryNeedJpy : 1e15;
    if (na !== nb) return na - nb;
    return (b.score || 0) - (a.score || 0);
  });
  rows = rows.slice(0, topN);

  var cache = {
    updatedAt: Date.now(),
    complete: true,
    rows: rows,
    excluded: excluded,
    thinSkipped: thinSkipped,
    progress: labels.length,
    total: labels.length,
    source: 'trend_snapshot',
  };
  kSaveRankCache_(cache);
  PropertiesService.getScriptProperties().deleteProperty(K_RANK_OFFSET_KEY);
  kLog_(
    'Kランキング（トレンド共用）: 上位' +
      rows.length +
      ' 長期除外' +
      excluded +
      ' 薄い板除外' +
      thinSkipped
  );
  return cache;
}

function kRefreshRankCache_(cfg, opts) {
  opts = opts || {};
  cfg = cfg || kGetConfig_();

  // C: 当日トレンド完了ならそこから構築（二重の全日足スキャンをしない）
  if (!opts.forceScan) {
    var fromTrend = kBuildRankFromTrendSnapshot_(cfg, opts);
    if (fromTrend) return fromTrend;
  }

  // スナップ未完了時: トレンド更新を1バッチ進め、再試行
  if (!opts.forceScan) {
    try {
      var tr = kUpdateTrendSheetDaily_(cfg, { force: false });
      if (tr && tr.done) {
        var again = kBuildRankFromTrendSnapshot_(cfg, opts);
        if (again) return again;
      }
    } catch (e) {
      kLog_('rank: trend nudge failed: ' + (e.message || e));
    }
  }

  // フォールバック: 従来の分割スキャン（日足キャッシュAが効く）
  var maxMs = opts.maxMs || K_CONFIG.RANK_BATCH_MAX_MS || 180000;
  var topN = K_CONFIG.RANK_TOP_N || 15;
  var started = Date.now();
  kEnsureInstrumentsSyncedDaily_();
  var pairs = kAllPairs_().sort();
  var props = PropertiesService.getScriptProperties();
  var offset = Number(props.getProperty(K_RANK_OFFSET_KEY) || 0);
  if (offset >= pairs.length) offset = 0;

  var cache = kLoadRankCache_();
  if (!cache || offset === 0) {
    cache = {
      updatedAt: 0,
      complete: false,
      rows: [],
      excluded: 0,
      progress: 0,
      total: pairs.length,
      source: 'scan_fallback',
    };
  }
  var rows = cache.rows || [];
  var excluded = cache.excluded || 0;

  for (var i = offset; i < pairs.length; i++) {
    if (Date.now() - started > maxMs) break;
    var pair = pairs[i];
    if ((cfg.excludePairs || []).indexOf(pair) >= 0) {
      offset = i + 1;
      continue;
    }
    try {
      var a = kAnalyzePairForRank_(pair, cfg);
      if (a.excludedLong) excluded += 1;
      else if (a.ok) rows.push(a);
    } catch (e2) {
      kLog_('rank skip ' + pair + ': ' + (e2.message || e2));
    }
    offset = i + 1;
  }

  var complete = offset >= pairs.length;
  if (complete) {
    rows.sort(function (a, b) {
      var na = a.entryNeedJpy != null ? a.entryNeedJpy : 1e15;
      var nb = b.entryNeedJpy != null ? b.entryNeedJpy : 1e15;
      if (na !== nb) return na - nb;
      return (b.score || 0) - (a.score || 0);
    });
    rows = rows.slice(0, topN);
    props.deleteProperty(K_RANK_OFFSET_KEY);
    kLog_('Kランキング完了(フォールバックスキャン): 上位' + rows.length);
  } else {
    props.setProperty(K_RANK_OFFSET_KEY, String(offset));
  }

  cache.rows = rows;
  cache.excluded = excluded;
  cache.complete = complete;
  cache.progress = offset;
  cache.total = pairs.length;
  cache.updatedAt = Date.now();
  cache.source = 'scan_fallback';
  kSaveRankCache_(cache);
  return cache;
}

function kRankCandidatePairs_(cfg, opts) {
  opts = opts || {};
  cfg = cfg || kGetConfig_();
  var cache = kLoadRankCache_();
  if (!opts.forceRefresh && kIsRankCacheFresh_(cache)) {
    return cache.rows || [];
  }
  cache = kRefreshRankCache_(cfg, opts);
  var rows = cache.rows || [];
  rows._cache = {
    complete: cache.complete,
    progress: cache.progress,
    total: cache.total,
    updatedAt: cache.updatedAt,
    excluded: cache.excluded,
    source: cache.source,
  };
  return rows;
}

function kTryActivateNewPairs_(cfg, global) {
  cfg = cfg || kGetConfig_();
  var maxActive = cfg.maxActivePairs || K_CONFIG.MAX_ACTIVE_PAIRS;
  if ((global.activePairs || []).length >= maxActive) return [];

  var added = [];
  var pri = kTryActivatePriorityPair_(cfg, global);
  if (pri) added.push(pri);

  if ((global.activePairs || []).length >= maxActive) return added;

  var ranked = kRankCandidatePairs_(cfg, { forceRefresh: false });
  if ((!ranked || !ranked.length) && (!ranked._cache || !ranked._cache.complete)) {
    kRefreshRankCache_(cfg);
    ranked = kRankCandidatePairs_(cfg, { forceRefresh: false });
  }
  // 優先銘柄がランクにあれば先頭へ
  ranked = kPreferPriorityInRanked_(ranked, cfg);

  var exclude = (cfg.excludePairs || [])
    .slice()
    .concat(global.activePairs || [])
    .concat(global.dormantPairs || []);
  var avail = kGetAvailableDeployJpy_(cfg, global);
  var entryJpy = cfg.entryJpy != null ? cfg.entryJpy : K_CONFIG.ENTRY_JPY;

  for (var i = 0; i < ranked.length; i++) {
    if (global.activePairs.length >= maxActive) break;
    if (avail <= 0) break;
    var r = ranked[i];
    if (!r.ok) continue;
    if (exclude.indexOf(r.pair) >= 0) continue;
    // 長期↓は監視OK（BUYは Strategy 側で禁止）

    var needJpy = r.entryNeedJpy;
    if (needJpy == null) {
      try {
        var t = kGetTicker_(r.pair);
        needJpy = kCalcEntryNeedJpy_(r.pair, t.last, entryJpy, cfg.feeRoleCapital).needJpy;
      } catch (e) {
        kLog_('activate skip ' + r.pair + ': ' + (e.message || e));
        continue;
      }
    }
    if (needJpy > avail) {
      kLog_('資金不足で打ち切り: ' + r.pair + ' need=' + needJpy + ' avail=' + avail);
      break;
    }

    global.activePairs.push(r.pair);
    exclude.push(r.pair);
    avail -= needJpy;
    var st = kLoadState_(r.pair);
    st.mode = 'active';
    kSaveState_(r.pair, st);
    added.push(r.pair);
    kLog_(
      'アクティブ追加: ' +
        r.pair +
        ' need=' +
        needJpy +
        '円 avail残=' +
        avail +
        ' score=' +
        r.score +
        ' ' +
        r.note
    );
  }
  return added;
}

/** アクティブ銘柄ロスターを更新すべきか（既定60分） */
function kShouldRefreshActiveRoster_(global, cfg) {
  cfg = cfg || kGetConfig_();
  global = global || {};
  var intervalMin =
    cfg.activeRosterIntervalMin != null
      ? cfg.activeRosterIntervalMin
      : K_CONFIG.ACTIVE_ROSTER_INTERVAL_MIN != null
        ? K_CONFIG.ACTIVE_ROSTER_INTERVAL_MIN
        : 60;
  if (!(intervalMin > 0) || isNaN(intervalMin)) intervalMin = 60;
  if (!global.lastActiveRosterAt) return true;
  var t = new Date(global.lastActiveRosterAt).getTime();
  if (!t || isNaN(t)) return true;
  var elapsed = (Date.now() - t) / 60000;
  return elapsed >= intervalMin;
}

/** ロスター更新までの残り分（ログ用） */
function kActiveRosterMinutesLeft_(global, cfg) {
  cfg = cfg || kGetConfig_();
  global = global || {};
  var intervalMin =
    cfg.activeRosterIntervalMin != null
      ? cfg.activeRosterIntervalMin
      : K_CONFIG.ACTIVE_ROSTER_INTERVAL_MIN != null
        ? K_CONFIG.ACTIVE_ROSTER_INTERVAL_MIN
        : 60;
  if (!(intervalMin > 0) || isNaN(intervalMin)) intervalMin = 60;
  if (!global.lastActiveRosterAt) return 0;
  var t = new Date(global.lastActiveRosterAt).getTime();
  if (!t || isNaN(t)) return 0;
  var left = intervalMin - (Date.now() - t) / 60000;
  return left > 0 ? Math.ceil(left) : 0;
}

/** 日足ダウンでなければ PRIORITY_PAIR（既定 btc_jpy）を最優先で枠に入れる */
function kIsPriorityPairEligible_(pair, cfg) {
  cfg = cfg || kGetConfig_();
  var up = kEvaluateUpRegime_(pair, cfg);
  var lt = kEvaluateLongTermRegime_(pair, cfg);
  // 監視枠: 日足ダウン以外は入れる（長期↓でも監視。BUYは Strategy）
  if (up.isDailyDown || up.regime === 'daily_down') {
    return { ok: false, reason: '日足ダウン ' + up.note, up: up, lt: lt };
  }
  var reason = up.note || '';
  if (lt.excluded) reason += '（長期↓・監視のみ）';
  return { ok: true, reason: reason, up: up, lt: lt };
}

function kTryActivatePriorityPair_(cfg, global) {
  cfg = cfg || kGetConfig_();
  var pair = (cfg.priorityPair || K_CONFIG.PRIORITY_PAIR || 'btc_jpy').toLowerCase();
  if (!pair) return null;
  if ((cfg.excludePairs || []).indexOf(pair) >= 0) return null;
  if ((global.activePairs || []).indexOf(pair) >= 0) return null;

  var maxActive = cfg.maxActivePairs || K_CONFIG.MAX_ACTIVE_PAIRS;
  if ((global.activePairs || []).length >= maxActive) return null;

  var elig = kIsPriorityPairEligible_(pair, cfg);
  if (!elig.ok) {
    kLog_('優先銘柄見送り: ' + pair + ' ' + elig.reason);
    return null;
  }

  var entryJpy = cfg.entryJpy != null ? cfg.entryJpy : K_CONFIG.ENTRY_JPY;
  var needJpy = 0;
  try {
    var last = elig.up.lastClose;
    if (last == null) last = kGetTicker_(pair).last;
    needJpy = kCalcEntryNeedJpy_(pair, last, entryJpy, cfg.feeRoleCapital).needJpy;
  } catch (e) {
    kLog_('優先銘柄 need算出失敗: ' + pair + ' ' + (e.message || e));
    return null;
  }
  var avail = kGetAvailableDeployJpy_(cfg, global);
  // 優先枠は「監視のため」にも入れる。資金が足りなくても枠だけ確保（BUYは Strategy 側で残高チェック）
  // ただし need が avail を大幅に超える場合でも active には入れる（他銘柄より優先枠確保）

  var di = (global.dormantPairs || []).indexOf(pair);
  if (di >= 0) global.dormantPairs.splice(di, 1);

  global.activePairs.unshift(pair); // 先頭＝優先
  var st = kLoadState_(pair);
  st.mode = 'active';
  kSaveState_(pair, st);
  kLog_(
    '優先アクティブ: ' +
      pair +
      ' need≈' +
      needJpy +
      '円 avail=' +
      avail +
      ' ' +
      elig.reason
  );
  return pair;
}

function kPreferPriorityInRanked_(ranked, cfg) {
  var pair = ((cfg && cfg.priorityPair) || K_CONFIG.PRIORITY_PAIR || 'btc_jpy').toLowerCase();
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
