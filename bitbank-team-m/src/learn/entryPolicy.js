/**
 * 買いエントリー選定の学習済み方針。swing_logic.entryPolicy に保存。
 * 決済の勝敗要因（エントリー時のエネルギー/ランクスコア）を集計し、
 * 弱い条件での参入を絞る／良かった条件を優先する。
 */
import { getSwingLogic, setSwingLogic } from '../db/sqlite.js';

export const DEFAULT_ENTRY_POLICY = {
  version: 1,
  /** energy.alignment が strong_with のみ許可（false ならこれまで通り with も許可） */
  requireStrongWith: false,
  /** energy.quality の下限。低品質（conflict）は元々除外されないため学習で絞る */
  minQuality: 'partial',
  /** energy.score(hybrid) の絶対値の下限（with/strong_withゲートの上乗せ） */
  minHybridScore: 0,
  /** rankBuy scoreBuyFavorability の下限。0=制限なし（既存挙動） */
  minRankScore: 0,
  notes: [],
};

const QUALITY_RANK = { low: 0, partial: 1, medium: 2, high: 3 };

function clamp(n, lo, hi, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
}

export function qualityRank(q) {
  return QUALITY_RANK[String(q || '').toLowerCase()] ?? QUALITY_RANK.partial;
}

export function normalizeEntryPolicy(raw = {}) {
  const p = { ...DEFAULT_ENTRY_POLICY, ...raw };
  p.requireStrongWith = !!p.requireStrongWith;
  p.minQuality = QUALITY_RANK[p.minQuality] != null ? p.minQuality : 'partial';
  p.minHybridScore = clamp(p.minHybridScore, 0, 40, 0);
  p.minRankScore = clamp(p.minRankScore, 0, 70, 0);
  p.notes = Array.isArray(p.notes) ? p.notes.slice(-8) : [];
  const incomingHint = raw.entryHint ? String(raw.entryHint).slice(0, 400) : '';
  if (incomingHint) p.entryHint = incomingHint;
  return p;
}

export function getEntryPolicy(db) {
  const logic = getSwingLogic(db) || {};
  return normalizeEntryPolicy(logic.entryPolicy || {});
}

export function saveEntryPolicy(db, next, meta = {}) {
  const logic = getSwingLogic(db) || {};
  const policy = normalizeEntryPolicy(next);
  const merged = {
    ...logic,
    version: Number(logic.version || 1) + 1,
    entryPolicy: policy,
    entryHint: meta.entryHint || policy.entryHint || logic.entryHint,
  };
  setSwingLogic(db, merged, {
    provider: meta.provider || 'entry_learn',
    summary: meta.summary || 'entry policy updated',
  });
  return policy;
}

/**
 * ルールベースの参入ゲート（AI判断の前段）。既定値は無制限＝これまでの挙動と同じ。
 */
export function passesEntryPolicyGate(energy, policy) {
  const p = normalizeEntryPolicy(policy);
  if (p.requireStrongWith && energy?.alignment !== 'strong_with') {
    return { ok: false, reason: `policy:requireStrongWith(${energy?.alignment})` };
  }
  if (qualityRank(energy?.quality) < qualityRank(p.minQuality)) {
    return { ok: false, reason: `policy:minQuality(${energy?.quality}<${p.minQuality})` };
  }
  if (Math.abs(Number(energy?.score) || 0) < p.minHybridScore) {
    return { ok: false, reason: `policy:minHybridScore(${energy?.score}<${p.minHybridScore})` };
  }
  return { ok: true };
}
