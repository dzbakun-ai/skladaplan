/* =========================================================
   SKLADAPLAN — СТИКЕР-ЗАМЕТКИ С ДОКОМ (v3)
   =========================================================

   Внешний вид заметки — как было:
     жёлтая бумага, скотч сверху, загнутый угол,
     цветные точки, крестик удаления, resize.
   Никакого сжатия: если заметка в доке — она такая же,
   только стоит ровно, одна под другой, и не двигается.

   Док (правая колонка) — это «зарезервированное место»:
     • все новые заметки появляются в доке
     • заметку можно вытащить из дока на рабочий стол (↗)
       и она ведёт себя как раньше — drag/resize
     • заметку можно положить обратно в док (⬇)
     • 📌 у заголовков блоков на главной — прикрепить
       заметку к конкретному блоку

   Совместимость данных:
     Тот же ключ localStorage 'sp-sticky-notes-v2'.
     Старые заметки при первом запуске автоматически
     «переезжают» в док (флаг docked = true).
   ========================================================= */

(function () {
  'use strict';
  if (window.spStickyNotes) return;

  /* ============ КОНСТАНТЫ ============ */

  const STYLES_ID       = 'spStickyNotesStyles';
  const FLOAT_ID        = 'spStickyNotesContainer';
  const DOCK_ID         = 'spStickyDock';
  const DOCK_BODY_ID    = 'spStickyDockBody';
  const DOCK_TOGGLE_ID  = 'spStickyDockToggle';
  const FAB_ID          = 'spStickyNotesAddBtn';
  const LS_KEY          = 'sp-sticky-notes-v2';
  const LS_DOCK_OPEN    = 'sp-sticky-dock-open';

  const MIN_W = 200, MIN_H = 130;
  const MAX_W = 800, MAX_H = 700;

  const COLORS = {
    yellow: {
      bg: 'linear-gradient(180deg, #fff9bf 0%, #fdf3a1 100%)',
      paper: '#fdf3a1', tape: 'rgba(255,255,255,.55)',
      text: '#4a3e00', head: '#6b5a00',
      clearBg: 'rgba(120,100,0,.1)', dot: '#f5c518'
    },
    blue: {
      bg: 'linear-gradient(180deg, #e0ebff 0%, #c7dfff 100%)',
      paper: '#c7dfff', tape: 'rgba(255,255,255,.55)',
      text: '#1e3a5f', head: '#1e40af',
      clearBg: 'rgba(30,64,175,.12)', dot: '#3b82f6'
    },
    green: {
      bg: 'linear-gradient(180deg, #ddf7dd 0%, #bdeec5 100%)',
      paper: '#bdeec5', tape: 'rgba(255,255,255,.55)',
      text: '#1f4a2a', head: '#166534',
      clearBg: 'rgba(22,101,52,.12)', dot: '#10b981'
    },
    pink: {
      bg: 'linear-gradient(180deg, #ffe7ee 0%, #ffd0dd 100%)',
      paper: '#ffd0dd', tape: 'rgba(255,255,255,.55)',
      text: '#6b1d33', head: '#9d174d',
      clearBg: 'rgba(157,23,77,.12)', dot: '#ec4899'
    },
    purple: {
      bg: 'linear-gradient(180deg, #f0ebff 0%, #ddd6fe 100%)',
      paper: '#ddd6fe', tape: 'rgba(255,255,255,.55)',
      text: '#3b1a6b', head: '#5b21b6',
      clearBg: 'rgba(91,33,182,.12)', dot: '#8b5cf6'
    }
  };
  const COLOR_KEYS    = Object.keys(COLORS);
  const DEFAULT_COLOR = 'yellow';

  /* ============ СОСТОЯНИЕ ============ */

  let notes     = [];
  let dockOpen  = true;
  let observer  = null;
  let saveTimer = null;
  let scheduled = false;

  /* ============ ХРАНИЛИЩЕ ============ */

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      /* Миграция: старые заметки без флага docked — в док */
      let migrated = false;
      arr.forEach(n => {
        if (typeof n.docked !== 'boolean') { n.docked = true; migrated = true; }
        if (!('anchorKey' in n)) { n.anchorKey = null; migrated = true; }
      });
      if (migrated) save(arr);
      return arr;
    } catch (e) { return []; }
  }

  function save(arr) {
    try {
      const data = arr || notes;
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) { console.warn('[StickyNotes] save:', e); }
  }

  function saveDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(), 400);
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

  /* ============ СТИЛИ ============ */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* =====================================================
         КОНТЕЙНЕР ДЛЯ «ПЛАВАЮЩИХ» ЗАМЕТОК (не в доке)
         ===================================================== */
      #${FLOAT_ID} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 500;
      }

      /* =====================================================
         ВНЕШНИЙ ВИД ЗАМЕТКИ — ОДИН И ТОТ ЖЕ
         (для плавающей и для докнутой)
         ===================================================== */
      .sp-sn-note {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: 2px;
        box-shadow:
          0 10px 24px rgba(60,50,0,.18),
          0 2px 6px rgba(60,50,0,.12),
          inset 0 -18px 24px -18px rgba(60,50,0,.15);
        background: var(--sn-bg);
        color: var(--sn-text);
        user-select: none;
      }

      /* Загнутый нижний край «бумаги» */
      .sp-sn-note::after {
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

      /* Скотч сверху */
      .sp-sn-note .sp-sn-tape {
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

      /* Шапка «📌 Заметка» + действия */
      .sp-sn-note .sp-sn-top {
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
      .sp-sn-note.is-dragging .sp-sn-top { cursor: grabbing; }
      .sp-sn-note.is-docked .sp-sn-top { cursor: default; }

      .sp-sn-note .sp-sn-actions {
        display: flex;
        align-items: center;
        gap: 3px;
        opacity: 0;
        transition: opacity .15s ease;
      }
      .sp-sn-note:hover .sp-sn-actions,
      .sp-sn-note:focus-within .sp-sn-actions { opacity: 1; }

      .sp-sn-note .sp-sn-btn {
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        background: transparent;
        color: var(--sn-head);
        cursor: pointer;
        border-radius: 5px;
        font-family: inherit;
        font-size: 13px;
        padding: 0;
      }
      .sp-sn-note .sp-sn-btn:hover { background: var(--sn-clear-bg); }
      .sp-sn-note .sp-sn-btn.sp-sn-danger:hover {
        background: rgba(180,35,24,.18);
        color: #b42318;
      }

      .sp-sn-note .sp-sn-color-dots {
        display: flex;
        gap: 3px;
        margin-right: 3px;
      }
      .sp-sn-note .sp-sn-color-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(0,0,0,.12);
        cursor: pointer;
        padding: 0;
      }
      .sp-sn-note .sp-sn-color-dot.is-active {
        box-shadow: 0 0 0 2px rgba(0,0,0,.35);
      }

      /* Текст */
      .sp-sn-note .sp-sn-text {
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
        overflow: hidden;
      }
      .sp-sn-note .sp-sn-text::placeholder {
        color: var(--sn-text);
        opacity: .45;
        font-style: italic;
      }

      /* Уголок resize — только для плавающих */
      .sp-sn-note .sp-sn-resize {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 22px;
        height: 22px;
        cursor: nwse-resize;
        z-index: 3;
        display: none;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 3px;
        opacity: .4;
        transition: opacity .15s ease;
      }
      .sp-sn-note:not(.is-docked) .sp-sn-resize { display: flex; }
      .sp-sn-note:hover .sp-sn-resize { opacity: .85; }
      .sp-sn-note .sp-sn-resize::after {
        content: '';
        width: 10px;
        height: 10px;
        border-right: 2px solid var(--sn-head);
        border-bottom: 2px solid var(--sn-head);
      }

      /* =====================================================
         ПЛАВАЮЩАЯ ЗАМЕТКА — конкретные x/y/w/h
         ===================================================== */
      #${FLOAT_ID} .sp-sn-note {
        position: absolute;
        pointer-events: auto;
        touch-action: none;
      }
      #${FLOAT_ID} .sp-sn-note.is-dragging {
        box-shadow:
          0 20px 40px rgba(60,50,0,.28),
          0 4px 10px rgba(60,50,0,.18);
      }

      /* =====================================================
         ДОКНУТАЯ ЗАМЕТКА — обычный блок в колонке дока
         ===================================================== */
      #${DOCK_BODY_ID} .sp-sn-note.is-docked {
        position: relative;
        width: 100%;
        height: auto;
        margin: 0 0 18px 0;
        touch-action: auto;
      }
      #${DOCK_BODY_ID} .sp-sn-note.is-docked .sp-sn-text {
        min-height: 44px;
        max-height: none;
        overflow: hidden;
        resize: none;
      }

      /* =====================================================
         ДОК — «ЗАРЕЗЕРВИРОВАННОЕ МЕСТО» СПРАВА
         ===================================================== */
      #${DOCK_ID} {
        position: fixed;
        top: 90px;
        right: 16px;
        width: 360px;
        max-height: calc(100vh - 180px);
        background: rgba(248, 250, 252, .92);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        box-shadow: 0 14px 44px rgba(15,23,42,.12);
        z-index: 550;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: transform .22s ease, opacity .22s ease;
      }
      #${DOCK_ID}.is-closed {
        transform: translateX(calc(100% + 24px));
        opacity: 0;
        pointer-events: none;
      }

      #${DOCK_ID} .sp-sd-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
        background: rgba(255,255,255,.6);
        flex-shrink: 0;
      }
      #${DOCK_ID} .sp-sd-title {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
      }
      #${DOCK_ID} .sp-sd-title small {
        color: #94a3b8;
        font-weight: 600;
        font-size: 11px;
      }
      #${DOCK_ID} .sp-sd-actions {
        display: flex;
        gap: 4px;
      }
      #${DOCK_ID} .sp-sd-icon-btn {
        width: 28px;
        height: 28px;
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
        color: #0f172a;
      }

      #${DOCK_ID} .sp-sd-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px 14px 20px;
        display: flex;
        flex-direction: column;
        /* Заметки «висят» на своих тенях, gap побольше */
        gap: 0;
      }
      #${DOCK_ID} .sp-sd-body::-webkit-scrollbar { width: 8px; }
      #${DOCK_ID} .sp-sd-body::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 6px;
      }

      #${DOCK_ID} .sp-sd-hint {
        padding: 9px 12px;
        font-size: 11px;
        line-height: 1.45;
        color: #94a3b8;
        border-top: 1px solid #e2e8f0;
        background: rgba(255,255,255,.5);
        flex-shrink: 0;
      }
      #${DOCK_ID} .sp-sd-empty {
        padding: 40px 16px;
        text-align: center;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.55;
      }

      /* =====================================================
         КНОПКА-ТРИГГЕР (когда док закрыт)
         ===================================================== */
      #${DOCK_TOGGLE_ID} {
        position: fixed;
        right: 16px;
        bottom: 150px;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        border: 0;
        background: #f5c518;
        color: #4a3e00;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 8px 20px rgba(180,140,0,.35);
        z-index: 551;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 0;
        font-family: inherit;
        transition: transform .15s ease;
      }
      #${DOCK_TOGGLE_ID}.is-visible { display: flex; }
      #${DOCK_TOGGLE_ID}:hover { transform: scale(1.06); }
      #${DOCK_TOGGLE_ID} .sp-sd-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        background: #b42318;
        color: #fff;
        font-size: 10px;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      /* =====================================================
         FAB «+» — создать заметку
         ===================================================== */
      #${FAB_ID} {
        position: fixed;
        right: 22px;
        bottom: 22px;
        width: 54px;
        height: 54px;
        border-radius: 50%;
        border: 0;
        background: #f5c518;
        color: #4a3e00;
        font-size: 30px;
        font-weight: 700;
        cursor: pointer;
        box-shadow:
          0 10px 24px rgba(180,140,0,.35),
          0 3px 6px rgba(180,140,0,.25);
        z-index: 552;
        display: none;
        align-items: center;
        justify-content: center;
        line-height: 1;
        padding: 0 0 6px 0;
        font-family: inherit;
        transition: transform .15s ease, background .15s ease;
      }
      #${FAB_ID}.is-visible { display: flex; }
      #${FAB_ID}:hover { transform: scale(1.06); background: #ffd633; }
      #${FAB_ID}:active { transform: scale(.96); }

      /* =====================================================
         📌 АНКОР У ЗАГОЛОВКА БЛОКА
         ===================================================== */
      .sp-note-anchor {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-left: 8px;
        border: 1px dashed #cbd5e1;
        border-radius: 7px;
        background: transparent;
        color: #94a3b8;
        cursor: pointer;
        font-size: 12px;
        padding: 0;
        font-family: inherit;
        transition: all .15s ease;
        vertical-align: middle;
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
          bottom: 84px;
          right: 10px;
          left: 10px;
          width: auto;
          max-height: 62vh;
          border-radius: 16px 16px 0 0;
        }
        #${DOCK_ID}.is-closed {
          transform: translateY(calc(100% + 24px));
        }
        #${DOCK_TOGGLE_ID} {
          right: 12px;
          bottom: 140px;
        }
      }
      @media (max-width: 700px) {
        #${FAB_ID} {
          right: 16px;
          bottom: 90px;
          width: 48px;
          height: 48px;
          font-size: 26px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============ КОНТЕЙНЕРЫ ============ */

  function ensureFloatContainer() {
    let c = document.getElementById(FLOAT_ID);
    if (!c) {
      c = document.createElement('div');
      c.id = FLOAT_ID;
      document.body.appendChild(c);
    }
    return c;
  }

  function ensureDock() {
    let dock = document.getElementById(DOCK_ID);
    if (!dock) {
      dock = document.createElement('aside');
      dock.id = DOCK_ID;
      dock.innerHTML = `
        <div class="sp-sd-head">
          <span class="sp-sd-title">
            📌 Заметки
            <small id="spStickyDockCount"></small>
          </span>
          <span class="sp-sd-actions">
            <button type="button" class="sp-sd-icon-btn" data-sd-add title="Новая заметка">+</button>
            <button type="button" class="sp-sd-icon-btn" data-sd-close title="Свернуть">×</button>
          </span>
        </div>
        <div class="sp-sd-body" id="${DOCK_BODY_ID}"></div>
        <div class="sp-sd-hint">
          Заметки хранятся на этом устройстве. Нажмите <b>📌</b>
          у заголовка блока, чтобы прикрепить заметку к нему.
          <br>Кнопка <b>↗</b> на заметке — «вынуть» её на рабочий стол.
        </div>
      `;
      document.body.appendChild(dock);

      dock.querySelector('[data-sd-close]').addEventListener('click', closeDock);
      dock.querySelector('[data-sd-add]').addEventListener('click', () => createNote({ docked: true }));
    }
    return dock;
  }

  function ensureDockToggle() {
    let btn = document.getElementById(DOCK_TOGGLE_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = DOCK_TOGGLE_ID;
      btn.type = 'button';
      btn.title = 'Открыть заметки';
      btn.innerHTML = '📌<span class="sp-sd-badge" id="spStickyToggleBadge"></span>';
      document.body.appendChild(btn);
      btn.addEventListener('click', openDock);
    }
    return btn;
  }

  function ensureFab() {
    let btn = document.getElementById(FAB_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = FAB_ID;
      btn.type = 'button';
      btn.title = 'Добавить заметку';
      btn.textContent = '+';
      btn.addEventListener('click', () => createNote({ docked: true }));
      document.body.appendChild(btn);
    }
    return btn;
  }

  /* ============ ВИДИМОСТЬ ============ */

  function onDashboard() {
    return !!(
      document.getElementById('spDashboardHeader') ||
      document.querySelector('.sp-dash-kpis') ||
      document.querySelector('.sp-quick-strip')
    );
  }

  function updateVisibility() {
    const dash = onDashboard();
    const dock   = ensureDock();
    const toggle = ensureDockToggle();
    const fab    = ensureFab();
    const float  = ensureFloatContainer();

    /* Док и его спутники видны только на главной */
    if (dash) {
      dock.style.display = '';
      float.style.display = '';
      fab.classList.add('is-visible');
      toggle.classList.toggle('is-visible', !dockOpen);
    } else {
      dock.style.display = 'none';
      float.style.display = 'none';
      fab.classList.remove('is-visible');
      toggle.classList.remove('is-visible');
    }
  }

  function openDock() {
    dockOpen = true;
    try { localStorage.setItem(LS_DOCK_OPEN, '1'); } catch (e) {}
    document.getElementById(DOCK_ID)?.classList.remove('is-closed');
    updateVisibility();
  }

  function closeDock() {
    dockOpen = false;
    try { localStorage.setItem(LS_DOCK_OPEN, '0'); } catch (e) {}
    document.getElementById(DOCK_ID)?.classList.add('is-closed');
    updateVisibility();
  }

  /* ============ РЕНДЕР ЗАМЕТКИ ============ */

  function buildNoteEl(note) {
    const colors = COLORS[note.color] || COLORS[DEFAULT_COLOR];
    const el = document.createElement('div');
    el.className = 'sp-sn-note' + (note.docked ? ' is-docked' : '');
    el.dataset.noteId = note.id;

    /* Стили: общие CSS-переменные + (для плавающей) координаты */
    let styleStr = `
      --sn-bg:${colors.bg};
      --sn-paper:${colors.paper};
      --sn-tape:${colors.tape};
      --sn-text:${colors.text};
      --sn-head:${colors.head};
      --sn-clear-bg:${colors.clearBg};
    `;

    if (!note.docked) {
      /* Плавающая: абсолютное позиционирование */
      note.w = clamp(note.w || 300, MIN_W, Math.min(MAX_W, window.innerWidth - 20));
      note.h = clamp(note.h || 220, MIN_H, Math.min(MAX_H, window.innerHeight - 20));
      note.x = clamp(note.x ?? 100, 4, Math.max(4, window.innerWidth - note.w - 4));
      note.y = clamp(note.y ?? 100, 4, Math.max(4, window.innerHeight - note.h - 4));
      styleStr += `left:${note.x}px; top:${note.y}px; width:${note.w}px; height:${note.h}px;`;
    }

    el.style.cssText = styleStr;

    /* Кнопки-действия */
    const isDocked = !!note.docked;
    const dockBtn = isDocked
      ? `<button type="button" class="sp-sn-btn" data-sn-undock="1" title="Вынуть на рабочий стол">↗</button>`
      : `<button type="button" class="sp-sn-btn" data-sn-dock="1" title="Положить в док">⬇</button>`;

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
                style="background:${COLORS[k].dot}"></button>
            `).join('')}
          </div>
          ${dockBtn}
          <button type="button" class="sp-sn-btn sp-sn-danger" data-sn-del="1" title="Удалить">✕</button>
        </div>
      </div>
      <textarea class="sp-sn-text" placeholder="Заметка...">${escapeHtml(note.text || '')}</textarea>
      <div class="sp-sn-resize" data-sn-resize="1" title="Потяните, чтобы изменить размер"></div>
    `;

    /* ---- Текст ---- */
    const ta = el.querySelector('.sp-sn-text');
    ta.addEventListener('input', () => {
      note.text = ta.value || '';
      autoResizeTextarea(ta);
      saveDebounced();
    });
    /* Первичный авторазмер, если заметка в доке */
    if (isDocked) {
      requestAnimationFrame(() => autoResizeTextarea(ta));
    }

    /* ---- Цвета ---- */
    el.querySelectorAll('[data-sn-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        note.color = btn.getAttribute('data-sn-color') || DEFAULT_COLOR;
        save();
        renderAll();
      });
    });

    /* ---- Удалить ---- */
    el.querySelector('[data-sn-del]').addEventListener('click', () => {
      if (!confirm('Удалить заметку?')) return;
      notes = notes.filter(n => n.id !== note.id);
      save();
      renderAll();
    });

    /* ---- Док/Анлок ---- */
    el.querySelector('[data-sn-undock]')?.addEventListener('click', () => {
      note.docked = false;
      /* Ставим её около правого края, но не под доком */
      const dockRect = document.getElementById(DOCK_ID)?.getBoundingClientRect();
      note.w = note.w || 300;
      note.h = note.h || 220;
      note.x = Math.max(20, (dockRect?.left || window.innerWidth) - note.w - 40);
      note.y = 120;
      save();
      renderAll();
    });

    el.querySelector('[data-sn-dock]')?.addEventListener('click', () => {
      note.docked = true;
      note.x = note.y = null;
      save();
      renderAll();
    });

    /* ---- Drag (только для плавающей) ---- */
    if (!isDocked) {
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
    }

    return el;
  }

  function autoResizeTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.max(60, ta.scrollHeight + 2);
    ta.style.height = next + 'px';
  }

  /* ============ DRAG / RESIZE (для плавающих) ============ */

  function startDrag(e, el, note) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX, startY = e.clientY;
    const startLeft = note.x, startTop = note.y;
    const pid = e.pointerId;

    el.classList.add('is-dragging');
    try { el.setPointerCapture(pid); } catch (err) {}

    const onMove = ev => {
      if (ev.pointerId !== pid) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      note.x = clamp(startLeft + dx, 4, window.innerWidth - note.w - 4);
      note.y = clamp(startTop + dy, 4, window.innerHeight - 40);
      el.style.left = note.x + 'px';
      el.style.top = note.y + 'px';
    };

    const onUp = ev => {
      if (ev.pointerId !== pid) return;
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

    const startX = e.clientX, startY = e.clientY;
    const startW = note.w, startH = note.h;
    const pid = e.pointerId;

    try { el.setPointerCapture(pid); } catch (err) {}

    const onMove = ev => {
      if (ev.pointerId !== pid) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      note.w = clamp(startW + dx, MIN_W, Math.min(MAX_W, window.innerWidth - note.x - 8));
      note.h = clamp(startH + dy, MIN_H, Math.min(MAX_H, window.innerHeight - note.y - 8));
      el.style.width = note.w + 'px';
      el.style.height = note.h + 'px';
    };

    const onUp = ev => {
      if (ev.pointerId !== pid) return;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      save();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  /* ============ РЕНДЕР ВСЕГО ============ */

  function renderAll() {
    const float = ensureFloatContainer();
    const dockBody = document.getElementById(DOCK_BODY_ID);

    /* Очищаем оба контейнера */
    float.innerHTML = '';
    if (dockBody) dockBody.innerHTML = '';

    const dockedNotes = notes.filter(n => n.docked);
    const floatingNotes = notes.filter(n => !n.docked);

    /* Плавающие — как раньше */
    floatingNotes.forEach(n => float.appendChild(buildNoteEl(n)));

    /* Докнутые — в колонке дока */
    if (dockBody) {
      if (!dockedNotes.length) {
        dockBody.innerHTML = `
          <div class="sp-sd-empty">
            Пока пусто.<br>
            Нажмите «+» или перетащите заметку с рабочего стола (⬇).
          </div>
        `;
      } else {
        dockedNotes.forEach(n => dockBody.appendChild(buildNoteEl(n)));
      }
    }

    /* Счётчики */
    const countEl = document.getElementById('spStickyDockCount');
    if (countEl) {
      countEl.textContent = dockedNotes.length ? `· ${dockedNotes.length}` : '';
    }
    const badgeEl = document.getElementById('spStickyToggleBadge');
    if (badgeEl) {
      badgeEl.textContent = dockedNotes.length ? String(dockedNotes.length) : '';
      badgeEl.style.display = dockedNotes.length ? 'inline-flex' : 'none';
    }

    updateVisibility();
    injectAnchors();
  }

  /* ============ АНКОРЫ 📌 У ЗАГОЛОВКОВ БЛОКОВ ============ */

  function injectAnchors() {
    if (!onDashboard()) return;

    /*
      Ищем заголовки блоков дашборда. Ключ анкора делаем
      стабильным: префикс + нормализованный текст заголовка.
    */
    const candidates = [
      ...document.querySelectorAll('.sp-dashboard-block .sp-dashboard-block-head'),
      ...document.querySelectorAll('#spDashboardHeader .sp-dash-block-head'),
      ...document.querySelectorAll('.sp-card > h3')
    ];

    candidates.forEach(head => {
      if (head.querySelector('.sp-note-anchor')) return;

      /* Определяем видимый текст заголовка */
      const textEl = head.querySelector('h2, h3, b, span');
      const titleText = (textEl?.textContent || head.textContent || '').trim();
      if (!titleText) return;
      const key = 'dh:' + titleText.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);

      /* Куда физически вставляем кнопку */
      let host = head;
      if (head.tagName === 'H3') {
        /* .sp-card > h3 — обернём в span с flex */
        if (!head.dataset.spAnchorWrapped) {
          head.dataset.spAnchorWrapped = '1';
          head.style.display = 'flex';
          head.style.alignItems = 'center';
          head.style.justifyContent = 'space-between';
          head.style.gap = '8px';
          const left = document.createElement('span');
          while (head.firstChild) left.appendChild(head.firstChild);
          head.appendChild(left);
        }
        host = head;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-note-anchor';
      btn.dataset.anchorKey = key;
      btn.title = 'Прикрепить заметку к этому блоку';
      btn.textContent = '📌';

      const attached = notes.find(n => n.anchorKey === key);
      if (attached) btn.classList.add('has-note');

      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        toggleAnchor(key, btn);
      });

      host.appendChild(btn);
    });
  }

  function toggleAnchor(key, btn) {
    /* Если уже привязана — отвязать */
    const existing = notes.find(n => n.anchorKey === key);
    if (existing) {
      existing.anchorKey = null;
      save();
      btn.classList.remove('has-note');
      renderAll();
      return;
    }

    /* Ищем свободную заметку (в доке, без анкора) */
    const free = notes.find(n => n.docked && !n.anchorKey);

    if (free) {
      free.anchorKey = key;
      save();
      btn.classList.add('has-note');
      renderAll();
      /* Прокрутим док к этой заметке */
      const noteEl = document.querySelector(`#${DOCK_BODY_ID} [data-note-id="${free.id}"]`);
      noteEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    /* Свободных нет — предложить создать */
    if (confirm('Нет свободной заметки в доке. Создать новую и прикрепить?')) {
      const id = uid();
      notes.push({
        id, docked: true,
        text: '', color: DEFAULT_COLOR,
        anchorKey: key
      });
      save();
      btn.classList.add('has-note');
      renderAll();
      setTimeout(() => {
        const ta = document.querySelector(`#${DOCK_BODY_ID} [data-note-id="${id}"] .sp-sn-text`);
        ta?.focus();
      }, 60);
    }
  }

  /* ============ СОЗДАНИЕ ============ */

  function createNote(opts = {}) {
    const id = uid();
    const docked = opts.docked !== false;

    const note = {
      id,
      text: '',
      color: DEFAULT_COLOR,
      docked,
      anchorKey: null
    };

    if (!docked) {
      note.w = 300;
      note.h = 220;
      note.x = Math.max(20, window.innerWidth - 340);
      note.y = 100;
    }

    notes.push(note);
    save();
    renderAll();

    setTimeout(() => {
      const selector = docked
        ? `#${DOCK_BODY_ID} [data-note-id="${id}"] .sp-sn-text`
        : `#${FLOAT_ID} [data-note-id="${id}"] .sp-sn-text`;
      document.querySelector(selector)?.focus();
    }, 60);
  }

  /* ============ OBSERVER ============ */

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { updateVisibility(); injectAnchors(); }
      catch (e) { console.warn('[StickyNotes] update:', e); }
    });
  }

  function startObserver() {
    if (observer) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }

    observer = new MutationObserver(() => schedule());
    observer.observe(content, { childList: true, subtree: true });

    window.addEventListener('resize', () => {
      notes.forEach(n => {
        if (n.docked) return;
        n.w = clamp(n.w || 300, MIN_W, Math.min(MAX_W, window.innerWidth - 20));
        n.h = clamp(n.h || 220, MIN_H, Math.min(MAX_H, window.innerHeight - 20));
        n.x = clamp(n.x, 4, Math.max(4, window.innerWidth - n.w - 4));
        n.y = clamp(n.y, 4, Math.max(4, window.innerHeight - n.h - 4));
      });
      save();
      renderAll();
    });

    schedule();
  }

  /* ============ ИНИЦИАЛИЗАЦИЯ ============ */

  function init() {
    injectStyles();
    notes = load();

    /* Восстанавливаем состояние дока */
    try {
      const v = localStorage.getItem(LS_DOCK_OPEN);
      dockOpen = v === null ? true : v === '1';
    } catch (e) { dockOpen = true; }

    ensureFloatContainer();
    ensureDock();
    ensureDockToggle();
    ensureFab();

    const dock = document.getElementById(DOCK_ID);
    if (dock) dock.classList.toggle('is-closed', !dockOpen);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        renderAll();
        startObserver();
      }, { once: true });
    } else {
      renderAll();
      startObserver();
    }

    setTimeout(() => { renderAll(); startObserver(); }, 500);
    setTimeout(() => { renderAll(); startObserver(); }, 2000);

    console.log('[StickyNotes v3] Модуль инициализирован. Заметок:', notes.length);
  }

  init();

  /* ============ ПУБЛИЧНОЕ API ============ */

  window.spStickyNotes = {
    create: createNote,
    getNotes: () => notes.slice(),
    openDock,
    closeDock,
    rebuild: renderAll,
    clearAll: () => {
      if (!confirm('Удалить ВСЕ заметки?')) return;
      notes = [];
      save();
      renderAll();
    },
    version: '3.0.0'
  };

})();
