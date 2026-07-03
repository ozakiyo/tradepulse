#!/usr/bin/env node
/**
 * TEAM-J — 1銘柄あたり必要資金（最悪: 日足トラップ内の全段約定）
 *
 *   node bitbank-gas-team-j/capital-estimate.mjs              # 日足レンジ（既定）
 *   node bitbank-gas-team-j/capital-estimate.mjs --legacy-atr # 旧: 1H ATR最大30本
 *   node bitbank-gas-team-j/capital-estimate.mjs --min-jpy=1000
 */
const PAIRS_API = 'https://api.bitbank.cc/v1/spot/pairs';
const PUBLIC = 'https://public.bitbank.cc';

/** TEAM-J 日足レンジ（README ② と同期） */
const J_DAILY = {
  lookback: 20,
  dailyRangeMaxPct: 15,
  atrPeriod: 14,
  maxLevelsCap: 30,
  feeBuffer: 1.02,
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function roundPrice(price, digits) {
  const pow = 10 ** digits;
  return Math.round(price * pow) / pow;
}

function roundTrapStep(step, priceDigits, last) {
  if (step >= 10000) return Math.round(step / 1000) * 1000;
  if (step >= 1000) return Math.round(step / 100) * 100;
  if (step >= 100) return Math.round(step / 10) * 10;
  if (step >= 1) return Math.round(step);
  return Math.max(0.01, roundPrice(step, Math.max(2, priceDigits || 2)));
}

function formatAmount(amount, amountDigits) {
  const pow = 10 ** amountDigits;
  return Math.floor(amount * pow) / pow;
}

function resolveLevelAmount(unitAmount, last, amountDigits, minLevelJpy) {
  if (!minLevelJpy || minLevelJpy <= 0 || last <= 0) return unitAmount;
  const need = minLevelJpy / last;
  const steps = Math.ceil(need / unitAmount);
  return formatAmount(steps * unitAmount, amountDigits);
}

function calcAtrPct(candles, period = 14) {
  if (candles.length < period + 2) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  let sum = 0;
  let count = 0;
  const start = Math.max(0, tr.length - period);
  for (let j = start; j < tr.length; j++) {
    const close = candles[j + 1].close;
    if (close > 0) {
      sum += tr[j] / close;
      count += 1;
    }
  }
  if (!count) return null;
  return (sum / count) * 100;
}

function calcGridPlanLegacy(last, atrPct, priceDigits) {
  const cfg = { maxLevels: 30, atrRefPct: 1.0, rangeMinFactor: 0.75, rangeMaxFactor: 1.0, defaultAtrPct: 1.0, minLevels: 1 };
  const atr = atrPct ?? cfg.defaultAtrPct;
  let trapStep = roundTrapStep((last * atr) / 100, priceDigits, last);
  const minStep = Math.max(0.01, last * 0.005);
  if (trapStep < minStep) trapStep = roundTrapStep(minStep, priceDigits, last);
  const maxRangeSpan = (cfg.maxLevels - 1) * trapStep;
  let factor = clamp(atr / cfg.atrRefPct, cfg.rangeMinFactor, cfg.rangeMaxFactor);
  let rangeSpan = Math.round((maxRangeSpan * factor) / trapStep) * trapStep;
  rangeSpan = clamp(rangeSpan, trapStep, maxRangeSpan);
  let levels = clamp(Math.floor(rangeSpan / trapStep) + 1, cfg.minLevels, cfg.maxLevels);
  return { trapStep, levels, rangeSpan: (levels - 1) * trapStep, atrPct: atr, factor, mode: 'legacy-1h' };
}

function aggregateDailyFrom1h_(candles1h) {
  const byDay = new Map();
  for (const c of candles1h) {
    if (!c.dayKey) continue;
    const d = byDay.get(c.dayKey) || { open: c.open, high: c.high, low: c.low, close: c.close };
    d.high = Math.max(d.high, c.high);
    d.low = Math.min(d.low, c.low);
    d.close = c.close;
    byDay.set(c.dayKey, d);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);
}

function detectDailyRange_(daily, cfg = J_DAILY) {
  if (!daily || daily.length < 5) {
    return { isRange: false, high: null, low: null, widthPct: null, note: '日足不足' };
  }
  const slice = daily.slice(-cfg.lookback);
  let high = slice[0].high;
  let low = slice[0].low;
  for (const c of slice) {
    high = Math.max(high, c.high);
    low = Math.min(low, c.low);
  }
  const mid = (high + low) / 2;
  const widthPct = mid > 0 ? ((high - low) / mid) * 100 : null;
  const isRange = widthPct != null && widthPct <= cfg.dailyRangeMaxPct;
  return {
    isRange,
    high,
    low,
    widthPct,
    note: `日足${slice.length}日 幅${widthPct != null ? widthPct.toFixed(2) : '-'}%`,
  };
}

/** 確定済み日足の高安幅平均（日中変動 JPY） */
function calcIntradayMoveAvg(daily, lookbackDays = 5) {
  if (!daily || daily.length < 2) return null;
  const confirmed = daily.slice(0, daily.length - 1);
  if (!confirmed.length) return null;
  const slice = confirmed.slice(-lookbackDays);
  if (!slice.length) return null;
  let sum = 0;
  for (const c of slice) sum += c.high - c.low;
  return sum / slice.length;
}

function calcMoveStepRatio(intradayMoveJpy, trapStep) {
  if (intradayMoveJpy == null || !trapStep || trapStep <= 0) return null;
  return Math.round((intradayMoveJpy / trapStep) * 100) / 100;
}

/** 日足レンジ内: 現値から refDailyLow まで trapStep 刻み（TEAM-J 想定） */
function calcDailyGridPlan(last, dailyRange, atrPct, priceDigits, cfg = J_DAILY) {
  const refLow = dailyRange.low;
  const refHigh = dailyRange.high;
  const atr = atrPct ?? 1.0;
  let trapStep = roundTrapStep((last * atr) / 100, priceDigits, last);
  const minStep = Math.max(0.01, last * 0.005);
  if (trapStep < minStep) trapStep = roundTrapStep(minStep, priceDigits, last);

  let levels = 0;
  for (let i = 0; i < cfg.maxLevelsCap; i++) {
    const buyPrice = last - i * trapStep;
    if (buyPrice < refLow) break;
    if (buyPrice <= 0) break;
    levels += 1;
  }
  levels = Math.max(0, levels);
  const floorPrice = levels > 0 ? last - (levels - 1) * trapStep : last;
  const spanToLow = last - refLow;

  return {
    trapStep,
    levels,
    rangeSpan: levels > 1 ? (levels - 1) * trapStep : 0,
    refDailyLow: refLow,
    refDailyHigh: refHigh,
    spanToDailyLow: spanToLow,
    atrPct: atr,
    mode: 'daily-range',
    floorPrice,
  };
}

/** 1ラウンド想定利益（売り=買値+trapStep 幅） */
function calcRoundProfitJpy(plan, levelAmount, feeBuffer = J_DAILY.feeBuffer) {
  if (!plan.levels || !plan.trapStep) return 0;
  return Math.ceil(plan.trapStep * levelAmount * feeBuffer);
}

/**
 * 銘柄自動選定スコア（高いほど優先）
 * - 1セット資金が少ない
 * - トラップ幅が狭い（同じ値動きで約定回数↑）
 * - 日足レンジ内の本数が多い（回転余地）
 */
function calcSelectScore(row) {
  if (!row.dailyRangeOk || !row.levels || row.startOnlyJpy <= 0) return 0;
  const trapPct = row.trapStepJpy / row.last;
  const roundProfit = calcRoundProfitJpy(
    { levels: row.levels, trapStep: row.trapStepJpy },
    row.levelAmount
  );
  const roundYield = roundProfit / row.startOnlyJpy;
  const levelBonus = Math.sqrt(row.levels);
  const capitalPenalty = Math.sqrt(row.startOnlyJpy / 1000);
  return (roundYield * levelBonus) / Math.max(0.001, capitalPenalty * trapPct);
}
/** 全レベル約定時の JPY 必要額（Team A: 各段 buyPrice * amount * 1.02） */
function calcWorstCaseJpy(last, plan, levelAmount, feeBuffer = J_DAILY.feeBuffer) {
  let total = 0;
  for (let i = 0; i < plan.levels; i++) {
    const buyPrice = last - i * plan.trapStep;
    if (plan.refDailyLow != null && buyPrice < plan.refDailyLow) break;
    if (buyPrice <= 0) break;
    total += buyPrice * levelAmount * feeBuffer;
  }
  return Math.ceil(total);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const json = await res.json();
  if (!json.success) throw new Error(`API ${url}: ${JSON.stringify(json).slice(0, 120)}`);
  return json.data;
}

async function fetchTicker(pair) {
  const d = await fetchJson(`${PUBLIC}/${pair}/ticker`);
  return Number(d.last);
}

async function fetchCandles1h(pair, days = 25) {
  const out = [];
  const now = new Date();
  for (let d = 0; d < days; d++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    const ymd =
      dt.getFullYear() +
      String(dt.getMonth() + 1).padStart(2, '0') +
      String(dt.getDate()).padStart(2, '0');
    const dayKey = ymd;
    try {
      const data = await fetchJson(`${PUBLIC}/${pair}/candlestick/1hour/${ymd}`);
      const rows = data.candlestick?.[0]?.ohlcv || [];
      for (const r of rows) {
        out.push({
          dayKey,
          open: Number(r[0]),
          high: Number(r[1]),
          low: Number(r[2]),
          close: Number(r[3]),
        });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function formatJpy(n) {
  return Math.round(n).toLocaleString('ja-JP');
}

async function main() {
  const legacyAtr = process.argv.includes('--legacy-atr');
  const asJson = process.argv.includes('--json');
  const rankOnly = process.argv.includes('--rank');
  const minJpyArg = process.argv.find((a) => a.startsWith('--min-jpy='));
  const minLevelJpy = minJpyArg ? Number(minJpyArg.split('=')[1]) : 0;
  const onlyPair = process.argv.find((a) => a.startsWith('--pair='))?.split('=')[1]?.toLowerCase();

  const pairsData = await fetchJson(PAIRS_API);
  const pairs = pairsData.pairs
    .filter((p) => p.is_enabled && p.name.endsWith('_jpy'))
    .filter((p) => !onlyPair || p.name === onlyPair)
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = [];
  for (const p of pairs) {
    const unitAmount = Number(p.unit_amount);
    const amountDigits = p.amount_digits;
    const priceDigits = p.price_digits;
    let last;
    let atrPct = null;
    let dailyRange = null;
    let daily = null;
    let plan;
    try {
      last = await fetchTicker(p.name);
      const candles1h = await fetchCandles1h(p.name);
      await new Promise((r) => setTimeout(r, 100));
      if (legacyAtr) {
        atrPct = calcAtrPct(candles1h.slice(-60));
        plan = calcGridPlanLegacy(last, atrPct, priceDigits);
      } else {
        daily = aggregateDailyFrom1h_(candles1h);
        dailyRange = detectDailyRange_(daily);
        atrPct = calcAtrPct(daily, J_DAILY.atrPeriod);
        if (!dailyRange.isRange) {
          plan = {
            trapStep: 0,
            levels: 0,
            rangeSpan: 0,
            atrPct,
            mode: 'daily-ng',
            refDailyLow: dailyRange.low,
            refDailyHigh: dailyRange.high,
          };
        } else {
          plan = calcDailyGridPlan(last, dailyRange, atrPct, priceDigits);
        }
      }
    } catch (e) {
      rows.push({ pair: p.name, error: e.message });
      continue;
    }

    const levelAmount = resolveLevelAmount(unitAmount, last, amountDigits, minLevelJpy);
    const worstJpy = plan.levels > 0 ? calcWorstCaseJpy(last, plan, levelAmount) : 0;
    const topOnlyJpy = Math.ceil(last * levelAmount * J_DAILY.feeBuffer);
    const roundProfitJpy =
      plan.levels > 0 ? calcRoundProfitJpy(plan, levelAmount) : 0;
    const trapStepPct = last > 0 && plan.trapStep ? (plan.trapStep / last) * 100 : null;
    const intradayMoveJpy =
      !legacyAtr && daily ? calcIntradayMoveAvg(daily) : null;
    const moveStepRatio =
      plan.trapStep > 0 ? calcMoveStepRatio(intradayMoveJpy, plan.trapStep) : null;

    const row = {
      pair: p.name,
      label: `${p.base_asset.toUpperCase()}/JPY`,
      last,
      unitAmount,
      levelAmount,
      dailyRangeOk: dailyRange?.isRange ?? null,
      dailyWidthPct: dailyRange?.widthPct != null ? Math.round(dailyRange.widthPct * 100) / 100 : null,
      refDailyLow: plan.refDailyLow ?? null,
      refDailyHigh: plan.refDailyHigh ?? null,
      atrPct: plan.atrPct != null ? Math.round(plan.atrPct * 1000) / 1000 : null,
      trapStepJpy: plan.trapStep,
      trapStepPct: trapStepPct != null ? Math.round(trapStepPct * 1000) / 1000 : null,
      intradayMoveJpy:
        intradayMoveJpy != null ? Math.round(intradayMoveJpy * 10000) / 10000 : null,
      moveStepRatio,
      levels: plan.levels,
      rangeSpanJpy: plan.rangeSpan,
      worstCaseJpy: worstJpy,
      startOnlyJpy: topOnlyJpy,
      roundProfitJpy,
      note: legacyAtr ? 'legacy 1H ATR' : dailyRange?.isRange ? '日足レンジ内' : dailyRange?.note || '日足NG',
      minLevelJpy: minLevelJpy || null,
    };
    row.selectScore = legacyAtr ? 0 : Math.round(calcSelectScore(row) * 10000) / 10000;
    rows.push(row);
  }

  rows.sort((a, b) => (a.worstCaseJpy || 0) - (b.worstCaseJpy || 0));

  const candidates = rows
    .filter((r) => !r.error && r.dailyRangeOk && r.levels > 0)
    .sort(
      (a, b) =>
        (b.moveStepRatio || 0) - (a.moveStepRatio || 0) ||
        (a.worstCaseJpy || 0) - (b.worstCaseJpy || 0) ||
        (a.startOnlyJpy || 0) - (b.startOnlyJpy || 0) ||
        (b.levels || 0) - (a.levels || 0) ||
        (a.trapStepJpy || 0) - (b.trapStepJpy || 0)
    );

  if (rankOnly && !legacyAtr) {
    console.log('=== TEAM-J 銘柄選定ランキング（日足レンジOK） ===');
    console.log(`1段ロット: ${minLevelJpy > 0 ? `max(API最小, ${minLevelJpy}円相当)` : 'API最小'}`);
    console.log('優先: 日中変動/trapStep↑ × 必要資金↓');
    console.log('');
    const rw = { pair: 12, move: 6, start: 8, step: 8, pct: 6, lv: 3, round: 8, worst: 10 };
    console.log(
      `${'銘柄'.padEnd(rw.pair)} ${'変動x'.padStart(rw.move)} ${'1セット'.padStart(rw.start)} ${'間隔'.padStart(rw.step)} ${'幅%'.padStart(rw.pct)} ${'本'.padStart(rw.lv)} ${'1R利益'.padStart(rw.round)} ${'最悪'.padStart(rw.worst)}`
    );
    console.log('-'.repeat(78));
    for (const r of candidates) {
      console.log(
        `${r.pair.padEnd(rw.pair)} ${String(r.moveStepRatio ?? '-').padStart(rw.move)} ${formatJpy(r.startOnlyJpy).padStart(rw.start)} ${formatJpy(r.trapStepJpy).padStart(rw.step)} ${String(r.trapStepPct).padStart(rw.pct)} ${String(r.levels).padStart(rw.lv)} ${formatJpy(r.roundProfitJpy).padStart(rw.round)} ${formatJpy(r.worstCaseJpy).padStart(rw.worst)}`
      );
    }
    console.log('');
    console.log(`候補: ${candidates.length} 銘柄`);
    return;
  }

  if (asJson) {
    console.log(
      JSON.stringify({ generatedAt: new Date().toISOString(), mode: legacyAtr ? 'legacy' : 'daily', minLevelJpy, rows }, null, 2)
    );
    return;
  }

  console.log('=== TEAM-J 1銘柄必要資金（最悪: 日足トラップ内・全段約定） ===');
  console.log(`mode: ${legacyAtr ? 'legacy 1H ATR最大30' : '日足20日レンジ内グリッド（TEAM-J想定）'}`);
  if (minLevelJpy > 0) console.log(`1段ロット: max(API最小, ${minLevelJpy}円相当)`);
  else console.log('1段ロット: API最小 (unit_amount)');
  console.log(`式: 現値から日足安値まで trapStep 刻み × ${J_DAILY.feeBuffer}`);
  console.log('');

  const w = { pair: 12, rng: 5, last: 10, lot: 10, step: 8, lv: 4, worst: 12, start: 10 };
  console.log(
    `${'銘柄'.padEnd(w.pair)} ${'Rng'.padStart(w.rng)} ${'現値'.padStart(w.last)} ${'1段数量'.padStart(w.lot)} ${'間隔'.padStart(w.step)} ${'本'.padStart(w.lv)} ${'最悪JPY'.padStart(w.worst)} ${'開始'.padStart(w.start)}`
  );
  console.log('-'.repeat(78));

  for (const r of rows) {
    if (r.error) {
      console.log(`${r.pair.padEnd(w.pair)} ERROR ${r.error}`);
      continue;
    }
    console.log(
      `${r.pair.padEnd(w.pair)} ${(r.dailyRangeOk ? 'OK' : 'NG').padStart(w.rng)} ${formatJpy(r.last).padStart(w.last)} ${String(r.levelAmount).padStart(w.lot)} ${formatJpy(r.trapStepJpy).padStart(w.step)} ${String(r.levels).padStart(w.lv)} ${formatJpy(r.worstCaseJpy).padStart(w.worst)} ${formatJpy(r.startOnlyJpy).padStart(w.start)}`
    );
  }

  const ok = rows.filter((r) => !r.error && r.dailyRangeOk);

  console.log('');
  console.log('--- サマリー ---');
  console.log(`日足レンジOK: ${ok.length} / ${rows.filter((r) => !r.error).length} 銘柄`);
  if (!legacyAtr && candidates.length) {
    const top = candidates[0];
    console.log(
      `選定1位: ${top.pair} 変動=${top.moveStepRatio ?? '-'}x 1セット=${formatJpy(top.startOnlyJpy)}円 間隔=${formatJpy(top.trapStepJpy)} (${top.trapStepPct}%) 本=${top.levels} 1R=${formatJpy(top.roundProfitJpy)}円`
    );
    if (candidates.length > 1) {
      console.log(`選定2位: ${candidates[1].pair}  選定3位: ${candidates[2]?.pair || '-'}`);
    }
    const budget = 50000;
    let used = 0;
    const picked = [];
    for (const r of candidates) {
      if (used + r.worstCaseJpy <= budget * 0.8) {
        picked.push(r);
        used += r.worstCaseJpy;
      }
    }
    console.log(
      `5万円・自動選定（最悪80%以内）: ${picked.map((r) => r.pair.replace('_jpy', '')).join(', ') || 'なし'} 合計最悪≈${formatJpy(used)}円`
    );
  }
  console.log('');
  console.log('選定ランキング: npm run team-j:capital:rank');
  console.log('legacy比較: node bitbank-gas-team-j/capital-estimate.mjs --legacy-atr --pair=btc_jpy');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
