/* =========================================================
   SKLADAPLAN
   Local WMS / Supabase
   ========================================================= */

'use strict';

/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL = 'https://ithhecprdosvjiddoalq.supabase.co';

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

const EXCEL_CHUNK_SIZE = 500;

const BOX_SELECT =
  'id,barcode,article,quantity_in_box,zone_row,pallet,status,date,warehouse,column_9,direction,pick,worker,created_at,updated_at';


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

  loading: false,

  currentPage: 'dashboard',

  basePage: 1,

  baseSearch: '',

  baseWarehouse: '',

  baseStatus: '',

  selectedIds: new Set(),

  editingId: null,

  currentPallet: '',

  scannerInput: '',

  scannerActive: false,

  excelRows: [],

  excelFileName: '',

  excelSheetName: '',

  user: null,

  session: null

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

  if (value === null || value === undefined) {
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

  let str = String(value).trim();

  if (!str) {
    return '';
  }

  str = str.replace(/\s+/g, '');

  /*
    Excel can give:

    4810122659354.0
    4810122659354,0
    4.810122659354E+12
  */

  str = str.replace(',', '.');

  if (/^\d+\.0+$/.test(str)) {
    str = str.split('.')[0];
  }

  if (/^\d+e\+\d+$/i.test(str)) {

    const number = Number(str);

    if (Number.isFinite(number)) {
      str = String(Math.trunc(number));
    }
  }

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

  const str = String(value).trim();

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

    let year = ru[3];

    if (year.length === 2) {
      year = `20${year}`;
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


  if (value instanceof Date) {

    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }


  const str = String(value).trim();

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

    const serial = Number(str);

    const date =
      new Date(
        Date.UTC(1899, 11, 30) +
        serial * 86400000
      );

    return date.toISOString().slice(0, 10);
  }


  /*
    DD.MM.YYYY
  */

  let match =
    str.match(
      /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/
    );

  if (match) {

    let year = match[3];

    if (year.length === 2) {
      year = `20${year}`;
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


  const parsed = new Date(str);

  if (!Number.isNaN(parsed.getTime())) {

    return parsed.toISOString().slice(0, 10);
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

  a.href = url;
  a.download = fileName;

  document.body.appendChild(a);

  a.click();

  a.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
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
        type: 'application/json;charset=utf-8'
      }
    );

  downloadBlob(blob, fileName);
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

    document.body.appendChild(container);
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

  container.appendChild(item);


  setTimeout(
    () => item.remove(),
    4000
  );
}


/* =========================================================
   STYLES
   ========================================================= */

function ensureAppStyles() {

  if ($('#skladaplanRuntimeStyles')) {
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

    }

  `;

  document.head.appendChild(style);
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

  document.body.appendChild(login);


  $('#loginForm')
    .addEventListener(
      'submit',
      loginUser
    );
}


async function loginUser(event) {

  event.preventDefault();

  const email =
    $('#loginEmail').value.trim();

  const password =
    $('#loginPassword').value;


  const button =
    event.target.querySelector('button');

  button.disabled = true;

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


  button.disabled = false;

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

  state.session = null;
  state.user = null;
  state.boxes = [];
  state.selectedIds.clear();

  $('#content').innerHTML = '';

  showLogin();

  toast('Вы вышли из системы');
}


/* =========================================================
   SUPABASE LOAD
   ========================================================= */

async function loadBoxesFromSupabase() {

  state.loading = true;

  try {

    const all = [];

    const pageSize = 1000;

    let from = 0;

    while (true) {

      const to =
        from + pageSize - 1;

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
          .range(from, to);


      if (error) {
        throw error;
      }


      if (!data || data.length === 0) {
        break;
      }


      all.push(...data);

      if (data.length < pageSize) {
        break;
      }

      from += pageSize;
    }


    state.boxes = all;

    /*
      Удаляем выбранные id,
      которых больше нет.
    */

    const existingIds =
      new Set(
        all.map(row => String(row.id))
      );

    state.selectedIds =
      new Set(
        [...state.selectedIds]
          .filter(id => existingIds.has(String(id)))
      );


  } finally {

    state.loading = false;
  }
}


/*
  После INSERT не делаем полный reload.
*/

function addLocalBox(row) {

  state.boxes.push(row);

  state.boxes.sort(
    (a, b) =>
      Number(a.id) - Number(b.id)
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
      row => String(row.id) === String(id)
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
        String(row.id) !== String(id)
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

    barcode:
      normalizeBarcode(
        formData.barcode
      ),

    article:
      normalizeText(
        formData.article
      ) || null,

    quantity_in_box:
      normalizeText(
        formData.quantity_in_box
      ) || null,

    zone_row:
      normalizeText(
        formData.zone_row
      ) || null,

    pallet:
      normalizeText(
        formData.pallet
      ) || null,

    status:
      normalizeText(
        formData.status
      ) || STATUSES.STOCK,

    date:
      toISODate(
        formData.date
      ),

    warehouse:
      normalizeText(
        formData.warehouse
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


  return state.boxes.filter(row => {

    if (
      state.baseWarehouse &&
      row.warehouse !== state.baseWarehouse
    ) {
      return false;
    }


    if (
      state.baseStatus &&
      row.status !== state.baseStatus
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
      row.warehouse,
      formatDate(row.date)

    ]
      .join(' ')
      .toLowerCase()
      .includes(search);

  });
}


function baseView() {

  const filtered =
    getFilteredBoxes();


  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filtered.length / PAGE_SIZE
      )
    );


  if (state.basePage > totalPages) {
    state.basePage = totalPages;
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
    [...new Set(
      state.boxes
        .map(row => row.warehouse)
        .filter(Boolean)
    )]
      .sort();


  const statuses =
    [...new Set(
      state.boxes
        .map(row => row.status)
        .filter(Boolean)
    )]
      .sort();


  return `

    <div class="sp-toolbar">

      <input
        id="baseSearch"
        type="search"
        placeholder="Поиск по штрихкоду, артикулу, зоне..."
        value="${escapeHtml(state.baseSearch)}"
      >

      <select id="baseWarehouse">

        <option value="">
          Все склады
        </option>

        ${warehouses.map(
          warehouse => `
            <option
              value="${escapeHtml(warehouse)}"
              ${warehouse === state.baseWarehouse ? 'selected' : ''}
            >
              ${escapeHtml(warehouse)}
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
              ${status === state.baseStatus ? 'selected' : ''}
            >
              ${escapeHtml(status)}
            </option>
          `
        ).join('')}

      </select>


      <button
        class="sp-btn"
        id="addBoxBtn"
      >
        + Добавить коробку
      </button>


      <button
        class="sp-btn success"
        id="markPickBtn"
        ${state.selectedIds.size ? '' : 'disabled'}
      >
        В подбор (${state.selectedIds.size})
      </button>


      <button
        class="sp-btn danger"
        id="deleteSelectedBtn"
        ${state.selectedIds.size ? '' : 'disabled'}
      >
        Удалить выбранные
      </button>

    </div>


    <div class="sp-muted" style="margin-bottom:10px">
      Найдено: <b>${filtered.length}</b>
      · Всего коробок: <b>${state.boxes.length}</b>
      · Страница ${state.basePage} из ${totalPages}
    </div>


    <div class="sp-table-wrap">

      <table class="sp-table">

        <thead>

          <tr>

            <th style="width:35px">
              ✓
            </th>

            <th>Штрихкод</th>

            <th>Артикул</th>

            <th>Кол-во в коробке</th>

            <th>Зона/ряд</th>

            <th>Поддон</th>

            <th>Статус</th>

            <th>ДатаРазмещения</th>

            <th>Склад</th>

            <th>Действия</th>

          </tr>

        </thead>

        <tbody>

          ${
            rows.length
              ? rows.map(baseRow).join('')
              : `
                <tr>
                  <td colspan="10">
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
          ${state.basePage <= 1 ? 'disabled' : ''}
        >
          ←
        </button>

        <button
          class="sp-btn secondary"
          id="baseNext"
          ${state.basePage >= totalPages ? 'disabled' : ''}
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
    state.selectedIds.has(id);


  return `

    <tr
      data-row-id="${escapeHtml(id)}"
      class="${selected ? 'selected' : ''}"
    >

      <td>

        <input
          type="checkbox"
          class="base-check"
          data-id="${escapeHtml(id)}"
          ${selected ? 'checked' : ''}
        >

      </td>

      <td>
        <b>${escapeHtml(row.barcode)}</b>
      </td>

      <td>
        ${escapeHtml(row.article)}
      </td>

      <td>
        ${escapeHtml(row.quantity_in_box)}
      </td>

      <td>
        ${escapeHtml(row.zone_row)}
      </td>

      <td>
        ${escapeHtml(row.pallet)}
      </td>

      <td>
        <span class="sp-status">
          ${escapeHtml(row.status)}
        </span>
      </td>

      <td>
        ${escapeHtml(formatDate(row.date))}
      </td>

      <td>
        ${escapeHtml(row.warehouse)}
      </td>

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


function setupBase() {

  $('#baseSearch')
    ?.addEventListener(
      'input',
      event => {

        state.baseSearch =
          event.target.value;

        state.basePage = 1;

        render();
      }
    );


  $('#baseWarehouse')
    ?.addEventListener(
      'change',
      event => {

        state.baseWarehouse =
          event.target.value;

        state.basePage = 1;

        render();
      }
    );


  $('#baseStatus')
    ?.addEventListener(
      'change',
      event => {

        state.baseStatus =
          event.target.value;

        state.basePage = 1;

        render();
      }
    );


  $('#basePrev')
    ?.addEventListener(
      'click',
      () => {

        if (state.basePage > 1) {

          state.basePage--;

          render();
        }
      }
    );


  $('#baseNext')
    ?.addEventListener(
      'click',
      () => {

        state.basePage++;

        render();
      }
    );


  $('#addBoxBtn')
    ?.addEventListener(
      'click',
      () => openBoxModal()
    );


  $('#markPickBtn')
    ?.addEventListener(
      'click',
      markSelectedForPicking
    );


  $('#deleteSelectedBtn')
    ?.addEventListener(
      'click',
      deleteSelectedBoxes
    );


  $all('.base-check')
    .forEach(check => {

      check.addEventListener(
        'change',
        event => {

          const id =
            String(
              event.target.dataset.id
            );


          if (event.target.checked) {
            state.selectedIds.add(id);
          } else {
            state.selectedIds.delete(id);
          }


          render();
        }
      );

    });


  $all('.edit-box')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          openBoxModal(
            button.dataset.id
          );
        }
      );

    });
}


/* =========================================================
   BOX MODAL
   ========================================================= */

function closeBoxModal() {

  $('#boxModal')?.remove();

  state.editingId = null;
}


function openBoxModal(id = null) {

  closeBoxModal();

  state.editingId =
    id !== null
      ? String(id)
      : null;


  const row =
    id !== null
      ? state.boxes.find(
          item =>
            String(item.id) === String(id)
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
            value="${escapeHtml(row?.barcode ?? '')}"
          >
        </label>


        <label>
          Артикул
          <input
            id="boxArticle"
            value="${escapeHtml(row?.article ?? '')}"
          >
        </label>


        <label>
          Кол-во в коробке
          <input
            id="boxQuantity"
            value="${escapeHtml(row?.quantity_in_box ?? '')}"
          >
        </label>


        <label>
          Зона/ряд
          <input
            id="boxZone"
            value="${escapeHtml(row?.zone_row ?? '')}"
          >
        </label>


        <label>
          Поддон
          <input
            id="boxPallet"
            value="${escapeHtml(row?.pallet ?? '')}"
          >
        </label>


        <label>
          Статус

          <select id="boxStatus">

            ${Object.values(STATUSES)
              .map(
                status => `
                  <option
                    value="${escapeHtml(status)}"
                    ${
                      (row?.status ?? STATUSES.STOCK) === status
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
              toISODate(row?.date) ?? ''
            )}"
          >
        </label>


        <label>
          Склад
          <input
            id="boxWarehouse"
            value="${escapeHtml(row?.warehouse ?? '')}"
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


  document.body.appendChild(modal);


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

  button.disabled = true;

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
      boxToPayload(formData);


    if (!payload.barcode) {

      throw new Error(
        'Штрихкод обязателен'
      );
    }


    /*
      INSERT
    */

    if (!state.editingId) {

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


      /*
        ВАЖНО:

        не reloadAndRender(),
        а просто добавляем новую строку
        локально.
      */

      addLocalBox(data);

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

    button.disabled = false;

    button.textContent =
      'Сохранить';
  }
}


/* =========================================================
   DELETE
   ========================================================= */

async function deleteBox(id) {

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
      .eq('id', id);


  if (error) {

    toast(
      error.message,
      'error'
    );

    return;
  }


  removeLocalBox(id);

  render();

  toast(
    'Коробка удалена'
  );
}


async function deleteSelectedBoxes() {

  const ids =
    [...state.selectedIds];


  if (!ids.length) {
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
    id => removeLocalBox(id)
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

async function markSelectedForPicking() {

  const ids =
    [...state.selectedIds];


  if (!ids.length) {
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
          status: STATUSES.PICK,
          pick: true
        })
        .eq('id', id)
        .select(BOX_SELECT)
        .single();


    if (error) {

      console.error(error);

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


/* =========================================================
   ASSEMBLY
   ========================================================= */

function getPickingBoxes() {

  return state.boxes.filter(
    row =>
      row.pick === true ||
      row.status === STATUSES.PICK ||
      row.status === STATUSES.RESERVED
  );
}


function assemblyView() {

  const picking =
    getPickingBoxes();


  const collected =
    state.boxes.filter(
      row =>
        row.status === STATUSES.COLLECTED
    ).length;


  return `

    <div class="sp-scanner">

      <div class="sp-grid">

        <div class="sp-card">

          <div class="sp-card-label">
            К подбору
          </div>

          <div class="sp-big-number">
            ${picking.length}
          </div>

        </div>


        <div class="sp-card">

          <div class="sp-card-label">
            Уже собрано
          </div>

          <div class="sp-big-number">
            ${collected}
          </div>

        </div>

      </div>


      <div class="sp-pallet">

        <b>
          Текущий поддон
        </b>

        <div class="sp-toolbar" style="margin-top:10px">

          <input
            id="currentPallet"
            placeholder="Например: А"
            value="${escapeHtml(state.currentPallet)}"
          >

          <button
            class="sp-btn secondary"
            id="clearPallet"
          >
            Сбросить
          </button>

        </div>

        <div class="sp-muted">
          Если поддон указан, сканирование разрешено
          только для коробок этого поддона.
        </div>

      </div>


      <div>

        <input
          id="scannerInput"
          class="sp-scanner-input"
          inputmode="none"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          placeholder="Сканируйте штрихкод..."
        >

      </div>


      <div
        id="scannerResult"
        class="sp-card"
      >
        Готов к сканированию.
      </div>


      <div class="sp-table-wrap">

        <table class="sp-table">

          <thead>

            <tr>

              <th>Штрихкод</th>
              <th>Артикул</th>
              <th>Зона/ряд</th>
              <th>Поддон</th>
              <th>Склад</th>
              <th>Статус</th>

            </tr>

          </thead>

          <tbody>

            ${
              picking.length
                ? picking
                    .slice(0, 300)
                    .map(pickingRow)
                    .join('')
                : `
                  <tr>
                    <td colspan="6">
                      <div class="sp-empty">
                        В подборе пока ничего нет
                      </div>
                    </td>
                  </tr>
                `
            }

          </tbody>

        </table>

      </div>

    </div>

  `;
}


function pickingRow(row) {

  return `

    <tr>

      <td>
        <b>
          ${escapeHtml(row.barcode)}
        </b>
      </td>

      <td>
        ${escapeHtml(row.article)}
      </td>

      <td>
        ${escapeHtml(row.zone_row)}
      </td>

      <td>
        ${escapeHtml(row.pallet)}
      </td>

      <td>
        ${escapeHtml(row.warehouse)}
      </td>

      <td>
        <span class="sp-status">
          ${escapeHtml(row.status)}
        </span>
      </td>

    </tr>

  `;
}


function setupAssembly() {

  const pallet =
    $('#currentPallet');

  pallet?.addEventListener(
    'input',
    event => {

      state.currentPallet =
        event.target.value.trim();
    }
  );


  $('#clearPallet')
    ?.addEventListener(
      'click',
      () => {

        state.currentPallet = '';

        render();

        focusScanner();
      }
    );


  const scanner =
    $('#scannerInput');


  scanner?.addEventListener(
    'keydown',
    async event => {

      /*
        Большинство Bluetooth-сканеров
        заканчивают скан Enter.
      */

      if (
        event.key === 'Enter'
      ) {

        event.preventDefault();

        const barcode =
          scanner.value;

        scanner.value = '';

        await processScan(
          barcode
        );
      }

    }
  );


  scanner?.addEventListener(
    'blur',
    () => {

      /*
        Не возвращаем фокус сразу,
        чтобы пользователь мог нажать
        кнопки интерфейса.
      */

    }
  );


  setTimeout(
    focusScanner,
    100
  );
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


async function processScan(
  barcode
) {

  barcode =
    normalizeBarcode(barcode);


  if (!barcode) {
    return;
  }


  const candidates =
    state.boxes.filter(
      row =>
        normalizeBarcode(row.barcode) === barcode &&
        (
          row.pick === true ||
          row.status === STATUSES.PICK ||
          row.status === STATUSES.RESERVED
        )
    );


  if (!candidates.length) {

    showScannerResult(
      `Штрихкод ${barcode} не найден среди коробок к подбору.`,
      'error'
    );

    beep(false);

    focusScanner();

    return;
  }


  let box = null;


  if (state.currentPallet) {

    box =
      candidates.find(
        row =>
          normalizeText(row.pallet).toLowerCase() ===
          normalizeText(state.currentPallet).toLowerCase()
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

    box = candidates[0];
  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from('boxes')
      .update({

        status:
          STATUSES.COLLECTED,

        pick:
          false,

        worker:
          state.user?.email || null

      })
      .eq(
        'id',
        box.id
      )
      .select(BOX_SELECT)
      .single();


  if (error) {

    console.error(error);

    showScannerResult(
      error.message,
      'error'
    );

    beep(false);

    focusScanner();

    return;
  }


  updateLocalBox(
    box.id,
    data
  );


  showScannerResult(
    `✓ Коробка ${barcode} скомплектована`,
    'success'
  );


  beep(true);

  render();


  /*
    После render() снова получаем scannerInput.
  */

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

function beep(success = true) {

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
      success ? 1000 : 250;


    oscillator.type =
      'sine';


    gain.gain.setValueAtTime(
      0.0001,
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.12,
      context.currentTime + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + (
        success ? 0.12 : 0.25
      )
    );


    oscillator.start();

    oscillator.stop(
      context.currentTime +
      (success ? 0.13 : 0.26)
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
        row.status === STATUSES.COLLECTED
    );


  return `

    <div class="sp-toolbar">

      <div>
        Собрано:
        <b>${rows.length}</b>
      </div>


      <button
        class="sp-btn success"
        id="shipCollectedBtn"
        ${rows.length ? '' : 'disabled'}
      >
        Отгрузить выбранные
      </button>

    </div>


    <div class="sp-table-wrap">

      <table class="sp-table">

        <thead>

          <tr>

            <th>✓</th>
            <th>Штрихкод</th>
            <th>Артикул</th>
            <th>Зона/ряд</th>
            <th>Поддон</th>
            <th>Склад</th>
            <th>Работник</th>
            <th>Дата</th>

          </tr>

        </thead>

        <tbody>

          ${
            rows.length
              ? rows
                  .map(collectedRow)
                  .join('')
              : `
                <tr>
                  <td colspan="8">
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
        <b>${escapeHtml(row.barcode)}</b>
      </td>

      <td>
        ${escapeHtml(row.article)}
      </td>

      <td>
        ${escapeHtml(row.zone_row)}
      </td>

      <td>
        ${escapeHtml(row.pallet)}
      </td>

      <td>
        ${escapeHtml(row.warehouse)}
      </td>

      <td>
        ${escapeHtml(row.worker)}
      </td>

      <td>
        ${escapeHtml(formatDate(row.date))}
      </td>

    </tr>

  `;
}


function setupCollected() {

  $('#shipCollectedBtn')
    ?.addEventListener(
      'click',
      shipSelectedCollected
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


  let shipped = 0;


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
          status: STATUSES.SHIPPED
        })
        .eq('id', id)
        .eq(
          'status',
          STATUSES.COLLECTED
        )
        .select(BOX_SELECT)
        .single();


    if (error) {

      console.error(error);

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

  const rows =
    state.boxes
      .filter(
        row =>
          row.status === STATUSES.STOCK
      )
      .slice(-300)
      .reverse();


  return `

    <div class="sp-card">

      <div class="sp-card-label">
        На складе
      </div>

      <div class="sp-big-number">
        ${
          state.boxes.filter(
            row =>
              row.status === STATUSES.STOCK
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
                  <b>${escapeHtml(row.barcode)}</b>
                </td>

                <td>
                  ${escapeHtml(row.article)}
                </td>

                <td>
                  ${escapeHtml(row.zone_row)}
                </td>

                <td>
                  ${escapeHtml(row.pallet)}
                </td>

                <td>
                  ${escapeHtml(row.warehouse)}
                </td>

                <td>
                  ${escapeHtml(formatDate(row.date))}
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
   SHIPPED
   ========================================================= */

function shippedView() {

  const rows =
    state.boxes
      .filter(
        row =>
          row.status === STATUSES.SHIPPED
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
              row.status === STATUSES.SHIPPED
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
                  <b>${escapeHtml(row.barcode)}</b>
                </td>

                <td>
                  ${escapeHtml(row.article)}
                </td>

                <td>
                  ${escapeHtml(row.zone_row)}
                </td>

                <td>
                  ${escapeHtml(row.pallet)}
                </td>

                <td>
                  ${escapeHtml(row.warehouse)}
                </td>

                <td>
                  ${escapeHtml(formatDate(row.date))}
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
    getPickingBoxes().length;


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
        .map(row => row.warehouse)
        .filter(Boolean)
    ).size;


  const articles =
    new Set(
      state.boxes
        .map(row => row.article)
        .filter(Boolean)
    ).size;


  const pallets =
    new Set(
      state.boxes
        .map(row => row.pallet)
        .filter(Boolean)
    ).size;


  return `

    <div class="sp-grid">

      <div class="sp-card">

        <div class="sp-card-label">
          Всего коробок
        </div>

        <div class="sp-card-value">
          ${total}
        </div>

      </div>


      <div class="sp-card">

        <div class="sp-card-label">
          На складе
        </div>

        <div class="sp-card-value">
          ${stock}
        </div>

      </div>


      <div class="sp-card">

        <div class="sp-card-label">
          К подбору
        </div>

        <div class="sp-card-value">
          ${picking}
        </div>

      </div>


      <div class="sp-card">

        <div class="sp-card-label">
          Скомплектовано
        </div>

        <div class="sp-card-value">
          ${collected}
        </div>

      </div>


      <div class="sp-card">

        <div class="sp-card-label">
          Отгружено
        </div>

        <div class="sp-card-value">
          ${shipped}
        </div>

      </div>


      <div class="sp-card">

        <div class="sp-card-label">
          Зарезервировано
        </div>

        <div class="sp-card-value">
          ${reserved}
        </div>

      </div>


      <div class="sp-card">

        <div class="sp-card-label">
          Склады
        </div>

        <div class="sp-card-value">
          ${warehouses}
        </div>

      </div>


      <div class="sp-card">

        <div class="sp-card-label">
          Артикулы
        </div>

        <div class="sp-card-value">
          ${articles}
        </div>

      </div>


      <div class="sp-card">

        <div class="sp-card-label">
          Поддоны
        </div>

        <div class="sp-card-value">
          ${pallets}
        </div>

      </div>

    </div>


    <div class="sp-card">

      <h3>
        Последние операции
      </h3>

      <div class="sp-table-wrap">

        <table class="sp-table">

          <thead>

            <tr>

              <th>Штрихкод</th>
              <th>Артикул</th>
              <th>Зона</th>
              <th>Поддон</th>
              <th>Статус</th>

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
                        ${escapeHtml(row.barcode)}
                      </td>

                      <td>
                        ${escapeHtml(row.article)}
                      </td>

                      <td>
                        ${escapeHtml(row.zone_row)}
                      </td>

                      <td>
                        ${escapeHtml(row.pallet)}
                      </td>

                      <td>
                        <span class="sp-status">
                          ${escapeHtml(row.status)}
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


function countStatus(status) {

  return state.boxes.filter(
    row =>
      row.status === status
  ).length;
}


/* =========================================================
   TOOLS
   ========================================================= */

function toolsView() {

  return `

    <div class="sp-grid">

      <div class="sp-card">

        <h3>
          Импорт Excel
        </h3>

        <p class="sp-muted">
          Добавить коробки из XLS/XLSX.
          Каждая строка Excel считается отдельной
          физической коробкой.
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
          ${escapeHtml(state.user?.email || '')}
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

    app: 'SKLADAPLAN',

    created_at:
      new Date().toISOString(),

    user:
      state.user?.email || null,

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
    'колвокоробке',
    'quantityinbox',
    'количество'

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
    'датаразмещения',
    'дата',
    'date'

  ],

  warehouse: [

    'склад',
    'warehouse'

  ],

  column_9: [

    'столбец9',
    'column9'

  ],

  direction: [

    'направление',
    'direction'

  ],

  pick: [

    'отбор',
    'отбор',
    'pick'

  ],

  worker: [

    'ктоработал',
    'ктоработал',
    'worker'

  ]

};


function findExcelColumn(
  headers,
  aliases
) {

  for (
    const header of headers
  ) {

    const normalized =
      normalizeHeader(header);


    for (
      const alias of aliases
    ) {

      if (
        normalized ===
        normalizeHeader(alias)
      ) {

        return header;
      }

    }

  }


  return null;
}


function convertExcelRow(
  row,
  headers
) {

  function valueFor(field) {

    const column =
      findExcelColumn(
        headers,
        EXCEL_MAP[field] || []
      );

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


  const status =
    normalizeText(
      valueFor('status')
    ) || STATUSES.STOCK;


  return {

    barcode,

    article:
      normalizeText(
        valueFor('article')
      ) || null,

    quantity_in_box:
      normalizeText(
        valueFor('quantity_in_box')
      ) || null,

    zone_row:
      normalizeText(
        valueFor('zone_row')
      ) || null,

    pallet:
      normalizeText(
        valueFor('pallet')
      ) || null,

    status,

    date:
      toISODate(
        valueFor('date')
      ),

    warehouse:
      normalizeText(
        valueFor('warehouse')
      ) || null,

    column_9:
      normalizeText(
        valueFor('column_9')
      ) || null,

    direction:
      normalizeText(
        valueFor('direction')
      ) || null,

    pick:
      excelBoolean(
        valueFor('pick')
      ),

    worker:
      normalizeText(
        valueFor('worker')
      ) || null

  };
}


function openExcelImport() {

  const input =
    document.createElement('input');

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


async function handleExcelFile(
  event
) {

  const file =
    event.target.files?.[0];


  if (!file) {
    return;
  }


  if (
    typeof XLSX === 'undefined'
  ) {

    toast(
      'Библиотека XLSX не загрузилась',
      'error'
    );

    return;
  }


  try {

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


    const sheet =
      workbook.Sheets[
        sheetName
      ];


    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
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


    const headers =
      Object.keys(
        rows[0]
      );


    const converted = [];

    let errors = 0;


    for (
      const row of rows
    ) {

      try {

        const convertedRow =
          convertExcelRow(
            row,
            headers
          );


        if (!convertedRow) {

          errors++;

          continue;
        }


        converted.push(
          convertedRow
        );

      } catch (error) {

        console.error(
          error
        );

        errors++;
      }

    }


    state.excelRows =
      converted;

    state.excelFileName =
      file.name;

    state.excelSheetName =
      sheetName;


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

  $('#excelImportModal')?.remove();


  const previewRows =
    state.excelRows
      .slice(0, 20);


  const modal =
    document.createElement('div');

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
          ${escapeHtml(state.excelFileName)}
        </b>

        <br>

        Лист:
        <b>
          ${escapeHtml(state.excelSheetName)}
        </b>

        <br><br>

        Строк в Excel:
        <b>${sourceRows}</b>

        <br>

        Готово к импорту:
        <b>${state.excelRows.length}</b>

        <br>

        Ошибок:
        <b>${errors}</b>

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
                      ${escapeHtml(row.barcode)}
                    </td>

                    <td>
                      ${escapeHtml(row.article)}
                    </td>

                    <td>
                      ${escapeHtml(row.zone_row)}
                    </td>

                    <td>
                      ${escapeHtml(row.pallet)}
                    </td>

                    <td>
                      ${escapeHtml(row.status)}
                    </td>

                    <td>
                      ${escapeHtml(formatDate(row.date))}
                    </td>

                    <td>
                      ${escapeHtml(row.warehouse)}
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
          ${state.excelRows.length ? '' : 'disabled'}
        >
          Импортировать ${state.excelRows.length}
        </button>

      </div>

    </div>

  `;


  document.body.appendChild(modal);


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
   EXCEL IMPORT TO SUPABASE
   ========================================================= */

async function importExcelRows() {

  const rows =
    [...state.excelRows];


  if (!rows.length) {
    return;
  }


  const button =
    $('#startExcelImport');


  button.disabled = true;


  let imported = 0;

  let failed = 0;


  try {

    for (
      let i = 0;
      i < rows.length;
      i += EXCEL_CHUNK_SIZE
    ) {

      const chunk =
        rows.slice(
          i,
          i + EXCEL_CHUNK_SIZE
        );


      button.textContent =
        `Импорт ${Math.min(
          i + chunk.length,
          rows.length
        )} / ${rows.length}`;


      const {
        error
      } =
        await supabaseClient
          .from('boxes')
          .insert(chunk);


      if (error) {

        console.error(
          'Excel chunk error:',
          error
        );

        /*
          Если пачка не прошла целиком,
          пробуем построчно, чтобы
          один плохой ряд не убил весь импорт.
        */

        for (
          const row of chunk
        ) {

          const {
            error: rowError
          } =
            await supabaseClient
              .from('boxes')
              .insert(row);


          if (rowError) {
            failed++;
          } else {
            imported++;
          }

        }

      } else {

        imported +=
          chunk.length;
      }

    }


    $('#excelImportModal')
      ?.remove();


    state.excelRows = [];


    /*
      Здесь один reload оправдан:
      импорт может добавить десятки тысяч строк.
    */

    await loadBoxesFromSupabase();

    state.currentPage =
      'base';

    state.basePage =
      1;

    render();


    toast(
      `Импортировано: ${imported}. Ошибок: ${failed}.`
    );


  } catch (error) {

    console.error(
      'Import error:',
      error
    );

    button.disabled = false;

    button.textContent =
      'Повторить импорт';

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
    title: 'Главная',
    heading: 'Главный экран склада'
  },

  base: {
    title: 'База',
    heading: 'База коробок'
  },

  assembly: {
    title: 'Сборка',
    heading: 'Комплектация заказа'
  },

  received: {
    title: 'Принято',
    heading: 'Принятые коробки'
  },

  collected: {
    title: 'Собрано',
    heading: 'Скомплектованные коробки'
  },

  shipped: {
    title: 'Убыло',
    heading: 'Отгруженные коробки'
  },

  tools: {
    title: 'Инструменты',
    heading: 'Инструменты SKLADAPLAN'
  }

};


function goToPage(
  page
) {

  if (
    !PAGE_META[page]
  ) {
    page = 'dashboard';
  }


  state.currentPage =
    page;


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


  $('#pageTitle').textContent =
    meta.title;


  $('#heading').textContent =
    meta.heading;


  $all('.nav').forEach(
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

  $all(
    '[data-page]'
  ).forEach(
    button => {

      button.addEventListener(
        'click',
        () => {

          goToPage(
            button.dataset.page
          );

        }
      );

    }
  );


  $('#mobileMenu')
    ?.addEventListener(
      'click',
      () => {

        document
          .querySelector('.sidebar')
          ?.classList.toggle(
            'open'
          );

      }
    );


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

    content.innerHTML =
      `
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
    data.session?.user || null;


  if (!data.session) {

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
          event === 'SIGNED_OUT'
        ) {

          state.session = null;

          state.user = null;

          state.boxes = [];

          showLogin();

          return;
        }


        if (
          event === 'SIGNED_IN'
        ) {

          state.session =
            session;

          state.user =
            session?.user || null;

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
