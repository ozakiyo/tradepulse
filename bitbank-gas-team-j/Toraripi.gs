/**
 * TEAM-J トラリピ — 日足レンジ内・買いグリッド + トレール売り
 */

function jGetTradableCoin_(pair, freeCoin, cfg) {
  var inst = jGetInstrument_(pair);
  var coin = Number(freeCoin) || 0;
  if (inst.asset === 'btc') {
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

function jShouldRebuildGrid_(state, plan, cfg) {
  if (state.mode !== 'active') return true;
  if (!state.lastTrapStep || state.lastLevels == null) return true;

  var held = jCountFilledLots_(state);
  var rangePct = held > 0 ? 0.2 : J_CONFIG.REBUILD_RANGE_CHANGE_PCT || 0.15;
  var oldSpan = (state.lastLevels - 1) * state.lastTrapStep;
  var newSpan = (plan.levels - 1) * plan.trapStep;
  var rangeChanged = oldSpan > 0 && Math.abs(oldSpan - newSpan) / oldSpan >= rangePct;
  var stepTol = held > 0 ? 0.05 : 0;
  var stepChanged =
    state.lastTrapStep > 0 &&
    Math.abs(state.lastTrapStep - plan.trapStep) / state.lastTrapStep > stepTol;
  var planChanged = state.lastLevels !== plan.levels || stepChanged;

  if (held === 0) return planChanged || rangeChanged;

  if (state.lastRebuildAt) {
    var elapsed = (Date.now() - new Date(state.lastRebuildAt).getTime()) / 60000;
    if (elapsed < (J_CONFIG.REBUILD_COOLDOWN_MIN_HELD || 30)) return false;
  }
  // 約定済みロットがある間は大幅なレンジ変化時のみ再構築（微調整で毎回張り直さない）
  return rangeChanged;
}

/** 指値タッチで約定済みに（DRY_RUN は紙トレ反映） */
function jMarkGridFills_(pair, ticker, state, global, cfg) {
  var last = ticker.last;
  var lots = jGetGridLots_(state);
  var filled = 0;
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled === false && last <= lots[i].price) {
      lots[i].filled = true;
      if (cfg.dryRun) {
        jApplyPaperTrade_(global, pair, 'buy', lots[i].price, lots[i].amount, cfg.feeRoleProfit);
      }
      jAppendTradeLog_(pair, '買い', lots[i].price, lots[i].amount, 'トラップ約定');
      filled += 1;
    }
  }
  return filled;
}

/**
 * トレール売り（買値+trapStep 到達でトレール開始）
 * BTC は長期保有分を売却しない
 */
function jManageGridTrails_(pair, ticker, assets, state, global, cfg, plan) {
  var last = ticker.last;
  var step = state.lastTrapStep || (plan && plan.trapStep) || 0;
  if (!step) return { soldAny: false, soldCount: 0 };

  var inst = jGetInstrument_(pair);
  var activateWidth = jRoundPrice_(pair, step * (cfg.trailActivateStepMult || 1));
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

    var activateAt = lot.price + activateWidth;
    if (last < activateAt) {
      remaining.push(lot);
      continue;
    }

    lot.trailHigh = Math.max(lot.trailHigh || last, last);
    var sellPrice = jRoundPrice_(
      pair,
      lot.trailHigh * (1 - (cfg.trailCallbackPct || 0.25) / 100)
    );

    if (last <= sellPrice) {
      var amt = jFormatAmount_(pair, Math.min(lot.amount, tradable));
      if (amt >= inst.minAmount) {
        jPlaceLimit_(pair, 'sell', sellPrice, amt, cfg);
        if (cfg.dryRun) {
          jApplyPaperTrade_(global, pair, 'sell', sellPrice, amt, cfg.feeRoleProfit);
        }
        tradable = jFormatAmount_(pair, tradable - amt);
        jAppendTradeLog_(pair, '売り', sellPrice, amt, 'トレール(買' + lot.price + ')');
        jAppendProfitLog_(pair, lot.price, sellPrice, amt, cfg, 'トレール利確');
        jLog_(pair + ' トレール利確 buy=' + lot.price + ' sell=' + sellPrice);
        soldAny = true;
        soldCount += 1;
      }
      continue;
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

function jEnterDormant_(pair, state, cfg, reason) {
  jCancelPairBuyOrders_(pair, cfg);
  var split = jSplitGridLots_(state);
  state.gridLots = split.held;
  state.mode = 'dormant';
  state.settled = split.held.length === 0;
  state.dormantAt = new Date().toISOString();
  jLog_(pair + ' 休眠: ' + (reason || '') + ' 残ロット=' + split.held.length);
}

function jTryReopenDormant_(pair, state, regime, cfg) {
  if (state.mode !== 'dormant' && state.mode !== 'idle') return false;

  if (jHasFilledLots_(state)) {
    state.settled = false;
    return false;
  }

  state.settled = true;
  if (!regime.isRange) return false;

  state.mode = 'active';
  state.settled = false;
  state.reopenedAt = new Date().toISOString();
  jLog_(pair + ' 休眠→再開（日足レンジOK）');
  return true;
}

function jBuildGridPlanForPair_(pair, cfg) {
  var candles1h = jGetCandles1h_(pair, (cfg.dailyLookback || 20) * 24);
  var daily = jAggregateDailyFrom1h_(candles1h, cfg.dailyLookback);
  var dailyRange = jDetectDailyRange_(daily, cfg);
  if (!dailyRange.isRange) return null;
  var ticker = jGetTicker_(pair);
  var atrPct = jCalcAtrPct_(daily, J_CONFIG.ATR_PERIOD);
  var plan = jCalcDailyGridPlan_(ticker.last, dailyRange, atrPct, pair);
  plan.ticker = ticker;
  plan.dailyRange = dailyRange;
  plan.levelAmount = jResolveLevelAmount_(pair, ticker.last, cfg.minLevelJpy);
  return plan;
}

function jRunToraripiForPair_(pair, cfg, global) {
  var state = jLoadState_(pair);
  var regime = jEvaluatePairRegime_(pair, cfg);
  var assets = jGetAssetsForPair_(pair, cfg, global);
  var result = { pair: pair, active: false, note: '' };

  state.refDailyLow = regime.refDailyLow;
  state.refDailyHigh = regime.refDailyHigh;

  if (state.mode === 'dormant' || state.mode === 'idle') {
    jTryReopenDormant_(pair, state, regime, cfg);
  }

  if (state.mode === 'dormant') {
    var planD = jBuildGridPlanForPair_(pair, cfg) || { trapStep: state.lastTrapStep || 0 };
    var tickerD = jGetTicker_(pair);
    jMarkGridFills_(pair, tickerD, state, global, cfg);
    var trailD = jManageGridTrails_(pair, tickerD, assets, state, global, cfg, planD);
    if (!jHasFilledLots_(state)) state.settled = true;
    result.active = trailD.soldAny;
    result.note = '休眠中 残' + jCountFilledLots_(state) + 'ロット';
    jSaveState_(pair, state);
    return result;
  }

  if (!regime.isRange) {
    if (state.mode === 'active') jEnterDormant_(pair, state, cfg, '日足レンジNG');
    result.note = 'レンジNG';
    jSaveState_(pair, state);
    return result;
  }

  if (regime.broken && state.mode === 'active') {
    jEnterDormant_(pair, state, cfg, '日足トラップ外れ');
    if (global.activePairs.indexOf(pair) >= 0) {
      global.activePairs = global.activePairs.filter(function (p) {
        return p !== pair;
      });
      if (global.dormantPairs.indexOf(pair) < 0) global.dormantPairs.push(pair);
    }
    result.active = true;
    result.note = '外れ→休眠';
    jSaveState_(pair, state);
    return result;
  }

  var plan = jBuildGridPlanForPair_(pair, cfg);
  if (!plan || plan.levels <= 0) {
    result.note = 'グリッド0本';
    jSaveState_(pair, state);
    return result;
  }

  var ticker = plan.ticker;
  var amount = plan.levelAmount;
  state.mode = 'active';

  if (!jShouldRebuildGrid_(state, plan, cfg)) {
    var filled0 = jMarkGridFills_(pair, ticker, state, global, cfg);
    var trail0 = jManageGridTrails_(pair, ticker, assets, state, global, cfg, plan);
    result.active = filled0 > 0 || trail0.soldAny;
    result.note = '維持 ' + plan.levels + '本 間隔' + plan.trapStep;
    jSaveState_(pair, state);
    return result;
  }

  if (cfg.leaguePauseNew) {
    jMarkGridFills_(pair, ticker, state, global, cfg);
    jManageGridTrails_(pair, ticker, assets, state, global, cfg, plan);
    result.note = 'リーグ新規停止';
    jSaveState_(pair, state);
    return result;
  }

  var split = jSplitGridLots_(state);
  var heldLots = split.held;
  jCancelPairBuyOrders_(pair, cfg);

  var placed = 0;
  var role = cfg.feeRoleCapital || 'taker';
  for (var i = 0; i < plan.levels; i++) {
    // 現値ちょうどではなく1段下から（即約定の連発を防ぐ）
    var buyPrice = jRoundPrice_(pair, ticker.last - (i + 1) * plan.trapStep);
    if (buyPrice <= 0) break;
    if (regime.refDailyLow != null && buyPrice < regime.refDailyLow) break;
    if (jHasLotPrice_(heldLots, buyPrice)) continue;
    var needJpy = jCalcBuyCostJpy_(pair, buyPrice, amount, role);
    if (assets.jpy < needJpy) {
      jLog_(pair + ' JPY不足 停止（要' + needJpy + ' 残' + Math.round(assets.jpy) + '）');
      break;
    }
    jPlaceLimit_(pair, 'buy', buyPrice, amount, cfg);
    heldLots.push({
      price: buyPrice,
      amount: amount,
      trailHigh: null,
      filled: false,
    });
    placed += 1;
  }

  state.gridLots = heldLots;
  state.lastTrapStep = plan.trapStep;
  state.lastLevels = plan.levels;
  state.lastRebuildAt = new Date().toISOString();

  jMarkGridFills_(pair, ticker, state, global, cfg);
  jManageGridTrails_(pair, ticker, assets, state, global, cfg, plan);

  result.active = true;
  result.note = '再構築 新規' + placed + '本 計' + plan.levels + '本 間隔' + plan.trapStep;
  jSaveState_(pair, state);
  return result;
}
