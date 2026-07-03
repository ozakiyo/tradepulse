/**
 * チームE: BITBANK × GAS — ドンチャン順張り（BTC/JPY 専用）
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームE Bot')
    .addItem('1. スクリプトプロパティを開く', 'e5OpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'e5RunOnce')
    .addItem('3. 10分トリガーを設置', 'e5InstallTrigger')
    .addItem('4. トリガーを削除', 'e5RemoveTrigger')
    .addItem('5. ログを表示', 'e5ShowLog')
    .addItem('6. シート初期化', 'e5InitSheetsMenu')
    .addItem('7. 週次レポート生成', 'e5GenerateReport')
    .addItem('8. 日次レポートトリガー設置', 'e5InstallReportTrigger')
    .addItem('9. 日次レポートトリガー削除', 'e5RemoveReportTrigger')
    .addToUi();
}

function e5InitSheetsMenu() {
  e5InitSheets_();
  e5Log_('シート初期化完了');
  SpreadsheetApp.getUi().alert('E5_運用ログ / E5_売買履歴 を用意しました');
}

function e5OpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'BITBANK_API_KEY / BITBANK_API_SECRET\nDRY_RUN=true\nCANDLE_TYPE=15min\nDONCHIAN_ENTRY_BARS=15\nADX_MIN=18\nER_MIN=0.22\nBIAS_ALLOW_NEUTRAL=true\nPOSITION_BTC=0.0001\nPAPER_JPY=300000\nMETA_SPREADSHEET_ID（任意）\n\n※USD/JPYは bitbank-gas-team-e-fx/',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function e5ShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('E5_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function e5InstallTrigger() {
  e5RemoveTrigger();
  ScriptApp.newTrigger('e5RunOnce').timeBased().everyMinutes(10).create();
  e5Log_('10分トリガーを設置');
  SpreadsheetApp.getUi().alert('10分ごとに e5RunOnce が動きます');
}

function e5RemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'e5RunOnce') ScriptApp.deleteTrigger(t);
  });
}

function e5RunOnce() {
  var cfg = e5GetConfig_();
  var state = e5LoadState_();
  try {
    e5Log_('実行開始 BTC/JPY');
    var ticker = e5GetTicker_();
    var candles1h = e5GetCandles_(cfg);
    var assets = e5GetAssetsForRun_(cfg, state);

    if (candles1h.length < cfg.minCandles) {
      e5Log_('ローソク不足(' + cfg.candleType + '): ' + candles1h.length + '本');
      state.lastRunAt = new Date().toISOString();
      e5SaveState_(state);
      return;
    }

    var analysis = e5AnalyzeTrend_(candles1h, cfg, ticker.last);
    e5RunTrend_(candles1h, ticker, assets, cfg, state, analysis);

    assets = e5GetAssetsForRun_(cfg, state);
    state.lastRunAt = new Date().toISOString();
    e5AppendRunLog_(ticker, assets, state, analysis);
    e5SaveState_(state);
    e5FlushPaperTradesToMeta_();
    e5Log_('E5 完了 ' + analysis.note);
  } catch (err) {
    e5FlushPaperTradesToMeta_();
    state.lastError = String(err.message || err);
    e5SaveState_(state);
    e5Log_('ERROR: ' + state.lastError);
    throw err;
  }
}

/* ---------- 週次レポート ---------- */

function e5GenerateReport() {
  e5Log_('週次レポート生成開始');
  try {
    e5RunReport_();
    SpreadsheetApp.getUi().alert('E5_週次レポート を更新しました。');
  } catch (e) {
    e5Log_('週次レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message);
  }
}

function e5InstallReportTrigger() {
  e5RemoveReportTrigger();
  ScriptApp.newTrigger('e5GenerateReportAuto')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  e5Log_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function e5RemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'e5GenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function e5GenerateReportAuto() {
  e5Log_('週次レポート自動生成開始');
  try {
    e5RunReport_();
  } catch (e) {
    e5Log_('週次レポートERROR: ' + e.message);
  }
}

function e5SetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('CANDLE_TYPE')) p.setProperty('CANDLE_TYPE', '15min');
  if (!p.getProperty('DONCHIAN_ENTRY_BARS')) p.setProperty('DONCHIAN_ENTRY_BARS', '15');
  if (!p.getProperty('DONCHIAN_EXIT_BARS')) p.setProperty('DONCHIAN_EXIT_BARS', '8');
  if (!p.getProperty('ADX_MIN')) p.setProperty('ADX_MIN', '18');
  if (!p.getProperty('ER_MIN')) p.setProperty('ER_MIN', '0.22');
  if (!p.getProperty('BIAS_ALLOW_NEUTRAL')) p.setProperty('BIAS_ALLOW_NEUTRAL', 'true');
  if (!p.getProperty('POSITION_BTC')) p.setProperty('POSITION_BTC', '0.0001');
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', '300000');
  e5Log_('チームE 既定プロパティを設定');
}

function e5TestConnection() {
  var ticker = e5GetTicker_();
  e5Log_('接続OK last=' + ticker.last);
  SpreadsheetApp.getUi().alert('bitbank 接続OK\nBTC/JPY = ' + ticker.last.toLocaleString() + ' 円');
}
