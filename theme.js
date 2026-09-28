/* =========================================================
   SKLADAPLAN — ТЕМА ОФОРМЛЕНИЯ
   =========================================================

   Что делает:
   - Светлая / Тёмная / Системная тема.
   - Инжектит CSS-переменные через <style> — style.css не трогаем.
   - Сохраняет выбор в localStorage.
   - Реагирует на смену системной темы.

   Изоляция:
   - Не трогает app.js и другие модули.
   - Если что-то упадёт — просто нет тёмной темы,
     интерфейс остаётся светлым.
   ========================================================= */

(function () {
  'use strict';
  if (window.spTheme) return;

  const STYLE_ID = 'spThemeStyles';
  const CARD_ID  = 'spThemeCard';
  const LS_KEY   = 'sp-theme';
  const MODES    = ['light', 'dark', 'auto'];

  let currentMode = 'auto';
  let mediaQuery = null;

  /* ============== CSS ============== */

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* =====================================================
         ТЁМНАЯ ТЕМА — основные переменные
         ===================================================== */
      html[data-theme="dark"] {
        --bg: #0b1220;
        --surface: #111827;
        --surface-soft: #0f172a;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --line: #1f2937;
        --shadow-card: 0 6px 24px rgba(0,0,0,.5), 0 1px 2px rgba(0,0,0,.3);
        color-scheme: dark;
      }

      html[data-theme="dark"] body {
        background: var(--bg);
        color: var(--text);
      }

      /* ---------- Топбар ---------- */
      html[data-theme="dark"] .topbar {
        background: rgba(17, 24, 39, .92);
        border-bottom-color: var(--line);
      }
      html[data-theme="dark"] .crumb,
      html[data-theme="dark"] .crumb span {
        color: #94a3b8;
      }
      html[data-theme="dark"] .topbar h1 { color: var(--text); }
      html[data-theme="dark"] .mobile-menu {
        background: rgba(255,255,255,.08);
        color: #e5e7eb;
      }

      /* ---------- Карточки ---------- */
      html[data-theme="dark"] .sp-card {
        background: var(--surface);
        border-color: var(--line);
      }
      html[data-theme="dark"] .sp-card-label { color: var(--muted); }
      html[data-theme="dark"] .sp-muted { color: var(--muted); }

      /* ---------- Кнопки ---------- */
      html[data-theme="dark"] .sp-btn.secondary,
      html[data-theme="dark"] .ghost {
        background: var(--surface-soft);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] .sp-btn.secondary:hover,
      html[data-theme="dark"] .ghost:hover {
        background: #1e293b;
      }

      /* ---------- Поля ввода ---------- */
      html[data-theme="dark"] input,
      html[data-theme="dark"] select,
      html[data-theme="dark"] textarea {
        background: var(--surface);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] input::placeholder,
      html[data-theme="dark"] textarea::placeholder {
        color: #64748b;
      }

      /* ---------- Таблицы ---------- */
      html[data-theme="dark"] .sp-table-wrap,
      html[data-theme="dark"] .table-wrap,
      html[data-theme="dark"] .data-table,
      html[data-theme="dark"] .sp-table {
        background: var(--surface);
        border-color: var(--line);
      }
      html[data-theme="dark"] .sp-table th,
      html[data-theme="dark"] .data-table th,
      html[data-theme="dark"] .sp-table thead th {
        background: var(--surface-soft);
        color: #cbd5e1;
        border-color: var(--line);
      }
      html[data-theme="dark"] .sp-table td,
      html[data-theme="dark"] .data-table td {
        border-color: var(--line);
        color: var(--text);
      }
      html[data-theme="dark"] .sp-table tr:hover,
      html[data-theme="dark"] .data-table tbody tr:hover {
        background: rgba(255,255,255,.03);
      }
      html[data-theme="dark"] .sp-table tr.selected,
      html[data-theme="dark"] .data-table tr.selected {
        background: rgba(37, 99, 235, .18);
      }

      /* ---------- Быстрые действия (главная) ---------- */
      html[data-theme="dark"] .sp-quick-item {
        background: var(--surface-soft);
        border-color: var(--line);
        color: var(--text);
      }
      html[data-theme="dark"] .sp-quick-item:hover {
        background: #1e293b;
        border-color: #334155;
      }
      html[data-theme="dark"] .sp-quick-icon { color: var(--muted); }

      /* ---------- Модальные окна (общий паттерн) ---------- */
      html[data-theme="dark"] .sp-modal {
        background: var(--surface);
        color: var(--text);
      }
      html[data-theme="dark"] .sp-modal-head { border-color: var(--line); }
      html[data-theme="dark"] .sp-modal-close {
        color: var(--text);
      }

      /* ---------- Command Palette ---------- */
      html[data-theme="dark"] #spCommandPalette .sp-cp-card {
        background: var(--surface);
        color: var(--text);
      }
      html[data-theme="dark"] #spCommandPalette .sp-cp-head {
        border-color: var(--line);
      }
      html[data-theme="dark"] #spCommandPalette input {
        background: transparent;
        color: var(--text);
      }
      html[data-theme="dark"] #spCommandPalette .sp-cp-item:hover,
      html[data-theme="dark"] #spCommandPalette .sp-cp-item.is-active {
        background: rgba(255,255,255,.06);
      }
      html[data-theme="dark"] #spCommandPalette .sp-cp-icon {
        background: #1e293b;
        color: #cbd5e1;
      }
      html[data-theme="dark"] #spCommandPalette .sp-cp-foot {
        background: var(--surface-soft);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spCommandPalette .sp-cp-kbd span,
      html[data-theme="dark"] #spCommandPalette .sp-cp-foot-hint kbd {
        background: #1e293b;
        border-color: #334155;
        color: #cbd5e1;
      }

      /* ---------- Аудит-лог ---------- */
      html[data-theme="dark"] #spAuditLogModal .sp-audit-card,
      html[data-theme="dark"] #spAuditLogModal .sp-audit-head,
      html[data-theme="dark"] #spAuditLogModal table {
        background: var(--surface);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spAuditLogModal thead,
      html[data-theme="dark"] #spAuditLogModal thead th {
        background: var(--surface-soft);
        color: #cbd5e1;
      }
      html[data-theme="dark"] #spAuditLogModal .sp-audit-filters,
      html[data-theme="dark"] #spAuditLogModal .sp-audit-counter {
        background: var(--surface-soft);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spAuditLogModal .sp-audit-filters input,
      html[data-theme="dark"] #spAuditLogModal .sp-audit-filters select {
        background: var(--surface);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spAuditLogModal tbody td {
        border-color: var(--line);
      }

      /* ---------- Аналитика ---------- */
      html[data-theme="dark"] #spAnalyticsModal .sp-an-card,
      html[data-theme="dark"] #spAnalyticsModal .sp-an-block,
      html[data-theme="dark"] #spAnalyticsModal .sp-an-kpi,
      html[data-theme="dark"] #spAnalyticsModal .sp-an-head {
        background: var(--surface);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spAnalyticsModal .sp-an-kpi-value,
      html[data-theme="dark"] #spAnalyticsModal .sp-an-block-head h3 { color: var(--text); }

      /* ---------- История коробки ---------- */
      html[data-theme="dark"] #spBoxHistoryModal .sp-hist-card,
      html[data-theme="dark"] #spBoxHistoryModal .sp-hist-head,
      html[data-theme="dark"] #spBoxHistoryModal .sp-hist-body {
        background: var(--surface);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spBoxHistoryModal .sp-hist-info {
        background: var(--surface-soft);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spBoxHistoryModal .sp-hist-item::after {
        background: #1f2937;
      }
      html[data-theme="dark"] #spBoxHistoryModal .sp-hist-icon {
        background: #1e293b;
      }
      html[data-theme="dark"] #spBoxHistoryModal .sp-hist-title,
      html[data-theme="dark"] #spBoxHistoryModal .sp-hist-info b { color: var(--text); }

      /* ---------- Справочники ---------- */
      html[data-theme="dark"] .sp-ref-block,
      html[data-theme="dark"] .sp-ref-hero,
      html[data-theme="dark"] .sp-ref-tabs {
        background: var(--surface);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] .sp-ref-tabs { background: #0f172a; }
      html[data-theme="dark"] .sp-ref-tab { color: var(--muted); }
      html[data-theme="dark"] .sp-ref-tab.is-active {
        background: var(--surface);
        color: var(--text);
      }
      html[data-theme="dark"] .sp-ref-block-head { border-color: var(--line); }
      html[data-theme="dark"] .sp-ref-table th {
        background: var(--surface-soft);
        color: #cbd5e1;
        border-color: var(--line);
      }
      html[data-theme="dark"] .sp-ref-table td {
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spRefModal .sp-ref-modal {
        background: var(--surface);
        color: var(--text);
      }
      html[data-theme="dark"] #spRefModal .sp-ref-modal-head,
      html[data-theme="dark"] #spRefModal .sp-ref-modal-foot {
        border-color: var(--line);
      }
      html[data-theme="dark"] #spRefModal .sp-ref-modal-foot { background: var(--surface-soft); }

      /* ---------- Роли / Telegram / Email модалки ---------- */
      html[data-theme="dark"] #spRoleModal .sp-r-modal-card,
      html[data-theme="dark"] #spTgUserModal > div,
      html[data-theme="dark"] #spCameraScannerModal .sp-cam-card,
      html[data-theme="dark"] #spCollectedVerifyModal > div {
        background: var(--surface);
        color: var(--text);
      }

      /* ---------- Карточки в разделе "Данные" ---------- */
      html[data-theme="dark"] #spTelegramCard .sp-tg-field input,
      html[data-theme="dark"] #spTelegramCard .sp-tg-field select,
      html[data-theme="dark"] #spTelegramCard .sp-tg-users-table,
      html[data-theme="dark"] #spEmailCard .sp-em-field input,
      html[data-theme="dark"] #spEmailCard .sp-em-field select {
        background: var(--surface);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spTelegramCard .sp-tg-users-table th {
        background: var(--surface-soft);
        color: #cbd5e1;
      }
      html[data-theme="dark"] #spTelegramCard .sp-tg-users-table td,
      html[data-theme="dark"] #spEmailCard .sp-em-help,
      html[data-theme="dark"] #spTelegramCard .sp-tg-help {
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] #spTelegramCard .sp-tg-help,
      html[data-theme="dark"] #spEmailCard .sp-em-help {
        background: #0f172a;
        color: #cbd5e1;
      }

      /* ---------- Справка ---------- */
      html[data-theme="dark"] .help-page,
      html[data-theme="dark"] .help-page h1,
      html[data-theme="dark"] .help-page h2,
      html[data-theme="dark"] .help-page h3 { color: var(--text); }
      html[data-theme="dark"] .help-section,
      html[data-theme="dark"] .help-card,
      html[data-theme="dark"] .help-quick-nav,
      html[data-theme="dark"] .help-dropdown-section {
        background: var(--surface);
        color: var(--text);
        border-color: var(--line);
      }
      html[data-theme="dark"] .help-quick-nav a {
        color: #cbd5e1 !important;
      }
      html[data-theme="dark"] .help-quick-nav a:hover {
        background: var(--surface-soft) !important;
        border-color: var(--line) !important;
        color: #fff !important;
      }

      /* ---------- Скроллбар в тёмной теме ---------- */
      html[data-theme="dark"] ::-webkit-scrollbar { width: 10px; height: 10px; }
      html[data-theme="dark"] ::-webkit-scrollbar-track { background: #0b1220; }
      html[data-theme="dark"] ::-webkit-scrollbar-thumb {
        background: #1f2937;
        border-radius: 6px;
      }
      html[data-theme="dark"] ::-webkit-scrollbar-thumb:hover { background: #334155; }

      /* =====================================================
         ПЕРЕКЛЮЧАТЕЛЬ ТЕМЫ (карточка в "Данные")
         ===================================================== */
      #${CARD_ID} .sp-th-seg {
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        background: #f1f5f9;
        border-radius: 12px;
        margin-top: 6px;
      }
      #${CARD_ID} .sp-th-btn {
        border: 0;
        background: transparent;
        padding: 9px 16px;
        border-radius: 9px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        color: #64748b;
        font-family: inherit;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      #${CARD_ID} .sp-th-btn:hover { color: #0f172a; }
      #${CARD_ID} .sp-th-btn.is-active {
        background: #fff;
        color: #0f172a;
        box-shadow: 0 1px 3px rgba(15,23,42,.08);
      }
      html[data-theme="dark"] #${CARD_ID} .sp-th-seg {
        background: #0f172a;
      }
      html[data-theme="dark"] #${CARD_ID} .sp-th-btn { color: #94a3b8; }
      html[data-theme="dark"] #${CARD_ID} .sp-th-btn:hover { color: #e5e7eb; }
      html[data-theme="dark"] #${CARD_ID} .sp-th-btn.is-active {
        background: #1e293b;
        color: #e5e7eb;
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ПРИМЕНЕНИЕ ТЕМЫ ============== */

  function applyTheme(mode) {
    currentMode = mode;

    const html = document.documentElement;
    let effective;

    if (mode === 'auto') {
      effective = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      effective = mode;
    }

    html.setAttribute('data-theme', effective);

    /* Обновляем кнопки в переключателе */
    const btns = document.querySelectorAll(`#${CARD_ID} .sp-th-btn`);
    btns.forEach(b => {
      b.classList.toggle('is-active', b.getAttribute('data-th-mode') === mode);
    });
  }

  function setMode(mode) {
    if (!MODES.includes(mode)) mode = 'auto';
    try { localStorage.setItem(LS_KEY, mode); } catch (e) {}
    applyTheme(mode);
  }

  function getSavedMode() {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v && MODES.includes(v)) return v;
    } catch (e) {}
    return 'auto';
  }

  /* ============== КАРТОЧКА В "ДАННЫЕ" ============== */

  function buildCard() {
    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'sp-card';
    card.style.marginBottom = '16px';

    card.innerHTML = `
      <h3 style="margin:0 0 4px;font-size:16px;font-weight:700;">🎨 Тема оформления</h3>
      <p style="margin:0 0 10px;font-size:13px;color:#64748b;line-height:1.4;">
        Выберите как выглядит SKLADAPLAN. Тема сохраняется на устройстве.
      </p>
      <div class="sp-th-seg">
        <button type="button" class="sp-th-btn" data-th-mode="light">☀️ Светлая</button>
        <button type="button" class="sp-th-btn" data-th-mode="dark">🌙 Тёмная</button>
        <button type="button" class="sp-th-btn" data-th-mode="auto">💻 Системная</button>
      </div>
    `;

    card.querySelectorAll('[data-th-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        setMode(btn.getAttribute('data-th-mode'));
      });
    });

    return card;
  }

  function attachCard() {
    if (document.getElementById(CARD_ID)) {
      /* Обновим состояние кнопок при повторном открытии */
      applyTheme(currentMode);
      return;
    }

    /* Куда вставляем: в самый верх раздела "Данные" — сразу после
       первого .sp-card (обычно "📊 Статистика базы") */
    const anchor =
      document.getElementById('spEmailCard') ||
      document.getElementById('spTelegramCard') ||
      document.getElementById('spRolesCard') ||
      document.getElementById('spDataToolsCard') ||
      document.querySelector('#logoutBtn')?.closest('.sp-card');

    if (!anchor) return;

    const card = buildCard();
    anchor.insertAdjacentElement('beforebegin', card);

    applyTheme(currentMode);

    console.log('[Theme] Карточка добавлена');
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();

    currentMode = getSavedMode();
    applyTheme(currentMode);

    /* Реакция на смену системной темы */
    try {
      mediaQuery = matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        if (currentMode === 'auto') applyTheme('auto');
      };
      if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handler);
      else if (mediaQuery.addListener) mediaQuery.addListener(handler);
    } catch (e) {}

    /* Карточку вставляем по таймеру — раздел "Данные" перерисовывается */
    const tryAttach = () => {
      try { attachCard(); } catch (e) { console.warn('[Theme] attach:', e); }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach, { once: true });
    } else {
      tryAttach();
    }

    setTimeout(tryAttach, 500);
    setTimeout(tryAttach, 2000);
    setTimeout(tryAttach, 5000);

    console.log('[Theme] Модуль инициализирован, режим:', currentMode);
  }

  init();

  window.spTheme = {
    setMode,
    getMode: () => currentMode,
    applyTheme,
    version: '1.0.0'
  };

})();
