import { resolveAccountKey, resolveInstrumentByDef, resolveSaxoConfig } from './saxo.mjs';
import { loadGsaxoConfig } from './gsaxo-config.mjs';
import { applyMetaLeagueToConfig_, readMetaLeagueAdjust_ } from './meta-league.mjs';
import {
  G_SAXO_INSTRUMENTS,
  gsaxoGetActivePairIds_,
  gsaxoMergeTradingParams_,
  gsaxoModeLabel_,
} from './gsaxo-instruments.mjs';
import { initPaperWallet_, paperEquity_ } from './paper-wallet.mjs';
import {
  getGsaxoLiveAssets_,
  initLiveBaseline_,
  syncAllGsaxoPositionsFromSaxo_,
} from './gsaxo-live.mjs';
import { runRangeForPair_ } from './range-trade.mjs';
import { runTrendForPair_ } from './trend-trade.mjs';
import { loadGsaxoState, saveGsaxoState, countTrendOpenPositions_ } from './gsaxo-state.mjs';
import { trendPaperEquity_, initTrendPaperWallet_ } from './trend-paper-wallet.mjs';
import {
  getCandles1h_,
  getCandles5m_,
  getCandlesDaily_,
} from './chart-data.mjs';
import { maybeGsaxoAlert_ } from './gsaxo-alert.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatLogTs() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

/** @param {(line: string) => void} [sink] 整形済み1行の出力先（省略時 console.log） */
export function createGsaxoLogger(sink) {
  const out = sink || ((line) => console.log(line));
  return (msg) => {
    out(`[G-SAXO][${formatLogTs()}] ${msg}`);
  };
}

function formatNextRunJst_(ms) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(Date.now() + ms));
}

function formatTrendFilterLog_(cfg) {
  if (!cfg.trendFilterEnabled) return 'trendFilter=off';
  const pairN = Object.keys(cfg.trendPairOverrides || {}).length;
  const pairSuffix = pairN > 0 ? ` +${pairN}pairOv` : '';
  const autoSuffix = cfg.trendAutoEnabled ? ' autoTh=on' : '';
  return `trendFilter=ADX<${cfg.adxTrendMin}&ER<${cfg.erTrendMin}必須${pairSuffix}${autoSuffix}`;
}

function formatTrendModeLog_(cfg) {
  if (!cfg.trendModeEnabled) return 'trendMode=off';
  const watch =
    cfg.trendStopWatchEnabled ?
      ` stopWatch=${cfg.trendStopWatchHours}h only=${cfg.trendStopWatchOnly} oldRangeStop=${cfg.trendOldRangeStop}`
    : '';
  return (
    `trendMode=on paper=${cfg.trendPaperOnly} maxOpen=${cfg.trendMaxOpenPositions} ` +
    `filterBlock=${cfg.trendRequireFilterBlock}${watch}`
  );
}

async function resolveAllInstruments_(saxoCfg, accountKey, pairIds, state) {
  if (!state.resolved) state.resolved = {};
  const out = {};
  for (const pairId of pairIds) {
    if (state.resolved[pairId]?.uic) {
      out[pairId] = state.resolved[pairId];
      continue;
    }
    const def = G_SAXO_INSTRUMENTS[pairId];
    const inst = await resolveInstrumentByDef(saxoCfg, accountKey, def);
    const trading = gsaxoMergeTradingParams_(def, inst.details);
    const resolved = {
      uic: inst.uic,
      assetType: inst.assetType,
      symbol: inst.symbol,
      trading,
    };
    state.resolved[pairId] = resolved;
    out[pairId] = resolved;
  }
  return out;
}

async function resolveAccountKeyForRun_(saxoCfg, state) {
  if (saxoCfg.accountKey) {
    state.saxoAccountKey = saxoCfg.accountKey;
    return saxoCfg.accountKey;
  }
  if (state.saxoAccountKey) return state.saxoAccountKey;
  const accountKey = await resolveAccountKey(saxoCfg);
  state.saxoAccountKey = accountKey;
  return accountKey;
}

function formatLeagueLog_(cfg) {
  const adj = cfg.league;
  if (!adj || !adj.active) return 'league=off';
  const parts = [`league=on rank=${adj.rank != null ? adj.rank : '-'}`];
  if (adj.sizeMult !== 1) parts.push(`size×${adj.sizeMult}`);
  if (adj.tpRatioDelta) parts.push(`tpΔ${adj.tpRatioDelta >= 0 ? '+' : ''}${adj.tpRatioDelta}`);
  if (adj.touchPctDelta) parts.push(`touchΔ${adj.touchPctDelta >= 0 ? '+' : ''}${adj.touchPctDelta}`);
  if (adj.pauseNew) parts.push('pauseNew');
  if (adj.note) parts.push(String(adj.note).slice(0, 40));
  return parts.join(' ');
}

export async function gsaxoRunOnce({ sink, pairFilter } = {}) {
  const log = createGsaxoLogger(sink);
  const cfg = applyMetaLeagueToConfig_(loadGsaxoConfig(), await readMetaLeagueAdjust_());
  const errors = [];
  let state;
  let pairIds = [];

  try {
    const saxoCfg = await resolveSaxoConfig();
    state = await loadGsaxoState();
    if (cfg.dryRun) {
      initPaperWallet_(state, cfg);
    }

    pairIds = gsaxoGetActivePairIds_(pairFilter || process.env.GSAXO_PAIRS, {
      includeIndex: cfg.includeIndex,
      excludeHeavyFx: cfg.excludeHeavyFx,
    });
    const accountKey = await resolveAccountKeyForRun_(saxoCfg, state);
    const resolvedMap = await resolveAllInstruments_(saxoCfg, accountKey, pairIds, state);

    log(
      `実行開始 mode=${gsaxoModeLabel_(cfg)} pairs=${pairIds.length} ` +
        `maxOpen=${cfg.maxOpenPositions} dailyStopCd=${cfg.dailyStopCooldownHours}h ` +
        `dailyStopBuf=${cfg.dailyStopBufferPct}%x${cfg.dailyStopConfirmBars} ` +
        `${formatTrendFilterLog_(cfg)} ${formatTrendModeLog_(cfg)} ${formatLeagueLog_(cfg)} ` +
        `dryRun=${cfg.dryRun} auth=${saxoCfg.authMode} accountKey=${accountKey}`
    );

    if (cfg.trendModeEnabled) {
      initTrendPaperWallet_(state, cfg);
    }

    if (!cfg.dryRun) {
      await syncAllGsaxoPositionsFromSaxo_(saxoCfg, accountKey, pairIds, state, resolvedMap, log);
    }

    for (const pairId of pairIds) {
      try {
        await sleep(cfg.pairSleepMs);
        const resolved = resolvedMap[pairId];
        const inst = resolved.trading;
        const rangeCfg = { dailyLookback: cfg.dailyLookback };
        const min1h = cfg.trendModeEnabled
          ? Math.max(cfg.minCandles1h, cfg.trendMinCandles1h)
          : cfg.minCandles1h;
        const prefetched = cfg.trendModeEnabled
          ? {
              candles1h: await getCandles1h_(saxoCfg, resolved.uic, resolved.assetType, min1h),
              candles5m: await getCandles5m_(saxoCfg, resolved.uic, resolved.assetType, cfg.minCandles5m),
              candlesDaily: await getCandlesDaily_(
                saxoCfg,
                resolved.uic,
                resolved.assetType,
                Math.max(rangeCfg.dailyLookback + 5, cfg.trendMinCandlesDaily)
              ),
            }
          : null;

        const result = await runRangeForPair_(
          pairId,
          inst,
          resolved,
          cfg,
          state,
          saxoCfg,
          accountKey,
          log,
          prefetched ? { prefetched } : {}
        );
        const ps = state.pairs[pairId] || {};
        const priceStr = result.price != null ? ` price=${result.price}` : '';
        let line =
          `${pairId} ${result.activeNote}${priceStr}` +
          (result.daily ? ` | ${result.daily.note}` : '') +
          (result.h1 ? ` | ${result.h1.note}` : '') +
          (ps.lastTrendNote ? ` | ${ps.lastTrendNote}` : '') +
          (ps.lastSignal ? ` | signal=${ps.lastSignal}` : '');

        if (cfg.trendModeEnabled && cfg.trendPaperOnly) {
          const trendResult = await runTrendForPair_(
            pairId,
            inst,
            resolved,
            cfg,
            state,
            saxoCfg,
            log,
            {
              prefetched: {
                candles1h: prefetched.candles1h,
                candlesDaily: prefetched.candlesDaily,
              },
              trend: result.trend,
            }
          );
          if (!trendResult.skipped) {
            line += ` | [TREND] ${trendResult.activeNote}`;
            if (ps.lastTrendDailyNote) line += ` | 日足=${ps.lastTrendDailyNote}`;
          }
        }

        log(line);
      } catch (e) {
        const msg = e.message || String(e);
        errors.push(`${pairId}: ${msg}`);
        log(`ERROR ${pairId}: ${msg}`);
      }
    }

    state.lastRunAt = new Date().toISOString();
    state.lastError = errors.length ? errors.join('; ') : null;

    if (cfg.dryRun) {
      const w = state.paperWallet;
      if (w) {
        const equity = Math.round(paperEquity_(state));
        log(
          `紙トレ 現金JPY=${Math.round(w.jpy)} 拘束=${Math.round(w.reserved || 0)} ` +
            `評価額=${equity} 損益=${equity - w.initial}`
        );
      }
    }
    if (cfg.trendModeEnabled && state.trendPaperWallet) {
      const tw = state.trendPaperWallet;
      const trendEquity = Math.round(trendPaperEquity_(state));
      log(
        `トレンド紙 現金JPY=${Math.round(tw.jpy)} 拘束=${Math.round(tw.reserved || 0)} ` +
          `評価額=${trendEquity} 損益=${trendEquity - tw.initial} ` +
          `建玉=${countTrendOpenPositions_(state)}`
      );
    }
    if (!cfg.dryRun) {
      try {
        const assets = await getGsaxoLiveAssets_(saxoCfg, accountKey);
        initLiveBaseline_(state, assets.equity);
        log(
          `本番 利用可能=${Math.round(assets.jpy)}${assets.currency} ` +
            `拘束=${Math.round(assets.reserved)} 評価額=${Math.round(assets.equity)} ` +
            `証拠金使用率=${assets.marginUtilizationPct.toFixed(1)}%`
        );
        if (assets.marginCallStatus && assets.marginCallStatus !== 'NORMAL') {
          errors.push(
            `追証警告: ${assets.marginCallStatus} (使用率${assets.marginUtilizationPct.toFixed(1)}%)`
          );
        }
      } catch (e) {
        const msg = `残高照会: ${e.message || e}`;
        errors.push(msg);
        log(`残高照会失敗: ${e.message || e}`);
      }
    }
    log(`G-SAXO 完了${errors.length ? ' 一部エラー' : ''}`);

    await maybeGsaxoAlert_({ errors, state, cfg, log });
    await saveGsaxoState(state);

    return { errors, state, pairIds };
  } catch (e) {
    const fatal = e.message || String(e);
    log(`ERROR: ${fatal}`);
    state = state || (await loadGsaxoState());
    state.lastError = fatal;
    state.lastRunAt = new Date().toISOString();
    await maybeGsaxoAlert_({ errors, fatalError: fatal, state, cfg, log });
    await saveGsaxoState(state);
    throw e;
  }
}

export async function gsaxoRunDaemon({ sink } = {}) {
  const cfg = loadGsaxoConfig();
  const out = sink || ((line) => console.log(line));
  const log = createGsaxoLogger(out);
  const intervalMin = Math.round(cfg.runIntervalMs / 60000);
  log(`デーモン開始（${intervalMin}分間隔・Ctrl+C で停止）`);

  const tick = async () => {
    try {
      await gsaxoRunOnce({ sink: out });
      log(`待機中… 次回 ${formatNextRunJst_(cfg.runIntervalMs)}`);
    } catch (e) {
      log(`ERROR: ${e.message || e}`);
    }
  };

  await tick();
  setInterval(tick, cfg.runIntervalMs);
}
