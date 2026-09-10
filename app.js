/* =========================================================
   SKLADAPLAN
   Local WMS / Supabase
   ========================================================= */

'use strict';


/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL =
  'https://ithhecprdosvjiddoalq.supabase.co';

const SUPABASE_KEY =
  'sb_publishable_0dB5DQt2_ysOohx42IN4rA_mnypLeOR';

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


/* =========================================================
   CONFIG
   ========================================================= */

const PAGE_SIZE = 100;


/*
  Большой Excel:

  1000 строк за один INSERT.
  До 3 пачек одновременно.

  Если Supabase не принимает пачку,
  она автоматически дробится.
*/
const EXCEL_CHUNK_SIZE = 1000;
const EXCEL_PARALLEL_CHUNKS = 3;
const EXCEL_MIN_FALLBACK_CHUNK = 50;


const BOX_SELECT =
  'id,' +
  'barcode:"Штрихкод",' +
  'article:"Артикул",' +
  'quantity_in_box:"Кол-во в коробке",' +
  'zone_row:"Зона/ряд",' +
  'pallet:"Поддон",' +
  'status:"Статус",' +
  'direction:"Направление",' +
  'date:"ДатаРазмещения",' +
  'warehouse:"Склад",' +
  'worker:"Изменил",' +
  'warehouse_id,' +
  'location_id,' +
  'pallet_id,' +
  'created_at,' +
  'updated_at';


const STATUSES = {

  STOCK: 'На складе',

  RESERVED: 'Зарезервирована',

  PICK: 'КПодбору',

  COLLECTED: 'Скомплектовано',

  SHIPPED: 'Отгружено',

  EMPTY: 'Пустая'

};


/* =========================================================
   STATE
   ========================================================= */

const state = {

  boxes: [],


  /* =======================================================
     RECEIVING
     ======================================================= */

  receivingWarehouses: [],
  receivingLocations: [],
  receivingPallets: [],

  receivingWarehouseId: null,
  receivingLocationId: null,
  receivingPalletId: null,

  receivingReceiptId: null,
  receivingReceiptStatus: null,

  receivingPalletNumber: '',
  receivingScannerInput: '',

  receivingScannedIds: [],
  receivingRecentScans: [],

  receivingScanning: false,
  receivingLoading: false,

  receivingDataLoading: false,
  receivingDataLoaded: false,
  receivingDataError: '',


  /* =======================================================
     GENERAL
     ======================================================= */

  loading: false,

  currentPage: 'dashboard',

  basePage: 1,

 baseSearch: '',
baseWarehouse: '',
baseZone: '',
basePallet: '',
baseStatus: '',
baseDirection: '',

selectedIds: new Set(),

/*
  Ручная комплектация.

  assemblySelectedGroups
  = выбранные целиком группы.

  assemblySelectedIds
  = конкретные физические коробки.

  assemblyExpandedGroups
  = раскрытые группы с детализацией.
*/
assemblySelectedGroups: new Set(),
assemblySelectedIds: new Set(),
assemblyExpandedGroups: new Set(),
  editingId: null,

  currentPallet: '',

  scannerInput: '',

  scannerActive: false,


  /* =======================================================
     EXCEL
     ======================================================= */

  excelRows: [],

  excelFileName: '',

  excelSheetName: '',

  excelHeaders: [],

  excelImporting: false,

  excelImportCancelled: false,

  excelImportStartedAt: null,

  excelImportImported: 0,

  excelImportFailed: 0,

  excelImportProcessed: 0,

  excelImportTotal: 0,


  /* =======================================================
     USER / SESSION
     ======================================================= */

  user: null,

  session: null,


  /* =======================================================
     COMPARISON
     ======================================================= */

  comparisonRows: [],

  comparisonFileName: '',

  comparisonLoaded: false,

  comparisonLoading: false,

  comparisonError: '',

  comparisonMode: 'units',


  /* =======================================================
     INVENTORY
     ======================================================= */

  activeTool: '',

inventory: {
  mode: 'setup',

  warehouse: '',
  zone: '',
  pallet: '',

  expectedIds: new Set(),
  scannedIds: new Set(),

  /*
    Существующие коробки,
    которые физически найдены
    вне выбранного паллета.
  */
  outsideIds: new Set(),

  /*
    Неизвестные физические коробки.

    ВАЖНО:
    здесь именно Array, а не Set.

    Один и тот же barcode может
    физически встретиться несколько раз.
  */
  unknownBarcodes: [],

  lastScan: null,
  recentScans: [],

  startedAt: null,
  finishedAt: null,

  result: null,

  message: '',
  messageType: 'success'
}

};

/* =========================================================
   HELPERS
   ========================================================= */

function $(selector) {

  return document.querySelector(selector);

}


function $all(selector) {

  return [...document.querySelectorAll(selector)];

}


function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {

    return '';

  }


  return String(value)

    .replaceAll('&', '&amp;')

    .replaceAll('<', '&lt;')

    .replaceAll('>', '&gt;')

    .replaceAll('"', '&quot;')

    .replaceAll("'", '&#039;');

}


function normalizeText(value) {

  return String(value ?? '')

    .trim()

    .replace(/\s+/g, ' ');

}

function normalizeBarcode(value) {

  if (
    value === null ||
    value === undefined
  ) {

    return '';

  }


  /*
    ВАЖНО:

    Штрихкод нельзя обрабатывать
    через Number(), потому что 13-значный
    код может потерять точность.

    Поэтому сначала работаем только
    со строкой.
  */

  let str =
    String(value).trim();


  if (!str) {

    return '';

  }


  str =
    str.replace(/\s+/g, '');


  /*
    Excel иногда использует запятую
    вместо точки.
  */

  str =
    str.replace(',', '.');


  /*
    Обычный вариант:

    4810122595003.0
    4810122595003,0

    превращаем в:

    4810122595003
  */

  if (
    /^\d+\.0+$/.test(str)
  ) {

    str =
      str.split('.')[0];

  }


  /*
    Научная запись Excel:

    4.810122595003E+12

    ВАЖНО:

    Здесь НЕ используем Number().

    Восстанавливаем строку
    математически из отдельных цифр.
  */

  const scientificMatch =
    str.match(
      /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/
    );


  if (
    scientificMatch
  ) {

    const integerPart =
      scientificMatch[1] || '';


    const decimalPart =
      scientificMatch[2] || '';


    const exponent =
      parseInt(
        scientificMatch[3],
        10
      );


    const digits =
      integerPart +
      decimalPart;


    const decimalPosition =
      integerPart.length +
      exponent;


    if (
      decimalPosition >=
      digits.length
    ) {

      str =
        digits +
        '0'.repeat(
          decimalPosition -
          digits.length
        );

    } else if (
      decimalPosition > 0
    ) {

      str =
        digits.slice(
          0,
          decimalPosition
        );

    } else {

      str =
        '0.' +
        '0'.repeat(
          Math.abs(
            decimalPosition
          )
        ) +
        digits;

    }

  }


  /*
    Если осталась десятичная часть,
    состоящая только из нулей —
    убираем её.
  */

  if (
    /^\d+\.0+$/.test(str)
  ) {

    str =
      str.split('.')[0];

  }


  /*
    Финальная очистка.

    Штрихкод должен содержать
    только цифры.
  */

  str =
    str.replace(
      /[^0-9]/g,
      ''
    );


  return str;

}


function normalizeHeader(value) {

  return String(value ?? '')

    .replace(/^\uFEFF/, '')

    .trim()

    .toLowerCase()

    .replace(/\s+/g, '')

    .replace(/[\/\\_.-]/g, '')

    .replace(/ё/g, 'е');

}


function formatDate(value) {

  if (!value) {

    return '';

  }


  const str =
    String(value).trim();


  if (!str) {

    return '';

  }


  /*
    ISO:

    2026-06-25
    2026-06-25T00:00:00
  */

  const iso =
    str.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );


  if (iso) {

    return `${iso[3]}.${iso[2]}.${iso[1]}`;

  }


  /*
    DD.MM.YYYY
  */

  const ru =
    str.match(
      /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/
    );


  if (ru) {

    let year =
      ru[3];


    if (
      year.length === 2
    ) {

      year =
        `20${year}`;

    }


    return `${String(ru[1]).padStart(2, '0')}.${String(ru[2]).padStart(2, '0')}.${year}`;

  }


  return str;

}


function toISODate(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return null;

  }


  if (
    value instanceof Date
  ) {

    if (
      Number.isNaN(
        value.getTime()
      )
    ) {

      return null;

    }


    return value
      .toISOString()
      .slice(0, 10);

  }


  const str =
    String(value).trim();


  if (!str) {

    return null;

  }


  /*
    Excel serial date.
  */

  if (
    /^\d+(\.\d+)?$/.test(str) &&
    Number(str) > 20000 &&
    Number(str) < 80000
  ) {

    const serial =
      Number(str);


    const date =
      new Date(
        Date.UTC(1899, 11, 30) +
        serial * 86400000
      );


    return date
      .toISOString()
      .slice(0, 10);

  }


  /*
    DD.MM.YYYY
  */

  let match =
    str.match(
      /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/
    );


  if (match) {

    let year =
      match[3];


    if (
      year.length === 2
    ) {

      year =
        `20${year}`;

    }


    return `${year}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;

  }


  /*
    YYYY-MM-DD
  */

  match =
    str.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/
    );


  if (match) {

    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;

  }


  const parsed =
    new Date(str);


  if (
    !Number.isNaN(
      parsed.getTime()
    )
  ) {

    return parsed
      .toISOString()
      .slice(0, 10);

  }


  return null;

}


function excelBoolean(value) {

  if (
    value === true ||
    value === 1
  ) {

    return true;

  }


  const str =
    String(value ?? '')
      .trim()
      .toLowerCase();


  return [

    'true',
    'истина',
    'да',
    '1',
    'yes',
    'y',
    '✓',
    '✔',
    'истинно'

  ].includes(str);

}


function downloadBlob(
  blob,
  fileName
) {

  const url =
    URL.createObjectURL(blob);


  const a =
    document.createElement('a');


  a.href =
    url;

  a.download =
    fileName;


  document.body.appendChild(a);

  a.click();

  a.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );

}


function downloadJSON(
  data,
  fileName
) {

  const blob =
    new Blob(
      [
        JSON.stringify(
          data,
          null,
          2
        )
      ],
      {
        type:
          'application/json;charset=utf-8'
      }
    );


  downloadBlob(
    blob,
    fileName
  );

}


function todayFileDate() {

  return new Date()
    .toISOString()
    .slice(0, 10);

}


/* =========================================================
   TOAST
   ========================================================= */

function toast(
  message,
  type = 'success'
) {

  let container =
    $('#toastContainer');


  if (!container) {

    container =
      document.createElement('div');


    container.id =
      'toastContainer';


    container.style.cssText = `
      position:fixed;
      right:20px;
      bottom:20px;
      z-index:99999;
      display:flex;
      flex-direction:column;
      gap:10px;
      max-width:380px;
    `;


    document.body.appendChild(
      container
    );

  }


  const item =
    document.createElement('div');


  item.style.cssText = `
    padding:13px 16px;
    border-radius:12px;
    background:${type === 'error' ? '#b42318' : '#111'};
    color:#fff;
    box-shadow:0 10px 30px rgba(0,0,0,.2);
    font-size:14px;
    line-height:1.4;
  `;


  item.textContent =
    message;


  container.appendChild(
    item
  );


  setTimeout(
    () => item.remove(),
    4000
  );

}


/* =========================================================
   STYLES
   ========================================================= */

function ensureAppStyles() {

  if (
    $('#skladaplanRuntimeStyles')
  ) {

    return;

  }


  const style =
    document.createElement('style');


  style.id =
    'skladaplanRuntimeStyles';


  style.textContent = `

    .sp-loading {
      padding:40px;
      text-align:center;
      color:#777;
    }

    .sp-grid {
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
      gap:14px;
      margin-bottom:20px;
    }

    .sp-card {
      background:#fff;
      border:1px solid #e8e8e8;
      border-radius:16px;
      padding:18px;
      box-shadow:0 4px 18px rgba(0,0,0,.04);
    }

    .sp-card-label {
      color:#777;
      font-size:13px;
      margin-bottom:8px;
    }

    .sp-card-value {
      font-size:28px;
      font-weight:700;
    }

    .sp-toolbar {
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      align-items:center;
      margin-bottom:16px;
    }

    .sp-toolbar input,
    .sp-toolbar select,
    .sp-toolbar button,
    .sp-form input,
    .sp-form select {
      min-height:40px;
      border:1px solid #ddd;
      border-radius:9px;
      padding:0 12px;
      background:#fff;
    }

    .sp-toolbar input {
      min-width:240px;
    }

    .sp-btn {
      border:0;
      border-radius:9px;
      padding:10px 15px;
      cursor:pointer;
      font-weight:600;
      background:#111;
      color:#fff;
    }

    .sp-btn.secondary {
      background:#f2f2f2;
      color:#111;
    }

    .sp-btn.danger {
      background:#b42318;
    }

    .sp-btn.success {
      background:#18794e;
    }

    .sp-btn:disabled {
      opacity:.45;
      cursor:not-allowed;
    }

    .sp-table-wrap {
      width:100%;
      overflow:auto;
      background:#fff;
      border:1px solid #e7e7e7;
      border-radius:14px;
    }

    .sp-table {
      width:100%;
      border-collapse:collapse;
      min-width:900px;
    }

    .sp-table th,
    .sp-table td {
      padding:11px 12px;
      border-bottom:1px solid #eee;
      text-align:left;
      white-space:nowrap;
      font-size:13px;
    }

    .sp-table th {
      background:#f8f8f8;
      font-weight:700;
      position:sticky;
      top:0;
      z-index:2;
    }

    .sp-table tr.selected {
      background:#f1f7ff;
    }

    .sp-table tr:hover {
      background:#fafafa;
    }

    .sp-status {
      display:inline-flex;
      align-items:center;
      padding:5px 9px;
      border-radius:999px;
      background:#f1f1f1;
      font-size:12px;
      font-weight:600;
    }

    .sp-pagination {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      padding:15px 0;
    }

    .sp-pagination-buttons {
      display:flex;
      gap:7px;
    }

    .sp-modal-backdrop {
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.5);
      z-index:9990;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
    }

    .sp-modal {
      background:#fff;
      width:min(650px,100%);
      max-height:90vh;
      overflow:auto;
      border-radius:18px;
      padding:22px;
      box-shadow:0 25px 80px rgba(0,0,0,.25);
    }

    .sp-modal-head {
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:20px;
    }

    .sp-modal-close {
      border:0;
      background:none;
      font-size:24px;
      cursor:pointer;
    }

    .sp-form {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:14px;
    }

    .sp-form label {
      display:flex;
      flex-direction:column;
      gap:6px;
      font-size:13px;
      font-weight:600;
    }

    .sp-form .full {
      grid-column:1 / -1;
    }

    .sp-form-actions {
      grid-column:1 / -1;
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:8px;
    }

    .sp-login {
      position:fixed;
      inset:0;
      background:#f5f5f5;
      z-index:100000;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
    }

    .sp-login-box {
      width:min(420px,100%);
      background:#fff;
      padding:30px;
      border-radius:20px;
      box-shadow:0 20px 60px rgba(0,0,0,.12);
    }

    .sp-login-logo {
      width:48px;
      height:48px;
      border-radius:14px;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#111;
      color:#fff;
      font-size:24px;
      font-weight:700;
      margin-bottom:18px;
    }

    .sp-login h2 {
      margin:0 0 6px;
    }

    .sp-login p {
      color:#777;
      margin:0 0 22px;
    }

    .sp-login label {
      display:block;
      margin-bottom:14px;
      font-size:13px;
      font-weight:600;
    }

    .sp-login input {
      display:block;
      width:100%;
      box-sizing:border-box;
      height:44px;
      border:1px solid #ddd;
      border-radius:10px;
      padding:0 12px;
      margin-top:6px;
    }

    .sp-login button {
      width:100%;
      height:44px;
      border:0;
      border-radius:10px;
      background:#111;
      color:#fff;
      font-weight:700;
      cursor:pointer;
    }

    .sp-import-preview {
      max-height:450px;
      overflow:auto;
      border:1px solid #eee;
      border-radius:10px;
      margin-top:15px;
    }

    .sp-import-preview table {
      width:100%;
      border-collapse:collapse;
      font-size:12px;
    }

    .sp-import-preview th,
    .sp-import-preview td {
      padding:8px;
      border-bottom:1px solid #eee;
      white-space:nowrap;
    }

    .sp-scanner {
      display:grid;
      gap:16px;
    }

    .sp-scanner-input {
      width:100%;
      box-sizing:border-box;
      height:60px;
      border:2px solid #ddd;
      border-radius:14px;
      font-size:22px;
      padding:0 16px;
    }

    .sp-pallet {
      padding:15px;
      background:#f7f7f7;
      border-radius:14px;
    }

    .sp-big-number {
      font-size:40px;
      font-weight:800;
    }

    .sp-muted {
      color:#777;
    }

    .sp-empty {
      padding:35px;
      text-align:center;
      color:#777;
    }

    /* =========================================
       EXCEL IMPORT PROGRESS
       ========================================= */

    .sp-import-progress {
      display:grid;
      gap:18px;
    }

    .sp-import-progress-title {
      font-size:18px;
      font-weight:700;
    }

    .sp-import-percent {
      font-size:42px;
      font-weight:800;
      line-height:1;
    }

    .sp-import-progress-bar {
      width:100%;
      height:12px;
      background:#ededed;
      border-radius:999px;
      overflow:hidden;
    }

    .sp-import-progress-fill {
      height:100%;
      width:0%;
      background:#111;
      border-radius:999px;
      transition:width .2s ease;
    }

    .sp-import-stats {
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:10px;
    }

    .sp-import-stat {
      padding:12px;
      background:#f7f7f7;
      border-radius:10px;
    }

    .sp-import-stat-label {
      font-size:12px;
      color:#777;
      margin-bottom:5px;
    }

    .sp-import-stat-value {
      font-size:18px;
      font-weight:700;
    }

    .sp-import-message {
      padding:12px 14px;
      background:#f7f7f7;
      border-radius:10px;
      font-size:13px;
      color:#555;
    }

    @media(max-width:700px) {

      .sp-form {
        grid-template-columns:1fr;
      }

      .sp-form .full {
        grid-column:auto;
      }

      .sp-toolbar input {
        width:100%;
        min-width:0;
      }

      .sp-grid {
        grid-template-columns:1fr 1fr;
      }

      .sp-card-value {
        font-size:24px;
      }

          .sp-receiving-header {
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:20px;
      flex-wrap:wrap;
    }

    .sp-receiving-form {
      display:grid;
      grid-template-columns:
        repeat(auto-fit,minmax(220px,1fr));
      gap:14px;
      margin-top:14px;
    }

    .sp-receiving-field {
      display:flex;
      flex-direction:column;
      gap:7px;
    }

    .sp-receiving-field label {
      font-size:13px;
      color:#777;
      font-weight:600;
    }

    .sp-receiving-field input,
    .sp-receiving-field select {
      width:100%;
      min-height:44px;
      box-sizing:border-box;
      border:1px solid #ddd;
      border-radius:10px;
      padding:0 12px;
      background:#fff;
      font-size:15px;
    }

    .sp-receiving-field input:focus,
    .sp-receiving-field select:focus,
    #receivingScannerInput:focus {
      outline:none;
      border-color:#999;
      box-shadow:0 0 0 3px rgba(0,0,0,.06);
    }

    @media (max-width:700px) {

      .sp-receiving-header {
        flex-direction:column;
      }

      .sp-receiving-form {
        grid-template-columns:1fr;
      }

      #receivingScannerInput {
        font-size:18px !important;
      }

    }

      .sp-import-stats {
        grid-template-columns:1fr;
      }

    }

  `;


  document.head.appendChild(
    style
  );

}

function ensureReceivingStyles() {

  if (
    $('#skladaplanReceivingStyles')
  ) {

    return;

  }


  const style =
    document.createElement('style');


  style.id =
    'skladaplanReceivingStyles';


  style.textContent = `

    /* =====================================================
       RECEIVING — APPLE STYLE
       ===================================================== */

    .sp-receiving-page {

      max-width:1180px;

      margin:0 auto;

      padding:
        8px
        0
        60px;

      color:#111;

    }


    .sp-receiving-hero {

      display:flex;

      align-items:flex-end;

      justify-content:space-between;

      gap:24px;

      margin-bottom:28px;

    }


    .sp-receiving-eyebrow {

      font-size:12px;

      font-weight:700;

      letter-spacing:.12em;

      color:#8a8a8f;

      margin-bottom:7px;

    }


    .sp-receiving-title {

      margin:0;

      font-size:34px;

      line-height:1.08;

      letter-spacing:-.035em;

      font-weight:750;

    }


    .sp-receiving-subtitle {

      margin:9px 0 0;

      color:#8a8a8f;

      font-size:14px;

      line-height:1.5;

    }


    .sp-receiving-status {

      display:inline-flex;

      align-items:center;

      gap:8px;

      padding:9px 13px;

      border-radius:999px;

      font-size:13px;

      font-weight:650;

      white-space:nowrap;

    }


    .sp-receiving-status.is-open {

      background:#eaf7ef;

      color:#167347;

    }


    .sp-receiving-status.is-closed {

      background:#f2f2f7;

      color:#6f6f74;

    }


    .sp-status-dot {

      width:7px;

      height:7px;

      border-radius:50%;

      background:currentColor;

    }


    .sp-receiving-card {

      background:#fff;

      border:
        1px solid
        rgba(0,0,0,.07);

      border-radius:22px;

      padding:24px;

      margin-top:16px;

      box-shadow:
        0 1px 2px rgba(0,0,0,.02),
        0 10px 35px rgba(0,0,0,.035);

    }


    .sp-section-header {

      display:flex;

      align-items:flex-end;

      justify-content:space-between;

      gap:20px;

      margin-bottom:22px;

    }


    .sp-section-kicker {

      color:#a0a0a5;

      font-size:11px;

      font-weight:750;

      letter-spacing:.08em;

      margin-bottom:5px;

    }


    .sp-section-header h2 {

      margin:0;

      font-size:20px;

      line-height:1.2;

      letter-spacing:-.02em;

      font-weight:700;

    }


    .sp-section-caption {

      color:#96969b;

      font-size:13px;

      text-align:right;

    }


    .sp-receiving-form {

      display:grid;

      grid-template-columns:
        1fr
        1fr
        .75fr;

      gap:14px;

    }


    .sp-receiving-field {

      display:flex;

      flex-direction:column;

      gap:8px;

    }


    .sp-receiving-field label {

      color:#77777d;

      font-size:12px;

      font-weight:650;

    }


    .sp-receiving-field select,
    .sp-receiving-field input {

      width:100%;

      height:50px;

      box-sizing:border-box;

      appearance:auto;

      border:
        1px solid
        #dedee3;

      border-radius:13px;

      background:#fff;

      color:#111;

      padding:
        0
        14px;

      font-size:15px;

      font-family:inherit;

      transition:
        border-color .15s ease,
        box-shadow .15s ease,
        background .15s ease;

      cursor:pointer;

      pointer-events:auto !important;

    }


    .sp-receiving-field input {

      cursor:text;

    }


    .sp-receiving-field select:hover,
    .sp-receiving-field input:hover {

      border-color:#bcbcc2;

    }


    .sp-receiving-field select:focus,
    .sp-receiving-field input:focus {

      outline:none;

      border-color:#8f8f95;

      box-shadow:
        0 0 0 4px
        rgba(0,0,0,.055);

    }


    .sp-receiving-field select:disabled,
    .sp-receiving-field input:disabled {

      background:#f5f5f7;

      color:#a0a0a5;

      cursor:not-allowed;

      opacity:.72;

    }


    .sp-receiving-actions {

      display:flex;

      align-items:center;

      gap:10px;

      margin-top:20px;

    }


    .sp-receiving-open-btn {

      min-height:50px;

      min-width:210px;

      display:inline-flex;

      align-items:center;

      justify-content:space-between;

      gap:24px;

      padding:
        0
        17px
        0
        19px;

      border-radius:14px;

    }


    .sp-btn-primary {

      border:0;

      background:#111;

      color:#fff;

      cursor:pointer;

      font-size:14px;

      font-weight:700;

    }


    .sp-btn-primary:hover {

      background:#222;

    }


    .sp-btn-arrow {

      font-size:18px;

      opacity:.7;

    }


    .sp-receiving-close-btn {

      min-height:48px;

      padding:
        0
        18px;

      border-radius:13px;

    }


    .sp-location-summary {

      display:grid;

      grid-template-columns:
        repeat(4,1fr);

      border:
        1px solid
        #eeeeef;

      border-radius:16px;

      overflow:hidden;

    }


    .sp-location-item {

      min-height:82px;

      padding:
        16px
        18px;

      border-right:
        1px solid
        #eeeeef;

      display:flex;

      flex-direction:column;

      justify-content:center;

      gap:5px;

    }


    .sp-location-item:last-child {

      border-right:0;

    }


    .sp-location-item span {

      font-size:11px;

      color:#98989e;

      font-weight:600;

    }


    .sp-location-item strong {

      font-size:15px;

      font-weight:700;

    }


    .sp-location-count {

      font-size:24px !important;

      letter-spacing:-.03em;

    }


    .sp-scanner-card {

      background:
        linear-gradient(
          180deg,
          #fff,
          #fcfcfd
        );

    }


    .sp-scanner-counter {

      display:flex;

      align-items:baseline;

      gap:6px;

    }


    .sp-scanner-counter strong {

      font-size:38px;

      line-height:1;

      letter-spacing:-.05em;

    }


    .sp-scanner-counter span {

      color:#929297;

      font-size:13px;

    }


    .sp-receiving-scanner {

      padding-top:4px;

    }


    .sp-receiving-scanner-input {

      display:block;

      width:100%;

      height:70px;

      box-sizing:border-box;

      border:
        2px solid
        #dedee3;

      border-radius:17px;

      padding:
        0
        20px;

      font-size:22px;

      font-weight:500;

      letter-spacing:.01em;

      background:#fff;

      color:#111;

      cursor:text;

      pointer-events:auto !important;

    }


    .sp-receiving-scanner-input:focus {

      outline:none;

      border-color:#111;

      box-shadow:
        0 0 0 5px
        rgba(0,0,0,.055);

    }


    .sp-receiving-scanner-result {

      margin-top:10px;

      min-height:42px;

      box-sizing:border-box;

      display:flex;

      align-items:center;

      padding:
        0
        14px;

      border-radius:11px;

      background:#f5f5f7;

      color:#707076;

      font-size:13px;

    }


    .sp-recent-scans {

      display:flex;

      flex-direction:column;

      gap:7px;

    }


    .sp-recent-scan {

      display:flex;

      align-items:center;

      justify-content:space-between;

      gap:20px;

      min-height:54px;

      padding:
        0
        14px;

      border-radius:12px;

      background:#f7f7f8;

    }


    .sp-recent-scan div {

      display:flex;

      align-items:center;

      gap:12px;

      min-width:0;

    }


    .sp-recent-scan strong {

      font-size:14px;

      font-weight:650;

      overflow:hidden;

      text-overflow:ellipsis;

      white-space:nowrap;

    }


    .sp-recent-scan span {

      color:#96969b;

      font-size:12px;

    }


    .sp-recent-scan time {

      color:#96969b;

      font-size:12px;

      white-space:nowrap;

    }


    .sp-empty-receiving {

      min-height:70px;

      display:flex;

      align-items:center;

      justify-content:center;

      color:#99999f;

      background:#f7f7f8;

      border-radius:13px;

      font-size:13px;

    }


    .sp-receiving-hint {

      display:flex;

      align-items:center;

      gap:14px;

      margin-top:16px;

      padding:
        17px
        18px;

      border-radius:17px;

      background:#f5f5f7;

      color:#66666c;

    }


    .sp-receiving-hint-icon {

      width:34px;

      height:34px;

      display:flex;

      align-items:center;

      justify-content:center;

      border-radius:50%;

      background:#fff;

      color:#111;

      font-size:17px;

    }


    .sp-receiving-hint strong {

      display:block;

      color:#333;

      font-size:13px;

      margin-bottom:3px;

    }


    .sp-receiving-hint span {

      display:block;

      color:#8c8c92;

      font-size:12px;

    }


    .sp-receiving-loading {

      display:flex;

      align-items:center;

      gap:10px;

      margin-top:16px;

      padding:
        13px
        15px;

      background:#f5f5f7;

      border-radius:13px;

      color:#77777d;

      font-size:13px;

    }


    .sp-receiving-spinner {

      width:14px;

      height:14px;

      border:
        2px solid
        #d5d5d9;

      border-top-color:#111;

      border-radius:50%;

      animation:
        spReceivingSpin .7s linear infinite;

    }


    @keyframes spReceivingSpin {

      to {
        transform:rotate(360deg);
      }

    }


    .sp-receiving-error {

      display:flex;

      align-items:center;

      gap:13px;

      margin-bottom:16px;

      padding:
        14px
        16px;

      border:
        1px solid
        #f0d4d1;

      border-radius:15px;

      background:#fff8f7;

      color:#8f332b;

      font-size:13px;

    }


    .sp-receiving-error > div:nth-child(2) {

      flex:1;

      line-height:1.45;

    }


    .sp-receiving-error strong {

      display:block;

      color:#7d2d26;

      margin-bottom:2px;

    }


    .sp-receiving-error-icon {

      width:30px;

      height:30px;

      flex:none;

      display:flex;

      align-items:center;

      justify-content:center;

      border-radius:50%;

      background:#f4d8d5;

      color:#8f332b;

      font-weight:800;

    }


    @media(max-width:800px) {

      .sp-receiving-page {

        padding-bottom:30px;

      }


      .sp-receiving-hero {

        align-items:flex-start;

        flex-direction:column;

      }


      .sp-receiving-title {

        font-size:30px;

      }


      .sp-receiving-form {

        grid-template-columns:1fr;

      }


      .sp-location-summary {

        grid-template-columns:
          1fr
          1fr;

      }


      .sp-location-item:nth-child(2) {

        border-right:0;

      }


      .sp-location-item:nth-child(-n+2) {

        border-bottom:
          1px solid
          #eeeeef;

      }


      .sp-section-header {

        align-items:flex-start;

        flex-direction:column;

      }


      .sp-section-caption {

        text-align:left;

      }


    }


    @media(max-width:500px) {

      .sp-receiving-card {

        padding:18px;

        border-radius:18px;

      }


      .sp-location-summary {

        grid-template-columns:1fr;

      }


      .sp-location-item {

        border-right:0;

        border-bottom:
          1px solid
          #eeeeef;

      }


      .sp-location-item:last-child {

        border-bottom:0;

      }


      .sp-receiving-open-btn {

        width:100%;

      }


      .sp-recent-scan div {

        align-items:flex-start;

        flex-direction:column;

        gap:2px;

      }

    }

  `;


  document.head.appendChild(
    style
  );

}

/* =========================================================
   AUTH UI
   ========================================================= */

function showLogin() {

  let login =
    $('#spLogin');


  if (login) {

    return;

  }


  login =
    document.createElement('div');


  login.id =
    'spLogin';


  login.className =
    'sp-login';


  login.innerHTML = `

    <div class="sp-login-box">

      <div class="sp-login-logo">
        S
      </div>

      <h2>SKLADAPLAN</h2>

      <p>
        Войдите, чтобы открыть склад.
      </p>

      <form id="loginForm">

        <label>
          Email

          <input
            id="loginEmail"
            type="email"
            autocomplete="username"
            required
          >

        </label>


        <label>
          Пароль

          <input
            id="loginPassword"
            type="password"
            autocomplete="current-password"
            required
          >

        </label>


        <button type="submit">
          Войти
        </button>

      </form>

    </div>

  `;


  document.body.appendChild(
    login
  );


  $('#loginForm')
    .addEventListener(
      'submit',
      loginUser
    );

}


async function loginUser(event) {

  event.preventDefault();


  const email =
    $('#loginEmail')
      .value
      .trim();


  const password =
    $('#loginPassword')
      .value;


  const button =
    event.target.querySelector(
      'button'
    );


  button.disabled =
    true;


  button.textContent =
    'Вход...';


  const {
    data,
    error
  } =
    await supabaseClient.auth
      .signInWithPassword({
        email,
        password
      });


  button.disabled =
    false;


  button.textContent =
    'Войти';


  if (error) {

    toast(
      error.message,
      'error'
    );

    return;

  }


  state.session =
    data.session;


  state.user =
    data.user;


  $('#spLogin')?.remove();


  await startAuthenticatedApp();

}


async function logout() {

  await supabaseClient.auth.signOut();


  state.session =
    null;


  state.user =
    null;


  state.boxes =
    [];


  state.selectedIds.clear();


  $('#content').innerHTML =
    '';


  showLogin();


  toast(
    'Вы вышли из системы'
  );

}


/* =========================================================
   SUPABASE LOAD
   ========================================================= */

async function loadBoxesFromSupabase() {

  state.loading = true;

  console.log(
    'SKLADAPLAN: начинаем полную загрузку boxes...'
  );

  try {

    const all = [];

    /*
      Загружаем по 1000 строк.
      Это позволяет получить всю базу,
      даже если в boxes десятки тысяч записей.
    */

    const pageSize = 1000;

    let from = 0;


    while (true) {

      const to =
        from +
        pageSize -
        1;


      console.log(
        `SKLADAPLAN: загрузка boxes ${from}-${to}...`
      );


      const {
        data,
        error
      } =
        await supabaseClient
          .from('boxes')
          .select(BOX_SELECT)
          .order('id', {
            ascending: true
          })
          .range(
            from,
            to
          );


      /*
        Ошибка Supabase.
      */

      if (error) {

        console.error(
          'SKLADAPLAN: ошибка загрузки boxes:',
          error
        );

        throw error;

      }


      /*
        Нет данных.
        Значит загрузка закончена.
      */

      if (
        !data ||
        data.length === 0
      ) {

        break;

      }


      /*
        Добавляем страницу
        в общий массив.
      */

      all.push(
        ...data
      );


      console.log(
        `SKLADAPLAN: получено ${data.length} строк. Всего: ${all.length}`
      );


      /*
        Если получили меньше 1000,
        это последняя страница.
      */

      if (
        data.length <
        pageSize
      ) {

        break;

      }


      /*
        Следующая страница.
      */

      from +=
        pageSize;

    }


    /*
      Сохраняем ВСЮ базу коробок
      в состояние приложения.
    */

    state.boxes =
      all;


    /*
      Проверяем существующие выбранные строки.
    */

    const existingIds =
      new Set(
        all.map(
          row =>
            String(row.id)
        )
      );


    /*
      Оставляем только те выбранные строки,
      которые действительно есть в базе.
    */

    if (
      state.selectedIds
    ) {

      state.selectedIds =
        new Set(
          [...state.selectedIds]
            .filter(
              id =>
                existingIds.has(
                  String(id)
                )
            )
        );

    }


    console.log(
      '========================================'
    );

    console.log(
      `SKLADAPLAN: база boxes полностью загружена`
    );

    console.log(
      `SKLADAPLAN: всего коробок: ${all.length}`
    );

    console.log(
      '========================================'
    );


  } catch (error) {

    console.error(
      'SKLADAPLAN: Database load error:',
      error
    );

    /*
      Передаём настоящую ошибку
      функции запуска приложения.
    */

    throw error;


  } finally {

    /*
      В любом случае снимаем состояние загрузки.
    */

    state.loading =
      false;

  }

}


/* =========================================================
   RECEIVING DATA
   ========================================================= */

/* =========================================================
   RECEIVING DATA
   ========================================================= */

async function loadReceivingData() {

  /*
    Защита от повторной параллельной загрузки.
  */

  if (
    state.receivingDataLoading
  ) {

    return;

  }


  state.receivingDataLoading =
    true;

  state.receivingDataError =
    '';


  try {

    /*
      =====================================================
      СКЛАДЫ
      =====================================================

      ВАЖНО:

      Здесь специально НЕ используем:

        .eq('is_active', true)

      Потому что нам сейчас нужно получить
      реальные записи из таблицы warehouses
      независимо от значения is_active.

      Это также защищает интерфейс от ситуации,
      когда старые/тестовые записи имеют NULL
      или другое значение в is_active.
    */

    const {
      data: warehouses,
      error: warehousesError
    } =
      await supabaseClient
        .from('warehouses')
        .select('*')
        .order('id', {
          ascending: true
        });


    if (
      warehousesError
    ) {

      throw new Error(
        `Ошибка загрузки складов: ${warehousesError.message}`
      );

    }


    /*
      =====================================================
      МЕСТА
      =====================================================

      Аналогично не фильтруем is_active.
    */

    const {
      data: locations,
      error: locationsError
    } =
      await supabaseClient
        .from('locations')
        .select('*')
        .order('warehouse_id', {
          ascending: true
        })
        .order('code', {
          ascending: true
        });


    if (
      locationsError
    ) {

      throw new Error(
        `Ошибка загрузки мест: ${locationsError.message}`
      );

    }


    /*
      =====================================================
      ПОДДОНЫ
      =====================================================
    */

    const {
      data: pallets,
      error: palletsError
    } =
      await supabaseClient
        .from('pallets')
        .select('*')
        .order('id', {
          ascending: false
        });


    if (
      palletsError
    ) {

      /*
        Поддоны не должны блокировать
        выбор склада и места.

        Поэтому показываем пустой список,
        а саму ошибку выводим в консоль.
      */

      console.warn(
        'Не удалось загрузить поддоны:',
        palletsError
      );

    }


    /*
      =====================================================
      СОХРАНЯЕМ ДАННЫЕ
      =====================================================
    */

    state.receivingWarehouses =
      Array.isArray(warehouses)
        ? warehouses
        : [];


    state.receivingLocations =
      Array.isArray(locations)
        ? locations
        : [];


    state.receivingPallets =
      Array.isArray(pallets)
        ? pallets
        : [];


    /*
      =====================================================
      ПРОВЕРКА
      =====================================================
    */

    console.log(
      'SKLADAPLAN Приёмка:',
      {
        warehouses:
          state.receivingWarehouses,

        locations:
          state.receivingLocations,

        pallets:
          state.receivingPallets
      }
    );


    /*
      =====================================================
      ВЫБИРАЕМ ПЕРВЫЙ СКЛАД
      =====================================================
    */

    if (
      !state.receivingWarehouseId &&
      state.receivingWarehouses.length
    ) {

      state.receivingWarehouseId =
        state.receivingWarehouses[0].id;

    }


    /*
      =====================================================
      ПРОВЕРЯЕМ ТЕКУЩИЙ СКЛАД
      =====================================================
    */

    const selectedWarehouse =
      state.receivingWarehouses.find(
        warehouse =>
          String(
            warehouse.id
          ) ===
          String(
            state.receivingWarehouseId
          )
      );


    if (
      !selectedWarehouse
    ) {

      state.receivingWarehouseId =
        state.receivingWarehouses.length
          ? state.receivingWarehouses[0].id
          : null;

    }


    /*
      =====================================================
      ПРОВЕРЯЕМ ТЕКУЩЕЕ МЕСТО
      =====================================================
    */

    const selectedLocation =
      state.receivingLocations.find(
        location =>
          String(
            location.id
          ) ===
          String(
            state.receivingLocationId
          )
      );


    if (
      selectedLocation &&
      String(
        selectedLocation.warehouse_id
      ) !==
      String(
        state.receivingWarehouseId
      )
    ) {

      state.receivingLocationId =
        null;

    }


    /*
      =====================================================
      ГОТОВО
      =====================================================
    */

    state.receivingDataLoaded =
      true;


    state.receivingDataError =
      '';


  } catch (error) {

    console.error(
      'Ошибка загрузки данных приёмки:',
      error
    );


    state.receivingWarehouses =
      [];

    state.receivingLocations =
      [];

    state.receivingPallets =
      [];


    state.receivingWarehouseId =
      null;

    state.receivingLocationId =
      null;

    state.receivingPalletId =
      null;


    state.receivingDataLoaded =
      false;


    state.receivingDataError =
      error.message ||
      'Не удалось загрузить данные приёмки';


    toast(
      state.receivingDataError,
      'error'
    );


  } finally {

    state.receivingDataLoading =
      false;

  }

}

/* =========================================================
   RECEIVING — СОЗДАНИЕ НОВОЙ ЗОНЫ / РЯДА
   ========================================================= */

async function createReceivingLocation() {

  const warehouseId =
    state.receivingWarehouseId;

  if (!warehouseId) {

    toast(
      'Сначала выберите склад',
      'error'
    );

    return;

  }

  const warehouse =
    state.receivingWarehouses.find(
      row =>
        String(row.id) ===
        String(warehouseId)
    );

  if (!warehouse) {

    toast(
      'Не удалось определить выбранный склад',
      'error'
    );

    return;

  }

  const code =
    prompt(
      `Новая зона / ряд для склада "${warehouse.name}"\n\nВведите название или код:`,
      ''
    );

  if (code === null) {

    return;

  }

  const cleanCode =
    normalizeText(code);

  if (!cleanCode) {

    toast(
      'Название зоны не указано',
      'error'
    );

    return;

  }

  /*
    Проверяем, нет ли уже такой зоны
    на выбранном складе.
  */

  const duplicate =
    state.receivingLocations.find(
      location =>
        String(
          location.warehouse_id
        ) ===
        String(warehouseId) &&
        normalizeText(
          location.code
        ).toLowerCase() ===
        cleanCode.toLowerCase()
    );

  if (duplicate) {

    state.receivingLocationId =
      duplicate.id;

    toast(
      `Зона "${duplicate.code}" уже существует`
    );

    render();

    return;

  }

  /*
    Для обычных кодов:

    A-04-01
    B-02-15
    СлеваНиз/10ряд

    сохраняем code целиком.

    Для структурированных адресов
    дополнительно пытаемся заполнить
    zone / row_name / place.
  */

  let zone = null;
  let rowName = null;
  let place = null;

  const structured =
    cleanCode.match(
      /^([A-Za-zА-Яа-яЁё]+)-(\d{2})-(\d{2})$/
    );

  if (structured) {

    zone =
      structured[1];

    rowName =
      structured[2];

    place =
      structured[3];

  }

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('locations')
        .insert({
          warehouse_id:
            warehouseId,

          code:
            cleanCode,

          zone:
            zone,

          row_name:
            rowName,

          place:
            place,

          is_active:
            true
        })
        .select('*')
        .single();

    if (error) {

      throw error;

    }

    /*
      Добавляем новую зону
      в локальный список.
    */

    state.receivingLocations.push(
      data
    );

    /*
      Сразу выбираем
      созданную зону.
    */

    state.receivingLocationId =
      data.id;

    /*
      Старый выбранный поддон
      больше не относится
      к новой зоне.
    */

    state.receivingPalletId =
      null;

    state.receivingPalletNumber =
      '';

    /*
      Сортируем места.
    */

    state.receivingLocations.sort(
      (a, b) => {

        if (
          Number(a.warehouse_id) !==
          Number(b.warehouse_id)
        ) {

          return (
            Number(a.warehouse_id) -
            Number(b.warehouse_id)
          );

        }

        return String(
          a.code || ''
        ).localeCompare(
          String(
            b.code || ''
          ),
          'ru',
          {
            numeric: true,
            sensitivity: 'base'
          }
        );

      }
    );

    toast(
      `Зона "${data.code}" создана`
    );

    render();

  } catch (error) {

    console.error(
      'Ошибка создания зоны:',
      error
    );

    toast(
      error?.message ||
      'Не удалось создать новую зону',
      'error'
    );

  }

}

async function getOrCreateReceivingPallet() {

  const warehouseId =
    state.receivingWarehouseId;

  const locationId =
    state.receivingLocationId;

  const palletNumber =
    normalizeText(
      state.receivingPalletNumber
    );


  if (
    !warehouseId ||
    !locationId ||
    !palletNumber
  ) {

    throw new Error(
      'Выберите склад, место и укажите номер поддона.'
    );

  }


  /*
    Сначала ищем существующий поддон.
  */

  const {
    data: existing,
    error: existingError
  } =
    await supabaseClient
      .from('pallets')
      .select('*')
      .eq(
        'warehouse_id',
        warehouseId
      )
      .eq(
        'location_id',
        locationId
      )
      .eq(
        'pallet_number',
        palletNumber
      )
      .maybeSingle();


  if (existingError) {
    throw existingError;
  }


  if (existing) {

    if (
      existing.status ===
      'Закрыт'
    ) {

      throw new Error(
        `Поддон ${palletNumber} уже закрыт. Создайте новый поддон.`
      );

    }


    return existing;

  }


  /*
    Создаём новый поддон.
  */

  const {
    data,
    error
  } =
    await supabaseClient
      .from('pallets')
      .insert({
        warehouse_id:
          warehouseId,

        location_id:
          locationId,

        pallet_number:
          palletNumber,

        status:
          'На складе'
      })
      .select('*')
      .single();


  if (error) {
    throw error;
  }


  state.receivingPallets.unshift(
    data
  );


  return data;

}

async function startReceiving() {

  if (
    state.receivingReceiptId
  ) {

    toast(
      'Приёмка уже открыта',
      'error'
    );

    return;

  }


  if (
    !state.receivingWarehouseId ||
    !state.receivingLocationId ||
    !normalizeText(
      state.receivingPalletNumber
    )
  ) {

    toast(
      'Выберите склад, место и укажите номер поддона.',
      'error'
    );

    return;

  }


  if (
    state.receivingLoading
  ) {

    return;

  }


  state.receivingLoading =
    true;


  const button =
    $('#startReceivingBtn');


  if (button) {

    button.disabled =
      true;

    button.innerHTML =
      `
        <span>
          Открываем...
        </span>

        <span class="sp-btn-arrow">
          …
        </span>
      `;

  }

  try {

    const pallet =
      await getOrCreateReceivingPallet();


    state.receivingPalletId =
      pallet.id;


    /*
      Ищем уже открытую приёмку
      для этого поддона.
    */

    const {
      data: existingReceipt,
      error: receiptSearchError
    } =
      await supabaseClient
        .from('receipts')
        .select('*')
        .eq(
          'pallet_id',
          pallet.id
        )
        .eq(
          'status',
          'В процессе'
        )
        .order('id', {
          ascending: false
        })
        .limit(1)
        .maybeSingle();


    if (receiptSearchError) {
      throw receiptSearchError;
    }


    if (existingReceipt) {

      state.receivingReceiptId =
        existingReceipt.id;

      state.receivingReceiptStatus =
        existingReceipt.status;

    } else {

      const {
        data: receipt,
        error
      } =
        await supabaseClient
          .from('receipts')
          .insert({

            warehouse_id:
              state.receivingWarehouseId,

            location_id:
              state.receivingLocationId,

            pallet_id:
              pallet.id,

            status:
              'В процессе',

            barcode_count:
              0,

            worker:
              state.user?.email ||
              'Не указан',

            started_at:
              new Date().toISOString()

          })
          .select('*')
          .single();


      if (error) {
        throw error;
      }


      state.receivingReceiptId =
        receipt.id;

      state.receivingReceiptStatus =
        receipt.status;

    }


    /*
      Загружаем уже принятые коробки
      этой приёмки.

      Это позволяет обновить страницу
      и не потерять прогресс.
    */

    const {
      data: receiptItems,
      error: itemsError
    } =
      await supabaseClient
        .from('receipt_items')
        .select(
          'id,box_id,barcode,created_at'
        )
        .eq(
          'receipt_id',
          state.receivingReceiptId
        )
        .order('id', {
          ascending: true
        });


    if (itemsError) {
      throw itemsError;
    }


    state.receivingScannedIds =
      (receiptItems || [])
        .map(
          item =>
            item.box_id
        )
        .filter(
          id =>
            id !== null &&
            id !== undefined
        );


    state.receivingRecentScans =
      (receiptItems || [])
        .slice(-10)
        .reverse()
        .map(
          item => ({
            barcode:
              item.barcode,

            time:
              item.created_at
                ? new Date(
                    item.created_at
                  ).toLocaleTimeString(
                    'ru-RU',
                    {
                      hour:
                        '2-digit',

                      minute:
                        '2-digit',

                      second:
                        '2-digit'
                    }
                  )
                : ''
          })
        );


    toast(
      `Приёмка открыта. Поддон ${pallet.pallet_number}`
    );


    render();


    setTimeout(
      focusReceivingScanner,
      100
    );

  } catch (error) {

    console.error(
      'Ошибка открытия приёмки:',
      error
    );

    toast(
      error.message ||
      'Не удалось открыть приёмку',
      'error'
    );

  } finally {

    state.receivingLoading =
      false;

  }

}

async function processReceivingScan(
  rawBarcode
) {

  const barcode =
    normalizeBarcode(
      rawBarcode
    );


  if (!barcode) {
    return;
  }


  if (
    !state.receivingReceiptId ||
    !state.receivingPalletId
  ) {

    toast(
      'Сначала откройте приёмку',
      'error'
    );

    beep(false);

    return;

  }


  if (
    state.receivingScanning
  ) {

    return;

  }


  state.receivingScanning =
    true;


  const scanner =
    $('#receivingScannerInput');


  try {

    /*
      ВАЖНО:

      Одинаковый barcode НЕ считается
      дублем автоматически.

      Один barcode может соответствовать
      нескольким физическим коробкам.
    */


    const warehouse =
      state.receivingWarehouses.find(
        row =>
          String(row.id) ===
          String(
            state.receivingWarehouseId
          )
      );


    const location =
      state.receivingLocations.find(
        row =>
          String(row.id) ===
          String(
            state.receivingLocationId
          )
      );


    const pallet =
      state.receivingPallets.find(
        row =>
          String(row.id) ===
          String(
            state.receivingPalletId
          )
      );


    if (
      !warehouse ||
      !location ||
      !pallet
    ) {

      throw new Error(
        'Не удалось определить склад, место или поддон.'
      );

    }


    /*
      Создаём ФИЗИЧЕСКУЮ коробку.
    */

    const {
      data: box,
      error: boxError
    } =
      await supabaseClient
        .from('boxes')
        .insert({

          "Штрихкод":
            barcode,

          "Артикул":
            null,

          "Кол-во в коробке":
            1,

          "Зона/ряд":
            location.code,

          "Поддон":
            pallet.pallet_number,

          "Статус":
            STATUSES.STOCK,

          "ДатаРазмещения":
            todayFileDate(),

          "Склад":
            warehouse.name,

          "Изменил":
            state.user?.email ||
            null,

          warehouse_id:
            warehouse.id,

          location_id:
            location.id,

          pallet_id:
            pallet.id

        })
        .select(
          BOX_SELECT
        )
        .single();


    if (boxError) {
      throw boxError;
    }


    /*
      Связываем коробку
      с текущей приёмкой.
    */

    const {
      data: receiptItem,
      error: itemError
    } =
      await supabaseClient
        .from('receipt_items')
        .insert({

          receipt_id:
            state.receivingReceiptId,

          box_id:
            box.id,

          barcode:
            barcode

        })
        .select(
          'id,box_id,barcode,created_at'
        )
        .single();


    if (itemError) {

      /*
        Если receipt_items не создалась,
        удаляем только что созданную
        коробку.

        Так не останется "висячей"
        коробки без приёмки.
      */

      await supabaseClient
        .from('boxes')
        .delete()
        .eq(
          'id',
          box.id
        );

      throw itemError;

    }


    /*
      Обновляем количество
      в текущей приёмке.
    */

    const newCount =
      state.receivingScannedIds.length +
      1;


    const {
      data: updatedReceipt,
      error: receiptUpdateError
    } =
      await supabaseClient
        .from('receipts')
        .update({

          barcode_count:
            newCount

        })
        .eq(
          'id',
          state.receivingReceiptId
        )
        .eq(
          'status',
          'В процессе'
        )
        .select('*')
        .single();


    if (receiptUpdateError) {

      console.warn(
        'Коробка создана, но счётчик приёмки не обновился:',
        receiptUpdateError
      );

    }


    /*
      Локальное состояние.
    */

    addLocalBox(
      box
    );


    state.receivingScannedIds.push(
      box.id
    );


    state.receivingRecentScans.unshift({

      barcode:
        receiptItem.barcode,

      time:
        new Date().toLocaleTimeString(
          'ru-RU',
          {
            hour:
              '2-digit',

            minute:
              '2-digit',

            second:
              '2-digit'
          }
        )

    });


    state.receivingRecentScans =
      state.receivingRecentScans
        .slice(0, 10);


    showReceivingScannerResult(
      `✓ ${barcode} — коробка принята`,
      'success'
    );


    beep(true);


    if (scanner) {

      scanner.value =
        '';

    }


    render();


    setTimeout(
      focusReceivingScanner,
      50
    );


  } catch (error) {

    console.error(
      'Ошибка приёмки:',
      error
    );


    showReceivingScannerResult(
      error.message ||
      'Ошибка приёмки',
      'error'
    );


    beep(false);


    if (scanner) {

      scanner.value =
        '';

    }


    setTimeout(
      focusReceivingScanner,
      50
    );

  } finally {

    state.receivingScanning =
      false;

  }

}

async function closeReceiving() {

  if (
    !state.receivingReceiptId
  ) {

    return;

  }


  const count =
    state.receivingScannedIds.length;


  if (!count) {

    toast(
      'Нельзя закрыть пустую приёмку',
      'error'
    );

    return;

  }


  if (
    !confirm(
      `Закрыть приёмку?\n\nПринято коробок: ${count}`
    )
  ) {

    return;

  }


  state.receivingLoading =
    true;


  try {

    const {
      data: receipt,
      error
    } =
      await supabaseClient
        .from('receipts')
        .update({

          status:
            'Завершена',

          barcode_count:
            count,

          completed_at:
            new Date().toISOString()

        })
        .eq(
          'id',
          state.receivingReceiptId
        )
        .eq(
          'status',
          'В процессе'
        )
        .select('*')
        .single();


    if (error) {
      throw error;
    }


    /*
      Закрываем поддон.

      Коробки при этом остаются
      на складе.
    */

    const {
      error: palletError
    } =
      await supabaseClient
        .from('pallets')
        .update({

          status:
            'На складе',

          closed_at:
            new Date().toISOString()

        })
        .eq(
          'id',
          state.receivingPalletId
        );


    if (palletError) {

      console.warn(
        'Приёмка закрыта, но статус поддона не обновился:',
        palletError
      );

    }


    state.receivingReceiptStatus =
      receipt.status;


    toast(
      `Приёмка завершена. Принято коробок: ${count}`
    );


    /*
      После завершения очищаем
      активную сессию.

      Саму историю приёмки
      мы НЕ удаляем.
    */

    state.receivingReceiptId =
      null;

    state.receivingPalletId =
      null;

    state.receivingPalletNumber =
      '';

    state.receivingScannedIds =
      [];

    state.receivingRecentScans =
      [];


    await loadReceivingData();


    render();


  } catch (error) {

    console.error(
      'Ошибка закрытия приёмки:',
      error
    );


    toast(
      error.message ||
      'Не удалось закрыть приёмку',
      'error'
    );

  } finally {

    state.receivingLoading =
      false;

  }

}

function setupReceived() {

  /*
    ЗАГРУЗКА ДАННЫХ

    Важно:
    если данные уже загружены —
    повторный запрос не делаем.
  */

  if (
    !state.receivingDataLoaded &&
    !state.receivingDataLoading
  ) {

    loadReceivingData()
      .then(
        () => {

          if (
            state.currentPage ===
            'received'
          ) {

            render();

          }

        }
      )
      .catch(
        error => {

          console.error(
            'Ошибка загрузки данных приёмки:',
            error
          );

        }
      );

  }


  /*
    СКЛАД
  */

  const warehouseSelect =
    $('#receivingWarehouse');


  warehouseSelect?.addEventListener(
    'change',
    event => {

      const value =
        event.target.value;


      state.receivingWarehouseId =
        value
          ? Number(value)
          : null;


      /*
        При смене склада старое место
        больше не подходит.
      */

      state.receivingLocationId =
        null;

      state.receivingPalletId =
        null;


      render();

    }
  );


  /*
    МЕСТО
  */

  const locationSelect =
    $('#receivingLocation');


  locationSelect?.addEventListener(
    'change',
    event => {

      const value =
        event.target.value;


      state.receivingLocationId =
        value
          ? Number(value)
          : null;


      state.receivingPalletId =
        null;


      render();

    }
  );

     /*
    СОЗДАТЬ НОВУЮ ЗОНУ / РЯД
  */

  const createLocationButton =
    $('#createReceivingLocationBtn');

  createLocationButton?.addEventListener(
    'click',
    async event => {

      event.preventDefault();

      if (
        !state.receivingWarehouseId
      ) {

        toast(
          'Сначала выберите склад',
          'error'
        );

        return;

      }

      if (
        state.receivingReceiptId
      ) {

        toast(
          'Нельзя менять место во время открытой приёмки',
          'error'
        );

        return;

      }

      await createReceivingLocation();

    }
  );

  /*
    НОМЕР ПОДДОНА
  */

  const palletInput =
    $('#receivingPalletNumber');


  palletInput?.addEventListener(
    'input',
    event => {

      state.receivingPalletNumber =
        event.target.value;


      /*
        Не перерисовываем страницу
        на каждый символ.

        Просто обновляем кнопку.
      */

      const button =
        $('#startReceivingBtn');


      if (button) {

        button.disabled =
          !state.receivingWarehouseId ||
          !state.receivingLocationId ||
          !normalizeText(
            state.receivingPalletNumber
          ) ||
          state.receivingLoading;

      }

    }
  );


  /*
    ОТКРЫТЬ ПРИЁМКУ
  */

  const startButton =
    $('#startReceivingBtn');


  startButton?.addEventListener(
    'click',
    async event => {

      event.preventDefault();


      if (
        startButton.disabled
      ) {

        return;

      }


      await startReceiving();

    }
  );


  /*
    ЗАКРЫТЬ ПРИЁМКУ
  */

  const closeButton =
    $('#closeReceivingBtn');


  closeButton?.addEventListener(
    'click',
    async event => {

      event.preventDefault();

      await closeReceiving();

    }
  );


  /*
    ПОВТОРИТЬ ЗАГРУЗКУ
  */

  const reloadButton =
    $('#reloadReceivingDataBtn');


  reloadButton?.addEventListener(
    'click',
    async event => {

      event.preventDefault();


      state.receivingDataLoaded =
        false;

      state.receivingDataError =
        '';


      await loadReceivingData();


      render();

    }
  );


  /*
    СКАНЕР
  */

  const scanner =
    $('#receivingScannerInput');


  scanner?.addEventListener(
    'keydown',
    async event => {

      if (
        event.key !== 'Enter'
      ) {

        return;

      }


      event.preventDefault();
      event.stopPropagation();


      const barcode =
        scanner.value;


      scanner.value =
        '';


      await processReceivingScan(
        barcode
      );

    }
  );


  /*
    ENTER / FOCUS

    После открытия приёмки
    автоматически ставим фокус
    на сканер.
  */

  if (
    state.receivingReceiptId &&
    state.receivingReceiptStatus ===
      'В процессе'
  ) {

    setTimeout(
      focusReceivingScanner,
      80
    );

  }

}

function focusReceivingScanner() {

  const scanner =
    $('#receivingScannerInput');


  if (!scanner) {
    return;
  }


  scanner.focus({
    preventScroll: true
  });

}

function showReceivingScannerResult(
  message,
  type
) {

  const element =
    $('#receivingScannerResult');


  if (!element) {
    return;
  }


  element.textContent =
    message;


  element.style.border =
    type === 'error'
      ? '2px solid #b42318'
      : '2px solid #18794e';


  element.style.background =
    type === 'error'
      ? '#fff4f2'
      : '#f0faf4';


  element.style.color =
    type === 'error'
      ? '#b42318'
      : '#18794e';

}



/*
  После INSERT не делаем полный reload.
*/

function addLocalBox(row) {

  state.boxes.push(
    row
  );


  state.boxes.sort(
    (a, b) =>
      Number(a.id) -
      Number(b.id)
  );

}


/*
  После UPDATE меняем только нужную строку.
*/

function updateLocalBox(
  id,
  changes
) {

  const index =
    state.boxes.findIndex(
      row =>
        String(row.id) ===
        String(id)
    );


  if (index === -1) {

    return;

  }


  state.boxes[index] = {

    ...state.boxes[index],

    ...changes

  };

}


/*
  После DELETE удаляем только нужную строку.
*/

function removeLocalBox(id) {

  state.boxes =
    state.boxes.filter(
      row =>
        String(row.id) !==
        String(id)
    );


  state.selectedIds.delete(
    String(id)
  );

}


/* =========================================================
   SUPABASE PAYLOAD
   ========================================================= */

function boxToPayload(formData) {

  return {

    "Штрихкод":
      normalizeBarcode(
        formData.barcode
      ),

    "Артикул":
      normalizeText(
        formData.article
      ) || null,

    "Кол-во в коробке":
      normalizeText(
        formData.quantity_in_box
      ) || null,

    "Зона/ряд":
      normalizeText(
        formData.zone_row
      ) || null,

    "Поддон":
      normalizeText(
        formData.pallet
      ) || null,

    "Статус":
      normalizeText(
        formData.status
      ) || STATUSES.STOCK,

    "ДатаРазмещения":
      toISODate(
        formData.date
      ),

    "Склад":
      normalizeText(
        formData.warehouse
      ) || null,

    "Изменил":
      normalizeText(
        formData.worker
      ) || null

  };

}

/* =========================================================
   BASE
   ========================================================= */

function getFilteredBoxes() {

  const search =
    state.baseSearch
      .trim()
      .toLowerCase();

  return state.boxes.filter(
    row => {

      if (
        state.baseWarehouse &&
        normalizeText(row.warehouse) !==
          normalizeText(state.baseWarehouse)
      ) {
        return false;
      }

      if (
        state.baseZone &&
        normalizeText(row.zone_row) !==
          normalizeText(state.baseZone)
      ) {
        return false;
      }

      if (
        state.basePallet &&
        normalizeText(row.pallet) !==
          normalizeText(state.basePallet)
      ) {
        return false;
      }

      if (
        state.baseStatus &&
        normalizeText(row.status) !==
          normalizeText(state.baseStatus)
      ) {
        return false;
      }

      if (
        state.baseDirection &&
        normalizeText(row.direction) !==
          normalizeText(state.baseDirection)
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        row.barcode,
        row.article,
        row.zone_row,
        row.pallet,
        row.status,
        row.direction,
        row.warehouse,
        formatDate(row.date)

      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    }
  );
}


function baseView() {

  const filtered =
    getFilteredBoxes();

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filtered.length /
        PAGE_SIZE
      )
    );

  if (
    state.basePage >
    totalPages
  ) {
    state.basePage =
      totalPages;
  }

  const start =
    (state.basePage - 1) *
    PAGE_SIZE;

  const rows =
    filtered.slice(
      start,
      start + PAGE_SIZE
    );

  const warehouses =
    [
      ...new Set(
        state.boxes
          .map(row =>
            normalizeText(
              row.warehouse
            )
          )
          .filter(Boolean)
      )
    ].sort();

  const zones =
    [
      ...new Set(
        state.boxes
          .filter(row => {

            if (
              state.baseWarehouse &&
              normalizeText(row.warehouse) !==
                normalizeText(state.baseWarehouse)
            ) {
              return false;
            }

            return true;
          })
          .map(row =>
            normalizeText(
              row.zone_row
            )
          )
          .filter(Boolean)
      )
    ].sort();

  const pallets =
    [
      ...new Set(
        state.boxes
          .filter(row => {

            if (
              state.baseWarehouse &&
              normalizeText(row.warehouse) !==
                normalizeText(state.baseWarehouse)
            ) {
              return false;
            }

            if (
              state.baseZone &&
              normalizeText(row.zone_row) !==
                normalizeText(state.baseZone)
            ) {
              return false;
            }

            return true;
          })
          .map(row =>
            normalizeText(
              row.pallet
            )
          )
          .filter(Boolean)
      )
    ].sort();

  const statuses =
    [
      ...new Set(
        state.boxes
          .map(row =>
            normalizeText(
              row.status
            )
          )
          .filter(Boolean)
      )
    ].sort();

  const directions =
    [
      ...new Set(
        state.boxes
          .map(row =>
            normalizeText(
              row.direction
            )
          )
          .filter(Boolean)
      )
    ].sort();

  return `

    <!-- =========================================
         БЫСТРАЯ НАВИГАЦИЯ
         ========================================= -->

    <div
      class="sp-card"
      style="
        margin-bottom:14px;
      "
    >

      <div
        style="
          display:flex;
          flex-wrap:wrap;
          gap:8px;
        "
      >

        <button
          class="sp-btn secondary"
          data-page="dashboard"
        >
          Главная
        </button>

        <button
          class="sp-btn secondary"
          data-page="received"
        >
          Приёмка
        </button>

        <button
          class="sp-btn secondary"
          data-page="assembly"
        >
          Сборка
        </button>

        <button
          class="sp-btn secondary"
          data-page="collected"
        >
          Собрано
        </button>

        <button
          class="sp-btn secondary"
          data-page="shipped"
        >
          Убыло
        </button>

        <button
          class="sp-btn secondary"
          data-page="comparison"
        >
          Сравнение
        </button>

        <button
          class="sp-btn secondary"
          data-page="tools"
        >
          Инструменты
        </button>

      </div>

    </div>


    <!-- =========================================
         ФИЛЬТРЫ
         ========================================= -->

    <div
      class="sp-toolbar"
      style="
        flex-wrap:wrap;
      "
    >

      <input
        id="baseSearch"
        type="search"
        placeholder="Штрихкод / артикул / зона / поддон / направление..."
        value="${escapeHtml(
          state.baseSearch
        )}"
        style="min-width:260px"
      >


      <select id="baseWarehouse">

        <option value="">
          Все склады
        </option>

        ${warehouses.map(
          warehouse => `

            <option
              value="${escapeHtml(
                warehouse
              )}"
              ${
                warehouse ===
                state.baseWarehouse
                  ? 'selected'
                  : ''
              }
            >
              ${escapeHtml(
                warehouse
              )}
            </option>

          `
        ).join('')}

      </select>


      <select id="baseZone">

        <option value="">
          Все зоны / ряды
        </option>

        ${zones.map(
          zone => `

            <option
              value="${escapeHtml(zone)}"
              ${
                zone ===
                state.baseZone
                  ? 'selected'
                  : ''
              }
            >
              ${escapeHtml(zone)}
            </option>

          `
        ).join('')}

      </select>


      <select id="basePallet">

        <option value="">
          Все поддоны
        </option>

        ${pallets.map(
          pallet => `

            <option
              value="${escapeHtml(pallet)}"
              ${
                pallet ===
                state.basePallet
                  ? 'selected'
                  : ''
              }
            >
              ${escapeHtml(pallet)}
            </option>

          `
        ).join('')}

      </select>


      <select id="baseStatus">

        <option value="">
          Все статусы
        </option>

        ${statuses.map(
          status => `

            <option
              value="${escapeHtml(status)}"
              ${
                status ===
                state.baseStatus
                  ? 'selected'
                  : ''
              }
            >
              ${escapeHtml(status)}
            </option>

          `
        ).join('')}

      </select>


      <select id="baseDirection">

        <option value="">
          Все направления
        </option>

        ${directions.map(
          direction => `

            <option
              value="${escapeHtml(
                direction
              )}"
              ${
                direction ===
                state.baseDirection
                  ? 'selected'
                  : ''
              }
            >
              ${escapeHtml(
                direction
              )}
            </option>

          `
        ).join('')}

      </select>


      <button
        class="sp-btn secondary"
        id="resetBaseFilters"
      >
        Сбросить
      </button>

      <button
        class="sp-btn"
        id="addBoxBtn"
      >
        + Добавить коробку
      </button>

      <button
        class="sp-btn success"
        id="markPickBtn"
        ${
          state.selectedIds.size
            ? ''
            : 'disabled'
        }
      >
        В подбор
        (${state.selectedIds.size})
      </button>

      <button
        class="sp-btn"
        id="setDirectionFromBaseBtn"
        ${
          state.selectedIds.size
            ? ''
            : 'disabled'
        }
      >
        🏷 Направление
      </button>

      <button
        class="sp-btn danger"
        id="deleteSelectedBtn"
        ${
          state.selectedIds.size
            ? ''
            : 'disabled'
        }
      >
        Удалить
        (${state.selectedIds.size})
      </button>

    </div>


    <!-- =========================================
         СТАТИСТИКА
         ========================================= -->

    <div
      class="sp-muted"
      style="margin:12px 0"
    >

      Найдено:
      <b>${filtered.length}</b>

      · Всего:
      <b>${state.boxes.length}</b>

      · Выбрано:
      <b>${state.selectedIds.size}</b>

      · Страница:
      ${state.basePage}
      из
      ${totalPages}

    </div>


<!-- =========================================
     ТАБЛИЦА
     ========================================= -->

<div class="sp-table-wrap">

  <table class="sp-table">

    <thead>

      <tr>

        <th style="width:35px">
          ✓
        </th>

        <th>
          Штрихкод
        </th>

        <th>
          Артикул
        </th>

        <th>
          Кол-во
        </th>

        <th>
          Зона / ряд
        </th>

        <th>
          Поддон
        </th>

        <th>
          Статус
        </th>

        <th>
          Направление
        </th>

        <th>
          Склад
        </th>

        <th>
          Дата
        </th>

        <th>
          Действия
        </th>

      </tr>

    </thead>
    
        <tbody>

          ${
            rows.length

              ? rows
                  .map(
                    baseRow
                  )
                  .join('')

              : `

                <tr>

                  <td colspan="11">

                    <div class="sp-empty">
                      Нет данных
                    </div>

                  </td>

                </tr>

              `
          }

        </tbody>

      </table>

    </div>


    <!-- =========================================
         ПАГИНАЦИЯ
         ========================================= -->

    <div class="sp-pagination">

      <div>

        Показано
        ${rows.length}
        из
        ${filtered.length}

      </div>


      <div class="sp-pagination-buttons">

        <button
          class="sp-btn secondary"
          id="basePrev"
          ${
            state.basePage <= 1
              ? 'disabled'
              : ''
          }
        >
          ←
        </button>

        <button
          class="sp-btn secondary"
          id="baseNext"
          ${
            state.basePage >= totalPages
              ? 'disabled'
              : ''
          }
        >
          →
        </button>

      </div>

    </div>

  `;
}


function baseRow(row) {

  const id =
    String(row.id);


  const selected =
    state.selectedIds.has(
      id
    );


  return `

    <tr
      data-row-id="${escapeHtml(id)}"
      class="${selected ? 'selected' : ''}"
    >

      <!-- ВЫБОР -->

      <td>

        <input
          type="checkbox"
          class="base-check"
          data-id="${escapeHtml(id)}"
          ${
            selected
              ? 'checked'
              : ''
          }
        >

      </td>


      <!-- ШТРИХКОД -->

      <td>

        <b>
          ${escapeHtml(
            row.barcode
          )}
        </b>

      </td>


      <!-- АРТИКУЛ -->

      <td>
        ${escapeHtml(
          row.article
        )}
      </td>


      <!-- КОЛИЧЕСТВО -->

      <td>
        ${escapeHtml(
          row.quantity_in_box
        )}
      </td>


      <!-- ЗОНА / РЯД -->

      <td>
        ${escapeHtml(
          row.zone_row
        )}
      </td>


      <!-- ПОДДОН -->

      <td>
        ${escapeHtml(
          row.pallet
        )}
      </td>


      <!-- СТАТУС -->

      <td>

        <span class="sp-status">
          ${escapeHtml(
            row.status
          )}
        </span>

      </td>


      <!-- НАПРАВЛЕНИЕ -->

      <td>
        ${escapeHtml(
          row.direction
        )}
      </td>


      <!-- СКЛАД -->

      <td>
        ${escapeHtml(
          row.warehouse
        )}
      </td>


      <!-- ДАТА -->

      <td>
        ${escapeHtml(
          formatDate(row.date)
        )}
      </td>


      <!-- ДЕЙСТВИЯ -->

      <td>

        <button
          class="sp-btn secondary edit-box"
          data-id="${escapeHtml(id)}"
        >
          Изменить
        </button>

      </td>

    </tr>

  `;

}

async function setDirectionForSelectedBoxes() {

  const ids =
    [...state.selectedIds];

  if (!ids.length) {

    toast(
      'Выберите хотя бы одну коробку',
      'error'
    );

    return;
  }

  const direction =
    prompt(
      'Введите направление для выбранных коробок:',
      ''
    );

  if (
    direction === null
  ) {
    return;
  }

  const value =
    normalizeText(
      direction
    );

  if (!value) {

    toast(
      'Направление не указано',
      'error'
    );

    return;
  }

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('boxes')
        .update({
          "Направление":
            value,

          "Изменил":
            state.user?.email ||
            null
        })
        .in(
          'id',
          ids
        )
        .select(
          BOX_SELECT
        );

    if (error) {
      throw error;
    }

    if (
      Array.isArray(data)
    ) {

      data.forEach(
        row => {

          updateLocalBox(
            row.id,
            row
          );

        }
      );

    }

    state.selectedIds =
      new Set();

    render();

    toast(
      `Направление "${value}" назначено: ${data?.length || ids.length}`
    );

  } catch (error) {

    console.error(
      'setDirectionForSelectedBoxes:',
      error
    );

    toast(
      error?.message ||
      'Не удалось назначить направление',
      'error'
    );

  }

}

function setupBase() {

  $('#baseSearch')
    ?.addEventListener(
      'input',
      event => {

        state.baseSearch =
          event.target.value;

        state.basePage =
          1;

        render();

      }
    );


  $('#baseWarehouse')
    ?.addEventListener(
      'change',
      event => {

        state.baseWarehouse =
          event.target.value;

        state.baseZone =
          '';

        state.basePallet =
          '';

        state.basePage =
          1;

        render();

      }
    );


  $('#baseZone')
    ?.addEventListener(
      'change',
      event => {

        state.baseZone =
          event.target.value;

        state.basePallet =
          '';

        state.basePage =
          1;

        render();

      }
    );


  $('#basePallet')
    ?.addEventListener(
      'change',
      event => {

        state.basePallet =
          event.target.value;

        state.basePage =
          1;

        render();

      }
    );


  $('#baseStatus')
    ?.addEventListener(
      'change',
      event => {

        state.baseStatus =
          event.target.value;

        state.basePage =
          1;

        render();

      }
    );


  $('#baseDirection')
    ?.addEventListener(
      'change',
      event => {

        state.baseDirection =
          event.target.value;

        state.basePage =
          1;

        render();

      }
    );


  $('#resetBaseFilters')
    ?.addEventListener(
      'click',
      () => {

        state.baseSearch = '';
        state.baseWarehouse = '';
        state.baseZone = '';
        state.basePallet = '';
        state.baseStatus = '';
        state.baseDirection = '';
        state.basePage = 1;

        render();

      }
    );


  $('#basePrev')
    ?.addEventListener(
      'click',
      () => {

        if (
          state.basePage > 1
        ) {

          state.basePage--;

          render();

        }

      }
    );


  $('#baseNext')
    ?.addEventListener(
      'click',
      () => {

        const totalPages =
          Math.max(
            1,
            Math.ceil(
              getFilteredBoxes().length /
              PAGE_SIZE
            )
          );

        if (
          state.basePage <
          totalPages
        ) {

          state.basePage++;

          render();

        }

      }
    );


  $('#addBoxBtn')
    ?.addEventListener(
      'click',
      () =>
        openBoxModal()
    );


  $('#markPickBtn')
    ?.addEventListener(
      'click',
      markSelectedForPicking
    );


  $('#setDirectionFromBaseBtn')
    ?.addEventListener(
      'click',
      setDirectionForSelectedBoxes
    );


  $('#deleteSelectedBtn')
    ?.addEventListener(
      'click',
      deleteSelectedBoxes
    );


  $all('.base-check')
    .forEach(
      check => {

        check.addEventListener(
          'change',
          event => {

            const id =
              String(
                event.target.dataset.id
              );

            if (
              event.target.checked
            ) {

              state.selectedIds
                .add(id);

            } else {

              state.selectedIds
                .delete(id);

            }

            render();

          }
        );

      }
    );


  $all('.edit-box')
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            const id =
              button.dataset.id;

            openEditBoxModal(id);

          }
        );

      }
    );

}

/* =========================================================
   BOX MODAL
   ========================================================= */

function closeBoxModal() {

  $('#boxModal')?.remove();

  state.editingId =
    null;

}


function openBoxModal(
  id = null
) {

  closeBoxModal();


  state.editingId =
    id !== null
      ? String(id)
      : null;


  const row =
    id !== null
      ? state.boxes.find(
          item =>
            String(item.id) ===
            String(id)
        )
      : null;


  const modal =
    document.createElement('div');


  modal.id =
    'boxModal';


  modal.className =
    'sp-modal-backdrop';


  modal.innerHTML = `

    <div class="sp-modal">

      <div class="sp-modal-head">

        <h2 style="margin:0">

          ${
            row
              ? 'Редактирование коробки'
              : 'Добавить коробку'
          }

        </h2>


        <button
          class="sp-modal-close"
          id="closeBoxModal"
        >
          ×
        </button>

      </div>


      <form
        class="sp-form"
        id="boxForm"
      >

        <label>

          Штрихкод

          <input
            id="boxBarcode"
            required
            value="${escapeHtml(
              row?.barcode ?? ''
            )}"
          >

        </label>


        <label>

          Артикул

          <input
            id="boxArticle"
            value="${escapeHtml(
              row?.article ?? ''
            )}"
          >

        </label>


        <label>

          Кол-во в коробке

          <input
            id="boxQuantity"
            value="${escapeHtml(
              row?.quantity_in_box ?? ''
            )}"
          >

        </label>


        <label>

          Зона/ряд

          <input
            id="boxZone"
            value="${escapeHtml(
              row?.zone_row ?? ''
            )}"
          >

        </label>


        <label>

          Поддон

          <input
            id="boxPallet"
            value="${escapeHtml(
              row?.pallet ?? ''
            )}"
          >

        </label>


        <label>

          Статус

          <select id="boxStatus">

            ${Object.values(
              STATUSES
            )
              .map(
                status => `

                  <option
                    value="${escapeHtml(status)}"
                    ${
                      (
                        row?.status ??
                        STATUSES.STOCK
                      ) === status
                        ? 'selected'
                        : ''
                    }
                  >
                    ${escapeHtml(status)}
                  </option>

                `
              )
              .join('')}

          </select>

        </label>


        <label>

          Дата размещения

          <input
            id="boxDate"
            type="date"
            value="${escapeHtml(
              toISODate(
                row?.date
              ) ?? ''
            )}"
          >

        </label>


        <label>

          Склад

          <input
            id="boxWarehouse"
            value="${escapeHtml(
              row?.warehouse ?? ''
            )}"
          >

        </label>


        <div class="sp-form-actions">

          <button
            type="button"
            class="sp-btn secondary"
            id="cancelBoxModal"
          >
            Отмена
          </button>


          <button
            type="submit"
            class="sp-btn"
            id="saveBoxBtn"
          >
            Сохранить
          </button>

        </div>

      </form>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  $('#closeBoxModal')
    .addEventListener(
      'click',
      closeBoxModal
    );


  $('#cancelBoxModal')
    .addEventListener(
      'click',
      closeBoxModal
    );


  $('#boxForm')
    .addEventListener(
      'submit',
      saveBox
    );


  $('#boxBarcode')
    ?.focus();


  modal.addEventListener(
    'click',
    event => {

      if (
        event.target === modal
      ) {

        closeBoxModal();

      }

    }
  );

}


async function saveBox(event) {

  event.preventDefault();


  const button =
    $('#saveBoxBtn');


  button.disabled =
    true;


  button.textContent =
    'Сохранение...';


  try {

    const formData = {

      barcode:
        $('#boxBarcode').value,

      article:
        $('#boxArticle').value,

      quantity_in_box:
        $('#boxQuantity').value,

      zone_row:
        $('#boxZone').value,

      pallet:
        $('#boxPallet').value,

      status:
        $('#boxStatus').value,

      date:
        $('#boxDate').value,

      warehouse:
        $('#boxWarehouse').value

    };


    const payload =
      boxToPayload(
        formData
      );


    if (
      !payload.barcode
    ) {

      throw new Error(
        'Штрихкод обязателен'
      );

    }


    /*
      INSERT
    */

    if (
      !state.editingId
    ) {

      const {
        data,
        error
      } =
        await supabaseClient
          .from('boxes')
          .insert(payload)
          .select(BOX_SELECT)
          .single();


      if (error) {

        throw error;

      }


      addLocalBox(
        data
      );


      closeBoxModal();

      render();


      toast(
        'Коробка добавлена'
      );


      return;

    }


    /*
      UPDATE
    */

    const {
      data,
      error
    } =
      await supabaseClient
        .from('boxes')
        .update(payload)
        .eq(
          'id',
          state.editingId
        )
        .select(BOX_SELECT)
        .single();


    if (error) {

      throw error;

    }


    updateLocalBox(
      state.editingId,
      data
    );


    closeBoxModal();

    render();


    toast(
      'Коробка сохранена'
    );


  } catch (error) {

    console.error(
      'saveBox error:',
      error
    );


    toast(
      error.message ||
      'Ошибка сохранения',
      'error'
    );


    button.disabled =
      false;


    button.textContent =
      'Сохранить';

  }

}


/* =========================================================
   DELETE
   ========================================================= */

async function deleteBox(
  id
) {

  if (
    !confirm(
      'Удалить эту коробку?'
    )
  ) {

    return;

  }


  const {
    error
  } =
    await supabaseClient
      .from('boxes')
      .delete()
      .eq(
        'id',
        id
      );


  if (error) {

    toast(
      error.message,
      'error'
    );

    return;

  }


  removeLocalBox(
    id
  );


  render();


  toast(
    'Коробка удалена'
  );

}


async function deleteSelectedBoxes() {

  const ids =
    [...state.selectedIds];


  if (
    !ids.length
  ) {

    return;

  }


  if (
    !confirm(
      `Удалить выбранные коробки: ${ids.length}?`
    )
  ) {

    return;

  }


  const {
    error
  } =
    await supabaseClient
      .from('boxes')
      .delete()
      .in(
        'id',
        ids
      );


  if (error) {

    toast(
      error.message,
      'error'
    );

    return;

  }


  ids.forEach(
    id =>
      removeLocalBox(id)
  );


  state.selectedIds.clear();


  render();


  toast(
    `Удалено коробок: ${ids.length}`
  );

}


/* =========================================================
   PICKING
   ========================================================= */
/* =========================================================
   REQUEST → PICKING
   ========================================================= */

/*
  Вставка заявки:

  Пользователь вставляет список штрихкодов.
  Каждый штрихкод может повторяться.

  Например:

  4810122595003
  4810122595003
  4810122595003
  4810122659354

  Система понимает:

  4810122595003 → нужно 3 коробки
  4810122659354 → нужно 1 коробку

  Затем ищет физические коробки
  со статусом "На складе" и переводит
  нужное количество в "КПодбору".
*/

function importRequestExcel(event) {

  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }


  const reader =
    new FileReader();


  reader.onload =
    function(e) {

      try {

        const data =
          new Uint8Array(
            e.target.result
          );


        const workbook =
          XLSX.read(
            data,
            {
              type: 'array'
            }
          );


        const sheetName =
          workbook.SheetNames[0];


        const sheet =
          workbook.Sheets[
            sheetName
          ];


        /*
          Читаем Excel построчно.

          Например:

          Штрихкод | Количество
          4810122640604 | 5
          4810122680884 | 5
        */

        const rows =
          XLSX.utils.sheet_to_json(
            sheet,
            {
              header: 1,
              defval: '',
              raw: false
            }
          );


        if (!rows.length) {

          toast(
            'Excel-файл пустой',
            'error'
          );

          return;
        }


        /*
          Ищем колонки:

          Штрихкод
          Количество

          Названия могут немного
          отличаться.
        */

        let barcodeColumn =
          -1;

        let quantityColumn =
          -1;


        /*
          Проверяем первую строку
          как заголовок.
        */

        const header =
          rows[0].map(
            value =>
              String(
                value || ''
              )
                .trim()
                .toLowerCase()
          );


        for (
          let i = 0;
          i < header.length;
          i++
        ) {

          const name =
            header[i];


          /*
            Колонка штрихкода
          */

          if (
            barcodeColumn === -1 &&
            (
              name.includes(
                'штрихкод'
              ) ||
              name.includes(
                'barcode'
              )
            )
          ) {

            barcodeColumn =
              i;

          }


          /*
            Колонка количества
          */

          if (
            quantityColumn === -1 &&
            (
              name === 'количество' ||
              name === 'кол-во' ||
              name === 'кол во' ||
              name.includes(
                'количество'
              ) ||
              name.includes(
                'кол-во'
              )
            )
          ) {

            quantityColumn =
              i;

          }

        }


        /*
          Если заголовки не нашли,
          предполагаем:

          A = Штрихкод
          B = Количество
        */

        if (
          barcodeColumn === -1
        ) {

          barcodeColumn = 0;

        }


        if (
          quantityColumn === -1
        ) {

          quantityColumn = 1;

        }


        /*
          Здесь собираем готовую заявку.

          Например:

          4810122640604 - 5
          4810122680884 - 5
        */

        const requestLines =
          [];


        let importedCount =
          0;


        let skippedCount =
          0;


        /*
          Начинаем со второй строки,
          потому что первая — заголовок.
        */

        for (
          let i = 1;
          i < rows.length;
          i++
        ) {

          const row =
            rows[i];


          if (
            !Array.isArray(row)
          ) {

            continue;
          }


          /*
            Получаем значение
            штрихкода.
          */

          let barcodeValue =
            row[
              barcodeColumn
            ];


          /*
            Получаем количество.
          */

          let quantityValue =
            row[
              quantityColumn
            ];


          if (
            barcodeValue === undefined ||
            barcodeValue === null ||
            String(
              barcodeValue
            ).trim() === ''
          ) {

            skippedCount++;

            continue;
          }


          /*
            =================================================
            НОРМАЛИЗАЦИЯ ШТРИХКОДА
            =================================================

            Excel может показать:

            4 810 122 640 604

            или:

            4810122640604

            или:

            4810122640604.0
          */


          let barcode =
            String(
              barcodeValue
            )
              .trim()
              .replace(
                /\s+/g,
                ''
              );


          /*
            Убираем .0 и ,0
          */

          barcode =
            barcode.replace(
              /[.,]0+$/,
              ''
            );


          /*
            Используем твою
            существующую нормализацию.
          */

          barcode =
            normalizeBarcode(
              barcode
            );


          /*
            Проверяем именно
            13-значный штрихкод.
          */

          if (
            !/^\d{13}$/.test(
              barcode
            )
          ) {

            console.warn(
              'Пропущен некорректный штрихкод:',
              barcodeValue
            );

            skippedCount++;

            continue;
          }


          /*
            =================================================
            КОЛИЧЕСТВО
            =================================================
          */

          let quantity =
            Number(
              String(
                quantityValue ?? ''
              )
                .trim()
                .replace(
                  /\s+/g,
                  ''
                )
                .replace(
                  ',',
                  '.'
                )
            );


          /*
            Если количество отсутствует,
            считаем 1.
          */

          if (
            !Number.isFinite(
              quantity
            ) ||
            quantity <= 0
          ) {

            quantity = 1;

          }


          /*
            Количество физических
            коробок должно быть целым.
          */

          quantity =
            Math.floor(
              quantity
            );


          if (
            quantity <= 0
          ) {

            skippedCount++;

            continue;
          }


          /*
            Добавляем строку заявки.
          */

          requestLines.push(
            `${barcode} - ${quantity}`
          );


          importedCount +=
            quantity;

        }


        /*
          Если ничего не импортировали.
        */

        if (
          !requestLines.length
        ) {

          toast(
            'Не удалось найти штрихкоды в Excel',
            'error'
          );

          console.warn(
            'Строки Excel:',
            rows
          );

          return;
        }


        /*
          =================================================
          ЗАПИСЫВАЕМ В ПОЛЕ ЗАЯВКИ
          =================================================
        */

        const input =
          document.querySelector(
            '#requestBarcodes'
          );


        if (!input) {

          toast(
            'Поле заявки не найдено',
            'error'
          );

          return;
        }


        /*
          Получаем готовый текст:

          4810122640604 - 5
          4810122680884 - 5
          ...
        */

        input.value =
          requestLines.join(
            '\n'
          );


        /*
          =================================================
          РЕЗУЛЬТАТ
          =================================================
        */

        toast(
          `Импортировано: ${requestLines.length} позиций, ${importedCount} коробок`
        );


        if (
          skippedCount > 0
        ) {

          console.warn(
            `Пропущено строк: ${skippedCount}`
          );

        }


        /*
          Сбрасываем input,
          чтобы тот же файл можно было
          импортировать повторно.
        */

        event.target.value = '';


      }

      catch (error) {

        console.error(
          'Ошибка импорта заявки:',
          error
        );


        toast(
          'Не удалось прочитать Excel-файл',
          'error'
        );

      }

    };


  reader.readAsArrayBuffer(
    file
  );

}

async function createPickingFromRequest() {

  const input =
    document.querySelector(
      '#requestBarcodes'
    );

  if (!input) {

    toast(
      'Поле заявки не найдено',
      'error'
    );

    return;
  }


  const raw =
    input.value || '';


  if (!raw.trim()) {

    toast(
      'Вставьте штрихкоды заявки',
      'error'
    );

    return;
  }


  /*
    =========================================================
    РАЗБОР ЗАЯВКИ
    =========================================================

    Поддерживаем:

    1) Один штрихкод в строке:

    4810122595003
    4810122595003
    4810122595003

    = 3 коробки


    2) Штрихкод + количество:

    4810122595003 - 3
    4810122659354 - 2


    3) Через пробел:

    4810122595003 3


    4) Через табуляцию из Excel:

    4810122595003    3


    5) Через двоеточие:

    4810122595003:3


    6) Через точку с запятой:

    4810122595003;3


    Если количество не указано,
    считается 1 коробка.
  */


  const lines =
    raw
      .split(/\r?\n/)
      .map(
        line =>
          line.trim()
      )
      .filter(Boolean);


  /*
    Здесь будет:

    barcode -> требуемое количество
  */

  const requested =
    new Map();


  let invalidLines = 0;


  /*
    Обрабатываем каждую строку.
  */

  for (
    const line of lines
  ) {

    /*
      Ищем 13-значный штрихкод.
    */

    const barcodeMatch =
      line.match(
        /\b\d{13}\b/
      );


    /*
      Если штрихкод не найден —
      пропускаем строку.
    */

    if (!barcodeMatch) {

      invalidLines++;

      continue;
    }


    const barcode =
      normalizeBarcode(
        barcodeMatch[0]
      );


    if (!barcode) {

      invalidLines++;

      continue;
    }


    /*
      Убираем штрихкод из строки.
    */

    const rest =
      line
        .replace(
          barcodeMatch[0],
          ''
        )
        .trim();


    /*
      По умолчанию:

      если количество не указано,
      считаем 1 коробку.
    */

    let quantity = 1;


    /*
      Пытаемся найти количество
      после штрихкода.

      Поддерживаем:

      - 3
      — 3
      – 3
      : 3
      ; 3
      , 3
      пробел 3
      таб 3
    */

    const quantityMatch =
      rest.match(
        /(?:[-—–:;,]|\s)\s*(\d+(?:[.,]\d+)?)\s*$/
      );


    if (quantityMatch) {

      quantity =
        Number(
          String(
            quantityMatch[1]
          ).replace(
            ',',
            '.'
          )
        );

    }


    /*
      Проверяем количество.
    */

    if (
      !Number.isFinite(
        quantity
      ) ||
      quantity <= 0
    ) {

      invalidLines++;

      continue;
    }


    /*
      Количество коробок
      должно быть целым.

      Например:

      3.5 -> 3
    */

    quantity =
      Math.floor(
        quantity
      );


    if (quantity <= 0) {

      invalidLines++;

      continue;
    }


    /*
      Если такой штрихкод уже есть
      в заявке — складываем количество.

      Например:

      4810122595003 - 2
      4810122595003 - 3

      станет:

      4810122595003 -> 5
    */

    requested.set(
      barcode,
      (
        requested.get(
          barcode
        ) || 0
      ) + quantity
    );

  }


  /*
    Если ничего не нашли.
  */

  if (!requested.size) {

    toast(
      'Не найдено ни одного штрихкода',
      'error'
    );

    return;
  }


  /*
    =========================================================
    ИЩЕМ ФИЗИЧЕСКИЕ КОРОБКИ
    =========================================================

    Берём только коробки:

    На складе

    Не берём:

    Зарезервирована
    КПодбору
    Скомплектовано
    Отгружено
    Пустая
  */

  const available =
    state.boxes.filter(
      row => {

        const barcode =
          normalizeBarcode(
            row.barcode
          );

        return (
          row.status ===
            STATUSES.STOCK &&
          barcode
        );

      }
    );


  /*
    Здесь будут конкретные
    ID физических коробок.
  */

  const selectedIds =
    [];


  /*
    Не позволяем одной физической
    коробке попасть в заявку
    два раза.
  */

  const usedIds =
    new Set();


  /*
    Список недостатка.
  */

  const missing =
    [];


  /*
    =========================================================
    ПОДБОР КОРОБОК
    =========================================================
  */

  for (
    const [
      barcode,
      requiredCount
    ] of requested
  ) {

    /*
      Находим все физические коробки
      с этим штрихкодом.

      ВАЖНО:

      сравниваем barcode,

      но выбираем именно row.id.
    */

    const candidates =
      available.filter(
        row => {

          if (
            usedIds.has(
              row.id
            )
          ) {

            return false;
          }


          return (
            normalizeBarcode(
              row.barcode
            ) === barcode
          );

        }
      );


    /*
      Сколько реально можем взять.
    */

    const foundCount =
      Math.min(
        requiredCount,
        candidates.length
      );


    /*
      Берём только нужное количество.
    */

    for (
      let i = 0;
      i < foundCount;
      i++
    ) {

      const box =
        candidates[i];


      selectedIds.push(
        box.id
      );


      usedIds.add(
        box.id
      );

    }


    /*
      Если коробок не хватило —
      записываем недостаток.
    */

    if (
      foundCount <
      requiredCount
    ) {

      missing.push({

        barcode,

        required:
          requiredCount,

        found:
          foundCount,

        missing:
          requiredCount -
          foundCount

      });

    }

  }


  /*
    =========================================================
    НИ ОДНОЙ КОРОБКИ НЕ НАШЛИ
    =========================================================
  */

  if (!selectedIds.length) {

    let message =
      'Не удалось найти подходящие коробки.';


    if (
      missing.length
    ) {

      message +=
        '\n\nНе хватает:';


      missing.forEach(
        item => {

          message +=
            `\n${item.barcode} — нужно ${item.required}, найдено ${item.found}`;

        }
      );

    }


    alert(
      message
    );

    return;
  }


  /*
    =========================================================
    ПЕРЕВОДИМ КОРОБКИ В "К ПОДБОРУ"
    =========================================================

    Используем ID физических коробок.

    НЕ используем:

    .eq("Штрихкод", barcode)

    потому что один штрихкод может
    принадлежать множеству физических коробок.
  */

  const {
    data,
    error
  } =
    await supabaseClient
      .from('boxes')
      .update({

        "Статус":
          STATUSES.PICK,

        "Изменил":
          state.user?.email ||
          null

      })
      .in(
        'id',
        selectedIds
      )
      .select(
        BOX_SELECT
      );


  /*
    =========================================================
    ОШИБКА SUPABASE
    =========================================================
  */

  if (error) {

    console.error(
      'Ошибка формирования подбора:',
      error
    );

    console.error(
      'Message:',
      error?.message
    );

    console.error(
      'Details:',
      error?.details
    );

    console.error(
      'Hint:',
      error?.hint
    );

    console.error(
      'Code:',
      error?.code
    );


    toast(
      error.message ||
      'Ошибка формирования подбора',
      'error'
    );

    return;
  }


  /*
    =========================================================
    ОБНОВЛЯЕМ ЛОКАЛЬНОЕ СОСТОЯНИЕ
    =========================================================
  */

  if (
    Array.isArray(data)
  ) {

    data.forEach(
      row => {

        updateLocalBox(
          row.id,
          row
        );

      }
    );

  }


  /*
    =========================================================
    ОЧИЩАЕМ ЗАЯВКУ
    =========================================================
  */

  input.value = '';


  /*
    =========================================================
    ОБНОВЛЯЕМ ИНТЕРФЕЙС
    =========================================================
  */

  render();


  /*
    =========================================================
    СЧИТАЕМ ИТОГИ
    =========================================================
  */

  let requestedTotal =
    0;


  requested.forEach(
    count => {

      requestedTotal +=
        count;

    }
  );


  const pickedTotal =
    selectedIds.length;


  const missingTotal =
    missing.reduce(
      (
        total,
        item
      ) =>
        total +
        item.missing,
      0
    );


  /*
    =========================================================
    РЕЗУЛЬТАТ
    =========================================================
  */

  let message =
    `Заявка сформирована!\n\n` +
    `В заявке: ${requestedTotal}\n` +
    `В подбор: ${pickedTotal}`;


  /*
    Если чего-то не хватило.
  */

  if (
    missingTotal > 0
  ) {

    message +=
      `\nНе хватает: ${missingTotal}`;


    message +=
      '\n\nНе хватает:';


    missing.forEach(
      item => {

        message +=
          `\n${item.barcode} — нужно ${item.required}, найдено ${item.found}`;

      }
    );


    console.warn(
      'Недостаток коробок:',
      missing
    );


    alert(
      message
    );

  } else {

    toast(
      `Заявка сформирована: ${pickedTotal} коробок отправлено в подбор`
    );

  }

}

async function markSelectedForPicking() {

  const ids =
    [...state.selectedIds];


  if (!ids.length) {

    toast(
      'Выберите хотя бы одну коробку',
      'error'
    );

    return;

  }


  let done = 0;


  for (
    const id of ids
  ) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('boxes')
        .update({
          "Статус":
            STATUSES.PICK
        })
        .eq(
          'id',
          id
        )
        .select(
          BOX_SELECT
        )
        .single();


    if (error) {

      console.error(
        'Ошибка отправки коробки в подбор:',
        error
      );

      continue;

    }


    updateLocalBox(
      id,
      data
    );


    done++;

  }


  state.selectedIds.clear();


  render();


  toast(
    `Добавлено в подбор: ${done}`
  );

}

function getPickingBoxes() {

  return state.boxes.filter(
    row =>
      row.status ===
        STATUSES.PICK ||
      row.status ===
        STATUSES.RESERVED
  );

}

function getGroupedPickingBoxes() {

  const boxes =
    getPickingBoxes();

  const groups =
    new Map();


  for (const box of boxes) {

    const barcode =
      normalizeBarcode(
        box.barcode
      );

    const article =
      String(
        box.article || ''
      ).trim();

    const zone =
      String(
        box.zone_row || ''
      ).trim();

    const pallet =
      String(
        box.pallet || ''
      ).trim();

    const warehouse =
      String(
        box.warehouse || ''
      ).trim();


    /*
      Одна группа =
      штрихкод + артикул + зона/ряд +
      поддон + склад.

      Поэтому одинаковый штрихкод
      в разных зонах или на разных
      поддонах НЕ объединяется.
    */

    const key =
      [
        barcode,
        article,
        zone,
        pallet,
        warehouse
      ].join('|');


    if (!groups.has(key)) {

      groups.set(
        key,
        {
          key: key,

          barcode: barcode,

          article: article,

          zone_row: zone,

          pallet: pallet,

          warehouse: warehouse,

          status:
            box.status || '',

          count: 0,

          boxes: [],

          ids: []

        }
      );

    }


    const group =
      groups.get(key);


    group.count++;


    group.boxes.push(
      box
    );


    /*
      ID используется только
      внутри системы.

      Пользователю его
      не показываем.
    */

    if (
      box.id !== undefined &&
      box.id !== null
    ) {

      group.ids.push(
        box.id
      );

    }

  }


  return [
    ...groups.values()
  ];

}

function assemblyView() {

  /*
    Все физические коробки в подборе.
    Используем для общей статистики.
  */

  const pickingBoxes =
    getPickingBoxes();


  /*
    Сгруппированные коробки.

    Одна строка =
    штрихкод + артикул + зона/ряд +
    поддон + склад.
  */

  const pickingGroups =
    getGroupedPickingBoxes();


  /*
    Количество уже скомплектованных
    физических коробок.
  */

  const collected =
    state.boxes.filter(
      row =>
        row.status ===
        STATUSES.COLLECTED
    ).length;


  /*
    Выбранные группы.
  */

  const selectedGroupSet =
    state.assemblySelectedGroups
      ? state.assemblySelectedGroups
      : new Set();


  const selectedGroups =
    pickingGroups.filter(
      group =>
        selectedGroupSet.has(
          group.key
        )
    );


  /*
    Сколько физических коробок
    находится внутри выбранных групп.
  */

  const selectedBoxesCount =
    selectedGroups.reduce(
      (
        total,
        group
      ) =>
        total +
        (
          Number(group.count) || 0
        ),
      0
    );


  return `

    <div>


      <!-- ========================= -->
      <!-- СТАТИСТИКА -->
      <!-- ========================= -->

      <div class="cards">


        <div class="card">

          <div class="label">
            К подбору
          </div>

          <div class="value">
            ${pickingBoxes.length}
          </div>

          <div class="sub">
            Физических коробок
          </div>

        </div>


        <div class="card">

          <div class="label">
            Групп
          </div>

          <div class="value">
            ${pickingGroups.length}
          </div>

          <div class="sub">
            Штрихкод · зона · поддон
          </div>

        </div>


        <div class="card">

          <div class="label">
            Уже собрано
          </div>

          <div class="value">
            ${collected}
          </div>

          <div class="sub">
            Физических коробок
          </div>

        </div>


      </div>



      <!-- ========================= -->
      <!-- ТЕКУЩИЙ ПОДДОН -->
      <!-- ========================= -->

      <div
        class="panel"
        style="margin-top:14px"
      >

        <div class="section-title">

          <div>

            <h3>
              Текущий поддон
            </h3>

            <div class="muted">
              Если поддон указан,
              сканирование разрешено
              только для коробок этого поддона.
            </div>

          </div>

        </div>


        <div class="toolbar">

          <input
            id="currentPallet"
            class="search"
            style="max-width:300px"
            placeholder="Например: 1"
            value="${escapeHtml(
              state.currentPallet || ''
            )}"
          >


          <button
            class="ghost"
            id="clearPallet"
            type="button"
          >
            Сбросить
          </button>

        </div>

      </div>



      <!-- ========================= -->
      <!-- СКАНИРОВАНИЕ -->
      <!-- ========================= -->

      <div
        class="panel"
        style="margin-top:14px"
      >

        <div class="section-title">

          <div>

            <h3>
              Сканирование
            </h3>

            <div class="muted">
              Отсканируйте штрихкод коробки
            </div>

          </div>

        </div>


        <input
          id="scannerInput"
          class="search"
          style="
            width:100%;
            font-size:16px;
          "
          inputmode="none"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          placeholder="Сканируйте штрихкод..."
        >


        <div
          id="scannerResult"
          class="notice"
          style="
            margin-top:12px;
            margin-bottom:0;
          "
        >
          Готов к сканированию.
        </div>

      </div>



      <!-- ========================= -->
      <!-- РУЧНАЯ КОМПЛЕКТАЦИЯ -->
      <!-- ========================= -->

      <div
        class="panel"
        style="margin-top:14px"
      >

        <div class="section-title">

          <div>

            <h3>
              Ручная комплектация
            </h3>

           <div class="muted">

             Галочка выбирает всю группу.
             Кнопками − / + можно выбрать
             отдельное количество физических коробок.
             «Детали» показывает каждую коробку отдельно.

           </div>

          <div
            id="assemblySelectedCount"
            class="muted"
          >

            Выбрано:
            ${selectedGroups.length}
            групп ·
            ${selectedBoxesCount}
            коробок

          </div>

        </div>


        <div class="toolbar">


          <button
            class="ghost"
            id="selectAllAssembly"
            type="button"
          >
            ☑ Выбрать все
          </button>


          <button
            class="primary"
            id="completeSelectedAssembly"
            type="button"
          >
            ✓ Скомплектовать выбранные
          </button>


        </div>

      </div>



      <!-- ========================= -->
      <!-- КОРОБКИ В ПОДБОРЕ -->
      <!-- ========================= -->

      <div
        class="panel"
        style="margin-top:14px"
      >

        <div class="section-title">

          <div>

            <h3>
              Коробки в подборе
            </h3>

            <div class="muted">

              ${pickingGroups.length}
              групп ·
              ${pickingBoxes.length}
              коробок

            </div>

          </div>

        </div>


        <div class="table-wrap">

          <table class="data-table">


            <thead>

              <tr>


                <th
                  style="
                    width:45px;
                    text-align:center;
                  "
                >

                  <input
                    type="checkbox"
                    id="selectAllAssemblyCheckbox"
                    title="Выбрать все группы"
                  >

                </th>


                <th>
                  Штрихкод
                </th>


                <th>
                  Артикул
                </th>


                <th>
                  Зона/ряд
                </th>


                <th>
                  Поддон
                </th>


                <th>
                  Склад
                </th>


                <th>
                  Выбор
                </th>


                <th>
                  Детализация
                </th>


              </tr>

            </thead>


            <tbody>


              ${
                pickingGroups.length

                  ? pickingGroups
                      .slice(0, 300)
                      .map(pickingRow)
                      .join('')

                  : `

                    <tr>

                      <td
                        colspan="8"
                      >

                        <div class="empty">

                          В подборе пока
                          ничего нет

                        </div>

                      </td>

                    </tr>

                  `
              }


            </tbody>


          </table>

        </div>


        ${
          pickingGroups.length > 300

            ? `

              <div
                class="muted"
                style="
                  margin-top:10px;
                "
              >

                Показаны первые
                300 групп.

                Всего групп:
                ${pickingGroups.length}

              </div>

            `

            : ''
        }


      </div>


    </div>

  `;

}


function pickingRow(group) {

  const groupChecked =
    state.assemblySelectedGroups?.has(
      group.key
    )
      ? 'checked'
      : '';

  const selectedIds =
    state.assemblySelectedIds
      ? state.assemblySelectedIds
      : new Set();

  const selectedCount =
    group.ids.filter(
      id =>
        selectedIds.has(
          String(id)
        )
    ).length;

  const expanded =
    state.assemblyExpandedGroups?.has(
      group.key
    );

  const encodedKey =
    encodeURIComponent(
      group.key
    );

  const details =
    expanded
      ? `

        <tr>

          <td colspan="8">

            <div
              style="
                padding:10px 14px;
                background:#fafafa;
                border-top:1px solid #eee;
              "
            >

              <div
                style="
                  font-weight:700;
                  margin-bottom:8px;
                "
              >
                Физические коробки:
                ${group.boxes.length}
              </div>


              <div
                style="
                  display:flex;
                  flex-direction:column;
                  gap:5px;
                "
              >

                ${group.boxes.map(
                  box => {

                    const id =
                      String(
                        box.id
                      );

                    const checked =
                      selectedIds.has(
                        id
                      )
                        ? 'checked'
                        : '';

                    return `

                      <label
                        style="
                          display:flex;
                          align-items:center;
                          gap:8px;
                          padding:7px 9px;
                          background:white;
                          border:1px solid #eee;
                          border-radius:8px;
                          cursor:pointer;
                        "
                      >

                        <input
                          type="checkbox"
                          class="assembly-box-checkbox"
                          data-box-id="${escapeHtml(id)}"
                          ${checked}
                        >

                        <span>
                          ${escapeHtml(
                            box.barcode
                          )}
                        </span>

                        <span
                          class="muted"
                        >
                          ${escapeHtml(
                            box.zone_row
                          )}
                        </span>

                        <span
                          class="muted"
                        >
                          ${escapeHtml(
                            box.pallet
                          )}
                        </span>

                      </label>

                    `;

                  }
                ).join('')}

              </div>

            </div>

          </td>

        </tr>

      `
      : '';

  return `

    <tr>

      <td
        style="
          width:50px;
          text-align:center;
        "
      >

        <input
          type="checkbox"
          class="assembly-group-checkbox"
          data-group-key="${escapeHtml(
            encodedKey
          )}"
          ${groupChecked}
        >

      </td>


      <td>

        <b>
          ${escapeHtml(
            group.barcode
          )}
        </b>

      </td>


      <td>
        ${escapeHtml(
          group.article
        )}
      </td>


      <td>
        ${escapeHtml(
          group.zone_row
        )}
      </td>


      <td>
        <b>
          ${escapeHtml(
            group.pallet
          )}
        </b>
      </td>


      <td>
        ${escapeHtml(
          group.warehouse
        )}
      </td>


      <td>

        <div
          style="
            display:flex;
            align-items:center;
            gap:5px;
          "
        >

          <button
            type="button"
            class="assembly-qty-btn"
            data-action="minus"
            data-group-key="${escapeHtml(
              encodedKey
            )}"
          >
            −
          </button>


          <b
            style="
              min-width:28px;
              text-align:center;
            "
          >
            ${selectedCount}
          </b>


          <button
            type="button"
            class="assembly-qty-btn"
            data-action="plus"
            data-group-key="${escapeHtml(
              encodedKey
            )}"
          >
            +
          </button>


          <span
            class="muted"
            style="
              margin-left:5px;
            "
          >
            / ${group.count}
          </span>

        </div>

      </td>


      <td>

        <button
          type="button"
          class="sp-btn secondary assembly-details-btn"
          data-group-key="${escapeHtml(
            encodedKey
          )}"
        >
          ${
            expanded
              ? 'Скрыть'
              : 'Детали'
          }
        </button>

      </td>

    </tr>

    ${details}

  `;
}

function pickingRow(group) {

  const groupChecked =
    state.assemblySelectedGroups?.has(
      group.key
    )
      ? 'checked'
      : '';

  const selectedIds =
    state.assemblySelectedIds
      ? state.assemblySelectedIds
      : new Set();

  const selectedCount =
    group.ids.filter(
      id =>
        selectedIds.has(
          String(id)
        )
    ).length;

  const expanded =
    state.assemblyExpandedGroups?.has(
      group.key
    );

  const encodedKey =
    encodeURIComponent(
      group.key
    );

  const details =
    expanded
      ? `

        <tr>

          <td colspan="8">

            <div
              style="
                padding:10px 14px;
                background:#fafafa;
                border-top:1px solid #eee;
              "
            >

              <div
                style="
                  font-weight:700;
                  margin-bottom:8px;
                "
              >
                Физические коробки:
                ${group.boxes.length}
              </div>


              <div
                style="
                  display:flex;
                  flex-direction:column;
                  gap:5px;
                "
              >

                ${group.boxes.map(
                  box => {

                    const id =
                      String(
                        box.id
                      );

                    const checked =
                      selectedIds.has(
                        id
                      )
                        ? 'checked'
                        : '';

                    return `

                      <label
                        style="
                          display:flex;
                          align-items:center;
                          gap:8px;
                          padding:7px 9px;
                          background:white;
                          border:1px solid #eee;
                          border-radius:8px;
                          cursor:pointer;
                        "
                      >

                        <input
                          type="checkbox"
                          class="assembly-box-checkbox"
                          data-box-id="${escapeHtml(id)}"
                          ${checked}
                        >

                        <span>
                          ${escapeHtml(
                            box.barcode
                          )}
                        </span>

                        <span
                          class="muted"
                        >
                          ${escapeHtml(
                            box.zone_row
                          )}
                        </span>

                        <span
                          class="muted"
                        >
                          ${escapeHtml(
                            box.pallet
                          )}
                        </span>

                      </label>

                    `;

                  }
                ).join('')}

              </div>

            </div>

          </td>

        </tr>

      `
      : '';

  return `

    <tr>

      <td
        style="
          width:50px;
          text-align:center;
        "
      >

        <input
          type="checkbox"
          class="assembly-group-checkbox"
          data-group-key="${escapeHtml(
            encodedKey
          )}"
          ${groupChecked}
        >

      </td>


      <td>

        <b>
          ${escapeHtml(
            group.barcode
          )}
        </b>

      </td>


      <td>
        ${escapeHtml(
          group.article
        )}
      </td>


      <td>
        ${escapeHtml(
          group.zone_row
        )}
      </td>


      <td>
        <b>
          ${escapeHtml(
            group.pallet
          )}
        </b>
      </td>


      <td>
        ${escapeHtml(
          group.warehouse
        )}
      </td>


      <td>

        <div
          style="
            display:flex;
            align-items:center;
            gap:5px;
          "
        >

          <button
            type="button"
            class="assembly-qty-btn"
            data-action="minus"
            data-group-key="${escapeHtml(
              encodedKey
            )}"
          >
            −
          </button>


          <b
            style="
              min-width:28px;
              text-align:center;
            "
          >
            ${selectedCount}
          </b>


          <button
            type="button"
            class="assembly-qty-btn"
            data-action="plus"
            data-group-key="${escapeHtml(
              encodedKey
            )}"
          >
            +
          </button>


          <span
            class="muted"
            style="
              margin-left:5px;
            "
          >
            / ${group.count}
          </span>

        </div>

      </td>


      <td>

        <button
          type="button"
          class="sp-btn secondary assembly-details-btn"
          data-group-key="${escapeHtml(
            encodedKey
          )}"
        >
          ${
            expanded
              ? 'Скрыть'
              : 'Детали'
          }
        </button>

      </td>

    </tr>

    ${details}

  `;
}

function focusScanner() {

  const scanner =
    $('#scannerInput');


  if (!scanner) {

    return;

  }


  scanner.focus({
    preventScroll: true
  });

}

async function completeSelectedAssembly() {

  if (!state.assemblySelectedGroups) {
    state.assemblySelectedGroups = new Set();
  }

  if (!state.assemblySelectedIds) {
    state.assemblySelectedIds = new Set();
  }

  if (!state.assemblyExpandedGroups) {
    state.assemblyExpandedGroups = new Set();
  }

  // Собираем выбранные физические ID
  const ids = new Set(
    [...state.assemblySelectedIds].map(id => String(id))
  );

  // Если выбрана целая группа —
  // добавляем все физические коробки этой группы
  const groups = getGroupedPickingBoxes();

  groups.forEach(group => {

    if (
      state.assemblySelectedGroups.has(group.key)
    ) {

      group.ids.forEach(id => {
        ids.add(String(id));
      });

    }

  });

  const uniqueIds = [...ids];

  // Ничего не выбрано
  if (!uniqueIds.length) {

    toast(
      'Выберите коробки для комплектации',
      'error'
    );

    return;
  }

  // Проверяем, что коробки всё ещё находятся в КПодбору
  const validIds = uniqueIds.filter(id => {

    const row = state.boxes.find(
      box =>
        String(box.id) === String(id)
    );

    return (
      row &&
      row.status === STATUSES.PICK
    );

  });

  if (!validIds.length) {

    toast(
      'Выбранные коробки уже не находятся в подборе',
      'error'
    );

    state.assemblySelectedGroups.clear();
    state.assemblySelectedIds.clear();
    state.assemblyExpandedGroups.clear();

    render();

    return;
  }

  // Предлагаем сразу указать направление
  const direction = prompt(
    'Направление для скомплектованных коробок (можно оставить пустым):',
    ''
  );

  // Отмена
  if (direction === null) {
    return;
  }

  const cleanDirection = normalizeText(direction);

  const updateData = {
    "Статус": STATUSES.COLLECTED,
    "Изменил": state.user?.email || null
  };

  // Если направление указано —
  // сохраняем его
  if (cleanDirection) {

    updateData["Направление"] = cleanDirection;

  }

  // Переводим выбранные физические коробки
  // из КПодбору в Скомплектовано
  const {
    data,
    error
  } = await supabaseClient
    .from('boxes')
    .update(updateData)
    .in('id', validIds)
    .eq('Статус', STATUSES.PICK)
    .select(BOX_SELECT);

  // Ошибка Supabase
  if (error) {

    console.error(
      'Ошибка комплектации:',
      error
    );

    console.error(
      'Message:',
      error?.message
    );

    console.error(
      'Details:',
      error?.details
    );

    console.error(
      'Hint:',
      error?.hint
    );

    console.error(
      'Code:',
      error?.code
    );

    toast(
      error.message ||
      'Ошибка комплектации',
      'error'
    );

    return;
  }

  // Обновляем локальное состояние
  if (Array.isArray(data)) {

    data.forEach(row => {

      updateLocalBox(
        row.id,
        row
      );

    });

  }

  const completedCount =
    Array.isArray(data)
      ? data.length
      : validIds.length;

  // Очищаем выбор
  state.assemblySelectedGroups.clear();
  state.assemblySelectedIds.clear();
  state.assemblyExpandedGroups.clear();

  // Перерисовываем интерфейс
  render();

  // Сообщение
  toast(
    cleanDirection
      ? `Скомплектовано: ${completedCount} · ${cleanDirection}`
      : `Скомплектовано: ${completedCount}`
  );

}

function updateAssemblySelectedCount() {

  const element =
    $('#assemblySelectedCount');


  if (!element) {
    return;
  }


  const selectedGroups =
    state.assemblySelectedGroups
      ? state.assemblySelectedGroups
      : new Set();


  const groups =
    getGroupedPickingBoxes();


  const selected =
    groups.filter(
      group =>
        selectedGroups.has(
          group.key
        )
    );


  const groupCount =
    selected.length;


  const boxCount =
    selected.reduce(
      (
        total,
        group
      ) =>
        total +
        (
          Number(group.count) || 0
        ),
      0
    );


  element.textContent =
    `Выбрано: ${groupCount} групп · ${boxCount} коробок`;

}


/*
  Счётчик ручного выбора.

  Показываем одновременно:
  - количество выбранных групп;
  - количество физических коробок.
*/

function updateAssemblySelectedCount() {

  const element =
    $('#assemblySelectedCount');


  if (!element) {
    return;
  }


  const selectedGroups =
    state.assemblySelectedGroups
      ? state.assemblySelectedGroups
      : new Set();


  const groups =
    getGroupedPickingBoxes();


  const selected =
    groups.filter(
      group =>
        selectedGroups.has(
          group.key
        )
    );


  const groupCount =
    selected.length;


  const boxCount =
    selected.reduce(
      (
        total,
        group
      ) =>
        total +
        (
          Number(group.count) || 0
        ),
      0
    );


  element.textContent =
    `Выбрано: ${groupCount} групп · ${boxCount} коробок`;

}

function updateAssemblySelectedCount() {

  const element =
    $('#assemblySelectedCount');

  if (!element) {
    return;
  }

  const count =
    state.assemblySelectedIds
      ? state.assemblySelectedIds.size
      : 0;

  const groups =
    state.assemblySelectedGroups
      ? state.assemblySelectedGroups.size
      : 0;

  element.textContent =
    `Выбрано: ${count} коробок · ${groups} групп`;

}

async function processScan(
  barcode
) {

  barcode =
    normalizeBarcode(
      barcode
    );


  if (!barcode) {

    return;

  }


  /*
    Ищем коробку по штрихкоду
    только среди коробок, которые
    находятся в подборе.

    Поле pick больше не используется.
  */

  const candidates =
    state.boxes.filter(
      row =>
        normalizeBarcode(
          row.barcode
        ) === barcode &&
        (
          row.status ===
            STATUSES.PICK ||
          row.status ===
            STATUSES.RESERVED
        )
    );


  if (
    !candidates.length
  ) {

    showScannerResult(
      `Штрихкод ${barcode} не найден среди коробок к подбору.`,
      'error'
    );


    beep(false);

    focusScanner();

    return;

  }


  let box =
    null;


  /*
    Если выбран текущий поддон,
    разрешаем сканировать только
    коробку с этого поддона.
  */

  if (
    state.currentPallet
  ) {

    box =
      candidates.find(
        row =>
          normalizeText(
            row.pallet
          ).toLowerCase() ===
          normalizeText(
            state.currentPallet
          ).toLowerCase()
      );


    if (!box) {

      showScannerResult(
        `Коробка найдена, но она находится не на текущем поддоне "${state.currentPallet}".`,
        'error'
      );


      beep(false);

      focusScanner();

      return;

    }

  } else {

    box =
      candidates[0];

  }


  /*
    Отмечаем коробку как собранную.

    Используем реальные названия
    колонок Supabase.
  */

  const {
    data,
    error
  } =
    await supabaseClient
      .from('boxes')
      .update({

        "Статус":
          STATUSES.COLLECTED,

        "Изменил":
          state.user?.email ||
          null

      })
      .eq(
        'id',
        box.id
      )
      .select(
        BOX_SELECT
      )
      .single();


  if (error) {

    console.error(
      'Ошибка сканирования:',
      error
    );


    console.error(
      'Message:',
      error?.message
    );


    console.error(
      'Details:',
      error?.details
    );


    console.error(
      'Hint:',
      error?.hint
    );


    console.error(
      'Code:',
      error?.code
    );


    showScannerResult(
      error.message,
      'error'
    );


    beep(false);

    focusScanner();

    return;

  }


  /*
    Обновляем локальную коробку.
  */

  updateLocalBox(
    box.id,
    data
  );


  /*
    Показываем успешный результат.
  */

  showScannerResult(
    `✓ Коробка ${barcode} скомплектована`,
    'success'
  );


  beep(true);


  render();


  setTimeout(
    focusScanner,
    50
  );

}

function showScannerResult(
  message,
  type
) {

  const element =
    $('#scannerResult');


  if (!element) {

    return;

  }


  element.textContent =
    message;


  element.style.border =
    type === 'error'
      ? '2px solid #b42318'
      : '2px solid #18794e';

}


/* =========================================================
   BEEP
   ========================================================= */

function beep(
  success = true
) {

  try {

    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;


    if (!AudioContext) {

      return;

    }


    const context =
      new AudioContext();


    const oscillator =
      context.createOscillator();


    const gain =
      context.createGain();


    oscillator.connect(
      gain
    );


    gain.connect(
      context.destination
    );


    oscillator.frequency.value =
      success
        ? 1000
        : 250;


    oscillator.type =
      'sine';


    gain.gain.setValueAtTime(
      0.0001,
      context.currentTime
    );


    gain.gain.exponentialRampToValueAtTime(
      0.12,
      context.currentTime +
      0.01
    );


    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime +
      (
        success
          ? 0.12
          : 0.25
      )
    );


    oscillator.start();


    oscillator.stop(
      context.currentTime +
      (
        success
          ? 0.13
          : 0.26
      )
    );

  } catch (error) {

    console.warn(
      'Audio error:',
      error
    );

  }

}


/* =========================================================
   COLLECTED
   ========================================================= */

function collectedView() {

  const rows =
    state.boxes.filter(
      row =>
        row.status ===
        STATUSES.COLLECTED
    );


  const directions =
    [
      ...new Set(
        rows
          .map(row =>
            normalizeText(
              row.direction
            )
          )
          .filter(Boolean)
      )
    ].sort();


  return `

    <div
      class="sp-toolbar"
      style="
        flex-wrap:wrap;
      "
    >

      <div>

        Собрано:
        <b>
          ${rows.length}
        </b>

      </div>


      <select
        id="collectedDirectionFilter"
      >

        <option value="">
          Все направления
        </option>

        ${directions.map(
          direction => `

            <option
              value="${escapeHtml(
                direction
              )}"
            >
              ${escapeHtml(
                direction
              )}
            </option>

          `
        ).join('')}

      </select>


      <button
        class="sp-btn secondary"
        id="selectAllCollectedBtn"
        ${
          rows.length
            ? ''
            : 'disabled'
        }
      >
        ☑ Выбрать все
      </button>


      <button
        class="sp-btn"
        id="setCollectedDirectionBtn"
        ${
          rows.length
            ? ''
            : 'disabled'
        }
      >
        🏷 Назначить направление
      </button>


      <button
        class="sp-btn success"
        id="shipCollectedBtn"
        ${
          rows.length
            ? ''
            : 'disabled'
        }
      >
        Отгрузить выбранные
      </button>

    </div>


    <div class="sp-table-wrap">

      <table class="sp-table">

        <thead>

          <tr>

            <th>

              <input
                type="checkbox"
                id="selectAllCollectedCheck"
                title="Выбрать все"
                ${
                  rows.length
                    ? ''
                    : 'disabled'
                }
              >

            </th>

            <th>
              Штрихкод
            </th>

            <th>
              Артикул
            </th>

            <th>
              Зона / ряд
            </th>

            <th>
              Поддон
            </th>

            <th>
              Склад
            </th>

            <th>
              Направление
            </th>

            <th>
              Работник
            </th>

            <th>
              Дата
            </th>

          </tr>

        </thead>


        <tbody>

          ${
            rows.length

              ? rows
                  .map(
                    collectedRow
                  )
                  .join('')

              : `

                <tr>

                  <td colspan="9">

                    <div class="sp-empty">
                      Собранных коробок нет
                    </div>

                  </td>

                </tr>

              `
          }

        </tbody>

      </table>

    </div>

  `;
}


function collectedRow(row) {

  const id =
    String(row.id);

  return `

    <tr>

      <td>

        <input
          type="checkbox"
          class="collected-check"
          data-id="${escapeHtml(id)}"
        >

      </td>


      <td>

        <b>
          ${escapeHtml(
            row.barcode
          )}
        </b>

      </td>


      <td>
        ${escapeHtml(
          row.article
        )}
      </td>


      <td>
        ${escapeHtml(
          row.zone_row
        )}
      </td>


      <td>
        ${escapeHtml(
          row.pallet
        )}
      </td>


      <td>
        ${escapeHtml(
          row.warehouse
        )}
      </td>


      <td>

        ${
          row.direction

            ? `
              <span
                style="
                  display:inline-flex;
                  padding:4px 9px;
                  border-radius:999px;
                  background:#eef2ff;
                  font-weight:600;
                  font-size:12px;
                "
              >
                🏷
                ${escapeHtml(
                  row.direction
                )}
              </span>
            `

            : `
              <span class="sp-muted">
                —
              </span>
            `
        }

      </td>


      <td>
        ${escapeHtml(
          row.worker
        )}
      </td>


      <td>
        ${escapeHtml(
          formatDate(
            row.date
          )
        )}
      </td>

    </tr>

  `;
}

/* =========================================================
   SELECT ALL COLLECTED
   ========================================================= */

function toggleAllCollected() {

  const checkboxes =
    $all('.collected-check');

  if (!checkboxes.length) {
    return;
  }


  const headerCheckbox =
    document.getElementById(
      'selectAllCollectedCheck'
    );


  const shouldCheck =
    headerCheckbox
      ? headerCheckbox.checked
      : true;


  checkboxes.forEach(
    checkbox => {

      checkbox.checked =
        shouldCheck;

    }
  );

}

async function setDirectionForCollected() {

  const ids =
    $all('.collected-check')
      .filter(
        checkbox =>
          checkbox.checked
      )
      .map(
        checkbox =>
          checkbox.dataset.id
      );


  if (!ids.length) {

    toast(
      'Выберите собранные коробки',
      'error'
    );

    return;
  }


  const direction =
    prompt(
      'Введите направление:',
      ''
    );


  if (
    direction === null
  ) {
    return;
  }


  const value =
    normalizeText(
      direction
    );


  if (!value) {

    toast(
      'Направление не указано',
      'error'
    );

    return;
  }


  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('boxes')
        .update({
          "Направление":
            value,

          "Изменил":
            state.user?.email ||
            null
        })
        .in(
          'id',
          ids
        )
        .eq(
          'Статус',
          STATUSES.COLLECTED
        )
        .select(
          BOX_SELECT
        );


    if (error) {
      throw error;
    }


    if (
      Array.isArray(data)
    ) {

      data.forEach(
        row => {

          updateLocalBox(
            row.id,
            row
          );

        }
      );

    }


    render();


    toast(
      `Направление "${value}" назначено: ${data?.length || ids.length}`
    );


  } catch (error) {

    console.error(
      'setDirectionForCollected:',
      error
    );

    toast(
      error?.message ||
      'Ошибка назначения направления',
      'error'
    );

  }

}

function setupCollected() {

  $('#shipCollectedBtn')
    ?.addEventListener(
      'click',
      shipSelectedCollected
    );


$('#selectAllCollectedBtn')
  ?.addEventListener(
    'click',
    () => {

      const checkboxes =
        $all('.collected-check');

      if (!checkboxes.length) {
        return;
      }


      const allChecked =
        checkboxes.every(
          checkbox =>
            checkbox.checked
        );


      checkboxes.forEach(
        checkbox => {

          checkbox.checked =
            !allChecked;

        }
      );


      const headerCheckbox =
        document.getElementById(
          'selectAllCollectedCheck'
        );


      if (headerCheckbox) {

        headerCheckbox.checked =
          !allChecked;

      }

    }
  );


$('#selectAllCollectedCheck')
  ?.addEventListener(
    'change',
    toggleAllCollected
  );


$('#setCollectedDirectionBtn')
  ?.addEventListener(
    'click',
    setDirectionForCollected
  );


  $('#collectedDirectionFilter')
    ?.addEventListener(
      'change',
      event => {

        const direction =
          normalizeText(
            event.target.value
          );

        document
          .querySelectorAll(
            '.collected-check'
          )
          .forEach(
            checkbox => {

              const id =
                String(
                  checkbox.dataset.id
                );

              const row =
                state.boxes.find(
                  box =>
                    String(box.id) ===
                    id
                );

              if (!row) {
                return;
              }

              const visible =
                !direction ||
                normalizeText(
                  row.direction
                ) ===
                direction;

              const tr =
                checkbox.closest(
                  'tr'
                );

              if (tr) {
                tr.style.display =
                  visible
                    ? ''
                    : 'none';
              }

            }
          );

      }
    );

}


async function shipSelectedCollected() {

  const ids =
    $all('.collected-check')
      .filter(
        checkbox =>
          checkbox.checked
      )
      .map(
        checkbox =>
          checkbox.dataset.id
      );


  if (!ids.length) {

    toast(
      'Выберите коробки для отгрузки',
      'error'
    );

    return;

  }


  if (
    !confirm(
      `Отгрузить выбранные коробки: ${ids.length}?`
    )
  ) {

    return;

  }


  let shipped =
    0;


  for (
    const id of ids
  ) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('boxes')
        .update({

          "Статус":
            STATUSES.SHIPPED

        })
        .eq(
          'id',
          id
        )
        .eq(
          'Статус',
          STATUSES.COLLECTED
        )
        .select(
          BOX_SELECT
        )
        .single();


    if (error) {

      console.error(
        'Ошибка отгрузки:',
        error
      );

      console.error(
        'Message:',
        error?.message
      );

      console.error(
        'Details:',
        error?.details
      );

      console.error(
        'Hint:',
        error?.hint
      );

      console.error(
        'Code:',
        error?.code
      );

      continue;

    }


    updateLocalBox(
      id,
      data
    );


    shipped++;

  }


  render();


  toast(
    `Отгружено: ${shipped}`
  );

}

/* =========================================================
   RECEIVED
   ========================================================= */

function receivedView() {

  ensureReceivingStyles();   
   
  const warehouses =
    state.receivingWarehouses || [];

  const locations =
    state.receivingLocations || [];

  const pallets =
    state.receivingPallets || [];


  const currentWarehouse =
    warehouses.find(
      row =>
        String(row.id) ===
        String(
          state.receivingWarehouseId
        )
    );


  const currentLocation =
    locations.find(
      row =>
        String(row.id) ===
        String(
          state.receivingLocationId
        )
    );


  const currentPallet =
    pallets.find(
      row =>
        String(row.id) ===
        String(
          state.receivingPalletId
        )
    );


  const warehouseLocations =
    locations.filter(
      location =>
        String(
          location.warehouse_id
        ) ===
        String(
          state.receivingWarehouseId
        )
    );


  const scannedCount =
    state.receivingScannedIds.length;


  const isOpen =
    Boolean(
      state.receivingReceiptId &&
      state.receivingReceiptStatus ===
        'В процессе'
    );


  const canStart =
    Boolean(
      state.receivingWarehouseId &&
      state.receivingLocationId &&
      normalizeText(
        state.receivingPalletNumber
      )
    );


  const statusText =
    isOpen
      ? 'Приёмка открыта'
      : 'Приёмка не открыта';


  return `

    <div class="sp-receiving-page">

      <!-- ==========================================
           HEADER
           ========================================== -->

      <div class="sp-receiving-hero">

        <div>

          <div class="sp-receiving-eyebrow">
            ПРИЁМКА
          </div>

          <h1 class="sp-receiving-title">
            Приёмка товара
          </h1>

          <p class="sp-receiving-subtitle">
            Склад → место → поддон → сканирование коробок
          </p>

        </div>


        <div class="
          sp-receiving-status
          ${isOpen ? 'is-open' : 'is-closed'}
        ">

          <span class="sp-status-dot"></span>

          ${statusText}

        </div>

      </div>


      <!-- ==========================================
           ERROR
           ========================================== -->

      ${
        state.receivingDataError
          ? `

            <div class="sp-receiving-error">

              <div class="sp-receiving-error-icon">
                !
              </div>

              <div>

                <strong>
                  Не удалось загрузить данные
                </strong>

                <div>
                  ${escapeHtml(
                    state.receivingDataError
                  )}
                </div>

              </div>

              <button
                class="sp-btn secondary"
                id="reloadReceivingDataBtn"
                type="button"
              >
                Повторить
              </button>

            </div>

          `
          : ''
      }


      <!-- ==========================================
           LOADING
           ========================================== -->

      ${
        state.receivingDataLoading
          ? `

            <div class="sp-receiving-loading">

              <div class="sp-receiving-spinner"></div>

              <div>
                Загружаем склады и места...
              </div>

            </div>

          `
          : ''
      }


      <!-- ==========================================
           LOCATION CARD
           ========================================== -->

      <section class="sp-receiving-card">

        <div class="sp-section-header">

          <div>

            <div class="sp-section-kicker">
              01
            </div>

            <h2>
              Место приёмки
            </h2>

          </div>

          <div class="sp-section-caption">
            Куда разместить поступившие коробки
          </div>

        </div>


        <div class="sp-receiving-form">


          <!-- СКЛАД -->

          <div class="sp-receiving-field">

            <label for="receivingWarehouse">
              Склад
            </label>

            <select
              id="receivingWarehouse"
              ${
                isOpen
                  ? 'disabled'
                  : ''
              }
            >

              <option value="">
                ${
                  state.receivingDataLoading
                    ? 'Загрузка складов...'
                    : warehouses.length
                      ? 'Выберите склад'
                      : 'Склады не найдены'
                }
              </option>

              ${
                warehouses
                  .map(
                    warehouse => `

                      <option
                        value="${escapeHtml(
                          warehouse.id
                        )}"
                        ${
                          String(
                            warehouse.id
                          ) ===
                          String(
                            state.receivingWarehouseId
                          )
                            ? 'selected'
                            : ''
                        }
                      >
                        ${escapeHtml(
                          warehouse.name
                        )}
                      </option>

                    `
                  )
                  .join('')
              }

            </select>

            <button
              type="button"
              class="sp-btn secondary"
              id="createReceivingLocationBtn"
              style="
                margin-top:8px;
                width:100%;
              "
              ${
                isOpen ||
                !state.receivingWarehouseId
                  ? 'disabled'
                  : ''
              }
            >
              + Новая зона / ряд
            </button>

          </div>


          <!-- МЕСТО -->

          <div class="sp-receiving-field">

            <label for="receivingLocation">
              Место
            </label>

            <select
              id="receivingLocation"
              ${
                isOpen ||
                !state.receivingWarehouseId
                  ? 'disabled'
                  : ''
              }
            >

              <option value="">

                ${
                  !state.receivingWarehouseId
                    ? 'Сначала выберите склад'
                    : warehouseLocations.length
                      ? 'Выберите место'
                      : 'Места не найдены'
                }

              </option>

              ${
                warehouseLocations
                  .map(
                    location => `

                      <option
                        value="${escapeHtml(
                          location.id
                        )}"
                        ${
                          String(
                            location.id
                          ) ===
                          String(
                            state.receivingLocationId
                          )
                            ? 'selected'
                            : ''
                        }
                      >

                        ${escapeHtml(
                          location.code
                        )}

                      </option>

                    `
                  )
                  .join('')
              }

            </select>

          </div>


          <!-- ПОДДОН -->

          <div class="sp-receiving-field">

            <label for="receivingPalletNumber">
              Номер поддона
            </label>

            <input
              id="receivingPalletNumber"
              type="text"
              inputmode="text"
              placeholder="Например 1"
              value="${escapeHtml(
                state.receivingPalletNumber
              )}"
              ${
                isOpen
                  ? 'disabled'
                  : ''
              }
              autocomplete="off"
            >

          </div>


        </div>


        <!-- ACTIONS -->

        <div class="sp-receiving-actions">

          ${
            !isOpen
              ? `

                <button
                  class="sp-btn sp-btn-primary sp-receiving-open-btn"
                  id="startReceivingBtn"
                  type="button"
                  ${
                    canStart &&
                    !state.receivingLoading
                      ? ''
                      : 'disabled'
                  }
                >

                  <span>
                    Открыть приёмку
                  </span>

                  <span class="sp-btn-arrow">
                    →
                  </span>

                </button>

              `
              : `

                <button
                  class="sp-btn danger sp-receiving-close-btn"
                  id="closeReceivingBtn"
                  type="button"
                >

                  Завершить приёмку

                </button>

              `
          }

        </div>

      </section>


      <!-- ==========================================
           CURRENT LOCATION
           ========================================== -->

      <section class="sp-receiving-card">

        <div class="sp-section-header">

          <div>

            <div class="sp-section-kicker">
              02
            </div>

            <h2>
              Текущая локация
            </h2>

          </div>

        </div>


        <div class="sp-location-summary">


          <div class="sp-location-item">

            <span>
              Склад
            </span>

            <strong>
              ${
                currentWarehouse
                  ? escapeHtml(
                      currentWarehouse.name
                    )
                  : '—'
              }
            </strong>

          </div>


          <div class="sp-location-item">

            <span>
              Место
            </span>

            <strong>
              ${
                currentLocation
                  ? escapeHtml(
                      currentLocation.code
                    )
                  : '—'
              }
            </strong>

          </div>


          <div class="sp-location-item">

            <span>
              Поддон
            </span>

            <strong>
              ${
                currentPallet
                  ? escapeHtml(
                      currentPallet.pallet_number
                    )
                  : state.receivingPalletNumber
                    ? escapeHtml(
                        state.receivingPalletNumber
                      )
                    : '—'
              }
            </strong>

          </div>


          <div class="sp-location-item">

            <span>
              Принято
            </span>

            <strong class="sp-location-count">
              ${scannedCount}
            </strong>

          </div>


        </div>

      </section>


      ${
        isOpen
          ? `

            <!-- ==========================================
                 SCANNER
                 ========================================== -->

            <section class="sp-receiving-card sp-scanner-card">

              <div class="sp-section-header">

                <div>

                  <div class="sp-section-kicker">
                    03
                  </div>

                  <h2>
                    Сканирование
                  </h2>

                </div>

                <div class="sp-scanner-counter">

                  <strong>
                    ${scannedCount}
                  </strong>

                  <span>
                    коробок
                  </span>

                </div>

              </div>


              <div class="sp-receiving-scanner">

                <input
                  id="receivingScannerInput"
                  class="sp-receiving-scanner-input"
                  inputmode="none"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                  placeholder="Сканируйте штрихкод..."
                >


                <div
                  id="receivingScannerResult"
                  class="sp-receiving-scanner-result"
                >
                  Готов к сканированию
                </div>

              </div>

            </section>


            <!-- ==========================================
                 RECENT SCANS
                 ========================================== -->

            <section class="sp-receiving-card">

              <div class="sp-section-header">

                <div>

                  <div class="sp-section-kicker">
                    04
                  </div>

                  <h2>
                    Последние коробки
                  </h2>

                </div>

              </div>


              ${
                state.receivingRecentScans.length
                  ? `

                    <div class="sp-recent-scans">

                      ${
                        state.receivingRecentScans
                          .map(
                            item => `

                              <div class="sp-recent-scan">

                                <div>

                                  <strong>
                                    ${escapeHtml(
                                      item.barcode
                                    )}
                                  </strong>

                                  <span>
                                    Коробка принята
                                  </span>

                                </div>

                                <time>
                                  ${escapeHtml(
                                    item.time || ''
                                  )}
                                </time>

                              </div>

                            `
                          )
                          .join('')
                      }

                    </div>

                  `
                  : `

                    <div class="sp-empty-receiving">
                      Пока ни одной коробки
                    </div>

                  `
              }

            </section>

          `
          : `

            <div class="sp-receiving-hint">

              <div class="sp-receiving-hint-icon">
                ↓
              </div>

              <div>

                <strong>
                  Приёмка готова к запуску
                </strong>

                <span>
                  Выберите склад, место и номер поддона,
                  затем откройте приёмку.
                </span>

              </div>

            </div>

          `
      }

    </div>

  `;
}

/* =========================================================
   SHIPPED
   ========================================================= */

function shippedView() {

  const rows =
    state.boxes
      .filter(
        row =>
          row.status ===
          STATUSES.SHIPPED
      )
      .slice(-500)
      .reverse();


  return `

    <div class="sp-card">

      <div class="sp-card-label">
        Всего отгружено
      </div>

      <div class="sp-big-number">

        ${
          state.boxes.filter(
            row =>
              row.status ===
              STATUSES.SHIPPED
          ).length
        }

      </div>

    </div>


    <br>


    <div class="sp-table-wrap">

      <table class="sp-table">

        <thead>

          <tr>

            <th>Штрихкод</th>
            <th>Артикул</th>
            <th>Зона/ряд</th>
            <th>Поддон</th>
            <th>Склад</th>
            <th>Дата</th>

          </tr>

        </thead>


        <tbody>

          ${rows.map(
            row => `

              <tr>

                <td>
                  <b>
                    ${escapeHtml(
                      row.barcode
                    )}
                  </b>
                </td>

                <td>
                  ${escapeHtml(
                    row.article
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.zone_row
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.pallet
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.warehouse
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    formatDate(row.date)
                  )}
                </td>

              </tr>

            `
          ).join('')}

        </tbody>

      </table>

    </div>

  `;

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function dashboardView() {

  const total =
    state.boxes.length;


  const stock =
    countStatus(
      STATUSES.STOCK
    );


  const picking =
    countStatus(
      STATUSES.PICK
    );


  const collected =
    countStatus(
      STATUSES.COLLECTED
    );


  const shipped =
    countStatus(
      STATUSES.SHIPPED
    );


  const reserved =
    countStatus(
      STATUSES.RESERVED
    );


  const warehouses =
    new Set(
      state.boxes
        .map(
          row =>
            row.warehouse
        )
        .filter(Boolean)
    ).size;


  const articles =
    new Set(
      state.boxes
        .map(
          row =>
            row.article
        )
        .filter(Boolean)
    ).size;


  const pallets =
    new Set(
      state.boxes
        .map(
          row =>
            row.pallet
        )
        .filter(Boolean)
    ).size;


  return `

    <!-- =====================================================
         НОВАЯ ЗАЯВКА
         ===================================================== -->

    <div
      class="sp-card"
      style="
        margin-bottom:20px;
        overflow:hidden;
      "
    >

      <!-- HEADER -->

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:20px;
          flex-wrap:wrap;
          margin-bottom:16px;
        "
      >

        <div>

          <h2
            style="
              margin:0 0 6px;
              font-size:20px;
            "
          >
            📦 Новая заявка
          </h2>

          <div class="sp-muted">
            Импортируйте Excel или вставьте заявку вручную.
            Система сама определит количество физических коробок.
          </div>

        </div>


        <div
          style="
            padding:8px 12px;
            background:#f5f5f5;
            border-radius:10px;
            font-size:12px;
            color:#666;
            white-space:nowrap;
          "
        >
          1 штрихкод = 1 коробка
        </div>

      </div>


      <!-- ===================================================
           IMPORT
           =================================================== -->

      <div
        style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-bottom:12px;
        "
      >

        <button
          type="button"
          class="ghost"
          onclick="
            document
              .getElementById('requestExcelInput')
              .click()
          "
        >
          📥 Импорт заявки Excel
        </button>


        <input
          type="file"
          id="requestExcelInput"
          accept=".xlsx,.xls,.csv"
          style="display:none"
          onchange="importRequestExcel(event)"
        >

      </div>


      <!-- ===================================================
           TEXTAREA
           =================================================== -->

      <textarea
        id="requestBarcodes"
        placeholder="Вставьте заявку сюда...

Можно:
4810122595003
4810122595003
4810122595003

или:

4810122595003 - 3
4810122659354 - 2

Excel:
Штрихкод | Количество"
        style="
          width:100%;
          min-height:150px;
          box-sizing:border-box;
          resize:vertical;
          border:1px solid #ddd;
          border-radius:12px;
          padding:14px;
          font-family:monospace;
          font-size:14px;
          line-height:1.6;
          outline:none;
        "
      ></textarea>


      <!-- ===================================================
           REQUEST PREVIEW
           =================================================== -->

      <div
        id="requestPreview"
        style="
          display:none;
          margin-top:16px;
          border:1px solid #e5e5e5;
          border-radius:14px;
          overflow:hidden;
        "
      >

        <div
          style="
            padding:14px 16px;
            background:#f8f8f8;
            border-bottom:1px solid #e5e5e5;
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
          "
        >

          <div>

            <div
              style="
                font-weight:600;
                font-size:14px;
              "
            >
              📋 Предпросмотр заявки
            </div>

            <div
              id="requestPreviewSummary"
              class="sp-muted"
              style="
                margin-top:4px;
                font-size:12px;
              "
            >
              0 позиций · 0 коробок
            </div>

          </div>


          <button
            type="button"
            class="ghost"
            onclick="clearRequestPreview()"
            style="
              font-size:12px;
            "
          >
            Очистить
          </button>

        </div>


        <div
          style="
            max-height:300px;
            overflow:auto;
          "
        >

          <table
            class="sp-table"
            style="
              margin:0;
              width:100%;
            "
          >

            <thead>

              <tr>

                <th>
                  Штрихкод
                </th>

                <th
                  style="
                    width:100px;
                    text-align:center;
                  "
                >
                  Кол-во
                </th>

                <th
                  style="
                    width:50px;
                  "
                >
                </th>

              </tr>

            </thead>


            <tbody
              id="requestPreviewBody"
            >
            </tbody>


            <tfoot>

              <tr>

                <td
                  style="
                    font-weight:600;
                  "
                >
                  ИТОГО
                </td>

                <td
                  id="requestPreviewTotal"
                  style="
                    text-align:center;
                    font-weight:700;
                  "
                >
                  0
                </td>

                <td>
                </td>

              </tr>

            </tfoot>

          </table>

        </div>

      </div>


      <!-- ===================================================
           ACTIONS
           =================================================== -->

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          flex-wrap:wrap;
          margin-top:14px;
        "
      >

        <div
          class="sp-muted"
          style="
            font-size:12px;
          "
        >
          Excel должен содержать колонки
          <b>Штрихкод</b> и <b>Количество</b>.
        </div>


        <button
          class="sp-btn success"
          id="createPickingBtn"
          onclick="createPickingFromRequest()"
          style="
            min-width:240px;
            min-height:46px;
            font-size:14px;
          "
        >
          📦 Сформировать подбор
        </button>

      </div>

    </div>


    <!-- =====================================================
         DASHBOARD
         ===================================================== -->

    <div
      style="
        margin-bottom:20px;
      "
    >

      <!-- ===================================================
           DASHBOARD HEADER
           =================================================== -->

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:flex-end;
          gap:20px;
          flex-wrap:wrap;
          margin-bottom:14px;
        "
      >

        <div>

          <div
            style="
              font-size:12px;
              font-weight:700;
              letter-spacing:.08em;
              text-transform:uppercase;
              color:#888;
              margin-bottom:5px;
            "
          >
            SKLADAPLAN
          </div>

          <h2
            style="
              margin:0;
              font-size:24px;
              line-height:1.15;
            "
          >
            Состояние склада
          </h2>

          <div
            class="sp-muted"
            style="
              margin-top:5px;
            "
          >
            Основные показатели и текущая ситуация
          </div>

        </div>


        <div
          style="
            font-size:12px;
            color:#888;
          "
        >
          Всего физических коробок:

          <b
            style="
              color:#111;
              font-size:14px;
            "
          >
            ${total}
          </b>

        </div>

      </div>


      <!-- ===================================================
           ОСНОВНЫЕ KPI
           =================================================== -->

      <div
        class="sp-dashboard-kpi-grid"
        style="
          display:grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0,1fr)
            );
          gap:12px;
          margin-bottom:12px;
        "
      >


        <!-- НА СКЛАДЕ -->

        <div
          class="sp-card"
          style="
            margin:0;
            padding:20px;
          "
        >

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              gap:10px;
            "
          >

            <div>

              <div
                class="sp-card-label"
                style="
                  margin-bottom:6px;
                "
              >
                На складе
              </div>

              <div
                style="
                  font-size:32px;
                  line-height:1;
                  font-weight:750;
                "
              >
                ${stock}
              </div>

            </div>


            <div
              style="
                width:38px;
                height:38px;
                border-radius:11px;
                background:#f2f2f2;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:18px;
              "
            >
              ●
            </div>

          </div>


          <div
            style="
              margin-top:12px;
              height:4px;
              border-radius:10px;
              background:#eee;
              overflow:hidden;
            "
          >

            <div
              style="
                width:${total ? Math.min(100, stock / total * 100) : 0}%;
                height:100%;
                background:#111;
                border-radius:10px;
              "
            ></div>

          </div>

        </div>


        <!-- К СБОРКЕ -->

        <div
          class="sp-card"
          style="
            margin:0;
            padding:20px;
          "
        >

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              gap:10px;
            "
          >

            <div>

              <div
                class="sp-card-label"
                style="
                  margin-bottom:6px;
                "
              >
                К сборке
              </div>

              <div
                style="
                  font-size:32px;
                  line-height:1;
                  font-weight:750;
                "
              >
                ${picking}
              </div>

            </div>


            <div
              style="
                width:38px;
                height:38px;
                border-radius:11px;
                background:#f2f2f2;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:18px;
              "
            >
              ◫
            </div>

          </div>


          <div
            style="
              margin-top:12px;
              height:4px;
              border-radius:10px;
              background:#eee;
              overflow:hidden;
            "
          >

            <div
              style="
                width:${total ? Math.min(100, picking / total * 100) : 0}%;
                height:100%;
                background:#111;
                border-radius:10px;
              "
            ></div>

          </div>

        </div>


        <!-- СОБРАНО -->

        <div
          class="sp-card"
          style="
            margin:0;
            padding:20px;
          "
        >

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              gap:10px;
            "
          >

            <div>

              <div
                class="sp-card-label"
                style="
                  margin-bottom:6px;
                "
              >
                Скомплектовано
              </div>

              <div
                style="
                  font-size:32px;
                  line-height:1;
                  font-weight:750;
                "
              >
                ${collected}
              </div>

            </div>


            <div
              style="
                width:38px;
                height:38px;
                border-radius:11px;
                background:#f2f2f2;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:18px;
              "
            >
              ✓
            </div>

          </div>


          <div
            style="
              margin-top:12px;
              height:4px;
              border-radius:10px;
              background:#eee;
              overflow:hidden;
            "
          >

            <div
              style="
                width:${total ? Math.min(100, collected / total * 100) : 0}%;
                height:100%;
                background:#111;
                border-radius:10px;
              "
            ></div>

          </div>

        </div>


        <!-- УБЫЛО -->

        <div
          class="sp-card"
          style="
            margin:0;
            padding:20px;
          "
        >

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              gap:10px;
            "
          >

            <div>

              <div
                class="sp-card-label"
                style="
                  margin-bottom:6px;
                "
              >
                Убыло
              </div>

              <div
                style="
                  font-size:32px;
                  line-height:1;
                  font-weight:750;
                "
              >
                ${shipped}
              </div>

            </div>


            <div
              style="
                width:38px;
                height:38px;
                border-radius:11px;
                background:#f2f2f2;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:18px;
              "
            >
              ↑
            </div>

          </div>


          <div
            style="
              margin-top:12px;
              height:4px;
              border-radius:10px;
              background:#eee;
              overflow:hidden;
            "
          >

            <div
              style="
                width:${total ? Math.min(100, shipped / total * 100) : 0}%;
                height:100%;
                background:#111;
                border-radius:10px;
              "
            ></div>

          </div>

        </div>

      </div>


      <!-- ===================================================
           ДВЕ КОЛОНКИ
           =================================================== -->

      <div
        class="sp-dashboard-columns"
        style="
          display:grid;
          grid-template-columns:
            minmax(0,1.35fr)
            minmax(280px,.65fr);
          gap:12px;
        "
      >


        <!-- СОСТОЯНИЕ КОРОБОК -->

        <div
          class="sp-card"
          style="
            margin:0;
          "
        >

          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:10px;
              margin-bottom:18px;
            "
          >

            <div>

              <div
                style="
                  font-size:16px;
                  font-weight:700;
                "
              >
                Состояние коробок
              </div>

              <div
                class="sp-muted"
                style="
                  font-size:12px;
                  margin-top:3px;
                "
              >
                Распределение по текущему статусу
              </div>

            </div>

          </div>


          <!-- НА СКЛАДЕ -->

          <div
            style="
              margin-bottom:14px;
            "
          >

            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:10px;
                margin-bottom:6px;
                font-size:13px;
              "
            >

              <span>
                На складе
              </span>

              <b>
                ${stock}
              </b>

            </div>


            <div
              style="
                height:8px;
                background:#eee;
                border-radius:20px;
                overflow:hidden;
              "
            >

              <div
                style="
                  width:${total ? stock / total * 100 : 0}%;
                  height:100%;
                  background:#111;
                  border-radius:20px;
                "
              ></div>

            </div>

          </div>


          <!-- К СБОРКЕ -->

          <div
            style="
              margin-bottom:14px;
            "
          >

            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:10px;
                margin-bottom:6px;
                font-size:13px;
              "
            >

              <span>
                К сборке
              </span>

              <b>
                ${picking}
              </b>

            </div>


            <div
              style="
                height:8px;
                background:#eee;
                border-radius:20px;
                overflow:hidden;
              "
            >

              <div
                style="
                  width:${total ? picking / total * 100 : 0}%;
                  height:100%;
                  background:#555;
                  border-radius:20px;
                "
              ></div>

            </div>

          </div>


          <!-- СКОМПЛЕКТОВАНО -->

          <div
            style="
              margin-bottom:14px;
            "
          >

            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:10px;
                margin-bottom:6px;
                font-size:13px;
              "
            >

              <span>
                Скомплектовано
              </span>

              <b>
                ${collected}
              </b>

            </div>


            <div
              style="
                height:8px;
                background:#eee;
                border-radius:20px;
                overflow:hidden;
              "
            >

              <div
                style="
                  width:${total ? collected / total * 100 : 0}%;
                  height:100%;
                  background:#777;
                  border-radius:20px;
                "
              ></div>

            </div>

          </div>


          <!-- ОТГРУЖЕНО -->

          <div>

            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:10px;
                margin-bottom:6px;
                font-size:13px;
              "
            >

              <span>
                Отгружено
              </span>

              <b>
                ${shipped}
              </b>

            </div>


            <div
              style="
                height:8px;
                background:#eee;
                border-radius:20px;
                overflow:hidden;
              "
            >

              <div
                style="
                  width:${total ? shipped / total * 100 : 0}%;
                  height:100%;
                  background:#999;
                  border-radius:20px;
                "
              ></div>

            </div>

          </div>

        </div>


        <!-- ИНФОРМАЦИЯ -->

        <div
          class="sp-card"
          style="
            margin:0;
          "
        >

          <div
            style="
              font-size:16px;
              font-weight:700;
              margin-bottom:16px;
            "
          >
            Информация
          </div>


          <div
            style="
              display:grid;
              gap:1px;
              background:#eee;
              border:1px solid #eee;
              border-radius:12px;
              overflow:hidden;
            "
          >

            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:12px;
                background:#fff;
                font-size:13px;
              "
            >

              <span class="sp-muted">
                Всего коробок
              </span>

              <b>
                ${total}
              </b>

            </div>


            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:12px;
                background:#fff;
                font-size:13px;
              "
            >

              <span class="sp-muted">
                Склады
              </span>

              <b>
                ${warehouses}
              </b>

            </div>


            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:12px;
                background:#fff;
                font-size:13px;
              "
            >

              <span class="sp-muted">
                Артикулы
              </span>

              <b>
                ${articles}
              </b>

            </div>


            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:12px;
                background:#fff;
                font-size:13px;
              "
            >

              <span class="sp-muted">
                Поддоны
              </span>

              <b>
                ${pallets}
              </b>

            </div>


            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:12px;
                background:#fff;
                font-size:13px;
              "
            >

              <span class="sp-muted">
                Зарезервировано
              </span>

              <b>
                ${reserved}
              </b>

            </div>

          </div>

        </div>

      </div>


      <!-- ===================================================
           БЫСТРЫЕ ДЕЙСТВИЯ
           =================================================== -->

      <div
        class="sp-dashboard-actions"
        style="
          margin-top:12px;
          display:grid;
          grid-template-columns:
            repeat(4,minmax(0,1fr));
          gap:10px;
        "
      >


        <!-- ПРИЁМКА -->

        <button
          type="button"
          class="sp-card"
          onclick="goToPage('received')"
          style="
            text-align:left;
            cursor:pointer;
            border:1px solid #e5e5e5;
          "
        >

          <div
            style="
              font-size:20px;
              margin-bottom:8px;
            "
          >
            ↓
          </div>

          <b>
            Приёмка
          </b>

          <div
            class="sp-muted"
            style="
              font-size:12px;
              margin-top:3px;
            "
          >
            Принять коробки
          </div>

        </button>


        <!-- СБОРКА -->

        <button
          type="button"
          class="sp-card"
          onclick="goToPage('assembly')"
          style="
            text-align:left;
            cursor:pointer;
            border:1px solid #e5e5e5;
          "
        >

          <div
            style="
              font-size:20px;
              margin-bottom:8px;
            "
          >
            ◫
          </div>

          <b>
            Сборка
          </b>

          <div
            class="sp-muted"
            style="
              font-size:12px;
              margin-top:3px;
            "
          >
            Комплектовать заявки
          </div>

        </button>


        <!-- СОБРАНО -->

        <button
          type="button"
          class="sp-card"
          onclick="goToPage('collected')"
          style="
            text-align:left;
            cursor:pointer;
            border:1px solid #e5e5e5;
          "
        >

          <div
            style="
              font-size:20px;
              margin-bottom:8px;
            "
          >
            ✓
          </div>

          <b>
            Собрано
          </b>

          <div
            class="sp-muted"
            style="
              font-size:12px;
              margin-top:3px;
            "
          >
            Проверить готовые
          </div>

        </button>


        <!-- УБЫЛО -->

        <button
          type="button"
          class="sp-card"
          onclick="goToPage('shipped')"
          style="
            text-align:left;
            cursor:pointer;
            border:1px solid #e5e5e5;
          "
        >

          <div
            style="
              font-size:20px;
              margin-bottom:8px;
            "
          >
            ↑
          </div>

          <b>
            Убыло
          </b>

          <div
            class="sp-muted"
            style="
              font-size:12px;
              margin-top:3px;
            "
          >
            История отгрузок
          </div>

        </button>

      </div>

    </div>


    <!-- =====================================================
         ПОСЛЕДНИЕ ОПЕРАЦИИ
         ===================================================== -->

    <div class="sp-card">

      <h3>
        Последние операции
      </h3>


      <div class="sp-table-wrap">

        <table class="sp-table">

          <thead>

            <tr>

              <th>
                Штрихкод
              </th>

              <th>
                Артикул
              </th>

              <th>
                Зона
              </th>

              <th>
                Поддон
              </th>

              <th>
                Статус
              </th>

            </tr>

          </thead>


          <tbody>

            ${
              state.boxes
                .slice(-10)
                .reverse()
                .map(
                  row => `

                    <tr>

                      <td>
                        ${escapeHtml(
                          row.barcode
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          row.article
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          row.zone_row
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          row.pallet
                        )}
                      </td>

                      <td>

                        <span class="sp-status">
                          ${escapeHtml(
                            row.status
                          )}
                        </span>

                      </td>

                    </tr>

                  `
                )
                .join('')
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}

/* =========================================================
   REQUEST PREVIEW
   ========================================================= */

function updateRequestPreview() {

  const input =
    document.querySelector(
      '#requestBarcodes'
    );

  const preview =
    document.querySelector(
      '#requestPreview'
    );

  const body =
    document.querySelector(
      '#requestPreviewBody'
    );

  const summary =
    document.querySelector(
      '#requestPreviewSummary'
    );

  const totalElement =
    document.querySelector(
      '#requestPreviewTotal'
    );

  const button =
    document.querySelector(
      '#createPickingBtn'
    );


  if (
    !input ||
    !preview ||
    !body
  ) {

    return;
  }


  const raw =
    input.value || '';


  /*
    Если поле пустое —
    скрываем предпросмотр.
  */

  if (!raw.trim()) {

    preview.style.display =
      'none';

    if (button) {

      button.textContent =
        '📦 Сформировать подбор';

    }

    return;
  }


  /*
    Разбираем заявку.
  */

  const lines =
    raw
      .split(/\r?\n/)
      .map(
        line =>
          line.trim()
      )
      .filter(Boolean);


  const requested =
    new Map();


  for (
    const line of lines
  ) {

    const barcodeMatch =
      line.match(
        /\d{13}/
      );


    if (!barcodeMatch) {

      continue;
    }


    const barcode =
      normalizeBarcode(
        barcodeMatch[0]
      );


    if (!barcode) {

      continue;
    }


    const rest =
      line
        .replace(
          barcodeMatch[0],
          ''
        )
        .trim();


    let quantity =
      1;


    /*
      Поддерживаем:

      4810122595003 - 3
      4810122595003 — 3
      4810122595003 3
      4810122595003:3
      */

    const quantityMatch =
      rest.match(
        /(?:[-—–:;,]|\s)\s*(\d+(?:[.,]\d+)?)\s*$/
      );


    if (
      quantityMatch
    ) {

      quantity =
        Number(
          String(
            quantityMatch[1]
          ).replace(
            ',',
            '.'
          )
        );

    }


    if (
      !Number.isFinite(
        quantity
      ) ||
      quantity <= 0
    ) {

      continue;
    }


    quantity =
      Math.floor(
        quantity
      );


    if (
      quantity <= 0
    ) {

      continue;
    }


    requested.set(
      barcode,
      (
        requested.get(
          barcode
        ) || 0
      ) + quantity
    );

  }


  /*
    Очищаем таблицу.
  */

  body.innerHTML =
    '';


  let totalQuantity =
    0;


  /*
    Если удалось распознать
    позиции — строим таблицу.
  */

  requested.forEach(
    (
      quantity,
      barcode
    ) => {

      totalQuantity +=
        quantity;


      const tr =
        document.createElement(
          'tr'
        );


      tr.innerHTML = `

        <td>
          ${escapeHtml(
            barcode
          )}
        </td>

        <td
          style="
            text-align:center;
            font-weight:600;
          "
        >
          ${quantity}
        </td>

        <td
          style="
            text-align:center;
          "
        >

          <button
            type="button"
            class="ghost"
            onclick="
              removeRequestBarcode(
                '${barcode}'
              )
            "
            style="
              padding:4px 8px;
              min-width:32px;
            "
            title="Удалить"
          >
            ×
          </button>

        </td>

      `;


      body.appendChild(
        tr
      );

    }
  );


  if (
    requested.size === 0
  ) {

    preview.style.display =
      'none';

    return;
  }


  /*
    Показываем предпросмотр.
  */

  preview.style.display =
    'block';


  summary.textContent =
    `${requested.size} позиций · ${totalQuantity} коробок`;


  totalElement.textContent =
    totalQuantity;


  /*
    Меняем текст кнопки.
  */

  if (button) {

    button.textContent =
      `📦 Сформировать подбор · ${totalQuantity}`;

  }

}


/* =========================================================
   REMOVE REQUEST POSITION
   ========================================================= */

function removeRequestBarcode(
  barcodeToRemove
) {

  const input =
    document.querySelector(
      '#requestBarcodes'
    );


  if (!input) {
    return;
  }


  const lines =
    input.value
      .split(/\r?\n/)
      .filter(Boolean);


  const result =
    [];


  for (
    const line of lines
  ) {

    const match =
      line.match(
        /\d{13}/
      );


    if (!match) {

      result.push(
        line
      );

      continue;
    }


    const barcode =
      normalizeBarcode(
        match[0]
      );


    if (
      barcode ===
      barcodeToRemove
    ) {

      continue;
    }


    result.push(
      line
    );

  }


  input.value =
    result.join('\n');


  updateRequestPreview();

}


/* =========================================================
   CLEAR REQUEST
   ========================================================= */

function clearRequestPreview() {

  const input =
    document.querySelector(
      '#requestBarcodes'
    );


  if (input) {

    input.value =
      '';

  }


  updateRequestPreview();

}


/* =========================================================
   STATUS COUNTER
   ========================================================= */

function countStatus(
  status
) {

  return state.boxes.filter(
    row =>
      row.status ===
      status
  ).length;

}

/* =========================================================
   TOOLS
   ========================================================= */

/* =========================================================
   COMPARISON
   ЗАЯВКА → ТРЕБУЕМЫЕ КОРОБКИ → СОБРАНО
   ========================================================= */


/*
  Преобразование значения количества.

  Поддерживает:
  48
  "48"
  "48.0"
  "48,0"
*/
function comparisonNumber(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return 0;

  }


  const normalized =
    String(value)
      .trim()
      .replace(',', '.');


  const number =
    Number(normalized);


  if (
    !Number.isFinite(number)
  ) {

    return 0;

  }


  return number;

}


/*
  Получаем количество товара в одной коробке
  для конкретного штрихкода.

  Если в базе несколько физических коробок
  одного штрихкода — берём наиболее часто
  встречающееся положительное значение.

  Это защищает сравнение от случайной
  единичной неправильной записи.
*/
function getQuantityInBoxForBarcode(
  barcode
) {

  const values =
    state.boxes
      .filter(
        row =>
          normalizeBarcode(
            row.barcode
          ) === barcode
      )
      .map(
        row =>
          comparisonNumber(
            row.quantity_in_box
          )
      )
      .filter(
        value =>
          value > 0
      );


  if (!values.length) {

    return 0;

  }


  const frequency =
    new Map();


  values.forEach(
    value => {

      frequency.set(
        value,
        (frequency.get(value) || 0) + 1
      );

    }
  );


  let bestValue =
    values[0];

  let bestCount =
    0;


  frequency.forEach(
    (count, value) => {

      if (
        count > bestCount
      ) {

        bestCount =
          count;

        bestValue =
          value;

      }

    }
  );


  return bestValue;

}


/*
  Сколько физических коробок реально
  находится в статусе "Скомплектовано".
*/
function getCollectedCountForBarcode(
  barcode
) {

  return state.boxes
    .filter(
      row =>
        row.status ===
        STATUSES.COLLECTED
    )
    .filter(
      row =>
        normalizeBarcode(
          row.barcode
        ) === barcode
    )
    .length;

}


/*
  Разбор строки заявки.

  Поддерживаем:

  4810122595003
  4810122595003 48
  4810122595003 - 48
  4810122595003;48
  4810122595003:48
*/
function parseComparisonText(
  raw
) {

  const lines =
    String(raw || '')
      .split(/\r?\n/)
      .map(
        line =>
          line.trim()
      )
      .filter(Boolean);


  const map =
    new Map();


  lines.forEach(
    line => {

      const barcodeMatch =
        line.match(
          /\d{8,20}/
        );


      if (!barcodeMatch) {

        return;

      }


      const barcode =
        normalizeBarcode(
          barcodeMatch[0]
        );


      if (!barcode) {

        return;

      }


      let rest =
        line
          .replace(
            barcodeMatch[0],
            ''
          )
          .trim();


      rest =
        rest.replace(
          /^[\s\-:;|]+/,
          ''
        );


      const quantityMatch =
        rest.match(
          /(\d+(?:[.,]\d+)?)/
        );


      const quantity =
        quantityMatch
          ? comparisonNumber(
              quantityMatch[1]
            )
          : 1;


      if (
        quantity <= 0
      ) {

        return;

      }


      map.set(
        barcode,
        (map.get(barcode) || 0) +
        quantity
      );

    }
  );


  return [
    ...map.entries()
  ].map(
    ([barcode, quantity]) => ({
      barcode,
      requestedUnits:
        quantity
    })
  );

}


/*
  Формируем результат сравнения.
*/
function buildComparisonRows(
  requestRows
) {

  return requestRows.map(
    request => {

      const barcode =
        request.barcode;


      const requestedUnits =
        comparisonNumber(
          request.requestedUnits
        );


      const quantityInBox =
        getQuantityInBoxForBarcode(
          barcode
        );


      const requiredBoxes =
        quantityInBox > 0
          ? Math.ceil(
              requestedUnits /
              quantityInBox
            )
          : null;


      const collectedBoxes =
        getCollectedCountForBarcode(
          barcode
        );


      let difference =
        null;


      let status =
        'Нет нормы';


      if (
        requiredBoxes !== null
      ) {

        difference =
          collectedBoxes -
          requiredBoxes;


        if (
          difference === 0
        ) {

          status =
            'ОК';

        } else if (
          difference < 0
        ) {

          status =
            'Не хватает';

        } else {

          status =
            'Лишние';

        }

      }


      const article =
        state.boxes.find(
          row =>
            normalizeBarcode(
              row.barcode
            ) === barcode &&
            row.article
        )?.article || '';


      return {

        barcode,

        article,

        requestedUnits,

        quantityInBox,

        requiredBoxes,

        collectedBoxes,

        difference,

        status

      };

    }
  );

}


/*
  Обновляем сравнение после ручного ввода.
*/
function updateComparison() {

  const input =
    $('#comparisonRequest');


  if (!input) {

    return;

  }


  const rows =
    parseComparisonText(
      input.value
    );


  state.comparisonRows =
    buildComparisonRows(
      rows
    );


  renderComparisonTable();

}


/*
  Импорт заявки Excel для сравнения.

  Ожидается:

  Штрихкод | Количество

  Количество здесь означает
  количество ТОВАРА, а не коробок.
*/
function importComparisonExcel(
  event
) {

  const file =
    event.target.files?.[0];


  if (!file) {

    return;

  }


  state.comparisonLoading =
    true;


  state.comparisonError =
    '';


  const reader =
    new FileReader();


  reader.onload =
    function(e) {

      try {

        const data =
          new Uint8Array(
            e.target.result
          );


        const workbook =
          XLSX.read(
            data,
            {
              type: 'array'
            }
          );


        const sheetName =
          workbook.SheetNames[0];


        const sheet =
          workbook.Sheets[
            sheetName
          ];


        const rows =
          XLSX.utils.sheet_to_json(
            sheet,
            {
              header: 1,
              defval: '',
              raw: false
            }
          );


        if (
          !rows.length
        ) {

          throw new Error(
            'Excel-файл пустой'
          );

        }


        const header =
          rows[0].map(
            value =>
              normalizeHeader(
                value
              )
          );


        let barcodeColumn =
          -1;


        let quantityColumn =
          -1;


        for (
          let i = 0;
          i < header.length;
          i++
        ) {

          const name =
            header[i];


          if (
            barcodeColumn === -1 &&
            (
              name.includes(
                'штрихкод'
              ) ||
              name.includes(
                'barcode'
              ) ||
              name.includes(
                'баркод'
              )
            )
          ) {

            barcodeColumn =
              i;

          }


          if (
            quantityColumn === -1 &&
            (
              name ===
                'количество' ||
              name.includes(
                'количество'
              ) ||
              name.includes(
                'колво'
              ) ||
              name.includes(
                'колич'
              ) ||
              name ===
                'qty'
            )
          ) {

            quantityColumn =
              i;

          }

        }


        /*
          Если заголовки не определились:

          A = штрихкод
          B = количество
        */

        if (
          barcodeColumn === -1
        ) {

          barcodeColumn =
            0;

        }


        if (
          quantityColumn === -1
        ) {

          quantityColumn =
            1;

        }


        const requestRows =
          [];


        for (
          let i = 1;
          i < rows.length;
          i++
        ) {

          const row =
            rows[i];


          const barcode =
            normalizeBarcode(
              row[
                barcodeColumn
              ]
            );


          if (!barcode) {

            continue;

          }


          const quantity =
            comparisonNumber(
              row[
                quantityColumn
              ]
            );


          if (
            quantity <= 0
          ) {

            continue;

          }


          requestRows.push({
            barcode,
            requestedUnits:
              quantity
          });

        }


        /*
          Объединяем одинаковые
          штрихкоды.
        */

        const map =
          new Map();


        requestRows.forEach(
          row => {

            map.set(
              row.barcode,
              (
                map.get(
                  row.barcode
                ) || 0
              ) +
              row.requestedUnits
            );

          }
        );


        const normalizedRows =
          [
            ...map.entries()
          ].map(
            ([barcode, quantity]) => ({
              barcode,
              requestedUnits:
                quantity
            })
          );


        state.comparisonRows =
          buildComparisonRows(
            normalizedRows
          );


        state.comparisonFileName =
          file.name;


        state.comparisonLoaded =
          true;


        const textarea =
          $('#comparisonRequest');


        if (textarea) {

          textarea.value =
            normalizedRows
              .map(
                row =>
                  `${row.barcode} - ${row.requestedUnits}`
              )
              .join('\n');

        }


        renderComparisonTable();


        toast(
          `Заявка загружена: ${normalizedRows.length} позиций`
        );


      }
      catch (error) {

        console.error(
          'Ошибка сравнения Excel:',
          error
        );


        state.comparisonError =
          error.message ||
          'Не удалось прочитать Excel';


        toast(
          state.comparisonError,
          'error'
        );

      }


      finally {

        state.comparisonLoading =
          false;


        event.target.value =
          '';

      }

    };


  reader.readAsArrayBuffer(
    file
  );

}


/*
  Очищаем сравнение.
*/
function clearComparison() {

  state.comparisonRows =
    [];

  state.comparisonLoaded =
    false;

  state.comparisonFileName =
    '';

  state.comparisonError =
    '';


  const input =
    $('#comparisonRequest');


  if (input) {

    input.value =
      '';

  }


  renderComparisonTable();

}


/*
  Отрисовка таблицы сравнения.
*/
function renderComparisonTable() {

  const body =
    $('#comparisonBody');


  const summary =
    $('#comparisonSummary');


  const totalRequested =
    $('#comparisonRequested');


  const totalRequired =
    $('#comparisonRequired');


  const totalCollected =
    $('#comparisonCollected');


  const totalDifference =
    $('#comparisonDifference');


  const statusElement =
    $('#comparisonOverallStatus');


  if (!body) {

    return;

  }


  const rows =
    state.comparisonRows || [];


  if (!rows.length) {

    body.innerHTML = `

      <tr>

        <td
          colspan="7"
          class="empty"
        >
          Загрузите заявку или вставьте
          данные вручную.

        </td>

      </tr>

    `;


    if (summary) {

      summary.textContent =
        '0 позиций';

    }


    if (totalRequested) {

      totalRequested.textContent =
        '0';

    }


    if (totalRequired) {

      totalRequired.textContent =
        '0';

    }


    if (totalCollected) {

      totalCollected.textContent =
        '0';

    }


    if (totalDifference) {

      totalDifference.textContent =
        '0';

    }


    if (statusElement) {

      statusElement.textContent =
        'Ожидание заявки';

    }


    return;

  }


  body.innerHTML =
    rows.map(
      row => {

        const statusClass =
          row.status === 'ОК'
            ? 'success'
            : row.status === 'Не хватает'
              ? 'danger'
              : row.status === 'Лишние'
                ? 'warning'
                : 'muted';


        const statusText =
          row.status ===
            'Не хватает'
            ? `−${Math.abs(
                row.difference || 0
              )}`
            : row.status ===
              'Лишние'
              ? `+${row.difference || 0}`
              : row.status ===
                'ОК'
                ? '✓'
                : '—';


        return `

          <tr>

            <td>

              <b>
                ${escapeHtml(
                  row.barcode
                )}
              </b>

            </td>


            <td>
              ${escapeHtml(
                row.article
              )}
            </td>


            <td>
              ${row.requestedUnits}
            </td>


            <td>
              ${
                row.quantityInBox
                  ? row.quantityInBox
                  : '—'
              }
            </td>


            <td>

              ${
                row.requiredBoxes !== null
                  ? row.requiredBoxes
                  : '—'
              }

            </td>


            <td>
              ${row.collectedBoxes}
            </td>


            <td>

              <span
                class="sp-status ${statusClass}"
              >
                ${escapeHtml(
                  row.status
                )}
                ${
                  statusText !==
                  row.status
                    ? ` · ${statusText}`
                    : ''
                }
              </span>

            </td>

          </tr>

        `;

      }
    ).join('');


  const requested =
    rows.reduce(
      (sum, row) =>
        sum +
        row.requestedUnits,
      0
    );


  const required =
    rows.reduce(
      (sum, row) =>
        sum +
        (
          row.requiredBoxes || 0
        ),
      0
    );


  const collected =
    rows.reduce(
      (sum, row) =>
        sum +
        row.collectedBoxes,
      0
    );


  const difference =
    rows.every(
      row =>
        row.difference !== null
    )
      ? collected -
        required
      : null;


  const allOk =
    rows.length > 0 &&
    rows.every(
      row =>
        row.status === 'ОК'
    );


  const hasMissing =
    rows.some(
      row =>
        row.status ===
        'Не хватает'
    );


  const hasNoNorm =
    rows.some(
      row =>
        row.status ===
        'Нет нормы'
    );


  if (summary) {

    summary.textContent =
      `${rows.length} позиций · ` +
      `${required} требуется коробок · ` +
      `${collected} собрано`;

  }


  if (totalRequested) {

    totalRequested.textContent =
      requested;

  }


  if (totalRequired) {

    totalRequired.textContent =
      required;

  }


  if (totalCollected) {

    totalCollected.textContent =
      collected;

  }


  if (totalDifference) {

    totalDifference.textContent =
      difference === null
        ? '—'
        : difference > 0
          ? `+${difference}`
          : difference;

  }


  if (statusElement) {

    if (allOk) {

      statusElement.textContent =
        '✓ ГОТОВО К ОТГРУЗКЕ';

    } else if (
      hasMissing
    ) {

      statusElement.textContent =
        '⚠ НЕ ХВАТАЕТ КОРОБОК';

    } else if (
      hasNoNorm
    ) {

      statusElement.textContent =
        '⚠ НУЖНО ЗАПОЛНИТЬ НОРМУ';

    } else {

      statusElement.textContent =
        'ПРОВЕРКА';

    }

  }

}


/*
  Сам экран.
*/
function comparisonView() {

  return `

    <!-- =====================================================
         HEADER
         ===================================================== -->

    <div
      class="sp-card"
      style="
        margin-bottom:16px;
      "
    >

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:16px;
          flex-wrap:wrap;
        "
      >

        <div>

          <h2
            style="
              margin:0 0 6px;
              font-size:21px;
            "
          >
            ⇄ Сравнение заявки
          </h2>

          <div class="sp-muted">

            Сравнение количества товара
            с фактически собранными
            физическими коробками.

          </div>

        </div>


        <div
          id="comparisonOverallStatus"
          style="
            padding:8px 12px;
            border-radius:10px;
            background:#f5f5f5;
            font-size:12px;
            font-weight:700;
            white-space:nowrap;
          "
        >
          Ожидание заявки
        </div>

      </div>

    </div>


    <!-- =====================================================
         IMPORT
         ===================================================== -->

    <div
      class="sp-card"
      style="
        margin-bottom:16px;
      "
    >

      <h3>
        1. Заявка
      </h3>

      <p
        class="sp-muted"
        style="
          margin-top:4px;
        "
      >
        Excel должен содержать
        <b>Штрихкод</b> и
        <b>Количество</b>.
        Количество — это количество товара,
        а не коробок.
      </p>


      <div
        style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin:14px 0;
        "
      >

        <button
          class="sp-btn"
          type="button"
          onclick="
            document
              .getElementById(
                'comparisonExcelInput'
              )
              .click()
          "
        >
          📥 Импорт Excel
        </button>


        <input
          id="comparisonExcelInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          style="display:none"
          onchange="importComparisonExcel(event)"
        >


        <button
          class="sp-btn secondary"
          type="button"
          onclick="updateComparison()"
        >
          ↻ Пересчитать
        </button>


        <button
          class="sp-btn secondary"
          type="button"
          onclick="clearComparison()"
        >
          Очистить
        </button>

      </div>


      <textarea
        id="comparisonRequest"
        placeholder="Например:

4810122595003 - 48
4810122659354 - 50

или просто вставьте строки Excel"
        style="
          width:100%;
          min-height:130px;
          box-sizing:border-box;
          resize:vertical;
          border:1px solid #ddd;
          border-radius:12px;
          padding:14px;
          font-family:monospace;
          font-size:14px;
          line-height:1.6;
          outline:none;
        "
      ></textarea>

    </div>


    <!-- =====================================================
         KPI
         ===================================================== -->

    <div
      class="sp-dashboard-kpi-grid"
      style="
        display:grid;
        grid-template-columns:
          repeat(4,minmax(0,1fr));
        gap:12px;
        margin-bottom:16px;
      "
    >

      <div
        class="sp-card"
        style="
          margin:0;
          padding:18px;
        "
      >

        <div class="sp-card-label">
          Заказано, шт.
        </div>

        <div
          id="comparisonRequested"
          style="
            font-size:28px;
            font-weight:750;
            margin-top:7px;
          "
        >
          0
        </div>

      </div>


      <div
        class="sp-card"
        style="
          margin:0;
          padding:18px;
        "
      >

        <div class="sp-card-label">
          Требуется коробок
        </div>

        <div
          id="comparisonRequired"
          style="
            font-size:28px;
            font-weight:750;
            margin-top:7px;
          "
        >
          0
        </div>

      </div>


      <div
        class="sp-card"
        style="
          margin:0;
          padding:18px;
        "
      >

        <div class="sp-card-label">
          Собрано коробок
        </div>

        <div
          id="comparisonCollected"
          style="
            font-size:28px;
            font-weight:750;
            margin-top:7px;
          "
        >
          0
        </div>

      </div>


      <div
        class="sp-card"
        style="
          margin:0;
          padding:18px;
        "
      >

        <div class="sp-card-label">
          Разница
        </div>

        <div
          id="comparisonDifference"
          style="
            font-size:28px;
            font-weight:750;
            margin-top:7px;
          "
        >
          0
        </div>

      </div>

    </div>


    <!-- =====================================================
         TABLE
         ===================================================== -->

    <div class="sp-card">

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          flex-wrap:wrap;
          margin-bottom:14px;
        "
      >

        <div>

          <h3
            style="
              margin:0;
            "
          >
            2. Результат проверки
          </h3>

          <div
            id="comparisonSummary"
            class="sp-muted"
            style="
              margin-top:4px;
              font-size:12px;
            "
          >
            0 позиций
          </div>

        </div>

      </div>


      <div class="table-wrap">

        <table class="data-table">

          <thead>

            <tr>

              <th>
                Штрихкод
              </th>

              <th>
                Артикул
              </th>

              <th>
                Заказано
              </th>

              <th>
                В коробке
              </th>

              <th>
                Нужно коробок
              </th>

              <th>
                Собрано
              </th>

              <th>
                Статус
              </th>

            </tr>

          </thead>


          <tbody
            id="comparisonBody"
          >

            <tr>

              <td
                colspan="7"
                class="empty"
              >
                Загрузите заявку
                или вставьте данные
                вручную.

              </td>

            </tr>

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/*
  Подключение событий.
*/
function setupComparison() {

  const input =
    $('#comparisonRequest');


  if (input) {

    input.addEventListener(
      'input',
      updateComparison
    );

  }


  renderComparisonTable();

}

/* =========================================================
   INVENTORY
   ИНВЕНТАРИЗАЦИЯ
   ========================================================= */

function getInventoryWarehouses() {

  return [
    ...new Set(
      state.boxes
        .map(row => normalizeText(row.warehouse))
        .filter(Boolean)
    )
  ].sort();

}


function getInventoryZones() {

  const warehouse =
    state.inventory.warehouse;

  return [
    ...new Set(
      state.boxes
        .filter(row => {

          if (
            warehouse &&
            normalizeText(row.warehouse) !==
              warehouse
          ) {
            return false;
          }

          return true;

        })
        .map(row =>
          normalizeText(row.zone_row)
        )
        .filter(Boolean)
    )
  ].sort();

}


function getInventoryPallets() {

  const warehouse =
    state.inventory.warehouse;

  const zone =
    state.inventory.zone;

  return [
    ...new Set(
      state.boxes
        .filter(row => {

          if (
            warehouse &&
            normalizeText(row.warehouse) !==
              warehouse
          ) {
            return false;
          }

          if (
            zone &&
            normalizeText(row.zone_row) !==
              zone
          ) {
            return false;
          }

          return true;

        })
        .map(row =>
          normalizeText(row.pallet)
        )
        .filter(Boolean)
    )
  ].sort();

}


/*
  Какие коробки физически должны
  находиться на складе.

  Отгруженные и пустые коробки
  в инвентаризацию не включаем.
*/
function getInventoryExpectedBoxes() {

  const warehouse =
    state.inventory.warehouse;

  const zone =
    state.inventory.zone;

  const pallet =
    state.inventory.pallet;

  return state.boxes.filter(row => {

    if (
      row.status ===
      STATUSES.SHIPPED
    ) {
      return false;
    }

    if (
      row.status ===
      STATUSES.EMPTY
    ) {
      return false;
    }

    if (
      warehouse &&
      normalizeText(row.warehouse) !==
        warehouse
    ) {
      return false;
    }

    if (
      zone &&
      normalizeText(row.zone_row) !==
        zone
    ) {
      return false;
    }

    if (
      pallet &&
      normalizeText(row.pallet) !==
        pallet
    ) {
      return false;
    }

    return true;

  });

}


/*
  Проверяем, есть ли barcode
  вообще в системе.
*/
function getInventoryBoxesByBarcode(
  barcode
) {

  return state.boxes.filter(
    row =>
      normalizeBarcode(
        row.barcode
      ) === barcode &&
      row.status !==
        STATUSES.SHIPPED &&
      row.status !==
        STATUSES.EMPTY
  );

}


/*
  Ищем первую ещё не проверенную
  физическую коробку с этим barcode.
*/
function findInventoryExpectedBox(
  barcode
) {

  const expected =
    getInventoryExpectedBoxes();

  return expected.find(
    row =>
      normalizeBarcode(
        row.barcode
      ) === barcode &&
      !state.inventory.scannedIds.has(
        String(row.id)
      )
  ) || null;

}


/*
  Начало инвентаризации.
*/
function startInventory() {

  /*
    На первом этапе инвентаризация
    проводится только по конкретному паллету.

    Это намеренно:
    мы не хотим случайно проводить
    пересчёт всего склада.
  */
  if (
    !state.inventory.warehouse ||
    !state.inventory.zone ||
    !state.inventory.pallet
  ) {

    toast(
      'Выберите склад, зону/ряд и конкретный паллет',
      'error'
    );

    return;

  }


  const expected =
    getInventoryExpectedBoxes();


  if (!expected.length) {

    toast(
      'На выбранном паллете нет коробок для инвентаризации',
      'error'
    );

    return;

  }


  /*
    Фиксируем конкретный набор
    физических коробок на момент старта.
  */
  state.inventory.mode =
    'scanning';


  state.inventory.expectedIds =
    new Set(
      expected.map(
        row =>
          String(row.id)
      )
    );


  state.inventory.scannedIds =
    new Set();


  /*
    Существующие коробки,
    которые будут найдены вне паллета.
  */
  state.inventory.outsideIds =
    new Set();


  /*
    ВАЖНО:

    Array, а не Set.

    Например:

    777
    777
    777

    означает 3 физические коробки.

    Все три должны быть сохранены.
  */
  state.inventory.unknownBarcodes =
    [];


  state.inventory.lastScan =
    null;


  state.inventory.recentScans =
    [];


  state.inventory.startedAt =
    new Date().toISOString();


  state.inventory.finishedAt =
    null;


  state.inventory.result =
    null;


  state.inventory.message =
    '';


  state.inventory.messageType =
    'success';


  render();


  setTimeout(
    () => {

      $('#inventoryScanner')
        ?.focus();

    },
    50
  );

}


/*
  Полный сброс текущей инвентаризации.
*/
function resetInventory() {

  if (
    state.inventory.mode ===
    'scanning'
  ) {

    const confirmed =
      confirm(
        'Сбросить текущий пересчёт? Все отсканированные коробки будут забыты.'
      );


    if (!confirmed) {

      return;

    }

  }


  state.inventory.mode =
    'setup';


  state.inventory.expectedIds =
    new Set();


  state.inventory.scannedIds =
    new Set();


  state.inventory.outsideIds =
    new Set();


  /*
    Именно Array.

    Повторяющиеся неизвестные
    штрихкоды сохраняются.
  */
  state.inventory.unknownBarcodes =
    [];


  state.inventory.lastScan =
    null;


  state.inventory.recentScans =
    [];


  state.inventory.startedAt =
    null;


  state.inventory.finishedAt =
    null;


  state.inventory.result =
    null;


  state.inventory.message =
    '';


  state.inventory.messageType =
    'success';


  render();

}


/*
  Обработка одного barcode.
*/
function inventoryScan(
  rawBarcode
) {

  const barcode =
    normalizeBarcode(
      rawBarcode
    );


  if (!barcode) {

    return;

  }


  /*
    1. Ищем физическую коробку
       среди ожидаемых на текущем паллете.
  */
  const expected =
    findInventoryExpectedBox(
      barcode
    );


  if (expected) {

    state.inventory.scannedIds.add(
      String(
        expected.id
      )
    );


    state.inventory.lastScan = {

      type:
        'success',

      barcode,

      message:
        'Коробка найдена',

      box:
        expected

    };


    state.inventory.recentScans.unshift(
      state.inventory.lastScan
    );


    state.inventory.recentScans =
      state.inventory.recentScans.slice(
        0,
        20
      );


    render();


    setTimeout(
      () =>
        $('#inventoryScanner')
          ?.focus(),
      50
    );


    return;

  }


  /*
    2. Проверяем, не был ли уже
       просканирован этот физический объект.
  */
  const alreadyScanned =
    getInventoryExpectedBoxes()
      .some(
        row =>
          normalizeBarcode(
            row.barcode
          ) === barcode &&
          state.inventory.scannedIds.has(
            String(row.id)
          )
      );


  if (alreadyScanned) {

    state.inventory.lastScan = {

      type:
        'duplicate',

      barcode,

      message:
        'Эта физическая коробка уже проверена'

    };


    state.inventory.recentScans.unshift(
      state.inventory.lastScan
    );


    state.inventory.recentScans =
      state.inventory.recentScans.slice(
        0,
        20
      );


    render();


    setTimeout(
      () =>
        $('#inventoryScanner')
          ?.focus(),
      50
    );


    return;

  }


  /*
    3. Ищем barcode во всей базе.
  */
  const anywhere =
    getInventoryBoxesByBarcode(
      barcode
    );


  if (anywhere.length) {

    /*
      Ищем конкретную физическую коробку,
      которая ещё не была учтена как
      найденная вне паллета.
    */
    const location =
      anywhere.find(
        row =>
          !state.inventory.outsideIds.has(
            String(row.id)
          )
      );


    /*
      Если все физические коробки
      с этим barcode уже были найдены,
      это повторное сканирование.
    */
    if (!location) {

      state.inventory.lastScan = {

        type:
          'duplicate',

        barcode,

        message:
          'Все коробки с этим штрихкодом уже учтены'

      };


      state.inventory.recentScans.unshift(
        state.inventory.lastScan
      );


      state.inventory.recentScans =
        state.inventory.recentScans.slice(
          0,
          20
        );


      render();


      setTimeout(
        () =>
          $('#inventoryScanner')
            ?.focus(),
        50
      );


      return;

    }


    const locationId =
      String(
        location.id
      );


    state.inventory.outsideIds.add(
      locationId
    );


    state.inventory.lastScan = {

      type:
        'outside',

      barcode,

      message:
        'Коробка найдена в другой области',

      boxId:
        locationId,

      box:
        location,

      location: {

        warehouse:
          location.warehouse ||
          '',

        zone:
          location.zone_row ||
          '',

        pallet:
          location.pallet ||
          ''

      }

    };


    state.inventory.recentScans.unshift(
      state.inventory.lastScan
    );


    state.inventory.recentScans =
      state.inventory.recentScans.slice(
        0,
        20
      );


    render();


    setTimeout(
      () =>
        $('#inventoryScanner')
          ?.focus(),
      50
    );


    return;

  }


  /*
    4. Barcode вообще отсутствует
       в базе.

    ВАЖНО:
    Array позволяет сохранить
    повторяющиеся физические коробки.
  */
  state.inventory.unknownBarcodes.push(
    barcode
  );


  state.inventory.lastScan = {

    type:
      'unknown',

    barcode,

    message:
      'Штрихкод отсутствует в базе'

  };


  state.inventory.recentScans.unshift(
    state.inventory.lastScan
  );


  state.inventory.recentScans =
    state.inventory.recentScans.slice(
      0,
      20
    );


  render();


  setTimeout(
    () =>
      $('#inventoryScanner')
        ?.focus(),
    50
  );

}

/*
  Завершение пересчёта.

  База пока НЕ изменяется.
*/
function finishInventory() {

  if (
    !state.inventory.warehouse ||
    !state.inventory.zone ||
    !state.inventory.pallet
  ) {

    toast(
      'Для проведения инвентаризации выберите склад, зону/ряд и паллет',
      'error'
    );

    return;

  }


  const target =
    getInventoryTargetLocation();


  if (!target) {

    toast(
      'Не удалось определить ID выбранного паллета. Проверьте данные базы.',
      'error'
    );

    return;

  }


  const expected =
    getInventoryExpectedBoxes();


  const scanned =
    expected.filter(
      row =>
        state.inventory.scannedIds.has(
          String(row.id)
        )
    );


  const missing =
    expected.filter(
      row =>
        !state.inventory.scannedIds.has(
          String(row.id)
        )
    );


  const outsideIds =
    Array.from(
      state.inventory.outsideIds ||
      []
    );


  /*
    ВАЖНО:
    это Array.

    Повторы сохраняются.
  */
  const unknownBarcodes =
    Array.isArray(
      state.inventory.unknownBarcodes
    )
      ? [
          ...state.inventory.unknownBarcodes
        ]
      : [];


  const actual =
    scanned.length +
    outsideIds.length +
    unknownBarcodes.length;


  state.inventory.finishedAt =
    new Date().toISOString();


  state.inventory.mode =
    'finished';


  state.inventory.result = {

    expected:
      expected.length,

    scanned:
      scanned.length,

    missing:
      missing.length,

    outside:
      outsideIds.length,

    unknown:
      unknownBarcodes.length,

    actual,

    target,

    missing_boxes:
      missing,

    outside_ids:
      outsideIds,

    unknown_barcodes:
      unknownBarcodes,

    applied:
      false,

    moved:
      0,

    removed:
      0,

    created:
      0,

    appliedAt:
      null

  };


  render();

}

/*
  Получает реальные FK выбранного
  склада / зоны / паллета.

  Мы берём их из существующей коробки
  текущего паллета.

  Это безопаснее, чем искать ID
  только по текстовому названию.
*/
function getInventoryTargetLocation() {

  const expected =
    getInventoryExpectedBoxes();


  const target =
    expected.find(
      row =>
        normalizeText(row.warehouse) ===
          normalizeText(
            state.inventory.warehouse
          ) &&
        normalizeText(row.zone_row) ===
          normalizeText(
            state.inventory.zone
          ) &&
        normalizeText(row.pallet) ===
          normalizeText(
            state.inventory.pallet
          )
    );


  if (!target) {

    return null;

  }


  return {

    warehouse:
      state.inventory.warehouse,

    zone:
      state.inventory.zone,

    pallet:
      state.inventory.pallet,

    warehouse_id:
      target.warehouse_id ||
      null,

    location_id:
      target.location_id ||
      null,

    pallet_id:
      target.pallet_id ||
      null

  };

}

/*
  ПРОВЕДЕНИЕ ИНВЕНТАРИЗАЦИИ.

  После подтверждения:

  1. Отсутствующие коробки снимаются
     с текущего паллета.

  2. Их текущий статус НЕ меняется.

  3. Найденные вне паллета коробки
     перемещаются на выбранный паллет.

  4. Обновляются одновременно:
     - Склад
     - Зона/ряд
     - Поддон
     - warehouse_id
     - location_id
     - pallet_id

  5. Неизвестные штрихкоды создаются
     как отдельные физические коробки.

  6. Повторяющийся неизвестный barcode
     создаёт несколько физических коробок.
*/
async function applyInventoryResult() {

  if (
    state.inventory.mode !==
    'finished'
  ) {

    return;

  }


  if (
    state.inventory.result?.applied
  ) {

    toast(
      'Эта инвентаризация уже проведена'
    );

    return;

  }


  const target =
    getInventoryTargetLocation();


  if (!target) {

    toast(
      'Не удалось определить выбранный паллет',
      'error'
    );

    return;

  }


  const expected =
    getInventoryExpectedBoxes();


  const scanned =
    expected.filter(
      row =>
        state.inventory.scannedIds.has(
          String(row.id)
        )
    );


  const missing =
    expected.filter(
      row =>
        !state.inventory.scannedIds.has(
          String(row.id)
        )
    );


  const outsideIds =
    Array.from(
      state.inventory.outsideIds ||
      []
    );


  const unknownBarcodes =
    Array.isArray(
      state.inventory.unknownBarcodes
    )
      ? [
          ...state.inventory.unknownBarcodes
        ]
      : [];


  const actualCount =
    scanned.length +
    outsideIds.length +
    unknownBarcodes.length;


  const confirmed =
    confirm(
      [
        'Провести инвентаризацию?',
        '',
        `Склад: ${state.inventory.warehouse}`,
        `Зона: ${state.inventory.zone}`,
        `Паллета: ${state.inventory.pallet}`,
        '',
        `По системе: ${expected.length}`,
        `Фактически: ${actualCount}`,
        '',
        `Оставить: ${scanned.length}`,
        `Переместить сюда: ${outsideIds.length}`,
        `Снять с паллета: ${missing.length}`,
        `Создать новых: ${unknownBarcodes.length}`,
        '',
        'Статусы существующих коробок изменяться не будут.',
        '',
        'После подтверждения изменения будут записаны в Базу.'
      ].join('\n')
    );


  if (!confirmed) {

    return;

  }


  const button =
    $('#inventoryApplyBtn');


  if (button) {

    button.disabled =
      true;

    button.textContent =
      'Проведение...';

  }


  try {

    let movedCount =
      0;

    let removedCount =
      0;

    let createdCount =
      0;


    /*
      ================================================
      1. СНИМАЕМ ОТСУТСТВУЮЩИЕ КОРОБКИ
      ================================================
    */

    for (
      const row of missing
    ) {

      /*
        ВАЖНО:

        Склад и зона сохраняем.

        Меняем только паллет.

        Статус НЕ трогаем.
      */
      const payload = {

        "Поддон":
          null,

        pallet_id:
          null,

        "Изменил":
          state.user?.email ||
          null

      };


      const {
        data,
        error
      } =
        await supabaseClient
          .from('boxes')
          .update(
            payload
          )
          .eq(
            'id',
            row.id
          )
          .select(
            BOX_SELECT
          )
          .single();


      if (error) {

        throw error;

      }


      if (data) {

        updateLocalBox(
          data
        );

      }


      removedCount++;

    }


    /*
      ================================================
      2. ПЕРЕМЕЩАЕМ ИЗВЕСТНЫЕ КОРОБКИ
      ================================================
    */

    for (
      const id of outsideIds
    ) {

      const {
        data,
        error
      } =
        await supabaseClient
          .from('boxes')
          .update({

            "Склад":
              target.warehouse,

            "Зона/ряд":
              target.zone,

            "Поддон":
              target.pallet,

            warehouse_id:
              target.warehouse_id,

            location_id:
              target.location_id,

            pallet_id:
              target.pallet_id,

            "Изменил":
              state.user?.email ||
              null

          })
          .eq(
            'id',
            id
          )
          .select(
            BOX_SELECT
          )
          .single();


      if (error) {

        throw error;

      }


      if (data) {

        updateLocalBox(
          data
        );

      }


      movedCount++;

    }


    /*
      ================================================
      3. СОЗДАЁМ НОВЫЕ КОРОБКИ
      ================================================

      Каждый элемент массива =
      отдельная физическая коробка.

      Поэтому:

      777
      777
      777

      создаст 3 записи.
    */

    for (
      const barcode of unknownBarcodes
    ) {

      const payload = {

        "Штрихкод":
          barcode,

        "Артикул":
          null,

        "Кол-во в коробке":
          null,

        "Зона/ряд":
          target.zone,

        "Поддон":
          target.pallet,

        "Статус":
          STATUSES.STOCK,

        "ДатаРазмещения":
          new Date().toISOString(),

        "Склад":
          target.warehouse,

        "Изменил":
          state.user?.email ||
          null,

        warehouse_id:
          target.warehouse_id,

        location_id:
          target.location_id,

        pallet_id:
          target.pallet_id

      };


      const {
        data,
        error
      } =
        await supabaseClient
          .from('boxes')
          .insert(
            payload
          )
          .select(
            BOX_SELECT
          )
          .single();


      if (error) {

        throw error;

      }


      if (data) {

        addLocalBox(
          data
        );

      }


      createdCount++;

    }


    /*
      ================================================
      4. СОХРАНЯЕМ ИСТОРИЮ
      ================================================
    */

    const historyDetails = {

      inventory_type:
        'pallet',

      warehouse:
        state.inventory.warehouse,

      zone:
        state.inventory.zone,

      pallet:
        state.inventory.pallet,

      target: {

        warehouse_id:
          target.warehouse_id,

        location_id:
          target.location_id,

        pallet_id:
          target.pallet_id

      },

      scanned_ids:
        scanned.map(
          row =>
            String(row.id)
        ),

      missing_boxes:
        missing.map(
          row => ({

            id:
              row.id,

            barcode:
              normalizeBarcode(
                row.barcode
              ),

            previous_warehouse_id:
              row.warehouse_id,

            previous_location_id:
              row.location_id,

            previous_pallet_id:
              row.pallet_id

          })
        ),

      outside_ids:
        outsideIds,

      unknown_barcodes:
        unknownBarcodes

    };


    const {
      data: historyData,
      error: historyError
    } =
      await supabaseClient
        .from('inventory_history')
        .insert({

          warehouse:
            state.inventory.warehouse,

          zone:
            state.inventory.zone,

          pallet:
            state.inventory.pallet,

          started_at:
            state.inventory.startedAt,

          finished_at:
            state.inventory.finishedAt,

          applied_at:
            new Date().toISOString(),

          user_email:
            state.user?.email ||
            null,

          expected_count:
            expected.length,

          scanned_count:
            scanned.length,

          missing_count:
            missing.length,

          outside_count:
            outsideIds.length,

          unknown_count:
            unknownBarcodes.length,

          actual_count:
            actualCount,

          moved_count:
            movedCount,

          removed_count:
            removedCount,

          created_count:
            createdCount,

          details:
            historyDetails

        })
        .select(
          'id,inventory_no,applied_at'
        )
        .single();


    if (historyError) {

      throw historyError;

    }


    /*
      ================================================
      5. ФИКСИРУЕМ РЕЗУЛЬТАТ
      ================================================
    */

    state.inventory.result = {

      ...state.inventory.result,

      applied:
        true,

      moved:
        movedCount,

      removed:
        removedCount,

      created:
        createdCount,

      appliedAt:
        new Date().toISOString(),

      historyId:
        historyData?.id ||
        null,

      inventoryNo:
        historyData?.inventory_no ||
        null

    };


    /*
      ================================================
      6. ПЕРЕЗАГРУЖАЕМ БАЗУ
      ================================================
    */

    const {
      data: freshBoxes,
      error: reloadError
    } =
      await supabaseClient
        .from('boxes')
        .select(
          BOX_SELECT
        )
        .order(
          'id',
          {
            ascending:
              true
          }
        );


    if (reloadError) {

      throw reloadError;

    }


    state.boxes =
      freshBoxes ||
      [];


    toast(
      [
        'Инвентаризация проведена.',
        `Перемещено: ${movedCount}`,
        `Снято: ${removedCount}`,
        `Создано: ${createdCount}`
      ].join(' · ')
    );


    render();

  } catch (error) {

    console.error(
      'applyInventoryResult:',
      error
    );


    toast(
      'Ошибка проведения: ' +
      (
        error?.message ||
        'неизвестная ошибка'
      ),
      'error'
    );


    const currentButton =
      $('#inventoryApplyBtn');


    if (currentButton) {

      currentButton.disabled =
        false;

      currentButton.textContent =
        '✓ Провести инвентаризацию';

    }

  }

}

function inventoryView() {

  if (
    state.inventory.mode ===
    'scanning'
  ) {

    return inventoryScanningView();

  }


  if (
    state.inventory.mode ===
    'finished'
  ) {

    return inventoryFinishedView();

  }


  return inventorySetupView();

}


/*
  Первый экран.
*/
function inventorySetupView() {

  const warehouses =
    getInventoryWarehouses();

  const zones =
    getInventoryZones();

  const pallets =
    getInventoryPallets();

  const expected =
    getInventoryExpectedBoxes();


  return `

    <div
      class="sp-card"
      style="
        max-width:900px;
        margin-bottom:16px;
      "
    >

      <div
        style="
          margin-bottom:22px;
        "
      >

        <div
          class="sp-card-label"
        >
          ИНВЕНТАРИЗАЦИЯ
        </div>

        <h2
          style="
            margin:4px 0 8px;
          "
        >
          Проверка фактического наличия
        </h2>

        <p
          class="sp-muted"
          style="
            margin:0;
          "
        >
          Отсканируйте физические коробки
          и сравните их с базой SKLADAPLAN.
        </p>

      </div>


      <div
        class="sp-form"
      >

        <label>

          Склад

          <select
            id="inventoryWarehouse"
          >

            <option value="">
              Все склады
            </option>

            ${warehouses.map(
              warehouse => `

                <option
                  value="${escapeHtml(
                    warehouse
                  )}"
                  ${
                    state.inventory.warehouse ===
                    warehouse
                      ? 'selected'
                      : ''
                  }
                >
                  ${escapeHtml(
                    warehouse
                  )}
                </option>

              `
            ).join('')}

          </select>

        </label>


        <label>

          Зона / ряд

          <select
            id="inventoryZone"
          >

            <option value="">
              Все зоны
            </option>

            ${zones.map(
              zone => `

                <option
                  value="${escapeHtml(
                    zone
                  )}"
                  ${
                    state.inventory.zone ===
                    zone
                      ? 'selected'
                      : ''
                  }
                >
                  ${escapeHtml(
                    zone
                  )}
                </option>

              `
            ).join('')}

          </select>

        </label>


        <label
          class="full"
        >

          Палета

          <select
            id="inventoryPallet"
          >

            <option value="">
              Все паллеты
            </option>

            ${pallets.map(
              pallet => `

                <option
                  value="${escapeHtml(
                    pallet
                  )}"
                  ${
                    state.inventory.pallet ===
                    pallet
                      ? 'selected'
                      : ''
                  }
                >
                  ${escapeHtml(
                    pallet
                  )}
                </option>

              `
            ).join('')}

          </select>

        </label>


        <div
          class="sp-card"
          style="
            grid-column:1 / -1;
            background:#f7f7f7;
            box-shadow:none;
          "
        >

          <div
            class="sp-card-label"
          >
            По системе
          </div>

          <div
            class="sp-big-number"
          >
            ${expected.length}
          </div>

          <div
            class="sp-muted"
          >
            физических коробок
          </div>

        </div>


        <div
          class="sp-form-actions"
        >

          <button
            class="sp-btn secondary"
            id="inventoryResetBtn"
            type="button"
          >
            Сбросить
          </button>

          <button
            class="sp-btn"
            id="inventoryStartBtn"
            type="button"
            ${
              expected.length
                ? ''
                : 'disabled'
            }
          >
            Начать инвентаризацию
          </button>

        </div>

      </div>

    </div>

  `;

}


/*
  Экран сканирования.
*/
function inventoryScanningView() {

  const expected =
    getInventoryExpectedBoxes();

  const scanned =
    expected.filter(
      row =>
        state.inventory.scannedIds.has(
          String(row.id)
        )
    );

  const missing =
    expected.length -
    scanned.length;

  const progress =
    expected.length
      ? Math.round(
          scanned.length /
          expected.length *
          100
        )
      : 0;

  const last =
    state.inventory.lastScan;


  let resultHtml = '';


  if (last) {

    if (
      last.type ===
      'success'
    ) {

      resultHtml = `

        <div
          style="
            padding:14px;
            border-radius:12px;
            background:#f0faf4;
            color:#18794e;
            margin-bottom:16px;
          "
        >

          <b>
            ✓ ${escapeHtml(
              last.message
            )}
          </b>

          <div
            style="
              margin-top:5px;
              color:#555;
            "
          >

            ${escapeHtml(
              last.barcode
            )}

            ·

            ${escapeHtml(
              last.box?.zone_row ||
              'Место не указано'
            )}

            ·

            ${escapeHtml(
              last.box?.pallet ||
              'Паллета не указана'
            )}

          </div>

        </div>

      `;

    } else if (
      last.type ===
      'duplicate'
    ) {

      resultHtml = `

        <div
          style="
            padding:14px;
            border-radius:12px;
            background:#fff7e6;
            color:#9a6700;
            margin-bottom:16px;
          "
        >

          <b>
            ⚠ ${escapeHtml(
              last.message
            )}
          </b>

          <div
            style="
              margin-top:5px;
            "
          >
            ${escapeHtml(
              last.barcode
            )}
          </div>

        </div>

      `;

    } else if (
      last.type ===
      'outside'
    ) {

      resultHtml = `

        <div
          style="
            padding:14px;
            border-radius:12px;
            background:#fff7e6;
            color:#9a6700;
            margin-bottom:16px;
          "
        >

          <b>
            ⚠ Коробка находится
            вне выбранной области
          </b>

          <div
            style="
              margin-top:5px;
            "
          >

            ${escapeHtml(
              last.barcode
            )}

            ·

            ${escapeHtml(
              last.location?.warehouse ||
              ''
            )}

            ·

            ${escapeHtml(
              last.location?.zone ||
              ''
            )}

            ·

            ${escapeHtml(
              last.location?.pallet ||
              ''
            )}

          </div>

        </div>

      `;

    } else {

      resultHtml = `

        <div
          style="
            padding:14px;
            border-radius:12px;
            background:#fff4f2;
            color:#b42318;
            margin-bottom:16px;
          "
        >

          <b>
            ✕ Штрихкод отсутствует в базе
          </b>

          <div
            style="
              margin-top:5px;
            "
          >
            ${escapeHtml(
              last.barcode
            )}
          </div>

        </div>

      `;

    }

  }


  return `

    <div
      class="sp-card"
      style="
        margin-bottom:16px;
      "
    >

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:16px;
          flex-wrap:wrap;
          margin-bottom:18px;
        "
      >

        <div>

          <div
            class="sp-card-label"
          >
            ИНВЕНТАРИЗАЦИЯ
          </div>

          <h2
            style="
              margin:4px 0 4px;
            "
          >
            Сканирование
          </h2>

          <div
            class="sp-muted"
          >
            ${
              state.inventory.warehouse ||
              'Все склады'
            }

            ·

            ${
              state.inventory.zone ||
              'Все зоны'
            }

            ·

            ${
              state.inventory.pallet ||
              'Все паллеты'
            }
          </div>

        </div>


        <button
          class="sp-btn secondary"
          id="inventoryCancelBtn"
          type="button"
        >
          Завершить позже
        </button>

      </div>


      ${resultHtml}


      <label
        style="
          display:block;
          margin-bottom:18px;
        "
      >

        <span
          style="
            display:block;
            margin-bottom:7px;
            font-size:13px;
            font-weight:600;
          "
        >
          Штрихкод
        </span>

        <input
          id="inventoryScanner"
          type="text"
          autocomplete="off"
          inputmode="none"
          placeholder="Сканируйте штрихкод..."
          style="
            width:100%;
            min-height:58px;
            border:2px solid #111;
            border-radius:14px;
            padding:0 16px;
            font-size:20px;
            outline:none;
            box-sizing:border-box;
          "
        >

      </label>


      <div
        class="sp-grid"
        style="
          margin-bottom:18px;
        "
      >

        <div class="sp-card">

          <div
            class="sp-card-label"
          >
            По системе
          </div>

          <div
            class="sp-card-value"
          >
            ${expected.length}
          </div>

        </div>


        <div class="sp-card">

          <div
            class="sp-card-label"
          >
            Проверено
          </div>

          <div
            class="sp-card-value"
          >
            ${scanned.length}
          </div>

        </div>


        <div class="sp-card">

          <div
            class="sp-card-label"
          >
            Осталось
          </div>

          <div
            class="sp-card-value"
          >
            ${missing}
          </div>

        </div>

      </div>


      <div
        style="
          margin-bottom:20px;
        "
      >

        <div
          style="
            display:flex;
            justify-content:space-between;
            margin-bottom:7px;
            font-size:12px;
            color:#777;
          "
        >

          <span>
            Прогресс
          </span>

          <b>
            ${progress}%
          </b>

        </div>

        <div
          style="
            height:9px;
            background:#eee;
            border-radius:999px;
            overflow:hidden;
          "
        >

          <div
            style="
              width:${progress}%;
              height:100%;
              background:#111;
              border-radius:999px;
              transition:width .2s ease;
            "
          ></div>

        </div>

      </div>


      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          margin-bottom:10px;
        "
      >

        <h3
          style="
            margin:0;
            font-size:15px;
          "
        >
          Последние сканы
        </h3>

        <button
          class="sp-btn secondary"
          id="inventoryFinishBtn"
          type="button"
        >
          Завершить пересчёт
        </button>

      </div>


      <div
        class="sp-table-wrap"
      >

        <table
          class="sp-table"
          style="
            min-width:700px;
          "
        >

          <thead>

            <tr>

              <th>
                Результат
              </th>

              <th>
                Штрихкод
              </th>

              <th>
                Место
              </th>

              <th>
                Паллета
              </th>

            </tr>

          </thead>


          <tbody>

            ${
              state.inventory.recentScans
                .map(
                  scan => {

                    const color =
                      scan.type ===
                      'success'
                        ? '#18794e'
                        : scan.type ===
                          'unknown'
                          ? '#b42318'
                          : '#9a6700';

                    const label =
                      scan.type ===
                      'success'
                        ? '✓ Найдено'
                        : scan.type ===
                          'duplicate'
                          ? '⚠ Повтор'
                          : scan.type ===
                            'outside'
                            ? '⚠ Другая область'
                            : '✕ Неизвестно';

                    return `

                      <tr>

                        <td>
                          <b
                            style="
                              color:${color};
                            "
                          >
                            ${label}
                          </b>
                        </td>

                        <td>
                          ${escapeHtml(
                            scan.barcode
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            scan.box?.zone_row ||
                            scan.location?.zone ||
                            '—'
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            scan.box?.pallet ||
                            scan.location?.pallet ||
                            '—'
                          )}
                        </td>

                      </tr>

                    `;

                  }
                )
                .join('')
            }

            ${
              !state.inventory.recentScans.length
                ? `

                  <tr>

                    <td
                      colspan="4"
                      class="empty"
                    >
                      Отсканированные коробки
                      появятся здесь.
                    </td>

                  </tr>

                `
                : ''
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/*
  Финальный экран.
*/

/*
  Финальный экран.
*/
function inventoryFinishedView() {

  const expected =
    getInventoryExpectedBoxes();


  const scanned =
    expected.filter(
      row =>
        state.inventory.scannedIds.has(
          String(row.id)
        )
    );


  const missing =
    expected.filter(
      row =>
        !state.inventory.scannedIds.has(
          String(row.id)
        )
    );


  const outsideIds =
    Array.from(
      state.inventory.outsideIds ||
      []
    );


  const unknownBarcodes =
    Array.from(
      state.inventory.unknownBarcodes ||
      []
    );


  const outside =
    outsideIds
      .map(
        id =>
          state.boxes.find(
            row =>
              String(row.id) ===
              String(id)
          )
      )
      .filter(Boolean);


  const actual =
    scanned.length +
    outsideIds.length +
    unknownBarcodes.length;


  const progress =
    expected.length
      ? Math.round(
          scanned.length /
          expected.length *
          100
        )
      : 0;


  const canApply =
    Boolean(
      state.inventory.warehouse &&
      state.inventory.zone &&
      state.inventory.pallet
    );


  const alreadyApplied =
    state.inventory.result?.applied ===
    true;


  return `

    <div
      class="sp-card"
      style="
        margin-bottom:16px;
      "
    >

      <div
        style="
          margin-bottom:20px;
        "
      >

        <div
          class="sp-card-label"
        >
          РЕЗУЛЬТАТ ИНВЕНТАРИЗАЦИИ
        </div>

        <h2
          style="
            margin:4px 0;
          "
        >
          Пересчёт завершён
        </h2>

        <div
          class="sp-muted"
        >

          ${escapeHtml(
            state.inventory.warehouse ||
            'Все склады'
          )}

          ·

          ${escapeHtml(
            state.inventory.zone ||
            'Все зоны'
          )}

          ·

          ${escapeHtml(
            state.inventory.pallet ||
            'Все паллеты'
          )}

        </div>

      </div>


      <div
        class="sp-grid"
      >

        <div class="sp-card">

          <div
            class="sp-card-label"
          >
            По системе
          </div>

          <div
            class="sp-card-value"
          >
            ${expected.length}
          </div>

        </div>


        <div class="sp-card">

          <div
            class="sp-card-label"
          >
            Фактически
          </div>

          <div
            class="sp-card-value"
          >
            ${actual}
          </div>

        </div>


        <div class="sp-card">

          <div
            class="sp-card-label"
          >
            Не найдено
          </div>

          <div
            class="sp-card-value"
          >
            ${missing.length}
          </div>

        </div>


        <div class="sp-card">

          <div
            class="sp-card-label"
          >
            Переместить
          </div>

          <div
            class="sp-card-value"
          >
            ${outsideIds.length}
          </div>

        </div>


        <div class="sp-card">

          <div
            class="sp-card-label"
          >
            Новых коробок
          </div>

          <div
            class="sp-card-value"
          >
            ${unknownBarcodes.length}
          </div>

        </div>

      </div>


      <div
        style="
          padding:16px;
          background:#f7f7f7;
          border-radius:14px;
          margin:18px 0;
        "
      >

        <div
          style="
            display:flex;
            justify-content:space-between;
            margin-bottom:8px;
          "
        >

          <b>
            Найдено из ожидаемых
          </b>

          <b>
            ${progress}%
          </b>

        </div>

        <div
          style="
            height:9px;
            background:#e5e5e5;
            border-radius:999px;
            overflow:hidden;
          "
        >

          <div
            style="
              width:${progress}%;
              height:100%;
              background:#111;
              border-radius:999px;
            "
          ></div>

        </div>

      </div>


      ${
        outside.length
          ? `

            <div
              style="
                margin-bottom:20px;
              "
            >

              <h3>
                Найдены вне выбранного паллета
              </h3>

              <div
                class="sp-table-wrap"
              >

                <table
                  class="sp-table"
                >

                  <thead>

                    <tr>

                      <th>
                        Штрихкод
                      </th>

                      <th>
                        Сейчас
                      </th>

                      <th>
                        После проведения
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    ${outside.map(
                      row => `

                        <tr>

                          <td>
                            <b>
                              ${escapeHtml(
                                normalizeBarcode(
                                  row.barcode
                                )
                              )}
                            </b>
                          </td>

                          <td>

                            ${escapeHtml(
                              row.zone_row ||
                              '—'
                            )}

                            ·

                            ${escapeHtml(
                              row.pallet ||
                              '—'
                            )}

                          </td>

                          <td>

                            ${escapeHtml(
                              state.inventory.zone
                            )}

                            ·

                            ${escapeHtml(
                              state.inventory.pallet
                            )}

                          </td>

                        </tr>

                      `
                    ).join('')}

                  </tbody>

                </table>

              </div>

            </div>

          `
          : ''
      }


      ${
        unknownBarcodes.length
          ? `

            <div
              style="
                margin-bottom:20px;
              "
            >

              <h3>
                Новые коробки
              </h3>

              <div
                class="sp-table-wrap"
              >

                <table
                  class="sp-table"
                >

                  <thead>

                    <tr>

                      <th>
                        Штрихкод
                      </th>

                      <th>
                        Будет создано
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    ${unknownBarcodes.map(
                      barcode => `

                        <tr>

                          <td>
                            <b>
                              ${escapeHtml(
                                barcode
                              )}
                            </b>
                          </td>

                          <td>
                            ${escapeHtml(
                              state.inventory.warehouse
                            )}

                            ·

                            ${escapeHtml(
                              state.inventory.zone
                            )}

                            ·

                            ${escapeHtml(
                              state.inventory.pallet
                            )}
                          </td>

                        </tr>

                      `
                    ).join('')}

                  </tbody>

                </table>

              </div>

            </div>

          `
          : ''
      }


      ${
        missing.length
          ? `

            <div
              style="
                margin-bottom:20px;
              "
            >

              <h3>
                Не найдены
              </h3>

              <div
                class="sp-table-wrap"
              >

                <table
                  class="sp-table"
                >

                  <thead>

                    <tr>

                      <th>
                        Штрихкод
                      </th>

                      <th>
                        Место
                      </th>

                      <th>
                        Паллет
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    ${missing.map(
                      row => `

                        <tr>

                          <td>
                            <b>
                              ${escapeHtml(
                                normalizeBarcode(
                                  row.barcode
                                )
                              )}
                            </b>
                          </td>

                          <td>
                            ${escapeHtml(
                              row.zone_row ||
                              '—'
                            )}
                          </td>

                          <td>
                            ${escapeHtml(
                              row.pallet ||
                              '—'
                            )}
                          </td>

                        </tr>

                      `
                    ).join('')}

                  </tbody>

                </table>

              </div>

            </div>

          `
          : ''
      }


      ${
        alreadyApplied
          ? `

            <div
              class="notice"
              style="
                margin-bottom:18px;
              "
            >
              ✓ Инвентаризация проведена
              и изменения записаны в Базу.
            </div>

          `
          : canApply
            ? `

              <div
                style="
                  padding:16px;
                  background:#f7f7f7;
                  border-radius:14px;
                  margin-bottom:18px;
                "
              >

                <b>
                  Перед проведением
                </b>

                <div
                  class="sp-muted"
                  style="
                    margin-top:7px;
                    line-height:1.5;
                  "
                >

                  После подтверждения содержимое
                  выбранного паллета будет приведено
                  в соответствие с фактическим
                  пересчётом.

                </div>

              </div>

            `
            : `

              <div
                style="
                  padding:16px;
                  background:#fff4f2;
                  color:#b42318;
                  border-radius:14px;
                  margin-bottom:18px;
                "
              >

                Для проведения необходимо выбрать
                конкретные склад, зону/ряд и паллет.

              </div>

            `
      }


      <div
        style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        "
      >

        <button
          class="sp-btn secondary"
          id="inventoryBackBtn"
          type="button"
        >
          Новый пересчёт
        </button>


        ${
          !alreadyApplied
            ? `

              <button
                class="sp-btn"
                id="inventoryApplyBtn"
                type="button"
                ${
                  canApply
                    ? ''
                    : 'disabled'
                }
              >
                ✓ Провести инвентаризацию
              </button>

            `
            : ''
        }


        <button
          class="sp-btn secondary"
          id="inventoryExportBtn"
          type="button"
        >
          Экспорт результата
        </button>

      </div>

    </div>

  `;

}

function setupInventory() {

  const warehouse =
    $('#inventoryWarehouse');

  const zone =
    $('#inventoryZone');

  const pallet =
    $('#inventoryPallet');


  warehouse?.addEventListener(
    'change',
    event => {

      state.inventory.warehouse =
        event.target.value;

      state.inventory.zone =
        '';

      state.inventory.pallet =
        '';

      render();

    }
  );


  zone?.addEventListener(
    'change',
    event => {

      state.inventory.zone =
        event.target.value;

      state.inventory.pallet =
        '';

      render();

    }
  );


  pallet?.addEventListener(
    'change',
    event => {

      state.inventory.pallet =
        event.target.value;

      render();

    }
  );


  $('#inventoryStartBtn')
    ?.addEventListener(
      'click',
      startInventory
    );


  $('#inventoryResetBtn')
    ?.addEventListener(
      'click',
      resetInventory
    );


  $('#inventoryCancelBtn')
    ?.addEventListener(
      'click',
      () => {

        state.inventory.mode =
          'setup';

        render();

      }
    );


  $('#inventoryFinishBtn')
    ?.addEventListener(
      'click',
      finishInventory
    );


  $('#inventoryBackBtn')
    ?.addEventListener(
      'click',
      resetInventory
    );

   $('#inventoryApplyBtn')
  ?.addEventListener(
    'click',
    applyInventoryResult
  );

  $('#inventoryExportBtn')
    ?.addEventListener(
      'click',
      exportInventoryResult
    );


  const scanner =
    $('#inventoryScanner');


  scanner?.addEventListener(
    'keydown',
    event => {

      if (
        event.key !==
        'Enter'
      ) {
        return;
      }

      event.preventDefault();

      const value =
        scanner.value;

      scanner.value =
        '';

      inventoryScan(
        value
      );

    }
  );


  setTimeout(
    () => {

      scanner?.focus();

    },
    50
  );

}


/*
  Экспорт результата без изменения базы.
*/
function exportInventoryResult() {

  const expected =
    getInventoryExpectedBoxes();

  const scanned =
    expected.filter(
      row =>
        state.inventory.scannedIds.has(
          String(row.id)
        )
    );

  const missing =
    expected.filter(
      row =>
        !state.inventory.scannedIds.has(
          String(row.id)
        )
    );


  const result = {

    app:
      'SKLADAPLAN',

    type:
      'inventory',

    created_at:
      new Date().toISOString(),

    started_at:
      state.inventory.startedAt,

    finished_at:
      state.inventory.finishedAt,

    warehouse:
      state.inventory.warehouse ||
      null,

    zone:
      state.inventory.zone ||
      null,

    pallet:
      state.inventory.pallet ||
      null,

    expected:
      expected.length,

    scanned:
      scanned.length,

    missing:
      missing.length,

    missing_boxes:
      missing.map(
        row => ({
          id:
            row.id,

          barcode:
            normalizeBarcode(
              row.barcode
            ),

          article:
            row.article,

          zone_row:
            row.zone_row,

          pallet:
            row.pallet,

          warehouse:
            row.warehouse
        })
      ),

    scans:
      state.inventory.recentScans

  };


  downloadJSON(
    result,
    `skladaplan-inventory-${todayFileDate()}.json`
  );


  toast(
    'Результат инвентаризации экспортирован'
  );

}

function toolsView() {

  if (
    state.activeTool ===
    'inventory'
  ) {

    return inventoryView();

  }
  return `

    <div class="sp-grid">

      <div class="sp-card">

        <h3>
          Импорт Excel
        </h3>

        <p class="sp-muted">

          Добавить коробки из XLS/XLSX.
          Каждая строка Excel считается
          отдельной физической коробкой.

        </p>


        <button
          class="sp-btn"
          id="openExcelBtn"
        >
          📥 Импорт Excel
        </button>

      </div>


      <div class="sp-card">

        <h3>
          Экспорт
        </h3>

        <p class="sp-muted">
          Скачать текущую базу коробок.
        </p>


        <button
          class="sp-btn secondary"
          id="exportJsonBtn"
        >
          Экспорт JSON
        </button>

      </div>


      <div class="sp-card">

        <h3>
          Backup
        </h3>

        <p class="sp-muted">
          Создать локальную копию текущей базы.
        </p>


        <button
          class="sp-btn secondary"
          id="backupToolsBtn"
        >
          Создать backup
        </button>

      </div>


      <div class="sp-card">

        <h3>
          Аккаунт
        </h3>

        <p class="sp-muted">
          ${escapeHtml(
            state.user?.email || ''
          )}
        </p>


        <button
          class="sp-btn danger"
          id="logoutBtn"
        >
          Выйти
        </button>

      </div>

    </div>

  `;

}


function setupTools() {

  if (
    state.activeTool ===
    'inventory'
  ) {

    setupInventory();

    return;

  }
   
  $('#openExcelBtn')
    ?.addEventListener(
      'click',
      openExcelImport
    );


  $('#exportJsonBtn')
    ?.addEventListener(
      'click',
      exportJSON
    );


  $('#backupToolsBtn')
    ?.addEventListener(
      'click',
      backupDatabase
    );


  $('#logoutBtn')
    ?.addEventListener(
      'click',
      logout
    );

}


/* =========================================================
   JSON EXPORT / BACKUP
   ========================================================= */

function exportJSON() {

  downloadJSON(
    state.boxes,
    `skladaplan-${todayFileDate()}.json`
  );


  toast(
    'JSON экспортирован'
  );

}


function backupDatabase() {

  const backup = {

    app:
      'SKLADAPLAN',

    created_at:
      new Date().toISOString(),

    user:
      state.user?.email ||
      null,

    boxes:
      state.boxes

  };


  downloadJSON(
    backup,
    `skladaplan-backup-${todayFileDate()}.json`
  );


  toast(
    'Backup создан'
  );

}


/* =========================================================
   EXCEL IMPORT
   ========================================================= */

const EXCEL_MAP = {

  barcode: [
    'штрихкод',
    'barcode',
    'баркод',
    'код',
    'штрих код'
  ],

  article: [
    'артикул',
    'article',
    'sku'
  ],

  quantity_in_box: [
    'колвокоробке',
    'количествовкоробке',
    'количество',
    'quantityinbox'
  ],

  zone_row: [
    'зонаряд',
    'зона',
    'ряд',
    'zonerow',
    'location',
    'место'
  ],

  pallet: [
    'поддон',
    'паллета',
    'pallet'
  ],

  status: [
    'статус',
    'status'
  ],

  date: [
    'датаразмещения',
    'дата',
    'date'
  ],

  warehouse: [
    'склад',
    'warehouse'
  ],

  worker: [
    'изменил',
    'ктоработал',
    'worker'
  ]

};

/*
  Находим колонки один раз.

  Это важно для больших Excel:
  раньше findExcelColumn()
  запускался для каждого поля
  каждой строки.
*/

function buildExcelColumnMap(
  headers
) {

  const map = {};


  for (
    const field of Object.keys(
      EXCEL_MAP
    )
  ) {

    map[field] =
      findExcelColumn(
        headers,
        EXCEL_MAP[field]
      );

  }


  return map;

}


function findExcelColumn(
  headers,
  aliases
) {

  const normalizedHeaders =
    headers.map(
      header => ({
        original:
          header,
        normalized:
          normalizeHeader(header)
      })
    );


  for (
    const alias of aliases
  ) {

    const normalizedAlias =
      normalizeHeader(alias);


    const found =
      normalizedHeaders.find(
        item =>
          item.normalized ===
          normalizedAlias
      );


    if (found) {

      return found.original;

    }

  }


  return null;

}


/*
  convertExcelRow теперь получает
  заранее подготовленный columnMap.
*/

function convertExcelRow(
  row,
  columnMap
) {

  function valueFor(field) {

    const column =
      columnMap[field];

    return column
      ? row[column]
      : '';

  }


  const barcode =
    normalizeBarcode(
      valueFor('barcode')
    );


  if (!barcode) {

    return null;

  }


  return {

    "Штрихкод":
      barcode,

    "Артикул":
      normalizeText(
        valueFor('article')
      ) || null,

    "Кол-во в коробке":
      normalizeText(
        valueFor('quantity_in_box')
      ) || null,

    "Зона/ряд":
      normalizeText(
        valueFor('zone_row')
      ) || null,

    "Поддон":
      normalizeText(
        valueFor('pallet')
      ) || null,

    "Статус":
      normalizeText(
        valueFor('status')
      ) || STATUSES.STOCK,

    "ДатаРазмещения":
      toISODate(
        valueFor('date')
      ),

    "Склад":
      normalizeText(
        valueFor('warehouse')
      ) || null,

    "Изменил":
      normalizeText(
        valueFor('worker')
      ) || null

  };

}

function openExcelImport() {

  const input =
    document.createElement(
      'input'
    );


  input.type =
    'file';


  input.accept =
    '.xlsx,.xls';


  input.addEventListener(
    'change',
    handleExcelFile
  );


  input.click();

}


/* =========================================================
   READ EXCEL
   ========================================================= */

async function handleExcelFile(
  event
) {

  const file =
    event.target.files?.[0];


  if (!file) {

    return;

  }


  if (
    typeof XLSX ===
    'undefined'
  ) {

    toast(
      'Библиотека XLSX не загрузилась',
      'error'
    );


    return;

  }


  try {

    toast(
      'Читаю Excel-файл...'
    );


    /*
      Читаем файл один раз.
    */

    const buffer =
      await file.arrayBuffer();


    const workbook =
      XLSX.read(
        buffer,
        {
          type: 'array',
          cellDates: true
        }
      );


    const sheetName =
      workbook.SheetNames[0];


    if (!sheetName) {

      throw new Error(
        'В Excel нет листов'
      );

    }


    const sheet =
      workbook.Sheets[
        sheetName
      ];


    /*
      raw:false оставляем специально,
      чтобы даты и числа Excel
      корректно преобразовывались
      в строки для нормализации.
    */

const rows =
  XLSX.utils.sheet_to_json(
    sheet,
    {
      defval: '',
      raw: true
    }
  );

    if (!rows.length) {

      toast(
        'Excel-файл пустой',
        'error'
      );


      return;

    }


    const headers =
      Object.keys(
        rows[0]
      );


    /*
      ВАЖНО:
      определяем соответствие колонок
      только один раз.
    */

    const columnMap =
      buildExcelColumnMap(
        headers
      );


    /*
      Штрихкод обязателен.
    */

    if (!columnMap.barcode) {

      toast(
        'Не найдена колонка "Штрихкод"',
        'error'
      );


      return;

    }


    const converted =
      new Array(
        rows.length
      );


    let validCount =
      0;


    let errors =
      0;


    /*
      Обрабатываем строки блоками,
      чтобы браузер не зависал на
      больших файлах.
    */

    const PARSE_BLOCK =
      2000;


    for (
      let start = 0;
      start < rows.length;
      start += PARSE_BLOCK
    ) {

      const end =
        Math.min(
          start +
            PARSE_BLOCK,
          rows.length
        );


      for (
        let i = start;
        i < end;
        i++
      ) {

        try {

          const convertedRow =
            convertExcelRow(
              rows[i],
              columnMap
            );


          if (!convertedRow) {

            errors++;

            continue;

          }


          converted[
            validCount
          ] =
            convertedRow;


          validCount++;

        } catch (error) {

          console.error(
            'Excel row error:',
            error
          );


          errors++;

        }

      }


      /*
        Даём браузеру возможность
        обновить интерфейс.
      */

      if (
        end < rows.length
      ) {

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              0
            )
        );

      }

    }


    converted.length =
      validCount;


    state.excelRows =
      converted;


    state.excelFileName =
      file.name;


    state.excelSheetName =
      sheetName;


    state.excelHeaders =
      headers;


    showExcelPreview(
      rows.length,
      errors,
      headers
    );


  } catch (error) {

    console.error(
      'Excel error:',
      error
    );


    toast(
      error.message ||
      'Ошибка чтения Excel',
      'error'
    );

  }

}


/* =========================================================
   EXCEL PREVIEW
   ========================================================= */

function showExcelPreview(
  sourceRows,
  errors,
  headers
) {

  $('#excelImportModal')
    ?.remove();


  const previewRows =
    state.excelRows
      .slice(0, 20);


  const modal =
    document.createElement(
      'div'
    );


  modal.id =
    'excelImportModal';


  modal.className =
    'sp-modal-backdrop';


  modal.innerHTML = `

    <div class="sp-modal">

      <div class="sp-modal-head">

        <h2 style="margin:0">
          Импорт Excel
        </h2>


        <button
          class="sp-modal-close"
          id="closeExcelModal"
        >
          ×
        </button>

      </div>


      <div class="sp-card">

        <b>
          ${escapeHtml(
            state.excelFileName
          )}
        </b>

        <br>

        Лист:

        <b>
          ${escapeHtml(
            state.excelSheetName
          )}
        </b>

        <br><br>

        Строк в Excel:

        <b>
          ${sourceRows}
        </b>

        <br>

        Готово к импорту:

        <b>
          ${state.excelRows.length}
        </b>

        <br>

        Ошибок:

        <b>
          ${errors}
        </b>

      </div>


      <p class="sp-muted">

        Будет добавлена каждая строка Excel.
        Дубликаты штрихкодов НЕ объединяются.

      </p>


      <div class="sp-import-preview">

        <table>

          <thead>

            <tr>

              <th>Штрихкод</th>
              <th>Артикул</th>
              <th>Зона/ряд</th>
              <th>Поддон</th>
              <th>Статус</th>
              <th>Дата</th>
              <th>Склад</th>

            </tr>

          </thead>


          <tbody>

            ${
              previewRows.map(
                row => `

                  <tr>

                    <td>
                      ${escapeHtml(
                        row.barcode
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.article
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.zone_row
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.pallet
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.status
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        formatDate(row.date)
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.warehouse
                      )}
                    </td>

                  </tr>

                `
              ).join('')

            }

          </tbody>

        </table>

      </div>


      <div class="sp-form-actions">

        <button
          class="sp-btn secondary"
          id="cancelExcelImport"
        >
          Отмена
        </button>


        <button
          class="sp-btn"
          id="startExcelImport"
          ${
            state.excelRows.length
              ? ''
              : 'disabled'
          }
        >
          Импортировать
          ${state.excelRows.length}
        </button>

      </div>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  $('#closeExcelModal')
    .addEventListener(
      'click',
      () => modal.remove()
    );


  $('#cancelExcelImport')
    .addEventListener(
      'click',
      () => modal.remove()
    );


  $('#startExcelImport')
    .addEventListener(
      'click',
      importExcelRows
    );

}


/* =========================================================
   EXCEL IMPORT PROGRESS HELPERS
   ========================================================= */

function formatImportNumber(
  value
) {

  return Number(
    value || 0
  ).toLocaleString(
    'ru-RU'
  );

}


function formatImportTime(
  seconds
) {

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {

    return '—';

  }


  seconds =
    Math.ceil(seconds);


  const hours =
    Math.floor(
      seconds / 3600
    );


  const minutes =
    Math.floor(
      (seconds % 3600) / 60
    );


  const secs =
    seconds % 60;


  if (hours > 0) {

    return `${hours}ч ${minutes}м`;

  }


  if (minutes > 0) {

    return `${minutes}м ${secs}с`;

  }


  return `${secs}с`;

}


function updateExcelImportProgress(
  message = ''
) {

  const total =
    state.excelImportTotal;


  const processed =
    state.excelImportProcessed;


  const percent =
    total > 0
      ? Math.min(
          100,
          (
            processed /
            total
          ) *
          100
        )
      : 0;


  const elapsed =
    state.excelImportStartedAt
      ? (
          Date.now() -
          state.excelImportStartedAt
        ) / 1000
      : 0;


  const speed =
    elapsed > 0
      ? processed /
        elapsed
      : 0;


  const remaining =
    speed > 0
      ? (
          total -
          processed
        ) / speed
      : 0;


  const percentElement =
    $('#excelImportPercent');


  const fill =
    $('#excelImportProgressFill');


  const processedElement =
    $('#excelImportProcessed');


  const successElement =
    $('#excelImportSuccess');


  const failedElement =
    $('#excelImportFailed');


  const speedElement =
    $('#excelImportSpeed');


  const etaElement =
    $('#excelImportEta');


  const messageElement =
    $('#excelImportMessage');


  if (percentElement) {

    percentElement.textContent =
      `${percent.toFixed(1)}%`;

  }


  if (fill) {

    fill.style.width =
      `${percent}%`;

  }


  if (processedElement) {

    processedElement.textContent =
      `${formatImportNumber(
        processed
      )} / ${formatImportNumber(
        total
      )}`;

  }


  if (successElement) {

    successElement.textContent =
      formatImportNumber(
        state.excelImportImported
      );

  }


  if (failedElement) {

    failedElement.textContent =
      formatImportNumber(
        state.excelImportFailed
      );

  }


  if (speedElement) {

    speedElement.textContent =
      speed > 0
        ? `${speed.toFixed(0)} стр/с`
        : '—';

  }


  if (etaElement) {

    etaElement.textContent =
      remaining > 0
        ? formatImportTime(
            remaining
          )
        : '—';

  }


  if (
    messageElement &&
    message
  ) {

    messageElement.textContent =
      message;

  }

}


function showExcelImportProgress() {

  $('#excelImportModal')
    ?.remove();


  const modal =
    document.createElement(
      'div'
    );


  modal.id =
    'excelImportModal';


  modal.className =
    'sp-modal-backdrop';


  modal.innerHTML = `

    <div class="sp-modal">

      <div class="sp-modal-head">

        <h2 style="margin:0">
          Импорт Excel
        </h2>

      </div>


      <div class="sp-import-progress">

        <div class="sp-import-progress-title">

          Загружаем
          ${escapeHtml(
            state.excelFileName
          )}

        </div>


        <div
          class="sp-import-percent"
          id="excelImportPercent"
        >
          0.0%
        </div>


        <div
          class="sp-import-progress-bar"
        >

          <div
            class="sp-import-progress-fill"
            id="excelImportProgressFill"
          ></div>

        </div>


        <div class="sp-import-stats">

          <div class="sp-import-stat">

            <div class="sp-import-stat-label">
              Обработано
            </div>

            <div
              class="sp-import-stat-value"
              id="excelImportProcessed"
            >
              0 / 0
            </div>

          </div>


          <div class="sp-import-stat">

            <div class="sp-import-stat-label">
              Успешно
            </div>

            <div
              class="sp-import-stat-value"
              id="excelImportSuccess"
            >
              0
            </div>

          </div>


          <div class="sp-import-stat">

            <div class="sp-import-stat-label">
              Ошибок
            </div>

            <div
              class="sp-import-stat-value"
              id="excelImportFailed"
            >
              0
            </div>

          </div>


          <div class="sp-import-stat">

            <div class="sp-import-stat-label">
              Скорость
            </div>

            <div
              class="sp-import-stat-value"
              id="excelImportSpeed"
            >
              —
            </div>

          </div>


          <div class="sp-import-stat">

            <div class="sp-import-stat-label">
              Осталось
            </div>

            <div
              class="sp-import-stat-value"
              id="excelImportEta"
            >
              —
            </div>

          </div>


          <div class="sp-import-stat">

            <div class="sp-import-stat-label">
              Параллельных потоков
            </div>

            <div
              class="sp-import-stat-value"
            >
              ${EXCEL_PARALLEL_CHUNKS}
            </div>

          </div>

        </div>


        <div
          class="sp-import-message"
          id="excelImportMessage"
        >
          Подготавливаем импорт...
        </div>


        <div class="sp-form-actions">

          <button
            class="sp-btn danger"
            id="cancelRunningExcelImport"
          >
            Остановить импорт
          </button>

        </div>

      </div>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  $('#cancelRunningExcelImport')
    .addEventListener(
      'click',
      () => {

        state.excelImportCancelled =
          true;


        const button =
          $('#cancelRunningExcelImport');


        if (button) {

          button.disabled =
            true;

          button.textContent =
            'Останавливаем...';

        }


        updateExcelImportProgress(
          'Останавливаем импорт. Завершаем текущие запросы...'
        );

      }
    );


  updateExcelImportProgress();

}


/* =========================================================
   INSERT ONE EXCEL CHUNK
   ========================================================= */

async function insertExcelChunk(
  chunk
) {

  if (!chunk.length) {

    return {
      imported: 0,
      failed: 0
    };

  }


  /*
    Если пользователь нажал остановить,
    не начинаем новую пачку.
  */

  if (state.excelImportCancelled) {

    return {
      imported: 0,
      failed: 0,
      cancelled: true
    };

  }


  /*
    Основная попытка:
    отправляем всю пачку одним INSERT.

    ВАЖНО:
    convertExcelRow() уже должен возвращать
    русские названия колонок Supabase:

    Штрихкод
    Артикул
    Кол-во в коробке
    Зона/ряд
    Поддон
    Статус
    ДатаРазмещения
    Склад
    Изменил
  */

  const {
    error
  } =
    await supabaseClient
      .from('boxes')
      .insert(chunk);


  /*
    Если всё прошло успешно.
  */

  if (!error) {

    return {
      imported: chunk.length,
      failed: 0
    };

  }


  /*
    Печатаем ПОЛНУЮ информацию об ошибке
    в консоль браузера.
  */

  console.error(
    '❌ Ошибка INSERT Excel chunk:',
    error
  );

  console.error(
    'Message:',
    error?.message
  );

  console.error(
    'Details:',
    error?.details
  );

  console.error(
    'Hint:',
    error?.hint
  );

  console.error(
    'Code:',
    error?.code
  );

  console.error(
    'Chunk:',
    chunk
  );


  /*
    Если большая пачка не прошла,
    делим её пополам.

    Это позволяет обнаружить отдельные
    проблемные строки.
  */

  if (
    chunk.length >
    EXCEL_MIN_FALLBACK_CHUNK
  ) {

    const middle =
      Math.floor(
        chunk.length / 2
      );


    const first =
      chunk.slice(
        0,
        middle
      );


    const second =
      chunk.slice(
        middle
      );


    const firstResult =
      await insertExcelChunk(
        first
      );


    if (
      state.excelImportCancelled
    ) {

      return {

        imported:
          firstResult.imported,

        failed:
          firstResult.failed,

        cancelled:
          true

      };

    }


    const secondResult =
      await insertExcelChunk(
        second
      );


    return {

      imported:
        firstResult.imported +
        secondResult.imported,

      failed:
        firstResult.failed +
        secondResult.failed,

      cancelled:
        secondResult.cancelled

    };

  }


  /*
    Маленькая проблемная пачка.

    Теперь проверяем каждую строку отдельно.
  */

  let imported =
    0;


  let failed =
    0;


  for (
    const row of chunk
  ) {

    if (
      state.excelImportCancelled
    ) {

      break;

    }


    /*
      Вставляем одну строку.
    */

    const {
      error: rowError
    } =
      await supabaseClient
        .from('boxes')
        .insert(row);


    if (rowError) {

      console.error(
        '❌ Ошибка импорта строки:',
        rowError
      );

      console.error(
        'Message:',
        rowError?.message
      );

      console.error(
        'Details:',
        rowError?.details
      );

      console.error(
        'Hint:',
        rowError?.hint
      );

      console.error(
        'Code:',
        rowError?.code
      );

      console.error(
        'Проблемная строка:',
        row
      );


      failed++;

    } else {

      imported++;

    }


    /*
      Обновляем общий прогресс.
    */

    state.excelImportProcessed++;


    if (!rowError) {

      state.excelImportImported++;

    } else {

      state.excelImportFailed++;

    }


    updateExcelImportProgress(
      'Обрабатывается небольшая проблемная пачка...'
    );

  }


  /*
    Возвращаем результат.
  */

  return {

    imported,

    failed,

    processedInternally:
      imported + failed,

    cancelled:
      state.excelImportCancelled

  };

}


/* =========================================================
   EXCEL IMPORT
   ========================================================= */

async function importExcelRows() {

  if (
    state.excelImporting
  ) {

    return;

  }


  const rows =
    [...state.excelRows];


  if (!rows.length) {

    return;

  }


  state.excelImporting =
    true;


  state.excelImportCancelled =
    false;


  state.excelImportStartedAt =
    Date.now();


  state.excelImportImported =
    0;


  state.excelImportFailed =
    0;


  state.excelImportProcessed =
    0;


  state.excelImportTotal =
    rows.length;


  showExcelImportProgress();


  /*
    Разбиваем весь Excel
    на большие пачки.
  */

  const chunks = [];


  for (
    let i = 0;
    i < rows.length;
    i += EXCEL_CHUNK_SIZE
  ) {

    chunks.push(
      rows.slice(
        i,
        i +
          EXCEL_CHUNK_SIZE
      )
    );

  }


  try {

    /*
      Обрабатываем максимум
      EXCEL_PARALLEL_CHUNKS
      пачек одновременно.
    */

    for (
      let index = 0;
      index < chunks.length;
      index += EXCEL_PARALLEL_CHUNKS
    ) {

      if (
        state.excelImportCancelled
      ) {

        break;

      }


      const batch =
        chunks.slice(
          index,
          index +
            EXCEL_PARALLEL_CHUNKS
        );


      updateExcelImportProgress(
        `Загружаем пачки ${index + 1}–${Math.min(
          index +
            batch.length,
          chunks.length
        )} из ${chunks.length}...`
      );


      /*
        Запускаем пачки параллельно.
      */

      const results =
        await Promise.all(
          batch.map(
            chunk =>
              insertExcelChunk(
                chunk
              )
          )
        );


      /*
        Учитываем результаты.

        processedInternally используется
        только для маленького fallback,
        где строки уже были учтены
        внутри insertExcelChunk().
      */

      for (
        const result of results
      ) {

        state.excelImportImported +=
          result.imported || 0;


        state.excelImportFailed +=
          result.failed || 0;


        const internallyProcessed =
          result.processedInternally ||
          0;


        const regularProcessed =
          (
            result.imported || 0
          ) +
          (
            result.failed || 0
          ) -
          internallyProcessed;


        /*
          Если данные были импортированы
          обычной пачкой, увеличиваем
          processed здесь.

          Если использовался построчный
          fallback, он уже увеличил
          processed сам.
        */

        state.excelImportProcessed +=
          regularProcessed;

      }


      updateExcelImportProgress(
        state.excelImportCancelled
          ? 'Импорт остановлен.'
          : 'Пачка загружена.'
      );


      /*
        Небольшая пауза между группами.
        Даём браузеру и сети передохнуть.
      */

      if (
        !state.excelImportCancelled &&
        index +
          EXCEL_PARALLEL_CHUNKS <
          chunks.length
      ) {

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              50
            )
        );

      }

    }


    const cancelled =
      state.excelImportCancelled;


    /*
      Сохраняем статистику до закрытия
      progress modal.
    */

    const imported =
      state.excelImportImported;


    const failed =
      state.excelImportFailed;


    const processed =
      state.excelImportProcessed;


    /*
      Закрываем progress.
    */

    $('#excelImportModal')
      ?.remove();


    state.excelRows =
      [];


    state.excelImporting =
      false;


    /*
      Один reload после всего импорта.

      Это важно: не делаем reload
      после каждой пачки.
    */

    await loadBoxesFromSupabase();


    state.currentPage =
      'base';


    state.basePage =
      1;


    render();


    if (cancelled) {

      toast(
        `Импорт остановлен. Добавлено: ${imported}. Ошибок: ${failed}.`
      );

    } else {

      toast(
        `Импорт завершён. Добавлено: ${imported}. Ошибок: ${failed}.`
      );

    }


    console.log(
      'Excel import finished:',
      {
        total:
          rows.length,
        processed,
        imported,
        failed,
        cancelled
      }
    );


  } catch (error) {

    console.error(
      'Import error:',
      error
    );


    state.excelImporting =
      false;


    const button =
      $('#cancelRunningExcelImport');


    if (button) {

      button.disabled =
        false;

      button.textContent =
        'Повторить';

    }


    toast(
      error.message ||
      'Ошибка импорта',
      'error'
    );

  }

}


/* =========================================================
   NAVIGATION
   ========================================================= */

const PAGE_META = {

  dashboard: {

    title:
      'Главная',

    heading:
      'Главный экран склада'

  },


  base: {

    title:
      'База',

    heading:
      'База коробок'

  },


  assembly: {

    title:
      'Сборка',

    heading:
      'Комплектация заказа'

  },


received: {
  title:
    'Приёмка',

  heading:
    'Приёмка товара'
},


  collected: {

    title:
      'Собрано',

    heading:
      'Скомплектованные коробки'

  },


  shipped: {

    title:
      'Убыло',

    heading:
      'Отгруженные коробки'

  },


  tools: {
    title:
      'Инструменты',

    heading:
      'Инструменты SKLADAPLAN'
  },


  comparison: {
    title:
      'Сравнение',

    heading:
      'Сравнение заявки'
  }

};


function goToPage(
  page
) {

  if (
    !PAGE_META[page]
  ) {

    page =
      'dashboard';

  }


  state.currentPage =
    page;

   if (
  page !== 'tools'
) {

  state.activeTool =
    '';

}


  state.basePage =
    page === 'base'
      ? state.basePage
      : 1;


  render();

}


/* =========================================================
   RENDER
   ========================================================= */

function render() {

  const content =
    $('#content');


  if (!content) {

    return;

  }


  const meta =
    PAGE_META[
      state.currentPage
    ] ||
    PAGE_META.dashboard;

   const effectiveMeta =
  state.currentPage === 'tools' &&
  state.activeTool === 'inventory'

    ? {
        title:
          'Инвентаризация',

        heading:
          'Инвентаризация склада'
      }

    : meta;


$('#pageTitle').textContent =
  effectiveMeta.title;

$('#heading').textContent =
  effectiveMeta.heading;


  $all('.nav')
    .forEach(
      button => {

        button.classList.toggle(
          'active',
          button.dataset.page ===
          state.currentPage
        );

      }
    );


  $all('.mobile-nav-btn')
    .forEach(
      button => {

        button.classList.toggle(
          'active',
          button.dataset.page ===
          state.currentPage
        );

      }
    );


  switch (
    state.currentPage
  ) {

    case 'base':

      content.innerHTML =
        baseView();

      setupBase();

      break;


    case 'assembly':

      content.innerHTML =
        assemblyView();

      setupAssembly();

      break;

    case 'received':

      content.innerHTML =
        receivedView();

      /*
        Сначала показываем интерфейс.

        Затем setupReceived()
        либо подключит обработчики,
        либо запустит загрузку данных.
      */

      setupReceived();

      break;

    case 'collected':

      content.innerHTML =
        collectedView();

      setupCollected();

      break;


    case 'shipped':

      content.innerHTML =
        shippedView();

      break;

   case 'comparison':

      content.innerHTML =
        comparisonView();

      setupComparison();

      break;



    case 'tools':

      content.innerHTML =
        toolsView();

      setupTools();

      break;


    default:

      content.innerHTML =
        dashboardView();

  }


  updateAssemblyBadges();

}


/* =========================================================
   BADGES
   ========================================================= */

function updateAssemblyBadges() {

  const count =
    getPickingBoxes().length;


  const badge =
    $('#assemblyBadge');


  const mobileBadge =
    $('#mobileAssemblyBadge');


  if (badge) {

    badge.textContent =
      count || '';


    badge.style.cssText = `
      margin-left:auto;
      background:#111;
      color:#fff;
      border-radius:999px;
      padding:2px 7px;
      font-size:11px;
    `;

  }


  if (mobileBadge) {

    mobileBadge.textContent =
      count || '';


    mobileBadge.style.cssText = `
      margin-left:3px;
      background:#111;
      color:#fff;
      border-radius:999px;
      padding:1px 5px;
      font-size:10px;
    `;

  }

}


/* =========================================================
   GLOBAL EVENTS
   ========================================================= */

function setupNavigation() {

  /*
    ОСНОВНАЯ НАВИГАЦИЯ

    Обрабатываем все кнопки,
    у которых есть data-page.
  */

  $all(
    '[data-page]'
  )
    .forEach(
      button => {

button.addEventListener(
  'click',
  () => {

    /*
      Специальные инструменты.
    */

    if (
      button.dataset.tool ===
      'inventory'
    ) {

      state.activeTool =
        'inventory';

      goToPage(
        'tools'
      );

    } else {

      state.activeTool =
        '';

      goToPage(
        button.dataset.page
      );

    }


            /*
              На телефоне после перехода
              автоматически закрываем
              боковое меню.
            */

            if (
              window.innerWidth <= 700
            ) {

              document
                .querySelector(
                  '.sidebar'
                )
                ?.classList.remove(
                  'open'
                );

            }

          }
        );

      }
    );


  /*
    КНОПКА МОБИЛЬНОГО МЕНЮ

    Открывает / закрывает боковую панель.
  */

  $('#mobileMenu')
    ?.addEventListener(
      'click',
      () => {

        document
          .querySelector(
            '.sidebar'
          )
          ?.classList.toggle(
            'open'
          );

      }
    );


  /*
    КНОПКА «ЕЩЁ»

    На мобильном открывает
    полноценное боковое меню.
  */

  $('#mobileMore')
    ?.addEventListener(
      'click',
      () => {

        document
          .querySelector(
            '.sidebar'
          )
          ?.classList.add(
            'open'
          );

      }
    );


  /*
    СТАРЫЕ КНОПКИ ЭКСПОРТА

    Оставляем обработчики безопасными.
    Если кнопок нет в index.html —
    ничего не происходит.
  */

  $('#exportBtn')
    ?.addEventListener(
      'click',
      exportJSON
    );


  $('#backupBtn')
    ?.addEventListener(
      'click',
      backupDatabase
    );

}


/* =========================================================
   AUTHENTICATED APP
   ========================================================= */

async function startAuthenticatedApp() {

  $('#spLogin')?.remove();


  const content =
    $('#content');


  if (content) {

    content.innerHTML = `

      <div class="sp-loading">
        Загружаем базу SKLADAPLAN...
      </div>

    `;

  }


  try {

    await loadBoxesFromSupabase();


    render();


  } catch (error) {

    console.error(
      'Database load error:',
      error
    );


    if (content) {

      content.innerHTML = `

        <div class="sp-card">

          <h2>
            Ошибка подключения к Supabase
          </h2>


          <p>
            ${escapeHtml(
              error.message ||
              'Неизвестная ошибка'
            )}
          </p>


          <button
            class="sp-btn"
            onclick="location.reload()"
          >
            Повторить
          </button>

        </div>

      `;

    }

  }

}


/* =========================================================
   APP START
   ========================================================= */

async function startApp() {

  ensureAppStyles();


  setupNavigation();


  /*
    Получаем текущую сессию.
  */

  const {
    data,
    error
  } =
    await supabaseClient.auth
      .getSession();


  if (error) {

    console.error(
      error
    );


    showLogin();

    return;

  }


  state.session =
    data.session;


  state.user =
    data.session?.user ||
    null;


  if (
    !data.session
  ) {

    showLogin();

  } else {

    await startAuthenticatedApp();

  }


  /*
    Отслеживаем вход/выход.
  */

  supabaseClient.auth
    .onAuthStateChange(
      async (
        event,
        session
      ) => {

        console.log(
          'Auth event:',
          event
        );


        if (
          event ===
          'SIGNED_OUT'
        ) {

          state.session =
            null;


          state.user =
            null;


          state.boxes =
            [];


          showLogin();


          return;

        }


        if (
          event ===
          'SIGNED_IN'
        ) {

          state.session =
            session;


          state.user =
            session?.user ||
            null;


          await startAuthenticatedApp();

        }

      }
    );

}


/* =========================================================
   BOOT
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  startApp
);
