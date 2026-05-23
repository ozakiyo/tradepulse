/**
 * 試験運用: ロット 1/10（本番 0.001 BTC → 試験 0.0001 BTC）
 * 幅は本番どおり 50,000円。APIキーはスクリプトプロパティで設定。
 */
var BB_CONFIG = {
  PAIR: 'btc_jpy',

  // ロット（BTC 数量）
  BTC_PER_LEVEL_FULL: 0.0001,
  BTC_PER_LEVEL_HALF: 0.0001,
  BTC_PER_LEVEL_PROD: 0.001,
  SWING_BTC: 0.0001,
  SWING_BTC_PROD: 0.001,

  // トラリピ（円建て幅・本数）— 幅は 1/10 にしない
  TORARIPI_WIDTH_JPY_FULL: 50000,
  TORARIPI_WIDTH_JPY_HALF: 30000,
  GRID_LEVELS_FULL: 8,
  GRID_LEVELS_HALF: 4,

  TRAIL_ACTIVATE_PCT: 0.4,
  TRAIL_CALLBACK_PCT: 0.25,

  SWING_STOP_LOSS_PCT: 1.0,
  SWING_TAKE_PROFIT_PCT: 2.0,

  SHOCK_MOVE_PCT: 1.5,
  ER_TREND_MIN: 0.32,
  ER_RANGE_MAX: 0.22,
  ADX_TREND_MIN: 22,
  ADX_RANGE_MAX: 18,

  MIN_BTC_AMOUNT: 0.0001,
  BTC_AMOUNT_DECIMALS: 4,
  PRICE_DECIMALS: 0,

  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',
};

function bbFormatBtc_(amount) {
  var pow = Math.pow(10, BB_CONFIG.BTC_AMOUNT_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function bbGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    pair: BB_CONFIG.PAIR,
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    toraripiWidthFull: Number(p.getProperty('TORARIPI_WIDTH_JPY') || BB_CONFIG.TORARIPI_WIDTH_JPY_FULL),
    toraripiWidthHalf: Number(p.getProperty('TORARIPI_WIDTH_HALF') || BB_CONFIG.TORARIPI_WIDTH_JPY_HALF),
    gridLevelsFull: Number(p.getProperty('GRID_LEVELS') || BB_CONFIG.GRID_LEVELS_FULL),
    gridLevelsHalf: Number(p.getProperty('GRID_LEVELS_HALF') || BB_CONFIG.GRID_LEVELS_HALF),
    btcPerLevelFull: Number(p.getProperty('BTC_PER_LEVEL') || BB_CONFIG.BTC_PER_LEVEL_FULL),
    btcPerLevelHalf: Number(p.getProperty('BTC_PER_LEVEL_HALF') || BB_CONFIG.BTC_PER_LEVEL_HALF),
    swingBtc: Number(p.getProperty('SWING_BTC') || BB_CONFIG.SWING_BTC),
    trailActivatePct: Number(p.getProperty('TRAIL_ACTIVATE_PCT') || BB_CONFIG.TRAIL_ACTIVATE_PCT),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || BB_CONFIG.TRAIL_CALLBACK_PCT),
    swingStopLossPct: Number(p.getProperty('SWING_STOP_LOSS_PCT') || BB_CONFIG.SWING_STOP_LOSS_PCT),
    swingTakeProfitPct: Number(p.getProperty('SWING_TAKE_PROFIT_PCT') || BB_CONFIG.SWING_TAKE_PROFIT_PCT),
    shockMovePct: Number(p.getProperty('SHOCK_MOVE_PCT') || BB_CONFIG.SHOCK_MOVE_PCT),
  };
}

function bbLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('BB_STATE');
  if (!raw) {
    return {
      mode: 'idle',
      regime: 'mixed',
      lastLineRegime: null,
      lastLineTrendBias: null,
      trailHigh: null,
      lastRunAt: null,
      lastAction: null,
      lastError: null,
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { mode: 'idle', regime: 'mixed', trailHigh: null };
  }
}

function bbSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('BB_STATE', JSON.stringify(state));
}

function bbLog_(msg) {
  var line = '[' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('BB_LOG') || '';
  var next = (line + '\n' + prev).slice(0, 8000);
  PropertiesService.getScriptProperties().setProperty('BB_LOG', next);
}
