/**
 * チームE-FX: USD/JPY ドンチャン順張り（紙トレード専用）
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームE-FX Bot')
    .addItem('1. スクリプトプロパティを開く', 'e5fOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'e5fRunOnce')
    .addItem('3. 10分トリガーを設置', 'e5fInstallTrigger')
    .addItem('4. トリガーを削除', 'e5fRemoveTrigger')
    .addItem('5. ログを表示', 'e5fShowLog')
    .addItem('6. シート初期化', 'e5fInitSheetsMenu')
    .addItem('7. 週次レポート生成', 'e5fGenerateReport')
    .addItem('8. 日次レポートトリガー設置', 'e5fInstallReportTrigger')
    .addItem('9. 日次レポートトリガー削除', 'e5fRemoveReportTrigger')
    .addToUi();
}

function e5fInitSheetsMenu() {
  e5fInitSheets_();
  e5fLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('E5F_運用ログ / E5F_売買履歴 を用意しました');
}

function e5fOpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'CANDLE_INTERVAL=15m\nDONCHIAN_ENTRY_BARS=15\nDONCHIAN_EXIT_BARS=8\nADX_MIN=18\nER_MIN=0.22\nBIAS_ALLOW_NEUTRAL=true\nPOSITION_USD=1000\nPAPER_JPY=300000\n\n※BTC/JPYは bitbank-gas-team-e/',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function e5fShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('E5F_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function e5fInstallTrigger() {
  e5fRemoveTrigger();
  ScriptApp.newTrigger('e5fRunOnce').timeBased().everyMinutes(10).create();
  e5fLog_('10分トリガーを設置');
  SpreadsheetApp.getUi().alert('10分ごとに e5fRunOnce が動きます');
}

function e5fRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'e5fRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function e5fRunOnce() {
  var cfg = e5fGetConfig_();
  var state = e5fLoadState_();
  try {
    e5fLog_('実行開始 USD/JPY');
    var ticker = e5fGetTicker_(cfg.candleInterval);
    var candles1h = e5fGetCandles_(cfg);
    var assets = e5fGetAssetsForRun_(cfg, state);

    if (candles1h.length < cfg.minCandles) {
      e5fLog_('ローソク不足(' + cfg.candleInterval + '): ' + candles1h.length + '本');
      state.lastRunAt = new Date().toISOString();
      e5fSaveState_(state);
      return;
    }

    var analysis = e5fAnalyzeTrend_(candles1h, cfg, ticker.last);
    e5fRunTrend_(candles1h, ticker, assets, cfg, state, analysis);

    assets = e5fGetAssetsForRun_(cfg, state);
    state.lastRunAt = new Date().toISOString();
    e5fAppendRunLog_(ticker, assets, state, analysis);
    e5fSaveState_(state);
    e5fLog_('E5F 完了 ' + analysis.note);
  } catch (err) {
    state.lastError = String(err.message || err);
    e5fSaveState_(state);
    e5fLog_('ERROR: ' + state.lastError);
    throw err;
  }
}

/* ---------- 週次レポート ---------- */

function e5fGenerateReport() {
  e5fLog_('週次レポート生成開始');
  try { e5fRunReport_(); SpreadsheetApp.getUi().alert('E5F_週次レポート を更新しました。');
  } catch (e) { e5fLog_('週次レポートERROR: ' + e.message); SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message); }
}

function e5fInstallReportTrigger() {
  e5fRemoveReportTrigger();
  ScriptApp.newTrigger('e5fGenerateReportAuto').timeBased().atHour(6).everyDays(1).create();
  e5fLog_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function e5fRemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'e5fGenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function e5fGenerateReportAuto() {
  e5fLog_('週次レポート自動生成開始');
  try { e5fRunReport_(); } catch (e) { e5fLog_('週次レポートERROR: ' + e.message); }
}

function e5fTestConnection() {
  var ticker = e5fGetTicker_();
  e5fLog_('接続OK last=' + ticker.last);
  SpreadsheetApp.getUi().alert('Yahoo 接続OK\nUSD/JPY = ' + ticker.last);
}
