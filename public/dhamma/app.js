(function () {
  const STORAGE_KEY = 'dhamma-journal-v2';
  const MEMO_KEY = 'dhamma-memos-v1';
  const COLLECTION_KEY = 'dhamma-collection-v1';
  const CHAPTER_KEY_PREFIX = 'dhamma-chapter-v1-';
  const BACKUP_VERSION = 1;
  const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

  const state = {
    collections: [],
    currentCollection: null,
    index: null,
    data: null,
    currentChapter: 1,
    categoryById: new Map(),
    pairsByCategory: new Map(),
    currentCategoryId: null,
    currentIndex: 0,
    journal: loadJournal(),
    memos: loadMemos(),
    memoSaveTimer: null,
    memoStatusTimer: null,
    backupStatusTimer: null,
    importReplaceAll: false,
    copyStatusTimer: null,
  };

  const els = {
    dateLabel: document.getElementById('dateLabel'),
    collectionSelect: document.getElementById('collectionSelect'),
    chapterLabel: document.getElementById('chapterLabel'),
    mapNote: document.getElementById('mapNote'),
    chapterSelect: document.getElementById('chapterSelect'),
    chapterViewIntro: document.getElementById('chapterViewIntro'),
    categoryBadge: document.getElementById('categoryBadge'),
    verseLabel: document.getElementById('verseLabel'),
    observeText: document.getElementById('observeText'),
    actionText: document.getElementById('actionText'),
    quoteText: document.getElementById('quoteText'),
    navHint: document.getElementById('navHint'),
    categoryGrid: document.getElementById('categoryGrid'),
    chapterGrid: document.getElementById('chapterGrid'),
    logList: document.getElementById('logList'),
    pairCard: document.getElementById('pairCard'),
    pairMemo: document.getElementById('pairMemo'),
    memoStatus: document.getElementById('memoStatus'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    exportBackupBtn: document.getElementById('exportBackupBtn'),
    importMergeBtn: document.getElementById('importMergeBtn'),
    importReplaceBtn: document.getElementById('importReplaceBtn'),
    importBackupInput: document.getElementById('importBackupInput'),
    backupStatus: document.getElementById('backupStatus'),
    copyStatus: document.getElementById('copyStatus'),
    views: {
      today: document.getElementById('view-today'),
      categories: document.getElementById('view-categories'),
      chapters: document.getElementById('view-chapters'),
      log: document.getElementById('view-log'),
    },
    tabs: document.querySelectorAll('.tab'),
  };

  function loadJournal() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveJournal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.journal));
  }

  function loadMemos() {
    try {
      return JSON.parse(localStorage.getItem(MEMO_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveMemos() {
    localStorage.setItem(MEMO_KEY, JSON.stringify(state.memos));
  }

  function memoStorageKey(pairId) {
    return `${state.currentCollection.id}:${pairId}`;
  }

  function getMemo(pairId) {
    return state.memos[memoStorageKey(pairId)] || '';
  }

  function setMemo(pairId, text) {
    const key = memoStorageKey(pairId);
    const trimmed = text.trim();
    if (trimmed) {
      state.memos[key] = trimmed;
    } else {
      delete state.memos[key];
    }
    saveMemos();
  }

  function showMemoStatus() {
    if (!els.memoStatus) return;
    els.memoStatus.hidden = false;
    clearTimeout(state.memoStatusTimer);
    state.memoStatusTimer = setTimeout(() => {
      if (els.memoStatus) els.memoStatus.hidden = true;
    }, 1500);
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  }

  function copyPayload(mode) {
    const pair = currentPair();
    if (!pair) return '';

    if (mode === 'observe') return pair.observe || '';
    if (mode === 'action') return pair.action || '';
    if (mode === 'quote') return pair.quote || '';
    return '';
  }

  function showCopyStatus(message, isError) {
    if (!els.copyStatus) return;
    els.copyStatus.textContent = message;
    els.copyStatus.hidden = false;
    els.copyStatus.style.color = isError ? '#b45309' : '';
    clearTimeout(state.copyStatusTimer);
    state.copyStatusTimer = setTimeout(() => {
      if (els.copyStatus) els.copyStatus.hidden = true;
    }, 1800);
  }

  async function copyPairField(mode) {
    const text = copyPayload(mode);
    if (!text) {
      showCopyStatus('コピーする文がありません', true);
      return;
    }
    const ok = await copyText(text);
    if (ok) {
      const labels = { observe: '観察', action: '行動', quote: '経典の言葉' };
      showCopyStatus(`${labels[mode] || '文'}をコピーしました`);
    } else {
      showCopyStatus('コピーできませんでした', true);
    }
  }

  function flushMemoSave() {
    const pair = currentPair();
    if (!pair || !els.pairMemo) return;
    clearTimeout(state.memoSaveTimer);
    setMemo(pair.id, els.pairMemo.value);
  }

  function renderMemo(pairId) {
    if (!els.pairMemo) return;
    els.pairMemo.value = getMemo(pairId);
    if (els.memoStatus) els.memoStatus.hidden = true;
  }

  function scheduleMemoSave() {
    const pair = currentPair();
    if (!pair || !els.pairMemo) return;
    clearTimeout(state.memoSaveTimer);
    state.memoSaveTimer = setTimeout(() => {
      setMemo(pair.id, els.pairMemo.value);
      showMemoStatus();
    }, 400);
  }

  function chapterStorageKey() {
    return `${CHAPTER_KEY_PREFIX}${state.currentCollection.id}`;
  }

  function dataUrl(relativePath) {
    return `data/${relativePath}`;
  }

  async function fetchJson(relativePath) {
    const url = dataUrl(relativePath);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`読み込み失敗 (${res.status}): ${relativePath}`);
    }
    try {
      return await res.json();
    } catch {
      throw new Error(`JSON形式エラー: ${relativePath}`);
    }
  }

  function chapterFileUrl(file) {
    if (state.currentCollection.id === 'dhammapada') {
      return dataUrl(file);
    }
    return dataUrl(`${state.currentCollection.id}/${file}`);
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDateLabel() {
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY_NAMES[d.getDay()]}）`;
  }

  function dayOfYear() {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  }

  function defaultChapterId() {
    const saved = Number(localStorage.getItem(chapterStorageKey()));
    const max = state.index.chapters.length;
    if (saved >= 1 && saved <= max) return saved;
    return (dayOfYear() % max) + 1;
  }

  function categoryForToday() {
    const weekday = new Date().getDay();
    return state.data.categories.find((c) => c.weekday === weekday) || state.data.categories[0];
  }

  function pairIndexForToday(categoryId) {
    const pairs = state.pairsByCategory.get(categoryId) || [];
    if (!pairs.length) return 0;
    const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    return week % pairs.length;
  }

  function rebuildCategoryMaps() {
    state.categoryById.clear();
    state.pairsByCategory.clear();
    state.data.categories.forEach((cat) => {
      state.categoryById.set(cat.id, cat);
      state.pairsByCategory.set(cat.id, []);
    });
    state.data.pairs.forEach((pair) => {
      const list = state.pairsByCategory.get(pair.category);
      if (list) list.push(pair);
    });
  }

  function chapterUnitLabel() {
    return state.currentCollection.chapterLabel || '章';
  }

  function formatChapterSubtitle(meta, data) {
    const unit = chapterUnitLabel();
    const short = data.shortTitle || meta.shortTitle || '';
    const num = meta.sutta ?? meta.id;
    return `第${num}${unit} · ${short}`;
  }

  function updateHeader() {
    const meta = state.index.chapters.find((c) => c.id === state.currentChapter);
    if (!meta || !state.data) return;

    els.chapterLabel.textContent = formatChapterSubtitle(meta, state.data);

    if (els.mapNote) {
      const note = state.data.mapNote || meta.mapNote || '';
      if (note) {
        els.mapNote.textContent = note;
        els.mapNote.hidden = false;
      } else {
        els.mapNote.textContent = '';
        els.mapNote.hidden = true;
      }
    }

    if (els.chapterViewIntro) {
      const count = state.index.chapters.length;
      const unit = chapterUnitLabel();
      if (state.currentCollection.id === 'tipitaka') {
        els.chapterViewIntro.textContent =
          `三藏·五部の全体地図（${count}${unit}）。第1章から順に読むと、一切経の位置が見えます。`;
      } else if (state.currentCollection.id === 'digha') {
        els.chapterViewIntro.textContent =
          `長部34経全体。第1${unit}から第${count}${unit}まで順に読めます。長い説法の集です。`;
      } else if (state.currentCollection.id === 'majjhima') {
        els.chapterViewIntro.textContent =
          `中部152経全体。第1${unit}から第${count}${unit}まで順に読めます。各${unit}は7場面の観察→行動ペアです。`;
      } else if (state.currentCollection.id === 'anguttara') {
        els.chapterViewIntro.textContent =
          `増支部11集全体。一の法から十一の法まで ${count}${unit}。各${unit}35ペアで「今日これ一つ」を選びます。`;
      } else if (state.currentCollection.id === 'samyutta') {
        els.chapterViewIntro.textContent =
          `相応部56相応全体。第1${unit}から第${count}${unit}まで順に読めます。各${unit}35ペアで縁起·蘊·道を学びます。`;
      } else if (state.currentCollection.id === 'khuddaka') {
        els.chapterViewIntro.textContent =
          `小部15経典全体。法句·感興語·本生·譬喩等 ${count}${unit}。各${unit}35ペアで読みます。`;
      } else if (state.currentCollection.id === 'suttanipata') {
        els.chapterViewIntro.textContent =
          `経集5品全体。蛇喩品から彼岸道品まで ${count}${unit}。各${unit}35ペアで読みます。`;
      } else {
        els.chapterViewIntro.textContent =
          `全${count}${unit}。${unit}を選ぶとその${unit}のペアを表示します。`;
      }
    }
  }

  async function loadChapter(chapterId) {
    const meta = state.index.chapters.find((c) => c.id === chapterId);
    if (!meta) return;
    state.data = await fetchJson(
      state.currentCollection.id === 'dhammapada'
        ? meta.file
        : `${state.currentCollection.id}/${meta.file}`
    );
    state.currentChapter = chapterId;
    localStorage.setItem(chapterStorageKey(), String(chapterId));
    rebuildCategoryMaps();
    updateHeader();
    if (els.chapterSelect) els.chapterSelect.value = String(chapterId);
  }

  function pairRefLabel(pair) {
    if (pair.ref) return pair.ref;
    if (pair.verse != null) return `偈 ${pair.verse}`;
    return '';
  }

  function currentPair() {
    const pairs = state.pairsByCategory.get(state.currentCategoryId) || [];
    return pairs[state.currentIndex] || null;
  }

  function renderPair() {
    const pair = currentPair();
    const category = state.categoryById.get(state.currentCategoryId);
    if (!pair || !category) return;

    els.categoryBadge.textContent = category.name;
    els.verseLabel.textContent = pairRefLabel(pair);
    els.observeText.textContent = pair.observe;
    els.actionText.textContent = pair.action;
    els.quoteText.textContent = pair.quote;

    const pairs = state.pairsByCategory.get(state.currentCategoryId) || [];
    const memoNote = getMemo(pair.id) ? ' · メモあり' : '';
    els.navHint.textContent = `${state.currentIndex + 1} / ${pairs.length} · スワイプ可${memoNote}`;

    renderReviewButtons(pair.id);
    renderMemo(pair.id);
  }

  function journalEntry(pairId) {
    const key = todayKey();
    const entry = state.journal[key] || {
      pairId,
      collection: state.currentCollection.id,
      chapter: state.currentChapter,
      observe: null,
      action: null,
    };
    if (
      entry.pairId !== pairId
      || entry.chapter !== state.currentChapter
      || entry.collection !== state.currentCollection.id
    ) {
      entry.pairId = pairId;
      entry.collection = state.currentCollection.id;
      entry.chapter = state.currentChapter;
      entry.observe = null;
      entry.action = null;
    }
    return { key, entry };
  }

  function renderReviewButtons(pairId) {
    const { entry } = journalEntry(pairId);

    document.querySelectorAll('.rate-group').forEach((group) => {
      const field = group.dataset.field;
      group.querySelectorAll('.rate').forEach((btn) => {
        btn.classList.toggle('selected', entry[field] === btn.dataset.value);
      });
    });
  }

  function setReview(field, value) {
    const pair = currentPair();
    if (!pair) return;

    const { key, entry } = journalEntry(pair.id);
    entry[field] = value;
    state.journal[key] = entry;
    saveJournal();
    renderReviewButtons(pair.id);
  }

  function markLabel(value) {
    if (value === 'ok') return '○';
    if (value === 'partial') return '△';
    if (value === 'ng') return '×';
    return '—';
  }

  function findPair(pairId, chapterId, collectionId) {
    if (
      collectionId === state.currentCollection.id
      && chapterId === state.currentChapter
      && state.data
    ) {
      return state.data.pairs.find((p) => p.id === pairId);
    }
    return null;
  }

  function collectionName(collectionId) {
    const col = state.collections.find((c) => c.id === collectionId);
    return col ? col.name : collectionId;
  }

  function collectChapterPrefs() {
    const chapters = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(CHAPTER_KEY_PREFIX)) continue;
      const colId = key.slice(CHAPTER_KEY_PREFIX.length);
      const num = Number(localStorage.getItem(key));
      if (num >= 1) chapters[colId] = num;
    }
    return chapters;
  }

  function buildBackup() {
    flushMemoSave();
    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'dhamma',
      journal: state.journal,
      memos: state.memos,
      collection: localStorage.getItem(COLLECTION_KEY),
      chapters: collectChapterPrefs(),
    };
  }

  function isValidBackup(data) {
    if (!data || typeof data !== 'object') return false;
    return !!(data.journal || data.memos || data.collection || data.chapters);
  }

  function showBackupStatus(message, isError) {
    if (!els.backupStatus) return;
    els.backupStatus.textContent = message;
    els.backupStatus.hidden = false;
    els.backupStatus.style.color = isError ? '#b45309' : '';
    clearTimeout(state.backupStatusTimer);
    state.backupStatusTimer = setTimeout(() => {
      if (els.backupStatus) els.backupStatus.hidden = true;
    }, 4000);
  }

  function exportBackup() {
    const data = buildBackup();
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dhamma-backup-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showBackupStatus('バックアップをダウンロードしました');
  }

  function applyBackup(data, replaceAll) {
    if (!isValidBackup(data)) {
      throw new Error('ダンマアプリのバックアップファイルではありません');
    }

    const journal = data.journal && typeof data.journal === 'object' ? data.journal : {};
    const memos = data.memos && typeof data.memos === 'object' ? data.memos : {};

    if (replaceAll) {
      state.journal = { ...journal };
      state.memos = { ...memos };
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(CHAPTER_KEY_PREFIX)) localStorage.removeItem(key);
      });
    } else {
      state.journal = { ...state.journal, ...journal };
      state.memos = { ...state.memos, ...memos };
    }

    saveJournal();
    saveMemos();

    if (data.collection) {
      localStorage.setItem(COLLECTION_KEY, String(data.collection));
    }

    if (data.chapters && typeof data.chapters === 'object') {
      Object.entries(data.chapters).forEach(([colId, chapterId]) => {
        const num = Number(chapterId);
        if (num >= 1) {
          localStorage.setItem(`${CHAPTER_KEY_PREFIX}${colId}`, String(num));
        }
      });
    }
  }

  async function importBackupFile(file, replaceAll) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('JSONを読み取れませんでした');
    }

    applyBackup(data, replaceAll);

    const colId = data.collection || state.currentCollection.id;
    const known = state.collections.some((c) => c.id === colId);
    if (known) {
      await loadCollection(colId);
    }

    showView('today');
    showBackupStatus(replaceAll ? 'すべて置き換えて復元しました' : 'マージして復元しました');
  }

  function renderLog() {
    const keys = Object.keys(state.journal).sort().reverse().slice(0, 14);
    els.logList.innerHTML = '';

    if (!keys.length) {
      els.logList.innerHTML = '<li class="log-item"><p class="log-summary">まだ記録がありません。</p></li>';
      return;
    }

    keys.forEach((key) => {
      const entry = state.journal[key];
      const pair = findPair(entry.pairId, entry.chapter, entry.collection || 'dhammapada');
      const cat = pair ? state.categoryById.get(pair.category) : null;
      const colLabel = collectionName(entry.collection || 'dhammapada');
      const li = document.createElement('li');
      li.className = 'log-item';
      li.innerHTML = `
        <p class="log-date">${key} · ${colLabel}${cat ? ` · ${cat.short}` : ''}</p>
        <p class="log-summary">${pair ? pair.observe : entry.pairId}</p>
        <p class="log-marks">観察 ${markLabel(entry.observe)} / 行動 ${markLabel(entry.action)}</p>
      `;
      els.logList.appendChild(li);
    });
  }

  function renderCategories() {
    els.categoryGrid.innerHTML = '';
    state.data.categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-btn';
      btn.textContent = cat.name;
      btn.addEventListener('click', () => {
        flushMemoSave();
        state.currentCategoryId = cat.id;
        state.currentIndex = 0;
        showView('today');
        renderPair();
      });
      els.categoryGrid.appendChild(btn);
    });
  }

  function renderCollectionSelect() {
    if (!els.collectionSelect) return;
    els.collectionSelect.innerHTML = '';
    state.collections.forEach((col) => {
      const opt = document.createElement('option');
      opt.value = col.id;
      opt.textContent = `${col.name}（${col.subtitle}）`;
      els.collectionSelect.appendChild(opt);
    });
    els.collectionSelect.value = state.currentCollection.id;
  }

  function renderChapterSelect() {
    if (!els.chapterSelect) return;
    const unit = chapterUnitLabel();
    els.chapterSelect.innerHTML = '';
    state.index.chapters.forEach((ch) => {
      const opt = document.createElement('option');
      opt.value = String(ch.id);
      const num = ch.sutta ?? ch.id;
      opt.textContent = `第${num}${unit} ${ch.shortTitle}`;
      els.chapterSelect.appendChild(opt);
    });
    els.chapterSelect.value = String(state.currentChapter);
  }

  function renderChapterGrid() {
    els.chapterGrid.innerHTML = '';
    const unit = chapterUnitLabel();
    state.index.chapters.forEach((ch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-btn';
      if (ch.id === state.currentChapter) btn.classList.add('active-chapter');
      const num = ch.sutta ?? ch.id;
      btn.textContent = `第${num}${unit}\n${ch.shortTitle}`;
      btn.addEventListener('click', async () => {
        flushMemoSave();
        await loadChapter(ch.id);
        state.currentCategoryId = categoryForToday().id;
        state.currentIndex = pairIndexForToday(state.currentCategoryId);
        renderCategories();
        renderChapterSelect();
        renderChapterGrid();
        showView('today');
        renderPair();
      });
      els.chapterGrid.appendChild(btn);
    });
  }

  function showView(name) {
    Object.entries(els.views).forEach(([key, view]) => {
      if (!view) return;
      const active = key === name;
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    els.tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.view === name);
    });
    if (name === 'log') renderLog();
    if (name === 'chapters') renderChapterGrid();
  }

  function movePair(delta) {
    flushMemoSave();
    const pairs = state.pairsByCategory.get(state.currentCategoryId) || [];
    if (!pairs.length) return;
    state.currentIndex = (state.currentIndex + delta + pairs.length) % pairs.length;
    renderPair();
  }

  async function loadCollection(collectionId) {
    const col = state.collections.find((c) => c.id === collectionId);
    if (!col) return;

    state.currentCollection = col;
    localStorage.setItem(COLLECTION_KEY, collectionId);

    state.index = await fetchJson(col.indexFile);

    const chapterId = defaultChapterId();
    await loadChapter(chapterId);

    const todayCat = categoryForToday();
    state.currentCategoryId = todayCat.id;
    state.currentIndex = pairIndexForToday(todayCat.id);

    renderCollectionSelect();
    renderChapterSelect();
    renderCategories();
    renderChapterGrid();
    renderPair();
  }

  function bindSwipe() {
    let startX = 0;
    let startY = 0;

    els.pairCard.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
    }, { passive: true });

    els.pairCard.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      movePair(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function bindEvents() {
    els.prevBtn.addEventListener('click', () => movePair(-1));
    els.nextBtn.addEventListener('click', () => movePair(1));

    els.tabs.forEach((tab) => {
      tab.addEventListener('click', () => showView(tab.dataset.view));
    });

    if (els.collectionSelect) {
      els.collectionSelect.addEventListener('change', async () => {
        flushMemoSave();
        await loadCollection(els.collectionSelect.value);
        showView('today');
      });
    }

    if (els.chapterSelect) {
      els.chapterSelect.addEventListener('change', async () => {
        flushMemoSave();
        await loadChapter(Number(els.chapterSelect.value));
        state.currentIndex = 0;
        renderCategories();
        renderChapterGrid();
        renderPair();
      });
    }

    if (els.pairMemo) {
      els.pairMemo.addEventListener('input', scheduleMemoSave);
      els.pairMemo.addEventListener('blur', () => {
        flushMemoSave();
        showMemoStatus();
      });
    }

    if (els.pairCard) {
      els.pairCard.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-copy]');
        if (!btn) return;
        e.preventDefault();
        copyPairField(btn.dataset.copy);
      });
    }

    document.querySelectorAll('.rate-group').forEach((group) => {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('.rate');
        if (!btn) return;
        setReview(group.dataset.field, btn.dataset.value);
      });
    });

    if (els.exportBackupBtn) {
      els.exportBackupBtn.addEventListener('click', exportBackup);
    }

    if (els.importMergeBtn && els.importBackupInput) {
      els.importMergeBtn.addEventListener('click', () => {
        state.importReplaceAll = false;
        els.importBackupInput.click();
      });
    }

    if (els.importReplaceBtn && els.importBackupInput) {
      els.importReplaceBtn.addEventListener('click', () => {
        const ok = window.confirm(
          '端末のメモ・振り返り・章の選択をすべて消し、ファイルの内容に置き換えます。よろしいですか？'
        );
        if (!ok) return;
        state.importReplaceAll = true;
        els.importBackupInput.click();
      });
    }

    if (els.importBackupInput) {
      els.importBackupInput.addEventListener('change', async () => {
        const file = els.importBackupInput.files && els.importBackupInput.files[0];
        const replaceAll = state.importReplaceAll;
        els.importBackupInput.value = '';
        if (!file) return;
        try {
          await importBackupFile(file, replaceAll);
        } catch (err) {
          showBackupStatus(err.message || '取り込みに失敗しました', true);
        }
      });
    }

    bindSwipe();
  }

  async function init() {
    els.dateLabel.textContent = formatDateLabel();

    const collectionsData = await fetchJson('collections.json');
    state.collections = collectionsData.collections.sort(
      (a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)
    );

    const savedCollection = localStorage.getItem(COLLECTION_KEY);
    const defaultCollection = state.collections.find((c) => c.id === savedCollection)
      || state.collections[0];

    await loadCollection(defaultCollection.id);
    bindEvents();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  init().catch((err) => {
    console.error(err);
    const detail = err && err.message ? `<br><small style="color:#6b7280">${err.message}</small>` : '';
    document.body.innerHTML =
      `<p style="padding:1.5rem;line-height:1.6">データを読み込めませんでした。サーバー経由で開いてください。${detail}</p>`;
  });
})();
