/* =========================================================
   SKLADAPLAN — УПРАВЛЕНИЕ РОЛЯМИ
   =========================================================

   Что делает:
   - Добавляет карточку «Пользователи и роли» на страницу «Данные».
   - Показывает список назначенных ролей.
   - Админ может назначать / менять / удалять роли.
   - Показывает текущему пользователю его роль.

   Что НЕ делает:
   - Не трогает существующие RLS-политики.
   - Не меняет логику других модулей.
   - Не влияет на текущий доступ к данным (переключим отдельным
     шагом после проверки).
   ========================================================= */

(function () {
  'use strict';

  const CARD_ID    = 'spRolesCard';
  const STYLES_ID  = 'spRolesStyles';
  const MODAL_ID   = 'spRoleModal';
  const LIST_ID    = 'spRolesList';

  const ROLES = [
    { key: 'admin',  label: 'Администратор', hint: 'Полный доступ' },
    { key: 'picker', label: 'Оператор',      hint: 'Работа со складом' },
    { key: 'viewer', label: 'Наблюдатель',   hint: 'Только просмотр' }
  ];

  let cache = [];      /* Список ролей из БД */
  let currentRole = 'admin';

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
      #${CARD_ID} .sp-r-sub {
        margin: 0 0 14px;
        font-size: 13px;
        color: #64748b;
        line-height: 1.4;
      }
      #${CARD_ID} .sp-r-you {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 10px;
        background: #eef2ff;
        color: #1e40af;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 14px;
      }
      #${CARD_ID} .sp-r-you strong { font-weight: 800; }
      #${CARD_ID} .sp-r-you code {
        background: #fff;
        padding: 1px 6px;
        border-radius: 4px;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 12px;
      }

      #${CARD_ID} .sp-r-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        overflow: hidden;
      }
      #${CARD_ID} .sp-r-table th {
        background: #f1f5f9;
        text-align: left;
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: .04em;
        border-bottom: 1px solid #e2e8f0;
      }
      #${CARD_ID} .sp-r-table td {
        padding: 10px 12px;
        font-size: 13px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
      }
      #${CARD_ID} .sp-r-table tr:last-child td { border-bottom: 0; }
      #${CARD_ID} .sp-r-table tr:hover { background: #f8fafc; }

      #${CARD_ID} .sp-r-email {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 12px;
        color: #0f172a;
        word-break: break-all;
      }

      #${CARD_ID} .sp-r-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      #${CARD_ID} .sp-r-badge-admin {
        background: #dcfce7; color: #166534;
      }
      #${CARD_ID} .sp-r-badge-picker {
        background: #dbeafe; color: #1e40af;
      }
      #${CARD_ID} .sp-r-badge-viewer {
        background: #f1f5f9; color: #475569;
      }

      #${CARD_ID} .sp-r-note {
        color: #64748b;
        font-size: 12px;
      }

      #${CARD_ID} .sp-r-actions {
        display: flex;
        gap: 4px;
      }
      #${CARD_ID} .sp-r-icon-btn {
        width: 30px;
        height: 30px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        color: #475569;
        cursor: pointer;
        font-size: 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #${CARD_ID} .sp-r-icon-btn:hover {
        background: #f8fafc;
        border-color: #cbd5e1;
      }
      #${CARD_ID} .sp-r-icon-btn.sp-r-danger:hover {
        background: #fef2f2;
        color: #b42318;
        border-color: #fecaca;
      }

      #${CARD_ID} .sp-r-toolbar {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      #${CARD_ID} .sp-r-add-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--primary, #2563EB);
        color: #fff;
        border: 0;
        border-radius: 9px;
        padding: 9px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      #${CARD_ID} .sp-r-add-btn:hover {
        background: var(--primary-hover, #1D4ED8);
      }
      #${CARD_ID} .sp-r-add-btn:disabled {
        opacity: .5;
        cursor: not-allowed;
      }

      #${CARD_ID} .sp-r-empty {
        text-align: center;
        padding: 22px 16px;
        color: #94a3b8;
        font-size: 13px;
      }
      #${CARD_ID} .sp-r-loading {
        text-align: center;
        padding: 22px 16px;
        color: #64748b;
        font-size: 13px;
      }

      /* Модалка */
      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100004;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-r-modal-card {
        background: #fff;
        border-radius: 14px;
        width: 100%;
        max-width: 460px;
        padding: 22px 22px 18px;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} h3 {
        margin: 0 0 4px;
        font-size: 17px;
        font-weight: 700;
      }
      #${MODAL_ID} .sp-r-modal-sub {
        margin: 0 0 18px;
        font-size: 13px;
        color: #64748b;
      }
      #${MODAL_ID} label {
        display: block;
        margin-bottom: 14px;
      }
      #${MODAL_ID} label > span {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 6px;
      }
      #${MODAL_ID} input,
      #${MODAL_ID} select,
      #${MODAL_ID} textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        padding: 10px 12px;
        font: inherit;
        font-size: 13px;
        outline: none;
        background: #fff;
      }
      #${MODAL_ID} input:focus,
      #${MODAL_ID} select:focus,
      #${MODAL_ID} textarea:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, .1);
      }
      #${MODAL_ID} textarea {
        resize: vertical;
        min-height: 60px;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-r-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }
      #${MODAL_ID} .sp-r-btn {
        border: 0;
        border-radius: 9px;
        padding: 10px 18px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-r-btn-primary {
        background: var(--primary, #2563EB);
        color: #fff;
      }
      #${MODAL_ID} .sp-r-btn-primary:hover {
        background: var(--primary-hover, #1D4ED8);
      }
      #${MODAL_ID} .sp-r-btn-primary:disabled {
        opacity: .5;
        cursor: not-allowed;
      }
      #${MODAL_ID} .sp-r-btn-secondary {
        background: #f1f5f9;
        color: #334155;
        border: 1px solid #e2e8f0;
      }
      #${MODAL_ID} .sp-r-btn-secondary:hover {
        background: #e2e8f0;
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

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    } catch (e) { return ''; }
  }

  function roleLabel(key) {
    const r = ROLES.find(x => x.key === key);
    return r ? r.label : key;
  }

  function roleBadgeClass(key) {
    return 'sp-r-badge sp-r-badge-' + key;
  }

  function isAdmin() {
    return currentRole === 'admin';
  }

  /* =========================================================
     ЗАГРУЗКА
     ========================================================= */

  async function fetchRoles() {
    const { data, error } = await supabaseClient
      .from('user_roles')
      .select('*')
      .order('role', { ascending: true })
      .order('email', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function fetchCurrentRole() {
    /* Сначала локально — по JWT. Так надёжнее и быстрее. */
    const { data, error } = await supabaseClient
      .rpc('current_user_role');
    if (error) {
      console.warn('[Roles] current_user_role error:', error);
      return 'admin';
    }
    return data || 'admin';
  }

  async function reload() {
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    list.innerHTML = `<div class="sp-r-loading">Загрузка…</div>`;

    try {
      const [roles, role] = await Promise.all([
        fetchRoles(),
        fetchCurrentRole()
      ]);
      cache = roles;
      currentRole = role;
      render();
    } catch (err) {
      console.error('[Roles] reload error:', err);
      list.innerHTML = `
        <div class="sp-r-empty">
          Не удалось загрузить роли.<br>
          <span style="font-size:12px;">${escapeHtml(err.message || '')}</span>
        </div>
      `;
    }
  }

  /* =========================================================
     РЕНДЕР
     ========================================================= */

  function render() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;

    /* Обновляем плашку «Ваша роль» */
    const you = card.querySelector('.sp-r-you');
    if (you) {
      const me = window.state?.user?.email || '—';
      you.innerHTML = `
        Ваша роль: <strong>${escapeHtml(roleLabel(currentRole))}</strong>
        · <code>${escapeHtml(me)}</code>
      `;
    }

    /* Кнопка «Добавить» — только для админа */
    const addBtn = card.querySelector('.sp-r-add-btn');
    if (addBtn) {
      addBtn.disabled = !isAdmin();
      addBtn.style.display = isAdmin() ? 'inline-flex' : 'none';
    }

    const list = document.getElementById(LIST_ID);
    if (!list) return;

    if (!cache.length) {
      list.innerHTML = `
        <div class="sp-r-empty">
          Роли никому не назначены. Пока это значит: все пользователи — администраторы.
          Назначьте роли, чтобы ограничить доступ.
        </div>
      `;
      return;
    }

    list.innerHTML = `
      <table class="sp-r-table">
        <thead>
          <tr>
            <th>Email</th>
            <th style="width:140px;">Роль</th>
            <th style="width:180px;">Заметка</th>
            <th style="width:110px;">Изменено</th>
            <th style="width:80px;"></th>
          </tr>
        </thead>
        <tbody>
          ${cache.map(r => `
            <tr>
              <td class="sp-r-email">${escapeHtml(r.email)}</td>
              <td>
                <span class="${roleBadgeClass(r.role)}">
                  ${escapeHtml(roleLabel(r.role))}
                </span>
              </td>
              <td class="sp-r-note">${escapeHtml(r.note || '—')}</td>
              <td class="sp-r-note">${escapeHtml(formatDate(r.updated_at))}</td>
              <td>
                ${isAdmin() ? `
                  <div class="sp-r-actions">
                    <button
                      type="button"
                      class="sp-r-icon-btn"
                      data-role-edit="${escapeHtml(r.email)}"
                      title="Изменить"
                    >✎</button>
                    <button
                      type="button"
                      class="sp-r-icon-btn sp-r-danger"
                      data-role-delete="${escapeHtml(r.email)}"
                      title="Удалить роль"
                    >×</button>
                  </div>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    /* Обработчики */
    list.querySelectorAll('[data-role-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const email = btn.getAttribute('data-role-edit');
        const row = cache.find(x => x.email === email);
        openModal(row);
      });
    });

    list.querySelectorAll('[data-role-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.getAttribute('data-role-delete');
        if (!confirm(`Удалить роль для «${email}»?\n\nПользователь снова станет администратором (по умолчанию).`)) return;

        try {
          const { error } = await supabaseClient
            .from('user_roles')
            .delete()
            .eq('email', email);
          if (error) throw error;
          if (window.toast) window.toast('Роль удалена');
          await reload();
        } catch (err) {
          console.error('[Roles] delete error:', err);
          if (window.toast) window.toast('Не удалось удалить: ' + (err.message || 'ошибка'), 'error');
        }
      });
    });
  }

  /* =========================================================
     МОДАЛКА
     ========================================================= */

  function openModal(existing) {
    closeModal();

    const isEdit = !!(existing && existing.email);

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-r-modal-card">
        <h3>${isEdit ? 'Изменить роль' : 'Назначить роль'}</h3>
        <p class="sp-r-modal-sub">
          Роль определяет, что пользователь может делать в SKLADAPLAN.
          Пока действует только отображение — RLS будет переключён отдельным шагом.
        </p>

        <label>
          <span>Email пользователя</span>
          <input
            id="spRoleEmail"
            type="email"
            placeholder="user@example.com"
            value="${isEdit ? escapeHtml(existing.email) : ''}"
            ${isEdit ? 'readonly style="background:#f8fafc;color:#64748b;"' : ''}
          >
        </label>

        <label>
          <span>Роль</span>
          <select id="spRoleSelect">
            ${ROLES.map(r => `
              <option value="${r.key}" ${isEdit && existing.role === r.key ? 'selected' : ''}>
                ${r.label} — ${r.hint}
              </option>
            `).join('')}
          </select>
        </label>

        <label>
          <span>Заметка (необязательно)</span>
          <textarea
            id="spRoleNote"
            placeholder="Например: Иван Петров, кладовщик"
          >${isEdit ? escapeHtml(existing.note || '') : ''}</textarea>
        </label>

        <div class="sp-r-modal-actions">
          <button type="button" class="sp-r-btn sp-r-btn-secondary" id="spRoleCancel">
            Отмена
          </button>
          <button type="button" class="sp-r-btn sp-r-btn-primary" id="spRoleSave">
            ${isEdit ? 'Сохранить' : 'Назначить'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });
    document.getElementById('spRoleCancel').addEventListener('click', closeModal);

    const escHandler = e => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    document.getElementById('spRoleSave').addEventListener('click', async () => {
      const email = (document.getElementById('spRoleEmail')?.value || '').trim().toLowerCase();
      const role = document.getElementById('spRoleSelect')?.value;
      const note = (document.getElementById('spRoleNote')?.value || '').trim();

      if (!email || email.indexOf('@') === -1) {
        if (window.toast) window.toast('Введите корректный email', 'error');
        return;
      }

      const btn = document.getElementById('spRoleSave');
      btn.disabled = true;
      btn.textContent = 'Сохранение…';

      try {
        const payload = {
          email,
          role,
          note,
          updated_at: new Date().toISOString(),
          updated_by: window.state?.user?.email || null
        };

        const { error } = await supabaseClient
          .from('user_roles')
          .upsert(payload, { onConflict: 'email' });

        if (error) throw error;

        if (window.toast) window.toast(isEdit ? 'Роль обновлена' : 'Роль назначена');
        closeModal();
        await reload();
      } catch (err) {
        console.error('[Roles] save error:', err);
        if (window.toast) window.toast('Не удалось сохранить: ' + (err.message || 'ошибка'), 'error');
        btn.disabled = false;
        btn.textContent = isEdit ? 'Сохранить' : 'Назначить';
      }
    });
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  /* =========================================================
     КАРТОЧКА НА СТРАНИЦЕ «ДАННЫЕ»
     ========================================================= */

  function buildCard() {
    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'sp-card';
    card.style.marginBottom = '16px';
    card.innerHTML = `
      <h3>🔑 Пользователи и роли</h3>
      <p class="sp-r-sub">
        Кто и что может делать в SKLADAPLAN. Изменять роли может только администратор.
      </p>

      <div class="sp-r-you">Ваша роль: <strong>…</strong></div>

      <div class="sp-r-toolbar">
        <div class="sp-r-note">Список назначенных ролей</div>
        <button type="button" class="sp-r-add-btn">
          + Назначить роль
        </button>
      </div>

      <div id="${LIST_ID}">
        <div class="sp-r-loading">Загрузка…</div>
      </div>
    `;

    card.querySelector('.sp-r-add-btn').addEventListener('click', () => openModal(null));

    return card;
  }

  function attachCard() {
    if (document.getElementById(CARD_ID)) return;

    /* Куда вставлять: после карточки «История и аналитика», если она есть,
       иначе — после карточки «Аккаунт». */
    const anchor =
      document.getElementById('spDataToolsCard') ||
      document.querySelector('#logoutBtn')?.closest('.sp-card');

    if (!anchor) return;

    const card = buildCard();
    anchor.insertAdjacentElement('afterend', card);

    /* Асинхронная загрузка */
    reload();

    console.log('[Roles] Карточка добавлена на страницу «Данные»');
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function init() {
    injectStyles();

    const tryAttach = () => {
      try { attachCard(); } catch (e) { console.warn('[Roles] attach:', e); }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach, { once: true });
    } else {
      tryAttach();
    }

    const obs = new MutationObserver(tryAttach);
    obs.observe(document.body, { childList: true, subtree: true });

    console.log('[Roles] Модуль инициализирован');
  }

  init();

  window.spRoles = {
    reload,
    open: () => openModal(null),
    version: '1.0.0'
  };

})();
