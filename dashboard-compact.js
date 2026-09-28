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
  const NEW_REQ_ID = 'spCompactNewRequest';
  const LS_LOG_TAB = 'sp-compact-log-tab';

  let scheduled = false;
  let observer = null;
  let activeLogTab = 'events';

  /* ============== УТИЛИТЫ ============== */

  function el(id) { return document.getElementById(id); }

  function onDashboard() {
    return !!document.getElementById('spDashboardHeader');
  }

  /* ============== 1. КОМПАКТНАЯ НОВАЯ ЗАЯВКА ============== */

  function buildCompactNewRequest() {
    const wrap = document.createElement('div');
    wrap.id = NEW_REQ_ID;
    wrap.innerHTML = `
      <div>
        <div class="sp-cnr-title">📦 Новая заявка на подбор</div>
        <div class="sp-cnr-sub">Вставьте список штрихкодов или импортируйте Excel</div>
      </div>
      <div class="sp-cnr-actions">
        <button type="button" class="sp-cnr-btn sp-cnr-btn-secondary" data-cnr-import>
          📥 Excel
        </button>
        <button type="button" class="sp-cnr-btn sp-cnr-btn-primary" data-cnr-open>
          Создать заявку →
        </button>
      </div>
    `;

    wrap.querySelector('[data-cnr-open]')?.addEventListener('click', () => {
      /* Раскрываем оригинальную карточку «Новая заявка»
         и скроллим к ней */
      const original = document.querySelector('#content > .sp-card');
      /* Ищем карточку, в которой есть textarea #requestBarcodes */
      const cards = document.querySelectorAll('#content > .sp-card');
      for (const card of cards) {
        if (card.querySelector('#requestBarcodes')) {
          card.style.display = '';
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          card.querySelector('#requestBarcodes')?.focus();
          return;
        }
      }
      if (typeof goToPage === 'function') goToPage('base');
    });

    wrap.querySelector('[data-cnr-import]')?.addEventListener('click', () => {
      const cards = document.querySelectorAll('#content > .sp-card');
      for (const card of cards) {
        const input = card.querySelector('#requestExcelInput');
        if (input) {
          card.style.display = '';
          input.click();
          return;
        }
      }
    });

    return wrap;
  }

  /* ============== 2. ОБЪЕДИНЁННЫЙ QUICK-STRIP ============== */

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

  /* ============== 3. КАЛЬКУЛЯТОРЫ ============== */

  function buildCalcBlock() {
    const details = document.createElement('details');
    details.id = CALC_ID;
    details.innerHTML = `
      <summary>🧮 Калькуляторы</summary>
      <div class="sp-calc-grid">
        <div>
          <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px;">Коробки</div>
          <div style="display:flex;gap:6px;">
            <input id="calcBoxesQty" type="number" min="0" placeholder="Штук" style="flex:1;border:1px solid #ddd;border-radius:9px;padding:8px 10px;font-size:13px;outline:none;">
            <input id="calcBoxesPerBox" type="number" min="0" placeholder="В коробке" style="flex:1;border:1px solid #ddd;border-radius:9px;padding:8px 10px;font-size:13px;outline:none;">
          </div>
          <div id="calcBoxesResult" class="sp-muted" style="font-size:12px;font-weight:700;margin-top:6px;">Коробок: —</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px;">Быстрый счёт</div>
          <input id="calcQuickInput" type="text" placeholder="(120 + 30) / 6" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:9px;padding:8px 10px;font-size:13px;outline:none;">
          <div id="calcQuickResult" class="sp-muted" style="font-size:12px;font-weight:700;margin-top:6px;">Результат: —</div>
        </div>
      </div>
    `;
    return details;
  }

  function bindCalcHandlers() {
    const qty = el('calcBoxesQty');
    const per = el('calcBoxesPerBox');
    const quick = el('calcQuickInput');

    if (qty && typeof updateBoxesCalculator === 'function') {
      qty.addEventListener('input', updateBoxesCalculator);
      per?.addEventListener('input', updateBoxesCalculator);
    }
    if (quick && typeof updateQuickCalculator === 'function') {
      quick.addEventListener('input', updateQuickCalculator);
    }
  }

  /* ============== 4. ЛОГИ С ТАБАМИ ============== */

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

    /* Табы */
    wrap.querySelectorAll('[data-sp-cl-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-sp-cl-tab');
        activeLogTab = key;
        try { localStorage.setItem(LS_LOG_TAB, key); } catch (e) {}
        applyLogTab(key);
      });
    });

    /* Восстанавливаем сохранённый таб */
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

  /* Копируем оригинальные «Последние операции» (таблица) и
     «Информация» (список) в соответствующие табы */
  function migrateLogContent() {
    const wrap = el(LOGS_ID);
    if (!wrap) return;

    /* Ищем оригинальный блок «Последние операции» — он рендерится
       в dashboardView() как последний .sp-card с заголовком
       «Последние операции» */
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
      /* Переносим только содержимое (без заголовка) */
      const tableWrap = lastOpsCard.querySelector('.sp-table-wrap');
      if (tableWrap) {
        operationsPanel.appendChild(tableWrap.cloneNode(true));
      }
      /* Скрываем оригинал */
      lastOpsCard.style.display = 'none';
    }

    /* Информация: блок «Информация» из dashboardView */
    const infoPanel = wrap.querySelector('[data-sp-cl-panel="info"]');
    if (infoPanel && !infoPanel.hasChildNodes()) {
      let infoCard = null;
      allCards.forEach(card => {
        const h3 = card.querySelector('h3');
        /* В dashboardView блок «Информация» — это .sp-card
           с заголовком «Информация», внутри .sp-dashboard-columns */
        if (card.textContent && /^\s*Информация\s*$/.test(h3?.textContent?.trim() || '')) {
          infoCard = card;
        }
      });
      /* Более надёжный поиск: внутри .sp-dashboard-columns */
      document.querySelectorAll('#content .sp-dashboard-columns .sp-card').forEach(card => {
        const head = card.firstElementChild;
        if (head && /Информация/i.test(head.textContent || '')) {
          infoCard = card;
        }
      });
      if (infoCard) {
        /* Клонируем содержимое кроме заголовка */
        const clone = infoCard.cloneNode(true);
        /* Удаляем первый заголовок «Информация» */
        const firstHead = clone.firstElementChild;
        if (firstHead && /Информация/i.test(firstHead.textContent || '')) {
          firstHead.remove();
        }
        infoPanel.appendChild(clone);
        infoCard.style.display = 'none';
      }
    }
  }

  /* ============== СБОРКА ============== */

  function build() {
    if (!onDashboard()) return;

    document.body.classList.add('sp-compact-dash');

    const content = document.getElementById('content');
    if (!content) return;

    const header = document.getElementById('spDashboardHeader');
    if (!header) return;

    /* 1. Компактная заявка */
    if (!el(NEW_REQ_ID)) {
      header.parentNode.insertBefore(buildCompactNewRequest(), header);
    }

    /* 2. Quick-strip после виджета Смены */
    if (!el(WRAP_ID)) {
      const shiftHost = document.getElementById('spShiftHost');
      const anchor = shiftHost || header;
      anchor.parentNode.insertBefore(buildQuickStrip(), anchor.nextSibling);
    }

    /* 3. Калькуляторы (details) — после quick-strip */
    if (!el(CALC_ID)) {
      const quick = el(WRAP_ID);
      if (quick) {
        quick.parentNode.insertBefore(buildCalcBlock(), quick.nextSibling);
        bindCalcHandlers();
      }
    }

    /* 4. Логи с табами */
    if (!el(LOGS_ID)) {
      header.parentNode.insertBefore(buildLogsBlock(), header.nextSibling);
    }
    migrateLogContent();

    /* 5. Скрываем дубли-блоки из dashboardView */
    hideDuplicates();
  }

  function hideDuplicates() {
    const content = document.getElementById('content');
    if (!content) return;

    /* Скрываем оригинальные блоки «Рабочие процессы» и «Инструменты» */
    content.querySelectorAll('.sp-dashboard-block').forEach(block => {
      const h2 = block.querySelector('h2');
      if (!h2) return;
      const text = (h2.textContent || '').trim();
      if (text === 'Рабочие процессы' || text === 'Инструменты') {
        block.style.display = 'none';
      }
    });

    /* Скрываем оригинальные карточки калькуляторов */
    content.querySelectorAll('.sp-card h3').forEach(h3 => {
      const text = (h3.textContent || '').trim();
      if (/Калькулятор коробок|Быстрый калькулятор/.test(text)) {
        const card = h3.closest('.sp-card');
        if (card) card.style.display = 'none';
      }
    });

    /* Скрываем пустой оставшийся .sp-grid от калькуляторов */
    content.querySelectorAll(':scope > .sp-grid').forEach(grid => {
      const visible = [...grid.children].some(c => c.style.display !== 'none');
      if (!visible) grid.style.display = 'none';
    });
  }

  /* ============== OBSERVER ============== */

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
    style.textContent = `
      /* Инлайн-стили, чтобы не подключать внешний файл */
      ${window.__SP_COMPACT_DASH_CSS__ || ''}
    `;
    document.head.appendChild(style);
  }

  /* CSS инжектится отдельным файлом, но на случай
     если он не подключён — вставляем минимальный фолбэк */
  window.__SP_COMPACT_DASH_CSS__ = window.__SP_COMPACT_DASH_CSS__ || '';

  init();

  window.spCompactDashboard = {
    rebuild: schedule,
    version: '1.0.0'
  };
})();
