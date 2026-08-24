/**
 * 決済結果からエントリー（銘柄選定）時の要因を振り返り、参入方針を調整する。
 * なぜマイナスだったか→条件を絞る。なぜプラスだったか→その条件を優先する。
 */
import { callAiJson } from '../ai/providers/index.js';
import { getKv, listClosedBotPositions, logAi, setKv } from '../db/sqlite.js';
import { getEntryPolicy, normalizeEntryPolicy, saveEntryPolicy } from './entryPolicy.js';

function parseMeta(row) {
  try {
    return row?.meta_json ? JSON.parse(row.meta_json) : {};
  } catch {
    return {};
  }
}

export function summarizeEntries(rows) {
  const items = (rows || []).map((r) => {
    const meta = parseMeta(r);
    // openBotLong が meta.energy にエントリー時点のエネルギースナップショットを保存している
    const entryEnergy = meta.energy || {};
    const pnl = Number(r.realized_pnl) || 0;
    const entryPrice = Number(r.entry_price) || 0;
    const exitPrice = Number(r.exit_price) || 0;
    const pnlPct = entryPrice > 0 ? (exitPrice - entryPrice) / entryPrice : null;
    return {
      id: r.id,
      pair: r.pair,
      pnl,
      pnlPct,
      win: pnl > 0 || (pnlPct != null && pnlPct > 0),
      alignment: entryEnergy.alignment || '',
      quality: entryEnergy.quality || '',
      hybrid: Number(entryEnergy.score),
      agree: !!entryEnergy.agree,
      strength: entryEnergy.strength || '',
    };
  });

  const n = items.length;
  const wins = items.filter((x) => x.win).length;
  const losses = n - wins;
  const sum = Math.round(items.reduce((a, x) => a + x.pnl, 0) * 100) / 100;

  const byGroup = (pred) => {
    const g = items.filter(pred);
    const w = g.filter((x) => x.win).length;
    return { n: g.length, wins: w, winRate: g.length ? Math.round((w / g.length) * 1000) / 10 : null };
  };

  const strongWith = byGroup((x) => x.alignment === 'strong_with');
  const with_ = byGroup((x) => x.alignment === 'with');
  const highQ = byGroup((x) => x.quality === 'high');
  const mediumQ = byGroup((x) => x.quality === 'medium');
  const lowOrPartialQ = byGroup((x) => x.quality === 'low' || x.quality === 'partial');
  const weakHybrid = byGroup((x) => Number.isFinite(x.hybrid) && Math.abs(x.hybrid) < 20);
  const strongHybrid = byGroup((x) => Number.isFinite(x.hybrid) && Math.abs(x.hybrid) >= 35);

  return {
    n,
    wins,
    losses,
    sum,
    winRate: n ? Math.round((wins / n) * 1000) / 10 : 0,
    strongWith,
    with: with_,
    highQ,
    mediumQ,
    lowOrPartialQ,
    weakHybrid,
    strongHybrid,
    recent: items.slice(-12),
  };
}

export function ruleAdjustEntryPolicy(policy, stats) {
  const next = normalizeEntryPolicy(policy);
  const notes = [...(next.notes || [])];
  if (stats.n < 5) return { policy: next, changed: false, notes };

  let changed = false;

  // with(弱) が strong_with よりはっきり負け越すなら strong_with のみに絞る
  if (
    stats.with.n >= 3 &&
    stats.with.winRate != null &&
    stats.with.winRate < 40 &&
    stats.strongWith.winRate != null &&
    stats.strongWith.winRate - stats.with.winRate >= 20
  ) {
    if (!next.requireStrongWith) {
      next.requireStrongWith = true;
      notes.push(`with勝率${stats.with.winRate}% < strong_with勝率${stats.strongWith.winRate}%→strong_withのみ許可`);
      changed = true;
    }
  } else if (stats.with.n >= 5 && stats.with.winRate != null && stats.with.winRate >= 55 && next.requireStrongWith) {
    next.requireStrongWith = false;
    notes.push(`with勝率${stats.with.winRate}%まで改善→withも再度許可`);
    changed = true;
  }

  // low/partial品質での負けが多いなら medium 以上に制限
  if (
    stats.lowOrPartialQ.n >= 3 &&
    stats.lowOrPartialQ.winRate != null &&
    stats.lowOrPartialQ.winRate < 35 &&
    next.minQuality === 'partial'
  ) {
    next.minQuality = 'medium';
    notes.push(`quality=low/partial勝率${stats.lowOrPartialQ.winRate}%が低い→medium以上に制限`);
    changed = true;
  } else if (
    stats.lowOrPartialQ.n >= 5 &&
    stats.lowOrPartialQ.winRate != null &&
    stats.lowOrPartialQ.winRate >= 50 &&
    next.minQuality === 'medium'
  ) {
    next.minQuality = 'partial';
    notes.push(`quality=low/partialでも勝率${stats.lowOrPartialQ.winRate}%→制限解除`);
    changed = true;
  }

  // 弱いhybridスコア（20未満）での負けが多いなら参入スコアの下限を上げる
  if (
    stats.weakHybrid.n >= 3 &&
    stats.weakHybrid.winRate != null &&
    stats.weakHybrid.winRate < 35
  ) {
    const v = Math.min(30, (next.minHybridScore || 0) + 5);
    if (v !== next.minHybridScore) {
      next.minHybridScore = v;
      notes.push(`弱いhybrid(<20)勝率${stats.weakHybrid.winRate}%が低い→エントリー閾値を${v}に引き上げ`);
      changed = true;
    }
  } else if (
    stats.weakHybrid.n >= 5 &&
    stats.weakHybrid.winRate != null &&
    stats.weakHybrid.winRate >= 55 &&
    next.minHybridScore > 0
  ) {
    next.minHybridScore = Math.max(0, next.minHybridScore - 5);
    notes.push(`弱いhybridでも勝率${stats.weakHybrid.winRate}%まで改善→閾値を緩和`);
    changed = true;
  }

  next.notes = notes.slice(-8);
  return { policy: normalizeEntryPolicy(next), changed, notes };
}

const LEARN_SYSTEM = `You review Team-M Bitbank spot BUY-ONLY entries (why closed trades became winners vs losers, based on entry-time signals).
Objective: bias future entries toward the conditions (alignment/quality/hybrid score) that produced wins, and gate out conditions that produced losses.
Buy-only (no shorts). Keep gates conservative — do not lock out entries entirely.
Reply JSON only:
{"requireStrongWith":true|false,"minQuality":"partial"|"medium"|"high","minHybridScore":0-30,"minRankScore":0-60,"entryHint":"short Japanese","rationale":"short"}`;

export async function reviewEntriesWithAi(cfg, db, stats, policy) {
  const user = JSON.stringify({
    task: 'entry_policy_learn',
    currentPolicy: policy,
    stats,
  });
  const out = await callAiJson(cfg, LEARN_SYSTEM, user, { importance: 'normal' });
  logAi(db, {
    role: 'entry_learn',
    provider: out.provider,
    request: { stats, policy },
    response: out.data,
    ok: true,
  });
  return normalizeEntryPolicy({ ...policy, ...out.data });
}

export async function maybeLearnEntries(cfg, db, log = console.log, opts = {}) {
  const closed = listClosedBotPositions(db);
  if (!closed.length) return { skipped: true, reason: 'no_closes' };

  const lastId = Number(getKv(db, 'entry_learn_last_id') || 0);
  const newest = closed[closed.length - 1];
  const newestId = Number(newest?.id) || 0;
  const lastAt = Number(getKv(db, 'entry_learn_at') || 0);
  const minMs = Number(cfg.learnMinIntervalMs) || 6 * 3600000;
  const dayMs = Number(cfg.learnIntervalMs) || 24 * 3600000;
  const dueDaily = Date.now() - lastAt >= dayMs;
  const newCloses = newestId > lastId;
  if (!opts.force && !newCloses && !dueDaily) return { skipped: true, reason: 'no_new' };
  if (!opts.force && newCloses && Date.now() - lastAt < 15 * 60000 && lastAt > 0) {
    return { skipped: true, reason: 'cooldown' };
  }
  if (!opts.force && !newCloses && Date.now() - lastAt < minMs) {
    return { skipped: true, reason: 'min_interval' };
  }

  const recent = closed.slice(-20);
  const stats = summarizeEntries(recent);
  const cur = getEntryPolicy(db);
  const ruled = ruleAdjustEntryPolicy(cur, stats);
  let next = ruled.policy;
  let via = ruled.changed ? 'rules' : 'none';

  if (stats.n >= 5 && (dueDaily || opts.force || stats.losses >= 3)) {
    try {
      next = await reviewEntriesWithAi(cfg, db, stats, next);
      via = via === 'rules' ? 'rules+ai' : 'ai';
    } catch (e) {
      log(`[M] entry learn AI skipped: ${e.message}`);
    }
  }

  const changed =
    via !== 'none' ||
    next.requireStrongWith !== cur.requireStrongWith ||
    next.minQuality !== cur.minQuality ||
    next.minHybridScore !== cur.minHybridScore ||
    next.minRankScore !== cur.minRankScore;

  if (changed) {
    saveEntryPolicy(db, next, {
      provider: via,
      summary: `entry learn ${via} n=${stats.n} wr=${stats.winRate}% strongWith=${stats.strongWith.winRate ?? '-'}% with=${stats.with.winRate ?? '-'}%`,
      entryHint: next.entryHint,
    });
    log(
      `[M] entry learn ${via} requireStrongWith=${next.requireStrongWith} minQuality=${next.minQuality} minHybrid=${next.minHybridScore} minRank=${next.minRankScore}`
    );
  } else {
    log(`[M] entry learn no change n=${stats.n} wr=${stats.winRate}%`);
  }
  setKv(db, 'entry_learn_at', String(Date.now()));
  setKv(db, 'entry_learn_last_id', String(newestId));
  return { skipped: false, changed, via, stats, policy: next };
}
