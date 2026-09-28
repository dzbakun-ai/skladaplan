/* =========================================================
   SKLADAPLAN — ОТГРУЗКА С ПОДТВЕРЖДЕНИЕМ
   =========================================================

   Что делает:
   - Перехватывает клик по кнопке "Отгрузить выбранные"
     в разделе "Собрано".
   - Открывает модалку: получатель, водитель, машина, заметка.
   - По сабмиту: вызывает RPC sp_ship_boxes (как раньше)
     + записывает в shipments_log.
   - Галочка "Быстрая отгрузка" — пропустить форму.

   Изоляция:
   - app.js не трогаем.
   - Через capture-фазу перехватываем клик раньше, чем
     сработает встроенный обработчик.
   ========================================================= */

(function () {
  'use strict';
  if (window.spShipConfirm) return;

  const MODAL_ID = 'spShipConfirmModal';
  const STYLES_ID = 'spShipConfirmStyles';

  /* ============== БЕЗОПАСНЫЙ ДОСТУП ============== */

  function getAppState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    if (window.state) return window.state;
    return null;
  }

  function getSupabase() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'success');
    else console.log('[ShipConfirm]', msg);
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100012;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-sc-card {
        background: #fff;
        border-radius: 16px;
        width: 100%; max-width: 520px;
        max-height: 92vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-sc-head {
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
        display: flex; align-items: center; justify-content: space-between;
      }
      #${MODAL_ID} .sp-sc-head h3 {
        margin: 0; font-size: 17px; font-weight: 700;
      }
      #${MODAL_ID} .sp-sc-close {
        border: 0; background: #f3f3f3;
        width: 34px; height: 34px;
        border-radius: 50%; cursor: pointer;
        font-size: 20px; line-height: 1; color: #444;
      }
      #${MODAL_ID} .sp-sc-close:hover { background: #e5e5e5; }

      #${MODAL_ID} .sp-sc-body {
        padding: 16px 20px; overflow-y: auto; flex: 1;
      }
      #${MODAL_ID} .sp-sc-summary {
        padding: 12px 14px; background: #eff6ff;
        border-radius: 10px; font-size: 13px; color: #1e40af;
        margin-bottom: 16px; line-height: 1.5;
      }
      #${MODAL_ID} .sp-sc-summary b { font-weight: 700; }

      #${MODAL_ID} .sp-sc-field { display: block; margin-bottom: 12px; }
      #${MODAL_ID} .sp-sc-field > span {
        display: block; font-size: 12px; font-weight: 600;
        color: #475569; margin-bottom: 5px;
      }
      #${MODAL_ID} .sp-sc-field > span .opt {
        color: #94a3b8; font-weight: 500;
      }
      #${MODAL_ID} .sp-sc-field input,
      #${MODAL_ID} .sp-sc-field textarea {
        width: 100%; box-sizing: border-box;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 10px 12px; font-size: 13px;
        outline: none; background: #fff; font-family: inherit;
      }
      #${MODAL_ID} .sp-sc-field textarea {
        resize: vertical; min-height: 52px;
      }
      #${MODAL_ID} .sp-sc-field input:focus,
      #${MODAL_ID} .sp-sc-field textarea:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${MODAL_ID} .sp-sc-row {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
      }

      #${MODAL_ID} .sp-sc-quick {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px; margin-top: 4px;
        background: #f8fafc; border-radius: 10px;
        font-size: 13px; cursor: pointer;
      }
      #${MODAL_ID} .sp-sc-quick input {
        width: 16px; height: 16px;
        accent-color: var(--primary, #2563EB); cursor: pointer;
      }
      #${MODAL_ID} .sp-sc-hint {
        font-size: 11px; color: #94a3b8;
        margin-top: -6px; margin-bottom: 10px;
      }

      #${MODAL_ID} .sp-sc-foot {
        padding: 12px 20px 16px;
        display: flex; gap: 8px; justify-content: flex-end;
        border-top: 1px solid #eef1f4; background: #fafbfc;
      }
      #${MODAL_ID} .sp-sc-btn {
        border: 0; border-radius: 9px; padding: 11px 18px;
        font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #${MODAL_ID} .sp-sc-btn-primary { background: var(--primary, #2563EB); color: #fff; }
      #${MODAL_ID} .sp-sc-btn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${MODAL_ID} .sp-sc-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
      #${MODAL_ID} .sp-sc-btn-secondary {
        background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0;
      }
      #${MODAL_ID} .sp-sc-btn-secondary:hover { background: #e2e8f0; }

      #${MODAL_ID} .sp-sc-error {
        margin: 8px 0 0;
        padding: 10px 12px;
        background: #fef2f2; color: #991b1b;
        border-radius: 8px; font-size: 12px;
      }

      @media (max-width: 640px) {
        #${MODAL_ID} .sp-sc-row { grid-template-columns: 1fr; }
        #${MODAL_ID} .sp-sc-foot { flex-direction: column; }
        #${MODAL_ID} .sp-sc-btn { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== СБОР ВЫБРАННЫХ ============== */

  function getSelectedBoxIds() {
    const ids = [];
    document.querySelectorAll('.collected-check').forEach(cb => {
      if (cb.checked) {
        const id = cb.getAttribute('data-id');
        if (id) ids.push(id);
      }
    });
    return ids;
  }

  function getSelectedBoxes(ids) {
    const st = getAppState();
    const boxes = st?.boxes || [];
    return ids
      .map(id => boxes.find(b => String(b.id) === String(id)))
      .filter(Boolean);
  }

  /* ============== МОДАЛКА ============== */

  function openModal(boxIds) {
    if (document.getElementById(MODAL_ID)) return;

    const boxes = getSelectedBoxes(boxIds);

    /* Определяем направление: если у всех одно — покажем, иначе "разные" */
    const directions = new Set(boxes.map(b => (b.direction || '').trim()).filter(Boolean));
    const warehouses = new Set(boxes.map(b => (b.warehouse || '').trim()).filter(Boolean));

    const dirText = directions.size === 1
      ? [...directions][0]
      : (directions.size === 0 ? '—' : `${directions.size} направления`);

    const whText = warehouses.size === 1
      ? [...warehouses][0]
      : (warehouses.size === 0 ? '—' : `${warehouses.size} склада`);

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-sc-card">
        <div class="sp-sc-head">
          <h3>🚚 Подтверждение отгрузки</h3>
          <button type="button" class="sp-sc-close" aria-label="Закрыть">×</button>
        </div>

        <div class="sp-sc-body">
          <div class="sp-sc-summary">
            Отгружается <b>${boxIds.length}</b> коробок<br>
            Направление: <b>${escapeHtml(dirText)}</b><br>
            Склад: <b>${escapeHtml(whText)}</b>
          </div>

          <div class="sp-sc-row">
            <label class="sp-sc-field">
              <span>Получатель <span class="opt">(ФИО)</span></span>
              <input id="spScRecipient" type="text" placeholder="Иванов Иван" autocomplete="off">
            </label>
            <label class="sp-sc-field">
              <span>Телефон получателя <span class="opt">(необязательно)</span></span>
              <input id="spScRecipientContact" type="text" placeholder="+7 999 123-45-67" autocomplete="off">
            </label>
          </div>

          <div class="sp-sc-row">
            <label class="sp-sc-field">
              <span>Водитель <span class="opt">(ФИО)</span></span>
              <input id="spScDriver" type="text" placeholder="Петров Пётр" autocomplete="off">
            </label>
            <label class="sp-sc-field">
              <span>Номер машины <span class="opt">(необязательно)</span></span>
              <input id="spScVehicle" type="text" placeholder="А123БВ 77" autocomplete="off">
            </label>
          </div>

          <label class="sp-sc-field">
            <span>Заметка <span class="opt">(необязательно)</span></span>
            <textarea id="spScNote" placeholder="Что-то важное про эту отгрузку"></textarea>
          </label>

          <label class="sp-sc-quick">
            <input type="checkbox" id="spScQuick">
            <span>Быстрая отгрузка без данных (можно пропустить поля)</span>
          </label>
          <div class="sp-sc-hint">
            При быстрой отгрузке в журнал запишется только «отгружено N коробок».
          </div>

          <div id="spScError"></div>
        </div>

        <div class="sp-sc-foot">
          <button type="button" class="sp-sc-btn sp-sc-btn-secondary" id="spScCancel">Отмена</button>
          <button type="button" class="sp-sc-btn sp-sc-btn-primary" id="spScConfirm">Отгрузить ${boxIds.length}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sp-sc-close').addEventListener('click', closeModal);
    document.getElementById('spScCancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const escHandler = e => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.getElementById('spScConfirm').addEventListener('click', () => doShip(boxIds, boxes));

    /* Фокус на первое поле */
    setTimeout(() => {
      const first = document.getElementById('spScRecipient');
      if (first) first.focus();
    }, 30);
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  function showError(msg) {
    const el = document.getElementById('spScError');
    if (el) el.innerHTML = `<div class="sp-sc-error">${escapeHtml(msg)}</div>`;
  }

  /* ============== ОТГРУЗКА ============== */

  async function doShip(boxIds, boxes) {
    const btn = document.getElementById('spScConfirm');
    const client = getSupabase();
    if (!client) {
      showError('Supabase-клиент недоступен');
      return;
    }

    const quick = !!document.getElementById('spScQuick')?.checked;

    const recipient = quick ? '' : (document.getElementById('spScRecipient')?.value || '').trim();
    const recipientContact = quick ? '' : (document.getElementById('spScRecipientContact')?.value || '').trim();
    const driver = quick ? '' : (document.getElementById('spScDriver')?.value || '').trim();
    const vehicle = quick ? '' : (document.getElementById('spScVehicle')?.value || '').trim();
    const note = quick ? '' : (document.getElementById('spScNote')?.value || '').trim();

    if (!quick && !recipient) {
      showError('Укажите получателя или отметьте «Быстрая отгрузка»');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Отгрузка…';

    const operatorEmail = (getAppState()?.user?.email) || null;

    /* ---- 1. Отгрузка через RPC (как в app.js) ---- */

    const { data, error } = await client.rpc('sp_ship_boxes', {
      p_box_ids: boxIds,
      p_operator: operatorEmail
    });

    if (error) {
      console.error('[ShipConfirm] RPC error:', error);
      showError('Ошибка отгрузки: ' + (error.message || 'неизвестная'));
      btn.disabled = false;
      btn.textContent = `Отгрузить ${boxIds.length}`;
      return;
    }

    const shippedRows = Array.isArray(data) ? data : [];

    if (!shippedRows.length) {
      showError('Ни одна коробка не отгружена. Возможно, их статус изменился.');
      btn.disabled = false;
      btn.textContent = `Отгрузить ${boxIds.length}`;
      return;
    }

    /* ---- 2. Запись в shipments_log ---- */

    const directions = new Set(boxes.map(b => (b.direction || '').trim()).filter(Boolean));
    const warehouses = new Set(boxes.map(b => (b.warehouse || '').trim()).filter(Boolean));

    const directionValue = directions.size === 1 ? [...directions][0] : null;
    const warehouseValue = warehouses.size === 1 ? [...warehouses][0] : null;

    try {
      const { error: logErr } = await client
        .from('shipments_log')
        .insert({
          box_ids: shippedRows.map(r => r.id),
          box_count: shippedRows.length,
          direction: directionValue,
          warehouse: warehouseValue,
          recipient_name: recipient || null,
          recipient_contact: recipientContact || null,
          driver_name: driver || null,
          vehicle_number: vehicle || null,
          note: note || null,
          operator_email: operatorEmail
        });

      if (logErr) {
        console.warn('[ShipConfirm] log insert error:', logErr);
        /* Не блокируем — отгрузка уже произошла */
        toast('Отгружено, но запись в журнал не сохранилась', 'error');
      }

    } catch (e) {
      console.warn('[ShipConfirm] log insert exception:', e);
    }

    /* ---- 3. Обновление UI ---- */

    closeModal();

    toast(`Отгружено: ${shippedRows.length}`);

    /* Перезагрузка базы — так же, как делает shipSelectedCollected в app.js */
    if (typeof window.loadBoxesFromSupabase === 'function') {
      try {
        await window.loadBoxesFromSupabase();
      } catch (e) {
        console.warn('[ShipConfirm] reload error:', e);
      }
    }

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /* ============== ПЕРЕХВАТ КЛИКА ============== */

  function interceptClick(event) {
    const btn = event.target.closest('#shipCollectedBtn');
    if (!btn) return;

    /* Если уже открыто — игнорируем */
    if (document.getElementById(MODAL_ID)) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }

    const ids = getSelectedBoxIds();

    if (!ids.length) {
      /* Пусто — отдаём обработчику app.js показать его тост */
      return;
    }

    /* Останавливаем встроенный обработчик и открываем свою модалку */
    event.stopImmediatePropagation();
    event.preventDefault();

    openModal(ids);
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();

    /* capture: true — сработает ДО обработчика app.js */
    document.addEventListener('click', interceptClick, true);

    console.log('[ShipConfirm] Модуль инициализирован');
  }

  init();

  window.spShipConfirm = {
    open: (ids) => {
      if (!ids || !ids.length) {
        toast('Нет коробок для отгрузки', 'error');
        return;
      }
      openModal(ids);
    },
    version: '1.0.0'
  };

})();
