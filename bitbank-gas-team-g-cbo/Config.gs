/**
 * チームG-CBO: 4Hブレイクアウト（パーフェクトオーダー）— GMO暗号資産FX
 */
var GCBO_CONFIG = {
  EMA_FAST: 10,
  EMA_MID: 20,
  EMA_SLOW: 50,
  SLOPE_BARS: 3,
  CONSOLIDATION_BARS: 10,
  CONSOLIDATION_MAX_PCT: 6,
  BREAKOUT_BODY_MULT: 1.2,
  PARTIAL_TP_BARS: 5,
  PARTIAL_TP_RATIO: 0.5,
  STOP_BUFFER_PCT: 0.02,

  MIN_CANDLES_4H: 55,
  MIN_CANDLES_1H: 220,

  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0008,
  LEVERAGE_DEFAULT: 4,

  MAX_MARGIN_JPY_PER_PAIR: 50000,
  MAX_OPEN_POSITIONS: 7,
};

function gcboClampPartialTpRatio_(ratio) {
  if (isNaN(ratio) || ratio <= 0) return 0.5;
  if (ratio >= 1) return 1;
  return ratio;
}

/** META リーグ互換 */
function gcboClampTpRatio_(ratio) {
  return gcboClampPartialTpRatio_(ratio);
}

function gcboResolveMaxOpenPositions_(props) {
  var raw = props.getProperty('GCBO_MAX_OPEN_POSITIONS');
  var n = Number(raw || GCBO_CONFIG.MAX_OPEN_POSITIONS);
  if (n === 4) {
    n = 7;
    props.setProperty('GCBO_MAX_OPEN_POSITIONS', '7');
  }
  return n;
}

function gcboGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    emaFast: Number(p.getProperty('GCBO_EMA_FAST') || GCBO_CONFIG.EMA_FAST),
    emaMid: Number(p.getProperty('GCBO_EMA_MID') || GCBO_CONFIG.EMA_MID),
    emaSlow: Number(p.getProperty('GCBO_EMA_SLOW') || GCBO_CONFIG.EMA_SLOW),
    slopeBars: Number(p.getProperty('GCBO_SLOPE_BARS') || GCBO_CONFIG.SLOPE_BARS),
    consolidationBars: Number(p.getProperty('GCBO_CONSOLIDATION_BARS') || GCBO_CONFIG.CONSOLIDATION_BARS),
    consolidationMaxPct: Number(
      p.getProperty('GCBO_CONSOLIDATION_MAX_PCT') || GCBO_CONFIG.CONSOLIDATION_MAX_PCT
    ),
    breakoutBodyMult: Number(p.getProperty('GCBO_BREAKOUT_BODY_MULT') || GCBO_CONFIG.BREAKOUT_BODY_MULT),
    partialTpBars: Number(p.getProperty('GCBO_PARTIAL_TP_BARS') || GCBO_CONFIG.PARTIAL_TP_BARS),
    partialTpRatio: gcboClampPartialTpRatio_(
      Number(p.getProperty('GCBO_PARTIAL_TP_RATIO') || GCBO_CONFIG.PARTIAL_TP_RATIO)
    ),
    stopBufferPct: Number(p.getProperty('GCBO_STOP_BUFFER_PCT') || GCBO_CONFIG.STOP_BUFFER_PCT),
    minCandles4h: Number(p.getProperty('GCBO_MIN_CANDLES_4H') || GCBO_CONFIG.MIN_CANDLES_4H),
    minCandles1h: Number(p.getProperty('GCBO_MIN_CANDLES_1H') || GCBO_CONFIG.MIN_CANDLES_1H),
    maxMarginJpyPerPair: Number(p.getProperty('GCBO_MAX_MARGIN_JPY_PER_PAIR') || GCBO_CONFIG.MAX_MARGIN_JPY_PER_PAIR),
    maxOpenPositions: gcboResolveMaxOpenPositions_(p),
    paperJpyDefault: Number(p.getProperty('PAPER_JPY') || GCBO_CONFIG.PAPER_JPY_DEFAULT),
    leverage: Number(p.getProperty('GCBO_LEVERAGE') || GCBO_CONFIG.LEVERAGE_DEFAULT),
    minFundMode: String(p.getProperty('MIN_FUND_MODE') || 'false').toLowerCase() === 'true',
  };
  return metaLeagueApplyToConfig_('G-CBO', cfg, {
    sizeKeys: ['maxMarginJpyPerPair'],
    tpRatioKey: 'partialTpRatio',
  });
}

function gcboLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GCBO_STATE');
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

function gcboSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('GCBO_STATE', JSON.stringify(state));
}

function gcboGetPairState_(state, pairId) {
  if (!state.pairs[pairId]) {
    state.pairs[pairId] = {
      position: null,
      lastSignal: '',
      lastSetupNote: '',
      lastDailyNote: '',
      lastH1Note: '',
      lastEntry4hTime: null,
      lastLogSnapshot: null,
    };
  }
  return state.pairs[pairId];
}

function gcboLog_(msg) {
  var line =
    '[G-CBO][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('GCBO_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('GCBO_LOG', (line + '\n' + prev).slice(0, 8000));
}

function gcboCountOpenPositions_(state) {
  var n = 0;
  Object.keys(state.pairs || {}).forEach(function (pairId) {
    var pos = state.pairs[pairId].position;
    if (pos && pos.side && pos.units > 0) n += 1;
  });
  return n;
}
