/**
 * LINE Messaging API（tradePulseNode と同じトークン・ユーザーID）
 */
function bbIsLineConfigured_() {
  var p = PropertiesService.getScriptProperties();
  return Boolean(
    String(p.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '').trim() &&
      String(p.getProperty('LINE_USER_ID') || '').trim()
  );
}

function bbSendLine_(text) {
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

function bbBuildRegimeLineText_(regime, ticker, prevRegime) {
  var prev = prevRegime ? bbRegimeLabelJa_(prevRegime) : '（初回）';
  var lines = [
    '【BITBANK 相場環境の変化】',
    '変化: ' + prev + ' → ' + bbRegimeLabelJa_(regime.regime),
    '推奨: ' + bbActionLabelJa_(regime.action),
    'BTC価格: ' + ticker.last,
    regime.detail || '',
    '※売買・損益はスプレッドシートで管理',
  ];
  return lines.join('\n');
}

function bbRegimeLabelJa_(r) {
  if (r === 'shock') return '急変';
  if (r === 'trend') return 'トレンド';
  if (r === 'range') return 'レンジ';
  if (r === 'mixed') return '中立';
  return r || '—';
}

function bbMaybeNotifyRegimeLine_(regime, ticker, prevRegime) {
  if (!bbIsLineConfigured_()) {
    return { sent: false, reason: 'LINE未設定' };
  }
  if (prevRegime === regime.regime) {
    return { sent: false, reason: '環境変化なし' };
  }
  var text = bbBuildRegimeLineText_(regime, ticker, prevRegime);
  if (String(PropertiesService.getScriptProperties().getProperty('DRY_RUN') || 'true') !== 'false') {
    bbLog_('[DRY_RUN LINE]\n' + text);
    return { sent: false, reason: 'DRY_RUN（ログのみ）' };
  }
  return bbSendLine_(text);
}
