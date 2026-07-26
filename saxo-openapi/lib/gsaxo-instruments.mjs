/**
 * チーム G-SAXO — FX（A/B/C）+ 金スポット + 指数CFD
 * 暗号資産は G-CFX（GMO）側。銀(XAG)は対象外。
 */
import { getTrendAutoOverride_ } from './trend-threshold-auto.mjs';

export const G_SAXO_TEAM = 'G-SAXO';
/** META 週次レポート用（トレンドモード・ペーパー） */
export const G_SAXO_TREND_TEAM = 'G-SAXO-TREND';

/** @typedef {'A'|'B'|'C'|'index'|'metal'} GsaxoRangeTier */

function fx_(id, label, keyword, opts = {}) {
  const quoteJpy = !!opts.quoteJpy;
  return {
    id,
    label,
    searchKeyword: keyword,
    assetTypes: 'FxSpot',
    category: 'fx',
    rangeTier: opts.rangeTier || 'A',
    quoteJpy,
    quoteUsd: !quoteJpy,
    minUnits: 1000,
    /** G-FX 同様: 2000建て → 1H半分(1000) → 日足残り(1000) */
    defaultUnits: 2000,
    priceDecimals: quoteJpy ? 3 : opts.priceDecimals ?? 5,
    unitDecimals: 0,
    /** @type {{ adxTrendMin?: number, erTrendMin?: number, trendFilterEnabled?: boolean }|null} */
    trendOverride: opts.trendOverride || null,
  };
}

function index_(id, label, keyword, opts = {}) {
  return {
    id,
    label,
    searchKeyword: keyword,
    assetTypes: 'CfdOnIndex',
    category: 'index',
    rangeTier: 'index',
    quoteUsd: true,
    quoteJpy: false,
    minUnits: 1,
    defaultUnits: 1,
    priceDecimals: 2,
    unitDecimals: 0,
    simUnavailable: !!opts.simUnavailable,
  };
}

export const G_SAXO_INSTRUMENTS = {
  /* ── 金 ── */
  xauusd: {
    id: 'xauusd',
    label: 'Gold',
    searchKeyword: 'XAUUSD',
    assetTypes: 'FxSpot',
    category: 'metal',
    rangeTier: 'metal',
    quoteUsd: true,
    quoteJpy: false,
    minUnits: 1,
    defaultUnits: 1,
    priceDecimals: 2,
    unitDecimals: 2,
  },

  /* ── A メジャー（7） ── */
  eur_usd: fx_('eur_usd', 'EUR/USD', 'EURUSD', { rangeTier: 'A' }),
  gbp_usd: fx_('gbp_usd', 'GBP/USD', 'GBPUSD', { rangeTier: 'A' }),
  usd_jpy: fx_('usd_jpy', 'USD/JPY', 'USDJPY', { rangeTier: 'A', quoteJpy: true }),
  usd_chf: fx_('usd_chf', 'USD/CHF', 'USDCHF', { rangeTier: 'A' }),
  aud_usd: fx_('aud_usd', 'AUD/USD', 'AUDUSD', { rangeTier: 'A' }),
  nzd_usd: fx_('nzd_usd', 'NZD/USD', 'NZDUSD', { rangeTier: 'A' }),
  usd_cad: fx_('usd_cad', 'USD/CAD', 'USDCAD', { rangeTier: 'A' }),

  /* ── B G10クロス（12） ── */
  eur_gbp: fx_('eur_gbp', 'EUR/GBP', 'EURGBP', { rangeTier: 'B' }),
  eur_chf: fx_('eur_chf', 'EUR/CHF', 'EURCHF', { rangeTier: 'B' }),
  eur_jpy: fx_('eur_jpy', 'EUR/JPY', 'EURJPY', { rangeTier: 'B', quoteJpy: true }),
  gbp_jpy: fx_('gbp_jpy', 'GBP/JPY', 'GBPJPY', { rangeTier: 'B', quoteJpy: true }),
  aud_jpy: fx_('aud_jpy', 'AUD/JPY', 'AUDJPY', { rangeTier: 'B', quoteJpy: true }),
  nzd_jpy: fx_('nzd_jpy', 'NZD/JPY', 'NZDJPY', { rangeTier: 'B', quoteJpy: true }),
  eur_aud: fx_('eur_aud', 'EUR/AUD', 'EURAUD', { rangeTier: 'B' }),
  gbp_aud: fx_('gbp_aud', 'GBP/AUD', 'GBPAUD', { rangeTier: 'B' }),
  aud_nzd: fx_('aud_nzd', 'AUD/NZD', 'AUDNZD', { rangeTier: 'B' }),
  eur_cad: fx_('eur_cad', 'EUR/CAD', 'EURCAD', { rangeTier: 'B' }),
  gbp_chf: fx_('gbp_chf', 'GBP/CHF', 'GBPCHF', { rangeTier: 'B' }),
  chf_jpy: fx_('chf_jpy', 'CHF/JPY', 'CHFJPY', { rangeTier: 'B', quoteJpy: true }),

  /* ── C 準メジャー（10）— TRY/ZAR/MXN/RUB 除外 ── */
  usd_sek: fx_('usd_sek', 'USD/SEK', 'USDSEK', { rangeTier: 'C' }),
  eur_sek: fx_('eur_sek', 'EUR/SEK', 'EURSEK', { rangeTier: 'C' }),
  usd_nok: fx_('usd_nok', 'USD/NOK', 'USDNOK', { rangeTier: 'C' }),
  eur_nok: fx_('eur_nok', 'EUR/NOK', 'EURNOK', { rangeTier: 'C' }),
  usd_dkk: fx_('usd_dkk', 'USD/DKK', 'USDDKK', { rangeTier: 'C' }),
  usd_sgd: fx_('usd_sgd', 'USD/SGD', 'USDSGD', { rangeTier: 'C' }),
  eur_sgd: fx_('eur_sgd', 'EUR/SGD', 'EURSGD', { rangeTier: 'C' }),
  usd_pln: fx_('usd_pln', 'USD/PLN', 'USDPLN', { rangeTier: 'C' }),
  eur_pln: fx_('eur_pln', 'EUR/PLN', 'EURPLN', { rangeTier: 'C' }),
  gbp_nzd: fx_('gbp_nzd', 'GBP/NZD', 'GBPNZD', { rangeTier: 'C' }),

  /* ── 指数CFD ── */
  us500: index_('us500', 'S&P 500', 'US500'),
  usnas100: index_('usnas100', 'NASDAQ 100', 'USNAS100'),
  ger40: index_('ger40', 'DAX', 'GER40'),
  us30: index_('us30', 'US 30', 'US30'),
  uk100: index_('uk100', 'UK 100', 'UK100', { simUnavailable: true }),
  eu50: index_('eu50', 'EU Stocks 50', 'EU50'),
  fra40: index_('fra40', 'France 40', 'FRA40'),
  swiss20: index_('swiss20', 'Swiss 20', 'SWISS20'),
};

/** 金 + FX A/B/C（指数なし・30本） */
export const G_SAXO_FX_METAL_PAIR_IDS = [
  'xauusd',
  'eur_usd',
  'gbp_usd',
  'usd_jpy',
  'usd_chf',
  'aud_usd',
  'nzd_usd',
  'usd_cad',
  'eur_gbp',
  'eur_chf',
  'eur_jpy',
  'gbp_jpy',
  'aud_jpy',
  'nzd_jpy',
  'eur_aud',
  'gbp_aud',
  'aud_nzd',
  'eur_cad',
  'gbp_chf',
  'chf_jpy',
  'usd_sek',
  'eur_sek',
  'usd_nok',
  'eur_nok',
  'usd_dkk',
  'usd_sgd',
  'eur_sgd',
  'usd_pln',
  'eur_pln',
  'gbp_nzd',
];

/** 指数CFD（UK100 は Simulation 未提供のため稼働リスト外） */
export const G_SAXO_INDEX_PAIR_IDS = [
  'us500',
  'usnas100',
  'ger40',
  'us30',
  'eu50',
  'fra40',
  'swiss20',
];

/** フル稼働（金 + FX + 指数 = 37本） */
export const G_SAXO_ACTIVE_PAIR_IDS = [...G_SAXO_FX_METAL_PAIR_IDS, ...G_SAXO_INDEX_PAIR_IDS];

/** 除外: 北欧4 + USD/DKK（証拠金が大きい） */
export const G_SAXO_EXCLUDED_HEAVY_FX_PAIR_IDS = [
  'usd_sek',
  'eur_sek',
  'usd_nok',
  'eur_nok',
  'usd_dkk',
];

/** 既定稼働（金 + A/B + C一部 = 25本・指数なし） */
export const G_SAXO_LEAN_PAIR_IDS = G_SAXO_FX_METAL_PAIR_IDS.filter(
  (id) => !G_SAXO_EXCLUDED_HEAVY_FX_PAIR_IDS.includes(id)
);

/** ティア別レンジ幅（準メジャー C は最小幅・上限を緩和） */
const RANGE_TIER_OVERRIDES = {
  A: { h1RangeMinPct: 0, h1RangeMaxPct: null, dailyRangeMaxPct: null, touchPct: null },
  B: { h1RangeMinPct: 0.6, h1RangeMaxPct: null, dailyRangeMaxPct: null, touchPct: null },
  C: { h1RangeMinPct: 1.0, h1RangeMaxPct: 4.5, dailyRangeMaxPct: 12, touchPct: 0.12 },
  index: { h1RangeMinPct: 0, h1RangeMaxPct: null, dailyRangeMaxPct: null, touchPct: null },
  metal: { h1RangeMinPct: 0, h1RangeMaxPct: null, dailyRangeMaxPct: null, touchPct: null },
};

/**
 * ティア別 ADX/ER 閾値（null = グローバル既定を使用）
 * 例: B: { adxTrendMin: 23, erTrendMin: 0.28 }
 */
const TREND_TIER_OVERRIDES = {
  A: { adxTrendMin: null, erTrendMin: null },
  B: { adxTrendMin: null, erTrendMin: null },
  C: { adxTrendMin: null, erTrendMin: null },
  index: { adxTrendMin: null, erTrendMin: null },
  metal: { adxTrendMin: null, erTrendMin: null },
};

/**
 * GSAXO_TREND_PAIR_OVERRIDES パース
 * 形式: pairId:adx=25,er=0.30;usd_cad:adx=22,er=0.28;usd_jpy:off
 * @param {string|undefined} raw
 */
export function parseTrendPairOverrides_(raw) {
  /** @type {Record<string, { adxTrendMin?: number, erTrendMin?: number, trendFilterEnabled?: boolean }>} */
  const out = {};
  if (!raw || !String(raw).trim()) return out;

  for (const part of String(raw).split(';')) {
    const seg = part.trim();
    if (!seg) continue;
    const colon = seg.indexOf(':');
    if (colon < 0) continue;
    const pairId = seg.slice(0, colon).trim().toLowerCase();
    if (!pairId) continue;
    const spec = seg.slice(colon + 1).trim().toLowerCase();
    if (!spec) continue;

    if (spec === 'off' || spec === 'false') {
      out[pairId] = { trendFilterEnabled: false };
      continue;
    }

    /** @type {{ adxTrendMin?: number, erTrendMin?: number }} */
    const ov = {};
    for (const kv of spec.split(',')) {
      const eq = kv.indexOf('=');
      if (eq < 0) continue;
      const key = kv.slice(0, eq).trim();
      const val = Number(kv.slice(eq + 1).trim());
      if (!Number.isFinite(val)) continue;
      if (key === 'adx') ov.adxTrendMin = val;
      if (key === 'er') ov.erTrendMin = val;
    }
    if (ov.adxTrendMin != null || ov.erTrendMin != null) {
      out[pairId] = ov;
    }
  }
  return out;
}

function mergeTrendOverride_(target, source) {
  if (!source) return;
  if (source.trendFilterEnabled === false) target.trendFilterEnabled = false;
  if (source.adxTrendMin != null && Number.isFinite(source.adxTrendMin)) {
    target.adxTrendMin = source.adxTrendMin;
  }
  if (source.erTrendMin != null && Number.isFinite(source.erTrendMin)) {
    target.erTrendMin = source.erTrendMin;
  }
}

/**
 * グローバル → ティア → instruments → 自動(state) → env 手動 の順でマージ
 * @param {string} pairId
 * @param {{ rangeTier?: string, trendOverride?: object }|null|undefined} instDef
 * @param {object} baseCfg loadGsaxoConfig() の戻り値
 * @param {object|null|undefined} ps pair state（自動調整閾値）
 */
export function gsaxoGetTrendFilterCfg_(pairId, instDef, baseCfg, ps) {
  const tier = instDef?.rangeTier || 'A';
  const tierOv = TREND_TIER_OVERRIDES[tier] || TREND_TIER_OVERRIDES.A;
  const pairEnvOv = baseCfg.trendPairOverrides?.[pairId] || null;
  const autoOv = getTrendAutoOverride_(ps, baseCfg);

  const merged = {
    trendFilterEnabled: baseCfg.trendFilterEnabled,
    adxPeriod: baseCfg.adxPeriod,
    erPeriod: baseCfg.erPeriod,
    adxTrendMin: baseCfg.adxTrendMin,
    erTrendMin: baseCfg.erTrendMin,
    thresholdSource: 'global',
  };

  if (tierOv.adxTrendMin != null) merged.adxTrendMin = tierOv.adxTrendMin;
  if (tierOv.erTrendMin != null) merged.erTrendMin = tierOv.erTrendMin;
  mergeTrendOverride_(merged, instDef?.trendOverride);
  if (autoOv) {
    mergeTrendOverride_(merged, autoOv);
    merged.thresholdSource = 'auto';
  }
  mergeTrendOverride_(merged, pairEnvOv);
  if (pairEnvOv?.adxTrendMin != null || pairEnvOv?.erTrendMin != null) {
    merged.thresholdSource = 'env';
  } else if (pairEnvOv?.trendFilterEnabled === false) {
    merged.thresholdSource = 'env-off';
  }

  return merged;
}

export function gsaxoGetRangeCfg_(inst, baseCfg) {
  const tier = inst?.rangeTier || 'A';
  const ov = RANGE_TIER_OVERRIDES[tier] || RANGE_TIER_OVERRIDES.A;
  return {
    ...baseCfg,
    h1RangeMinPct: ov.h1RangeMinPct ?? 0,
    h1RangeMaxPct: ov.h1RangeMaxPct ?? baseCfg.h1RangeMaxPct,
    dailyRangeMaxPct: ov.dailyRangeMaxPct ?? baseCfg.dailyRangeMaxPct,
    touchPct: ov.touchPct ?? baseCfg.touchPct,
  };
}

export function gsaxoPairIdsForMode_({ includeIndex = false, excludeHeavyFx = true } = {}) {
  let ids = excludeHeavyFx ? [...G_SAXO_LEAN_PAIR_IDS] : [...G_SAXO_FX_METAL_PAIR_IDS];
  if (includeIndex) {
    ids = [...ids, ...G_SAXO_INDEX_PAIR_IDS];
  }
  return ids;
}

export function gsaxoAllPairIds_(opts = {}) {
  return gsaxoPairIdsForMode_(opts);
}

export function gsaxoGetInstrument_(pairId) {
  return G_SAXO_INSTRUMENTS[pairId] || null;
}

export function gsaxoGetActivePairIds_(envList, { includeIndex = false, excludeHeavyFx = true } = {}) {
  const universe = new Set(gsaxoPairIdsForMode_({ includeIndex, excludeHeavyFx }));
  if (envList && String(envList).trim()) {
    return String(envList)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((id) => G_SAXO_INSTRUMENTS[id] && universe.has(id));
  }
  return [...universe];
}

/**
 * サクソバンク証券 原則固定スプレッド（レート差・往復1回分の Bid-Ask 幅）
 * @see https://www.home.saxo/ja-jp/rates-and-conditions/forex/spreads-and-commissions
 * 5万/10万通貨以下・月-金 8:00-翌3:59。それ以外は拡大しうる。
 */
export const SAXO_JP_SPREAD_RATE = {
  usd_jpy: 0.002, // 0.2銭
  eur_jpy: 0.005, // 0.5銭
  aud_jpy: 0.007, // 0.7銭
  gbp_jpy: 0.012, // 1.2銭
  eur_usd: 0.00004, // 0.4 pips
  aud_usd: 0.00006, // 0.6 pips
  gbp_usd: 0.00009, // 0.9 pips
  usd_cad: 0.0002, // 2.0 pips（Saxo JP 目安・live/cache 優先）
  xauusd: 0.35, // 貴金属は変動制・保守的に
};

const SAXO_JP_SPREAD_FALLBACK_JPY = 0.012;
const SAXO_JP_SPREAD_FALLBACK_USD = 0.00012;

/** 銘柄のスプレッド幅（レート差）。未登録は quoteJpy でフォールバック */
export function gsaxoGetSpreadRate_(inst) {
  if (!inst) return 0;
  if (inst.spreadRate != null && inst.spreadRate > 0) return inst.spreadRate;
  if (SAXO_JP_SPREAD_RATE[inst.id] != null) return SAXO_JP_SPREAD_RATE[inst.id];
  if (inst.quoteJpy) return SAXO_JP_SPREAD_FALLBACK_JPY;
  if (inst.quoteUsd) return SAXO_JP_SPREAD_FALLBACK_USD;
  return 0;
}

export function gsaxoModeLabel_({ includeIndex = false, excludeHeavyFx = true } = {}) {
  if (includeIndex) {
    const n = excludeHeavyFx ? G_SAXO_LEAN_PAIR_IDS.length + G_SAXO_INDEX_PAIR_IDS.length : 37;
    return `FX+金+指数(${n})`;
  }
  if (excludeHeavyFx) return `FX+金リーン(25)`;
  return 'FX+金のみ(30)';
}

export function gsaxoMergeTradingParams_(def, details) {
  const min = Number(details?.MinimumTradeSize || details?.MinimumLotSize || 0);
  return {
    ...def,
    minUnits: min > 0 ? min : def.minUnits,
    tickSize: details?.TickSize ?? null,
    symbol: details?.Symbol || def.searchKeyword,
  };
}

export function gsaxoFormatUnits_(inst, units) {
  const pow = 10 ** (inst.unitDecimals ?? 0);
  return Math.floor(units * pow) / pow;
}

export function gsaxoRoundPrice_(inst, price) {
  const pow = 10 ** (inst.priceDecimals ?? 2);
  return Math.round(price * pow) / pow;
}

export function gsaxoCalcPartialCloseUnits_(inst, totalUnits, ratio) {
  const total = gsaxoFormatUnits_(inst, totalUnits);
  const closeUnits = gsaxoFormatUnits_(inst, total * ratio);
  const remainUnits = gsaxoFormatUnits_(inst, total - closeUnits);
  if (closeUnits < inst.minUnits || remainUnits < inst.minUnits) {
    return { canSplit: false, closeUnits: total, remainUnits: 0 };
  }
  return { canSplit: true, closeUnits, remainUnits };
}
