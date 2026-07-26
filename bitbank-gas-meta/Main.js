/**
 * メタ層 — 5チーム資金配分の司令塔（Auto 責任）
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('メタ層')
    .addItem('1. シート初期化', 'metaInitSheetsMenu')
    .addItem('2. 配分を1回計算', 'metaRunOnce')
    .addItem('3. 1時間トリガー設置', 'metaInstallTrigger')
    .addItem('4. トリガー削除', 'metaRemoveTrigger')
    .addItem('5. 現在の配分を表示', 'metaShowAllocation')
    .addItem('6. 競争比較を更新', 'metaRefreshCompetitionMenu')
    .addItem('7. 紙トレードリセット', 'metaResetPaperMenu')
    .addItem('8. ログを表示', 'metaShowLog')
    .addSeparator()
    .addItem('9. 統合レポート生成（オート総括）', 'metaGenerateIntegratedReport')
    .addItem('10. 統合レポート日次トリガー設置', 'metaInstallReportTrigger')
    .addItem('11. 統合レポート日次トリガー削除', 'metaRemoveReportTrigger')
    .addSeparator()
    .addItem('12. リーグ順位を更新', 'metaUpdateLeaguesMenu')
    .addItem('13. Go/No-Goシート更新', 'metaRefreshGoNoGoMenu')
    .addSeparator()
    .addItem('14. G-SAXO META共有鍵設定', 'gsaxoMetaSetupSecretMenu')
    .addItem('15. G-SAXO Webアプリ手順', 'gsaxoMetaDeployHelpMenu')
    .addSeparator()
    .addItem('16. 稼働チームのみに整理（不要シート削除）', 'metaPruneInactiveMenu')
    .addToUi();
}

function metaPruneInactiveMenu() {
  var ui = SpreadsheetApp.getUi();
  var active = metaGetActiveTeams_().join(', ');
  var res = ui.alert(
    '稼働チームのみに整理',
    '稼働中: ' +
      active +
      '\n\n' +
      '・不要シートを削除\n' +
      '・META_統合レポートから停止チーム行を削除\n' +
      '・リーグを再計算\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  metaInitSheets_();
  var result = metaPruneInactiveSheetsAndRows_();
  try {
    metaUpdateLeagues_();
  } catch (e) {
    metaLog_('リーグ更新エラー: ' + e.message);
  }
  try {
    metaRefreshGoNoGoSheet_();
  } catch (e2) {
    metaLog_('GoNoGo更新エラー: ' + e2.message);
  }

  ui.alert(
    '整理完了\n\n' +
      '稼働: ' +
      active +
      '\n削除シート: ' +
      (result.deletedSheets.length ? result.deletedSheets.join(', ') : 'なし') +
      '\n統合レポート削除行: ' +
      result.removedRows
  );
}

function metaRefreshGoNoGoMenu() {
  metaRefreshGoNoGoSheet_();
  SpreadsheetApp.getUi().alert('META_GoNoGo シートを更新しました。');
}

function metaInitSheetsMenu() {
  metaInitSheets_();
  SpreadsheetApp.getUi().alert(
    'META_配分 / META_運用ログ / META_週次成績 / META_紙トレード / META_競争比較 / META_GoNoGo を用意しました。\n' +
      '各チーム30万円×5の紙トレード競争を META_競争比較 で表示します。'
  );
}

function metaRefreshCompetitionMenu() {
  var ticker = metaGetTicker_();
  var allocation = metaLoadAllocation_();
  if (!allocation) {
    SpreadsheetApp.getUi().alert('先に「2. 配分を1回計算」を実行してください。');
    return;
  }
  var result = metaRefreshCompetition_(ticker, allocation);
  SpreadsheetApp.getUi().alert(
    '競争比較を更新しました。\n\n' +
      '単体合計損益: ' +
      Math.round(result.standalone.pnl).toLocaleString() +
      '円\n' +
      'メタ配分損益: ' +
      Math.round(result.meta.pnl).toLocaleString() +
      '円\n' +
      '差: ' +
      Math.round(result.diff).toLocaleString() +
      '円'
  );
}

function metaResetPaperMenu() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('紙トレード口座をリセットしますか？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  metaResetPaperAccounts_();
  ui.alert('リセットしました。');
}

function metaShowAllocation() {
  var alloc = metaLoadAllocation_();
  if (!alloc) {
    SpreadsheetApp.getUi().alert('配分未計算です。「2. 配分を1回計算」を実行してください。');
    return;
  }
  SpreadsheetApp.getUi().alert(alloc.recommendation + '\n\n' + alloc.adjustmentNote);
}

function metaShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('META_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function metaInstallTrigger() {
  metaRemoveTrigger();
  ScriptApp.newTrigger('metaRunOnce').timeBased().everyHours(1).create();
  metaLog_('1時間トリガーを設置しました');
  SpreadsheetApp.getUi().alert('1時間ごとに metaRunOnce が動きます');
}

function metaRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'metaRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function metaRunOnce() {
  var cfg = metaGetConfig_();
  var state = metaLoadState_();
  var prevAlloc = metaLoadAllocation_();

  try {
    var ticker = metaGetTicker_();
    var candles = metaGetCandles1h_();
    var regime = metaDetectRegime_(candles, ticker, cfg);
    var allocation = metaComputeAllocation_(regime, cfg);
    var changed = metaAllocationChanged_(prevAlloc, allocation);
    var advice = metaSuggestImprovements_(regime, allocation);

    metaSaveAllocation_(allocation);
    metaAppendAllocRow_(regime, ticker, allocation);
    metaAppendLog_('配分', allocation.recommendation);
    metaAppendLog_('所見', advice);

    state.lastRegimeKey = regime.regimeKey;
    state.lastAllocation = allocation;
    state.lastRunAt = new Date().toISOString();
    metaSaveState_(state);

    if (cfg.lineOnChange && changed) {
      metaMaybeNotifyLine_(allocation, true);
    }

    var competition = metaRefreshCompetition_(ticker, allocation);

    metaLog_(
      regime.regimeLabel +
        ' / ' +
        allocation.recommendation +
        ' / 1H=' +
        candles.length +
        '本'
    );
    metaLog_(
      '競争: 単体損益' +
        Math.round(competition.standalone.pnl) +
        '円 / メタ損益' +
        Math.round(competition.meta.pnl) +
        '円 / 差' +
        Math.round(competition.diff) +
        '円'
    );
    metaLog_(advice);
  } catch (err) {
    metaLog_('ERROR: ' + String(err.message || err));
    throw err;
  }
}

/* ---------- 統合レポート（オート総括） ---------- */

function metaGenerateIntegratedReport() {
  metaLog_('統合レポート（オート総括）生成開始');
  try {
    metaRunIntegratedReport_();
    SpreadsheetApp.getUi().alert('META_オート総括 を更新しました。');
  } catch (e) {
    metaLog_('統合レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('統合レポート生成エラー: ' + e.message);
  }
}

function metaInstallReportTrigger() {
  metaRemoveReportTrigger();
  ScriptApp.newTrigger('metaGenerateIntegratedReportAuto')
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .create();
  metaLog_('統合レポート日次トリガー設置（毎日7時）');
  SpreadsheetApp.getUi().alert('毎日 7:00 に統合レポートを自動生成します\n（各チームが6時にMETAに送信完了後）');
}

function metaRemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'metaGenerateIntegratedReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function metaGenerateIntegratedReportAuto() {
  metaLog_('統合レポート自動生成開始');
  try {
    metaRunIntegratedReport_();
  } catch (e) {
    metaLog_('統合レポートERROR: ' + e.message);
  }
}

function metaUpdateLeaguesMenu() {
  try {
    metaUpdateLeagues_();
    SpreadsheetApp.getUi().alert('META_リーグ / META_リーダー助言 を更新しました。');
  } catch (e) {
    SpreadsheetApp.getUi().alert('リーグ更新エラー: ' + e.message);
  }
}

function metaSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('META_LINE_ON_CHANGE')) p.setProperty('META_LINE_ON_CHANGE', 'false');
  metaLog_('メタ層 既定プロパティを設定しました');
}
