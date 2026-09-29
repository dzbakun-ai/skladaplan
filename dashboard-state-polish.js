/* =========================================================
   SKLADAPLAN — «ОПЕРАТИВНАЯ СВОДКА» НА ГЛАВНОЙ (v2)
   Убирает дубль «Состояние коробок» и ставит на его место:
     1. Цифры за сегодня (приход / сборка / отгрузка)
     2. График движения за 7 дней
     3. Топ-5 зон по загрузке (клик → в Базу)
     4. «Требует внимания»
   ========================================================= */

(function () {
  'use strict';
  if (window.spDashboardInsights) return;

  const STYLES_ID = 'spDashboardInsightsStyles';
  const BLOCK_ID = 'spDashboardInsights';
  const HIDE_ATTR = 'data-sp-dash-insights-hidden';
  let scheduled = false;
  let observer = null;

  function getAppState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    if (window.state) return window.state;
    return null;
  }

  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function dayKey(d) {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  function todayKey() { return dayKey(new Date()); }
  function isoDayKey(iso) { return iso ? String(iso).slice(0, 10) : ''; }
  function daysAgoKey(n) {
    const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d);
  }

  /* ---------- Расчёты ---------- */
  function computeToday(boxes) {
    const t = todayKey();
    let r = 0, c = 0, s = 0;
    for (const b of boxes) {
      if (isoDayKey(b.date) === t) r++;
      if (isoDayKey(b.collected_at) === t) c++;
      if (isoDayKey(b.shipped_at) === t) s++;
    }
    return { r, c, s };
  }

  function computeWeek(boxes) {
    const map = {};
    for (let i = 6; i >= 0; i--) {
      const k = daysAgoKey(i);
      const d = new Date(k + 'T00:00:00');
      map[k] = { key: k, label: d.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', ''),
                 received: 0, collected: 0, shipped: 0 };
    }
    for (const b of boxes) {
      const rd = isoDayKey(b.date); if (map[rd]) map[rd].received++;
      const cd = isoDayKey(b.collected_at); if (map[cd]) map[cd].collected++;
      const sd = isoDayKey(b.shipped_at); if (map[sd]) map[sd].shipped++;
    }
    return Object.values(map);
  }

  function computeTopZones(boxes, limit) {
    const map = new Map();
    for (const b of boxes) {
      if (b.status === 'Отгружено' || b.status === 'Пустая') continue;
      const zone = (b.zone_row || '').trim();
      if (!zone) continue;
      map.set(zone, (map.get(zone) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([zone, count]) => ({ zone, count }));
  }

  function computeProblems(boxes) {
    let noPallet = 0, noZone = 0, stale = 0;
    const staleKey = daysAgoKey(30);
    for (const b of boxes) {
      if (b.status === 'Отгружено' || b.status === 'Пустая') continue;
      if (!b.pallet || !String(b.pallet).trim()) noPallet++;
      if (!b.zone_row || !String(b.zone_row).trim()) noZone++;
      if (b.status === 'На складе') {
        const cr = isoDayKey(b.created_at || b.date);
        if (cr && cr < staleKey) stale++;
      }
    }
    return { noPallet, noZone, stale };
  }

  /* ---------- Вёрстка ---------- */
  function buildWeek(series) {
    const max = Math.max(1, ...series.flatMap(d => [d.received, d.collected, d.shipped]));
    return series.map(day => {
      const hR = Math.round((day.received / max) * 100);
      const hC = Math.round((day.collected / max) * 100);
      const hS = Math.round((day.shipped / max) * 100);
      const total = day.received + day.collected + day.shipped;
      return `
        <div class="sp-di-bar-day" title="${esc(day.label)}: приход ${day.received}, собрано ${day.collected}, отгружено ${day.shipped}">
          <div class="sp-di-bar-cols">
            <div class="sp-di-bar-col sp-di-c-received" style="height:${hR}%"></div>
            <div class="sp-di-bar-col sp-di-c-collected" style="height:${hC}%"></div>
            <div class="sp-di-bar-col sp-di-c-shipped" style="height:${hS}%"></div>
          </div>
          <div class="sp-di-bar-total">${total || ''}</div>
          <div class="sp-di-bar-label">${esc(day.label)}</div>
        </div>`;
    }).join('');
  }

  function buildZones(zones) {
    if (!zones.length) return '<div class="sp-di-empty">Нет данных по зонам</div>';
    const max = zones[0].count;
    return zones.map(z => {
      const pct = Math.round((z.count / max) * 100);
      return `
        <button type="button" class="sp-di-zone-row" data-di-zone="${esc(z.zone)}" title="Открыть в Базе">
          <span class="sp-di-zone-name">${esc(z.zone)}</span>
          <span class="sp-di-zone-bar"><span class="sp-di-zone-fill" style="width:${pct}%"></span></span>
          <span class="sp-di-zone-num">${z.count}</span>
        </button>`;
    }).join('');
  }

  function buildProblems(p) {
    const items = [];
    if (p.noPallet > 0) items.push({ key: 'nopallet', icon: '📦', label: 'Коробки без поддона', hint: 'не привязаны к паллете', count: p.noPallet });
    if (p.noZone > 0) items.push({ key: 'nozone', icon: '📍', label: 'Коробки без зоны', hint: 'нет места на складе', count: p.noZone });
    if (p.stale > 0) items.push({ key: 'stale', icon: '⏳', label: 'Без движения 30+ дней', hint: 'лежат без движения', count: p.stale });
    if (!items.length) return '';
    return `
      <div class="sp-di-problems">
        <div class="sp-di-section-head"><span>⚠️ Требует внимания</span></div>
        <div class="sp-di-problems-list">
          ${items.map(it => `
            <button type="button" class="sp-di-problem-row" data-di-problem="${esc(it.key)}">
              <span class="sp-di-problem-icon">${it.icon}</span>
              <span class="sp-di-problem-body">
                <span class="sp-di-problem-label">${esc(it.label)}</span>
                <span class="sp-di-problem-hint">${esc(it.hint)}</span>
              </span>
              <span class="sp-di-problem-count">${it.count}</span>
              <span class="sp-di-problem-arrow">→</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function buildBlock(boxes) {
    const today = computeToday(boxes);
    const week = computeWeek(boxes);
    const zones = computeTopZones(boxes, 5);
    const problems = computeProblems(boxes);

    const wrap = document.createElement('div');
    wrap.id = BLOCK_ID;
    wrap.innerHTML = `
      <div class="sp-di-head">
        <div>
          <div class="sp-di-title">📊 Оперативная сводка</div>
          <div class="sp-di-sub">Что происходит на складе прямо сейчас</div>
        </div>
      </div>
      <div class="sp-di-today">
        <div class="sp-di-today-cell">
          <div class="sp-di-today-label">Принято сегодня</div>
          <div class="sp-di-today-value sp-di-v-received">${today.r}</div>
        </div>
        <div class="sp-di-today-cell">
          <div class="sp-di-today-label">Скомплектовано</div>
          <div class="sp-di-today-value sp-di-v-collected">${today.c}</div>
        </div>
        <div class="sp-di-today-cell">
          <div class="sp-di-today-label">Отгружено</div>
          <div class="sp-di-today-value sp-di-v-shipped">${today.s}</div>
        </div>
      </div>
      <div class="sp-di-section">
        <div class="sp-di-section-head">
          <span>Движение за 7 дней</span>
          <span class="sp-di-legend">
            <span class="sp-di-legend-item"><i class="sp-di-dot sp-di-c-received"></i>Приход</span>
            <span class="sp-di-legend-item"><i class="sp-di-dot sp-di-c-collected"></i>Сборка</span>
            <span class="sp-di-legend-item"><i class="sp-di-dot sp-di-c-shipped"></i>Отгрузка</span>
          </span>
        </div>
        <div class="sp-di-week">${buildWeek(week)}</div>
      </div>
      <div class="sp-di-section">
        <div class="sp-di-section-head">
          <span>Топ-5 зон по загрузке</span>
          <span class="sp-di-section-hint">нажмите, чтобы открыть в Базе</span>
        </div>
        <div class="sp-di-zones">${buildZones(zones)}</div>
      </div>
      ${buildProblems(problems)}
    `;
    return wrap;
  }

  /* ---------- Обработчики ---------- */
  function bindHandlers(root) {
    root.querySelectorAll('[data-di-zone]').forEach(btn => {
      btn.addEventListener('click', () => {
        const zone = btn.getAttribute('data-di-zone');
        const st = getAppState();
        if (st) {
          st.baseSearch = ''; st.baseZone = zone; st.basePallet = '';
          st.baseWarehouse = ''; st.baseStatus = ''; st.baseDirection = '';
          st.basePage = 1;
        }
        if (typeof window.goToPage === 'function') window.goToPage('base');
      });
    });
    root.querySelectorAll('[data-di-problem]').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-di-problem');
        const st = getAppState();
        if (st) {
          st.baseSearch = ''; st.baseZone = ''; st.basePallet = '';
          st.baseWarehouse = ''; st.baseStatus = ''; st.baseDirection = '';
          st.basePage = 1;
        }
        if (kind === 'stale' && st) st.baseStatus = 'На складе';
        if (typeof window.goToPage === 'function') window.goToPage('base');
        if (typeof window.toast === 'function') {
          window.toast({ nopallet: 'В Базу: коробки без поддона', nozone: 'В Базу: коробки без зоны', stale: 'В Базу: «На складе»' }[kind] || 'Открыто в Базе');
        }
      });
    });
  }

  /* ---------- Надёжный поиск старой карточки ---------- */
  function findOldStateCard() {
    /* Ищем div с текстом ровно «Состояние коробок» (без дочерних элементов) */
    const allDivs = document.querySelectorAll('#content div');
    for (const d of allDivs) {
      if (d.children.length > 0) continue;
      const t = (d.textContent || '').trim();
      if (t === 'Состояние коробок') {
        const card = d.closest('.sp-card');
        if (card) return card;
      }
    }
    /* Фолбэк: если по какой-то причине текст разбит */
    const allCards = document.querySelectorAll('#content .sp-card');
    for (const c of allCards) {
      if ((c.textContent || '').indexOf('Состояние коробок') !== -1 &&
          (c.textContent || '').indexOf('Распределение по текущему статусу') !== -1) {
        return c;
      }
    }
    return null;
  }

  /* ---------- Сборка ---------- */
  function build() {
    const isDash = !!document.getElementById('spDashboardHeader');
    if (!isDash) {
      document.getElementById(BLOCK_ID)?.remove();
      return;
    }

    const st = getAppState();
    if (!st || !Array.isArray(st.boxes)) return;

    const oldCard = findOldStateCard();
    if (!oldCard) {
      console.log('[DashInsights] старая карточка не найдена');
      return;
    }

    if (!oldCard.hasAttribute(HIDE_ATTR)) {
      oldCard.setAttribute(HIDE_ATTR, '1');
      oldCard.style.display = 'none';
      console.log('[DashInsights] старая карточка скрыта');
    }

    const fresh = buildBlock(st.boxes);
    bindHandlers(fresh);

    const existing = document.getElementById(BLOCK_ID);
    if (existing) {
      existing.replaceWith(fresh);
    } else {
      oldCard.parentNode.insertBefore(fresh, oldCard);
      console.log('[DashInsights] блок «Оперативная сводка» вставлен');
    }
  }

  /* ---------- Стили ---------- */
  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${BLOCK_ID}{background:var(--surface,#fff);border:1px solid var(--line,#e2e8f0);border-radius:14px;padding:16px 18px;margin:0;box-shadow:var(--shadow-card);overflow:hidden}
      #${BLOCK_ID} .sp-di-head{margin-bottom:14px}
      #${BLOCK_ID} .sp-di-title{font-size:15px;font-weight:700;color:#0f172a}
      #${BLOCK_ID} .sp-di-sub{font-size:12px;color:#64748b;margin-top:2px}
      #${BLOCK_ID} .sp-di-today{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}
      #${BLOCK_ID} .sp-di-today-cell{background:#f8fafc;border:1px solid #eef1f4;border-radius:10px;padding:10px 12px;position:relative;overflow:hidden}
      #${BLOCK_ID} .sp-di-today-cell::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--sp-today-accent,#94a3b8)}
      #${BLOCK_ID} .sp-di-today-cell:nth-child(1){--sp-today-accent:#0ea5e9}
      #${BLOCK_ID} .sp-di-today-cell:nth-child(2){--sp-today-accent:#10b981}
      #${BLOCK_ID} .sp-di-today-cell:nth-child(3){--sp-today-accent:#2563EB}
      #${BLOCK_ID} .sp-di-today-label{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;margin-bottom:4px}
      #${BLOCK_ID} .sp-di-today-value{font-size:24px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
      #${BLOCK_ID} .sp-di-v-received{color:#0ea5e9}
      #${BLOCK_ID} .sp-di-v-collected{color:#10b981}
      #${BLOCK_ID} .sp-di-v-shipped{color:#2563EB}
      #${BLOCK_ID} .sp-di-section{margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9}
      #${BLOCK_ID} .sp-di-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.04em}
      #${BLOCK_ID} .sp-di-section-hint{font-size:10px;font-weight:500;color:#94a3b8;text-transform:none;letter-spacing:0}
      #${BLOCK_ID} .sp-di-legend{display:inline-flex;gap:10px;font-size:10px;font-weight:500;color:#64748b;text-transform:none;letter-spacing:0}
      #${BLOCK_ID} .sp-di-legend-item{display:inline-flex;align-items:center;gap:4px}
      #${BLOCK_ID} .sp-di-dot{width:8px;height:8px;border-radius:2px;display:inline-block}
      #${BLOCK_ID} .sp-di-c-received{background:#0ea5e9}
      #${BLOCK_ID} .sp-di-c-collected{background:#10b981}
      #${BLOCK_ID} .sp-di-c-shipped{background:#2563EB}
      #${BLOCK_ID} .sp-di-week{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;height:100px;align-items:end}
      #${BLOCK_ID} .sp-di-bar-day{display:flex;flex-direction:column;height:100%;align-items:center;gap:3px}
      #${BLOCK_ID} .sp-di-bar-cols{display:flex;align-items:flex-end;justify-content:center;gap:2px;flex:1;width:100%}
      #${BLOCK_ID} .sp-di-bar-col{width:7px;min-height:2px;border-radius:2px 2px 0 0;transition:opacity .15s ease}
      #${BLOCK_ID} .sp-di-bar-day:hover .sp-di-bar-col{opacity:.78}
      #${BLOCK_ID} .sp-di-bar-total{font-size:10px;color:#0f172a;font-weight:700;min-height:12px;line-height:1;font-variant-numeric:tabular-nums}
      #${BLOCK_ID} .sp-di-bar-label{font-size:10px;color:#94a3b8;font-weight:600;text-transform:lowercase}
      #${BLOCK_ID} .sp-di-zones{display:flex;flex-direction:column;gap:3px}
      #${BLOCK_ID} .sp-di-zone-row{display:grid;grid-template-columns:minmax(80px,130px) 1fr auto;align-items:center;gap:10px;padding:5px 6px;border:0;background:transparent;border-radius:7px;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s ease}
      #${BLOCK_ID} .sp-di-zone-row:hover{background:#f8fafc}
      #${BLOCK_ID} .sp-di-zone-name{font-size:12px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${BLOCK_ID} .sp-di-zone-bar{display:block;height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden}
      #${BLOCK_ID} .sp-di-zone-fill{display:block;height:100%;background:linear-gradient(90deg,#2563EB,#3b82f6);border-radius:999px;transition:width .25s ease}
      #${BLOCK_ID} .sp-di-zone-num{font-size:12px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;min-width:42px;text-align:right}
      #${BLOCK_ID} .sp-di-problems{margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9}
      #${BLOCK_ID} .sp-di-problems-list{display:flex;flex-direction:column;gap:4px}
      #${BLOCK_ID} .sp-di-problem-row{display:grid;grid-template-columns:28px 1fr auto 20px;align-items:center;gap:10px;padding:8px 10px;border:1px solid #fef3c7;background:#fffbeb;border-radius:9px;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s ease,border-color .12s ease}
      #${BLOCK_ID} .sp-di-problem-row:hover{background:#fef3c7;border-color:#fcd34d}
      #${BLOCK_ID} .sp-di-problem-icon{font-size:16px;text-align:center}
      #${BLOCK_ID} .sp-di-problem-body{display:flex;flex-direction:column;min-width:0}
      #${BLOCK_ID} .sp-di-problem-label{font-size:12px;font-weight:700;color:#78350f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${BLOCK_ID} .sp-di-problem-hint{font-size:10px;color:#a16207;margin-top:1px}
      #${BLOCK_ID} .sp-di-problem-count{font-size:14px;font-weight:800;color:#78350f;font-variant-numeric:tabular-nums}
      #${BLOCK_ID} .sp-di-problem-arrow{color:#a16207;font-size:14px;font-weight:700}
      #${BLOCK_ID} .sp-di-empty{padding:12px;text-align:center;color:#94a3b8;font-size:12px}
      @media (max-width:700px){
        #${BLOCK_ID} .sp-di-today{grid-template-columns:1fr 1fr}
        #${BLOCK_ID} .sp-di-today-cell:nth-child(3){grid-column:1/-1}
        #${BLOCK_ID} .sp-di-week{height:82px}
        #${BLOCK_ID} .sp-di-bar-col{width:6px}
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- Observer + ретрай ---------- */
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { build(); } catch (e) { console.warn('[DashInsights] error:', e); }
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
    let ticks = 0;
    const pollTimer = setInterval(() => {
      ticks++; schedule();
      if (ticks >= 30) clearInterval(pollTimer);
    }, 500);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
  }

  init();

  window.spDashboardInsights = {
    rebuild: schedule,
    version: '2.0.0'
  };
})();
