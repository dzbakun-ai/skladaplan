/* =========================================================
   SKLADAPLAN — ОБЪЕДИНЕНИЕ «ЗАДАЧИ» И «ПЛАНИРОВЩИК»
   =========================================================

   Что делает:
   - Переименовывает раздел «Задачи» в «Планирование».
   - Убирает пункт «Планировщик» из сайдбара.
   - Внутри «Планирования» добавляет переключатель режимов:
     [📝 Задачи] / [📅 Планировщик]
   - В режиме «Задачи» показывает существующие задачи
     (Список / Новая / Ритуалы / Контрагенты).
   - В режиме «Планировщик» показывает календарь
     (планировщик со своими табами внутри дня).
   - Убирает календарь задач (он больше не нужен).
   - Убирает кнопку «В планировщик» (не нужна).
   - Активный режим сохраняется в localStorage.

   Изоляция:
   - Никаких правок в app.js / tasks.js / planner.js.
   - Обёртка window.tasksView и window.goToPage.
   - Заголовок страницы обновляется динамически.
   ========================================================= */

(function () {
  'use strict';
  if (window.spUnifiedPlanner) return;

  const STYLES_ID = 'spUnifiedPlannerStyles';
  const LS_KEY = 'sp-unified-planner-mode';
  const MODES = ['tasks', 'planner'];

  let currentMode = 'tasks';

  /* ============== БЕЗОПАСНЫЙ ДОСТУП ============== */

  function getAppState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    if (window.state) return window.state;
    return null;
  }

  function getTasksState() {
    try { if (typeof tasksState !== 'undefined' && tasksState) return tasksState; } catch (e) {}
    if (window.tasksState) return window.tasksState;
    return null;
  }

  /* ============== STORAGE ============== */

  function loadMode() {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v && MODES.includes(v)) return v;
    } catch (e) {}
    return 'tasks';
  }

  function saveMode(m) {
    try { localStorage.setItem(LS_KEY, m); } catch (e) {}
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* Переключатель режимов на странице «Планирование» */
      .sp-up-modes {
        display: flex;
        gap: 6px;
        padding: 6px;
        margin-bottom: 18px;
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 14px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(15,23,42,.04));
        overflow-x: auto;
        scrollbar-width: none;
      }
      .sp-up-modes::-webkit-scrollbar { display: none; }

      .sp-up-mode {
        flex: 1 1 0;
        min-height: 48px;
        padding: 12px 22px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: #64748b;
        font-family: inherit;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background .15s ease, color .15s ease;
      }
      .sp-up-mode:hover {
        color: #0f172a;
        background: #f8fafc;
      }
      .sp-up-mode.is-active {
        background: var(--primary, #2563EB);
        color: #fff;
      }
      .sp-up-mode.is-active:hover {
        background: var(--primary-hover, #1D4ED8);
      }

      /* Прячем календарь задач и кнопку «В планировщик» */
      [data-tasks-view="calendar"] { display: none !important; }
      .task-toolbar-right { display: none !important; }

      @media (max-width: 640px) {
        .sp-up-modes {
          padding: 4px;
          margin-bottom: 12px;
        }
        .sp-up-mode {
          min-height: 42px;
          padding: 10px 14px;
          font-size: 13px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ПЕРЕКЛЮЧАТЕЛЬ ============== */

  function modeSwitcherHtml() {
    return `
      <div class="sp-up-modes" role="tablist" aria-label="Режим">
        <button type="button"
          class="sp-up-mode ${currentMode === 'tasks' ? 'is-active' : ''}"
          data-sp-up-mode="tasks"
          role="tab"
          aria-selected="${currentMode === 'tasks'}"
        >
          📝 Задачи
        </button>
        <button type="button"
          class="sp-up-mode ${currentMode === 'planner' ? 'is-active' : ''}"
          data-sp-up-mode="planner"
          role="tab"
          aria-selected="${currentMode === 'planner'}"
        >
          📅 Планировщик
        </button>
      </div>
    `;
  }

  function attachModeHandlers() {
    document.querySelectorAll('[data-sp-up-mode]').forEach(btn => {
      if (btn.dataset.spUpBound === '1') return;
      btn.dataset.spUpBound = '1';

      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-sp-up-mode');
        if (m === currentMode) return;
        currentMode = m;
        saveMode(currentMode);
        if (typeof window.render === 'function') window.render();
      });
    });
  }

  /* ============== ЗАГОЛОВОК ============== */

  function updateHeading() {
    const st = getAppState();
    if (!st || st.currentPage !== 'tasks') return;

    const heading = document.getElementById('heading');
    const pageTitle = document.getElementById('pageTitle');

    if (currentMode === 'planner') {
      if (heading) heading.textContent = 'Планировщик';
      if (pageTitle) pageTitle.textContent = 'Планировщик';
    } else {
      if (heading) heading.textContent = 'Задачи';
      if (pageTitle) pageTitle.textContent = 'Задачи';
    }
  }

  /* ============== ХУК: tasksView ============== */

  function installViewHook() {
    if (typeof window.tasksView !== 'function') return false;
    if (window.tasksView.__unifiedWrapped) return true;

    const originalView = window.tasksView;
    const originalSetup = window.setupTasks;

    const wrappedView = function () {
      /* Принудительно переключаем задачи в режим «Список» —
         чтобы случайно не открылся календарь задач */
      const ts = getTasksState();
      if (ts && ts.view === 'calendar') {
        ts.view = 'list';
      }

      const switcher = modeSwitcherHtml();

      /* Режим «Планировщик» */
      if (currentMode === 'planner' && typeof window.plannerView === 'function') {
        let plannerHtml = '';
        try {
          plannerHtml = window.plannerView();
        } catch (e) {
          console.error('[UnifiedPlanner] plannerView error:', e);
          plannerHtml = '<div class="sp-card"><p>Не удалось загрузить планировщик.</p></div>';
        }
        return switcher + '<div class="sp-up-content">' + plannerHtml + '</div>';
      }

      /* Режим «Задачи» */
      let tasksHtml = '';
      try {
        tasksHtml = originalView.apply(this, arguments);
      } catch (e) {
        console.error('[UnifiedPlanner] tasksView error:', e);
        tasksHtml = '<div class="sp-card"><p>Ошибка отрисовки задач.</p></div>';
      }
      return switcher + '<div class="sp-up-content">' + tasksHtml + '</div>';
    };
    wrappedView.__unifiedWrapped = true;
    window.tasksView = wrappedView;

    if (typeof originalSetup === 'function') {
      window.setupTasks = function () {
        /* 1. Переключатель режимов — всегда */
        attachModeHandlers();

        /* 2. Настраиваем содержимое режима */
        if (currentMode === 'planner') {
          try {
            if (typeof window.setupPlanner === 'function') {
              window.setupPlanner();
            }
          } catch (e) {
            console.error('[UnifiedPlanner] setupPlanner error:', e);
          }
        } else {
          try {
            originalSetup.apply(this, arguments);
          } catch (e) {
            console.error('[UnifiedPlanner] setupTasks error:', e);
          }
        }

        /* 3. Обновляем заголовок страницы под текущий режим */
        setTimeout(updateHeading, 0);
      };
    }

    console.log('[UnifiedPlanner] Хуки в tasksView установлены');
    return true;
  }

  /* ============== ХУК: goToPage('planner') ============== */

  function installNavHook() {
    if (typeof window.goToPage !== 'function') return false;
    if (window.goToPage.__unifiedWrapped) return true;

    const original = window.goToPage;
    window.goToPage = function (page) {
      if (page === 'planner') {
        currentMode = 'planner';
        saveMode(currentMode);
        return original.call(this, 'tasks');
      }
      return original.apply(this, arguments);
    };
    window.goToPage.__unifiedWrapped = true;
    return true;
  }

  /* ============== КЛИКИ ПО [data-page] ==============
     Если пользователь в режиме планировщика кликает
     «Открыть раздел» (внешние задачи) — переключаемся
     на режим «Задачи». */

  function installDataPageListener() {
    document.addEventListener('click', event => {
      const btn = event.target.closest('[data-page="tasks"]');
      if (!btn) return;

      const st = getAppState();
      if (!st || st.currentPage !== 'tasks') return;

      if (currentMode === 'planner') {
        currentMode = 'tasks';
        saveMode(currentMode);
      }
    }, true);
  }

  /* ============== САЙДБАР ============== */

  function patchSidebar() {
    /* Переименование «Задачи» → «Планирование» */
    const tasksNav = document.querySelector('.nav[data-page="tasks"]');
    if (tasksNav) {
      const label = tasksNav.querySelector('.nav-label');
      if (label && label.textContent.trim() !== 'Планирование') {
        label.textContent = 'Планирование';
      }
    }

    /* Скрытие «Планировщик» */
    const plannerNav = document.querySelector('.nav[data-page="planner"]');
    if (plannerNav) {
      plannerNav.style.display = 'none';
    }
  }

  function startSidebarObserver() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) { setTimeout(startSidebarObserver, 300); return; }

    const obs = new MutationObserver(() => patchSidebar());
    obs.observe(sidebar, { childList: true, subtree: true });
    patchSidebar();
    console.log('[UnifiedPlanner] Наблюдение за сайдбаром запущено');
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();
    currentMode = loadMode();

    const start = () => {
      installViewHook();
      installNavHook();
      installDataPageListener();
      startSidebarObserver();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }

    /* Повторные попытки — на случай медленной загрузки app.js / planner.js */
    setTimeout(installViewHook, 300);
    setTimeout(installViewHook, 1500);
    setTimeout(installViewHook, 4000);
    setTimeout(installNavHook, 300);
    setTimeout(installNavHook, 1500);

    setTimeout(patchSidebar, 500);
    setTimeout(patchSidebar, 2000);
    setTimeout(patchSidebar, 5000);

    console.log('[UnifiedPlanner] Модуль инициализирован. Режим:', currentMode);
  }

  init();

  window.spUnifiedPlanner = {
    setMode: (m) => {
      if (!MODES.includes(m)) return;
      currentMode = m;
      saveMode(m);
      if (typeof window.render === 'function') window.render();
    },
    getMode: () => currentMode,
    version: '1.0.0'
  };

})();
