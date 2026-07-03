/**
 * GMO暗号資産FX — レンジ向け10銘柄（円建てレバレッジ）
 * gmoSymbol = GMO API の symbol（例: BTC_JPY）
 * defaultUnits は minUnits の2倍以上（1H半分損切用）
 */
var GCFX_DEFAULT_INST = {
  label: '???',
  gmoSymbol: '',
  quoteJpy: true,
  minUnits: 0.01,
  unitDecimals: 2,
  defaultUnits: 0.02,
  priceDecimals: 0,
};

var GCFX_INSTRUMENTS = {
  btc_jpy: {
    label: 'BTC/JPY',
    gmoSymbol: 'BTC_JPY',
    quoteJpy: true,
    minUnits: 0.001,
    unitDecimals: 3,
    defaultUnits: 0.002,
    priceDecimals: 0,
  },
  eth_jpy: {
    label: 'ETH/JPY',
    gmoSymbol: 'ETH_JPY',
    quoteJpy: true,
    minUnits: 0.01,
    unitDecimals: 2,
    defaultUnits: 0.02,
    priceDecimals: 0,
  },
  xrp_jpy: {
    label: 'XRP/JPY',
    gmoSymbol: 'XRP_JPY',
    quoteJpy: true,
    minUnits: 10,
    unitDecimals: 0,
    defaultUnits: 20,
    priceDecimals: 3,
  },
  sol_jpy: {
    label: 'SOL/JPY',
    gmoSymbol: 'SOL_JPY',
    quoteJpy: true,
    minUnits: 0.1,
    unitDecimals: 1,
    defaultUnits: 0.2,
    priceDecimals: 0,
  },
  doge_jpy: {
    label: 'DOGE/JPY',
    gmoSymbol: 'DOGE_JPY',
    quoteJpy: true,
    minUnits: 10,
    unitDecimals: 0,
    defaultUnits: 20,
    priceDecimals: 4,
  },
  link_jpy: {
    label: 'LINK/JPY',
    gmoSymbol: 'LINK_JPY',
    quoteJpy: true,
    minUnits: 1,
    unitDecimals: 0,
    defaultUnits: 2,
    priceDecimals: 0,
  },
  ada_jpy: {
    label: 'ADA/JPY',
    gmoSymbol: 'ADA_JPY',
    quoteJpy: true,
    minUnits: 10,
    unitDecimals: 0,
    defaultUnits: 20,
    priceDecimals: 4,
  },
  ltc_jpy: {
    label: 'LTC/JPY',
    gmoSymbol: 'LTC_JPY',
    quoteJpy: true,
    minUnits: 1,
    unitDecimals: 0,
    defaultUnits: 2,
    priceDecimals: 0,
  },
  sui_jpy: {
    label: 'SUI/JPY',
    gmoSymbol: 'SUI_JPY',
    quoteJpy: true,
    minUnits: 1,
    unitDecimals: 0,
    defaultUnits: 2,
    priceDecimals: 3,
  },
  dot_jpy: {
    label: 'DOT/JPY',
    gmoSymbol: 'DOT_JPY',
    quoteJpy: true,
    minUnits: 1,
    unitDecimals: 0,
    defaultUnits: 2,
    priceDecimals: 0,
  },
};

function gcfxAllPairIds_() {
  return Object.keys(GCFX_INSTRUMENTS);
}

function gcfxGetActivePairs_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GCFX_PAIRS');
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(function (s) {
        return s && GCFX_INSTRUMENTS[s];
      });
  }
  return gcfxAllPairIds_();
}

/** 全銘柄探索モード: UrlFetch 節約のため数銘柄ずつローテ（建玉保有銘柄は常に含む） */
function gcfxSelectPairsForRun_(allPairs, state) {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('MICRO_LIVE_SCAN_MODE') !== 'true' || allPairs.length <= 3) {
    return allPairs;
  }
  var batchSize = Number(p.getProperty('GCFX_SCAN_BATCH_SIZE') || 3);
  if (isNaN(batchSize) || batchSize < 1) batchSize = 3;

  var priority = [];
  allPairs.forEach(function (pairId) {
    var ps = state.pairs && state.pairs[pairId];
    if (ps && ps.position && ps.position.side && ps.position.units > 0) {
      priority.push(pairId);
    }
  });

  var runIdx = Number(p.getProperty('GCFX_SCAN_RUN_INDEX') || 0);
  var rotatable = allPairs.filter(function (id) {
    return priority.indexOf(id) < 0;
  });
  var batch = priority.slice();
  var added = 0;
  while (batch.length < batchSize && rotatable.length > 0) {
    batch.push(rotatable[(runIdx + added) % rotatable.length]);
    added += 1;
  }
  p.setProperty('GCFX_SCAN_RUN_INDEX', String(runIdx + 1));
  if (batch.length < allPairs.length) {
    gcfxLog_('scan batch ' + batch.length + '/' + allPairs.length + ' pairs=' + batch.join(','));
  }
  return batch;
}

function gcfxGetInstrument_(pairId) {
  return GCFX_INSTRUMENTS[pairId] || GCFX_DEFAULT_INST;
}

function gcfxGetGmoSymbol_(pairId) {
  var sym = gcfxGetInstrument_(pairId).gmoSymbol;
  return typeof gmoNormalizeLeverageSymbol_ === 'function' ? gmoNormalizeLeverageSymbol_(sym) : sym;
}

function gcfxPairIdFromLabel_(label) {
  var keys = Object.keys(GCFX_INSTRUMENTS);
  for (var i = 0; i < keys.length; i++) {
    if (GCFX_INSTRUMENTS[keys[i]].label === String(label || '').trim()) return keys[i];
  }
  return null;
}

function gcfxPairIdFromSymbol_(symbol) {
  var s = String(symbol || '').trim();
  if (!s) return null;
  var fromLabel = gcfxPairIdFromLabel_(s);
  if (fromLabel) return fromLabel;
  var key = s.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
  if (GCFX_INSTRUMENTS[key]) return key;
  var gmoKey = s.toUpperCase().replace('/', '_');
  var keys = Object.keys(GCFX_INSTRUMENTS);
  for (var i = 0; i < keys.length; i++) {
    if (GCFX_INSTRUMENTS[keys[i]].gmoSymbol === gmoKey) return keys[i];
  }
  return null;
}

function gcfxFormatUnits_(pairId, units) {
  var inst = gcfxGetInstrument_(pairId);
  var pow = Math.pow(10, inst.unitDecimals);
  return Math.floor(units * pow) / pow;
}

function gcfxFormatUnitsStr_(pairId, units) {
  var inst = gcfxGetInstrument_(pairId);
  return gcfxFormatUnits_(pairId, units).toFixed(inst.unitDecimals);
}

function gcfxRoundPrice_(pairId, price) {
  var inst = gcfxGetInstrument_(pairId);
  var pow = Math.pow(10, inst.priceDecimals);
  return Math.round(price * pow) / pow;
}

/** 本番と同じ defaultUnits（min×2）— 部分利確対応 */
function gcfxResolveOrderUnits_(pairId, cfg) {
  var inst = gcfxGetInstrument_(pairId);
  return inst.defaultUnits;
}

function gcfxCalcPartialCloseUnits_(pairId, totalUnits, ratio) {
  var inst = gcfxGetInstrument_(pairId);
  var total = gcfxFormatUnits_(pairId, totalUnits);
  var closeUnits = gcfxFormatUnits_(pairId, total * ratio);
  var remainUnits = gcfxFormatUnits_(pairId, total - closeUnits);
  if (closeUnits < inst.minUnits || remainUnits < inst.minUnits) {
    return {
      canSplit: false,
      closeUnits: total,
      remainUnits: 0,
    };
  }
  return {
    canSplit: true,
    closeUnits: closeUnits,
    remainUnits: remainUnits,
  };
}
