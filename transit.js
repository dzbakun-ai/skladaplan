/* =========================================================
   SKLADAPLAN — ТРАНЗИТ (cross-dock по заявкам клиентов)
   =========================================================

   Отдельный раздел, не пересекается с public.boxes.

   Версия 1.3:
   - ФИКС: счётчики «Отсканировано» больше не «падают».
     Доверяем полю scanned_boxes, а не пересчитываем
     из массива сканов (который грузится с лимитом и мог
     терять самые старые записи при большом объёме).
   - Парсер Excel читает истинные значения ячеек (raw: true).
   - Последние 4 цифры штрихкода выделены.
   - Селектор колонки количества.
   - Кнопка «Скачать шаблон заявки».
   ========================================================= */

(function () {
  'use strict';
  if (window.spTransit) return;

  const STYLES_ID   = 'spTransitStyles';
  const PAGE_KEY    = 'transit';
  const NAV_ATTR    = 'data-transit-nav';
  const OVERLAY_ID  = 'spTrOverlay';
  const INPUT_ID    = 'spTrInput';
  const MODAL_ID    = 'spTrModal';

  const DEFAULT_UNITS_PER_BOX = 4;

  /* =========================================================
     СОСТОЯНИЕ
     ========================================================= */

  const tr = {
    requests: [],
    loadingList: false,

    currentRequestId: null,
    current: null,
    loadingCurrent: false,

    scannerOpen: false,
    lastScanView: null,
    recentScans: []
  };

  /* =========================================================
     ДОСТУП К SUPABASE
     ========================================================= */

  function sb() {
    try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; } catch (e) {}
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  function operatorEmail() {
    try { if (typeof state !== 'undefined' && state?.user?.email) return state.user.email; } catch (e) {}
    if (window.state?.user?.email) return window.state.user.email;
    return null;
  }

  /* =========================================================
     УТИЛИТЫ
     ========================================================= */

  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /*
    Возвращает HTML для штрихкода, в котором последние 4 цифры
    визуально выделены (темнее и жирнее) — удобно проверять
    глазами при сканировании.
  */
  function barcodeHtml(bc) {
    const s = String(bc == null ? '' : bc);
    if (s.length <= 4) {
      return `<span class="sp-tr-bc-suffix">${esc(s)}</span>`;
    }
    const prefix = s.slice(0, s.length - 4);
    const suffix = s.slice(-4);
    return `<span class="sp-tr-bc-prefix">${esc(prefix)}</span><span class="sp-tr-bc-suffix">${esc(suffix)}</span>`;
  }

  function toastMsg(msg, type) {
    try { if (typeof toast === 'function') return toast(msg, type || 'success'); } catch (e) {}
    if (typeof window.toast === 'function') return window.toast(msg, type || 'success');
    console.log('[Transit]', msg);
  }

  function normBarcode(v) {
    try { if (typeof normalizeBarcode === 'function') return normalizeBarcode(v); } catch (e) {}
    return String(v == null ? '' : v).replace(/\D/g, '');
  }

  function normText(v) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  }

  function toNum(v) {
    if (v == null || v === '') return 0;
    const n = Number(String(v).replace(',', '.').trim());
    return isFinite(n) ? n : 0;
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch (e) { return iso; }
  }

  function fmtDate(d) {
    if (!d) return '';
    try {
      const dt = new Date(d);
      const p = n => String(n).padStart(2, '0');
      return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
    } catch (e) { return d; }
  }

  function ceilBoxes(units, perBox) {
    const u = toNum(units);
    const b = toNum(perBox) || DEFAULT_UNITS_PER_BOX;
    if (b <= 0) return 0;
    return Math.ceil(u / b);
  }

  function nowTime() {
    return new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  /* =========================================================
     ЗВУК
     ========================================================= */

  function beep(success) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = success ? 1000 : 250;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (success ? 0.12 : 0.25));
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.13 : 0.26));
    } catch (e) {}
  }

  /* =========================================================
     ЗАГРУЗКА ДАННЫХ
     ========================================================= */

  async function loadRequests() {
    const client = sb();
    if (!client) return;
    tr.loadingList = true;

    try {
      const { data, error } = await client
        .from('transit_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      tr.requests = Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('[Transit] loadRequests error:', e);
      toastMsg('Не удалось загрузить заявки: ' + (e.message || ''), 'error');
      tr.requests = [];
    } finally {
      tr.loadingList = false;
    }
  }

  async function loadRequest(id) {
    const client = sb();
    if (!client) return null;
    tr.loadingCurrent = true;

    try {
      const [reqRes, itemsRes, scansRes] = await Promise.all([
        client.from('transit_requests').select('*').eq('id', id).maybeSingle(),
        client.from('transit_request_items').select('*').eq('request_id', id).order('position_order', { ascending: true }).order('id', { ascending: true }),
        /* Берём только 50 последних сканов — их достаточно
           для отображения «недавних операций». Полная история
           больше не нужна: счётчики считаем из scanned_boxes. */
        client.from('transit_scans').select('*').eq('request_id', id).order('scanned_at', { ascending: false }).limit(50)
      ]);

      if (reqRes.error) throw reqRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (scansRes.error) throw scansRes.error;

      tr.current = {
        request: reqRes.data,
        items: Array.isArray(itemsRes.data) ? itemsRes.data : [],
        scans: Array.isArray(scansRes.data) ? scansRes.data : []
      };
      tr.currentRequestId = id;
      return tr.current;
    } catch (e) {
      console.error('[Transit] loadRequest error:', e);
      toastMsg('Не удалось загрузить заявку: ' + (e.message || ''), 'error');
      return null;
    } finally {
      tr.loadingCurrent = false;
    }
  }

  function recalcScannedFromScans(items, scans) {
    /*
      ВАЖНО: доверяем полю scanned_boxes, а НЕ пересчитываем
      из массива scans. Причина: scans грузится с лимитом,
      и по мере накопления старые записи в выборку не попадают —
      счётчик начинал «падать». scanned_boxes обновляется при
      каждом скане в processScan и всегда актуален.
    */
    return items.map(it => ({
      ...it,
      scanned_boxes: Number(it.scanned_boxes) || 0
    }));
  }

  /* =========================================================
     CRUD
     ========================================================= */

  async function createRequest({ client_name, request_name, request_date, comment, items }) {
    const client = sb();
    if (!client) throw new Error('Supabase недоступен');

    const op = operatorEmail();

    const { data: reqRow, error: reqErr } = await client
      .from('transit_requests')
      .insert({
        client_name,
        request_name,
        request_date: request_date || new Date().toISOString().slice(0, 10),
        comment: comment || null,
        status: 'active',
        created_by: op,
        updated_by: op
      })
      .select('*')
      .single();

    if (reqErr) throw reqErr;

    const payload = items.map((it, i) => ({
      request_id: reqRow.id,
      barcode: it.barcode,
      article: it.article || null,
      title: it.title || null,
      units_per_box: toNum(it.units_per_box) || DEFAULT_UNITS_PER_BOX,
      requested_units: toNum(it.requested_units) || 0,
      position_order: i
    }));

    if (payload.length) {
      const { error: itemsErr } = await client
        .from('transit_request_items')
        .insert(payload);
      if (itemsErr) {
        await client.from('transit_requests').delete().eq('id', reqRow.id);
        throw itemsErr;
      }
    }

    return reqRow;
  }

  async function deleteRequest(id) {
    const client = sb();
    if (!client) throw new Error('Supabase недоступен');
    const { error } = await client.from('transit_requests').delete().eq('id', id);
    if (error) throw error;
  }

  async function archiveRequest(id, status) {
    const client = sb();
    if (!client) throw new Error('Supabase недоступен');
    const { error } = await client
      .from('transit_requests')
      .update({
        status: status,
        updated_at: new Date().toISOString(),
        updated_by: operatorEmail()
      })
      .eq('id', id);
    if (error) throw error;
  }

  async function updateItemUnits(id, units_per_box) {
    const client = sb();
    if (!client) throw new Error('Supabase недоступен');
    const { error } = await client
      .from('transit_request_items')
      .update({
        units_per_box: toNum(units_per_box) || DEFAULT_UNITS_PER_BOX,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) throw error;
  }

  /* =========================================================
     ПАРСЕР ТЕКСТА
     ========================================================= */

  function parseBarcodeText(raw) {
    const lines = String(raw || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = [];
    let skipped = 0;

    for (const line of lines) {
      const parts = line.split(/\t|\s{2,}|;|\|/).map(p => p.trim()).filter(p => p !== '');
      if (parts.length < 2) { skipped++; continue; }

      const barcode = normBarcode(parts[0]);
      if (!barcode) { skipped++; continue; }

      const qty = toNum(parts[parts.length - 1]);
      if (qty <= 0) { skipped++; continue; }

      rows.push({
        barcode,
        article: parts[1] && !/^\d+$/.test(parts[1]) ? normText(parts[1]) : '',
        title: parts[2] ? normText(parts[2]) : '',
        requested_units: qty
      });
    }

    return { rows, skipped };
  }

  /* =========================================================
     ПАРСЕР EXCEL — шаг 1 (просто разобрать файл)
     ========================================================= */

  async function parseExcelFile(file) {
    if (typeof XLSX === 'undefined') throw new Error('Библиотека XLSX не загружена');

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('В файле нет листов');
    const sheet = wb.Sheets[sheetName];

    /*
      raw: true — берём ИСТИННЫЕ значения ячеек.
      Иначе Excel-числа вроде 4810122736840 превращаются
      в строку «4.81E+12» и штрихкод портится.
    */
    let aoa = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: false
    });

    /* Обрезаем пустой хвост */
    if (aoa.length > 1) {
      let lastIdx = aoa.length - 1;
      while (lastIdx > 0) {
        const row = aoa[lastIdx];
        const isEmpty = !row || row.every(c => c === '' || c == null || String(c).trim() === '');
        if (!isEmpty) break;
        lastIdx--;
      }
      if (lastIdx < aoa.length - 1) {
        aoa = aoa.slice(0, lastIdx + 1);
      }
    }

    if (!aoa.length) throw new Error('Файл пустой');

    let headerRow = -1;
    for (let i = 0; i < Math.min(aoa.length, 10); i++) {
      const row = aoa[i].map(c => normText(c).toLowerCase());
      if (row.some(c => /^(шк|штрихкод|barcode|баркод)$/i.test(c))) {
        headerRow = i;
        break;
      }
    }
    if (headerRow === -1) headerRow = 0;

    const headers = aoa[headerRow].map(c => normText(c).toLowerCase());
    const headersRaw = aoa[headerRow].map(c => normText(c));

    const findCol = (regexes) => {
      for (let i = 0; i < headers.length; i++) {
        for (const r of regexes) {
          if (r.test(headers[i])) return i;
        }
      }
      return -1;
    };

    const colBarcode = findCol([/^(шк|штрихкод|barcode|баркод)$/i]);
    const colArticle = findCol([/^(артикул|article|sku)/i]);
    const colTitle   = findCol([/^(название|наименование|title)/i]);
    const colChar    = findCol([/^(характеристика|описание|характер)/i]);

    if (colBarcode === -1) throw new Error('Не найдена колонка «ШК» / «Штрихкод»');

    const qtyCandidates = [];
    for (let i = 0; i < headers.length; i++) {
      if (/^(заказ|кол[- ]?во|количество)/i.test(headers[i])) {
        qtyCandidates.push({
          index: i,
          displayName: headersRaw[i] || ('Колонка ' + (i + 1))
        });
      }
    }

    if (!qtyCandidates.length) {
      throw new Error('Не найдена колонка «Заказ» / «Количество»');
    }

    return {
      aoa,
      headerRow,
      headers,
      headersRaw,
      cols: { barcode: colBarcode, article: colArticle, title: colTitle, char: colChar },
      qtyCandidates,
      sheetName
    };
  }

  /* =========================================================
     ПАРСЕР EXCEL — шаг 2
     ========================================================= */

  function extractExcelRows(parsed, qtyColIndex) {
    const { aoa, headerRow, cols } = parsed;
    const rows = [];
    let skipped = 0;

    let lastArticle = '';
    let lastName = '';

    for (let i = headerRow + 1; i < aoa.length; i++) {
      const r = aoa[i];
      if (!r) continue;

      const isCompletelyEmpty = r.every(c => c === '' || c == null || String(c).trim() === '');
      if (isCompletelyEmpty) continue;

      const barcode = normBarcode(r[cols.barcode]);

      if (!barcode) {
        const rowJoined = r.map(c => String(c == null ? '' : c)).join(' ').toLowerCase();
        if (/итог|total/.test(rowJoined)) continue;
        skipped++;
        continue;
      }

      const qty = toNum(r[qtyColIndex]);
      if (qty <= 0) { skipped++; continue; }

      let article = cols.article >= 0 ? normText(r[cols.article]) : '';
      let title =
        (cols.title >= 0 ? normText(r[cols.title]) : '') ||
        (cols.char  >= 0 ? normText(r[cols.char])  : '');

      if (cols.title >= 0) {
        if (!title) title = lastName;
        else lastName = title;
      }
      if (article) lastArticle = article;
      else article = lastArticle;

      rows.push({
        barcode,
        article,
        title,
        requested_units: qty
      });
    }

    return { rows, skipped };
  }

  /* =========================================================
     СТИЛИ
     ========================================================= */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      .sp-tr-page {
        max-width: 1180px;
        margin: 0 auto;
        padding-bottom: 40px;
      }

      .sp-tr-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }
      .sp-tr-head h2 {
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 750;
        color: #0f172a;
      }
      .sp-tr-head .sp-muted {
        font-size: 13px;
        color: #64748b;
      }

      .sp-tr-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 0;
        border-radius: 10px;
        padding: 11px 18px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: background .15s ease, transform .1s ease;
      }
      .sp-tr-btn:active { transform: scale(.98); }
      .sp-tr-btn-primary {
        background: var(--primary, #2563EB);
        color: #fff;
      }
      .sp-tr-btn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      .sp-tr-btn-secondary {
        background: #fff;
        color: #334155;
        border: 1px solid #cbd5e1;
      }
      .sp-tr-btn-secondary:hover { background: #f8fafc; }
      .sp-tr-btn-danger {
        background: #fff;
        color: #b42318;
        border: 1px solid #fecaca;
      }
      .sp-tr-btn-danger:hover { background: #fef2f2; }

      .sp-tr-requests {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
        gap: 12px;
      }
      .sp-tr-request {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 16px 18px;
        cursor: pointer;
        transition: border-color .15s ease, box-shadow .15s ease, transform .1s ease;
      }
      .sp-tr-request:hover {
        border-color: #93c5fd;
        box-shadow: 0 6px 20px rgba(37,99,235,.08);
        transform: translateY(-1px);
      }
      .sp-tr-request-title {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sp-tr-request-meta {
        font-size: 12px;
        color: #64748b;
        margin-bottom: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sp-tr-request-status {
        display: inline-block;
        padding: 3px 9px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .02em;
      }
      .sp-tr-status-active   { background: #dbeafe; color: #1e40af; }
      .sp-tr-status-done     { background: #dcfce7; color: #166534; }
      .sp-tr-status-archived { background: #f1f5f9; color: #64748b; }

      .sp-tr-request-progress {
        margin-top: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: #475569;
        font-variant-numeric: tabular-nums;
      }
      .sp-tr-request-progress b { color: #0f172a; }
      .sp-tr-progress-bar {
        flex: 1;
        height: 8px;
        background: #f1f5f9;
        border-radius: 999px;
        overflow: hidden;
      }
      .sp-tr-progress-fill {
        height: 100%;
        background: var(--primary, #2563EB);
        border-radius: 999px;
        transition: width .25s ease;
      }
      .sp-tr-progress-fill.is-done { background: #18794e; }

      .sp-tr-empty {
        padding: 60px 20px;
        text-align: center;
        color: #94a3b8;
        font-size: 14px;
        background: #fff;
        border: 1px dashed #e2e8f0;
        border-radius: 14px;
      }

      .sp-tr-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 0;
        background: transparent;
        color: #475569;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        padding: 6px 10px 6px 0;
        cursor: pointer;
        margin-bottom: 8px;
      }
      .sp-tr-back:hover { color: #0f172a; }

      .sp-tr-req-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .sp-tr-req-title {
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 750;
        color: #0f172a;
      }
      .sp-tr-req-sub {
        font-size: 13px;
        color: #64748b;
      }

      .sp-tr-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 14px;
      }
      .sp-tr-kpi {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 12px 14px;
      }
      .sp-tr-kpi-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .03em;
        color: #94a3b8;
        margin-bottom: 4px;
      }
      .sp-tr-kpi-value {
        font-size: 22px;
        font-weight: 800;
        color: #0f172a;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .sp-tr-kpi-value.is-done { color: #18794e; }

      .sp-tr-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }

      .sp-tr-items-wrap {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        overflow: hidden;
        margin-bottom: 16px;
      }
      .sp-tr-items-head {
        padding: 12px 16px;
        background: #fafbfc;
        border-bottom: 1px solid #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .sp-tr-items-head b {
        font-size: 13px;
        color: #0f172a;
      }
      .sp-tr-items-table {
        width: 100%;
        border-collapse: collapse;
      }
      .sp-tr-items-table th,
      .sp-tr-items-table td {
        padding: 10px 12px;
        text-align: left;
        font-size: 13px;
        border-bottom: 1px solid #f1f5f9;
      }
      .sp-tr-items-table th {
        background: #f8fafc;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: #475569;
        white-space: nowrap;
      }
      .sp-tr-items-table tr:last-child td { border-bottom: 0; }

      .sp-tr-bc {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        white-space: nowrap;
      }
      .sp-tr-bc-prefix {
        color: #64748b;
        font-weight: 500;
      }
      .sp-tr-bc-suffix {
        color: #0f172a;
        font-weight: 800;
        letter-spacing: .02em;
      }

      .sp-tr-items-table .sp-tr-num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .sp-tr-items-table .sp-tr-progress-cell {
        width: 180px;
      }
      .sp-tr-item-progress {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .sp-tr-item-progress-bar {
        flex: 1;
        min-width: 60px;
        height: 6px;
        background: #f1f5f9;
        border-radius: 999px;
        overflow: hidden;
      }
      .sp-tr-item-progress-fill {
        height: 100%;
        background: var(--primary, #2563EB);
        border-radius: 999px;
        transition: width .25s ease;
      }
      .sp-tr-item-progress-fill.is-done { background: #18794e; }

      .sp-tr-units-edit {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .sp-tr-units-edit input {
        width: 52px;
        border: 1px solid #dfe3e8;
        border-radius: 7px;
        padding: 5px 7px;
        font-size: 12px;
        font-family: inherit;
        text-align: right;
        outline: none;
      }
      .sp-tr-units-edit input:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }

      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        background: #f8fafc;
        z-index: 100060;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: inherit;
      }
      #${OVERLAY_ID} .sp-tr-ov-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        background: #fff;
        border-bottom: 1px solid #e2e8f0;
        flex-shrink: 0;
      }
      #${OVERLAY_ID} .sp-tr-ov-title {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${OVERLAY_ID} .sp-tr-ov-close {
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
      #${OVERLAY_ID} .sp-tr-ov-close:hover { background: #e5e5e5; }

      #${OVERLAY_ID} .sp-tr-ov-body {
        flex: 1;
        overflow-y: auto;
        padding: 14px 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      #${OVERLAY_ID} .sp-tr-ov-scan {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 12px 14px;
      }
      #${OVERLAY_ID} .sp-tr-ov-label {
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
      #${INPUT_ID}::placeholder { color: #94a3b8; font-weight: 500; }

      #${OVERLAY_ID} .sp-tr-ov-last {
        margin-top: 10px;
        min-height: 22px;
        font-size: 14px;
        line-height: 1.4;
        color: #64748b;
        font-weight: 600;
        word-break: break-word;
      }
      #${OVERLAY_ID} .sp-tr-ov-last.is-ok  { color: #18794e; }
      #${OVERLAY_ID} .sp-tr-ov-last.is-err { color: #b42318; }
      #${OVERLAY_ID} .sp-tr-ov-last-extra {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: #64748b;
        margin-top: 3px;
      }

      #${OVERLAY_ID} .sp-tr-ov-progress {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 12px 14px;
      }
      #${OVERLAY_ID} .sp-tr-ov-progress-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        color: #475569;
        margin-bottom: 6px;
      }
      #${OVERLAY_ID} .sp-tr-ov-progress-row:last-child { margin-bottom: 0; }
      #${OVERLAY_ID} .sp-tr-ov-progress-row b {
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }

      #${OVERLAY_ID} .sp-tr-ov-list {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        overflow: hidden;
      }
      #${OVERLAY_ID} .sp-tr-ov-list-head {
        padding: 10px 14px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: #64748b;
        border-bottom: 1px solid #f1f5f9;
        background: #fafbfc;
      }
      #${OVERLAY_ID} .sp-tr-ov-list-body {
        max-height: 280px;
        overflow-y: auto;
      }
      #${OVERLAY_ID} .sp-tr-ov-item {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 9px 14px;
        font-size: 13px;
        border-bottom: 1px solid #f8fafc;
      }
      #${OVERLAY_ID} .sp-tr-ov-item:last-child { border-bottom: 0; }
      #${OVERLAY_ID} .sp-tr-ov-item.is-done { background: #f0fdf4; }
      #${OVERLAY_ID} .sp-tr-ov-title-cell {
        color: #64748b;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${OVERLAY_ID} .sp-tr-ov-num {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        color: #0f172a;
        white-space: nowrap;
      }
      #${OVERLAY_ID} .sp-tr-ov-num.is-done { color: #18794e; }

      #${OVERLAY_ID} .sp-tr-ov-empty {
        padding: 16px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
      }

      #${OVERLAY_ID} .sp-tr-ov-foot {
        padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
        background: #fff;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      #${OVERLAY_ID} .sp-tr-ov-foot .sp-tr-btn { flex: 1; justify-content: center; }

      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15,23,42,.55);
        z-index: 100070;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-tr-modal {
        background: #fff;
        border-radius: 16px;
        width: 100%; max-width: 780px;
        max-height: 92vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-tr-modal-head {
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0;
      }
      #${MODAL_ID} h3 {
        margin: 0; font-size: 17px; font-weight: 700;
      }
      #${MODAL_ID} .sp-tr-modal-close {
        border: 0; background: #f3f3f3;
        width: 34px; height: 34px;
        border-radius: 50%; cursor: pointer;
        font-size: 20px; line-height: 1; color: #444;
      }
      #${MODAL_ID} .sp-tr-modal-body {
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      #${MODAL_ID} .sp-tr-field { display: block; }
      #${MODAL_ID} .sp-tr-field > span {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 5px;
      }
      #${MODAL_ID} .sp-tr-field input,
      #${MODAL_ID} .sp-tr-field textarea,
      #${MODAL_ID} .sp-tr-field select {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dfe3e8;
        border-radius: 9px;
        padding: 10px 12px;
        font-size: 13px;
        outline: none;
        background: #fff;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-tr-field input:focus,
      #${MODAL_ID} .sp-tr-field textarea:focus,
      #${MODAL_ID} .sp-tr-field select:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${MODAL_ID} .sp-tr-field textarea {
        min-height: 140px;
        resize: vertical;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 12px;
      }
      #${MODAL_ID} .sp-tr-grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      #${MODAL_ID} .sp-tr-source-tabs {
        display: flex;
        gap: 6px;
        padding: 4px;
        background: #f1f5f9;
        border-radius: 10px;
      }
      #${MODAL_ID} .sp-tr-source-tab {
        flex: 1;
        border: 0;
        background: transparent;
        padding: 9px 12px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-tr-source-tab.is-active {
        background: #fff;
        color: #0f172a;
        box-shadow: 0 1px 3px rgba(15,23,42,.08);
      }
      #${MODAL_ID} .sp-tr-preview {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        overflow: hidden;
        max-height: 240px;
        overflow-y: auto;
      }
      #${MODAL_ID} .sp-tr-preview table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      #${MODAL_ID} .sp-tr-preview th,
      #${MODAL_ID} .sp-tr-preview td {
        padding: 7px 10px;
        border-bottom: 1px solid #f1f5f9;
        text-align: left;
      }
      #${MODAL_ID} .sp-tr-preview th {
        background: #f8fafc;
        font-size: 10px;
        text-transform: uppercase;
        color: #64748b;
        font-weight: 700;
        letter-spacing: .04em;
        position: sticky;
        top: 0;
      }
      #${MODAL_ID} .sp-tr-preview-summary {
        padding: 8px 12px;
        background: #f8fafc;
        font-size: 12px;
        color: #475569;
        border-radius: 8px;
      }
      #${MODAL_ID} .sp-tr-modal-foot {
        padding: 12px 20px 16px;
        display: flex; gap: 8px; justify-content: flex-end;
        border-top: 1px solid #eef1f4; background: #fafbfc;
        flex-shrink: 0;
      }
      #${MODAL_ID} .sp-tr-err {
        padding: 10px 12px;
        background: #fef2f2;
        color: #991b1b;
        border-radius: 8px;
        font-size: 12px;
      }

      @media (max-width: 640px) {
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-tr-modal {
          max-width: none; height: 100vh; max-height: 100vh; border-radius: 0;
        }
        #${MODAL_ID} .sp-tr-grid2 { grid-template-columns: 1fr; }
        .sp-tr-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .sp-tr-items-table th:nth-child(2),
        .sp-tr-items-table td:nth-child(2),
        .sp-tr-items-table th:nth-child(3),
        .sp-tr-items-table td:nth-child(3) {
          display: none;
        }
        #${OVERLAY_ID} .sp-tr-ov-list-body { max-height: none; }
      }
    `;
    document.head.appendChild(style);
  }

  /* =========================================================
     РЕНДЕР — СПИСОК ЗАЯВОК
     ========================================================= */

  async function renderListPage() {
    const content = document.getElementById('content');
    if (!content) return;

    markSidebarActive();

    const pt = document.getElementById('pageTitle');
    const h = document.getElementById('heading');
    if (pt) pt.textContent = 'Транзит';
    if (h) h.textContent = 'Заявки клиентов (кросс-док)';

    if (!tr.requests.length && !tr.loadingList) {
      await loadRequests();
    }

    const progressMap = new Map();
    if (tr.requests.length) {
      try {
        const client = sb();
        if (client) {
          const ids = tr.requests.map(r => r.id);
          const { data, error } = await client
            .from('transit_request_items')
            .select('request_id, requested_units, units_per_box, scanned_boxes')
            .in('request_id', ids);
          if (!error && Array.isArray(data)) {
            data.forEach(it => {
              const k = it.request_id;
              if (!progressMap.has(k)) progressMap.set(k, { total: 0, done: 0 });
              const p = progressMap.get(k);
              p.total += ceilBoxes(it.requested_units, it.units_per_box);
              p.done  += Number(it.scanned_boxes) || 0;
            });
          }
        }
      } catch (e) {
        console.warn('[Transit] progress aggregate error:', e);
      }
    }

    let html = `
      <div class="sp-tr-page">
        <div class="sp-tr-head">
          <div>
            <h2>Транзит</h2>
            <div class="sp-muted">Заявки клиентов. Приёмка без постановки в основную базу.</div>
          </div>
          <button type="button" class="sp-tr-btn sp-tr-btn-primary" id="spTrNewRequestBtn">
            + Новая заявка
          </button>
        </div>
    `;

    if (tr.loadingList) {
      html += `<div class="sp-tr-empty">Загрузка заявок…</div>`;
    } else if (!tr.requests.length) {
      html += `
        <div class="sp-tr-empty">
          Заявок пока нет.<br>
          <span style="font-size:12px;">Нажмите «+ Новая заявка» — можно вставить данные из Excel или из текста.</span>
        </div>
      `;
    } else {
      html += `<div class="sp-tr-requests">`;
      for (const req of tr.requests) {
        const pr = progressMap.get(req.id) || { total: 0, done: 0 };
        const pct = pr.total ? Math.min(100, Math.round(pr.done / pr.total * 100)) : 0;
        const done = pr.total > 0 && pr.done >= pr.total;
        html += `
          <div class="sp-tr-request" data-request-id="${esc(req.id)}">
            <div class="sp-tr-request-title">${esc(req.client_name)}</div>
            <div class="sp-tr-request-meta">
              ${esc(req.request_name)}
              · ${esc(fmtDate(req.request_date))}
            </div>
            <span class="sp-tr-request-status sp-tr-status-${esc(req.status)}">
              ${req.status === 'active' ? 'Активна'
                : req.status === 'done' ? 'Выполнена'
                : 'Архив'}
            </span>
            <div class="sp-tr-request-progress">
              <div class="sp-tr-progress-bar">
                <div class="sp-tr-progress-fill ${done ? 'is-done' : ''}" style="width:${pct}%"></div>
              </div>
              <span><b>${pr.done}</b> / ${pr.total}</span>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`;
    content.innerHTML = html;

    document.getElementById('spTrNewRequestBtn')?.addEventListener('click', () => openCreateModal());

    content.querySelectorAll('[data-request-id]').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-request-id');
        openRequestPage(Number(id));
      });
    });
  }

  /* =========================================================
     РЕНДЕР — ЭКРАН ЗАЯВКИ
     ========================================================= */

  async function renderRequestPage() {
    const content = document.getElementById('content');
    if (!content) return;

    markSidebarActive();

    const req = tr.current?.request;
    if (!req) {
      content.innerHTML = `
        <div class="sp-tr-page">
          <button class="sp-tr-back" id="spTrBackBtn">← Назад</button>
          <div class="sp-tr-empty">Заявка не найдена</div>
        </div>
      `;
      document.getElementById('spTrBackBtn')?.addEventListener('click', () => backToList());
      return;
    }

    const items = recalcScannedFromScans(tr.current.items, tr.current.scans);

    const pt = document.getElementById('pageTitle');
    const h = document.getElementById('heading');
    if (pt) pt.textContent = req.client_name;
    if (h) h.textContent = 'Транзит — заявка';

    let totalBoxes = 0, doneBoxes = 0;
    items.forEach(it => {
      totalBoxes += ceilBoxes(it.requested_units, it.units_per_box);
      doneBoxes  += Number(it.scanned_boxes) || 0;
    });
    const totalPct = totalBoxes ? Math.min(100, Math.round(doneBoxes / totalBoxes * 100)) : 0;
    const isDone = totalBoxes > 0 && doneBoxes >= totalBoxes;

    let html = `
      <div class="sp-tr-page">
        <button class="sp-tr-back" id="spTrBackBtn">← Все заявки</button>

        <div class="sp-tr-req-head">
          <div>
            <h2 class="sp-tr-req-title">${esc(req.client_name)}</h2>
            <div class="sp-tr-req-sub">
              ${esc(req.request_name)} · ${esc(fmtDate(req.request_date))}
              · создана ${esc(fmtDateTime(req.created_at))}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="sp-tr-btn sp-tr-btn-secondary" id="spTrArchiveBtn">
              ${req.status === 'archived' ? 'Вернуть в работу' : 'В архив'}
            </button>
            <button type="button" class="sp-tr-btn sp-tr-btn-danger" id="spTrDeleteBtn">
              Удалить
            </button>
          </div>
        </div>

        <div class="sp-tr-kpis">
          <div class="sp-tr-kpi">
            <div class="sp-tr-kpi-label">Позиций</div>
            <div class="sp-tr-kpi-value">${items.length}</div>
          </div>
          <div class="sp-tr-kpi">
            <div class="sp-tr-kpi-label">Коробок план</div>
            <div class="sp-tr-kpi-value">${totalBoxes}</div>
          </div>
          <div class="sp-tr-kpi">
            <div class="sp-tr-kpi-label">Отсканировано</div>
            <div class="sp-tr-kpi-value ${isDone ? 'is-done' : ''}">${doneBoxes}</div>
          </div>
          <div class="sp-tr-kpi">
            <div class="sp-tr-kpi-label">Прогресс</div>
            <div class="sp-tr-kpi-value ${isDone ? 'is-done' : ''}">${totalPct}%</div>
            <div class="sp-tr-progress-bar" style="margin-top:8px;">
              <div class="sp-tr-progress-fill ${isDone ? 'is-done' : ''}" style="width:${totalPct}%"></div>
            </div>
          </div>
        </div>

        <div class="sp-tr-actions">
          <button type="button" class="sp-tr-btn sp-tr-btn-primary" id="spTrScanBtn">
            📷 Сканировать
          </button>
          <button type="button" class="sp-tr-btn sp-tr-btn-secondary" id="spTrExportBtn">
            ⬇ Экспорт CSV
          </button>
        </div>

        <div class="sp-tr-items-wrap">
          <div class="sp-tr-items-head">
            <b>Позиции заявки (${items.length})</b>
            <span class="sp-muted" style="font-size:12px;">По умолчанию 4 шт/коробка — можно править</span>
          </div>
          <table class="sp-tr-items-table">
            <thead>
              <tr>
                <th style="width:140px;">Штрихкод</th>
                <th>Название</th>
                <th class="sp-tr-num" style="width:80px;">Штук</th>
                <th class="sp-tr-num" style="width:100px;">В коробке</th>
                <th class="sp-tr-num" style="width:80px;">Коробок</th>
                <th class="sp-tr-progress-cell">Отсканировано</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (!items.length) {
      html += `<tr><td colspan="6" style="text-align:center;color:#94a3b8;">Позиций нет</td></tr>`;
    } else {
      items.forEach(it => {
        const planned = ceilBoxes(it.requested_units, it.units_per_box);
        const scanned = Number(it.scanned_boxes) || 0;
        const pct = planned ? Math.min(100, Math.round(scanned / planned * 100)) : 0;
        const done = planned > 0 && scanned >= planned;
        html += `
          <tr data-item-id="${esc(it.id)}">
            <td class="sp-tr-bc">${barcodeHtml(it.barcode)}</td>
            <td>${esc(it.title || it.article || '')}</td>
            <td class="sp-tr-num">${esc(it.requested_units)}</td>
            <td class="sp-tr-num">
              <span class="sp-tr-units-edit">
                <input type="number" min="1" step="1" value="${esc(it.units_per_box)}"
                       data-units-input="${esc(it.id)}">
              </span>
            </td>
            <td class="sp-tr-num">${planned}</td>
            <td class="sp-tr-progress-cell">
              <div class="sp-tr-item-progress">
                <div class="sp-tr-item-progress-bar">
                  <div class="sp-tr-item-progress-fill ${done ? 'is-done' : ''}" style="width:${pct}%"></div>
                </div>
                <b>${scanned}</b> / ${planned}
              </div>
            </td>
          </tr>
        `;
      });
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    content.innerHTML = html;

    document.getElementById('spTrBackBtn')?.addEventListener('click', () => backToList());

    document.getElementById('spTrScanBtn')?.addEventListener('click', () => openScanner());

    document.getElementById('spTrExportBtn')?.addEventListener('click', exportRequestCsv);

    document.getElementById('spTrDeleteBtn')?.addEventListener('click', async () => {
      if (!confirm(`Удалить заявку «${req.client_name} — ${req.request_name}»?\n\nВсе позиции и сканы тоже удалятся.`)) return;
      try {
        await deleteRequest(req.id);
        toastMsg('Заявка удалена');
        tr.current = null;
        tr.currentRequestId = null;
        await backToList(true);
      } catch (e) {
        toastMsg('Ошибка: ' + (e.message || ''), 'error');
      }
    });

    document.getElementById('spTrArchiveBtn')?.addEventListener('click', async () => {
      const newStatus = req.status === 'archived' ? 'active' : 'archived';
      try {
        await archiveRequest(req.id, newStatus);
        toastMsg(newStatus === 'archived' ? 'Заявка в архиве' : 'Возвращена в работу');
        await openRequestPage(req.id);
      } catch (e) {
        toastMsg('Ошибка: ' + (e.message || ''), 'error');
      }
    });

    content.querySelectorAll('[data-units-input]').forEach(inp => {
      inp.addEventListener('change', async (e) => {
        const itemId = Number(e.target.getAttribute('data-units-input'));
        const value = toNum(e.target.value) || DEFAULT_UNITS_PER_BOX;
        try {
          await updateItemUnits(itemId, value);
          const it = tr.current.items.find(x => x.id === itemId);
          if (it) it.units_per_box = value;
          await renderRequestPage();
        } catch (err) {
          toastMsg('Не удалось сохранить: ' + (err.message || ''), 'error');
        }
      });
    });
  }

  /* =========================================================
     СКАНЕР
     ========================================================= */

  function openScanner() {
    if (tr.scannerOpen) return;
    if (!tr.current) return;
    if (document.getElementById(OVERLAY_ID)) return;

    tr.recentScans = [];
    tr.lastScanView = null;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="sp-tr-ov-head">
        <div class="sp-tr-ov-title">
          📷 ${esc(tr.current.request.client_name)} — сканирование
        </div>
        <button type="button" class="sp-tr-ov-close" id="spTrOvClose" aria-label="Закрыть">×</button>
      </div>
      <div class="sp-tr-ov-body">
        <div class="sp-tr-ov-scan">
          <div class="sp-tr-ov-label">Сканируйте штрихкод</div>
          <input id="${INPUT_ID}" type="text" inputmode="none"
                 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                 placeholder="Сканируйте штрихкод...">
          <div class="sp-tr-ov-last" id="spTrOvLast"></div>
        </div>
        <div class="sp-tr-ov-progress" id="spTrOvProgress"></div>
        <div class="sp-tr-ov-list" id="spTrOvList"></div>
      </div>
      <div class="sp-tr-ov-foot">
        <button type="button" class="sp-tr-btn sp-tr-btn-secondary" id="spTrOvClose2">
          Закрыть
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    tr.scannerOpen = true;

    document.getElementById('spTrOvClose')?.addEventListener('click', closeScanner);
    document.getElementById('spTrOvClose2')?.addEventListener('click', closeScanner);

    document.addEventListener('keydown', onScannerKeydown);

    renderScannerProgress();
    renderScannerItemsList();
    refocusInput();

    const input = document.getElementById(INPUT_ID);
    input?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      const value = input.value;
      input.value = '';
      processScan(value);
    });

    setTimeout(() => refocusInput(), 60);
  }

  function closeScanner() {
    if (!tr.scannerOpen) return;
    tr.scannerOpen = false;

    document.removeEventListener('keydown', onScannerKeydown);

    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();

    if (tr.currentRequestId) {
      renderRequestPage();
    }
  }

  function onScannerKeydown(e) {
    if (e.key === 'Escape' && tr.scannerOpen) {
      e.preventDefault();
      closeScanner();
    }
  }

  function refocusInput() {
    const input = document.getElementById(INPUT_ID);
    if (!input) return;
    setTimeout(() => {
      try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (_) {} }
    }, 30);
  }

  function renderScannerProgress() {
    const el = document.getElementById('spTrOvProgress');
    if (!el || !tr.current) return;

    const items = recalcScannedFromScans(tr.current.items, tr.current.scans);
    let total = 0, done = 0;
    items.forEach(it => {
      total += ceilBoxes(it.requested_units, it.units_per_box);
      done  += Number(it.scanned_boxes) || 0;
    });
    const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;

    el.innerHTML = `
      <div class="sp-tr-ov-progress-row">
        <span>Прогресс по заявке</span>
        <b>${done} / ${total} (${pct}%)</b>
      </div>
      <div class="sp-tr-progress-bar">
        <div class="sp-tr-progress-fill ${done >= total && total > 0 ? 'is-done' : ''}" style="width:${pct}%"></div>
      </div>
    `;
  }

  function renderScannerItemsList() {
    const el = document.getElementById('spTrOvList');
    if (!el || !tr.current) return;

    const items = recalcScannedFromScans(tr.current.items, tr.current.scans);

    if (!items.length) {
      el.innerHTML = `<div class="sp-tr-ov-empty">В заявке нет позиций</div>`;
      return;
    }

    el.innerHTML = `
      <div class="sp-tr-ov-list-head">Позиции заявки</div>
      <div class="sp-tr-ov-list-body">
        ${items.map(it => {
          const planned = ceilBoxes(it.requested_units, it.units_per_box);
          const scanned = Number(it.scanned_boxes) || 0;
          const done = planned > 0 && scanned >= planned;
          return `
            <div class="sp-tr-ov-item ${done ? 'is-done' : ''}">
              <span class="sp-tr-bc">${barcodeHtml(it.barcode)}</span>
              <span class="sp-tr-ov-title-cell">${esc(it.title || it.article || '')}</span>
              <span class="sp-tr-ov-num ${done ? 'is-done' : ''}">${scanned} / ${planned}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function setLastScanView(data) {
    tr.lastScanView = data;
    const el = document.getElementById('spTrOvLast');
    if (!el) return;
    if (!data) {
      el.className = 'sp-tr-ov-last';
      el.textContent = '';
      return;
    }
    el.className = 'sp-tr-ov-last ' + (data.ok ? 'is-ok' : 'is-err');
    const extra = data.extra
      ? `<span class="sp-tr-ov-last-extra">${esc(data.extra)}</span>`
      : '';
    el.innerHTML = esc(data.message) + extra;
  }

  async function processScan(rawBarcode) {
    const raw = String(rawBarcode || '').trim();
    if (!raw) { refocusInput(); return; }

    const barcode = normBarcode(raw);
    if (!barcode) {
      beep(false);
      setLastScanView({ ok: false, message: 'Пустой штрихкод' });
      refocusInput();
      return;
    }

    if (!tr.current) {
      beep(false);
      setLastScanView({ ok: false, message: 'Заявка не открыта' });
      refocusInput();
      return;
    }

    const items = recalcScannedFromScans(tr.current.items, tr.current.scans);

    const item = items.find(it => normBarcode(it.barcode) === barcode);

    if (!item) {
      beep(false);
      setLastScanView({
        ok: false,
        message: `${barcode} — не в заявке`
      });
      tr.recentScans.unshift({ barcode, ok: false, message: 'Не в заявке', time: nowTime() });
      if (tr.recentScans.length > 6) tr.recentScans.length = 6;
      refocusInput();
      return;
    }

    const planned = ceilBoxes(item.requested_units, item.units_per_box);
    const scanned = Number(item.scanned_boxes) || 0;

    if (planned > 0 && scanned >= planned) {
      beep(false);
      setLastScanView({
        ok: false,
        message: `${barcode} — уже отсканировано полностью`,
        extra: `${item.title || ''} · ${scanned} / ${planned}`
      });
      tr.recentScans.unshift({ barcode, ok: false, message: 'Сверх плана', time: nowTime() });
      if (tr.recentScans.length > 6) tr.recentScans.length = 6;
      refocusInput();
      return;
    }

    try {
      const client = sb();
      if (!client) throw new Error('Supabase недоступен');

      const { data: scanRow, error: scanErr } = await client
        .from('transit_scans')
        .insert({
          request_id: tr.current.request.id,
          item_id: item.id,
          barcode: barcode,
          direction: tr.current.request.client_name,
          operator_email: operatorEmail()
        })
        .select('*')
        .single();

      if (scanErr) throw scanErr;

      tr.current.scans.unshift(scanRow);
      if (tr.current.scans.length > 50) tr.current.scans.length = 50;

      const newCount = scanned + 1;
      await client
        .from('transit_request_items')
        .update({ scanned_boxes: newCount, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      const localItem = tr.current.items.find(x => x.id === item.id);
      if (localItem) localItem.scanned_boxes = newCount;

      beep(true);
      setLastScanView({
        ok: true,
        message: `✓ ${barcode} — ${newCount} / ${planned}`,
        extra: item.title || item.article || ''
      });
      tr.recentScans.unshift({ barcode, ok: true, message: `${newCount}/${planned}`, time: nowTime() });
      if (tr.recentScans.length > 6) tr.recentScans.length = 6;

      renderScannerProgress();
      renderScannerItemsList();

    } catch (e) {
      console.error('[Transit] scan error:', e);
      beep(false);
      setLastScanView({
        ok: false,
        message: 'Ошибка записи скана',
        extra: e.message || ''
      });
    }

    refocusInput();
  }

  /* =========================================================
     МОДАЛКА СОЗДАНИЯ ЗАЯВКИ
     ========================================================= */

  let createState = {
    source: 'text',
    parsed: [],
    parsedSkipped: 0,
    filename: '',
    excelParsed: null,
    selectedQtyColumn: null
  };

  function openCreateModal() {
    if (document.getElementById(MODAL_ID)) return;

    createState = {
      source: 'text',
      parsed: [],
      parsedSkipped: 0,
      filename: '',
      excelParsed: null,
      selectedQtyColumn: null
    };

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-tr-modal">
        <div class="sp-tr-modal-head">
          <h3>Новая заявка</h3>
          <button type="button" class="sp-tr-modal-close" id="spTrModalClose">×</button>
        </div>
        <div class="sp-tr-modal-body">
          <div class="sp-tr-grid2">
            <label class="sp-tr-field">
              <span>Клиент *</span>
              <input id="spTrClientName" type="text" placeholder="Например: 21 век">
            </label>
            <label class="sp-tr-field">
              <span>Название заявки *</span>
              <input id="spTrRequestName" type="text" placeholder="Например: акция КПБ Бязь">
            </label>
          </div>
          <div class="sp-tr-grid2">
            <label class="sp-tr-field">
              <span>Дата заявки</span>
              <input id="spTrRequestDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
            </label>
            <label class="sp-tr-field">
              <span>Комментарий</span>
              <input id="spTrComment" type="text" placeholder="Необязательно">
            </label>
          </div>

          <div class="sp-tr-source-tabs">
            <button type="button" class="sp-tr-source-tab is-active" data-src="text">
              📋 Вставить из Excel
            </button>
            <button type="button" class="sp-tr-source-tab" data-src="excel">
              📁 Загрузить файл
            </button>
          </div>

          <div id="spTrSourceText">
            <label class="sp-tr-field">
              <span>Позиции (по одной в строке: ШК &lt;TAB&gt; Артикул &lt;TAB&gt; Название &lt;TAB&gt; Кол-во)</span>
              <textarea id="spTrTextInput" placeholder="4810122736840	453372	Восточная роскошь	150
4810122736857		Комплект 2-сп	750"></textarea>
            </label>
            <button type="button" class="sp-tr-btn sp-tr-btn-secondary" id="spTrParseTextBtn">
              ↻ Разобрать
            </button>
          </div>

          <div id="spTrSourceExcel" style="display:none;">
            <label class="sp-tr-field">
              <span>Excel-файл (лист с колонками: ШК, Артикул, Название/Характеристика, Заказ)</span>
              <input id="spTrExcelFile" type="file" accept=".xlsx,.xls">
            </label>

            <div id="spTrQtyColumnWrap" style="display:none;margin-top:10px;">
              <label class="sp-tr-field">
                <span>Колонка с количеством</span>
                <select id="spTrQtyColumnSelect"></select>
              </label>
            </div>

            <button type="button" class="sp-tr-btn sp-tr-btn-secondary" id="spTrDownloadTemplateBtn"
                    style="margin-top:12px;">
              📋 Скачать шаблон заявки
            </button>
          </div>

          <div id="spTrPreviewWrap" style="display:none;">
            <div class="sp-tr-preview-summary" id="spTrPreviewSummary"></div>
            <div class="sp-tr-preview" style="margin-top:10px;">
              <table>
                <thead>
                  <tr>
                    <th style="width:140px;">ШК</th>
                    <th>Название</th>
                    <th style="width:90px;text-align:right;">Кол-во</th>
                  </tr>
                </thead>
                <tbody id="spTrPreviewBody"></tbody>
              </table>
            </div>
          </div>

          <div id="spTrModalError"></div>
        </div>
        <div class="sp-tr-modal-foot">
          <button type="button" class="sp-tr-btn sp-tr-btn-secondary" id="spTrModalCancel">Отмена</button>
          <button type="button" class="sp-tr-btn sp-tr-btn-primary" id="spTrModalSave" disabled>Создать заявку</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#spTrModalClose')?.addEventListener('click', closeCreateModal);
    overlay.querySelector('#spTrModalCancel')?.addEventListener('click', closeCreateModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCreateModal(); });

    document.addEventListener('keydown', onCreateKeydown);

    overlay.querySelectorAll('[data-src]').forEach(tab => {
      tab.addEventListener('click', () => {
        const src = tab.getAttribute('data-src');
        createState.source = src;
        overlay.querySelectorAll('[data-src]').forEach(t => t.classList.toggle('is-active', t === tab));
        document.getElementById('spTrSourceText').style.display  = src === 'text'  ? '' : 'none';
        document.getElementById('spTrSourceExcel').style.display = src === 'excel' ? '' : 'none';
      });
    });

    document.getElementById('spTrParseTextBtn')?.addEventListener('click', () => {
      const raw = document.getElementById('spTrTextInput').value;
      const { rows, skipped } = parseBarcodeText(raw);
      createState.parsed = rows;
      createState.parsedSkipped = skipped;
      renderCreatePreview();
    });

    document.getElementById('spTrExcelFile')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = await parseExcelFile(file);
        createState.excelParsed = parsed;
        createState.filename = file.name;

        const wrap = document.getElementById('spTrQtyColumnWrap');
        const sel = document.getElementById('spTrQtyColumnSelect');

        if (parsed.qtyCandidates.length > 1) {
          wrap.style.display = '';
          sel.innerHTML = parsed.qtyCandidates.map(c =>
            `<option value="${c.index}">${esc(c.displayName)}</option>`
          ).join('');
          sel.value = parsed.qtyCandidates[0].index;
          sel.onchange = () => applyExcelColumn(Number(sel.value));
        } else {
          wrap.style.display = 'none';
        }

        applyExcelColumn(parsed.qtyCandidates[0].index);

      } catch (err) {
        console.error('[Transit] parse excel error:', err);
        showModalError(err.message || 'Не удалось прочитать файл');
      }
    });

    document.getElementById('spTrDownloadTemplateBtn')?.addEventListener('click', downloadTransitTemplate);

    document.getElementById('spTrModalSave')?.addEventListener('click', saveNewRequest);
  }

  function applyExcelColumn(qtyColIndex) {
    if (!createState.excelParsed) return;
    const { rows, skipped } = extractExcelRows(createState.excelParsed, qtyColIndex);
    createState.parsed = rows;
    createState.parsedSkipped = skipped;
    createState.selectedQtyColumn = qtyColIndex;
    renderCreatePreview();
  }

  function closeCreateModal() {
    document.removeEventListener('keydown', onCreateKeydown);
    document.getElementById(MODAL_ID)?.remove();
  }

  function onCreateKeydown(e) {
    if (e.key === 'Escape' && document.getElementById(MODAL_ID)) {
      e.preventDefault();
      closeCreateModal();
    }
  }

  function showModalError(msg) {
    const el = document.getElementById('spTrModalError');
    if (el) el.innerHTML = `<div class="sp-tr-err">${esc(msg)}</div>`;
  }

  function renderCreatePreview() {
    const rows = createState.parsed;

    const wrap = document.getElementById('spTrPreviewWrap');
    const body = document.getElementById('spTrPreviewBody');
    const summary = document.getElementById('spTrPreviewSummary');
    const saveBtn = document.getElementById('spTrModalSave');

    if (!rows.length) {
      if (wrap) wrap.style.display = 'none';
      if (saveBtn) saveBtn.disabled = true;
      return;
    }

    if (wrap) wrap.style.display = '';
    if (saveBtn) saveBtn.disabled = false;

    const totalBoxes = rows.reduce((s, r) => s + ceilBoxes(r.requested_units, DEFAULT_UNITS_PER_BOX), 0);
    const totalUnits = rows.reduce((s, r) => s + toNum(r.requested_units), 0);

    if (summary) {
      summary.innerHTML = `
        Позиций: <b>${rows.length}</b>
        · Всего штук: <b>${totalUnits}</b>
        · Коробок (при 4 шт/кор): <b>${totalBoxes}</b>
        ${createState.parsedSkipped > 0 ? `· Пропущено строк: <b>${createState.parsedSkipped}</b>` : ''}
      `;
    }

    if (body) {
      body.innerHTML = rows.slice(0, 200).map(r => `
        <tr>
          <td class="sp-tr-bc">${barcodeHtml(r.barcode)}</td>
          <td>${esc(r.title || r.article || '')}</td>
          <td style="text-align:right;">${esc(r.requested_units)}</td>
        </tr>
      `).join('') + (rows.length > 200
        ? `<tr><td colspan="3" style="text-align:center;color:#94a3b8;">… ещё ${rows.length - 200}</td></tr>`
        : '');
    }
  }

  async function saveNewRequest() {
    const client_name  = (document.getElementById('spTrClientName')?.value || '').trim();
    const request_name = (document.getElementById('spTrRequestName')?.value || '').trim();
    const request_date = document.getElementById('spTrRequestDate')?.value || new Date().toISOString().slice(0, 10);
    const comment      = (document.getElementById('spTrComment')?.value || '').trim();

    if (!client_name)  { showModalError('Укажите клиента'); return; }
    if (!request_name) { showModalError('Укажите название заявки'); return; }
    if (!createState.parsed.length) { showModalError('Сначала разберите позиции'); return; }

    const btn = document.getElementById('spTrModalSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Создание…'; }

    try {
      await createRequest({
        client_name,
        request_name,
        request_date,
        comment,
        items: createState.parsed
      });
      closeCreateModal();
      toastMsg('Заявка создана');
      await loadRequests();
      await renderListPage();
    } catch (e) {
      console.error('[Transit] create error:', e);
      showModalError('Ошибка: ' + (e.message || ''));
      if (btn) { btn.disabled = false; btn.textContent = 'Создать заявку'; }
    }
  }

  /* =========================================================
     СКАЧАТЬ ШАБЛОН ЗАЯВКИ
     ========================================================= */

  function downloadTransitTemplate() {
    if (typeof XLSX === 'undefined') {
      toastMsg('Библиотека XLSX не загружена', 'error');
      return;
    }

    const aoa = [
      ['ШК', 'Артикул', 'Название', 'Заказ'],
      ['4810122736840', '453372', 'Восточная роскошь', 150],
      ['4810122736857', '', '', 750],
      ['4810122736864', '474601', 'Василиса', 350]
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 14 },
      { wch: 30 },
      { wch: 12 }
    ];

    for (let r = 0; r < aoa.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[ref]) {
        ws[ref].t = 's';
        ws[ref].z = '@';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Заявка');

    const helpRows = [
      ['Как заполнять заявку'],
      [''],
      ['Колонка', 'Что писать'],
      ['ШК', 'Обязательно. Только цифры. 13 знаков. Если Excel превращает в 4.81E+12 — установите текстовый формат для колонки.'],
      ['Артикул', 'Необязательно. Если у нескольких строк одинаковый — можно заполнить только первую, остальные оставить пустыми.'],
      ['Название', 'Необязательно. Действует то же правило наследования: если пусто, берётся из строки выше.'],
      ['Заказ', 'Обязательно. Целое число — сколько штук нужно.'],
      [''],
      ['Пример с наследованием:'],
      ['В строке 2 указаны «Артикул 453372 / Восточная роскошь»,'],
      ['в строке 3 оба поля пустые — они автоматически унаследуются от строки 2.']
    ];
    const wsHelp = XLSX.utils.aoa_to_sheet(helpRows);
    wsHelp['!cols'] = [{ wch: 16 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsHelp, 'Как заполнять');

    XLSX.writeFile(wb, 'shablon-zayavki-transit.xlsx');
    toastMsg('Шаблон скачан');
  }

  /* =========================================================
     ЭКСПОРТ CSV
     ========================================================= */

  function exportRequestCsv() {
    if (!tr.current) return;
    const req = tr.current.request;
    const items = recalcScannedFromScans(tr.current.items, tr.current.scans);

    const header = ['Штрихкод', 'Артикул', 'Название', 'Штук', 'В коробке', 'Коробок план', 'Отсканировано'];
    const rows = items.map(it => {
      const planned = ceilBoxes(it.requested_units, it.units_per_box);
      return [
        it.barcode,
        it.article || '',
        it.title || '',
        it.requested_units,
        it.units_per_box,
        planned,
        it.scanned_boxes
      ];
    });

    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transit-${req.client_name}-${req.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toastMsg('Экспортировано');
  }

  /* =========================================================
     НАВИГАЦИЯ
     ========================================================= */

  async function openListPage() {
    tr.current = null;
    tr.currentRequestId = null;
    await loadRequests();
    await renderListPage();
  }

  async function openRequestPage(id) {
    const data = await loadRequest(id);
    if (!data) return;
    await renderRequestPage();
  }

  async function backToList(forceReload) {
    if (forceReload) await loadRequests();
    await renderListPage();
  }

  /* =========================================================
     SIDEBAR
     ========================================================= */

  function insertSidebarItem() {
    if (document.querySelector(`.nav[${NAV_ATTR}]`)) return;

    const sidebarNav = document.querySelector('.sidebar-nav');
    if (!sidebarNav) return;

    const baseNav = sidebarNav.querySelector('.nav[data-page="base"]');
    const anchor = baseNav || sidebarNav.querySelector('.nav[data-page="assembly"]');
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav';
    btn.setAttribute(NAV_ATTR, '1');
    btn.innerHTML = `
      <span class="nav-icon"><svg class="icon"><use href="#icon-box-arrow"></use></svg></span>
      <span class="nav-label">Транзит</span>
    `;

    btn.addEventListener('click', () => {
      try {
        if (typeof state !== 'undefined') {
          state.currentPage = PAGE_KEY;
          state.activeTool = '';
        }
      } catch (e) {}

      openListPage();
    });

    anchor.insertAdjacentElement('afterend', btn);
  }

  function markSidebarActive() {
    document.querySelectorAll('.nav').forEach(b => b.classList.remove('active'));
    const mine = document.querySelector(`.nav[${NAV_ATTR}]`);
    if (mine) mine.classList.add('active');

    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  }

  /* =========================================================
     ХУК
     ========================================================= */

  function installRenderHook() {
    if (typeof window.render !== 'function') return false;
    if (window.render.__transitWrapped) return true;

    const orig = window.render;
    window.render = function () {
      const result = orig.apply(this, arguments);
      try {
        if (window.state?.currentPage === PAGE_KEY) {
          /* Ничего */
        }
      } catch (e) {}
      return result;
    };
    window.render.__transitWrapped = true;
    return true;
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function init() {
    injectStyles();

    const start = () => {
      insertSidebarItem();
      installRenderHook();

      const sidebarObserver = new MutationObserver(() => {
        try { insertSidebarItem(); } catch (e) {}
      });
      const sidebarNav = document.querySelector('.sidebar-nav');
      if (sidebarNav) {
        sidebarObserver.observe(sidebarNav, { childList: true });
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }

    setTimeout(start, 500);
    setTimeout(start, 2000);
    setTimeout(start, 5000);

    console.log('[Transit] Модуль инициализирован');
  }

  init();

  window.spTransit = {
    open: openListPage,
    openRequest: openRequestPage,
    version: '1.3.0'
  };

})();