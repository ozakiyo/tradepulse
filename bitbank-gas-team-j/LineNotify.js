/**
 * Team-J — LINE Messaging API（エラー通知）
 * Script Properties: LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID
 */

function jIsLineConfigured_() {
  var p = PropertiesService.getScriptProperties();
  return Boolean(
    String(p.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '').trim() &&
      String(p.getProperty('LINE_USER_ID') || '').trim()
  );
}

function jSendLine_(text) {
  var p = PropertiesService.getScriptProperties();
  var token = String(p.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '').trim();
  var userId = String(p.getProperty('LINE_USER_ID') || '').trim();
  if (!token || !userId) {
    return { sent: false, reason: 'LINE未設定' };
  }
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: String(text).slice(0, 4800) }],
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 400) {
    return { sent: false, reason: res.getContentText().slice(0, 200) };
  }
  return { sent: true };
}

/** 同一内容の連投を抑える（既定30分） */
function jLineErrorCooldownMin_() {
  var n = Number(PropertiesService.getScriptProperties().getProperty('LINE_ERROR_COOLDOWN_MIN'));
  return !isNaN(n) && n >= 0 ? n : 30;
}

/**
 * エラー一覧を LINE 送信（未設定・クールダウン中はスキップ）
 * @param {string[]} errors
 * @param {{force?:boolean}} opts
 */
function jNotifyErrorsLine_(errors, opts) {
  opts = opts || {};
  if (!errors || !errors.length) return { sent: false, reason: 'エラーなし' };
  if (!jIsLineConfigured_()) {
    jLog_('LINE未設定のためエラー通知スキップ');
    return { sent: false, reason: 'LINE未設定' };
  }

  var body = errors
    .map(function (e, i) {
      return i + 1 + '. ' + String(e);
    })
    .join('\n');
  var fingerprint = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body)
  ).slice(0, 16);

  var props = PropertiesService.getScriptProperties();
  var coolMin = jLineErrorCooldownMin_();
  if (!opts.force && coolMin > 0) {
    var prevFp = props.getProperty('J_LINE_ERR_FP') || '';
    var prevAt = Number(props.getProperty('J_LINE_ERR_AT') || 0);
    if (prevFp === fingerprint && Date.now() - prevAt < coolMin * 60 * 1000) {
      return { sent: false, reason: 'クールダウン中' };
    }
  }

  var when = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var text =
    '【Team-J エラー】\n' +
    when +
    '\n件数: ' +
    errors.length +
    '\n\n' +
    body;

  var r = jSendLine_(text);
  if (r.sent) {
    props.setProperty('J_LINE_ERR_FP', fingerprint);
    props.setProperty('J_LINE_ERR_AT', String(Date.now()));
    jLog_('LINEエラー通知送信: ' + errors.length + '件');
  } else {
    jLog_('LINEエラー通知失敗: ' + (r.reason || ''));
  }
  return r;
}

/** メニュー: LINE接続テスト */
function jTestLineMenu() {
  var ui = SpreadsheetApp.getUi();
  if (!jIsLineConfigured_()) {
    ui.alert(
      'LINE未設定です\n\nScript Properties に設定してください:\n' +
        '・LINE_CHANNEL_ACCESS_TOKEN\n' +
        '・LINE_USER_ID'
    );
    return;
  }
  var r = jSendLine_(
    '【Team-J LINEテスト】\n' +
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') +
      '\n接続OK'
  );
  ui.alert(r.sent ? 'LINEテスト送信しました' : '送信失敗:\n' + (r.reason || ''));
}
