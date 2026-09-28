/* =========================================================
   SKLADAPLAN — COMMAND PALETTE (Ctrl+K)
   =========================================================

   Что делает:
   - Ctrl+K (Cmd+K) — открывает поиск по всему приложению.
   - На телефоне — кнопка «🔍» в шапке + свайп сверху.
   - Ищет по разделам, коробкам, задачам, партнёрам.
   - Стрелки ↑↓ — навигация, Enter — выбор, Esc — закрыть.

   Изоляция:
   - Ничего не трогает в существующих модулях.
   - Читает только публичные глобальные объекты
     (state, tasksState, plannerState, partnersState),
     и только если они уже существуют.
   - Не переопределяет обработчики клавиатуры.
   ========================================================= */

(function () {
  'use strict';

  const MODAL_ID = 'spCommandPalette';
  const STYLES_ID = 'spCommandPaletteStyles';
  const INPUT_ID = 'spCpInput';
  const RESULTS_ID = 'spCpResults';
  const TRIGGER_ID = 'spCpTrigger';

  let isOpen = false;
  let items = [];            /* Текущий список результатов */
  let activeIndex = 0;       /* Индекс выбранного результата */
  let lastQuery = '';

  /* =========================================================
     СТИЛИ
     ========================================================= */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* Кнопка-триггер в шапке (иконка лупы) */
      #${TRIGGER_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fff;
        color: #555;
        cursor: pointer;
        font-size: 16px;
        margin-right: 8px;
        transition: background .15s ease, border-color .15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      #${TRIGGER_ID}:hover { background: #f5f7fa; border-color: #cbd5e1; }
      #${TRIGGER_ID}:active { transform: scale(.96); }

      @media (max-width: 700px) {
        #${TRIGGER_ID} {
          width: 36px;
          height: 36px;
          margin-right: 4px;
        }
      }

      /* Затемнённый фон */
      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100001;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 80px 16px 16px;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        animation: spCpFadeIn .12s ease;
      }
      @keyframes spCpFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* Карточка палитры */
      #${MODAL_ID} .sp-cp-card {
        width: 100%;
        max-width: 640px;
        background: #fff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 20px 70px rgba(0, 0, 0, .3), 0 0 0 1px rgba(0, 0, 0, .05);
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 120px);
        animation: spCpSlideIn .15s cubic-bezier(.2, .9, .3, 1);
      }
      @keyframes spCpSlideIn {
        from { transform: translateY(-8px) scale(.98); opacity: 0; }
        to   { transform: translateY(0)    scale(1);   opacity: 1; }
      }

      /* Строка поиска */
      #${MODAL_ID} .sp-cp-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-cp-lens {
        font-size: 20px;
        color: #94a3b8;
        flex-shrink: 0;
      }
      #${INPUT_ID} {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        font-size: 17px;
        font-family: inherit;
        color: #0f172a;
        padding: 0;
      }
      #${INPUT_ID}::placeholder {
        color: #94a3b8;
      }
      #${MODAL_ID} .sp-cp-kbd {
        display: inline-flex;
        gap: 4px;
        flex-shrink: 0;
      }
      #${MODAL_ID} .sp-cp-kbd span {
        display: inline-block;
        min-width: 22px;
        padding: 3px 7px;
        border: 1px solid #e2e8f0;
        border-bottom-width: 2px;
        border-radius: 5px;
        background: #f8fafc;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        text-align: center;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }

      /* Список результатов */
      #${RESULTS_ID} {
        overflow-y: auto;
        flex: 1;
        padding: 6px;
        min-height: 60px;
      }
      #${MODAL_ID} .sp-cp-group {
        padding: 8px 12px 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      #${MODAL_ID} .sp-cp-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: background .08s ease;
        user-select: none;
      }
      #${MODAL_ID} .sp-cp-item:hover { background: #f5f7fa; }
      #${MODAL_ID} .sp-cp-item.is-active {
        background: #eef2ff;
      }
      #${MODAL_ID} .sp-cp-item.is-active .sp-cp-title {
        color: #1d4ed8;
      }
      #${MODAL_ID} .sp-cp-icon {
        flex: 0 0 32px;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: #f1f5f9;
        color: #475569;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
      }
      #${MODAL_ID} .sp-cp-item.is-active .sp-cp-icon {
        background: #dbeafe;
        color: #1d4ed8;
      }
      #${MODAL_ID} .sp-cp-main {
        flex: 1;
        min-width: 0;
      }
      #${MODAL_ID} .sp-cp-title {
        font-size: 14px;
        font-weight: 600;
        color: #0f172a;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${MODAL_ID} .sp-cp-meta {
        font-size: 12px;
        color: #94a3b8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 2px;
      }
      #${MODAL_ID} .sp-cp-meta mark {
        background: #fef08a;
        color: inherit;
        padding: 0 2px;
        border-radius: 2px;
      }
      #${MODAL_ID} .sp-cp-empty {
        padding: 40px 20px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
      }
      #${MODAL_ID} .sp-cp-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 16px;
        border-top: 1px solid #eef1f4;
        background: #fafbfc;
        font-size: 11px;
        color: #94a3b8;
      }
      #${MODAL_ID} .sp-cp-foot-hint {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      #${MODAL_ID} .sp-cp-foot-hint > span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      #${MODAL_ID} .sp-cp-foot-hint kbd {
        padding: 1px 5px;
        border: 1px solid #e2e8f0;
        border-bottom-width: 2px;
        border-radius: 4px;
        background: #fff;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 10px;
        color: #475569;
      }

      @media (max-width: 640px) {
        #${MODAL_ID} {
          padding: 12px;
          align-items: flex-start;
        }
        #${MODAL_ID} .sp-cp-card {
          max-height: calc(100vh - 24px);
          border-radius: 14px;
        }
        #${INPUT_ID} { font-size: 16px; /* защита от zoom на iOS */ }
        #${MODAL_ID} .sp-cp-foot { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  /* =========================================================
     ИСТОЧНИКИ ДАННЫХ
     ========================================================= */

  function getPages() {
    /* Список разделов с ключами — совпадает с PAGE_META + активные инструменты.
       Названия — человекочитаемые. */
    return [
      { key: 'dashboard',    label: 'Главная',              icon: '🏠' },
      { key: 'base',         label: 'База коробок',         icon: '📦' },
      { key: 'received',     label: 'Приёмка',              icon: '⬇️' },
      { key: 'assembly',     label: 'Сборка',               icon: '🧱' },
      { key: 'collected',    label: 'Собрано',              icon: '✅' },
      { key: 'shipped',      label: 'Убыло',                icon: '🚚' },
      { key: 'move',         label: 'Перемещение',          icon: '↔️' },
      { key: 'optimization', label: 'Оптимизация склада',   icon: '⚙️' },
      { key: 'tasks',        label: 'Задачи',               icon: '📝' },
      { key: 'planner',      label: 'Планировщик',          icon: '📅' },
      { key: 'comparison',   label: 'Сравнение заявки',     icon: '🔀' },
      { key: 'excel',        label: 'Excel — импорт/экспорт', icon: '📊' },
      { key: 'data',         label: 'Данные и аккаунт',     icon: '🗄️' },
      { key: 'map',          label: 'Карта склада',         icon: '🗺️' }
    ];
  }

  function getToolCommands() {
    return [
      { key: 'compare',  page: 'comparison', tool: '',        label: 'Сравнение',           icon: '🔀', keywords: 'сравнение заявка' },
      { key: 'split',    page: 'comparison', tool: 'split',   label: 'Деление штрихкодов',  icon: '✂️', keywords: 'деление split' },
      { key: 'sum',      page: 'comparison', tool: 'sum',     label: 'Сумма штрихкодов',    icon: 'Σ',  keywords: 'сумма сумматор' },
      { key: 'convert',  page: 'comparison', tool: 'convert', label: 'Заявка → Коробки',    icon: '🧮', keywords: 'конвертер ящик' },
      { key: 'inventory',page: 'tools',      tool: 'inventory',label: 'Инвентаризация',     icon: '🧾', keywords: 'инвентаризация пересчёт' },
      { key: 'help',     page: 'tools',      tool: 'help',    label: 'Справка',             icon: '❓', keywords: 'справка помощь help' }
    ];
  }

  function getQuickActions() {
    return [
      {
        label: 'Открыть оптимизацию склада',
        meta: 'Раздел «Оптимизация склада»',
        icon: '⚙️',
        keywords: 'optimization оптимизация консолидация',
        run: () => window.goToPage && window.goToPage('optimization')
      },
      {
        label: 'Открыть приёмку',
        meta: 'Раздел «Приёмка»',
        icon: '⬇️',
        keywords: 'приёмка приемка receiving',
        run: () => window.goToPage && window.goToPage('received')
      },
      {
        label: 'Открыть сборку',
        meta: 'Раздел «Сборка»',
        icon: '🧱',
        keywords: 'сборка assembly',
        run: () => window.goToPage && window.goToPage('assembly')
      },
      {
        label: 'Показать собранные коробки',
        meta: 'Раздел «Собрано»',
        icon: '✅',
        keywords: 'собрано собрано collected',
        run: () => window.goToPage && window.goToPage('collected')
      },
      {
        label: 'Показать отгруженные',
        meta: 'Раздел «Убыло»',
        icon: '🚚',
        keywords: 'убыло отгружено shipped',
        run: () => window.goToPage && window.goToPage('shipped')
      },
      {
        label: 'Найти коробки в статусе «К подбору»',
        meta: 'Откроет Базу с фильтром',
        icon: '🎯',
        keywords: 'подбор picking кподбору',
        run: () => {
          if (window.state) {
            state.baseSearch = '';
            state.baseStatus = 'КПодбору';
            state.basePage = 1;
          }
          window.goToPage && window.goToPage('base');
        }
      }
    ];
  }

  /* =========================================================
     ПОИСК
     ========================================================= */

  function normalize(str) {
    return String(str == null ? '' : str)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .trim();
  }

  function highlight(text, query) {
    const escaped = String(text == null ? '' : text);
    if (!query) return escaped;

    const idx = normalize(escaped).indexOf(normalize(query));
    if (idx === -1) return escaped;

    return (
      escapeHtml(escaped.slice(0, idx)) +
      '<mark>' + escapeHtml(escaped.slice(idx, idx + query.length)) + '</mark>' +
      escapeHtml(escaped.slice(idx + query.length))
    );
  }

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function scoreItem(item, q) {
    if (!q) return 0;
    const haystack = normalize(
      [item.label, item.meta, item.keywords].filter(Boolean).join(' ')
    );
    const needle = normalize(q);
    if (!haystack.includes(needle)) return -1;

    /* Чем раньше совпадение и чем короче строка — тем выше */
    const pos = haystack.indexOf(needle);
    let score = 1000 - pos * 3 - haystack.length * 0.1;

    /* Точное совпадение в начале — бонус */
    if (haystack.startsWith(needle)) score += 500;

    /* Совпадение в label важнее, чем в meta */
    if (normalize(item.label).includes(needle)) score += 200;

    return score;
  }

  function buildAll() {
    const out = [];

    /* Разделы */
    getPages().forEach(p => {
      out.push({
        kind: 'page',
        group: 'Разделы',
        icon: p.icon,
        label: p.label,
        meta: 'Перейти на страницу',
        keywords: p.key,
        run: () => window.goToPage && window.goToPage(p.key)
      });
    });

    /* Инструменты */
    getToolCommands().forEach(t => {
      out.push({
        kind: 'tool',
        group: 'Инструменты',
        icon: t.icon,
        label: t.label,
        meta: 'Открыть инструмент',
        keywords: t.keywords,
        run: () => {
          if (window.state) state.activeTool = t.tool;
          window.goToPage && window.goToPage(t.page);
        }
      });
    });

    /* Быстрые действия */
    getQuickActions().forEach(a => {
      out.push({
        kind: 'action',
        group: 'Быстрые действия',
        icon: a.icon,
        label: a.label,
        meta: a.meta,
        keywords: a.keywords,
        run: a.run
      });
    });

    /* Коробки — только если данные уже загружены */
    if (window.state && Array.isArray(state.boxes)) {
      const seen = new Set();
      let count = 0;
      for (let i = 0; i < state.boxes.length && count < 300; i++) {
        const b = state.boxes[i];
        const barcode = String(b.barcode || '').trim();
        if (!barcode) continue;
        const key = barcode + '|' + (b.article || '') + '|' + (b.pallet || '');
        if (seen.has(key)) continue;
        seen.add(key);
        count++;

        const metaParts = [];
        if (b.article) metaParts.push('Арт. ' + b.article);
        if (b.warehouse) metaParts.push(b.warehouse);
        if (b.zone_row) metaParts.push(b.zone_row);
        if (b.pallet) metaParts.push('Паллет ' + b.pallet);
        if (b.status) metaParts.push(b.status);

        out.push({
          kind: 'box',
          group: 'Коробки',
          icon: '📦',
          label: barcode,
          meta: metaParts.join(' · ') || '—',
          keywords: [barcode, b.article, b.pallet, b.zone_row, b.warehouse, b.status]
                    .filter(Boolean).join(' '),
          run: () => {
            if (window.state) {
              state.baseSearch = barcode;
              state.baseStatus = '';
              state.baseZone = '';
              state.basePallet = '';
              state.baseWarehouse = '';
              state.baseDirection = '';
              state.basePage = 1;
            }
            window.goToPage && window.goToPage('base');
          }
        });
      }
    }

    /* Задачи (раздел «Задачи» — tasksState) */
    if (window.tasksState && Array.isArray(tasksState.items)) {
      tasksState.items.forEach(t => {
        if (!t || !t.title) return;
        const metaParts = [];
        if (t.due_date) metaParts.push(t.due_date);
        if (t.priority) metaParts.push(t.priority);
        if (t.completed) metaParts.push('выполнено');

        out.push({
          kind: 'task',
          group: 'Задачи',
          icon: t.completed ? '✔️' : '📝',
          label: t.title,
          meta: metaParts.join(' · ') || 'Задача',
          keywords: [t.title, t.description, t.priority].filter(Boolean).join(' '),
          run: () => {
            if (window.state) {
              /* Показать только эту задачу — через встроенный фильтр не получится,
                 но можно подсветить: открываем раздел «Задачи». */
              state.activeTool = '';
            }
            window.goToPage && window.goToPage('tasks');
          }
        });
      });
    }

    /* Задачи Планировщика */
    if (window.plannerState && Array.isArray(plannerState.tasks)) {
      plannerState.tasks.forEach(t => {
        if (!t || !t.title) return;
        const metaParts = [];
        if (t.date) metaParts.push(t.date);
        if (t.time) metaParts.push(t.time);
        if (t.priority) metaParts.push(t.priority);

        out.push({
          kind: 'planner_task',
          group: 'Планировщик',
          icon: '📅',
          label: t.title,
          meta: metaParts.join(' · ') || 'Задача планировщика',
          keywords: [t.title, t.comment, t.priority].filter(Boolean).join(' '),
          run: () => {
            window.goToPage && window.goToPage('planner');
          }
        });
      });

      /* Отгрузки планировщика */
      if (Array.isArray(plannerState.shipments)) {
        plannerState.shipments.forEach(s => {
          if (!s || !s.title) return;
          const metaParts = [];
          if (s.date) metaParts.push(s.date);
          if (s.time) metaParts.push(s.time);
          if (s.direction) metaParts.push(s.direction);

          out.push({
            kind: 'planner_shipment',
            group: 'Планировщик',
            icon: '🚚',
            label: s.title,
            meta: metaParts.join(' · ') || 'Отгрузка',
            keywords: [s.title, s.direction, s.warehouse, s.comment].filter(Boolean).join(' '),
            run: () => {
              window.goToPage && window.goToPage('planner');
            }
          });
        });
      }
    }

    /* Партнёры */
    if (window.partnersState && Array.isArray(partnersState.items)) {
      partnersState.items.forEach(p => {
        if (!p || !p.name) return;
        const metaParts = [];
        if (p.category) metaParts.push(p.category);
        if (p.phone) metaParts.push(p.phone);
        if (p.city) metaParts.push(p.city);

        out.push({
          kind: 'partner',
          group: 'Контрагенты',
          icon: '🤝',
          label: p.name,
          meta: metaParts.join(' · ') || 'Контрагент',
          keywords: [p.name, p.category, p.phone, p.email, p.city].filter(Boolean).join(' '),
          run: () => {
            window.goToPage && window.goToPage('tasks');
          }
        });
      });
    }

    return out;
  }

  /* =========================================================
     РЕНДЕР
     ========================================================= */

  function renderResults(query) {
    const container = document.getElementById(RESULTS_ID);
    if (!container) return;

    const q = normalize(query);

    let all = items;

    if (q) {
      /* Сккорим и сортируем по релевантности */
      const scored = [];
      for (let i = 0; i < all.length; i++) {
        const s = scoreItem(all[i], q);
        if (s > 0) scored.push({ item: all[i], score: s });
      }
      scored.sort((a, b) => b.score - a.score);

      /* Берём первые 60 — не рендерим сотни */
      all = scored.slice(0, 60).map(x => x.item);
    } else {
      /* Без запроса показываем только самое полезное:
         быстрые действия + разделы + первые задачи. */
      const preferred = ['action', 'page', 'tool', 'task'];
      all = all.filter(it => preferred.includes(it.kind)).slice(0, 40);
    }

    if (!all.length) {
      container.innerHTML = `
        <div class="sp-cp-empty">
          Ничего не найдено по запросу «${escapeHtml(query)}»
        </div>
      `;
      activeIndex = -1;
      return;
    }

    /* Группировка по group */
    const grouped = new Map();
    all.forEach(it => {
      const g = it.group || 'Прочее';
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push(it);
    });

    /* Плоский список для навигации + HTML с группами */
    const flat = [];
    let html = '';
    grouped.forEach((list, groupName) => {
      html += `<div class="sp-cp-group">${escapeHtml(groupName)}</div>`;
      list.forEach(it => {
        const idx = flat.length;
        flat.push(it);
        html += `
          <div class="sp-cp-item" data-idx="${idx}">
            <div class="sp-cp-icon">${escapeHtml(it.icon || '•')}</div>
            <div class="sp-cp-main">
              <div class="sp-cp-title">${highlight(it.label, query)}</div>
              <div class="sp-cp-meta">${highlight(it.meta, query)}</div>
            </div>
          </div>
        `;
      });
    });

    container.innerHTML = html;

    /* Синхронизируем текущий список с flat */
    items._flat = flat;

    /* Устанавливаем активный элемент */
    if (activeIndex < 0 || activeIndex >= flat.length) activeIndex = 0;
    setActive(activeIndex, true);

    /* Обработчики кликов */
    container.querySelectorAll('.sp-cp-item').forEach(el => {
      el.addEventListener('mouseenter', () => {
        const i = Number(el.getAttribute('data-idx'));
        setActive(i, false);
      });
      el.addEventListener('click', () => {
        const i = Number(el.getAttribute('data-idx'));
        activate(i);
      });
    });
  }

  function setActive(index, scroll) {
    const container = document.getElementById(RESULTS_ID);
    if (!container) return;

    container.querySelectorAll('.sp-cp-item.is-active').forEach(el => {
      el.classList.remove('is-active');
    });

    const el = container.querySelector(`.sp-cp-item[data-idx="${index}"]`);
    if (el) {
      el.classList.add('is-active');
      if (scroll) {
        const rect = el.getBoundingClientRect();
        const parent = container.getBoundingClientRect();
        if (rect.top < parent.top || rect.bottom > parent.bottom) {
          el.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }

  function activate(index) {
    const flat = items._flat || [];
    const it = flat[index];
    if (!it) return;

    /* Закрываем палитру до выполнения действия — чтобы если
       действие откроет модалку, не было конфликта z-index. */
    close();

    setTimeout(() => {
      try {
        if (typeof it.run === 'function') it.run();
      } catch (e) {
        console.error('[CommandPalette] run error:', e);
        if (window.toast) window.toast('Ошибка выполнения команды', 'error');
      }
    }, 60);
  }

  /* =========================================================
     ОТКРЫТИЕ / ЗАКРЫТИЕ
     ========================================================= */

  function open() {
    if (isOpen) return;
    isOpen = true;

    items = buildAll();
    activeIndex = 0;
    lastQuery = '';

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-cp-card" role="dialog" aria-modal="true" aria-label="Поиск по приложению">
        <div class="sp-cp-head">
          <span class="sp-cp-lens">🔍</span>
          <input
            id="${INPUT_ID}"
            type="text"
            placeholder="Поиск: раздел, коробка, задача, партнёр…"
            autocomplete="off"
            spellcheck="false"
            autocorrect="off"
          >
          <div class="sp-cp-kbd">
            <span>Esc</span>
          </div>
        </div>
        <div id="${RESULTS_ID}"></div>
        <div class="sp-cp-foot">
          <div class="sp-cp-foot-hint">
            <span><kbd>↑</kbd><kbd>↓</kbd> навигация</span>
            <span><kbd>Enter</kbd> выбрать</span>
            <span><kbd>Esc</kbd> закрыть</span>
          </div>
          <div>SKLADAPLAN · Ctrl+K</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById(INPUT_ID);
    if (input) {
      input.addEventListener('input', e => {
        lastQuery = e.target.value || '';
        activeIndex = 0;
        renderResults(lastQuery);
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const flat = items._flat || [];
          if (!flat.length) return;
          activeIndex = (activeIndex + 1) % flat.length;
          setActive(activeIndex, true);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const flat = items._flat || [];
          if (!flat.length) return;
          activeIndex = (activeIndex - 1 + flat.length) % flat.length;
          setActive(activeIndex, true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          activate(activeIndex);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      });
    }

    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });

    renderResults('');

    /* Фокус на поле — с задержкой, чтобы избежать автозума на iOS */
    setTimeout(() => {
      const i = document.getElementById(INPUT_ID);
      if (i) {
        i.focus();
        /* На Android фокус открывает клавиатуру — это ожидаемо. */
      }
    }, 30);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    const overlay = document.getElementById(MODAL_ID);
    if (overlay) overlay.remove();
    items = [];
    activeIndex = -1;
  }

  /* =========================================================
     КНОПКА В ШАПКЕ
     ========================================================= */

  function ensureTriggerButton() {
    const existing = document.getElementById(TRIGGER_ID);
    const topActions = document.getElementById('topActions');
    const mobileHeader = document.querySelector('.topbar');

    /* Куда вставлять: в .top-actions (обычно desktop), но
       .top-actions скрыт на мобильном. Поэтому попробуем
       вставить в .topbar в начало — так он будет виден
       и на десктопе, и на мобильном. */

    if (!mobileHeader) return;
    if (existing) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = TRIGGER_ID;
    btn.setAttribute('aria-label', 'Открыть поиск');
    btn.title = 'Поиск (Ctrl+K)';
    btn.innerHTML = '🔍';
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      open();
    });

    /* Вставляем перед .topbar-title, если он есть */
    const title = mobileHeader.querySelector('.topbar-title');
    if (title && title.parentNode === mobileHeader) {
      mobileHeader.insertBefore(btn, title);
    } else {
      /* На крайний случай — просто первым ребёнком */
      mobileHeader.insertBefore(btn, mobileHeader.firstChild);
    }
  }

  /* =========================================================
     ГОРЯЧИЕ КЛАВИШИ + СВАЙП
     ========================================================= */

  function setupHotkeys() {
    document.addEventListener('keydown', e => {
      /* Ctrl+K / Cmd+K */
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        /* Не перехватываем, если пользователь печатает в поле
           поиска внутри палитры — иначе потеряется ввод. */
        const active = document.activeElement;
        if (active && active.id === INPUT_ID) return;

        e.preventDefault();
        if (isOpen) close();
        else open();
        return;
      }

      /* Глобальный Esc — закрывает палитру, если она открыта */
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    }, true);
  }

  function setupSwipe() {
    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartTime = 0;

    document.addEventListener('touchstart', e => {
      if (isOpen) return;
      const t = e.touches[0];
      if (!t) return;
      touchStartY = t.clientY;
      touchStartX = t.clientX;
      touchStartTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (isOpen) return;
      const t = e.changedTouches[0];
      if (!t) return;

      const dy = t.clientY - touchStartY;
      const dx = Math.abs(t.clientX - touchStartX);
      const dt = Date.now() - touchStartTime;

      /* Свайп сверху вниз, короткий, вертикальный:
         старт в верхней половине экрана, длина >80px, <500ms, dx<40 */
      if (
        touchStartY < window.innerHeight * 0.4 &&
        dy > 80 && dy < 260 &&
        dx < 40 &&
        dt < 500
      ) {
        open();
      }
    }, { passive: true });
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function init() {
    injectStyles();

    const start = () => {
      ensureTriggerButton();
      setupHotkeys();
      setupSwipe();
      console.log('[CommandPalette] Инициализирован. Горячая клавиша: Ctrl+K');
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }

    /* Кнопка в шапке может отсутствовать при первой отрисовке
       (topbar рендерится app.js), поэтому повторим попытку
       через небольшой интервал. Только дважды — не циклим. */
    setTimeout(ensureTriggerButton, 800);
    setTimeout(ensureTriggerButton, 2500);
  }

  init();

  /* =========================================================
     ПУБЛИЧНЫЙ API (для отладки)
     ========================================================= */

  window.spCommandPalette = {
    open,
    close,
    isOpen: () => isOpen,
    version: '1.0.0'
  };

})();
