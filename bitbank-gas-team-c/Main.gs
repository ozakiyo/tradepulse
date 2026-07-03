/**
 * チームC: BITBANK × GAS — P&F順張り（BTC/JPY 専用）
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームC Bot')
    .addItem('1. スクリプトプロパティを開く', 'c3OpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'c3RunOnce')
    .addItem('3. 10分トリガーを設置', 'c3InstallTrigger')
    .addItem('4. トリガーを削除', 'c3RemoveTrigger')
    .addItem('5. ログを表示', 'c3ShowLog')
    .addItem('6. シート初期化', 'c3InitSheetsMenu')
    .addItem('7. 週次レポート生成', 'c3GenerateReport')
    .addItem('8. 日次レポートトリガー設置', 'c3InstallReportTrigger')
    .addItem('9. 日次レポートトリガー削除', 'c3RemoveReportTrigger')
    .addToUi();
}

function c3InitSheetsMenu() {
  c3InitSheets_();
  c3Log_('シート初期化完了');
  SpreadsheetApp.getUi().alert('C3_運用ログ / C3_売買履歴 を用意しました');
}

function c3OpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'BITBANK_API_KEY / BITBANK_API_SECRET\nDRY_RUN=true\nPF_BOX_JPY=50000\nPOSITION_BTC=0.0001\nPAPER_JPY=300000\nMETA_SPREADSHEET_ID（任意）\n\n※USD/JPYは bitbank-gas-team-c-fx/',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function c3ShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('C3_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function c3InstallTrigger() {
  if (c3IsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  c3RemoveTrigger();
  ScriptApp.newTrigger('c3RunOnce').timeBased().everyMinutes(10).create();
  c3Log_('10分トリガーを設置');
  SpreadsheetApp.getUi().alert('10分ごとに c3RunOnce が動きます');
}

function c3RemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'c3RunOnce') ScriptApp.deleteTrigger(t);
  });
}

function c3RunOnce() {
  var cfg = c3GetConfig_();
  var state = c3LoadState_();
  try {
    c3Log_('実行開始 BTC/JPY');
    var ticker = c3GetTicker_();
    var candles1h = c3GetCandles1h_();
    var assets = c3GetAssetsForRun_(cfg, state);

    if (candles1h.length < C3_CONFIG.MIN_CANDLES_1H) {
      c3Log_('ローソク不足: ' + candles1h.length + '本');
      state.lastRunAt = new Date().toISOString();
      c3SaveState_(state);
      return;
    }

    var pf = c3AnalyzePointFigure_(candles1h, cfg, ticker.last);
    c3RunTrend_(candles1h, ticker, assets, cfg, state, pf);

    assets = c3GetAssetsForRun_(cfg, state);
    state.lastRunAt = new Date().toISOString();
    c3AppendRunLog_(ticker, assets, state, pf);
    c3SaveState_(state);
    c3FlushPaperTradesToMeta_();
    c3Log_('C3 完了 ' + pf.note);
  } catch (err) {
    c3FlushPaperTradesToMeta_();
    state.lastError = String(err.message || err);
    c3SaveState_(state);
    c3Log_('ERROR: ' + state.lastError);
    throw err;
  }
}

/* ---------- 週次レポート ---------- */

function c3GenerateReport() {
  c3Log_('週次レポート生成開始');
  try {
    c3RunReport_();
    SpreadsheetApp.getUi().alert('C3_週次レポート を更新しました。');
  } catch (e) {
    c3Log_('週次レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message);
  }
}

function c3InstallReportTrigger() {
  c3RemoveReportTrigger();
  ScriptApp.newTrigger('c3GenerateReportAuto')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  c3Log_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function c3RemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'c3GenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function c3GenerateReportAuto() {
  if (c3IsValidationPaused_()) return;
  c3Log_('週次レポート自動生成開始');
  try {
    c3RunReport_();
  } catch (e) {
    c3Log_('週次レポートERROR: ' + e.message);
  }
}

function c3SetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('PF_BOX_JPY')) p.setProperty('PF_BOX_JPY', '50000');
  if (!p.getProperty('POSITION_BTC')) p.setProperty('POSITION_BTC', '0.0001');
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', '300000');
  c3Log_('チームC 既定プロパティを設定');
}

function c3TestConnection() {
  var ticker = c3GetTicker_();
  c3Log_('接続OK last=' + ticker.last);
  SpreadsheetApp.getUi().alert('bitbank 接続OK\nBTC/JPY = ' + ticker.last.toLocaleString() + ' 円');
}
