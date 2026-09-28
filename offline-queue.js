/* =========================================================
   SKLADAPLAN — ОФЛАЙН-ОЧЕРЕДЬ
   =========================================================

   Что делает:
   - Показывает статус сети в шапке (online/offline).
   - Перехватывает write-запросы к Supabase (POST/PUT/
     PATCH/DELETE). Если сеть упала — сохраняет в IndexedDB.
   - При восстановлении связи — показывает баннер с кнопкой
     "Повторить", через которую оператор отправляет очередь.

   Что НЕ делает:
   - Не трогает другие модули.
   - Не эмулирует "успех" — если запрос упал, он в очереди,
     но оператор это видит.
   - Не отправляет ничего автоматически без согласия.

   Изоляция:
   - Обёртка над window.fetch. Только Supabase write.
   - Auth и Storage не затрагиваются (они через отдельные пути).
   - Если что-то пойдёт не так — очередь можно очистить
     без последствий.
   ========================================================= */

(function () {
  'use strict';

  const STYLES_ID = 'spOfflineQueueStyles';
  const INDICATOR_ID = 'spNetIndicator';
  const MODAL_ID = 'spOfflineQueueModal';
  const DB_NAME = 'skladaplan-offline';
  const DB_VERSION = 1;
  const STORE_NAME = 'queue';

  const PING_INTERVAL_MS = 15000;
  const PING_TIMEOUT_MS = 3000;

  let dbPromise = null;
  let isOnline = navigator.onLine;
  let pingTimer = null;
  let originalFetch = null;
  let installed = false;
  let pendingCount = 0;

  /* =========================================================
     СТИЛИ
     ========================================================= */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${INDICATOR_ID} {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        transition: background .15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      #${INDICATOR_ID}.is-online {
        background: #dcfce7;
        color: #166534;
      }
      #${INDICATOR_ID}.is-offline {
        background: #fee2e2;
        color: #991b1b;
      }
      #${INDICATOR_ID}.has-pending {
        background: #fef3c7;
        color: #92400e;
      }
      #${INDICATOR_ID} .sp-net-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
      }
      #${INDICATOR_ID}.is-online .sp-net-dot { background: #10b981; }
      #${INDICATOR_ID}.is-offline .sp-net-dot { background: #ef4444; animation: spNetPulse 1.2s ease infinite; }
      #${INDICATOR_ID}.has-pending .sp-net-dot { background: #f59e0b; animation: spNetPulse 1.5s ease infinite; }
      @keyframes spNetPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .35; }
      }

      /* Модалка очереди */
      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100006;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-off-card {
        background: #fff;
        border-radius: 16px;
        width: 100%;
        max-width: 640px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-off-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-off-head h3 {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
      }
      #${MODAL_ID} .sp-off-close {
        border: 0;
        background: #f3f3f3;
        width: 34px; height: 34px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: #444;
      }
      #${MODAL_ID} .sp-off-body {
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
      }
      #${MODAL_ID} .sp-off-intro {
        padding: 12px 14px;
        border-radius: 10px;
        background: #fffbeb;
        color: #92400e;
        font-size: 13px;
        line-height: 1.55;
        margin-bottom: 16px;
      }
      #${MODAL_ID} .sp-off-intro.ok {
        background: #ecfdf5;
        color: #065f46;
      }
      #${MODAL_ID} .sp-off-intro.empty {
        background: #f1f5f9;
        color: #475569;
      }
      #${MODAL_ID} .sp-off-item {
        padding: 12px 14px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        margin-bottom: 8px;
        background: #fff;
      }
      #${MODAL_ID} .sp-off-item-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 5px;
      }
      #${MODAL_ID} .sp-off-item-title {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
      }
      #${MODAL_ID} .sp-off-item-meta {
        font-size: 11px;
        color: #94a3b8;
      }
      #${MODAL_ID} .sp-off-item-method {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        font-family: ui-monospace, Menlo, monospace;
        background: #f1f5f9;
        color: #475569;
      }
      #${MODAL_ID} .sp-off-item-path {
        font-family: ui-monospace, Menlo, monospace;
        font-size: 11px;
        color: #64748b;
        word-break: break-all;
        margin-top: 3px;
      }
      #${MODAL_ID} .sp-off-item-error {
        margin-top: 6px;
        padding: 6px 8px;
        border-radius: 6px;
        background: #fef2f2;
        color: #991b1b;
        font-size: 11px;
      }
      #${MODAL_ID} .sp-off-item-actions {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }
      #${MODAL_ID} .sp-off-item-btn {
        border: 1px solid #e2e8f0;
        background: #fff;
        color: #334155;
        border-radius: 7px;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-off-item-btn:hover {
        background: #f8fafc;
      }
      #${MODAL_ID} .sp-off-item-btn.sp-off-danger {
        color: #b42318;
        border-color: #fecaca;
      }
      #${MODAL_ID} .sp-off-item-btn.sp-off-danger:hover {
        background: #fef2f2;
      }
      #${MODAL_ID} .sp-off-foot {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding: 12px 20px;
        border-top: 1px solid #eef1f4;
        background: #fafbfc;
      }
      #${MODAL_ID} .sp-off-primary {
        border: 0;
        background: var(--primary, #2563EB);
        color: #fff;
        border-radius: 9px;
        padding: 10px 18px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-off-primary:hover {
        background: var(--primary-hover, #1D4ED8);
      }
      #${MODAL_ID} .sp-off-primary:disabled {
        opacity: .5;
        cursor: not-allowed;
      }
      #${MODAL_ID} .sp-off-secondary {
        border: 1px solid #e2e8f0;
        background: #f1f5f9;
        color: #334155;
        border-radius: 9px;
        padding: 10px 18px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-off-secondary:hover {
        background: #e2e8f0;
      }

      @media (max-width: 640px) {
        #${INDICATOR_ID} {
          padding: 5px 9px;
          font-size: 11px;
        }
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-off-card {
          max-width: none;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
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

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'success');
    else console.log('[OfflineQueue]', msg);
  }

  function getSupabaseUrl() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient?.supabaseUrl) {
        return supabaseClient.supabaseUrl;
      }
    } catch (e) {}
    /* Fallback: парсим из app.js — там константа */
    return 'https://ithhecprdosvjiddoalq.supabase.co';
  }

  function getSupabaseKey() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient?.supabaseKey) {
        return supabaseClient.supabaseKey;
      }
    } catch (e) {}
    return 'sb_publishable_0dB5DQt2_ysOohx42IN4rA_mnypLeOR';
  }

  /* =========================================================
     INDEXEDDB
     ========================================================= */

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('created_at', 'created_at', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return dbPromise;
  }

  async function dbAdd(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function dbClear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /* =========================================================
     РАСПОЗНАВАНИЕ ЗАПРОСОВ
     ========================================================= */

  /* Write-запросы к Supabase, которые можно складывать в очередь */
  function isQueueable(input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = (
      init?.method ||
      (typeof input !== 'string' && input?.method) ||
      'GET'
    ).toUpperCase();

    const supaUrl = getSupabaseUrl();
    if (!url.startsWith(supaUrl)) return false;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;

    /* Аутентификацию и Storage — не трогаем */
    if (url.includes('/auth/v1/')) return false;
    if (url.includes('/storage/v1/')) return false;

    return true;
  }

  /* Человекочитаемое описание операции */
  function describeOperation(url, method) {
    const path = url.split('/rest/v1/')[1] || '';
    const [rawTable] = path.split('?');

    const table = rawTable.replace(/^\//, '');

    const tableLabels = {
      'boxes': 'Коробки',
      'tasks': 'Задачи',
      'planner_tasks': 'Задачи планировщика',
      'planner_shipments': 'Отгрузки планировщика',
      'pallet_notes': 'Заметки поддонов',
      'telegram_users': 'Пользователи бота'
    };

    const methodLabels = {
      'POST': 'Создание',
      'PUT': 'Обновление',
      'PATCH': 'Обновление',
      'DELETE': 'Удаление'
    };

    /* RPC */
    const rpcMatch = rawTable.match(/^rpc\/(.+)$/);
    if (rpcMatch) {
      const rpcLabels = {
        'sp_collect_boxes': 'Комплектация коробок',
        'sp_ship_boxes': 'Отгрузка коробок',
        'sp_move_boxes': 'Перемещение коробок',
        'sp_merge_pallets': 'Объединение паллет',
        'sp_apply_inventory': 'Применение инвентаризации',
        'sp_apply_warehouse_optimization': 'Оптимизация склада'
      };
      return rpcLabels[rpcMatch[1]] || `RPC: ${rpcMatch[1]}`;
    }

    return `${methodLabels[method] || method} · ${tableLabels[table] || table}`;
  }

  /* =========================================================
     ОБЁРТКА FETCH
     ========================================================= */

  function installFetchWrapper() {
    if (installed) return;
    if (typeof window.fetch !== 'function') return;

    originalFetch = window.fetch.bind(window);

    window.fetch = async function spOfflineFetch(input, init) {
      const queueable = isQueueable(input, init);

      try {
        const response = await originalFetch(input, init);

        /* Успешно — если сеть была офлайн, помечаем как online */
        if (!isOnline) markOnline();

        return response;

      } catch (error) {
        /* Ошибка сети. Если это auth/storage/read — просто пробрасываем */
        if (!queueable) {
          /* Сетевые ошибки для GET — тоже маркер офлайна */
          if (isNetworkError(error)) markOffline();
          throw error;
        }

        /* Сетевой сбой → в очередь */
        if (isNetworkError(error)) {
          markOffline();

          const url = typeof input === 'string' ? input : input.url;
          const method = (
            init?.method ||
            (typeof input !== 'string' && input?.method) ||
            'GET'
          ).toUpperCase();

          const headers = {};
          if (init?.headers) {
            if (init.headers instanceof Headers) {
              init.headers.forEach((v, k) => { headers[k] = v; });
            } else if (typeof init.headers === 'object') {
              Object.assign(headers, init.headers);
            }
          }

          const body = init?.body;

          let bodyText = null;
          if (typeof body === 'string') bodyText = body;
          else if (body && typeof body.text === 'function') bodyText = await body.text();
          else if (body) bodyText = JSON.stringify(body);

          const entry = {
            url,
            method,
            headers,
            body: bodyText,
            label: describeOperation(url, method),
            error: String(error.message || error).slice(0, 300),
            created_at: new Date().toISOString()
          };

          try {
            await dbAdd(entry);
            await refreshPendingCount();
            console.log('[OfflineQueue] Запрос поставлен в очередь:', entry.label);
            toast('Нет сети. Действие сохранено в очередь для повторной отправки.', 'error');
          } catch (dbErr) {
            console.error('[OfflineQueue] Не удалось сохранить в очередь:', dbErr);
          }

          /* Возвращаем "ошибку", чтобы вызывающий код не считал что успех */
          throw error;
        }

        throw error;
      }
    };

    installed = true;
    console.log('[OfflineQueue] Обёртка fetch установлена');
  }

  function isNetworkError(error) {
    if (!error) return false;
    /* Fetch при недоступности сети кидает TypeError */
    if (error instanceof TypeError) return true;
    if (error.name === 'AbortError') return false; /* таймаут клиента — не сетевой */
    if (String(error.message || '').includes('Failed to fetch')) return true;
    if (String(error.message || '').includes('NetworkError')) return true;
    if (String(error.message || '').includes('Load failed')) return true;
    return false;
  }

  /* =========================================================
     ПОВТОРНАЯ ОТПРАВКА
     ========================================================= */

  async function retryEntry(entry) {
    const { url, method, headers, body } = entry;

    const opts = {
      method,
      headers: headers || {}
    };

    if (body) opts.body = body;

    const response = await originalFetch(url, opts);

    /* Любой ответ сервера (даже 4xx) — значит сеть есть,
       операция обработана. Убираем из очереди. */
    return response;
  }

  async function retryAll() {
    const items = await dbGetAll();

    if (!items.length) {
      toast('Очередь пуста');
      return { ok: 0, fail: 0 };
    }

    let ok = 0;
    let fail = 0;
    const failedItems = [];

    for (const item of items) {
      try {
        await retryEntry(item);
        await dbDelete(item.id);
        ok++;
      } catch (e) {
        /* Если снова сетевая ошибка — оставляем в очереди */
        if (isNetworkError(e)) {
          failedItems.push(item);
          fail++;
          break; /* дальше нет смысла пытаться */
        } else {
          /* Другая ошибка — значит сервер ответил, но с ошибкой.
             Убираем из очереди, чтобы не зациклиться. */
          await dbDelete(item.id);
          console.warn('[OfflineQueue] Операция удалена из очереди с ошибкой:', e.message);
        }
      }
    }

    await refreshPendingCount();
    return { ok, fail, remaining: failedItems.length };
  }

  async function retryOne(id) {
    const items = await dbGetAll();
    const item = items.find(x => x.id === id);
    if (!item) return;

    try {
      await retryEntry(item);
      await dbDelete(id);
      toast('Операция отправлена');
      await refreshPendingCount();
      renderQueueModal();
    } catch (e) {
      if (isNetworkError(e)) {
        toast('Сеть всё ещё недоступна', 'error');
      } else {
        await dbDelete(id);
        toast('Сервер вернул ошибку — операция удалена из очереди', 'error');
        await refreshPendingCount();
        renderQueueModal();
      }
    }
  }

  async function dropOne(id) {
    await dbDelete(id);
    await refreshPendingCount();
    renderQueueModal();
  }

  async function dropAll() {
    if (!confirm('Удалить все операции из очереди без отправки?\n\nДанные, которые не сохранились, будут потеряны.')) return;
    await dbClear();
    await refreshPendingCount();
    toast('Очередь очищена');
    renderQueueModal();
  }

  /* =========================================================
     МОНИТОРИНГ СЕТИ
     ========================================================= */

  function markOnline() {
    if (isOnline) return;
    isOnline = true;
    updateIndicator();
    console.log('[OfflineQueue] Сеть восстановлена');
    maybeSuggestSync();
  }

  function markOffline() {
    if (!isOnline) return;
    isOnline = false;
    updateIndicator();
    console.log('[OfflineQueue] Сеть недоступна');
  }

  async function ping() {
    const url = `${getSupabaseUrl()}/auth/v1/health`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

    try {
      await originalFetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { apikey: getSupabaseKey() }
      });
      clearTimeout(timer);
      markOnline();
      return true;
    } catch (e) {
      clearTimeout(timer);
      markOffline();
      return false;
    }
  }

  function startPing() {
    if (pingTimer) return;

    /* Первый пинг — сразу */
    ping();

    pingTimer = setInterval(ping, PING_INTERVAL_MS);
  }

  window.addEventListener('online', () => {
    /* Событие online — оптимистично, но всё равно пингуем */
    ping();
  });

  window.addEventListener('offline', () => {
    markOffline();
  });

  /* =========================================================
     ИНДИКАТОР СЕТИ
     ========================================================= */

  function ensureIndicator() {
    if (document.getElementById(INDICATOR_ID)) return;

    const topActions = document.getElementById('topActions');
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;

    const el = document.createElement('button');
    el.id = INDICATOR_ID;
    el.type = 'button';
    el.title = 'Статус сети. Нажмите, чтобы открыть очередь.';
    el.innerHTML = `<span class="sp-net-dot"></span><span class="sp-net-label"></span>`;
    el.addEventListener('click', openQueueModal);

    /* Вставляем перед мобильным меню в .topbar */
    const mobileMenu = topbar.querySelector('.mobile-menu');
    if (mobileMenu && mobileMenu.nextSibling) {
      topbar.insertBefore(el, mobileMenu.nextSibling);
    } else if (topActions && topActions.parentNode === topbar) {
      topbar.insertBefore(el, topActions);
    } else {
      topbar.insertBefore(el, topbar.firstChild);
    }
  }

  function updateIndicator() {
    ensureIndicator();
    const el = document.getElementById(INDICATOR_ID);
    if (!el) return;

    el.classList.remove('is-online', 'is-offline', 'has-pending');

    let state = 'is-online';
    let label = 'Онлайн';

    if (!isOnline) {
      state = 'is-offline';
      label = 'Офлайн' + (pendingCount > 0 ? ` · ${pendingCount}` : '');
    } else if (pendingCount > 0) {
      state = 'has-pending';
      label = `${pendingCount} в очереди`;
    }

    el.classList.add(state);
    el.querySelector('.sp-net-label').textContent = label;
  }

  async function refreshPendingCount() {
    try {
      const items = await dbGetAll();
      pendingCount = items.length;
    } catch (e) {
      pendingCount = 0;
    }
    updateIndicator();
  }

  /* =========================================================
     БАННЕР "СЕТЬ ВОССТАНОВЛЕНА"
     ========================================================= */

  let lastSuggestedAt = 0;

  async function maybeSuggestSync() {
    if (pendingCount === 0) return;

    /* Не спамим — раз в 2 минуты */
    const now = Date.now();
    if (now - lastSuggestedAt < 120000) return;
    lastSuggestedAt = now;

    toast(`Сеть восстановлена. В очереди ${pendingCount} операций — откройте индикатор сети в шапке.`);
  }

  /* =========================================================
     МОДАЛКА ОЧЕРЕДИ
     ========================================================= */

  async function openQueueModal() {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-off-card">
        <div class="sp-off-head">
          <h3>📶 Очередь операций</h3>
          <button type="button" class="sp-off-close" aria-label="Закрыть">×</button>
        </div>
        <div class="sp-off-body" id="spOffBody"></div>
        <div class="sp-off-foot">
          <button type="button" class="sp-off-secondary" id="spOffClear">
            Очистить очередь
          </button>
          <button type="button" class="sp-off-primary" id="spOffRetryAll">
            Повторить все
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sp-off-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    document.getElementById('spOffClear').addEventListener('click', dropAll);
    document.getElementById('spOffRetryAll').addEventListener('click', async () => {
      const btn = document.getElementById('spOffRetryAll');
      btn.disabled = true;
      btn.textContent = 'Отправка…';

      const res = await retryAll();

      btn.disabled = false;
      btn.textContent = 'Повторить все';

      if (res.fail > 0) {
        toast(`Отправлено: ${res.ok}, осталось: ${res.remaining}. Сеть ещё недоступна.`, 'error');
      } else if (res.ok > 0) {
        toast(`Отправлено: ${res.ok}`);
      } else {
        toast('Очередь пуста');
      }

      renderQueueModal();
    });

    renderQueueModal();
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  async function renderQueueModal() {
    const body = document.getElementById('spOffBody');
    if (!body) return;

    const items = await dbGetAll();

    if (!items.length) {
      body.innerHTML = `
        <div class="sp-off-intro empty">
          Очередь пуста. Все операции синхронизированы с сервером.
        </div>
      `;
      const clearBtn = document.getElementById('spOffClear');
      const retryBtn = document.getElementById('spOffRetryAll');
      if (clearBtn) clearBtn.disabled = true;
      if (retryBtn) retryBtn.disabled = true;
      return;
    }

    const clearBtn = document.getElementById('spOffClear');
    const retryBtn = document.getElementById('spOffRetryAll');
    if (clearBtn) clearBtn.disabled = false;
    if (retryBtn) retryBtn.disabled = !isOnline;

    const introClass = isOnline ? 'ok' : '';
    const introText = isOnline
      ? `В очереди ${items.length} операций. Нажмите «Повторить все», чтобы отправить их на сервер.`
      : `Сеть недоступна. ${items.length} операций сохранены и будут отправлены, когда появится связь.`;

    body.innerHTML = `
      <div class="sp-off-intro ${introClass}">${escapeHtml(introText)}</div>
      ${items.map(it => `
        <div class="sp-off-item">
          <div class="sp-off-item-head">
            <div class="sp-off-item-title">
              <span class="sp-off-item-method">${escapeHtml(it.method || '')}</span>
              ${escapeHtml(it.label || 'Операция')}
            </div>
            <div class="sp-off-item-meta">
              ${escapeHtml(new Date(it.created_at).toLocaleString('ru-RU'))}
            </div>
          </div>
          <div class="sp-off-item-path">
            ${escapeHtml((it.url || '').split('/rest/v1/')[1] || it.url || '')}
          </div>
          ${it.error ? `<div class="sp-off-item-error">${escapeHtml(it.error)}</div>` : ''}
          <div class="sp-off-item-actions">
            <button type="button" class="sp-off-item-btn" data-retry="${it.id}">↻ Повторить</button>
            <button type="button" class="sp-off-item-btn sp-off-danger" data-drop="${it.id}">✕ Удалить</button>
          </div>
        </div>
      `).join('')}
    `;

    body.querySelectorAll('[data-retry]').forEach(btn => {
      btn.addEventListener('click', () => retryOne(Number(btn.getAttribute('data-retry'))));
    });
    body.querySelectorAll('[data-drop]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Удалить эту операцию без отправки?')) {
          dropOne(Number(btn.getAttribute('data-drop')));
        }
      });
    });
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  async function init() {
    injectStyles();

    installFetchWrapper();

    /* Пинг при старте */
    await ping();

    startPing();

    /* Счётчик очереди */
    await refreshPendingCount();

    /* Наблюдаем за появлением .topbar, чтобы вставить индикатор */
    const tryEnsure = () => {
      try { ensureIndicator(); } catch (e) {}
      updateIndicator();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryEnsure, { once: true });
    } else {
      tryEnsure();
    }

    const obs = new MutationObserver(tryEnsure);
    obs.observe(document.body, { childList: true, subtree: true });

    console.log('[OfflineQueue] Модуль инициализирован. Статус:', isOnline ? 'онлайн' : 'офлайн');
  }

  init();

  window.spOfflineQueue = {
    getQueue: dbGetAll,
    retryAll,
    clearAll: dbClear,
    isOnline: () => isOnline,
    pendingCount: () => pendingCount,
    version: '1.0.0'
  };

})();
