import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  gsaxoGetSpreadRate_,
  G_SAXO_INSTRUMENTS,
  gsaxoGetActivePairIds_,
} from './gsaxo-instruments.mjs';
import { getMarketQuote, resolveInstrumentByDef } from './saxo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', '..', 'data', 'gsaxo-spreads.json');

export function gsaxoSpreadsPath_() {
  return process.env.GSAXO_SPREADS_PATH?.trim() || DEFAULT_PATH;
}

/** infoprices / chart の Bid-Ask 幅（レート差・1方向） */
export function spreadRateFromQuote_(quote) {
  if (!quote) return null;
  const bid = Number(quote.Bid ?? quote.BidPrice);
  const ask = Number(quote.Ask ?? quote.AskPrice);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask <= bid) return null;
  return ask - bid;
}

function formatTsJst_() {
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

export async function loadSpreadCache_() {
  const path = gsaxoSpreadsPath_();
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return { updatedAt: null, spreads: {} };
    throw e;
  }
}

export async function saveSpreadCache_(cache) {
  const path = gsaxoSpreadsPath_();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  return path;
}

export function getCachedSpreadRate_(pairId, cache) {
  const rate = Number(cache?.spreads?.[pairId]?.rate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export async function fetchLiveSpreadRate_(saxoCfg, accountKey, uic, assetType) {
  const { quote } = await getMarketQuote(saxoCfg, accountKey, uic, assetType);
  return spreadRateFromQuote_(quote);
}

/** Bid-Ask 幅 × 倍率（利確・損切・エントリー共通） */
export function spreadWidth_(spreadRate, spreadMult = 1) {
  return Math.max(0, Number(spreadRate) || 0) * Math.max(0, Number(spreadMult) || 1);
}

/**
 * スプレッド解決（優先: live > cache > 静的表 > fallback）
 * LIVE 時は infoprices、DRY 時は cache / 静的表
 */
export async function resolveSpreadRate_(inst, {
  saxoCfg,
  accountKey,
  resolved,
  dryRun = true,
  cache,
  live = true,
} = {}) {
  let spreadCache = cache;
  if (live && !dryRun && saxoCfg && accountKey && resolved?.uic) {
    try {
      const liveRate = await fetchLiveSpreadRate_(
        saxoCfg,
        accountKey,
        resolved.uic,
        resolved.assetType
      );
      if (liveRate != null && liveRate > 0) return liveRate;
    } catch {
      /* cache / 静的表へ */
    }
  }
  if (!spreadCache) {
    spreadCache = await loadSpreadCache_();
  }
  const cached = getCachedSpreadRate_(inst?.id, spreadCache);
  if (cached != null) return cached;
  return gsaxoGetSpreadRate_(inst);
}

/** @deprecated resolveSpreadRate_ を使用 */
export const resolveSpreadRateForTp_ = resolveSpreadRate_;

function spreadPipsLabel_(inst, rate) {
  if (!inst || rate == null) return '-';
  if (inst.quoteJpy) return `${(rate * 100).toFixed(1)}銭`;
  if (inst.category === 'index') return `${rate.toFixed(2)}pt`;
  return `${(rate * 10000).toFixed(1)}pips`;
}

export async function fetchAllSpreads_(
  saxoCfg,
  accountKey,
  pairIds,
  { log, sleepMs = 800, onProgress } = {}
) {
  const spreads = {};
  const errors = [];

  for (let i = 0; i < pairIds.length; i++) {
    const pairId = pairIds[i];
    const def = G_SAXO_INSTRUMENTS[pairId];
    if (!def) continue;

    if (onProgress) onProgress(pairId, i + 1, pairIds.length);

    try {
      const inst = await resolveInstrumentByDef(saxoCfg, accountKey, def);
      const { quote, source } = await getMarketQuote(
        saxoCfg,
        accountKey,
        inst.uic,
        inst.assetType
      );
      const rate = spreadRateFromQuote_(quote);
      if (rate == null || rate <= 0) {
        throw new Error('Bid/Ask からスプレッドを算出できません');
      }
      spreads[pairId] = {
        rate,
        bid: quote.Bid ?? quote.BidPrice ?? null,
        ask: quote.Ask ?? quote.AskPrice ?? null,
        source,
        symbol: inst.symbol,
        uic: inst.uic,
        pips: spreadPipsLabel_(def, rate),
      };
      log?.(`${pairId} ${def.label} spread=${rate} (${spreadPipsLabel_(def, rate)}) [${source}]`);
    } catch (e) {
      errors.push({ pairId, error: e.message || String(e) });
      log?.(`${pairId} NG: ${e.message || e}`);
    }

    if (sleepMs > 0 && i < pairIds.length - 1) {
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }

  const cache = {
    updatedAt: formatTsJst_(),
    spreads,
  };
  const path = await saveSpreadCache_(cache);
  return { cache, path, errors };
}

export function formatSpreadCacheSnippet_(cache) {
  const lines = ['/** Saxo infoprices 取得 (${cache.updatedAt || '-'}) */'];
  for (const [pairId, row] of Object.entries(cache.spreads || {}).sort()) {
    const def = G_SAXO_INSTRUMENTS[pairId];
    const comment = def ? `${def.label} ${row.pips || ''}` : pairId;
    lines.push(`  ${pairId}: ${row.rate}, // ${comment}`);
  }
  return lines.join('\n');
}

export function gsaxoGetActivePairIdsForSpreads_(pairFilter) {
  return gsaxoGetActivePairIds_(pairFilter || process.env.GSAXO_PAIRS, {
    includeIndex: String(process.env.GSAXO_INCLUDE_INDEX || '').toLowerCase() === 'true',
    excludeHeavyFx: String(process.env.GSAXO_EXCLUDE_HEAVY_FX ?? 'true').toLowerCase() !== 'false',
  });
}
