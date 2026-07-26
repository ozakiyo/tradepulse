import {
  getCandles1h_,
  getCandles5m_,
  getCandlesDaily_,
  getLastClosed5m_,
  getLastClosed5mList_,
  getLastClosed1hList_,
  getTickerFromCandles_,
} from './chart-data.mjs';
import {
  applyPaperClose_,
  applyPaperOpen_,
  getAssetsForRun_,
  marginJpy_,
} from './paper-wallet.mjs';
import {
  findGsaxoNetByUic_,
  getGsaxoLiveAssets_,
  gsaxoPositionFromNet_,
  placeGsaxoOrder_,
  syncGsaxoPosition_,
} from './gsaxo-live.mjs';
import {
  gsaxoCalcPartialCloseUnits_,
  gsaxoFormatUnits_,
  gsaxoGetRangeCfg_,
  gsaxoGetTrendFilterCfg_,
  gsaxoRoundPrice_,
  G_SAXO_INSTRUMENTS,
} from './gsaxo-instruments.mjs';
import {
  calcTakeProfit_,
  detectDailyRange_,
  detectH1Range_,
  isAtOrPastTakeProfit_,
  isDailyAdverseBreakConfirmed_,
  isH1AdverseBreakConfirmed_,
  isNearLower_,
  isNearUpper_,
} from './range-detect.mjs';
import {
  applyDailyStopCooldown_,
  countOpenPositions_,
  getDailyStopCooldownBlock_,
  getPairState_,
} from './gsaxo-state.mjs';
import { resolveSpreadRate_ } from './gsaxo-spread.mjs';
import { appendTradeLog_ } from './trade-log.mjs';
import { evaluateTrendFilter_, trendFilterBlockSignal_, evaluateVolSpike_, volSpikeBlockSignal_ } from './trend-filter.mjs';
import { recordTrendStopSample_ } from './trend-threshold-auto.mjs';
import { applyTrendStopWatch_ } from './trend-stop-watch.mjs';

async function getAssets_(cfg, state, saxoCfg, accountKey) {
  if (cfg.dryRun) return getAssetsForRun_(cfg, state);
  return getGsaxoLiveAssets_(saxoCfg, accountKey);
}

async function placeOrder_(
  log,
  pairId,
  inst,
  resolved,
  action,
  side,
  price,
  units,
  memo,
  cfg,
  saxoCfg,
  accountKey
) {
  const px = gsaxoRoundPrice_(inst, price);
  if (cfg.dryRun) {
    log(`[PAPER] ${inst.label} ${action} ${side} @${px} x${units}`);
  } else {
    await placeGsaxoOrder_(saxoCfg, accountKey, resolved, inst, action, side, units, log);
  }
  const sideLabel =
    action === '新規'
      ? side === 'long'
        ? 'ロング新規'
        : 'ショート新規'
      : side === 'long'
        ? 'ロング決済'
        : 'ショート決済';
  await appendTradeLog_(pairId, inst, sideLabel, px, units, memo);
}

async function closePosition_(
  pairId,
  inst,
  resolved,
  pos,
  price,
  cfg,
  state,
  ps,
  memo,
  saxoCfg,
  accountKey,
  log,
  trend
) {
  const units = gsaxoFormatUnits_(inst, pos.units);
  await placeOrder_(log, pairId, inst, resolved, '決済', pos.side, price, units, memo, cfg, saxoCfg, accountKey);
  if (cfg.dryRun) {
    applyPaperClose_(state, inst, pos.side, pos.entryPrice, price, units, cfg);
  }
  const sideLabel = pos.side === 'long' ? 'ロング決済' : 'ショート決済';
  log(`${pairId} ${memo} ${sideLabel} @${price}`);
  if (memo.includes('日足損切')) {
    if (cfg.dailyStopCooldownHours > 0) {
      applyDailyStopCooldown_(ps, cfg.dailyStopCooldownHours);
      log(`${pairId} 新規停止 ${cfg.dailyStopCooldownHours}h（日足損切クールダウン）`);
    }
    recordTrendStopSample_(pairId, ps, trend, cfg, log);
  }
  ps.position = null;
}

async function closePartial_(
  pairId,
  inst,
  resolved,
  pos,
  closeUnits,
  price,
  cfg,
  state,
  ps,
  memo,
  saxoCfg,
  accountKey,
  log
) {
  const units = gsaxoFormatUnits_(inst, closeUnits);
  if (units < inst.minUnits) return false;
  await placeOrder_(log, pairId, inst, resolved, '決済', pos.side, price, units, memo, cfg, saxoCfg, accountKey);
  if (cfg.dryRun) {
    applyPaperClose_(state, inst, pos.side, pos.entryPrice, price, units, cfg);
  }
  log(`${pairId} ${memo} ${pos.side} @${price} x${units}`);
  const remain = gsaxoFormatUnits_(inst, pos.units - units);
  if (remain >= inst.minUnits) {
    pos.units = remain;
    pos.h1PartialDone = true;
    pos.positionId = null;
    ps.position = pos;
    if (!cfg.dryRun) {
      await syncGsaxoPosition_(pairId, ps, saxoCfg, accountKey, resolved, log);
    }
  } else {
    ps.position = null;
  }
  return true;
}

async function openPosition_(
  pairId,
  inst,
  resolved,
  side,
  price,
  cfg,
  state,
  ps,
  memo,
  saxoCfg,
  accountKey,
  log
) {
  let units = gsaxoFormatUnits_(inst, inst.defaultUnits);
  if (units < inst.minUnits) units = inst.minUnits;
  const assets = await getAssets_(cfg, state, saxoCfg, accountKey);
  const need = marginJpy_(inst, price, units, cfg);
  if (!cfg.dryRun && assets.marginCallStatus && assets.marginCallStatus !== 'NORMAL') {
    ps.lastSignal = `追証/${assets.marginCallStatus}`;
    return false;
  }
  if (assets.jpy < need * 1.05) {
    ps.lastSignal = '証拠金不足';
    return false;
  }
  if (need > cfg.maxMarginJpyPerPair) {
    ps.lastSignal = '銘柄上限超過';
    return false;
  }
  if (!cfg.dryRun) {
    const existing = await findGsaxoNetByUic_(saxoCfg, accountKey, resolved.uic);
    if (existing) {
      ps.position = gsaxoPositionFromNet_(existing, ps.position);
      ps.lastSignal = `保有(${existing.side})Saxo既存`;
      log(`${pairId} 新規見送り(Saxo既存) ${existing.side} x${existing.units}`);
      return false;
    }
  }
  const entryPx = gsaxoRoundPrice_(inst, price);
  ps.position = {
    side,
    units,
    entryPrice: entryPx,
    entryAt: new Date().toISOString(),
    h1PartialDone: false,
    positionId: null,
  };
  try {
    await placeOrder_(log, pairId, inst, resolved, '新規', side, entryPx, units, memo, cfg, saxoCfg, accountKey);
    if (cfg.dryRun) {
      applyPaperOpen_(state, inst, entryPx, units, cfg);
    } else {
      await syncGsaxoPosition_(pairId, ps, saxoCfg, accountKey, resolved, log);
    }
  } catch (e) {
    ps.position = null;
    throw e;
  }
  const label = side === 'long' ? 'ロング新規' : 'ショート新規';
  ps.lastSignal = `${label}@${entryPx}`;
  log(`${pairId} ${memo} ${side} @${entryPx} x${units}`);
  return true;
}

async function manageOpenPosition_(
  pairId,
  inst,
  resolved,
  ps,
  price,
  daily,
  h1,
  cfg,
  state,
  saxoCfg,
  accountKey,
  log,
  trend,
  spreadOpts,
  closed5mBars,
  closed1hBars
) {
  const pos = ps.position;
  if (!pos?.side) return null;
  if (pos.units < inst.minUnits) return null;

  if (
    isDailyAdverseBreakConfirmed_(
      closed5mBars,
      daily,
      pos.side,
      spreadOpts,
      cfg.dailyStopBufferPct,
      cfg.dailyStopConfirmBars
    )
  ) {
    if (cfg.trendModeEnabled && cfg.trendStopWatchEnabled) {
      applyTrendStopWatch_(pairId, ps, pos, daily, price, cfg, log);
    }
    const dailyMemo = pos.h1PartialDone ? 'GSAXO日足損切(残り)' : 'GSAXO日足損切';
    await closePosition_(
      pairId,
      inst,
      resolved,
      pos,
      price,
      cfg,
      state,
      ps,
      dailyMemo,
      saxoCfg,
      accountKey,
      log,
      trend
    );
    return '日足損切';
  }

  const h1StopSpreadOpts = spreadOpts
    ? { ...spreadOpts, spreadMult: cfg.h1StopSpreadMult ?? spreadOpts.spreadMult }
    : null;

  if (
    !pos.h1PartialDone &&
    isH1AdverseBreakConfirmed_(
      closed1hBars,
      h1,
      pos.side,
      h1StopSpreadOpts,
      cfg.h1StopBufferPct,
      cfg.h1StopConfirmBars
    )
  ) {
    const split = gsaxoCalcPartialCloseUnits_(inst, pos.units, cfg.partialStopRatio);
    const pctLabel = `${Math.round(cfg.partialStopRatio * 100)}%`;
    if (split.canSplit) {
      await closePartial_(
        pairId,
        inst,
        resolved,
        pos,
        split.closeUnits,
        price,
        cfg,
        state,
        ps,
        `GSAXO1H損切(${pctLabel})`,
        saxoCfg,
        accountKey,
        log
      );
      if (ps.position) ps.position.h1PartialDone = true;
      return `1H損切(${pctLabel})`;
    }
    await closePosition_(
      pairId,
      inst,
      resolved,
      pos,
      price,
      cfg,
      state,
      ps,
      'GSAXO1H損切(全量)',
      saxoCfg,
      accountKey,
      log,
      trend
    );
    return '1H損切(全量)';
  }

  const tpPrice = calcTakeProfit_(pos.side, h1, cfg.tpRatio);
  if (
    isAtOrPastTakeProfit_(price, tpPrice, pos.side, cfg.touchPct, {
      entryPrice: pos.entryPrice,
      ...spreadOpts,
    })
  ) {
    const tpPctLabel = `${Math.round(cfg.tpRatio * 100)}%`;
    const tpMemo =
      pos.side === 'long'
        ? pos.h1PartialDone
          ? `GSAXOロング利確(残りTP${tpPctLabel})`
          : `GSAXOロング利確(TP${tpPctLabel})`
        : pos.h1PartialDone
          ? `GSAXOショート利確(残りTP${tpPctLabel})`
          : `GSAXOショート利確(TP${tpPctLabel})`;
    await closePosition_(
      pairId,
      inst,
      resolved,
      pos,
      price,
      cfg,
      state,
      ps,
      tpMemo,
      saxoCfg,
      accountKey,
      log,
      trend
    );
    return pos.side === 'long' ? 'ロング利確' : 'ショート利確';
  }

  return null;
}

export async function runRangeForPair_(
  pairId,
  inst,
  resolved,
  cfg,
  state,
  saxoCfg,
  accountKey,
  log,
  { prefetched } = {}
) {
  const ps = getPairState_(state, pairId);
  const rangeCfg = gsaxoGetRangeCfg_(inst, cfg);
  let active = false;
  const notes = [];

  const candles1h =
    prefetched?.candles1h ??
    (await getCandles1h_(saxoCfg, resolved.uic, resolved.assetType, cfg.minCandles1h));
  const candles5m =
    prefetched?.candles5m ??
    (await getCandles5m_(saxoCfg, resolved.uic, resolved.assetType, cfg.minCandles5m));
  const candlesDaily =
    prefetched?.candlesDaily ??
    (await getCandlesDaily_(
      saxoCfg,
      resolved.uic,
      resolved.assetType,
      rangeCfg.dailyLookback + 5
    ));
  const closed5m = getLastClosed5m_(candles5m);
  const closed5mBars = getLastClosed5mList_(candles5m, cfg.dailyStopConfirmBars);
  const closed1hBars = getLastClosed1hList_(candles1h, cfg.h1StopConfirmBars);
  const ticker = getTickerFromCandles_(candles1h);

  if (candles1h.length < cfg.minCandles1h) {
    return { active: false, activeNote: '1H不足', ticker, daily: null, h1: null };
  }
  if (!closed5m) {
    return { active: false, activeNote: '5分足不足', ticker, daily: null, h1: null };
  }

  const daily = detectDailyRange_(candlesDaily, rangeCfg);
  const h1 = detectH1Range_(candles1h, daily, rangeCfg);
  const price = closed5m.close;
  const instDef = G_SAXO_INSTRUMENTS[pairId];
  const trendCfg = gsaxoGetTrendFilterCfg_(pairId, instDef, cfg, ps);
  const trend = evaluateTrendFilter_(candles1h, trendCfg);
  const volSpike = evaluateVolSpike_(candles1h, cfg);
  ps.lastTrendNote = trend.note;
  if (volSpike.note) {
    ps.lastTrendNote = ps.lastTrendNote ? `${ps.lastTrendNote} ${volSpike.note}` : volSpike.note;
  }
  if (trendCfg.thresholdSource === 'auto') {
    ps.lastTrendNote += ' auto';
  }
  const assets = await getAssets_(cfg, state, saxoCfg, accountKey);

  ps.lastDailyNote = daily.note;
  ps.lastH1Note = h1.note;

  const spreadRate = await resolveSpreadRate_(inst, {
    saxoCfg,
    accountKey,
    resolved,
    dryRun: cfg.dryRun,
  });
  const spreadOpts =
    spreadRate > 0 ? { spreadRate, spreadMult: cfg.tpSpreadMult } : null;

  if (!cfg.dryRun) {
    const net = await findGsaxoNetByUic_(saxoCfg, accountKey, resolved.uic);
    if (net) {
      ps.position = gsaxoPositionFromNet_(net, ps.position);
    } else if (ps.position?.side) {
      ps.position = null;
    }
  }

  const pos = ps.position;
  const hasPos = pos?.side && pos.units > 0;

  if (hasPos) {
    if (!cfg.dryRun) {
      await syncGsaxoPosition_(pairId, ps, saxoCfg, accountKey, resolved, log);
    }
    const exitNote = await manageOpenPosition_(
      pairId,
      inst,
      resolved,
      ps,
      price,
      daily,
      h1,
      cfg,
      state,
      saxoCfg,
      accountKey,
      log,
      trend,
      spreadOpts,
      closed5mBars,
      closed1hBars
    );
    if (exitNote) {
      active = true;
      notes.push(exitNote);
    } else {
      const cur = ps.position;
      ps.lastSignal = cur?.h1PartialDone ? `保有(${cur.side}残)` : `保有(${cur?.side})`;
    }
    return {
      active,
      activeNote: notes.join(', ') || ps.lastSignal,
      ticker,
      daily,
      h1,
      price,
      assets,
    };
  }

  if (!daily.isRange || !h1.isRange) {
    ps.lastSignal = `待機(${daily.isRange ? '' : '日足NG'}${h1.isRange ? '' : '1HNG'})`;
    return { active: false, activeNote: ps.lastSignal, ticker, daily, h1, price, assets };
  }

  if (countOpenPositions_(state) >= cfg.maxOpenPositions) {
    ps.lastSignal = '新規見送り(保有上限)';
    return { active: false, activeNote: ps.lastSignal, ticker, daily, h1, price, assets };
  }

  const dailyStopCd = getDailyStopCooldownBlock_(ps, cfg.dailyStopCooldownHours);
  if (dailyStopCd) {
    ps.lastSignal = `新規見送り(日足損切後${dailyStopCd.remainH}h)`;
    return { active: false, activeNote: ps.lastSignal, ticker, daily, h1, price, assets, trend };
  }

  const trendBlock = trendFilterBlockSignal_(trend);
  if (trendBlock) {
    ps.lastSignal = trendBlock;
    return { active: false, activeNote: ps.lastSignal, ticker, daily, h1, price, assets, trend };
  }

  const volBlock = volSpikeBlockSignal_(volSpike);
  if (volBlock) {
    ps.lastSignal = volBlock;
    return { active: false, activeNote: ps.lastSignal, ticker, daily, h1, price, assets, trend };
  }

  if (isNearLower_(price, h1.low, rangeCfg.touchPct, spreadOpts)) {
    if (cfg.leaguePauseNew) {
      ps.lastSignal = 'リーグ新規停止';
    } else if (
      await openPosition_(
        pairId,
        inst,
        resolved,
        'long',
        price,
        cfg,
        state,
        ps,
        'GSAXOレンジ下限ロング',
        saxoCfg,
        accountKey,
        log
      )
    ) {
      active = true;
      notes.push('下限ロング');
    }
  } else if (isNearUpper_(price, h1.high, rangeCfg.touchPct, spreadOpts)) {
    if (cfg.leaguePauseNew) {
      ps.lastSignal = 'リーグ新規停止';
    } else if (
      await openPosition_(
        pairId,
        inst,
        resolved,
        'short',
        price,
        cfg,
        state,
        ps,
        'GSAXOレンジ上限ショート',
        saxoCfg,
        accountKey,
        log
      )
    ) {
      active = true;
      notes.push('上限ショート');
    }
  } else if (
    spreadOpts &&
    (isNearLower_(price, h1.low, rangeCfg.touchPct) ||
      isNearUpper_(price, h1.high, rangeCfg.touchPct))
  ) {
    ps.lastSignal = '新規見送り(スプレッド)';
  } else {
    ps.lastSignal = 'レンジ内待機';
  }

  return {
    active,
    activeNote: notes.join(', ') || ps.lastSignal,
    ticker,
    daily,
    h1,
    price,
    assets,
    trend,
  };
}
