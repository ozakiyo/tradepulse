/**
 * チームJ: bitbank 現物マルチ銘柄トラリピ（買いのみ・日足レンジローテ）
 */
var J_CONFIG = {
  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',

  /** 1段あたり最低 JPY（API最小だけではアルト利幅ゼロ） */
  MIN_LEVEL_JPY: 1000,

  /** 日足レンジ */
  DAILY_LOOKBACK: 20,
  DAILY_RANGE_MAX_PCT: 15,
  TRAP_BREAK_BUFFER_PCT: 0.3,

  /** グリッド */
  ATR_PERIOD: 14,
  MAX_LEVELS: 30,
  MIN_GRID_LEVELS: 4,
  TRAP_STEP_MIN_PCT: 0.5,

  /** 手数料ロール（TradingFees.gs 参照） */
  FEE_ROLE_FOR_CAPITAL: 'taker',
  FEE_ROLE_FOR_PROFIT: 'maker',

  MIN_CANDLES_1H: 55,
  /** 日中変動平均の算出日数（確定日足） */
  INTRADAY_MOVE_LOOKBACK_DAYS: 5,
  CANDLE_FETCH_MAX_DAYS: 25,
  CANDLE_DAY_CACHE_SEC: 900,
  TICKER_CACHE_SEC: 120,
  /** 銘柄ランキングキャッシュ（秒） */
  RANK_CACHE_TTL_SEC: 3600,
  /** 1回のランキング更新で使う最大実行時間（ms） */
  RANK_BATCH_MAX_MS: 270000,

  PAPER_JPY_DEFAULT: 50000,
  ACCOUNT_BUDGET_PCT: 0.8,

  /** 長期保有BTC（トラップで新規購入は可 / この数量までは売却対象外） */
  BTC_RESERVE_AMOUNT: 0.20263447,
  /** 自動選定・トラップから除外（必要時のみスクリプトプロパティで指定） */
  EXCLUDE_PAIRS: [],

  MAX_ACTIVE_PAIRS: 2,
  TRAIL_ACTIVATE_STEP_MULT: 1.0,
  TRAIL_CALLBACK_PCT: 0.25,
  REBUILD_RANGE_CHANGE_PCT: 0.15,
  REBUILD_COOLDOWN_MIN_HELD: 120,
  RUN_LOG_INTERVAL_MIN: 15,

  VALIDATION_PAUSED_DEFAULT: true,
};

function jIsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return J_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

function jGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    minLevelJpy: Number(p.getProperty('MIN_LEVEL_JPY') || J_CONFIG.MIN_LEVEL_JPY),
    dailyLookback: Number(p.getProperty('DAILY_LOOKBACK') || J_CONFIG.DAILY_LOOKBACK),
    intradayMoveLookbackDays: Number(
      p.getProperty('INTRADAY_MOVE_LOOKBACK_DAYS') || J_CONFIG.INTRADAY_MOVE_LOOKBACK_DAYS
    ),
    dailyRangeMaxPct: Number(p.getProperty('DAILY_RANGE_MAX_PCT') || J_CONFIG.DAILY_RANGE_MAX_PCT),
    maxLevels: Number(p.getProperty('MAX_LEVELS') || J_CONFIG.MAX_LEVELS),
    minGridLevels: Number(p.getProperty('MIN_GRID_LEVELS') || J_CONFIG.MIN_GRID_LEVELS),
    feeRoleCapital: p.getProperty('FEE_ROLE_FOR_CAPITAL') || J_CONFIG.FEE_ROLE_FOR_CAPITAL,
    feeRoleProfit: p.getProperty('FEE_ROLE_FOR_PROFIT') || J_CONFIG.FEE_ROLE_FOR_PROFIT,
    paperJpyDefault: Number(p.getProperty('PAPER_JPY') || J_CONFIG.PAPER_JPY_DEFAULT),
    accountBudgetPct: Number(p.getProperty('ACCOUNT_BUDGET_PCT') || J_CONFIG.ACCOUNT_BUDGET_PCT),
    btcReserve: Number(p.getProperty('BTC_RESERVE_AMOUNT') || J_CONFIG.BTC_RESERVE_AMOUNT),
    maxActivePairs: Number(p.getProperty('MAX_ACTIVE_PAIRS') || J_CONFIG.MAX_ACTIVE_PAIRS),
    trailActivateStepMult: Number(
      p.getProperty('TRAIL_ACTIVATE_STEP_MULT') || J_CONFIG.TRAIL_ACTIVATE_STEP_MULT
    ),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || J_CONFIG.TRAIL_CALLBACK_PCT),
    runLogIntervalMin: Number(p.getProperty('RUN_LOG_INTERVAL_MIN') || J_CONFIG.RUN_LOG_INTERVAL_MIN),
    excludePairs: jParseExcludePairs_(p.getProperty('J_EXCLUDE_PAIRS')),
  };
  return metaLeagueApplyToConfig_('J', cfg, {});
}

function jParseExcludePairs_(raw) {
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(Boolean);
  }
  return (J_CONFIG.EXCLUDE_PAIRS || []).slice();
}

var J_GLOBAL_STATE_KEY = 'J_GLOBAL';

function jLoadGlobalState_() {
  var raw = PropertiesService.getScriptProperties().getProperty(J_GLOBAL_STATE_KEY);
  if (!raw) {
    return {
      activePairs: [],
      dormantPairs: [],
      paperWallet: null,
      lastRunAt: null,
      lastRunLogAt: null,
      lastError: null,
    };
  }
  try {
    var s = JSON.parse(raw);
    if (!s.activePairs) s.activePairs = [];
    if (!s.dormantPairs) s.dormantPairs = [];
    return s;
  } catch (e) {
    return { activePairs: [], dormantPairs: [] };
  }
}

function jSaveGlobalState_(global) {
  PropertiesService.getScriptProperties().setProperty(J_GLOBAL_STATE_KEY, JSON.stringify(global));
}

function jGetBtcReserve_(cfg) {
  cfg = cfg || jGetConfig_();
  return cfg.btcReserve != null ? cfg.btcReserve : J_CONFIG.BTC_RESERVE_AMOUNT;
}

function jStateKey_(pair) {
  return 'J_S_' + String(pair || '').replace(/[^a-z0-9]/gi, '_');
}

function jLoadState_(pair) {
  var raw = PropertiesService.getScriptProperties().getProperty(jStateKey_(pair));
  if (!raw) {
    return {
      mode: 'idle',
      gridLots: [],
      trailHigh: null,
      refDailyLow: null,
      refDailyHigh: null,
      lastTrapStep: null,
      lastLevels: null,
      settled: false,
      lastRunAt: null,
      lastError: null,
    };
  }
  try {
    var s = JSON.parse(raw);
    if (!s.gridLots) s.gridLots = [];
    return s;
  } catch (e) {
    return { mode: 'idle', gridLots: [] };
  }
}

function jSaveState_(pair, state) {
  PropertiesService.getScriptProperties().setProperty(jStateKey_(pair), JSON.stringify(state));
}

function jLog_(msg) {
  var line = '[J][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('J_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('J_LOG', (line + '\n' + prev).slice(0, 8000));
}
