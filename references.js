/* =========================================================
   SKLADAPLAN — СПРАВОЧНИКИ
   =========================================================

   Управление складами, зонами/рядами и поддонами.
   Отдельная страница, видна только администраторам.

   Изоляция:
   - Не трогает app.js.
   - Оборачивает goToPage и render: если page==='references',
     рисует свою страницу, иначе передаёт управление дальше.
   ========================================================= */

(function () {
  'use strict';
  if (window.spReferences) return;

  const STYLES_ID  = 'spRefStyles';
  const PAGE_KEY   = 'references';
  const MODAL_ID   = 'spRefModal';

  /* Текущее состояние: какая вкладка открыта + данные */
  const refs = {
    tab: 'warehouses',
    warehouses: [],
    locations: [],
    pallets: [],
    search: '',
    loading: false,
    error: ''
  };

  /* ============== УТИЛИТЫ ============== */

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
    else console.log('[Refs]', msg);
  }

  function canEdit() {
    const role = window.spUIRoles?.getRole?.() || 'admin';
    return role === 'admin';
  }

  function warehouseName(id) {
    const w = refs.warehouses.find(x => Number(x.id) === Number(id));
    return w ? w.name : '—';
  }

  function locationLabel(id) {
    const l = refs.locations.find(x => Number(x.id) === Number(id));
    return l ? l.code : '—';
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      .sp-ref-page {
        max-width: 1280px;
        margin: 0 auto;
      }
      .sp-ref-hero {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 16px;
        padding: 20px 24px;
        margin-bottom: 16px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(15,23,42,.04));
      }
      .sp-ref-kicker {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: #94a3b8;
        margin-bottom: 6px;
      }
      .sp-ref-hero h2 {
        margin: 0 0 6px;
        font-size: 22px;
        font-weight: 750;
        color: #0f172a;
      }
      .sp-ref-hero p {
        margin: 0;
        color: #64748b;
        font-size: 13px;
        line-height: 1.5;
      }

      /* Вкладки */
      .sp-ref-tabs {
        display: flex;
        gap: 4px;
        background: #f1f5f9;
        padding: 4px;
        border-radius: 12px;
        margin-bottom: 16px;
      }
      .sp-ref-tab {
        flex: 1;
        border: 0;
        background: transparent;
        color: #64748b;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 14px;
        border-radius: 9px;
        cursor: pointer;
        font-family: inherit;
        transition: all .15s ease;
      }
      .sp-ref-tab:hover { color: #0f172a; }
      .sp-ref-tab.is-active {
        background: #fff;
        color: #0f172a;
        box-shadow: 0 1px 3px rgba(15,23,42,.08);
      }

      /* Основной блок */
      .sp-ref-block {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(15,23,42,.04));
        overflow: hidden;
      }
      .sp-ref-block-head {
        padding: 14px 18px;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid #eef1f4;
        flex-wrap: wrap;
      }
      .sp-ref-block-head input {
        min-height: 36px;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        padding: 0 12px;
        font-size: 13px;
        outline: none;
        min-width: 220px;
      }
      .sp-ref-block-head input:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      .sp-ref-btn {
        border: 0;
        border-radius: 9px;
        padding: 9px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .sp-ref-btn-primary { background: var(--primary, #2563EB); color: #fff; }
      .sp-ref-btn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      .sp-ref-btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
      .sp-ref-btn-secondary:hover { background: #e2e8f0; }
      .sp-ref-btn-danger { background: #fef2f2; color: #b42318; border: 1px solid #fecaca; }
      .sp-ref-btn-danger:hover { background: #fee2e2; }

      /* Таблица */
      .sp-ref-table {
        width: 100%;
        border-collapse: collapse;
      }
      .sp-ref-table th {
        text-align: left;
        padding: 10px 14px;
        font-size: 11px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: .04em;
        background: #f8fafc;
        border-bottom: 1px solid #eef1f4;
        white-space: nowrap;
      }
      .sp-ref-table td {
        padding: 11px 14px;
        font-size: 13px;
        border-bottom: 1px solid #f1f5f9;
        color: #0f172a;
        vertical-align: middle;
      }
      .sp-ref-table tr:last-child td { border-bottom: 0; }
      .sp-ref-table tr:hover { background: #fafbfc; }
      .sp-ref-table .sp-ref-code {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-weight: 600;
      }

      .sp-ref-badge {
        display: inline-block;
        padding: 3px 9px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      .sp-ref-badge-on  { background: #dcfce7; color: #166534; }
      .sp-ref-badge-off { background: #f1f5f9; color: #64748b; }
      .sp-ref-badge-stock { background: #dbeafe; color: #1e40af; }
      .sp-ref-badge-closed { background: #fee2e2; color: #991b1b; }
      .sp-ref-badge-archived { background: #f1f5f9; color: #64748b; }

      .sp-ref-row-actions {
        display: flex; gap: 6px; justify-content: flex-end;
      }
      .sp-ref-icon-btn {
        width: 30px; height: 30px;
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
      .sp-ref-icon-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
      .sp-ref-icon-btn.sp-ref-danger:hover {
        background: #fef2f2;
        color: #b42318;
        border-color: #fecaca;
      }

      .sp-ref-empty {
        padding: 40px 20px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
      }
      .sp-ref-loading {
        padding: 30px 20px;
        text-align: center;
        color: #64748b;
        font-size: 13px;
      }
      .sp-ref-error {
        padding: 14px 18px;
        background: #fef2f2;
        color: #991b1b;
        font-size: 13px;
        border-radius: 10px;
        margin: 12px;
      }

      /* Модалка */
      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100010;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-ref-modal {
        background: #fff;
        border-radius: 16px;
        width: 100%; max-width: 520px;
        max-height: 92vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-ref-modal-head {
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
        display: flex; align-items: center; justify-content: space-between;
      }
      #${MODAL_ID} .sp-ref-modal-head h3 {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
      }
      #${MODAL_ID} .sp-ref-modal-close {
        border: 0;
        background: #f3f3f3;
        width: 34px; height: 34px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: #444;
      }
      #${MODAL_ID} .sp-ref-modal-close:hover { background: #e5e5e5; }
      #${MODAL_ID} .sp-ref-modal-body {
        padding: 16px 20px 4px;
        overflow-y: auto;
      }
      #${MODAL_ID} .sp-ref-field {
        display: block;
        margin-bottom: 12px;
      }
      #${MODAL_ID} .sp-ref-field > span {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 5px;
      }
      #${MODAL_ID} .sp-ref-field input,
      #${MODAL_ID} .sp-ref-field select {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        padding: 10px 12px;
        font-size: 13px;
        outline: none;
        background: #fff;
      }
      #${MODAL_ID} .sp-ref-field input:focus,
      #${MODAL_ID} .sp-ref-field select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${MODAL_ID} .sp-ref-check {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; cursor: pointer; margin-bottom: 14px;
      }
      #${MODAL_ID} .sp-ref-check input {
        width: 16px; height: 16px;
        accent-color: var(--primary, #2563EB);
        cursor: pointer;
      }
      #${MODAL_ID} .sp-ref-hint {
        font-size: 11px;
        color: #94a3b8;
        margin-top: -6px;
        margin-bottom: 12px;
      }
      #${MODAL_ID} .sp-ref-modal-foot {
        padding: 12px 20px 16px;
        display: flex; gap: 8px; justify-content: flex-end;
        border-top: 1px solid #eef1f4;
        background: #fafbfc;
      }
      #${MODAL_ID} .sp-ref-modal-err {
        margin: 8px 0 0;
        padding: 10px 12px;
        background: #fef2f2;
        color: #991b1b;
        border-radius: 8px;
        font-size: 12px;
      }

      @media (max-width: 700px) {
        .sp-ref-block-head {
          flex-direction: column;
          align-items: stretch;
        }
        .sp-ref-block-head input { width: 100%; }
        .sp-ref-table th:nth-child(n+3),
        .sp-ref-table td:nth-child(n+3) {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ЗАГРУЗКА ДАННЫХ ============== */

  async function loadAll() {
    refs.loading = true;
    refs.error = '';

    const client = getSupabase();
    if (!client) {
      refs.loading = false;
      refs.error = 'Supabase-клиент недоступен';
      return;
    }

    try {
      const [w, l, p] = await Promise.all([
        client.from('warehouses').select('*').order('name', { ascending: true }),
        client.from('locations').select('*').order('code', { ascending: true }),
        client.from('pallets').select('*').order('id', { ascending: false }).limit(2000)
      ]);

      if (w.error) throw w.error;
      if (l.error) throw l.error;
      if (p.error) throw p.error;

      refs.warehouses = w.data || [];
      refs.locations = l.data || [];
      refs.pallets = p.data || [];

    } catch (e) {
      console.error('[Refs] load error:', e);
      refs.error = (e && e.message) || String(e);
    } finally {
      refs.loading = false;
    }
  }

  /* ============== ПОДСЧЁТ СВЯЗЕЙ ============== */

  /* Сколько коробок привязано к складу / зоне / поддону */
  async function countBoxesLinked(field, value) {
    const client = getSupabase();
    if (!client) return 0;

    const { count, error } = await client
      .from('boxes')
      .select('*', { count: 'exact', head: true })
      .eq(field, value);

    if (error) return 0;
    return count || 0;
  }

  /* ============== ОТРИСОВКА ============== */

  function filteredData() {
    const q = refs.search.trim().toLowerCase();

    if (refs.tab === 'warehouses') {
      return q
        ? refs.warehouses.filter(w => String(w.name || '').toLowerCase().includes(q))
        : refs.warehouses;
    }
    if (refs.tab === 'locations') {
      return q
        ? refs.locations.filter(l => String(l.code || '').toLowerCase().includes(q))
        : refs.locations;
    }
    if (refs.tab === 'pallets') {
      return q
        ? refs.pallets.filter(p => String(p.pallet_number || '').toLowerCase().includes(q))
        : refs.pallets;
    }
    return [];
  }

  function renderWarehouses() {
    const items = filteredData();
    if (!items.length) return '<div class="sp-ref-empty">Складов пока нет</div>';

    return `
      <table class="sp-ref-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Название</th>
            <th>Активен</th>
            <th style="width:100px;"></th>
          </tr>
        </thead>
        <tbody>
          ${items.map(w => `
            <tr>
              <td>${escapeHtml(w.id)}</td>
              <td><b>${escapeHtml(w.name)}</b></td>
              <td>
                <span class="sp-ref-badge ${w.is_active === false ? 'sp-ref-badge-off' : 'sp-ref-badge-on'}">
                  ${w.is_active === false ? 'нет' : 'да'}
                </span>
              </td>
              <td>
                <div class="sp-ref-row-actions">
                  <button type="button" class="sp-ref-icon-btn" data-ref-edit="warehouse:${w.id}" title="Изменить">✎</button>
                  <button type="button" class="sp-ref-icon-btn sp-ref-danger" data-ref-delete="warehouse:${w.id}" title="Удалить">×</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderLocations() {
    const items = filteredData();
    if (!items.length) return '<div class="sp-ref-empty">Зон пока нет</div>';

    return `
      <table class="sp-ref-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Код (Зона/ряд)</th>
            <th>Склад</th>
            <th>Зона</th>
            <th>Ряд</th>
            <th>Место</th>
            <th style="width:100px;"></th>
          </tr>
        </thead>
        <tbody>
          ${items.map(l => `
            <tr>
              <td>${escapeHtml(l.id)}</td>
              <td class="sp-ref-code">${escapeHtml(l.code)}</td>
              <td>${escapeHtml(warehouseName(l.warehouse_id))}</td>
              <td>${escapeHtml(l.zone || '—')}</td>
              <td>${escapeHtml(l.row_name || '—')}</td>
              <td>${escapeHtml(l.place || '—')}</td>
              <td>
                <div class="sp-ref-row-actions">
                  <button type="button" class="sp-ref-icon-btn" data-ref-edit="location:${l.id}" title="Изменить">✎</button>
                  <button type="button" class="sp-ref-icon-btn sp-ref-danger" data-ref-delete="location:${l.id}" title="Удалить">×</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderPallets() {
    const items = filteredData();
    if (!items.length) return '<div class="sp-ref-empty">Поддонов пока нет</div>';

    return `
      <table class="sp-ref-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Номер</th>
            <th>Склад</th>
            <th>Зона</th>
            <th>Статус</th>
            <th>Создан</th>
            <th style="width:100px;"></th>
          </tr>
        </thead>
        <tbody>
          ${items.map(p => {
            const statusClass =
              p.status === 'Пустой' || p.archived_at ? 'sp-ref-badge-archived' :
              p.status === 'Закрыт' ? 'sp-ref-badge-closed' :
              'sp-ref-badge-stock';
            return `
              <tr>
                <td>${escapeHtml(p.id)}</td>
                <td class="sp-ref-code"><b>${escapeHtml(p.pallet_number || '—')}</b></td>
                <td>${escapeHtml(warehouseName(p.warehouse_id))}</td>
                <td>${escapeHtml(locationLabel(p.location_id))}</td>
                <td>
                  <span class="sp-ref-badge ${statusClass}">
                    ${escapeHtml(p.status || '—')}
                  </span>
                </td>
                <td>${escapeHtml(p.created_at ? String(p.created_at).slice(0, 10) : '—')}</td>
                <td>
                  <div class="sp-ref-row-actions">
                    <button type="button" class="sp-ref-icon-btn" data-ref-edit="pallet:${p.id}" title="Изменить">✎</button>
                    <button type="button" class="sp-ref-icon-btn sp-ref-danger" data-ref-delete="pallet:${p.id}" title="Удалить">×</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function referencesView() {
    let content = '';

    if (refs.loading) {
      content = '<div class="sp-ref-loading">Загрузка справочников…</div>';
    } else if (refs.error) {
      content = `<div class="sp-ref-error">Ошибка: ${escapeHtml(refs.error)}</div>`;
    } else if (refs.tab === 'locations') {
      content = renderLocations();
    } else if (refs.tab === 'pallets') {
      content = renderPallets();
    } else {
      content = renderWarehouses();
    }

    const addLabel =
      refs.tab === 'locations' ? 'Добавить зону' :
      refs.tab === 'pallets' ? 'Добавить поддон' :
      'Добавить склад';

    const searchPlaceholder =
      refs.tab === 'locations' ? 'Поиск по коду зоны…' :
      refs.tab === 'pallets' ? 'Поиск по номеру поддона…' :
      'Поиск по названию…';

    const canEditNow = canEdit();

    return `
      <div class="sp-ref-page">
        <div class="sp-ref-hero">
          <div class="sp-ref-kicker">СПРАВОЧНИКИ</div>
          <h2>Управление справочниками</h2>
          <p>Склады, зоны/ряды и поддоны. Здесь же можно исправить опечатки и отключить неиспользуемые записи.</p>
        </div>

        <div class="sp-ref-tabs">
          <button type="button" class="sp-ref-tab ${refs.tab === 'warehouses' ? 'is-active' : ''}" data-ref-tab="warehouses">
            🏭 Склады (${refs.warehouses.length})
          </button>
          <button type="button" class="sp-ref-tab ${refs.tab === 'locations' ? 'is-active' : ''}" data-ref-tab="locations">
            📍 Зоны/ряды (${refs.locations.length})
          </button>
          <button type="button" class="sp-ref-tab ${refs.tab === 'pallets' ? 'is-active' : ''}" data-ref-tab="pallets">
            📦 Поддоны (${refs.pallets.length})
          </button>
        </div>

        <div class="sp-ref-block">
          <div class="sp-ref-block-head">
            <input
              type="search"
              id="spRefSearch"
              placeholder="${escapeHtml(searchPlaceholder)}"
              value="${escapeHtml(refs.search)}"
            >
            ${canEditNow ? `
              <button type="button" class="sp-ref-btn sp-ref-btn-primary" id="spRefAdd">
                <span>+</span> ${escapeHtml(addLabel)}
              </button>
            ` : `
              <span style="font-size:12px;color:#94a3b8;">Только просмотр</span>
            `}
          </div>

          <div id="spRefTableWrap">
            ${content}
          </div>
        </div>
      </div>
    `;
  }

  /* ============== МОДАЛКА ФОРМЫ ============== */

  function openModal(kind, existing) {
    if (!canEdit()) return;

    const isEdit = !!existing;

    let title = '';
    let fields = '';

    if (kind === 'warehouse') {
      title = isEdit ? 'Изменить склад' : 'Новый склад';
      fields = `
        <label class="sp-ref-field">
          <span>Название склада</span>
          <input id="spRefWName" type="text" value="${isEdit ? escapeHtml(existing.name) : ''}" placeholder="Склад СОХ">
        </label>
        <label class="sp-ref-check">
          <input type="checkbox" id="spRefWActive" ${isEdit && existing.is_active === false ? '' : 'checked'}>
          <span>Активен</span>
        </label>
      `;
    }

    if (kind === 'location') {
      title = isEdit ? 'Изменить зону' : 'Новая зона / ряд';
      fields = `
        <label class="sp-ref-field">
          <span>Склад</span>
          <select id="spRefLocWh">
            ${refs.warehouses.map(w => `
              <option value="${w.id}" ${isEdit && Number(existing.warehouse_id) === Number(w.id) ? 'selected' : ''}>
                ${escapeHtml(w.name)}
              </option>
            `).join('')}
          </select>
        </label>
        <label class="sp-ref-field">
          <span>Код (Зона/ряд)</span>
          <input id="spRefLocCode" type="text" value="${isEdit ? escapeHtml(existing.code) : ''}" placeholder="СлеваНиз/2ряд или A-01-05">
        </label>
        <div class="sp-ref-hint">Это то, что оператор видит в интерфейсе и указывает при приёмке.</div>
        <label class="sp-ref-field">
          <span>Зона (необязательно)</span>
          <input id="spRefLocZone" type="text" value="${isEdit ? escapeHtml(existing.zone || '') : ''}">
        </label>
        <label class="sp-ref-field">
          <span>Ряд (необязательно)</span>
          <input id="spRefLocRow" type="text" value="${isEdit ? escapeHtml(existing.row_name || '') : ''}">
        </label>
        <label class="sp-ref-field">
          <span>Место (необязательно)</span>
          <input id="spRefLocPlace" type="text" value="${isEdit ? escapeHtml(existing.place || '') : ''}">
        </label>
      `;
    }

    if (kind === 'pallet') {
      title = isEdit ? 'Изменить поддон' : 'Новый поддон';
      fields = `
        <label class="sp-ref-field">
          <span>Склад</span>
          <select id="spRefPalWh">
            ${refs.warehouses.map(w => `
              <option value="${w.id}" ${isEdit && Number(existing.warehouse_id) === Number(w.id) ? 'selected' : ''}>
                ${escapeHtml(w.name)}
              </option>
            `).join('')}
          </select>
        </label>
        <label class="sp-ref-field">
          <span>Зона / ряд</span>
          <select id="spRefPalLoc">
            <option value="">— не выбрано —</option>
            ${refs.locations.map(l => `
              <option value="${l.id}" ${isEdit && Number(existing.location_id) === Number(l.id) ? 'selected' : ''}>
                ${escapeHtml(l.code)}
              </option>
            `).join('')}
          </select>
        </label>
        <label class="sp-ref-field">
          <span>Номер поддона</span>
          <input id="spRefPalNumber" type="text" value="${isEdit ? escapeHtml(existing.pallet_number || '') : ''}" placeholder="А или 5">
        </label>
        <label class="sp-ref-field">
          <span>Статус</span>
          <select id="spRefPalStatus">
            ${['На складе', 'Пустой', 'Закрыт'].map(s => `
              <option value="${s}" ${isEdit && existing.status === s ? 'selected' : ''}>${s}</option>
            `).join('')}
          </select>
        </label>
      `;
    }

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-ref-modal">
        <div class="sp-ref-modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="sp-ref-modal-close" aria-label="Закрыть">×</button>
        </div>
        <div class="sp-ref-modal-body">
          ${fields}
          <div id="spRefModalError"></div>
        </div>
        <div class="sp-ref-modal-foot">
          <button type="button" class="sp-ref-btn sp-ref-btn-secondary" id="spRefCancel">Отмена</button>
          <button type="button" class="sp-ref-btn sp-ref-btn-primary" id="spRefSave">
            ${isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sp-ref-modal-close').addEventListener('click', closeModal);
    document.getElementById('spRefCancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const escHandler = e => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.getElementById('spRefSave').addEventListener('click', () => {
      saveEntity(kind, existing);
    });

    /* Автофокус */
    setTimeout(() => {
      const first = overlay.querySelector('input, select');
      if (first) first.focus();
    }, 30);
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  function showModalError(msg) {
    const el = document.getElementById('spRefModalError');
    if (el) el.innerHTML = `<div class="sp-ref-modal-err">${escapeHtml(msg)}</div>`;
  }

  /* ============== СОХРАНЕНИЕ ============== */

  async function saveEntity(kind, existing) {
    const client = getSupabase();
    if (!client) return;

    const isEdit = !!existing;
    const btn = document.getElementById('spRefSave');
    btn.disabled = true;
    btn.textContent = 'Сохранение…';

    try {
      let table = '';
      let payload = {};

      if (kind === 'warehouse') {
        table = 'warehouses';
        const name = (document.getElementById('spRefWName')?.value || '').trim();
        if (!name) { showModalError('Введите название'); btn.disabled = false; btn.textContent = 'Сохранить'; return; }
        payload = {
          name,
          is_active: !!document.getElementById('spRefWActive')?.checked
        };
      }

      if (kind === 'location') {
        table = 'locations';
        const warehouse_id = document.getElementById('spRefLocWh')?.value;
        const code = (document.getElementById('spRefLocCode')?.value || '').trim();
        if (!code) { showModalError('Введите код'); btn.disabled = false; btn.textContent = 'Сохранить'; return; }
        payload = {
          warehouse_id: warehouse_id ? Number(warehouse_id) : null,
          code,
          zone: (document.getElementById('spRefLocZone')?.value || '').trim() || null,
          row_name: (document.getElementById('spRefLocRow')?.value || '').trim() || null,
          place: (document.getElementById('spRefLocPlace')?.value || '').trim() || null,
          is_active: true
        };
      }

      if (kind === 'pallet') {
        table = 'pallets';
        const warehouse_id = document.getElementById('spRefPalWh')?.value;
        const location_id = document.getElementById('spRefPalLoc')?.value;
        const pallet_number = (document.getElementById('spRefPalNumber')?.value || '').trim();
        const status = document.getElementById('spRefPalStatus')?.value || 'На складе';
        if (!pallet_number) { showModalError('Введите номер поддона'); btn.disabled = false; btn.textContent = 'Сохранить'; return; }
        payload = {
          warehouse_id: warehouse_id ? Number(warehouse_id) : null,
          location_id: location_id ? Number(location_id) : null,
          pallet_number,
          status
        };
      }

      if (isEdit) {
        const { error } = await client.from(table).update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await client.from(table).insert(payload);
        if (error) throw error;
      }

      closeModal();
      toast(isEdit ? 'Сохранено' : 'Создано');
      await loadAll();
      renderCurrentPage();

    } catch (e) {
      console.error('[Refs] save error:', e);
      showModalError('Ошибка: ' + ((e && e.message) || String(e)));
      btn.disabled = false;
      btn.textContent = isEdit ? 'Сохранить' : 'Создать';
    }
  }

  /* ============== УДАЛЕНИЕ ============== */

  async function deleteEntity(kind, id) {
    const client = getSupabase();
    if (!client) return;

    let entity = null;
    let table = '';
    let label = '';
    let linkField = '';

    if (kind === 'warehouse') {
      entity = refs.warehouses.find(x => Number(x.id) === Number(id));
      table = 'warehouses';
      label = 'склад';
      linkField = 'warehouse_id';
    } else if (kind === 'location') {
      entity = refs.locations.find(x => Number(x.id) === Number(id));
      table = 'locations';
      label = 'зону';
      linkField = 'location_id';
    } else if (kind === 'pallet') {
      entity = refs.pallets.find(x => Number(x.id) === Number(id));
      table = 'pallets';
      label = 'поддон';
      linkField = 'pallet_id';
    }

    if (!entity) return;

    /* Проверяем связи с коробками */
    const linked = await countBoxesLinked(linkField, id);

    if (linked > 0) {
      if (!confirm(
        `Удалить ${label} «${entity.name || entity.code || entity.pallet_number}»?\n\n` +
        `⚠️ С этим объектом связано ${linked} коробок. ` +
        `При удалении у них обнулится поле привязки (станет NULL), но сами коробки останутся.\n\n` +
        `Продолжить?`
      )) return;
    } else {
      if (!confirm(`Удалить ${label} «${entity.name || entity.code || entity.pallet_number}»?`)) return;
    }

    try {
      const { error } = await client.from(table).delete().eq('id', id);
      if (error) throw error;

      toast('Удалено');
      await loadAll();
      renderCurrentPage();

    } catch (e) {
      console.error('[Refs] delete error:', e);
      toast('Ошибка удаления: ' + ((e && e.message) || String(e)), 'error');
    }
  }

  /* ============== ПЕРЕРИСОВКА СТРАНИЦЫ ============== */

  function renderCurrentPage() {
    const content = document.getElementById('content');
    if (!content) return;

    content.innerHTML = referencesView();
    setupReferencesHandlers();
  }

  /* ============== ОБРАБОТЧИКИ ============== */

  function setupReferencesHandlers() {
    /* Вкладки */
    document.querySelectorAll('[data-ref-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        refs.tab = tab.getAttribute('data-ref-tab');
        refs.search = '';
        renderCurrentPage();
      });
    });

    /* Поиск — обновляем только таблицу, не всю страницу */
    const searchInput = document.getElementById('spRefSearch');
    if (searchInput) {
      let timer = null;
      searchInput.addEventListener('input', e => {
        refs.search = e.target.value || '';
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const wrap = document.getElementById('spRefTableWrap');
          if (!wrap) return;
          if (refs.tab === 'locations') wrap.innerHTML = renderLocations();
          else if (refs.tab === 'pallets') wrap.innerHTML = renderPallets();
          else wrap.innerHTML = renderWarehouses();
          attachRowHandlers();
        }, 120);
      });
    }

    /* Кнопка "Добавить" */
    document.getElementById('spRefAdd')?.addEventListener('click', () => {
      const kind =
        refs.tab === 'locations' ? 'location' :
        refs.tab === 'pallets' ? 'pallet' :
        'warehouse';
      openModal(kind, null);
    });

    attachRowHandlers();
  }

  function attachRowHandlers() {
    document.querySelectorAll('[data-ref-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-ref-edit');
        const [kind, idStr] = raw.split(':');
        const id = Number(idStr);

        if (kind === 'warehouse') {
          const e = refs.warehouses.find(x => Number(x.id) === id);
          if (e) openModal('warehouse', e);
        } else if (kind === 'location') {
          const e = refs.locations.find(x => Number(x.id) === id);
          if (e) openModal('location', e);
        } else if (kind === 'pallet') {
          const e = refs.pallets.find(x => Number(x.id) === id);
          if (e) openModal('pallet', e);
        }
      });
    });

    document.querySelectorAll('[data-ref-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-ref-delete');
        const [kind, idStr] = raw.split(':');
        deleteEntity(kind, Number(idStr));
      });
    });
  }

  /* ============== ХУКИ В APP.JS ============== */

  function installHooks() {
    if (window.__refHooksInstalled) return;
    if (typeof window.goToPage !== 'function' || typeof window.render !== 'function') return;

    const origGoToPage = window.goToPage;
    const origRender = window.render;

    window.goToPage = function (page) {
      if (page === PAGE_KEY) {
        /* Своя страница: не идём в app.js */
        if (window.state) {
          state.currentPage = PAGE_KEY;
          state.activeTool = '';
        }

        /* Мета в topbar */
        const pt = document.getElementById('pageTitle');
        const h = document.getElementById('heading');
        if (pt) pt.textContent = 'Справочники';
        if (h) h.textContent = 'Управление справочниками';

        /* Отрисовка */
        loadAll().then(() => {
          renderCurrentPage();
          markSidebarActive();
        });
        return;
      }

      return origGoToPage.apply(this, arguments);
    };

    window.render = function () {
      if (window.state && state.currentPage === PAGE_KEY) {
        /* app.js render не должен вмешиваться */
        renderCurrentPage();
        markSidebarActive();
        return;
      }
      return origRender.apply(this, arguments);
    };

    window.__refHooksInstalled = true;
    console.log('[Refs] Хуки установлены');
  }

  function markSidebarActive() {
    document.querySelectorAll('.nav').forEach(btn => {
      btn.classList.remove('active');
    });
    const mine = document.querySelector('.nav[data-ref-nav]');
    if (mine) mine.classList.add('active');
  }

  /* ============== КНОПКА В САЙДБАРЕ ============== */

  function insertSidebarButton() {
    if (document.querySelector('.nav[data-ref-nav]')) return;

    /* Проверим, что мы админ — иначе кнопку не показываем */
    const role = window.spUIRoles?.getRole?.();
    if (role && role !== 'admin') return;

    /* Куда вставлять — найдём кнопку "Данные" в сайдбаре */
    const dataBtn = document.querySelector('.nav[data-page="data"]');
    const anchor = dataBtn ? dataBtn : document.querySelector('.nav[data-page="tools"]');
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.className = 'nav';
    btn.type = 'button';
    btn.setAttribute('data-ref-nav', '1');
    btn.innerHTML = `
      <span class="nav-icon"><svg class="icon"><use href="#icon-database"></use></svg></span>
      <span class="nav-label">Справочники</span>
    `;

    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      window.goToPage(PAGE_KEY);
    });

    anchor.insertAdjacentElement('afterend', btn);
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();
    installHooks();

    /* Вставляем кнопку в сайдбар — несколько попыток,
       потому что app.js может перерисовывать меню */
    const tryInsert = () => {
      try { insertSidebarButton(); } catch (e) { console.warn('[Refs] sidebar error:', e); }
    };

    setTimeout(tryInsert, 500);
    setTimeout(tryInsert, 2000);
    setTimeout(tryInsert, 5000);

    /* Повторно устанавливаем хуки при загрузке app.js */
    setTimeout(installHooks, 300);
    setTimeout(installHooks, 1500);

    console.log('[Refs] Модуль инициализирован');
  }

  init();

  window.spReferences = {
    reload: loadAll,
    version: '1.0.0'
  };

})();
