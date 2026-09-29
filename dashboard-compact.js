/* =========================================================
   SKLADAPLAN — КОМПАКТНАЯ ГЛАВНАЯ (v1.2)
   Надёжная версия: observer + поллинг + диагностика.
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
  let log = (...a) => console.log('[CompactDash]', ...a);

  function el(id) { return document.getElementById(id); }
  function onDashboard() { return !!document.getElementById('spDashboardHeader'); }

  /* ---------- Новая заявка: просто помечаем классом ---------- */
  function tagRequestCard() {
    const textarea = document.getElementById('requestBarcodes');
    if (!textarea) return;
    const card = textarea.closest('.sp-card');
    if (card && !card.classList.contains('sp-request-card')) {
      card.classList.add('sp-request-card');
      log('карточка заявки помечена классом .sp-request-card');
    }
  }

  /* ---------- Quick-strip ---------- */
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

  /* ---------- Калькуляторы ---------- */
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

  /* ---------- Логи с табами ---------- */
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

    /* Ищем «Последние операции» */
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
      log('«Последние операции» перемещены в таб «Операции»');
    }

    /* Ищем «Информация» внутри .sp-dashboard-columns */
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
        if (firstHead && /Информация/i.test(firstHead.textContent || '')) firstHead.remove();
        infoPanel.appendChild(clone);
        infoCard.style.display = 'none';
        log('«Информация» перемещена в таб «Информация»');
      }
    }
  }

  /* ---------- Сборка ---------- */
  function build() {
    if (!onDashboard()) return;

    document.body.classList.add('sp-compact-dash');
    const header = document.getElementById('spDashboardHeader');
    if (!header) return;

    tagRequestCard();

    /* 1. Quick-strip */
    if (!el(WRAP_ID)) {
      const shiftHost = document.getElementById('spShiftHost');
      const anchor = shiftHost || header;
      if (anchor.parentNode) {
        anchor.parentNode.insertBefore(buildQuickStrip(), anchor.nextSibling);
        log('quick-strip вставлен после', anchor.id || anchor.tagName);
      }
    }

    /* 2. Калькуляторы */
    if (!el(CALC_ID)) {
      const quick = el(WRAP_ID);
      if (quick) {
        quick.parentNode.insertBefore(buildCalcBlock(), quick.nextSibling);
        bindCalcHandlers();
        log('калькуляторы вставлены');
      }
    }

    /* 3. Логи */
    if (!el(LOGS_ID)) {
      header.parentNode.insertBefore(buildLogsBlock(), header.nextSibling);
      log('логи с табами вставлены');
    }
    migrateLogContent();

    /* 4. Скрытие дублей */
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
        if (block.style.display !== 'none') {
          block.style.display = 'none';
          log('скрыт дубль:', text);
        }
      }
    });

    content.querySelectorAll('.sp-card h3').forEach(h3 => {
      const text = (h3.textContent || '').trim();
      if (/Калькулятор коробок|Быстрый калькулятор/.test(text)) {
        const card = h3.closest('.sp-card');
        if (card && card.style.display !== 'none') {
          card.style.display = 'none';
          log('скрыт оригинальный калькулятор');
        }
      }
    });
  }

  /* ---------- Observer + ретрай ---------- */
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
    injectStyles();

    /* Ретрай: 30 попыток каждые 500мс в первые 15 сек */
    let ticks = 0;
    const pollTimer = setInterval(() => {
      ticks++;
      schedule();
      if (ticks >= 30) clearInterval(pollTimer);
    }, 500);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
  }

  function injectStyles() {
    if (document.getElementById('spCompactDashStyles')) return;
    const style = document.createElement('style');
    style.id = 'spCompactDashStyles';
    document.head.appendChild(style);
  }

  init();

  window.spCompactDashboard = {
    rebuild: schedule,
    version: '1.2.0'
  };
})();
