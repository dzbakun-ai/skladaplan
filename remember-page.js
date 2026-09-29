/* =========================================================
   SKLADAPLAN — ЗАПОМИНАНИЕ ПОСЛЕДНЕЙ СТРАНИЦЫ
   =========================================================

   При обновлении страницы (F5, Ctrl+R, перезагрузка на телефоне,
   повторный вход через PWA) приложение возвращает пользователя
   на ту же вкладку, на которой он был, а не на «Главную».

   Что сохраняет:
     • state.currentPage   (Главная, База, Планирование, Данные, …)
     • state.activeTool    (Инвентаризация, Справка, Деление, Сумма, …)

   Режим «Планирование» (Задачи / Планировщик / Смены / Напоминания)
   НЕ дублирует — его уже запоминает unified-planner.js своим ключом
   sp-unified-planner-mode.

   Изоляция:
   - Не трогает другие модули.
   - Если что-то не получится — просто не сохранит/не восстановит,
     приложение продолжит работать как обычно (с Главной).
   ========================================================= */

(function () {
  'use strict';
  if (window.spRememberPage) return;

  const PAGE_KEY = 'sp-last-page';
  const TOOL_KEY = 'sp-last-tool';

  /* Разделы, которые имеет смысл восстанавливать.
     'planner' исключаем: с active-unified-planner эта вкладка
     не может быть текущей (unified перехватывает и превращает её
     в 'tasks' + свой режим). */
  const VALID_PAGES = [
    'dashboard', 'base', 'received', 'assembly', 'collected', 'shipped',
    'move', 'optimization', 'tasks', 'tools',
    'comparison', 'excel', 'data', 'map'
  ];

  function getState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    if (window.state) return window.state;
    return null;
  }

  function saveFromState() {
    const st = getState();
    if (!st) return;
    try {
      if (st.currentPage) {
        localStorage.setItem(PAGE_KEY, String(st.currentPage));
      }
      localStorage.setItem(TOOL_KEY, String(st.activeTool || ''));
    } catch (e) { /* ignore */ }
  }

  /* =========================================================
     1. ВОССТАНОВЛЕНИЕ — ДО ПЕРВОГО render()
     =========================================================
     app.js объявляет state в классическом скрипте через const,
     поэтому доступен во всех скриптах, загруженных ПОСЛЕ app.js.
     Этот файл подключаем сразу после app.js — значит на момент
     чтения state он уже существует, а DOMContentLoaded (внутри
     которого app.js вызывает startApp) ещё не сработал.
     ========================================================= */

  (function restoreNow() {
    const st = getState();
    if (!st) return;

    let savedPage = '';
    let savedTool = '';
    try {
      savedPage = localStorage.getItem(PAGE_KEY) || '';
      savedTool = localStorage.getItem(TOOL_KEY) || '';
    } catch (e) { return; }

    if (savedPage && VALID_PAGES.indexOf(savedPage) !== -1) {
      st.currentPage = savedPage;
      st.activeTool = savedTool || '';
      console.log('[RememberPage] Восстановлено:', savedPage,
        savedTool ? '(инструмент: ' + savedTool + ')' : '');
    }
  })();

  /* =========================================================
     2. ПЕРЕХВАТ render() — сохранение при каждой отрисовке
     =========================================================
     Именно render() вызывается в конце goToPage(), а также
     после смены активного инструмента. Ловить его — надёжнее,
     чем goToPage (у которого в проекте два пути вызова:
     через window.goToPage и напрямую как функцию).
     ========================================================= */

  function installRenderHook() {
    if (typeof window.render !== 'function') return false;
    if (window.render.__rememberWrapped) return true;

    const orig = window.render;
    const wrapped = function () {
      const result = orig.apply(this, arguments);
      saveFromState();
      return result;
    };
    wrapped.__rememberWrapped = true;
    window.render = wrapped;
    return true;
  }

  /* goToPage — как бонус: фиксирует момент сразу после перехода,
     до того как render() полностью построит DOM. Это
     подстраховка на случай, если render() бросит исключение
     на середине. */
  function installGoToPageHook() {
    if (typeof window.goToPage !== 'function') return false;
    if (window.goToPage.__rememberWrapped) return true;

    const orig = window.goToPage;
    const wrapped = function () {
      const result = orig.apply(this, arguments);
      saveFromState();
      return result;
    };
    wrapped.__rememberWrapped = true;
    window.goToPage = wrapped;
    return true;
  }

  /* =========================================================
     3. УСТАНОВКА ХУКОВ — пока app.js полностью не загружен
     ========================================================= */

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    const okR = installRenderHook();
    const okG = installGoToPageHook();
    if (okR && okG) {
      clearInterval(timer);
      console.log('[RememberPage] Хуки установлены');
    }
    if (attempts >= 40) clearInterval(timer);
  }, 100);

  /* Первая попытка сразу — вдруг app.js уже выполнился */
  installRenderHook();
  installGoToPageHook();

  /* =========================================================
     4. СТРАХОВКА — сохранение при уходе/сворачивании
     ========================================================= */

  window.addEventListener('beforeunload', saveFromState);
  window.addEventListener('pagehide', saveFromState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveFromState();
  });

  console.log('[RememberPage] Модуль инициализирован');

  /* Публичный API для отладки */
  window.spRememberPage = {
    /* Очистить память — следующий вход будет с Главной */
    clear: () => {
      try {
        localStorage.removeItem(PAGE_KEY);
        localStorage.removeItem(TOOL_KEY);
      } catch (e) {}
    },
    /* Посмотреть, что сохранено */
    getSaved: () => {
      try {
        return {
          page: localStorage.getItem(PAGE_KEY),
          tool: localStorage.getItem(TOOL_KEY)
        };
      } catch (e) { return null; }
    },
    version: '1.0.0'
  };
})();
