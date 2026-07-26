import { G_SAXO_TEAM } from './gsaxo-instruments.mjs';
import { callMetaGas_, isMetaGasConfigured_ } from './meta-gas-client.mjs';

const CACHE_MS = 3600 * 1000;
let cache = { expires: 0, data: null };

function defaultAdjust_() {
  return {
    active: false,
    sizeMult: 1,
    tpRatioDelta: 0,
    touchPctDelta: 0,
    pauseNew: false,
    note: '',
  };
}

export async function readMetaLeagueAdjust_(teamId = G_SAXO_TEAM) {
  if (String(process.env.GSAXO_META_LEAGUE_AUTO || 'true').toLowerCase() !== 'true') {
    return defaultAdjust_();
  }

  if (cache.expires > Date.now() && cache.data) return cache.data;

  if (!isMetaGasConfigured_()) return defaultAdjust_();

  try {
    const json = await callMetaGas_({ action: 'league', team: teamId });
    const adj = json.adjust || defaultAdjust_();
    cache = { expires: Date.now() + CACHE_MS, data: adj };
    return adj;
  } catch {
    return defaultAdjust_();
  }
}

export function applyMetaLeagueToConfig_(cfg, adj) {
  cfg.league = adj;
  cfg.leaguePauseNew = adj.pauseNew;
  cfg.leagueNote = adj.note;

  if (adj.active && adj.sizeMult !== 1) {
    if (cfg.maxMarginJpyPerPair != null) {
      cfg.maxMarginJpyPerPair = Math.round(cfg.maxMarginJpyPerPair * adj.sizeMult);
    }
  }

  if (adj.active && adj.tpRatioDelta && cfg.tpRatio != null) {
    cfg.tpRatio = Math.max(0.5, Math.min(1, cfg.tpRatio + adj.tpRatioDelta));
  }

  if (adj.active && adj.touchPctDelta && cfg.touchPct != null) {
    cfg.touchPct = Math.max(0.05, cfg.touchPct + adj.touchPctDelta);
  }

  return cfg;
}
