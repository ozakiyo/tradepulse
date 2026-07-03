/**
 * チームC: ポイント＆フィギュア順張り — BTC/JPY 専用（bitbank）
 * USD/JPY は bitbank-gas-team-c-fx/ を使用
 */
var C3_CONFIG = {
  PAIR: 'btc_jpy',
  PF_BOX_JPY: 50000,
  PF_BOX_MIN_JPY: 30000,
  PF_BOX_MAX_JPY: 100000,
  PF_ATR_REF_PCT: 1.0,
  PF_REVERSAL_BOXES: 3,
  POSITION_BTC: 0.0001,
  STOP_LOSS_PCT: 1.0,
  TRAIL_ACTIVATE_PCT: 0.5,
  TRAIL_CALLBACK_PCT: 0.25,
  MIN_CANDLES_1H: 55,
  CANDLE_FETCH_MAX_DAYS: 7,
  MIN_BTC_AMOUNT: 0.0001,
  BTC_AMOUNT_DECIMALS: 4,
  PAPER_JPY_DEFAULT: 300000,
  PAPER_FEE_RATE: 0.0012,
  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',
  /** 検証停止（既定オン）。再開: スクリプトプロパティ VALIDATION_PAUSED=false */
  VALIDATION_PAUSED_DEFAULT: true,
};

function c3IsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return C3_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

function c3FormatBtc_(amount) {
  var pow = Math.pow(10, C3_CONFIG.BTC_AMOUNT_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function c3GetConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    pair: C3_CONFIG.PAIR,
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    pfBoxJpy: Number(p.getProperty('PF_BOX_JPY') || C3_CONFIG.PF_BOX_JPY),
    pfBoxMinJpy: Number(p.getProperty('PF_BOX_MIN_JPY') || C3_CONFIG.PF_BOX_MIN_JPY),
    pfBoxMaxJpy: Number(p.getProperty('PF_BOX_MAX_JPY') || C3_CONFIG.PF_BOX_MAX_JPY),
    pfAtrRefPct: Number(p.getProperty('PF_ATR_REF_PCT') || C3_CONFIG.PF_ATR_REF_PCT),
    pfReversalBoxes: Number(p.getProperty('PF_REVERSAL_BOXES') || C3_CONFIG.PF_REVERSAL_BOXES),
    positionBtc: Number(p.getProperty('POSITION_BTC') || C3_CONFIG.POSITION_BTC),
    stopLossPct: Number(p.getProperty('STOP_LOSS_PCT') || C3_CONFIG.STOP_LOSS_PCT),
    trailActivatePct: Number(p.getProperty('TRAIL_ACTIVATE_PCT') || C3_CONFIG.TRAIL_ACTIVATE_PCT),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || C3_CONFIG.TRAIL_CALLBACK_PCT),
  };
}

function c3LoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('C3_STATE');
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

function c3SaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('C3_STATE', JSON.stringify(state));
}

function c3Log_(msg) {
  var line = '[C3][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('C3_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('C3_LOG', (line + '\n' + prev).slice(0, 8000));
}
