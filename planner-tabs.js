/* =========================================================
   SKLADAPLAN — ТАБЫ В ПЛАНИРОВЩИКЕ
   =========================================================

   Что делает:
   - В панели «Выбранная дата» объединяет 3 существующих
     блока (Отгрузки / Задачи / Из раздела) в табы.
   - Активный таб сохраняется в localStorage.
   - Работает через MutationObserver на #content — как
     labels/box-history/references/recurring/tasks-tabs.

   Что НЕ делает:
   - Не трогает planner.js, app.js, календарь.
   - Кнопки «+ Отгрузка», «+ Задача», панель действий
     остаются без изменений.
   ========================================================= */

(function () {
  'use strict';
  if (window.spPlannerTabs) return;

  const STYLES_ID = 'spPlannerTabsStyles';
  const NAV_CLASS = 'sp-pt-nav';
  const PANEL_CLASS = 'sp-pt-panel';
  const LS_KEY = 'sp-planner-tab';
  const DEFAULT_TAB = 'shipments';

  let contentObserver = null;
  let scheduled = false;
  let activeTab = DEFAULT_TAB;
  let applyScheduled = false;

  /* ============== УТИЛИТЫ ============== */

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function loadActiveTab() {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v) return v;
    } catch (e) {}
    return DEFAULT_TAB;
  }

  function saveActiveTab(key) {
    try { localStorage.setItem(LS_KEY, key); } catch (e) {}
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      .${NAV_CLASS} {
        display: flex;
        gap: 4px;
        padding: 6px 6px 0;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        border-radius: 14px 14px 0 0;
        overflow-x: auto;
        scrollbar-width: none;
        margin: -20px -20px 20px;
      }
      .${NAV_CLASS}::-webkit-scrollbar { display: none; }

      .${NAV_CLASS} .sp-pt-tab {
        flex: 0 0 auto;
        border: 0;
        background: transparent;
        color: #64748b;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        padding: 11px 16px;
        border-radius: 10px 10px 0 0;
        cursor: pointer;
        white-space: nowrap;
        position: relative;
        transition: background .15s ease, color .15s ease;
      }
      .${NAV_CLASS} .sp-pt-tab:hover {
        color: #0f172a;
        background: rgba(255,255,255,.6);
      }
      .${NAV_CLASS} .sp-pt-tab.is-active {
        background: #fff;
        color: #0f172a;
        box-shadow:
          -1px 0 0 #e2e8f0 inset,
           1px 0 0 #e2e8f0 inset,
           0 -1px 0 #e2e8f0 inset;
      }
      .${NAV_CLASS} .sp-pt-tab.is-active::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1px;
        height: 1px;
        background: #fff;
      }
      .${NAV_CLASS} .sp-pt-tab .sp-pt-count {
        display: inline-block;
        margin-left: 6px;
        padding: 1px 7px;
        border-radius: 999px;
        background: rgba(37,99,235,.1);
        color: var(--primary, #2563EB);
        font-size: 10px;
        font-weight: 700;
      }

      .${PANEL_CLASS} { display: none; }
      .${PANEL_CLASS}.is-active { display: block; }

      /* Внутри панели скрываем заголовки разделов —
         они теперь дублируют табы */
      .${PANEL_CLASS} > .planner-list-section > .planner-list-title {
        display: none;
      }

      /* Кнопка «Открыть раздел» для внешних задач */
      .sp-pt-open-section {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        padding: 6px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 9px;
        background: #fff;
        color: #334155;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .sp-pt-open-section:hover { background: #f8fafc; }
      .sp-pt-open-section-wrap {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 10px;
      }

      @media (max-width: 640px) {
        .${NAV_CLASS} {
          margin: -16px -16px 16px;
          padding: 4px 4px 0;
        }
        .${NAV_CLASS} .sp-pt-tab {
          padding: 10px 12px;
          font-size: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ПРЕОБРАЗОВАНИЕ ============== */

  function buildTabs() {
    const panel = document.querySelector('.planner-day-panel');
    if (!panel) return;

    /* Уже преобразовано — просто применить активный таб */
    if (panel.dataset.spPtDone === '1') {
      applyActiveTab(activeTab);
      return;
    }

    /* Ищем все секции внутри панели */
    const sections = [...panel.querySelectorAll(':scope > .planner-list-section')];
    if (!sections.length) return;

    /* Определяем тип каждой секции по заголовку */
    const items = sections.map(section => {
      const titleEl = section.querySelector('.planner-list-title');
      const titleText = titleEl ? titleEl.textContent.trim() : '';

      let key = '';
      let label = '';
      let icon = '';

      if (/^Отгрузки/i.test(titleText)) {
        key = 'shipments';
        label = 'Отгрузки';
        icon = '🚚';
      } else if (/^Задачи\b/.test(titleText) && !/раздела/i.test(titleText)) {
        key = 'tasks';
        label = 'Задачи';
        icon = '📝';
      } else if (/раздела/i.test(titleText) || /Задачи из раздела/i.test(titleText)) {
        key = 'external';
        label = 'Из раздела';
        icon = '📋';
      } else {
        /* Что-то незнакомое — оставляем как есть, без таба */
        return null;
      }

      /* Считаем элементы внутри для счётчика */
      const listEl = section.querySelector('.planner-list');
      const count = listEl ? listEl.querySelectorAll('.planner-card').length : 0;

      /* Ищем кнопку «Открыть раздел» (только у внешних задач) */
      let openBtn = null;
      if (titleEl) {
        openBtn = titleEl.querySelector('button, .planner-button');
      }

      return { section, key, label, icon, count, openBtn };
    }).filter(Boolean);

    if (!items.length) return;

    /* Создаём nav */
    const nav = document.createElement('div');
    nav.className = NAV_CLASS;

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-pt-tab';
      btn.setAttribute('data-sp-pt-tab', item.key);
      btn.innerHTML = `${item.icon} ${escapeHtml(item.label)}` +
        (item.count > 0
          ? `<span class="sp-pt-count">${item.count}</span>`
          : '');
      btn.addEventListener('click', () => {
        activeTab = item.key;
        saveActiveTab(activeTab);
        applyActiveTab(activeTab);
      });
      nav.appendChild(btn);
    });

    /* Создаём панели — оборачиваем section в .sp-pt-panel */
    const panels = items.map(item => {
      const wrap = document.createElement('div');
      wrap.className = PANEL_CLASS;
      wrap.setAttribute('data-sp-pt-panel', item.key);

      /* Если у секции есть кнопка «Открыть раздел» —
         выносим её в отдельный блок над списком */
      if (item.openBtn) {
        const originalTitle = item.section.querySelector('.planner-list-title');
        const openWrap = document.createElement('div');
        openWrap.className = 'sp-pt-open-section-wrap';

        const clone = item.openBtn.cloneNode(true);
        clone.classList.add('sp-pt-open-section');

        /* Копируем data-page, если есть */
        if (item.openBtn.dataset && item.openBtn.dataset.page) {
          clone.dataset.page = item.openBtn.dataset.page;
        }

        /* Оригинальная кнопка в новой структуре уже не нужна —
           клона достаточно. Но data-page обрабатывается
           делегированием на document, поэтому клик сработает. */
        openWrap.appendChild(clone);
        wrap.appendChild(openWrap);

        /* Убираем заголовок целиком — он дублировал бы таб */
        if (originalTitle && originalTitle.parentNode) {
          originalTitle.parentNode.removeChild(originalTitle);
        }
      }

      /* Переносим сам section в панель */
      wrap.appendChild(item.section);

      return wrap;
    });

    /* Вставляем всё в начало панели, перед существующими детьми */
    panel.insertBefore(nav, panel.firstChild);
    panels.forEach(p => panel.appendChild(p));

    panel.dataset.spPtDone = '1';

    /* Определяем активный таб:
       1. Если сохранённый есть в списке — оставляем
       2. Если нет — берём первый непустой
       3. Если все пустые — первый */
    const keys = items.map(i => i.key);
    if (!keys.includes(activeTab)) {
      const firstNonEmpty = items.find(i => i.count > 0);
      activeTab = firstNonEmpty ? firstNonEmpty.key : keys[0];
      saveActiveTab(activeTab);
    }

    applyActiveTab(activeTab);

    console.log('[PlannerTabs] Табы собраны:',
      items.map(i => `${i.key}(${i.count})`).join(', '));
  }

  function applyActiveTab(key) {
    const panel = document.querySelector('.planner-day-panel');
    if (!panel) return;

    panel.querySelectorAll(`.${NAV_CLASS} .sp-pt-tab`).forEach(btn => {
      btn.classList.toggle(
        'is-active',
        btn.getAttribute('data-sp-pt-tab') === key
      );
    });

    panel.querySelectorAll(`.${PANEL_CLASS}`).forEach(p => {
      p.classList.toggle(
        'is-active',
        p.getAttribute('data-sp-pt-panel') === key
      );
    });
  }

  /* ============== НАБЛЮДЕНИЕ ============== */

  function scheduleBuild() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { buildTabs(); }
      catch (e) { console.warn('[PlannerTabs] build error:', e); }
    });
  }

  function startObserver() {
    if (contentObserver) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }

    contentObserver = new MutationObserver(() => scheduleBuild());
    contentObserver.observe(content, { childList: true, subtree: true });

    scheduleBuild();
    console.log('[PlannerTabs] Наблюдение за #content запущено');
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();
    activeTab = loadActiveTab();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }

    setTimeout(startObserver, 500);
    setTimeout(startObserver, 2000);
    setTimeout(startObserver, 5000);

    console.log('[PlannerTabs] Модуль инициализирован');
  }

  init();

  window.spPlannerTabs = {
    rebuild: scheduleBuild,
    version: '1.0.0'
  };

})();
