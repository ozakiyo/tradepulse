/**
 * 1時間足のATR%（平均真幅/価格）
 */
function bbCalcAtrPct_(candles, period) {
  if (candles.length < period + 2) return null;
  var tr = [];
  for (var i = 1; i < candles.length; i++) {
    var hl = candles[i].high - candles[i].low;
    var hc = Math.abs(candles[i].high - candles[i - 1].close);
    var lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  var start = Math.max(0, tr.length - period);
  var sum = 0;
  var count = 0;
  for (var j = start; j < tr.length; j++) {
    var close = candles[j + 1].close;
    if (close > 0) {
      sum += tr[j] / close;
      count += 1;
    }
  }
  if (!count) return null;
  return (sum / count) * 100;
}

/**
 * 各トラップ間隔（trapStep）は固定。
 * 上限（現在値）～下限（どこまで下に並べるか）のレンジ幅だけATRで調整し、本数を決める。
 *
 * 例: 間隔5万・最大30本 → 上限span 145万円
 * ATRでspanが21万 → 5本（0, 5万, 10万, 15万, 20万円下）
 */
function bbCalcRangeSpan_(closed, cfg, trapStep, maxLevels) {
  var maxRangeSpan = (maxLevels - 1) * trapStep;
  var atrPct = bbCalcAtrPct_(closed, 14);
  if (atrPct == null) {
    return {
      trapStep: trapStep,
      rangeSpan: maxRangeSpan,
      levels: maxLevels,
      atrPct: null,
      factor: 1,
      note:
        '間隔' +
        trapStep +
        '円×' +
        maxLevels +
        '本（上限～下限' +
        maxRangeSpan +
        '円・ATR未取得）',
    };
  }
  var ref = cfg.toraripiAtrRefPct;
  var factor = atrPct / ref;
  factor = Math.max(cfg.toraripiWidthMinFactor, Math.min(cfg.toraripiWidthMaxFactor, factor));
  var rangeSpan = Math.round((maxRangeSpan * factor) / trapStep) * trapStep;
  rangeSpan = Math.max(trapStep, Math.min(maxRangeSpan, rangeSpan));
  var levels = Math.floor(rangeSpan / trapStep) + 1;
  levels = Math.max(1, Math.min(maxLevels, levels));
  rangeSpan = (levels - 1) * trapStep;

  return {
    trapStep: trapStep,
    rangeSpan: rangeSpan,
    levels: levels,
    maxRangeSpan: maxRangeSpan,
    atrPct: Math.round(atrPct * 1000) / 1000,
    factor: Math.round(factor * 1000) / 1000,
    note:
      '間隔' +
      trapStep +
      '円×' +
      levels +
      '本（上限～下限' +
      maxRangeSpan +
      '→' +
      rangeSpan +
      '円 ATR' +
      atrPct.toFixed(2) +
      '%）',
  };
}

function bbShouldRebuildToraripi_(state, modeTag, rangeSpan, levels) {
  if (!/^(toraripi_full|toraripi_half)$/.test(state.mode || '')) return true;
  if (state.lastToraripiMode !== modeTag) return true;
  if (state.lastToraripiLevels !== levels) return true;
  if (!state.lastToraripiRangeSpan) return true;
  if (
    Math.abs(state.lastToraripiRangeSpan - rangeSpan) / state.lastToraripiRangeSpan >=
    0.1
  ) {
    return true;
  }
  return false;
}

/**
 * 買い指値: 現在値（上限）から trapStep 円刻みで下限まで。
 */
function bbRunToraripi_(candles1h, ticker, assets, cfg, state, modeTag) {
  var last = ticker.last;
  var closed = candles1h.slice(0, -1);
  if (closed.length < 30) closed = candles1h;

  var trapStep = modeTag === 'toraripi_full' ? cfg.toraripiWidthFull : cfg.toraripiWidthHalf;
  var maxLevels = modeTag === 'toraripi_full' ? cfg.gridLevelsFull : cfg.gridLevelsHalf;
  var spanInfo = bbCalcRangeSpan_(closed, cfg, trapStep, maxLevels);
  var btcPerLevel =
    modeTag === 'toraripi_full' ? cfg.btcPerLevelFull : cfg.btcPerLevelHalf;
  var amount = bbFormatBtc_(btcPerLevel);
  if (amount < BB_CONFIG.MIN_BTC_AMOUNT) {
    bbLog_('BTC_PER_LEVEL が最小数量未満: ' + btcPerLevel);
    return;
  }

  var rebuild = bbShouldRebuildToraripi_(
    state,
    modeTag,
    spanInfo.rangeSpan,
    spanInfo.levels
  );
  if (!rebuild) {
    bbMarkGridFills_(ticker, state);
    if (bbHasActiveGridLots_(state) || assets.btc >= BB_CONFIG.MIN_BTC_AMOUNT) {
      bbManageGridTrails_(ticker, assets, cfg, state);
    }
    bbLog_('トラリピ維持 ' + spanInfo.note);
    return;
  }

  if (cfg.leaguePauseNew) {
    bbMarkGridFills_(ticker, state);
    if (bbHasActiveGridLots_(state) || assets.btc >= BB_CONFIG.MIN_BTC_AMOUNT) {
      bbManageGridTrails_(ticker, assets, cfg, state);
    }
    bbLog_('リーグ新規停止: トラリピ再構築スキップ');
    return;
  }

  bbCancelAllOrders_(cfg);
  state.gridLots = [];

  var placed = 0;
  var newGridLots = [];
  for (var i = 0; i < spanInfo.levels; i++) {
    var buyPrice = Math.round(last - i * spanInfo.trapStep);
    if (buyPrice <= 0) continue;
    var needJpy = buyPrice * amount * 1.02;
    if (assets.jpy < needJpy) {
      bbLog_('JPY不足のため買い停止（必要約' + Math.round(needJpy) + '円 残' + assets.jpy + '）');
      break;
    }
    bbPlaceLimit_('buy', buyPrice, amount, cfg);
    newGridLots.push({
      price: buyPrice,
      amount: amount,
      trailHigh: null,
      filled: cfg.dryRun,
    });
    bbAppendTradeLog_('買い', buyPrice, amount, modeTag);
    placed += 1;
  }
  bbLog_(
    modeTag +
      ' 買いグリッド ' +
      placed +
      ' 本（' +
      spanInfo.note +
      '・' +
      amount +
      ' BTC/本）'
  );

  state.lastToraripiMode = modeTag;
  state.lastToraripiRangeSpan = spanInfo.rangeSpan;
  state.lastToraripiLevels = spanInfo.levels;
  state.lastToraripiTrapStep = trapStep;
  state.lastToraripiAtrPct = spanInfo.atrPct;
  state.lastToraripiRangeWidth = null;
  state.gridLots = newGridLots;

  bbMarkGridFills_(ticker, state);
  if (bbHasActiveGridLots_(state) || assets.btc >= BB_CONFIG.MIN_BTC_AMOUNT) {
    bbManageGridTrails_(ticker, assets, cfg, state);
  }

  state.mode = modeTag;
}

function bbHasActiveGridLots_(state) {
  var lots = bbGetGridLots_(state);
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled !== false) return true;
  }
  return false;
}

/** 本番: 指値にタッチしたロットを約定済みにする */
function bbMarkGridFills_(ticker, state) {
  var last = ticker.last;
  var lots = bbGetGridLots_(state);
  for (var i = 0; i < lots.length; i++) {
    if (lots[i].filled === false && last <= lots[i].price) {
      lots[i].filled = true;
    }
  }
}

function bbGetGridLots_(state) {
  if (!state.gridLots) state.gridLots = [];
  return state.gridLots;
}

/**
 * 買値 + トラップ間隔（設定幅）到達でトレール開始。
 * 各ロットごとに高値更新 → 戻り率で利確。
 */
function bbManageGridTrails_(ticker, assets, cfg, state) {
  if (!/^(toraripi_full|toraripi_half)$/.test(state.mode || '')) return;

  var last = ticker.last;
  var step = state.lastToraripiTrapStep || cfg.toraripiWidthFull;
  var activateWidth = Math.round(step * (cfg.trailActivateStepMult || 1));
  var lots = bbGetGridLots_(state);
  if (!lots.length) return;

  var remaining = [];

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
      var amt = bbFormatBtc_(lot.amount);
      if (amt >= BB_CONFIG.MIN_BTC_AMOUNT) {
        bbPlaceLimit_('sell', sellPrice, amt, cfg);
        bbAppendTradeLog_(
          '売り',
          sellPrice,
          amt,
          'トレール(買' + lot.price + '+幅' + activateWidth + ')'
        );
        bbLog_(
          'トレール利確 lot buy=' +
            lot.price +
            ' sell=' +
            sellPrice +
            ' trailHigh=' +
            lot.trailHigh
        );
      }
      continue;
    }

    remaining.push(lot);
  }

  state.gridLots = remaining;
}
