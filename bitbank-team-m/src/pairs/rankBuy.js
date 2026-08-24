import { getCrashState, getKv, listOpenBotPositions, setKv } from '../db/sqlite.js';
import { DEFAULT_PAIRS } from '../config.js';
import { computeMetrics } from '../crash/metrics.js';
import { computeAdx } from './adx.js';
import { getEntryPolicy } from '../learn/entryPolicy.js';
import {
  biasFromMetrics,
  classifyPairRegimeBuyOnly,
  scoreBuyFavorability,
} from './regime.js';

const DEFAULT_RANK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const PAIR_DELAY_MS = 120;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dirJa(d) {
  if (d === 'up') return '上';
  if (d === 'down') return '下';
  if (d === 'flat') return '横';
  return d ? String(d) : '';
}

function tfDirs(regime) {
  const daily = regime?.daily || null;
  const h4 = regime?.h4 || null;
  return {
    dailyDir: daily ? biasFromMetrics(daily.metrics) || daily.dir || 'flat' : '',
    dailyRegime: daily?.regime || '',
    dailyTag: daily?.tag || '',
    h4Dir: h4 ? biasFromMetrics(h4.metrics) || h4.dir || 'flat' : '',
    h4Regime: h4?.regime || '',
    h4Tag: h4?.tag || '',
  };
}

function buildReason(row, rank) {
  const bits = row.details?.length ? row.details.join(' / ') : '指標不足';
  return `buy/${row.regime || '?'} D${dirJa(row.dailyDir)}/4H${dirJa(row.h4Dir)} スコア${row.score}（${rank}位）: ${bits}`;
}

function baseAsset(pair) {
  const p = String(pair || '').toLowerCase();
  const i = p.indexOf('_');
  return i > 0 ? p.slice(0, i) : p;
}

/**
 * *_jpy ユニバース内の基軸強弱（対 JPY）。クロスがないためスコア加重平均。
 */
export function rankAssetStrength(universeStatus = [], ranked = []) {
  const byPair = Object.create(null);
  for (const r of ranked || []) {
    byPair[String(r.pair || r.symbol || '').toLowerCase()] = r;
  }
  const acc = Object.create(null);
  for (const u of universeStatus || []) {
    const pair = String(u.pair || u.symbol || '').toLowerCase();
    const asset = baseAsset(pair);
    if (!asset || asset === 'jpy') continue;
    if (!acc[asset]) {
      acc[asset] = { asset, sum: 0, n: 0, upPairs: 0, skipPairs: 0 };
    }
    const a = acc[asset];
    const extra = byPair[pair] || {};
    const score = Number(u.score ?? extra.score);
    const daily = u.dailyDir || extra.dailyDir;
    if (daily === 'up') a.upPairs += 1;
    if (daily === 'down') a.downPairs += 1;
    if (Number.isFinite(score) && score !== 0) {
      a.sum += score;
      a.n += 1;
    } else if (daily === 'up') {
      a.sum += 40;
      a.n += 1;
    } else if (daily === 'down') {
      a.sum -= 40;
      a.n += 1;
    }
  }
  const list = Object.values(acc).map((a) => {
    const score = a.n ? Math.round((a.sum / a.n) * 10) / 10 : 0;
    let label = '中立';
    if (score >= 70) label = '強い';
    else if (score >= 55) label = 'やや強い';
    else if (score <= 30) label = '弱い';
    else if (score <= 45) label = 'やや弱い';
    return {
      asset: a.asset,
      score,
      label,
      pairs: a.n,
      upPairs: a.upPairs,
      downPairs: a.downPairs,
    };
  });
  list.sort((a, b) => b.score - a.score || a.asset.localeCompare(b.asset));
  return list.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function getCachedBuyRank(db) {
  const raw = getKv(db, 'buy_rank_json');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAssetRank(db) {
  const cached = getCachedBuyRank(db);
  if (!cached) return [];
  if (cached.assetRank?.length) return cached.assetRank;
  return rankAssetStrength(cached.universeStatus || [], cached.ranked || cached.top || []);
}

function dirJaSheet(d) {
  if (d === 'up') return '上';
  if (d === 'down') return '下';
  if (d === 'flat') return '横';
  return d ? String(d) : '';
}

/** M_買いランキング */
export function buyCandidatesToSheetRows(top) {
  return (top || []).map((r) => [
    r.rank,
    r.pair || r.symbol || '',
    '買い',
    r.regime || '',
    dirJaSheet(r.dailyDir),
    dirJaSheet(r.h4Dir),
    r.score ?? '',
    r.unitAmount ?? '',
    r.reason || '',
    r.updatedAt || '',
  ]);
}

/** M_ペア状態 */
export function pairStatusToSheetRows(universeStatus, db = null) {
  const opens = db ? listOpenBotPositions(db) : [];
  const openByPair = Object.create(null);
  for (const o of opens) {
    openByPair[String(o.pair || '').toLowerCase()] = `buy ${o.amount ?? ''}`.trim();
  }
  return (universeStatus || []).map((r) => {
    const pair = String(r.pair || r.symbol || '').toLowerCase();
    let status = r.status || '';
    if (openByPair[pair]) status = '建玉中';
    return [
      pair,
      status,
      r.side === 'buy' ? '買い' : r.side || '',
      r.regime || '',
      dirJaSheet(r.dailyDir),
      r.dailyRegime || '',
      dirJaSheet(r.h4Dir),
      r.h4Regime || '',
      r.score ?? '',
      openByPair[pair] || '',
      r.reason || '',
      r.updatedAt || '',
    ];
  });
}

/** M_銘柄強弱 */
export function assetStrengthToSheetRows(rows) {
  return (rows || []).map((r) => [
    r.rank,
    r.asset || '',
    r.label || '',
    r.score ?? '',
    r.pairs ?? '',
    r.upPairs ?? '',
    r.downPairs ?? '',
    r.updatedAt || '',
  ]);
}

/**
 * 有効ユニバース ∩ 設定 PAIRS。instruments があれば is_enabled 済みのみ。
 */
export function resolveUniverse(cfg, instruments = null) {
  const wanted = (cfg.pairs?.length ? cfg.pairs : DEFAULT_PAIRS).map((s) =>
    String(s).toLowerCase()
  );
  if (!instruments) return wanted;
  return wanted.filter((p) => instruments[p]);
}

/**
 * 日足＋4H アップトレンドのみ → 買い有利度で順位付け。上位1本が候補。
 */
export async function refreshBuyRankIfNeeded(cfg, db, bitbank, deps = {}, opts = {}) {
  const intervalMs = opts.intervalMs ?? cfg.rankIntervalMs ?? DEFAULT_RANK_INTERVAL_MS;
  const force = !!opts.force;
  const last = Number(getKv(db, 'buy_rank_at') || 0);
  if (!force && Date.now() - last < intervalMs) {
    const cached = getCachedBuyRank(db);
    if (cached?.top?.length || cached?.universeStatus?.length) {
      return { ...cached, fromCache: true };
    }
  }

  const instruments = await bitbank.getInstruments();
  const universe = resolveUniverse(cfg, instruments);
  const log = deps.log || console.log;

  const candidates = [];
  const skipped = [];
  const universeStatus = [];
  const updatedAt = new Date().toISOString();

  for (let i = 0; i < universe.length; i++) {
    const pair = universe[i];
    try {
      const [daily, h4] = await Promise.all([
        bitbank.getCandles1d(pair, 0),
        bitbank.getCandles4h(pair, 0),
      ]);
      const dailySlice = daily.slice(-40);
      const h4Slice = h4.slice(-48);
      if (!h4Slice.length) throw new Error('no 4h candles');

      const lastPx = h4Slice[h4Slice.length - 1]?.close;
      const regime = classifyPairRegimeBuyOnly(dailySlice, h4Slice);
      const dirs = tfDirs(regime);

      if (regime.regime === 'unknown' || regime.tradeDir !== 'buy') {
        skipped.push({ pair, reason: regime.reason, ...dirs });
        universeStatus.push({
          pair,
          symbol: pair,
          status: '見送り',
          side: '',
          regime: regime.regime || 'unknown',
          reason: regime.reason || '',
          score: '',
          unitAmount: instruments[pair]?.unitAmount ?? '',
          ...dirs,
          updatedAt,
        });
      } else {
        const metrics = computeMetrics(h4Slice, lastPx, { barHours: 4 });
        const adx = computeAdx(h4Slice, 14);
        const scored = scoreBuyFavorability(metrics, { ...regime, adx });
        const row = {
          pair,
          symbol: pair,
          side: 'buy',
          regime: regime.regime,
          regimeReason: regime.reason,
          ...dirs,
          ...scored,
          last: metrics.last,
          sma20: metrics.sma20,
          unitAmount: instruments[pair]?.unitAmount ?? null,
          adx: adx.ok ? { adx: adx.adx, plusDI: adx.plusDI, minusDI: adx.minusDI } : null,
        };
        candidates.push(row);
        universeStatus.push({
          pair,
          symbol: pair,
          status: '買い可',
          side: 'buy',
          regime: row.regime,
          reason: regime.reason || '',
          score: row.score,
          unitAmount: row.unitAmount,
          ...dirs,
          updatedAt,
        });
      }
    } catch (e) {
      log(`[M] buy-rank skip ${pair}: ${e.message}`);
      skipped.push({ pair, reason: e.message });
      universeStatus.push({
        pair,
        symbol: pair,
        status: 'エラー',
        side: '',
        regime: '',
        reason: e.message,
        score: '',
        dailyDir: '',
        dailyRegime: '',
        h4Dir: '',
        h4Regime: '',
        updatedAt,
      });
    }
    if (i < universe.length - 1) await sleep(PAIR_DELAY_MS);
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return universe.indexOf(a.pair) - universe.indexOf(b.pair);
  });

  // 学習済みエントリー方針: 過去の負け要因からスコア下限が上がっていれば弱い候補を除外
  const entryPolicy = getEntryPolicy(db);
  const minRankScore = entryPolicy.minRankScore || 0;
  const passing = minRankScore > 0 ? candidates.filter((st) => st.score >= minRankScore) : candidates;
  if (minRankScore > 0) {
    for (const st of candidates) {
      if (st.score < minRankScore) {
        const us = universeStatus.find((u) => u.pair === st.pair);
        if (us) {
          us.status = '見送り(学習)';
          us.reason = `学習方針: score${st.score}<${minRankScore} ${us.reason || ''}`.trim();
        }
      }
    }
  }

  const top = passing.map((st, i) => ({
    rank: i + 1,
    pair: st.pair,
    symbol: st.pair,
    side: 'buy',
    regime: st.regime,
    dailyDir: st.dailyDir,
    h4Dir: st.h4Dir,
    dailyRegime: st.dailyRegime,
    h4Regime: st.h4Regime,
    score: st.score,
    drop4h: st.drop4h,
    drop24h: st.drop24h,
    drop4d: st.drop4d,
    belowSma: st.belowSma,
    details: st.details,
    unitAmount: st.unitAmount,
    last: st.last,
    reason: buildReason(st, i + 1),
    updatedAt,
  }));

  const rankByPair = Object.create(null);
  for (const t of top) rankByPair[t.pair] = t.rank;
  for (const u of universeStatus) {
    if (rankByPair[u.pair]) {
      u.rank = rankByPair[u.pair];
      u.reason = top.find((t) => t.pair === u.pair)?.reason || u.reason;
    }
  }

  const assetRank = rankAssetStrength(universeStatus, candidates).map((r) => ({
    ...r,
    updatedAt,
  }));

  const payload = {
    updatedAt,
    universeSize: universe.length,
    timeframe: 'Daily+4H',
    ranked: candidates,
    universeStatus,
    skipped,
    top,
    assetRank,
    unknownCount: skipped.length,
    candidateCount: candidates.length,
  };
  setKv(db, 'buy_rank_json', JSON.stringify(payload));
  setKv(db, 'buy_rank_at', String(Date.now()));

  const t0 = top[0];
  const a0 = assetRank[0];
  log(
    `[M] buy-rank refreshed tf=D+4H #1=${t0 ? t0.pair : '-'} score=${t0?.score ?? '-'} lot=${t0?.unitAmount ?? '-'} candidates=${candidates.length}/${universe.length} skip=${skipped.length} asset#1=${a0 ? `${a0.asset}/${a0.label}` : '-'} next≥${Math.round(intervalMs / 60000)}m`
  );
  return { ...payload, fromCache: false };
}

/**
 * 建玉を優先し、空きスロットをランク上位で埋める（最大 maxPositions、テスト既定3）。
 */
export function maxConcurrentPairs(cfg) {
  const n = Number(cfg.maxPositions);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(3, Math.floor(n));
}

export function selectTradeSlots(cfg, db) {
  const maxN = maxConcurrentPairs(cfg);
  const rankMeta = getCachedBuyRank(db) || { top: [], ranked: [], updatedAt: null };
  const rankedList = rankMeta.top?.length
    ? rankMeta.top
    : (rankMeta.ranked || []).map((st, i) => ({ ...st, rank: i + 1 }));
  const slots = [];
  const used = new Set();
  const crash = getCrashState(db);

  const add = (slot) => {
    const pair = String(slot.pair || '').toLowerCase();
    if (!pair || used.has(pair) || slots.length >= maxN) return false;
    used.add(pair);
    slots.push({
      ...slot,
      pair,
      side: 'buy',
      rankMeta,
      rank1: slot.rank1 || rankedList[0] || null,
    });
    return true;
  };

  for (const p of listOpenBotPositions(db)) {
    add({
      pair: p.pair,
      source: 'open_position',
      reason: `建玉維持（${p.pair}）`,
      position: p,
    });
  }

  if (crash?.mode === 'crash_pause') {
    return { slots, rankMeta, maxN, paused: true, pauseReason: crash.reason || '' };
  }

  for (const t of rankedList) {
    if (slots.length >= maxN) break;
    const pair = String(t?.pair || '').toLowerCase();
    if (!pair || used.has(pair)) continue;
    add({
      pair,
      source: `market_rank_${t.rank || slots.length + 1}`,
      reason: t.reason || `ランク${t.rank}`,
      rank1: t,
    });
  }

  return { slots, rankMeta, maxN, paused: false };
}

/**
 * 互換: 先頭スロット。
 */
export function selectActivePair(cfg, db) {
  const { slots, rankMeta, paused, pauseReason } = selectTradeSlots(cfg, db);
  if (paused && !slots.length) {
    return {
      pair: null,
      side: null,
      source: 'crash_pause',
      reason: `急落停止中: ${pauseReason || ''}`,
      rankMeta,
      rank1: null,
    };
  }
  if (slots[0]) return slots[0];
  return {
    pair: null,
    side: null,
    source: 'no_candidate',
    reason: '1D+4Hアップの買い候補なし',
    rankMeta,
    rank1: null,
  };
}
