/**
 * チームF-Index: コモディティ + 株価指数の定義テーブル（13銘柄）
 */

var F6_DEFAULT_INST = {
  label: '???', type: 'index', pipSize: 0.5, priceDecimals: 2,
  posDecimals: 1, posUnit: 'unit', defaultPos: 1, stopPips: 50,
};

var F6_INSTRUMENTS = {

  /* ===== コモディティ先物 (6) ===== */
  'GC=F': { label: 'Gold',      type: 'commodity', pipSize: 0.10,   priceDecimals: 2, posDecimals: 1, posUnit: 'oz',    defaultPos: 1,   stopPips: 50 },
  'SI=F': { label: 'Silver',    type: 'commodity', pipSize: 0.005,  priceDecimals: 3, posDecimals: 0, posUnit: 'oz',    defaultPos: 100, stopPips: 50 },
  'CL=F': { label: 'Crude Oil', type: 'commodity', pipSize: 0.01,   priceDecimals: 2, posDecimals: 0, posUnit: 'bbl',   defaultPos: 10,  stopPips: 50 },
  'NG=F': { label: 'Nat Gas',   type: 'commodity', pipSize: 0.001,  priceDecimals: 3, posDecimals: 0, posUnit: 'mmBtu', defaultPos: 100, stopPips: 50 },
  'HG=F': { label: 'Copper',    type: 'commodity', pipSize: 0.0005, priceDecimals: 4, posDecimals: 0, posUnit: 'lbs',   defaultPos: 100, stopPips: 50 },
  'PL=F': { label: 'Platinum',  type: 'commodity', pipSize: 0.10,   priceDecimals: 2, posDecimals: 1, posUnit: 'oz',    defaultPos: 1,   stopPips: 50 },

  /* ===== 株価指数 (7) ===== */
  '^GSPC':  { label: 'S&P 500',   type: 'index', pipSize: 0.25, priceDecimals: 2, posDecimals: 1, posUnit: 'pt', defaultPos: 1, stopPips: 50 },
  '^DJI':   { label: 'Dow Jones', type: 'index', pipSize: 1.0,  priceDecimals: 2, posDecimals: 1, posUnit: 'pt', defaultPos: 1, stopPips: 50 },
  '^IXIC':  { label: 'NASDAQ',    type: 'index', pipSize: 0.25, priceDecimals: 2, posDecimals: 1, posUnit: 'pt', defaultPos: 1, stopPips: 50 },
  '^N225':  { label: 'Nikkei',    type: 'index', pipSize: 5.0,  priceDecimals: 2, posDecimals: 1, posUnit: 'pt', defaultPos: 1, stopPips: 50 },
  '^FTSE':  { label: 'FTSE 100',  type: 'index', pipSize: 0.5,  priceDecimals: 2, posDecimals: 1, posUnit: 'pt', defaultPos: 1, stopPips: 50 },
  '^GDAXI': { label: 'DAX',       type: 'index', pipSize: 0.5,  priceDecimals: 2, posDecimals: 1, posUnit: 'pt', defaultPos: 1, stopPips: 50 },
  '^HSI':   { label: 'Hang Seng', type: 'index', pipSize: 1.0,  priceDecimals: 2, posDecimals: 1, posUnit: 'pt', defaultPos: 1, stopPips: 50 },
};

function f6AllSymbols_() {
  return Object.keys(F6_INSTRUMENTS);
}

function f6GetActiveSymbols_() {
  var raw = PropertiesService.getScriptProperties().getProperty('INSTRUMENTS');
  if (raw && raw.trim()) {
    return raw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
  }
  return f6AllSymbols_();
}

function f6GetInstrument_(symbol) {
  return F6_INSTRUMENTS[symbol] || F6_DEFAULT_INST;
}
