/* =========================================================
   SKLADAPLAN — ДОК ДЛЯ СТИКЕРОВ
   Заменяет «плавающие везде» заметки на боковую панель
   справа. Заметки можно:
     • перетаскивать из дока на рабочий стол (и обратно)
     • прикреплять к блокам дашборда (пин)
     • сворачивать в маленькую иконку
   Не трогает оригинальный sticky-notes.js — работает рядом,
   переиспользует тот же localStorage ключ.
   ========================================================= */

(function () {
  'use strict';
  if (window.spStickyDock) return;

  const DOCK_ID = 'spStickyDock';
  const TOGGLE_ID = 'spStickyDockToggle';
  const STYLES_ID = 'spStickyDockStyles';
  const LS_KEY = 'sp-sticky-notes-v2';       /* тот же, что в sticky-notes.js */
  const LS_DOCK_OPEN = 'sp-sticky-dock-open';
  const LS_DOCKED = 'sp-sticky-docked-ids';  /* какие id «в доке» */

  let notes = [];
  let dockedIds = new Set();
  let isOpen = true;
  let scheduled = false;
  let observer = null;

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* Кнопка-триггер (когда док закрыт) */
      #${TOGGLE_ID} {
        position: fixed;
        right: 16px;
        bottom: 90px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 0;
        background: #f5c518;
        color: #4a3e00;
        font-size: 22px;
        cursor: pointer;
        box-shadow: 0 8px 20px rgba(180,140,0,.35);
        z-index: 600;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      #${TOGGLE_ID}.is-visible { display: flex; }
      #${TOGGLE_ID}:hover { transform: scale(1.05); }

      /* Сам док */
      #${DOCK_ID} {
        position: fixed;
        top: 100px;
        right: 16px;
        bottom: 90px;
        width: 300px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(15,23,42,.12);
        z-index: 550;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: transform .22s ease, width .22s ease;
      }
      #${DOCK_ID}.is-closed {
        transform: translateX(calc(100% + 24px));
      }
      #${DOCK_ID} .sp-sd-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border-bottom: 1px solid #eef1f4;
        background: #fafbfc;
      }
      #${DOCK_ID} .sp-sd-head b {
        font-size: 13px;
        color: #0f172a;
      }
      #${DOCK_ID} .sp-sd-head .sp-sd-actions {
        display: flex;
        gap: 4px;
      }
      #${DOCK_ID} .sp-sd-icon-btn {
        width: 28px; height: 28px;
        border: 1px solid #e2e8f0;
        background: #fff;
        color: #475569;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: inherit;
      }
      #${DOCK_ID} .sp-sd-icon-btn:hover {
        background: #f8fafc;
        border-color: #cbd5e1;
      }
      #${DOCK_ID} .sp-sd-body {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #${DOCK_ID} .sp-sd-note {
        background: linear-gradient(180deg, #fff9bf 0%, #fdf3a1 100%);
        border-radius: 10px;
        padding: 10px;
        font-size: 13px;
        color: #4a3e00;
        box-shadow: 0 2px 6px rgba(60,50,0,.08);
        position: relative;
        border-left: 3px solid #f5c518;
      }
      #${DOCK_ID} .sp-sd-note .sp-sd-note-text {
        width: 100%;
        border: 0;
        background: transparent;
        resize: none;
        font-family: inherit;
        font-size: 13px;
        line-height: 1.45;
        color: inherit;
        outline: none;
        min-height: 44px;
      }
      #${DOCK_ID} .sp-sd-note .sp-sd-note-actions {
        display: flex;
        gap: 4px;
        justify-content: flex-end;
        margin-top: 4px;
        opacity: .5;
      }
      #${DOCK_ID} .sp-sd-note:hover .sp-sd-note-actions { opacity: 1; }
      #${DOCK_ID} .sp-sd-note .sp-sd-note-actions button {
        border: 0;
        background: transparent;
        cursor: pointer;
        color: #6b5a00;
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 5px;
        font-family: inherit;
      }
      #${DOCK_ID} .sp-sd-note .sp-sd-note-actions button:hover {
        background: rgba(120,100,0,.12);
      }
      #${DOCK_ID} .sp-sd-empty {
        padding: 24px 12px;
        text-align: center;
        color: #94a3b8;
        font-size: 12px;
      }
      #${DOCK_ID} .sp-sd-hint {
        font-size: 11px;
        color: #94a3b8;
        padding: 8px 12px 12px;
        border-top: 1px solid #eef1f4;
        line-height: 1.4;
      }

      /* Место для «докинга» — плейсхолдеры в блоках дашборда */
      .sp-note-anchor {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 7px;
        border: 1px dashed #cbd5e1;
        color: #94a3b8;
        cursor: pointer;
        font-size: 12px;
        margin-left: 6px;
        transition: all .15s ease;
        background: transparent;
        padding: 0;
      }
      .sp-note-anchor:hover {
        border-color: #2563EB;
        color: #2563EB;
        background: #eff6ff;
      }
      .sp-note-anchor.has-note {
        border-style: solid;
        border-color: #f5c518;
        background: #fef9c3;
        color: #6b5a00;
      }

      /* Мобильная адаптация */
      @media (max-width: 900px) {
        #${DOCK_ID} {
          top: auto;
          bottom: 90px;
          right: 12px;
          left: 12px;
          width: auto;
          max-height: 60vh;
          border-radius: 16px 16px 0 0;
        }
        #${DOCK_ID}.is-closed { transform: translateY(calc(100% + 24px)); }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== STORAGE ============== */

  function loadNotes() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveNotes() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(notes)); } catch (e) {}
  }

  function loadDocked() {
    try {
      const raw = localStorage.getItem(LS_DOCKED);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) { return new Set(); }
  }

  function saveDocked() {
    try { localStorage.setItem(LS_DOCKED, JSON.stringify([...dockedIds])); } catch (e) {}
  }

  function loadDockOpen() {
    try {
      const v = localStorage.getItem(LS_DOCK_OPEN);
      return v === null ? true : v === '1';
    } catch (e) { return true; }
  }

  function saveDockOpen() {
    try { localStorage.setItem(LS_DOCK_OPEN, isOpen ? '1' : '0'); } catch (e) {}
  }

  /* ============== ДОК ============== */

  function buildDock() {
    const dock = document.createElement('aside');
    dock.id = DOCK_ID;
    dock.classList.toggle('is-closed', !isOpen);
    dock.innerHTML = `
      <div class="sp-sd-head">
        <b>📌 Заметки</b>
        <div class="sp-sd-actions">
          <button type="button" class="sp-sd-icon-btn" data-sd-add title="Новая заметка">+</button>
          <button type="button" class="sp-sd-icon-btn" data-sd-close title="Свернуть">×</button>
        </div>
      </div>
      <div class="sp-sd-body" data-sd-body></div>
      <div class="sp-sd-hint">
        Заметки хранятся на этом устройстве. Нажмите <b>📌</b> рядом
        с заголовком блока на главной, чтобы прикрепить заметку к нему.
      </div>
    `;

    dock.querySelector('[data-sd-close]')?.addEventListener('click', () => {
      isOpen = false;
      saveDockOpen();
      dock.classList.add('is-closed');
      updateToggle();
    });

    dock.querySelector('[data-sd-add]')?.addEventListener('click', createNote);

    return dock;
  }

  function buildToggle() {
    const btn = document.createElement('button');
    btn.id = TOGGLE_ID;
    btn.type = 'button';
    btn.title = 'Открыть заметки';
    btn.textContent = '📌';
    btn.addEventListener('click', () => {
      isOpen = true;
      saveDockOpen();
      document.getElementById(DOCK_ID)?.classList.remove('is-closed');
      updateToggle();
    });
    return btn;
  }

  function updateToggle() {
    const btn = document.getElementById(TOGGLE_ID);
    if (!btn) return;
    btn.classList.toggle('is-visible', !isOpen);
  }

  /* ============== РЕНДЕР СПИСКА ЗАМЕТОК ============== */

  function renderNotesList() {
    const body = document.querySelector(`#${DOCK_ID} [data-sd-body]`);
    if (!body) return;

    const docked = notes.filter(n => dockedIds.has(n.id));

    if (!docked.length) {
      body.innerHTML = `
        <div class="sp-sd-empty">
          Пока нет заметок в доке.<br>
          <span style="font-size:11px;">Нажмите «+» или перетащите заметку с рабочего стола.</span>
        </div>
      `;
      return;
    }

    body.innerHTML = docked.map(n => `
      <div class="sp-sd-note" data-note-id="${escapeAttr(n.id)}" style="border-left-color:${colorDot(n.color)}">
        <textarea class="sp-sd-note-text" placeholder="Заметка...">${escapeHtml(n.text || '')}</textarea>
        <div class="sp-sd-note-actions">
          <button type="button" data-sd-undock="${escapeAttr(n.id)}" title="Открепить (перетащить на рабочий стол)">↗</button>
          <button type="button" data-sd-del="${escapeAttr(n.id)}" title="Удалить">🗑</button>
        </div>
      </div>
    `).join('');

    /* Обработчики */
    body.querySelectorAll('.sp-sd-note-text').forEach(ta => {
      ta.addEventListener('input', () => {
        const id = ta.closest('[data-note-id]')?.getAttribute('data-note-id');
        const note = notes.find(n => n.id === id);
        if (note) { note.text = ta.value; saveNotes(); }
      });
    });

    body.querySelectorAll('[data-sd-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sd-del');
        if (!confirm('Удалить заметку?')) return;
        notes = notes.filter(n => n.id !== id);
        dockedIds.delete(id);
        saveNotes(); saveDocked();
        renderNotesList();
        if (window.spStickyNotes?.rebuild) window.spStickyNotes.rebuild();
      });
    });

    body.querySelectorAll('[data-sd-undock]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sd-undock');
        dockedIds.delete(id);
        saveDocked();
        renderNotesList();
        /* Показываем заметку как плавающую — оригинальный sticky-notes
           читает notes из того же localStorage */
        if (window.spStickyNotes?.rebuild) window.spStickyNotes.rebuild();
      });
    });
  }

  function colorDot(color) {
    const map = {
      yellow: '#f5c518',
      blue:   '#3b82f6',
      green:  '#10b981',
      pink:   '#ec4899',
      purple: '#8b5cf6'
    };
    return map[color] || map.yellow;
  }

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(v) {
    return String(v || '').replace(/"/g, '&quot;');
  }

  /* ============== СОЗДАНИЕ / ПРИКРЕПЛЕНИЕ ============== */

  function createNote() {
    const id = 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const note = {
      id,
      x: 100, y: 100, w: 260, h: 180,
      text: '',
      color: 'yellow'
    };
    notes.push(note);
    dockedIds.add(id);
    saveNotes(); saveDocked();
    renderNotesList();
    /* Фокус на новую заметку */
    setTimeout(() => {
      document.querySelector(`#${DOCK_ID} [data-note-id="${id}"] .sp-sd-note-text`)?.focus();
    }, 50);
  }

  /* ============== АНКОРЫ В БЛОКАХ ДАШБОРДА ==============
     Добавляет кнопку 📌 рядом с заголовком каждого крупного
     блока на главной. Нажатие — прикрепляет первую заметку
     из дока к этому блоку (визуально: подсвечивает анкор). */

  function injectAnchors() {
    if (!document.getElementById('spDashboardHeader')) return;

    /* Заголовки блоков, к которым можно прикрепить заметку */
    const targets = [
      { sel: '#spDashboardHeader .sp-dash-block-head', key: 'attention' },
      { sel: '#spCompactNewRequest .sp-cnr-title', key: 'new-request' },
      { sel: '#spCompactQuickStrip .sp-cqs-head', key: 'quick' }
    ];

    targets.forEach(({ sel, key }) => {
      document.querySelectorAll(sel).forEach(head => {
        if (head.querySelector('.sp-note-anchor')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sp-note-anchor';
        btn.dataset.anchorKey = key;
        btn.title = 'Прикрепить заметку к этому блоку';
        btn.textContent = '📌';

        /* Есть ли уже заметка, привязанная к этому блоку? */
        const attached = notes.some(n => n.anchorKey === key);
        if (attached) btn.classList.add('has-note');

        btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          attachNoteToAnchor(key, btn);
        });

        head.appendChild(btn);
      });
    });
  }

  function attachNoteToAnchor(key, btn) {
    /* Если уже привязана — отвязываем */
    const existing = notes.find(n => n.anchorKey === key);
    if (existing) {
      delete existing.anchorKey;
      saveNotes();
      btn.classList.remove('has-note');
      renderNotesList();
      return;
    }

    /* Ищем первую заметку без анкора */
    const free = notes.find(n => !n.anchorKey);
    if (!free) {
      if (confirm('Нет свободных заметок. Создать новую и прикрепить?')) {
        const id = 'n_' + Date.now().toString(36);
        const note = { id, text: '', color: 'yellow', anchorKey: key };
        notes.push(note);
        dockedIds.add(id);
        saveNotes(); saveDocked();
        renderNotesList();
        btn.classList.add('has-note');
      }
      return;
    }

    free.anchorKey = key;
    saveNotes();
    btn.classList.add('has-note');
    renderNotesList();
  }

  /* ============== СБОРКА ============== */

  function build() {
    if (!document.body.contains(document.getElementById(DOCK_ID))) {
      document.body.appendChild(buildDock());
    }
    if (!document.body.contains(document.getElementById(TOGGLE_ID))) {
      document.body.appendChild(buildToggle());
    }
    updateToggle();
    renderNotesList();
    injectAnchors();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { build(); } catch (e) { console.warn('[StickyDock] error:', e); }
    });
  }

  function startObserver() {
    if (observer) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }

    observer = new MutationObserver(() => schedule());
    observer.observe(content, { childList: true, subtree: true });
    observer.observe(document.body, { childList: true, subtree: false });
    schedule();
  }

  function init() {
    injectStyles();
    notes = loadNotes();
    dockedIds = loadDocked();
    isOpen = loadDockOpen();

    /* По умолчанию считаем, что ВСЕ заметки — в доке,
       если пользователь ещё не размечал их вручную */
    if (!localStorage.getItem(LS_DOCKED)) {
      notes.forEach(n => dockedIds.add(n.id));
      saveDocked();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }

    setTimeout(startObserver, 500);
    setTimeout(startObserver, 2000);
    setTimeout(schedule, 3000);

    console.log('[StickyDock] Док заметок инициализирован');
  }

  init();

  window.spStickyDock = {
    rebuild: schedule,
    open:  () => { isOpen = true; saveDockOpen(); document.getElementById(DOCK_ID)?.classList.remove('is-closed'); updateToggle(); },
    close: () => { isOpen = false; saveDockOpen(); document.getElementById(DOCK_ID)?.classList.add('is-closed'); updateToggle(); },
    version: '1.0.0'
  };
})();
