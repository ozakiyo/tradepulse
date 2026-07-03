/**
 * チームB グリッド計画
 * 1) ATR → トラップ間隔（trapStep）
 * 2) RSI + BB → 仕掛けレンジ（rangeSpan / levels）の拡大・縮小
 */
function b2CalcGridPlan_(closed, lastPrice, cfg) {
  var closes = closed.map(function (c) {
    return c.close;
  });
  var atrPct = b2CalcAtrPct_(closed, cfg.atrPeriod);
  var rsi = b2CalcRsi_(closes, cfg.rsiPeriod);
  var bb = b2CalcBollinger_(closes, cfg.bbPeriod, cfg.bbStdDev);

  var volFactor = 1;
  if (atrPct != null) {
    volFactor = atrPct / cfg.atrRefPct;
    volFactor = Math.max(cfg.trapStepMinFactor, Math.min(cfg.trapStepMaxFactor, volFactor));
  }
  var trapStep = Math.round((cfg.baseTrapStepJpy * volFactor) / 5000) * 5000;
  trapStep = Math.max(cfg.trapStepMinJpy, Math.min(cfg.trapStepMaxJpy, trapStep));

  var spanFactor = 1;
  var bbWidthPct = bb ? bb.widthPct : null;
  var bbPos = 0.5;
  if (bb && bb.upper > bb.lower) {
    bbPos = (lastPrice - bb.lower) / (bb.upper - bb.lower);
    bbPos = Math.max(0, Math.min(1, bbPos));
  }

  if (rsi != null && bb) {
    if (rsi <= cfg.rsiExpandBelow && bbPos <= B2_CONFIG.BB_EXPAND_BELOW_POS) {
      spanFactor += B2_CONFIG.RSI_BB_EXPAND_BONUS;
    }
    if (rsi >= cfg.rsiContractAbove && bbPos >= B2_CONFIG.BB_CONTRACT_ABOVE_POS) {
      spanFactor -= B2_CONFIG.RSI_BB_CONTRACT_PENALTY;
    }
    if (bbWidthPct != null && bbWidthPct <= B2_CONFIG.BB_SQUEEZE_WIDTH_PCT) {
      spanFactor -= B2_CONFIG.BB_SQUEEZE_PENALTY;
    }
    if (bbWidthPct != null && bbWidthPct >= B2_CONFIG.BB_WIDE_WIDTH_PCT) {
      spanFactor += B2_CONFIG.BB_WIDE_BONUS;
    }
  }
  spanFactor = Math.max(cfg.spanMinFactor, Math.min(cfg.spanMaxFactor, spanFactor));

  var maxRangeSpan = (cfg.maxLevels - 1) * trapStep;
  var rangeSpan = Math.round((maxRangeSpan * spanFactor) / trapStep) * trapStep;
  rangeSpan = Math.max(trapStep, Math.min(maxRangeSpan, rangeSpan));
  var levels = Math.floor(rangeSpan / trapStep) + 1;
  levels = Math.max(cfg.minLevels, Math.min(cfg.maxLevels, levels));
  rangeSpan = (levels - 1) * trapStep;

  var note =
    '間隔' +
    trapStep +
    '円(ATR' +
    (atrPct != null ? atrPct.toFixed(2) + '%×' + volFactor.toFixed(2) : '未取得') +
    ')×' +
    levels +
    '本(RSI' +
    (rsi != null ? rsi.toFixed(1) : '-') +
    ' BB幅' +
    (bbWidthPct != null ? bbWidthPct.toFixed(2) + '%' : '-') +
    ' span×' +
    spanFactor.toFixed(2) +
    ' 下限～' +
    rangeSpan +
    '円)';

  return {
    trapStep: trapStep,
    rangeSpan: rangeSpan,
    levels: levels,
    atrPct: atrPct,
    rsi: rsi,
    bbWidthPct: bbWidthPct,
    bbPos: bbPos,
    volFactor: volFactor,
    spanFactor: spanFactor,
    note: note,
  };
}

function b2ShouldRebuild_(state, plan, cfg) {
  if (state.mode !== 'toraripi') return true;
  if (!state.lastRangeSpan) return true;

  var heldCount = b2CountFilledLots_(state);
  var rangePct =
    heldCount > 0 ? cfg.rebuildRangeChangePctHeld : cfg.rebuildRangeChangePct;
  var rangeChanged =
    Math.abs(state.lastRangeSpan - plan.rangeSpan) / state.lastRangeSpan >= rangePct;
  var planChanged =
    state.lastLevels !== plan.levels || state.lastTrapStep !== plan.trapStep;

  if (heldCount === 0) {
    if (planChanged || rangeChanged) return true;
    return false;
  }

  if (state.lastRebuildAt) {
    var elapsed = (Date.now() - new Date(state.lastRebuildAt).getTime()) / 60000;
    if (elapsed < cfg.rebuildCooldownMinHeld) return false;
  }

  if (planChanged || rangeChanged) return true;
  return false;
}

function b2CountFilledLots_(state) {
  var lots = b2GetGridLots_(state);
  var n = 0;
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled !== false) n += 1;
  }
  return n;
}

function b2SplitGridLots_(state) {
  var lots = b2GetGridLots_(state);
  var held = [];
  var pending = [];
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled === false) pending.push(lots[i]);
    else held.push(lots[i]);
  }
  return { held: held, pending: pending };
}

function b2HasLotPrice_(lots, price) {
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].price === price) return true;
  }
  return false;
}

function b2RunToraripi_(candles1h, ticker, assets, cfg, state) {
  var last = ticker.last;
  var closed = candles1h.slice(0, -1);
  if (closed.length < 30) closed = candles1h;

  var plan = b2CalcGridPlan_(closed, last, cfg);
  var amount = b2FormatBtc_(cfg.btcPerLevel);
  if (amount < B2_CONFIG.MIN_BTC_AMOUNT) {
    b2Log_('BTC_PER_LEVEL が最小数量未満');
    return { plan: plan, active: true, activeNote: 'BTC_PER_LEVEL不足' };
  }

  if (!b2ShouldRebuild_(state, plan, cfg)) {
    var filled = b2MarkGridFills_(ticker, state, cfg);
    var trailResult = { soldAny: false, soldCount: 0 };
    if (assets.btc >= B2_CONFIG.MIN_BTC_AMOUNT) {
      trailResult = b2ManageGridTrails_(ticker, assets, cfg, state);
    }
    var reasons = [];
    if (filled > 0) reasons.push('買い約定' + filled + '本');
    if (trailResult.soldAny) {
      reasons.push(
        'トレール利確' + (trailResult.soldCount > 1 ? trailResult.soldCount + '本' : '')
      );
    }
    var active = reasons.length > 0;
    b2Log_(
      'トラリピ維持 ' + plan.note + (active ? ' [' + reasons.join(', ') + ']' : '')
    );
    return {
      plan: plan,
      active: active,
      activeNote: active ? reasons.join(', ') : 'トラリピ維持',
    };
  }

  if (cfg.leaguePauseNew) {
    var filledPause = b2MarkGridFills_(ticker, state, cfg);
    var trailPause = { soldAny: false, soldCount: 0 };
    if (assets.btc >= B2_CONFIG.MIN_BTC_AMOUNT) {
      trailPause = b2ManageGridTrails_(ticker, assets, cfg, state);
    }
    b2Log_('リーグ新規停止: グリッド再構築スキップ');
    return {
      plan: plan,
      active: filledPause > 0 || trailPause.soldAny,
      activeNote: 'リーグ新規停止',
    };
  }

  var split = b2SplitGridLots_(state);
  var heldLots = split.held;

  b2CancelUnfilledBuyOrders_(cfg);

  if (cfg.dryRun && split.pending.length > 0) {
    b2Log_('紙グリッド未約定 ' + split.pending.length + ' 本を再構築で除外');
  }

  var placed = 0;
  var newGridOrders = [];
  for (var i = 0; i < plan.levels; i++) {
    var buyPrice = Math.round(last - i * plan.trapStep);
    if (buyPrice <= 0) continue;
    if (b2HasLotPrice_(heldLots, buyPrice)) continue;
    var needJpy = buyPrice * amount * 1.02;
    if (!cfg.dryRun && assets.jpy < needJpy) {
      b2Log_('JPY不足のため買い停止（必要約' + Math.round(needJpy) + '円 残' + assets.jpy + '）');
      break;
    }
    if (cfg.dryRun && assets.jpy < needJpy) {
      b2Log_('紙JPY不足のため買い停止（残' + Math.round(assets.jpy) + '円）');
      break;
    }
    b2PlaceLimit_('buy', buyPrice, amount, cfg);
    newGridOrders.push({
      price: buyPrice,
      amount: amount,
      trailHigh: null,
      filled: false,
    });
    b2AppendTradeLog_('買い', buyPrice, amount, 'B2トラリピ');
    placed += 1;
  }

  var merged = heldLots.concat(newGridOrders);
  b2Log_(
    'B2 買いグリッド 新規' +
      placed +
      '本 保有' +
      heldLots.length +
      '本（' +
      plan.note +
      '・' +
      amount +
      ' BTC/本）'
  );

  state.mode = 'toraripi';
  state.lastTrapStep = plan.trapStep;
  state.lastRangeSpan = plan.rangeSpan;
  state.lastLevels = plan.levels;
  state.lastRebuildAt = new Date().toISOString();
  if (cfg.dryRun) {
    state.paperGridOrders = merged;
  } else {
    state.gridLots = merged;
  }

  b2MarkGridFills_(ticker, state, cfg);
  if (assets.btc >= B2_CONFIG.MIN_BTC_AMOUNT) {
    b2ManageGridTrails_(ticker, assets, cfg, state);
  }

  return {
    plan: plan,
    active: true,
    activeNote:
      'グリッド再構築 新規' + placed + '本 保有' + heldLots.length + '本',
  };
}

/** 本番: 指値にタッチしたロットを約定済みにする。新規約定本数を返す */
function b2MarkGridFills_(ticker, state, cfg) {
  var last = ticker.last;
  var lots = b2GetGridLots_(state);
  var filled = 0;
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled === false && last <= lots[i].price) {
      lots[i].filled = true;
      if (cfg && cfg.dryRun) {
        b2ApplyPaperTrade_(state, 'buy', lots[i].price, lots[i].amount);
      }
      filled += 1;
    }
  }
  return filled;
}

function b2GetGridLots_(state) {
  if (state.paperGridOrders && state.paperGridOrders.length) {
    return state.paperGridOrders;
  }
  if (!state.gridLots) state.gridLots = [];
  return state.gridLots;
}

/**
 * 買値 + トラップ間隔（設定幅）到達でトレール開始。
 * 各ロットごとに高値更新 → 戻り率で利確。
 */
function b2ManageGridTrails_(ticker, assets, cfg, state) {
  var last = ticker.last;
  var step = state.lastTrapStep || cfg.baseTrapStepJpy;
  var activateWidth = Math.round(step * (cfg.trailActivateStepMult || 1));
  var lots = b2GetGridLots_(state);
  if (!lots.length) return { soldAny: false, soldCount: 0 };

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
    var sellPrice = Math.round(lot.trailHigh * (1 - cfg.trailCallbackPct / 100));

    if (last <= sellPrice) {
      var amt = b2FormatBtc_(lot.amount);
      if (amt >= B2_CONFIG.MIN_BTC_AMOUNT) {
        b2PlaceLimit_('sell', sellPrice, amt, cfg);
        if (cfg.dryRun) {
          b2ApplyPaperTrade_(state, 'sell', sellPrice, amt);
        }
        b2AppendTradeLog_(
          '売り',
          sellPrice,
          amt,
          'B2トレール(買' + lot.price + '+幅' + activateWidth + ')'
        );
        b2Log_(
          'トレール利確 lot buy=' +
            lot.price +
            ' sell=' +
            sellPrice +
            ' trailHigh=' +
            lot.trailHigh
        );
        soldAny = true;
        soldCount += 1;
      }
      continue;
    }

    remaining.push(lot);
  }

  if (state.paperGridOrders) {
    state.paperGridOrders = remaining;
  } else {
    state.gridLots = remaining;
  }

  if (soldAny && cfg.dryRun && state.paperWallet) {
    assets.jpy = state.paperWallet.jpy;
    assets.btc = state.paperWallet.btc;
  }

  return { soldAny: soldAny, soldCount: soldCount };
}
