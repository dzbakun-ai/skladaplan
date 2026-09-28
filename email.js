/* =========================================================
   SKLADAPLAN — EMAIL (SMTP)
   Карточка настроек + отправка через Edge Function send-email.
   ========================================================= */

(function () {
  'use strict';

  if (window.spEmail) return;

  const CARD_ID   = 'spEmailCard';
  const STYLES_ID = 'spEmailStyles';

  let settings = null;
  let loading = false;

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${CARD_ID} h3 { margin: 0 0 4px; font-size: 16px; font-weight: 700; color: #0f172a; }
      #${CARD_ID} .sp-em-sub { margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.4; }
      #${CARD_ID} .sp-em-status {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 12px; border-radius: 999px;
        font-size: 12px; font-weight: 600; margin-bottom: 16px;
      }
      #${CARD_ID} .sp-em-status.on  { background: #dcfce7; color: #166534; }
      #${CARD_ID} .sp-em-status.off { background: #f1f5f9; color: #64748b; }
      #${CARD_ID} .sp-em-status .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
      #${CARD_ID} .sp-em-field { display: block; margin-bottom: 12px; }
      #${CARD_ID} .sp-em-field > span {
        display: block; font-size: 12px; font-weight: 600;
        color: #475569; margin-bottom: 5px;
      }
      #${CARD_ID} .sp-em-field input,
      #${CARD_ID} .sp-em-field select {
        width: 100%; box-sizing: border-box;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 10px 12px; font-size: 13px; outline: none; background: #fff;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
      #${CARD_ID} .sp-em-field input:focus,
      #${CARD_ID} .sp-em-field select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${CARD_ID} .sp-em-field select { font-family: inherit; }
      #${CARD_ID} .sp-em-grid {
        display: grid; grid-template-columns: 1fr 120px; gap: 10px;
      }
      #${CARD_ID} .sp-em-check {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; cursor: pointer; margin: 8px 0 14px;
      }
      #${CARD_ID} .sp-em-check input {
        width: 16px; height: 16px;
        accent-color: var(--primary, #2563EB); cursor: pointer;
      }
      #${CARD_ID} .sp-em-actions {
        display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px;
      }
      #${CARD_ID} .sp-em-btn {
        border: 0; border-radius: 9px; padding: 10px 16px;
        font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #${CARD_ID} .sp-em-btn-primary { background: var(--primary, #2563EB); color: #fff; }
      #${CARD_ID} .sp-em-btn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${CARD_ID} .sp-em-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
      #${CARD_ID} .sp-em-btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
      #${CARD_ID} .sp-em-btn-secondary:hover { background: #e2e8f0; }
      #${CARD_ID} .sp-em-help {
        margin-top: 14px; padding: 12px 14px;
        background: #eff6ff; border-radius: 10px;
        font-size: 12px; color: #1e40af; line-height: 1.6;
      }
      #${CARD_ID} .sp-em-help b { color: #0c2d6b; }
      #${CARD_ID} .sp-em-help code {
        background: #dbeafe; padding: 1px 5px; border-radius: 3px;
        font-family: ui-monospace, Menlo, monospace; font-size: 11px;
      }
      #${CARD_ID} .sp-em-loading { padding: 20px; text-align: center; color: #64748b; font-size: 13px; }

      @media (max-width: 640px) {
        #${CARD_ID} .sp-em-grid { grid-template-columns: 1fr; }
        #${CARD_ID} .sp-em-actions { flex-direction: column; }
        #${CARD_ID} .sp-em-btn { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

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
    else console.log('[Email]', msg);
  }

  async function loadSettings() {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');

    const { data, error } = await client
      .from('email_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    return data || {
      smtp_host: 'smtp.gmail.com',
      smtp_port: 465,
      smtp_secure: true,
      smtp_user: '',
      smtp_password: '',
      from_name: 'SKLADAPLAN',
      enabled: false,
      default_recipients: ''
    };
  }

  async function saveSettings(patch) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');

    const { error } = await client
      .from('email_settings')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
        updated_by: window.state?.user?.email || null
      })
      .eq('id', 1);

    if (error) throw error;
  }

  function buildCard() {
    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'sp-card';
    card.style.marginBottom = '16px';
    card.innerHTML = `
      <h3>📧 Email (SMTP)</h3>
      <p class="sp-em-sub">
        Отправка писем клиентам, партнёрам и отчётов на вашу почту.
        Для Gmail нужен <b>App Password</b> (не основной пароль).
      </p>
      <div id="spEmBody"><div class="sp-em-loading">Загрузка настроек…</div></div>
    `;
    return card;
  }

  function renderBody() {
    const body = document.getElementById('spEmBody');
    if (!body || !settings) return;

    const isOn = settings.enabled && settings.smtp_user && settings.smtp_password;

    body.innerHTML = `
      <div class="sp-em-status ${isOn ? 'on' : 'off'}">
        <span class="dot"></span>
        ${isOn ? 'Готово к отправке' : 'Не настроено'}
      </div>

      <div class="sp-em-grid">
        <label class="sp-em-field">
          <span>SMTP-сервер</span>
          <input id="spEmHost" type="text" value="${escapeHtml(settings.smtp_host)}" placeholder="smtp.gmail.com">
        </label>
        <label class="sp-em-field">
          <span>Порт</span>
          <input id="spEmPort" type="number" value="${escapeHtml(settings.smtp_port)}">
        </label>
      </div>

      <label class="sp-em-field">
        <span>Логин (ваш Gmail)</span>
        <input id="spEmUser" type="email" value="${escapeHtml(settings.smtp_user)}" placeholder="ваш_адрес@gmail.com" autocomplete="off">
      </label>

      <label class="sp-em-field">
        <span>App Password (16 символов без пробелов)</span>
        <input id="spEmPass" type="text" value="${escapeHtml(settings.smtp_password)}" placeholder="abcdefghijklmnop" autocomplete="off" spellcheck="false">
      </label>

      <label class="sp-em-field">
        <span>Имя отправителя (что увидят получатели)</span>
        <input id="spEmFrom" type="text" value="${escapeHtml(settings.from_name)}" placeholder="SKLADAPLAN">
      </label>

      <label class="sp-em-field">
        <span>Получатели по умолчанию (через запятую)</span>
        <input id="spEmDefault" type="text" value="${escapeHtml(settings.default_recipients)}" placeholder="ivan@mail.ru, petr@mail.ru">
      </label>

      <label class="sp-em-check">
        <input type="checkbox" id="spEmSecure" ${settings.smtp_secure ? 'checked' : ''}>
        <span>Использовать SSL (порт 465). Снимите для TLS (порт 587)</span>
      </label>

      <label class="sp-em-check">
        <input type="checkbox" id="spEmEnabled" ${settings.enabled ? 'checked' : ''}>
        <span>Отправка включена</span>
      </label>

      <div class="sp-em-actions">
        <button type="button" class="sp-em-btn sp-em-btn-primary" id="spEmSave">Сохранить</button>
        <button type="button" class="sp-em-btn sp-em-btn-secondary" id="spEmTest">Отправить тест</button>
      </div>

      <div class="sp-em-help">
        <b>Как получить App Password для Gmail:</b><br>
        1. Откройте <code>myaccount.google.com/security</code> → включите двухэтапную аутентификацию.<br>
        2. Откройте <code>myaccount.google.com/apppasswords</code>.<br>
        3. Создайте пароль для «SKLADAPLAN» — Google покажет 16 символов.<br>
        4. Вставьте их сюда <b>без пробелов</b>. Это не ваш основной пароль.
      </div>
    `;

    document.getElementById('spEmSave')?.addEventListener('click', onSave);
    document.getElementById('spEmTest')?.addEventListener('click', onTest);
  }

  function readForm() {
    return {
      smtp_host: (document.getElementById('spEmHost')?.value || '').trim(),
      smtp_port: Number(document.getElementById('spEmPort')?.value || 465),
      smtp_user: (document.getElementById('spEmUser')?.value || '').trim(),
      smtp_password: (document.getElementById('spEmPass')?.value || '').trim().replace(/\s+/g, ''),
      from_name: (document.getElementById('spEmFrom')?.value || '').trim(),
      default_recipients: (document.getElementById('spEmDefault')?.value || '').trim(),
      smtp_secure: !!document.getElementById('spEmSecure')?.checked,
      enabled: !!document.getElementById('spEmEnabled')?.checked
    };
  }

  async function onSave() {
    const btn = document.getElementById('spEmSave');
    const data = readForm();

    if (data.enabled && (!data.smtp_user || !data.smtp_password)) {
      toast('Для включения заполните логин и App Password', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохранение…';

    try {
      await saveSettings(data);
      settings = { ...settings, ...data };
      toast('Настройки сохранены');
      renderBody();
    } catch (e) {
      console.error('[Email] save error:', e);
      toast('Ошибка: ' + (e.message || 'не удалось сохранить'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Сохранить';
    }
  }

  async function onTest() {
    const btn = document.getElementById('spEmTest');
    const data = readForm();

    if (!data.smtp_user || !data.smtp_password) {
      toast('Сначала заполните логин и App Password', 'error');
      return;
    }

    /* Тестовый получатель — сам себе. Если заданы default_recipients,
       берём первого оттуда. */
    const firstDefault = (data.default_recipients || '')
      .split(',').map(s => s.trim()).filter(Boolean)[0];

    const to = firstDefault || data.smtp_user;

    if (!confirm('Отправить тест на ' + to + '?')) return;

    btn.disabled = true;
    btn.textContent = 'Отправка…';

    try {
      /* Сохраняем настройки перед тестом, чтобы функция их подхватила */
      await saveSettings(data);
      settings = { ...settings, ...data };

      const client = getSupabase();
      const { data: res, error } = await client.functions.invoke('send-email', {
        body: {
          to: to,
          subject: 'SKLADAPLAN — проверка Email',
          text:
            'Это тестовое письмо.\n\n' +
            'Если вы его видите — SMTP настроен правильно.\n\n' +
            'Отправил: ' + (window.state?.user?.email || '—') + '\n' +
            'Время: ' + new Date().toLocaleString('ru-RU')
        }
      });

      if (error) {
        /* Попробуем вытащить тело ошибки */
        let detail = error.message || 'ошибка';
        try {
          if (error.context) {
            const text = await error.context.text();
            const parsed = JSON.parse(text);
            if (parsed?.error) detail = parsed.error;
          }
        } catch (_) {}

        throw new Error(detail);
      }

      if (res && res.ok === false) {
        throw new Error(res.error || 'функция вернула ok: false');
      }

      toast('Тестовое письмо отправлено на ' + to);
    } catch (e) {
      console.error('[Email] test error:', e);
      toast('Ошибка: ' + (e.message || 'не удалось'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить тест';
    }
  }

  async function attachCard() {
    if (document.getElementById(CARD_ID)) return;

    const anchor =
      document.getElementById('spTelegramCard') ||
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
      console.error('[Email] load error:', e);
      const body = document.getElementById('spEmBody');
      if (body) {
        body.innerHTML =
          '<div class="sp-em-loading" style="color:#b42318;">' +
          'Не удалось загрузить настройки.<br>' +
          '<span style="font-size:12px;">' + escapeHtml(e.message || '') + '</span>' +
          '</div>';
      }
    } finally {
      loading = false;
    }

    console.log('[Email] Карточка добавлена');
  }

  function init() {
    injectStyles();

    const tryAttach = () => {
      try { attachCard(); } catch (e) { console.warn('[Email] attach error:', e); }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach, { once: true });
    } else {
      tryAttach();
    }

    /* Не используем MutationObserver — он давал петлю в offline-queue.
       Вместо этого — разовые попытки по таймеру. */
    setTimeout(tryAttach, 500);
    setTimeout(tryAttach, 2000);
    setTimeout(tryAttach, 5000);

    console.log('[Email] Модуль инициализирован');
  }

  init();

  window.spEmail = {
    reload: async () => {
      settings = await loadSettings();
      renderBody();
    },
    getSettings: () => settings,
    version: '1.0.0'
  };

})();
