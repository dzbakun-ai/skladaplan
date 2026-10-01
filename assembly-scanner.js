/* =========================================================
   SKLADAPLAN — РАСШИРЕННЫЙ СКАНЕР ДЛЯ СБОРКИ
   =========================================================

   Отдельное окно сканирования — не трогает существующую
   логику «Сборки» в app.js и работает рядом с ней.

   Что делает:
   - Добавляет кнопку «📷 Открыть сканирование» на странице «Сборка».
   - Открывает полноэкранное окно с выпадающими списками
     зон и поддонов (берутся из getZonedPickingGroups()).
   - Фокус всегда остаётся на поле сканера — на ошибке
     просто строка-подсказка снизу, никаких модалок.
   - Считает прогресс по поддону, зоне и в целом.
   - Когда все коробки поддона отсканированы — показывает
     баннер «✓ Поддон собран» с кнопками «Дальше» / «Стоп».
   - «Дальше» — автопереход на следующий поддон в той же зоне,
     потом на следующую зону (порядок как в getZonedPickingGroups).
   - Отсканированные коробки попадают в state.assemblySelectedIds —
     то есть кнопка «Скомплектовать выбранные» в основном виде
     отработает как обычно.

   Изоляция:
   - app.js, tasks.js, planner.js не трогаем.
   - Используем только публичные функции из app.js:
     getZonedPickingGroups(), normalizeText(), normalizeBarcode(),
     escapeHtml(), toast(), completeSelectedAssembly().
   ========================================================= */

(function () {
  'use strict';
  if (window.spAssemblyScanner) return;

  /* ============ КОНСТАНТЫ ============ */

  const STYLES_ID    = 'spAsStyles';
  const OVERLAY_ID   = 'spAsOverlay';
  const INPUT_ID     = 'spAsInput';
  const OPEN_BTN_ID  = 'spAsOpenBtn';
  const ZONE_SEL_ID  = 'spAsZoneSelect';
  const PALLET_SEL_ID= 'spAsPalletSelect';
  const MAX_RECENT   = 6;

  /* ============ ЛОКАЛЬНОЕ СОСТОЯНИЕ ============ */

  const scanState = {
    open: false,
    currentZone: '',
    currentPallet: '',
    /* "зона||поддон" → Set of box ids (строки) */
    scannedByLocation: new Map(),
    /* последние сканы: { barcode, ok, message, time } */
    recentScans: [],
    /* скрыт ли баннер «поддон собран» вручную (Стоп) */
    completeBannerDismissed: new Set()
  };

  /* ============ ДОСТУП К ГЛОБАЛЬНОМУ СОСТОЯНИЮ ============ */

  function getAppState() {
    try {
      if (typeof state !== 'undefined' && state) return state;
    } catch (e) {}
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

  /* ============ УТИЛИТЫ (переиспользуем из app.js) ============ */

  function esc(v) {
    try {
      if (typeof escapeHtml === 'function') return escapeHtml(v);
    } catch (e) {}
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toastMsg(msg, type) {
    try {
      if (typeof toast === 'function') return toast(msg, type || 'success');
    } catch (e) {}
    if (typeof window.toast === 'function') return window.toast(msg, type || 'success');
    console.log('[AssemblyScanner]', msg);
  }

  function normText(v) {
    try {
      if (typeof normalizeText === 'function') return normalizeText(v);
    } catch (e) {}
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  }

  function normBarcode(v) {
    try {
      if (typeof normalizeBarcode === 'function') return normalizeBarcode(v);
    } catch (e) {}
    return String(v == null ? '' : v).replace(/\D/g, '');
  }

  function nowTime() {
    return new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  /* ============ ДАННЫЕ ИЗ ПОДБОРА ============ */

  function getZones() {
    try {
      if (typeof getZonedPickingGroups === 'function') {
        return getZonedPickingGroups() || [];
      }
      if (typeof window.getZonedPickingGroups === 'function') {
        return window.getZonedPickingGroups() || [];
      }
    } catch (e) {
      console.warn('[AssemblyScanner] getZonedPickingGroups error:', e);
    }
    return [];
  }

  function findZone(zoneName) {
    return getZones().find(z => z.zone === zoneName) || null;
  }

  function findPallet(zoneName, palletName) {
    const zone = findZone(zoneName);
    if (!zone) return null;
    return zone.pallets.find(p => p.pallet === palletName) || null;
  }

  function locationKey(zoneName, palletName) {
    return String(zoneName) + '||' + String(palletName);
  }

  function palletAllIds(palletData) {
    if (!palletData) return [];
    const ids = [];
    palletData.groups.forEach(g => {
      g.ids.forEach(id => ids.push(String(id)));
    });
    return ids;
  }

  function getScannedSet(zoneName, palletName) {
    const key = locationKey(zoneName, palletName);
    if (!scanState.scannedByLocation.has(key)) {
      scanState.scannedByLocation.set(key, new Set());
    }
    return scanState.scannedByLocation.get(key);
  }

  function palletProgress(zoneName, palletName) {
    const pallet = findPallet(zoneName, palletName);
    if (!pallet) return { scanned: 0, total: 0, done: false };
    const allIds = palletAllIds(pallet);
    const set = getScannedSet(zoneName, palletName);
    let scanned = 0;
    allIds.forEach(id => { if (set.has(id)) scanned++; });
    return {
      scanned,
      total: allIds.length,
      done: allIds.length > 0 && scanned >= allIds.length
    };
  }

  function zoneProgress(zoneName) {
    const zone = findZone(zoneName);
    if (!zone) return { scanned: 0, total: 0, palletsDone: 0, palletsTotal: 0 };
    let scanned = 0, total = 0, done = 0;
    zone.pallets.forEach(p => {
      const pr = palletProgress(zoneName, p.pallet);
      scanned += pr.scanned;
      total += pr.total;
      if (pr.done) done++;
    });
    return { scanned, total, palletsDone: done, palletsTotal: zone.pallets.length };
  }

  function allProgress() {
    const zones = getZones();
    let scanned = 0, total = 0, done = 0, palletsTotal = 0;
    zones.forEach(z => {
      z.pallets.forEach(p => {
        const pr = palletProgress(z.zone, p.pallet);
        scanned += pr.scanned;
        total += pr.total;
        palletsTotal++;
        if (pr.done) done++;
      });
    });
    return { scanned, total, palletsDone: done, palletsTotal };
  }

  /* ============ НАВИГАЦИЯ ПО ОЧЕРЕДИ ============ */

  /**
   * Возвращает плоский список { zone, pallet } в том же порядке,
   * что и порядок зон/поддонов в getZonedPickingGroups.
   */
  function flattenPallets() {
    const out = [];
    getZones().forEach(z => {
      z.pallets.forEach(p => {
        out.push({ zone: z.zone, pallet: p.pallet });
      });
    });
    return out;
  }

  /**
   * Первый доступный (не завершённый) поддон.
   * Если все завершены — null.
   */
  function firstAvailablePallet() {
    const flat = flattenPallets();
    for (const item of flat) {
      if (!palletProgress(item.zone, item.pallet).done) return item;
    }
    return null;
  }

  /**
   * Следующий доступный поддон после указанного.
   * Идёт вперёд по списку, потом с начала. Пропускает завершённые.
   * Если всё завершено — null.
   */
  function nextAvailablePallet(currentZone, currentPallet) {
    const flat = flattenPallets();
    if (!flat.length) return null;

    let startIdx = flat.findIndex(
      x => x.zone === currentZone && x.pallet === currentPallet
    );
    if (startIdx < 0) startIdx = -1;

    // Вперёд
    for (let i = startIdx + 1; i < flat.length; i++) {
      if (!palletProgress(flat[i].zone, flat[i].pallet).done) return flat[i];
    }
    // С начала (не включая уже проверенные)
    for (let i = 0; i <= startIdx && i < flat.length; i++) {
      if (i === startIdx) continue;
      if (!palletProgress(flat[i].zone, flat[i].pallet).done) return flat[i];
    }
    return null;
  }

  /* ============ СКАНИРОВАНИЕ ============ */

  /**
   * Ищет коробку на текущем поддоне с указанным штрихкодом,
   * ещё не отсканированную.
   * Возвращает { box, group } или null.
   */
  function findBoxOnCurrentPallet(barcode) {
    const zone = scanState.currentZone;
    const pallet = scanState.currentPallet;
    const palletData = findPallet(zone, pallet);
    if (!palletData) return null;

    const scannedSet = getScannedSet(zone, pallet);

    for (const group of palletData.groups) {
      if (normBarcode(group.barcode) !== barcode) continue;
      for (const box of group.boxes) {
        if (!scannedSet.has(String(box.id))) {
          return { box, group };
        }
      }
    }
    return null;
  }

  /**
   * Проверяет, есть ли коробка с таким штрихкодом где-то
   * в подборе (на другом поддоне/зоне).
   * Возвращает { zone, pallet, alreadyScannedHere } или null.
   */
  function findBoxAnywhere(barcode) {
    const zones = getZones();
    for (const z of zones) {
      for (const p of z.pallets) {
        for (const g of p.groups) {
          if (normBarcode(g.barcode) !== barcode) continue;
          const scanned = getScannedSet(z.zone, p.pallet);
          const isCurrentLocation =
            z.zone === scanState.currentZone &&
            p.pallet === scanState.currentPallet;
          const allScanned =
            g.boxes.every(b => scanned.has(String(b.id)));
          return {
            zone: z.zone,
            pallet: p.pallet,
            isCurrentLocation,
            allScanned
          };
        }
      }
    }
    return null;
  }

  /**
   * Обработка одного сканирования.
   * Никаких модалок — только строка-подсказка снизу.
   */
  function processScan(rawBarcode) {
    const raw = String(rawBarcode || '').trim();
    if (!raw) return;

    const barcode = normBarcode(raw);
    if (!barcode) {
      pushRecent({ barcode: raw, ok: false, message: 'Пустой штрихкод' });
      renderLastScan({ ok: false, message: 'Пустой штрихкод' });
      refocusInput();
      return;
    }

    if (!scanState.currentZone || !scanState.currentPallet) {
      pushRecent({ barcode, ok: false, message: 'Не выбран поддон' });
      renderLastScan({
        ok: false,
        message: 'Сначала выберите зону и поддон'
      });
      refocusInput();
      return;
    }

    // 1. Пробуем найти на текущем поддоне
    const match = findBoxOnCurrentPallet(barcode);
    if (match) {
      const { box } = match;

      // Помечаем в локальном прогрессе
      getScannedSet(scanState.currentZone, scanState.currentPallet)
        .add(String(box.id));

      // Добавляем в глобальный выбор (существующее поведение)
      const app = getAppState();
      if (app && app.assemblySelectedIds) {
        app.assemblySelectedIds.add(String(box.id));
      }

      beep(true);

      pushRecent({
        barcode,
        ok: true,
        message: 'Найдено',
        article: box.article || ''
      });
      renderLastScan({
        ok: true,
        message: `✓ ${barcode}`,
        extra: box.article ? `Артикул: ${box.article}` : ''
      });

      renderOverlayBody();
      refocusInput();
      return;
    }

    // 2. Коробка есть где-то ещё в подборе — но не здесь
    const anywhere = findBoxAnywhere(barcode);
    if (anywhere) {
      if (anywhere.isCurrentLocation && anywhere.allScanned) {
        // Уже всё отсканировано на этом поддоне
        pushRecent({ barcode, ok: false, message: 'Уже отсканировано' });
        renderLastScan({
          ok: false,
          message: `${barcode} уже отсканирован на этом поддоне`
        });
      } else if (!anywhere.isCurrentLocation) {
        pushRecent({
          barcode,
          ok: false,
          message: 'На другом поддоне',
          extra: `${anywhere.zone} · ${anywhere.pallet}`
        });
        renderLastScan({
          ok: false,
          message: `${barcode} находится на другом поддоне`,
          extra: `${anywhere.zone} · поддон ${anywhere.pallet}`
        });
      } else {
        pushRecent({ barcode, ok: false, message: 'Не найдено' });
        renderLastScan({ ok: false, message: `${barcode} не найдено` });
      }
      beep(false);
      refocusInput();
      return;
    }

    // 3. Не найдено вообще
    pushRecent({ barcode, ok: false, message: 'Не найдено в подборе' });
    renderLastScan({
      ok: false,
      message: `${barcode} не найдено в подборе`
    });
    beep(false);
    refocusInput();
  }

  function pushRecent(item) {
    scanState.recentScans.unshift({
      ...item,
      time: nowTime()
    });
    if (scanState.recentScans.length > MAX_RECENT) {
      scanState.recentScans.length = MAX_RECENT;
    }
  }

  function refocusInput() {
    const input = document.getElementById(INPUT_ID);
    if (!input) return;
    setTimeout(() => {
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        input.focus();
      }
    }, 30);
  }

  /* ============ ПРОГРЕСС / БАННЕР ЗАВЕРШЕНИЯ ============ */

  function isCurrentPalletJustCompleted() {
    if (!scanState.currentZone || !scanState.currentPallet) return false;
    const key = locationKey(scanState.currentZone, scanState.currentPallet);
    if (scanState.completeBannerDismissed.has(key)) return false;
    return palletProgress(scanState.currentZone, scanState.currentPallet).done;
  }

  function dismissCompleteBanner() {
    const key = locationKey(scanState.currentZone, scanState.currentPallet);
    scanState.completeBannerDismissed.add(key);
    renderOverlayBody();
    refocusInput();
  }

  function advanceToNextPallet() {
    const next = nextAvailablePallet(
      scanState.currentZone,
      scanState.currentPallet
    );

    if (!next) {
      // Всё собрано
      showAllDoneBanner();
      return;
    }

    scanState.currentZone = next.zone;
    scanState.currentPallet = next.pallet;
    renderOverlayBody();
    refocusInput();
  }

  let allDoneShown = false;
  function showAllDoneBanner() {
    if (allDoneShown) return;
    allDoneShown = true;
    // Просто перерисовываем — в renderOverlayBody проверяется
    // условие «всё завершено» и показывается соответствующий баннер.
    renderOverlayBody();
    refocusInput();
    setTimeout(() => { allDoneShown = false; }, 3000);
  }

  /* ============ ЗВУК ============ */

  function beep(success) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = success ? 1000 : 250;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (success ? 0.12 : 0.25));
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.13 : 0.26));
    } catch (e) {}
  }

  /* ============ СИНХРОНИЗАЦИЯ С ГЛОБАЛЬНЫМ ВЫБОРОМ ============ */

  function syncScannedFromGlobalSelection() {
    const app = getAppState();
    if (!app || !app.assemblySelectedIds) return;

    scanState.scannedByLocation.clear();

    getZones().forEach(z => {
      z.pallets.forEach(p => {
        const ids = palletAllIds(p);
        const set = new Set();
        ids.forEach(id => {
          if (app.assemblySelectedIds.has(id)) set.add(id);
        });
        if (set.size > 0) {
          scanState.scannedByLocation.set(locationKey(z.zone, p.pallet), set);
        }
      });
    });
  }

  /* ============ СТИЛИ ============ */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${OPEN_BTN_ID} {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        margin-top: 10px;
        padding: 12px 16px;
        border: 0;
        border-radius: 12px;
        background: var(--primary, #2563EB);
        color: #fff;
        font-family: inherit;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: background .15s ease, transform .1s ease;
      }
      #${OPEN_BTN_ID}:hover { background: var(--primary-hover, #1D4ED8); }
      #${OPEN_BTN_ID}:active { transform: scale(.98); }

      /* Оверлей — НЕ модалка, полноэкранный режим сканера */
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        background: #f8fafc;
        z-index: 100050;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: inherit;
      }

      /* Верхняя шапка */
      #${OVERLAY_ID} .sp-as-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        background: #fff;
        border-bottom: 1px solid #e2e8f0;
        flex-shrink: 0;
      }
      #${OVERLAY_ID} .sp-as-title {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
      }
      #${OVERLAY_ID} .sp-as-close {
        border: 0;
        background: #f3f3f3;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: #444;
        flex-shrink: 0;
      }
      #${OVERLAY_ID} .sp-as-close:hover { background: #e5e5e5; }

      /* Скроллируемое тело */
      #${OVERLAY_ID} .sp-as-body {
        flex: 1;
        overflow-y: auto;
        padding: 14px 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Селекторы зоны и поддона */
      #${OVERLAY_ID} .sp-as-selects {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      #${OVERLAY_ID} .sp-as-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      #${OVERLAY_ID} .sp-as-field > span {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: #64748b;
      }
      #${OVERLAY_ID} .sp-as-field select {
        min-height: 44px;
        border: 1px solid #dfe3e8;
        border-radius: 10px;
        background: #fff;
        padding: 0 12px;
        font-size: 14px;
        font-weight: 600;
        color: #0f172a;
        outline: none;
        font-family: inherit;
      }
      #${OVERLAY_ID} .sp-as-field select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }

      /* Прогресс */
      #${OVERLAY_ID} .sp-as-progress {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 12px 14px;
      }
      #${OVERLAY_ID} .sp-as-progress-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 12px;
        color: #475569;
        margin-bottom: 8px;
      }
      #${OVERLAY_ID} .sp-as-progress-row:last-child { margin-bottom: 0; }
      #${OVERLAY_ID} .sp-as-progress-row b {
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }
      #${OVERLAY_ID} .sp-as-progress-bar {
        flex: 1;
        height: 8px;
        background: #f1f5f9;
        border-radius: 999px;
        overflow: hidden;
        margin: 0 8px;
      }
      #${OVERLAY_ID} .sp-as-progress-fill {
        height: 100%;
        background: var(--primary, #2563EB);
        border-radius: 999px;
        transition: width .2s ease;
      }
      #${OVERLAY_ID} .sp-as-progress-fill.is-done {
        background: #18794e;
      }

      /* Баннер «поддон собран» */
      #${OVERLAY_ID} .sp-as-complete {
        background: #eaf7ef;
        border: 1px solid #a7e0bf;
        border-radius: 12px;
        padding: 14px 16px;
      }
      #${OVERLAY_ID} .sp-as-complete-title {
        font-size: 15px;
        font-weight: 700;
        color: #18794e;
        margin-bottom: 4px;
      }
      #${OVERLAY_ID} .sp-as-complete-sub {
        font-size: 12px;
        color: #3d7d5c;
        margin-bottom: 12px;
      }
      #${OVERLAY_ID} .sp-as-complete-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      #${OVERLAY_ID} .sp-as-btn {
        border: 0;
        border-radius: 9px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      #${OVERLAY_ID} .sp-as-btn-primary {
        background: #18794e;
        color: #fff;
      }
      #${OVERLAY_ID} .sp-as-btn-primary:hover { background: #146a43; }
      #${OVERLAY_ID} .sp-as-btn-secondary {
        background: #fff;
        color: #334155;
        border: 1px solid #cbd5e1;
      }
      #${OVERLAY_ID} .sp-as-btn-secondary:hover { background: #f8fafc; }

      /* Баннер «всё собрано» */
      #${OVERLAY_ID} .sp-as-alldone {
        background: #ecfdf5;
        border: 1px solid #6ee7b7;
        border-radius: 12px;
        padding: 16px 18px;
        text-align: center;
      }
      #${OVERLAY_ID} .sp-as-alldone-title {
        font-size: 17px;
        font-weight: 800;
        color: #065f46;
        margin-bottom: 6px;
      }
      #${OVERLAY_ID} .sp-as-alldone-sub {
        font-size: 13px;
        color: #047857;
        margin-bottom: 14px;
      }

      /* Сканер */
      #${OVERLAY_ID} .sp-as-scan-block {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 12px 14px;
      }
      #${OVERLAY_ID} .sp-as-scan-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: #64748b;
        margin-bottom: 8px;
      }
      #${INPUT_ID} {
        width: 100%;
        box-sizing: border-box;
        min-height: 56px;
        border: 2px solid #0f172a;
        border-radius: 12px;
        padding: 0 14px;
        font-size: 18px;
        font-weight: 600;
        font-family: inherit;
        outline: none;
        background: #fff;
        color: #0f172a;
      }
      #${INPUT_ID}:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 4px rgba(37,99,235,.12);
      }
      #${INPUT_ID}::placeholder {
        color: #94a3b8;
        font-weight: 500;
      }

      /* Строка последнего результата */
      #${OVERLAY_ID} .sp-as-last {
        margin-top: 10px;
        min-height: 22px;
        font-size: 13px;
        line-height: 1.4;
        color: #64748b;
        font-weight: 600;
        word-break: break-word;
      }
      #${OVERLAY_ID} .sp-as-last.is-ok { color: #18794e; }
      #${OVERLAY_ID} .sp-as-last.is-err { color: #b42318; }
      #${OVERLAY_ID} .sp-as-last-extra {
        display: block;
        font-size: 11px;
        font-weight: 500;
        color: #64748b;
        margin-top: 2px;
      }

      /* Список недавних сканов */
      #${OVERLAY_ID} .sp-as-recent {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        overflow: hidden;
      }
      #${OVERLAY_ID} .sp-as-recent-head {
        padding: 10px 14px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: #64748b;
        border-bottom: 1px solid #f1f5f9;
        background: #fafbfc;
      }
      #${OVERLAY_ID} .sp-as-recent-list {
        padding: 4px 0;
      }
      #${OVERLAY_ID} .sp-as-recent-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 14px;
        font-size: 12px;
      }
      #${OVERLAY_ID} .sp-as-recent-item + .sp-as-recent-item {
        border-top: 1px solid #f8fafc;
      }
      #${OVERLAY_ID} .sp-as-recent-icon {
        width: 18px;
        text-align: center;
        flex-shrink: 0;
        font-size: 13px;
      }
      #${OVERLAY_ID} .sp-as-recent-barcode {
        flex: 1;
        min-width: 0;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 13px;
        font-weight: 600;
        color: #0f172a;
        word-break: break-all;
      }
      #${OVERLAY_ID} .sp-as-recent-msg {
        font-size: 11px;
        color: #64748b;
        flex-shrink: 0;
      }
      #${OVERLAY_ID} .sp-as-recent-time {
        font-size: 10px;
        color: #94a3b8;
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }
      #${OVERLAY_ID} .sp-as-recent-empty {
        padding: 14px;
        text-align: center;
        color: #94a3b8;
        font-size: 12px;
      }

      /* Нижние кнопки */
      #${OVERLAY_ID} .sp-as-footer {
        padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
        background: #fff;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      #${OVERLAY_ID} .sp-as-footer .sp-as-btn { flex: 1; justify-content: center; }
      #${OVERLAY_ID} .sp-as-footer .sp-as-btn:disabled {
        opacity: .5;
        cursor: not-allowed;
      }

      @media (max-width: 640px) {
        #${OVERLAY_ID} .sp-as-selects {
          grid-template-columns: 1fr;
        }
        #${OVERLAY_ID} .sp-as-complete-actions {
          flex-direction: column;
        }
        #${OVERLAY_ID} .sp-as-complete-actions .sp-as-btn {
          width: 100%;
          justify-content: center;
        }
        #${OVERLAY_ID} .sp-as-body {
          padding: 12px 12px 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============ РЕНДЕР ОКНА ============ */

  function buildOverlayHtml() {
    return `
      <div class="sp-as-head">
        <div class="sp-as-title">📷 Сканирование сборки</div>
        <button type="button" class="sp-as-close" id="spAsCloseBtn" aria-label="Закрыть">×</button>
      </div>
      <div class="sp-as-body" id="spAsBody"></div>
      <div class="sp-as-footer">
        <button type="button" class="sp-as-btn sp-as-btn-secondary" id="spAsCollectBtn" disabled>
          ✓ Скомплектовать (0)
        </button>
        <button type="button" class="sp-as-btn sp-as-btn-secondary" id="spAsResetBtn">
          Сбросить прогресс
        </button>
      </div>
    `;
  }

  function zoneOptionsHtml() {
    const zones = getZones();
    if (!zones.length) {
      return '<option value="">— нет коробок в подборе —</option>';
    }
    let html = '';
    zones.forEach(z => {
      const zp = zoneProgress(z.zone);
      const selected = z.zone === scanState.currentZone ? ' selected' : '';
      const doneMark = (zp.palletsTotal > 0 && zp.palletsDone >= zp.palletsTotal)
        ? ' ✓'
        : '';
      html += `<option value="${esc(z.zone)}"${selected}>${esc(z.zone)}${doneMark} (${zp.scanned}/${zp.total})</option>`;
    });
    return html;
  }

  function palletOptionsHtml() {
    const zone = findZone(scanState.currentZone);
    if (!zone || !zone.pallets.length) {
      return '<option value="">— выберите зону —</option>';
    }
    let html = '';
    zone.pallets.forEach(p => {
      const pr = palletProgress(zone.zone, p.pallet);
      const selected = p.pallet === scanState.currentPallet ? ' selected' : '';
      const doneMark = pr.done ? ' ✓' : '';
      const palletLabel = p.hasPallet ? p.pallet : '(без поддона)';
      html += `<option value="${esc(p.pallet)}"${selected}>${esc(palletLabel)}${doneMark} (${pr.scanned}/${pr.total})</option>`;
    });
    return html;
  }

  function progressBlockHtml() {
    const zone = scanState.currentZone;
    const pallet = scanState.currentPallet;

    if (!zone || !pallet) return '';

    const pp = palletProgress(zone, pallet);
    const zp = zoneProgress(zone);
    const ap = allProgress();

    const pct = (s, t) => t > 0 ? Math.round(s / t * 100) : 0;

    return `
      <div class="sp-as-progress">
        <div class="sp-as-progress-row">
          <span>Поддон</span>
          <span class="sp-as-progress-bar">
            <span class="sp-as-progress-fill ${pp.done ? 'is-done' : ''}"
                  style="width:${pct(pp.scanned, pp.total)}%"></span>
          </span>
          <b>${pp.scanned} / ${pp.total}</b>
        </div>
        <div class="sp-as-progress-row">
          <span>Зона</span>
          <span class="sp-as-progress-bar">
            <span class="sp-as-progress-fill ${zp.scanned >= zp.total && zp.total > 0 ? 'is-done' : ''}"
                  style="width:${pct(zp.scanned, zp.total)}%"></span>
          </span>
          <b>${zp.scanned} / ${zp.total}</b>
        </div>
        <div class="sp-as-progress-row">
          <span>Всего</span>
          <span class="sp-as-progress-bar">
            <span class="sp-as-progress-fill ${ap.scanned >= ap.total && ap.total > 0 ? 'is-done' : ''}"
                  style="width:${pct(ap.scanned, ap.total)}%"></span>
          </span>
          <b>${ap.scanned} / ${ap.total}</b>
        </div>
      </div>
    `;
  }

  function completeBannerHtml() {
    const zone = scanState.currentZone;
    const pallet = scanState.currentPallet;
    if (!zone || !pallet) return '';
    if (!isCurrentPalletJustCompleted()) return '';

    const pp = palletProgress(zone, pallet);
    const next = nextAvailablePallet(zone, pallet);

    let nextLine = '';
    if (next) {
      nextLine = `Следующий: <b>${esc(next.zone)} · ${esc(next.pallet)}</b>`;
    } else {
      nextLine = 'Это был последний поддон в подборе.';
    }

    return `
      <div class="sp-as-complete">
        <div class="sp-as-complete-title">✓ Поддон собран</div>
        <div class="sp-as-complete-sub">
          ${esc(zone)} · поддон ${esc(pallet)} — ${pp.scanned} коробок.
          <br>${nextLine}
        </div>
        <div class="sp-as-complete-actions">
          <button type="button" class="sp-as-btn sp-as-btn-primary" id="spAsAdvanceBtn">
            Дальше →
          </button>
          <button type="button" class="sp-as-btn sp-as-btn-secondary" id="spAsStayBtn">
            Остаться здесь
          </button>
        </div>
      </div>
    `;
  }

  function allDoneBannerHtml() {
    const ap = allProgress();
    if (ap.palletsTotal === 0) return '';
    if (ap.palletsDone < ap.palletsTotal) return '';

    return `
      <div class="sp-as-alldone">
        <div class="sp-as-alldone-title">🎉 Всё собрано</div>
        <div class="sp-as-alldone-sub">
          Отсканировано ${ap.scanned} из ${ap.total} коробок
          по всем ${ap.palletsTotal} поддонам.
        </div>
        <button type="button" class="sp-as-btn sp-as-btn-primary" id="spAsCollectAllBtn"
                style="width:100%;justify-content:center;">
          ✓ Скомплектовать всё (${ap.scanned})
        </button>
      </div>
    `;
  }

  function recentScansHtml() {
    if (!scanState.recentScans.length) {
      return `
        <div class="sp-as-recent">
          <div class="sp-as-recent-head">Последние сканы</div>
          <div class="sp-as-recent-empty">Пока ничего не отсканировано</div>
        </div>
      `;
    }

    return `
      <div class="sp-as-recent">
        <div class="sp-as-recent-head">Последние сканы</div>
        <div class="sp-as-recent-list">
          ${scanState.recentScans.map(s => {
            const icon = s.ok ? '✓' : '⚠';
            const color = s.ok ? '#18794e' : '#b42318';
            return `
              <div class="sp-as-recent-item">
                <span class="sp-as-recent-icon" style="color:${color}">${icon}</span>
                <span class="sp-as-recent-barcode">${esc(s.barcode)}</span>
                <span class="sp-as-recent-msg">${esc(s.message || '')}</span>
                <span class="sp-as-recent-time">${esc(s.time || '')}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderOverlayBody() {
    const body = document.getElementById('spAsBody');
    if (!body) return;

    const hasZone = !!scanState.currentZone;
    const hasPallet = !!scanState.currentPallet;

    body.innerHTML = `
      <div class="sp-as-selects">
        <label class="sp-as-field">
          <span>Зона / ряд</span>
          <select id="${ZONE_SEL_ID}">${zoneOptionsHtml()}</select>
        </label>
        <label class="sp-as-field">
          <span>Поддон</span>
          <select id="${PALLET_SEL_ID}">${palletOptionsHtml()}</select>
        </label>
      </div>

      ${progressBlockHtml()}
      ${completeBannerHtml()}
      ${allDoneBannerHtml()}

      <div class="sp-as-scan-block">
        <div class="sp-as-scan-label">Сканируйте штрихкод</div>
        <input
          id="${INPUT_ID}"
          type="text"
          inputmode="none"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Сканируйте штрихкод..."
          ${hasZone && hasPallet ? '' : 'disabled'}
        >
        <div class="sp-as-last" id="spAsLast"></div>
      </div>

      ${recentScansHtml()}
    `;

    setupBodyHandlers();
    updateFooterButtons();
    updateLastScanLineFromState();
    refocusInput();

    // Автоматически показать клавиатуру на ПК,
    // на мобильных не форсируем (inputmode=none)
    const input = document.getElementById(INPUT_ID);
    if (input && !input.disabled) {
      setTimeout(() => {
        try { input.focus({ preventScroll: true }); } catch (e) {}
      }, 50);
    }
  }

  function updateFooterButtons() {
    const collectBtn = document.getElementById('spAsCollectBtn');
    if (!collectBtn) return;

    const app = getAppState();
    const selected = app && app.assemblySelectedIds
      ? app.assemblySelectedIds.size
      : 0;

    collectBtn.textContent = `✓ Скомплектовать (${selected})`;
    collectBtn.disabled = selected === 0;
  }

  /* ============ ПОСЛЕДНИЙ СКАН ============ */

  let lastScanView = null;

  function renderLastScan(data) {
    lastScanView = data;
    updateLastScanLineFromState();
  }

  function updateLastScanLineFromState() {
    const el = document.getElementById('spAsLast');
    if (!el) return;

    if (!lastScanView) {
      el.className = 'sp-as-last';
      el.textContent = '';
      return;
    }

    const d = lastScanView;
    const cls = d.ok ? 'sp-as-last is-ok' : 'sp-as-last is-err';
    const extra = d.extra
      ? `<span class="sp-as-last-extra">${esc(d.extra)}</span>`
      : '';
    el.className = cls;
    el.innerHTML = esc(d.message) + extra;
  }

  /* ============ ОБРАБОТЧИКИ ТЕЛА ОКНА ============ */

  function setupBodyHandlers() {
    const zoneSel = document.getElementById(ZONE_SEL_ID);
    const palletSel = document.getElementById(PALLET_SEL_ID);
    const input = document.getElementById(INPUT_ID);

    zoneSel?.addEventListener('change', e => {
      scanState.currentZone = e.target.value || '';
      // Автовыбор первого поддона в зоне
      const zone = findZone(scanState.currentZone);
      if (zone && zone.pallets.length) {
        scanState.currentPallet = zone.pallets[0].pallet;
      } else {
        scanState.currentPallet = '';
      }
      renderOverlayBody();
    });

    palletSel?.addEventListener('change', e => {
      scanState.currentPallet = e.target.value || '';
      renderOverlayBody();
    });

    input?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      const value = input.value;
      input.value = '';
      processScan(value);
    });

    document.getElementById('spAsAdvanceBtn')?.addEventListener('click', () => {
      advanceToNextPallet();
    });

    document.getElementById('spAsStayBtn')?.addEventListener('click', () => {
      dismissCompleteBanner();
    });

    document.getElementById('spAsCollectAllBtn')?.addEventListener('click', () => {
      collectAllSelected();
    });
  }

  /* ============ СБРОС / КОМПЛЕКТАЦИЯ ============ */

  function resetProgress() {
    if (!confirm('Сбросить локальный прогресс сканирования?\n\nКоробки останутся выбранными в основном разделе «Сборка». Сбросится только счётчик X/Y в этом окне.')) {
      return;
    }
    scanState.scannedByLocation.clear();
    scanState.recentScans = [];
    scanState.completeBannerDismissed.clear();
    lastScanView = null;
    renderOverlayBody();
    toastMsg('Прогресс сканирования сброшен');
  }

  async function collectAllSelected() {
    const app = getAppState();
    if (!app || !app.assemblySelectedIds || !app.assemblySelectedIds.size) {
      toastMsg('Нечего комплектовать', 'error');
      return;
    }

    if (typeof window.completeSelectedAssembly !== 'function') {
      toastMsg('Функция комплектации недоступна', 'error');
      return;
    }

    const before = app.assemblySelectedIds.size;

    try {
      // completeSelectedAssembly — async функция из app.js,
      // сама спросит направление и сделает RPC.
      await window.completeSelectedAssembly();
    } catch (e) {
      console.error('[AssemblyScanner] collect error:', e);
      toastMsg('Ошибка комплектации: ' + (e.message || ''), 'error');
      return;
    }

    // Если выбор очистился — значит комплектация прошла
    const after = app.assemblySelectedIds ? app.assemblySelectedIds.size : 0;

    if (after < before) {
      // Сбрасываем локальный прогресс — коробки уже «Скомплектовано»
      scanState.scannedByLocation.clear();
      scanState.recentScans = [];
      scanState.completeBannerDismissed.clear();
      lastScanView = null;

      // Переключаемся на первый доступный поддон
      const first = firstAvailablePallet();
      if (first) {
        scanState.currentZone = first.zone;
        scanState.currentPallet = first.pallet;
      } else {
        scanState.currentZone = '';
        scanState.currentPallet = '';
      }

      renderOverlayBody();
    }
  }

  /* ============ ОТКРЫТИЕ / ЗАКРЫТИЕ ============ */

  function openOverlay() {
    if (scanState.open) return;
    if (document.getElementById(OVERLAY_ID)) return;

    // Синхронизируем прогресс с уже отмеченными коробками
    syncScannedFromGlobalSelection();

    // Автовыбор зоны и поддона
    if (!scanState.currentZone || !findZone(scanState.currentZone)) {
      const first = firstAvailablePallet();
      if (first) {
        scanState.currentZone = first.zone;
        scanState.currentPallet = first.pallet;
      } else {
        const zones = getZones();
        if (zones.length && zones[0].pallets.length) {
          scanState.currentZone = zones[0].zone;
          scanState.currentPallet = zones[0].pallets[0].pallet;
        } else {
          scanState.currentZone = '';
          scanState.currentPallet = '';
        }
      }
    } else {
      // Зона сохранена — убеждаемся, что поддон существует
      const zone = findZone(scanState.currentZone);
      const palletExists = zone && zone.pallets.some(p => p.pallet === scanState.currentPallet);
      if (!palletExists) {
        scanState.currentPallet = zone && zone.pallets.length
          ? zone.pallets[0].pallet
          : '';
      }
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = buildOverlayHtml();
    document.body.appendChild(overlay);

    scanState.open = true;

    // Кнопка закрытия
    document.getElementById('spAsCloseBtn')?.addEventListener('click', closeOverlay);

    // Кнопка «Скомплектовать (N)» в футере
    document.getElementById('spAsCollectBtn')?.addEventListener('click', collectAllSelected);

    // Кнопка «Сбросить прогресс»
    document.getElementById('spAsResetBtn')?.addEventListener('click', resetProgress);

    // Escape для закрытия
    document.addEventListener('keydown', onKeydown);

    renderOverlayBody();
  }

  function closeOverlay() {
    if (!scanState.open) return;
    scanState.open = false;

    document.removeEventListener('keydown', onKeydown);

    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();

    // Обновляем основной вид, чтобы кнопка «Скомплектовать выбранные»
    // показала актуальное количество
    if (typeof window.render === 'function') {
      try { window.render(); } catch (e) {}
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && scanState.open) {
      e.preventDefault();
      closeOverlay();
    }
  }

  /* ============ ИНЖЕКТ КНОПКИ В РАЗДЕЛ «СБОРКА» ============ */

  function injectOpenButton() {
    if (document.getElementById(OPEN_BTN_ID)) return;

    // Только на странице «Сборка».
    // Признак — существующее поле #scannerInput от старого сканера.
    const scannerInput = document.getElementById('scannerInput');
    if (!scannerInput) return;

    // Находим панель, в которой находится старый сканер
    const panel = scannerInput.closest('.panel');
    if (!panel) return;

    // Ищем блок #scannerResult, после которого вставим кнопку
    const scannerResult = panel.querySelector('#scannerResult');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = OPEN_BTN_ID;
    btn.innerHTML = '📷 Открыть сканирование (расширенное)';
    btn.addEventListener('click', openOverlay);

    if (scannerResult && scannerResult.parentNode) {
      scannerResult.parentNode.insertBefore(btn, scannerResult.nextSibling);
    } else {
      panel.appendChild(btn);
    }
  }

  function scheduleInject() {
    requestAnimationFrame(() => {
      try { injectOpenButton(); }
      catch (e) { console.warn('[AssemblyScanner] inject error:', e); }
    });
  }

  /* ============ НАБЛЮДЕНИЕ ЗА #content ============ */

  let contentObserver = null;

  function startObserver() {
    if (contentObserver) return;

    const content = document.getElementById('content');
    if (!content) {
      setTimeout(startObserver, 300);
      return;
    }

    contentObserver = new MutationObserver(() => {
      // Не инжектим, если окно сканера открыто (не важно)
      scheduleInject();
    });
    contentObserver.observe(content, { childList: true, subtree: true });

    scheduleInject();
  }

  /* ============ ИНИЦИАЛИЗАЦИЯ ============ */

  function init() {
    injectStyles();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }

    // Дополнительные попытки — на случай медленной отрисовки
    setTimeout(startObserver, 500);
    setTimeout(startObserver, 2000);
    setTimeout(startObserver, 5000);

    console.log('[AssemblyScanner] Модуль инициализирован');
  }

  init();

  /* ============ ПУБЛИЧНЫЙ API ============ */

  window.spAssemblyScanner = {
    open: openOverlay,
    close: closeOverlay,
    isOpen: () => scanState.open,
    version: '1.0.0'
  };

})();
