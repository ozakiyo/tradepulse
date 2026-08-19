/**
 * Team-M Node Worker → Sheets 同期エンドポイント
 * デプロイ: ウェブアプリ（実行: 自分 / アクセス: 全員）
 *
 * 税務正本: M_売買履歴（自動同期）→ メニューで税務明細再計算
 * 運用: M_運用損益 / オープン / ランキング等（申告に使わない）
 */

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var expected = PropertiesService.getScriptProperties().getProperty('SHEETS_SYNC_TOKEN');
    if (!expected || String(body.token || '') !== String(expected)) {
      return mJsonResponse_({ ok: false, error: 'unauthorized' }, 401);
    }

    mEnsureAllSheets_();
    var opsCount = mReplaceSheetBody_(M_SHEET_LOT_PROFIT, body.ops || [], 18);
    var tradeCount = mReplaceSheetBody_(M_SHEET_TRADE, body.trades || [], 12);
    var openCount = mReplaceSheetBody_(M_SHEET_OPEN_LOTS, body.openLots || [], 13);
    var rulesCount = mReplaceSheetBody_(M_SHEET_CRASH_RULES, body.crashRules || [], 5);
    var histCount = mReplaceSheetBody_(M_SHEET_CRASH_RULE_HIST, body.crashRuleHistory || [], 4);
    var methodCount = mReplaceSheetBody_(M_SHEET_METHOD, body.methodDescription || [], 2);
    var revCount = mReplaceSheetBody_(M_SHEET_METHOD_REV, body.methodRevisions || [], 4);
    var buyCount = mReplaceSheetBody_(M_SHEET_BUY_RANK, body.buyCandidates || [], 10);
    var pairCount = mReplaceSheetBody_(M_SHEET_PAIR_STATUS, body.pairStatus || [], 12);
    var assetCount = mReplaceSheetBody_(M_SHEET_ASSET_STR, body.assetStrength || [], 8);
    var dayCount = mReplaceSheetBody_(M_SHEET_PNL_DAY, body.pnlDaily || [], 3);
    var monthCount = mReplaceSheetBody_(M_SHEET_PNL_MONTH, body.pnlMonthly || [], 3);
    var yearCount = mReplaceSheetBody_(M_SHEET_PNL_YEAR, body.pnlYearly || [], 3);

    var summary = null;
    try {
      summary = mRefreshLotProfitSummary_();
    } catch (errSummary) {
      summary = { error: String(errSummary && errSummary.message ? errSummary.message : errSummary) };
    }

    mAppendSyncLog_(
      'sheets_sync ok ops=' +
        opsCount +
        ' trades=' +
        tradeCount +
        ' open=' +
        openCount +
        ' rank=' +
        buyCount +
        ' pairs=' +
        pairCount
    );

    return mJsonResponse_({
      ok: true,
      apiVersion: 4,
      team: 'M',
      taxMode: 'corporate_moving_average',
      opsCount: opsCount,
      tradeCount: tradeCount,
      openLotsCount: openCount,
      crashRulesCount: rulesCount,
      crashRuleHistoryCount: histCount,
      methodCount: methodCount,
      methodRevisionCount: revCount,
      buyCandidatesCount: buyCount,
      pairStatusCount: pairCount,
      assetStrengthCount: assetCount,
      pnlDailyCount: dayCount,
      pnlMonthlyCount: monthCount,
      pnlYearlyCount: yearCount,
      summary: summary,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return mJsonResponse_(
      { ok: false, error: String(err && err.message ? err.message : err) },
      500
    );
  }
}

function doGet() {
  return mJsonResponse_({
    ok: true,
    apiVersion: 4,
    team: 'M',
    service: 'Team-M sheets sync',
    hint: 'POST JSON: token, ops, trades, openLots, buyCandidates, pairStatus, assetStrength, method*, pnl*',
  });
}

function mJsonResponse_(obj, _status) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** ヘッダ行を残して本文を全置換。rows は二次元配列 */
function mReplaceSheetBody_(sheetName, rows, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    if (sheetName === M_SHEET_OPEN_LOTS) sheet = mGetOpenLotsSheet_();
    else if (sheetName === M_SHEET_LOT_PROFIT) sheet = mGetLotProfitSheet_();
    else if (sheetName === M_SHEET_TRADE) sheet = mGetTradeSheet_();
    else if (sheetName === M_SHEET_CRASH_RULES) sheet = mGetCrashRulesSheet_();
    else if (sheetName === M_SHEET_CRASH_RULE_HIST) sheet = mGetCrashRuleHistorySheet_();
    else if (sheetName === M_SHEET_METHOD) sheet = mGetMethodSheet_();
    else if (sheetName === M_SHEET_METHOD_REV) sheet = mGetMethodRevSheet_();
    else if (sheetName === M_SHEET_BUY_RANK) sheet = mGetBuyRankSheet_();
    else if (sheetName === M_SHEET_PAIR_STATUS) sheet = mGetPairStatusSheet_();
    else if (sheetName === M_SHEET_ASSET_STR) sheet = mGetAssetStrSheet_();
    else if (sheetName === M_SHEET_PNL_DAY) sheet = mGetPnlDaySheet_();
    else if (sheetName === M_SHEET_PNL_MONTH) sheet = mGetPnlMonthSheet_();
    else if (sheetName === M_SHEET_PNL_YEAR) sheet = mGetPnlYearSheet_();
    else throw new Error('sheet missing: ' + sheetName);
  }
  if (sheet.getFilter()) sheet.getFilter().remove();
  var last = sheet.getLastRow();
  var startRow = 2;
  // 税務明細以外は2行目から。手法説明も2行目から。
  // deleteRows は「固定行以外を全削除」になるケースで失敗するため clearContent で置換する
  if (last >= startRow) {
    sheet.getRange(startRow, 1, last - startRow + 1, Math.max(sheet.getMaxColumns(), cols)).clearContent();
  }
  var data = rows || [];
  if (!data.length) return 0;
  var normalized = data.map(function (r) {
    var out = [];
    for (var i = 0; i < cols; i++) out.push(r[i] != null ? r[i] : '');
    return out;
  });
  sheet.getRange(startRow, 1, normalized.length, cols).setValues(normalized);
  return normalized.length;
}

function mAppendSyncLog_(detail) {
  try {
    var sheet = mGetLogSheet_();
    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
      'team_m',
      'sheets_sync',
      '',
      '',
      '',
      '',
      '',
      detail,
    ]);
  } catch (e) {
    /* ignore */
  }
}

function mSetSheetsSyncTokenMenu() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    'Sheets 同期トークン',
    'Node の SHEETS_SYNC_TOKEN と同じ文字列を入力してください',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = String(res.getResponseText() || '').trim();
  if (!token) {
    ui.alert('空のトークンは設定できません');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('SHEETS_SYNC_TOKEN', token);
  ui.alert('SHEETS_SYNC_TOKEN を保存しました');
}
