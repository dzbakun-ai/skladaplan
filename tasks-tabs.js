/* =========================================================
   SKLADAPLAN — ТАБЫ НА СТРАНИЦЕ «ЗАДАЧИ»
   =========================================================

   Что делает:
   - Собирает 4 существующих блока на странице «Задачи»
     в один контейнер с табами сверху.
   - Активный таб сохраняется в localStorage.
   - Работает через MutationObserver на #content —
     как labels/box-history/references/recurring.

   Что НЕ делает:
   - Не меняет содержимое блоков.
   - Не трогает app.js, tasks.js, recurring.js.
   ========================================================= */

(function () {
  'use strict';
  if (window.spTasksTabs) return;

  const STYLES_ID = 'spTasksTabsStyles';
  const WRAPPER_ID = 'spTasksTabsWrapper';
  const NAV_ID = 'spTasksTabsNav';
  const LS_KEY = 'sp-tasks-tab';
  const DEFAULT_TAB = 'list';

  const TABS = [
    { key: 'list',     label: '📋 Список',        find: findListCard },
    { key: 'new',      label: '✏️ Новая задача',  find: findNewTaskCard },
    { key: 'rituals',  label: '🔁 Ритуалы',       find: findRitualsCard },
    { key: 'partners', label: '🤝 Контрагенты',   find: findPartnersCard }
  ];

  let contentObserver = null;
  let scheduled = false;
  let activeTab = DEFAULT_TAB;

  /* ============== ПРИЗНАКИ БЛОКОВ ============== */

  function findNewTaskCard() {
    const inp = document.getElementById('taskTitleInput');
    return inp ? inp.closest('.sp-card') : null;
  }

  function findListCard() {
    const filter = document.querySelector('[data-tasks-filter="all"]');
    return filter ? filter.closest('.sp-card') : null;
  }

  function findRitualsCard() {
    return document.getElementById('spRecurringCard');
  }

  function findPartnersCard() {
    return document.querySelector('.partners-block');
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${WRAPPER_ID} {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 16px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(15,23,42,.04));
        overflow: hidden;
        margin-bottom: 16px;
      }
      #${NAV_ID} {
        display: flex;
        gap: 4px;
        padding: 6px 6px 0;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      #${NAV_ID}::-webkit-scrollbar { display: none; }
      #${NAV_ID} .sp-tt-tab {
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
      #${NAV_ID} .sp-tt-tab:hover {
        color: #0f172a;
        background: rgba(255,255,255,.6);
      }
      #${NAV_ID} .sp-tt-tab.is-active {
        background: #fff;
        color: #0f172a;
        box-shadow: 0 -1px 0 #e2e8f0 inset, -1px 0 0 #e2e8f0 inset, 1px 0 0 #e2e8f0 inset;
      }
      #${NAV_ID} .sp-tt-tab.is-active::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1px;
        height: 1px;
        background: #fff;
      }
      #${NAV_ID} .sp-tt-tab .sp-tt-count {
        display: inline-block;
        margin-left: 6px;
        padding: 1px 7px;
        border-radius: 999px;
        background: rgba(37,99,235,.1);
        color: var(--primary, #2563EB);
        font-size: 10px;
        font-weight: 700;
      }

      #${WRAPPER_ID} .sp-tt-body {
        padding: 16px;
      }
      #${WRAPPER_ID} .sp-tt-panel { display: none; }
      #${WRAPPER_ID} .sp-tt-panel.is-active { display: block; }
      #${WRAPPER_ID} .sp-tt-panel > .sp-card {
        margin: 0;
        border: 0;
        box-shadow: none;
        padding: 0;
      }

      @media (max-width: 640px) {
        #${NAV_ID} .sp-tt-tab {
          padding: 10px 12px;
          font-size: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== СОСТОЯНИЕ ============== */

  function loadActiveTab() {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v && TABS.some(t => t.key === v)) return v;
    } catch (e) {}
    return DEFAULT_TAB;
  }

  function saveActiveTab(key) {
    try { localStorage.setItem(LS_KEY, key); } catch (e) {}
  }

  /* ============== СБОРКА ТАБОВ ============== */

  function cleanupOldWrapper() {
    const old = document.getElementById(WRAPPER_ID);
    if (!old) return;

    /* Возвращаем карточки обратно в #content, чтобы render()
       мог их пересоздать штатным образом */
    const panels = old.querySelectorAll('.sp-tt-panel');
    panels.forEach(panel => {
      const card = panel.firstElementChild;
      if (card) {
        /* Ничего не делаем — карточки всё равно
           будут пересозданы при следующем render() */
      }
    });

    old.remove();
  }

    function buildTabs() {
    const content = document.getElementById('content');
    if (!content) return;

    /* На странице Задач? */
    const isTasksPage = !!document.getElementById('taskTitleInput');
    if (!isTasksPage) {
      cleanupOldWrapper();
      return;
    }

    /* Уже собрано? Тогда просто обновим активный таб */
    if (document.getElementById(WRAPPER_ID)) {
      applyActiveTab(activeTab);
      return;
    }

    /* Ищем карточки */
    const cards = {};
    TABS.forEach(t => {
      try { cards[t.key] = t.find(); }
      catch (e) { cards[t.key] = null; }
    });

    /* Нужны как минимум список и новая задача */
    if (!cards.list || !cards.new) return;

    /* ВАЖНО: запоминаем родителя и «следующий» узел
       ДО того, как будем перемещать карточки */
    const anchor = cards.list;
    const anchorParent = anchor.parentNode;
    const anchorNext = anchor.nextSibling;

    /* Создаём обёртку */
    const wrapper = document.createElement('div');
    wrapper.id = WRAPPER_ID;

    /* Навигация */
    const nav = document.createElement('div');
    nav.id = NAV_ID;
    TABS.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-tt-tab';
      btn.setAttribute('data-tt-tab', t.key);
      btn.innerHTML = t.label;
      btn.addEventListener('click', () => {
        activeTab = t.key;
        saveActiveTab(activeTab);
        applyActiveTab(activeTab);
      });
      nav.appendChild(btn);
    });

    /* Тело */
    const body = document.createElement('div');
    body.className = 'sp-tt-body';

    /* Панели — перемещаем карточки внутрь */
    TABS.forEach(t => {
      const card = cards[t.key];

      const panel = document.createElement('div');
      panel.className = 'sp-tt-panel';
      panel.setAttribute('data-tt-panel', t.key);

      if (card) {
        panel.appendChild(card);
      } else {
        panel.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">Пусто</div>';
      }

      body.appendChild(panel);
    });

    wrapper.appendChild(nav);
    wrapper.appendChild(body);

    /* Вставляем в СОХРАНЁННОГО родителя перед СОХРАНЁННЫМ nextSibling */
    if (anchorParent) {
      anchorParent.insertBefore(wrapper, anchorNext);
    } else {
      content.insertBefore(wrapper, content.firstChild);
    }

    applyActiveTab(activeTab);

    console.log('[TasksTabs] Табы собраны. Карточек:',
      Object.keys(cards).filter(k => cards[k]).join(', '));
  }

  function applyActiveTab(key) {
    const nav = document.getElementById(NAV_ID);
    const body = document.querySelector(`#${WRAPPER_ID} .sp-tt-body`);
    if (!nav || !body) return;

    nav.querySelectorAll('.sp-tt-tab').forEach(btn => {
      btn.classList.toggle(
        'is-active',
        btn.getAttribute('data-tt-tab') === key
      );
    });

    body.querySelectorAll('.sp-tt-panel').forEach(panel => {
      panel.classList.toggle(
        'is-active',
        panel.getAttribute('data-tt-panel') === key
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
      catch (e) { console.warn('[TasksTabs] build error:', e); }
    });
  }

  function startObserver() {
    if (contentObserver) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }

    contentObserver = new MutationObserver(() => scheduleBuild());
    contentObserver.observe(content, { childList: true });

    scheduleBuild();
    console.log('[TasksTabs] Наблюдение за #content запущено');
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

    /* Собираем ещё раз чуть позже — на случай,
       если ритуалы вставились с задержкой */
    setTimeout(scheduleBuild, 8000);
    setTimeout(scheduleBuild, 12000);

    console.log('[TasksTabs] Модуль инициализирован');
  }

  init();

  window.spTasksTabs = {
    rebuild: scheduleBuild,
    version: '1.0.0'
  };

})();
