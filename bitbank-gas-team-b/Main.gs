/**
 * チームB: BITBANK × GAS — トラリピ専用
 * ATRで間隔変動 / RSI+BBで仕掛けレンジ拡大・縮小
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームB Bot')
    .addItem('1. スクリプトプロパティを開く', 'b2OpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'b2RunOnce')
    .addItem('3. 1分トリガーを設置', 'b2InstallTrigger')
    .addItem('4. トリガーを削除', 'b2RemoveTrigger')
    .addItem('5. ログを表示', 'b2ShowLog')
    .addItem('6. シート初期化', 'b2InitSheetsMenu')
    .addItem('7. 週次レポート生成', 'b2GenerateReport')
    .addItem('8. 日次レポートトリガー設置', 'b2InstallReportTrigger')
    .addItem('9. 日次レポートトリガー削除', 'b2RemoveReportTrigger')
    .addToUi();
}

function b2InitSheetsMenu() {
  b2InitSheets_();
  b2Log_('シート初期化完了');
  SpreadsheetApp.getUi().alert('B2_運用ログ / B2_売買履歴 を用意しました');
}

function b2OpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'スクリプトプロパティ',
    'BITBANK_API_KEY / BITBANK_API_SECRET\nDRY_RUN=true\nTORARIPI_WIDTH_JPY=50000（基準間隔）\nGRID_LEVELS=30\nTRAIL_ACTIVATE_STEP_MULT=1（買値+1段でトレール開始）\nTRAIL_CALLBACK_PCT=0.25',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function b2ShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('B2_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function b2InstallTrigger() {
  b2RemoveTrigger();
  ScriptApp.newTrigger('b2RunOnce').timeBased().everyMinutes(1).create();
  b2Log_('1分トリガーを設置しました');
  SpreadsheetApp.getUi().alert('1分ごとに b2RunOnce が動きます');
}

function b2RemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'b2RunOnce') ScriptApp.deleteTrigger(t);
  });
}

function b2RunOnce() {
  var cfg = b2GetConfig_();
  var state = b2LoadState_();
  try {
    b2Log_('実行開始');
    var ticker = b2GetTicker_();
    b2Log_('ticker OK');
    var candles1h = b2GetCandles1h_();
    b2Log_('candles ' + candles1h.length + '本');
    var assets = b2GetAssetsForRun_(cfg, state);
    b2Log_('assets JPY=' + Math.round(assets.jpy) + (assets.paper ? '（紙・実残高は不使用）' : ''));

    if (candles1h.length < B2_CONFIG.MIN_CANDLES_1H) {
      b2Log_('ローソク不足: ' + candles1h.length + '本（必要' + B2_CONFIG.MIN_CANDLES_1H + '本）');
      state.lastRunAt = new Date().toISOString();
      b2SaveState_(state);
      return;
    }

    var result = b2RunToraripi_(candles1h, ticker, assets, cfg, state);
    state.lastRunAt = new Date().toISOString();

    if (b2ShouldAppendRunLog_(state, cfg, result.active)) {
      var detail = result.plan.note;
      if (result.active) {
        detail += ' | ' + result.activeNote;
      } else {
        detail += ' | 定期スナップショット';
      }
      b2AppendRunLog_(ticker, assets, state, result.plan, detail);
      state.lastRunLogAt = new Date().toISOString();
    } else {
      b2Log_('運用ログ省略（動きなし・' + (cfg.runLogIntervalMin || 30) + '分未満）');
    }

    b2SaveState_(state);
    b2FlushPaperTradesToMeta_();

    b2Log_('B2 完了 last=' + ticker.last + ' / ' + result.plan.note);
  } catch (err) {
    b2FlushPaperTradesToMeta_();
    state.lastError = String(err.message || err);
    b2SaveState_(state);
    b2Log_('ERROR: ' + state.lastError);
    throw err;
  }
}

/* ---------- 週次レポート ---------- */

function b2GenerateReport() {
  b2Log_('週次レポート生成開始');
  try {
    b2RunReport_();
    SpreadsheetApp.getUi().alert('B2_週次レポート を更新しました。');
  } catch (e) {
    b2Log_('週次レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message);
  }
}

function b2InstallReportTrigger() {
  b2RemoveReportTrigger();
  ScriptApp.newTrigger('b2GenerateReportAuto')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  b2Log_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function b2RemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'b2GenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function b2GenerateReportAuto() {
  b2Log_('週次レポート自動生成開始');
  try {
    b2RunReport_();
  } catch (e) {
    b2Log_('週次レポートERROR: ' + e.message);
  }
}

function b2SetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('TORARIPI_WIDTH_JPY')) p.setProperty('TORARIPI_WIDTH_JPY', '50000');
  if (!p.getProperty('BTC_PER_LEVEL')) p.setProperty('BTC_PER_LEVEL', '0.0001');
  if (!p.getProperty('GRID_LEVELS')) p.setProperty('GRID_LEVELS', '30');
  b2Log_('チームB 既定プロパティを設定（DRY_RUN=true）');
}

/** 接続テスト（初回はエディタから実行して権限を許可） */
function b2TestConnection() {
  var ticker = b2GetTicker_();
  b2Log_('接続OK last=' + ticker.last);
  SpreadsheetApp.getUi().alert('bitbank 接続OK\nBTC/JPY = ' + ticker.last.toLocaleString() + ' 円');
}
