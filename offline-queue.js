/* =========================================================
   SKLADAPLAN — ОФЛАЙН-ОЧЕРЕДЬ (v1.1)
   =========================================================

   Отличия от v1.0:
   - Убран MutationObserver (он давал бесконечную петлю).
   - Индикатор вставляется по таймерам: 500, 2с, 5с, 10с.
   - Обёртка fetch устанавливается с задержкой, чтобы app.js
     успел создать supabaseClient.
   - Лимит очереди — 200 записей.
   - Пинг раз в 30 сек (было 15).
   ========================================================= */

(function () {
  'use strict';

  /* Защита от повторной инициализации */
  if (window.spOfflineQueue) return;

  const STYLES_ID = 'spOfflineQueueStyles';
  const INDICATOR_ID = 'spNetIndicator';
  const MODAL_ID = 'spOfflineQueueModal';
  const DB_NAME = 'skladaplan-offline';
  const DB_VERSION = 1;
  const STORE_NAME = 'queue';

  const PING_INTERVAL_MS = 30000;
  const PING_TIMEOUT_MS = 3000;
  const MAX_QUEUE_SIZE = 200;

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
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 11px; border-radius: 999px;
        font-size: 12px; font-weight: 600; white-space: nowrap;
        cursor: pointer; user-select: none;
        transition: background .15s ease;
        -webkit-tap-highlight-color: transparent;
        border: 0;
        font-family: inherit;
      }
      #${INDICATOR_ID}.is-online  { background: #dcfce7; color: #166534; }
      #${INDICATOR_ID}.is-offline { background: #fee2e2; color: #991b1b; }
      #${INDICATOR_ID}.has-pending { background: #fef3c7; color: #92400e; }
      #${INDICATOR_ID} .sp-net-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: currentColor;
      }
      #${INDICATOR_ID}.is-online  .sp-net-dot { background: #10b981; }
      #${INDICATOR_ID}.is-offline .sp-net-dot { background: #ef4444; animation: spNetPulse 1.2s ease infinite; }
      #${INDICATOR_ID}.has-pending .sp-net-dot { background: #f59e0b; animation: spNetPulse 1.5s ease infinite; }
      @keyframes spNetPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .35; }
      }

      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100006;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-off-card {
        background: #fff; border-radius: 16px;
        width: 100%; max-width: 640px; max-height: 90vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-off-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 20px; border-bottom: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-off-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
      #${MODAL_ID} .sp-off-close {
        border: 0; background: #f3f3f3; width: 34px; height: 34px;
        border-radius: 50%; cursor: pointer; font-size: 20px;
        line-height: 1; color: #444;
      }
      #${MODAL_ID} .sp-off-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
      #${MODAL_ID} .sp-off-intro {
        padding: 12px 14px; border-radius: 10px;
        background: #fffbeb; color: #92400e;
        font-size: 13px; line-height: 1.55; margin-bottom: 16px;
      }
      #${MODAL_ID} .sp-off-intro.ok   { background: #ecfdf5; color: #065f46; }
      #${MODAL_ID} .sp-off-intro.empty { background: #f1f5f9; color: #475569; }
      #${MODAL_ID} .sp-off-item {
        padding: 12px 14px; border: 1px solid #e2e8f0;
        border-radius: 10px; margin-bottom: 8px; background: #fff;
      }
      #${MODAL_ID} .sp-off-item-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; margin-bottom: 5px;
      }
      #${MODAL_ID} .sp-off-item-title { font-size: 13px; font-weight: 700; color: #0f172a; }
      #${MODAL_ID} .sp-off-item-meta { font-size: 11px; color: #94a3b8; }
      #${MODAL_ID} .sp-off-item-method {
        display: inline-block; padding: 2px 6px; border-radius: 4px;
        font-size: 10px; font-weight: 700;
        font-family: ui-monospace, Menlo, monospace;
        background: #f1f5f9; color: #475569;
      }
      #${MODAL_ID} .sp-off-item-path {
        font-family: ui-monospace, Menlo, monospace;
        font-size: 11px; color: #64748b;
        word-break: break-all; margin-top: 3px;
      }
      #${MODAL_ID} .sp-off-item-error {
        margin-top: 6px; padding: 6px 8px;
        border-radius: 6px; background: #fef2f2;
        color: #991b1b; font-size: 11px;
      }
      #${MODAL_ID} .sp-off-item-actions { display: flex; gap: 6px; margin-top: 8px; }
      #${MODAL_ID} .sp-off-item-btn {
        border: 1px solid #e2e8f0; background: #fff; color: #334155;
        border-radius: 7px; padding: 5px 10px; font-size: 11px;
        font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #${MODAL_ID} .sp-off-item-btn:hover { background: #f8fafc; }
      #${MODAL_ID} .sp-off-item-btn.sp-off-danger {
        color: #b42318; border-color: #fecaca;
      }
      #${MODAL_ID} .sp-off-item-btn.sp-off-danger:hover { background: #fef2f2; }
      #${MODAL_ID} .sp-off-foot {
        display: flex; gap: 8px; justify-content: flex-end;
        padding: 12px 20px; border-top: 1px solid #eef1f4; background: #fafbfc;
      }
      #${MODAL_ID} .sp-off-primary {
        border: 0; background: var(--primary, #2563EB); color: #fff;
        border-radius: 9px; padding: 10px 18px;
        font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #${MODAL_ID} .sp-off-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${MODAL_ID} .sp-off-primary:disabled { opacity: .5; cursor: not-allowed; }
      #${MODAL_ID} .sp-off-secondary {
        border: 1px solid #e2e8f0; background: #f1f5f9; color: #334155;
        border-radius: 9px; padding: 10px 18px;
        font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #${MODAL_ID} .sp-off-secondary:hover { background: #e2e8f0; }

      @media (max-width: 640px) {
        #${INDICATOR_ID} { padding: 5px 9px; font-size: 11px; }
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-off-card {
          max-width: none; height: 100vh; max-height: 100vh; border-radius: 0;
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
      if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.supabaseUrl) {
        return supabaseClient.supabaseUrl;
      }
    } catch (e) {}
    return 'https://ithhecprdosvjiddoalq.supabase.co';
  }

  function getSupabaseKey() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.supabaseKey) {
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
            keyPath: 'id', autoIncrement: true
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
      const req = tx.objectStore(STORE_NAME).add(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function dbClear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /* Обрезаем очередь, если она слишком большая — оставляем последние N */
  async function trimQueue() {
    try {
      const items = await dbGetAll();
      if (items.length <= MAX_QUEUE_SIZE) return;
      const excess = items.length - MAX_QUEUE_SIZE;
      const toDelete = items.slice(0, excess);
      for (const it of toDelete) {
        await dbDelete(it.id);
      }
      console.log(`[OfflineQueue] Удалено ${excess} старых операций (лимит ${MAX_QUEUE_SIZE})`);
    } catch (e) {
      console.warn('[OfflineQueue] trim error:', e);
    }
  }

  /* =========================================================
     ОПРЕДЕЛЕНИЕ ЗАПРОСА
     ========================================================= */

  function isQueueable(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (
      (init && init.method) ||
      (typeof input !== 'string' && input && input.method) ||
      'GET'
    ).toUpperCase();

    const supaUrl = getSupabaseUrl();
    if (!url.startsWith(supaUrl)) return false;
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return false;

    /* Аутентификацию, Storage и Edge Functions не ставим в очередь:
       - auth — критично для логина, вне офлайна смысла нет
       - storage — файлы большие, сложно воспроизвести
       - functions — обычно это разовые вызовы (email, отчёты),
         повторная отправка может дать дубли или странные эффекты */
    if (url.indexOf('/auth/v1/') !== -1) return false;
    if (url.indexOf('/storage/v1/') !== -1) return false;
    if (url.indexOf('/functions/v1/') !== -1) return false;

    return true;
  }

  function describeOperation(url, method) {
    const path = url.split('/rest/v1/')[1] || '';
    const [rawTable] = path.split('?');
    const table = rawTable.replace(/^\//, '');

    const tableLabels = {
      boxes: 'Коробки',
      tasks: 'Задачи',
      planner_tasks: 'Задачи планировщика',
      planner_shipments: 'Отгрузки планировщика',
      pallet_notes: 'Заметки поддонов',
      telegram_users: 'Пользователи бота'
    };

    const methodLabels = {
      POST: 'Создание',
      PUT: 'Обновление',
      PATCH: 'Обновление',
      DELETE: 'Удаление'
    };

    const rpcMatch = rawTable.match(/^rpc\/(.+)$/);
    if (rpcMatch) {
      const rpcLabels = {
        sp_collect_boxes: 'Комплектация коробок',
        sp_ship_boxes: 'Отгрузка коробок',
        sp_move_boxes: 'Перемещение коробок',
        sp_merge_pallets: 'Объединение паллет',
        sp_apply_inventory: 'Применение инвентаризации',
        sp_apply_warehouse_optimization: 'Оптимизация склада'
      };
      return rpcLabels[rpcMatch[1]] || ('RPC: ' + rpcMatch[1]);
    }

    return (methodLabels[method] || method) + ' · ' + (tableLabels[table] || table);
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
        if (!isOnline) markOnline();
        return response;
      } catch (error) {
        if (!queueable) {
          if (isNetworkError(error)) markOffline();
          throw error;
        }

        if (!isNetworkError(error)) {
          throw error;
        }

        markOffline();

        try {
          const url = typeof input === 'string' ? input : input.url;
          const method = (
            (init && init.method) ||
            (typeof input !== 'string' && input && input.method) ||
            'GET'
          ).toUpperCase();

          const headers = {};
          if (init && init.headers) {
            if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
              init.headers.forEach((v, k) => { headers[k] = v; });
            } else if (typeof init.headers === 'object') {
              Object.assign(headers, init.headers);
            }
          }

          const body = init && init.body;
          let bodyText = null;
          if (typeof body === 'string') bodyText = body;
          else if (body && typeof body.text === 'function') bodyText = await body.text();
          else if (body) bodyText = JSON.stringify(body);

          await dbAdd({
            url: url,
            method: method,
            headers: headers,
            body: bodyText,
            label: describeOperation(url, method),
            error: String(error.message || error).slice(0, 300),
            created_at: new Date().toISOString()
          });

          await trimQueue();
          await refreshPendingCount();

          toast('Нет сети. Действие сохранено в очередь.', 'error');
        } catch (dbErr) {
          console.error('[OfflineQueue] Не удалось сохранить в очередь:', dbErr);
        }

        throw error;
      }
    };

    installed = true;
    console.log('[OfflineQueue] Обёртка fetch установлена');
  }

  function isNetworkError(error) {
    if (!error) return false;
    if (error.name === 'AbortError') return false;
    if (error instanceof TypeError) return true;
    const msg = String(error.message || '');
    if (msg.indexOf('Failed to fetch') !== -1) return true;
    if (msg.indexOf('NetworkError') !== -1) return true;
    if (msg.indexOf('Load failed') !== -1) return true;
    return false;
  }

  /* =========================================================
     ПОВТОРНАЯ ОТПРАВКА
     ========================================================= */

  async function retryEntry(entry) {
    const opts = {
      method: entry.method,
      headers: entry.headers || {}
    };
    if (entry.body) opts.body = entry.body;
    return await originalFetch(entry.url, opts);
  }

  async function retryAll() {
    const items = await dbGetAll();
    if (!items.length) return { ok: 0, fail: 0 };

    let ok = 0;
    let remaining = 0;

    for (const item of items) {
      try {
        await retryEntry(item);
        await dbDelete(item.id);
        ok++;
      } catch (e) {
        if (isNetworkError(e)) {
          remaining++;
          break;
        } else {
          /* Сервер ответил ошибкой — считаем операцию отработанной */
          await dbDelete(item.id);
          console.warn('[OfflineQueue] Операция убрана из очереди:', e.message);
        }
      }
    }

    await refreshPendingCount();
    return { ok: ok, fail: remaining };
  }

  async function retryOne(id) {
    const items = await dbGetAll();
    const item = items.find(x => x.id === id);
    if (!item) return;

    try {
      await retryEntry(item);
      await dbDelete(id);
      toast('Операция отправлена');
    } catch (e) {
      if (isNetworkError(e)) {
        toast('Сеть всё ещё недоступна', 'error');
      } else {
        await dbDelete(id);
        toast('Сервер вернул ошибку — операция убрана', 'error');
      }
    }
    await refreshPendingCount();
    renderQueueModal();
  }

  async function dropOne(id) {
    await dbDelete(id);
    await refreshPendingCount();
    renderQueueModal();
  }

  async function dropAll() {
    if (!confirm('Удалить все операции из очереди без отправки?')) return;
    await dbClear();
    await refreshPendingCount();
    toast('Очередь очищена');
    renderQueueModal();
  }

  /* =========================================================
     СЕТЬ
     ========================================================= */

  function markOnline() {
    if (isOnline) return;
    isOnline = true;
    updateIndicator();
    console.log('[OfflineQueue] Сеть восстановлена');
    if (pendingCount > 0) {
      setTimeout(() => {
        toast('Сеть восстановлена. В очереди ' + pendingCount + ' операций.');
      }, 500);
    }
  }

  function markOffline() {
    if (!isOnline) return;
    isOnline = false;
    updateIndicator();
    console.log('[OfflineQueue] Сеть недоступна');
  }

  function ping() {
    const url = getSupabaseUrl() + '/auth/v1/health';
    const xhr = new XMLHttpRequest();

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { xhr.abort(); } catch (e) {}
      markOffline();
    }, PING_TIMEOUT_MS);

    xhr.open('GET', url, true);
    xhr.setRequestHeader('apikey', getSupabaseKey());

    xhr.onload = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (xhr.status >= 200 && xhr.status < 500) markOnline();
      else markOffline();
    };

    xhr.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      markOffline();
    };

    try {
      xhr.send();
    } catch (e) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        markOffline();
      }
    }
  }

  function startPing() {
    if (pingTimer) return;
    ping();
    pingTimer = setInterval(ping, PING_INTERVAL_MS);
  }

  window.addEventListener('online', () => { setTimeout(ping, 300); });
  window.addEventListener('offline', () => { markOffline(); });

  /* =========================================================
     ИНДИКАТОР
     ========================================================= */

  function ensureIndicator() {
    if (document.getElementById(INDICATOR_ID)) return true;

    const topbar = document.querySelector('.topbar');
    if (!topbar) return false;

    const el = document.createElement('button');
    el.id = INDICATOR_ID;
    el.type = 'button';
    el.title = 'Статус сети. Нажмите, чтобы открыть очередь.';
    el.innerHTML = '<span class="sp-net-dot"></span><span class="sp-net-label"></span>';
    el.addEventListener('click', openQueueModal);

    const mobileMenu = topbar.querySelector('.mobile-menu');
    const topActions = topbar.querySelector('#topActions');

    if (mobileMenu && mobileMenu.nextSibling) {
      topbar.insertBefore(el, mobileMenu.nextSibling);
    } else if (topActions) {
      topbar.insertBefore(el, topActions);
    } else {
      topbar.insertBefore(el, topbar.firstChild);
    }

    return true;
  }

  function updateIndicator() {
    const el = document.getElementById(INDICATOR_ID);
    if (!el) return;

    let state = 'is-online';
    let label = 'Онлайн';

    if (!isOnline) {
      state = 'is-offline';
      label = 'Офлайн' + (pendingCount > 0 ? ' · ' + pendingCount : '');
    } else if (pendingCount > 0) {
      state = 'has-pending';
      label = pendingCount + ' в очереди';
    }

    el.classList.remove('is-online', 'is-offline', 'has-pending');
    el.classList.add(state);

    const labelEl = el.querySelector('.sp-net-label');
    /* Ключевая защита: меняем текст только если он отличается */
    if (labelEl && labelEl.textContent !== label) {
      labelEl.textContent = label;
    }
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
     МОДАЛКА
     ========================================================= */

  function openQueueModal() {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML =
      '<div class="sp-off-card">' +
        '<div class="sp-off-head">' +
          '<h3>📶 Очередь операций</h3>' +
          '<button type="button" class="sp-off-close" aria-label="Закрыть">×</button>' +
        '</div>' +
        '<div class="sp-off-body" id="spOffBody"></div>' +
        '<div class="sp-off-foot">' +
          '<button type="button" class="sp-off-secondary" id="spOffClear">Очистить очередь</button>' +
          '<button type="button" class="sp-off-primary" id="spOffRetryAll">Повторить все</button>' +
        '</div>' +
      '</div>';

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

      if (res.fail > 0) toast('Отправлено: ' + res.ok + '. Сеть ещё недоступна.', 'error');
      else if (res.ok > 0) toast('Отправлено: ' + res.ok);
      else toast('Очередь пуста');

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
      body.innerHTML = '<div class="sp-off-intro empty">Очередь пуста. Все операции синхронизированы.</div>';
      const c = document.getElementById('spOffClear');
      const r = document.getElementById('spOffRetryAll');
      if (c) c.disabled = true;
      if (r) r.disabled = true;
      return;
    }

    const c = document.getElementById('spOffClear');
    const r = document.getElementById('spOffRetryAll');
    if (c) c.disabled = false;
    if (r) r.disabled = !isOnline;

    const introClass = isOnline ? 'ok' : '';
    const introText = isOnline
      ? 'В очереди ' + items.length + ' операций. Нажмите «Повторить все».'
      : 'Сеть недоступна. ' + items.length + ' операций сохранены.';

    let html = '<div class="sp-off-intro ' + introClass + '">' + escapeHtml(introText) + '</div>';

    for (const it of items) {
      const path = (it.url || '').split('/rest/v1/')[1] || it.url || '';
      html +=
        '<div class="sp-off-item">' +
          '<div class="sp-off-item-head">' +
            '<div class="sp-off-item-title">' +
              '<span class="sp-off-item-method">' + escapeHtml(it.method || '') + '</span> ' +
              escapeHtml(it.label || 'Операция') +
            '</div>' +
            '<div class="sp-off-item-meta">' +
              escapeHtml(new Date(it.created_at).toLocaleString('ru-RU')) +
            '</div>' +
          '</div>' +
          '<div class="sp-off-item-path">' + escapeHtml(path) + '</div>' +
          (it.error ? '<div class="sp-off-item-error">' + escapeHtml(it.error) + '</div>' : '') +
          '<div class="sp-off-item-actions">' +
            '<button type="button" class="sp-off-item-btn" data-retry="' + it.id + '">↻ Повторить</button>' +
            '<button type="button" class="sp-off-item-btn sp-off-danger" data-drop="' + it.id + '">✕ Удалить</button>' +
          '</div>' +
        '</div>';
    }

    body.innerHTML = html;

    body.querySelectorAll('[data-retry]').forEach(btn => {
      btn.addEventListener('click', () => retryOne(Number(btn.getAttribute('data-retry'))));
    });
    body.querySelectorAll('[data-drop]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Удалить эту операцию без отправки?')) dropOne(Number(btn.getAttribute('data-drop')));
      });
    });
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function tryEnsureIndicator() {
    try {
      ensureIndicator();
      updateIndicator();
    } catch (e) {
      console.warn('[OfflineQueue] ensureIndicator error:', e);
    }
  }

  function init() {
    injectStyles();

    /* Установка обёртки fetch — с задержкой, чтобы app.js создал supabaseClient */
    setTimeout(() => {
      try { installFetchWrapper(); } catch (e) {
        console.warn('[OfflineQueue] installFetchWrapper error:', e);
      }
    }, 1200);

    /* Пинг — через 2 сек после старта */
    setTimeout(() => {
      try { startPing(); } catch (e) {
        console.warn('[OfflineQueue] startPing error:', e);
      }
    }, 2000);

    /* Счётчик очереди */
    setTimeout(() => {
      refreshPendingCount().catch(() => {});
    }, 1500);

    /* Индикатор — несколько разовых попыток.
       Не используем MutationObserver — он давал петлю. */
    setTimeout(tryEnsureIndicator, 500);
    setTimeout(tryEnsureIndicator, 2000);
    setTimeout(tryEnsureIndicator, 5000);
    setTimeout(tryEnsureIndicator, 10000);

    console.log('[OfflineQueue] Модуль v1.1 инициализирован');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.spOfflineQueue = {
    getQueue: dbGetAll,
    retryAll: retryAll,
    clearAll: dbClear,
    isOnline: () => isOnline,
    pendingCount: () => pendingCount,
    version: '1.1.0'
  };

})();
