/* =========================================================
   SKLADAPLAN — TELEGRAM-БОТ (полная версия)
   =========================================================

   Возможности:
   - Отправка уведомлений при событиях склада.
   - Обработка входящих команд (/status, /today, /tasks,
     /find <штрихкод>, /help, /whoami).
   - Утренняя сводка раз в день в заданное время.

   Всё работает на стороне клиента (браузера админа).
   Требуется: открытая вкладка SKLADAPLAN хотя бы у одного
   администратора.

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
  const MAX_UPDATES_PER_TICK = 10;

  let settings = null;
  let loading = false;
  let pollTimer = null;
  let polling = false;

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
      #${CARD_ID} .sp-tg-commands code {
        font-weight: 700;
      }
      #${CARD_ID} .sp-tg-loading { padding: 20px; text-align: center; color: #64748b; font-size: 13px; }

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
      command_offset: 0, accept_commands: true,
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

  async function getUpdates(botToken, offset) {
    const url = `${API_BASE}/bot${botToken}/getUpdates` +
      `?offset=${offset}&timeout=0&limit=${MAX_UPDATES_PER_TICK}`;

    const response = await fetch(url);
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.description || response.statusText || 'Ошибка getUpdates');
    }
    return result.result || [];
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
     КОМАНДЫ — ОБРАБОТЧИКИ
     ========================================================= */

  function cmdHelp() {
    return (
      '🤖 <b>SKLADAPLAN Bot</b>\n\n' +
      'Доступные команды:\n\n' +
      '/status — сводка по складу\n' +
      '/today — что на сегодня\n' +
      '/tasks — активные задачи\n' +
      '/find &lt;штрихкод&gt; — найти коробку\n' +
      '/whoami — ваш профиль\n' +
      '/help — эта справка\n\n' +
      '<i>Уведомления приходят автоматически.</i>'
    );
  }

  function cmdWhoami() {
    const email = window.state?.user?.email || '—';
    const role = window.spUIRoles?.getRole?.() || 'admin';
    const labels = { admin: 'Администратор', picker: 'Оператор', viewer: 'Наблюдатель' };

    return (
      '👤 <b>Ваш профиль</b>\n\n' +
      `Email: <code>${escapeTelegram(email)}</code>\n` +
      `Роль: <b>${escapeTelegram(labels[role] || role)}</b>\n` +
      `Отправка: ${settings.enabled ? '✅ включена' : '❌ выключена'}`
    );
  }

  function cmdStatus() {
    const boxes = Array.isArray(window.state?.boxes) ? window.state.boxes : [];
    const tasks = Array.isArray(window.tasksState?.items) ? window.tasksState.items : [];
    const plannerTasks = Array.isArray(window.plannerState?.tasks) ? window.plannerState.tasks : [];
    const shipments = Array.isArray(window.plannerState?.shipments) ? window.plannerState.shipments : [];

    const today = todayKey();

    const byStatus = {};
    boxes.forEach(b => {
      const s = (b.status || 'Не указан').trim();
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    const activeTasks = tasks.filter(t => !t.completed).length;
    const openPlannerTasks = plannerTasks.filter(
      t => t.status !== 'Выполнено' && t.status !== 'Отменено'
    ).length;

    const todayShipments = shipments.filter(s => s.date === today).length;
    const todayTasksCount = plannerTasks.filter(
      t => t.date === today && t.status !== 'Выполнено' && t.status !== 'Отменено'
    ).length;

    const lines = [];
    lines.push('📊 <b>Состояние склада</b>\n');
    lines.push(`Всего коробок: <b>${boxes.length}</b>`);

    Object.entries(byStatus)
      .sort((a, b) => b[1] - a[1])
      .forEach(([s, n]) => {
        lines.push(`  • ${escapeTelegram(s)}: ${n}`);
      });

    lines.push('');
    lines.push(`📝 Задачи: <b>${activeTasks}</b> активных`);
    lines.push(`📅 Планировщик: <b>${openPlannerTasks}</b> открытых`);
    lines.push(`🚚 Сегодня отгрузок: <b>${todayShipments}</b>`);
    lines.push(`📋 Сегодня задач: <b>${todayTasksCount}</b>`);

    lines.push('');
    lines.push(`<i>${new Date().toLocaleString('ru-RU')}</i>`);

    return lines.join('\n');
  }

  function cmdToday() {
    const today = todayKey();

    const plannerTasks = Array.isArray(window.plannerState?.tasks) ? window.plannerState.tasks : [];
    const shipments = Array.isArray(window.plannerState?.shipments) ? window.plannerState.shipments : [];
    const tasks = Array.isArray(window.tasksState?.items) ? window.tasksState.items : [];

    const todayShipments = shipments
      .filter(s => s.date === today)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const todayPlannerTasks = plannerTasks
      .filter(t => t.date === today && t.status !== 'Отменено')
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const todayExternalTasks = tasks
      .filter(t => t.due_date === today);

    if (!todayShipments.length && !todayPlannerTasks.length && !todayExternalTasks.length) {
      return `☕ <b>На ${new Date().toLocaleDateString('ru-RU')}</b>\n\nНичего не запланировано.`;
    }

    const lines = [];
    lines.push(`📅 <b>На ${new Date().toLocaleDateString('ru-RU')}</b>\n`);

    if (todayShipments.length) {
      lines.push(`🚚 <b>Отгрузки (${todayShipments.length})</b>`);
      todayShipments.forEach(s => {
        const time = s.time ? `${s.time} ` : '';
        const status = s.status === 'Отгружена' ? '✅' : '';
        lines.push(`  ${status}${time}<b>${escapeTelegram(s.title || '—')}</b>`);
        if (s.direction) lines.push(`    ↳ ${escapeTelegram(s.direction)}`);
      });
      lines.push('');
    }

    if (todayPlannerTasks.length) {
      lines.push(`📋 <b>Задачи планировщика (${todayPlannerTasks.length})</b>`);
      todayPlannerTasks.forEach(t => {
        const time = t.time ? `${t.time} ` : '';
        const done = t.status === 'Выполнено' ? '✅' : '⬜';
        lines.push(`  ${done}${time}<b>${escapeTelegram(t.title || '—')}</b>`);
      });
      lines.push('');
    }

    if (todayExternalTasks.length) {
      lines.push(`📝 <b>Задачи (${todayExternalTasks.length})</b>`);
      todayExternalTasks.forEach(t => {
        const done = t.completed ? '✅' : '⬜';
        lines.push(`  ${done}<b>${escapeTelegram(t.title || '—')}</b>`);
      });
    }

    return lines.join('\n');
  }

  function cmdTasks() {
    const plannerTasks = Array.isArray(window.plannerState?.tasks) ? window.plannerState.tasks : [];
    const tasks = Array.isArray(window.tasksState?.items) ? window.tasksState.items : [];

    const openPlanner = plannerTasks
      .filter(t => t.status !== 'Выполнено' && t.status !== 'Отменено')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 10);

    const openTasks = tasks
      .filter(t => !t.completed)
      .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
      .slice(0, 10);

    if (!openPlanner.length && !openTasks.length) {
      return '🎉 <b>Активных задач нет</b>\n\nВсё сделано.';
    }

    const lines = [];
    lines.push('📝 <b>Активные задачи</b>\n');

    if (openPlanner.length) {
      lines.push(`<b>Планировщик (${openPlanner.length})</b>`);
      openPlanner.forEach(t => {
        const date = t.date || '—';
        const time = t.time ? ` ${t.time}` : '';
        lines.push(`  • ${escapeTelegram(t.title || '—')}`);
        lines.push(`    ${date}${time}`);
      });
      lines.push('');
    }

    if (openTasks.length) {
      lines.push(`<b>Задачи (${openTasks.length})</b>`);
      openTasks.forEach(t => {
        const date = t.due_date || 'без срока';
        lines.push(`  • ${escapeTelegram(t.title || '—')}`);
        lines.push(`    ${date}`);
      });
    }

    return lines.join('\n');
  }

  function cmdFind(query) {
    if (!query) {
      return '⚠️ Формат: <code>/find 4810123456789</code>\n\nНайти коробку по штрихкоду.';
    }

    const boxes = Array.isArray(window.state?.boxes) ? window.state.boxes : [];
    const cleanQuery = String(query).replace(/\s+/g, '').trim();

    const matches = boxes
      .filter(b => {
        const bc = String(b.barcode || '').replace(/\s+/g, '');
        return bc === cleanQuery || bc.endsWith(cleanQuery) || bc.includes(cleanQuery);
      })
      .slice(0, 10);

    if (!matches.length) {
      return `🔍 По запросу <code>${escapeTelegram(cleanQuery)}</code> ничего не найдено.`;
    }

    const lines = [];
    lines.push(`🔍 <b>Найдено: ${matches.length}</b>\n`);

    matches.forEach((b, i) => {
      lines.push(`<b>${i + 1}.</b> <code>${escapeTelegram(b.barcode || '—')}</code>`);
      if (b.article) lines.push(`   Арт. ${escapeTelegram(b.article)}`);
      const loc = [];
      if (b.warehouse) loc.push(escapeTelegram(b.warehouse));
      if (b.zone_row) loc.push(escapeTelegram(b.zone_row));
      if (b.pallet) loc.push(`поддон ${escapeTelegram(b.pallet)}`);
      if (loc.length) lines.push(`   📍 ${loc.join(' · ')}`);
      if (b.status) lines.push(`   ${escapeTelegram(b.status)}`);
      lines.push('');
    });

    return lines.join('\n');
  }

  async function handleCommand(text, fromChatId) {
    /* Проверяем, что пишет владелец настроенного чата */
    if (String(fromChatId) !== String(settings.chat_id)) {
      console.log('[Telegram] Команда от чужого chat_id, игнорируем:', fromChatId);
      return null;
    }

    const raw = String(text || '').trim();
    if (!raw.startsWith('/')) return null;

    /* Отрезаем @username от команды (если есть) */
    const parts = raw.split(/\s+/);
    const cmd = parts[0].split('@')[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case '/start':
      case '/help':
        return cmdHelp();
      case '/status':
        return cmdStatus();
      case '/today':
        return cmdToday();
      case '/tasks':
        return cmdTasks();
      case '/find':
        return cmdFind(args);
      case '/whoami':
        return cmdWhoami();
      default:
        return `❓ Неизвестная команда: <code>${escapeTelegram(cmd)}</code>\n\nВведите /help для списка команд.`;
    }
  }

  /* =========================================================
     УВЕДОМЛЕНИЯ О СОБЫТИЯХ
     ========================================================= */

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
             `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return iso; }
  }

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
    if (!settings.bot_token || !settings.chat_id) return false;
    if (!settings.enabled) return false;

    const today = todayKey();

    /* Не отправляли сегодня? */
    if (settings.last_digest_date === today) return false;

    /* Время уже пришло? */
    const target = settings.digest_time || '08:00';
    const now = new Date();
    const [hh, mm] = target.split(':').map(Number);
    const targetDate = new Date();
    targetDate.setHours(hh || 8, mm || 0, 0, 0);

    /* Не раньше заданного времени */
    if (now < targetDate) return false;

    /* Не позже чем через 3 часа после — если браузер был закрыт
       утром, не отправляем опоздавший дайджест в обед */
    const limit = new Date(targetDate);
    limit.setHours(limit.getHours() + 3);
    if (now > limit) {
      /* Помечаем как отправленный, чтобы не пытаться снова */
      return 'skip';
    }

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
      await sendMessage(settings.bot_token, settings.chat_id, text);
      await logSend('digest', text, true, null);

      const today = todayKey();
      await saveSettings({ last_digest_date: today });
      settings.last_digest_date = today;

      console.log('[Telegram] Утренняя сводка отправлена');
    } catch (e) {
      console.error('[Telegram] digest error:', e);
      await logSend('digest', text, false, e.message);
    }
  }

  /* =========================================================
     POLLING
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
        await sendMessage(settings.bot_token, settings.chat_id, msg.text);
        await logSend(msg.type, msg.text, true, null);
      } catch (e) {
        console.error('[Telegram] send error:', e);
        await logSend(msg.type, msg.text, false, e.message);
      }
    }

    await saveSettings({ last_checked_at: newestTs });
    settings.last_checked_at = newestTs;
  }

  async function pollCommands() {
    if (!settings.accept_commands) return;

    const offset = Number(settings.command_offset || 0) + 1;

    let updates;
    try {
      updates = await getUpdates(settings.bot_token, offset);
    } catch (e) {
      console.warn('[Telegram] getUpdates error:', e.message);
      return;
    }

    if (!updates.length) return;

    let newOffset = settings.command_offset;

    for (const upd of updates) {
      if (upd.update_id > newOffset) newOffset = upd.update_id;

      const msg = upd.message || upd.edited_message;
      if (!msg) continue;
      if (!msg.text) continue;

      const chatId = msg.chat?.id;
      if (!chatId) continue;

      try {
        const reply = await handleCommand(msg.text, chatId);
        if (reply) {
          await sendMessage(settings.bot_token, settings.chat_id, reply);
          console.log('[Telegram] Ответ на команду:', msg.text.split(/\s+/)[0]);
        }
      } catch (e) {
        console.error('[Telegram] command handler error:', e);
      }
    }

    await saveSettings({ command_offset: newOffset });
    settings.command_offset = newOffset;
  }

  async function poll() {
    if (polling) return;
    polling = true;

    try {
      if (!settings || !settings.enabled) return;
      if (!settings.bot_token || !settings.chat_id) return;

      await pollEvents();
      await pollCommands();
      await trySendDigest();

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
        Двусторонний бот: отправляет уведомления о событиях и отвечает на команды.
        Работает, пока открыта вкладка хотя бы у одного администратора.
      </p>
      <div id="spTgBody"><div class="sp-tg-loading">Загрузка…</div></div>
    `;
    return card;
  }

  function renderBody() {
    const body = document.getElementById('spTgBody');
    if (!body || !settings) return;

    const isConfigured = !!(settings.bot_token && settings.chat_id);
    const isOn = settings.enabled && isConfigured;

    body.innerHTML = `
      <div class="sp-tg-status ${isOn ? 'on' : 'off'}">
        <span class="dot ${isOn ? 'pulse' : ''}"></span>
        ${
          isOn
            ? 'Работает · проверка каждые 25 секунд'
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
        <span>Chat ID</span>
        <input id="spTgChatId" type="text"
          placeholder="Например: 123456789"
          value="${escapeHtml(settings.chat_id)}"
          autocomplete="off" spellcheck="false">
      </label>

      <label class="sp-tg-check" style="margin: 12px 0;">
        <input type="checkbox" id="spTgEnabled" ${settings.enabled ? 'checked' : ''}>
        <span>Отправлять уведомления и принимать команды</span>
      </label>

      <label class="sp-tg-check" style="margin: 8px 0 12px;">
        <input type="checkbox" id="spTgAcceptCommands" ${settings.accept_commands ? 'checked' : ''}>
        <span>Обрабатывать команды (/status, /today, /tasks, /find)</span>
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
        <label class="sp-tg-check">
          <input type="checkbox" id="spTgOptimization" ${settings.notify_optimization ? 'checked' : ''}>
          <span>Оптимизация</span>
        </label>
        <label class="sp-tg-check">
          <input type="checkbox" id="spTgVerification" ${settings.notify_verification ? 'checked' : ''}>
          <span>Проверка скомплектованного</span>
        </label>
        <label class="sp-tg-check">
          <input type="checkbox" id="spTgInventory" ${settings.notify_inventory ? 'checked' : ''}>
          <span>Инвентаризация</span>
        </label>
      </div>

      <div class="sp-tg-actions">
        <button type="button" class="sp-tg-btn sp-tg-btn-primary" id="spTgSave">Сохранить</button>
        <button type="button" class="sp-tg-btn sp-tg-btn-secondary" id="spTgTest">Отправить тест</button>
        <button type="button" class="sp-tg-btn sp-tg-btn-secondary" id="spTgTestDigest">Тест сводки</button>
      </div>

      <div class="sp-tg-help">
        <b>Команды боту в Telegram:</b>
        <div class="sp-tg-commands">
          <code>/status</code><span>сводка по складу</span>
          <code>/today</code><span>что на сегодня</span>
          <code>/tasks</code><span>активные задачи</span>
          <code>/find 4810…</code><span>найти коробку по штрихкоду</span>
          <code>/whoami</code><span>ваш профиль</span>
          <code>/help</code><span>справка</span>
        </div>
      </div>
    `;

    document.getElementById('spTgSave')?.addEventListener('click', onSave);
    document.getElementById('spTgTest')?.addEventListener('click', onTest);
    document.getElementById('spTgTestDigest')?.addEventListener('click', onTestDigest);
  }

  /* =========================================================
     ОБРАБОТЧИКИ
     ========================================================= */

  function readForm() {
    return {
      bot_token: (document.getElementById('spTgToken')?.value || '').trim(),
      chat_id: (document.getElementById('spTgChatId')?.value || '').trim(),
      enabled: !!document.getElementById('spTgEnabled')?.checked,
      accept_commands: !!document.getElementById('spTgAcceptCommands')?.checked,
      digest_enabled: !!document.getElementById('spTgDigestEnabled')?.checked,
      digest_time: (document.getElementById('spTgDigestTime')?.value || '08:00').trim(),
      notify_tasks: !!document.getElementById('spTgTasks')?.checked,
      notify_planner: !!document.getElementById('spTgPlanner')?.checked,
      notify_optimization: !!document.getElementById('spTgOptimization')?.checked,
      notify_verification: !!document.getElementById('spTgVerification')?.checked,
      notify_inventory: !!document.getElementById('spTgInventory')?.checked
    };
  }

  async function onSave() {
    const btn = document.getElementById('spTgSave');
    const data = readForm();

    if (data.enabled && (!data.bot_token || !data.chat_id)) {
      toast('Для включения бота заполните Bot Token и Chat ID', 'error');
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
        /* Первый запуск — начинаем с текущего момента */
        patch.last_checked_at = new Date().toISOString();

        /* И пропускаем старые апдейты */
        try {
          const updates = await getUpdates(data.bot_token, 0);
          if (updates.length) {
            const maxId = updates.reduce(
              (max, u) => u.update_id > max ? u.update_id : max, 0
            );
            patch.command_offset = maxId;
          }
        } catch (e) {
          console.warn('[Telegram] не удалось пропустить старые апдейты:', e.message);
        }
      }

      await saveSettings(patch);
      settings = { ...settings, ...patch };

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

    if (!data.bot_token || !data.chat_id) {
      toast('Сначала заполните Bot Token и Chat ID', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Отправка…';

    const text =
      '✅ <b>SKLADAPLAN</b>\n\n' +
      'Тестовое сообщение.\n' +
      'Если вы его видите — бот настроен правильно.\n\n' +
      'Попробуйте отправить команду /help\n\n' +
      'Отправил: <code>' + escapeTelegram(window.state?.user?.email || '—') + '</code>\n' +
      'Время: ' + new Date().toLocaleString('ru-RU');

    try {
      await sendMessage(data.bot_token, data.chat_id, text);
      await logSend('test', text, true, null);
      toast('Тестовое сообщение отправлено');
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

    if (!data.bot_token || !data.chat_id) {
      toast('Сначала заполните Bot Token и Chat ID', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Отправка…';

    try {
      const text = buildDigest();
      await sendMessage(data.bot_token, data.chat_id, text);
      await logSend('digest_test', text, true, null);
      toast('Тест сводки отправлен');
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

      if (settings.enabled && settings.bot_token && settings.chat_id) {
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

    console.log('[Telegram] Модуль v3 инициализирован');
  }

  init();

  window.addEventListener('beforeunload', stopPolling);

  window.spTelegram = {
    sendMessage,
    getSettings: () => settings,
    poll,
    sendDigest: trySendDigest,
    version: '3.0.0'
  };

})();
