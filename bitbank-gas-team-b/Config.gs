/**
 * チームB: トラリピ専用
 * - ボラティリティ(ATR) → 各トラップ間隔の変動
 * - RSI / ボリンジャー → 仕掛け上限～下限（本数）の拡大・縮小
 */
var B2_CONFIG = {
  PAIR: 'btc_jpy',

  BASE_TRAP_STEP_JPY: 50000,
  TRAP_STEP_MIN_JPY: 30000,
  TRAP_STEP_MAX_JPY: 80000,
  TRAP_STEP_MIN_FACTOR: 0.6,
  TRAP_STEP_MAX_FACTOR: 1.6,

  MAX_LEVELS: 30,
  MIN_LEVELS: 2,

  ATR_PERIOD: 14,
  ATR_REF_PCT: 1.0,

  RSI_PERIOD: 14,
  RSI_EXPAND_BELOW: 35,
  RSI_CONTRACT_ABOVE: 65,
  BB_PERIOD: 20,
  BB_STD_DEV: 2,
  BB_EXPAND_BELOW_POS: 0.25,
  BB_CONTRACT_ABOVE_POS: 0.75,
  BB_SQUEEZE_WIDTH_PCT: 2.5,
  BB_WIDE_WIDTH_PCT: 5.5,
  RSI_BB_EXPAND_BONUS: 0.25,
  RSI_BB_CONTRACT_PENALTY: 0.25,
  BB_SQUEEZE_PENALTY: 0.15,
  BB_WIDE_BONUS: 0.1,
  SPAN_MIN_FACTOR: 0.5,
  SPAN_MAX_FACTOR: 1.0,

  BTC_PER_LEVEL: 0.0001,
  /** 買値 + 間隔×倍率 でトレール開始（既定1.0 = 1段上） */
  TRAIL_ACTIVATE_STEP_MULT: 1.0,
  /** トレール高値からの利確戻り率（%） */
  TRAIL_CALLBACK_PCT: 0.25,

  MIN_CANDLES_1H: 55,
  CANDLE_FETCH_MAX_DAYS: 5,
  MIN_BTC_AMOUNT: 0.0001,
  BTC_AMOUNT_DECIMALS: 4,
  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0012,
  /** B2_運用ログ: 動きがないときの最低記録間隔（分）。Bot本体は1分のまま */
  RUN_LOG_INTERVAL_MIN: 30,
  /** 再構築: レンジ幅の変化率（約定済みなし） */
  REBUILD_RANGE_CHANGE_PCT: 0.1,
  /** 再構築: レンジ幅の変化率（約定済みロットあり） */
  REBUILD_RANGE_CHANGE_PCT_HELD: 0.2,
  /** 再構築: 約定済みあり時の最低間隔（分） */
  REBUILD_COOLDOWN_MIN_HELD: 30,

  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',
};

function b2FormatBtc_(amount) {
  var pow = Math.pow(10, B2_CONFIG.BTC_AMOUNT_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function b2GetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    pair: B2_CONFIG.PAIR,
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    baseTrapStepJpy: Number(p.getProperty('TORARIPI_WIDTH_JPY') || B2_CONFIG.BASE_TRAP_STEP_JPY),
    trapStepMinJpy: Number(p.getProperty('TRAP_STEP_MIN_JPY') || B2_CONFIG.TRAP_STEP_MIN_JPY),
    trapStepMaxJpy: Number(p.getProperty('TRAP_STEP_MAX_JPY') || B2_CONFIG.TRAP_STEP_MAX_JPY),
    trapStepMinFactor: Number(p.getProperty('TRAP_STEP_MIN_FACTOR') || B2_CONFIG.TRAP_STEP_MIN_FACTOR),
    trapStepMaxFactor: Number(p.getProperty('TRAP_STEP_MAX_FACTOR') || B2_CONFIG.TRAP_STEP_MAX_FACTOR),
    maxLevels: Number(p.getProperty('GRID_LEVELS') || B2_CONFIG.MAX_LEVELS),
    minLevels: Number(p.getProperty('MIN_LEVELS') || B2_CONFIG.MIN_LEVELS),
    atrPeriod: Number(p.getProperty('ATR_PERIOD') || B2_CONFIG.ATR_PERIOD),
    atrRefPct: Number(p.getProperty('ATR_REF_PCT') || B2_CONFIG.ATR_REF_PCT),
    rsiPeriod: Number(p.getProperty('RSI_PERIOD') || B2_CONFIG.RSI_PERIOD),
    rsiExpandBelow: Number(p.getProperty('RSI_EXPAND_BELOW') || B2_CONFIG.RSI_EXPAND_BELOW),
    rsiContractAbove: Number(p.getProperty('RSI_CONTRACT_ABOVE') || B2_CONFIG.RSI_CONTRACT_ABOVE),
    bbPeriod: Number(p.getProperty('BB_PERIOD') || B2_CONFIG.BB_PERIOD),
    bbStdDev: Number(p.getProperty('BB_STD_DEV') || B2_CONFIG.BB_STD_DEV),
    spanMinFactor: Number(p.getProperty('SPAN_MIN_FACTOR') || B2_CONFIG.SPAN_MIN_FACTOR),
    spanMaxFactor: Number(p.getProperty('SPAN_MAX_FACTOR') || B2_CONFIG.SPAN_MAX_FACTOR),
    btcPerLevel: Number(p.getProperty('BTC_PER_LEVEL') || B2_CONFIG.BTC_PER_LEVEL),
    trailActivateStepMult: Number(
      p.getProperty('TRAIL_ACTIVATE_STEP_MULT') || B2_CONFIG.TRAIL_ACTIVATE_STEP_MULT
    ),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || B2_CONFIG.TRAIL_CALLBACK_PCT),
    runLogIntervalMin: Number(
      p.getProperty('RUN_LOG_INTERVAL_MIN') || B2_CONFIG.RUN_LOG_INTERVAL_MIN
    ),
    rebuildRangeChangePct: Number(
      p.getProperty('REBUILD_RANGE_CHANGE_PCT') || B2_CONFIG.REBUILD_RANGE_CHANGE_PCT
    ),
    rebuildRangeChangePctHeld: Number(
      p.getProperty('REBUILD_RANGE_CHANGE_PCT_HELD') || B2_CONFIG.REBUILD_RANGE_CHANGE_PCT_HELD
    ),
    rebuildCooldownMinHeld: Number(
      p.getProperty('REBUILD_COOLDOWN_MIN_HELD') || B2_CONFIG.REBUILD_COOLDOWN_MIN_HELD
    ),
  };
  return metaLeagueApplyToConfig_('B', cfg, {
    sizeKeys: ['btcPerLevel'],
    sizeDecimals: { btcPerLevel: 4 },
  });
}

function b2LoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('B2_STATE');
  if (!raw) {
    return {
      mode: 'idle',
      trailHigh: null,
      lastTrapStep: null,
      lastRangeSpan: null,
      lastLevels: null,
      lastRunAt: null,
      lastRunLogAt: null,
      lastRebuildAt: null,
      lastError: null,
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { mode: 'idle', trailHigh: null };
  }
}

function b2SaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('B2_STATE', JSON.stringify(state));
}

function b2Log_(msg) {
  var line = '[B2][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('B2_LOG') || '';
  var next = (line + '\n' + prev).slice(0, 8000);
  PropertiesService.getScriptProperties().setProperty('B2_LOG', next);
}
