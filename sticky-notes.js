/* =========================================================
   SKLADAPLAN — СТИКЕР-ЗАМЕТКИ НА ДАШБОРДЕ
   =========================================================

   Возможности:
   - Несколько заметок одновременно.
   - Перетаскивание (drag) за верхнюю полоску.
   - Изменение размера за правый нижний угол.
   - 5 цветов на выбор.
   - Удаление.
   - Автосохранение в localStorage этого устройства.

   Изоляция:
   - Не трогает app.js и другие модули.
   - Показывается только на Главной.
   ========================================================= */

(function () {
  'use strict';
  if (window.spStickyNotes) return;

  const STYLES_ID    = 'spStickyNotesStyles';
  const CONTAINER_ID = 'spStickyNotesContainer';
  const ADD_BTN_ID   = 'spStickyNotesAddBtn';
  const LS_KEY       = 'sp-sticky-notes-v2';

  const MIN_W = 200, MIN_H = 130;
  const MAX_W = 800, MAX_H = 700;

  const COLORS = {
    yellow: {
      bg: 'linear-gradient(180deg, #fff9bf 0%, #fdf3a1 100%)',
      paper: '#fdf3a1',
      tape: 'rgba(255,255,255,.55)',
      text: '#4a3e00',
      head: '#6b5a00',
      clearBg: 'rgba(120,100,0,.1)',
      dot: '#f5c518'
    },
    blue: {
      bg: 'linear-gradient(180deg, #e0ebff 0%, #c7dfff 100%)',
      paper: '#c7dfff',
      tape: 'rgba(255,255,255,.55)',
      text: '#1e3a5f',
      head: '#1e40af',
      clearBg: 'rgba(30,64,175,.12)',
      dot: '#3b82f6'
    },
    green: {
      bg: 'linear-gradient(180deg, #ddf7dd 0%, #bdeec5 100%)',
      paper: '#bdeec5',
      tape: 'rgba(255,255,255,.55)',
      text: '#1f4a2a',
      head: '#166534',
      clearBg: 'rgba(22,101,52,.12)',
      dot: '#10b981'
    },
    pink: {
      bg: 'linear-gradient(180deg, #ffe7ee 0%, #ffd0dd 100%)',
      paper: '#ffd0dd',
      tape: 'rgba(255,255,255,.55)',
      text: '#6b1d33',
      head: '#9d174d',
      clearBg: 'rgba(157,23,77,.12)',
      dot: '#ec4899'
    },
    purple: {
      bg: 'linear-gradient(180deg, #f0ebff 0%, #ddd6fe 100%)',
      paper: '#ddd6fe',
      tape: 'rgba(255,255,255,.55)',
      text: '#3b1a6b',
      head: '#5b21b6',
      clearBg: 'rgba(91,33,182,.12)',
      dot: '#8b5cf6'
    }
  };
  const COLOR_KEYS = Object.keys(COLORS);
  const DEFAULT_COLOR = 'yellow';

  let notes = [];
  let container = null;
  let observer = null;
  let saveTimer = null;

  /* ============ STORAGE ============ */

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(notes)); }
    catch (e) { console.warn('[StickyNotes] save error:', e); }
  }

  function saveDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function uid() {
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* ============ STYLES ============ */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${CONTAINER_ID} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 500;
      }
      #${CONTAINER_ID}.is-hidden { display: none; }

      #${CONTAINER_ID} .sp-sn-note {
        position: absolute;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        box-shadow:
          0 10px 24px rgba(60, 50, 0, .18),
          0 2px 6px rgba(60, 50, 0, .12),
          inset 0 -18px 24px -18px rgba(60, 50, 0, .15);
        border-radius: 2px;
        transition: box-shadow .15s ease;
        touch-action: none;
        user-select: none;
      }
      #${CONTAINER_ID} .sp-sn-note.is-dragging {
        box-shadow:
          0 20px 40px rgba(60, 50, 0, .28),
          0 4px 10px rgba(60, 50, 0, .18);
      }

      #${CONTAINER_ID} .sp-sn-note::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -6px;
        height: 12px;
        background:
          radial-gradient(circle at 12% 0, transparent 6px, var(--sn-paper) 7px) 0 0/24px 12px repeat-x;
        filter: drop-shadow(0 4px 3px rgba(60,50,0,.12));
        pointer-events: none;
      }

      #${CONTAINER_ID} .sp-sn-tape {
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%) rotate(-3deg);
        width: 90px;
        height: 22px;
        background: var(--sn-tape);
        border: 1px solid rgba(255,255,255,.7);
        box-shadow: 0 2px 4px rgba(0,0,0,.06);
        z-index: 2;
        pointer-events: none;
      }

      #${CONTAINER_ID} .sp-sn-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 10px 8px 4px 12px;
        cursor: grab;
        color: var(--sn-head);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .06em;
        flex-shrink: 0;
      }
      #${CONTAINER_ID} .sp-sn-note.is-dragging .sp-sn-top {
        cursor: grabbing;
      }

      #${CONTAINER_ID} .sp-sn-actions {
        display: flex;
        align-items: center;
        gap: 3px;
        opacity: 0;
        transition: opacity .15s ease;
      }
      #${CONTAINER_ID} .sp-sn-note:hover .sp-sn-actions,
      #${CONTAINER_ID} .sp-sn-note:focus-within .sp-sn-actions {
        opacity: 1;
      }

      #${CONTAINER_ID} .sp-sn-btn {
        width: 22px; height: 22px;
        display: inline-flex; align-items: center; justify-content: center;
        border: 0; background: transparent;
        color: var(--sn-head);
        cursor: pointer;
        border-radius: 5px;
        font-family: inherit;
        font-size: 13px;
        padding: 0;
      }
      #${CONTAINER_ID} .sp-sn-btn:hover {
        background: var(--sn-clear-bg);
      }
      #${CONTAINER_ID} .sp-sn-btn.sp-sn-danger:hover {
        background: rgba(180, 35, 24, .18);
        color: #b42318;
      }

      #${CONTAINER_ID} .sp-sn-color-dots {
        display: flex; gap: 3px;
        margin-right: 3px;
      }
      #${CONTAINER_ID} .sp-sn-color-dot {
        width: 12px; height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(0,0,0,.12);
        cursor: pointer;
        padding: 0;
      }
      #${CONTAINER_ID} .sp-sn-color-dot.is-active {
        box-shadow: 0 0 0 2px rgba(0,0,0,.35);
      }

      #${CONTAINER_ID} .sp-sn-text {
        flex: 1;
        width: 100%;
        box-sizing: border-box;
        border: 0;
        background: transparent;
        resize: none;
        padding: 0 14px 14px 14px;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.45;
        color: var(--sn-text);
        outline: none;
        min-height: 60px;
      }
      #${CONTAINER_ID} .sp-sn-text::placeholder {
        color: var(--sn-text);
        opacity: .45;
        font-style: italic;
      }

      #${CONTAINER_ID} .sp-sn-resize {
        position: absolute;
        right: 0; bottom: 0;
        width: 22px; height: 22px;
        cursor: nwse-resize;
        z-index: 3;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 3px;
        opacity: .4;
        transition: opacity .15s ease;
      }
      #${CONTAINER_ID} .sp-sn-note:hover .sp-sn-resize {
        opacity: .85;
      }
      #${CONTAINER_ID} .sp-sn-resize::after {
        content: '';
        width: 10px; height: 10px;
        border-right: 2px solid var(--sn-head);
        border-bottom: 2px solid var(--sn-head);
      }

      #${ADD_BTN_ID} {
        position: fixed;
        right: 22px;
        bottom: 22px;
        width: 54px; height: 54px;
        border-radius: 50%;
        border: 0;
        background: #f5c518;
        color: #4a3e00;
        font-size: 30px;
        font-weight: 700;
        cursor: pointer;
        box-shadow:
          0 10px 24px rgba(180, 140, 0, .35),
          0 3px 6px rgba(180, 140, 0, .25);
        z-index: 501;
        display: none;
        align-items: center;
        justify-content: center;
        line-height: 1;
        padding: 0 0 6px 0;
        font-family: inherit;
        transition: transform .15s ease, background .15s ease;
      }
      #${ADD_BTN_ID}.is-visible { display: flex; }
      #${ADD_BTN_ID}:hover {
        transform: scale(1.06);
        background: #ffd633;
      }
      #${ADD_BTN_ID}:active {
        transform: scale(.96);
      }

      @media (max-width: 700px) {
        #${ADD_BTN_ID} {
          right: 16px;
          bottom: 90px;
          width: 48px; height: 48px;
          font-size: 26px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============ CONTAINER / BUTTON ============ */

  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      document.body.appendChild(container);
    }
    return container;
  }

  function ensureAddButton() {
    let btn = document.getElementById(ADD_BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = ADD_BTN_ID;
      btn.type = 'button';
      btn.title = 'Добавить заметку';
      btn.textContent = '+';
      btn.addEventListener('click', createNote);
      document.body.appendChild(btn);
    }
    return btn;
  }

  function onDashboard() {
    return !!(
      document.getElementById('spDashboardHeader') ||
      document.getElementById('homeTaskTitleInput') ||
      document.getElementById('calcBoxesQty') ||
      document.querySelector('.sp-quick-strip')
    );
  }

  function updateVisibility() {
    const dash = onDashboard();
    const c = ensureContainer();
    const b = ensureAddButton();

    if (dash) {
      c.classList.remove('is-hidden');
      b.classList.add('is-visible');
    } else {
      c.classList.add('is-hidden');
      b.classList.remove('is-visible');
    }
  }

  /* ============ RENDER ============ */

  function renderNotes() {
    const c = ensureContainer();
    c.innerHTML = '';

    notes.forEach(n => {
      n.w = clamp(n.w, MIN_W, Math.min(MAX_W, window.innerWidth - 20));
      n.h = clamp(n.h, MIN_H, Math.min(MAX_H, window.innerHeight - 20));
      n.x = clamp(n.x, 4, Math.max(4, window.innerWidth - n.w - 4));
      n.y = clamp(n.y, 4, Math.max(4, window.innerHeight - n.h - 4));
    });

    notes.forEach(n => c.appendChild(buildNoteEl(n)));
    updateVisibility();
  }

  function buildNoteEl(note) {
    const colors = COLORS[note.color] || COLORS[DEFAULT_COLOR];
    const el = document.createElement('div');
    el.className = 'sp-sn-note';
    el.dataset.noteId = note.id;
    el.style.cssText = `
      left:${note.x}px;
      top:${note.y}px;
      width:${note.w}px;
      height:${note.h}px;
      background:${colors.bg};
      --sn-paper:${colors.paper};
      --sn-tape:${colors.tape};
      --sn-text:${colors.text};
      --sn-head:${colors.head};
      --sn-clear-bg:${colors.clearBg};
    `;

    el.innerHTML = `
      <div class="sp-sn-tape"></div>
      <div class="sp-sn-top">
        <span>📌 Заметка</span>
        <div class="sp-sn-actions">
          <div class="sp-sn-color-dots">
            ${COLOR_KEYS.map(k => `
              <button type="button"
                class="sp-sn-color-dot ${k === note.color ? 'is-active' : ''}"
                data-sn-color="${k}"
                title="${k}"
                style="background:${COLORS[k].dot}"
              ></button>
            `).join('')}
          </div>
          <button type="button" class="sp-sn-btn sp-sn-danger" data-sn-del="1" title="Удалить">✕</button>
        </div>
      </div>
      <textarea class="sp-sn-text" placeholder="Заметка...">${escapeHtml(note.text || '')}</textarea>
      <div class="sp-sn-resize" data-sn-resize="1" title="Потяните, чтобы изменить размер"></div>
    `;

    const top = el.querySelector('.sp-sn-top');
    top.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      startDrag(e, el, note);
    });

    const resizeHandle = el.querySelector('[data-sn-resize]');
    resizeHandle.addEventListener('pointerdown', e => {
      e.stopPropagation();
      startResize(e, el, note);
    });

    const ta = el.querySelector('.sp-sn-text');
    ta.addEventListener('input', () => {
      note.text = ta.value || '';
      saveDebounced();
    });

    el.querySelectorAll('[data-sn-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        note.color = btn.getAttribute('data-sn-color') || DEFAULT_COLOR;
        save();
        renderNotes();
      });
    });

    el.querySelector('[data-sn-del]')?.addEventListener('click', () => {
      deleteNote(note.id);
    });

    return el;
  }

  /* ============ DRAG / RESIZE ============ */

  function startDrag(e, el, note) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = note.x;
    const startTop = note.y;
    const pointerId = e.pointerId;

    el.classList.add('is-dragging');
    try { el.setPointerCapture(pointerId); } catch (err) {}

    const onMove = ev => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      note.x = clamp(startLeft + dx, 4, window.innerWidth - note.w - 4);
      note.y = clamp(startTop + dy, 4, window.innerHeight - 40);
      el.style.left = note.x + 'px';
      el.style.top = note.y + 'px';
    };

    const onUp = ev => {
      if (ev.pointerId !== pointerId) return;
      el.classList.remove('is-dragging');
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      save();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  function startResize(e, el, note) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = note.w;
    const startH = note.h;
    const pointerId = e.pointerId;

    try { el.setPointerCapture(pointerId); } catch (err) {}

    const onMove = ev => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      note.w = clamp(startW + dx, MIN_W, Math.min(MAX_W, window.innerWidth - note.x - 8));
      note.h = clamp(startH + dy, MIN_H, Math.min(MAX_H, window.innerHeight - note.y - 8));
      el.style.width = note.w + 'px';
      el.style.height = note.h + 'px';
    };

    const onUp = ev => {
      if (ev.pointerId !== pointerId) return;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      save();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  /* ============ CRUD ============ */

  function createNote() {
    const w = 300;
    const h = 220;
    const x = Math.max(20, window.innerWidth - w - 40);
    let y = 100;

    notes.forEach(n => {
      if (n.x === x || Math.abs(n.x - x) < 20) {
        y = Math.max(y, n.y + n.h + 12);
      }
    });
    if (y + h > window.innerHeight - 100) y = 100;

    notes.push({
      id: uid(),
      x, y, w, h,
      text: '',
      color: DEFAULT_COLOR
    });

    save();
    renderNotes();

    setTimeout(() => {
      const last = notes[notes.length - 1];
      document.querySelector(`[data-note-id="${last.id}"] .sp-sn-text`)?.focus();
    }, 50);
  }

  function deleteNote(id) {
    if (!confirm('Удалить заметку?')) return;
    notes = notes.filter(n => n.id !== id);
    save();
    renderNotes();
  }

  /* ============ OBSERVER ============ */

  let scheduled = false;
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { updateVisibility(); }
      catch (e) { console.warn('[StickyNotes] update error:', e); }
    });
  }

  function startObserver() {
    if (observer) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }

    observer = new MutationObserver(() => scheduleUpdate());
    observer.observe(content, { childList: true });

    window.addEventListener('resize', () => {
      notes.forEach(n => {
        n.w = clamp(n.w, MIN_W, Math.min(MAX_W, window.innerWidth - 20));
        n.h = clamp(n.h, MIN_H, Math.min(MAX_H, window.innerHeight - 20));
        n.x = clamp(n.x, 4, Math.max(4, window.innerWidth - n.w - 4));
        n.y = clamp(n.y, 4, Math.max(4, window.innerHeight - n.h - 4));
      });
      save();
      renderNotes();
    });

    scheduleUpdate();
    console.log('[StickyNotes] Наблюдение за #content запущено');
  }

  /* ============ INIT ============ */

  function init() {
    injectStyles();
    notes = load();
    ensureContainer();
    ensureAddButton();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        renderNotes();
        startObserver();
      }, { once: true });
    } else {
      renderNotes();
      startObserver();
    }

    setTimeout(() => { renderNotes(); startObserver(); }, 500);
    setTimeout(() => { renderNotes(); startObserver(); }, 2000);

    console.log('[StickyNotes] Модуль инициализирован. Заметок:', notes.length);
  }

  init();

  window.spStickyNotes = {
    create: createNote,
    getNotes: () => notes.slice(),
    clearAll: () => {
      if (!confirm('Удалить ВСЕ заметки?')) return;
      notes = [];
      save();
      renderNotes();
    },
    version: '2.0.0'
  };

})();
