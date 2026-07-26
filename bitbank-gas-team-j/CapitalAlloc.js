/**
 * TEAM-J 資金配分 — 塩漬け把握・自動ロット調整
 */

function jGetEffectiveMinLevelJpy_(cfg) {
  cfg = cfg || jGetConfig_();
  if (!cfg.autoLotSizing) return cfg.minLevelJpy;
  return cfg.effectiveMinLevelJpy != null ? cfg.effectiveMinLevelJpy : cfg.minLevelJpy;
}

function jListTrackedPairs_(global) {
  var seen = {};
  var list = [];
  function add(p) {
    if (!p || seen[p]) return;
    seen[p] = true;
    list.push(p);
  }
  (global.activePairs || []).forEach(add);
  (global.dormantPairs || []).forEach(add);
  return list;
}

/** 約定済みロットの買い込みコスト合計 */
function jSumHeldLotsCostJpy_(pair, heldLots, cfg) {
  var role = cfg.feeRoleCapital || J_CONFIG.FEE_ROLE_FOR_CAPITAL;
  var sum = 0;
  for (var i = 0; i < heldLots.length; i++) {
    var lot = heldLots[i];
    sum += jCalcBuyCostJpy_(pair, lot.price, lot.amount, role);
  }
  return sum;
}

/** 本番: APIのコイン残高から評価。紙トレ: Bot記録のロット */
function jGetPairHeldFromApi_(pair, cfg) {
  cfg = cfg || jGetConfig_();
  var inst = jGetInstrument_(pair);
  var coin = jGetAssets_(inst.asset).coin || 0;
  if (coin < (inst.minAmount || 0)) {
    return { coin: 0, marketJpy: 0, costJpy: 0 };
  }
  var ticker = jGetTicker_(pair);
  var role = cfg.feeRoleCapital || J_CONFIG.FEE_ROLE_FOR_CAPITAL;
  var marketJpy = coin * ticker.last;
  var costJpy = jCalcBuyCostJpy_(pair, ticker.last, coin, role);
  return { coin: coin, marketJpy: marketJpy, costJpy: costJpy };
}

/**
 * 口座スナップショット（塩漬け = 休眠中の約定済みロット）
 * 本番: 約定済 = APIコイン残高ベース / 紙トレ: Bot内部ロット
 */
function jCalcTrapCapitalSnapshot_(cfg, global) {
  cfg = cfg || jGetConfig_();
  global = global || jLoadGlobalState_();

  var freeJpy = 0;
  if (cfg.dryRun) {
    var w = jInitPaperWallet_(global, cfg);
    freeJpy = w.jpy;
  } else {
    freeJpy = jGetAssets_('jpy').jpy;
  }

  var salted = [];
  var activeHeld = [];
  var staleWarnings = [];
  var saltedLockedJpy = 0;
  var activeHeldLockedJpy = 0;
  var totalHeldLockedJpy = 0;

  jListTrackedPairs_(global).forEach(function (pair) {
    var st = jLoadState_(pair);
    var botHeld = jSplitGridLots_(st).held;
    var locked = 0;
    var marketJpy = 0;
    var lots = botHeld.length;

    if (cfg.dryRun) {
      if (!botHeld.length) return;
      locked = jSumHeldLotsCostJpy_(pair, botHeld, cfg);
      try {
        var tickerDry = jGetTicker_(pair);
        for (var i = 0; i < botHeld.length; i++) {
          marketJpy += tickerDry.last * botHeld[i].amount;
        }
      } catch (eDry) {
        marketJpy = locked;
      }
    } else {
      var apiHeld = jGetPairHeldFromApi_(pair, cfg);
      if (botHeld.length && apiHeld.coin <= 0) {
        staleWarnings.push(
          pair + ': Bot記録' + botHeld.length + 'ロットあり / API残高0（デモ残骸の可能性）'
        );
        return;
      }
      if (apiHeld.coin <= 0) return;
      locked = apiHeld.costJpy;
      marketJpy = apiHeld.marketJpy;
      lots = botHeld.length || 1;
      if (botHeld.length === 0) {
        staleWarnings.push(pair + ': APIに残高あり / Botロット未記録');
      }
    }

    totalHeldLockedJpy += locked;
    var row = {
      pair: pair,
      lots: lots,
      lockedJpy: Math.round(locked),
      marketJpy: Math.round(marketJpy),
      entryRefLow: st.entryRefLow,
      entryRefHigh: st.entryRefHigh,
    };
    if (st.mode === 'dormant') {
      saltedLockedJpy += locked;
      row.dormantAt = st.dormantAt || null;
      salted.push(row);
    } else {
      activeHeldLockedJpy += locked;
      activeHeld.push(row);
    }
  });

  var maxPairs = cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  var budgetPct = cfg.accountBudgetPct || J_CONFIG.ACCOUNT_BUDGET_PCT;
  var totalValueJpy = freeJpy + totalHeldLockedJpy;
  var budgetPool = Math.floor(totalValueJpy * budgetPct);
  var availableForTraps = budgetPool - saltedLockedJpy;
  var equalSplit =
    maxPairs > 0 && availableForTraps > 0 ? Math.floor(availableForTraps / maxPairs) : 0;
  var fixedPair = cfg.pairBudgetJpy != null ? Number(cfg.pairBudgetJpy) : J_CONFIG.PAIR_BUDGET_JPY;
  var perPairCap = equalSplit;
  if (fixedPair > 0) {
    perPairCap = equalSplit > 0 ? Math.min(equalSplit, fixedPair) : fixedPair;
  }

  return {
    freeJpy: Math.round(freeJpy),
    totalHeldLockedJpy: Math.round(totalHeldLockedJpy),
    activeHeldLockedJpy: Math.round(activeHeldLockedJpy),
    saltedLockedJpy: Math.round(saltedLockedJpy),
    totalValueJpy: Math.round(totalValueJpy),
    budgetPool: budgetPool,
    availableForTraps: availableForTraps,
    maxActivePairs: maxPairs,
    pairBudgetJpy: fixedPair > 0 ? fixedPair : null,
    perPairCap: perPairCap,
    salted: salted,
    activeHeld: activeHeld,
    staleWarnings: staleWarnings,
  };
}

/** 1銘柄枠（固定PAIR_BUDGET または 等分） */
function jGetPairBudgetCap_(cfg, snap) {
  cfg = cfg || jGetConfig_();
  snap = snap || jCalcTrapCapitalSnapshot_(cfg);
  if (snap.perPairCap > 0) return snap.perPairCap;
  var fixed = cfg.pairBudgetJpy != null ? Number(cfg.pairBudgetJpy) : J_CONFIG.PAIR_BUDGET_JPY;
  return fixed > 0 ? fixed : 0;
}

/**
 * 1銘柄の worstCase が perPairCap 以内に収まる最大 MIN_LEVEL_JPY を探索
 * 収まらない場合は null（この銘柄は枠外）
 */
function jFindMaxMinLevelForPairCap_(pair, entryBox, perPairCap, preferredFloor, cfg) {
  preferredFloor = Math.max(500, Number(preferredFloor) || J_CONFIG.MIN_LEVEL_JPY);
  if (!(perPairCap > 0)) return null;

  var lo = 500;
  var hi = Math.floor(perPairCap / 500) * 500;
  if (hi < lo) return null;
  var best = null;
  var role = cfg.feeRoleCapital || J_CONFIG.FEE_ROLE_FOR_CAPITAL;

  while (lo <= hi) {
    var mid = Math.floor((lo + hi) / 2 / 500) * 500;
    if (mid < 500) mid = 500;

    var trialCfg = {};
    for (var k in cfg) trialCfg[k] = cfg[k];
    trialCfg.minLevelJpy = mid;
    trialCfg.effectiveMinLevelJpy = mid;

    var plan = jBuildGridPlanForPair_(pair, trialCfg, entryBox);
    if (!plan || !jIsBoxTradeable_(plan, trialCfg)) {
      hi = mid - 500;
      continue;
    }
    var worst = jCalcWorstCaseGridJpy_(pair, plan.ticker.last, plan, plan.levelAmount, role);
    if (worst <= perPairCap) {
      best = mid;
      lo = mid + 500;
    } else {
      hi = mid - 500;
    }
  }
  return best;
}

/** 参照銘柄群から保守的な自動ロット（最小の適合値）を決定 */
function jResolveAutoMinLevelJpy_(cfg, global, snap) {
  cfg = cfg || jGetConfig_();
  global = global || jLoadGlobalState_();
  var preferredFloor = cfg.minLevelJpy;

  snap = snap || jCalcTrapCapitalSnapshot_(cfg, global);
  if (snap.perPairCap <= 0) {
    return { effectiveMinLevelJpy: preferredFloor, snapshot: snap, capped: true, unfit: true };
  }

  var refs = (global.activePairs || []).slice();
  if (!refs.length) {
    try {
      var ranked = jRankCandidatePairs_(cfg, { activePairs: global.activePairs || [] });
      for (var i = 0; i < ranked.length && refs.length < 3; i++) {
        if (ranked[i].dailyRangeOk) refs.push(ranked[i].pair);
      }
    } catch (e) {
      jLog_('自動ロット参照銘柄取得失敗: ' + (e.message || e));
    }
  }
  if (!refs.length) {
    return {
      effectiveMinLevelJpy: Math.min(preferredFloor, snap.perPairCap),
      snapshot: snap,
      capped: false,
    };
  }

  var resolved = null;
  refs.forEach(function (pair) {
    var st = jLoadState_(pair);
    var entryBox = null;
    if (st.entryRefLow != null && st.entryRefHigh != null) {
      entryBox = { low: st.entryRefLow, high: st.entryRefHigh };
    }
    var maxForPair = jFindMaxMinLevelForPairCap_(pair, entryBox, snap.perPairCap, preferredFloor, cfg);
    if (maxForPair == null) return;
    if (resolved === null || maxForPair < resolved) resolved = maxForPair;
  });

  if (resolved == null) {
    return {
      effectiveMinLevelJpy: preferredFloor,
      snapshot: snap,
      capped: true,
      unfit: true,
    };
  }

  return {
    effectiveMinLevelJpy: resolved,
    snapshot: snap,
    capped: resolved < preferredFloor,
  };
}

/** 総資金・塩漬け・設定変更時のみ自動ロット再計算が必要 */
function jNeedsAutoLotRecalc_(global, snap, cfg) {
  if (global.lastAutoMinLevelJpy == null) return true;
  var prev = global.capitalSnapshot;
  if (!prev) return true;
  if (Math.abs((snap.totalValueJpy || 0) - (prev.totalValueJpy || 0)) > 500) return true;
  if ((snap.saltedLockedJpy || 0) !== (prev.saltedLockedJpy || 0)) return true;
  if ((snap.totalHeldLockedJpy || 0) !== (prev.totalHeldLockedJpy || 0)) return true;
  if ((snap.maxActivePairs || 0) !== (prev.maxActivePairs || 0)) return true;
  if (global.lastAutoLotFloor == null || cfg.minLevelJpy !== global.lastAutoLotFloor) return true;
  return false;
}

/** 実行前に effectiveMinLevelJpy を更新（資金変動時のみ重い再計算） */
function jUpdateAutoLotSizing_(cfg, global, opts) {
  opts = opts || {};
  cfg = cfg || jGetConfig_();
  global = global || jLoadGlobalState_();

  var snap = jCalcTrapCapitalSnapshot_(cfg, global);

  if (!cfg.autoLotSizing) {
    cfg.effectiveMinLevelJpy = cfg.minLevelJpy;
    return { effectiveMinLevelJpy: cfg.minLevelJpy, snapshot: snap, auto: false, recalculated: true };
  }

  if (!opts.force && !jNeedsAutoLotRecalc_(global, snap, cfg)) {
    cfg.effectiveMinLevelJpy = global.lastAutoMinLevelJpy;
    return {
      effectiveMinLevelJpy: global.lastAutoMinLevelJpy,
      snapshot: snap,
      auto: true,
      recalculated: false,
    };
  }

  var result = jResolveAutoMinLevelJpy_(cfg, global, snap);
  cfg.effectiveMinLevelJpy = result.effectiveMinLevelJpy;
  global.lastAutoMinLevelJpy = result.effectiveMinLevelJpy;
  global.lastAutoLotFloor = cfg.minLevelJpy;

  var s = result.snapshot;
  var saltedLine =
    s.salted.length > 0
      ? ' 塩漬け' + s.salted.length + '銘柄/' + s.saltedLockedJpy + '円'
      : ' 塩漬けなし';
  jLog_(
    '自動ロット再計算 MIN_LEVEL=' +
      result.effectiveMinLevelJpy +
      '円（下限' +
      cfg.minLevelJpy +
      '）' +
      ' 総資金' +
      s.totalValueJpy +
      '円 トラップ可' +
      s.availableForTraps +
      '円/' +
      s.maxActivePairs +
      '枠→1枠' +
      s.perPairCap +
      '円' +
      saltedLine
  );

  return {
    effectiveMinLevelJpy: result.effectiveMinLevelJpy,
    snapshot: result.snapshot,
    auto: true,
    recalculated: true,
    capped: result.capped,
  };
}

function jFormatSaltedPositionLines_(snapshot) {
  snapshot = snapshot || { salted: [] };
  var lines = [];
  if (!snapshot.salted || !snapshot.salted.length) {
    lines.push('塩漬けポジション: なし');
    return lines;
  }
  lines.push('塩漬けポジション（レンジ外・休眠中）:');
  snapshot.salted.forEach(function (s, i) {
    lines.push(
      i +
        1 +
        '. ' +
        s.pair +
        ' ロット' +
        s.lots +
        ' 買込' +
        s.lockedJpy +
        '円 評価≈' +
        s.marketJpy +
        '円 箱' +
        (s.entryRefLow != null ? s.entryRefLow + '-' + s.entryRefHigh : '?')
    );
  });
  lines.push('塩漬け合計: ' + snapshot.saltedLockedJpy + '円');
  return lines;
}

function jFormatActiveHeldLines_(snapshot) {
  snapshot = snapshot || { activeHeld: [] };
  var lines = [];
  if (!snapshot.activeHeld || !snapshot.activeHeld.length) {
    lines.push('アクティブ約定済: なし');
    return lines;
  }
  lines.push('アクティブ約定済（稼働中）:');
  snapshot.activeHeld.forEach(function (s, i) {
    lines.push(
      i +
        1 +
        '. ' +
        s.pair +
        ' ロット' +
        s.lots +
        ' 買込' +
        s.lockedJpy +
        '円 評価≈' +
        s.marketJpy +
        '円'
    );
  });
  lines.push('アクティブ合計: ' + snapshot.activeHeldLockedJpy + '円');
  return lines;
}

function jFormatStaleWarningLines_(snapshot) {
  if (!snapshot || !snapshot.staleWarnings || !snapshot.staleWarnings.length) return [];
  var lines = ['', '⚠ 状態ずれ（要確認）:'];
  snapshot.staleWarnings.forEach(function (w) {
    lines.push('・' + w);
  });
  lines.push('→ メニュー「14. 全リセット」で Bot 状態を初期化できます');
  return lines;
}

function jFormatCapitalAllocSummary_(cfg, global, alloc) {
  cfg = cfg || jGetConfig_();
  alloc = alloc || jUpdateAutoLotSizing_(cfg, global, { force: true });
  var s = alloc.snapshot;
  var heldLabel = cfg.dryRun ? 'Bot記録の約定済' : 'APIコイン評価';
  var lines = [
    '=== 資金配分・自動ロット ===',
    'AUTO_LOT_SIZING=' + (cfg.autoLotSizing ? 'true' : 'false'),
    'MIN_LEVEL_JPY下限=' + cfg.minLevelJpy,
    '適用ロット=' + jGetEffectiveMinLevelJpy_(cfg) + '円/段',
    'MAX_ACTIVE_PAIRS=' + s.maxActivePairs,
    '総資金=' + s.totalValueJpy + '円（自由JPY ' + s.freeJpy + ' + ' + heldLabel + ' ' + s.totalHeldLockedJpy + '）',
    '使用上限' + Math.round((cfg.accountBudgetPct || 0.9) * 100) + '%=' + s.budgetPool + '円',
    '塩漬け控除=' + s.saltedLockedJpy + '円 → トラップ可' + s.availableForTraps + '円',
    '1銘柄枠=' +
      s.perPairCap +
      '円' +
      (s.pairBudgetJpy ? '（固定PAIR_BUDGET=' + s.pairBudgetJpy + '円）' : '（等分）'),
    '',
  ];
  lines = lines.concat(jFormatActiveHeldLines_(s));
  lines.push('');
  lines = lines.concat(jFormatSaltedPositionLines_(s));
  lines = lines.concat(jFormatStaleWarningLines_(s));
  return lines.join('\n');
}

/** ランキング行の worstCase を現在の effective ロットで再計算 */
function jRefreshRankRowWorstCase_(row, cfg) {
  if (!row || !row.pair || !row.dailyRangeOk) return row;
  cfg = cfg || jGetConfig_();
  var fresh = jAnalyzePairCosts_(row.pair, cfg);
  if (!fresh.dailyRangeOk) return row;
  row.worstCaseJpy = fresh.worstCaseJpy;
  row.levelAmount = fresh.levelAmount;
  row.oneSetJpy = fresh.oneSetJpy;
  return row;
}
