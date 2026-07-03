/**
 * チームD: 柴田罫線順張り — BTC/JPY 専用（bitbank）
 * USD/JPY は bitbank-gas-team-d-fx/ を使用
 */
var D4_CONFIG = {
  PAIR: 'btc_jpy',
  /** 1hour | 15min（bitbank API）— 15min はシグナル頻度アップ用 */
  CANDLE_TYPE: '15min',
  KAGI_BASE_STEP_JPY: 50000,
  KAGI_BASE_STEP_15M: 15000,
  LAW_LOOKBACK_SEGS: 12,
  LAW_TICK_MULT: 2,
  /** 買い法則の最低本数（2→1 で緩和） */
  LAW_BUY_MIN: 1,
  POSITION_BTC: 0.0001,
  STOP_LOSS_PCT: 1.0,
  TRAIL_ACTIVATE_PCT: 0.5,
  TRAIL_CALLBACK_PCT: 0.25,
  MIN_CANDLES_1H: 120,
  MIN_CANDLES_15M: 200,
  CANDLE_FETCH_MAX_DAYS: 5,
  CANDLE_FETCH_MAX_DAYS_15M: 3,
  CANDLE_CACHE_TTL_SEC: 600,
  TICKER_CACHE_TTL_SEC: 60,
  TRENDLINE_LOOKBACK: 48,
  MIN_BTC_AMOUNT: 0.0001,
  BTC_AMOUNT_DECIMALS: 4,
  PAPER_JPY_DEFAULT: 300000,
  PAPER_FEE_RATE: 0.0012,
  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',
  VALIDATION_PAUSED_DEFAULT: true,
};

function d4IsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return D4_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

function d4FormatBtc_(amount) {
  var pow = Math.pow(10, D4_CONFIG.BTC_AMOUNT_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function d4GetCandleType_(p) {
  var t = String(p.getProperty('CANDLE_TYPE') || D4_CONFIG.CANDLE_TYPE || '15min').trim();
  return t === '1hour' ? '1hour' : '15min';
}

function d4GetMinCandles_(candleType) {
  return candleType === '15min' ? D4_CONFIG.MIN_CANDLES_15M : D4_CONFIG.MIN_CANDLES_1H;
}

function d4GetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var candleType = d4GetCandleType_(p);
  var defaultKagi =
    candleType === '15min' ? D4_CONFIG.KAGI_BASE_STEP_15M : D4_CONFIG.KAGI_BASE_STEP_JPY;
  return {
    pair: D4_CONFIG.PAIR,
    candleType: candleType,
    minCandles: d4GetMinCandles_(candleType),
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    kagiBaseStep: Number(p.getProperty('KAGI_BASE_STEP_JPY') || defaultKagi),
    lawLookback: Number(p.getProperty('LAW_LOOKBACK_SEGS') || D4_CONFIG.LAW_LOOKBACK_SEGS),
    lawTickMult: Number(p.getProperty('LAW_TICK_MULT') || D4_CONFIG.LAW_TICK_MULT),
    lawBuyMin: Number(p.getProperty('LAW_BUY_MIN') || D4_CONFIG.LAW_BUY_MIN),
    positionBtc: Number(p.getProperty('POSITION_BTC') || D4_CONFIG.POSITION_BTC),
    stopLossPct: Number(p.getProperty('STOP_LOSS_PCT') || D4_CONFIG.STOP_LOSS_PCT),
    trailActivatePct: Number(p.getProperty('TRAIL_ACTIVATE_PCT') || D4_CONFIG.TRAIL_ACTIVATE_PCT),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || D4_CONFIG.TRAIL_CALLBACK_PCT),
  };
}

function d4LoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('D4_STATE');
  if (!raw) {
    return {
      mode: 'idle',
      entryPrice: null,
      trailHigh: null,
      lastSignal: null,
      lastRunAt: null,
      lastError: null,
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { mode: 'idle', entryPrice: null, trailHigh: null };
  }
}

function d4SaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('D4_STATE', JSON.stringify(state));
}

function d4Log_(msg) {
  var line = '[D4][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('D4_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('D4_LOG', (line + '\n' + prev).slice(0, 8000));
}
