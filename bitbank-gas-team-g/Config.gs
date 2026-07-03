/**
 * チームG: bitbank レンジ（買いのみ・複数通貨）
 * 日足レンジ + 1Hレンジ（日足内）+ 5分エントリー
 */
var G_CONFIG = {
  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',

  /** 日足レンジ判定: 過去N日の高安幅%上限 */
  DAILY_LOOKBACK: 20,
  DAILY_RANGE_MAX_PCT: 12,

  /** 1Hレンジ: 過去N本の高安幅%上限 */
  H1_LOOKBACK: 48,
  H1_RANGE_MAX_PCT: 4,
  /** 1H高安が日足レンジ内に収まる許容（%） */
  H1_INSIDE_DAILY_BUFFER_PCT: 0.5,

  /** 1H上下限付近とみなすタッチ幅（%） */
  TOUCH_PCT: 0.12,
  /** 1Hレンジ幅に対する利確位置（0.5=中間, 0.667=2/3, 1.0=反対端） */
  TP_RATIO: 0.55,
  /** 1H損切時に決済する比率（残りは日足損切） */
  PARTIAL_STOP_RATIO: 0.5,

  MIN_CANDLES_1H: 55,
  MIN_CANDLES_5M: 3,
  CANDLE_FETCH_MAX_DAYS: 5,

  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0012,
  /** 1銘柄あたりの紙トレ最大投入（円） */
  MAX_JPY_PER_PAIR: 50000,
  /** 同時保有銘柄数上限 */
  MAX_OPEN_POSITIONS: 7,

  /** 検証停止（既定オン）。再開: スクリプトプロパティ VALIDATION_PAUSED=false */
  VALIDATION_PAUSED_DEFAULT: true,
};

function gIsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return G_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

function gClampPartialStopRatio_(ratio) {
  if (isNaN(ratio) || ratio <= 0) return 0.5;
  if (ratio >= 1) return 1;
  return ratio;
}

function gClampTpRatio_(ratio) {
  if (isNaN(ratio) || ratio < 0.5) return 0.5;
  if (ratio > 1) return 1;
  return ratio;
}

function gResolveMaxOpenPositions_(props) {
  var raw = props.getProperty('G_MAX_OPEN_POSITIONS');
  var n = Number(raw || G_CONFIG.MAX_OPEN_POSITIONS);
  if (n === 4) {
    n = 7;
    props.setProperty('G_MAX_OPEN_POSITIONS', '7');
  }
  return n;
}

function gGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    dailyLookback: Number(p.getProperty('G_DAILY_LOOKBACK') || G_CONFIG.DAILY_LOOKBACK),
    dailyRangeMaxPct: Number(p.getProperty('G_DAILY_RANGE_MAX_PCT') || G_CONFIG.DAILY_RANGE_MAX_PCT),
    h1Lookback: Number(p.getProperty('G_H1_LOOKBACK') || G_CONFIG.H1_LOOKBACK),
    h1RangeMaxPct: Number(p.getProperty('G_H1_RANGE_MAX_PCT') || G_CONFIG.H1_RANGE_MAX_PCT),
    h1InsideDailyBufferPct: Number(
      p.getProperty('G_H1_INSIDE_DAILY_BUFFER_PCT') || G_CONFIG.H1_INSIDE_DAILY_BUFFER_PCT
    ),
    touchPct: Number(p.getProperty('G_TOUCH_PCT') || G_CONFIG.TOUCH_PCT),
    tpRatio: gClampTpRatio_(Number(p.getProperty('G_TP_RATIO') || G_CONFIG.TP_RATIO)),
    partialStopRatio: gClampPartialStopRatio_(
      Number(p.getProperty('G_PARTIAL_STOP_RATIO') || G_CONFIG.PARTIAL_STOP_RATIO)
    ),
    maxJpyPerPair: Number(p.getProperty('G_MAX_JPY_PER_PAIR') || G_CONFIG.MAX_JPY_PER_PAIR),
    maxOpenPositions: gResolveMaxOpenPositions_(p),
    paperJpyDefault: Number(p.getProperty('PAPER_JPY') || G_CONFIG.PAPER_JPY_DEFAULT),
  };
  return metaLeagueApplyToConfig_('G', cfg, {
    sizeKeys: ['maxJpyPerPair'],
    tpRatioKey: 'tpRatio',
    touchPctKey: 'touchPct',
  });
}

function gLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('G_STATE');
  if (!raw) {
    return {
      pairs: {},
      paperWallet: null,
      lastRunAt: null,
      lastError: null,
    };
  }
  try {
    var s = JSON.parse(raw);
    if (!s.pairs) s.pairs = {};
    return s;
  } catch (e) {
    return { pairs: {}, paperWallet: null };
  }
}

function gSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('G_STATE', JSON.stringify(state));
}

function gGetPairState_(state, pair) {
  if (!state.pairs[pair]) {
    state.pairs[pair] = {
      position: null,
      lastSignal: '',
      lastDailyNote: '',
      lastH1Note: '',
      lastLogSnapshot: null,
    };
  }
  return state.pairs[pair];
}

function gLog_(msg) {
  var line =
    '[G][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('G_LOG') || '';
  var next = (line + '\n' + prev).slice(0, 8000);
  PropertiesService.getScriptProperties().setProperty('G_LOG', next);
}

function gCountOpenPositions_(state) {
  var n = 0;
  var pairs = state.pairs || {};
  Object.keys(pairs).forEach(function (pair) {
    if (pairs[pair].position && pairs[pair].position.amount > 0) n += 1;
  });
  return n;
}
