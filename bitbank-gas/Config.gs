/**
 * 試験運用: ロット 1/10（本番 0.001 BTC → 試験 0.0001 BTC）
 * 各トラップ間隔は本番どおり 50,000円（固定）。仕掛け上限～下限はATRで調整。
 */
var BB_CONFIG = {
  PAIR: 'btc_jpy',

  // ロット（BTC 数量）
  BTC_PER_LEVEL_FULL: 0.0001,
  BTC_PER_LEVEL_HALF: 0.0001,
  BTC_PER_LEVEL_PROD: 0.001,
  SWING_BTC: 0.0001,
  SWING_BTC_PROD: 0.001,

  // 各トラップの値幅（円・固定）。本数上限のみ環境で変える
  TORARIPI_TRAP_STEP_JPY_FULL: 50000,
  TORARIPI_TRAP_STEP_JPY_HALF: 30000,
  GRID_LEVELS_FULL: 30,
  GRID_LEVELS_HALF: 4,

  /** 買値からトレール開始する幅 = トラップ間隔 × この倍率（既定1.0 = 1段上） */
  TRAIL_ACTIVATE_STEP_MULT: 1.0,
  /** トレール高値からの利確戻り率（%） */
  TRAIL_CALLBACK_PCT: 0.25,

  SWING_STOP_LOSS_PCT: 1.0,
  /** スイング利確はトレール。0で上限なし */
  SWING_MAX_PROFIT_PCT: 0,
  SWING_TRAIL_ACTIVATE_PCT: 0.5,
  SWING_TRAIL_CALLBACK_PCT: 0.25,
  /** スイング買い RSI 下限 / 上限 */
  SWING_RSI_MIN: 35,
  SWING_RSI_MAX: 72,
  /** false=EMAクロス直後でなくても上昇トレンド継続でエントリー可 */
  SWING_ALLOW_TREND_CONTINUATION: true,
  /** EMAゴールデンクロスを遡って有効とみなす1H本数（0=当日クロスのみ） */
  SWING_EMA_CROSS_LOOKBACK: 8,

  /** 仕掛け上限～下限の幅 = (本数上限-1)×間隔 × ATR係数 */
  TORARIPI_ATR_REF_PCT: 1.0,
  TORARIPI_RANGE_MIN_FACTOR: 0.75,
  TORARIPI_RANGE_MAX_FACTOR: 1.0,

  SHOCK_MOVE_PCT: 1.5,
  /** 環境判定に必要な1時間足本数（Regime.gs と揃える） */
  MIN_CANDLES_1H: 55,
  /** 過去日を遡る最大日数（55本 ≒ 3日分） */
  CANDLE_FETCH_MAX_DAYS: 5,
  ER_TREND_MIN: 0.32,
  ER_RANGE_MAX: 0.22,
  ADX_TREND_MIN: 22,
  ADX_RANGE_MAX: 18,

  MIN_BTC_AMOUNT: 0.0001,
  BTC_AMOUNT_DECIMALS: 4,
  PRICE_DECIMALS: 0,

  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',

  /** 運用停止（既定オフ）。停止: VALIDATION_PAUSED=true */
  VALIDATION_PAUSED_DEFAULT: false,
};

function bbIsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return BB_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() === 'true';
}

function bbFormatBtc_(amount) {
  var pow = Math.pow(10, BB_CONFIG.BTC_AMOUNT_DECIMALS);
  return Math.floor(amount * pow) / pow;
}

function bbGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    pair: BB_CONFIG.PAIR,
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    toraripiWidthFull: Number(
      p.getProperty('TORARIPI_WIDTH_JPY') || BB_CONFIG.TORARIPI_TRAP_STEP_JPY_FULL
    ),
    toraripiWidthHalf: Number(
      p.getProperty('TORARIPI_WIDTH_HALF') || BB_CONFIG.TORARIPI_TRAP_STEP_JPY_HALF
    ),
    gridLevelsFull: Number(p.getProperty('GRID_LEVELS') || BB_CONFIG.GRID_LEVELS_FULL),
    gridLevelsHalf: Number(p.getProperty('GRID_LEVELS_HALF') || BB_CONFIG.GRID_LEVELS_HALF),
    btcPerLevelFull: Number(p.getProperty('BTC_PER_LEVEL') || BB_CONFIG.BTC_PER_LEVEL_FULL),
    btcPerLevelHalf: Number(p.getProperty('BTC_PER_LEVEL_HALF') || BB_CONFIG.BTC_PER_LEVEL_HALF),
    swingBtc: Number(p.getProperty('SWING_BTC') || BB_CONFIG.SWING_BTC),
    trailActivateStepMult: Number(
      p.getProperty('TRAIL_ACTIVATE_STEP_MULT') || BB_CONFIG.TRAIL_ACTIVATE_STEP_MULT
    ),
    trailCallbackPct: Number(p.getProperty('TRAIL_CALLBACK_PCT') || BB_CONFIG.TRAIL_CALLBACK_PCT),
    swingStopLossPct: Number(p.getProperty('SWING_STOP_LOSS_PCT') || BB_CONFIG.SWING_STOP_LOSS_PCT),
    swingMaxProfitPct: Number(p.getProperty('SWING_MAX_PROFIT_PCT') || BB_CONFIG.SWING_MAX_PROFIT_PCT),
    swingTrailActivatePct: Number(
      p.getProperty('SWING_TRAIL_ACTIVATE_PCT') || BB_CONFIG.SWING_TRAIL_ACTIVATE_PCT
    ),
    swingTrailCallbackPct: Number(
      p.getProperty('SWING_TRAIL_CALLBACK_PCT') || BB_CONFIG.SWING_TRAIL_CALLBACK_PCT
    ),
    swingRsiMin: Number(p.getProperty('SWING_RSI_MIN') || BB_CONFIG.SWING_RSI_MIN),
    swingRsiMax: Number(p.getProperty('SWING_RSI_MAX') || BB_CONFIG.SWING_RSI_MAX),
    swingAllowTrendContinuation:
      String(
        p.getProperty('SWING_ALLOW_TREND_CONTINUATION') ||
          BB_CONFIG.SWING_ALLOW_TREND_CONTINUATION
      ) !== 'false',
    swingEmaCrossLookback: Number(
      p.getProperty('SWING_EMA_CROSS_LOOKBACK') || BB_CONFIG.SWING_EMA_CROSS_LOOKBACK
    ),
    toraripiAtrRefPct: Number(p.getProperty('TORARIPI_ATR_REF_PCT') || BB_CONFIG.TORARIPI_ATR_REF_PCT),
    toraripiWidthMinFactor: Number(
      p.getProperty('TORARIPI_RANGE_MIN_FACTOR') ||
        p.getProperty('TORARIPI_WIDTH_MIN_FACTOR') ||
        BB_CONFIG.TORARIPI_RANGE_MIN_FACTOR
    ),
    toraripiWidthMaxFactor: Number(
      p.getProperty('TORARIPI_RANGE_MAX_FACTOR') ||
        p.getProperty('TORARIPI_WIDTH_MAX_FACTOR') ||
        BB_CONFIG.TORARIPI_RANGE_MAX_FACTOR
    ),
    shockMovePct: Number(p.getProperty('SHOCK_MOVE_PCT') || BB_CONFIG.SHOCK_MOVE_PCT),
  };
  return metaLeagueApplyToConfig_('A', cfg, {
    sizeKeys: ['btcPerLevelFull', 'btcPerLevelHalf', 'swingBtc'],
    sizeDecimals: { btcPerLevelFull: 4, btcPerLevelHalf: 4, swingBtc: 4 },
  });
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
      swingTrailHigh: null,
      lastToraripiMode: null,
      lastToraripiRangeSpan: null,
      lastToraripiLevels: null,
      lastToraripiTrapStep: null,
      lastToraripiAtrPct: null,
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
