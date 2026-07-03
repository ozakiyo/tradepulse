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

function bbRegimeLabelJa_(r, trendBias) {
  if (r === 'shock') return '急落';
  if (r === 'trend') {
    if (trendBias === 'bullish') return 'トレンド（アップトレンド）';
    if (trendBias === 'bearish') return 'トレンド（ダウントレンド）';
    return 'トレンド';
  }
  if (r === 'range') return 'レンジ';
  if (r === 'mixed') return '中立';
  return r || '—';
}

function bbShouldNotifyRegimeLine_(regime, prevRegime, prevTrendBias) {
  if (prevRegime == null) return true;
  if (prevRegime !== regime.regime) return true;
  if (
    regime.regime === 'trend' &&
    regime.trendBias &&
    regime.trendBias !== 'neutral' &&
    prevTrendBias !== regime.trendBias
  ) {
    return true;
  }
  return false;
}

function bbIsTrendDirectionFlip_(regime, prevRegime, prevTrendBias) {
  return (
    prevRegime === 'trend' &&
    regime.regime === 'trend' &&
    prevTrendBias &&
    regime.trendBias &&
    regime.trendBias !== 'neutral' &&
    prevTrendBias !== regime.trendBias
  );
}

function bbSaveLineRegimeSnapshot_(state, regime) {
  state.lastLineRegime = regime.regime;
  state.lastLineTrendBias =
    regime.regime === 'trend' && regime.trendBias && regime.trendBias !== 'neutral'
      ? regime.trendBias
      : null;
}

function bbBuildRegimeLineText_(regime, ticker, prevRegime, prevTrendBias) {
  var prevBias = prevRegime === 'trend' ? prevTrendBias : null;
  var prev = prevRegime ? bbRegimeLabelJa_(prevRegime, prevBias) : '（初回）';
  var next = bbRegimeLabelJa_(regime.regime, regime.trendBias);
  var isTrendFlip = bbIsTrendDirectionFlip_(regime, prevRegime, prevTrendBias);
  var lines = [
    '【BITBANK 相場環境の変化】',
    isTrendFlip
      ? '種別: トレンド方向の転換（レンジではありません）'
      : '種別: 相場環境の変化',
    '変化: ' + prev + ' → ' + next,
    '推奨: ' + bbActionLabelJa_(regime.action),
    'BTC価格: ' + Math.round(Number(ticker.last)).toLocaleString('ja-JP') + ' 円',
    regime.detail || '',
  ];
  if (regime.regime === 'trend' && regime.trendBias && regime.trendBias !== 'neutral') {
    lines.push('トレンド方向: ' + bbTrendBiasLabelJa_(regime.trendBias));
  }
  lines.push('※売買・損益はスプレッドシートで管理');
  return lines.join('\n');
}

function bbMaybeNotifyRegimeLine_(regime, ticker, prevRegime, prevTrendBias) {
  if (!bbIsLineConfigured_()) {
    return { sent: false, reason: 'LINE未設定' };
  }
  if (!bbShouldNotifyRegimeLine_(regime, prevRegime, prevTrendBias)) {
    return { sent: false, reason: '環境変化なし' };
  }
  var text = bbBuildRegimeLineText_(regime, ticker, prevRegime, prevTrendBias);
  if (String(PropertiesService.getScriptProperties().getProperty('DRY_RUN') || 'true') !== 'false') {
    bbLog_('[DRY_RUN LINE]\n' + text);
    return { sent: false, reason: 'DRY_RUN（ログのみ）' };
  }
  return bbSendLine_(text);
}
