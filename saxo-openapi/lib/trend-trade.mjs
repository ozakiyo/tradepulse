import {
  getCandles1h_,
  getCandlesDaily_,
  getTickerFromCandles_,
} from './chart-data.mjs';
import { gsaxoFormatUnits_, gsaxoRoundPrice_, gsaxoGetTrendFilterCfg_, G_SAXO_INSTRUMENTS } from './gsaxo-instruments.mjs';
import { countTrendOpenPositions_, getPairState_ } from './gsaxo-state.mjs';
import { evaluateTrendFilter_ } from './trend-filter.mjs';
import {
  clearTrendStopWatch_,
  dailyTrendFromSide_,
  getTrendStopWatch_,
  isOldRangeRegression_,
} from './trend-stop-watch.mjs';
import { closedCandles_, getEntrySignal_, judgeTrend_ } from './swing-trend.mjs';
import {
  applyTrendPaperClose_,
  applyTrendPaperOpen_,
  getTrendAssetsForRun_,
  initTrendPaperWallet_,
} from './trend-paper-wallet.mjs';
import { appendTrendTradeLog_ } from './trade-log.mjs';

function sideFromSignal_(signal) {
  if (signal === 'buy') return 'long';
  if (signal === 'sell') return 'short';
  return null;
}

async function placeTrendOrder_(log, pairId, inst, action, side, price, units, memo) {
  const px = gsaxoRoundPrice_(inst, price);
  log(`[TREND/PAPER] ${inst.label} ${action} ${side} @${px} x${units}`);
  const sideLabel =
    action === '新規'
      ? side === 'long'
        ? 'ロング新規'
        : 'ショート新規'
      : side === 'long'
        ? 'ロング決済'
        : 'ショート決済';
  await appendTrendTradeLog_(pairId, inst, sideLabel, px, units, memo);
}

async function closeTrendPosition_(pairId, inst, pos, price, cfg, state, ps, memo, log) {
  const units = gsaxoFormatUnits_(inst, pos.units);
  await placeTrendOrder_(log, pairId, inst, '決済', pos.side, price, units, memo);
  applyTrendPaperClose_(state, inst, pos.side, pos.entryPrice, price, units, cfg);
  log(`${pairId} [TREND] ${memo} ${pos.side} @${price}`);
  ps.trendPosition = null;
}

async function openTrendPosition_(pairId, inst, side, price, cfg, state, ps, memo, log, { refDailyHigh, refDailyLow } = {}) {
  let units = gsaxoFormatUnits_(inst, inst.defaultUnits);
  if (units < inst.minUnits) units = inst.minUnits;
  const margin = (price * units * (inst.quoteJpy ? 1 : cfg.usdJpyRef) * cfg.marginRate);
  const assets = getTrendAssetsForRun_(cfg, state);
  if (assets.jpy < margin * 1.05) {
    ps.lastTrendSignal = 'トレンド証拠金不足';
    return false;
  }
  if (margin > cfg.trendMaxMarginJpyPerPair) {
    ps.lastTrendSignal = 'トレンド銘柄上限超過';
    return false;
  }

  const entryPx = gsaxoRoundPrice_(inst, price);
  ps.trendPosition = {
    side,
    units,
    entryPrice: entryPx,
    entryAt: new Date().toISOString(),
    refDailyHigh: refDailyHigh ?? null,
    refDailyLow: refDailyLow ?? null,
    fromStopWatch: refDailyHigh != null && refDailyLow != null,
  };
  await placeTrendOrder_(log, pairId, inst, '新規', side, entryPx, units, memo);
  applyTrendPaperOpen_(state, inst, entryPx, units, cfg);
  const label = side === 'long' ? 'トレンドロング' : 'トレンドショート';
  ps.lastTrendSignal = `${label}@${entryPx}`;
  log(`${pairId} [TREND] ${memo} ${side} @${entryPx} x${units}`);
  return true;
}

/**
 * F-FX トレンドモード（G-SAXO ペーパー）
 * 損切連動: 日足損切後ウォッチ → 1H押し目エントリー → 旧レンジ回帰で損切
 */
export async function runTrendForPair_(
  pairId,
  inst,
  resolved,
  cfg,
  state,
  saxoCfg,
  log,
  { prefetched, trend: trendIn } = {}
) {
  const ps = getPairState_(state, pairId);
  if (!cfg.trendModeEnabled) {
    return { active: false, activeNote: 'トレンドモードOFF', skipped: true };
  }
  if (inst.category && inst.category !== 'fx') {
    ps.lastTrendSignal = 'トレンド非FX';
    return { active: false, activeNote: ps.lastTrendSignal, skipped: true };
  }

  const fmtPrice = (n) => gsaxoRoundPrice_(inst, n);
  const minDaily = cfg.trendMinCandlesDaily;
  const min1h = cfg.trendMinCandles1h;

  const candles1hRaw =
    prefetched?.candles1h ??
    (await getCandles1h_(saxoCfg, resolved.uic, resolved.assetType, min1h));
  const candlesDailyRaw =
    prefetched?.candlesDaily ??
    (await getCandlesDaily_(saxoCfg, resolved.uic, resolved.assetType, minDaily));

  const candles1h = closedCandles_(candles1hRaw);
  const candlesDaily = closedCandles_(candlesDailyRaw);
  const ticker = getTickerFromCandles_(candles1hRaw);
  const price = candles1h.length ? candles1h[candles1h.length - 1].close : ticker?.last;

  if (candles1h.length < min1h - 1) {
    ps.lastTrendSignal = 'トレンド1H不足';
    return { active: false, activeNote: ps.lastTrendSignal, daily: null, h1: null, price };
  }
  if (candlesDaily.length < minDaily - 1) {
    ps.lastTrendSignal = 'トレンド日足不足';
    return { active: false, activeNote: ps.lastTrendSignal, daily: null, h1: null, price };
  }

  const instDef = G_SAXO_INSTRUMENTS[pairId];
  const trendCfg = gsaxoGetTrendFilterCfg_(pairId, instDef, cfg, ps);
  const trend = trendIn ?? evaluateTrendFilter_(candles1hRaw, trendCfg);

  const dailyResult = judgeTrend_(candlesDaily, cfg.swingStrengthDaily);
  const hourlyResult = judgeTrend_(candles1h, cfg.swingStrength1h);
  ps.lastTrendDailyNote = dailyResult.note;
  ps.lastTrendH1Note = hourlyResult.note;

  const rangePos = ps.position;
  if (rangePos?.side && rangePos.units > 0) {
    ps.lastTrendSignal = 'レンジ保有中';
    return {
      active: false,
      activeNote: ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  initTrendPaperWallet_(state, cfg);
  let active = false;
  const notes = [];
  const tpos = ps.trendPosition;
  const hasTrendPos = tpos?.side && tpos.units > 0;
  const watch = getTrendStopWatch_(ps, cfg, { log, pairId });

  if (hasTrendPos) {
    const side = tpos.side;
    const entry = tpos.entryPrice;
    const pct =
      side === 'long' ? ((price - entry) / entry) * 100 : ((entry - price) / entry) * 100;

    if (
      cfg.trendOldRangeStop &&
      isOldRangeRegression_(price, tpos.refDailyLow, tpos.refDailyHigh)
    ) {
      await closeTrendPosition_(
        pairId,
        inst,
        tpos,
        price,
        cfg,
        state,
        ps,
        'GSAXO-T 旧レンジ回帰(損切)',
        log
      );
      active = true;
      notes.push('旧レンジ回帰');
      return {
        active,
        activeNote: notes.join(', '),
        daily: dailyResult,
        h1: hourlyResult,
        price,
        trend,
      };
    }

    const trendOk =
      (side === 'long' && hourlyResult.trend === 'up') ||
      (side === 'short' && hourlyResult.trend === 'down');

    if (!trendOk) {
      const isReversal =
        (side === 'long' && hourlyResult.trend === 'down') ||
        (side === 'short' && hourlyResult.trend === 'up');
      const profitOrLoss = pct >= 0 ? '利食い' : '損切り';
      const reason = isReversal
        ? `1Hトレンド反転(${profitOrLoss})`
        : `1Hトレンド崩壊(${profitOrLoss})`;
      await closeTrendPosition_(pairId, inst, tpos, price, cfg, state, ps, `GSAXO-T ${reason}`, log);
      active = true;
      notes.push(reason);
    } else {
      ps.lastTrendSignal = `保有(${side}) 含み${pct.toFixed(2)}% 1H=${hourlyResult.trend}`;
    }
    return {
      active,
      activeNote: notes.join(', ') || ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  if (cfg.trendStopWatchEnabled && cfg.trendStopWatchOnly && !watch) {
    ps.lastTrendSignal = '待機(損切ウォッチなし)';
    return {
      active: false,
      activeNote: ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  if (watch) {
    if (
      cfg.trendOldRangeStop &&
      isOldRangeRegression_(price, watch.refDailyLow, watch.refDailyHigh)
    ) {
      clearTrendStopWatch_(ps, { log, pairId, reason: 'old_range_regression' });
      ps.lastTrendSignal = 'ウォッチ解除(旧レンジ回帰)';
      return {
        active: false,
        activeNote: ps.lastTrendSignal,
        daily: dailyResult,
        h1: hourlyResult,
        price,
        trend,
      };
    }

    const expectedSide = watch.expectedSide;
    const watchDailyTrend = dailyTrendFromSide_(expectedSide);

    if (dailyResult.trend !== 'range' && dailyResult.trend !== watchDailyTrend) {
      ps.lastTrendSignal = `待機(日足逆行 want=${watchDailyTrend} now=${dailyResult.trend})`;
      return {
        active: false,
        activeNote: ps.lastTrendSignal,
        daily: dailyResult,
        h1: hourlyResult,
        price,
        trend,
      };
    }

    if (countTrendOpenPositions_(state) >= cfg.trendMaxOpenPositions) {
      ps.lastTrendSignal = 'トレンド見送り(保有上限)';
      return {
        active: false,
        activeNote: ps.lastTrendSignal,
        daily: dailyResult,
        h1: hourlyResult,
        price,
        trend,
      };
    }

    const entrySignal = getEntrySignal_(candles1h, watchDailyTrend, cfg.swingStrength1h, fmtPrice);
    const side = sideFromSignal_(entrySignal.signal);

    if (!side || side !== expectedSide) {
      ps.lastTrendSignal = entrySignal.note || `待機(1H押し目 ${expectedSide})`;
      return {
        active: false,
        activeNote: ps.lastTrendSignal,
        daily: dailyResult,
        h1: hourlyResult,
        price,
        trend,
      };
    }

    if (cfg.leaguePauseNew) {
      ps.lastTrendSignal = 'リーグ新規停止';
      return {
        active: false,
        activeNote: ps.lastTrendSignal,
        daily: dailyResult,
        h1: hourlyResult,
        price,
        trend,
      };
    }

    const memo =
      side === 'long' ? 'GSAXO-T 損切連動押し目買い' : 'GSAXO-T 損切連動戻り売り';
    if (
      await openTrendPosition_(pairId, inst, side, price, cfg, state, ps, memo, log, {
        refDailyHigh: watch.refDailyHigh,
        refDailyLow: watch.refDailyLow,
      })
    ) {
      clearTrendStopWatch_(ps, { log, pairId, reason: 'entry' });
      active = true;
      notes.push(side === 'long' ? 'ロング新規(損切連動)' : 'ショート新規(損切連動)');
    }

    return {
      active,
      activeNote: notes.join(', ') || ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  if (cfg.trendRequireFilterBlock && !trend.blockNew) {
    ps.lastTrendSignal = 'トレンド待機(レンジ新規可)';
    return {
      active: false,
      activeNote: ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  if (dailyResult.trend === 'range') {
    ps.lastTrendSignal = `待機(日足レンジ ${dailyResult.note})`;
    return {
      active: false,
      activeNote: ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  if (countTrendOpenPositions_(state) >= cfg.trendMaxOpenPositions) {
    ps.lastTrendSignal = 'トレンド見送り(保有上限)';
    return {
      active: false,
      activeNote: ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  const entrySignal = getEntrySignal_(candles1h, dailyResult.trend, cfg.swingStrength1h, fmtPrice);
  const side = sideFromSignal_(entrySignal.signal);

  if (!side) {
    ps.lastTrendSignal = entrySignal.note || 'トレンドエントリー待ち';
    return {
      active: false,
      activeNote: ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  if (cfg.leaguePauseNew) {
    ps.lastTrendSignal = 'リーグ新規停止';
    return {
      active: false,
      activeNote: ps.lastTrendSignal,
      daily: dailyResult,
      h1: hourlyResult,
      price,
      trend,
    };
  }

  const memo =
    side === 'long' ? 'GSAXO-T 押し目買い' : 'GSAXO-T 戻り売り';
  if (await openTrendPosition_(pairId, inst, side, price, cfg, state, ps, memo, log)) {
    active = true;
    notes.push(side === 'long' ? 'ロング新規' : 'ショート新規');
  }

  return {
    active,
    activeNote: notes.join(', ') || ps.lastTrendSignal,
    daily: dailyResult,
    h1: hourlyResult,
    price,
    trend,
  };
}
