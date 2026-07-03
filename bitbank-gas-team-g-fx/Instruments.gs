/**
 * レンジ相場になりやすい10通貨（メジャー＋クロス）
 * yahoo = Yahoo Finance シンボル
 * quoteJpy: true なら損益を (価格差)×units で円換算（USDJPY/EURJPY等）
 */
var GFX_DEFAULT_INST = {
  label: '???',
  yahoo: '',
  quoteJpy: false,
  minUnits: 1000,
  unitDecimals: 0,
  defaultUnits: 2000,
  priceDecimals: 5,
};

var GFX_INSTRUMENTS = {
  eur_usd: {
    label: 'EUR/USD',
    yahoo: 'EURUSD=X',
    quoteJpy: false,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 5,
  },
  usd_jpy: {
    label: 'USD/JPY',
    yahoo: 'USDJPY=X',
    quoteJpy: true,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 3,
  },
  usd_chf: {
    label: 'USD/CHF',
    yahoo: 'USDCHF=X',
    quoteJpy: false,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 5,
  },
  aud_usd: {
    label: 'AUD/USD',
    yahoo: 'AUDUSD=X',
    quoteJpy: false,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 5,
  },
  nzd_usd: {
    label: 'NZD/USD',
    yahoo: 'NZDUSD=X',
    quoteJpy: false,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 5,
  },
  eur_gbp: {
    label: 'EUR/GBP',
    yahoo: 'EURGBP=X',
    quoteJpy: false,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 5,
  },
  eur_chf: {
    label: 'EUR/CHF',
    yahoo: 'EURCHF=X',
    quoteJpy: false,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 5,
  },
  usd_cad: {
    label: 'USD/CAD',
    yahoo: 'USDCAD=X',
    quoteJpy: false,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 5,
  },
  eur_jpy: {
    label: 'EUR/JPY',
    yahoo: 'EURJPY=X',
    quoteJpy: true,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 3,
  },
  gbp_usd: {
    label: 'GBP/USD',
    yahoo: 'GBPUSD=X',
    quoteJpy: false,
    minUnits: 1000,
    unitDecimals: 0,
    defaultUnits: 2000,
    priceDecimals: 5,
  },
};

function gfxAllPairIds_() {
  return Object.keys(GFX_INSTRUMENTS);
}

function gfxGetActivePairs_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GFX_PAIRS');
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(function (s) {
        return s && GFX_INSTRUMENTS[s];
      });
  }
  return gfxAllPairIds_();
}

function gfxGetInstrument_(pairId) {
  return GFX_INSTRUMENTS[pairId] || GFX_DEFAULT_INST;
}

function gfxPairIdFromLabel_(label) {
  var keys = Object.keys(GFX_INSTRUMENTS);
  for (var i = 0; i < keys.length; i++) {
    if (GFX_INSTRUMENTS[keys[i]].label === String(label || '').trim()) return keys[i];
  }
  return null;
}

/** 売買履歴の銘柄列（表示名 eur_usd / EUR/USD 両対応） */
function gfxPairIdFromSymbol_(symbol) {
  var s = String(symbol || '').trim();
  if (!s) return null;
  var fromLabel = gfxPairIdFromLabel_(s);
  if (fromLabel) return fromLabel;
  var key = s.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
  if (GFX_INSTRUMENTS[key]) return key;
  return null;
}

function gfxFormatUnits_(pairId, units) {
  var inst = gfxGetInstrument_(pairId);
  var pow = Math.pow(10, inst.unitDecimals);
  return Math.floor(units * pow) / pow;
}

function gfxRoundPrice_(pairId, price) {
  var inst = gfxGetInstrument_(pairId);
  var pow = Math.pow(10, inst.priceDecimals);
  return Math.round(price * pow) / pow;
}

/** 1H半分損切用: 分割可能なら close / remain、不可なら全量決済 */
function gfxCalcPartialCloseUnits_(pairId, totalUnits, ratio) {
  var inst = gfxGetInstrument_(pairId);
  var total = gfxFormatUnits_(pairId, totalUnits);
  var closeUnits = gfxFormatUnits_(pairId, total * ratio);
  var remainUnits = gfxFormatUnits_(pairId, total - closeUnits);
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
