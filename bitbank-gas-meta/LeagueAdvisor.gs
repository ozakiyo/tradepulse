/**
 * リーグ助言 — オートが各チームリーダーへ改善提案（自動適用はしない）
 * リーダーが判断し、スクリプトプロパティ等で手動反映する
 */
var META_LEAGUE_ADVICE_SHEET = 'META_リーダー助言';
var META_LEAGUE_KNOBS_SHEET = 'META_調整可能項目';

/** チーム別: リーダーが動かせる主な項目（助言の参照用） */
var META_LEAGUE_TEAM_KNOBS = {
  A: {
    strategy: '環境切替（トラリピ full/half・スイング・STOP）',
    props: [
      'BTC_PER_LEVEL / BTC_PER_LEVEL_HALF（トラリピ1本BTC）',
      'TORARIPI_WIDTH_JPY / TORARIPI_WIDTH_HALF（トラップ幅）',
      'GRID_LEVELS / GRID_LEVELS_HALF（本数上限）',
      'SWING_BTC / SWING_RSI_MIN/MAX / SWING_TRAIL_*（スイング）',
      'TORARIPI_ATR_REF_PCT（レンジ幅ATR連動）',
    ],
  },
  B: {
    strategy: 'ATR+RSI/BB トラリピ専用',
    props: [
      'BTC_PER_LEVEL（1本あたりBTC）',
      'TORARIPI_WIDTH_JPY / TRAP_STEP_MIN_MAX_JPY',
      'GRID_LEVELS / ATR_REF_PCT',
      'RSI_EXPAND_BELOW / RSI_CONTRACT_ABOVE',
      'TRAIL_ACTIVATE_STEP_MULT / TRAIL_CALLBACK_PCT',
    ],
  },
  G: {
    strategy: 'レンジ買いのみ（10銘柄・デモ）',
    props: [
      'G_TP_RATIO（利確位置 0.5〜1.0）',
      'G_TOUCH_PCT（上下限タッチ判定）',
      'G_MAX_JPY_PER_PAIR（1銘柄上限円）',
      'G_DAILY/H1_RANGE_MAX_PCT（レンジ判定）',
      'G_PARTIAL_STOP_RATIO（1H半分損切）',
    ],
  },
  'G-FX': {
    strategy: 'レンジロング/ショート（FX10通貨・紙）',
    props: [
      'GFX_TP_RATIO / GFX_TOUCH_PCT',
      'GFX_MAX_MARGIN_JPY_PER_PAIR',
      'GFX_DAILY/H1_RANGE_MAX_PCT',
      'GFX_PARTIAL_STOP_RATIO',
    ],
  },
  'G-FFX': {
    strategy: '4Hブレイクアウト（外国為替FX10・GMO）',
    props: [
      'GFFX_PARTIAL_TP_RATIO / GFFX_CONSOLIDATION_MAX_PCT',
      'GFFX_MAX_MARGIN_JPY_PER_PAIR',
      'GFFX_LEVERAGE',
      'DRY_RUN',
      'GMO_API_KEY',
    ],
  },
  'G-CFX': {
    strategy: 'レンジロング/ショート（暗号資産FX10・GMO）',
    props: [
      'GCFX_TP_RATIO / GCFX_TOUCH_PCT',
      'GCFX_MAX_MARGIN_JPY_PER_PAIR',
      'GCFX_LEVERAGE',
      'DRY_RUN',
      'GMO_API_KEY',
    ],
  },
  'G-CBO': {
    strategy: '4Hブレイクアウト（暗号資産FX10・GMO）',
    props: [
      'GCBO_PARTIAL_TP_RATIO / GCBO_CONSOLIDATION_MAX_PCT',
      'GCBO_MAX_MARGIN_JPY_PER_PAIR',
      'GCBO_LEVERAGE',
      'DRY_RUN',
      'GMO_API_KEY',
    ],
  },
  'G-SAXO': {
    strategy: 'レンジロング/ショート（金銀+指数CFD5・Saxo紙）',
    props: [
      'GSAXO_TP_RATIO / GSAXO_TOUCH_PCT',
      'GSAXO_MAX_MARGIN_JPY_PER_PAIR',
      'GSAXO_PAIRS',
      'GSAXO_DRY_RUN',
      'SAXO_ACCESS_TOKEN',
    ],
  },
  'C-FX': {
    strategy: 'P&F順張り USD/JPY',
    props: [
      'PF_BOX / PF_REVERSAL_BOXES',
      'POSITION_USD',
      'STOP_LOSS_PCT / TRAIL_ACTIVATE_PCT / TRAIL_CALLBACK_PCT',
    ],
  },
  'D-FX': {
    strategy: '柴田罫線順張り USD/JPY',
    props: [
      'KAGI_BASE_STEP_FX / CANDLE_INTERVAL',
      'LAW_LOOKBACK_SEGS / LAW_TICK_MULT',
      'POSITION_USD / STOP_LOSS_PCT / TRAIL_*',
    ],
  },
  'E-FX': {
    strategy: 'ドンチャン順張り USD/JPY',
    props: [
      'DONCHIAN_ENTRY_BARS / DONCHIAN_EXIT_BARS',
      'ADX_MIN / ER_MIN / RSI_BUY_MAX',
      'POSITION_USD / STOP_LOSS_PCT / TRAIL_*',
    ],
  },
  'F-FX': {
    strategy: '日足+1Hトレンドフォロー（マルチFX）',
    props: [
      'SWING_STRENGTH_DAILY / SWING_STRENGTH_1H',
      'BATCH_SIZE（1回の処理銘柄数）',
      'Instruments.gs の defaultPos / stopPips（要デプロイ）',
    ],
  },
  'F-Short': {
    strategy: '1H+5mトレンドフォロー（FX専用）',
    props: [
      'SWING_STRENGTH_TREND / SWING_STRENGTH_ENTRY',
      'BATCH_SIZE',
      'Instruments.gs の defaultPos / stopPips',
    ],
  },
  'F-Crypto': {
    strategy: '日足+1Hトレンド（暗号資産）',
    props: [
      'SWING_STRENGTH_DAILY / SWING_STRENGTH_1H',
      'BATCH_SIZE',
      'Instruments.gs の defaultPos',
    ],
  },
  'F-Index': {
    strategy: '日足+1Hトレンド（指数・商品）',
    props: [
      'SWING_STRENGTH_DAILY / SWING_STRENGTH_1H',
      'BATCH_SIZE',
      'Instruments.gs の defaultPos',
    ],
  },
};

function metaLeaguePfNum_(row) {
  if (row.pfNum != null && !isNaN(row.pfNum)) return row.pfNum;
  return metaParsePf_(row.pf);
}

function metaAdvicePriority_(pnl, wr, pf, trades) {
  if (pnl <= -8) return '高';
  if (pnl <= -3 || (wr < 35 && pnl < 0)) return '中';
  if (trades < META_LEAGUE_MIN_TRADES) return '情報';
  if (pnl >= 3 && !isNaN(pf) && pf >= 1.2) return '低';
  return '中';
}

function metaJoinSuggestions_(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i]) out.push(list[i]);
  }
  return out.join(' / ');
}

/**
 * @return {{ priority, summary, suggestions, candidates, focus, note }}
 */
function metaGenerateTeamAdvice_(row, block) {
  var team = row.team;
  var profile = META_LEAGUE_TEAM_KNOBS[team] || { strategy: '', props: [] };
  var wr = Number(row.winRate) || 0;
  var pf = metaLeaguePfNum_(row);
  var pnl = Number(row.pnlPct) || 0;
  var trades = Number(row.trades) || 0;
  var rank = row.qualified ? row.rank : null;
  var suggestions = [];
  var candidates = [];
  var focus = '';
  var summary = '';

  if (!row.qualified) {
    return {
      priority: '情報',
      summary: '取引' + trades + '件→分析材料不足（目標' + META_LEAGUE_MIN_TRADES + '件以上）',
      suggestions: [
        'トリガー間隔・バッチサイズを確認し稼働率を上げる',
        'DRY_RUN・API接続・エントリー条件（レンジ判定など）を点検',
      ],
      candidates: [],
      focus: 'まずは安定稼働とログ確認',
      note: profile.strategy,
    };
  }

  var priority = metaAdvicePriority_(pnl, wr, pf, trades);

  if (pnl <= -8) {
    summary = '大損週(' + pnl.toFixed(1) + '%)。来週は守りから再構築';
    focus = '損失原因の特定とリスク縮小';
  } else if (pnl < 0) {
    summary = '損失週(' + pnl.toFixed(1) + '%)。手法のどこが効いていないか切り分け';
    focus = 'エントリー精度か決済バランスの改善';
  } else if (pnl >= 3) {
    summary = '好調週(+' + pnl.toFixed(1) + '%)。過剰変更は避け伸ばす';
    focus = '有効な設定を維持しつつ無駄な約定だけ削る';
  } else {
    summary = '小幅(' + (pnl >= 0 ? '+' : '') + pnl.toFixed(1) + '%)。改善余地あり';
    focus = '取引機会と損益比のバランス';
  }

  if (rank != null && block && block.qualifiedCount >= 2) {
    suggestions.push('リーグ内' + rank + '位/' + block.qualifiedCount + '（順位は参考・他チームに合わせたロット増は不要）');
  }

  if (wr < 35 && pnl < 0) {
    suggestions.push('勝率' + wr.toFixed(0) + '%が低い→エントリー条件を厳しくするか、損切りを早める');
  }
  if (wr >= 55 && !isNaN(pf) && pf < 1.0) {
    suggestions.push('勝率' + wr.toFixed(0) + '%だがPF' + pf.toFixed(2) + '→利小損大。利確を伸ばすか損切幅を見直し');
  }
  if (trades <= 5 && pnl >= 0) {
    suggestions.push('取引' + trades + '件と少ない→エントリー条件を緩めて機会を増やす余地');
  }
  if (!isNaN(pf) && pf >= 1.5 && pnl > 0) {
    suggestions.push('PF' + pf.toFixed(2) + '良好→現行手法を基本維持');
  }

  candidates = metaTeamAdviceCandidates_(team, wr, pf, pnl, trades);
  metaTeamAdviceSpecific_(team, wr, pf, pnl, trades, suggestions, candidates, focus);

  return {
    priority: priority,
    summary: summary,
    suggestions: suggestions,
    candidates: candidates,
    focus: focus,
    note: profile.strategy,
  };
}

function metaTeamAdviceSpecific_(team, wr, pf, pnl, trades, suggestions, candidates, focus) {
  if (team === 'G' || team === 'G-FX' || team === 'G-FFX' || team === 'G-CFX' || team === 'G-CBO' || team === 'G-SAXO') {
    var prefix =
      team === 'G'
        ? 'G_'
        : team === 'G-SAXO'
          ? 'GSAXO_'
          : team === 'G-CFX'
            ? 'GCFX_'
            : team === 'G-CBO'
              ? 'GCBO_'
              : team === 'G-FFX'
                ? 'GFFX_'
                : 'GFX_';
    if (team === 'G-CBO' || team === 'G-FFX') {
      if (trades <= 3 && pnl >= 0) {
        suggestions.push('ブレイクチャンスが少ない→保ち合い幅を緩めるか監視銘柄を増やす');
        candidates.push(prefix + 'CONSOLIDATION_MAX_PCT を +1〜2');
      }
      if (pnl < -5 || (wr < 35 && pnl < 0)) {
        suggestions.push('ダマシブレイクが多い→実体倍率を上げてエントリーを厳しく');
        candidates.push(prefix + 'BREAKOUT_BODY_MULT を +0.1〜0.2');
        candidates.push(prefix + 'PARTIAL_TP_RATIO を -0.1（早めに建値へ）');
      }
      if (wr >= 50 && !isNaN(pf) && pf >= 1.2) {
        candidates.push(prefix + 'PARTIAL_TP_RATIO を +0.1（残りを伸ばす）');
      }
      return { suggestions: suggestions, candidates: candidates, focus: focus, note: profile.strategy };
    }
    if (pnl < -5 || (wr < 35 && pnl < 0)) {
      suggestions.push('誤利確・ダマシが多い場合はタッチ判定を厳しく、利確をやや早める');
      candidates.push(prefix + 'TP_RATIO を 0.02 下げる（例 0.55→0.53）');
      candidates.push(prefix + 'TOUCH_PCT を +0.02（下限により近いときだけ入る）');
    }
    if (trades <= 5 && pnl >= 0) {
      suggestions.push('レンジ内待機が長い→タッチ判定を緩めてエントリー機会を増やす');
      candidates.push(prefix + 'TOUCH_PCT を -0.02');
    }
    if (wr >= 55 && !isNaN(pf) && pf < 1.0) {
      candidates.push(prefix + 'TP_RATIO を +0.03〜0.05（利確をレンジ奥へ）');
    }
    if (pnl <= -8) {
      candidates.push(prefix + 'MAX_*_JPY_PER_PAIR を一時10〜15%縮小（相場悪化時の防御）');
      focus = '誤約定ループ有無を運用ログで確認してからパラメータ変更';
    }
    return;
  }

  if (team === 'A') {
    if (pnl < 0) {
      suggestions.push('環境判定と実際の約定のズレを運用ログで確認（トラリピ/スイング切替タイミング）');
      candidates.push('TORARIPI_ATR_REF_PCT 調整でレンジ幅を相場に合わせる');
      candidates.push('GRID_LEVELS_HALF を減らして様子見寄りに');
    }
    if (trades <= 3) {
      suggestions.push('約定が少ない→トラリピ幅を狭めるか GRID_LEVELS を見直し');
    }
    return;
  }

  if (team === 'B') {
    if (pnl < 0) {
      suggestions.push('ATR拡大時のグリッド再構築頻度と RSI 条件を確認');
      candidates.push('RSI_EXPAND_BELOW / RSI_CONTRACT_ABOVE でグリッド密度調整');
      candidates.push('TRAIL_CALLBACK_PCT で利確の伸ばし方を調整');
    }
    return;
  }

  if (team === 'C-FX') {
    if (pnl < 0) {
      candidates.push('PF_BOX を拡大（ノイズ除去）または PF_REVERSAL_BOXES を +1');
      candidates.push('STOP_LOSS_PCT / TRAIL_* で損益比を改善');
    }
    if (trades <= 4) {
      candidates.push('PF_BOX を縮小してシグナル感度を上げる（要バックテスト意識）');
    }
    return;
  }

  if (team === 'D-FX') {
    if (pnl < 0) {
      candidates.push('KAGI_BASE_STEP_FX 調整（罫の感度）');
      candidates.push('LAW_LOOKBACK_SEGS / LAW_TICK_MULT で転換判定を厳格化');
    }
    return;
  }

  if (team === 'E-FX') {
    if (pnl < 0) {
      candidates.push('ADX_MIN / ER_MIN を上げてトレンド品質を厳選');
      candidates.push('DONCHIAN_ENTRY_BARS を延ばしてダマシ減');
    }
    if (wr < 40) {
      candidates.push('RSI_BUY_MAX を下げて買われすぎを回避');
    }
    return;
  }

  if (team === 'F-FX' || team === 'F-Crypto' || team === 'F-Index') {
    if (pnl < 0) {
      candidates.push('SWING_STRENGTH_DAILY / SWING_STRENGTH_1H を +2〜3（エントリー厳格化）');
      candidates.push('defaultPos を10%縮小（相場不調時のみ・リーダー判断）');
    }
    if (trades <= 5 && pnl >= 0) {
      candidates.push('SWING_STRENGTH を -1〜2（押し目/戻り判定を緩める）');
      candidates.push('BATCH_SIZE を増やしてカバー銘柄を拡大');
    }
    return;
  }

  if (team === 'F-Short') {
    if (pnl < 0) {
      candidates.push('SWING_STRENGTH_TREND / SWING_STRENGTH_ENTRY を +1〜2');
      candidates.push('5m決済ロジックのログで誤反転決済がないか確認');
    }
    if (trades <= 5) {
      candidates.push('SWING_STRENGTH_ENTRY を -1（エントリー機会増）');
    }
  }
}

function metaTeamAdviceCandidates_(team, wr, pf, pnl, trades) {
  var list = [];
  if (pnl <= -5) {
    list.push('相場急変時: ロット/ POSITION_USD / defaultPos を一時10%縮小（リーダー判断）');
  }
  return list;
}

function metaGetLeagueAdviceSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_LEAGUE_ADVICE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_LEAGUE_ADVICE_SHEET);
    sheet.appendRow([
      '更新日時',
      'チーム',
      'リーグ',
      '週開始',
      '順位',
      '7日損益%',
      '取引',
      '勝率%',
      'PF',
      '優先度',
      '総評',
      'オート助言',
      '調整候補',
      '来週の重点',
      'リーダー判断',
      '戦略メモ',
    ]);
    sheet.getRange(1, 1, 1, 16).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(1, 15).setNote('リーダーが記入: 採用/見送り/実施したプロパティ値など');
  }
  return sheet;
}

function metaInitLeagueKnobsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_LEAGUE_KNOBS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_LEAGUE_KNOBS_SHEET);
    sheet.appendRow(['チーム', '戦略', '調整可能項目（スクリプトプロパティ等）']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    sheet.setFrozenRows(1);
    var rows = [];
    var teams = Object.keys(META_LEAGUE_TEAM_KNOBS);
    for (var i = 0; i < teams.length; i++) {
      var t = teams[i];
      if (metaIsTeamValidationPaused_(t)) continue;
      var p = META_LEAGUE_TEAM_KNOBS[t];
      rows.push([t, p.strategy, p.props.join('\n')]);
    }
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
    sheet.setColumnWidth(3, 420);
  }
  return sheet;
}
