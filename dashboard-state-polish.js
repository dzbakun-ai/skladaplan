/* =========================================================
   SKLADAPLAN — ПОЛИРОВКА «СОСТОЯНИЕ СКЛАДА»
   Не трогает app.js / dashboard.js.
   Работает поверх compact-dashboard.
   ========================================================= */

(function () {
  'use strict';
  if (window.spDashStatePolish) return;

  const STYLES_ID = 'spDashStatePolishStyles';
  const REPLACE_ID = 'spDashStateReplace';
  const HIDE_ATTR = 'data-sp-state-hidden';
  const LS_COLORS = 'sp-state-colors';

  let scheduled = false;
  let observer = null;

  /* Цвета статусов — единый набор, читаемый в обеих темах */
  const STATUS_COLORS = {
    'На складе':       '#475569',
    'КЗабору':         '#f59e0b',
    'КПодбору':        '#f59e0b',
    'Зарезервирована': '#f59e0b',
    'Скомплектовано':  '#10b981',
    'Отгружено':       '#2563EB',
    'Пустая':          '#cbd5e1'
  };

  function colorFor(status) {
    return STATUS_COLORS[status] || '#94a3b8';
  }

  /* ---------- Стили ---------- */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* ========= KPI-карточки «Состояние склада» — компактнее ========= */
      body.sp-compact-dash .sp-dashboard-kpi-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        gap: 10px !important;
        margin-bottom: 12px !important;
      }
      body.sp-compact-dash .sp-dashboard-kpi-grid > .sp-card {
        padding: 12px 14px !important;
        border-radius: 12px !important;
        position: relative;
        overflow: hidden;
      }
      /* Цветная полоска слева */
      body.sp-compact-dash .sp-dashboard-kpi-grid > .sp-card::before {
        content: '';
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 3px;
        background: var(--sp-kpi-accent, #475569);
      }
      body.sp-compact-dash .sp-dashboard-kpi-grid > .sp-card .sp-card-label {
        font-size: 10px !important;
        text-transform: uppercase;
        letter-spacing: .04em;
        margin-bottom: 4px !important;
      }
      body.sp-compact-dash .sp-dashboard-kpi-grid > .sp-card > div:nth-child(2) {
        /* числовое значение — делаем чуть меньше и плотнее */
        font-size: 22px !important;
        line-height: 1 !important;
        letter-spacing: -.01em;
      }
      /* Прячем дублирующиеся иконки-кружки внутри KPI */
      body.sp-compact-dash .sp-dashboard-kpi-grid > .sp-card > div:first-child > div:last-child {
        display: none !important;
      }
      /* Прогресс-бар в KPI — тоньше */
      body.sp-compact-dash .sp-dashboard-kpi-grid > .sp-card > div:last-child {
        margin-top: 8px !important;
        height: 3px !important;
      }

      /* ========= «Состояние коробок» — заменяем на стековую полосу ========= */
      #${REPLACE_ID} {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 14px;
        padding: 16px 18px;
        margin-bottom: 12px;
        box-shadow: var(--shadow-card);
      }
      #${REPLACE_ID} .sp-ss-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      #${REPLACE_ID} .sp-ss-title {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
      }
      #${REPLACE_ID} .sp-ss-sub {
        font-size: 12px;
        color: #64748b;
        margin-top: 2px;
      }
      #${REPLACE_ID} .sp-ss-total {
        font-size: 12px;
        color: #64748b;
        white-space: nowrap;
      }
      #${REPLACE_ID} .sp-ss-total b {
        color: #0f172a;
        font-size: 14px;
      }

      /* Горизонтальная стековая полоса */
      #${REPLACE_ID} .sp-ss-bar {
        display: flex;
        width: 100%;
        height: 14px;
        border-radius: 999px;
        overflow: hidden;
        background: #f1f5f9;
        margin-bottom: 14px;
      }
      #${REPLACE_ID} .sp-ss-seg {
        height: 100%;
        transition: opacity .15s ease;
        position: relative;
        min-width: 2px;
      }
      #${REPLACE_ID} .sp-ss-seg + .sp-ss-seg {
        margin-left: 1px;
      }
      #${REPLACE_ID} .sp-ss-seg:hover { opacity: .82; }

      /* Легенда — две колонки */
      #${REPLACE_ID} .sp-ss-legend {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 18px;
      }
      #${REPLACE_ID} .sp-ss-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        padding: 4px 0;
      }
      #${REPLACE_ID} .sp-ss-dot {
        width: 10px;
        height: 10px;
        border-radius: 3px;
        flex-shrink: 0;
      }
      #${REPLACE_ID} .sp-ss-name {
        color: #475569;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${REPLACE_ID} .sp-ss-num {
        font-weight: 700;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }
      #${REPLACE_ID} .sp-ss-pct {
        color: #94a3b8;
        font-size: 11px;
        min-width: 40px;
        text-align: right;
      }

      /* Мобильная адаптация */
      @media (max-width: 700px) {
        body.sp-compact-dash .sp-dashboard-kpi-grid {
          grid-template-columns: 1fr 1fr !important;
        }
        #${REPLACE_ID} .sp-ss-legend {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- Поиск и парсинг оригинального блока ---------- */

  function getStatusCounts() {
    /* Читаем счётчики из уже отрендеренных KPI-карточек —
       так не нужно ничего пересчитывать */
    const grid = document.querySelector('.sp-dashboard-kpi-grid');
    if (!grid) return null;

    /* В оригинальной вёрстке dashboardView() порядок такой:
       На складе, К сборке, Скомплектовано, Убыло */
    const cards = [...grid.querySelectorAll(':scope > .sp-card')];

    const labels = ['На складе', 'К сборке', 'Скомплектовано', 'Отгружено'];

    const out = [];
    cards.forEach((card, i) => {
      const labelEl = card.querySelector('.sp-card-label');
      const valueEl = card.querySelector('div[style*="font-size:32px"], div[style*="font-size:24px"], div');
      /* Берём "правильное" значение — первый div, который содержит только число */
      let value = 0;
      const divs = card.querySelectorAll(':scope > div');
      for (const d of divs) {
        const txt = (d.textContent || '').trim();
        if (/^\d+$/.test(txt)) {
          value = parseInt(txt, 10);
          break;
        }
      }
      const name = (labelEl?.textContent || labels[i] || '—').trim();
      out.push({ name, value });
    });

    return out;
  }

  /* ---------- Отрисовка замены ---------- */

  function buildReplacement(counts) {
    const total = counts.reduce((s, x) => s + x.value, 0);
    if (!total) return null;

    const wrap = document.createElement('div');
    wrap.id = REPLACE_ID;

    /* Полоса */
    const segs = counts
      .filter(x => x.value > 0)
      .map(x => {
        const pct = (x.value / total) * 100;
        return `<div class="sp-ss-seg"
          style="width:${pct.toFixed(2)}%;background:${colorFor(x.name)};"
          title="${x.name}: ${x.value} (${pct.toFixed(1)}%)"></div>`;
      })
      .join('');

    /* Легенда — сортируем по убыванию количества */
    const sortedCounts = [...counts].sort((a, b) => b.value - a.value);
    const legend = sortedCounts
      .filter(x => x.value > 0)
      .map(x => {
        const pct = total ? (x.value / total * 100).toFixed(1) : '0.0';
        return `
          <div class="sp-ss-item">
            <span class="sp-ss-dot" style="background:${colorFor(x.name)}"></span>
            <span class="sp-ss-name">${escapeHtml(x.name)}</span>
            <span class="sp-ss-num">${x.value}</span>
            <span class="sp-ss-pct">${pct}%</span>
          </div>
        `;
      })
      .join('');

    wrap.innerHTML = `
      <div class="sp-ss-head">
        <div>
          <div class="sp-ss-title">Состояние коробок</div>
          <div class="sp-ss-sub">Распределение по текущему статусу</div>
        </div>
        <div class="sp-ss-total">Всего: <b>${total}</b></div>
      </div>
      <div class="sp-ss-bar">${segs}</div>
      <div class="sp-ss-legend">${legend}</div>
    `;
    return wrap;
  }

  function escapeHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ---------- Главная логика ---------- */

  function build() {
    /* Работаем только на главной */
    if (!document.getElementById('spDashboardHeader')) {
      document.getElementById(REPLACE_ID)?.remove();
      return;
    }

    const counts = getStatusCounts();
    if (!counts || !counts.length) return;

    /* 1. Ставим цветные акценты на KPI-карточках */
    const grid = document.querySelector('.sp-dashboard-kpi-grid');
    if (grid) {
      const cards = [...grid.querySelectorAll(':scope > .sp-card')];
      cards.forEach((card, i) => {
        const name = counts[i]?.name;
        if (name) card.style.setProperty('--sp-kpi-accent', colorFor(name));
      });
    }

    /* 2. Ищем оригинальный блок «Состояние коробок» и прячем его */
    document.querySelectorAll('.sp-card h3, .sp-card > div > div').forEach(el => {
      if (el.hasAttribute(HIDE_ATTR)) return;
      const txt = (el.textContent || '').trim();
      if (txt === 'Состояние коробок') {
        /* Поднимаемся до ближайшего .sp-card */
        let card = el.closest('.sp-card');
        /* Иногда это внутренний div без прямого .sp-card — ищем глубже */
        while (card && !card.querySelector('div[style*="background:#eee"]') && !card.querySelector('div[style*="background: #eee"]')) {
          const parent = card.parentElement?.closest('.sp-card');
          if (!parent) break;
          card = parent;
        }
        if (card && !card.hasAttribute(HIDE_ATTR)) {
          card.setAttribute(HIDE_ATTR, '1');
          card.style.display = 'none';

          /* 3. Вставляем замену сразу после скрытого блока */
          const old = document.getElementById(REPLACE_ID);
          if (old) old.remove();
          const replacement = buildReplacement(counts);
          if (replacement) {
            card.parentNode.insertBefore(replacement, card.nextSibling);
          }
        }
      }
    });
  }

  /* ---------- Observer ---------- */

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { build(); }
      catch (e) { console.warn('[DashStatePolish] error:', e); }
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
    setTimeout(startObserver, 500);
    setTimeout(startObserver, 2000);
    setTimeout(schedule, 3000);
  }

  init();

  window.spDashStatePolish = {
    rebuild: schedule,
    version: '1.0.0'
  };
})();
