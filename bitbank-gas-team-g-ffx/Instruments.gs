/**
 * GMO外国為替FX — G-FX と同じ10通貨
 * API 最小新規 10,000通貨 / defaultUnits 20,000（半分損切用）
 */
var GFFX_DEFAULT_INST = {
  label: '???',
  gmoSymbol: '',
  quoteJpy: false,
  minUnits: 10000,
  unitDecimals: 0,
  defaultUnits: 20000,
  priceDecimals: 5,
};

var GFFX_INSTRUMENTS = {
  eur_usd: {
    label: 'EUR/USD',
    gmoSymbol: 'EUR_USD',
    quoteJpy: false,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 5,
  },
  usd_jpy: {
    label: 'USD/JPY',
    gmoSymbol: 'USD_JPY',
    quoteJpy: true,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 3,
  },
  usd_chf: {
    label: 'USD/CHF',
    gmoSymbol: 'USD_CHF',
    quoteJpy: false,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 5,
  },
  aud_usd: {
    label: 'AUD/USD',
    gmoSymbol: 'AUD_USD',
    quoteJpy: false,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 5,
  },
  nzd_usd: {
    label: 'NZD/USD',
    gmoSymbol: 'NZD_USD',
    quoteJpy: false,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 5,
  },
  eur_gbp: {
    label: 'EUR/GBP',
    gmoSymbol: 'EUR_GBP',
    quoteJpy: false,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 5,
  },
  eur_chf: {
    label: 'EUR/CHF',
    gmoSymbol: 'EUR_CHF',
    quoteJpy: false,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 5,
  },
  usd_cad: {
    label: 'USD/CAD',
    gmoSymbol: 'USD_CAD',
    quoteJpy: false,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 5,
  },
  eur_jpy: {
    label: 'EUR/JPY',
    gmoSymbol: 'EUR_JPY',
    quoteJpy: true,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 3,
  },
  gbp_usd: {
    label: 'GBP/USD',
    gmoSymbol: 'GBP_USD',
    quoteJpy: false,
    minUnits: 10000,
    unitDecimals: 0,
    defaultUnits: 20000,
    priceDecimals: 5,
  },
};

function gffxAllPairIds_() {
  return Object.keys(GFFX_INSTRUMENTS);
}

function gffxGetActivePairs_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GFFX_PAIRS');
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(function (s) {
        return s && GFFX_INSTRUMENTS[s];
      });
  }
  return gffxAllPairIds_();
}

function gffxGetInstrument_(pairId) {
  return GFFX_INSTRUMENTS[pairId] || GFFX_DEFAULT_INST;
}

function gffxGetGmoSymbol_(pairId) {
  return gffxGetInstrument_(pairId).gmoSymbol;
}

function gffxPairIdFromLabel_(label) {
  var keys = Object.keys(GFFX_INSTRUMENTS);
  for (var i = 0; i < keys.length; i++) {
    if (GFFX_INSTRUMENTS[keys[i]].label === String(label || '').trim()) return keys[i];
  }
  return null;
}

function gffxPairIdFromSymbol_(symbol) {
  var s = String(symbol || '').trim();
  if (!s) return null;
  var fromLabel = gffxPairIdFromLabel_(s);
  if (fromLabel) return fromLabel;
  var key = s.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
  if (GFFX_INSTRUMENTS[key]) return key;
  var gmoKey = s.toUpperCase().replace('/', '_');
  var keys = Object.keys(GFFX_INSTRUMENTS);
  for (var i = 0; i < keys.length; i++) {
    if (GFFX_INSTRUMENTS[keys[i]].gmoSymbol === gmoKey) return keys[i];
  }
  return null;
}

function gffxFormatUnits_(pairId, units) {
  var inst = gffxGetInstrument_(pairId);
  var pow = Math.pow(10, inst.unitDecimals);
  return Math.floor(units * pow) / pow;
}

function gffxFormatUnitsStr_(pairId, units) {
  var inst = gffxGetInstrument_(pairId);
  return gffxFormatUnits_(pairId, units).toFixed(inst.unitDecimals);
}

function gffxRoundPrice_(pairId, price) {
  var inst = gffxGetInstrument_(pairId);
  var pow = Math.pow(10, inst.priceDecimals);
  return Math.round(price * pow) / pow;
}

/** 本番と同じ defaultUnits（min×2）— 半分損切対応 */
function gffxResolveOrderUnits_(pairId, cfg) {
  var inst = gffxGetInstrument_(pairId);
  return inst.defaultUnits;
}

function gffxCalcPartialCloseUnits_(pairId, totalUnits, ratio) {
  var inst = gffxGetInstrument_(pairId);
  var total = gffxFormatUnits_(pairId, totalUnits);
  var closeUnits = gffxFormatUnits_(pairId, total * ratio);
  var remainUnits = gffxFormatUnits_(pairId, total - closeUnits);
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
