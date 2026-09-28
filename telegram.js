/* =========================================================
   SKLADAPLAN — TELEGRAM-БОТ (полная версия, v3.1)
   =========================================================

   Возможности:
   - Уведомления о событиях склада — всем активным
     пользователям бота.
   - Утренняя сводка — всем активным пользователям.
   - Команды и callback через webhook (мгновенный отклик).
   - Управление пользователями бота прямо из карточки.

   Изоляция:
   - Не трогает app.js и другие модули.
   - Читает state, plannerState, tasksState (если они есть).
   ========================================================= */

(function () {
  'use strict';

  const CARD_ID    = 'spTelegramCard';
  const STYLES_ID  = 'spTelegramStyles';
  const API_BASE   = 'https://api.telegram.org';

  const POLL_INTERVAL_MS = 25000;
  const MAX_EVENTS_PER_TICK = 5;

  let settings = null;
  let loading = false;
  let pollTimer = null;
  let polling = false;

  /* Кэш списка активных получателей — перезагружаем при сохранении настроек */
  let recipientsCache = null;

  /* =========================================================
     СТИЛИ
     ========================================================= */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${CARD_ID} h3 { margin: 0 0 4px; font-size: 16px; font-weight: 700; color: #0f172a; }
      #${CARD_ID} .sp-tg-sub { margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.4; }
      #${CARD_ID} .sp-tg-status {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 12px; border-radius: 999px;
        font-size: 12px; font-weight: 600; margin-bottom: 16px;
      }
      #${CARD_ID} .sp-tg-status.on  { background: #dcfce7; color: #166534; }
      #${CARD_ID} .sp-tg-status.off { background: #f1f5f9; color: #64748b; }
      #${CARD_ID} .sp-tg-status .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
      #${CARD_ID} .sp-tg-status .dot.pulse { animation: spTgPulse 2s ease infinite; }
      @keyframes spTgPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .35; }
      }

      #${CARD_ID} .sp-tg-field { display: block; margin-bottom: 12px; }
      #${CARD_ID} .sp-tg-field span {
        display: block; font-size: 12px; font-weight: 600;
        color: #475569; margin-bottom: 5px;
      }
      #${CARD_ID} .sp-tg-field input,
      #${CARD_ID} .sp-tg-field select {
        width: 100%; box-sizing: border-box;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 10px 12px; font-size: 13px; outline: none; background: #fff;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
      #${CARD_ID} .sp-tg-field input:focus,
      #${CARD_ID} .sp-tg-field select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${CARD_ID} .sp-tg-field select { font-family: inherit; }

      #${CARD_ID} .sp-tg-checks {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px;
        margin: 14px 0; padding: 12px 14px;
        background: #f8fafc; border-radius: 10px;
      }
      #${CARD_ID} .sp-tg-check {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; cursor: pointer;
      }
      #${CARD_ID} .sp-tg-check input {
        width: 16px; height: 16px; accent-color: var(--primary, #2563EB); cursor: pointer;
      }

      #${CARD_ID} .sp-tg-actions {
        display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px;
      }
      #${CARD_ID} .sp-tg-btn {
        border: 0; border-radius: 9px; padding: 10px 16px;
        font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #${CARD_ID} .sp-tg-btn-primary { background: var(--primary, #2563EB); color: #fff; }
      #${CARD_ID} .sp-tg-btn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${CARD_ID} .sp-tg-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
      #${CARD_ID} .sp-tg-btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
      #${CARD_ID} .sp-tg-btn-secondary:hover { background: #e2e8f0; }

      #${CARD_ID} .sp-tg-help {
        margin-top: 14px; padding: 12px 14px;
        background: #eff6ff; border-radius: 10px;
        font-size: 12px; color: #1e40af; line-height: 1.6;
      }
      #${CARD_ID} .sp-tg-help b { color: #0c2d6b; }
      #${CARD_ID} .sp-tg-help code {
        background: #dbeafe; padding: 1px 5px; border-radius: 3px;
        font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px;
      }
      #${CARD_ID} .sp-tg-commands {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 4px 12px;
        margin-top: 8px;
        font-size: 12px;
      }
      #${CARD_ID} .sp-tg-commands code { font-weight: 700; }
      #${CARD_ID} .sp-tg-loading { padding: 20px; text-align: center; color: #64748b; font-size: 13px; }

      #${CARD_ID} .sp-tg-users-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        overflow: hidden;
        font-size: 12px;
      }
      #${CARD_ID} .sp-tg-users-table th {
        background: #f1f5f9;
        text-align: left;
        padding: 8px 10px;
        font-size: 10px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: .04em;
        border-bottom: 1px solid #e2e8f0;
      }
      #${CARD_ID} .sp-tg-users-table td {
        padding: 9px 10px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
      }
      #${CARD_ID} .sp-tg-users-table tr:last-child td { border-bottom: 0; }
      #${CARD_ID} .sp-tg-user-chat {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 11px;
        color: #1e40af;
      }
      #${CARD_ID} .sp-tg-role {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        white-space: nowrap;
      }
      #${CARD_ID} .sp-tg-role-admin  { background: #dcfce7; color: #166534; }
      #${CARD_ID} .sp-tg-role-picker { background: #dbeafe; color: #1e40af; }
      #${CARD_ID} .sp-tg-role-viewer { background: #f1f5f9; color: #475569; }
      #${CARD_ID} .sp-tg-icon-btn {
        width: 28px; height: 28px;
        border: 1px solid #e2e8f0;
        border-radius: 7px;
        background: #fff;
        color: #475569;
        cursor: pointer;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 2px;
      }
      #${CARD_ID} .sp-tg-icon-btn:hover {
        background: #f8fafc;
        border-color: #cbd5e1;
      }
      #${CARD_ID} .sp-tg-icon-btn.sp-tg-danger:hover {
        background: #fef2f2;
        color: #b42318;
        border-color: #fecaca;
      }

      @media (max-width: 640px) {
        #${CARD_ID} .sp-tg-checks { grid-template-columns: 1fr; }
        #${CARD_ID} .sp-tg-actions { flex-direction: column; }
        #${CARD_ID} .sp-tg-btn { width: 100%; }
        #${CARD_ID} .sp-tg-commands { grid-template-columns: 1fr; gap: 8px 0; }
      }
    `;
    document.head.appendChild(style);
  }

  /* =========================================================
     УТИЛИТЫ
     ========================================================= */

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeTelegram(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getSupabase() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'success');
    else console.log('[Telegram]', msg);
  }

  function todayKey() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* =========================================================
     ЗАГРУЗКА НАСТРОЕК
     ========================================================= */

  async function loadSettings() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');

    const { data, error } = await client
      .from('telegram_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    return data || {
      bot_token: '', chat_id: '', enabled: false,
      notify_tasks: true, notify_planner: true,
      notify_optimization: true, notify_verification: true, notify_inventory: true,
      accept_commands: true,
      digest_enabled: true, digest_time: '08:00', last_digest_date: null
    };
  }

  async function saveSettings(patch) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');

    const { error } = await client
      .from('telegram_settings')
      .update(patch)
      .eq('id', 1);

    if (error) throw error;
  }

  /* =========================================================
     ПОЛУЧАТЕЛИ — активные пользователи бота
     ========================================================= */

  async function loadRecipients() {
    if (recipientsCache) return recipientsCache;

    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('telegram_users')
      .select('chat_id, display_name, active')
      .eq('active', true);

    if (error) {
      console.warn('[Telegram] loadRecipients error:', error);
      return [];
    }

    recipientsCache = (data || []).map(u => String(u.chat_id));
    return recipientsCache;
  }

  function invalidateRecipientsCache() {
    recipientsCache = null;
  }

  /* =========================================================
     ОТПРАВКА
     ========================================================= */

  async function sendMessage(botToken, chatId, text, options) {
    const url = `${API_BASE}/bot${botToken}/sendMessage`;

    const body = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    if (options && options.reply_markup) {
      body.reply_markup = options.reply_markup;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.description || response.statusText || 'Ошибка Telegram');
    }
    return result.result;
  }

  /* Отправить всем активным пользователям бота.
     Если получателей нет — fallback на settings.chat_id. */
  async function sendToAll(text, options) {
    const recipients = await loadRecipients();
    const list = recipients.length
      ? recipients
      : (settings.chat_id ? [String(settings.chat_id)] : []);

    if (!list.length) return;

    for (const chatId of list) {
      try {
        await sendMessage(settings.bot_token, chatId, text, options);
      } catch (e) {
        /* Не ломаем остальных из-за одного отвалившегося чата */
        console.warn(`[Telegram] send to ${chatId} error:`, e.message);
      }
    }
  }

  async function logSend(eventType, message, success, error) {
    const client = getSupabase();
    if (!client) return;

    try {
      await client.from('telegram_log').insert({
        event_type: eventType,
        message: String(message).slice(0, 500),
        success: !!success,
        error: error ? String(error).slice(0, 500) : null,
        operator_email: window.state?.user?.email || null
      });
    } catch (e) {
      console.warn('[Telegram] log error:', e);
    }
  }

  /* =========================================================
     УВЕДОМЛЕНИЯ О СОБЫТИЯХ
     ========================================================= */

  function buildMessage(row) {
    const t = row.table_name;
    const a = row.action;
    const n = row.new_data || {};
    const o = row.old_data || {};
    const changed = Array.isArray(row.changed_fields) ? row.changed_fields : [];

    if (t === 'tasks' && a === 'INSERT') {
      return {
        type: 'task_created',
        text:
          '📝 <b>Новая задача</b>\n\n' +
          `<b>${escapeTelegram(n.title || '—')}</b>\n` +
          (n.description ? `${escapeTelegram(n.description)}\n` : '') +
          (n.due_date ? `📅 ${escapeTelegram(n.due_date)}\n` : '') +
          (n.priority ? `⚡ ${escapeTelegram(n.priority)}\n` : '') +
          (n.assigned_to ? `🎯 Кому: <b>${escapeTelegram(n.assigned_to)}</b>\n` : '') +
          `👤 ${escapeTelegram(row.operator_email || '—')}`
      };
    }

    if (t === 'tasks' && a === 'UPDATE' && changed.includes('completed')) {
      const done = n.completed === true;
      return {
        type: 'task_completed',
        text:
          (done ? '✅ <b>Задача выполнена</b>\n\n' : '↩️ <b>Задача возвращена в работу</b>\n\n') +
          `<b>${escapeTelegram(n.title || '—')}</b>\n` +
          `👤 ${escapeTelegram(row.operator_email || '—')}`
      };
    }

    if (t === 'planner_tasks' && a === 'INSERT') {
      return {
        type: 'planner_task_created',
        text:
          '📅 <b>Задача планировщика</b>\n\n' +
          `<b>${escapeTelegram(n.title || '—')}</b>\n` +
          (n.date ? `📅 ${escapeTelegram(n.date)}\n` : '') +
          (n.time ? `🕐 ${escapeTelegram(n.time)}\n` : '') +
          (n.priority ? `⚡ ${escapeTelegram(n.priority)}\n` : '') +
          `👤 ${escapeTelegram(row.operator_email || '—')}`
      };
    }

    if (t === 'planner_shipments' && a === 'INSERT') {
      return {
        type: 'planner_shipment_created',
        text:
          '🚚 <b>Запланирована отгрузка</b>\n\n' +
          `<b>${escapeTelegram(n.title || '—')}</b>\n` +
          (n.date ? `📅 ${escapeTelegram(n.date)}\n` : '') +
          (n.time ? `🕐 ${escapeTelegram(n.time)}\n` : '') +
          (n.direction ? `📍 ${escapeTelegram(n.direction)}\n` : '') +
          (n.warehouse ? `🏭 ${escapeTelegram(n.warehouse)}\n` : '') +
          `👤 ${escapeTelegram(row.operator_email || '—')}`
      };
    }

    if (t === 'planner_shipments' && a === 'UPDATE' && changed.includes('status')) {
      return {
        type: 'planner_shipment_status',
        text:
          '🔄 <b>Статус отгрузки обновлён</b>\n\n' +
          `<b>${escapeTelegram(n.title || '—')}</b>\n` +
          `${escapeTelegram(o.status || '—')} → <b>${escapeTelegram(n.status || '—')}</b>\n` +
          (n.date ? `📅 ${escapeTelegram(n.date)}\n` : '') +
          `👤 ${escapeTelegram(row.operator_email || '—')}`
      };
    }

    if (t === 'pallet_notes' && (a === 'INSERT' || a === 'UPDATE')) {
      return {
        type: 'pallet_note',
        text:
          '📌 <b>Заметка поддона</b>\n\n' +
          (n.direction ? `📍 ${escapeTelegram(n.direction)}\n` : '') +
          `📦 Поддон: <b>${escapeTelegram(n.pallet || '—')}</b>\n\n` +
          `${escapeTelegram(n.note || '')}\n` +
          `👤 ${escapeTelegram(row.operator_email || '—')}`
      };
    }

    return null;
  }

  function isEventEnabled(type, s) {
    if (type.startsWith('task_') && !s.notify_tasks) return false;
    if (type.startsWith('planner_') && !s.notify_planner) return false;
    return true;
  }

  /* =========================================================
     УТРЕННЯЯ СВОДКА
     ========================================================= */

  function buildDigest() {
    const boxes = Array.isArray(window.state?.boxes) ? window.state.boxes : [];
    const tasks = Array.isArray(window.tasksState?.items) ? window.tasksState.items : [];
    const plannerTasks = Array.isArray(window.plannerState?.tasks) ? window.plannerState.tasks : [];
    const shipments = Array.isArray(window.plannerState?.shipments) ? window.plannerState.shipments : [];

    const today = todayKey();

    const picking = boxes.filter(b => b.status === 'КПодбору').length;
    const collected = boxes.filter(b => b.status === 'Скомплектовано').length;

    const todayShipments = shipments.filter(
      s => s.date === today && s.status !== 'Отгружена' && s.status !== 'Отменена'
    );

    const todayTasks = plannerTasks.filter(
      t => t.date === today && t.status !== 'Выполнено' && t.status !== 'Отменено'
    );

    const openTasks = tasks.filter(t => !t.completed);

    const overdueTasks = plannerTasks.filter(t => {
      return t.date && t.date < today &&
             t.status !== 'Выполнено' && t.status !== 'Отменено';
    });

    const lines = [];
    lines.push('☀️ <b>Доброе утро!</b>\n');
    lines.push(`План на ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}\n`);

    if (todayShipments.length) {
      lines.push(`🚚 <b>Отгрузок запланировано: ${todayShipments.length}</b>`);
      todayShipments.slice(0, 5).forEach(s => {
        const time = s.time ? `${s.time} — ` : '';
        lines.push(`  • ${time}${escapeTelegram(s.title || '—')}`);
      });
      if (todayShipments.length > 5) {
        lines.push(`  <i>…и ещё ${todayShipments.length - 5}</i>`);
      }
      lines.push('');
    }

    if (todayTasks.length) {
      lines.push(`📋 <b>Задач на сегодня: ${todayTasks.length}</b>`);
      todayTasks.slice(0, 5).forEach(t => {
        const time = t.time ? `${t.time} — ` : '';
        lines.push(`  • ${time}${escapeTelegram(t.title || '—')}`);
      });
      if (todayTasks.length > 5) {
        lines.push(`  <i>…и ещё ${todayTasks.length - 5}</i>`);
      }
      lines.push('');
    }

    if (overdueTasks.length) {
      lines.push(`⚠️ <b>Просрочено: ${overdueTasks.length}</b>`);
      overdueTasks.slice(0, 3).forEach(t => {
        lines.push(`  • ${escapeTelegram(t.title || '—')} (${t.date})`);
      });
      lines.push('');
    }

    lines.push('📦 <b>Склад:</b>');
    lines.push(`  • К подбору: ${picking}`);
    lines.push(`  • Скомплектовано: ${collected}`);
    lines.push(`  • Всего коробок: ${boxes.length}`);

    if (openTasks.length) {
      lines.push('');
      lines.push(`📝 Активных задач в разделе: ${openTasks.length}`);
    }

    lines.push('');
    lines.push('<i>Хорошего дня!</i>');

    return lines.join('\n');
  }

  function shouldSendDigest() {
    if (!settings.digest_enabled) return false;
    if (!settings.bot_token) return false;
    if (!settings.enabled) return false;

    const today = todayKey();

    if (settings.last_digest_date === today) return false;

    const target = settings.digest_time || '08:00';
    const now = new Date();
    const [hh, mm] = target.split(':').map(Number);
    const targetDate = new Date();
    targetDate.setHours(hh || 8, mm || 0, 0, 0);

    if (now < targetDate) return false;

    const limit = new Date(targetDate);
    limit.setHours(limit.getHours() + 3);
    if (now > limit) return 'skip';

    return true;
  }

  async function trySendDigest() {
    const result = shouldSendDigest();

    if (result === 'skip') {
      const today = todayKey();
      await saveSettings({ last_digest_date: today });
      settings.last_digest_date = today;
      return;
    }

    if (result !== true) return;

    const text = buildDigest();

    try {
      await sendToAll(text);
      await logSend('digest', text, true, null);

      const today = todayKey();
      await saveSettings({ last_digest_date: today });
      settings.last_digest_date = today;

      console.log('[Telegram] Утренняя сводка отправлена всем');
    } catch (e) {
      console.error('[Telegram] digest error:', e);
      await logSend('digest', text, false, e.message);
    }
  }

  /* =========================================================
     POLLING СОБЫТИЙ
     (команды и callback — через webhook, здесь только события)
     ========================================================= */

  async function pollEvents() {
    const client = getSupabase();
    if (!client) return;

    const since = settings.last_checked_at || new Date(Date.now() - 60000).toISOString();

    const { data, error } = await client
      .from('audit_log')
      .select('*')
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(MAX_EVENTS_PER_TICK);

    if (error) {
      console.warn('[Telegram] poll events error:', error);
      return;
    }

    if (!data || !data.length) {
      await saveSettings({ last_checked_at: new Date().toISOString() });
      settings.last_checked_at = new Date().toISOString();
      return;
    }

    let newestTs = since;

    for (const row of data) {
      if (row.created_at > newestTs) newestTs = row.created_at;

      const msg = buildMessage(row);
      if (!msg) continue;
      if (!isEventEnabled(msg.type, settings)) continue;

      try {
        await sendToAll(msg.text);
        await logSend(msg.type, msg.text, true, null);
      } catch (e) {
        console.error('[Telegram] send error:', e);
        await logSend(msg.type, msg.text, false, e.message);
      }
    }

    await saveSettings({ last_checked_at: newestTs });
    settings.last_checked_at = newestTs;
  }

  async function poll() {
    if (polling) return;
    polling = true;

    try {
      if (!settings || !settings.enabled) return;
      if (!settings.bot_token) return;

      await pollEvents();
      await trySendDigest();

      /* Команды и callback обрабатываются webhook — здесь их нет,
         иначе будет двойной ответ. */

    } catch (e) {
      console.warn('[Telegram] poll outer error:', e);
    } finally {
      polling = false;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    setTimeout(poll, 5000);
    console.log('[Telegram] Polling запущен (25 сек)');
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      console.log('[Telegram] Polling остановлен');
    }
  }

  /* =========================================================
     УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ БОТА
     ========================================================= */

  async function loadBotUsers() {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('telegram_users')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[Telegram] load users error:', error);
      return [];
    }
    return data || [];
  }

  async function saveBotUser(payload) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');

    const { error } = await client
      .from('telegram_users')
      .upsert({
        ...payload,
        updated_at: new Date().toISOString(),
        updated_by: window.state?.user?.email || null
      }, { onConflict: 'chat_id' });

    if (error) throw error;

    /* Сбрасываем кэш получателей, чтобы новые уведомления шли и новому пользователю */
    invalidateRecipientsCache();
  }

  async function deleteBotUser(chatId) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');

    const { error } = await client
      .from('telegram_users')
      .delete()
      .eq('chat_id', chatId);

    if (error) throw error;

    invalidateRecipientsCache();
  }

  async function renderUsersBlock() {
    const block = document.getElementById('spTgUsersBlock');
    if (!block) return;

    block.innerHTML = `<div class="sp-tg-loading">Загрузка пользователей…</div>`;

    let users;
    try {
      users = await loadBotUsers();
    } catch (e) {
      block.innerHTML = `<div class="sp-tg-loading" style="color:#b42318;">Ошибка загрузки пользователей: ${escapeHtml(e.message || '')}</div>`;
      return;
    }

    const rowsHtml = users.map(u => `
      <tr>
        <td class="sp-tg-user-chat"><code>${escapeHtml(u.chat_id)}</code></td>
        <td><b>${escapeHtml(u.display_name || '—')}</b></td>
        <td><code style="font-size:11px;">${escapeHtml(u.email || '—')}</code></td>
        <td><span class="sp-tg-role sp-tg-role-${u.role}">${
          u.role === 'admin' ? 'Администратор' :
          u.role === 'picker' ? 'Оператор' : 'Наблюдатель'
        }</span></td>
        <td>
          <button type="button" class="sp-tg-icon-btn" data-user-edit="${escapeHtml(u.chat_id)}" title="Изменить">✎</button>
          <button type="button" class="sp-tg-icon-btn sp-tg-danger" data-user-delete="${escapeHtml(u.chat_id)}" title="Удалить">×</button>
        </td>
      </tr>
    `).join('');

    block.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:#0f172a;">
          👥 Пользователи бота (${users.length})
        </div>
        <button type="button" class="sp-tg-btn sp-tg-btn-primary" id="spTgUserAdd" style="padding:7px 12px;font-size:12px;">
          + Добавить
        </button>
      </div>

      ${users.length ? `
        <table class="sp-tg-users-table">
          <thead>
            <tr>
              <th>Chat ID</th>
              <th>Имя</th>
              <th>Email</th>
              <th>Роль</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      ` : `
        <div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px;background:#f8fafc;border-radius:10px;">
          Пока никого нет. Нажмите «+ Добавить», чтобы подключить коллегу.
        </div>
      `}

      <div class="sp-tg-help" style="margin-top:14px;">
        <b>Как подключить коллегу:</b><br>
        1. Пусть он напишет вашему боту <code>/start</code> в Telegram.<br>
        2. Он получит сообщение с <b>chat_id</b> (внутри блока «Доступ запрещён»).<br>
        3. Скопируйте его chat_id, добавьте здесь.<br>
        4. Укажите email — тот, под которым он входит в SKLADAPLAN.<br>
        5. Теперь он получает уведомления и может пользоваться командами.
      </div>
    `;

    document.getElementById('spTgUserAdd')?.addEventListener('click', () => openUserModal(null));

    block.querySelectorAll('[data-user-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const chatId = btn.getAttribute('data-user-edit');
        const u = users.find(x => x.chat_id === chatId);
        if (u) openUserModal(u);
      });
    });

    block.querySelectorAll('[data-user-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const chatId = btn.getAttribute('data-user-delete');
        if (!confirm(`Удалить пользователя с chat_id «${chatId}»?\n\nОн перестанет получать уведомления и пользоваться командами.`)) return;

        try {
          await deleteBotUser(chatId);
          toast('Пользователь удалён');
          await renderUsersBlock();
        } catch (e) {
          console.error('[Telegram] delete user error:', e);
          toast('Ошибка: ' + (e.message || ''), 'error');
        }
      });
    });
  }

  function openUserModal(existing) {
    const overlay = document.createElement('div');
    overlay.id = 'spTgUserModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100005;display:flex;align-items:center;justify-content:center;padding:20px;';

    const isEdit = !!existing;

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;width:100%;max-width:460px;padding:22px;box-shadow:0 25px 80px rgba(0,0,0,.35);">
        <h3 style="margin:0 0 4px;font-size:17px;">${isEdit ? 'Изменить пользователя' : 'Добавить пользователя бота'}</h3>
        <p style="margin:0 0 18px;font-size:13px;color:#64748b;">
          Chat ID коллега видит в сообщении от бота после <code>/start</code>.
        </p>

        <label style="display:block;margin-bottom:12px;">
          <span style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:5px;">Chat ID</span>
          <input id="spTgUserChatId" type="text" value="${isEdit ? escapeHtml(existing.chat_id) : ''}"
            ${isEdit ? 'readonly style="background:#f8fafc;color:#64748b;width:100%;box-sizing:border-box;border:1px solid #dfe3e8;border-radius:9px;padding:10px 12px;font-size:13px;font-family:ui-monospace,Menlo,monospace;"' :
                     'style="width:100%;box-sizing:border-box;border:1px solid #dfe3e8;border-radius:9px;padding:10px 12px;font-size:13px;font-family:ui-monospace,Menlo,monospace;" placeholder="123456789"'}>
        </label>

        <label style="display:block;margin-bottom:12px;">
          <span style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:5px;">Имя</span>
          <input id="spTgUserName" type="text" value="${isEdit ? escapeHtml(existing.display_name || '') : ''}"
            placeholder="Иван Петров"
            style="width:100%;box-sizing:border-box;border:1px solid #dfe3e8;border-radius:9px;padding:10px 12px;font-size:13px;">
        </label>

        <label style="display:block;margin-bottom:12px;">
          <span style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:5px;">Email в SKLADAPLAN</span>
          <input id="spTgUserEmail" type="email" value="${isEdit ? escapeHtml(existing.email || '') : ''}"
            placeholder="ivan@company.ru"
            style="width:100%;box-sizing:border-box;border:1px solid #dfe3e8;border-radius:9px;padding:10px 12px;font-size:13px;">
        </label>

        <label style="display:block;margin-bottom:14px;">
          <span style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:5px;">Роль в боте</span>
          <select id="spTgUserRole" style="width:100%;box-sizing:border-box;border:1px solid #dfe3e8;border-radius:9px;padding:10px 12px;font-size:13px;background:#fff;">
            <option value="admin" ${isEdit && existing.role === 'admin' ? 'selected' : ''}>Администратор — все права</option>
            <option value="picker" ${isEdit && existing.role === 'picker' ? 'selected' : ''}>Оператор — работа со складом</option>
            <option value="viewer" ${isEdit && existing.role === 'viewer' ? 'selected' : ''}>Наблюдатель — только просмотр</option>
          </select>
        </label>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" id="spTgUserCancel" style="border:1px solid #e2e8f0;background:#f1f5f9;color:#334155;border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;">Отмена</button>
          <button type="button" id="spTgUserSave" style="border:0;background:var(--primary,#2563EB);color:#fff;border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;">
            ${isEdit ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('spTgUserCancel').addEventListener('click', close);

    document.getElementById('spTgUserSave').addEventListener('click', async () => {
      const chatId = (document.getElementById('spTgUserChatId')?.value || '').trim();
      const name = (document.getElementById('spTgUserName')?.value || '').trim();
      const email = (document.getElementById('spTgUserEmail')?.value || '').trim().toLowerCase();
      const role = document.getElementById('spTgUserRole')?.value || 'picker';

      if (!chatId || !/^-?\d+$/.test(chatId)) {
        toast('Chat ID должен быть числом', 'error');
        return;
      }
      if (!name) {
        toast('Введите имя', 'error');
        return;
      }

      const btn = document.getElementById('spTgUserSave');
      btn.disabled = true;
      btn.textContent = 'Сохранение…';

      try {
        await saveBotUser({ chat_id: chatId, display_name: name, email, role, active: true });
        close();
        toast(isEdit ? 'Пользователь обновлён' : 'Пользователь добавлен');
        await renderUsersBlock();
      } catch (e) {
        console.error('[Telegram] save user error:', e);
        toast('Ошибка: ' + (e.message || ''), 'error');
        btn.disabled = false;
        btn.textContent = isEdit ? 'Сохранить' : 'Добавить';
      }
    });
  }

  /* =========================================================
     КАРТОЧКА
     ========================================================= */

  function buildCard() {
    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'sp-card';
    card.style.marginBottom = '16px';
    card.innerHTML = `
      <h3>📨 Telegram-бот</h3>
      <p class="sp-tg-sub">
        Уведомления и команды работают через webhook (мгновенно).
        Пользователи бота получают уведомления и могут управлять задачами.
      </p>
      <div id="spTgBody"><div class="sp-tg-loading">Загрузка…</div></div>
      <div id="spTgUsersBlock" style="margin-top:20px;"></div>
    `;
    return card;
  }

  function renderBody() {
    const body = document.getElementById('spTgBody');
    if (!body || !settings) return;

    const isConfigured = !!(settings.bot_token);
    const isOn = settings.enabled && isConfigured;

    body.innerHTML = `
      <div class="sp-tg-status ${isOn ? 'on' : 'off'}">
        <span class="dot ${isOn ? 'pulse' : ''}"></span>
        ${
          isOn
            ? 'Работает · команды через webhook, события — polling 25 сек'
            : (isConfigured ? 'Готово к включению' : 'Не настроено')
        }
      </div>

      <label class="sp-tg-field">
        <span>Bot Token</span>
        <input id="spTgToken" type="text"
          placeholder="1234567890:ABCdef..."
          value="${escapeHtml(settings.bot_token)}"
          autocomplete="off" spellcheck="false">
      </label>

      <label class="sp-tg-field">
        <span>Главный Chat ID (fallback, если список пуст)</span>
        <input id="spTgChatId" type="text"
          placeholder="Например: 123456789"
          value="${escapeHtml(settings.chat_id)}"
          autocomplete="off" spellcheck="false">
      </label>

      <label class="sp-tg-check" style="margin: 12px 0;">
        <input type="checkbox" id="spTgEnabled" ${settings.enabled ? 'checked' : ''}>
        <span>Отправлять уведомления о событиях</span>
      </label>

      <label class="sp-tg-check" style="margin: 8px 0 12px;">
        <input type="checkbox" id="spTgDigestEnabled" ${settings.digest_enabled ? 'checked' : ''}>
        <span>Утренняя сводка раз в день</span>
      </label>

      <label class="sp-tg-field">
        <span>Время утренней сводки</span>
        <input id="spTgDigestTime" type="time"
          value="${escapeHtml(settings.digest_time || '08:00')}">
      </label>

      <div class="sp-tg-checks">
        <label class="sp-tg-check">
          <input type="checkbox" id="spTgTasks" ${settings.notify_tasks ? 'checked' : ''}>
          <span>Задачи</span>
        </label>
        <label class="sp-tg-check">
          <input type="checkbox" id="spTgPlanner" ${settings.notify_planner ? 'checked' : ''}>
          <span>Планировщик</span>
        </label>
      </div>

      <div class="sp-tg-actions">
        <button type="button" class="sp-tg-btn sp-tg-btn-primary" id="spTgSave">Сохранить</button>
        <button type="button" class="sp-tg-btn sp-tg-btn-secondary" id="spTgTest">Отправить тест</button>
        <button type="button" class="sp-tg-btn sp-tg-btn-secondary" id="spTgTestDigest">Тест сводки</button>
      </div>

      <div class="sp-tg-help">
        <b>Команды боту в Telegram</b> (мгновенные, через webhook):
        <div class="sp-tg-commands">
          <code>/status</code><span>сводка по складу</span>
          <code>/today</code><span>что на сегодня</span>
          <code>/tasks</code><span>активные задачи</span>
          <code>/users</code><span>список пользователей</span>
          <code>/assign Имя | Задача</code><span>назначить задачу</span>
          <code>/find 4810…</code><span>найти коробку</span>
          <code>/whoami</code><span>ваш профиль</span>
        </div>
      </div>
    `;

    document.getElementById('spTgSave')?.addEventListener('click', onSave);
    document.getElementById('spTgTest')?.addEventListener('click', onTest);
    document.getElementById('spTgTestDigest')?.addEventListener('click', onTestDigest);

    renderUsersBlock();
  }

  /* =========================================================
     ОБРАБОТЧИКИ
     ========================================================= */

  function readForm() {
    return {
      bot_token: (document.getElementById('spTgToken')?.value || '').trim(),
      chat_id: (document.getElementById('spTgChatId')?.value || '').trim(),
      enabled: !!document.getElementById('spTgEnabled')?.checked,
      digest_enabled: !!document.getElementById('spTgDigestEnabled')?.checked,
      digest_time: (document.getElementById('spTgDigestTime')?.value || '08:00').trim(),
      notify_tasks: !!document.getElementById('spTgTasks')?.checked,
      notify_planner: !!document.getElementById('spTgPlanner')?.checked
    };
  }

  async function onSave() {
    const btn = document.getElementById('spTgSave');
    const data = readForm();

    if (data.enabled && !data.bot_token) {
      toast('Для включения уведомлений заполните Bot Token', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохранение…';

    try {
      const wasEnabled = settings.enabled;

      const patch = {
        ...data,
        updated_at: new Date().toISOString(),
        updated_by: window.state?.user?.email || null
      };

      if (!wasEnabled && data.enabled) {
        patch.last_checked_at = new Date().toISOString();
      }

      await saveSettings(patch);
      settings = { ...settings, ...patch };

      invalidateRecipientsCache();

      toast('Настройки сохранены');

      if (settings.enabled) {
        stopPolling();
        startPolling();
      } else {
        stopPolling();
      }

      renderBody();
    } catch (e) {
      console.error('[Telegram] save error:', e);
      toast('Ошибка: ' + (e.message || 'не удалось сохранить'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Сохранить';
    }
  }

  async function onTest() {
    const btn = document.getElementById('spTgTest');
    const data = readForm();

    if (!data.bot_token) {
      toast('Сначала заполните Bot Token', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Отправка…';

    const text =
      '✅ <b>SKLADAPLAN</b>\n\n' +
      'Тестовое сообщение.\n' +
      'Если вы его видите — бот настроен правильно.\n\n' +
      'Отправил: <code>' + escapeTelegram(window.state?.user?.email || '—') + '</code>\n' +
      'Время: ' + new Date().toLocaleString('ru-RU');

    try {
      /* Обновим settings локально, чтобы sendToAll знал bot_token */
      settings.bot_token = data.bot_token;

      await sendToAll(text);
      await logSend('test', text, true, null);
      toast('Тестовое сообщение отправлено всем пользователям');
    } catch (e) {
      console.error('[Telegram] test error:', e);
      await logSend('test', text, false, e.message);
      toast('Ошибка: ' + (e.message || 'неизвестная'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить тест';
    }
  }

  async function onTestDigest() {
    const btn = document.getElementById('spTgTestDigest');
    const data = readForm();

    if (!data.bot_token) {
      toast('Сначала заполните Bot Token', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Отправка…';

    try {
      settings.bot_token = data.bot_token;
      const text = buildDigest();
      await sendToAll(text);
      await logSend('digest_test', text, true, null);
      toast('Тест сводки отправлен всем');
    } catch (e) {
      console.error('[Telegram] digest test error:', e);
      await logSend('digest_test', 'test digest', false, e.message);
      toast('Ошибка: ' + (e.message || 'неизвестная'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Тест сводки';
    }
  }

  /* =========================================================
     ВСТАВКА КАРТОЧКИ
     ========================================================= */

  async function attachCard() {
    if (document.getElementById(CARD_ID)) return;

    const anchor =
      document.getElementById('spRolesCard') ||
      document.getElementById('spDataToolsCard') ||
      document.querySelector('#logoutBtn')?.closest('.sp-card');

    if (!anchor) return;

    const card = buildCard();
    anchor.insertAdjacentElement('afterend', card);

    try {
      loading = true;
      settings = await loadSettings();
      renderBody();

      if (settings.enabled && settings.bot_token) {
        startPolling();
      }
    } catch (e) {
      console.error('[Telegram] load error:', e);
      const body = document.getElementById('spTgBody');
      if (body) {
        body.innerHTML = `
          <div class="sp-tg-loading" style="color:#b42318;">
            Не удалось загрузить настройки.<br>
            <span style="font-size:12px;">${escapeHtml(e.message || 'ошибка')}</span>
          </div>
        `;
      }
    } finally {
      loading = false;
    }

    console.log('[Telegram] Карточка добавлена');
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function init() {
    injectStyles();

    const tryAttach = () => {
      try { attachCard(); } catch (e) { console.warn('[Telegram] attach error:', e); }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach, { once: true });
    } else {
      tryAttach();
    }

    const obs = new MutationObserver(tryAttach);
    obs.observe(document.body, { childList: true, subtree: true });

    console.log('[Telegram] Модуль v3.1 инициализирован');
  }

  init();

  window.addEventListener('beforeunload', stopPolling);

  window.spTelegram = {
    sendMessage,
    sendToAll,
    getSettings: () => settings,
    poll,
    sendDigest: trySendDigest,
    reloadRecipients: invalidateRecipientsCache,
    version: '3.1.0'
  };

})();
