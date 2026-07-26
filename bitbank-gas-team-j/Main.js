/**
 * チームJ — メニュー・トラリピ実行
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームJ Bot')
    .addItem('1. 手数料一覧（公式）', 'jShowFeeTable')
    .addItem('2. 銘柄別手数料・1R利益', 'jShowPairCostAnalysis')
    .addItem('3. 銘柄選定ランキング', 'jShowRankMenu')
    .addItem('3b. ランキング強制更新', 'jShowRankMenuForce')
    .addItem('4. 口座予算で自動選定', 'jShowBudgetPickMenu')
    .addSeparator()
    .addItem('5. 接続テスト', 'jTestConnection')
    .addItem('6. BTC長期保有の確認', 'jShowReserveStatus_')
    .addItem('7. ペア仕様をAPI同期', 'jSyncInstrumentsMenu')
    .addItem('8. シート初期化', 'jInitSheetsMenu')
    .addItem('9. 本番運用設定', 'jSetupProductionProperties')
    .addItem('10. ログ表示', 'jShowLog')
    .addItem('10b. LINEテスト送信', 'jTestLineMenu')
    .addItem('11. 1回実行', 'jRunOnceMenu')
    .addItem('12. 5分トリガーを設置', 'jInstallTrigger')
    .addItem('13. トリガーを削除', 'jRemoveTrigger')
    .addSeparator()
    .addItem('14. 全リセットして再スタート', 'jResetAndRestartMenu')
    .addItem('15. 税務集計を更新', 'jRefreshTaxSummaryMenu')
    .addItem('16. 塩漬け・自動ロット状況', 'jShowCapitalAllocMenu')
    .addItem('17. 取引履歴を同期', 'jSyncApiTradeHistoryMenu')
    .addItem('17b. 税務明細を再計算', 'jRebuildApiTaxDetailMenu')
    .addToUi();
}

function jShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('J_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function jShowFeeTable() {
  SpreadsheetApp.getUi().alert(jBuildFeeSummaryText_(null));
}

function jShowPairCostAnalysis() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('銘柄分析', 'pair名（例: trx_jpy）', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pair = String(res.getResponseText() || '').trim().toLowerCase();
  if (!pair) return;

  var cfg = jGetConfig_();
  var a = jAnalyzePairCosts_(pair, cfg);
  var lines = [jBuildFeeSummaryText_(pair), ''];

  if (!a.dailyRangeOk) {
    lines.push('日足レンジ NG: ' + (a.note || ''));
    ui.alert(lines.join('\n'));
    return;
  }

  lines.push('【' + a.label + ' @ ' + a.last + '円】');
  lines.push('1段数量: ' + a.levelAmount + ' （適用ロット=' + jGetEffectiveMinLevelJpy_(cfg) + '円 下限=' + cfg.minLevelJpy + '）');
  lines.push('トラップ間隔: ' + a.trapStep + ' (' + a.trapStepPct.toFixed(2) + '%) 本数=' + a.levels);
  if (a.moveStepRatio != null) {
    lines.push(
      '日中変動/trapStep: ' +
        a.moveStepRatio +
        'x （日中幅≈' +
        a.intradayMoveJpy +
        '円 / 間隔' +
        a.trapStep +
        '円）'
    );
  }
  lines.push('1セット資金(' + cfg.feeRoleCapital + '): ' + a.oneSetJpy + '円');
  lines.push('最悪グリッド(' + cfg.feeRoleCapital + '): ' + a.worstCaseJpy + '円');
  lines.push(
    '1R利益 maker: 粗利' +
      a.roundProfitMaker.grossJpy +
      ' 手数料買' +
      a.roundProfitMaker.feeBuyJpy +
      ' 売' +
      a.roundProfitMaker.feeSellJpy +
      ' → 純' +
      a.roundProfitMaker.netJpy +
      '円'
  );
  lines.push('1R利益 taker(参考): 純' + a.roundProfitTaker.netJpy + '円');
  lines.push('損益分岐trapStep(maker): ' + a.minProfitableTrapStep);
  lines.push('現trapStepは' + (a.trapProfitable ? '利益可' : '手数料負け注意'));

  jLog_(lines.join('\n'));
  ui.alert(lines.join('\n'));
}

function jShowRankMenu() {
  jShowRankMenuCore_(false);
}

function jShowRankMenuForce() {
  jClearRankCache_();
  jShowRankMenuCore_(true);
}

function jShowRankMenuCore_(forceRefresh) {
  var cfg = jGetConfig_();
  var ranked = jRankCandidatePairs_(cfg, { forceRefresh: forceRefresh });
  var stats = ranked._stats || {};
  var cacheInfo = ranked._cache;
  var statusLine = jFormatRankCacheStatus_(cacheInfo);

  try {
    jWriteRankSheet_(ranked, {
      stats: stats,
      cache: cacheInfo || {},
      cfg: cfg,
      skipLists:
        (cacheInfo && cacheInfo.skipLists) || jLoadRankSkipLists_() || jEmptyRankSkipLists_(),
    });
  } catch (eSheet) {
    jLog_('J_ランキング書込失敗: ' + (eSheet.message || eSheet));
  }

  if (!ranked.length) {
    var msg = [
      statusLine ? statusLine : 'ランキング更新中…',
      '',
      !cacheInfo || cacheInfo.complete
        ? '日足レンジOKの候補がありません。'
        : 'まだ全銘柄のスキャンが終わっていません。メニュー「3. 銘柄選定ランキング」を再実行してください。',
      '',
      '詳細はシート「J_ランキング」を確認してください。',
      '',
      '【診断】スキャン' +
        (stats.scanned || (cacheInfo && cacheInfo.progress) || '?') +
        '/' +
        (cacheInfo && cacheInfo.total ? cacheInfo.total : '?') +
        '銘柄',
      '  レンジOK: ' + (stats.rangeOk || 0),
      '  月足↓除外: ' + (stats.monthlyDown || 0),
      '  日足不足: ' + (stats.dailyShort || 0),
      '  レンジNG: ' + (stats.rangeNg || 0),
      '  APIエラー: ' + (stats.errors || 0),
    ].join('\n');
    jLog_(msg);
    SpreadsheetApp.getUi().alert(msg);
    return;
  }

  var lines = [
    '=== 銘柄選定ランキング（上位' + (J_CONFIG.RANK_TOP_N || 5) + '） ===',
    'シート「J_ランキング」に診断＋一覧を書きました。',
    statusLine ? statusLine : '',
    '',
  ];
  var n = Math.min(J_CONFIG.RANK_TOP_N || 5, ranked.length);
  for (var i = 0; i < n; i++) {
    lines.push(i + 1 + '. ' + jFormatRankRow_(ranked[i]));
  }
  if (cacheInfo && !cacheInfo.complete) {
    lines.push('');
    lines.push('※ 残り銘柄あり — 「3. 銘柄選定ランキング」を再実行で続き');
  }
  jLog_(lines.join('\n'));
  SpreadsheetApp.getUi().alert(lines.filter(Boolean).join('\n'));
}

function jShowCapitalAllocMenu() {
  var cfg = jGetConfig_();
  var global = jLoadGlobalState_();
  var text = jFormatCapitalAllocSummary_(cfg, global);
  jLog_(text);
  SpreadsheetApp.getUi().alert(text);
}

function jShowBudgetPickMenu() {
  var cfg = jGetConfig_();
  var global = jLoadGlobalState_();
  jUpdateAutoLotSizing_(cfg, global, { force: true });
  if (cfg.dryRun) {
    if (jSyncPaperCapital_(global, cfg)) jSaveGlobalState_(global);
  }

  var budget;
  try {
    budget = jGetAccountBudgetJpy_(cfg, global);
  } catch (e) {
    SpreadsheetApp.getUi().alert('残高取得失敗: ' + (e.message || e));
    return;
  }

  var pick = jPickPairsForBudget_(budget, cfg, global.activePairs || [], global);
  var modeLabel = cfg.dryRun ? '紙トレ（PAPER_JPY基準）' : '本番（API残高）';
  var lines = [
    'モード: ' + modeLabel,
    '口座予算: ' + Math.round(budget) + '円（使用上限' + pick.budgetJpy + '円）',
    'MIN_LEVEL_JPY=' + cfg.minLevelJpy + ' 適用ロット=' + jGetEffectiveMinLevelJpy_(cfg) + ' MAX_ACTIVE_PAIRS=' + cfg.maxActivePairs,
    '候補: ' + pick.candidates + '銘柄',
    '選定: ' + pick.picked.length + '銘柄 合計最悪=' + pick.usedJpy + '円',
    '',
    '※ 資金追加時はリセット不要（本番=入金 / 紙トレ=PAPER_JPY増額）',
    '',
  ];
  pick.picked.forEach(function (r, i) {
    lines.push(i + 1 + '. ' + jFormatRankRow_(r));
  });
  if (!pick.picked.length) lines.push('（予算内に収まる銘柄なし）');

  jLog_(lines.join('\n'));
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function jSyncInstrumentsMenu() {
  var map = jEnsureInstrumentsSyncedDaily_(true);
  var n = Object.keys(map).length;
  jLog_('ペア同期（手動）: ' + n + '銘柄');
  SpreadsheetApp.getUi().alert('API同期完了\nJPY建て ' + n + ' ペア');
}

function jSetupProductionProperties() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('DRY_RUN', 'false');
  p.setProperty('VALIDATION_PAUSED', 'false');
  p.setProperty('PAPER_JPY', String(J_CONFIG.PAPER_JPY_DEFAULT));
  p.setProperty('MIN_LEVEL_JPY', String(J_CONFIG.MIN_LEVEL_JPY));
  p.setProperty('ACCOUNT_BUDGET_PCT', String(J_CONFIG.ACCOUNT_BUDGET_PCT));
  p.setProperty('MAX_ACTIVE_PAIRS', String(J_CONFIG.MAX_ACTIVE_PAIRS));
  p.setProperty('PAIR_BUDGET_JPY', String(J_CONFIG.PAIR_BUDGET_JPY));
  p.setProperty('AUTO_LOT_SIZING', String(J_CONFIG.AUTO_LOT_SIZING !== false));
  p.setProperty('FULL_BOX_TRAP', String(J_CONFIG.FULL_BOX_TRAP !== false));
  p.setProperty('DAILY_RANGE_MAX_PCT', String(J_CONFIG.DAILY_RANGE_MAX_PCT));
  p.setProperty('DAILY_RANGE_MAX_PCT_BTC', String(J_CONFIG.DAILY_RANGE_MAX_PCT_BTC));
  if (!p.getProperty('MIN_GRID_LEVELS')) p.setProperty('MIN_GRID_LEVELS', String(J_CONFIG.MIN_GRID_LEVELS));
  if (!p.getProperty('BTC_RESERVE_AMOUNT')) {
    p.setProperty('BTC_RESERVE_AMOUNT', String(J_CONFIG.BTC_RESERVE_AMOUNT));
  }
  if (!p.getProperty('OWN_ORDERS_ONLY')) {
    p.setProperty('OWN_ORDERS_ONLY', String(J_CONFIG.OWN_ORDERS_ONLY_DEFAULT));
  }
  // 除外はシート「J_除外銘柄」で管理（Properties は追記用に空へ）
  p.setProperty('J_EXCLUDE_PAIRS', '');
  jInitSheets_();
  jEnsureExcludeSheet_();
  jLog_('本番運用設定を適用');
  SpreadsheetApp.getUi().alert(
    '本番運用設定を適用しました\n\n' +
      'DRY_RUN=false\n' +
      'VALIDATION_PAUSED=false\n' +
      'MAX_ACTIVE_PAIRS=' +
      J_CONFIG.MAX_ACTIVE_PAIRS +
      '\nPAIR_BUDGET_JPY=' +
      J_CONFIG.PAIR_BUDGET_JPY +
      '\nMIN_LEVEL_JPY=' +
      J_CONFIG.MIN_LEVEL_JPY +
      '\nAUTO_LOT_SIZING=' +
      J_CONFIG.AUTO_LOT_SIZING +
      '\nBTC_RESERVE_AMOUNT=' +
      J_CONFIG.BTC_RESERVE_AMOUNT +
      '\n\n不要シート（Bot推定の売買・損益・税務）を削除しました。\n' +
      '税務は J_売買履歴 / J_税務明細 / J_税務集計・月次・日次（API実績）のみ使用します。\n\n' +
      '次: 「5. 接続テスト」→「11. 1回実行」→「12. 5分トリガーを設置」\n' +
      '（取引履歴は運用開始後に自動同期。過去分の取り込みは不要）'
  );
}

function jInitSheetsMenu() {
  jEnsureSheetsInitializedDaily_(true);
  jLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert(
    'シートを用意しました:\n' +
      '・J_運用ログ\n' +
      '・J_ランキング（銘柄選定＋診断）\n' +
      '・J_除外銘柄（取引対象外・行で管理）\n' +
      '・J_運用損益（ロット紐付け・税務用ではない）\n' +
      '・J_売買履歴（bitbank API実績）\n' +
      '・J_税務明細（API実績 移動平均法）\n' +
      '・J_税務集計（年次）\n' +
      '・J_税務月次\n' +
      '・J_税務日次（1日1行）\n' +
      '・J_税務日次銘柄\n\n' +
      '旧Bot推定シート（売買・旧税務）は削除済みです'
  );
}

function jSyncApiTradeHistoryMenu() {
  var cfg = jGetConfig_();
  var force = false;
  if (cfg.dryRun) {
    var ans = SpreadsheetApp.getUi().alert(
      'DRY_RUN=true です。\n本番口座の API キーで同期する場合は続行してください。',
      SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
    );
    if (ans !== SpreadsheetApp.getUi().Button.OK) return;
    force = true;
  }
  try {
    var batch = jSyncTradeHistoryFromApi_({ force: force, maxPages: 5 });
    if (batch.skippedDryRun) {
      SpreadsheetApp.getUi().alert('DRY_RUN のため API 同期をスキップしました');
      return;
    }
    if (batch.initialized) {
      SpreadsheetApp.getUi().alert(
        '取引履歴の同期開始点を現在に設定しました。\n' +
          '過去の取引は取り込みません。\n\n' +
          'Bot運用開始後の約定から J_売買履歴 / J_税務明細 に記録されます。'
      );
      return;
    }
    var rebuild = { taxRows: 0, warnings: [] };
    if (batch.added > 0) {
      rebuild = jRebuildTaxDetailFromApi_();
      jRefreshTaxSummaryFromDetail_(J_SHEET_TAX_DETAIL);
    }
    var warn =
      rebuild.warnings && rebuild.warnings.length
        ? '\n\n注意:\n' + rebuild.warnings.slice(0, 8).join('\n')
        : '';
    SpreadsheetApp.getUi().alert(
      '取引履歴を同期しました。\n' +
        '新規約定: ' +
        batch.added +
        '件\n' +
        '税務明細: ' +
        rebuild.taxRows +
        '行' +
        warn
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('API同期エラー:\n' + (e.message || e));
  }
}

function jRebuildApiTaxDetailMenu() {
  try {
    var result = jRebuildTaxDetailFromApi_();
    jRefreshTaxSummaryFromDetail_(J_SHEET_TAX_DETAIL);
    var warn =
      result.warnings && result.warnings.length
        ? '\n\n注意:\n' + result.warnings.slice(0, 8).join('\n')
        : '';
    SpreadsheetApp.getUi().alert(
      'J_税務明細 を移動平均法で再計算しました。\n行数: ' + result.taxRows + warn
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('再計算エラー:\n' + (e.message || e));
  }
}

function jRefreshTaxSummaryMenu() {
  jRefreshTaxSummary_();
  SpreadsheetApp.getUi().alert(
    '税務集計を更新しました。\n\n' +
      '・J_税務集計 … 年次（確定申告向け）\n' +
      '・J_税務月次 … 月ごと（全銘柄→銘柄）\n' +
      '・J_税務日次 … 1日1行の合計（見やすさ優先）\n' +
      '・J_税務日次銘柄 … 日付ごとの銘柄内訳\n\n' +
      '（bitbank API実績ベース）\n\n' +
      '※ 暗号資産の譲渡所得は総合課税（雑所得）です。\n' +
      '申告時は税理士または国税庁の記載要領に従ってください。'
  );
}

function jInstallTrigger() {
  if (jIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  jRemoveTrigger();
  ScriptApp.newTrigger('jRunOnce').timeBased().everyMinutes(5).create();
  jLog_('5分トリガーを設置しました');
  SpreadsheetApp.getUi().alert('5分ごとに jRunOnce が動きます');
}

function jRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'jRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function jResetAndRestartMenu() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert(
    '全リセット',
    '以下を消去して最初からやり直します:\n' +
      '・全銘柄の状態（グリッド・ポジション）\n' +
      '・紙トレ口座（PAPER_JPY に戻す）\n' +
      '・運用ログのデータ\n' +
      '・ランキングキャッシュ\n\n' +
      'MAX_ACTIVE_PAIRS=' +
      J_CONFIG.MAX_ACTIVE_PAIRS +
      '\nPAPER_JPY=' +
      J_CONFIG.PAPER_JPY_DEFAULT +
      '\nACCOUNT_BUDGET_PCT=' +
      J_CONFIG.ACCOUNT_BUDGET_PCT +
      '\nbtc間隔上限=50000円\n' +
      '利確=固定幅（設定幅+手数料+スリップ）\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  jResetAllState_();
  jClearSheetData_();
  p.setProperty('MIN_LEVEL_JPY', String(J_CONFIG.MIN_LEVEL_JPY));
  p.setProperty('MAX_ACTIVE_PAIRS', String(J_CONFIG.MAX_ACTIVE_PAIRS));
  p.setProperty('PAIR_BUDGET_JPY', String(J_CONFIG.PAIR_BUDGET_JPY));
  p.setProperty('PAPER_JPY', String(J_CONFIG.PAPER_JPY_DEFAULT));
  if (!p.getProperty('FULL_BOX_TRAP')) p.setProperty('FULL_BOX_TRAP', String(J_CONFIG.FULL_BOX_TRAP !== false));
  p.setProperty('ACCOUNT_BUDGET_PCT', String(J_CONFIG.ACCOUNT_BUDGET_PCT));

  jLog_('全リセット完了 — 次回実行で最大' + J_CONFIG.MAX_ACTIVE_PAIRS + '銘柄を新規選定');
  ui.alert(
    'リセット完了\n\n' +
      'PAPER_JPY=' +
      J_CONFIG.PAPER_JPY_DEFAULT +
      '円 / MIN_LEVEL_JPY=' +
      J_CONFIG.MIN_LEVEL_JPY +
      ' / MAX_ACTIVE_PAIRS=' +
      J_CONFIG.MAX_ACTIVE_PAIRS +
      '\n使用上限' +
      J_CONFIG.ACCOUNT_BUDGET_PCT * 100 +
      '%\n' +
      'btc間隔上限=50000円\n' +
      '利確: 買値 + 設定幅 + 手数料カバー + スリップ\n\n' +
      '「11. 1回実行」またはトリガーで開始してください'
  );
}

function jReconcilePairLists_(global, pair) {
  var st = jLoadState_(pair);
  if (st.mode === 'active') {
    if (global.dormantPairs.indexOf(pair) >= 0) {
      global.dormantPairs = global.dormantPairs.filter(function (p) {
        return p !== pair;
      });
    }
    if (global.activePairs.indexOf(pair) < 0) global.activePairs.push(pair);
  } else if (st.mode === 'dormant') {
    if (global.activePairs.indexOf(pair) >= 0) {
      global.activePairs = global.activePairs.filter(function (p) {
        return p !== pair;
      });
    }
    if (global.dormantPairs.indexOf(pair) < 0) global.dormantPairs.push(pair);
  }
}

function jRunToraripiAndLog_(pair, cfg, global) {
  var result = jRunToraripiForPair_(pair, cfg, global);
  jReconcilePairLists_(global, pair);
  var state = jLoadState_(pair);
  var assets = jGetAssetsForPair_(pair, cfg, global);
  var ticker = jGetTicker_(pair);
  if (jShouldAppendRunLog_(global, cfg, result.active)) {
    jAppendRunLog_(pair, ticker, assets, state, result.note);
    global.lastRunLogAt = new Date().toISOString();
  }
  return result;
}

function jRunOnceMenu() {
  if (jIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('VALIDATION_PAUSED=true のためスキップ');
    return;
  }
  var summary = jRunOnceCore_();
  SpreadsheetApp.getUi().alert(summary);
}

/**
 * トリガーから呼ばれる本体（UIなし）
 */
function jRunOnce() {
  if (jIsValidationPaused_()) {
    jLog_('検証停止中 — スキップ');
    return;
  }
  jRunOnceCore_();
}

function jRunOnceCore_() {
  var cfg = jGetConfig_();
  var global = jLoadGlobalState_();
  var errors = [];
  var anyActivity = false;

  try {
    jEnsureInstrumentsSyncedDaily_();
    jEnsureSheetsInitializedDaily_();
    jEnforceMaxActivePairs_(global, cfg);
    if (cfg.dryRun) {
      jInitPaperWallet_(global, cfg);
      jSyncPaperCapital_(global, cfg);
    }

    var budgetJpy = 0;
    var alloc = null;
    try {
      alloc = jUpdateAutoLotSizing_(cfg, global);
      global.lastAutoMinLevelJpy = alloc.effectiveMinLevelJpy;
      global.capitalSnapshot = alloc.snapshot;
      budgetJpy = jGetAccountBudgetJpy_(cfg, global);
      jNoteBudgetChange_(global, budgetJpy);
    } catch (eBudget) {
      jLog_('予算取得スキップ: ' + (eBudget.message || eBudget));
    }

    var pairsSeen = {};
    var runList = [];

    global.dormantPairs.forEach(function (p) {
      if (!pairsSeen[p]) {
        runList.push(p);
        pairsSeen[p] = true;
      }
    });
    global.activePairs.forEach(function (p) {
      if (!pairsSeen[p]) {
        runList.push(p);
        pairsSeen[p] = true;
      }
    });

    jLog_(
      '実行開始 DRY_RUN=' +
        cfg.dryRun +
        ' budgetJPY=' +
        Math.round(budgetJpy) +
        ' lot=' +
        jGetEffectiveMinLevelJpy_(cfg) +
        ' active=' +
        global.activePairs.length +
        '/' +
        (cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS) +
        ' dormant=' +
        global.dormantPairs.length
    );

    runList.forEach(function (pair) {
      try {
        var result = jRunToraripiAndLog_(pair, cfg, global);
        if (result.active) anyActivity = true;
      } catch (e) {
        errors.push(pair + ': ' + (e.message || e));
        jLog_('ERROR ' + pair + ': ' + (e.message || e));
      }
    });

    var reopened = [];
    try {
      reopened = jTryReopenAllDormant_(cfg, global);
    } catch (eRe) {
      errors.push('reopen: ' + (eRe.message || eRe));
      jLog_('ERROR reopen: ' + (eRe.message || eRe));
    }

    reopened.forEach(function (pair) {
      try {
        var rRe = jRunToraripiAndLog_(pair, cfg, global);
        if (rRe.active) anyActivity = true;
      } catch (eRe2) {
        errors.push(pair + ': ' + (eRe2.message || eRe2));
        jLog_('ERROR ' + pair + ': ' + (eRe2.message || eRe2));
      }
    });

    var added = [];
    try {
      added = jTryActivateNewPairs_(cfg, global);
    } catch (e2) {
      errors.push('activate: ' + (e2.message || e2));
      jLog_('ERROR activate: ' + (e2.message || e2));
    }

    added.forEach(function (pair) {
      try {
        var r2 = jRunToraripiAndLog_(pair, cfg, global);
        if (r2.active) anyActivity = true;
      } catch (e3) {
        errors.push(pair + ': ' + (e3.message || e3));
        jLog_('ERROR ' + pair + ': ' + (e3.message || e3));
      }
    });

    global.lastRunAt = new Date().toISOString();
    global.lastError = errors.length ? errors.join('; ') : null;
    jSaveGlobalState_(global);

    if (!cfg.dryRun) {
      try {
        jSyncApiTradeAndTax_();
      } catch (eApi) {
        errors.push('API取引同期: ' + (eApi.message || eApi));
        jLog_('API取引同期スキップ: ' + (eApi.message || eApi));
      }
    }

    if (errors.length) {
      try {
        jNotifyErrorsLine_(errors);
      } catch (eLine) {
        jLog_('LINE通知ERROR: ' + (eLine.message || eLine));
      }
    }

    var w = global.paperWallet;
    var paperLine = '';
    if (cfg.dryRun && w) {
      paperLine =
        '\n紙トレ JPY=' +
        Math.round(w.jpy) +
        ' 損益=' +
        Math.round(w.jpy - w.initial);
    }

    var lotLine = '';
    if (cfg.autoLotSizing) {
      lotLine =
        '\n自動ロット=' +
        jGetEffectiveMinLevelJpy_(cfg) +
        '円/段（塩漬け' +
        (global.capitalSnapshot ? global.capitalSnapshot.saltedLockedJpy : 0) +
        '円控除）';
    }

    var summary =
      '完了\n' +
      'アクティブ: ' +
      (global.activePairs.join(', ') || 'なし') +
      '\n休眠: ' +
      (global.dormantPairs.join(', ') || 'なし') +
      (reopened.length ? '\n再開: ' + reopened.join(', ') : '') +
      (added.length ? '\n新規: ' + added.join(', ') : '') +
      lotLine +
      paperLine +
      (errors.length ? '\n\nエラー:\n' + errors.join('\n') : '');

    jLog_(summary.replace(/\n/g, ' | '));
    return summary;
  } catch (err) {
    global.lastError = String(err.message || err);
    jSaveGlobalState_(global);
    jLog_('ERROR: ' + global.lastError);
    try {
      jNotifyErrorsLine_(['全体: ' + global.lastError], { force: true });
    } catch (eLine2) {
      jLog_('LINE通知ERROR: ' + (eLine2.message || eLine2));
    }
    throw err;
  }
}

/** エディタから手数料計算テスト */
function jTestTradingFees() {
  var pair = 'trx_jpy';
  var price = 50;
  var amount = jResolveLevelAmount_(pair, price, 1000);
  var round = jCalcTrapRoundProfit_(pair, price, 0.92, amount, 'maker');
  Logger.log(
    pair +
      ' amount=' +
      amount +
      ' maker round net=' +
      round.netJpy +
      ' fees=' +
      JSON.stringify(jGetSpotTradingFees_(pair))
  );
}
