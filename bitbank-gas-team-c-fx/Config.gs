/**
 * チームC-FX: P&F順張り — USD/JPY 専用（Yahoo・紙トレード）
 * BTC/JPY は bitbank-gas-team-c/ を使用
 */
var C3F_CONFIG = {
  YAHOO_SYMBOL: 'USDJPY=X',
  PF_BOX: 0.25,
  PF_BOX_MIN: 0.1,
  PF_BOX_MAX: 1.0,
  PF_BOX_ROUND: 0.05,
  PF_ATR_REF_PCT: 1.0,
  PF_REVERSAL_BOXES: 3,
  POSITION_USD: 1000,
  MIN_USD: 100,
  USD_DECIMALS: 2,
  PRICE_DECIMALS: 3,
  STOP_LOSS_PCT: 1.0,
  TRAIL_ACTIVATE_PCT: 0.5,
  TRAIL_CALLBACK_PCT: 0.25,
  MIN_CANDLES_1H: 55,
  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0012,
  VALIDATION_PAUSED_DEFAULT: true,
};

function c3fIsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return C3F_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

function c3fFormatUsd_(amount) {
  var pow = Math.pow(10, C3F_CONFIG.USD_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function c3fFormatPrice_(price) {
  var f = Math.pow(10, C3F_CONFIG.PRICE_DECIMALS);
  return Math.round(Number(price) * f) / f;
}

function c3fGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: true,
    pfBox: Number(p.getProperty('PF_BOX') || C3F_CONFIG.PF_BOX),
    pfBoxMin: Number(p.getProperty('PF_BOX_MIN') || C3F_CONFIG.PF_BOX_MIN),
    pfBoxMax: Number(p.getProperty('PF_BOX_MAX') || C3F_CONFIG.PF_BOX_MAX),
    pfAtrRefPct: Number(p.getProperty('PF_ATR_REF_PCT') || C3F_CONFIG.PF_ATR_REF_PCT),
    pfReversalBoxes: Number(p.getProperty('PF_REVERSAL_BOXES') || C3F_CONFIG.PF_REVERSAL_BOXES),
    positionUsd: Number(p.getProperty('POSITION_USD') || C3F_CONFIG.POSITION_USD),
    stopLossPct: Number(p.getProperty('STOP_LOSS_PCT') || C3F_CONFIG.STOP_LOSS_PCT),
    trailActivatePct: Number(p.getProperty('TRAIL_ACTIVATE_PCT') || C3F_CONFIG.TRAIL_ACTIVATE_PCT),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || C3F_CONFIG.TRAIL_CALLBACK_PCT),
  };
  return metaLeagueApplyToConfig_('C-FX', cfg, { sizeKeys: ['positionUsd'] });
}

function c3fLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('C3F_STATE');
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

function c3fSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('C3F_STATE', JSON.stringify(state));
}

function c3fLog_(msg) {
  var line = '[C3F][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('C3F_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('C3F_LOG', (line + '\n' + prev).slice(0, 8000));
}
