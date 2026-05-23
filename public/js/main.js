(function () {
  const pulseError = document.getElementById('pulse-error');
  const pulseCheckMsg = document.getElementById('pulse-check-msg');
  const pulseStatusSummary = document.getElementById('pulse-status-summary');
  const pulseStrategy = document.getElementById('pulse-strategy');
  const pulseHistoryTbody = document.getElementById('pulse-history-tbody');
  const pulseHistoryEmpty = document.getElementById('pulse-history-empty');
  const pulseLineLog = document.getElementById('pulse-line-log');
  const pulseOutputLatest = document.getElementById('pulse-output-latest');
  const pulseOutputFeed = document.getElementById('pulse-output-feed');
  const pulseModeHint = document.getElementById('pulse-mode-hint');
  const pulseCheckNow = document.getElementById('pulse-check-now');
  let pollTimer = null;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(el, message) {
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  }

  function setLoading(btn, loading, label, loadingLabel) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? loadingLabel : label;
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'リクエストに失敗しました');
    return data;
  }

  function signalJa(s) {
    if (s === 'buy') return '買い';
    if (s === 'sell') return '売り';
    if (s === 'exit') return '手仕舞い';
    return '—';
  }

  function regimeJa(r, bias4h) {
    if (r === 'trend') {
      if (bias4h === 'bullish') return 'トレンド（アップ）';
      if (bias4h === 'bearish') return 'トレンド（ダウン）';
      return 'トレンド';
    }
    if (r === 'range') return 'レンジ';
    if (r === 'mixed') return '中立';
    return '—';
  }

  function positionJa(p) {
    if (p === 'long') return '買い';
    if (p === 'short') return '売り';
    return 'なし';
  }

  function formatMoney(n) {
    const v = Number(n) || 0;
    return `${v >= 0 ? '+' : ''}${v.toLocaleString('ja-JP')}`;
  }

  function currencyUnit(c) {
    return c === 'usd' ? 'USD' : '円';
  }

  function marketLabel(id) {
    if (id === 'btc') return 'BTC現物';
    if (id === 'usdjpy') return 'USD/JPY';
    return id || '—';
  }

  function outputTagClass(entry) {
    if (entry?.signal === 'buy') return 'signal-buy';
    if (entry?.signal === 'sell') return 'signal-sell';
    return 'signal-status';
  }

  function outputTagLabel(entry) {
    if (entry?.kind === 'test') return 'テスト';
    if (entry?.signal === 'buy') return '買い';
    if (entry?.signal === 'sell') return '売り';
    return '—';
  }

  function renderPulseOutput(data) {
    const latest = data?.latestOutput;
    const logs = data?.outputLog || [];
    if (pulseOutputLatest) {
      pulseOutputLatest.textContent =
        latest?.text || 'まだシグナルがありません。';
    }
    if (pulseOutputFeed) {
      pulseOutputFeed.innerHTML =
        logs.length === 0
          ? '<li class="field-hint">履歴なし</li>'
          : logs
              .map(
                (e) => `<li>
                  <time>${escapeHtml(e.at || '')} — ${escapeHtml(marketLabel(e.marketId))}</time>
                  <span class="pulse-feed-tag ${outputTagClass(e)}">${escapeHtml(outputTagLabel(e))}</span>
                  <pre>${escapeHtml(e.text || '')}</pre>
                </li>`
              )
              .join('');
    }
    if (pulseModeHint) {
      pulseModeHint.textContent = data?.lineConfigured
        ? '相場環境またはトレンド方向が変わったときのみ LINE 通知（USD/JPY・BTC）。売買・損益はスプレッドシート。'
        : 'LINE 未設定: .env に LINE_CHANNEL_ACCESS_TOKEN と LINE_USER_ID を設定してください。';
    }
  }

  function renderPulseStatus(data) {
    if (!pulseStatusSummary || !data) return;
    renderPulseOutput(data);
    const cfg = [];
    if (!data.enabled) cfg.push('自動監視: オフ');
    else cfg.push('自動監視: オン（約5分ごと）');
    cfg.push(data.lineConfigured ? 'LINE: 設定済' : 'LINE: 未設定');

    const cards = (data.markets || [])
      .map((m) => {
        const unit = currencyUnit(m.currency);
        const bias =
          m.lastBias4h === 'bullish'
            ? '上昇優勢'
            : m.lastBias4h === 'bearish'
              ? '下降優勢'
              : '—';
        return `<div class="pulse-card">
          <span class="pulse-card-label">${escapeHtml(m.label)}</span>
          <strong>${m.lastPrice != null ? escapeHtml(String(m.lastPrice)) : '—'}</strong>
          <small>残高 ${Number(m.balance || 0).toLocaleString('ja-JP')} ${unit} / ${formatMoney(m.realizedPnl)} ${unit}</small>
          <small>環境 ${regimeJa(m.lastRegime, m.lastBias4h)}${m.lastAdx != null ? ` ADX${m.lastAdx}` : ''} / ポジ ${positionJa(m.position)} / 4H ${bias}</small>
          <small>最終 ${signalJa(m.lastSignalType)}${m.entryRegime ? `（建玉:${regimeJa(m.entryRegime)}）` : ''}</small>
        </div>`;
      })
      .join('');

    pulseStatusSummary.innerHTML = `
      <div class="pulse-cards">${cards}</div>
      <p class="field-hint">${escapeHtml(cfg.join(' / '))}</p>
    `;

    if (pulseStrategy && data.strategy) {
      const s = data.strategy;
      pulseStrategy.innerHTML = `
        <dt>スタイル</dt><dd>${escapeHtml(s.style)}</dd>
        <dt>環境判定</dt><dd>${escapeHtml(s.regime || '—')}</dd>
        <dt>トレンド</dt><dd>${escapeHtml(s.entryTrend || s.entry || '—')} / 手仕舞い ${escapeHtml(s.exitTrend || s.exit || '—')}</dd>
        <dt>レンジ</dt><dd>${escapeHtml(s.entryRange || '—')} / 手仕舞い ${escapeHtml(s.exitRange || '—')}</dd>
        <dt>コスト</dt><dd>${escapeHtml(s.cost || '—')}</dd>
        <dt>クールダウン</dt><dd>${escapeHtml(s.cooldown || '—')}</dd>
        <dt>ドテン</dt><dd>${escapeHtml(s.reverse || '—')}</dd>
        <dt>備考</dt><dd>${escapeHtml(s.note)}</dd>
      `;
    }

    const history = data.history || [];
    if (pulseHistoryTbody) {
      if (history.length === 0) {
        pulseHistoryTbody.innerHTML = '';
        if (pulseHistoryEmpty) pulseHistoryEmpty.hidden = false;
      } else {
        if (pulseHistoryEmpty) pulseHistoryEmpty.hidden = true;
        pulseHistoryTbody.innerHTML = history
          .map((h) => {
            const unit = h.marketId === 'btc' ? 'USD' : '円';
            return `<tr>
              <td>${escapeHtml(h.at || '')}</td>
              <td>${escapeHtml(h.label || marketLabel(h.marketId))}</td>
              <td>${escapeHtml(signalJa(h.signal))}</td>
              <td>${escapeHtml(String(h.price ?? ''))}</td>
              <td>${formatMoney(h.tradePnl)} ${unit}</td>
              <td>${formatMoney(h.realizedPnl)} ${unit}</td>
              <td>${Number(h.balance || 0).toLocaleString('ja-JP')} ${unit}</td>
            </tr>`;
          })
          .join('');
      }
    }

    if (pulseLineLog) {
      const logs = data.lineLog || [];
      pulseLineLog.innerHTML =
        logs.length === 0
          ? '<li class="field-hint">まだ LINE 送信ログがありません。</li>'
          : logs
              .map(
                (l) =>
                  `<li>${escapeHtml(l.at || '')} — ${escapeHtml(marketLabel(l.marketId))} ${escapeHtml(signalJa(l.signal))} — ${
                    l.sent ? '送信済' : escapeHtml(l.reason || '未送信')
                  }</li>`
              )
              .join('');
    }
  }

  async function loadPulseStatus() {
    showError(pulseError, '');
    try {
      const res = await fetch('/api/pulse/status');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '状態の取得に失敗しました');
      renderPulseStatus(data);
    } catch (err) {
      showError(pulseError, err.message);
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(loadPulseStatus, 90000);
  }

  pulseCheckNow?.addEventListener('click', async () => {
    showError(pulseError, '');
    if (pulseCheckMsg) {
      pulseCheckMsg.hidden = false;
      pulseCheckMsg.textContent = 'チェック中…';
    }
    setLoading(pulseCheckNow, true, '今すぐチェック', 'チェック中…');
    try {
      const data = await postJson('/api/pulse/check', { force: true, sendLine: true });
      const sigs = data.signals || [];
      const prices = (data.results || [])
        .map((r) => `${marketLabel(r.marketId)} ${r.analysis?.price ?? '—'}`)
        .join(' / ');
      if (pulseCheckMsg) {
        pulseCheckMsg.textContent =
          sigs.length > 0
            ? `シグナル ${sigs.length}件`
            : `シグナルなし（${prices}）`;
      }
      if (sigs[0]?.output?.text && pulseOutputLatest) {
        pulseOutputLatest.textContent = sigs[0].output.text;
      }
      await loadPulseStatus();
    } catch (err) {
      showError(pulseError, err.message);
      if (pulseCheckMsg) pulseCheckMsg.hidden = true;
    } finally {
      setLoading(pulseCheckNow, false, '今すぐチェック', 'チェック中…');
    }
  });

  document.getElementById('pulse-test-line')?.addEventListener('click', async () => {
    const btn = document.getElementById('pulse-test-line');
    setLoading(btn, true, 'LINEテスト送信', '送信中…');
    try {
      const data = await postJson('/api/pulse/test-line', { marketId: 'usdjpy' });
      if (pulseCheckMsg) {
        pulseCheckMsg.hidden = false;
        pulseCheckMsg.textContent = data.line?.sent
          ? 'LINEテスト送信済'
          : `未送信: ${data.line?.reason || '不明'}`;
      }
      await loadPulseStatus();
    } catch (err) {
      showError(pulseError, err.message);
    } finally {
      setLoading(btn, false, 'LINEテスト送信', '送信中…');
    }
  });

  document.getElementById('pulse-refresh')?.addEventListener('click', loadPulseStatus);

  document.getElementById('pulse-reset-trial')?.addEventListener('click', async () => {
    if (!confirm('試験データを初期化します。よろしいですか？')) return;
    try {
      await postJson('/api/pulse/reset-trial', {});
      await loadPulseStatus();
    } catch (err) {
      showError(pulseError, err.message);
    }
  });

  loadPulseStatus();
  startPolling();
})();
