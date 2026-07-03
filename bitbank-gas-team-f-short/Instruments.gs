/**
 * チームF (FX): 全FX通貨ペアの定義テーブル（40ペア）
 *
 * 各銘柄に label, type, pipSize, priceDecimals, posDecimals, posUnit,
 * defaultPos, stopPips を定義する。
 */

var F6_DEFAULT_INST = {
  label: '???', type: 'fx', pipSize: 0.0001, priceDecimals: 5,
  posDecimals: 2, posUnit: 'unit', defaultPos: 1000, stopPips: 10,
};

var F6_INSTRUMENTS = {

  /* ===== FX メジャー (7) ===== */
  'USDJPY=X': { label: 'USD/JPY', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 3, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 10 },
  'EURUSD=X': { label: 'EUR/USD', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 10 },
  'GBPUSD=X': { label: 'GBP/USD', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'GBP', defaultPos: 1000, stopPips: 10 },
  'AUDUSD=X': { label: 'AUD/USD', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'AUD', defaultPos: 1000, stopPips: 10 },
  'NZDUSD=X': { label: 'NZD/USD', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'NZD', defaultPos: 1000, stopPips: 10 },
  'USDCAD=X': { label: 'USD/CAD', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 10 },
  'USDCHF=X': { label: 'USD/CHF', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 10 },

  /* ===== FX クロス円 (6) ===== */
  'EURJPY=X': { label: 'EUR/JPY', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 3, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 10 },
  'GBPJPY=X': { label: 'GBP/JPY', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 3, posDecimals: 2, posUnit: 'GBP', defaultPos: 1000, stopPips: 10 },
  'AUDJPY=X': { label: 'AUD/JPY', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 3, posDecimals: 2, posUnit: 'AUD', defaultPos: 1000, stopPips: 10 },
  'NZDJPY=X': { label: 'NZD/JPY', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 3, posDecimals: 2, posUnit: 'NZD', defaultPos: 1000, stopPips: 10 },
  'CADJPY=X': { label: 'CAD/JPY', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 3, posDecimals: 2, posUnit: 'CAD', defaultPos: 1000, stopPips: 10 },
  'CHFJPY=X': { label: 'CHF/JPY', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 3, posDecimals: 2, posUnit: 'CHF', defaultPos: 1000, stopPips: 10 },

  /* ===== FX マイナー (14) ===== */
  'EURGBP=X': { label: 'EUR/GBP', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 10 },
  'EURAUD=X': { label: 'EUR/AUD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 10 },
  'EURCAD=X': { label: 'EUR/CAD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 10 },
  'EURCHF=X': { label: 'EUR/CHF', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 10 },
  'EURNZD=X': { label: 'EUR/NZD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 10 },
  'GBPAUD=X': { label: 'GBP/AUD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'GBP', defaultPos: 1000, stopPips: 10 },
  'GBPCAD=X': { label: 'GBP/CAD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'GBP', defaultPos: 1000, stopPips: 10 },
  'GBPCHF=X': { label: 'GBP/CHF', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'GBP', defaultPos: 1000, stopPips: 10 },
  'GBPNZD=X': { label: 'GBP/NZD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'GBP', defaultPos: 1000, stopPips: 10 },
  'AUDCAD=X': { label: 'AUD/CAD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'AUD', defaultPos: 1000, stopPips: 10 },
  'AUDCHF=X': { label: 'AUD/CHF', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'AUD', defaultPos: 1000, stopPips: 10 },
  'AUDNZD=X': { label: 'AUD/NZD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'AUD', defaultPos: 1000, stopPips: 10 },
  'NZDCAD=X': { label: 'NZD/CAD', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'NZD', defaultPos: 1000, stopPips: 10 },
  'NZDCHF=X': { label: 'NZD/CHF', type: 'fx', pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'NZD', defaultPos: 1000, stopPips: 10 },

  /* ===== FX エキゾチック (13) ===== */
  'USDTRY=X': { label: 'USD/TRY', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 30 },
  'USDZAR=X': { label: 'USD/ZAR', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 30 },
  'USDMXN=X': { label: 'USD/MXN', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 30 },
  'USDSGD=X': { label: 'USD/SGD', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 10 },
  'USDHKD=X': { label: 'USD/HKD', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 10 },
  'USDCNY=X': { label: 'USD/CNY', type: 'fx',     pipSize: 0.0001, priceDecimals: 4, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 10 },
  'USDINR=X': { label: 'USD/INR', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 4, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 10 },
  'USDPLN=X': { label: 'USD/PLN', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 15 },
  'USDSEK=X': { label: 'USD/SEK', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 15 },
  'USDNOK=X': { label: 'USD/NOK', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'USD', defaultPos: 1000, stopPips: 15 },
  'EURSEK=X': { label: 'EUR/SEK', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 15 },
  'EURNOK=X': { label: 'EUR/NOK', type: 'fx',     pipSize: 0.0001, priceDecimals: 5, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 15 },
  'EURHUF=X': { label: 'EUR/HUF', type: 'fx_jpy', pipSize: 0.01,   priceDecimals: 3, posDecimals: 2, posUnit: 'EUR', defaultPos: 1000, stopPips: 20 },
};

/** 既定監視8ペア（INSTRUMENTS 未設定時） */
var F6_DEFAULT_SYMBOLS = [
  'USDJPY=X',
  'EURJPY=X',
  'GBPJPY=X',
  'AUDJPY=X',
  'EURUSD=X',
  'GBPUSD=X',
  'USDCHF=X',
  'EURCHF=X',
];

function f6AllSymbols_() {
  return Object.keys(F6_INSTRUMENTS);
}

function f6GetActiveSymbols_() {
  var raw = PropertiesService.getScriptProperties().getProperty('INSTRUMENTS');
  if (raw && raw.trim()) {
    return raw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
  }
  return F6_DEFAULT_SYMBOLS.slice();
}

function f6GetInstrument_(symbol) {
  return F6_INSTRUMENTS[symbol] || F6_DEFAULT_INST;
}
