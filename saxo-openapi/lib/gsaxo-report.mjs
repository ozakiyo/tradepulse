import { loadGsaxoState } from './gsaxo-state.mjs';
import { paperEquity_ } from './paper-wallet.mjs';
import { trendPaperEquity_ } from './trend-paper-wallet.mjs';
import { loadGsaxoConfig } from './gsaxo-config.mjs';
import { G_SAXO_TREND_TEAM } from './gsaxo-instruments.mjs';
import {
  calcGfxFxStats_,
  collectTradesForPeriod_,
  collectTrendTradesForPeriod_,
  getPeriodRange_,
} from './report-period.mjs';
import { isMetaGasConfigured_ } from './meta-gas-client.mjs';
import { reportToMeta_ } from './meta-sheets.mjs';
import { createGsaxoLogger } from './gsaxo-runner.mjs';

function accountPnlPct_(state) {
  const w = state.paperWallet;
  if (!w?.initial) return 0;
  return ((paperEquity_(state) - w.initial) / w.initial) * 100;
}

function trendAccountPnlPct_(state) {
  const w = state.trendPaperWallet;
  if (!w?.initial) return 0;
  return ((trendPaperEquity_(state) - w.initial) / w.initial) * 100;
}

function generateRecommendations_(stats7d) {
  if (stats7d.closedCount < 3) {
    return '決済が少ない — GSAXO_TOUCH_PCT やレンジ幅上限の見直しを検討';
  }
  return 'デモ運用継続。ロングは下限・ショートは上限の逆張りを確認。';
}

async function pushMetaPeriod_(period, stats, acctPct, recommendation, log, team) {
  const result = await reportToMeta_({
    period,
    tradeCount: stats.closedCount,
    winRate: stats.closedCount > 0 ? stats.winRate.toFixed(1) : '-',
    pf: stats.pf,
    netPnlPct: acctPct,
    avgHoldH: stats.avgHoldH,
    recommendation,
    team,
  });
  if (result.ok) {
    log(`META送信(${period})`);
  } else if (!result.skipped) {
    log(`META送信失敗(${period}): ${result.reason || 'unknown'}`);
  }
  return result;
}

async function pushTrendMetaReports_(cfg, state, range7, rangeY, rangeM, log) {
  if (!cfg.trendModeEnabled) return;
  const trendTrades7d = await collectTrendTradesForPeriod_(range7.from, range7.to);
  const trendTradesY = await collectTrendTradesForPeriod_(rangeY.from, rangeY.to);
  const trendTradesM = await collectTrendTradesForPeriod_(rangeM.from, rangeM.to);
  const trendStats7d = calcGfxFxStats_(trendTrades7d);
  const trendStatsY = calcGfxFxStats_(trendTradesY);
  const trendStatsM = calcGfxFxStats_(trendTradesM);
  const trendAcctPct = trendAccountPnlPct_(state);
  const trendRec =
    trendStats7d.closedCount < 2
      ? 'トレンドモード試験中 — 決済件数が少ない'
      : 'F-FX式トレンド追随（日足+1H押し目）ペーパー継続';
  log(
    `トレンドレポート 口座損益=${trendAcctPct.toFixed(3)}% 7日決済=${trendStats7d.closedCount}件 ` +
      `勝率=${trendStats7d.winRate.toFixed(1)}% PF=${trendStats7d.pf}`
  );
  await pushMetaPeriod_('7日間', trendStats7d, trendAcctPct, trendRec, log, G_SAXO_TREND_TEAM);
  await pushMetaPeriod_(
    '前日',
    trendStatsY,
    trendAcctPct,
    trendStatsY.closedCount > 0 ? `前日決済${trendStatsY.closedCount}件` : '前日決済なし',
    log,
    G_SAXO_TREND_TEAM
  );
  await pushMetaPeriod_(rangeM.label, trendStatsM, trendAcctPct, `${rangeM.label} 累計`, log, G_SAXO_TREND_TEAM);
}

export async function gsaxoRunReport_({ sink } = {}) {
  const log = createGsaxoLogger(sink);
  const cfg = loadGsaxoConfig();
  const state = await loadGsaxoState();
  const range7 = getPeriodRange_('7d');
  const rangeY = getPeriodRange_('yesterday');
  const rangeM = getPeriodRange_('month');

  const trades7d = await collectTradesForPeriod_(range7.from, range7.to);
  const tradesY = await collectTradesForPeriod_(rangeY.from, rangeY.to);
  const tradesM = await collectTradesForPeriod_(rangeM.from, rangeM.to);

  const stats7d = calcGfxFxStats_(trades7d);
  const statsY = calcGfxFxStats_(tradesY);
  const statsM = calcGfxFxStats_(tradesM);
  const acctPct = accountPnlPct_(state);
  const recText = generateRecommendations_(stats7d);

  log(
    `レポート 口座損益=${acctPct.toFixed(3)}% 7日決済=${stats7d.closedCount}件 ` +
      `勝率=${stats7d.winRate.toFixed(1)}% PF=${stats7d.pf}`
  );

  if (trades7d.length === 0 && tradesY.length === 0 && tradesM.length === 0) {
    await pushMetaPeriod_(
      '7日間',
      { closedCount: 0, winRate: 0, pf: '-', avgHoldH: 0 },
      acctPct,
      '取引なし',
      log,
      undefined
    );
    await pushMetaPeriod_(
      '前日',
      { closedCount: 0, winRate: 0, pf: '-', avgHoldH: 0 },
      acctPct,
      '取引なし',
      log,
      undefined
    );
    await pushMetaPeriod_(
      rangeM.label,
      { closedCount: 0, winRate: 0, pf: '-', avgHoldH: 0 },
      acctPct,
      '取引なし',
      log,
      undefined
    );
    if (!isMetaGasConfigured_()) {
      log('META未送信: GSAXO_META_WEBAPP_URL / GSAXO_META_SECRET を .env に設定してください');
    }
    await pushTrendMetaReports_(cfg, state, range7, rangeY, rangeM, log);
    return { stats7d, acctPct };
  }

  await pushMetaPeriod_('7日間', stats7d, acctPct, recText, log);
  await pushMetaPeriod_(
    '前日',
    statsY,
    acctPct,
    statsY.closedCount > 0 ? `前日決済${statsY.closedCount}件` : '前日決済なし',
    log
  );
  await pushMetaPeriod_(rangeM.label, statsM, acctPct, `${rangeM.label} 累計`, log);

  await pushTrendMetaReports_(cfg, state, range7, rangeY, rangeM, log);

  if (!isMetaGasConfigured_()) {
    log('META未送信: GSAXO_META_WEBAPP_URL / GSAXO_META_SECRET を .env に設定してください');
  }

  return { stats7d, statsY, statsM, acctPct };
}
