/* =========================================================
   SKLADAPLAN — ИСТОРИЯ ОТГРУЗОК
   =========================================================

   Что делает:
   - В разделе "Убыло" добавляет кнопку "🕓 История отгрузок".
   - По клику открывает модалку с таблицей shipments_log:
     дата, коробок, получатель, водитель, машина, оператор.
   - Поиск по получателю/водителю/машине.
   - Фильтр по дате (сегодня / 7 дней / 30 дней / всё).

   Изоляция:
   - Не трогает app.js.
   - Если что-то падает — оригинальный shippedView
     всё равно отработает.
   ========================================================= */

(function () {
  'use strict';
  if (window.spShipmentsLog) return;

  const STYLES_ID = 'spShipLogStyles';
  const MODAL_ID  = 'spShipLogModal';
  const BTN_ID    = 'spShipLogBtn';
  const TBODY_ID  = 'spShipLogBody';
  const COUNT_ID  = 'spShipLogCount';

  const LIMIT = 300;

  /* ============== БЕЗОПАСНЫЙ ДОСТУП ============== */

  function getSupabase() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  /* ============== УТИЛИТЫ ============== */

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${pad(d.getFullYear())} ` +
             `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return iso; }
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'success');
    else console.log('[ShipLog]', msg);
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* Кнопка в разделе "Убыло" */
      #${BTN_ID} {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 0 15px;
        border: 1px solid #dfe3e8;
        border-radius: 10px;
        background: #fff;
        color: #334155;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        margin-bottom: 12px;
        transition: background .15s ease, border-color .15s ease;
      }
      #${BTN_ID}:hover {
        background: #f8fafc;
        border-color: #cbd5e1;
      }

      /* Модалка */
      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100013;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-sl-card {
        background: #fff;
        border-radius: 16px;
        width: 100%; max-width: 1100px;
        max-height: 92vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-sl-head {
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
        display: flex; align-items: center; justify-content: space-between;
      }
      #${MODAL_ID} .sp-sl-head h3 {
        margin: 0; font-size: 17px; font-weight: 700;
      }
      #${MODAL_ID} .sp-sl-close {
        border: 0; background: #f3f3f3;
        width: 34px; height: 34px;
        border-radius: 50%; cursor: pointer;
        font-size: 20px; line-height: 1; color: #444;
      }
      #${MODAL_ID} .sp-sl-close:hover { background: #e5e5e5; }

      #${MODAL_ID} .sp-sl-filters {
        display: grid;
        grid-template-columns: 1fr 200px;
        gap: 10px;
        padding: 12px 20px;
        background: #fafbfc;
        border-bottom: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-sl-filters input,
      #${MODAL_ID} .sp-sl-filters select {
        width: 100%; box-sizing: border-box;
        min-height: 40px;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 0 12px; font-size: 13px;
        outline: none; background: #fff;
      }
      #${MODAL_ID} .sp-sl-filters input:focus,
      #${MODAL_ID} .sp-sl-filters select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }

      #${MODAL_ID} .sp-sl-counter {
        padding: 8px 20px;
        font-size: 12px;
        color: #64748b;
        background: #f8fafc;
        border-bottom: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-sl-counter b { color: #111; }

      #${MODAL_ID} .sp-sl-body {
        overflow-y: auto;
        flex: 1;
      }
      #${MODAL_ID} table {
        width: 100%;
        border-collapse: collapse;
      }
      #${MODAL_ID} thead {
        position: sticky; top: 0;
        background: #f1f5f9;
        z-index: 1;
      }
      #${MODAL_ID} thead th {
        text-align: left;
        padding: 10px 12px;
        font-size: 11px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: .04em;
        border-bottom: 1px solid #e2e8f0;
        white-space: nowrap;
      }
      #${MODAL_ID} tbody td {
        padding: 11px 12px;
        font-size: 13px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: top;
      }
      #${MODAL_ID} tbody tr:hover { background: #f8fafc; }
      #${MODAL_ID} .sp-sl-time {
        color: #94a3b8;
        font-size: 12px;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      #${MODAL_ID} .sp-sl-count-badge {
        display: inline-block;
        padding: 2px 9px;
        border-radius: 999px;
        background: #dbeafe;
        color: #1e40af;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
      }
      #${MODAL_ID} .sp-sl-name {
        font-weight: 600;
        color: #0f172a;
      }
      #${MODAL_ID} .sp-sl-meta {
        color: #64748b;
        font-size: 11px;
        margin-top: 2px;
      }
      #${MODAL_ID} .sp-sl-note {
        color: #64748b;
        font-size: 12px;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      #${MODAL_ID} .sp-sl-op {
        font-family: ui-monospace, Menlo, monospace;
        font-size: 11px;
        color: #64748b;
        word-break: break-all;
      }
      #${MODAL_ID} .sp-sl-empty {
        padding: 40px 20px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
      }
      #${MODAL_ID} .sp-sl-loading {
        padding: 40px 20px;
        text-align: center;
        color: #64748b;
        font-size: 13px;
      }
      #${MODAL_ID} .sp-sl-dash { color: #cbd5e1; }

      @media (max-width: 700px) {
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-sl-card {
          max-width: none;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
        }
        #${MODAL_ID} .sp-sl-filters {
          grid-template-columns: 1fr;
        }
        #${MODAL_ID} table th:nth-child(5),
        #${MODAL_ID} table td:nth-child(5),
        #${MODAL_ID} table th:nth-child(7),
        #${MODAL_ID} table td:nth-child(7) {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ЗАГРУЗКА ============== */

  async function fetchLog() {
    const tbody = document.getElementById(TBODY_ID);
    const counter = document.getElementById(COUNT_ID);
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" class="sp-sl-loading">Загрузка…</td></tr>`;

    const client = getSupabase();
    if (!client) {
      tbody.innerHTML = `<tr><td colspan="8" class="sp-sl-empty">Supabase-клиент недоступен</td></tr>`;
      return;
    }

    const period = document.getElementById('spSlPeriod')?.value || '30d';
    const search = (document.getElementById('spSlSearch')?.value || '').trim().toLowerCase();

    let query = client
      .from('shipments_log')
      .select('*')
      .order('shipped_at', { ascending: false })
      .limit(LIMIT);

    if (period !== 'all') {
      const since = new Date();
      if (period === 'today') since.setHours(0, 0, 0, 0);
      else if (period === '7d') since.setDate(since.getDate() - 7);
      else if (period === '30d') since.setDate(since.getDate() - 30);
      query = query.gte('shipped_at', since.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ShipLog] fetch error:', error);
      tbody.innerHTML = `<tr><td colspan="8" class="sp-sl-empty">
        Ошибка загрузки: ${escapeHtml(error.message || '')}
      </td></tr>`;
      if (counter) counter.textContent = '—';
      return;
    }

    let rows = data || [];

    /* Клиентский поиск */
    if (search) {
      rows = rows.filter(r => {
        const hay = [
          r.recipient_name,
          r.recipient_contact,
          r.driver_name,
          r.vehicle_number,
          r.direction,
          r.warehouse,
          r.note,
          r.operator_email
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(search);
      });
    }

    if (counter) {
      counter.innerHTML = `Записей: <b>${rows.length}</b>` +
        (rows.length >= LIMIT ? ` (лимит ${LIMIT} — уточните период)` : '');
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="sp-sl-empty">
        За выбранный период отгрузок нет.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const dash = '<span class="sp-sl-dash">—</span>';

      return `
        <tr>
          <td class="sp-sl-time">${escapeHtml(fmtDateTime(r.shipped_at))}</td>
          <td><span class="sp-sl-count-badge">${escapeHtml(r.box_count || 0)}</span></td>
          <td>
            ${r.recipient_name
              ? `<div class="sp-sl-name">${escapeHtml(r.recipient_name)}</div>
                 ${r.recipient_contact ? `<div class="sp-sl-meta">${escapeHtml(r.recipient_contact)}</div>` : ''}`
              : dash}
          </td>
          <td>
            ${r.driver_name
              ? `<div class="sp-sl-name">${escapeHtml(r.driver_name)}</div>
                 ${r.vehicle_number ? `<div class="sp-sl-meta">${escapeHtml(r.vehicle_number)}</div>` : ''}`
              : dash}
          </td>
          <td>
            ${r.direction ? escapeHtml(r.direction) : dash}
            ${r.warehouse ? `<div class="sp-sl-meta">${escapeHtml(r.warehouse)}</div>` : ''}
          </td>
          <td>${r.note ? `<div class="sp-sl-note">${escapeHtml(r.note)}</div>` : dash}</td>
          <td class="sp-sl-op">${escapeHtml(r.operator_email || '—')}</td>
          <td style="text-align:center;color:#94a3b8;">
            ${(r.box_ids && Array.isArray(r.box_ids)) ? r.box_ids.length : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  /* ============== МОДАЛКА ============== */

  function openModal() {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-sl-card">
        <div class="sp-sl-head">
          <h3>🕓 История отгрузок</h3>
          <button type="button" class="sp-sl-close" aria-label="Закрыть">×</button>
        </div>

        <div class="sp-sl-filters">
          <input
            id="spSlSearch"
            type="search"
            placeholder="Поиск: получатель, водитель, машина, направление, заметка"
          >
          <select id="spSlPeriod">
            <option value="today">Сегодня</option>
            <option value="7d">За 7 дней</option>
            <option value="30d" selected>За 30 дней</option>
            <option value="all">За всё время</option>
          </select>
        </div>

        <div class="sp-sl-counter" id="${COUNT_ID}">Загрузка…</div>

        <div class="sp-sl-body">
          <table>
            <thead>
              <tr>
                <th style="width:120px;">Дата</th>
                <th style="width:70px;">Кор.</th>
                <th style="width:180px;">Получатель</th>
                <th style="width:170px;">Водитель / машина</th>
                <th style="width:170px;">Направление</th>
                <th>Заметка</th>
                <th style="width:180px;">Оператор</th>
                <th style="width:50px;">ID</th>
              </tr>
            </thead>
            <tbody id="${TBODY_ID}">
              <tr><td colspan="8" class="sp-sl-loading">Загрузка…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sp-sl-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const escHandler = e => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    /* Фильтры */
    let timer = null;
    document.getElementById('spSlSearch')?.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchLog, 300);
    });
    document.getElementById('spSlPeriod')?.addEventListener('change', fetchLog);

    fetchLog();
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  /* ============== ХУКИ В APP.JS ============== */

  function install() {
    if (typeof window.shippedView !== 'function') return false;
    if (window.shippedView.__shipLogWrapped) return true;

    const originalView = window.shippedView;
    const originalSetup = window.setupShipped;

    const wrappedView = function () {
      let prefix = '';
      try {
        prefix = `
          <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
            <button type="button" id="${BTN_ID}">
              🕓 История отгрузок
            </button>
          </div>
        `;
      } catch (e) {
        console.warn('[ShipLog] build error:', e);
      }
      return prefix + originalView.apply(this, arguments);
    };
    wrappedView.__shipLogWrapped = true;
    window.shippedView = wrappedView;

    if (typeof originalSetup === 'function') {
      window.setupShipped = function () {
        originalSetup.apply(this, arguments);

        setTimeout(() => {
          try {
            const btn = document.getElementById(BTN_ID);
            if (btn) {
              btn.addEventListener('click', () => openModal());
            }
          } catch (e) {
            console.warn('[ShipLog] attach error:', e);
          }
        }, 30);
      };
    }

    console.log('[ShipLog] Хуки установлены');
    return true;
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }

    setTimeout(install, 500);
    setTimeout(install, 1500);
    setTimeout(install, 4000);

    console.log('[ShipLog] Модуль инициализирован');
  }

  init();

  window.spShipmentsLog = {
    open: openModal,
    version: '1.0.0'
  };

})();
