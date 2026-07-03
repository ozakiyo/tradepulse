/**
 * チームF-Crypto: 暗号資産の定義テーブル（10銘柄）
 */

var F6_DEFAULT_INST = {
  label: '???', type: 'crypto', pipSize: 0.01, priceDecimals: 2,
  posDecimals: 4, posUnit: 'unit', defaultPos: 1, stopPips: 50,
};

var F6_INSTRUMENTS = {
  'BTC-USD':  { label: 'BTC/USD',  type: 'crypto', pipSize: 1.0,     priceDecimals: 2, posDecimals: 5, posUnit: 'BTC',  defaultPos: 0.001,  stopPips: 100 },
  'ETH-USD':  { label: 'ETH/USD',  type: 'crypto', pipSize: 0.1,     priceDecimals: 2, posDecimals: 4, posUnit: 'ETH',  defaultPos: 0.01,   stopPips: 100 },
  'XRP-USD':  { label: 'XRP/USD',  type: 'crypto', pipSize: 0.0001,  priceDecimals: 4, posDecimals: 1, posUnit: 'XRP',  defaultPos: 100,    stopPips: 50 },
  'SOL-USD':  { label: 'SOL/USD',  type: 'crypto', pipSize: 0.01,    priceDecimals: 2, posDecimals: 2, posUnit: 'SOL',  defaultPos: 1,      stopPips: 50 },
  'ADA-USD':  { label: 'ADA/USD',  type: 'crypto', pipSize: 0.0001,  priceDecimals: 4, posDecimals: 1, posUnit: 'ADA',  defaultPos: 1000,   stopPips: 50 },
  'DOT-USD':  { label: 'DOT/USD',  type: 'crypto', pipSize: 0.01,    priceDecimals: 2, posDecimals: 2, posUnit: 'DOT',  defaultPos: 10,     stopPips: 50 },
  'AVAX-USD': { label: 'AVAX/USD', type: 'crypto', pipSize: 0.01,    priceDecimals: 2, posDecimals: 2, posUnit: 'AVAX', defaultPos: 10,     stopPips: 50 },
  'LINK-USD': { label: 'LINK/USD', type: 'crypto', pipSize: 0.01,    priceDecimals: 2, posDecimals: 2, posUnit: 'LINK', defaultPos: 10,     stopPips: 50 },
  'DOGE-USD': { label: 'DOGE/USD', type: 'crypto', pipSize: 0.00001, priceDecimals: 5, posDecimals: 0, posUnit: 'DOGE', defaultPos: 10000,  stopPips: 50 },
  'BNB-USD':  { label: 'BNB/USD',  type: 'crypto', pipSize: 0.01,    priceDecimals: 2, posDecimals: 3, posUnit: 'BNB',  defaultPos: 1,      stopPips: 50 },
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
