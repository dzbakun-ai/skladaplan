/* =========================================================
   SKLADAPLAN — УЧЁТ СМЕН
   =========================================================

   Что делает:
   - На Главной — виджет «Начать / Закончить смену».
   - В режиме «Смены» внутри раздела «Планирование» —
     таблица всех смен с фильтром и экспортом.
   - При начале смены — уведомление в Telegram.

   Изоляция:
   - Не трогает app.js, tasks.js, planner.js.
   - Через MutationObserver на #content.
   ========================================================= */

(function () {
  'use strict';
  if (window.spShifts) return;

  const STYLES_ID  = 'spShiftsStyles';
  const WIDGET_ID  = 'spShiftWidget';
  const PANEL_ID   = 'spShiftsPanel';
  const LS_PANEL_MODE = 'sp-shifts-active';

  let currentShift = null;   // открытая смена или null
  let listShifts   = [];     // все смены для панели
  let listLoading  = false;
  let tickTimer    = null;
  let contentObserver = null;
  let scheduled = false;

  /* ============== ДОСТУП ============== */

  function getSupabase() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  function getAppState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    if (window.state) return window.state;
    return null;
  }

  function currentUserEmail() {
    return getAppState()?.user?.email || null;
  }

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'success');
    else console.log('[Shifts]', msg);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    } catch (e) { return iso; }
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return iso; }
  }

  function fmtDuration(minutes) {
    if (minutes == null) return '—';
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h === 0) return `${r} мин`;
    return `${h} ч ${r} мин`;
  }

  function durationSince(iso) {
    if (!iso) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  }

  /* ============== TELEGRAM ============== */

  async function notifyShift(action, shift) {
    /* action: 'start' | 'stop' */
    try {
      const client = getSupabase();
      if (!client) return;

      const { data: settings } = await client
        .from('telegram_settings')
        .select('bot_token, enabled')
        .eq('id', 1).maybeSingle();

      if (!settings || !settings.enabled || !settings.bot_token) return;

      const { data: users } = await client
        .from('telegram_users')
        .select('chat_id, email')
        .eq('active', true);

      if (!users || !users.length) return;

      const email = shift.user_email || currentUserEmail() || '—';
      const timeStr = fmtTime(
        action === 'start' ? shift.started_at : shift.ended_at
      );

      const text = action === 'start'
        ? `🟢 <b>Смена начата</b>\n\n👤 ${escapeHtml(email)}\n🕐 ${timeStr}`
        : `🔴 <b>Смена завершена</b>\n\n👤 ${escapeHtml(email)}\n🕐 ${timeStr}\n⏱ Длительность: <b>${fmtDuration(shift.duration_minutes)}</b>`;

      for (const u of users) {
        try {
          await fetch(`https://api.telegram.org/bot${settings.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: u.chat_id,
              text,
              parse_mode: 'HTML',
              disable_web_page_preview: true
            })
          });
        } catch (e) {
          console.warn('[Shifts] tg error:', e);
        }
      }
    } catch (e) {
      console.warn('[Shifts] notify error:', e);
    }
  }

  /* ============== ЗАПРОСЫ ============== */

  async function loadOpenShift() {
    const client = getSupabase();
    const email = currentUserEmail();
    if (!client || !email) return null;

    const { data, error } = await client
      .from('shifts')
      .select('*')
      .ilike('user_email', email)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[Shifts] loadOpen error:', error);
      return null;
    }
    return data || null;
  }

  async function loadShiftsList() {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('shifts')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(300);

    if (error) {
      console.warn('[Shifts] loadList error:', error);
      return [];
    }
    return data || [];
  }

  async function startShift() {
    const client = getSupabase();
    const email = currentUserEmail();
    if (!client || !email) {
      toast('Нет авторизации', 'error');
      return;
    }

    const { data, error } = await client
      .from('shifts')
      .insert({ user_email: email })
      .select('*')
      .single();

    if (error) {
      console.error('[Shifts] start error:', error);
      /* Уникальный индекс — значит уже открыта */
      if (String(error.message || '').includes('shifts_open_unique')) {
        toast('У вас уже есть открытая смена', 'error');
        await refresh();
        return;
      }
      toast('Не удалось начать смену: ' + (error.message || ''), 'error');
      return;
    }

    currentShift = data;
    toast('Смена начата');
    notifyShift('start', data).catch(() => {});
    renderWidget();
    renderPanel();
  }

  async function stopShift() {
    const client = getSupabase();
    if (!client || !currentShift) return;

    const endedAt = new Date();
    const startMs = new Date(currentShift.started_at).getTime();
    const minutes = Math.max(1, Math.round((endedAt.getTime() - startMs) / 60000));

    const { data, error } = await client
      .from('shifts')
      .update({
        ended_at: endedAt.toISOString(),
        duration_minutes: minutes
      })
      .eq('id', currentShift.id)
      .select('*')
      .single();

    if (error) {
      console.error('[Shifts] stop error:', error);
      toast('Не удалось завершить смену', 'error');
      return;
    }

    currentShift = null;
    toast(`Смена завершена. Длительность: ${fmtDuration(minutes)}`);
    notifyShift('stop', data).catch(() => {});
    renderWidget();
    /* Обновить список при открытой панели */
    if (document.getElementById(PANEL_ID)) {
      await refreshList();
    }
  }

  async function refresh() {
    currentShift = await loadOpenShift();
    renderWidget();
  }

  async function refreshList() {
    listLoading = true;
    renderPanel();
    listShifts = await loadShiftsList();
    listLoading = false;
    renderPanel();
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* ============ ВИДЖЕТ НА ГЛАВНОЙ ============ */
      #${WIDGET_ID} {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 14px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(15,23,42,.04));
        padding: 16px 18px;
        margin-bottom: 12px;
      }
      #${WIDGET_ID} .sp-sh-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      #${WIDGET_ID} .sp-sh-title {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
      }
      #${WIDGET_ID} .sp-sh-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }
      #${WIDGET_ID} .sp-sh-status.is-open {
        background: #dcfce7;
        color: #166534;
      }
      #${WIDGET_ID} .sp-sh-status.is-closed {
        background: #f1f5f9;
        color: #64748b;
      }
      #${WIDGET_ID} .sp-sh-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: currentColor;
      }
      #${WIDGET_ID} .sp-sh-status.is-open .sp-sh-dot {
        animation: spShPulse 1.6s ease infinite;
      }
      @keyframes spShPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .3; }
      }

      #${WIDGET_ID} .sp-sh-body {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }
      #${WIDGET_ID} .sp-sh-meta {
        font-size: 13px;
        color: #475569;
      }
      #${WIDGET_ID} .sp-sh-meta b { color: #0f172a; }
      #${WIDGET_ID} .sp-sh-counter {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 20px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -.02em;
      }

      #${WIDGET_ID} .sp-sh-btn {
        border: 0;
        border-radius: 9px;
        padding: 10px 18px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      #${WIDGET_ID} .sp-sh-btn-start {
        background: #18794e;
        color: #fff;
      }
      #${WIDGET_ID} .sp-sh-btn-start:hover { background: #146a43; }
      #${WIDGET_ID} .sp-sh-btn-stop {
        background: #b42318;
        color: #fff;
      }
      #${WIDGET_ID} .sp-sh-btn-stop:hover { background: #9d1e14; }

      /* ============ ПАНЕЛЬ СПИСКА ============ */
      #${PANEL_ID} .sp-sh-filters {
        display: grid;
        grid-template-columns: 1fr 220px 220px;
        gap: 10px;
        margin-bottom: 14px;
      }
      #${PANEL_ID} .sp-sh-filters input,
      #${PANEL_ID} .sp-sh-filters select {
        min-height: 40px;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        padding: 0 12px;
        font-size: 13px;
        outline: none;
        background: #fff;
        width: 100%;
        box-sizing: border-box;
        font-family: inherit;
      }
      #${PANEL_ID} .sp-sh-filters input:focus,
      #${PANEL_ID} .sp-sh-filters select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${PANEL_ID} .sp-sh-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      #${PANEL_ID} .sp-sh-summary {
        font-size: 13px;
        color: #64748b;
      }
      #${PANEL_ID} .sp-sh-summary b { color: #0f172a; }
      #${PANEL_ID} .sp-sh-export {
        border: 1px solid #e2e8f0;
        background: #fff;
        color: #334155;
        border-radius: 9px;
        padding: 9px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      #${PANEL_ID} .sp-sh-export:hover { background: #f8fafc; }

      #${PANEL_ID} table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
      }
      #${PANEL_ID} thead th {
        text-align: left;
        padding: 10px 12px;
        font-size: 11px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: .04em;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        white-space: nowrap;
      }
      #${PANEL_ID} tbody td {
        padding: 11px 12px;
        font-size: 13px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
        color: #0f172a;
      }
      #${PANEL_ID} tbody tr:hover { background: #fafbfc; }
      #${PANEL_ID} .sp-sh-time {
        font-family: ui-monospace, Menlo, monospace;
        font-size: 13px;
        color: #334155;
      }
      #${PANEL_ID} .sp-sh-duration {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 999px;
        background: #dbeafe;
        color: #1e40af;
        font-size: 11px;
        font-weight: 700;
      }
      #${PANEL_ID} .sp-sh-open-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 999px;
        background: #dcfce7;
        color: #166534;
        font-size: 11px;
        font-weight: 700;
      }
      #${PANEL_ID} .sp-sh-email {
        font-family: ui-monospace, Menlo, monospace;
        font-size: 12px;
        color: #475569;
        word-break: break-all;
      }
      #${PANEL_ID} .sp-sh-empty {
        padding: 40px 20px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
      }
      #${PANEL_ID} .sp-sh-loading {
        padding: 40px 20px;
        text-align: center;
        color: #64748b;
        font-size: 13px;
      }

      @media (max-width: 700px) {
        #${PANEL_ID} .sp-sh-filters {
          grid-template-columns: 1fr;
        }
        #${PANEL_ID} table th:nth-child(2),
        #${PANEL_ID} table td:nth-child(2) {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ВИДЖЕТ НА ГЛАВНОЙ ============== */

  function buildWidgetHtml() {
    if (currentShift) {
      const start = fmtTime(currentShift.started_at);
      const dur = durationSince(currentShift.started_at);

      return `
        <div id="${WIDGET_ID}">
          <div class="sp-sh-head">
            <span class="sp-sh-title">⏱ Смена</span>
            <span class="sp-sh-status is-open">
              <span class="sp-sh-dot"></span>
              Идёт смена
            </span>
          </div>
          <div class="sp-sh-body">
            <div>
              <div class="sp-sh-meta">
                Начало: <b>${escapeHtml(start)}</b>
              </div>
              <div class="sp-sh-counter" id="spShiftCounter">
                ${fmtDuration(dur)}
              </div>
            </div>
            <div style="flex:1;"></div>
            <button type="button" class="sp-sh-btn sp-sh-btn-stop" id="spShiftStop">
              ■ Закончить смену
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div id="${WIDGET_ID}">
        <div class="sp-sh-head">
          <span class="sp-sh-title">⏱ Смена</span>
          <span class="sp-sh-status is-closed">
            <span class="sp-sh-dot"></span>
            Не открыта
          </span>
        </div>
        <div class="sp-sh-body">
          <div class="sp-sh-meta">
            Начните смену, чтобы отслеживать рабочее время.
          </div>
          <div style="flex:1;"></div>
          <button type="button" class="sp-sh-btn sp-sh-btn-start" id="spShiftStart">
            ▶ Начать смену
          </button>
        </div>
      </div>
    `;
  }

  function attachWidgetHandlers() {
    document.getElementById('spShiftStart')?.addEventListener('click', startShift);
    document.getElementById('spShiftStop')?.addEventListener('click', stopShift);
  }

  function renderWidget() {
    const host = document.getElementById('spShiftHost');
    if (!host) return;

    host.innerHTML = buildWidgetHtml();
    attachWidgetHandlers();
  }

  function insertWidget() {
    /* На Главной? Проверяем по маркеру dashboard.js */
    const dashHeader = document.getElementById('spDashboardHeader');
    if (!dashHeader) return;

    if (document.getElementById(WIDGET_ID)) return;

    /* Создаём контейнер после dashboard header, но до колонок */
    const host = document.createElement('div');
    host.id = 'spShiftHost';

    const kpis = dashHeader.querySelector('.sp-dash-kpis');
    if (kpis && kpis.parentNode === dashHeader) {
      kpis.insertAdjacentElement('afterend', host);
    } else {
      dashHeader.insertBefore(host, dashHeader.firstChild);
    }

    renderWidget();
    console.log('[Shifts] Виджет вставлен на Главной');
  }

  function removeWidget() {
    const host = document.getElementById('spShiftHost');
    if (host) host.remove();
  }

  /* ============== ПАНЕЛЬ СПИСКА (в режиме «Смены» в Планировании) ============== */

  function isShiftsMode() {
    try {
      return localStorage.getItem(LS_PANEL_MODE) === '1';
    } catch (e) { return false; }
  }

  function buildPanelHtml() {
    if (listLoading) {
      return `<div id="${PANEL_ID}"><div class="sp-sh-loading">Загрузка смен…</div></div>`;
    }

    const filtered = applyFilters(listShifts);

    const totalMinutes = filtered.reduce(
      (s, r) => s + (Number(r.duration_minutes) || 0), 0
    );

    const emails = [...new Set(listShifts.map(r => r.user_email).filter(Boolean))];

    return `
      <div id="${PANEL_ID}" class="sp-card">
        <div class="sp-sh-filters">
          <input id="spShSearch" type="search"
            placeholder="Поиск по email или заметке"
            value="${escapeHtml(window.__spShSearch || '')}">
          <select id="spShUserFilter">
            <option value="">Все сотрудники</option>
            ${emails.map(e => `
              <option value="${escapeHtml(e)}"
                ${window.__spShUser === e ? 'selected' : ''}>
                ${escapeHtml(e)}
              </option>
            `).join('')}
          </select>
          <select id="spShPeriod">
            <option value="7d"  ${(window.__spShPeriod || '30d') === '7d' ? 'selected' : ''}>За 7 дней</option>
            <option value="30d" ${(window.__spShPeriod || '30d') === '30d' ? 'selected' : ''}>За 30 дней</option>
            <option value="90d" ${window.__spShPeriod === '90d' ? 'selected' : ''}>За 90 дней</option>
            <option value="all" ${window.__spShPeriod === 'all' ? 'selected' : ''}>За всё время</option>
          </select>
        </div>

        <div class="sp-sh-toolbar">
          <div class="sp-sh-summary">
            Смен: <b>${filtered.length}</b> ·
            Всего часов: <b>${fmtDuration(totalMinutes)}</b>
          </div>
          <button type="button" class="sp-sh-export" id="spShExport">
            ⬇ Экспорт CSV
          </button>
        </div>

        ${filtered.length ? `
          <div class="sp-table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:110px;">Дата</th>
                  <th>Сотрудник</th>
                  <th style="width:80px;">Приход</th>
                  <th style="width:80px;">Уход</th>
                  <th style="width:120px;">Длительность</th>
                  <th>Заметка</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(r => `
                  <tr>
                    <td class="sp-sh-time">${escapeHtml(fmtDate(r.started_at))}</td>
                    <td class="sp-sh-email">${escapeHtml(r.user_email || '—')}</td>
                    <td class="sp-sh-time">${escapeHtml(fmtTime(r.started_at))}</td>
                    <td class="sp-sh-time">${
                      r.ended_at
                        ? escapeHtml(fmtTime(r.ended_at))
                        : '<span class="sp-sh-open-badge">Идёт</span>'
                    }</td>
                    <td>${
                      r.duration_minutes != null
                        ? `<span class="sp-sh-duration">${escapeHtml(fmtDuration(r.duration_minutes))}</span>`
                        : '<span class="sp-sh-open-badge">—</span>'
                    }</td>
                    <td>${escapeHtml(r.note || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="sp-sh-empty">
            За выбранный период смен нет.
          </div>
        `}
      </div>
    `;
  }

  function applyFilters(rows) {
    const search = String(window.__spShSearch || '').trim().toLowerCase();
    const user = String(window.__spShUser || '').trim();
    const period = window.__spShPeriod || '30d';

    let fromDate = null;
    if (period !== 'all') {
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      fromDate.setHours(0, 0, 0, 0);
    }

    return rows.filter(r => {
      if (user && r.user_email !== user) return false;

      if (fromDate && new Date(r.started_at).getTime() < fromDate.getTime()) {
        return false;
      }

      if (search) {
        const hay = [
          r.user_email,
          r.note
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  function attachPanelHandlers() {
    document.getElementById('spShSearch')?.addEventListener('input', e => {
      window.__spShSearch = e.target.value || '';
      renderPanel();
      /* Восстановление фокуса и позиции курсора */
      const inp = document.getElementById('spShSearch');
      if (inp) {
        inp.focus();
        const end = inp.value.length;
        try { inp.setSelectionRange(end, end); } catch (err) {}
      }
    });

    document.getElementById('spShUserFilter')?.addEventListener('change', e => {
      window.__spShUser = e.target.value || '';
      renderPanel();
    });

    document.getElementById('spShPeriod')?.addEventListener('change', e => {
      window.__spShPeriod = e.target.value || '30d';
      renderPanel();
    });

    document.getElementById('spShExport')?.addEventListener('click', exportCsv);
  }

  function renderPanel() {
    const host = document.getElementById('spShiftsHost');
    if (!host) return;

    host.innerHTML = buildPanelHtml();
    attachPanelHandlers();
  }

  async function insertPanel() {
    /* Панель вставляется в режим «Смены» внутри Планирования.
       Признак режима: есть кнопка [data-sp-up-mode="shifts"] с is-active,
       или есть маркер window.__spShPanelMode === '1'. */

    const content = document.getElementById('content');
    if (!content) return;

    /* Уже вставлена? */
    if (document.getElementById(PANEL_ID)) return;

    /* Ищем переключатель режимов из unified-planner (после нашего апдейта) */
    const modes = content.querySelector('.sp-up-modes');
    if (!modes) return;

    const activeBtn = modes.querySelector('.sp-up-mode.is-active');
    if (!activeBtn) return;

    const isShifts =
      activeBtn.getAttribute('data-sp-up-mode') === 'shifts';

    if (!isShifts) {
      /* Не режим смен — панель не нужна */
      return;
    }

    /* Создаём контейнер под панель */
    const host = document.createElement('div');
    host.id = 'spShiftsHost';

    /* Вставляем после переключателя режимов */
    modes.insertAdjacentElement('afterend', host);

    await refreshList();
    console.log('[Shifts] Панель вставлена в режим «Смены»');
  }

  function removePanel() {
    const host = document.getElementById('spShiftsHost');
    if (host) host.remove();
  }

  /* ============== ЭКСПОРТ CSV ============== */

  function exportCsv() {
    const filtered = applyFilters(listShifts);

    if (!filtered.length) {
      toast('Нет данных для экспорта', 'error');
      return;
    }

    const header = ['Дата', 'Сотрудник', 'Приход', 'Уход', 'Длительность (мин)', 'Заметка'];

    const rows = filtered.map(r => [
      fmtDate(r.started_at),
      r.user_email || '',
      fmtTime(r.started_at),
      r.ended_at ? fmtTime(r.ended_at) : 'Идёт',
      r.duration_minutes != null ? r.duration_minutes : '',
      r.note || ''
    ]);

    const csv = [header, ...rows]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skladaplan-shifts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast(`Экспортировано смен: ${filtered.length}`);
  }

  /* ============== ТИКЕР ============== */

  function startTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      const el = document.getElementById('spShiftCounter');
      if (el && currentShift) {
        el.textContent = fmtDuration(durationSince(currentShift.started_at));
      }
    }, 30000); /* раз в 30 секунд */
  }

  /* ============== НАБЛЮДЕНИЕ ЗА #content ============== */

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(async () => {
      scheduled = false;
      try {
        const onDash = !!document.getElementById('spDashboardHeader');
        const onTasks = getAppState()?.currentPage === 'tasks';

        if (onDash) {
          await refresh();
          insertWidget();
        } else {
          removeWidget();
        }

        if (onTasks) {
          await insertPanel();
        } else {
          removePanel();
        }
      } catch (e) {
        console.warn('[Shifts] schedule error:', e);
      }
    });
  }

  function startObserver() {
    if (contentObserver) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }

    contentObserver = new MutationObserver(() => scheduleRender());
    contentObserver.observe(content, { childList: true, subtree: true });

    /* Дополнительно — следим за кликами по режимам */
    document.addEventListener('click', e => {
      if (e.target.closest('[data-sp-up-mode]')) {
        setTimeout(scheduleRender, 100);
      }
    }, true);

    scheduleRender();
    console.log('[Shifts] Наблюдение за #content запущено');
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();
    startTicker();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }

    setTimeout(startObserver, 500);
    setTimeout(startObserver, 2000);
    setTimeout(scheduleRender, 3000);
    setTimeout(scheduleRender, 6000);

    console.log('[Shifts] Модуль инициализирован');
  }

  init();

  window.spShifts = {
    start: startShift,
    stop: stopShift,
    refresh: refresh,
    getCurrent: () => currentShift,
    version: '1.0.0'
  };

})();
