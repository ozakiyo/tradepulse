/**
 * bitbank API からペア仕様を同期
 */
var J_INSTRUMENTS_CACHE_KEY = 'J_INSTRUMENTS_JSON';
var J_INSTRUMENTS_SYNC_YMD_KEY = 'J_INSTRUMENTS_SYNC_YMD';
/** ScriptCache TTL（秒）— 日次同期と合わせて24時間 */
var J_INSTRUMENTS_CACHE_SEC = 86400;

var J_DEFAULT_INST = {
  label: '???/JPY',
  asset: '???',
  minAmount: 0.0001,
  amountDecimals: 4,
  priceDecimals: 0,
};

function jSyncInstrumentsFromApi_() {
  var pairs = jFetchSpotPairs_();
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
  CacheService.getScriptCache().put(J_INSTRUMENTS_CACHE_KEY, JSON.stringify(map), J_INSTRUMENTS_CACHE_SEC);
  PropertiesService.getScriptProperties().setProperty(J_INSTRUMENTS_CACHE_KEY, JSON.stringify(map));
  return map;
}

/**
 * ペア仕様を日1回だけ API 同期（それ以外はキャッシュ）
 * @param {boolean} force メニューからの強制同期
 */
function jEnsureInstrumentsSyncedDaily_(force) {
  var props = PropertiesService.getScriptProperties();
  var today = jTodayYmd_();
  if (!force && props.getProperty(J_INSTRUMENTS_SYNC_YMD_KEY) === today) {
    return jLoadInstruments_();
  }
  var map = jSyncInstrumentsFromApi_();
  props.setProperty(J_INSTRUMENTS_SYNC_YMD_KEY, today);
  jLog_('ペア仕様同期（日次）: ' + Object.keys(map).length + '銘柄');
  return map;
}

function jLoadInstruments_() {
  var cache = CacheService.getScriptCache().get(J_INSTRUMENTS_CACHE_KEY);
  if (cache) {
    try {
      return JSON.parse(cache);
    } catch (e) {}
  }
  var raw = PropertiesService.getScriptProperties().getProperty(J_INSTRUMENTS_CACHE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e2) {}
  }
  return jSyncInstrumentsFromApi_();
}

function jAllPairs_() {
  return Object.keys(jLoadInstruments_()).sort();
}

function jGetInstrument_(pair) {
  var map = jLoadInstruments_();
  return map[pair] || J_DEFAULT_INST;
}

function jFormatAmount_(pair, amount) {
  var inst = jGetInstrument_(pair);
  var pow = Math.pow(10, inst.amountDecimals);
  return Math.floor(amount * pow) / pow;
}

function jRoundPrice_(pair, price) {
  var inst = jGetInstrument_(pair);
  var pow = Math.pow(10, inst.priceDecimals);
  return Math.round(price * pow) / pow;
}

/**
 * MIN_LEVEL_JPY を満たす 1段数量
 */
function jResolveLevelAmount_(pair, lastPrice, minLevelJpy) {
  var inst = jGetInstrument_(pair);
  var unit = inst.minAmount;
  if (!minLevelJpy || minLevelJpy <= 0 || lastPrice <= 0) return unit;
  var need = minLevelJpy / lastPrice;
  var steps = Math.ceil(need / unit);
  return jFormatAmount_(pair, steps * unit);
}
