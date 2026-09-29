/* =========================================================
   SKLADAPLAN — ОПТИМИЗАЦИЯ СКЛАДА (карточка на главной, v2)
   Идемпотентный: при каждом тике следит, чтобы «Информация»
   была ровно одна и лежала в правой колонке .sp-dash-right-col
   вместе с блоком оптимизации. Дубликаты удаляет.
   ========================================================= */

(function () {
  'use strict';
  if (window.spDashOptimizationTips) return;

  const BLOCK_ID = 'spDashOptimizationTips';
  const STYLES_ID = 'spDashOptimizationTipsStyles';
  const RIGHT_COL_CLASS = 'sp-dash-right-col';
  const INCOMPLETE_THRESHOLD = 15;
  const MAX_SHOWN = 3;

  let scheduled = false;
  let observer = null;

  function getAppState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    if (window.state) return window.state;
    return null;
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function computeTips(boxes) {
    const map = new Map();
    for (const b of boxes) {
      if (b.status === 'Отгружено' || b.status === 'Пустая') continue;
      const pallet = (b.pallet || '').trim();
      if (!pallet) continue;
      const zone = (b.zone_row || '').trim();
      const wh = (b.warehouse || '').trim();
      const key = wh + '||' + zone + '||' + pallet;
      if (!map.has(key)) map.set(key, { wh, zone, pallet, count: 0 });
      map.get(key).count++;
    }
    const pallets = [...map.values()];
    const totalBoxes = pallets.reduce((s, p) => s + p.count, 0);
    const avgLoad = pallets.length ? Math.round(totalBoxes / pallets.length) : 0;
    const incomplete = pallets.filter(p => p.count < INCOMPLETE_THRESHOLD)
      .sort((a, b) => a.count - b.count);

    const byZone = new Map();
    for (const p of incomplete) {
      const k = p.wh + '||' + p.zone;
      if (!byZone.has(k)) byZone.set(k, []);
      byZone.get(k).push(p);
    }
    let freedTotal = 0;
    for (const arr of byZone.values()) {
      const totalInZone = arr.reduce((s, p) => s + p.count, 0);
      const before = arr.length;
      const after = Math.max(1, Math.ceil(totalInZone / INCOMPLETE_THRESHOLD));
      freedTotal += Math.max(0, before - after);
    }
    return {
      totalPallets: pallets.length,
      avgLoad,
      incomplete,
      incompleteTotal: incomplete.length,
      freed: freedTotal
    };
  }

  function buildBlock(boxes) {
    const tips = computeTips(boxes);
    const wrap = document.createElement('div');
    wrap.id = BLOCK_ID;

    const topIncomplete = tips.incomplete.slice(0, MAX_SHOWN);
    const hasPotential = tips.freed > 0;
    let contentHtml = '';

    if (hasPotential) {
      contentHtml = `
        <div class="sp-ot-big">
          <div class="sp-ot-big-num">${tips.freed}</div>
          <div class="sp-ot-big-label">
            ${tips.freed === 1 ? 'паллету' : 'паллет'} можно освободить
          </div>
        </div>
        <div class="sp-ot-sub">Топ неполных паллет:</div>
        <div class="sp-ot-list">
          ${topIncomplete.map(p => `
            <div class="sp-ot-row">
              <span class="sp-ot-row-name" title="${esc(p.wh)} · ${esc(p.zone)} · ${esc(p.pallet)}">
                ${esc(p.zone || '—')} · ${esc(p.pallet)}
              </span>
              <span class="sp-ot-row-num">${p.count}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else if (tips.incompleteTotal > 0) {
      contentHtml = `
        <div class="sp-ot-big">
          <div class="sp-ot-big-num">${tips.incompleteTotal}</div>
          <div class="sp-ot-big-label">
            ${tips.incompleteTotal === 1 ? 'неполная паллета' : 'неполных паллет'}
          </div>
        </div>
        <div class="sp-ot-sub">Объединение не сэкономит место — коробки разбросаны по разным зонам.</div>
      `;
    } else {
      contentHtml = `
        <div class="sp-ot-empty">
          ✓ Склад оптимизирован.<br>
          Неполных паллет нет.
        </div>
      `;
    }

    wrap.innerHTML = `
      <div class="sp-ot-head">
        <span class="sp-ot-title">🔧 Оптимизация склада</span>
      </div>
      ${contentHtml}
      <div class="sp-ot-stats">
        <div class="sp-ot-stat">
          <span class="sp-ot-stat-label">Паллет</span>
          <span class="sp-ot-stat-value">${tips.totalPallets}</span>
        </div>
        <div class="sp-ot-stat">
          <span class="sp-ot-stat-label">Ср. загрузка</span>
          <span class="sp-ot-stat-value">${tips.avgLoad}</span>
        </div>
      </div>
      <button type="button" class="sp-ot-action" data-ot-open>
        Открыть оптимизацию →
      </button>
    `;

    return wrap;
  }

  function bindHandlers(root) {
    root.querySelector('[data-ot-open]')?.addEventListener('click', () => {
      if (typeof window.goToPage === 'function') window.goToPage('optimization');
    });
  }

  /* ---------- Поиск «Информации» ---------- */

  function isInfoCard(card) {
    if (!card || card.id === BLOCK_ID) return false;
    if (card.id === 'spDashboardInsights') return false;
    const first = card.firstElementChild;
    if (!first) return false;
    return /Информация/i.test((first.textContent || '').trim());
  }

  function findAllInfoCards(scope) {
    return [...scope.querySelectorAll(':scope > .sp-card')].filter(isInfoCard);
  }

  function build() {
    const isDash = !!document.getElementById('spDashboardHeader');

    if (!isDash) {
      document.getElementById(BLOCK_ID)?.remove();
      return;
    }

    const st = getAppState();
    if (!st || !Array.isArray(st.boxes)) return;

    const columns = document.querySelector('#content .sp-dashboard-columns');
    if (!columns) return;

    const swodka = document.getElementById('spDashboardInsights');
    if (!swodka) return;

    /* 1. Найти/создать правую колонку */
    let rightCol = columns.querySelector(':scope > .' + RIGHT_COL_CLASS);
    if (!rightCol) {
      rightCol = document.createElement('div');
      rightCol.className = RIGHT_COL_CLASS;
    }

    /* 2. Найти все «Информации» где угодно в #content */
    const allInfo = [...document.querySelectorAll('#content .sp-card')].filter(isInfoCard);

    /* Если «Информации» нет вообще — выходим (перерисовка ещё не завершилась) */
    if (!allInfo.length) return;

    /* Оставляем первую, остальные удаляем */
    const keepInfo = allInfo[0];
    for (let i = 1; i < allInfo.length; i++) allInfo[i].remove();

    /* Убеждаемся, что колонка стоит в columns, и переставим её после сводки */
    if (rightCol.parentElement !== columns) {
      columns.appendChild(rightCol);
    }
    if (swodka.nextElementSibling !== rightCol) {
      columns.insertBefore(rightCol, swodka.nextElementSibling);
    }

    /* Переносим «Информацию» внутрь rightCol */
    if (keepInfo.parentElement !== rightCol) {
      rightCol.appendChild(keepInfo);
    }

    /* 3. Собираем/обновляем блок оптимизации */
    const fresh = buildBlock(st.boxes);
    bindHandlers(fresh);

    const existing = document.getElementById(BLOCK_ID);
    if (existing) existing.remove();

    /* Оптимизация — над «Информацией» */
    rightCol.insertBefore(fresh, keepInfo);

    /* 4. Убираем «Информацию» со старого места в columns, если осталась */
    [...columns.querySelectorAll(':scope > .sp-card')].forEach(card => {
      if (card !== swodka && card !== fresh && card !== rightCol && card !== keepInfo) {
        /* Оставляем только те, что не являются дублем Info */
        if (isInfoCard(card)) card.remove();
      }
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      .sp-dash-right-col {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
      }
      .sp-dash-right-col > .sp-card {
        margin: 0 !important;
      }
      #${BLOCK_ID} {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 14px;
        padding: 14px 16px;
        margin: 0;
        box-shadow: var(--shadow-card);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #${BLOCK_ID} .sp-ot-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      #${BLOCK_ID} .sp-ot-title {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
      }
      #${BLOCK_ID} .sp-ot-big {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 6px 0 4px;
      }
      #${BLOCK_ID} .sp-ot-big-num {
        font-size: 40px;
        line-height: 1;
        font-weight: 800;
        color: #b45309;
        font-variant-numeric: tabular-nums;
        letter-spacing: -.02em;
      }
      #${BLOCK_ID} .sp-ot-big-label {
        font-size: 13px;
        color: #78350f;
        line-height: 1.25;
        font-weight: 600;
      }
      #${BLOCK_ID} .sp-ot-sub {
        font-size: 11px;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: .04em;
        font-weight: 700;
      }
      #${BLOCK_ID} .sp-ot-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      #${BLOCK_ID} .sp-ot-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 9px;
        background: #fffbeb;
        border: 1px solid #fef3c7;
        border-radius: 8px;
        font-size: 12px;
      }
      #${BLOCK_ID} .sp-ot-row-name {
        font-weight: 700;
        color: #78350f;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }
      #${BLOCK_ID} .sp-ot-row-num {
        font-weight: 800;
        color: #b45309;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
      }
      #${BLOCK_ID} .sp-ot-empty {
        padding: 12px 6px;
        text-align: center;
        font-size: 12px;
        color: #64748b;
        line-height: 1.5;
        background: #f0fdf4;
        border: 1px solid #dcfce7;
        border-radius: 10px;
      }
      #${BLOCK_ID} .sp-ot-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid #f1f5f9;
      }
      #${BLOCK_ID} .sp-ot-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      #${BLOCK_ID} .sp-ot-stat-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .04em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      #${BLOCK_ID} .sp-ot-stat-value {
        font-size: 16px;
        font-weight: 800;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }
      #${BLOCK_ID} .sp-ot-action {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 10px 12px;
        border: 0;
        border-radius: 10px;
        background: var(--primary, #2563EB);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        transition: background .15s ease;
      }
      #${BLOCK_ID} .sp-ot-action:hover { background: var(--primary-hover, #1D4ED8); }
      #${BLOCK_ID} .sp-ot-action:active { transform: scale(.98); }
    `;
    document.head.appendChild(style);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { build(); } catch (e) { console.warn('[DashOptimizationTips] error:', e); }
    });
  }

  function startObserver() {
    if (observer) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }
    observer = new MutationObserver(() => schedule());
    observer.observe(content, { childList: true, subtree: true });
    schedule();
  }

  function init() {
    injectStyles();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
    let ticks = 0;
    const t = setInterval(() => { ticks++; schedule(); if (ticks >= 60) clearInterval(t); }, 400);
  }

  init();

  window.spDashOptimizationTips = { rebuild: schedule, version: '2.0.0' };
})();
