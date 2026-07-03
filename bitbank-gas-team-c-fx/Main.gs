/**
 * チームC-FX: USD/JPY P&F順張り（紙トレード専用）
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームC-FX Bot')
    .addItem('1. スクリプトプロパティを開く', 'c3fOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'c3fRunOnce')
    .addItem('3. 10分トリガーを設置', 'c3fInstallTrigger')
    .addItem('4. トリガーを削除', 'c3fRemoveTrigger')
    .addItem('5. ログを表示', 'c3fShowLog')
    .addItem('6. シート初期化', 'c3fInitSheetsMenu')
    .addItem('7. 週次レポート生成', 'c3fGenerateReport')
    .addItem('8. 日次レポートトリガー設置', 'c3fInstallReportTrigger')
    .addItem('9. 日次レポートトリガー削除', 'c3fRemoveReportTrigger')
    .addToUi();
}

function c3fInitSheetsMenu() {
  c3fInitSheets_();
  c3fLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('C3F_運用ログ / C3F_売買履歴 を用意しました');
}

function c3fOpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'PF_BOX=0.25\nPF_REVERSAL_BOXES=3\nPOSITION_USD=1000\nPAPER_JPY=300000\n\n※BTC/JPYは bitbank-gas-team-c/',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function c3fShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('C3F_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function c3fInstallTrigger() {
  if (c3fIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  c3fRemoveTrigger();
  ScriptApp.newTrigger('c3fRunOnce').timeBased().everyMinutes(10).create();
  c3fLog_('10分トリガーを設置');
  SpreadsheetApp.getUi().alert('10分ごとに c3fRunOnce が動きます');
}

function c3fRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'c3fRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function c3fRunOnce() {
  if (c3fIsValidationPaused_()) {
    c3fLog_('検証停止中（VALIDATION_PAUSED）— スキップ');
    return;
  }
  var cfg = c3fGetConfig_();
  var state = c3fLoadState_();
  try {
    c3fLog_('実行開始 USD/JPY');
    var ticker = c3fGetTicker_();
    var candles1h = c3fGetCandles1h_();
    var assets = c3fGetAssetsForRun_(cfg, state);

    if (candles1h.length < C3F_CONFIG.MIN_CANDLES_1H) {
      c3fLog_('ローソク不足: ' + candles1h.length + '本');
      state.lastRunAt = new Date().toISOString();
      c3fSaveState_(state);
      return;
    }

    var pf = c3fAnalyzePointFigure_(candles1h, cfg, ticker.last);
    c3fRunTrend_(candles1h, ticker, assets, cfg, state, pf);

    assets = c3fGetAssetsForRun_(cfg, state);
    state.lastRunAt = new Date().toISOString();
    c3fAppendRunLog_(ticker, assets, state, pf);
    c3fSaveState_(state);
    c3fLog_('C3F 完了 ' + pf.note);
  } catch (err) {
    state.lastError = String(err.message || err);
    c3fSaveState_(state);
    c3fLog_('ERROR: ' + state.lastError);
    throw err;
  }
}

/* ---------- 週次レポート ---------- */

function c3fGenerateReport() {
  c3fLog_('週次レポート生成開始');
  try { c3fRunReport_(); SpreadsheetApp.getUi().alert('C3F_週次レポート を更新しました。');
  } catch (e) { c3fLog_('週次レポートERROR: ' + e.message); SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message); }
}

function c3fInstallReportTrigger() {
  c3fRemoveReportTrigger();
  ScriptApp.newTrigger('c3fGenerateReportAuto').timeBased().atHour(6).everyDays(1).create();
  c3fLog_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function c3fRemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'c3fGenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function c3fGenerateReportAuto() {
  if (c3fIsValidationPaused_()) return;
  c3fLog_('週次レポート自動生成開始');
  try { c3fRunReport_(); } catch (e) { c3fLog_('週次レポートERROR: ' + e.message); }
}

function c3fTestConnection() {
  var ticker = c3fGetTicker_();
  c3fLog_('接続OK last=' + ticker.last);
  SpreadsheetApp.getUi().alert('Yahoo 接続OK\nUSD/JPY = ' + ticker.last);
}
