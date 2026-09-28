/* =========================================================
   SKLADAPLAN — КОМПАКТНАЯ ГЛАВНАЯ (JS-патч)
   Не трогает app.js / dashboard.js / shifts.js.
   Работает через MutationObserver на #content.
   ========================================================= */

(function () {
  'use strict';
  if (window.spCompactDashboard) return;

  const WRAP_ID = 'spCompactQuickStrip';
  const CALC_ID = 'spCompactCalc';
  const LOGS_ID = 'spCompactLogs';
  const LS_LOG_TAB = 'sp-compact-log-tab';

  let scheduled = false;
  let observer = null;
  let activeLogTab = 'events';

  function el(id) { return document.getElementById(id); }

  function onDashboard() {
    return !!document.getElementById('spDashboardHeader');
  }

  /* =========================================================
     1. НОВАЯ ЗАЯВКА — теперь не пересоздаём.
     Просто находим оригинальную карточку (#requestBarcodes)
     и помечаем классом .sp-request-card, чтобы её стилизовал CSS.
     ========================================================= */
  function tagRequestCard() {
    const textarea = document.getElementById('requestBarcodes');
    if (!textarea) return;
    const card = textarea.closest('.sp-card');
    if (card && !card.classList.contains('sp-request-card')) {
      card.classList.add('sp-request-card');
    }
  }

  /* =========================================================
     2. ОБЪЕДИНЁННЫЙ QUICK-STRIP
     ========================================================= */
  function buildQuickStrip() {
    const wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.innerHTML = `
      <div class="sp-cqs-head">Быстрые действия</div>
      <div class="sp-cqs-row">
        <button type="button" class="sp-quick-item" data-page="received">
          <span class="sp-quick-icon"><svg class="icon"><use href="#icon-inbox-down"></use></svg></span>
          Приёмка
        </button>
        <button type="button" class="sp-quick-item" data-page="assembly">
          <span class="sp-quick-icon"><svg class="icon"><use href="#icon-package"></use></svg></span>
          Сборка
        </button>
        <button type="button" class="sp-quick-item" data-page="collected">
          <span class="sp-quick-icon"><svg class="icon"><use href="#icon-check-circle"></use></svg></span>
          Собрано
        </button>
        <button type="button" class="sp-quick-item" data-page="shipped">
          <span class="sp-quick-icon"><svg class="icon"><use href="#icon-send"></use></svg></span>
          Убыло
        </button>
        <button type="button" class="sp-quick-item" data-page="move">
          <span class="sp-quick-icon"><svg class="icon"><use href="#icon-swap"></use></svg></span>
          Перемещение
        </button>
        <button type="button" class="sp-quick-item" data-page="tools" data-tool="compare">
          <span class="sp-quick-icon"><svg class="icon"><use href="#icon-columns"></use></svg></span>
          Сравнение
        </button>
        <button type="button" class="sp-quick-item" data-page="tools" data-tool="inventory">
          <span class="sp-quick-icon"><svg class="icon"><use href="#icon-clipboard-check"></use></svg></span>
          Инвентаризация
        </button>
        <button type="button" class="sp-quick-item" data-page="tasks">
          <span class="sp-quick-icon"><svg class="icon"><use href="#icon-list"></use></svg></span>
          Задачи
        </button>
      </div>
    `;
    return wrap;
  }

  /* =========================================================
     3. КАЛЬКУЛЯТОРЫ — уникальные ID, свои обработчики,
     оригинальные скрыты через CSS.
     ========================================================= */
  function buildCalcBlock() {
    const details = document.createElement('details');
    details.id = CALC_ID;
    details.innerHTML = `
      <summary>🧮 Калькуляторы</summary>
      <div class="sp-calc-grid">
        <div>
          <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px;">Коробки</div>
          <div style="display:flex;gap:6px;">
            <input id="spCalcBoxesQty" type="number" min="0" placeholder="Штук"
              style="flex:1;border:1px solid #ddd;border-radius:9px;padding:8px 10px;font-size:13px;outline:none;">
            <input id="spCalcPerBox" type="number" min="0" placeholder="В коробке"
              style="flex:1;border:1px solid #ddd;border-radius:9px;padding:8px 10px;font-size:13px;outline:none;">
          </div>
          <div id="spCalcBoxesResult" class="sp-muted" style="font-size:12px;font-weight:700;margin-top:6px;">Коробок: —</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px;">Быстрый счёт</div>
          <input id="spCalcQuickInput" type="text" placeholder="(120 + 30) / 6"
            style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:9px;padding:8px 10px;font-size:13px;outline:none;">
          <div id="spCalcQuickResult" class="sp-muted" style="font-size:12px;font-weight:700;margin-top:6px;">Результат: —</div>
        </div>
      </div>
    `;
    return details;
  }

  function bindCalcHandlers() {
    const qty = document.getElementById('spCalcBoxesQty');
    const per = document.getElementById('spCalcPerBox');
    const out = document.getElementById('spCalcBoxesResult');
    const quick = document.getElementById('spCalcQuickInput');
    const quickOut = document.getElementById('spCalcQuickResult');

    if (qty && per && out) {
      const update = () => {
        const q = parseFloat(qty.value.replace(',', '.'));
        const p = parseFloat(per.value.replace(',', '.'));
        if (!isFinite(q) || !isFinite(p) || q <= 0 || p <= 0) {
          out.textContent = 'Коробок: —';
          return;
        }
        const boxes = Math.ceil(q / p);
        const tail = q % p === 0 ? p : q % p;
        out.textContent = `Коробок: ${boxes} (остаток в последней: ${tail} шт.)`;
      };
      qty.addEventListener('input', update);
      per.addEventListener('input', update);
    }

    if (quick && quickOut) {
      quick.addEventListener('input', () => {
        const val = quick.value.trim();
        if (!val) { quickOut.textContent = 'Результат: —'; return; }
        /* Используем глобальный safeEvaluateExpression из app.js, если он есть */
        const res = (typeof window.safeEvaluateExpression === 'function')
          ? window.safeEvaluateExpression(val)
          : null;
        if (res === null) {
          quickOut.textContent = 'Результат: ошибка в выражении';
        } else {
          quickOut.textContent = `Результат: ${Number(res.toFixed(6))}`;
        }
      });
    }
  }

  /* =========================================================
     4. ЛОГИ С ТАБАМИ
     ========================================================= */
  function buildLogsBlock() {
    const wrap = document.createElement('div');
    wrap.id = LOGS_ID;
    wrap.innerHTML = `
      <div class="sp-cl-nav">
        <button type="button" class="sp-cl-tab is-active" data-sp-cl-tab="events">🕓 События</button>
        <button type="button" class="sp-cl-tab" data-sp-cl-tab="operations">📋 Операции</button>
        <button type="button" class="sp-cl-tab" data-sp-cl-tab="info">ℹ️ Информация</button>
      </div>
      <div class="sp-cl-body">
        <div class="sp-cl-panel is-active" data-sp-cl-panel="events">
          <div id="spDashEvents" class="sp-dash-events"></div>
        </div>
        <div class="sp-cl-panel" data-sp-cl-panel="operations"></div>
        <div class="sp-cl-panel" data-sp-cl-panel="info"></div>
      </div>
    `;

    wrap.querySelectorAll('[data-sp-cl-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLogTab = btn.getAttribute('data-sp-cl-tab');
        try { localStorage.setItem(LS_LOG_TAB, activeLogTab); } catch (e) {}
        applyLogTab(activeLogTab);
      });
    });

    try {
      const saved = localStorage.getItem(LS_LOG_TAB);
      if (saved) activeLogTab = saved;
    } catch (e) {}
    applyLogTab(activeLogTab);

    return wrap;
  }

  function applyLogTab(key) {
    const wrap = el(LOGS_ID);
    if (!wrap) return;
    wrap.querySelectorAll('[data-sp-cl-tab]').forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-sp-cl-tab') === key);
    });
    wrap.querySelectorAll('[data-sp-cl-panel]').forEach(p => {
      p.classList.toggle('is-active', p.getAttribute('data-sp-cl-panel') === key);
    });
  }

  function migrateLogContent() {
    const wrap = el(LOGS_ID);
    if (!wrap) return;

    const allCards = document.querySelectorAll('#content > .sp-card');
    let lastOpsCard = null;
    allCards.forEach(card => {
      const h3 = card.querySelector('h3');
      if (h3 && /Последние операции/i.test(h3.textContent || '')) {
        lastOpsCard = card;
      }
    });

    const operationsPanel = wrap.querySelector('[data-sp-cl-panel="operations"]');
    if (lastOpsCard && operationsPanel && !operationsPanel.hasChildNodes()) {
      const tableWrap = lastOpsCard.querySelector('.sp-table-wrap');
      if (tableWrap) operationsPanel.appendChild(tableWrap.cloneNode(true));
      lastOpsCard.style.display = 'none';
    }

    const infoPanel = wrap.querySelector('[data-sp-cl-panel="info"]');
    if (infoPanel && !infoPanel.hasChildNodes()) {
      let infoCard = null;
      document.querySelectorAll('#content .sp-dashboard-columns .sp-card').forEach(card => {
        const head = card.firstElementChild;
        if (head && /Информация/i.test(head.textContent || '')) infoCard = card;
      });
      if (infoCard) {
        const clone = infoCard.cloneNode(true);
        const firstHead = clone.firstElementChild;
        if (firstHead && /Информация/i.test(firstHead.textContent || '')) {
          firstHead.remove();
        }
        infoPanel.appendChild(clone);
        infoCard.style.display = 'none';
      }
    }
  }

  /* =========================================================
     СБОРКА
     ========================================================= */
  function build() {
    if (!onDashboard()) return;

    document.body.classList.add('sp-compact-dash');

    const header = document.getElementById('spDashboardHeader');
    if (!header) return;

    /* 1. Помечаем оригинальную карточку заявки — её не трогаем */
    tagRequestCard();

    /* 2. Quick-strip — после виджета Смены (или после header) */
    if (!el(WRAP_ID)) {
      const shiftHost = document.getElementById('spShiftHost');
      const anchor = shiftHost || header;
      anchor.parentNode.insertBefore(buildQuickStrip(), anchor.nextSibling);
    }

    /* 3. Калькуляторы — после quick-strip */
    if (!el(CALC_ID)) {
      const quick = el(WRAP_ID);
      if (quick) {
        quick.parentNode.insertBefore(buildCalcBlock(), quick.nextSibling);
        bindCalcHandlers();
      }
    }

    /* 4. Логи с табами — сразу после header */
    if (!el(LOGS_ID)) {
      header.parentNode.insertBefore(buildLogsBlock(), header.nextSibling);
    }
    migrateLogContent();

    /* 5. Скрываем дубли-блоки */
    hideDuplicates();
  }

  function hideDuplicates() {
    const content = document.getElementById('content');
    if (!content) return;

    content.querySelectorAll('.sp-dashboard-block').forEach(block => {
      const h2 = block.querySelector('h2');
      if (!h2) return;
      const text = (h2.textContent || '').trim();
      if (text === 'Рабочие процессы' || text === 'Инструменты') {
        block.style.display = 'none';
      }
    });

    content.querySelectorAll('.sp-card h3').forEach(h3 => {
      const text = (h3.textContent || '').trim();
      if (/Калькулятор коробок|Быстрый калькулятор/.test(text)) {
        const card = h3.closest('.sp-card');
        if (card) card.style.display = 'none';
      }
    });

    content.querySelectorAll(':scope > .sp-grid').forEach(grid => {
      const visible = [...grid.children].some(c => c.style.display !== 'none');
      if (!visible) grid.style.display = 'none';
    });
  }

  /* =========================================================
     OBSERVER
     ========================================================= */
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { build(); }
      catch (e) { console.warn('[CompactDashboard] error:', e); }
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

  function injectStyles() {
    if (document.getElementById('spCompactDashStyles')) return;
    const style = document.createElement('style');
    style.id = 'spCompactDashStyles';
    style.textContent = window.__SP_COMPACT_DASH_CSS__ || '';
    document.head.appendChild(style);
  }

  window.__SP_COMPACT_DASH_CSS__ = window.__SP_COMPACT_DASH_CSS__ || '';

  init();

  window.spCompactDashboard = {
    rebuild: schedule,
    version: '1.1.0'
  };
})();
