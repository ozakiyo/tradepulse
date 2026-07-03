/**
 * チームD-FX: 柴田罫線順張り — USD/JPY 専用（Yahoo・紙トレード）
 * BTC/JPY は bitbank-gas-team-d/ を使用
 */
var D4F_CONFIG = {
  YAHOO_SYMBOL: 'USDJPY=X',
  /** Yahoo interval: 15m | 1h */
  CANDLE_INTERVAL: '15m',
  KAGI_BASE_STEP_FX: 0.25,
  KAGI_BASE_STEP_15M: 0.0625,
  LAW_LOOKBACK_SEGS: 12,
  LAW_TICK_MULT: 2,
  LAW_BUY_MIN: 1,
  POSITION_USD: 1000,
  MIN_USD: 100,
  USD_DECIMALS: 2,
  PRICE_DECIMALS: 3,
  STOP_LOSS_PCT: 1.0,
  TRAIL_ACTIVATE_PCT: 0.5,
  TRAIL_CALLBACK_PCT: 0.25,
  MIN_CANDLES_1H: 120,
  MIN_CANDLES_15M: 200,
  TRENDLINE_LOOKBACK: 48,
  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0012,
  VALIDATION_PAUSED_DEFAULT: true,
};

function d4fIsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return D4F_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

function d4fFormatUsd_(amount) {
  var pow = Math.pow(10, D4F_CONFIG.USD_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function d4fFormatPrice_(price) {
  var f = Math.pow(10, D4F_CONFIG.PRICE_DECIMALS);
  return Math.round(Number(price) * f) / f;
}

function d4fGetCandleInterval_(p) {
  var v = String(p.getProperty('CANDLE_INTERVAL') || D4F_CONFIG.CANDLE_INTERVAL || '15m').trim();
  return v === '1h' ? '1h' : '15m';
}

function d4fGetMinCandles_(interval) {
  return interval === '15m' ? D4F_CONFIG.MIN_CANDLES_15M : D4F_CONFIG.MIN_CANDLES_1H;
}

function d4fGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var candleInterval = d4fGetCandleInterval_(p);
  var defaultKagi =
    candleInterval === '15m' ? D4F_CONFIG.KAGI_BASE_STEP_15M : D4F_CONFIG.KAGI_BASE_STEP_FX;
  var cfg = {
    dryRun: true,
    candleInterval: candleInterval,
    minCandles: d4fGetMinCandles_(candleInterval),
    kagiBaseStep: Number(p.getProperty('KAGI_BASE_STEP_FX') || defaultKagi),
    lawLookback: Number(p.getProperty('LAW_LOOKBACK_SEGS') || D4F_CONFIG.LAW_LOOKBACK_SEGS),
    lawTickMult: Number(p.getProperty('LAW_TICK_MULT') || D4F_CONFIG.LAW_TICK_MULT),
    lawBuyMin: Number(p.getProperty('LAW_BUY_MIN') || D4F_CONFIG.LAW_BUY_MIN),
    positionUsd: Number(p.getProperty('POSITION_USD') || D4F_CONFIG.POSITION_USD),
    stopLossPct: Number(p.getProperty('STOP_LOSS_PCT') || D4F_CONFIG.STOP_LOSS_PCT),
    trailActivatePct: Number(p.getProperty('TRAIL_ACTIVATE_PCT') || D4F_CONFIG.TRAIL_ACTIVATE_PCT),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || D4F_CONFIG.TRAIL_CALLBACK_PCT),
  };
  return metaLeagueApplyToConfig_('D-FX', cfg, { sizeKeys: ['positionUsd'] });
}

function d4fLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('D4F_STATE');
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

function d4fSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('D4F_STATE', JSON.stringify(state));
}

function d4fLog_(msg) {
  var line = '[D4F][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('D4F_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('D4F_LOG', (line + '\n' + prev).slice(0, 8000));
}
