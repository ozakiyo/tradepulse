/**
 * bitbank 手数料（取引所・現物）
 * 出典: https://bitbank.cc/docs/fees/ （2026年2月2日時点）
 *
 * TEAM-J は指値（メイカー）中心。アルトはメイカー -0.02%（リベート）。
 * 資金計算の保守側はテイカー率、想定利益はメイカー率を使う。
 */
var J_FEE_SOURCE_URL = 'https://bitbank.cc/docs/fees/';
var J_FEE_EFFECTIVE_DATE = '2026-02-02';

/** BTC/JPY のみ改定（2026-02-02〜）: メイカー0% / テイカー0.10% */
var J_SPOT_FEE_BTC = { makerPct: 0, takerPct: 0.001 };

/** 上記以外の JPY 建て現物（2026-02-02時点） */
var J_SPOT_FEE_ALT = { makerPct: -0.0002, takerPct: 0.0012 };

/**
 * ペア別売買手数料（% → 小数。makerPct マイナス = リベート）
 * 公式表に載るペアのみ列挙。未登録は J_SPOT_FEE_ALT。
 */
var J_SPOT_TRADING_FEES = {
  btc_jpy: J_SPOT_FEE_BTC,
  ltc_jpy: J_SPOT_FEE_ALT,
  xrp_jpy: J_SPOT_FEE_ALT,
  eth_jpy: J_SPOT_FEE_ALT,
  mona_jpy: J_SPOT_FEE_ALT,
  bcc_jpy: J_SPOT_FEE_ALT,
  xlm_jpy: J_SPOT_FEE_ALT,
  qtum_jpy: J_SPOT_FEE_ALT,
  bat_jpy: J_SPOT_FEE_ALT,
  omg_jpy: J_SPOT_FEE_ALT,
  xym_jpy: J_SPOT_FEE_ALT,
  link_jpy: J_SPOT_FEE_ALT,
  boba_jpy: J_SPOT_FEE_ALT,
  enj_jpy: J_SPOT_FEE_ALT,
  pol_jpy: J_SPOT_FEE_ALT,
  dot_jpy: J_SPOT_FEE_ALT,
  doge_jpy: J_SPOT_FEE_ALT,
  astr_jpy: J_SPOT_FEE_ALT,
  ada_jpy: J_SPOT_FEE_ALT,
  avax_jpy: J_SPOT_FEE_ALT,
  axs_jpy: J_SPOT_FEE_ALT,
  flr_jpy: J_SPOT_FEE_ALT,
  sand_jpy: J_SPOT_FEE_ALT,
  ape_jpy: J_SPOT_FEE_ALT,
  gala_jpy: J_SPOT_FEE_ALT,
  chz_jpy: J_SPOT_FEE_ALT,
  oas_jpy: J_SPOT_FEE_ALT,
  mana_jpy: J_SPOT_FEE_ALT,
  grt_jpy: J_SPOT_FEE_ALT,
  render_jpy: J_SPOT_FEE_ALT,
  bnb_jpy: J_SPOT_FEE_ALT,
  arb_jpy: J_SPOT_FEE_ALT,
  op_jpy: J_SPOT_FEE_ALT,
  dai_jpy: J_SPOT_FEE_ALT,
  klay_jpy: J_SPOT_FEE_ALT,
  imx_jpy: J_SPOT_FEE_ALT,
  mask_jpy: J_SPOT_FEE_ALT,
  sol_jpy: J_SPOT_FEE_ALT,
  cyber_jpy: J_SPOT_FEE_ALT,
  trx_jpy: J_SPOT_FEE_ALT,
  lpt_jpy: J_SPOT_FEE_ALT,
  atom_jpy: J_SPOT_FEE_ALT,
  sui_jpy: J_SPOT_FEE_ALT,
  sky_jpy: J_SPOT_FEE_ALT,
};

/** 日本円出金（入金無料・銀行振込手数料は利用者負担） */
var J_JPY_WITHDRAWAL = {
  under30000: 550,
  over30000: 770,
  threshold: 30000,
};

/**
 * 暗号資産出金手数料（固定数量）
 * 出典: bitbank.cc/docs/fees/ 入出金手数料表
 */
var J_CRYPTO_WITHDRAWAL = {
  btc: 0.0006,
  ltc: 0.0015,
  xrp: 0.1,
  eth: 0.005,
  eth_arbitrum: 0.00042,
  eth_op: 0.00042,
  mona: 0.001,
  bcc: 0.001,
  xlm: 0.01,
  qtum: 0.01,
  bat: 30,
  omg: 5,
  xym: 2,
  link: 0.5,
  boba: 17,
  enj: 14,
  pol: 1.4,
  dot: 0.05,
  doge: 5,
  astr: 2.5,
  ada: 1,
  avax: 0.01,
  axs: 1.1,
  flr: 5,
  sand: 12,
  sand_polygon: 2.2,
  ape: 1.5,
  gala: 200,
  chz: 58,
  oas: 30,
  mana: 13,
  grt: 26,
  render: 0.2,
  bnb: 0.0016,
  arb: 0.64,
  op: 0.32,
  dai: 10,
  dai_arbitrum: 0.68,
  dai_op: 0.68,
  klay: 1.4,
  imx: 5.3,
  mask: 2.8,
  sol: 0.009,
  cyber: 0.11,
  trx: 3,
  lpt: 1.2,
  atom: 0.2,
  sui: 0.2,
  sky: 140,
};

/**
 * @param {string} pair 例: trx_jpy
 * @return {{ makerPct: number, takerPct: number }}
 */
function jGetSpotTradingFees_(pair) {
  var p = String(pair || '').toLowerCase();
  if (J_SPOT_TRADING_FEES[p]) {
    return {
      makerPct: J_SPOT_TRADING_FEES[p].makerPct,
      takerPct: J_SPOT_TRADING_FEES[p].takerPct,
    };
  }
  if (p === 'btc_jpy') return { makerPct: J_SPOT_FEE_BTC.makerPct, takerPct: J_SPOT_FEE_BTC.takerPct };
  return { makerPct: J_SPOT_FEE_ALT.makerPct, takerPct: J_SPOT_FEE_ALT.takerPct };
}

/**
 * @param {'maker'|'taker'} role
 */
function jGetFeePct_(pair, role) {
  var fees = jGetSpotTradingFees_(pair);
  return role === 'taker' ? fees.takerPct : fees.makerPct;
}

/**
 * 取引手数料（JPY）。正=支払い、負=リベート（メイカー -0.02% 等）
 * @param {number} notionalJpy 約定代金（円）
 * @param {number} feePct 小数（0.0012 = 0.12%）
 */
function jCalcFeeJpy_(notionalJpy, feePct) {
  if (!notionalJpy || notionalJpy <= 0) return 0;
  return Math.round(notionalJpy * feePct);
}

/**
 * 買い約定の JPY 支出（手数料込み）
 */
function jCalcBuyCostJpy_(pair, price, amount, role) {
  var notional = price * amount;
  var fee = jCalcFeeJpy_(notional, jGetFeePct_(pair, role || 'maker'));
  return Math.ceil(notional + fee);
}

/**
 * 売り約定の JPY 受取（手数料控除後）
 */
function jCalcSellProceedsJpy_(pair, price, amount, role) {
  var notional = price * amount;
  var fee = jCalcFeeJpy_(notional, jGetFeePct_(pair, role || 'maker'));
  return Math.floor(notional - fee);
}

/**
 * 1トラップラウンドの純利益（買値→売値=買値+trapStep）
 * @return {{ grossJpy: number, feeBuyJpy: number, feeSellJpy: number, netJpy: number }}
 */
function jCalcTrapRoundProfit_(pair, buyPrice, trapStep, amount, role) {
  role = role || 'maker';
  var sellPrice = buyPrice + trapStep;
  var notionalBuy = buyPrice * amount;
  var notionalSell = sellPrice * amount;
  var feePct = jGetFeePct_(pair, role);
  var feeBuy = jCalcFeeJpy_(notionalBuy, feePct);
  var feeSell = jCalcFeeJpy_(notionalSell, feePct);
  var gross = trapStep * amount;
  var net = gross - feeBuy - feeSell;
  return {
    grossJpy: Math.round(gross),
    feeBuyJpy: feeBuy,
    feeSellJpy: feeSell,
    netJpy: Math.round(net),
    feePct: feePct,
    role: role,
  };
}

/**
 * 損益分岐の最小 trapStep（手数料込み・1ラウンド）
 */
function jMinProfitableTrapStep_(pair, buyPrice, amount, role) {
  role = role || 'maker';
  var feePct = jGetFeePct_(pair, role);
  if (feePct <= 0) return 0.01;
  var notional = buyPrice * amount;
  var minGross = (notional * feePct * 2) / amount;
  return Math.ceil(minGross * 100) / 100;
}

/**
 * グリッド全段約定時の必要 JPY（各段の買いコスト合計）
 * @param {{ levels: number, trapStep: number, refDailyLow?: number }} plan
 */
function jCalcWorstCaseGridJpy_(pair, lastPrice, plan, levelAmount, role) {
  role = role || J_CONFIG.FEE_ROLE_FOR_CAPITAL || 'taker';
  var total = 0;
  for (var i = 0; i < plan.levels; i++) {
    var buyPrice = lastPrice - i * plan.trapStep;
    if (plan.refDailyLow != null && buyPrice < plan.refDailyLow) break;
    if (buyPrice <= 0) break;
    total += jCalcBuyCostJpy_(pair, buyPrice, levelAmount, role);
  }
  return total;
}

/** 1セット（最上段1本）の必要 JPY */
function jCalcOneSetCapitalJpy_(pair, price, amount, role) {
  return jCalcBuyCostJpy_(pair, price, amount, role || J_CONFIG.FEE_ROLE_FOR_CAPITAL || 'taker');
}

function jCalcJpyWithdrawalFee_(amountJpy) {
  var n = Number(amountJpy) || 0;
  return n >= J_JPY_WITHDRAWAL.threshold ? J_JPY_WITHDRAWAL.over30000 : J_JPY_WITHDRAWAL.under30000;
}

function jGetCryptoWithdrawalFee_(asset, network) {
  var a = String(asset || '').toLowerCase();
  if (network) {
    var key = a + '_' + String(network).toLowerCase();
    if (J_CRYPTO_WITHDRAWAL[key] != null) return J_CRYPTO_WITHDRAWAL[key];
  }
  return J_CRYPTO_WITHDRAWAL[a] != null ? J_CRYPTO_WITHDRAWAL[a] : null;
}

function jFormatFeePct_(feePct) {
  var pct = feePct * 100;
  var s = (Math.round(pct * 10000) / 10000).toFixed(4);
  if (feePct < 0) return s + '% (リベート)';
  return s + '%';
}

/** 手数料表をログ／UI用テキストで返す */
function jBuildFeeSummaryText_(pair) {
  var lines = [];
  lines.push('bitbank 手数料（' + J_FEE_EFFECTIVE_DATE + '）');
  lines.push('出典: ' + J_FEE_SOURCE_URL);
  lines.push('');
  lines.push('【取引所・現物売買】');
  if (pair) {
    var f = jGetSpotTradingFees_(pair);
    lines.push(
      pair +
        ' メイカー=' +
        jFormatFeePct_(f.makerPct) +
        ' テイカー=' +
        jFormatFeePct_(f.takerPct)
    );
  } else {
    lines.push('BTC/JPY: メイカー 0% / テイカー 0.10%');
    lines.push('その他JPY建て: メイカー -0.02% / テイカー 0.12%');
  }
  lines.push('');
  lines.push('【日本円】入金無料 / 出金 550円(3万未満) 770円(3万以上)');
  lines.push('【口座】開設・維持 無料');
  lines.push('');
  lines.push('TEAM-J: 指値=メイカー想定。資金計算保守側=テイカー。');
  return lines.join('\n');
}
