/**
 * チームF: LINE Messaging API 連携
 * エントリー/決済/トレンド変化時にLINE通知を送信する。
 * プロパティ LINE_CHANNEL_ACCESS_TOKEN + LINE_USER_ID が未設定なら何もしない。
 */

function f6SendLine_(message) {
  var p = PropertiesService.getScriptProperties();
  var token = String(p.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '').trim();
  var userId = String(p.getProperty('LINE_USER_ID') || '').trim();
  if (!token || !userId) return;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: String(message).slice(0, 4800) }],
      }),
      muteHttpExceptions: true,
    });
  } catch (e) {
    f6Log_('LINE送信失敗: ' + e.message);
  }
}

function f6NotifyEntry_(inst, side, price, stopLoss) {
  var arrow = side === 'long' ? '買い' : '売り';
  f6SendLine_(
    '[F6 ' + arrow + '] ' + inst.label +
    '\n価格: ' + price +
    '\n損切: ' + stopLoss +
    '\n戦略: ダウ理論+スイング'
  );
}

function f6NotifyExit_(inst, side, price, reason, pct) {
  f6SendLine_(
    '[F6 決済] ' + inst.label +
    '\n' + reason +
    '\n価格: ' + price +
    '\n損益: ' + (pct != null ? pct.toFixed(2) : '-') + '%'
  );
}

function f6NotifyTrendChange_(inst, prevTrend, newTrend) {
  if (prevTrend === newTrend) return;
  if (!prevTrend) return;
  var names = { up: 'アップ', down: 'ダウン', range: 'レンジ' };
  f6SendLine_(
    '[F6 トレンド変化] ' + inst.label +
    '\n' + (names[prevTrend] || prevTrend) + ' → ' + (names[newTrend] || newTrend)
  );
}
