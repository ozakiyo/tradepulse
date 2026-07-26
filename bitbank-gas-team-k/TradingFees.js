/**
 * bitbank 手数料（取引所・現物）
 * 出典: https://bitbank.cc/docs/fees/ （2026年2月2日時点）
 *
 * TEAM-K は指値（メイカー）中心。アルトはメイカー -0.02%（リベート）。
 * 資金計算の保守側はテイカー率、想定利益はメイカー率を使う。
 */
var K_FEE_SOURCE_URL = 'https://bitbank.cc/docs/fees/';
var K_FEE_EFFECTIVE_DATE = '2026-02-02';

/** BTC/JPY のみ改定（2026-02-02〜）: メイカー0% / テイカー0.10% */
var K_SPOT_FEE_BTC = { makerPct: 0, takerPct: 0.001 };

/** 上記以外の JPY 建て現物（2026-02-02時点） */
var K_SPOT_FEE_ALT = { makerPct: -0.0002, takerPct: 0.0012 };

/**
 * ペア別売買手数料（% → 小数。makerPct マイナス = リベート）
 * 公式表に載るペアのみ列挙。未登録は K_SPOT_FEE_ALT。
 */
var K_SPOT_TRADING_FEES = {
  btc_jpy: K_SPOT_FEE_BTC,
  ltc_jpy: K_SPOT_FEE_ALT,
  xrp_jpy: K_SPOT_FEE_ALT,
  eth_jpy: K_SPOT_FEE_ALT,
  mona_jpy: K_SPOT_FEE_ALT,
  bcc_jpy: K_SPOT_FEE_ALT,
  xlm_jpy: K_SPOT_FEE_ALT,
  qtum_jpy: K_SPOT_FEE_ALT,
  bat_jpy: K_SPOT_FEE_ALT,
  omg_jpy: K_SPOT_FEE_ALT,
  xym_jpy: K_SPOT_FEE_ALT,
  link_jpy: K_SPOT_FEE_ALT,
  boba_jpy: K_SPOT_FEE_ALT,
  enj_jpy: K_SPOT_FEE_ALT,
  pol_jpy: K_SPOT_FEE_ALT,
  dot_jpy: K_SPOT_FEE_ALT,
  doge_jpy: K_SPOT_FEE_ALT,
  astr_jpy: K_SPOT_FEE_ALT,
  ada_jpy: K_SPOT_FEE_ALT,
  avax_jpy: K_SPOT_FEE_ALT,
  axs_jpy: K_SPOT_FEE_ALT,
  flr_jpy: K_SPOT_FEE_ALT,
  sand_jpy: K_SPOT_FEE_ALT,
  ape_jpy: K_SPOT_FEE_ALT,
  gala_jpy: K_SPOT_FEE_ALT,
  chz_jpy: K_SPOT_FEE_ALT,
  oas_jpy: K_SPOT_FEE_ALT,
  mana_jpy: K_SPOT_FEE_ALT,
  grt_jpy: K_SPOT_FEE_ALT,
  render_jpy: K_SPOT_FEE_ALT,
  bnb_jpy: K_SPOT_FEE_ALT,
  arb_jpy: K_SPOT_FEE_ALT,
  op_jpy: K_SPOT_FEE_ALT,
  dai_jpy: K_SPOT_FEE_ALT,
  klay_jpy: K_SPOT_FEE_ALT,
  imx_jpy: K_SPOT_FEE_ALT,
  mask_jpy: K_SPOT_FEE_ALT,
  sol_jpy: K_SPOT_FEE_ALT,
  cyber_jpy: K_SPOT_FEE_ALT,
  trx_jpy: K_SPOT_FEE_ALT,
  lpt_jpy: K_SPOT_FEE_ALT,
  atom_jpy: K_SPOT_FEE_ALT,
  sui_jpy: K_SPOT_FEE_ALT,
  sky_jpy: K_SPOT_FEE_ALT,
};

/** 日本円出金（入金無料・銀行振込手数料は利用者負担） */
var K_JPY_WITHDRAWAL = {
  under30000: 550,
  over30000: 770,
  threshold: 30000,
};

/**
 * 暗号資産出金手数料（固定数量）
 * 出典: bitbank.cc/docs/fees/ 入出金手数料表
 */
var K_CRYPTO_WITHDRAWAL = {
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
function kGetSpotTradingFees_(pair) {
  var p = String(pair || '').toLowerCase();
  if (K_SPOT_TRADING_FEES[p]) {
    return {
      makerPct: K_SPOT_TRADING_FEES[p].makerPct,
      takerPct: K_SPOT_TRADING_FEES[p].takerPct,
    };
  }
  if (p === 'btc_jpy') return { makerPct: K_SPOT_FEE_BTC.makerPct, takerPct: K_SPOT_FEE_BTC.takerPct };
  return { makerPct: K_SPOT_FEE_ALT.makerPct, takerPct: K_SPOT_FEE_ALT.takerPct };
}

/**
 * @param {'maker'|'taker'} role
 */
function kGetFeePct_(pair, role) {
  var fees = kGetSpotTradingFees_(pair);
  return role === 'taker' ? fees.takerPct : fees.makerPct;
}

/**
 * 取引手数料（JPY）。正=支払い、負=リベート（メイカー -0.02% 等）
 * @param {number} notionalJpy 約定代金（円）
 * @param {number} feePct 小数（0.0012 = 0.12%）
 */
function kCalcFeeJpy_(notionalJpy, feePct) {
  if (!notionalJpy || notionalJpy <= 0) return 0;
  return Math.round(notionalJpy * feePct);
}

/**
 * 買い約定の JPY 支出（手数料込み）
 */
function kCalcBuyCostJpy_(pair, price, amount, role) {
  var notional = price * amount;
  var fee = kCalcFeeJpy_(notional, kGetFeePct_(pair, role || 'maker'));
  return Math.ceil(notional + fee);
}

/**
 * 売り約定の JPY 受取（手数料控除後）
 */
function kCalcSellProceedsJpy_(pair, price, amount, role) {
  var notional = price * amount;
  var fee = kCalcFeeJpy_(notional, kGetFeePct_(pair, role || 'maker'));
  return Math.floor(notional - fee);
}

/**
 * 往復純益が TARGET_NET_JPY 以上、かつ最低ティック／最低％を満たす利確価格
 * ②悲観: 買いコストはテイカー、売受取はメイカーで幅を広げる（設定で変更可）
 * @return {{ sellPrice, targetNetJpy, buyCostJpy, expectedNetJpy, floorTicks, floorPct, buyRole, sellRole }}
 */
function kCalcNetTargetTakeProfitPrice_(pair, buyPrice, amount, cfg) {
  cfg = cfg || kGetConfig_();
  var buyRole = cfg.tpFeeBuyRole || K_CONFIG.TP_FEE_BUY_ROLE || 'taker';
  var sellRole = cfg.tpFeeSellRole || K_CONFIG.TP_FEE_SELL_ROLE || 'maker';
  var target =
    cfg.targetNetJpy != null ? Number(cfg.targetNetJpy) : Number(K_CONFIG.TARGET_NET_JPY || 10);
  if (!(target > 0)) target = 10;
  var minTicks =
    cfg.tpMinTicks != null ? Number(cfg.tpMinTicks) : Number(K_CONFIG.TP_MIN_TICKS != null ? K_CONFIG.TP_MIN_TICKS : 2);
  var minPct =
    cfg.tpMinPct != null ? Number(cfg.tpMinPct) : Number(K_CONFIG.TP_MIN_PCT != null ? K_CONFIG.TP_MIN_PCT : 0);
  var buy = Number(buyPrice) || 0;
  var amt = Number(amount) || 0;
  if (buy <= 0 || amt <= 0) {
    return {
      sellPrice: buy,
      targetNetJpy: target,
      buyCostJpy: 0,
      expectedNetJpy: 0,
      floorTicks: minTicks,
      floorPct: minPct,
      buyRole: buyRole,
      sellRole: sellRole,
    };
  }

  var buyCost = kCalcBuyCostJpy_(pair, buy, amt, buyRole);
  var sellFeePct = kGetFeePct_(pair, sellRole);
  var denom = 1 - sellFeePct;
  var sellApprox = denom !== 0 ? (buyCost + target) / (denom * amt) : (buyCost + target) / amt;
  var sell = kRoundPrice_(pair, sellApprox);

  var inst = kGetInstrument_(pair);
  var tick = Math.pow(10, -Math.max(0, Number(inst.priceDecimals) || 0));
  if (!(tick > 0)) tick = 1;

  var floorTicksPrice = buy + Math.max(1, minTicks > 0 ? minTicks : 1) * tick;
  var floorPctPrice = minPct > 0 ? buy * (1 + minPct / 100) : buy + tick;
  var floorSell = kRoundPrice_(pair, Math.max(floorTicksPrice, floorPctPrice));
  if (sell < floorSell) sell = floorSell;
  if (sell <= buy) sell = kRoundPrice_(pair, buy + tick);

  var net = 0;
  for (var i = 0; i < 2000; i++) {
    net = kCalcSellProceedsJpy_(pair, sell, amt, sellRole) - buyCost;
    if (net >= target) break;
    var next = kRoundPrice_(pair, sell + tick);
    if (next <= sell) {
      sell = sell + tick;
      continue;
    }
    sell = next;
  }

  return {
    sellPrice: sell,
    targetNetJpy: target,
    buyCostJpy: buyCost,
    expectedNetJpy: Math.round(net),
    floorTicks: minTicks,
    floorPct: minPct,
    buyRole: buyRole,
    sellRole: sellRole,
  };
}

/**
 * 1トラップラウンドの純利益（買値→売値=買値+trapStep）
 * @return {{ grossJpy: number, feeBuyJpy: number, feeSellJpy: number, netJpy: number }}
 */
function kCalcTrapRoundProfit_(pair, buyPrice, trapStep, amount, role) {
  role = role || 'maker';
  var tp = kCalcTakeProfitPrice_(pair, buyPrice, amount, trapStep, { feeRoleProfit: role });
  var sellPrice = tp.sellPrice;
  var notionalBuy = buyPrice * amount;
  var notionalSell = sellPrice * amount;
  var feePct = kGetFeePct_(pair, role);
  var feeBuy = kCalcFeeJpy_(notionalBuy, feePct);
  var feeSell = kCalcFeeJpy_(notionalSell, feePct);
  var gross = (sellPrice - buyPrice) * amount;
  var net = gross - feeBuy - feeSell;
  return {
    grossJpy: Math.round(gross),
    feeBuyJpy: feeBuy,
    feeSellJpy: feeSell,
    netJpy: Math.round(net),
    feePct: feePct,
    role: role,
    sellPrice: sellPrice,
    feeWidth: tp.feeWidth,
    slipWidth: tp.slipWidth,
  };
}

/**
 * 損益分岐の最小 trapStep（手数料込み・1ラウンド）
 */
function kMinProfitableTrapStep_(pair, buyPrice, amount, role) {
  role = role || 'maker';
  var feePct = kGetFeePct_(pair, role);
  if (feePct <= 0) return 0;
  var notional = buyPrice * amount;
  var minGross = (notional * feePct * 2) / amount;
  return Math.max(0, minGross);
}

/**
 * 通貨別スリップ幅（固定）。未定義は価格帯デフォルト。
 */
function kGetSlipWidth_(pair, price) {
  var map = K_CONFIG.SLIP_WIDTH_BY_PAIR || {};
  if (map[pair] != null) return Number(map[pair]);
  var p = Number(price) || 0;
  if (p >= 1000000) return 1000;
  if (p >= 100000) return 100;
  if (p >= 10000) return 10;
  if (p >= 1000) return 1;
  if (p >= 100) return 0.1;
  if (p >= 10) return 0.01;
  if (p >= 1) return 0.01;
  return 0.001;
}

/**
 * 固定利確価格 = 買値 + 設定幅(trapStep) + 手数料カバー + スリップ
 */
function kCalcGridTakeProfitPrice_(pair, buyPrice, amount, trapStep, cfg) {
  cfg = cfg || kGetConfig_();
  var role = cfg.feeRoleProfit || K_CONFIG.FEE_ROLE_FOR_PROFIT || 'maker';
  var feeWidth = kMinProfitableTrapStep_(pair, buyPrice, amount, role);
  var slipWidth = kGetSlipWidth_(pair, buyPrice);
  var step = Number(trapStep) || 0;
  var width = step + feeWidth + slipWidth;
  if (width <= 0) width = kGetSlipWidth_(pair, buyPrice) || 0.01;
  return {
    sellPrice: kRoundPrice_(pair, buyPrice + width),
    trapStep: step,
    feeWidth: feeWidth,
    slipWidth: slipWidth,
    width: width,
  };
}

/**
 * グリッド全段約定時の必要 JPY（各段の買いコスト合計）
 * @param {{ levels: number, trapStep: number, refDailyLow?: number }} plan
 */
function kCalcWorstCaseGridJpy_(pair, lastPrice, plan, levelAmount, role) {
  role = role || K_CONFIG.FEE_ROLE_FOR_CAPITAL || 'taker';
  if (plan.levelPrices && plan.levelPrices.length) {
    var sum = 0;
    for (var k = 0; k < plan.levelPrices.length; k++) {
      sum += kCalcBuyCostJpy_(pair, plan.levelPrices[k], levelAmount, role);
    }
    return sum;
  }
  var total = 0;
  for (var i = 0; i < plan.levels; i++) {
    var buyPrice = lastPrice - i * plan.trapStep;
    if (plan.refDailyLow != null && buyPrice < plan.refDailyLow) break;
    if (buyPrice <= 0) break;
    total += kCalcBuyCostJpy_(pair, buyPrice, levelAmount, role);
  }
  return total;
}

/** 1セット（最上段1本）の必要 JPY */
function kCalcOneSetCapitalJpy_(pair, price, amount, role) {
  return kCalcBuyCostJpy_(pair, price, amount, role || K_CONFIG.FEE_ROLE_FOR_CAPITAL || 'taker');
}

function kCalcJpyWithdrawalFee_(amountJpy) {
  var n = Number(amountJpy) || 0;
  return n >= K_JPY_WITHDRAWAL.threshold ? K_JPY_WITHDRAWAL.over30000 : K_JPY_WITHDRAWAL.under30000;
}

function kGetCryptoWithdrawalFee_(asset, network) {
  var a = String(asset || '').toLowerCase();
  if (network) {
    var key = a + '_' + String(network).toLowerCase();
    if (K_CRYPTO_WITHDRAWAL[key] != null) return K_CRYPTO_WITHDRAWAL[key];
  }
  return K_CRYPTO_WITHDRAWAL[a] != null ? K_CRYPTO_WITHDRAWAL[a] : null;
}

function kFormatFeePct_(feePct) {
  var pct = feePct * 100;
  var s = (Math.round(pct * 10000) / 10000).toFixed(4);
  if (feePct < 0) return s + '% (リベート)';
  return s + '%';
}

/** 手数料表をログ／UI用テキストで返す */
function kBuildFeeSummaryText_(pair) {
  var lines = [];
  lines.push('bitbank 手数料（' + K_FEE_EFFECTIVE_DATE + '）');
  lines.push('出典: ' + K_FEE_SOURCE_URL);
  lines.push('');
  lines.push('【取引所・現物売買】');
  if (pair) {
    var f = kGetSpotTradingFees_(pair);
    lines.push(
      pair +
        ' メイカー=' +
        kFormatFeePct_(f.makerPct) +
        ' テイカー=' +
        kFormatFeePct_(f.takerPct)
    );
  } else {
    lines.push('BTC/JPY: メイカー 0% / テイカー 0.10%');
    lines.push('その他JPY建て: メイカー -0.02% / テイカー 0.12%');
  }
  lines.push('');
  lines.push('【日本円】入金無料 / 出金 550円(3万未満) 770円(3万以上)');
  lines.push('【口座】開設・維持 無料');
  lines.push('');
  lines.push('TEAM-K: 指値=メイカー想定。資金計算保守側=テイカー。');
  return lines.join('\n');
}
