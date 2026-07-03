/**
 * チームE: ドンチャン順張り — BTC/JPY 専用（bitbank）
 * USD/JPY は bitbank-gas-team-e-fx/ を使用
 */
var E5_CONFIG = {
  PAIR: 'btc_jpy',
  CANDLE_TYPE: '15min',
  DONCHIAN_ENTRY_BARS: 15,
  DONCHIAN_EXIT_BARS: 8,
  ADX_MIN: 18,
  ER_MIN: 0.22,
  RSI_BUY_MAX: 72,
  /** true: 4H中立もエントリー可（厳格な上昇のみ→緩和） */
  BIAS_ALLOW_NEUTRAL: true,
  POSITION_BTC: 0.0001,
  STOP_LOSS_PCT: 1.0,
  TRAIL_ACTIVATE_PCT: 0.5,
  TRAIL_CALLBACK_PCT: 0.25,
  MIN_CANDLES_1H: 220,
  MIN_CANDLES_15M: 320,
  CANDLE_FETCH_MAX_DAYS: 5,
  CANDLE_FETCH_MAX_DAYS_15M: 3,
  CANDLE_CACHE_TTL_SEC: 600,
  TICKER_CACHE_TTL_SEC: 60,
  MIN_BTC_AMOUNT: 0.0001,
  BTC_AMOUNT_DECIMALS: 4,
  PAPER_JPY_DEFAULT: 300000,
  PAPER_FEE_RATE: 0.0012,
  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',
};

function e5FormatBtc_(amount) {
  var pow = Math.pow(10, E5_CONFIG.BTC_AMOUNT_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function e5GetCandleType_(p) {
  var t = String(p.getProperty('CANDLE_TYPE') || E5_CONFIG.CANDLE_TYPE || '15min').trim();
  return t === '1hour' ? '1hour' : '15min';
}

function e5GetMinCandles_(candleType) {
  return candleType === '15min' ? E5_CONFIG.MIN_CANDLES_15M : E5_CONFIG.MIN_CANDLES_1H;
}

function e5GetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var candleType = e5GetCandleType_(p);
  return {
    pair: E5_CONFIG.PAIR,
    candleType: candleType,
    minCandles: e5GetMinCandles_(candleType),
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    donchianEntry: Number(p.getProperty('DONCHIAN_ENTRY_BARS') || E5_CONFIG.DONCHIAN_ENTRY_BARS),
    donchianExit: Number(p.getProperty('DONCHIAN_EXIT_BARS') || E5_CONFIG.DONCHIAN_EXIT_BARS),
    adxMin: Number(p.getProperty('ADX_MIN') || E5_CONFIG.ADX_MIN),
    erMin: Number(p.getProperty('ER_MIN') || E5_CONFIG.ER_MIN),
    rsiBuyMax: Number(p.getProperty('RSI_BUY_MAX') || E5_CONFIG.RSI_BUY_MAX),
    biasAllowNeutral: String(p.getProperty('BIAS_ALLOW_NEUTRAL') || E5_CONFIG.BIAS_ALLOW_NEUTRAL) !== 'false',
    positionBtc: Number(p.getProperty('POSITION_BTC') || E5_CONFIG.POSITION_BTC),
    stopLossPct: Number(p.getProperty('STOP_LOSS_PCT') || E5_CONFIG.STOP_LOSS_PCT),
    trailActivatePct: Number(p.getProperty('TRAIL_ACTIVATE_PCT') || E5_CONFIG.TRAIL_ACTIVATE_PCT),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || E5_CONFIG.TRAIL_CALLBACK_PCT),
  };
}

function e5LoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('E5_STATE');
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

function e5SaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('E5_STATE', JSON.stringify(state));
}

function e5Log_(msg) {
  var line = '[E5][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('E5_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('E5_LOG', (line + '\n' + prev).slice(0, 8000));
}
