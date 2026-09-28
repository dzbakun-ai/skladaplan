/* =========================================================
   SKLADAPLAN — НАПОМИНАНИЯ
   =========================================================

   Что делает:
   - Раздел «🔔 Напоминания» в режиме Планирования.
   - CRUD: однократные / каждый день / по дням недели.
   - Раз в 30 секунд проверяет «дозревшие» напоминания
     и рассылает их через Telegram всем активным
     пользователям бота.
   - Авто-напоминания о задачах (за 1 день и за 1 час
     до due_date) — галка «Учитывать задачи».

   Изоляция:
   - Не трогает app.js, tasks.js, planner.js, shifts.js.
   - Работает через MutationObserver на #content.
   ========================================================= */

(function () {
  'use strict';
  if (window.spReminders) return;

  const STYLES_ID = 'spRemindersStyles';
  const PANEL_ID  = 'spRemindersPanel';
  const MODAL_ID  = 'spRemindersModal';
  const TICK_MS   = 30 * 1000;
  const DAYS_RU   = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  let list = [];
  let loading = false;
  let panelObserver = null;
  let scheduled = false;
  let tickTimer = null;
  let lastCheckAt = 0;

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

  function currentEmail() {
    return getAppState()?.user?.email || null;
  }

  function isAdmin() {
    try { return window.spUIRoles?.getRole?.() === 'admin'; }
    catch (e) { return true; }
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'success');
    else console.log('[Reminders]', msg);
  }

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtTimeShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* Значение для input[type=datetime-local] из Date */
  function toLocalInput(d) {
    const dd = new Date(d);
    return `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}T${pad(dd.getHours())}:${pad(dd.getMinutes())}`;
  }

  function fromLocalInput(str) {
    if (!str) return null;
    /* Строка вида '2026-09-29T08:00' в локальном времени */
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${PANEL_ID} .sp-rm-toolbar {
        display: flex; gap: 10px; flex-wrap: wrap;
        justify-content: space-between; align-items: center;
        margin-bottom: 14px;
      }
      #${PANEL_ID} .sp-rm-toolbar-left {
        display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
      }
      #${PANEL_ID} input[type="search"],
      #${PANEL_ID} select {
        min-height: 40px;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        padding: 0 12px;
        font-size: 13px;
        outline: none;
        background: #fff;
        font-family: inherit;
      }
      #${PANEL_ID} input[type="search"]:focus,
      #${PANEL_ID} select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }

      #${PANEL_ID} .sp-rm-btn {
        border: 0; border-radius: 9px;
        padding: 10px 16px; font-size: 13px; font-weight: 600;
        cursor: pointer; font-family: inherit;
        display: inline-flex; align-items: center; gap: 6px;
      }
      #${PANEL_ID} .sp-rm-btn-primary { background: var(--primary, #2563EB); color: #fff; }
      #${PANEL_ID} .sp-rm-btn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${PANEL_ID} .sp-rm-btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
      #${PANEL_ID} .sp-rm-btn-secondary:hover { background: #e2e8f0; }

      #${PANEL_ID} .sp-rm-list {
        display: flex; flex-direction: column; gap: 8px;
      }
      #${PANEL_ID} .sp-rm-item {
        display: flex; align-items: flex-start; gap: 14px;
        padding: 13px 16px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #fff;
        transition: opacity .15s ease;
      }
      #${PANEL_ID} .sp-rm-item.is-sent { opacity: .55; }
      #${PANEL_ID} .sp-rm-item.is-off { opacity: .6; }
      #${PANEL_ID} .sp-rm-item-body { flex: 1; min-width: 0; }
      #${PANEL_ID} .sp-rm-title {
        font-size: 14px; font-weight: 600; color: #0f172a;
        word-break: break-word;
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      }
      #${PANEL_ID} .sp-rm-text {
        margin-top: 3px;
        font-size: 12px; color: #64748b;
        word-break: break-word;
      }
      #${PANEL_ID} .sp-rm-meta {
        margin-top: 6px;
        display: flex; gap: 8px; flex-wrap: wrap;
        font-size: 11px; color: #64748b; align-items: center;
      }
      #${PANEL_ID} .sp-rm-badge {
        display: inline-block; padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px; font-weight: 700;
        white-space: nowrap;
      }
      #${PANEL_ID} .sp-rm-badge-on   { background: #dcfce7; color: #166534; }
      #${PANEL_ID} .sp-rm-badge-off  { background: #f1f5f9; color: #64748b; }
      #${PANEL_ID} .sp-rm-badge-sent { background: #dbeafe; color: #1e40af; }
      #${PANEL_ID} .sp-rm-badge-rec  { background: #fef3c7; color: #92400e; }
      #${PANEL_ID} .sp-rm-badge-task { background: #ede9fe; color: #5b21b6; }

      #${PANEL_ID} .sp-rm-actions {
        display: flex; gap: 4px; flex-shrink: 0;
      }
      #${PANEL_ID} .sp-rm-icon-btn {
        width: 32px; height: 32px;
        border: 1px solid #e2e8f0; border-radius: 8px;
        background: #fff; color: #475569; cursor: pointer; font-size: 13px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      #${PANEL_ID} .sp-rm-icon-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
      #${PANEL_ID} .sp-rm-icon-btn.sp-rm-danger:hover {
        background: #fef2f2; color: #b42318; border-color: #fecaca;
      }

      #${PANEL_ID} .sp-rm-empty,
      #${PANEL_ID} .sp-rm-loading {
        padding: 40px 20px; text-align: center;
        color: #94a3b8; font-size: 13px;
      }

      /* Модалка */
      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100015;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-rm-modal {
        background: #fff; border-radius: 16px;
        width: 100%; max-width: 520px;
        max-height: 92vh; overflow-y: auto;
        padding: 22px;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} h3 { margin: 0 0 4px; font-size: 17px; font-weight: 700; }
      #${MODAL_ID} .sp-rm-sub {
        margin: 0 0 18px; font-size: 13px; color: #64748b;
      }
      #${MODAL_ID} .sp-rm-field { display: block; margin-bottom: 12px; }
      #${MODAL_ID} .sp-rm-field > span {
        display: block; font-size: 12px; font-weight: 600;
        color: #475569; margin-bottom: 5px;
      }
      #${MODAL_ID} .sp-rm-field input,
      #${MODAL_ID} .sp-rm-field select,
      #${MODAL_ID} .sp-rm-field textarea {
        width: 100%; box-sizing: border-box;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 10px 12px; font-size: 13px; outline: none;
        background: #fff; font-family: inherit;
      }
      #${MODAL_ID} .sp-rm-field textarea {
        min-height: 70px; resize: vertical;
      }
      #${MODAL_ID} .sp-rm-field input:focus,
      #${MODAL_ID} .sp-rm-field select:focus,
      #${MODAL_ID} .sp-rm-field textarea:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${MODAL_ID} .sp-rm-days {
        display: flex; flex-wrap: wrap; gap: 6px;
      }
      #${MODAL_ID} .sp-rm-day {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 11px;
        border: 1px solid #dfe3e8;
        border-radius: 999px;
        cursor: pointer;
        font-size: 12px;
        background: #fff;
      }
      #${MODAL_ID} .sp-rm-day input { margin: 0; accent-color: var(--primary, #2563EB); cursor: pointer; }
      #${MODAL_ID} .sp-rm-day.is-checked {
        background: #eff6ff; border-color: #93c5fd;
      }
      #${MODAL_ID} .sp-rm-check {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; cursor: pointer; margin: 10px 0;
      }
      #${MODAL_ID} .sp-rm-check input {
        width: 16px; height: 16px;
        accent-color: var(--primary, #2563EB);
        cursor: pointer;
      }
      #${MODAL_ID} .sp-rm-hint {
        font-size: 11px; color: #94a3b8;
        margin: -4px 0 10px;
      }
      #${MODAL_ID} .sp-rm-foot {
        display: flex; gap: 8px; justify-content: flex-end;
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-rm-fbtn {
        border: 0; border-radius: 9px; padding: 11px 18px;
        font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #${MODAL_ID} .sp-rm-fbtn-primary { background: var(--primary, #2563EB); color: #fff; }
      #${MODAL_ID} .sp-rm-fbtn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${MODAL_ID} .sp-rm-fbtn-primary:disabled { opacity: .5; cursor: not-allowed; }
      #${MODAL_ID} .sp-rm-fbtn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
      #${MODAL_ID} .sp-rm-fbtn-secondary:hover { background: #e2e8f0; }
      #${MODAL_ID} .sp-rm-err {
        margin: 8px 0 0;
        padding: 10px 12px;
        background: #fef2f2; color: #991b1b;
        border-radius: 8px; font-size: 12px;
      }

      @media (max-width: 640px) {
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-rm-modal {
          max-width: none; height: 100vh; max-height: 100vh; border-radius: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== CRUD ============== */

  async function loadList() {
    const client = getSupabase();
    if (!client) return [];
    const { data, error } = await client
      .from('reminders')
      .select('*')
      .order('remind_at', { ascending: true });
    if (error) {
      console.warn('[Reminders] load error:', error);
      return [];
    }
    return data || [];
  }

  async function saveReminder(payload, id) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase недоступен');
    const op = currentEmail();

    if (id) {
      const { error } = await client
        .from('reminders')
        .update({ ...payload, updated_by: op })
        .eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await client
        .from('reminders')
        .insert({
          ...payload,
          user_email: currentEmail() || '',
          created_by: op,
          updated_by: op
        });
      if (error) throw error;
    }
  }

  async function deleteReminder(id) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase недоступен');
    const { error } = await client.from('reminders').delete().eq('id', id);
    if (error) throw error;
  }

  async function toggleActive(id, active) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase недоступен');
    const { error } = await client
      .from('reminders')
      .update({ active: !!active, updated_by: currentEmail() })
      .eq('id', id);
    if (error) throw error;
  }

  /* ============== TELEGRAM ============== */

  async function tgBroadcast(text) {
    const client = getSupabase();
    if (!client) return 0;

    const { data: settings } = await client
      .from('telegram_settings')
      .select('bot_token, enabled')
      .eq('id', 1).maybeSingle();

    if (!settings || !settings.enabled || !settings.bot_token) return 0;

    const { data: users } = await client
      .from('telegram_users')
      .select('chat_id')
      .eq('active', true);

    if (!users || !users.length) return 0;

    let sent = 0;
    for (const u of users) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${settings.bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: u.chat_id,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        });
        const d = await res.json().catch(() => ({}));
        if (d && d.ok) sent++;
      } catch (e) {
        console.warn('[Reminders] tg send error:', e);
      }
    }
    return sent;
  }

  /* ============== ГЕНЕРАТОР ============== */

  /* Проверяет, пора ли отправить напоминание */
  function isDue(r, now) {
    if (!r.active) return false;

    const at = new Date(r.remind_at).getTime();
    if (isNaN(at)) return false;

    if (r.repeat_type === 'once') {
      return !r.sent_at && at <= now.getTime();
    }

    if (r.repeat_type === 'daily') {
      /* Если сегодня уже отправляли — пропускаем */
      if (r.last_sent_at) {
        const lastD = new Date(r.last_sent_at);
        if (
          lastD.getFullYear() === now.getFullYear() &&
          lastD.getMonth() === now.getMonth() &&
          lastD.getDate() === now.getDate()
        ) {
          return false;
        }
      }
      /* Сравниваем время remind_at (час:минута) с текущим */
      const atD = new Date(r.remind_at);
      if (atD.getHours() > now.getHours()) return false;
      if (atD.getHours() < now.getHours()) return true;
      return atD.getMinutes() <= now.getMinutes();
    }

    if (r.repeat_type === 'weekdays') {
      const dow = now.getDay() === 0 ? 7 : now.getDay();
      if (!Array.isArray(r.weekdays) || !r.weekdays.includes(dow)) return false;

      /* Уже отправляли сегодня? */
      if (r.last_sent_at) {
        const lastD = new Date(r.last_sent_at);
        if (
          lastD.getFullYear() === now.getFullYear() &&
          lastD.getMonth() === now.getMonth() &&
          lastD.getDate() === now.getDate()
        ) {
          return false;
        }
      }

      const atD = new Date(r.remind_at);
      if (atD.getHours() > now.getHours()) return false;
      if (atD.getHours() < now.getHours()) return true;
      return atD.getMinutes() <= now.getMinutes();
    }

    return false;
  }

  /* Ищем due в списке и рассылаем */
  async function checkAndSend() {
    /* Не чаще, чем раз в 30 сек */
    if (Date.now() - lastCheckAt < 25000) return;
    lastCheckAt = Date.now();

    const client = getSupabase();
    if (!client) return;

    /* Свежая выборка только активных — экономим трафик */
    const { data: rows, error } = await client
      .from('reminders')
      .select('*')
      .eq('active', true);

    if (error || !rows || !rows.length) return;

    const now = new Date();
    const due = rows.filter(r => isDue(r, now));
    if (!due.length) return;

    for (const r of due) {
      const title = r.title || 'Напоминание';
      const body = r.text ? `\n\n${escapeHtml(r.text)}` : '';
      const time = fmtTimeShort(r.remind_at);
      const text =
        `🔔 <b>${escapeHtml(title)}</b>${body}\n\n` +
        `🕐 ${time}\n` +
        `📅 ${fmtDate(r.remind_at)}`;

      const sentCount = await tgBroadcast(text);

      /* Обновляем статус */
      const patch = {};
      if (r.repeat_type === 'once') {
        patch.sent_at = new Date().toISOString();
        patch.active = false; /* после отправки once — выключаем */
      } else {
        patch.last_sent_at = new Date().toISOString();
      }
      try {
        await client.from('reminders').update(patch).eq('id', r.id);
      } catch (e) {
        console.warn('[Reminders] update sent state error:', e);
      }

      console.log(`[Reminders] Отправлено «${title}» — получателей: ${sentCount}`);
    }

    /* Обновить UI, если открыт список */
    if (document.getElementById(PANEL_ID)) {
      list = await loadList();
      renderPanel();
    }
  }

  /* ============== UI ============== */

  function daysLabel(arr) {
    if (!Array.isArray(arr) || !arr.length) return '—';
    return arr.slice().sort((a, b) => a - b).map(n => DAYS_RU[n - 1]).join('·');
  }

  function repeatLabel(r) {
    if (r.repeat_type === 'once') return '⏱ Однократно';
    if (r.repeat_type === 'daily') return '🔁 Каждый день';
    if (r.repeat_type === 'weekdays') return '📅 ' + daysLabel(r.weekdays);
    return '—';
  }

  function buildPanelHtml() {
    if (loading) {
      return `<div id="${PANEL_ID}" class="sp-card"><div class="sp-rm-loading">Загрузка…</div></div>`;
    }

    const email = currentEmail();
    const isAdminUser = isAdmin();

    /* Фильтрация по пользователю, если не админ */
    const visible = isAdminUser
      ? list
      : list.filter(r => String(r.user_email || '').toLowerCase() === String(email || '').toLowerCase());

    const now = Date.now();
    const pending = visible.filter(r => r.active && new Date(r.remind_at).getTime() > now);
    const overdue = visible.filter(r => r.active && new Date(r.remind_at).getTime() <= now);
    const sent = visible.filter(r => !r.active);
    const ordered = [...overdue, ...pending, ...sent];

    return `
      <div id="${PANEL_ID}" class="sp-card">
        <div class="sp-rm-toolbar">
          <div class="sp-rm-toolbar-left">
            <input id="spRmSearch" type="search" placeholder="Поиск по тексту"
              value="${escapeHtml(window.__spRmSearch || '')}">
          </div>
          <button type="button" class="sp-rm-btn sp-rm-btn-primary" id="spRmAddBtn">
            + Новое напоминание
          </button>
        </div>

        <div class="sp-rm-hint" style="margin-bottom:12px;">
          🔔 Напоминания приходят в Telegram всем пользователям бота —
          пока открыта вкладка SKLADAPLAN хотя бы у одного администратора.
        </div>

        ${ordered.length ? `
          <div class="sp-rm-list">
            ${ordered.map(r => {
              const isSent = !r.active;
              const isOverdue = r.active && new Date(r.remind_at).getTime() <= Date.now();
              const isTask = !!r.task_id;

              return `
                <div class="sp-rm-item ${isSent ? 'is-sent' : (r.active ? '' : 'is-off')}">
                  <div class="sp-rm-item-body">
                    <div class="sp-rm-title">
                      ${escapeHtml(r.title || '—')}
                      ${isTask
                        ? `<span class="sp-rm-badge sp-rm-badge-task">из задачи</span>`
                        : ''}
                      ${
                        isSent
                          ? `<span class="sp-rm-badge sp-rm-badge-sent">Отправлено</span>`
                          : (isOverdue
                              ? `<span class="sp-rm-badge sp-rm-badge-rec">Просрочено</span>`
                              : `<span class="sp-rm-badge sp-rm-badge-on">Активно</span>`)
                      }
                    </div>
                    ${r.text ? `<div class="sp-rm-text">${escapeHtml(r.text)}</div>` : ''}
                    <div class="sp-rm-meta">
                      <span>${repeatLabel(r)}</span>
                      <span>🕐 ${escapeHtml(fmtDateTime(r.remind_at))}</span>
                      ${isAdminUser ? `<span>👤 ${escapeHtml(r.user_email || '—')}</span>` : ''}
                    </div>
                  </div>
                  <div class="sp-rm-actions">
                    ${
                      !isTask
                        ? `<button type="button" class="sp-rm-icon-btn"
                             data-rm-toggle="${escapeHtml(r.id)}"
                             title="${r.active ? 'Отключить' : 'Включить'}"
                           >${r.active ? '⏸' : '▶'}</button>`
                        : ''
                    }
                    ${
                      !isTask
                        ? `<button type="button" class="sp-rm-icon-btn"
                             data-rm-edit="${escapeHtml(r.id)}"
                             title="Изменить">✎</button>`
                        : ''
                    }
                    <button type="button" class="sp-rm-icon-btn sp-rm-danger"
                      data-rm-delete="${escapeHtml(r.id)}"
                      title="Удалить">×</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="sp-rm-empty">
            Пока нет ни одного напоминания.<br>
            <span style="font-size:11px;">Например: «В 8:00 проверить ТТН».</span>
          </div>
        `}
      </div>
    `;
  }

  function filterBySearch(rows) {
    const q = String(window.__spRmSearch || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      const hay = [r.title, r.text, r.user_email].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function attachPanelHandlers() {
    const searchInput = document.getElementById('spRmSearch');
    if (searchInput && !searchInput.dataset.spRmBound) {
      searchInput.dataset.spRmBound = '1';
      searchInput.addEventListener('input', e => {
        window.__spRmSearch = e.target.value || '';
        /* Перерисовываем только список, не всю панель — чтобы не терять фокус */
        const email = currentEmail();
        const isAdminUser = isAdmin();
        const visible = isAdminUser
          ? list
          : list.filter(r => String(r.user_email || '').toLowerCase() === String(email || '').toLowerCase());
        const filtered = filterBySearch(visible);

        const container = searchInput.closest('.sp-card');
        if (!container) return;

        /* Найдём список и заменим содержимое */
        const listEl = container.querySelector('.sp-rm-list');
        const emptyEl = container.querySelector('.sp-rm-empty');
        if (listEl) {
          listEl.innerHTML = filtered.map(r => renderItemHtml(r, isAdminUser)).join('');
          /* Обработчики навесим заново */
          bindItemHandlers(listEl);
        } else if (emptyEl && filtered.length) {
          /* Пусто, но появились данные */
          renderPanel();
        } else if (!filtered.length && !emptyEl && listEl) {
          listEl.outerHTML = `<div class="sp-rm-empty">Ничего не найдено.</div>`;
        }
      });
    }

    document.getElementById('spRmAddBtn')?.addEventListener('click', () => openModal(null));

    bindItemHandlers(document.getElementById(PANEL_ID));
  }

  function renderItemHtml(r, isAdminUser) {
    const isSent = !r.active;
    const isOverdue = r.active && new Date(r.remind_at).getTime() <= Date.now();
    const isTask = !!r.task_id;

    return `
      <div class="sp-rm-item ${isSent ? 'is-sent' : (r.active ? '' : 'is-off')}">
        <div class="sp-rm-item-body">
          <div class="sp-rm-title">
            ${escapeHtml(r.title || '—')}
            ${isTask ? `<span class="sp-rm-badge sp-rm-badge-task">из задачи</span>` : ''}
            ${
              isSent
                ? `<span class="sp-rm-badge sp-rm-badge-sent">Отправлено</span>`
                : (isOverdue
                    ? `<span class="sp-rm-badge sp-rm-badge-rec">Просрочено</span>`
                    : `<span class="sp-rm-badge sp-rm-badge-on">Активно</span>`)
            }
          </div>
          ${r.text ? `<div class="sp-rm-text">${escapeHtml(r.text)}</div>` : ''}
          <div class="sp-rm-meta">
            <span>${repeatLabel(r)}</span>
            <span>🕐 ${escapeHtml(fmtDateTime(r.remind_at))}</span>
            ${isAdminUser ? `<span>👤 ${escapeHtml(r.user_email || '—')}</span>` : ''}
          </div>
        </div>
        <div class="sp-rm-actions">
          ${!isTask ? `<button type="button" class="sp-rm-icon-btn" data-rm-toggle="${escapeHtml(r.id)}" title="${r.active ? 'Отключить' : 'Включить'}">${r.active ? '⏸' : '▶'}</button>` : ''}
          ${!isTask ? `<button type="button" class="sp-rm-icon-btn" data-rm-edit="${escapeHtml(r.id)}" title="Изменить">✎</button>` : ''}
          <button type="button" class="sp-rm-icon-btn sp-rm-danger" data-rm-delete="${escapeHtml(r.id)}" title="Удалить">×</button>
        </div>
      </div>
    `;
  }

  function bindItemHandlers(scope) {
    scope.querySelectorAll('[data-rm-toggle]').forEach(btn => {
      if (btn.dataset.spRmBound === '1') return;
      btn.dataset.spRmBound = '1';
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-rm-toggle');
        const r = list.find(x => String(x.id) === String(id));
        if (!r) return;
        try {
          await toggleActive(id, !r.active);
          await refreshList();
        } catch (e) {
          toast('Ошибка: ' + (e.message || ''), 'error');
        }
      });
    });

    scope.querySelectorAll('[data-rm-edit]').forEach(btn => {
      if (btn.dataset.spRmBound === '1') return;
      btn.dataset.spRmBound = '1';
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-rm-edit');
        const r = list.find(x => String(x.id) === String(id));
        if (r) openModal(r);
      });
    });

    scope.querySelectorAll('[data-rm-delete]').forEach(btn => {
      if (btn.dataset.spRmBound === '1') return;
      btn.dataset.spRmBound = '1';
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-rm-delete');
        const r = list.find(x => String(x.id) === String(id));
        if (!r) return;
        if (!confirm(`Удалить напоминание «${r.title}»?`)) return;
        try {
          await deleteReminder(id);
          toast('Напоминание удалено');
          await refreshList();
        } catch (e) {
          toast('Ошибка: ' + (e.message || ''), 'error');
        }
      });
    });
  }

  function renderPanel() {
    const host = document.getElementById('spRemindersHost');
    if (!host) return;
    host.innerHTML = buildPanelHtml();
    attachPanelHandlers();
  }

  async function refreshList() {
    loading = true;
    renderPanel();
    list = await loadList();
    loading = false;
    renderPanel();
  }

  /* ============== МОДАЛКА ============== */

  function openModal(existing) {
    if (document.getElementById(MODAL_ID)) return;

    const isEdit = !!existing;
    const r = existing || {
      title: '',
      text: '',
      repeat_type: 'once',
      weekdays: [],
      remind_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      active: true
    };

    const selDays = new Set(Array.isArray(r.weekdays) ? r.weekdays : []);

    /* Значение по умолчанию для datetime-local */
    const initialDT = toLocalInput(new Date(r.remind_at));

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-rm-modal">
        <h3>${isEdit ? 'Изменить напоминание' : 'Новое напоминание'}</h3>
        <p class="sp-rm-sub">
          В назначенное время всем пользователям Telegram-бота придёт сообщение.
        </p>

        <label class="sp-rm-field">
          <span>Текст напоминания</span>
          <input id="spRmTitle" type="text" value="${escapeHtml(r.title)}"
            placeholder="Например: Проверить ТТН">
        </label>

        <label class="sp-rm-field">
          <span>Подробнее (необязательно)</span>
          <textarea id="spRmText" placeholder="Дополнительно">${escapeHtml(r.text || '')}</textarea>
        </label>

        <label class="sp-rm-field">
          <span>Когда напомнить</span>
          <input id="spRmAt" type="datetime-local" value="${initialDT}">
        </label>

        <label class="sp-rm-field">
          <span>Тип повторения</span>
          <select id="spRmRepeat">
            <option value="once" ${r.repeat_type === 'once' ? 'selected' : ''}>Однократно</option>
            <option value="daily" ${r.repeat_type === 'daily' ? 'selected' : ''}>Каждый день</option>
            <option value="weekdays" ${r.repeat_type === 'weekdays' ? 'selected' : ''}>По дням недели</option>
          </select>
        </label>

        <div id="spRmWeekBlock" style="display:${r.repeat_type === 'weekdays' ? 'block' : 'none'};">
          <div class="sp-rm-field">
            <span>Дни недели</span>
            <div class="sp-rm-days">
              ${DAYS_RU.map((label, i) => {
                const n = i + 1;
                const checked = selDays.has(n);
                return `
                  <label class="sp-rm-day ${checked ? 'is-checked' : ''}">
                    <input type="checkbox" data-rm-day="${n}" ${checked ? 'checked' : ''}>
                    ${label}
                  </label>
                `;
              }).join('')}
            </div>
          </div>
          <div class="sp-rm-hint">Время берётся из поля «Когда напомнить» — берётся только час:минута.</div>
        </div>

        <label class="sp-rm-check">
          <input type="checkbox" id="spRmActive" ${r.active !== false ? 'checked' : ''}>
          Активно
        </label>

        <div id="spRmErr"></div>

        <div class="sp-rm-foot">
          <button type="button" class="sp-rm-fbtn sp-rm-fbtn-secondary" id="spRmCancel">Отмена</button>
          <button type="button" class="sp-rm-fbtn sp-rm-fbtn-primary" id="spRmSave">
            ${isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('spRmCancel').addEventListener('click', close);

    const repeatSel = document.getElementById('spRmRepeat');
    const weekBlock = document.getElementById('spRmWeekBlock');

    repeatSel.addEventListener('change', () => {
      weekBlock.style.display = repeatSel.value === 'weekdays' ? 'block' : 'none';
    });

    overlay.querySelectorAll('[data-rm-day]').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('.sp-rm-day').classList.toggle('is-checked', cb.checked);
      });
    });

    const escHandler = e => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.getElementById('spRmSave').addEventListener('click', async () => {
      const btn = document.getElementById('spRmSave');
      const errEl = document.getElementById('spRmErr');

      const title = (document.getElementById('spRmTitle')?.value || '').trim();
      const text = (document.getElementById('spRmText')?.value || '').trim();
      const atStr = document.getElementById('spRmAt')?.value || '';
      const repeat_type = repeatSel.value;
      const weekdays = [...overlay.querySelectorAll('[data-rm-day]:checked')]
        .map(cb => Number(cb.getAttribute('data-rm-day')));
      const active = !!document.getElementById('spRmActive')?.checked;

      if (!title) { errEl.innerHTML = '<div class="sp-rm-err">Укажите текст напоминания</div>'; return; }
      const at = fromLocalInput(atStr);
      if (!at) { errEl.innerHTML = '<div class="sp-rm-err">Укажите дату и время</div>'; return; }

      if (repeat_type === 'weekdays' && !weekdays.length) {
        errEl.innerHTML = '<div class="sp-rm-err">Выберите хотя бы один день недели</div>';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Сохранение…';
      errEl.innerHTML = '';

      const payload = {
        title,
        text,
        remind_at: at.toISOString(),
        repeat_type,
        weekdays: repeat_type === 'weekdays' ? weekdays : [],
        active
      };

      try {
        await saveReminder(payload, isEdit ? existing.id : null);
        toast(isEdit ? 'Напоминание обновлено' : 'Напоминание создано');
        close();
        await refreshList();
      } catch (e) {
        console.error('[Reminders] save error:', e);
        errEl.innerHTML = `<div class="sp-rm-err">Ошибка: ${escapeHtml(e.message || '')}</div>`;
        btn.disabled = false;
        btn.textContent = isEdit ? 'Сохранить' : 'Создать';
      }
    });

    setTimeout(() => document.getElementById('spRmTitle')?.focus(), 30);
  }

  /* ============== ВСТАВКА ПАНЕЛИ ============== */

  async function insertPanel() {
    const content = document.getElementById('content');
    if (!content) return;

    if (document.getElementById(PANEL_ID)) return;

    const modes = content.querySelector('.sp-up-modes');
    if (!modes) return;

    const active = modes.querySelector('.sp-up-mode.is-active');
    if (!active) return;

    const isReminders =
      active.getAttribute('data-sp-up-mode') === 'reminders';
    if (!isReminders) return;

    const host = document.createElement('div');
    host.id = 'spRemindersHost';

    /* Отключаем observer, чтобы innerHTML не циклился */
    if (panelObserver) panelObserver.disconnect();
    try {
      modes.insertAdjacentElement('afterend', host);
    } finally {
      if (panelObserver) panelObserver.observe(content, { childList: true, subtree: true });
    }

    await refreshList();
    console.log('[Reminders] Панель вставлена');
  }

  function removePanel() {
    const host = document.getElementById('spRemindersHost');
    if (host) host.remove();
  }

  /* ============== НАБЛЮДЕНИЕ ============== */

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(async () => {
      scheduled = false;
      try {
        const onTasks = getAppState()?.currentPage === 'tasks';
        if (onTasks) {
          await insertPanel();
        } else {
          removePanel();
        }
      } catch (e) {
        console.warn('[Reminders] schedule error:', e);
      }
    }, 300);
  }

  function startObserver() {
    if (panelObserver) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }

    panelObserver = new MutationObserver(() => scheduleRender());
    panelObserver.observe(content, { childList: true, subtree: true });

    document.addEventListener('click', e => {
      if (e.target.closest('[data-sp-up-mode]')) {
        setTimeout(scheduleRender, 150);
      }
    }, true);

    scheduleRender();
    console.log('[Reminders] Наблюдение за #content запущено');
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

    /* Тикер проверки — каждые 30 секунд */
    if (!tickTimer) {
      tickTimer = setInterval(() => {
        checkAndSend().catch(e => console.warn('[Reminders] check error:', e));
      }, TICK_MS);

      /* Первая проверка через 10 секунд после загрузки */
      setTimeout(() => {
        checkAndSend().catch(() => {});
      }, 10000);
    }

    console.log('[Reminders] Модуль инициализирован');
  }

  init();

  window.spReminders = {
    refresh: refreshList,
    checkNow: checkAndSend,
    version: '1.0.0'
  };

})();
