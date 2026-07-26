/**
 * 各チーム用 — META_リーグ調整 シートから自動反映
 * META_LEAGUE_AUTO=false で無効（既定 true = 自動適用）
 */
var META_LEAGUE_ADJ_SHEET_NAME = 'META_リーグ調整';
var META_LEAGUE_CACHE_SEC = 3600;

function metaLeagueDefaultAdjust_() {
  return {
    active: false,
    sizeMult: 1,
    tpRatioDelta: 0,
    touchPctDelta: 0,
    pauseNew: false,
    rank: null,
    league: '',
    gapPct: 0,
    note: '',
  };
}

function metaLeagueAutoEnabled_() {
  var raw = PropertiesService.getScriptProperties().getProperty('META_LEAGUE_AUTO');
  if (raw == null || String(raw).trim() === '') return true;
  return String(raw).toLowerCase() === 'true';
}

/**
 * @param {string} teamId
 * @param {{ skipAutoGate?: boolean }} opts skipAutoGate: Node G-SAXO 用（GSAXO_META_LEAGUE_AUTO で Node 側ゲート）
 */
function metaLeagueReadAdjustFromSheet_(teamId, opts) {
  opts = opts || {};
  var def = metaLeagueDefaultAdjust_();
  if (!opts.skipAutoGate && !metaLeagueAutoEnabled_()) return def;

  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  var ss = sheetId
    ? SpreadsheetApp.openById(sheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_LEAGUE_ADJ_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return def;

  var data = sheet.getDataRange().getValues();
  var best = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() !== teamId) continue;
    if (!best || String(data[i][0]) >= String(best[0])) best = data[i];
  }
  if (!best) return def;

  var sizeMult = Number(best[7]);
  var tpDelta = Number(best[8]);
  var touchDelta = Number(best[9]);
  var pauseNew = String(best[10]).toUpperCase() === 'YES';
  var hasNumeric =
    (Number.isFinite(sizeMult) && sizeMult !== 1) ||
    (Number.isFinite(tpDelta) && tpDelta !== 0) ||
    (Number.isFinite(touchDelta) && touchDelta !== 0) ||
    pauseNew;

  return {
    active: hasNumeric,
    sizeMult: Number.isFinite(sizeMult) ? sizeMult : 1,
    tpRatioDelta: Number.isFinite(tpDelta) ? tpDelta : 0,
    touchPctDelta: Number.isFinite(touchDelta) ? touchDelta : 0,
    pauseNew: pauseNew,
    rank: best[4] === '-' ? null : Number(best[4]),
    league: String(best[2] || ''),
    gapPct: Number(best[6]) || 0,
    note: String(best[11] || ''),
  };
}

function metaLeagueReadAdjust_(teamId) {
  var cacheKey = 'LEAGUE_ADJ_CACHE_' + teamId;
  var cached = PropertiesService.getScriptProperties().getProperty(cacheKey);
  if (cached) {
    try {
      var c = JSON.parse(cached);
      if (c.expires > Date.now()) return c.data;
    } catch (e) { /* ignore */ }
  }

  var adj = metaLeagueReadAdjustFromSheet_(teamId, {});

  PropertiesService.getScriptProperties().setProperty(
    cacheKey,
    JSON.stringify({ expires: Date.now() + META_LEAGUE_CACHE_SEC * 1000, data: adj })
  );
  return adj;
}

/**
 * @param {string} teamId 例: 'G', 'G-FX'
 * @param {Object} cfg getConfig の戻り値
 * @param {Object} opts { sizeKeys: ['maxJpyPerPair'], tpRatioKey: 'tpRatio', touchPctKey: 'touchPct' }
 */
function metaLeagueApplyToConfig_(teamId, cfg, opts) {
  opts = opts || {};
  var adj = metaLeagueReadAdjust_(teamId);
  cfg.league = adj;
  cfg.leaguePauseNew = adj.pauseNew;
  cfg.leagueNote = adj.note;

  if (adj.active && adj.sizeMult !== 1 && opts.sizeKeys && opts.sizeKeys.length) {
    for (var s = 0; s < opts.sizeKeys.length; s++) {
      var sk = opts.sizeKeys[s];
      if (cfg[sk] == null || isNaN(cfg[sk])) continue;
      var dec = opts.sizeDecimals && opts.sizeDecimals[sk];
      if (dec != null) {
        var pow = Math.pow(10, dec);
        cfg[sk] = Math.floor(cfg[sk] * adj.sizeMult * pow) / pow;
      } else {
        cfg[sk] = Math.round(cfg[sk] * adj.sizeMult);
      }
    }
  }

  if (adj.active && opts.tpRatioKey && cfg[opts.tpRatioKey] != null && adj.tpRatioDelta) {
    var tp = Number(cfg[opts.tpRatioKey]) + adj.tpRatioDelta;
    if (typeof gfxClampTpRatio_ === 'function') cfg[opts.tpRatioKey] = gfxClampTpRatio_(tp);
    else if (typeof gClampTpRatio_ === 'function') cfg[opts.tpRatioKey] = gClampTpRatio_(tp);
    else if (typeof gffxClampPartialTp_ === 'function') cfg[opts.tpRatioKey] = gffxClampPartialTp_(tp);
    else if (typeof gcboClampPartialTp_ === 'function') cfg[opts.tpRatioKey] = gcboClampPartialTp_(tp);
    else cfg[opts.tpRatioKey] = Math.max(0.5, Math.min(1, tp));
  }

  if (adj.active && opts.touchPctKey && cfg[opts.touchPctKey] != null && adj.touchPctDelta) {
    cfg[opts.touchPctKey] = Math.max(0.05, Number(cfg[opts.touchPctKey]) + adj.touchPctDelta);
  }

  return cfg;
}

/** 銘柄テーブルの defaultPos 等にリーグ倍率を適用 */
function metaLeagueScaleAmount_(baseAmount, cfg) {
  var mult = 1;
  if (cfg && cfg.league && cfg.league.active && cfg.league.sizeMult) {
    mult = cfg.league.sizeMult;
  }
  return baseAmount * mult;
}
