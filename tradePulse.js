/**
 * コンテンツ配信メトリクス（試験運用）
 * USD/JPY・BTC現物を監視し、相場環境が変わったときのみ LINE へ通知。
 * 実口座・ブローカー API には接続しない。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_PATH = path.join(DATA_DIR, 'trade-pulse-state.json');
const LEGACY_STATE_PATH = path.join(DATA_DIR, 'content-pulse-state.json');

const RSI_PERIOD = 14;

/** 戦略パラメータ（.env で調整・コスト抑制＋利確拡大） */
function envFloat(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function getStrategyConfig() {
  return {
    emaFast: envInt('TRADE_PULSE_EMA_FAST', 20),
    emaSlow: envInt('TRADE_PULSE_EMA_SLOW', 50),
    minEmaSepPct: envFloat('TRADE_PULSE_MIN_EMA_SEP_PCT', 0.04),
    rsiBuyMin: envFloat('TRADE_PULSE_RSI_BUY_MIN', 42),
    rsiBuyMax: envFloat('TRADE_PULSE_RSI_BUY_MAX', 65),
    rsiSellMin: envFloat('TRADE_PULSE_RSI_SELL_MIN', 35),
    rsiSellMax: envFloat('TRADE_PULSE_RSI_SELL_MAX', 58),
    stopLossPct: envFloat('TRADE_PULSE_STOP_LOSS_PCT', 1.0),
    takeProfitPct: envFloat('TRADE_PULSE_TAKE_PROFIT_PCT', 2.5),
    cooldownHours: envFloat('TRADE_PULSE_COOLDOWN_HOURS', 3),
    allowReverse: envBool('TRADE_PULSE_ALLOW_REVERSE', false),
    costJpyPerTrade: envFloat('TRADE_PULSE_COST_JPY_PER_TRADE', 30),
    costUsdPerTrade: envFloat('TRADE_PULSE_COST_USD_PER_TRADE', 2),
    regimeErPeriod: envInt('TRADE_PULSE_REGIME_ER_PERIOD', 20),
    regimeAdxPeriod: envInt('TRADE_PULSE_REGIME_ADX_PERIOD', 14),
    erTrendMin: envFloat('TRADE_PULSE_ER_TREND_MIN', 0.32),
    erRangeMax: envFloat('TRADE_PULSE_ER_RANGE_MAX', 0.22),
    adxTrendMin: envFloat('TRADE_PULSE_ADX_TREND_MIN', 22),
    adxRangeMax: envFloat('TRADE_PULSE_ADX_RANGE_MAX', 18),
    rangeRsiBuy: envFloat('TRADE_PULSE_RANGE_RSI_BUY', 32),
    rangeRsiSell: envFloat('TRADE_PULSE_RANGE_RSI_SELL', 68),
    rangeStopLossPct: envFloat('TRADE_PULSE_RANGE_STOP_LOSS_PCT', 0.75),
    rangeTakeProfitPct: envFloat('TRADE_PULSE_RANGE_TAKE_PROFIT_PCT', 1.2),
    rangeRsiExitLong: envFloat('TRADE_PULSE_RANGE_RSI_EXIT_LONG', 55),
    rangeRsiExitShort: envFloat('TRADE_PULSE_RANGE_RSI_EXIT_SHORT', 45),
    shockMovePct: envFloat('TRADE_PULSE_SHOCK_MOVE_PCT', 1.5),
  };
}

const MARKETS = {
  usdjpy: {
    id: 'usdjpy',
    label: 'USD/JPY',
    chartLabel: 'USD/JPY（1時間足・4時間足バイアス）',
    symbol: 'USDJPY=X',
    currency: 'jpy',
    defaultBalance: 50000,
    defaultVolume: 1000,
    priceDecimals: 3,
  },
  btc: {
    id: 'btc',
    label: 'BTC現物',
    chartLabel: 'BTC-USD 現物（1時間足・4時間足バイアス）',
    symbol: 'BTC-USD',
    currency: 'usd',
    defaultBalance: 50000,
    defaultVolume: 0.01,
    priceDecimals: 2,
  },
};

function envBool(name, fallback = false) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function defaultMarketState(market) {
  const bal =
    market.id === 'usdjpy'
      ? envInt('TRADE_PULSE_INITIAL_BALANCE', market.defaultBalance)
      : envInt('TRADE_PULSE_BTC_INITIAL_BALANCE', market.defaultBalance);
  const vol =
    market.id === 'usdjpy'
      ? envInt('TRADE_PULSE_VOLUME_USD', market.defaultVolume)
      : Number(process.env.TRADE_PULSE_BTC_VOLUME) || market.defaultVolume;
  return {
    marketId: market.id,
    label: market.label,
    balance: bal,
    initialBalance: bal,
    position: 'flat',
    entryPrice: null,
    entryAt: null,
    volume: vol,
    realizedPnl: 0,
    lastClosedBarTime: null,
    lastSignalAt: null,
    lastSignalType: null,
    lastPrice: null,
    lastBias4h: null,
    lastRsi: null,
    lastTradeAt: null,
    lastRegime: null,
    lastLineRegime: null,
    lastLineTrendBias: null,
    lastAdx: null,
    lastEr: null,
    entryRegime: null,
  };
}

function defaultState() {
  const markets = {};
  for (const m of Object.values(MARKETS)) {
    markets[m.id] = defaultMarketState(m);
  }
  return {
    version: 2,
    trialStartedAt: new Date().toISOString(),
    markets,
    history: [],
    outputLog: [],
    lineLog: [],
    lastCheckAt: null,
  };
}

function migrateState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  if (raw.markets && raw.version >= 2) {
    return {
      ...base,
      ...raw,
      markets: { ...base.markets, ...raw.markets },
    };
  }
  const usd = base.markets.usdjpy;
  if (raw.balance != null) usd.balance = raw.balance;
  if (raw.initialBalance != null) usd.initialBalance = raw.initialBalance;
  if (raw.position) usd.position = raw.position;
  if (raw.entryPrice != null) usd.entryPrice = raw.entryPrice;
  if (raw.realizedPnl != null) usd.realizedPnl = raw.realizedPnl;
  if (raw.volumeUsd != null) usd.volume = raw.volumeUsd;
  usd.lastClosedBarTime = raw.lastClosedBarTime ?? null;
  usd.lastSignalAt = raw.lastSignalAt ?? null;
  usd.lastSignalType = raw.lastSignalType ?? null;
  return {
    ...base,
    trialStartedAt: raw.trialStartedAt || base.trialStartedAt,
    markets: { ...base.markets, usdjpy: usd, btc: base.markets.btc },
    history: raw.history || [],
    outputLog: raw.outputLog || [],
    lineLog: raw.lineLog || [],
    lastCheckAt: raw.lastCheckAt || null,
  };
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_PATH) && fs.existsSync(LEGACY_STATE_PATH)) {
    fs.copyFileSync(LEGACY_STATE_PATH, STATE_PATH);
  }
  if (!fs.existsSync(STATE_PATH)) {
    const s = defaultState();
    saveState(s);
    return s;
  }
  try {
    return migrateState(JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')));
  } catch {
    const s = defaultState();
    saveState(s);
    return s;
  }
}

function saveState(state) {
  ensureDataDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function roundPrice(v, decimals = 3) {
  const f = 10 ** decimals;
  return Math.round(Number(v) * f) / f;
}

function roundMoney(v) {
  return Math.round(Number(v) * 100) / 100;
}

function calcEmaSeries(closes, period) {
  const k = 2 / (period + 1);
  const out = [];
  let ema = null;
  for (let i = 0; i < closes.length; i++) {
    if (ema == null) ema = closes[i];
    else ema = closes[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function calcRsi(closes, period = RSI_PERIOD) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + gains / period / avgLoss);
}

async function fetchYahooCandles(symbol, interval, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`${symbol} 取得失敗 (${res.status})`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote?.close?.length) throw new Error(`${symbol} チャートデータが空です`);
  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close[i];
    if (close == null || Number.isNaN(close)) continue;
    const c = Number(close);
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    candles.push({
      time: timestamps[i] * 1000,
      close: c,
      high: high != null && !Number.isNaN(high) ? Number(high) : c,
      low: low != null && !Number.isNaN(low) ? Number(low) : c,
    });
  }
  return candles;
}

function calcEfficiencyRatio(closes, period) {
  if (closes.length < period + 1) return null;
  const n = closes.length - 1;
  const change = Math.abs(closes[n] - closes[n - period]);
  let path = 0;
  for (let i = n - period + 1; i <= n; i++) {
    path += Math.abs(closes[i] - closes[i - 1]);
  }
  if (path === 0) return 0;
  return change / path;
}

function calcStdDev(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(v);
}

function calcBollingerWidthPct(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  if (mid === 0) return null;
  const std = calcStdDev(slice);
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  return ((upper - lower) / mid) * 100;
}

/** Wilder ADX（終値・高値・安値から算出） */
function calcAdx(highs, lows, closes, period = 14) {
  if (closes.length < period + 2) return null;
  const tr = [];
  const plusDm = [];
  const minusDm = [];
  for (let i = 1; i < closes.length; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let sp = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let sm = minusDm.slice(0, period).reduce((a, b) => a + b, 0);
  const dxList = [];
  for (let i = period; i < tr.length; i++) {
    atr = atr - atr / period + tr[i];
    sp = sp - sp / period + plusDm[i];
    sm = sm - sm / period + minusDm[i];
    const pdi = atr === 0 ? 0 : (100 * sp) / atr;
    const mdi = atr === 0 ? 0 : (100 * sm) / atr;
    const sum = pdi + mdi;
    const dx = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
    dxList.push(dx);
  }
  if (!dxList.length) return null;
  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / Math.min(period, dxList.length);
  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
  }
  return Math.round(adx * 10) / 10;
}

function countEmaCrosses(closes, fastPeriod, slowPeriod, lookback = 24) {
  const emaFast = calcEmaSeries(closes, fastPeriod);
  const emaSlow = calcEmaSeries(closes, slowPeriod);
  const start = Math.max(1, closes.length - lookback);
  let crosses = 0;
  for (let i = start; i < closes.length; i++) {
    const up = emaFast[i - 1] <= emaSlow[i - 1] && emaFast[i] > emaSlow[i];
    const down = emaFast[i - 1] >= emaSlow[i - 1] && emaFast[i] < emaSlow[i];
    if (up || down) crosses += 1;
  }
  return crosses;
}

/**
 * トレンド / レンジ / 中立 をスコアリング（ER・ADX・BB幅・EMAクロス回数）
 */
function detectMarketRegime(closed1h, cfg) {
  const closes = closed1h.map((c) => c.close);
  const highs = closed1h.map((c) => c.high ?? c.close);
  const lows = closed1h.map((c) => c.low ?? c.close);

  const er = calcEfficiencyRatio(closes, cfg.regimeErPeriod);
  const adx = calcAdx(highs, lows, closes, cfg.regimeAdxPeriod);
  const bbNow = calcBollingerWidthPct(closes, 20, 2);
  const bbWidths = [];
  for (let i = 20; i <= closes.length; i++) {
    const w = calcBollingerWidthPct(closes.slice(0, i), 20, 2);
    if (w != null) bbWidths.push(w);
  }
  const bbAvg =
    bbWidths.length > 0 ? bbWidths.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, bbWidths.length) : bbNow;
  const crosses = countEmaCrosses(closes, cfg.emaFast, cfg.emaSlow, 24);

  let trendScore = 0;
  let rangeScore = 0;
  if (er != null && er >= cfg.erTrendMin) trendScore += 1;
  if (adx != null && adx >= cfg.adxTrendMin) trendScore += 1;
  if (bbNow != null && bbAvg != null && bbNow >= bbAvg * 1.02) trendScore += 1;
  if (crosses <= 2) trendScore += 1;

  if (er != null && er <= cfg.erRangeMax) rangeScore += 1;
  if (adx != null && adx <= cfg.adxRangeMax) rangeScore += 1;
  if (bbNow != null && bbAvg != null && bbNow <= bbAvg * 0.92) rangeScore += 1;
  if (crosses >= 4) rangeScore += 1;

  let regime = 'mixed';
  if (trendScore >= 3) regime = 'trend';
  else if (rangeScore >= 3) regime = 'range';
  else if (trendScore >= 2 && trendScore > rangeScore) regime = 'trend';
  else if (rangeScore >= 2 && rangeScore > trendScore) regime = 'range';

  const detail =
    regime === 'trend'
      ? '方向性が強い（トレンドフォロー）'
      : regime === 'range'
        ? '往復が多い（逆張り）'
        : 'トレンド/レンジが拮抗（新規見送り）';

  return {
    regime,
    detail,
    er: er != null ? Math.round(er * 1000) / 1000 : null,
    adx,
    bbWidthPct: bbNow != null ? Math.round(bbNow * 1000) / 1000 : null,
    emaCrosses24h: crosses,
    trendScore,
    rangeScore,
  };
}

function regimeLabelJa(regime, bias4h) {
  if (regime === 'trend') {
    if (bias4h === 'bullish') return 'トレンド（アップトレンド）';
    if (bias4h === 'bearish') return 'トレンド（ダウントレンド）';
    return 'トレンド';
  }
  if (regime === 'range') return 'レンジ';
  if (regime === 'shock') return '急変';
  return '中立';
}

/** 環境ラベルに対応する運用方針（BTCトラリピ/スイング/停止） */
function regimePlaybookJa(regime, bias4h) {
  if (regime === 'shock') return 'STOP（トラリピ・新規停止）';
  if (regime === 'trend') {
    if (bias4h === 'bullish') return 'スイング（アップトレンド・順張り）';
    if (bias4h === 'bearish') return 'スイング（ダウントレンド・順張り）';
    return 'スイング（順張り）';
  }
  if (regime === 'range') return 'トラリピ（フル・幅5万円想定）';
  if (regime === 'mixed') return 'トラリピ（縮小）または様子見';
  return '様子見';
}

function shouldNotifyRegimeChange_(analysis, prevLineRegime, prevLineTrendBias) {
  if (prevLineRegime == null) return true;
  if (prevLineRegime !== analysis.regime) return true;
  if (
    analysis.regime === 'trend' &&
    analysis.bias4h &&
    analysis.bias4h !== 'neutral' &&
    prevLineTrendBias !== analysis.bias4h
  ) {
    return true;
  }
  return false;
}

function saveLineRegimeSnapshot_(mkt, analysis) {
  mkt.lastLineRegime = analysis.regime;
  mkt.lastLineTrendBias =
    analysis.regime === 'trend' && analysis.bias4h && analysis.bias4h !== 'neutral'
      ? analysis.bias4h
      : null;
}

function buildRegimeChangeText(market, analysis, prevRegime, prevLineTrendBias) {
  const prevBias = prevRegime === 'trend' ? prevLineTrendBias : null;
  const prevLabel = prevRegime ? regimeLabelJa(prevRegime, prevBias) : '（初回）';
  const nextLabel = regimeLabelJa(analysis.regime, analysis.bias4h);
  const isTrendDirectionFlip =
    prevRegime === 'trend' &&
    analysis.regime === 'trend' &&
    prevLineTrendBias &&
    analysis.bias4h &&
    analysis.bias4h !== 'neutral' &&
    prevLineTrendBias !== analysis.bias4h;
  const lines = [
    '【相場環境の変化】',
    `銘柄: ${market.label}`,
    isTrendDirectionFlip
      ? '種別: トレンド方向の転換（レンジではありません）'
      : '種別: 相場環境の変化',
    `変化: ${prevLabel} → ${nextLabel}`,
    `推奨運用: ${regimePlaybookJa(analysis.regime, analysis.bias4h)}`,
    `価格: ${analysis.price}`,
    `時刻: ${analysis.barTimeIso}`,
    `詳細: ${analysis.regimeDetail || '—'}`,
  ];
  if (analysis.regime === 'trend' && analysis.bias4h && analysis.bias4h !== 'neutral') {
    lines.push(`トレンド方向: ${biasLabelJa(analysis.bias4h)}`);
  }
  if (analysis.adx != null) lines.push(`ADX: ${analysis.adx}`);
  if (analysis.er != null) lines.push(`効率比(ER): ${analysis.er}`);
  lines.push('※売買履歴・損益はスプレッドシートで管理');
  return lines.join('\n');
}

async function maybeNotifyRegimeChange_(
  state,
  marketId,
  market,
  analysis,
  prevLineRegime,
  prevLineTrendBias,
  sendLine
) {
  if (!sendLine || !isLineConfigured()) {
    return { sent: false, reason: 'LINE未設定' };
  }
  if (!shouldNotifyRegimeChange_(analysis, prevLineRegime, prevLineTrendBias)) {
    return { sent: false, reason: '環境変化なし' };
  }
  const text = buildRegimeChangeText(market, analysis, prevLineRegime, prevLineTrendBias);
  try {
    const sent = await sendLinePush(text);
    const mkt = state.markets[marketId] || {};
    saveLineRegimeSnapshot_(mkt, analysis);
    state.markets[marketId] = mkt;
    appendLineLog(state, {
      at: new Date().toISOString(),
      marketId,
      kind: isTrendDirectionFlip_(analysis, prevLineRegime, prevLineTrendBias)
        ? 'trend_direction_change'
        : 'regime_change',
      signal: analysis.regime,
      text,
      action: 'regime_notified',
      line: { sent: true },
    });
    printSignalToConsole(market.label, text);
    return {
      sent: true,
      from: prevLineRegime,
      to: analysis.regime,
      fromTrendBias: prevLineTrendBias,
      toTrendBias: analysis.bias4h,
    };
  } catch (err) {
    appendLineLog(state, {
      at: new Date().toISOString(),
      marketId,
      kind: 'regime_change',
      signal: analysis.regime,
      line: { sent: false, reason: err.message },
    });
    return { sent: false, reason: err.message };
  }
}

function isTrendDirectionFlip_(analysis, prevLineRegime, prevLineTrendBias) {
  return (
    prevLineRegime === 'trend' &&
    analysis.regime === 'trend' &&
    prevLineTrendBias &&
    analysis.bias4h &&
    analysis.bias4h !== 'neutral' &&
    prevLineTrendBias !== analysis.bias4h
  );
}

function evaluateTrendEntry(analysis, cfg, emaFast, emaSlow, n, prev, price, closes) {
  const crossUp = emaFast[prev] <= emaSlow[prev] && emaFast[n] > emaSlow[n];
  const crossDown = emaFast[prev] >= emaSlow[prev] && emaFast[n] < emaSlow[n];
  const sepPct = analysis.emaSepPct;
  const sepOk = sepPct >= cfg.minEmaSepPct;
  const rsi = analysis.rsi;

  if (
    crossUp &&
    analysis.bias4h === 'bullish' &&
    sepOk &&
    price > emaSlow[n] &&
    rsi != null &&
    rsi >= cfg.rsiBuyMin &&
    rsi <= cfg.rsiBuyMax
  ) {
    return { signal: 'buy', note: 'トレンド: EMAゴールデンクロス' };
  }
  if (
    crossDown &&
    analysis.bias4h === 'bearish' &&
    sepOk &&
    price < emaSlow[n] &&
    rsi != null &&
    rsi >= cfg.rsiSellMin &&
    rsi <= cfg.rsiSellMax
  ) {
    return { signal: 'sell', note: 'トレンド: EMAデッドクロス' };
  }
  if (crossUp || crossDown) {
    return { signal: null, note: 'トレンド: クロスしたがフィルタ未達' };
  }
  return { signal: null, note: null };
}

function evaluateRangeEntry(analysis, cfg, emaSlow, n, price) {
  const rsi = analysis.rsi;
  if (rsi == null) return { signal: null, note: null };

  const nearSlow = Math.abs(price - emaSlow[n]) / price < 0.003;

  if (rsi <= cfg.rangeRsiBuy && price <= emaSlow[n] * 1.002) {
    return { signal: 'buy', note: `レンジ: RSI${rsi} 売られすぎ（逆張り買い）` };
  }
  if (rsi >= cfg.rangeRsiSell && price >= emaSlow[n] * 0.998) {
    return { signal: 'sell', note: `レンジ: RSI${rsi} 買われすぎ（逆張り売り）` };
  }
  if (nearSlow && rsi < 45) {
    return { signal: null, note: 'レンジ: 下値付近だがRSI未達' };
  }
  if (nearSlow && rsi > 55) {
    return { signal: null, note: 'レンジ: 上値付近だがRSI未達' };
  }
  return { signal: null, note: null };
}

function calc4hBias(closes4, emaFastPeriod, emaSlowPeriod) {
  if (closes4.length < emaSlowPeriod + 2) return 'neutral';
  const ema4Fast = calcEmaSeries(closes4, emaFastPeriod);
  const ema4Slow = calcEmaSeries(closes4, emaSlowPeriod);
  const n = closes4.length - 1;
  const price = closes4[n];
  const fast = ema4Fast[n];
  const slow = ema4Slow[n];
  if (price > slow && fast > slow) return 'bullish';
  if (price < slow && fast < slow) return 'bearish';
  return 'neutral';
}

function isCooldownActive(mktState, cfg) {
  if (!mktState.lastTradeAt) return false;
  const ms = cfg.cooldownHours * 3600 * 1000;
  return Date.now() - new Date(mktState.lastTradeAt).getTime() < ms;
}

function unrealizedPct(position, entry, price) {
  if (!entry || !price) return 0;
  if (position === 'long') return ((price - entry) / entry) * 100;
  if (position === 'short') return ((entry - price) / entry) * 100;
  return 0;
}

function tradeCostAmount(marketId, cfg) {
  return marketId === 'usdjpy' ? cfg.costJpyPerTrade : cfg.costUsdPerTrade;
}

function analyzeMarket(candles1h, candles4h, market) {
  const cfg = getStrategyConfig();
  const closed1h = candles1h.slice(0, -1);
  if (closed1h.length < cfg.emaSlow + 3) {
    throw new Error(`${market.label}: 1時間足データ不足`);
  }
  const closes = closed1h.map((c) => c.close);
  const emaFast = calcEmaSeries(closes, cfg.emaFast);
  const emaSlow = calcEmaSeries(closes, cfg.emaSlow);
  const n = closes.length - 1;
  const prev = n - 1;
  const price = closes[n];
  const barTime = closed1h[n].time;

  const closed4h = candles4h.slice(0, -1);
  const closes4 = closed4h.map((c) => c.close);
  const bias4 = calc4hBias(closes4, cfg.emaFast, cfg.emaSlow);
  const sepPct = (Math.abs(emaFast[n] - emaSlow[n]) / price) * 100;
  const rsi = calcRsi(closes);
  let regimeInfo = detectMarketRegime(closed1h, cfg);
  const prevClose = closed1h.length >= 2 ? closed1h[closed1h.length - 2].close : price;
  const movePct = prevClose ? (Math.abs(price - prevClose) / prevClose) * 100 : 0;
  if (movePct >= cfg.shockMovePct) {
    regimeInfo = {
      ...regimeInfo,
      regime: 'shock',
      detail: `急変（1H変動 ${movePct.toFixed(2)}%）`,
    };
  }

  const base = {
    marketId: market.id,
    chart: market.chartLabel,
    price: roundPrice(price, market.priceDecimals),
    barTime,
    barTimeIso: new Date(barTime).toISOString(),
    bias4h: bias4,
    rsi: rsi != null ? Math.round(rsi * 10) / 10 : null,
    emaSepPct: Math.round(sepPct * 1000) / 1000,
    regime: regimeInfo.regime,
    regimeDetail: regimeInfo.detail,
    er: regimeInfo.er,
    adx: regimeInfo.adx,
    bbWidthPct: regimeInfo.bbWidthPct,
    emaCrosses24h: regimeInfo.emaCrosses24h,
  };

  let signal = null;
  let signalNote = null;

  if (regimeInfo.regime === 'mixed') {
    signalNote = `環境${regimeLabelJa('mixed')}（ER=${regimeInfo.er ?? '—'} ADX=${regimeInfo.adx ?? '—'}）`;
  } else if (regimeInfo.regime === 'trend') {
    const entry = evaluateTrendEntry(
      { ...base, bias4h: bias4, rsi: base.rsi, emaSepPct: base.emaSepPct },
      cfg,
      emaFast,
      emaSlow,
      n,
      prev,
      price,
      closes
    );
    signal = entry.signal;
    signalNote = entry.note;
  } else if (regimeInfo.regime === 'range') {
    const entry = evaluateRangeEntry(
      { ...base, rsi: base.rsi },
      cfg,
      emaSlow,
      n,
      price
    );
    signal = entry.signal;
    signalNote = entry.note;
  }

  return { ...base, signal, signalNote };
}

function evaluateExit(mktState, analysis) {
  if (mktState.position === 'flat' || mktState.entryPrice == null) return null;
  const cfg = getStrategyConfig();
  const pct = unrealizedPct(mktState.position, mktState.entryPrice, analysis.price);
  const entryRegime = mktState.entryRegime || analysis.regime;

  if (entryRegime === 'range') {
    if (pct <= -cfg.rangeStopLossPct) {
      return { reason: 'stop_loss', detail: `レンジ損切り（${pct.toFixed(2)}%）` };
    }
    if (pct >= cfg.rangeTakeProfitPct) {
      return { reason: 'take_profit', detail: `レンジ利確（+${pct.toFixed(2)}%）` };
    }
    if (mktState.position === 'long' && analysis.rsi != null && analysis.rsi >= cfg.rangeRsiExitLong) {
      return { reason: 'range_mean_revert', detail: `レンジ手仕舞い（RSI${analysis.rsi}）` };
    }
    if (mktState.position === 'short' && analysis.rsi != null && analysis.rsi <= cfg.rangeRsiExitShort) {
      return { reason: 'range_mean_revert', detail: `レンジ手仕舞い（RSI${analysis.rsi}）` };
    }
    if (analysis.regime === 'trend') {
      return { reason: 'regime_shift', detail: '環境がトレンド化したため手仕舞い' };
    }
    return null;
  }

  if (pct <= -cfg.stopLossPct) {
    return { reason: 'stop_loss', detail: `損切り（${pct.toFixed(2)}%）` };
  }
  if (pct >= cfg.takeProfitPct) {
    return { reason: 'take_profit', detail: `利確（+${pct.toFixed(2)}%）` };
  }
  if (mktState.position === 'long' && analysis.bias4h === 'bearish') {
    return { reason: 'bias_flip', detail: '4H下降優勢でロング手仕舞い' };
  }
  if (mktState.position === 'short' && analysis.bias4h === 'bullish') {
    return { reason: 'bias_flip', detail: '4H上昇優勢でショート手仕舞い' };
  }
  if (analysis.regime === 'range' && entryRegime === 'trend') {
    return { reason: 'regime_shift', detail: '環境がレンジ化したため手仕舞い' };
  }
  return null;
}

function pnlQuote(side, entry, exit, volume) {
  if (side === 'long') return (exit - entry) * volume;
  if (side === 'short') return (entry - exit) * volume;
  return 0;
}

function applyPaperClose(next, price, barTimeIso, reason, marketId) {
  const cfg = getStrategyConfig();
  const events = [];
  let tradePnl = 0;
  if (next.position === 'flat' || next.entryPrice == null) {
    return { state: next, events, tradePnl: 0, unrealized: 0 };
  }
  tradePnl = pnlQuote(next.position, next.entryPrice, price, next.volume);
  const cost = tradeCostAmount(marketId, cfg);
  const netPnl = roundMoney(tradePnl - cost);
  next.realizedPnl = roundMoney(next.realizedPnl + netPnl);
  next.balance = roundMoney(next.balance + netPnl);
  events.push({
    action: 'close',
    side: next.position,
    price,
    pnl: netPnl,
    grossPnl: roundMoney(tradePnl),
    cost,
    reason,
    at: barTimeIso,
  });
  next.position = 'flat';
  next.entryPrice = null;
  next.entryAt = null;
  next.entryRegime = null;
  return { state: next, events, tradePnl: netPnl, unrealized: 0 };
}

function applyPaperTrade(mktState, signal, price, barTimeIso, marketId, entryRegime = null) {
  const cfg = getStrategyConfig();
  let next = { ...mktState };
  const events = [];
  let tradePnl = 0;
  let closedThisSignal = false;

  const closeOnly = (reason) => {
    const r = applyPaperClose(next, price, barTimeIso, reason, marketId);
    next = r.state;
    events.push(...r.events);
    tradePnl += r.tradePnl;
    closedThisSignal = true;
  };

  const canOpen = () =>
    !isCooldownActive(next, cfg) || (cfg.allowReverse && closedThisSignal);

  const openLong = () => {
    next.position = 'long';
    next.entryPrice = price;
    next.entryAt = barTimeIso;
    next.lastTradeAt = barTimeIso;
    next.entryRegime = entryRegime;
    events.push({ action: 'open', side: 'long', price, at: barTimeIso, regime: entryRegime });
  };

  const openShort = () => {
    next.position = 'short';
    next.entryPrice = price;
    next.entryAt = barTimeIso;
    next.lastTradeAt = barTimeIso;
    next.entryRegime = entryRegime;
    events.push({ action: 'open', side: 'short', price, at: barTimeIso, regime: entryRegime });
  };

  if (signal === 'buy') {
    if (next.position === 'short') closeOnly('signal_close_before_buy');
    if (next.position === 'flat' && canOpen()) openLong();
  } else if (signal === 'sell') {
    if (next.position === 'long') closeOnly('signal_close_before_sell');
    if (next.position === 'flat' && canOpen()) openShort();
  }

  const unrealized =
    next.position === 'flat' || next.entryPrice == null
      ? 0
      : roundMoney(pnlQuote(next.position, next.entryPrice, price, next.volume));

  return { state: next, events, tradePnl: roundMoney(tradePnl), unrealized };
}

function signalLabelJa(signal) {
  if (signal === 'buy') return '買い';
  if (signal === 'sell') return '売り';
  if (signal === 'exit') return '手仕舞い';
  return '—';
}

function biasLabelJa(bias) {
  if (bias === 'bullish') return '上昇優勢';
  if (bias === 'bearish') return '下降優勢';
  return '中立（様子見）';
}

function positionLabelJa(position) {
  if (position === 'long') return '買い';
  if (position === 'short') return '売り';
  return 'なし';
}

function moneyUnit(marketId) {
  return marketId === 'usdjpy' ? '円' : 'USD';
}

function buildNotifyText(payload) {
  const unit = moneyUnit(payload.marketId);
  const heading = payload.signal === 'exit' ? '--- 手仕舞い ---' : '--- シグナル ---';
  const lines = [
    '【配信メトリクス】試験運用',
    `銘柄: ${payload.label}`,
    heading,
    `方向: ${payload.exitDetail || signalLabelJa(payload.signal)}`,
    `価格: ${payload.price}`,
    `時刻: ${payload.barTimeIso}`,
    `環境（4H）: ${biasLabelJa(payload.bias4h)}`,
    `相場環境: ${regimeLabelJa(payload.regime)}${payload.regimeDetail ? `（${payload.regimeDetail}）` : ''}`,
  ];
  if (payload.rsi != null) lines.push(`RSI: ${payload.rsi}`);
  if (payload.emaSepPct != null) lines.push(`EMA乖離: ${payload.emaSepPct}%`);
  if (payload.adx != null) lines.push(`ADX: ${payload.adx}`);
  if (payload.er != null) lines.push(`効率比(ER): ${payload.er}`);
  lines.push(
    `今回損益: ${payload.tradePnl >= 0 ? '+' : ''}${payload.tradePnl} ${unit}`,
    `累計損益: ${payload.realizedPnl >= 0 ? '+' : ''}${payload.realizedPnl} ${unit}`,
    `試験残高: ${payload.balance} ${unit}`,
    `含み損益: ${payload.unrealized >= 0 ? '+' : ''}${payload.unrealized} ${unit}`,
    `ポジション: ${positionLabelJa(payload.position)}`,
    '※試験運用・実口座未接続'
  );
  return lines.join('\n');
}

function isLineConfigured() {
  return Boolean(
    String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim() &&
      String(process.env.LINE_USER_ID || '').trim()
  );
}

async function sendLinePush(text) {
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  const userId = String(process.env.LINE_USER_ID || '').trim();
  if (!token || !userId) {
    return { sent: false, reason: 'LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID 未設定' };
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: String(text).slice(0, 4800) }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LINE API ${res.status}: ${body.slice(0, 200)}`);
  }
  return { sent: true };
}

function appendOutputLog(state, entry) {
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry.at || new Date().toISOString(),
    marketId: entry.marketId || '',
    kind: entry.kind || 'signal',
    signal: entry.signal || null,
    text: entry.text || '',
    action: entry.action || '',
    line: entry.line || null,
  };
  state.outputLog = [row, ...(state.outputLog || [])].slice(0, 150);
  return row;
}

function appendLineLog(state, entry) {
  state.lineLog = [entry, ...(state.lineLog || [])].slice(0, 100);
}

async function runMarketCheck(state, marketId, { force = false, sendRegimeLine = true } = {}) {
  const market = MARKETS[marketId];
  if (!market) throw new Error(`不明な銘柄: ${marketId}`);

  const [candles1h, candles4h] = await Promise.all([
    fetchYahooCandles(market.symbol, '1h', '30d'),
    fetchYahooCandles(market.symbol, '4h', '60d'),
  ]);

  const analysis = analyzeMarket(candles1h, candles4h, market);
  const mktState = { ...state.markets[marketId] };
  const prevLineRegime = mktState.lastLineRegime ?? null;
  const prevLineTrendBias = mktState.lastLineTrendBias ?? null;

  mktState.lastPrice = analysis.price;
  mktState.lastBias4h = analysis.bias4h;
  mktState.lastRsi = analysis.rsi;
  mktState.lastRegime = analysis.regime;
  mktState.lastAdx = analysis.adx;
  mktState.lastEr = analysis.er;

  const alreadyHandled =
    mktState.lastClosedBarTime === analysis.barTime &&
    mktState.lastSignalAt === analysis.barTimeIso;

  const unrealized =
    mktState.position === 'flat' || mktState.entryPrice == null
      ? 0
      : roundMoney(
          pnlQuote(mktState.position, mktState.entryPrice, analysis.price, mktState.volume)
        );

  const exitInfo = evaluateExit(mktState, analysis);
  if (exitInfo) {
    const exitAt = new Date().toISOString();
    const { state: newMkt, events, tradePnl, unrealized: u2 } = applyPaperClose(
      mktState,
      analysis.price,
      exitAt,
      exitInfo.reason,
      marketId
    );
    newMkt.lastSignalAt = exitAt;
    newMkt.lastSignalType = 'exit';
    state.markets[marketId] = newMkt;

    const payload = {
      marketId,
      label: market.label,
      signal: 'exit',
      exitDetail: exitInfo.detail,
      price: analysis.price,
      barTimeIso: exitAt,
      bias4h: analysis.bias4h,
      rsi: analysis.rsi,
      emaSepPct: analysis.emaSepPct,
      regime: analysis.regime,
      regimeDetail: analysis.regimeDetail,
      adx: analysis.adx,
      er: analysis.er,
      tradePnl,
      realizedPnl: newMkt.realizedPnl,
      balance: newMkt.balance,
      position: newMkt.position,
      unrealized: u2,
    };
    const text = buildNotifyText(payload);
    const output = appendOutputLog(state, {
      at: exitAt,
      marketId,
      kind: 'exit',
      signal: 'exit',
      text,
      action: 'exit_processed',
    });
    printSignalToConsole(market.label, text);
    state.history = [
      {
        at: exitAt,
        marketId,
        label: market.label,
        signal: 'exit',
        price: analysis.price,
        tradePnl,
        realizedPnl: newMkt.realizedPnl,
        balance: newMkt.balance,
        bias4h: analysis.bias4h,
        rsi: analysis.rsi,
        events,
      },
      ...(state.history || []),
    ].slice(0, 200);

    const lineResult = await maybeNotifyRegimeChange_(
      state,
      marketId,
      market,
      analysis,
      prevLineRegime,
      prevLineTrendBias,
      sendRegimeLine
    );

    return {
      marketId,
      action: 'exit_processed',
      analysis,
      state: newMkt,
      unrealized: u2,
      tradePnl,
      events,
      output: { text, row: output },
      line: lineResult,
      unit: moneyUnit(marketId),
    };
  }

  if (!analysis.signal) {
    state.markets[marketId] = mktState;
    const lineResult = await maybeNotifyRegimeChange_(
      state,
      marketId,
      market,
      analysis,
      prevLineRegime,
      prevLineTrendBias,
      sendRegimeLine
    );
    return {
      marketId,
      action: 'no_signal',
      analysis,
      unrealized,
      output: null,
      line: lineResult,
    };
  }

  if (alreadyHandled && !force) {
    state.markets[marketId] = mktState;
    const lineResult = await maybeNotifyRegimeChange_(
      state,
      marketId,
      market,
      analysis,
      prevLineRegime,
      prevLineTrendBias,
      sendRegimeLine
    );
    return {
      marketId,
      action: 'skipped_duplicate',
      analysis,
      unrealized,
      output: null,
      line: lineResult,
    };
  }

  const { state: newMkt, events, tradePnl, unrealized: u2 } = applyPaperTrade(
    mktState,
    analysis.signal,
    analysis.price,
    analysis.barTimeIso,
    marketId,
    analysis.regime
  );

  newMkt.lastClosedBarTime = analysis.barTime;
  newMkt.lastSignalAt = analysis.barTimeIso;
  newMkt.lastSignalType = analysis.signal;
  state.markets[marketId] = newMkt;

  const unit = moneyUnit(marketId);
  const payload = {
    marketId,
    label: market.label,
    signal: analysis.signal,
    price: analysis.price,
    barTimeIso: analysis.barTimeIso,
    bias4h: analysis.bias4h,
    rsi: analysis.rsi,
    emaSepPct: analysis.emaSepPct,
    regime: analysis.regime,
    regimeDetail: analysis.regimeDetail,
    adx: analysis.adx,
    er: analysis.er,
    tradePnl,
    realizedPnl: newMkt.realizedPnl,
    balance: newMkt.balance,
    position: newMkt.position,
    unrealized: u2,
  };

  const text = buildNotifyText(payload);
  const output = appendOutputLog(state, {
    at: analysis.barTimeIso,
    marketId,
    kind: 'signal',
    signal: analysis.signal,
    text,
    action: 'signal_processed',
  });

  printSignalToConsole(market.label, text);

  const historyEntry = {
    at: analysis.barTimeIso,
    marketId,
    label: market.label,
    signal: analysis.signal,
    price: analysis.price,
    tradePnl,
    realizedPnl: newMkt.realizedPnl,
    balance: newMkt.balance,
    bias4h: analysis.bias4h,
    rsi: analysis.rsi,
    events,
  };
  state.history = [historyEntry, ...(state.history || [])].slice(0, 200);

  const lineResult = await maybeNotifyRegimeChange_(
    state,
    marketId,
    market,
    analysis,
    prevLineRegime,
    prevLineTrendBias,
    sendRegimeLine
  );

  return {
    marketId,
    action: 'signal_processed',
    analysis,
    state: newMkt,
    unrealized: u2,
    tradePnl,
    events,
    output: { text, row: output },
    line: lineResult,
    unit,
  };
}

function printSignalToConsole(label, text) {
  const bar = '═'.repeat(40);
  console.log(`\n${bar}\n[${label}]\n${text}\n${bar}\n`);
}

async function runPulseCheck({ force = false, sendRegimeLine } = {}) {
  const doRegimeLine =
    sendRegimeLine === undefined ? isLineConfigured() : Boolean(sendRegimeLine);
  const state = loadState();
  const results = [];

  for (const marketId of Object.keys(MARKETS)) {
    const r = await runMarketCheck(state, marketId, { force, sendRegimeLine: doRegimeLine });
    results.push(r);
  }

  state.lastCheckAt = new Date().toISOString();
  saveState(state);

  const signals = results.filter(
    (r) => r.action === 'signal_processed' || r.action === 'exit_processed'
  );
  const regimeChanges = results.filter((r) => r.line?.sent);
  return {
    ok: true,
    checkedAt: state.lastCheckAt,
    results,
    signals,
    regimeChanges,
    markets: state.markets,
  };
}

function describeStrategyRules() {
  const c = getStrategyConfig();
  return {
    style: '1時間足・相場環境の自動判定（トレンド/レンジ/中立）',
    regime: `ER≥${c.erTrendMin}＋ADX≥${c.adxTrendMin}等→トレンド / ER≤${c.erRangeMax}＋ADX≤${c.adxRangeMax}等→レンジ / それ以外→中立（新規見送り）`,
    entryTrend: `トレンド時: EMA${c.emaFast}/${c.emaSlow}クロス + 4H一致 + 乖離 + RSI帯`,
    entryRange: `レンジ時: RSI≤${c.rangeRsiBuy}で逆張り買い / RSI≥${c.rangeRsiSell}で逆張り売り`,
    exitTrend: `トレンド: 損切${c.stopLossPct}% / 利確${c.takeProfitPct}% / 4H逆行`,
    exitRange: `レンジ: 損切${c.rangeStopLossPct}% / 利確${c.rangeTakeProfitPct}% / RSI中央回帰`,
    cost: `1回の決済ごとに試験コスト（USD/JPY ${c.costJpyPerTrade}円・BTC ${c.costUsdPerTrade}USD）`,
    cooldown: `新規エントリー間隔 ${c.cooldownHours} 時間`,
    reverse: c.allowReverse ? '同一シグナル内のドテン可' : 'ドテン禁止（決済のみ→別足で新規）',
    lineNotify: '相場環境またはトレンド方向が変わったときのみLINE（売買・損益はスプレッドシート）',
    note: '試験用メトリクス・実口座未接続',
  };
}

function getPulseStatus() {
  const state = loadState();
  const outputLog = (state.outputLog || []).slice(0, 50);
  const marketList = Object.keys(MARKETS).map((id) => {
    const m = state.markets[id] || defaultMarketState(MARKETS[id]);
    return {
      id,
      label: MARKETS[id].label,
      symbol: MARKETS[id].symbol,
      balance: m.balance,
      realizedPnl: m.realizedPnl,
      position: m.position,
      lastPrice: m.lastPrice,
      lastSignalType: m.lastSignalType,
      lastSignalAt: m.lastSignalAt,
      lastBias4h: m.lastBias4h,
      lastRsi: m.lastRsi,
      lastRegime: m.lastRegime,
      lastLineRegime: m.lastLineRegime,
      lastLineTrendBias: m.lastLineTrendBias,
      lastAdx: m.lastAdx,
      lastEr: m.lastEr,
      entryRegime: m.entryRegime,
      currency: MARKETS[id].currency,
    };
  });

  return {
    enabled: !envBool('TRADE_PULSE_DISABLED', false),
    notifyChannel: 'line',
    lineConfigured: isLineConfigured(),
    markets: marketList,
    strategy: describeStrategyRules(),
    trialStartedAt: state.trialStartedAt,
    lastCheckAt: state.lastCheckAt,
    history: (state.history || []).slice(0, 30),
    outputLog,
    latestOutput: outputLog[0] || null,
    lineLog: (state.lineLog || []).slice(0, 15),
  };
}

function registerTradePulseRoutes(app) {
  app.get('/api/pulse/status', (_req, res) => {
    try {
      res.json(getPulseStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/pulse/check', async (req, res) => {
    try {
      const force = Boolean(req.body?.force);
      const sendRegimeLine = req.body?.sendRegimeLine !== false;
      const result = await runPulseCheck({ force, sendRegimeLine });
      res.json(result);
    } catch (err) {
      console.error('❌ trade-pulse check failed', err.message);
      res.status(502).json({ error: err.message });
    }
  });

  app.post('/api/pulse/reset-trial', (_req, res) => {
    try {
      if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
      res.json({ ok: true, status: getPulseStatus() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/pulse/test-line', async (req, res) => {
    try {
      const marketId = String(req.body?.marketId || 'usdjpy');
      const market = MARKETS[marketId] || MARKETS.usdjpy;
      const state = loadState();
      const m = state.markets[market.id];
      const text = buildNotifyText({
        marketId: market.id,
        label: market.label,
        signal: 'buy',
        price: m.lastPrice || 0,
        barTimeIso: new Date().toISOString(),
        bias4h: 'bullish',
        rsi: 50,
        tradePnl: 0,
        realizedPnl: m.realizedPnl,
        balance: m.balance,
        position: m.position,
        unrealized: 0,
      });
      let line = { sent: false, reason: 'LINE 未設定' };
      if (isLineConfigured()) {
        line = await sendLinePush(`[テスト]\n${text}`);
        appendLineLog(state, {
          at: new Date().toISOString(),
          marketId: market.id,
          signal: 'buy',
          ...line,
        });
        saveState(state);
      }
      const output = appendOutputLog(state, {
        at: new Date().toISOString(),
        marketId: market.id,
        kind: 'test',
        signal: 'buy',
        text: `[テスト]\n${text}`,
        action: 'test',
        line,
      });
      saveState(state);
      res.json({ ok: true, marketId: market.id, output: { text }, line });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
}

let schedulerTimer = null;

function isSchedulerEnabled() {
  if (envBool('TRADE_PULSE_DISABLED', false)) return false;
  if (envBool('TRADE_PULSE_ENABLED', false)) return true;
  return true;
}

function startContentPulseScheduler() {
  if (!isSchedulerEnabled()) {
    console.log('ℹ️ 配信メトリクス: 自動監視オフ');
    return;
  }
  const intervalMs = envInt('TRADE_PULSE_CHECK_INTERVAL_MS', 5 * 60 * 1000);
  console.log(
    `📡 配信メトリクス: USD/JPY + BTC 監視開始（${Math.round(intervalMs / 60000)}分間隔・LINE=${isLineConfigured() ? '環境/方向変化時' : '未設定'}）`
  );

  const tick = async () => {
    try {
      const result = await runPulseCheck({ sendRegimeLine: true });
      for (const r of result.regimeChanges || []) {
        console.log(
          `📣 環境変化 LINE [${r.marketId}]`,
          regimeLabelJa(r.analysis?.regime, r.analysis?.bias4h),
          r.line?.from != null ? `(${r.line.from}→${r.line.to})` : '',
          '@',
          r.analysis?.price
        );
      }
    } catch (err) {
      console.warn('⚠️ 配信メトリクス tick failed:', err.message);
    }
  };

  tick();
  schedulerTimer = setInterval(tick, intervalMs);
}

function stopContentPulseScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  registerTradePulseRoutes,
  startContentPulseScheduler,
  stopContentPulseScheduler,
  runPulseCheck,
  getPulseStatus,
  MARKETS,
};
