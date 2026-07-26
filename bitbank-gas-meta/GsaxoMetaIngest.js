/**
 * G-SAXO（Node）→ META_統合レポート 受信
 * ウェブアプリとしてデプロイ（クレジットカード不要）
 *
 * スクリプトプロパティ:
 *   GSAXO_META_SECRET = Node .env と同じ共有鍵
 */

function gsaxoMetaJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function gsaxoMetaVerifySecret_(secret) {
  var expected = PropertiesService.getScriptProperties().getProperty('GSAXO_META_SECRET');
  return expected && String(secret || '') === String(expected);
}

function gsaxoMetaAppendReport_(payload) {
  var team = String(payload.team || 'G-SAXO').trim();
  if (metaIsTeamValidationPaused_(team)) {
    metaLog_('G-SAXO META受信スキップ（停止中チーム: ' + team + '）');
    return false;
  }
  var sheet = metaGetIntegratedReportSheet_();
  var pnl =
    payload.netPnl != null
      ? String(payload.netPnl)
      : typeof payload.netPnlPct === 'number'
        ? payload.netPnlPct.toFixed(3) + '%'
        : String(payload.netPnlPct || '-');

  sheet.appendRow([
    payload.time ||
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    team,
    payload.period || '',
    Number(payload.tradeCount) || 0,
    payload.winRate != null ? payload.winRate : '-',
    payload.pf != null ? payload.pf : '-',
    pnl,
    payload.avgHoldH != null ? payload.avgHoldH : 0,
    payload.recommendation || '',
  ]);
  return true;
}

/** Node 用: META_リーグ調整 を読む（Node 側 GSAXO_META_LEAGUE_AUTO でゲート） */
function gsaxoMetaReadLeagueForNode_(teamId) {
  return metaLeagueReadAdjustFromSheet_(teamId, { skipAutoGate: true });
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!gsaxoMetaVerifySecret_(p.secret)) {
    return gsaxoMetaJson_({ ok: false, error: 'unauthorized' });
  }

  if (p.action === 'ping') {
    return gsaxoMetaJson_({
      ok: true,
      title: SpreadsheetApp.getActiveSpreadsheet().getName(),
    });
  }

  if (p.action === 'league') {
    var team = String(p.team || 'G-SAXO').trim();
    return gsaxoMetaJson_({ ok: true, adjust: gsaxoMetaReadLeagueForNode_(team) });
  }

  return gsaxoMetaJson_({ ok: false, error: 'unknown action' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return gsaxoMetaJson_({ ok: false, error: 'empty body' });
    }
    var body = JSON.parse(e.postData.contents);
    if (!gsaxoMetaVerifySecret_(body.secret)) {
      return gsaxoMetaJson_({ ok: false, error: 'unauthorized' });
    }

    if (body.action === 'report') {
      var appended = gsaxoMetaAppendReport_(body);
      if (appended) {
        metaLog_('G-SAXO META受信(' + (body.period || '-') + ')');
      }
      return gsaxoMetaJson_({ ok: true, period: body.period, skipped: !appended });
    }

    if (body.action === 'league') {
      var team = String(body.team || 'G-SAXO').trim();
      return gsaxoMetaJson_({ ok: true, adjust: gsaxoMetaReadLeagueForNode_(team) });
    }

    return gsaxoMetaJson_({ ok: false, error: 'unknown action' });
  } catch (err) {
    metaLog_('G-SAXO META ERROR: ' + (err.message || err));
    return gsaxoMetaJson_({ ok: false, error: String(err.message || err) });
  }
}

function gsaxoMetaSetupSecretMenu() {
  var ui = SpreadsheetApp.getUi();
  var cur =
    PropertiesService.getScriptProperties().getProperty('GSAXO_META_SECRET') || '(未設定)';
  var resp = ui.prompt(
    'G-SAXO META 共有鍵',
    'Node .env の GSAXO_META_SECRET と同じ文字列を設定\n現在: ' + cur,
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var val = String(resp.getResponseText() || '').trim();
  if (!val) {
    ui.alert('空文字は設定できません');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('GSAXO_META_SECRET', val);
  metaLog_('GSAXO_META_SECRET を設定');
  ui.alert('GSAXO_META_SECRET を保存しました');
}

function gsaxoMetaDeployHelpMenu() {
  SpreadsheetApp.getUi().alert(
    'G-SAXO Webアプリ デプロイ手順',
    '1. Apps Script エディタ → デプロイ → 新しいデプロイ\n' +
      '2. 種類: ウェブアプリ\n' +
      '3. 実行ユーザー: 自分\n' +
      '4. アクセス: 全員（リンクを知っている全員）\n' +
      '5. デプロイ → URL をコピー\n' +
      '6. Node .env に GSAXO_META_WEBAPP_URL=（URL）\n' +
      '7. メニュー「G-SAXO META共有鍵設定」で同じ GSAXO_META_SECRET を設定\n\n' +
      '※ Google Cloud / クレジットカードは不要',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
