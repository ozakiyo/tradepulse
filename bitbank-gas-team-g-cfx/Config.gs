/**
 * チームG-CFX: レンジ（ロング・ショート）— GMO暗号資産FX
 */
var GCFX_CONFIG = {
  DAILY_LOOKBACK: 20,
  DAILY_RANGE_MAX_PCT: 12,
  H1_LOOKBACK: 48,
  H1_RANGE_MAX_PCT: 4,
  H1_INSIDE_DAILY_BUFFER_PCT: 0.5,
  TOUCH_PCT: 0.12,
  /** 1Hレンジ幅に対する利確位置（0.5=中間, 0.667=2/3, 1.0=反対端） */
  TP_RATIO: 0.55,
  /** 1H損切時に決済する比率（残りは日足損切） */
  PARTIAL_STOP_RATIO: 0.5,

  MIN_CANDLES_1H: 55,
  MIN_CANDLES_5M: 12,

  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0008,
  LEVERAGE_DEFAULT: 4,

  MAX_MARGIN_JPY_PER_PAIR: 50000,
  MAX_OPEN_POSITIONS: 7,

  /** 運用停止（既定オン）。暗号実践は TEAM-J へ。再開: VALIDATION_PAUSED=false */
  VALIDATION_PAUSED_DEFAULT: true,
};

function gcfxIsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return GCFX_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() === 'true';
}

function gcfxClampPartialStopRatio_(ratio) {
  if (isNaN(ratio) || ratio <= 0) return 0.5;
  if (ratio >= 1) return 1;
  return ratio;
}

function gcfxClampTpRatio_(ratio) {
  if (isNaN(ratio) || ratio < 0.5) return 0.5;
  if (ratio > 1) return 1;
  return ratio;
}

function gcfxResolveMaxOpenPositions_(props) {
  var raw = props.getProperty('GCFX_MAX_OPEN_POSITIONS');
  var n = Number(raw || GCFX_CONFIG.MAX_OPEN_POSITIONS);
  if (n === 4) {
    n = 7;
    props.setProperty('GCFX_MAX_OPEN_POSITIONS', '7');
  }
  return n;
}

function gcfxGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    dailyLookback: Number(p.getProperty('GCFX_DAILY_LOOKBACK') || GCFX_CONFIG.DAILY_LOOKBACK),
    dailyRangeMaxPct: Number(p.getProperty('GCFX_DAILY_RANGE_MAX_PCT') || GCFX_CONFIG.DAILY_RANGE_MAX_PCT),
    h1Lookback: Number(p.getProperty('GCFX_H1_LOOKBACK') || GCFX_CONFIG.H1_LOOKBACK),
    h1RangeMaxPct: Number(p.getProperty('GCFX_H1_RANGE_MAX_PCT') || GCFX_CONFIG.H1_RANGE_MAX_PCT),
    h1InsideDailyBufferPct: Number(
      p.getProperty('GCFX_H1_INSIDE_DAILY_BUFFER_PCT') || GCFX_CONFIG.H1_INSIDE_DAILY_BUFFER_PCT
    ),
    touchPct: Number(p.getProperty('GCFX_TOUCH_PCT') || GCFX_CONFIG.TOUCH_PCT),
    tpRatio: gcfxClampTpRatio_(Number(p.getProperty('GCFX_TP_RATIO') || GCFX_CONFIG.TP_RATIO)),
    partialStopRatio: gcfxClampPartialStopRatio_(
      Number(p.getProperty('GCFX_PARTIAL_STOP_RATIO') || GCFX_CONFIG.PARTIAL_STOP_RATIO)
    ),
    maxMarginJpyPerPair: Number(p.getProperty('GCFX_MAX_MARGIN_JPY_PER_PAIR') || GCFX_CONFIG.MAX_MARGIN_JPY_PER_PAIR),
    maxOpenPositions: gcfxResolveMaxOpenPositions_(p),
    paperJpyDefault: Number(p.getProperty('PAPER_JPY') || GCFX_CONFIG.PAPER_JPY_DEFAULT),
    leverage: Number(p.getProperty('GCFX_LEVERAGE') || GCFX_CONFIG.LEVERAGE_DEFAULT),
    minFundMode: String(p.getProperty('MIN_FUND_MODE') || 'false').toLowerCase() === 'true',
  };
  return metaLeagueApplyToConfig_('G-CFX', cfg, {
    sizeKeys: ['maxMarginJpyPerPair'],
    tpRatioKey: 'tpRatio',
    touchPctKey: 'touchPct',
  });
}

function gcfxLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GCFX_STATE');
  if (!raw) {
    return { pairs: {}, paperWallet: null, liveBaseline: null, lastRunAt: null, lastError: null };
  }
  try {
    var s = JSON.parse(raw);
    if (!s.pairs) s.pairs = {};
    return s;
  } catch (e) {
    return { pairs: {}, paperWallet: null };
  }
}

function gcfxSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('GCFX_STATE', JSON.stringify(state));
}

function gcfxGetPairState_(state, pairId) {
  if (!state.pairs[pairId]) {
    state.pairs[pairId] = {
      position: null,
      lastSignal: '',
      lastDailyNote: '',
      lastH1Note: '',
      lastLogSnapshot: null,
    };
  }
  return state.pairs[pairId];
}

function gcfxLog_(msg) {
  var line =
    '[G-CFX][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('GCFX_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('GCFX_LOG', (line + '\n' + prev).slice(0, 8000));
}

function gcfxCountOpenPositions_(state) {
  var n = 0;
  Object.keys(state.pairs || {}).forEach(function (pairId) {
    var pos = state.pairs[pairId].position;
    if (pos && pos.side && pos.units > 0) n += 1;
  });
  return n;
}
