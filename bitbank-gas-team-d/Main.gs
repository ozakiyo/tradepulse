/**
 * チームD: BITBANK × GAS — 柴田罫線順張り（BTC/JPY 専用）
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームD Bot')
    .addItem('1. スクリプトプロパティを開く', 'd4OpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'd4RunOnce')
    .addItem('3. 10分トリガーを設置', 'd4InstallTrigger')
    .addItem('4. トリガーを削除', 'd4RemoveTrigger')
    .addItem('5. ログを表示', 'd4ShowLog')
    .addItem('6. シート初期化', 'd4InitSheetsMenu')
    .addItem('7. 週次レポート生成', 'd4GenerateReport')
    .addItem('8. 日次レポートトリガー設置', 'd4InstallReportTrigger')
    .addItem('9. 日次レポートトリガー削除', 'd4RemoveReportTrigger')
    .addToUi();
}

function d4InitSheetsMenu() {
  d4InitSheets_();
  d4Log_('シート初期化完了');
  SpreadsheetApp.getUi().alert('D4_運用ログ / D4_売買履歴 を用意しました');
}

function d4OpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'BITBANK_API_KEY / BITBANK_API_SECRET\nDRY_RUN=true\nCANDLE_TYPE=15min（1hourに戻すことも可）\nKAGI_BASE_STEP_JPY=15000（15分用）\nLAW_BUY_MIN=1\nPOSITION_BTC=0.0001\nPAPER_JPY=300000\nMETA_SPREADSHEET_ID（任意）\n\n※USD/JPYは bitbank-gas-team-d-fx/',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function d4ShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('D4_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function d4InstallTrigger() {
  if (d4IsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  d4RemoveTrigger();
  ScriptApp.newTrigger('d4RunOnce').timeBased().everyMinutes(10).create();
  d4Log_('10分トリガーを設置');
  SpreadsheetApp.getUi().alert('10分ごとに d4RunOnce が動きます');
}

function d4RemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'd4RunOnce') ScriptApp.deleteTrigger(t);
  });
}

function d4RunOnce() {
  if (d4IsValidationPaused_()) {
    d4Log_('検証停止中（VALIDATION_PAUSED）— スキップ');
    return;
  }
  var cfg = d4GetConfig_();
  var state = d4LoadState_();
  try {
    d4Log_('実行開始 BTC/JPY');
    var ticker = d4GetTicker_();
    var candles1h = d4GetCandles_(cfg);
    var assets = d4GetAssetsForRun_(cfg, state);

    if (candles1h.length < cfg.minCandles) {
      d4Log_('ローソク不足(' + cfg.candleType + '): ' + candles1h.length + '本');
      state.lastRunAt = new Date().toISOString();
      d4SaveState_(state);
      return;
    }

    var analysis = d4AnalyzeShibata_(candles1h, cfg, ticker.last);
    d4RunTrend_(candles1h, ticker, assets, cfg, state, analysis);

    assets = d4GetAssetsForRun_(cfg, state);
    state.lastRunAt = new Date().toISOString();
    d4AppendRunLog_(ticker, assets, state, analysis);
    d4SaveState_(state);
    d4FlushPaperTradesToMeta_();
    d4Log_('D4 完了 ' + analysis.note);
  } catch (err) {
    d4FlushPaperTradesToMeta_();
    state.lastError = String(err.message || err);
    d4SaveState_(state);
    d4Log_('ERROR: ' + state.lastError);
    throw err;
  }
}

/* ---------- 週次レポート ---------- */

function d4GenerateReport() {
  d4Log_('週次レポート生成開始');
  try {
    d4RunReport_();
    SpreadsheetApp.getUi().alert('D4_週次レポート を更新しました。');
  } catch (e) {
    d4Log_('週次レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message);
  }
}

function d4InstallReportTrigger() {
  d4RemoveReportTrigger();
  ScriptApp.newTrigger('d4GenerateReportAuto')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  d4Log_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function d4RemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'd4GenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function d4GenerateReportAuto() {
  if (d4IsValidationPaused_()) return;
  d4Log_('週次レポート自動生成開始');
  try {
    d4RunReport_();
  } catch (e) {
    d4Log_('週次レポートERROR: ' + e.message);
  }
}

function d4SetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('CANDLE_TYPE')) p.setProperty('CANDLE_TYPE', '15min');
  if (!p.getProperty('KAGI_BASE_STEP_JPY')) p.setProperty('KAGI_BASE_STEP_JPY', '15000');
  if (!p.getProperty('LAW_BUY_MIN')) p.setProperty('LAW_BUY_MIN', '1');
  if (!p.getProperty('POSITION_BTC')) p.setProperty('POSITION_BTC', '0.0001');
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', '300000');
  d4Log_('チームD 既定プロパティを設定');
}

function d4TestConnection() {
  var ticker = d4GetTicker_();
  d4Log_('接続OK last=' + ticker.last);
  SpreadsheetApp.getUi().alert('bitbank 接続OK\nBTC/JPY = ' + ticker.last.toLocaleString() + ' 円');
}
