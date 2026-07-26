/**
 * TEAM-J トラリピ — 日足レンジ内・買いグリッド + トレール売り
 */

function jGetTradableCoin_(pair, freeCoin, cfg) {
  cfg = cfg || jGetConfig_();
  var inst = jGetInstrument_(pair);
  var coin = Number(freeCoin) || 0;
  if (inst.asset === 'btc') {
    // 紙トレ口座はトラップ買い分のみ。長期保有BTCは含まないため控除しない
    if (cfg.dryRun) return jFormatAmount_(pair, coin);
    var reserve = jGetBtcReserve_(cfg);
    return Math.max(0, jFormatAmount_(pair, coin - reserve));
  }
  return jFormatAmount_(pair, coin);
}

function jGetGridLots_(state) {
  if (!state.gridLots) state.gridLots = [];
  return state.gridLots;
}

function jCountFilledLots_(state) {
  var lots = jGetGridLots_(state);
  var n = 0;
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled !== false) n += 1;
  }
  return n;
}

function jHasFilledLots_(state) {
  return jCountFilledLots_(state) > 0;
}

function jSplitGridLots_(state) {
  var lots = jGetGridLots_(state);
  var held = [];
  var pending = [];
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled === false) pending.push(lots[i]);
    else held.push(lots[i]);
  }
  return { held: held, pending: pending };
}

function jHasLotPrice_(lots, price) {
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].price === price) return true;
  }
  return false;
}

function jCountPendingLots_(state) {
  return jSplitGridLots_(state).pending.length;
}

function jCountPendingByKind_(state, orderKind) {
  var pending = jSplitGridLots_(state).pending;
  var n = 0;
  for (var i = 0; i < pending.length; i++) {
    var k = pending[i].orderKind || 'limit';
    if (k === orderKind) n += 1;
  }
  return n;
}

function jFormatGridMaintainNote_(state, entryRefLow, entryRefHigh) {
  var limitN = jCountPendingByKind_(state, 'limit');
  var stopN = jCountPendingByKind_(state, 'stop_limit');
  return (
    '維持 約定' +
    jCountFilledLots_(state) +
    ' 指値' +
    limitN +
    ' 逆指値' +
    stopN +
    ' 箱' +
    entryRefLow +
    '-' +
    entryRefHigh
  );
}

function jPlaceBoxGridBuy_(pair, buyPrice, amount, last, cfg) {
  var lot = {
    price: buyPrice,
    amount: amount,
    trailHigh: null,
    filled: false,
    orderKind: buyPrice > last ? 'stop_limit' : 'limit',
    buyOrderId: '',
  };
  var order;
  if (lot.orderKind === 'stop_limit') {
    order = jPlaceStopLimitBuy_(pair, buyPrice, buyPrice, amount, cfg);
  } else {
    order = jPlaceLimit_(pair, 'buy', buyPrice, amount, cfg);
  }
  if (order && order.order_id != null) lot.buyOrderId = String(order.order_id);
  return lot;
}

/** 利確後など、箱内で欠けているラインに買い注文を再配置 */
function jReplenishFullBoxLots_(pair, state, plan, ticker, assets, cfg, global) {
  if (!cfg.fullBoxTrap || state.entryRefLow == null) return 0;
  if (cfg.leaguePauseNew) return 0;
  var prices = state.boxLevelPrices || (plan && plan.levelPrices) || [];
  if (!prices.length) return 0;

  var last = ticker.last;
  var amount = plan.levelAmount;
  var role = cfg.feeRoleCapital || 'taker';
  var lots = jGetGridLots_(state);
  var placed = 0;

  for (var i = 0; i < prices.length; i++) {
    var buyPrice = prices[i];
    if (jHasLotPrice_(lots, buyPrice)) continue;
    var needJpy = jCalcBuyCostJpy_(pair, buyPrice, amount, role);
    if (assets.jpy < needJpy) {
      jLog_(pair + ' 再配置JPY不足 停止（要' + needJpy + ' 残' + Math.round(assets.jpy) + '）');
      break;
    }
    lots.push(jPlaceBoxGridBuy_(pair, buyPrice, amount, last, cfg));
    placed += 1;
  }

  state.gridLots = lots;
  return placed;
}

function jShouldRebuildGrid_(state, plan, cfg) {
  if (state.mode !== 'active') return true;
  if (!state.lastTrapStep || state.lastLevels == null) return true;
  if (!state.gridLots || !state.gridLots.length) return true;

  // 案D: エントリー箱固定中はグリッドを張り直さない（未約定指値が消えて約定しないのを防ぐ）
  // 箱全体トラップ: 初回構築後は再配置のみ（全キャンセル→再構築しない）
  if (state.entryRefLow != null) {
    if (cfg.fullBoxTrap) {
      if (!state.fullBoxBuilt || !state.gridLots || !state.gridLots.length) return true;
    }
    if (
      plan &&
      state.lastTrapStep &&
      plan.trapStep > 0 &&
      plan.trapStep < state.lastTrapStep * 0.7 &&
      jCountFilledLots_(state) === 0
    ) {
      return true;
    }
    return false;
  }

  var held = jCountFilledLots_(state);
  var pending = jCountPendingLots_(state);
  var oldSpan = (state.lastLevels - 1) * state.lastTrapStep;
  var newSpan = (plan.levels - 1) * plan.trapStep;
  var rangePct = held > 0 ? 0.2 : J_CONFIG.REBUILD_RANGE_CHANGE_PCT || 0.15;
  var rangeChanged = oldSpan > 0 && Math.abs(oldSpan - newSpan) / oldSpan >= rangePct;

  if (held > 0 || pending > 0) {
    if (state.lastRebuildAt) {
      var cooldown =
        held > 0
          ? J_CONFIG.REBUILD_COOLDOWN_MIN_HELD || 120
          : J_CONFIG.REBUILD_COOLDOWN_MIN_PENDING || 60;
      var elapsed = (Date.now() - new Date(state.lastRebuildAt).getTime()) / 60000;
      if (elapsed < cooldown) return false;
    }
    return rangeChanged;
  }

  var stepTol = J_CONFIG.REBUILD_STEP_TOL_PCT || 0.1;
  var stepChanged =
    state.lastTrapStep > 0 &&
    Math.abs(state.lastTrapStep - plan.trapStep) / state.lastTrapStep > stepTol;
  return state.lastLevels !== plan.levels || stepChanged || rangeChanged;
}

/** 指値/逆指値タッチで約定済みに（DRY_RUN は紙トレ反映） */
function jMarkGridFills_(pair, ticker, state, global, cfg) {
  var last = ticker.last;
  var lots = jGetGridLots_(state);
  var filled = 0;
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled !== false) continue;
    var kind = lots[i].orderKind || 'limit';
    var hit = kind === 'stop_limit' ? last >= lots[i].price : last <= lots[i].price;
    if (!hit) continue;
    lots[i].filled = true;
    if (cfg.dryRun) {
      jApplyPaperTrade_(global, pair, 'buy', lots[i].price, lots[i].amount, cfg.feeRoleProfit);
    }
    filled += 1;
  }
  return filled;
}

/**
 * 固定幅利確（トレールなし）
 * 売値 = 買値 + trapStep + 手数料カバー + 通貨別スリップ
 * BTC は長期保有分を売却しない
 */
function jManageGridTakeProfits_(pair, ticker, assets, state, global, cfg, plan) {
  var last = ticker.last;
  var step = state.lastTrapStep || (plan && plan.trapStep) || 0;
  var inst = jGetInstrument_(pair);
  var lots = jGetGridLots_(state);
  if (!lots.length) return { soldAny: false, soldCount: 0 };

  var tradable = assets.coin;
  var remaining = [];
  var soldAny = false;
  var soldCount = 0;

  for (var i = 0; i < lots.length; i++) {
    var lot = lots[i];
    if (lot.filled === false) {
      remaining.push(lot);
      continue;
    }

    var tp =
      lot.sellPrice != null
        ? {
            sellPrice: lot.sellPrice,
            trapStep: lot.tpTrapStep,
            feeWidth: lot.tpFeeWidth,
            slipWidth: lot.tpSlipWidth,
          }
        : jCalcTakeProfitPrice_(pair, lot.price, lot.amount, step, cfg);
    lot.sellPrice = tp.sellPrice;
    lot.tpTrapStep = tp.trapStep;
    lot.tpFeeWidth = tp.feeWidth;
    lot.tpSlipWidth = tp.slipWidth;

    var sellAmt = jFormatAmount_(pair, Math.min(lot.amount, tradable));

    // 利確注文済みなのに残高不足 → 取引所側で約定済みとみなす
    // （旧実装はここで幽霊破棄し、J_運用損益に書かず捨てていた）
    if (lot.sellOrderPlaced && sellAmt < inst.minAmount) {
      var closedAmt = jFormatAmount_(pair, Number(lot.amount) || 0);
      if (closedAmt >= inst.minAmount) {
        jAppendLotProfit_(pair, lot, tp.sellPrice, closedAmt, cfg, tp, lot.sellOrderId);
        jLog_(
          pair +
            ' 利確約定検知(残高減) 買' +
            lot.price +
            '→売' +
            tp.sellPrice +
            ' x' +
            closedAmt
        );
        soldAny = true;
        soldCount += 1;
      } else {
        jLog_(
          pair +
            ' 幽霊ロット破棄(保有' +
            tradable +
            ' 要' +
            lot.amount +
            ' sell=' +
            tp.sellPrice +
            ')'
        );
      }
      continue;
    }

    // 保有0の幽霊ロットを残すと 60001（数量不足）を繰り返す
    if (sellAmt < inst.minAmount) {
      if (tradable < inst.minAmount) {
        jLog_(
          pair +
            ' 幽霊ロット破棄(保有' +
            tradable +
            ' 要' +
            lot.amount +
            ' sell=' +
            tp.sellPrice +
            ')'
        );
        continue;
      }
      remaining.push(lot);
      continue;
    }

    if (!lot.sellOrderPlaced) {
      try {
        var sellOrder = jPlaceLimit_(pair, 'sell', tp.sellPrice, sellAmt, cfg);
        lot.sellOrderPlaced = true;
        lot.amount = sellAmt;
        if (sellOrder && sellOrder.order_id != null) lot.sellOrderId = String(sellOrder.order_id);
      } catch (eSell) {
        jLog_(pair + ' 利確注文失敗: ' + (eSell.message || eSell));
        remaining.push(lot);
        continue;
      }
    }

    if (last >= tp.sellPrice) {
      var amt = sellAmt;
      if (amt >= inst.minAmount) {
        if (cfg.dryRun) {
          jApplyPaperTrade_(global, pair, 'sell', tp.sellPrice, amt, cfg.feeRoleProfit);
        }
        jAppendLotProfit_(pair, lot, tp.sellPrice, amt, cfg, tp, lot.sellOrderId);
        tradable = jFormatAmount_(pair, tradable - amt);
        jLog_(
          pair +
            ' 利確 買' +
            lot.price +
            '→売' +
            tp.sellPrice +
            ' x' +
            amt
        );
        jLog_(
          pair +
            ' 固定利確 buy=' +
            lot.price +
            ' sell=' +
            tp.sellPrice +
            ' step=' +
            step +
            ' feeW=' +
            tp.feeWidth +
            ' slip=' +
            tp.slipWidth
        );
        soldAny = true;
        soldCount += 1;
        continue;
      }
      jLog_(
        pair +
          ' 利確待ち sell=' +
          tp.sellPrice +
          ' 売却不可(保有' +
          tradable +
          ' 要' +
          lot.amount +
          ')'
      );
    }

    remaining.push(lot);
  }

  state.gridLots = remaining;
  if (cfg.dryRun && global.paperWallet) {
    assets.coin = global.paperWallet.coins[inst.asset] || 0;
    assets.jpy = global.paperWallet.jpy;
  }
  return { soldAny: soldAny, soldCount: soldCount };
}

/** @deprecated 固定利確へ移行。呼び出し互換のため残す */
function jManageGridTrails_(pair, ticker, assets, state, global, cfg, plan) {
  return jManageGridTakeProfits_(pair, ticker, assets, state, global, cfg, plan);
}

function jClearEntryBox_(state) {
  state.entryRefLow = null;
  state.entryRefHigh = null;
  state.entryBoxAt = null;
  state.fullBoxBuilt = false;
  state.boxLevelPrices = null;
}

/** 案D: エントリー時のレンジ箱を一度だけ固定 */
function jEnsureEntryBox_(pair, state, regime) {
  if (state.entryRefLow != null && state.entryRefHigh != null) return false;
  if (regime.refDailyLow == null || regime.refDailyHigh == null) return false;
  state.entryRefLow = regime.refDailyLow;
  state.entryRefHigh = regime.refDailyHigh;
  state.entryBoxAt = new Date().toISOString();
  jLog_(
    pair +
      ' エントリー箱固定 low=' +
      state.entryRefLow +
      ' high=' +
      state.entryRefHigh +
      ' 幅%=' +
      (regime.widthPct != null ? regime.widthPct.toFixed(2) : '-')
  );
  return true;
}

function jMovePairToDormantLists_(pair, global) {
  if (!global) return;
  if (global.activePairs.indexOf(pair) >= 0) {
    global.activePairs = global.activePairs.filter(function (p) {
      return p !== pair;
    });
  }
  if (global.dormantPairs.indexOf(pair) < 0) global.dormantPairs.push(pair);
}

function jEnterDormant_(pair, state, cfg, reason, global) {
  jCancelPairBuyOrders_(pair, cfg);
  var split = jSplitGridLots_(state);
  state.gridLots = split.held;
  state.mode = 'dormant';
  state.settled = split.held.length === 0;
  state.dormantAt = new Date().toISOString();
  jMovePairToDormantLists_(pair, global);
  jLog_(pair + ' 休眠: ' + (reason || '') + ' 残ロット=' + split.held.length);
}

function jPrepareReopenFromDormant_(state) {
  var held = jSplitGridLots_(state).held;
  jClearEntryBox_(state);
  state.mode = 'active';
  state.settled = false;
  state.gridLots = held;
  state.lastTrapStep = null;
  state.lastLevels = null;
  state.lastRebuildAt = null;
  state.fullBoxBuilt = false;
  state.boxLevelPrices = null;
  state.reopenedAt = new Date().toISOString();
}

function jTryReopenDormant_(pair, state, regime, cfg, global) {
  if (state.mode !== 'dormant' && state.mode !== 'idle') return false;

  // 3-1: 再度レンジと判定されたときのみ（持ち玉があっても再開可）
  if (!regime.isRange) {
    if (jHasFilledLots_(state)) state.settled = false;
    return false;
  }

  var maxActive = cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  if (global && global.activePairs && global.activePairs.length >= maxActive) {
    jLog_(pair + ' 休眠継続: アクティブ枠なし（最大' + maxActive + '）');
    return false;
  }

  // ⑦ 再開は変動上位 N 銘柄以内のみ
  if (!jIsPairInTopRanked_(pair, cfg, maxActive)) {
    jLog_(pair + ' 休眠継続: 変動上位' + maxActive + '外');
    return false;
  }

  if (jIsMonthlyDownExcluded_(pair, cfg)) {
    jLog_(pair + ' 休眠継続: 月足↓除外');
    return false;
  }

  var heldCount = jCountFilledLots_(state);
  jPrepareReopenFromDormant_(state);
  if (global) {
    if (global.activePairs.indexOf(pair) < 0) global.activePairs.push(pair);
    global.dormantPairs = global.dormantPairs.filter(function (p) {
      return p !== pair;
    });
  }
  jLog_(
    pair +
      ' 休眠→再開（日足レンジOK・変動上位' +
      maxActive +
      '内・残ロット=' +
      heldCount +
      '）'
  );
  return true;
}

/**
 * 全実行の後半: アクティブがトレンドで枠が空いたあと、休眠銘柄を再開
 * （強制入れ替えはしない。枠が空いているときのみ）
 */
function jTryReopenAllDormant_(cfg, global) {
  var maxActive = cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  var reopened = [];
  var candidates = (global.dormantPairs || []).slice();
  if (!candidates.length) return reopened;

  var ranked = jRankCandidatePairs_(cfg, { forceRefresh: false });
  var rankOrder = {};
  ranked.forEach(function (r, i) {
    rankOrder[r.pair] = i;
  });
  candidates.sort(function (a, b) {
    var ia = rankOrder[a] != null ? rankOrder[a] : 9999;
    var ib = rankOrder[b] != null ? rankOrder[b] : 9999;
    return ia - ib;
  });

  candidates.forEach(function (pair) {
    if (global.activePairs.length >= maxActive) return;
    var state = jLoadState_(pair);
    if (state.mode !== 'dormant' && state.mode !== 'idle') return;
    var regime = jEvaluatePairRegime_(pair, cfg);
    if (jTryReopenDormant_(pair, state, regime, cfg, global)) {
      jSaveState_(pair, state);
      reopened.push(pair);
    }
  });
  return reopened;
}

/**
 * グリッド計画。entryBox があればその上下限で張る（案D・稼働中は幅%が広がっても箱は固定）
 */
function jBuildGridPlanForPair_(pair, cfg, entryBox) {
  var candles1h = jGetCandles1h_(pair, (cfg.dailyLookback || 20) * 24);
  var daily = jAggregateDailyFrom1h_(candles1h, cfg.dailyLookback);
  var dailyRange = jDetectDailyRange_(daily, cfg, pair);
  if (entryBox && entryBox.low != null && entryBox.high != null) {
    dailyRange = {
      isRange: true,
      high: entryBox.high,
      low: entryBox.low,
      widthPct: entryBox.high > 0 ? ((entryBox.high - entryBox.low) / ((entryBox.high + entryBox.low) / 2)) * 100 : null,
      note: 'エントリー箱',
    };
  } else if (!dailyRange.isRange) {
    return null;
  }
  var ticker = jGetTicker_(pair);
  var atrPct = jCalcAtrPct_(daily, J_CONFIG.ATR_PERIOD);
  var plan = jCalcGridPlanForPair_(ticker.last, dailyRange, atrPct, pair, cfg);
  plan.ticker = ticker;
  plan.dailyRange = dailyRange;
  plan.levelAmount = jResolveLevelAmount_(pair, ticker.last, jGetEffectiveMinLevelJpy_(cfg));
  return plan;
}

function jRunToraripiForPair_(pair, cfg, global) {
  var state = jLoadState_(pair);
  var regime = jEvaluatePairRegime_(pair, cfg);
  var assets = jGetAssetsForPair_(pair, cfg, global);
  var result = { pair: pair, active: false, note: '' };

  if (state.mode === 'dormant' || state.mode === 'idle') {
    jTryReopenDormant_(pair, state, regime, cfg, global);
  }

  // 休眠中: エントリー分は固定利確まで保持（幅が広がっても決済待ち）
  if (state.mode === 'dormant') {
    state.refDailyLow = state.entryRefLow;
    state.refDailyHigh = state.entryRefHigh;
    var planD = { trapStep: state.lastTrapStep || 0 };
    var tickerD = jGetTicker_(pair);
    jMarkGridFills_(pair, tickerD, state, global, cfg);
    var tpD = jManageGridTakeProfits_(pair, tickerD, assets, state, global, cfg, planD);
    if (!jHasFilledLots_(state)) state.settled = true;
    result.active = tpD.soldAny;
    result.note = '休眠中 残' + jCountFilledLots_(state) + 'ロット';
    jSaveState_(pair, state);
    return result;
  }

  // アクティブ開始時のみエントリー箱を固定（3-1でレンジOKのとき）
  if (state.mode === 'active' || state.mode === 'idle') {
    if (state.entryRefLow == null) {
      if (!regime.isRange) {
        result.note = 'レンジNG（エントリー不可）';
        jSaveState_(pair, state);
        return result;
      }
      jEnsureEntryBox_(pair, state, regime);
    }
  }

  state.refDailyLow = state.entryRefLow;
  state.refDailyHigh = state.entryRefHigh;

  // 案D 3-2: エントリー箱の下限割れのみで休眠（幅%拡大では休眠しない）
  if (
    state.mode === 'active' &&
    jIsEntryBoxBroken_(regime.daily, state.entryRefLow, J_CONFIG.TRAP_BREAK_BUFFER_PCT)
  ) {
    jEnterDormant_(pair, state, cfg, 'エントリー箱下抜け', global);
    result.active = true;
    result.note = '箱下抜け→休眠';
    jSaveState_(pair, state);
    return result;
  }

  var entryBox = { low: state.entryRefLow, high: state.entryRefHigh };
  var plan = jBuildGridPlanForPair_(pair, cfg, entryBox);
  if (!plan || plan.levels <= 0) {
    result.note = 'グリッド0本';
    jSaveState_(pair, state);
    return result;
  }

  var ticker = plan.ticker;
  var amount = plan.levelAmount;
  state.mode = 'active';

  // 箱がトラップとして成立しない（幅ゼロ/本数不足）→ 新規構築しない
  // 既に持ち玉があれば決済管理は継続
  if (!jIsBoxTradeable_(plan, cfg) && jCountFilledLots_(state) === 0) {
    jCancelPairBuyOrders_(pair, cfg);
    state.gridLots = [];
    state.fullBoxBuilt = false;
    state.boxLevelPrices = null;
    jEnterDormant_(pair, state, cfg, '箱NG: ' + jBoxRejectNote_(plan, cfg), global);
    result.note = '箱NG→休眠 (' + jBoxRejectNote_(plan, cfg) + ')';
    jSaveState_(pair, state);
    return result;
  }

  if (!jShouldRebuildGrid_(state, plan, cfg)) {
    var filled0 = jMarkGridFills_(pair, ticker, state, global, cfg);
    if (filled0 > 0) assets = jGetAssetsForPair_(pair, cfg, global);
    var tp0 = jManageGridTakeProfits_(pair, ticker, assets, state, global, cfg, plan);
    var repl0 = jReplenishFullBoxLots_(pair, state, plan, ticker, assets, cfg, global);
    var filledRepl = 0;
    if (repl0 > 0) {
      assets = jGetAssetsForPair_(pair, cfg, global);
      filledRepl = jMarkGridFills_(pair, ticker, state, global, cfg);
      if (filledRepl > 0) assets = jGetAssetsForPair_(pair, cfg, global);
    }
    result.active = filled0 > 0 || filledRepl > 0 || tp0.soldAny || repl0 > 0;
    result.note = jFormatGridMaintainNote_(state, state.entryRefLow, state.entryRefHigh);
    if (repl0 > 0) result.note += ' 再配置' + repl0;
    jSaveState_(pair, state);
    return result;
  }

  if (cfg.leaguePauseNew) {
    jMarkGridFills_(pair, ticker, state, global, cfg);
    jManageGridTakeProfits_(pair, ticker, assets, state, global, cfg, plan);
    result.note = 'リーグ新規停止';
    jSaveState_(pair, state);
    return result;
  }

  var split = jSplitGridLots_(state);
  var heldLots = split.held;
  jCancelPairBuyOrders_(pair, cfg);

  var placed = 0;
  var limitPlaced = 0;
  var stopPlaced = 0;
  var role = cfg.feeRoleCapital || 'taker';
  var levelPrices = plan.levelPrices || [];
  var useFullBox = cfg.fullBoxTrap && levelPrices.length > 0;

  if (useFullBox) {
    state.boxLevelPrices = levelPrices.slice();
    state.fullBoxBuilt = true;
    for (var li = 0; li < levelPrices.length; li++) {
      var boxPrice = levelPrices[li];
      if (jHasLotPrice_(heldLots, boxPrice)) continue;
      var needBox = jCalcBuyCostJpy_(pair, boxPrice, amount, role);
      if (assets.jpy < needBox) {
        jLog_(pair + ' JPY不足 停止（要' + needBox + ' 残' + Math.round(assets.jpy) + '）');
        break;
      }
      var boxLot = jPlaceBoxGridBuy_(pair, boxPrice, amount, ticker.last, cfg);
      heldLots.push(boxLot);
      placed += 1;
      if (boxLot.orderKind === 'stop_limit') stopPlaced += 1;
      else limitPlaced += 1;
    }
  } else {
    for (var i = 0; i < plan.levels; i++) {
      var buyPrice = jRoundPrice_(pair, ticker.last - i * plan.trapStep);
      if (buyPrice <= 0) break;
      if (state.entryRefLow != null && buyPrice < state.entryRefLow) break;
      if (jHasLotPrice_(heldLots, buyPrice)) continue;
      var needJpy = jCalcBuyCostJpy_(pair, buyPrice, amount, role);
      if (assets.jpy < needJpy) {
        jLog_(pair + ' JPY不足 停止（要' + needJpy + ' 残' + Math.round(assets.jpy) + '）');
        break;
      }
      heldLots.push(jPlaceBoxGridBuy_(pair, buyPrice, amount, ticker.last, cfg));
      placed += 1;
      limitPlaced += 1;
    }
  }

  state.gridLots = heldLots;
  state.lastTrapStep = plan.trapStep;
  state.lastLevels = plan.levels;
  state.lastRebuildAt = new Date().toISOString();

  jMarkGridFills_(pair, ticker, state, global, cfg);
  jManageGridTakeProfits_(pair, ticker, assets, state, global, cfg, plan);

  result.active = true;
  var buildLabel = useFullBox ? '箱全体構築' : '再構築';
  result.note =
    buildLabel +
    ' 新規' +
    placed +
    '(指値' +
    limitPlaced +
    '/逆指値' +
    stopPlaced +
    ') 箱' +
    state.entryRefLow +
    '-' +
    state.entryRefHigh +
    ' 間隔' +
    plan.trapStep;
  jSaveState_(pair, state);
  return result;
}
