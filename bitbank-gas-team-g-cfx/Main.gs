/**
 * チームG-CFX: レンジ（ロング・ショート）— GMO暗号資産FX
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームG-CFX Bot')
    .addItem('1. スクリプトプロパティを開く', 'gcfxOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'gcfxRunOnce')
    .addItem('3. 15分トリガーを設置', 'gcfxInstallTrigger')
    .addItem('3a. 30分トリガーを設置（全銘柄探索向け・推奨）', 'gcfxInstallTrigger30')
    .addItem('3b. 5分トリガーを設置', 'gcfxInstallTrigger5')
    .addItem('4. トリガーを削除', 'gcfxRemoveTrigger')
    .addItem('5. ログを表示', 'gcfxShowLog')
    .addItem('6. シート初期化', 'gcfxInitSheetsMenu')
    .addItem('7. 接続テスト', 'gcfxTestConnection')
    .addItem('8. 既定プロパティ設定', 'gcfxSetupDefaultProperties')
    .addItem('9. 日次レポート生成', 'gcfxGenerateReport')
    .addItem('10. 日次レポートトリガー設置', 'gcfxInstallReportTrigger')
    .addItem('11. 日次レポートトリガー削除', 'gcfxRemoveReportTrigger')
    .addItem('12. META接続テスト', 'gcfxTestMetaSpreadsheet')
    .addSeparator()
    .addItem('13. 最低資金テスト設定', 'gcfxSetupMinFundTestMenu')
    .addItem('14. 通常設定に戻す', 'gcfxSetupStandardMenu')
    .addItem('15. 1万円本番トライアル（XRP）', 'gcfxSetupMicroLiveMenu')
    .addItem('15b. 1万円・全銘柄探索（同時1）', 'gcfxSetupMicroLiveScanMenu')
    .addItem('16. 本番モードに切替', 'gcfxSetupProductionMenu')
    .addItem('17. 5万円本番（同時2・BTCあり）', 'gcfxSetupLive50kMenu')
    .addItem('18. 運用停止（TEAM-J移行）', 'gcfxPauseValidationMenu')
    .addToUi();
}

function gcfxInitSheetsMenu() {
  gcfxInitSheets_();
  gcfxLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('GCFX_運用ログ / GCFX_売買履歴 を用意しました');
}

function gcfxOpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'スクリプトプロパティ',
    'GMO_API_KEY / GMO_API_SECRET（暗号資産FX用・本番時必須）\n' +
      'DRY_RUN=true（デモ推奨。本番は false）\n' +
      'PAPER_JPY=500000\n' +
      'GCFX_PAIRS=btc_jpy,eth_jpy,...（省略時は10銘柄）\n' +
      'GCFX_MAX_MARGIN_JPY_PER_PAIR=50000\n' +
      'GCFX_MAX_OPEN_POSITIONS=7\n' +
      'GCFX_LEVERAGE=4\n' +
      'GCFX_TOUCH_PCT=0.12\n' +
      'GCFX_TP_RATIO=0.55\n' +
      'GCFX_PARTIAL_STOP_RATIO=0.5\n' +
      'META_SPREADSHEET_ID=（メタ層SS）\n' +
      'VALIDATION_PAUSED=true（既定・停止中。暗号実践は TEAM-J）',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function gcfxShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('GCFX_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function gcfxInstallTrigger() {
  if (gcfxIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('運用停止中のためトリガーは設置しません。\n暗号実践は TEAM-J を使用');
    return;
  }
  gcfxRemoveTrigger();
  ScriptApp.newTrigger('gcfxRunOnce').timeBased().everyMinutes(15).create();
  gcfxLog_('15分トリガーを設置');
  SpreadsheetApp.getUi().alert(
    '15分ごとに gcfxRunOnce が動きます。\nUrlFetch 日次上限を抑えます（G-CBO と併用時推奨）。'
  );
}

function gcfxInstallTrigger5() {
  if (gcfxIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('運用停止中のためトリガーは設置しません。\n暗号実践は TEAM-J を使用');
    return;
  }
  gcfxRemoveTrigger();
  ScriptApp.newTrigger('gcfxRunOnce').timeBased().everyMinutes(5).create();
  gcfxLog_('5分トリガーを設置');
  SpreadsheetApp.getUi().alert('5分ごとに gcfxRunOnce が動きます。\n※G-CBO/G-FFX 併用時は UrlFetch 上限に注意。');
}

function gcfxInstallTrigger30() {
  if (gcfxIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('運用停止中のためトリガーは設置しません。\n暗号実践は TEAM-J を使用');
    return;
  }
  gcfxRemoveTrigger();
  ScriptApp.newTrigger('gcfxRunOnce').timeBased().everyMinutes(30).create();
  gcfxLog_('30分トリガーを設置');
  SpreadsheetApp.getUi().alert(
    '30分ごとに gcfxRunOnce が動きます。\n全銘柄探索モードでは UrlFetch 節約のためこちらを推奨。'
  );
}

function gcfxRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gcfxRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function gcfxRunOnce() {
  if (gcfxIsValidationPaused_()) {
    gcfxLog_('運用停止中（VALIDATION_PAUSED）— スキップ');
    return;
  }
  gmoClearUrlFetchQuotaIfNewDay_();
  if (gmoIsUrlFetchQuotaBlocked_()) {
    gcfxLog_('UrlFetch日次上限: 本日はスキップ（太平洋時間0時リセット）');
    return;
  }

  var cfg = gcfxGetConfig_();
  var state = gcfxLoadState_();
  if (cfg.dryRun) gcfxInitPaperWallet_(state, cfg);
  var pairs = gcfxSelectPairsForRun_(gcfxGetActivePairs_(), state);
  var errors = [];
  var quotaHit = false;

  try {
    gmoEnsureCryptoEndpoints_();
    gmoResetMarginRunCache_();
    gmoGetAllTickersCached_();
    gcfxLog_('実行開始 pairs=' + pairs.length + ' DRY_RUN=' + cfg.dryRun);

    pairs.forEach(function (pairId) {
      if (quotaHit) return;
      try {
        Utilities.sleep(300);
        var result = gcfxRunRangeForPair_(pairId, cfg, state);
        var ps = gcfxGetPairState_(state, pairId);
        if (gcfxShouldAppendRunLog_(ps, result)) {
          gcfxAppendRunLog_(pairId, result, result.assets, ps.lastSignal);
          gcfxUpdateLogSnapshot_(ps, result);
        }
      } catch (e) {
        var errMsg = String(e.message || e);
        errors.push(pairId + ': ' + errMsg);
        gcfxLog_('ERROR ' + pairId + ': ' + errMsg);
        if (gmoIsUrlFetchQuotaError_(errMsg)) {
          quotaHit = true;
          gmoMarkUrlFetchQuotaExceeded_();
          gcfxLog_('UrlFetch日次上限のため残り銘柄をスキップ');
        }
      }
    });

    state.lastRunAt = new Date().toISOString();
    state.lastError = errors.length ? errors.join('; ') : null;
    gcfxSaveState_(state);

    var equity = quotaHit
      ? Math.round(state.liveBaseline || 0)
      : Math.round(gcfxAccountEquity_(cfg, state));
    if (cfg.dryRun) {
      var w = state.paperWallet;
      gcfxLog_(
        '紙トレ 現金JPY=' +
          Math.round(w.jpy) +
          ' 拘束=' +
          Math.round(w.reserved || 0) +
          ' 評価額=' +
          equity +
          ' 損益=' +
          Math.round(equity - w.initial)
      );
    } else {
      gcfxLog_('本番 評価額=' + equity + ' 基準=' + Math.round(state.liveBaseline || 0));
    }
    gcfxLog_('G-CFX 完了' + (errors.length ? ' 一部エラー' : ''));
  } catch (err) {
    var errMsg = String(err.message || err);
    if (gmoIsUrlFetchQuotaError_(errMsg)) gmoMarkUrlFetchQuotaExceeded_();
    state.lastError = errMsg;
    gcfxSaveState_(state);
    gcfxLog_('ERROR: ' + state.lastError);
    return;
  }
}

function gcfxSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('GMO_PUBLIC_API', GMO_API_CONFIG.PUBLIC_API);
  p.setProperty('GMO_PRIVATE_API', GMO_API_CONFIG.PRIVATE_API);
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', '500000');
  if (!p.getProperty('GCFX_MAX_MARGIN_JPY_PER_PAIR')) p.setProperty('GCFX_MAX_MARGIN_JPY_PER_PAIR', '50000');
  if (!p.getProperty('GCFX_LEVERAGE')) p.setProperty('GCFX_LEVERAGE', '4');
  var maxOpen = p.getProperty('GCFX_MAX_OPEN_POSITIONS');
  if (!maxOpen || maxOpen === '4') p.setProperty('GCFX_MAX_OPEN_POSITIONS', '7');
  p.setProperty('VALIDATION_PAUSED', 'true');
  gcfxLog_('チームG-CFX 既定プロパティを設定（DRY_RUN=true・停止中）');
  SpreadsheetApp.getUi().alert('DRY_RUN=true / VALIDATION_PAUSED=true を設定しました（TEAM-J 移行）');
}

function gcfxPauseValidationMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '運用停止（G-CFX）',
    '以下を実行します:\n' +
      '・VALIDATION_PAUSED=true\n' +
      '・5分/15分/30分トリガー削除\n' +
      '・日次レポートトリガー削除\n\n' +
      '※建玉がある場合は GMO 口座で手動決済してください。\n' +
      '暗号実践は TEAM-J を立ち上げます。\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  p.setProperty('VALIDATION_PAUSED', 'true');
  gcfxRemoveTrigger();
  gcfxRemoveReportTrigger();
  gcfxLog_('運用停止 VALIDATION_PAUSED=true トリガー削除');
  ui.alert('G-CFX を停止しました。\n次: gas-clasp push → スプレッドシートを再読み込み');
}

function gcfxSetupMinFundTestMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '最低資金テスト（G-CFX）',
    '以下を設定します:\n' +
      '・MIN_FUND_MODE=true（本番同様・min×2ロット・半分損切あり）\n' +
      '・GCFX_LEVERAGE=2（GMO 50%証拠金に合わせる）\n' +
      '・GCFX_MAX_MARGIN_JPY_PER_PAIR=120000\n' +
      '・GCFX_MAX_OPEN_POSITIONS=2（同時建玉のみ制限）\n' +
      '・監視銘柄=全10銘柄（GCFX_PAIRS は変更しない）\n' +
      '・PAPER_JPY=250000（紙トレ用）\n' +
      '・DRY_RUN=true（実注文なし・紙トレ）\n\n' +
      '数日テスト中は DRY_RUN=true のまま運用してください。\n' +
      '本番移行時のGMO入金目安: 25万円（2ポジ同時・半分損切込み）\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  p.setProperty('MIN_FUND_MODE', 'true');
  p.setProperty('GCFX_LEVERAGE', '2');
  p.setProperty('GCFX_MAX_MARGIN_JPY_PER_PAIR', '120000');
  p.setProperty('GCFX_MAX_OPEN_POSITIONS', '2');
  p.deleteProperty('GCFX_PAIRS');
  p.setProperty('PAPER_JPY', '250000');
  p.setProperty('DRY_RUN', 'true');
  gcfxLog_('最低資金テスト設定を適用 DRY_RUN=true 半分損切=本番同様');
  ui.alert(
    '設定完了（紙トレ）',
    'DRY_RUN=true を設定しました。実注文は送りません。\n' +
      'ロットは本番同様 min×2（1H半分損切あり）。\n\n' +
      '次のステップ:\n' +
      '1. メニュー「2. 1回実行」（ログに DRY_RUN=true を確認）\n' +
      '2. メニュー「3. 5分トリガー」\n' +
      '3. メニュー「10. 日次レポートトリガー」（任意）\n' +
      '4. 数日後、GCFX_運用ログ / 売買履歴で確認\n\n' +
      '※スクリプトプロパティで DRY_RUN=false にしないでください',
    ui.ButtonSet.OK
  );
}

function gcfxSetupStandardMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '通常設定に戻す（G-CFX）',
    'MIN_FUND_MODE=false / 2倍ロット / 同時7 / 銘柄10 に戻します。\n続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  p.setProperty('MIN_FUND_MODE', 'false');
  p.deleteProperty('MICRO_LIVE_MODE');
  p.setProperty('GCFX_LEVERAGE', '4');
  p.setProperty('GCFX_MAX_MARGIN_JPY_PER_PAIR', '50000');
  p.setProperty('GCFX_MAX_OPEN_POSITIONS', '7');
  p.deleteProperty('GCFX_PAIRS');
  p.setProperty('PAPER_JPY', '500000');
  gcfxLog_('通常設定に戻しました');
  ui.alert('通常設定に戻しました（GCFX_PAIRS は全10銘柄）');
}

/** 1万円本番の共通設定（銘柄リストは呼び出し側で指定） */
function gcfxApplyMicroLiveBaseProps_(p) {
  p.setProperty('MIN_FUND_MODE', 'true');
  p.setProperty('MICRO_LIVE_MODE', 'true');
  p.setProperty('GMO_PUBLIC_API', GMO_API_CONFIG.PUBLIC_API);
  p.setProperty('GMO_PRIVATE_API', GMO_API_CONFIG.PRIVATE_API);
  p.setProperty('GCFX_LEVERAGE', '25');
  p.setProperty('GCFX_MAX_MARGIN_JPY_PER_PAIR', '4000');
  p.setProperty('GCFX_MAX_OPEN_POSITIONS', '1');
  p.setProperty('PAPER_JPY', '10000');
  p.setProperty('DRY_RUN', 'false');
}

/** 証拠金4000円上限で建てられる銘柄（BTC除外・安い順） */
var GCFX_MICRO_LIVE_SCAN_PAIRS =
  'xrp_jpy,doge_jpy,ada_jpy,sui_jpy,dot_jpy,link_jpy,sol_jpy,ltc_jpy,eth_jpy';

function gcfxApplyMicroLiveProps_(p) {
  gcfxApplyMicroLiveBaseProps_(p);
  p.setProperty('GCFX_PAIRS', 'xrp_jpy');
  p.deleteProperty('MICRO_LIVE_SCAN_MODE');
}

function gcfxApplyMicroLiveScanProps_(p) {
  gcfxApplyMicroLiveBaseProps_(p);
  p.setProperty('MICRO_LIVE_SCAN_MODE', 'true');
  p.setProperty('GCFX_SCAN_BATCH_SIZE', '3');
  p.setProperty('GCFX_PAIRS', GCFX_MICRO_LIVE_SCAN_PAIRS);
}

function gcfxSetupMicroLiveScanMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '1万円・全銘柄探索（G-CFX）',
    '暗号資産FX口座 1万円向け。レンジ手法は機会が少ないため、\n' +
      '複数銘柄を監視しつつ同時建玉は1件に制限します。\n\n' +
      '・DRY_RUN=false（実注文）\n' +
      '・監視: 9銘柄（BTC/JPY は最小ロットで証拠金超過のため除外）\n' +
      '・同時建玉: 1（他銘柄は「新規見送り(保有上限)」）\n' +
      '・1銘柄上限: 4,000円\n' +
      '・レバ25\n\n' +
      '※ G-CBO（DOGE）と同一口座の場合、合計2建玉まで可能\n' +
      '※ **30分トリガー推奨**（15分だと UrlFetch 上限に達しやすい）\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  gcfxApplyMicroLiveScanProps_(p);
  gcfxLog_('1万円全銘柄探索設定 pairs=9 DRY_RUN=false MAX_OPEN=1');
  ui.alert(
    'G-CFX 全銘柄探索設定完了',
    '次のステップ:\n' +
      '1. メニュー「7. 接続テスト」\n' +
      '2. メニュー「2. 1回実行」（ログに pairs=9 を確認）\n' +
      '3. メニュー「3a. 30分トリガー」\n' +
      '4. GCFX_運用ログで各銘柄のレンジ判定を確認',
    ui.ButtonSet.OK
  );
}

function gcfxSetupMicroLiveMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '1万円本番トライアル（G-CFX）',
    '暗号資産FX口座 1万円向けの超少額本番設定です。\n\n' +
      '・DRY_RUN=false（実注文）\n' +
      '・銘柄: XRP/JPY のみ（G-CBO は DOGE に分担）\n' +
      '・同時建玉: 1\n' +
      '・1銘柄上限: 4,000円\n' +
      '・レバ25（GMO 4%想定）\n\n' +
      '前提:\n' +
      '・GMO 暗号資産FX用 APIキー設定済み\n' +
      '・口座残高 ≈1万円\n' +
      '・G-CBO 側も「16. 1万円本番トライアル」を実行\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  gcfxApplyMicroLiveProps_(p);
  gcfxLog_('1万円本番トライアル設定 XRP/JPY DRY_RUN=false');
  ui.alert(
    'G-CFX 本番トライアル設定完了',
    '次のステップ:\n' +
      '1. メニュー「7. 接続テスト」（Private OK・余力≈1万円）\n' +
      '2. メニュー「2. 1回実行」（DRY_RUN=false）\n' +
      '3. メニュー「3a. 30分トリガー」\n' +
      '4. メニュー「10. 日次レポートトリガー」\n' +
      '5. G-CBO SS でも「16. 1万円本番トライアル」を実行',
    ui.ButtonSet.OK
  );
}

/** 5万円本番: 同時2建玉・全10銘柄（BTC含む）・G-SAXO 検証向け */
function gcfxApplyLive50kProps_(p) {
  p.setProperty('GMO_PUBLIC_API', GMO_API_CONFIG.PUBLIC_API);
  p.setProperty('GMO_PRIVATE_API', GMO_API_CONFIG.PRIVATE_API);
  p.setProperty('MIN_FUND_MODE', 'false');
  p.deleteProperty('MICRO_LIVE_MODE');
  p.deleteProperty('MICRO_LIVE_SCAN_MODE');
  p.deleteProperty('GCFX_SCAN_BATCH_SIZE');
  p.deleteProperty('GCFX_SCAN_RUN_INDEX');
  p.deleteProperty('GCFX_PAIRS');
  p.setProperty('GCFX_LEVERAGE', '4');
  p.setProperty('GCFX_MAX_MARGIN_JPY_PER_PAIR', '50000');
  p.setProperty('GCFX_MAX_OPEN_POSITIONS', '2');
  p.setProperty('GCFX_H1_RANGE_MAX_PCT', '5');
  p.setProperty('PAPER_JPY', '50000');
  p.setProperty('DRY_RUN', 'false');
}

function gcfxSetupLive50kMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '5万円本番（同時2・BTCあり）',
    '暗号資産FX口座 約5万円向けの本番設定です。\n\n' +
      '・DRY_RUN=false（実注文）\n' +
      '・監視: 全10銘柄（BTC/JPY 含む）\n' +
      '・同時建玉: 2\n' +
      '・1銘柄上限: 50,000円\n' +
      '・GCFX_H1_RANGE_MAX_PCT=5（暗号向け）\n' +
      '・scan ローテーション: オフ\n\n' +
      '前提:\n' +
      '・GMO 暗号資産FX用 APIキー設定済み\n' +
      '・口座残高 ≈5万円（BTC+LTC 同時時の余力目安）\n' +
      '・G-FFX / G-CBO / E のトリガーは停止済み\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  gcfxApplyLive50kProps_(p);
  gcfxLog_('5万円本番設定 pairs=10 MAX_OPEN=2 BTC=含む DRY_RUN=false H1=5%');
  ui.alert(
    'G-CFX 5万円本番設定完了',
    '次のステップ:\n' +
      '1. GMO 口座へ入金（合計 ≈5万円）\n' +
      '2. メニュー「7. 接続テスト」（Private OK・余力確認）\n' +
      '3. メニュー「2. 1回実行」（pairs=10・DRY_RUN=false）\n' +
      '4. メニュー「3b. 5分トリガー」\n' +
      '5. メニュー「10. 日次レポートトリガー」（任意）\n' +
      '6. GCFX_運用ログでレンジ判定を確認',
    ui.ButtonSet.OK
  );
}

function gcfxSetupProductionMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '本番モード（GMO暗号資産FX）',
    'DRY_RUN=false にします。\n' +
      '・GMO_API_KEY / GMO_API_SECRET が暗号資産FX用であることを確認\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  PropertiesService.getScriptProperties().setProperty('DRY_RUN', 'false');
  gcfxLog_('本番モード: DRY_RUN=false');
  ui.alert('DRY_RUN=false を設定しました。メニュー「7. 接続テスト」を実行してください。');
}

function gcfxTestConnection() {
  var cfg = gcfxGetConfig_();
  var result = gmoTestConnection_();
  var msg =
    'GMO Public OK（暗号資産FX）\n' +
    (result.endpoints ? result.endpoints.public + '\n' : '') +
    result.symbol +
    ' = ' +
    result.last.toLocaleString() +
    ' 円\nDRY_RUN=' +
    cfg.dryRun;
  if (result.margin && !result.margin.error) {
    msg +=
      '\n\nPrivate OK\n取引余力=' +
      Number(result.margin.availableAmount).toLocaleString() +
      ' 円\n拘束=' +
      Number(result.margin.margin).toLocaleString() +
      ' 円';
  } else if (!cfg.dryRun) {
    msg += '\n\nPrivate NG: ' + (result.margin.error || 'APIキー未設定');
  } else {
    msg += '\n\nPrivate: スキップ（DRY_RUN・キー未設定可）';
  }
  gcfxLog_('接続テスト ' + result.symbol + '=' + result.last);
  SpreadsheetApp.getUi().alert(msg);
}
