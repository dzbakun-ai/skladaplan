/* =========================================================
   SKLADAPLAN — ПЕЧАТЬ ЭТИКЕТОК
   =========================================================

   Что делает:
   - В Базе: кнопка 🏷 у каждой коробки → печать одной этикетки.
   - В Базе: пакетная печать выбранных (по чекбоксам).
   - В Собрано: печать этикеток для группы.
   - Модалка настроек: размер, состав, количество копий.

   Как печатает:
   - Формирует HTML-страницу с этикетками (JsBarcode для
     штрихкода) → открывает в новом окне → window.print().
   - Работает с любым принтером: термопринтер, А4, PDF.
   - Не требует внешних библиотек PDF.

   Изоляция:
   - Не трогает app.js.
   - Если JsBarcode не загрузится, печатает просто цифры.
   ========================================================= */

(function () {
  'use strict';
  if (window.spLabels) return;

  const STYLES_ID  = 'spLabelsStyles';
  const MODAL_ID   = 'spLabelsModal';
  const BTN_CLASS  = 'sp-label-btn';
  const ATTACH_ATTR = 'data-label-attached';

  let jscodeLoadPromise = null;
  let observer = null;
  let scheduled = false;

  /* Хранилище текущего задания печати */
  let pendingBoxes = [];

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
    else console.log('[Labels]', msg);
  }

  /* Загружаем JsBarcode по требованию */
  function loadJsBarcode() {
    if (window.JsBarcode) return Promise.resolve();
    if (jscodeLoadPromise) return jscodeLoadPromise;

    jscodeLoadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Не удалось загрузить JsBarcode. Проверьте интернет.'));
      document.head.appendChild(s);
    });

    return jscodeLoadPromise;
  }

  /* ============== СТИЛИ (для кнопок в интерфейсе) ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      .sp-label-btn {
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
      .sp-label-btn:hover {
        background: #eef2f7;
        border-color: #cbd5e1;
        color: #1e40af;
      }
      .sp-label-btn:active { transform: scale(.97); }

      /* Верхняя кнопка "Печать этикеток (N)" */
      .sp-labels-batch-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 0 15px;
        margin-left: auto;
        border: 0;
        border-radius: 10px;
        background: var(--primary, #2563EB);
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .sp-labels-batch-btn:hover {
        background: var(--primary-hover, #1D4ED8);
      }
      .sp-labels-batch-btn:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      /* ============== МОДАЛКА ============== */
      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100011;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-lbl-card {
        background: #fff;
        border-radius: 16px;
        width: 100%; max-width: 560px;
        max-height: 92vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-lbl-head {
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
        display: flex; align-items: center; justify-content: space-between;
      }
      #${MODAL_ID} .sp-lbl-head h3 {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
      }
      #${MODAL_ID} .sp-lbl-close {
        border: 0;
        background: #f3f3f3;
        width: 34px; height: 34px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: #444;
      }
      #${MODAL_ID} .sp-lbl-close:hover { background: #e5e5e5; }

      #${MODAL_ID} .sp-lbl-body {
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
      }
      #${MODAL_ID} .sp-lbl-info {
        padding: 10px 14px;
        background: #eff6ff;
        color: #1e40af;
        border-radius: 10px;
        font-size: 13px;
        margin-bottom: 16px;
      }
      #${MODAL_ID} .sp-lbl-field {
        display: block;
        margin-bottom: 14px;
      }
      #${MODAL_ID} .sp-lbl-field > span {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 6px;
      }
      #${MODAL_ID} .sp-lbl-field select,
      #${MODAL_ID} .sp-lbl-field input {
        width: 100%; box-sizing: border-box;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 10px 12px; font-size: 13px; outline: none; background: #fff;
      }
      #${MODAL_ID} .sp-lbl-field select:focus,
      #${MODAL_ID} .sp-lbl-field input:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${MODAL_ID} .sp-lbl-checks {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin: 12px 0 16px;
        padding: 12px 14px;
        background: #f8fafc;
        border-radius: 10px;
      }
      #${MODAL_ID} .sp-lbl-check {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; cursor: pointer;
      }
      #${MODAL_ID} .sp-lbl-check input {
        width: 16px; height: 16px;
        accent-color: var(--primary, #2563EB);
        cursor: pointer;
      }
      #${MODAL_ID} .sp-lbl-foot {
        padding: 12px 20px 16px;
        display: flex; gap: 8px; justify-content: flex-end;
        border-top: 1px solid #eef1f4;
        background: #fafbfc;
      }
      #${MODAL_ID} .sp-lbl-btn {
        border: 0;
        border-radius: 9px;
        padding: 11px 18px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-lbl-btn-primary {
        background: var(--primary, #2563EB); color: #fff;
      }
      #${MODAL_ID} .sp-lbl-btn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${MODAL_ID} .sp-lbl-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
      #${MODAL_ID} .sp-lbl-btn-secondary {
        background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0;
      }
      #${MODAL_ID} .sp-lbl-btn-secondary:hover { background: #e2e8f0; }

      @media (max-width: 640px) {
        #${MODAL_ID} .sp-lbl-checks { grid-template-columns: 1fr; }
        #${MODAL_ID} .sp-lbl-foot { flex-direction: column; }
        #${MODAL_ID} .sp-lbl-btn { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============== ФОРМИРОВАНИЕ ЭТИКЕТОК ============== */

  /* Шаблоны CSS @page по размеру */
  function sizeCss(size) {
    const map = {
      '58x40': {
        width: '58mm',
        height: '40mm',
        padding: '2mm 3mm',
        page: '@page { size: 58mm 40mm; margin: 0; }'
      },
      '40x30': {
        width: '40mm',
        height: '30mm',
        padding: '1.5mm 2mm',
        page: '@page { size: 40mm 30mm; margin: 0; }'
      },
      '70x50': {
        width: '70mm',
        height: '50mm',
        padding: '3mm 4mm',
        page: '@page { size: 70mm 50mm; margin: 0; }'
      },
      'a4': {
        width: '65mm',
        height: '38mm',
        padding: '2mm 3mm',
        page: '@page { size: A4; margin: 8mm; }'
      }
    };
    return map[size] || map['58x40'];
  }

  /* HTML одной этикетки */
  function labelHtml(box, options) {
    const s = sizeCss(options.size);

    const barcodeId = 'bc_' + Math.random().toString(36).slice(2, 10);

    const barcode = String(box.barcode || box['Штрихкод'] || '').trim();
    const article = String(box.article || box['Артикул'] || '').trim();
    const warehouse = String(box.warehouse || box['Склад'] || '').trim();
    const zone = String(box.zone_row || box['Зона/ряд'] || '').trim();
    const pallet = String(box.pallet || box['Поддон'] || '').trim();
    const direction = String(box.direction || box['Направление'] || '').trim();

    const barcodeText = barcode || '—';

    return `
      <div class="lbl" style="
        width: ${s.width};
        height: ${s.height};
        padding: ${s.padding};
        box-sizing: border-box;
        page-break-after: always;
        break-after: page;
        overflow: hidden;
        font-family: Arial, Helvetica, sans-serif;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      ">
        <div style="text-align:center;">
          <div style="font-size:9px; color:#555; margin-bottom:1mm;">
            ${options.showWarehouse && warehouse ? escapeHtml(warehouse) : '&nbsp;'}
          </div>
          <svg id="${barcodeId}"
               class="lbl-barcode-svg"
               data-barcode="${escapeHtml(barcode)}"
               style="width:100%; height:auto; max-height:14mm; display:block; margin:0 auto;"></svg>
          <div style="font-family: 'Courier New', monospace; font-size:11px; font-weight:700; margin-top:1mm; letter-spacing:0.3px;">
            ${escapeHtml(barcodeText)}
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; gap:2mm; font-size:10px;">
          <div>
            ${options.showArticle && article ? `<div><b>${escapeHtml(article)}</b></div>` : ''}
            ${options.showLocation && zone ? `<div>${escapeHtml(zone)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            ${options.showPallet && pallet ? `<div><b>Поддон ${escapeHtml(pallet)}</b></div>` : ''}
            ${options.showDirection && direction ? `<div>${escapeHtml(direction)}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /* Полная HTML-страница для печати */
  function buildPrintPage(boxes, options) {
    const s = sizeCss(options.size);

    const copies = Math.max(1, Number(options.copies) || 1);
    const expandedBoxes = [];
    boxes.forEach(b => {
      for (let i = 0; i < copies; i++) expandedBoxes.push(b);
    });

    const labels = expandedBoxes.map(b => labelHtml(b, options)).join('');

    /* На A4 делаем flex-раскладку в 3 колонки */
    const isA4 = options.size === 'a4';
    const a4Wrapper = isA4
      ? `display:flex; flex-wrap:wrap; gap:2mm;`
      : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Этикетки — SKLADAPLAN</title>
<style>
  ${s.page}
  html, body { margin:0; padding:0; background:#fff; }
  body { ${a4Wrapper} }
  .lbl { border: 1px dashed #ddd; }
  @media print {
    .lbl { border: none; }
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
</head>
<body>
  ${labels}
  <script>
    window.addEventListener('load', function () {
      try {
        document.querySelectorAll('.lbl-barcode-svg').forEach(function (svg) {
          var code = svg.getAttribute('data-barcode');
          if (!code) return;
          try {
            JsBarcode(svg, code, {
              format: 'CODE128',
              displayValue: false,
              margin: 0,
              height: 40,
              width: 1.6
            });
          } catch (e) {
            /* Некорректный штрихкод — просто оставим SVG пустым */
            console.warn('JsBarcode error for', code, e);
          }
        });
      } catch (e) {
        console.warn('print page error', e);
      }

      /* Даём SVG отрисоваться, потом печатаем */
      setTimeout(function () {
        window.print();
      }, 400);
    });
  </script>
</body>
</html>`;
  }

  /* ============== ОТКРЫТИЕ МОДАЛКИ ============== */

  function openModal(boxes) {
    if (!boxes || !boxes.length) {
      toast('Нет коробок для печати', 'error');
      return;
    }

    if (document.getElementById(MODAL_ID)) return;

    pendingBoxes = boxes;

    const totalLabel = boxes.length === 1
      ? '1 коробка'
      : `${boxes.length} коробок`;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-lbl-card">
        <div class="sp-lbl-head">
          <h3>🖨 Печать этикеток</h3>
          <button type="button" class="sp-lbl-close" aria-label="Закрыть">×</button>
        </div>
        <div class="sp-lbl-body">

          <div class="sp-lbl-info">
            К печати: <b>${escapeHtml(totalLabel)}</b>
          </div>

          <label class="sp-lbl-field">
            <span>Размер этикетки</span>
            <select id="spLblSize">
              <option value="58x40" selected>58 × 40 мм (термопринтер)</option>
              <option value="40x30">40 × 30 мм (малый термо)</option>
              <option value="70x50">70 × 50 мм (большой термо)</option>
              <option value="a4">A4 (обычный принтер, ~3 в ряд)</option>
            </select>
          </label>

          <label class="sp-lbl-field">
            <span>Количество копий каждой этикетки</span>
            <input id="spLblCopies" type="number" min="1" max="10" value="1">
          </label>

          <div style="font-size:12px;font-weight:600;color:#475569;margin-top:8px;">
            Что печатать:
          </div>

          <div class="sp-lbl-checks">
            <label class="sp-lbl-check">
              <input type="checkbox" id="spLblShowWarehouse" checked>
              <span>Склад</span>
            </label>
            <label class="sp-lbl-check">
              <input type="checkbox" id="spLblShowArticle" checked>
              <span>Артикул</span>
            </label>
            <label class="sp-lbl-check">
              <input type="checkbox" id="spLblShowLocation" checked>
              <span>Зона / ряд</span>
            </label>
            <label class="sp-lbl-check">
              <input type="checkbox" id="spLblShowPallet" checked>
              <span>Поддон</span>
            </label>
            <label class="sp-lbl-check">
              <input type="checkbox" id="spLblShowDirection" checked>
              <span>Направление</span>
            </label>
          </div>

          <div style="font-size:11px;color:#94a3b8;line-height:1.5;">
            В открывшемся окне браузера нажмите «Печать». Проверьте, что
            выбран нужный принтер и размер бумаги (для термопринтера —
            точный размер этикетки).
          </div>

        </div>
        <div class="sp-lbl-foot">
          <button type="button" class="sp-lbl-btn sp-lbl-btn-secondary" id="spLblCancel">Отмена</button>
          <button type="button" class="sp-lbl-btn sp-lbl-btn-primary" id="spLblPrint">Печать</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sp-lbl-close').addEventListener('click', closeModal);
    document.getElementById('spLblCancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const escHandler = e => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.getElementById('spLblPrint').addEventListener('click', doPrint);
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
    pendingBoxes = [];
  }

  async function doPrint() {
    const btn = document.getElementById('spLblPrint');
    btn.disabled = true;
    btn.textContent = 'Подготовка…';

    const options = {
      size: document.getElementById('spLblSize')?.value || '58x40',
      copies: Number(document.getElementById('spLblCopies')?.value || 1),
      showWarehouse: !!document.getElementById('spLblShowWarehouse')?.checked,
      showArticle:   !!document.getElementById('spLblShowArticle')?.checked,
      showLocation:  !!document.getElementById('spLblShowLocation')?.checked,
      showPallet:    !!document.getElementById('spLblShowPallet')?.checked,
      showDirection: !!document.getElementById('spLblShowDirection')?.checked
    };

    /* Убедимся, что JsBarcode загружен (для отрисовки в новом окне) */
    try {
      await loadJsBarcode();
    } catch (e) {
      console.warn('[Labels] JsBarcode не загрузился, штрихкоды не будут отрисованы:', e);
    }

    const html = buildPrintPage(pendingBoxes, options);

    /* Открываем новое окно и печатаем */
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) {
      toast('Разрешите всплывающие окна, чтобы печатать этикетки', 'error');
      btn.disabled = false;
      btn.textContent = 'Печать';
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();

    closeModal();

    btn.disabled = false;
    btn.textContent = 'Печать';

    toast(`Подготовлено к печати: ${pendingBoxes.length || '—'} этикеток`);
  }

  /* ============== ВСТАВКА КНОПОК ============== */

  function attachRowButtons() {
    /* Кнопки 🏷 в таблице Базы рядом с edit-box */
    const editBtns = document.querySelectorAll('.edit-box');

    editBtns.forEach(editBtn => {
      if (editBtn.hasAttribute(ATTACH_ATTR)) return;
      const id = editBtn.getAttribute('data-id');
      if (!id) return;

      const parent = editBtn.parentNode;
      if (!parent) return;

      editBtn.setAttribute(ATTACH_ATTR, '1');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-label-btn';
      btn.title = 'Печать этикетки';
      btn.innerHTML = '🏷';

      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();

        /* Ищем коробку в state */
        const box = (window.state?.boxes || []).find(
          b => String(b.id) === String(id)
        );
        if (!box) {
          toast('Коробка не найдена в памяти', 'error');
          return;
        }
        openModal([box]);
      });

      /* Вставляем после существующей кнопки 🕓 (если есть), иначе после edit */
      const histBtn = parent.querySelector('.sp-history-btn');
      if (histBtn && histBtn.nextSibling) {
        parent.insertBefore(btn, histBtn.nextSibling);
      } else if (histBtn) {
        parent.appendChild(btn);
      } else if (editBtn.nextSibling) {
        parent.insertBefore(btn, editBtn.nextSibling);
      } else {
        parent.appendChild(btn);
      }
    });
  }

  function ensureBatchButton() {
    /* Верхняя кнопка "Печать этикеток (N)" — добавляется рядом с
       тулбаром Базы, если есть выбранные через state.selectedIds */

    const toolbar = document.getElementById('deleteSelectedBtn');
    if (!toolbar) return;

    const selectedCount = (window.state?.selectedIds?.size) || 0;
    let batchBtn = document.getElementById('spLabelsBatchBtn');

    if (!selectedCount) {
      if (batchBtn) batchBtn.remove();
      return;
    }

    if (batchBtn) {
      batchBtn.textContent = `🏷 Печать этикеток (${selectedCount})`;
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'spLabelsBatchBtn';
    btn.className = 'sp-labels-batch-btn';
    btn.textContent = `🏷 Печать этикеток (${selectedCount})`;

    btn.addEventListener('click', () => {
      const ids = [...(window.state?.selectedIds || [])];
      const boxes = ids
        .map(id => (window.state?.boxes || []).find(b => String(b.id) === String(id)))
        .filter(Boolean);

      if (!boxes.length) {
        toast('Не найдено коробок', 'error');
        return;
      }
      openModal(boxes);
    });

    toolbar.insertAdjacentElement('afterend', btn);
  }

  function scheduleAttach() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try {
        attachRowButtons();
        ensureBatchButton();
      } catch (e) {
        console.warn('[Labels] attach error:', e);
      }
    });
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();

    const start = () => {
      if (observer) return;
      observer = new MutationObserver(() => {
        scheduleAttach();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleAttach();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }

    setTimeout(scheduleAttach, 500);
    setTimeout(scheduleAttach, 1500);
    setTimeout(scheduleAttach, 3000);

    console.log('[Labels] Модуль инициализирован');
  }

  init();

  window.spLabels = {
    open: (boxes) => openModal(boxes),
    printOne: (boxId) => {
      const box = (window.state?.boxes || []).find(b => String(b.id) === String(boxId));
      if (box) openModal([box]);
      else toast('Коробка не найдена', 'error');
    },
    version: '1.0.0'
  };

})();
