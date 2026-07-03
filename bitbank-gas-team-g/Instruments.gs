/**
 * チームG: bitbank レンジ（買いのみ）— 10銘柄
 * pair = API のペア名（小文字）
 * defaultAmount は minAmount の2倍以上（1H半分損切用）
 */

var G_DEFAULT_INST = {
  label: '???',
  asset: '???',
  minAmount: 0.0001,
  amountDecimals: 4,
  defaultAmount: 0.0002,
  priceDecimals: 0,
};

/** 取引所最小単位は銘柄により異なる。試験は最小付近から */
var G_INSTRUMENTS = {
  btc_jpy: {
    label: 'BTC/JPY',
    asset: 'btc',
    minAmount: 0.0001,
    amountDecimals: 4,
    defaultAmount: 0.0002,
    priceDecimals: 0,
  },
  eth_jpy: {
    label: 'ETH/JPY',
    asset: 'eth',
    minAmount: 0.0001,
    amountDecimals: 4,
    defaultAmount: 0.0002,
    priceDecimals: 0,
  },
  xrp_jpy: {
    label: 'XRP/JPY',
    asset: 'xrp',
    minAmount: 0.1,
    amountDecimals: 1,
    defaultAmount: 0.2,
    priceDecimals: 3,
  },
  sol_jpy: {
    label: 'SOL/JPY',
    asset: 'sol',
    minAmount: 0.01,
    amountDecimals: 2,
    defaultAmount: 0.02,
    priceDecimals: 0,
  },
  doge_jpy: {
    label: 'DOGE/JPY',
    asset: 'doge',
    minAmount: 1,
    amountDecimals: 0,
    defaultAmount: 2,
    priceDecimals: 4,
  },
  link_jpy: {
    label: 'LINK/JPY',
    asset: 'link',
    minAmount: 0.01,
    amountDecimals: 2,
    defaultAmount: 0.02,
    priceDecimals: 0,
  },
  ada_jpy: {
    label: 'ADA/JPY',
    asset: 'ada',
    minAmount: 1,
    amountDecimals: 0,
    defaultAmount: 2,
    priceDecimals: 4,
  },
  ltc_jpy: {
    label: 'LTC/JPY',
    asset: 'ltc',
    minAmount: 0.01,
    amountDecimals: 2,
    defaultAmount: 0.02,
    priceDecimals: 0,
  },
  bnb_jpy: {
    label: 'BNB/JPY',
    asset: 'bnb',
    minAmount: 0.001,
    amountDecimals: 3,
    defaultAmount: 0.002,
    priceDecimals: 0,
  },
  dot_jpy: {
    label: 'DOT/JPY',
    asset: 'dot',
    minAmount: 0.1,
    amountDecimals: 1,
    defaultAmount: 0.2,
    priceDecimals: 2,
  },
};

function gAllPairs_() {
  return Object.keys(G_INSTRUMENTS);
}

function gGetActivePairs_() {
  var raw = PropertiesService.getScriptProperties().getProperty('G_PAIRS');
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(function (s) {
        return s && G_INSTRUMENTS[s];
      });
  }
  return gAllPairs_();
}

function gGetInstrument_(pair) {
  return G_INSTRUMENTS[pair] || G_DEFAULT_INST;
}

function gFormatAmount_(pair, amount) {
  var inst = gGetInstrument_(pair);
  var pow = Math.pow(10, inst.amountDecimals);
  return Math.floor(amount * pow) / pow;
}

function gRoundPrice_(pair, price) {
  var inst = gGetInstrument_(pair);
  var pow = Math.pow(10, inst.priceDecimals);
  return Math.round(price * pow) / pow;
}

/** 1H半分損切用: 分割可能なら close / remain、不可なら全量決済 */
function gCalcPartialCloseAmount_(pair, totalAmount, ratio) {
  var inst = gGetInstrument_(pair);
  var total = gFormatAmount_(pair, totalAmount);
  var closeAmount = gFormatAmount_(pair, total * ratio);
  var remainAmount = gFormatAmount_(pair, total - closeAmount);
  if (closeAmount < inst.minAmount || remainAmount < inst.minAmount) {
    return {
      canSplit: false,
      closeAmount: total,
      remainAmount: 0,
    };
  }
  return {
    canSplit: true,
    closeAmount: closeAmount,
    remainAmount: remainAmount,
  };
}
