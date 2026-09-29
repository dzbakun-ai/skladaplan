/* =========================================================
   SKLADAPLAN — КОМПАКТНАЯ ГЛАВНАЯ (v1.3)
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
  function onDashboard() { return !!document.getElementById('spDashboardHeader'); }

  function tagRequestCard() {
    const textarea = document.getElementById('requestBarcodes');
    if (!textarea) return;
    const card = textarea.closest('.sp-card');
    if (card && !card.classList.contains('sp-request-card')) {
      card.classList.add('sp-request-card');
    }
  }

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

    if (qty && per && out && !qty.dataset.spBound) {
      qty.dataset.spBound = '1';
      const update = () => {
        const q = parseFloat(qty.value.replace(',', '.'));
        const p = parseFloat(per.value.replace(',', '.'));
        if (!isFinite(q) || !isFinite(p) || q <= 0 || p <= 0) {
          out.textContent = 'Коробок: —'; return;
        }
        const boxes = Math.ceil(q / p);
        const tail = q % p === 0 ? p : q % p;
        out.textContent = `Коробок: ${boxes} (остаток в последней: ${tail} шт.)`;
      };
      qty.addEventListener('input', update);
      per.addEventListener('input', update);
    }

    if (quick && quickOut && !quick.dataset.spBound) {
      quick.dataset.spBound = '1';
      quick.addEventListener('input', () => {
        const val = quick.value.trim();
        if (!val) { quickOut.textContent = 'Результат: —'; return; }
        const res = (typeof window.safeEvaluateExpression === 'function')
          ? window.safeEvaluateExpression(val) : null;
        quickOut.textContent = res === null
          ? 'Результат: ошибка в выражении'
          : `Результат: ${Number(res.toFixed(6))}`;
      });
    }
  }

  function buildLogsBlock() {
    const wrap = document.createElement('div');
    wrap.id = LOGS_ID;
    wrap.innerHTML = `
      <div class="sp-cl-nav">
        <button type="button" class="sp-cl-tab is-active" data-sp-cl-tab="events">🕓 События</button>
        <button type="button" class="sp-cl-tab" data-sp-cl-tab="operations">📋 Операции</button>
      </div>
      <div class="sp-cl-body">
        <div class="sp-cl-panel is-active" data-sp-cl-panel="events">
          <div id="spDashEvents" class="sp-dash-events"></div>
        </div>
        <div class="sp-cl-panel" data-sp-cl-panel="operations"></div>
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
      if (saved === 'events' || saved === 'operations') activeLogTab = saved;
      else activeLogTab = 'events';
    } catch (e) {}
    applyLogTab(activeLogTab);
    return wrap;
  }

  function applyLogTab(key) {
    const wrap = el(LOGS_ID);
    if (!wrap) return;
    wrap.querySelectorAll('[data-sp-cl-tab]').forEach(btn =>
      btn.classList.toggle('is-active', btn.getAttribute('data-sp-cl-tab') === key)
    );
    wrap.querySelectorAll('[data-sp-cl-panel]').forEach(p =>
      p.classList.toggle('is-active', p.getAttribute('data-sp-cl-panel') === key)
    );
  }

  function migrateLogContent() {
    const wrap = el(LOGS_ID);
    if (!wrap) return;

    const allCards = document.querySelectorAll('#content > .sp-card');
    let opsCard = null;
    allCards.forEach(card => {
      const h3 = card.querySelector('h3');
      if (h3 && /Последние операции/i.test(h3.textContent || '')) opsCard = card;
    });
    const opsPanel = wrap.querySelector('[data-sp-cl-panel="operations"]');
    if (opsCard && opsPanel && !opsPanel.hasChildNodes()) {
      const tw = opsCard.querySelector('.sp-table-wrap');
      if (tw) opsPanel.appendChild(tw.cloneNode(true));
      opsCard.style.display = 'none';
    }
    /* ВАЖНО: «Информацию» НЕ ТРОГАЕМ — она должна остаться
       в правой колонке .sp-dashboard-columns. */
  }

  function build() {
    if (!onDashboard()) return;
    document.body.classList.add('sp-compact-dash');

    const header = document.getElementById('spDashboardHeader');
    if (!header) return;

    tagRequestCard();

    if (!el(WRAP_ID)) {
      const shiftHost = document.getElementById('spShiftHost');
      const anchor = shiftHost || header;
      if (anchor.parentNode) {
        anchor.parentNode.insertBefore(buildQuickStrip(), anchor.nextSibling);
      }
    }

    if (!el(CALC_ID)) {
      const quick = el(WRAP_ID);
      if (quick) {
        quick.parentNode.insertBefore(buildCalcBlock(), quick.nextSibling);
        bindCalcHandlers();
      }
    }

    if (!el(LOGS_ID)) {
      header.parentNode.insertBefore(buildLogsBlock(), header.nextSibling);
    }
    migrateLogContent();

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
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { build(); } catch (e) { console.warn('[CompactDash] error:', e); }
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
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
    let ticks = 0;
    const t = setInterval(() => { ticks++; schedule(); if (ticks >= 30) clearInterval(t); }, 500);
  }

  init();

  window.spCompactDashboard = { rebuild: schedule, version: '1.3.0' };
})();
