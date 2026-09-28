/* =========================================================
   SKLADAPLAN — TELEGRAM-УВЕДОМЛЕНИЯ (с автоотправкой)
   =========================================================

   Что делает:
   - Карточка «Telegram-уведомления» на странице «Данные».
   - Поля: bot_token, chat_id, галочки событий.
   - Кнопка «Отправить тест».
   - АВТООТПРАВКА: раз в 25 сек читает новые записи из
     audit_log и отправляет уведомления в Telegram по
     настроенным типам событий.

   Логика работы:
   - Работает, пока открыта вкладка хотя бы у одного
     администратора.
   - Читает audit_log начиная с last_checked_at.
   - Формирует сообщение и отправляет.
   - Обновляет last_checked_at.

   Что НЕ делает:
   - Не трогает app.js и остальные модули.
   - Не создаёт webhook, cron, Edge Functions.
   ========================================================= */

(function () {
  'use strict';

  const CARD_ID    = 'spTelegramCard';
  const STYLES_ID  = 'spTelegramStyles';
  const API_BASE   = 'https://api.telegram.org';

  const POLL_INTERVAL_MS = 25000;      /* 25 сек */
  const MAX_EVENTS_PER_TICK = 5;       /* не более 5 сообщений за раз */

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
      #${CARD_ID} .sp-tg-field input {
        width: 100%; box-sizing: border-box;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 10px 12px; font-size: 13px; outline: none; background: #fff;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
      #${CARD_ID} .sp-tg-field input:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }

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
        font-size: 12px; color: #1e40af; line-height: 1.55;
      }
      #${CARD_ID} .sp-tg-help b { color: #0c2d6b; }
      #${CARD_ID} .sp-tg-help code {
        background: #dbeafe; padding: 1px 5px; border-radius: 3px;
        font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px;
      }
      #${CARD_ID} .sp-tg-loading { padding: 20px; text-align: center; color: #64748b; font-size: 13px; }

      @media (max-width: 640px) {
        #${CARD_ID} .sp-tg-checks { grid-template-columns: 1fr; }
        #${CARD_ID} .sp-tg-actions { flex-direction: column; }
        #${CARD_ID} .sp-tg-btn { width: 100%; }
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
    /* Для parse_mode HTML достаточно экранировать < > & */
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

  /* =========================================================
     ЗАГРУЗКА И СОХРАНЕНИЕ НАСТРОЕК
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
      notify_optimization: true, notify_verification: true, notify_inventory: true
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

  async function sendMessage(botToken, chatId, text) {
    const url = `${API_BASE}/bot${botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.description || response.statusText || 'Ошибка Telegram');
    }
    return result.result;
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
     ПРЕОБРАЗОВАНИЕ СОБЫТИЙ В СООБЩЕНИЯ
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

    /* Задача — создание */
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

    /* Задача — выполнена */
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

    /* Задача планировщика — создание */
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

    /* Планировщик — отгрузка создана */
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

    /* Планировщик — статус отгрузки изменился */
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

    /* Заметка на поддон */
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
    if (type === 'pallet_note') return true; /* заметки — всегда, если включены уведомления */
    return true;
  }

  /* =========================================================
     POLLING
     ========================================================= */

  async function poll() {
    if (polling) return;
    polling = true;

    try {
      const client = getSupabase();
      if (!client) return;

      if (!settings || !settings.enabled) return;
      if (!settings.bot_token || !settings.chat_id) return;

      const since = settings.last_checked_at || new Date(Date.now() - 60 * 1000).toISOString();

      /* Читаем новые записи с прошлой проверки */
      const { data, error } = await client
        .from('audit_log')
        .select('*')
        .gt('created_at', since)
        .order('created_at', { ascending: true })
        .limit(MAX_EVENTS_PER_TICK);

      if (error) {
        console.warn('[Telegram] poll error:', error);
        return;
      }

      if (!data || !data.length) {
        /* Обновим last_checked_at, чтобы не запрашивать старьё */
        await saveSettings({ last_checked_at: new Date().toISOString() });
        settings.last_checked_at = new Date().toISOString();
        return;
      }

      let newestTs = since;
      let sentCount = 0;

      for (const row of data) {
        if (row.created_at > newestTs) newestTs = row.created_at;

        const msg = buildMessage(row);
        if (!msg) continue;
        if (!isEventEnabled(msg.type, settings)) continue;

        try {
          await sendMessage(settings.bot_token, settings.chat_id, msg.text);
          await logSend(msg.type, msg.text, true, null);
          sentCount++;
        } catch (e) {
          console.error('[Telegram] send error:', e);
          await logSend(msg.type, msg.text, false, e.message);
        }
      }

      /* Обновляем точку отсчёта */
      await saveSettings({ last_checked_at: newestTs });
      settings.last_checked_at = newestTs;

      if (sentCount > 0) {
        console.log(`[Telegram] Отправлено уведомлений: ${sentCount}`);
      }

    } catch (e) {
      console.warn('[Telegram] poll outer error:', e);
    } finally {
      polling = false;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    /* Первый прогон — через 5 сек после старта */
    setTimeout(poll, 5000);
    console.log('[Telegram] Polling запущен (интервал 25 сек)');
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
      <h3>📨 Telegram-уведомления</h3>
      <p class="sp-tg-sub">
        Уведомления о событиях склада в Telegram. Отправка работает,
        пока открыта вкладка SKLADAPLAN хотя бы у одного администратора.
      </p>
      <div id="spTgBody"><div class="sp-tg-loading">Загрузка настроек…</div></div>
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
            ? 'Работает — проверка каждые 25 секунд'
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
        <span>Отправлять уведомления (общий выключатель)</span>
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
      </div>

      <div class="sp-tg-help">
        <b>Автоуведомления</b> сейчас работают для: задачи, планировщик, заметки поддонов.
        Оптимизация, проверка скомплектованного и инвентаризация — на следующем этапе.
      </div>
    `;

    document.getElementById('spTgSave')?.addEventListener('click', onSave);
    document.getElementById('spTgTest')?.addEventListener('click', onTest);
  }

  /* =========================================================
     ОБРАБОТЧИКИ
     ========================================================= */

  function readForm() {
    return {
      bot_token: (document.getElementById('spTgToken')?.value || '').trim(),
      chat_id: (document.getElementById('spTgChatId')?.value || '').trim(),
      enabled: !!document.getElementById('spTgEnabled')?.checked,
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
      toast('Для включения уведомлений заполните Bot Token и Chat ID', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохранение…';

    try {
      const wasEnabled = settings.enabled;

      /* При первом включении — сбрасываем точку отсчёта, чтобы
         не заваливать старыми событиями */
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
      toast('Настройки сохранены');

      /* Перезапуск polling */
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
      'Если вы его видите — уведомления настроены правильно.\n\n' +
      'Отправил: <code>' + escapeTelegram(window.state?.user?.email || '—') + '</code>\n' +
      'Время: ' + new Date().toLocaleString('ru-RU');

    try {
      await sendMessage(data.bot_token, data.chat_id, text);
      await logSend('test', text, true, null);
      toast('Тестовое сообщение отправлено');
    } catch (e) {
      console.error('[Telegram] test error:', e);
      await logSend('test', text, false, e.message);
      toast('Ошибка отправки: ' + (e.message || 'неизвестная'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить тест';
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

    console.log('[Telegram] Модуль инициализирован');
  }

  init();

  /* Остановка polling при закрытии вкладки */
  window.addEventListener('beforeunload', stopPolling);

  /* Публичный API */
  window.spTelegram = {
    sendMessage,
    getSettings: () => settings,
    poll,
    version: '2.0.0'
  };

})();
