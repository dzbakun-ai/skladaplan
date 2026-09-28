/* =========================================================
   SKLADAPLAN — UI-РОЛИ
   =========================================================

   Что делает:
   - Читает роль текущего пользователя из БД (user_roles).
   - Подменяет getCurrentUserRole() → весь app.js теперь
     видит реальную роль.
   - Для viewer отключает все edit-кнопки.
   - Для picker и viewer скрывает admin-only элементы.
   - Добавляет бейдж роли в сайдбар.

   Важно про supabaseClient:
   В app.js он объявлен как `const supabaseClient`, поэтому
   НЕ доступен через window.supabaseClient. Но доступен
   по имени `supabaseClient` напрямую — классические
   скрипты в одном глобальном лексическом окружении.
   Этот модуль обращается к нему безопасно — через
   проверку typeof.
   ========================================================= */

(function () {
  'use strict';

  let cachedRole = null;
  let loadPromise = null;
  let installed = false;

  const EDITABLE_SELECTORS = [
    '#createPickingBtn', '#requestImportBtn', '#importRequestBtn',
    '#requestFile', '#requestExcelInput', '#requestBarcodes',
    '#addBoxBtn', '#deleteSelectedBtn', '#markPickBtn',
    '#setDirectionFromBaseBtn',
    '#completeSelectedAssembly', '#removeFromAssemblyBtn',
    '#setCollectedDirectionBtn', '#shipCollectedBtn',
    '#shipBtn', '#shipSelectedBtn', '#completeShipmentBtn',
    '#receiveBtn', '#receivePalletBtn', '#saveReceivingBtn',
    '#scanReceiveBtn',
    '#moveBtn', '#moveSelectedBtn', '#saveMoveBtn',
    '#optimizationApplyBtn'
  ];

  const ADMIN_ONLY_SELECTORS = [
    '#spRolesCard',
    '#deleteSelectedBtn'
  ];

  /* =========================================================
     ДОСТУП К SUPABASE-КЛИЕНТУ
     ========================================================= */

  function getSupabase() {
    /* 1. Попытка через глобальное имя (const в app.js) */
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        return supabaseClient;
      }
    } catch (e) { /* не определён — игнорируем */ }

    /* 2. Через window (если кто-то явно положил туда) */
    if (window.supabaseClient) return window.supabaseClient;

    /* 3. Создаём свой клиент с теми же параметрами,
          что и в app.js. Ключи публичные (sb_publishable_*),
          их можно безопасно дублировать. */
    try {
      if (window.supabase && window.supabase.createClient) {
        const url = 'https://ithhecprdosvjiddoalq.supabase.co';
        const key = 'sb_publishable_0dB5DQt2_ysOohx42IN4rA_mnypLeOR';
        const client = window.supabase.createClient(url, key);
        console.log('[UIRoles] Создан резервный клиент Supabase');
        return client;
      }
    } catch (e) {
      console.warn('[UIRoles] Не удалось создать резервный клиент:', e);
    }

    return null;
  }

  /* =========================================================
     ЗАГРУЗКА РОЛИ
     ========================================================= */

  async function loadRole() {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const client = getSupabase();

        if (!client) {
          console.warn('[UIRoles] Клиент Supabase недоступен — fallback admin');
          cachedRole = 'admin';
          return cachedRole;
        }

        const { data, error } = await client.rpc('current_user_role');

        if (error) throw error;

        cachedRole = data || 'admin';
        console.log('[UIRoles] Роль из БД:', cachedRole);

      } catch (e) {
        console.warn('[UIRoles] Не удалось получить роль, fallback admin:', e);
        cachedRole = 'admin';

        /* Тихий тост — чтобы администратор узнал, если роли сломались */
        if (typeof window.toast === 'function') {
          try {
            window.toast('Не удалось применить роль. Работаем в режиме администратора.', 'error');
          } catch (err) { /* ignore */ }
        }
      }
      return cachedRole;
    })();

    return loadPromise;
  }

  /* =========================================================
     ПОДМЕНА ФУНКЦИЙ
     ========================================================= */

  function installOverrides() {
    if (installed) return;

    /* getCurrentUserRole обычно становится свойством window
       (function declaration в классическом скрипте) —
       но берём через typeof, чтобы не полагаться на это */
    const originalGetRole =
      (typeof window.getCurrentUserRole === 'function' && window.getCurrentUserRole) ||
      (typeof getCurrentUserRole === 'function' && getCurrentUserRole) ||
      null;

    if (!originalGetRole) {
      console.warn('[UIRoles] getCurrentUserRole не найдена — overrides не установлены');
      return;
    }

    /* 1. getCurrentUserRole → возвращает кэшированную роль */
    window.getCurrentUserRole = function () {
      if (cachedRole) return cachedRole;
      try {
        return originalGetRole();
      } catch (e) {
        return 'admin';
      }
    };

    /* 2. applyViewerPermissions → своя версия с 3 ролями */
    window.applyViewerPermissions = function () {
      const role = cachedRole || 'admin';

      /* Снимаем все прошлые ограничения */
      document.querySelectorAll('.viewer-disabled').forEach(el => {
        el.classList.remove('viewer-disabled');
        el.removeAttribute('aria-disabled');
        if ('disabled' in el) el.disabled = false;
        if (el.matches && el.matches('input, textarea, select')) el.readOnly = false;
      });

      document.body.classList.remove('viewer-mode', 'role-admin', 'role-picker', 'role-viewer');
      document.body.classList.add('role-' + role);

      /* viewer — блокируем редактирование */
      if (role === 'viewer') {
        document.body.classList.add('viewer-mode');

        EDITABLE_SELECTORS.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            if ('disabled' in el) el.disabled = true;
            el.classList.add('viewer-disabled');
            el.setAttribute('aria-disabled', 'true');
            if (el.matches && el.matches('input[type="file"]')) el.value = '';
          });
        });

        document.querySelectorAll('.viewer-edit-only').forEach(el => {
          if ('disabled' in el) el.disabled = true;
          el.classList.add('viewer-disabled');
        });
      }

      /* picker и viewer — скрываем admin-only элементы */
      const hideAdminOnly = role !== 'admin';

      ADMIN_ONLY_SELECTORS.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          el.style.display = hideAdminOnly ? 'none' : '';
        });
      });
    };

    installed = true;
    console.log('[UIRoles] Overrides установлены');
  }

  /* =========================================================
     БЕЙДЖ РОЛИ В САЙДБАРЕ
     ========================================================= */

  function updateSidebarBadge() {
    const foot = document.querySelector('.sidebar-foot');
    if (!foot) return;

    let badge = foot.querySelector('.sp-role-badge');

    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'sp-role-badge';
      badge.style.cssText = 'margin-bottom:10px;';

      const offline = foot.querySelector('.offline');
      if (offline) foot.insertBefore(badge, offline);
      else foot.appendChild(badge);
    }

    const role = cachedRole || 'admin';
    const labels = { admin: 'Администратор', picker: 'Оператор', viewer: 'Наблюдатель' };
    const colors = { admin: '#10b981', picker: '#2563EB', viewer: '#94a3b8' };

    badge.innerHTML = `
      <div style="
        display:inline-flex;align-items:center;gap:6px;
        padding:6px 10px;
        background:rgba(255,255,255,.06);
        border-radius:8px;
        font-size:11px;color:#cbd5e1;
      ">
        <span style="
          width:6px;height:6px;border-radius:50%;
          background:${colors[role] || '#94a3b8'};
          display:inline-block;
        "></span>
        ${labels[role] || role}
      </div>
    `;
  }

  /* =========================================================
     ПРИМЕНЕНИЕ
     ========================================================= */

  async function apply() {
    await loadRole();
    installOverrides();

    if (typeof window.applyViewerPermissions === 'function') {
      window.applyViewerPermissions();
    }

    updateSidebarBadge();

    console.log('[UIRoles] Роль применена:', cachedRole);
  }

  /* =========================================================
     ПЕРЕПРИМЕНЕНИЕ ПОСЛЕ КАЖДОГО render()
     ========================================================= */

  let watchStarted = false;

  function watchContent() {
    if (watchStarted) return;

    const target = document.getElementById('content');
    if (!target) {
      setTimeout(watchContent, 500);
      return;
    }

    watchStarted = true;

    let debounce = null;

    const obs = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (typeof window.applyViewerPermissions === 'function') {
          window.applyViewerPermissions();
        }
      }, 50);
    });

    obs.observe(target, { childList: true, subtree: true });
    console.log('[UIRoles] MutationObserver на #content запущен');
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function init() {
    /* Перезагрузка роли при смене пользователя */
    const client = getSupabase();
    if (client && client.auth && client.auth.onAuthStateChange) {
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          cachedRole = null;
          loadPromise = null;
          installed = false; /* тоже сбрасываем — переустановим override */
          setTimeout(apply, 800);
        }
        if (event === 'SIGNED_OUT') {
          cachedRole = null;
          loadPromise = null;
        }
      });
    }

    /* Многоразовая попытка — на случай медленной сети
       и поздней загрузки app.js */
    setTimeout(apply, 1000);
    setTimeout(apply, 2500);
    setTimeout(apply, 5000);
    setTimeout(apply, 9000);

    watchContent();

    console.log('[UIRoles] Модуль инициализирован');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  /* Публичный API */
  window.spUIRoles = {
    apply,
    getRole: () => cachedRole,
    reload: async () => {
      cachedRole = null;
      loadPromise = null;
      installed = false;
      await apply();
    },
    version: '1.1.0'
  };

})();
