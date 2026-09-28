/* =========================================================
   SKLADAPLAN — ИСТОРИЯ КОРОБКИ
   =========================================================

   Что делает:
   - В таблице Базы рядом с кнопкой «Изменить» добавляет
     маленькую кнопку «🕓».
   - По клику открывает модалку с таймлайном: где коробка
     была, когда, кем, что менялось.

   Источники:
   - box_movements — физические перемещения.
   - audit_log    — приёмка, смена статуса, изменения полей.

   Изоляция:
   - Не трогает app.js.
   - MutationObserver аккуратный, с защитой от петли.
   - Если что-то упадёт, таблица Базы останется рабочей.
   ========================================================= */

(function () {
  'use strict';
  if (window.spBoxHistory) return;

  const STYLES_ID = 'spBoxHistoryStyles';
  const MODAL_ID = 'spBoxHistoryModal';
  const ATTACH_ATTR = 'data-history-attached';
  const HISTORY_BTN_CLASS = 'sp-history-btn';

  let observer = null;
  let scheduled = false;

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

  function fmtDateTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
             `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return ''; }
  }

  function fmtDateOnly(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    } catch (e) { return ''; }
  }

  function fmtTimeOnly(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return ''; }
  }

  function dateGroupKey(iso) {
    return iso ? iso.slice(0, 10) : '';
  }

  /* ============== СТИЛИ ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* Кнопка рядом с "Изменить" в таблице Базы */
      .sp-history-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        padding: 0 10px;
        margin-left: 4px;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        background: #f8fafc;
        color: #475569;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: background .15s ease, border-color .15s ease;
      }
      .sp-history-btn:hover {
        background: #eef2f7;
        border-color: #cbd5e1;
        color: #1e40af;
      }
      .sp-history-btn:active { transform: scale(.97); }

      /* Модалка */
      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100007;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-hist-card {
        background: #fff;
        border-radius: 16px;
        width: 100%; max-width: 640px;
        max-height: 90vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-hist-head {
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
        display: flex; align-items: center; justify-content: space-between;
      }
      #${MODAL_ID} .sp-hist-head h3 {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: #0f172a;
      }
      #${MODAL_ID} .sp-hist-close {
        border: 0;
        background: #f3f3f3;
        width: 34px; height: 34px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: #444;
      }
      #${MODAL_ID} .sp-hist-close:hover { background: #e5e5e5; }

      #${MODAL_ID} .sp-hist-info {
        padding: 12px 20px;
        background: #f8fafc;
        border-bottom: 1px solid #eef1f4;
        font-size: 12px;
        color: #475569;
        display: flex; flex-direction: column; gap: 4px;
      }
      #${MODAL_ID} .sp-hist-info b { color: #0f172a; }
      #${MODAL_ID} .sp-hist-info .sp-hist-row {
        display: flex; gap: 6px;
      }
      #${MODAL_ID} .sp-hist-info .sp-hist-k {
        color: #94a3b8;
        min-width: 80px;
      }

      #${MODAL_ID} .sp-hist-body {
        padding: 14px 20px 20px;
        overflow-y: auto;
        flex: 1;
      }
      #${MODAL_ID} .sp-hist-empty {
        padding: 30px 12px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
      }

      /* Таймлайн */
      #${MODAL_ID} .sp-hist-day {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: .05em;
        margin: 16px 0 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid #f1f5f9;
      }
      #${MODAL_ID} .sp-hist-day:first-child { margin-top: 0; }

      #${MODAL_ID} .sp-hist-item {
        display: flex; gap: 12px;
        padding: 10px 0;
        position: relative;
      }
      #${MODAL_ID} .sp-hist-item:not(:last-child)::after {
        content: '';
        position: absolute;
        left: 16px;
        top: 40px;
        bottom: -10px;
        width: 1px;
        background: #e2e8f0;
      }
      #${MODAL_ID} .sp-hist-icon {
        width: 34px; height: 34px;
        border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 15px;
        flex-shrink: 0;
        background: #f1f5f9;
        z-index: 1;
      }
      #${MODAL_ID} .sp-hist-icon-move { background: #dbeafe; color: #1e40af; }
      #${MODAL_ID} .sp-hist-icon-in { background: #d1fae5; color: #065f46; }
      #${MODAL_ID} .sp-hist-icon-status { background: #fef3c7; color: #92400e; }
      #${MODAL_ID} .sp-hist-icon-ship { background: #e0e7ff; color: #4338ca; }
      #${MODAL_ID} .sp-hist-icon-del { background: #fee2e2; color: #991b1b; }

      #${MODAL_ID} .sp-hist-content {
        flex: 1; min-width: 0;
      }
      #${MODAL_ID} .sp-hist-title {
        font-size: 13px; font-weight: 600;
        color: #0f172a;
        display: flex; align-items: center; gap: 8px;
        flex-wrap: wrap;
      }
      #${MODAL_ID} .sp-hist-time {
        font-size: 11px;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
        font-weight: 500;
      }
      #${MODAL_ID} .sp-hist-detail {
        font-size: 12px;
        color: #475569;
        margin-top: 4px;
        line-height: 1.5;
      }
      #${MODAL_ID} .sp-hist-detail code {
        background: #f1f5f9;
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 11px;
        font-family: ui-monospace, Menlo, monospace;
      }
      #${MODAL_ID} .sp-hist-detail .sp-hist-arrow {
        color: #94a3b8;
        margin: 0 6px;
      }
      #${MODAL_ID} .sp-hist-operator {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 4px;
      }

      @media (max-width: 640px) {
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-hist-card {
          max-width: none;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ВСТАВКА КНОПОК В ТАБЛИЦУ БАЗЫ ============== */

  function attachHistoryButtons() {
    /* Находим все .edit-box в таблице Базы */
    const editBtns = document.querySelectorAll('.edit-box');

    if (!editBtns.length) return;

    editBtns.forEach(editBtn => {
      const id = editBtn.getAttribute('data-id');
      if (!id) return;

      /* Уже привязали? Проверяем наличие следующей кнопки */
      const parent = editBtn.parentNode;
      if (!parent) return;
      if (parent.querySelector('.sp-history-btn')) return;

      /* Создаём кнопку */
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-history-btn';
      btn.setAttribute('data-history-box', id);
      btn.title = 'История коробки';
      btn.innerHTML = '🕓';

      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openHistory(id);
      });

      /* Вставляем сразу после edit-btn */
      if (editBtn.nextSibling) {
        parent.insertBefore(btn, editBtn.nextSibling);
      } else {
        parent.appendChild(btn);
      }
    });
  }

  function scheduleAttach() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { attachHistoryButtons(); } catch (e) {
        console.warn('[BoxHistory] attach error:', e);
      }
    });
  }

  /* ============== ЗАГРУЗКА ДАННЫХ ============== */

  async function loadBoxInfo(boxId) {
    const client = getSupabase();
    if (!client) return null;

    const { data, error } = await client
      .from('boxes')
      .select('*')
      .eq('id', boxId)
      .maybeSingle();

    if (error) {
      console.warn('[BoxHistory] box info error:', error);
      return null;
    }
    return data;
  }

  async function loadMovements(boxId) {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('box_movements')
      .select('*')
      .eq('box_id', boxId)
      .order('moved_at', { ascending: true });

    if (error) {
      console.warn('[BoxHistory] movements error:', error);
      return [];
    }
    return data || [];
  }

  async function loadAuditEvents(boxId) {
    const client = getSupabase();
    if (!client) return [];

    /* Ищем в audit_log события по этой коробке */
    const { data, error } = await client
      .from('audit_log')
      .select('*')
      .eq('table_name', 'boxes')
      .eq('record_id', String(boxId))
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[BoxHistory] audit error:', error);
      return [];
    }
    return data || [];
  }

  /* ============== ФОРМИРОВАНИЕ ТАЙМЛАЙНА ============== */

  function reasonLabel(reason) {
    const map = {
      move: 'Перемещение',
      pallet_merge: 'Объединение паллет',
      optimization: 'Оптимизация склада',
      pallet_build: 'Формирование поддона',
      inventory: 'Инвентаризация',
      receiving: 'Приёмка'
    };
    return map[reason] || reason || 'Перемещение';
  }

  function statusLabel(status) {
    const map = {
      'На складе': 'На складе',
      'Зарезервирована': 'Зарезервирована',
      'КПодбору': 'К подбору',
      'Скомплектовано': 'Скомплектовано',
      'Отгружено': 'Отгружено',
      'Пустая': 'Пустая'
    };
    return map[status] || status;
  }

  function locationText(warehouse, zone, pallet) {
    const parts = [];
    if (warehouse) parts.push(warehouse);
    if (zone) parts.push(zone);
    if (pallet) parts.push('поддон ' + pallet);
    return parts.join(' · ');
  }

  function buildTimeline(movements, auditEvents, boxInfo) {
    const items = [];

    /* --- Физические перемещения --- */
    movements.forEach(m => {
      const from = locationText(m.from_warehouse_text, m.from_zone_text, m.from_pallet_text);
      const to = locationText(m.to_warehouse_text, m.to_zone_text, m.to_pallet_text);

      items.push({
        ts: m.moved_at,
        icon: m.reason === 'optimization' ? '⚙️' : '📦',
        iconClass: 'sp-hist-icon-move',
        title: reasonLabel(m.reason),
        detail: from || to
          ? (from ? escapeHtml(from) : '—') +
            ' <span class="sp-hist-arrow">→</span> ' +
            (to ? escapeHtml(to) : '—')
          : null,
        operator: m.operator || null
      });
    });

    /* --- Из audit_log --- */
    auditEvents.forEach(ev => {
      const n = ev.new_data || {};
      const o = ev.old_data || {};

      if (ev.action === 'INSERT') {
        const loc = locationText(n['Склад'], n['Зона/ряд'], n['Поддон']);
        items.push({
          ts: ev.created_at,
          icon: '📥',
          iconClass: 'sp-hist-icon-in',
          title: 'Принята на склад',
          detail: loc ? escapeHtml(loc) : null,
          operator: ev.operator_email
        });
        return;
      }

      if (ev.action === 'DELETE') {
        items.push({
          ts: ev.created_at,
          icon: '🗑',
          iconClass: 'sp-hist-icon-del',
          title: 'Удалена из базы',
          detail: null,
          operator: ev.operator_email
        });
        return;
      }

      /* UPDATE */
      const changed = Array.isArray(ev.changed_fields) ? ev.changed_fields : [];

      /* Смена статуса — самое интересное */
      if (changed.includes('Статус')) {
        const fromStatus = o['Статус'] || '—';
        const toStatus = n['Статус'] || '—';

        /* Иконка по новому статусу */
        let icon = '🔄';
        let iconClass = 'sp-hist-icon-status';
        if (toStatus === 'КПодбору') icon = '🎯';
        if (toStatus === 'Скомплектовано') { icon = '✅'; }
        if (toStatus === 'Отгружено') { icon = '🚚'; iconClass = 'sp-hist-icon-ship'; }
        if (toStatus === 'На складе' && fromStatus === 'Скомплектовано') { icon = '↩️'; }

        items.push({
          ts: ev.created_at,
          icon,
          iconClass,
          title: 'Статус изменён',
          detail: `<code>${escapeHtml(statusLabel(fromStatus))}</code>` +
                  ` <span class="sp-hist-arrow">→</span> ` +
                  `<code>${escapeHtml(statusLabel(toStatus))}</code>`,
          operator: ev.operator_email
        });
      }

      /* Изменение адреса (Склад/Зона/Поддон) — если оно произошло
         НЕ через box_movements, а прямым UPDATE. Это редкий случай —
         обычно адрес меняется через RPC. */
      const addressFields = ['Склад', 'Зона/ряд', 'Поддон'];
      const addressChanged = addressFields.some(f => changed.includes(f));

      if (addressChanged) {
        const fromLoc = locationText(o['Склад'], o['Зона/ряд'], o['Поддон']);
        const toLoc = locationText(n['Склад'], n['Зона/ряд'], n['Поддон']);

        items.push({
          ts: ev.created_at,
          icon: '📍',
          iconClass: 'sp-hist-icon-move',
          title: 'Адрес изменён',
          detail: (fromLoc ? escapeHtml(fromLoc) : '—') +
                  ' <span class="sp-hist-arrow">→</span> ' +
                  (toLoc ? escapeHtml(toLoc) : '—'),
          operator: ev.operator_email
        });
      }
    });

    /* Сортируем по времени */
    items.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

    return items;
  }

  function renderTimelineHtml(items) {
    if (!items.length) {
      return '<div class="sp-hist-empty">История этой коробки пуста.<br>' +
             '<span style="font-size:11px;">Возможно, изменения записываются только в audit_log ' +
             'с недавнего времени.</span></div>';
    }

    let html = '';
    let lastDay = '';

    items.forEach(it => {
      const day = dateGroupKey(it.ts);
      if (day && day !== lastDay) {
        html += `<div class="sp-hist-day">${escapeHtml(fmtDateOnly(it.ts))}</div>`;
        lastDay = day;
      }

      html += `
        <div class="sp-hist-item">
          <div class="sp-hist-icon ${it.iconClass}">${it.icon}</div>
          <div class="sp-hist-content">
            <div class="sp-hist-title">
              <span>${escapeHtml(it.title)}</span>
              <span class="sp-hist-time">${escapeHtml(fmtTimeOnly(it.ts))}</span>
            </div>
            ${it.detail ? `<div class="sp-hist-detail">${it.detail}</div>` : ''}
            ${it.operator ? `<div class="sp-hist-operator">👤 ${escapeHtml(it.operator)}</div>` : ''}
          </div>
        </div>
      `;
    });

    return html;
  }

  /* ============== МОДАЛКА ============== */

  async function openHistory(boxId) {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-hist-card">
        <div class="sp-hist-head">
          <h3>🕓 История коробки</h3>
          <button type="button" class="sp-hist-close" aria-label="Закрыть">×</button>
        </div>
        <div class="sp-hist-info" id="spHistInfo">
          <div class="sp-hist-row"><span class="sp-hist-k">Загрузка…</span></div>
        </div>
        <div class="sp-hist-body" id="spHistBody">
          <div class="sp-hist-empty">Загрузка истории…</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sp-hist-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const escHandler = e => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    /* --- Загрузка --- */

    const infoEl = document.getElementById('spHistInfo');
    const bodyEl = document.getElementById('spHistBody');

    try {
      const [boxInfo, movements, auditEvents] = await Promise.all([
        loadBoxInfo(boxId),
        loadMovements(boxId),
        loadAuditEvents(boxId)
      ]);

      if (!boxInfo) {
        infoEl.innerHTML = `<div class="sp-hist-row"><span class="sp-hist-k">Коробка</span><b>ID ${escapeHtml(boxId)}</b></div>`;
        bodyEl.innerHTML = '<div class="sp-hist-empty">Коробка не найдена в базе.</div>';
        return;
      }

      infoEl.innerHTML = `
        <div class="sp-hist-row">
          <span class="sp-hist-k">Штрихкод</span>
          <b>${escapeHtml(boxInfo['Штрихкод'] || '—')}</b>
        </div>
        ${boxInfo['Артикул'] ? `
          <div class="sp-hist-row">
            <span class="sp-hist-k">Артикул</span>
            <b>${escapeHtml(boxInfo['Артикул'])}</b>
          </div>
        ` : ''}
        <div class="sp-hist-row">
          <span class="sp-hist-k">Текущее место</span>
          <b>${escapeHtml(locationText(boxInfo['Склад'], boxInfo['Зона/ряд'], boxInfo['Поддон']) || '—')}</b>
        </div>
        <div class="sp-hist-row">
          <span class="sp-hist-k">Статус</span>
          <b>${escapeHtml(statusLabel(boxInfo['Статус']) || '—')}</b>
        </div>
      `;

      const items = buildTimeline(movements, auditEvents, boxInfo);
      bodyEl.innerHTML = renderTimelineHtml(items);

    } catch (e) {
      console.error('[BoxHistory] open error:', e);
      bodyEl.innerHTML = '<div class="sp-hist-empty">Не удалось загрузить историю</div>';
    }
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();

    const startObserver = () => {
      if (observer) return;
      observer = new MutationObserver(() => {
        scheduleAttach();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleAttach();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }

    /* Несколько разовых вызовов — на случай, если observer
       пропустит быстрые изменения при перерисовке */
    setTimeout(scheduleAttach, 500);
    setTimeout(scheduleAttach, 1500);
    setTimeout(scheduleAttach, 3000);

    console.log('[BoxHistory] Модуль инициализирован');
  }

  init();

  window.spBoxHistory = {
    open: openHistory,
    version: '1.0.0'
  };

})();
