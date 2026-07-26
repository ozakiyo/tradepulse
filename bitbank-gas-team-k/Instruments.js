var K_INSTRUMENTS_CACHE_KEY = 'K_INSTRUMENTS_JSON';
var K_INSTRUMENTS_SYNC_YMD_KEY = 'K_INSTRUMENTS_SYNC_YMD';
var K_INSTRUMENTS_CACHE_SEC = 86400;

var K_DEFAULT_INST = {
  label: '???/JPY',
  asset: '???',
  minAmount: 0.0001,
  amountDecimals: 4,
  priceDecimals: 0,
};

function kSyncInstrumentsFromApi_() {
  var pairs = kFetchSpotPairs_();
  var map = {};
  pairs.forEach(function (p) {
    map[p.name] = {
      label: (p.base_asset || '').toUpperCase() + '/JPY',
      asset: p.base_asset,
      minAmount: Number(p.unit_amount),
      amountDecimals: Number(p.amount_digits),
      priceDecimals: Number(p.price_digits),
    };
  });
  CacheService.getScriptCache().put(K_INSTRUMENTS_CACHE_KEY, JSON.stringify(map), K_INSTRUMENTS_CACHE_SEC);
  PropertiesService.getScriptProperties().setProperty(K_INSTRUMENTS_CACHE_KEY, JSON.stringify(map));
  return map;
}

function kEnsureInstrumentsSyncedDaily_(force) {
  var props = PropertiesService.getScriptProperties();
  var today = kTodayYmd_();
  if (!force && props.getProperty(K_INSTRUMENTS_SYNC_YMD_KEY) === today) {
    return kLoadInstruments_();
  }
  var map = kSyncInstrumentsFromApi_();
  props.setProperty(K_INSTRUMENTS_SYNC_YMD_KEY, today);
  kLog_('ペア仕様同期: ' + Object.keys(map).length + '銘柄');
  return map;
}

function kLoadInstruments_() {
  var cache = CacheService.getScriptCache().get(K_INSTRUMENTS_CACHE_KEY);
  if (cache) {
    try {
      return JSON.parse(cache);
    } catch (e) {}
  }
  var raw = PropertiesService.getScriptProperties().getProperty(K_INSTRUMENTS_CACHE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e2) {}
  }
  return kSyncInstrumentsFromApi_();
}

function kAllPairs_() {
  return Object.keys(kLoadInstruments_()).sort();
}

function kGetInstrument_(pair) {
  return kLoadInstruments_()[pair] || K_DEFAULT_INST;
}

function kFormatAmount_(pair, amount) {
  var inst = kGetInstrument_(pair);
  var pow = Math.pow(10, inst.amountDecimals);
  return Math.floor(amount * pow) / pow;
}

function kRoundPrice_(pair, price) {
  var inst = kGetInstrument_(pair);
  var pow = Math.pow(10, inst.priceDecimals);
  return Math.round(price * pow) / pow;
}

function kResolveEntryAmount_(pair, lastPrice, entryJpy) {
  var inst = kGetInstrument_(pair);
  var unit = inst.minAmount;
  if (!entryJpy || entryJpy <= 0 || lastPrice <= 0) return unit;
  var need = entryJpy / lastPrice;
  var steps = Math.ceil(need / unit);
  return kFormatAmount_(pair, steps * unit);
}

/**
 * ENTRY_JPY を狙ったときの実必要資金（数量丸め＋capital手数料）
 * @return {{ amount: number, needJpy: number }}
 */
function kCalcEntryNeedJpy_(pair, lastPrice, entryJpy, role) {
  var ej = entryJpy != null ? entryJpy : K_CONFIG.ENTRY_JPY;
  var amount = kResolveEntryAmount_(pair, lastPrice, ej);
  var needJpy = kCalcOneSetCapitalJpy_(pair, lastPrice, amount, role || K_CONFIG.FEE_ROLE_FOR_CAPITAL);
  return { amount: amount, needJpy: needJpy };
}

/** 余りのデプロイ可能 JPY（DRY_RUN=paper残り / 本番=free×予算比率） */
function kGetAvailableDeployJpy_(cfg, global) {
  cfg = cfg || kGetConfig_();
  if (cfg.dryRun) {
    var w = kInitPaperWallet_(global, cfg);
    return Math.max(0, Math.floor(w.jpy || 0));
  }
  var pct = cfg.accountBudgetPct != null ? cfg.accountBudgetPct : K_CONFIG.ACCOUNT_BUDGET_PCT;
  var assets = kGetAssets_('jpy');
  return Math.max(0, Math.floor((assets.jpy || 0) * pct));
}
