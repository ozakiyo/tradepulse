import { reloadRootEnv_ } from './env.mjs';
import { parseTrendPairOverrides_ } from './gsaxo-instruments.mjs';

reloadRootEnv_();

export const GSAXO_DEFAULTS = {
  DAILY_LOOKBACK: 20,
  DAILY_RANGE_MAX_PCT: 10,
  H1_LOOKBACK: 48,
  H1_RANGE_MAX_PCT: 3.5,
  H1_INSIDE_DAILY_BUFFER_PCT: 0.5,
  TOUCH_PCT: 0.1,
  TP_RATIO: 0.55,
  TP_SPREAD_MULT: 1,
  PARTIAL_STOP_RATIO: 0.5,
  MIN_CANDLES_1H: 55,
  MIN_CANDLES_5M: 12,
  PAPER_JPY_DEFAULT: 200000,
  PAPER_FEE_RATE: 0.0008,
  MARGIN_RATE: 0.05,
  USD_JPY_REF: 150,
  MAX_MARGIN_JPY_PER_PAIR: 50000,
  MAX_OPEN_POSITIONS: 4,
  /** 日足損切後、同一銘柄の新規を止める時間（0=無効） */
  DAILY_STOP_COOLDOWN_HOURS: 24,
  /** 日足H/Lからの余白%（これを超えてから損切判定） */
  DAILY_STOP_BUFFER_PCT: 0.3,
  /** 日足損切: 連続する確定5分足の本数 */
  DAILY_STOP_CONFIRM_BARS: 2,
  /** 1H損切: 1Hレンジ境界からの余白%（これを超えてから損切判定） */
  H1_STOP_BUFFER_PCT: 0.2,
  /** 1H損切: 連続する確定1H足の本数 */
  H1_STOP_CONFIRM_BARS: 1,
  /** 1H損切判定のスプレッド倍率（利確より広げてダマシ回避） */
  H1_STOP_SPREAD_MULT: 1.5,
  /** 直近1H足の変動が平均の N 倍以上なら新規停止 */
  VOL_SPIKE_FILTER: true,
  H1_VOL_SPIKE_RATIO: 2.0,
  H1_VOL_SPIKE_LOOKBACK: 5,
  /** ボラ急伸判定の最低バー幅%（これ未満はノイズ扱い） */
  H1_VOL_SPIKE_MIN_PCT: 0.2,
  /** 1H ADX または ER が閾値以上なら新規停止（両方未満のみレンジ新規可。0=無効は trendFilterEnabled=false） */
  TREND_FILTER: true,
  ADX_PERIOD: 14,
  ADX_TREND_MIN: 25,
  ER_PERIOD: 14,
  ER_TREND_MIN: 0.3,
  /** 日足損切の ADX/ER から銘柄別閾値を自動調整 */
  TREND_AUTO: true,
  TREND_AUTO_MIN_SAMPLES: 2,
  TREND_AUTO_MAX_SAMPLES: 15,
  TREND_AUTO_ADX_MARGIN: 1,
  TREND_AUTO_ER_MARGIN: 0.02,
  TREND_AUTO_ADX_FLOOR: 18,
  TREND_AUTO_ER_FLOOR: 0.15,
  TREND_AUTO_MAX_STEP_ADX: 3,
  TREND_AUTO_MAX_STEP_ER: 0.05,
  INCLUDE_INDEX: false,
  EXCLUDE_HEAVY_FX: true,
  PAIR_SLEEP_MS: 800,
  RUN_INTERVAL_MS: 300000,

  /** F-FX トレンドモード（ペーパー） */
  TREND_MODE: false,
  TREND_PAPER_ONLY: true,
  TREND_MAX_OPEN_POSITIONS: 2,
  TREND_MAX_MARGIN_JPY_PER_PAIR: 50000,
  TREND_PAPER_JPY: 200000,
  TREND_REQUIRE_FILTER_BLOCK: true,
  /** 日足損切後にトレンドウォッチ（F-FX押し目待ち） */
  TREND_STOP_WATCH: true,
  TREND_STOP_WATCH_HOURS: 48,
  TREND_STOP_WATCH_ONLY: true,
  TREND_OLD_RANGE_STOP: true,
  SWING_STRENGTH_DAILY: 15,
  SWING_STRENGTH_1H: 7,
  TREND_MIN_CANDLES_DAILY: 80,
  TREND_MIN_CANDLES_1H: 120,
};

function num(envKey, fallback) {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function numAllowZero(envKey, fallback) {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function clampTpRatio_(ratio) {
  if (Number.isNaN(ratio) || ratio < 0.5) return 0.5;
  if (ratio > 1) return 1;
  return ratio;
}

function clampPartialStopRatio_(ratio) {
  if (Number.isNaN(ratio) || ratio <= 0) return 0.5;
  if (ratio >= 1) return 1;
  return ratio;
}

function boolEnv(envKey, fallback) {
  const raw = process.env[envKey];
  if (raw == null || String(raw).trim() === '') return fallback;
  return String(raw).toLowerCase() === 'true';
}

export function loadGsaxoConfig() {
  reloadRootEnv_();
  const dryRun = String(process.env.GSAXO_DRY_RUN ?? 'true').toLowerCase() !== 'false';
  return {
    dryRun,
    includeIndex: boolEnv('GSAXO_INCLUDE_INDEX', GSAXO_DEFAULTS.INCLUDE_INDEX),
    excludeHeavyFx: boolEnv('GSAXO_EXCLUDE_HEAVY_FX', GSAXO_DEFAULTS.EXCLUDE_HEAVY_FX),
    dailyLookback: num('GSAXO_DAILY_LOOKBACK', GSAXO_DEFAULTS.DAILY_LOOKBACK),
    dailyRangeMaxPct: num('GSAXO_DAILY_RANGE_MAX_PCT', GSAXO_DEFAULTS.DAILY_RANGE_MAX_PCT),
    h1Lookback: num('GSAXO_H1_LOOKBACK', GSAXO_DEFAULTS.H1_LOOKBACK),
    h1RangeMaxPct: num('GSAXO_H1_RANGE_MAX_PCT', GSAXO_DEFAULTS.H1_RANGE_MAX_PCT),
    h1InsideDailyBufferPct: num(
      'GSAXO_H1_INSIDE_DAILY_BUFFER_PCT',
      GSAXO_DEFAULTS.H1_INSIDE_DAILY_BUFFER_PCT
    ),
    touchPct: num('GSAXO_TOUCH_PCT', GSAXO_DEFAULTS.TOUCH_PCT),
    tpRatio: clampTpRatio_(num('GSAXO_TP_RATIO', GSAXO_DEFAULTS.TP_RATIO)),
    tpSpreadMult: Math.max(0, num('GSAXO_TP_SPREAD_MULT', GSAXO_DEFAULTS.TP_SPREAD_MULT)),
    partialStopRatio: clampPartialStopRatio_(
      num('GSAXO_PARTIAL_STOP_RATIO', GSAXO_DEFAULTS.PARTIAL_STOP_RATIO)
    ),
    maxMarginJpyPerPair: num('GSAXO_MAX_MARGIN_JPY_PER_PAIR', GSAXO_DEFAULTS.MAX_MARGIN_JPY_PER_PAIR),
    maxOpenPositions: num('GSAXO_MAX_OPEN_POSITIONS', GSAXO_DEFAULTS.MAX_OPEN_POSITIONS),
    dailyStopCooldownHours: numAllowZero(
      'GSAXO_DAILY_STOP_COOLDOWN_HOURS',
      GSAXO_DEFAULTS.DAILY_STOP_COOLDOWN_HOURS
    ),
    dailyStopBufferPct: numAllowZero(
      'GSAXO_DAILY_STOP_BUFFER_PCT',
      GSAXO_DEFAULTS.DAILY_STOP_BUFFER_PCT
    ),
    dailyStopConfirmBars: Math.max(
      1,
      Math.floor(
        numAllowZero('GSAXO_DAILY_STOP_CONFIRM_BARS', GSAXO_DEFAULTS.DAILY_STOP_CONFIRM_BARS)
      )
    ),
    h1StopBufferPct: numAllowZero(
      'GSAXO_H1_STOP_BUFFER_PCT',
      GSAXO_DEFAULTS.H1_STOP_BUFFER_PCT
    ),
    h1StopConfirmBars: Math.max(
      1,
      Math.floor(numAllowZero('GSAXO_H1_STOP_CONFIRM_BARS', GSAXO_DEFAULTS.H1_STOP_CONFIRM_BARS))
    ),
    h1StopSpreadMult: Math.max(
      0,
      num('GSAXO_H1_STOP_SPREAD_MULT', GSAXO_DEFAULTS.H1_STOP_SPREAD_MULT)
    ),
    volSpikeFilterEnabled: boolEnv('GSAXO_VOL_SPIKE_FILTER', GSAXO_DEFAULTS.VOL_SPIKE_FILTER),
    h1VolSpikeRatio: num('GSAXO_H1_VOL_SPIKE_RATIO', GSAXO_DEFAULTS.H1_VOL_SPIKE_RATIO),
    h1VolSpikeLookback: Math.max(
      2,
      Math.floor(numAllowZero('GSAXO_H1_VOL_SPIKE_LOOKBACK', GSAXO_DEFAULTS.H1_VOL_SPIKE_LOOKBACK))
    ),
    h1VolSpikeMinPct: numAllowZero(
      'GSAXO_H1_VOL_SPIKE_MIN_PCT',
      GSAXO_DEFAULTS.H1_VOL_SPIKE_MIN_PCT
    ),
    trendFilterEnabled: boolEnv('GSAXO_TREND_FILTER', GSAXO_DEFAULTS.TREND_FILTER),
    adxPeriod: num('GSAXO_ADX_PERIOD', GSAXO_DEFAULTS.ADX_PERIOD),
    adxTrendMin: num('GSAXO_ADX_TREND_MIN', GSAXO_DEFAULTS.ADX_TREND_MIN),
    erPeriod: num('GSAXO_ER_PERIOD', GSAXO_DEFAULTS.ER_PERIOD),
    erTrendMin: num('GSAXO_ER_TREND_MIN', GSAXO_DEFAULTS.ER_TREND_MIN),
    trendPairOverrides: parseTrendPairOverrides_(process.env.GSAXO_TREND_PAIR_OVERRIDES),
    trendAutoEnabled: boolEnv('GSAXO_TREND_AUTO', GSAXO_DEFAULTS.TREND_AUTO),
    trendAutoMinSamples: num('GSAXO_TREND_AUTO_MIN_SAMPLES', GSAXO_DEFAULTS.TREND_AUTO_MIN_SAMPLES),
    trendAutoMaxSamples: num('GSAXO_TREND_AUTO_MAX_SAMPLES', GSAXO_DEFAULTS.TREND_AUTO_MAX_SAMPLES),
    trendAutoAdxMargin: num('GSAXO_TREND_AUTO_ADX_MARGIN', GSAXO_DEFAULTS.TREND_AUTO_ADX_MARGIN),
    trendAutoErMargin: num('GSAXO_TREND_AUTO_ER_MARGIN', GSAXO_DEFAULTS.TREND_AUTO_ER_MARGIN),
    trendAutoAdxFloor: num('GSAXO_TREND_AUTO_ADX_FLOOR', GSAXO_DEFAULTS.TREND_AUTO_ADX_FLOOR),
    trendAutoErFloor: num('GSAXO_TREND_AUTO_ER_FLOOR', GSAXO_DEFAULTS.TREND_AUTO_ER_FLOOR),
    trendAutoMaxStepAdx: num('GSAXO_TREND_AUTO_MAX_STEP_ADX', GSAXO_DEFAULTS.TREND_AUTO_MAX_STEP_ADX),
    trendAutoMaxStepEr: num('GSAXO_TREND_AUTO_MAX_STEP_ER', GSAXO_DEFAULTS.TREND_AUTO_MAX_STEP_ER),
    paperJpyDefault: num('GSAXO_PAPER_JPY', GSAXO_DEFAULTS.PAPER_JPY_DEFAULT),
    paperFeeRate: GSAXO_DEFAULTS.PAPER_FEE_RATE,
    marginRate: num('GSAXO_MARGIN_RATE', GSAXO_DEFAULTS.MARGIN_RATE),
    usdJpyRef: num('GSAXO_USD_JPY_REF', GSAXO_DEFAULTS.USD_JPY_REF),
    minCandles1h: GSAXO_DEFAULTS.MIN_CANDLES_1H,
    minCandles5m: GSAXO_DEFAULTS.MIN_CANDLES_5M,
    pairSleepMs: GSAXO_DEFAULTS.PAIR_SLEEP_MS,
    runIntervalMs: num('GSAXO_RUN_INTERVAL_MS', GSAXO_DEFAULTS.RUN_INTERVAL_MS),
    leaguePauseNew: false,

    trendModeEnabled: boolEnv('GSAXO_TREND_MODE', GSAXO_DEFAULTS.TREND_MODE),
    trendPaperOnly: boolEnv('GSAXO_TREND_PAPER_ONLY', GSAXO_DEFAULTS.TREND_PAPER_ONLY),
    trendMaxOpenPositions: num(
      'GSAXO_TREND_MAX_OPEN_POSITIONS',
      GSAXO_DEFAULTS.TREND_MAX_OPEN_POSITIONS
    ),
    trendMaxMarginJpyPerPair: num(
      'GSAXO_TREND_MAX_MARGIN_JPY_PER_PAIR',
      GSAXO_DEFAULTS.TREND_MAX_MARGIN_JPY_PER_PAIR
    ),
    trendPaperJpy: num('GSAXO_TREND_PAPER_JPY', GSAXO_DEFAULTS.TREND_PAPER_JPY),
    trendRequireFilterBlock: boolEnv(
      'GSAXO_TREND_REQUIRE_FILTER_BLOCK',
      GSAXO_DEFAULTS.TREND_REQUIRE_FILTER_BLOCK
    ),
    trendStopWatchEnabled: boolEnv('GSAXO_TREND_STOP_WATCH', GSAXO_DEFAULTS.TREND_STOP_WATCH),
    trendStopWatchHours: numAllowZero(
      'GSAXO_TREND_STOP_WATCH_HOURS',
      GSAXO_DEFAULTS.TREND_STOP_WATCH_HOURS
    ),
    trendStopWatchOnly: boolEnv('GSAXO_TREND_STOP_WATCH_ONLY', GSAXO_DEFAULTS.TREND_STOP_WATCH_ONLY),
    trendOldRangeStop: boolEnv('GSAXO_TREND_OLD_RANGE_STOP', GSAXO_DEFAULTS.TREND_OLD_RANGE_STOP),
    swingStrengthDaily: num('GSAXO_SWING_STRENGTH_DAILY', GSAXO_DEFAULTS.SWING_STRENGTH_DAILY),
    swingStrength1h: num('GSAXO_SWING_STRENGTH_1H', GSAXO_DEFAULTS.SWING_STRENGTH_1H),
    trendMinCandlesDaily: num('GSAXO_TREND_MIN_CANDLES_DAILY', GSAXO_DEFAULTS.TREND_MIN_CANDLES_DAILY),
    trendMinCandles1h: num('GSAXO_TREND_MIN_CANDLES_1H', GSAXO_DEFAULTS.TREND_MIN_CANDLES_1H),
  };
}
