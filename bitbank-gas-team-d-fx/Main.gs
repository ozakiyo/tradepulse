/**
 * チームD-FX: USD/JPY 柴田罫線順張り（紙トレード専用）
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームD-FX Bot')
    .addItem('1. スクリプトプロパティを開く', 'd4fOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'd4fRunOnce')
    .addItem('3. 10分トリガーを設置', 'd4fInstallTrigger')
    .addItem('4. トリガーを削除', 'd4fRemoveTrigger')
    .addItem('5. ログを表示', 'd4fShowLog')
    .addItem('6. シート初期化', 'd4fInitSheetsMenu')
    .addItem('7. 週次レポート生成', 'd4fGenerateReport')
    .addItem('8. 日次レポートトリガー設置', 'd4fInstallReportTrigger')
    .addItem('9. 日次レポートトリガー削除', 'd4fRemoveReportTrigger')
    .addToUi();
}

function d4fInitSheetsMenu() {
  d4fInitSheets_();
  d4fLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('D4F_運用ログ / D4F_売買履歴 を用意しました');
}

function d4fOpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'CANDLE_INTERVAL=15m（1hに戻すことも可）\nKAGI_BASE_STEP_FX=0.0625\nLAW_BUY_MIN=1\nLAW_LOOKBACK_SEGS=12\nPOSITION_USD=1000\nPAPER_JPY=300000\n\n※BTC/JPYは bitbank-gas-team-d/',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function d4fShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('D4F_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function d4fInstallTrigger() {
  if (d4fIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  d4fRemoveTrigger();
  ScriptApp.newTrigger('d4fRunOnce').timeBased().everyMinutes(10).create();
  d4fLog_('10分トリガーを設置');
  SpreadsheetApp.getUi().alert('10分ごとに d4fRunOnce が動きます');
}

function d4fRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'd4fRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function d4fRunOnce() {
  if (d4fIsValidationPaused_()) {
    d4fLog_('検証停止中（VALIDATION_PAUSED）— スキップ');
    return;
  }
  var cfg = d4fGetConfig_();
  var state = d4fLoadState_();
  try {
    d4fLog_('実行開始 USD/JPY');
    var ticker = d4fGetTicker_(cfg.candleInterval);
    var candles1h = d4fGetCandles_(cfg);
    var assets = d4fGetAssetsForRun_(cfg, state);

    if (candles1h.length < cfg.minCandles) {
      d4fLog_('ローソク不足(' + cfg.candleInterval + '): ' + candles1h.length + '本');
      state.lastRunAt = new Date().toISOString();
      d4fSaveState_(state);
      return;
    }

    var analysis = d4fAnalyzeShibata_(candles1h, cfg, ticker.last);
    d4fRunTrend_(candles1h, ticker, assets, cfg, state, analysis);

    assets = d4fGetAssetsForRun_(cfg, state);
    state.lastRunAt = new Date().toISOString();
    d4fAppendRunLog_(ticker, assets, state, analysis);
    d4fSaveState_(state);
    d4fLog_('D4F 完了 ' + analysis.note);
  } catch (err) {
    state.lastError = String(err.message || err);
    d4fSaveState_(state);
    d4fLog_('ERROR: ' + state.lastError);
    throw err;
  }
}

/* ---------- 週次レポート ---------- */

function d4fGenerateReport() {
  d4fLog_('週次レポート生成開始');
  try { d4fRunReport_(); SpreadsheetApp.getUi().alert('D4F_週次レポート を更新しました。');
  } catch (e) { d4fLog_('週次レポートERROR: ' + e.message); SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message); }
}

function d4fInstallReportTrigger() {
  d4fRemoveReportTrigger();
  ScriptApp.newTrigger('d4fGenerateReportAuto').timeBased().atHour(6).everyDays(1).create();
  d4fLog_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function d4fRemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'd4fGenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function d4fGenerateReportAuto() {
  if (d4fIsValidationPaused_()) return;
  d4fLog_('週次レポート自動生成開始');
  try { d4fRunReport_(); } catch (e) { d4fLog_('週次レポートERROR: ' + e.message); }
}

function d4fTestConnection() {
  var ticker = d4fGetTicker_();
  d4fLog_('接続OK last=' + ticker.last);
  SpreadsheetApp.getUi().alert('Yahoo 接続OK\nUSD/JPY = ' + ticker.last);
}
