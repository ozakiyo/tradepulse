import { calcPnlJpy_, marginJpy_ } from './paper-wallet.mjs';

export function initTrendPaperWallet_(state, cfg) {
  if (!state.trendPaperWallet) {
    const initial = cfg.trendPaperJpy ?? cfg.paperJpyDefault;
    state.trendPaperWallet = { jpy: initial, initial, reserved: 0 };
  }
  return state.trendPaperWallet;
}

export function trendPaperEquity_(state) {
  const w = state?.trendPaperWallet;
  if (!w) return 0;
  return (w.jpy || 0) + (w.reserved || 0);
}

export function applyTrendPaperOpen_(state, inst, price, units, cfg) {
  const w = initTrendPaperWallet_(state, cfg);
  const margin = marginJpy_(inst, price, units, cfg);
  w.jpy -= margin;
  w.reserved = (w.reserved || 0) + margin;
}

export function applyTrendPaperClose_(state, inst, side, entryPrice, exitPrice, units, cfg) {
  const w = initTrendPaperWallet_(state, cfg);
  const margin = marginJpy_(inst, entryPrice, units, cfg);
  const pnl = calcPnlJpy_(inst, side, entryPrice, exitPrice, units, cfg);
  const fee = cfg.paperFeeRate;
  w.jpy += margin + pnl * (1 - fee);
  w.reserved = Math.max(0, (w.reserved || 0) - margin);
}

export function getTrendAssetsForRun_(cfg, state) {
  const w = initTrendPaperWallet_(state, cfg);
  return { jpy: w.jpy, reserved: w.reserved || 0, paper: true };
}
