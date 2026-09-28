/* =========================================================
   SKLADAPLAN — TELEGRAM-УВЕДОМЛЕНИЯ
   =========================================================

   Что делает (на этом этапе):
   - Карточка «Telegram-уведомления» на странице «Данные».
   - Поле для bot_token и chat_id.
   - Галочки: какие события отправлять.
   - Кнопка «Отправить тест» — проверка, что всё работает.
   - Кнопка «Сохранить» — пишет в telegram_settings.

   Что НЕ делает (пока):
   - Автоотправка при событиях. Это следующий шаг.
   - Никаких правок в app.js, tasks.js, planner.js.

   Безопасность:
   - bot_token и chat_id видны только admin (RLS).
   - Отправка идёт напрямую из браузера на api.telegram.org.
   - Никаких сторонних серверов.
   ========================================================= */

(function () {
  'use strict';

  const CARD_ID   = 'spTelegramCard';
  const STYLES_ID = 'spTelegramStyles';
  const API_BASE  = 'https://api.telegram.org';

  let settings = null;
  let loading = false;

  /* =========================================================
     СТИЛИ
     ========================================================= */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${CARD_ID} h3 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
      }
      #${CARD_ID} .sp-tg-sub {
        margin: 0 0 16px;
        font-size: 13px;
        color: #64748b;
        line-height: 1.4;
      }
      #${CARD_ID} .sp-tg-status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 16px;
      }
      #${CARD_ID} .sp-tg-status.on {
        background: #dcfce7;
        color: #166534;
      }
      #${CARD_ID} .sp-tg-status.off {
        background: #f1f5f9;
        color: #64748b;
      }
      #${CARD_ID} .sp-tg-status .dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: currentColor;
      }

      #${CARD_ID} .sp-tg-field {
        display: block;
        margin-bottom: 12px;
      }
      #${CARD_ID} .sp-tg-field span {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 5px;
      }
      #${CARD_ID} .sp-tg-field input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        padding: 10px 12px;
        font: inherit;
        font-size: 13px;
        outline: none;
        background: #fff;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
      #${CARD_ID} .sp-tg-field input:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }

      #${CARD_ID} .sp-tg-checks {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 16px;
        margin: 14px 0;
        padding: 12px 14px;
        background: #f8fafc;
        border-radius: 10px;
      }
      #${CARD_ID} .sp-tg-check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        cursor: pointer;
      }
      #${CARD_ID} .sp-tg-check input {
        width: 16px; height: 16px;
        accent-color: var(--primary, #2563EB);
        cursor: pointer;
      }

      #${CARD_ID} .sp-tg-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 16px;
      }
      #${CARD_ID} .sp-tg-btn {
        border: 0;
        border-radius: 9px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      #${CARD_ID} .sp-tg-btn-primary {
        background: var(--primary, #2563EB);
        color: #fff;
      }
      #${CARD_ID} .sp-tg-btn-primary:hover {
        background: var(--primary-hover, #1D4ED8);
      }
      #${CARD_ID} .sp-tg-btn-primary:disabled {
        opacity: .5;
        cursor: not-allowed;
      }
      #${CARD_ID} .sp-tg-btn-secondary {
        background: #f1f5f9;
        color: #334155;
        border: 1px solid #e2e8f0;
      }
      #${CARD_ID} .sp-tg-btn-secondary:hover {
        background: #e2e8f0;
      }

      #${CARD_ID} .sp-tg-help {
        margin-top: 14px;
        padding: 12px 14px;
        background: #eff6ff;
        border-radius: 10px;
        font-size: 12px;
        color: #1e40af;
        line-height: 1.55;
      }
      #${CARD_ID} .sp-tg-help b { color: #0c2d6b; }
      #${CARD_ID} .sp-tg-help code {
        background: #dbeafe;
        padding: 1px 5px;
        border-radius: 3px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 11px;
      }
      #${CARD_ID} .sp-tg-loading {
        padding: 20px;
        text-align: center;
        color: #64748b;
        font-size: 13px;
      }

      @media (max-width: 640px) {
        #${CARD_ID} .sp-tg-checks {
          grid-template-columns: 1fr;
        }
        #${CARD_ID} .sp-tg-actions {
          flex-direction: column;
        }
        #${CARD_ID} .sp-tg-btn {
          width: 100%;
        }
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
     ЗАГРУЗКА
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
      bot_token: '',
      chat_id: '',
      enabled: false,
      notify_tasks: true,
      notify_planner: true,
      notify_optimization: true,
      notify_verification: true,
      notify_inventory: true
    };
  }

  /* =========================================================
     ОТПРАВКА В TELEGRAM
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
      const desc = result.description || response.statusText || 'Неизвестная ошибка';
      throw new Error(desc);
    }

    return result.result;
  }

  async function logSend(eventType, message, success, error) {
    const client = getSupabase();
    if (!client) return;

    try {
      await client.from('telegram_log').insert({
        event_type: eventType,
        message: message.slice(0, 500),
        success: !!success,
        error: error ? String(error).slice(0, 500) : null,
        operator_email: window.state?.user?.email || null
      });
    } catch (e) {
      /* Не блокируем основной поток */
      console.warn('[Telegram] log error:', e);
    }
  }

  /* =========================================================
     РЕНДЕР КАРТОЧКИ
     ========================================================= */

  function buildCard() {
    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'sp-card';
    card.style.marginBottom = '16px';

    card.innerHTML = `
      <h3>📨 Telegram-уведомления</h3>
      <p class="sp-tg-sub">
        Отправляйте уведомления о событиях склада в Telegram — боту или личному чату.
        Настроить может только администратор.
      </p>
      <div id="spTgBody">
        <div class="sp-tg-loading">Загрузка настроек…</div>
      </div>
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
        <span class="dot"></span>
        ${isOn ? 'Уведомления включены' : (isConfigured ? 'Готово к включению' : 'Не настроено')}
      </div>

      <label class="sp-tg-field">
        <span>Bot Token</span>
        <input
          id="spTgToken"
          type="text"
          placeholder="1234567890:ABCdef... (от @BotFather)"
          value="${escapeHtml(settings.bot_token)}"
          autocomplete="off"
          spellcheck="false"
        >
      </label>

      <label class="sp-tg-field">
        <span>Chat ID</span>
        <input
          id="spTgChatId"
          type="text"
          placeholder="Например: 123456789 или -1001234567890 (для группы)"
          value="${escapeHtml(settings.chat_id)}"
          autocomplete="off"
          spellcheck="false"
        >
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
        <button type="button" class="sp-tg-btn sp-tg-btn-primary" id="spTgSave">
          Сохранить
        </button>
        <button type="button" class="sp-tg-btn sp-tg-btn-secondary" id="spTgTest">
          Отправить тест
        </button>
        <button type="button" class="sp-tg-btn sp-tg-btn-secondary" id="spTgOpenBot">
          Открыть чат с ботом
        </button>
      </div>

      <div class="sp-tg-help">
        <b>Как настроить за 3 минуты:</b><br>
        1. В Telegram напишите <code>@BotFather</code> команду <code>/newbot</code>, получите токен.<br>
        2. Напишите своему боту <code>/start</code>.<br>
        3. Chat ID — узнайте у <code>@userinfobot</code> (для группы — добавьте бота в группу и узнайте ID у <code>@getidsbot</code>).<br>
        4. Вставьте оба значения и нажмите «Отправить тест».
      </div>
    `;

    document.getElementById('spTgSave')?.addEventListener('click', onSave);
    document.getElementById('spTgTest')?.addEventListener('click', onTest);
    document.getElementById('spTgOpenBot')?.addEventListener('click', onOpenBot);
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
      const client = getSupabase();
      const payload = {
        ...data,
        updated_at: new Date().toISOString(),
        updated_by: window.state?.user?.email || null
      };

      const { error } = await client
        .from('telegram_settings')
        .update(payload)
        .eq('id', 1);

      if (error) throw error;

      settings = { ...settings, ...data };
      toast('Настройки сохранены');
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
      'Отправил: <code>' + (window.state?.user?.email || '—') + '</code>\n' +
      'Время: ' + new Date().toLocaleString('ru-RU');

    try {
      await sendMessage(data.bot_token, data.chat_id, text);
      await logSend('test', text, true, null);
      toast('Тестовое сообщение отправлено — проверьте Telegram');
    } catch (e) {
      console.error('[Telegram] test error:', e);
      await logSend('test', text, false, e.message);
      toast('Ошибка отправки: ' + (e.message || 'неизвестная'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить тест';
    }
  }

  function onOpenBot() {
    const token = (document.getElementById('spTgToken')?.value || '').trim();
    if (!token) {
      toast('Сначала введите Bot Token', 'error');
      return;
    }

    /* Bot token вида 1234:ABC... — вытащим id для ссылки t.me */
    const botId = token.split(':')[0];
    if (!botId) {
      toast('Не удалось определить ID бота', 'error');
      return;
    }

    /* Открываем чат с ботом. Username мы не знаем — но у бота есть
       ссылка t.me/<username>. Username нам не отдаётся. Тогда просто
       подскажем как найти. */
    toast('Найдите своего бота в Telegram по имени, которое дали @BotFather');
  }

  /* =========================================================
     ВСТАВКА КАРТОЧКИ
     ========================================================= */

  async function attachCard() {
    if (document.getElementById(CARD_ID)) return;

    /* Куда вставлять: после карточки «История и аналитика»
       или после «Пользователи и роли», либо после «Аккаунт». */
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
    } catch (e) {
      console.error('[Telegram] load error:', e);
      const body = document.getElementById('spTgBody');
      if (body) {
        body.innerHTML = `
          <div class="sp-tg-loading" style="color:#b42318;">
            Не удалось загрузить настройки.<br>
            <span style="font-size:12px;">
              ${escapeHtml(e.message || 'ошибка')}
            </span>
          </div>
        `;
      }
    } finally {
      loading = false;
    }

    console.log('[Telegram] Карточка добавлена на страницу «Данные»');
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function init() {
    injectStyles();

    const tryAttach = () => {
      try { attachCard(); } catch (e) {
        console.warn('[Telegram] attach error:', e);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach, { once: true });
    } else {
      tryAttach();
    }

    /* Страница «Данные» пересобирается при навигации —
       MutationObserver вернёт карточку. */
    const obs = new MutationObserver(tryAttach);
    obs.observe(document.body, { childList: true, subtree: true });

    console.log('[Telegram] Модуль инициализирован');
  }

  init();

  /* Публичный API */
  window.spTelegram = {
    sendMessage,
    getSettings: () => settings,
    version: '1.0.0'
  };

})();
