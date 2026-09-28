/* =========================================================
   SKLADAPLAN — СТИКЕР-ЗАМЕТКА НА ДАШБОРДЕ
   =========================================================

   Что делает:
   - Вставляет на главную страницу «приклеенную» заметку.
   - Текст автосохраняется (debounce 500мс).
   - Хранится в localStorage этого устройства.

   Что НЕ делает:
   - Не трогает app.js и другие модули.

   Если понадобится шарить заметку с коллегой —
   скажите, переделаю на хранение в Supabase.
   ========================================================= */

(function () {
  'use strict';
  if (window.spStickyNote) return;

  const STYLES_ID = 'spStickyNoteStyles';
  const ID = 'spStickyNote';
  const LS_KEY = 'skladaplan-sticky-note';
  const SAVE_DEBOUNCE_MS = 500;

  let contentObserver = null;
  let scheduled = false;
  let saveTimer = null;

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${ID} {
        max-width: 340px;
        margin: 0 0 20px auto;
        position: relative;
        transform: rotate(-1.2deg);
        transition: transform .2s ease;
      }
      #${ID}:hover {
        transform: rotate(0deg);
      }

      #${ID} .sp-sn-paper {
        position: relative;
        background: linear-gradient(180deg, #fff9bf 0%, #fdf3a1 100%);
        border-radius: 2px;
        padding: 22px 20px 16px;
        box-shadow:
          0 8px 20px rgba(120, 100, 0, .18),
          0 2px 4px rgba(120, 100, 0, .12),
          inset 0 -18px 24px -18px rgba(120, 100, 0, .15);
        min-height: 160px;
      }

      /* Мягкий «оторванный» нижний край */
      #${ID} .sp-sn-paper::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -6px;
        height: 12px;
        background:
          radial-gradient(circle at 12% 0, transparent 6px, #fdf3a1 7px) 0 0/24px 12px repeat-x;
        filter: drop-shadow(0 4px 3px rgba(120,100,0,.12));
        pointer-events: none;
      }

      /* «Скотч» сверху */
      #${ID} .sp-sn-tape {
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%) rotate(-3deg);
        width: 90px;
        height: 22px;
        background: rgba(255,255,255,.55);
        border: 1px solid rgba(255,255,255,.7);
        box-shadow: 0 2px 4px rgba(0,0,0,.06);
        z-index: 2;
      }

      #${ID} .sp-sn-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 700;
        color: #6b5a00;
        text-transform: uppercase;
        letter-spacing: .05em;
      }

      #${ID} .sp-sn-clear {
        border: 0;
        background: transparent;
        color: #8c7a00;
        font-size: 12px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: inherit;
      }
      #${ID} .sp-sn-clear:hover {
        background: rgba(120,100,0,.1);
      }

      #${ID} .sp-sn-textarea {
        width: 100%;
        box-sizing: border-box;
        border: 0;
        background: transparent;
        resize: vertical;
        min-height: 110px;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.45;
        color: #4a3e00;
        outline: none;
        padding: 0;
      }
      #${ID} .sp-sn-textarea::placeholder {
        color: rgba(120,100,0,.45);
        font-style: italic;
      }

      #${ID} .sp-sn-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
        font-size: 10px;
        color: rgba(120,100,0,.7);
      }

      @media (max-width: 700px) {
        #${ID} {
          max-width: none;
          margin: 0 0 16px;
          transform: rotate(0deg);
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ХРАНИЛИЩЕ ============== */

  function loadNote() {
    try { return localStorage.getItem(LS_KEY) || ''; }
    catch (e) { return ''; }
  }

  function saveNote(text) {
    try { localStorage.setItem(LS_KEY, text); }
    catch (e) { console.warn('[StickyNote] save error:', e); }
  }

  /* ============== РЕНДЕР ============== */

  function buildNote() {
    if (document.getElementById(ID)) return;

    const content = document.getElementById('content');
    if (!content) return;

    /* На главной? Признак — есть KPI-блок из dashboard.js */
    const onDashboard = !!document.getElementById('spDashboardHeader')
                     || !!document.getElementById('homeTaskTitleInput');
    if (!onDashboard) return;

    const note = document.createElement('div');
    note.id = ID;
    note.innerHTML = `
      <div class="sp-sn-tape"></div>
      <div class="sp-sn-paper">
        <div class="sp-sn-head">
          <span>📌 Заметка</span>
          <button type="button" class="sp-sn-clear" id="spSnClearBtn">Очистить</button>
        </div>
        <textarea
          id="spSnTextarea"
          class="sp-sn-textarea"
          placeholder="Что-то важное на сегодня..."
        >${escapeHtml(loadNote())}</textarea>
        <div class="sp-sn-foot">
          <span id="spSnStatus">Сохранено</span>
          <span>${new Date().toLocaleDateString('ru-RU')}</span>
        </div>
      </div>
    `;

    /* Куда вставить: перед первым .sp-card в #content
       (то есть в самое начало главной) */
    const firstCard = content.querySelector('.sp-card');
    if (firstCard && firstCard.parentNode === content) {
      content.insertBefore(note, firstCard);
    } else {
      content.insertBefore(note, content.firstChild);
    }

    const textarea = document.getElementById('spSnTextarea');
    const status = document.getElementById('spSnStatus');

    textarea?.addEventListener('input', () => {
      if (status) status.textContent = 'Сохранение…';
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveNote(textarea.value || '');
        if (status) status.textContent = 'Сохранено';
      }, SAVE_DEBOUNCE_MS);
    });

    document.getElementById('spSnClearBtn')?.addEventListener('click', () => {
      if (!textarea) return;
      if (!textarea.value) return;
      if (!confirm('Очистить заметку?')) return;
      textarea.value = '';
      saveNote('');
      if (status) status.textContent = 'Очищено';
    });

    console.log('[StickyNote] Заметка вставлена');
  }

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ============== НАБЛЮДЕНИЕ ============== */

  function scheduleBuild() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { buildNote(); }
      catch (e) { console.warn('[StickyNote] build error:', e); }
    });
  }

  function startObserver() {
    if (contentObserver) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }

    contentObserver = new MutationObserver(() => {
      /* Если ушли с главной — удаляем заметку,
         чтобы не занимала место на других страницах */
      const onDashboard = !!document.getElementById('spDashboardHeader')
                       || !!document.getElementById('homeTaskTitleInput');
      if (!onDashboard) {
        const el = document.getElementById(ID);
        if (el) el.remove();
        return;
      }
      scheduleBuild();
    });

    contentObserver.observe(content, { childList: true });
    scheduleBuild();
    console.log('[StickyNote] Наблюдение за #content запущено');
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
    setTimeout(startObserver, 500);
    setTimeout(startObserver, 2000);
    console.log('[StickyNote] Модуль инициализирован');
  }

  init();

  window.spStickyNote = {
    rebuild: scheduleBuild,
    version: '1.0.0'
  };

})();
