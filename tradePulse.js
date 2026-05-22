/**
 * コンテンツ配信メトリクス（試験運用）
 * USD/JPY・BTC現物を監視し、シグナル時に LINE へ通知。
 * 実口座・ブローカー API には接続しない。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_PATH = path.join(DATA_DIR, 'trade-pulse-state.json');
const LEGACY_STATE_PATH = path.join(DATA_DIR, 'content-pulse-state.json');

const EMA_FAST = 20;
const EMA_SLOW = 50;
const RSI_PERIOD = 14;

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
    candles.push({
      time: timestamps[i] * 1000,
      close: Number(close),
    });
  }
  return candles;
}

function analyzeMarket(candles1h, candles4h, market) {
  const closed1h = candles1h.slice(0, -1);
  if (closed1h.length < EMA_SLOW + 3) {
    throw new Error(`${market.label}: 1時間足データ不足`);
  }
  const closes = closed1h.map((c) => c.close);
  const emaFast = calcEmaSeries(closes, EMA_FAST);
  const emaSlow = calcEmaSeries(closes, EMA_SLOW);
  const n = closes.length - 1;
  const prev = n - 1;
  const price = closes[n];
  const barTime = closed1h[n].time;

  const closed4h = candles4h.slice(0, -1);
  const closes4 = closed4h.map((c) => c.close);
  const ema4 = calcEmaSeries(closes4, EMA_SLOW);
  const bias4 =
    closes4[closes4.length - 1] > ema4[ema4.length - 1] ? 'bullish' : 'bearish';

  const crossUp = emaFast[prev] <= emaSlow[prev] && emaFast[n] > emaSlow[n];
  const crossDown = emaFast[prev] >= emaSlow[prev] && emaFast[n] < emaSlow[n];
  const rsi = calcRsi(closes);

  let signal = null;
  if (crossUp && bias4 === 'bullish' && rsi != null && rsi < 70) signal = 'buy';
  else if (crossDown && bias4 === 'bearish' && rsi != null && rsi > 30) signal = 'sell';

  return {
    marketId: market.id,
    chart: market.chartLabel,
    price: roundPrice(price, market.priceDecimals),
    barTime,
    barTimeIso: new Date(barTime).toISOString(),
    bias4h: bias4,
    rsi: rsi != null ? Math.round(rsi * 10) / 10 : null,
    signal,
  };
}

function pnlQuote(side, entry, exit, volume) {
  if (side === 'long') return (exit - entry) * volume;
  if (side === 'short') return (entry - exit) * volume;
  return 0;
}

function applyPaperTrade(mktState, signal, price, barTimeIso) {
  const next = { ...mktState };
  const events = [];
  let tradePnl = 0;

  const closePosition = (reason) => {
    if (next.position === 'flat' || next.entryPrice == null) return;
    tradePnl = pnlQuote(next.position, next.entryPrice, price, next.volume);
    next.realizedPnl = roundMoney(next.realizedPnl + tradePnl);
    next.balance = roundMoney(next.balance + tradePnl);
    events.push({
      action: 'close',
      side: next.position,
      price,
      pnl: roundMoney(tradePnl),
      reason,
      at: barTimeIso,
    });
    next.position = 'flat';
    next.entryPrice = null;
    next.entryAt = null;
  };

  if (signal === 'buy') {
    if (next.position === 'short') closePosition('reverse_to_buy');
    if (next.position === 'flat') {
      next.position = 'long';
      next.entryPrice = price;
      next.entryAt = barTimeIso;
      events.push({ action: 'open', side: 'long', price, at: barTimeIso });
    }
  } else if (signal === 'sell') {
    if (next.position === 'long') closePosition('reverse_to_sell');
    if (next.position === 'flat') {
      next.position = 'short';
      next.entryPrice = price;
      next.entryAt = barTimeIso;
      events.push({ action: 'open', side: 'short', price, at: barTimeIso });
    }
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
  return '—';
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
  const lines = [
    '【配信メトリクス】試験運用',
    `銘柄: ${payload.label}`,
    '--- シグナル ---',
    `方向: ${signalLabelJa(payload.signal)}`,
    `価格: ${payload.price}`,
    `時刻: ${payload.barTimeIso}`,
    `環境（4H）: ${payload.bias4h === 'bullish' ? '上昇優勢' : '下降優勢'}`,
  ];
  if (payload.rsi != null) lines.push(`RSI: ${payload.rsi}`);
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

async function runMarketCheck(state, marketId, { force = false, sendLine = true } = {}) {
  const market = MARKETS[marketId];
  if (!market) throw new Error(`不明な銘柄: ${marketId}`);

  const [candles1h, candles4h] = await Promise.all([
    fetchYahooCandles(market.symbol, '1h', '30d'),
    fetchYahooCandles(market.symbol, '4h', '60d'),
  ]);

  const analysis = analyzeMarket(candles1h, candles4h, market);
  const mktState = { ...state.markets[marketId] };

  mktState.lastPrice = analysis.price;
  mktState.lastBias4h = analysis.bias4h;
  mktState.lastRsi = analysis.rsi;

  const alreadyHandled =
    mktState.lastClosedBarTime === analysis.barTime &&
    mktState.lastSignalAt === analysis.barTimeIso;

  const unrealized =
    mktState.position === 'flat' || mktState.entryPrice == null
      ? 0
      : roundMoney(
          pnlQuote(mktState.position, mktState.entryPrice, analysis.price, mktState.volume)
        );

  if (!analysis.signal) {
    state.markets[marketId] = mktState;
    return {
      marketId,
      action: 'no_signal',
      analysis,
      unrealized,
      output: null,
      line: { sent: false, reason: 'シグナルなし' },
    };
  }

  if (alreadyHandled && !force) {
    state.markets[marketId] = mktState;
    return {
      marketId,
      action: 'skipped_duplicate',
      analysis,
      unrealized,
      output: null,
      line: { sent: false, reason: '同一バー処理済み' },
    };
  }

  const { state: newMkt, events, tradePnl, unrealized: u2 } = applyPaperTrade(
    mktState,
    analysis.signal,
    analysis.price,
    analysis.barTimeIso
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

  let lineResult = { sent: false, reason: 'LINE未送信' };
  if (sendLine && isLineConfigured()) {
    try {
      lineResult = await sendLinePush(text);
      appendLineLog(state, {
        at: new Date().toISOString(),
        marketId,
        signal: analysis.signal,
        ...lineResult,
      });
      output.line = lineResult;
    } catch (err) {
      lineResult = { sent: false, reason: err.message };
      appendLineLog(state, {
        at: new Date().toISOString(),
        marketId,
        signal: analysis.signal,
        ...lineResult,
      });
    }
  } else if (sendLine) {
    lineResult = { sent: false, reason: 'LINE 未設定' };
  }

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

async function runPulseCheck({ force = false, sendLine } = {}) {
  const doLine = sendLine === undefined ? isLineConfigured() : Boolean(sendLine);
  const state = loadState();
  const results = [];

  for (const marketId of Object.keys(MARKETS)) {
    const r = await runMarketCheck(state, marketId, { force, sendLine: doLine });
    results.push(r);
  }

  state.lastCheckAt = new Date().toISOString();
  saveState(state);

  const signals = results.filter((r) => r.action === 'signal_processed');
  return {
    ok: true,
    checkedAt: state.lastCheckAt,
    results,
    signals,
    markets: state.markets,
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
      currency: MARKETS[id].currency,
    };
  });

  return {
    enabled: !envBool('CONTENT_PULSE_DISABLED', false),
    notifyChannel: 'line',
    lineConfigured: isLineConfigured(),
    markets: marketList,
    strategy: {
      style: '1時間足ベース短期スイング',
      entry: 'EMA20/EMA50クロス',
      filter: '4時間足EMA50方向 + RSI(14)',
      note: 'シグナル時のみLINE配信・実口座未接続',
    },
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
      const sendLine = req.body?.sendLine !== false;
      const result = await runPulseCheck({ force, sendLine });
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
    `📡 配信メトリクス: USD/JPY + BTC 監視開始（${Math.round(intervalMs / 60000)}分間隔・LINE=${isLineConfigured() ? 'on' : '未設定'}）`
  );

  const tick = async () => {
    try {
      const result = await runPulseCheck({ sendLine: true });
      for (const s of result.signals) {
        console.log(
          `📣 LINEシグナル [${s.marketId}]`,
          s.analysis.signal,
          '@',
          s.analysis.price,
          s.line?.sent ? '送信済' : s.line?.reason
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
