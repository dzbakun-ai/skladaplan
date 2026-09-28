/* =========================================================
   SKLADAPLAN — ЖУРНАЛ ДЕЙСТВИЙ (просмотр)
   =========================================================

   Что делает:
   - Добавляет кнопку «🕓 Журнал действий» на страницу «Данные».
   - Открывает модальное окно с последними записями из таблицы
     public.audit_log (создаётся миграцией).
   - Фильтры: период, таблица, действие, поиск по id записи.
   - Клик по строке — раскрывает список изменившихся полей.

   Изоляция:
   - Не трогает app.js, optimization.js и др.
   - Читает только через supabaseClient (уже глобально доступен).
   - Сам ничего не пишет в базу.
   ========================================================= */

(function () {
  'use strict';

  const STYLES_ID  = 'spAuditLogStyles';
  const MODAL_ID   = 'spAuditLogModal';
  const TBODY_ID   = 'spAuditLogBody';
  const SEARCH_ID  = 'spAuditLogSearch';
  const PERIOD_ID  = 'spAuditLogPeriod';
  const TABLE_ID   = 'spAuditLogTable';
  const ACTION_ID  = 'spAuditLogAction';
  const COUNT_ID   = 'spAuditLogCount';
  const PAGE_LIMIT = 200;

  let currentRows = [];
  let expandedIds = new Set();

  /* =========================================================
     СТИЛИ
     ========================================================= */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* Кнопка в разделе «Данные» */
      #spAuditLogOpenBtn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--primary, #2563EB);
        color: #fff;
        border: 0;
        border-radius: 10px;
        padding: 11px 18px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 12px;
      }
      #spAuditLogOpenBtn:hover { background: var(--primary-hover, #1D4ED8); }

      /* Модалка */
      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100002;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-audit-card {
        background: #fff;
        border-radius: 16px;
        width: 100%;
        max-width: 1100px;
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-audit-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-audit-head h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }
      #${MODAL_ID} .sp-audit-close {
        border: 0;
        background: #f3f3f3;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: #444;
      }
      #${MODAL_ID} .sp-audit-close:hover { background: #e5e5e5; }

      /* Фильтры */
      #${MODAL_ID} .sp-audit-filters {
        display: grid;
        grid-template-columns: 1fr 180px 180px 180px;
        gap: 10px;
        padding: 14px 20px;
        background: #fafbfc;
        border-bottom: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-audit-filters input,
      #${MODAL_ID} .sp-audit-filters select {
        width: 100%;
        min-height: 40px;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        padding: 0 12px;
        font: inherit;
        font-size: 13px;
        background: #fff;
        outline: none;
      }
      #${MODAL_ID} .sp-audit-filters input:focus,
      #${MODAL_ID} .sp-audit-filters select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, .1);
      }
      #${MODAL_ID} .sp-audit-counter {
        padding: 8px 20px;
        font-size: 12px;
        color: #64748b;
        background: #f8fafc;
        border-bottom: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-audit-counter b { color: #111; }

      /* Таблица */
      #${MODAL_ID} .sp-audit-body {
        overflow-y: auto;
        flex: 1;
      }
      #${MODAL_ID} table {
        width: 100%;
        border-collapse: collapse;
      }
      #${MODAL_ID} thead {
        position: sticky;
        top: 0;
        background: #f1f5f9;
        z-index: 2;
      }
      #${MODAL_ID} thead th {
        text-align: left;
        padding: 10px 12px;
        font-size: 11px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: .04em;
        border-bottom: 1px solid #e2e8f0;
        white-space: nowrap;
      }
      #${MODAL_ID} tbody td {
        padding: 10px 12px;
        font-size: 13px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: top;
      }
      #${MODAL_ID} tbody tr.sp-audit-row {
        cursor: pointer;
      }
      #${MODAL_ID} tbody tr.sp-audit-row:hover {
        background: #f8fafc;
      }
      #${MODAL_ID} .sp-audit-action {
        display: inline-block;
        padding: 3px 9px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      #${MODAL_ID} .sp-audit-action-insert {
        background: #dcfce7; color: #166534;
      }
      #${MODAL_ID} .sp-audit-action-update {
        background: #dbeafe; color: #1e40af;
      }
      #${MODAL_ID} .sp-audit-action-delete {
        background: #fee2e2; color: #991b1b;
      }
      #${MODAL_ID} .sp-audit-time {
        color: #94a3b8;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      #${MODAL_ID} .sp-audit-operator {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 12px;
        color: #334155;
      }
      #${MODAL_ID} .sp-audit-table-name {
        color: #475569;
        font-size: 12px;
        font-weight: 600;
      }
      #${MODAL_ID} .sp-audit-record-id {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 12px;
        color: #1e40af;
        word-break: break-all;
      }
      #${MODAL_ID} .sp-audit-changed {
        font-size: 12px;
        color: #64748b;
      }
      #${MODAL_ID} .sp-audit-changed code {
        background: #f1f5f9;
        padding: 1px 5px;
        border-radius: 3px;
        margin-right: 4px;
        font-size: 11px;
      }

      /* Раскрывающиеся детали */
      #${MODAL_ID} tr.sp-audit-details td {
        background: #fafbfc;
        padding: 12px 20px;
        border-bottom: 1px solid #e2e8f0;
      }
      #${MODAL_ID} .sp-audit-diff {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      #${MODAL_ID} .sp-audit-diff-col {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px 12px;
        overflow-x: auto;
      }
      #${MODAL_ID} .sp-audit-diff-col h4 {
        margin: 0 0 8px;
        font-size: 11px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      #${MODAL_ID} .sp-audit-diff-line {
        display: flex;
        gap: 10px;
        padding: 3px 0;
        font-size: 12px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
      #${MODAL_ID} .sp-audit-diff-line .key {
        color: #64748b;
        min-width: 130px;
      }
      #${MODAL_ID} .sp-audit-diff-line .val {
        color: #0f172a;
        word-break: break-all;
      }
      #${MODAL_ID} .sp-audit-diff-line.is-changed {
        background: #fef9c3;
        border-radius: 4px;
        padding-left: 6px;
      }
      #${MODAL_ID} .sp-audit-empty {
        padding: 40px 20px;
        text-align: center;
        color: #94a3b8;
        font-size: 14px;
      }
      #${MODAL_ID} .sp-audit-loading {
        padding: 40px 20px;
        text-align: center;
        color: #64748b;
        font-size: 14px;
      }

      @media (max-width: 700px) {
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-audit-card {
          max-width: none;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
        }
        #${MODAL_ID} .sp-audit-filters {
          grid-template-columns: 1fr 1fr;
        }
        #${MODAL_ID} .sp-audit-filters > input {
          grid-column: 1 / -1;
        }
        #${MODAL_ID} .sp-audit-diff {
          grid-template-columns: 1fr;
        }
        #${MODAL_ID} tbody td {
          font-size: 12px;
          padding: 8px 8px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* =========================================================
     УТИЛИТЫ
     ========================================================= */

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMin = Math.floor((now - d) / 60000);
      if (diffMin < 1) return 'только что';
      if (diffMin < 60) return `${diffMin} мин назад`;
      const pad = n => String(n).padStart(2, '0');
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) return `сегодня ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return iso; }
  }

  /* Показываем только «человеческие» значения */
  function shortValue(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'да' : 'нет';
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v);
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  }

  function actionClass(action) {
    if (action === 'INSERT') return 'sp-audit-action-insert';
    if (action === 'UPDATE') return 'sp-audit-action-update';
    if (action === 'DELETE') return 'sp-audit-action-delete';
    return '';
  }

  function actionLabel(action) {
    if (action === 'INSERT') return 'Создание';
    if (action === 'UPDATE') return 'Изменение';
    if (action === 'DELETE') return 'Удаление';
    return action;
  }

  function tableLabel(name) {
    const map = {
      boxes: 'Коробка',
      pallet_notes: 'Заметка поддона',
      tasks: 'Задача',
      planner_tasks: 'Задача планировщика',
      planner_shipments: 'Отгрузка'
    };
    return map[name] || name;
  }

  /* =========================================================
     ЗАГРУЗКА
     ========================================================= */

  async function fetchLog() {
    const tbody = document.getElementById(TBODY_ID);
    const counter = document.getElementById(COUNT_ID);

    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="sp-audit-loading">Загрузка…</td></tr>`;

    const period = document.getElementById(PERIOD_ID)?.value || '7d';
    const tableF = document.getElementById(TABLE_ID)?.value || '';
    const actionF = document.getElementById(ACTION_ID)?.value || '';
    const searchF = (document.getElementById(SEARCH_ID)?.value || '').trim();

    let query = supabaseClient
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_LIMIT);

    /* Период */
    if (period !== 'all') {
      const since = new Date();
      if (period === 'today')    since.setHours(0, 0, 0, 0);
      else if (period === '7d')  since.setDate(since.getDate() - 7);
      else if (period === '30d') since.setDate(since.getDate() - 30);
      query = query.gte('created_at', since.toISOString());
    }

    if (tableF)  query = query.eq('table_name', tableF);
    if (actionF) query = query.eq('action', actionF);

    if (searchF) {
      /* Поиск по record_id — обычно это id коробки или задачи */
      query = query.ilike('record_id', `%${searchF}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[AuditLog] fetch error:', error);
      tbody.innerHTML = `
        <tr><td colspan="6" class="sp-audit-empty">
          Не удалось загрузить журнал.<br>
          <span style="font-size:12px;color:#94a3b8;">
            ${escapeHtml(error.message || 'Ошибка соединения')}
          </span>
        </td></tr>
      `;
      if (counter) counter.textContent = '—';
      return;
    }

    currentRows = data || [];
    expandedIds = new Set();

    if (counter) {
      counter.innerHTML = `Показаны последние <b>${currentRows.length}</b> записей (макс. ${PAGE_LIMIT})`;
    }

    renderRows();
  }

  function renderRows() {
    const tbody = document.getElementById(TBODY_ID);
    if (!tbody) return;

    if (!currentRows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="sp-audit-empty">Записей нет</td></tr>`;
      return;
    }

    let html = '';
    currentRows.forEach(row => {
      const changed = Array.isArray(row.changed_fields) ? row.changed_fields : null;
      const changedText = changed && changed.length
        ? changed.slice(0, 6).map(f => `<code>${escapeHtml(f)}</code>`).join('') +
          (changed.length > 6 ? ` +${changed.length - 6}` : '')
        : (row.action === 'INSERT' ? '<span style="color:#94a3b8;">новая запись</span>' :
           row.action === 'DELETE' ? '<span style="color:#94a3b8;">удалено</span>' :
           '<span style="color:#94a3b8;">без изменений полей</span>');

      html += `
        <tr class="sp-audit-row" data-row-id="${row.id}">
          <td class="sp-audit-time">${escapeHtml(formatTime(row.created_at))}</td>
          <td>
            <span class="sp-audit-action ${actionClass(row.action)}">
              ${escapeHtml(actionLabel(row.action))}
            </span>
          </td>
          <td class="sp-audit-table-name">${escapeHtml(tableLabel(row.table_name))}</td>
          <td class="sp-audit-record-id">${escapeHtml(row.record_id || '—')}</td>
          <td class="sp-audit-operator">${escapeHtml(row.operator_email || '—')}</td>
          <td class="sp-audit-changed">${changedText}</td>
        </tr>
      `;

      /* Раскрытая строка */
      if (expandedIds.has(row.id)) {
        html += `
          <tr class="sp-audit-details">
            <td colspan="6">
              ${renderDetails(row)}
            </td>
          </tr>
        `;
      }
    });

    tbody.innerHTML = html;

    /* Обработчики кликов */
    tbody.querySelectorAll('.sp-audit-row').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = Number(tr.getAttribute('data-row-id'));
        if (expandedIds.has(id)) expandedIds.delete(id);
        else expandedIds.add(id);
        renderRows();
      });
    });
  }

  function renderDetails(row) {
    const changed = Array.isArray(row.changed_fields) ? new Set(row.changed_fields) : new Set();

    const renderCol = (title, obj) => {
      if (!obj || typeof obj !== 'object') {
        return `
          <div class="sp-audit-diff-col">
            <h4>${escapeHtml(title)}</h4>
            <div style="color:#94a3b8;font-size:12px;">—</div>
          </div>
        `;
      }

      /* Скрываем шумные поля */
      const skip = new Set(['created_at', 'updated_at']);
      const entries = Object.entries(obj)
        .filter(([k]) => !skip.has(k))
        .sort(([a], [b]) => a.localeCompare(b));

      return `
        <div class="sp-audit-diff-col">
          <h4>${escapeHtml(title)}</h4>
          ${entries.map(([k, v]) => `
            <div class="sp-audit-diff-line ${changed.has(k) ? 'is-changed' : ''}">
              <span class="key">${escapeHtml(k)}</span>
              <span class="val">${escapeHtml(shortValue(v))}</span>
            </div>
          `).join('')}
        </div>
      `;
    };

    return `
      <div class="sp-audit-diff">
        ${renderCol('Было', row.old_data)}
        ${renderCol('Стало', row.new_data)}
      </div>
    `;
  }

  /* =========================================================
     МОДАЛКА
     ========================================================= */

  function openModal() {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-audit-card">
        <div class="sp-audit-head">
          <h2>🕓 Журнал действий</h2>
          <button type="button" class="sp-audit-close" aria-label="Закрыть">×</button>
        </div>

        <div class="sp-audit-filters">
          <input
            id="${SEARCH_ID}"
            type="search"
            placeholder="Поиск по ID записи (штрихкод, id задачи)"
          >
          <select id="${PERIOD_ID}">
            <option value="today">За сегодня</option>
            <option value="7d" selected>За 7 дней</option>
            <option value="30d">За 30 дней</option>
            <option value="all">За всё время</option>
          </select>
          <select id="${TABLE_ID}">
            <option value="">Все объекты</option>
            <option value="boxes">Коробки</option>
            <option value="pallet_notes">Заметки поддонов</option>
            <option value="tasks">Задачи</option>
            <option value="planner_tasks">Задачи планировщика</option>
            <option value="planner_shipments">Отгрузки</option>
          </select>
          <select id="${ACTION_ID}">
            <option value="">Все действия</option>
            <option value="INSERT">Создание</option>
            <option value="UPDATE">Изменение</option>
            <option value="DELETE">Удаление</option>
          </select>
        </div>

        <div class="sp-audit-counter" id="${COUNT_ID}">Загрузка…</div>

        <div class="sp-audit-body">
          <table>
            <thead>
              <tr>
                <th style="width:120px;">Время</th>
                <th style="width:100px;">Действие</th>
                <th style="width:150px;">Объект</th>
                <th style="width:180px;">ID записи</th>
                <th style="width:200px;">Оператор</th>
                <th>Изменения</th>
              </tr>
            </thead>
            <tbody id="${TBODY_ID}"></tbody>
          </table>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sp-audit-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });

    /* Фильтры — перезагружаем при изменении */
    [SEARCH_ID, PERIOD_ID, TABLE_ID, ACTION_ID].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const ev = el.tagName === 'INPUT' ? 'input' : 'change';

      /* Debounce для поиска */
      let timer = null;
      el.addEventListener(ev, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fetchLog, ev === 'input' ? 300 : 0);
      });
    });

    /* Esc закрывает */
    const escHandler = e => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    fetchLog();
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  /* =========================================================
     КНОПКА НА СТРАНИЦЕ «ДАННЫЕ»
     ========================================================= */

  function attachButton() {
    /* На странице «Данные» есть карточка «Аккаунт».
       Вставим нашу кнопку после карточки статистики или
       перед блоком «Смена пароля». Проще — найдём вкладку
       «Данные» и вставим после первого .sp-card. */
    if (document.getElementById('spAuditLogOpenBtn')) return;

    /* Ищем по id известные блоки */
    const accountCard = document.querySelector('#logoutBtn')
      ?.closest('.sp-card');

    if (!accountCard) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'spAuditLogOpenBtn';
    btn.innerHTML = '🕓 Открыть журнал действий';

    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    /* Вставляем после карточки «Аккаунт» */
    accountCard.insertAdjacentElement('afterend', btn);

    console.log('[AuditLog] Кнопка добавлена в раздел «Данные»');
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function init() {
    injectStyles();

    const tryAttach = () => {
      try {
        attachButton();
      } catch (e) {
        console.warn('[AuditLog] attach error:', e);
      }
    };

    /* Первая попытка — после DOMContentLoaded */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach, { once: true });
    } else {
      tryAttach();
    }

    /* Страница «Данные» пересобирается при каждом переходе,
       поэтому пробуем периодически через MutationObserver —
       но не жёстко циклично. */
    const obs = new MutationObserver(() => {
      tryAttach();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    console.log('[AuditLog] Модуль инициализирован');
  }

  init();

  /* Публичный API */
  window.spAuditLog = {
    open: openModal,
    close: closeModal,
    version: '1.0.0'
  };

})();
