export function initPaperWallet_(state, cfg) {
  if (!state.paperWallet) {
    const initial = cfg.paperJpyDefault;
    state.paperWallet = { jpy: initial, initial, reserved: 0 };
  }
  return state.paperWallet;
}

export function calcPnlJpy_(inst, side, entryPrice, exitPrice, units, cfg) {
  const diff = side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  if (inst.quoteJpy) {
    return diff * units;
  }
  if (inst.quoteUsd) {
    return diff * units * cfg.usdJpyRef;
  }
  return diff * units * cfg.usdJpyRef;
}

export function marginJpy_(inst, price, units, cfg) {
  let notionalJpy;
  if (inst.quoteJpy) {
    notionalJpy = price * units;
  } else if (inst.quoteUsd) {
    notionalJpy = price * units * cfg.usdJpyRef;
  } else {
    notionalJpy = price * units * cfg.usdJpyRef;
  }
  return notionalJpy * cfg.marginRate;
}

export function applyPaperOpen_(state, inst, price, units, cfg) {
  const w = initPaperWallet_(state, cfg);
  const margin = marginJpy_(inst, price, units, cfg);
  w.jpy -= margin;
  w.reserved = (w.reserved || 0) + margin;
}

export function applyPaperClose_(state, inst, side, entryPrice, exitPrice, units, cfg) {
  const w = initPaperWallet_(state, cfg);
  const margin = marginJpy_(inst, entryPrice, units, cfg);
  const pnl = calcPnlJpy_(inst, side, entryPrice, exitPrice, units, cfg);
  const fee = cfg.paperFeeRate;
  w.jpy += margin + pnl * (1 - fee);
  w.reserved = Math.max(0, (w.reserved || 0) - margin);
}

export function paperEquity_(state) {
  const w = state?.paperWallet;
  if (!w) return 0;
  return (w.jpy || 0) + (w.reserved || 0);
}

export function getAssetsForRun_(cfg, state) {
  const w = initPaperWallet_(state, cfg);
  return { jpy: w.jpy, reserved: w.reserved || 0, paper: true };
}
