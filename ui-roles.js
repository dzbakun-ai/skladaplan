/* =========================================================
   SKLADAPLAN — UI-РОЛИ
   =========================================================

   Что делает:
   - Читает роль текущего пользователя из БД (user_roles).
   - Подменяет getCurrentUserRole() → весь app.js теперь
     видит реальную роль.
   - Для viewer отключает все edit-кнопки (через существующий
     applyViewerPermissions в app.js).
   - Для picker и viewer скрывает admin-only элементы
     (карточка ролей, кнопки удаления).
   - Добавляет бейдж роли в сайдбар.

   Что НЕ делает:
   - Не трогает app.js — только подменяет одну функцию.
   - Если RPC недоступна — fallback на admin (безопасно).
   ========================================================= */

(function () {
  'use strict';

  /* Роль ещё не загружена = null. Все проверки ниже
     пока возвращают admin, чтобы не блокировать UI до
     получения ответа от Supabase. */
  let cachedRole = null;
  let loadPromise = null;
  let installed = false;

  /* Копия списка edit-элементов из app.js.
     Дублируем, чтобы модуль не зависел от внутренней
     области видимости app.js. */
  const EDITABLE_SELECTORS = [
    '#createPickingBtn',
    '#requestImportBtn',
    '#importRequestBtn',
    '#requestFile',
    '#requestExcelInput',
    '#requestBarcodes',
    '#addBoxBtn',
    '#deleteSelectedBtn',
    '#markPickBtn',
    '#setDirectionFromBaseBtn',
    '#completeSelectedAssembly',
    '#removeFromAssemblyBtn',
    '#setCollectedDirectionBtn',
    '#shipCollectedBtn',
    '#shipBtn',
    '#shipSelectedBtn',
    '#completeShipmentBtn',
    '#receiveBtn',
    '#receivePalletBtn',
    '#saveReceivingBtn',
    '#scanReceiveBtn',
    '#moveBtn',
    '#moveSelectedBtn',
    '#saveMoveBtn',
    '#optimizationApplyBtn'  /* применяет план — изменение БД */
  ];

  /* Элементы, которые видны только админам */
  const ADMIN_ONLY_SELECTORS = [
    '#spRolesCard',
    '#deleteSelectedBtn'
  ];

  /* =========================================================
     ЗАГРУЗКА РОЛИ
     ========================================================= */

  async function loadRole() {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const { data, error } = await window.supabaseClient.rpc('current_user_role');
        if (error) throw error;
        cachedRole = data || 'admin';
      } catch (e) {
        console.warn('[UIRoles] Не удалось получить роль, fallback на admin:', e);
        cachedRole = 'admin';
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
    if (typeof window.getCurrentUserRole !== 'function') return;

    const originalGetRole = window.getCurrentUserRole;

    /* 1. getCurrentUserRole → возвращает кэшированную роль.
       app.js использует её в isViewer(), isAdmin(), canEdit(). */
    window.getCurrentUserRole = function () {
      if (cachedRole) return cachedRole;
      /* Пока роль не загружена — берём оригинальную логику */
      return originalGetRole ? originalGetRole() : 'admin';
    };

    /* 2. applyViewerPermissions → переписываем на свою версию.
       Умеет три режима: admin / picker / viewer. */
    window.applyViewerPermissions = function () {
      const role = cachedRole || 'admin';

      /* Снимаем все ранее навешанные ограничения */
      document.querySelectorAll('.viewer-disabled').forEach(el => {
        el.classList.remove('viewer-disabled');
        el.removeAttribute('aria-disabled');
        if ('disabled' in el) el.disabled = false;
        if (el.matches('input, textarea, select')) el.readOnly = false;
      });

      document.body.classList.remove('viewer-mode', 'role-admin', 'role-picker', 'role-viewer');
      document.body.classList.add('role-' + role);

      /* viewer — блокируем всё редактирование */
      if (role === 'viewer') {
        document.body.classList.add('viewer-mode');

        EDITABLE_SELECTORS.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            if ('disabled' in el) el.disabled = true;
            el.classList.add('viewer-disabled');
            el.setAttribute('aria-disabled', 'true');
            if (el.matches('input[type="file"]')) el.value = '';
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
      /* Debounce 50мс — не дёргать права на каждый мелкий чих */
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
    /* Следим за auth — при входе перезагружаем роль */
    if (window.supabaseClient) {
      window.supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          cachedRole = null;
          loadPromise = null;
          setTimeout(apply, 800);
        }
        if (event === 'SIGNED_OUT') {
          cachedRole = null;
          loadPromise = null;
        }
      });
    }

    /* Первый запуск — если сессия уже была */
    setTimeout(apply, 1000);
    setTimeout(apply, 2500);
    setTimeout(apply, 5000);  /* третий раз — для медленных сетей */

    watchContent();

    console.log('[UIRoles] Модуль инициализирован');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  /* Публичный API — для отладки и ручного вызова */
  window.spUIRoles = {
    apply,
    getRole: () => cachedRole,
    reload: async () => {
      cachedRole = null;
      loadPromise = null;
      await apply();
    },
    version: '1.0.0'
  };

})();
