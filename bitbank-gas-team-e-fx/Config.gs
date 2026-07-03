/**
 * チームE-FX: ドンチャン順張り — USD/JPY 専用（Yahoo・紙トレード）
 * BTC/JPY は bitbank-gas-team-e/ を使用
 */
var E5F_CONFIG = {
  YAHOO_SYMBOL: 'USDJPY=X',
  CANDLE_INTERVAL: '15m',
  DONCHIAN_ENTRY_BARS: 15,
  DONCHIAN_EXIT_BARS: 8,
  ADX_MIN: 18,
  ER_MIN: 0.22,
  RSI_BUY_MAX: 72,
  BIAS_ALLOW_NEUTRAL: true,
  POSITION_USD: 1000,
  MIN_USD: 100,
  USD_DECIMALS: 2,
  PRICE_DECIMALS: 3,
  STOP_LOSS_PCT: 1.0,
  TRAIL_ACTIVATE_PCT: 0.5,
  TRAIL_CALLBACK_PCT: 0.25,
  MIN_CANDLES_1H: 220,
  MIN_CANDLES_15M: 320,
  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0012,
};

function e5fFormatUsd_(amount) {
  var pow = Math.pow(10, E5F_CONFIG.USD_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function e5fFormatPrice_(price) {
  var f = Math.pow(10, E5F_CONFIG.PRICE_DECIMALS);
  return Math.round(Number(price) * f) / f;
}

function e5fGetCandleInterval_(p) {
  var v = String(p.getProperty('CANDLE_INTERVAL') || E5F_CONFIG.CANDLE_INTERVAL || '15m').trim();
  return v === '1h' ? '1h' : '15m';
}

function e5fGetMinCandles_(interval) {
  return interval === '15m' ? E5F_CONFIG.MIN_CANDLES_15M : E5F_CONFIG.MIN_CANDLES_1H;
}

function e5fGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var candleInterval = e5fGetCandleInterval_(p);
  var cfg = {
    dryRun: true,
    candleInterval: candleInterval,
    minCandles: e5fGetMinCandles_(candleInterval),
    donchianEntry: Number(p.getProperty('DONCHIAN_ENTRY_BARS') || E5F_CONFIG.DONCHIAN_ENTRY_BARS),
    donchianExit: Number(p.getProperty('DONCHIAN_EXIT_BARS') || E5F_CONFIG.DONCHIAN_EXIT_BARS),
    adxMin: Number(p.getProperty('ADX_MIN') || E5F_CONFIG.ADX_MIN),
    erMin: Number(p.getProperty('ER_MIN') || E5F_CONFIG.ER_MIN),
    rsiBuyMax: Number(p.getProperty('RSI_BUY_MAX') || E5F_CONFIG.RSI_BUY_MAX),
    biasAllowNeutral: String(p.getProperty('BIAS_ALLOW_NEUTRAL') || E5F_CONFIG.BIAS_ALLOW_NEUTRAL) !== 'false',
    positionUsd: Number(p.getProperty('POSITION_USD') || E5F_CONFIG.POSITION_USD),
    stopLossPct: Number(p.getProperty('STOP_LOSS_PCT') || E5F_CONFIG.STOP_LOSS_PCT),
    trailActivatePct: Number(p.getProperty('TRAIL_ACTIVATE_PCT') || E5F_CONFIG.TRAIL_ACTIVATE_PCT),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || E5F_CONFIG.TRAIL_CALLBACK_PCT),
  };
  return metaLeagueApplyToConfig_('E-FX', cfg, { sizeKeys: ['positionUsd'] });
}

function e5fLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('E5F_STATE');
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

function e5fSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('E5F_STATE', JSON.stringify(state));
}

function e5fLog_(msg) {
  var line = '[E5F][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('E5F_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('E5F_LOG', (line + '\n' + prev).slice(0, 8000));
}
