/* =========================================================
   SKLADAPLAN — DASHBOARD (KPI + Что требует внимания)
   =========================================================

   Что делает:
   - Оборачивает window.dashboardView — добавляет блок
     с KPI, "Что требует внимания", "Мои задачи" и
     "Последние события" в начало главной страницы.
   - Оборачивает window.setupDashboard — навешивает
     обработчики на новые элементы.

   Изоляция:
   - Не трогает app.js.
   - Если что-то падает — оригинальный dashboardView
     всё равно отработает и вернёт исходный HTML.
   - Данные берутся из уже загруженного state.
   ========================================================= */

(function () {
  'use strict';
  if (window.spDashboard) return;

  const STYLES_ID = 'spDashboardStyles';
  const HEADER_ID = 'spDashboardHeader';

  let lastEventsFetch = 0;

  /* ============== УТИЛИТЫ ============== */

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getSupabase() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  function todayKey() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function isoDate(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10);
  }

  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${HEADER_ID} { margin-bottom: 20px; }

      /* --- KPI --- */
      #${HEADER_ID} .sp-dash-kpis {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 14px;
      }
      #${HEADER_ID} .sp-dash-kpi {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(15,23,42,.04));
        position: relative;
      }
      #${HEADER_ID} .sp-dash-kpi-icon {
        width: 34px; height: 34px;
        border-radius: 9px;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 16px;
        margin-bottom: 8px;
      }
      #${HEADER_ID} .sp-dash-kpi-label {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: .03em;
        margin-bottom: 4px;
      }
      #${HEADER_ID} .sp-dash-kpi-value {
        font-size: 24px;
        font-weight: 750;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }

      /* --- Две колонки --- */
      #${HEADER_ID} .sp-dash-cols {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }
      #${HEADER_ID} .sp-dash-block {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 14px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(15,23,42,.04));
        padding: 16px 18px;
        margin-bottom: 12px;
      }
      #${HEADER_ID} .sp-dash-block-head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 12px;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
      }
      #${HEADER_ID} .sp-dash-link {
        background: transparent;
        border: 0;
        color: var(--primary, #2563EB);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        font-family: inherit;
      }
      #${HEADER_ID} .sp-dash-link:hover { background: #eff6ff; }

      /* --- "Что требует внимания" --- */
      #${HEADER_ID} .sp-dash-attention-item {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        margin-bottom: 6px;
        transition: background .15s ease;
      }
      #${HEADER_ID} .sp-dash-attention-item:last-child { margin-bottom: 0; }
      #${HEADER_ID} .sp-dash-attention-item[data-attention-idx] { cursor: pointer; }
      #${HEADER_ID} .sp-dash-attention-item[data-attention-idx]:hover { background: #f8fafc; }
      #${HEADER_ID} .sp-dash-attention-icon {
        width: 28px; height: 28px; flex-shrink: 0;
        border-radius: 8px;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 14px;
      }
      #${HEADER_ID} .sp-dash-level-danger .sp-dash-attention-icon { background: #fee2e2; }
      #${HEADER_ID} .sp-dash-level-warning .sp-dash-attention-icon { background: #fef3c7; }
      #${HEADER_ID} .sp-dash-level-info .sp-dash-attention-icon { background: #dbeafe; }
      #${HEADER_ID} .sp-dash-attention-body { min-width: 0; flex: 1; }
      #${HEADER_ID} .sp-dash-attention-label {
        font-size: 13px; font-weight: 600; color: #0f172a;
      }
      #${HEADER_ID} .sp-dash-level-danger .sp-dash-attention-label { color: #b42318; }
      #${HEADER_ID} .sp-dash-attention-hint {
        font-size: 11px; color: #94a3b8; margin-top: 2px;
        overflow: hidden; text-overflow: ellipsis;
        display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
      }

      /* --- "Мои задачи" --- */
      #${HEADER_ID} .sp-dash-task-item {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 8px 4px;
        border-bottom: 1px solid #f1f5f9;
      }
      #${HEADER_ID} .sp-dash-task-item:last-child { border-bottom: 0; padding-bottom: 0; }
      #${HEADER_ID} .sp-dash-task-item:first-child { padding-top: 0; }
      #${HEADER_ID} .sp-dash-task-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--primary, #2563EB);
        margin-top: 7px;
        flex-shrink: 0;
      }
      #${HEADER_ID} .sp-dash-task-body { min-width: 0; flex: 1; }
      #${HEADER_ID} .sp-dash-task-title {
        font-size: 13px; font-weight: 600; color: #0f172a;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #${HEADER_ID} .sp-dash-task-meta {
        font-size: 11px; color: #94a3b8; margin-top: 2px;
      }

      /* --- Последние события --- */
      #${HEADER_ID} .sp-dash-events {
        display: flex; flex-direction: column; gap: 4px;
        max-height: 200px; overflow-y: auto;
      }
      #${HEADER_ID} .sp-dash-event {
        display: flex; align-items: center; gap: 10px;
        padding: 6px 8px; border-radius: 6px;
        font-size: 12px;
        transition: background .1s ease;
      }
      #${HEADER_ID} .sp-dash-event:hover { background: #f8fafc; }
      #${HEADER_ID} .sp-dash-event-time {
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
        min-width: 40px;
      }
      #${HEADER_ID} .sp-dash-event-icon {
        font-size: 13px;
        flex-shrink: 0;
      }
      #${HEADER_ID} .sp-dash-event-text {
        flex: 1; min-width: 0;
        color: #334155;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #${HEADER_ID} .sp-dash-event-text b { color: #0f172a; font-weight: 600; }

      #${HEADER_ID} .sp-dash-empty {
        padding: 16px 4px;
        text-align: center;
        color: #94a3b8;
        font-size: 12px;
      }
      #${HEADER_ID} .sp-dash-loading {
        padding: 12px 4px;
        text-align: center;
        color: #94a3b8;
        font-size: 12px;
      }

      @media (max-width: 900px) {
        #${HEADER_ID} .sp-dash-kpis {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        #${HEADER_ID} .sp-dash-cols {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 560px) {
        #${HEADER_ID} .sp-dash-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        #${HEADER_ID} .sp-dash-kpi { padding: 12px; }
        #${HEADER_ID} .sp-dash-kpi-value { font-size: 20px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ДАННЫЕ ============== */

  function getKpis() {
    const boxes = Array.isArray(window.state?.boxes) ? state.boxes : [];
    const tasks = Array.isArray(window.tasksState?.items) ? tasksState.items : [];
    const plannerTasks = Array.isArray(window.plannerState?.tasks) ? plannerState.tasks : [];
    const today = todayKey();

    let receivedToday = 0, shippedToday = 0, picking = 0, collected = 0;

    boxes.forEach(b => {
      if (isoDate(b.date) === today) receivedToday++;
      if (isoDate(b.shipped_at) === today) shippedToday++;
      if (b.status === 'КПодбору') picking++;
      if (b.status === 'Скомплектовано') collected++;
    });

    let overdue = 0;
    plannerTasks.forEach(t => {
      if (t.status === 'Выполнено' || t.status === 'Отменено') return;
      if (t.date && t.date < today) overdue++;
    });
    tasks.forEach(t => {
      if (t.completed) return;
      if (t.due_date && t.due_date < today) overdue++;
    });

    return { receivedToday, shippedToday, picking, collected, overdue };
  }

  function getAttention() {
    const boxes = Array.isArray(window.state?.boxes) ? state.boxes : [];
    const tasks = Array.isArray(window.tasksState?.items) ? tasksState.items : [];
    const plannerTasks = Array.isArray(window.plannerState?.tasks) ? plannerState.tasks : [];
    const shipments = Array.isArray(window.plannerState?.shipments) ? plannerState.shipments : [];
    const today = todayKey();

    const items = [];

    /* Просроченные задачи */
    const overdueList = [];
    plannerTasks.forEach(t => {
      if (t.status === 'Выполнено' || t.status === 'Отменено') return;
      if (t.date && t.date < today) overdueList.push(t.title);
    });
    tasks.forEach(t => {
      if (t.completed) return;
      if (t.due_date && t.due_date < today) overdueList.push(t.title);
    });
    if (overdueList.length) {
      items.push({
        icon: '⚠️', level: 'danger',
        label: `Просрочено задач: ${overdueList.length}`,
        hint: overdueList.slice(0, 3).join(' · '),
        onClick: () => window.goToPage && window.goToPage('tasks')
      });
    }

    /* Просроченные отгрузки */
    const pendingShip = shipments.filter(s =>
      s.date < today && s.status !== 'Отгружена' && s.status !== 'Отменена'
    );
    if (pendingShip.length) {
      items.push({
        icon: '🚚', level: 'warning',
        label: `Просрочено отгрузок: ${pendingShip.length}`,
        hint: pendingShip.slice(0, 3).map(s => s.title).join(' · '),
        onClick: () => window.goToPage && window.goToPage('planner')
      });
    }

    /* Коробки без поддона */
    const noPallet = boxes.filter(b =>
      b.status !== 'Отгружено' && (!b.pallet || !String(b.pallet).trim())
    ).length;
    if (noPallet > 0) {
      items.push({
        icon: '📦', level: 'info',
        label: `Коробок без поддона: ${noPallet}`,
        hint: 'Проверьте, что у всех коробок указан поддон',
        onClick: () => {
          if (window.state) {
            state.baseSearch = '';
            state.basePallet = '';
            state.baseStatus = '';
            state.basePage = 1;
          }
          window.goToPage && window.goToPage('base');
        }
      });
    }

    return items;
  }

  function getMyTasks() {
    const email = (window.state?.user?.email || '').toLowerCase();
    const tasks = Array.isArray(window.tasksState?.items) ? tasksState.items : [];
    const plannerTasks = Array.isArray(window.plannerState?.tasks) ? plannerState.tasks : [];
    const today = todayKey();

    const out = [];

    /* 1. Назначенные мне через /assign */
    if (email) {
      tasks.forEach(t => {
        if (t.completed || !t.assigned_to) return;
        if (String(t.assigned_to).toLowerCase() !== email) return;
        out.push({ id: t.id, title: t.title, date: t.due_date || '', time: '' });
      });
    }

    /* 2. Общие задачи без исполнителя с датой ≤ сегодня */
    tasks.forEach(t => {
      if (t.completed || t.assigned_to) return;
      if (!t.due_date) return;
      if (t.due_date > today) return;
      out.push({ id: t.id, title: t.title, date: t.due_date, time: '' });
    });

    /* 3. Планировщик — сегодня и просроченные */
    plannerTasks.forEach(t => {
      if (t.status === 'Выполнено' || t.status === 'Отменено') return;
      if (!t.date) return;
      if (t.date > today) return;
      out.push({ id: t.id, title: t.title, date: t.date, time: t.time || '' });
    });

    /* Уникализируем и ограничиваем */
    const seen = new Set();
    const unique = out.filter(t => {
      const k = t.title + '|' + (t.date || '');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return unique.slice(0, 7);
  }

  /* ============== HTML ============== */

  function buildKpisHtml() {
    const k = getKpis();
    const items = [
      { label: 'Принято сегодня',  value: k.receivedToday, color: '#10b981', icon: '📥' },
      { label: 'Отгружено сегодня', value: k.shippedToday,  color: '#2563EB', icon: '🚚' },
      { label: 'К подбору',         value: k.picking,       color: '#8b5cf6', icon: '🎯' },
      { label: 'Скомплектовано',    value: k.collected,     color: '#f59e0b', icon: '✅' },
      { label: 'Просрочено',        value: k.overdue,       color: k.overdue > 0 ? '#b42318' : '#94a3b8', icon: '⚠️' }
    ];

    return items.map(it => `
      <div class="sp-dash-kpi">
        <div class="sp-dash-kpi-icon" style="color:${it.color};background:${it.color}18">${it.icon}</div>
        <div class="sp-dash-kpi-label">${escapeHtml(it.label)}</div>
        <div class="sp-dash-kpi-value" style="color:${it.color}">${it.value}</div>
      </div>
    `).join('');
  }

  function buildAttentionHtml() {
    const items = getAttention();
    if (!items.length) return '<div class="sp-dash-empty">✓ Всё под контролем</div>';

    return items.map((it, i) => `
      <div class="sp-dash-attention-item sp-dash-level-${it.level}" data-attention-idx="${i}">
        <div class="sp-dash-attention-icon">${it.icon}</div>
        <div class="sp-dash-attention-body">
          <div class="sp-dash-attention-label">${escapeHtml(it.label)}</div>
          ${it.hint ? `<div class="sp-dash-attention-hint">${escapeHtml(it.hint)}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  function buildMyTasksHtml() {
    const items = getMyTasks();
    if (!items.length) return '<div class="sp-dash-empty">🎉 На сегодня задач нет</div>';

    return items.map(t => `
      <div class="sp-dash-task-item">
        <div class="sp-dash-task-dot"></div>
        <div class="sp-dash-task-body">
          <div class="sp-dash-task-title">${escapeHtml(t.title)}</div>
          <div class="sp-dash-task-meta">
            ${t.date ? '📅 ' + escapeHtml(t.date) : ''}
            ${t.time ? ' · ' + escapeHtml(t.time) : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  function buildHeaderHtml() {
    return `
      <div id="${HEADER_ID}" class="sp-dash-header">
        <div class="sp-dash-kpis">${buildKpisHtml()}</div>

        <div class="sp-dash-cols">
          <div class="sp-dash-block">
            <div class="sp-dash-block-head">
              <span>⚠️ Что требует внимания</span>
            </div>
            ${buildAttentionHtml()}
          </div>
          <div class="sp-dash-block">
            <div class="sp-dash-block-head">
              <span>📝 Мои задачи на сегодня</span>
              <button type="button" class="sp-dash-link" id="spDashAllTasks">Все →</button>
            </div>
            ${buildMyTasksHtml()}
          </div>
        </div>

        <div class="sp-dash-block">
          <div class="sp-dash-block-head">
            <span>🕓 Последние события</span>
          </div>
          <div class="sp-dash-events" id="spDashEvents">
            <div class="sp-dash-loading">Загрузка…</div>
          </div>
        </div>
      </div>
    `;
  }

  /* ============== СОБЫТИЯ ============== */

  async function loadRecentEvents() {
    const el = document.getElementById('spDashEvents');
    if (!el) return;

    if (Date.now() - lastEventsFetch < 30000) return;
    lastEventsFetch = Date.now();

    try {
      const client = getSupabase();
      if (!client) throw new Error('no client');

      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await client
        .from('audit_log')
        .select('table_name, action, new_data, created_at')
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const rows = data || [];
      if (!rows.length) {
        el.innerHTML = '<div class="sp-dash-empty">За последние 2 часа ничего не происходило</div>';
        return;
      }

      const tableLabels = {
        boxes: 'Коробки', tasks: 'Задачи',
        planner_tasks: 'Планировщик', planner_shipments: 'Отгрузки',
        pallet_notes: 'Заметки'
      };
      const actionIcons = { INSERT: '➕', UPDATE: '✏️', DELETE: '🗑' };

      el.innerHTML = rows.map(r => {
        const table = tableLabels[r.table_name] || r.table_name;
        const icon = actionIcons[r.action] || '•';
        const title = (r.new_data && (r.new_data.title || r.new_data['Штрихкод'])) || '';
        return `
          <div class="sp-dash-event">
            <span class="sp-dash-event-time">${escapeHtml(fmtTime(r.created_at))}</span>
            <span class="sp-dash-event-icon">${icon}</span>
            <span class="sp-dash-event-text">
              <b>${escapeHtml(table)}</b>${title ? ' · ' + escapeHtml(title) : ''}
            </span>
          </div>
        `;
      }).join('');

    } catch (e) {
      console.warn('[Dashboard] events error:', e);
      el.innerHTML = '<div class="sp-dash-empty">Не удалось загрузить события</div>';
    }
  }

  /* ============== ХУКИ ============== */

  function install() {
    if (typeof window.dashboardView !== 'function') {
      console.warn('[Dashboard] dashboardView ещё не готова');
      return false;
    }
    if (window.dashboardView.__dashWrapped) return true;

    const originalView = window.dashboardView;
    const originalSetup = window.setupDashboard;

    const wrappedView = function () {
      let prefix = '';
      try {
        prefix = buildHeaderHtml();
      } catch (e) {
        console.warn('[Dashboard] build error:', e);
      }
      return prefix + originalView.apply(this, arguments);
    };
    wrappedView.__dashWrapped = true;
    window.dashboardView = wrappedView;

    if (typeof originalSetup === 'function') {
      window.setupDashboard = function () {
        originalSetup.apply(this, arguments);

        setTimeout(() => {
          try {
            /* Кнопка "Все задачи →" */
            const allTasksBtn = document.getElementById('spDashAllTasks');
            if (allTasksBtn) {
              allTasksBtn.addEventListener('click', () => {
                window.goToPage && window.goToPage('tasks');
              });
            }

            /* Обработчики кликов на "требует внимания" */
            const items = getAttention();
            document.querySelectorAll('[data-attention-idx]').forEach(el => {
              const i = Number(el.getAttribute('data-attention-idx'));
              const item = items[i];
              if (!item || !item.onClick) return;
              el.addEventListener('click', () => {
                try { item.onClick(); } catch (e) { console.warn(e); }
              });
            });

            /* Лента событий */
            loadRecentEvents();
          } catch (e) {
            console.warn('[Dashboard] setup error:', e);
          }
        }, 50);
      };
    }

    console.log('[Dashboard] Хуки установлены');
    return true;
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }

    /* Пара попыток — на случай медленной загрузки app.js */
    setTimeout(install, 300);
    setTimeout(install, 1500);
    setTimeout(install, 4000);
  }

  init();

  window.spDashboard = {
    refresh: () => {
      const kpis = document.querySelector(`#${HEADER_ID} .sp-dash-kpis`);
      if (kpis) kpis.innerHTML = buildKpisHtml();
    },
    version: '1.0.0'
  };

})();
