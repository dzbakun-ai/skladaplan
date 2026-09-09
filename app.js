const SUPABASE_URL = 'https://ithhecprdosvjiddoalq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0dB5DQt2_ysOohx42IN4rA_mnypLeOR';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let DATA={};

async function loadDatabase(){
  try {
    const r = await fetch('database.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DATA = await r.json();
    return true;
  } catch (err) {
    console.warn('Не удалось автоматически загрузить database.json:', err);
    return false;
  }
}

const state = {
  page: 'dashboard',
  editingRow: null
};

const pages = {
  dashboard: ['Главная', 'Главный экран склада'],
  base: ['База', 'Все коробки и остатки'],
  assembly: ['Сборка', 'Заказы к комплектации'],
  received: ['Принято', 'Поступления на склад'],
  collected: ['Собрано', 'Скомплектованные коробки'],
  shipped: ['Убыло', 'История отгрузок'],
  tools: ['Инструменты', 'Сервисные операции']
};

const $ = s => document.querySelector(s);

const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m])
  );

function rows(sheet) {
  return DATA[sheet] || [];
}

function headerRows(sheet) {
  const r = rows(sheet);
  return r.length ? r[0].map(x => x ?? '') : [];
}

function objects(sheet) {
  const r = rows(sheet);

  if (!r.length) return [];

  const h = r[0];

  return r
    .slice(1)
    .filter(x =>
      x.some(v => v !== null && v !== '' && v !== undefined)
    )
    .map((x, rowIndex) => ({
      __rowIndex: rowIndex + 1,
      ...Object.fromEntries(
        h.map((k, i) => [
          k || `col_${i + 1}`,
          x[i] ?? ''
        ])
      )
    }));
}

function count(sheet) {
  return objects(sheet).length;
}

function findVal(sheet, key, val) {
  return objects(sheet).filter(o =>
    String(o[key] ?? '')
      .toLowerCase()
      .includes(String(val).toLowerCase())
  );
}

function fmt(v) {
  if (v === null || v === undefined) return '';

  if (
    typeof v === 'string' &&
    /^\d{4}-\d\d-\d\d/.test(v)
  ) {
    return v.slice(0, 10);
  }

  return typeof v === 'number'
    ? v.toLocaleString('ru-RU')
    : String(v);
}

function status(v) {
  let c = '';

  if (String(v).includes('Скомплект')) c = 'green';
  if (
    String(v).includes('Взять') ||
    String(v).includes('КПодбору')
  ) c = 'yellow';
  if (String(v).includes('Отгруж')) c = 'red';

  return `<span class="status ${c}">${esc(v)}</span>`;
}

/* =========================================================
   ОБЫЧНАЯ ТАБЛИЦА
========================================================= */

function table(sheet, limit = 500) {
  const data = rows(sheet);

  if (!data.length) {
    return '<div class="empty">Нет данных</div>';
  }

  const h = data[0];

  const body = data
    .slice(1)
    .filter(r =>
      r.some(v => v !== null && v !== '' && v !== undefined)
    )
    .slice(0, limit);

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            ${h.map(x => `<th>${esc(x ?? '')}</th>`).join('')}
          </tr>
        </thead>

        <tbody>
          ${body.map(r => `
            <tr>
              ${h.map((label, i) => `
                <td data-label="${esc(label ?? '')}">
                  ${
                    i === 5 && sheet !== 'Сборка'
                      ? status(r[i])
                      : esc(fmt(r[i]))
                  }
                </td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* =========================================================
   РЕДАКТИРУЕМАЯ БАЗА
========================================================= */

function baseView() {
  const data = rows('База');

  if (!data.length) {
    return `
      <div class="panel">
        <div class="empty">Лист «База» отсутствует</div>
      </div>
    `;
  }

  const h = data[0];

  const body = data
    .slice(1)
    .map((r, index) => ({ r, index }))
    .filter(({ r }) =>
      r.some(v => v !== null && v !== '' && v !== undefined)
    );

  return `
    <div class="panel">

      <div class="toolbar" style="gap:8px;flex-wrap:wrap">

        <input
          id="search"
          class="search"
          placeholder="Поиск штрихкода, артикула, зоны, поддона…"
        >

        <span class="muted" style="padding:10px 0">
          ${count('База').toLocaleString('ru-RU')} коробок
        </span>

        <button class="primary" id="addBoxBtn">
          ＋ Добавить коробку
        </button>

      </div>

      <div
        id="baseTable"
        style="margin-top:12px"
      >
        ${baseTable(body, h)}
      </div>

    </div>

    ${boxModal()}
  `;
}

function baseTable(body, h) {
  return `
    <div class="table-wrap">
      <table class="data-table">

        <thead>
          <tr>
            ${h.map(x => `<th>${esc(x ?? '')}</th>`).join('')}
            <th>Действия</th>
          </tr>
        </thead>

        <tbody>

          ${body.map(({ r, index }) => `
            <tr>

              ${h.map((label, i) => `
                <td data-label="${esc(label ?? '')}">
                  ${
                    i === 5
                      ? status(r[i])
                      : esc(fmt(r[i]))
                  }
                </td>
              `).join('')}

              <td data-label="Действия">
                <div style="display:flex;gap:6px;flex-wrap:wrap">

                  <button
                    class="ghost edit-box"
                    data-row="${index}"
                    style="padding:7px 10px"
                  >
                    ✏️
                  </button>

                  <button
                    class="ghost delete-box"
                    data-row="${index}"
                    style="padding:7px 10px"
                  >
                    🗑️
                  </button>

                </div>
              </td>

            </tr>
          `).join('')}

        </tbody>

      </table>
    </div>
  `;
}

function boxModal() {
  const h = headerRows('База');

  const row =
    state.editingRow !== null
      ? rows('База')[state.editingRow + 1] || []
      : [];

  const fields = h.map((label, i) => {
    const value = row[i] ?? '';

    return `
      <label style="display:block;margin-bottom:12px">

        <span
          style="
            display:block;
            font-size:11px;
            font-weight:700;
            margin-bottom:5px
          "
        >
          ${esc(label)}
        </span>

        <input
          class="box-field"
          data-index="${i}"
          value="${esc(value)}"
          autocomplete="off"
        >

      </label>
    `;
  }).join('');

  return `
    <div
      id="boxModal"
      class="scan-modal"
    >

      <div
        class="scan-box"
        style="max-width:620px;max-height:90vh;overflow:auto"
      >

        <div class="scan-head">

          <h2>
            ${
              state.editingRow === null
                ? 'Добавить коробку'
                : 'Редактировать коробку'
            }
          </h2>

          <button
            class="scan-close"
            id="boxModalClose"
          >
            ×
          </button>

        </div>

        <div style="margin-top:15px">
          ${fields}
        </div>

        <div
          style="
            display:flex;
            gap:8px;
            justify-content:flex-end;
            margin-top:16px;
            flex-wrap:wrap
          "
        >

          <button
            class="ghost"
            id="boxCancel"
          >
            Отмена
          </button>

          <button
            class="primary"
            id="boxSave"
          >
            💾 Сохранить
          </button>

        </div>

      </div>

    </div>
  `;
}

function setupBase() {
  const addBtn = $('#addBoxBtn');

  if (addBtn) {
    addBtn.onclick = () => {
      state.editingRow = null;

      const old = $('#boxModal');
      if (old) old.remove();

      document.body.insertAdjacentHTML(
        'beforeend',
        boxModal()
      );

      openBoxModal();
    };
  }

  document.querySelectorAll('.edit-box').forEach(btn => {
    btn.onclick = () => {
      state.editingRow = Number(btn.dataset.row);

      const old = $('#boxModal');
      if (old) old.remove();

      document.body.insertAdjacentHTML(
        'beforeend',
        boxModal()
      );

      openBoxModal();
    };
  });

  document.querySelectorAll('.delete-box').forEach(btn => {
    btn.onclick = () => {
      const index = Number(btn.dataset.row);

      const row = rows('База')[index + 1];

      if (!row) return;

      const barcode = row[0] || '';

      if (
        !confirm(
          `Удалить коробку ${barcode}?\n\nЭто действие изменит данные только в текущем браузере.`
        )
      ) {
        return;
      }

      rows('База').splice(index + 1, 1);

      render();
    };
  });
}

function openBoxModal() {
  const modal = $('#boxModal');

  if (!modal) return;

  modal.classList.add('show');

  const close = () => {
    modal.classList.remove('show');
    state.editingRow = null;

    setTimeout(() => {
      if ($('#boxModal')) {
        $('#boxModal').remove();
      }
    }, 150);
  };

  $('#boxModalClose').onclick = close;
  $('#boxCancel').onclick = close;

  modal.onclick = e => {
    if (e.target === modal) {
      close();
    }
  };

  $('#boxSave').onclick = () => {
    saveBox();
  };
}

function saveBox() {
  const fields =
    document.querySelectorAll('.box-field');

  const headers = headerRows('База');

  const newRow = headers.map((_, i) => {
    const input =
      document.querySelector(
        `.box-field[data-index="${i}"]`
      );

    return input ? input.value.trim() : '';
  });

  const barcode = normBarcode(newRow[0]);

  if (!barcode) {
    alert('Введите штрихкод.');
    return;
  }

  /*
   * Нормализуем штрихкод.
   */
  newRow[0] = barcode;

  /*
   * 1 строка = 1 физическая коробка.
   * Дубликаты штрихкодов НЕ удаляем.
   */

  if (state.editingRow === null) {
    DATA['База'].push(newRow);
  } else {
    DATA['База'][state.editingRow + 1] = newRow;
  }

  state.editingRow = null;

  const modal = $('#boxModal');

  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 150);
  }

  render();
}

/* =========================================================
   DASHBOARD
========================================================= */

function render() {
  const [pt, h] = pages[state.page];

  $('#pageTitle').textContent = pt;
  $('#heading').textContent = h;

  document
    .querySelectorAll('.nav,.mobile-nav-btn')
    .forEach(b =>
      b.classList.toggle(
        'active',
        b.dataset.page === state.page
      )
    );

  $('#content').innerHTML =
    views[state.page]();

  if (
    state.page === 'base' ||
    state.page === 'received' ||
    state.page === 'collected' ||
    state.page === 'shipped'
  ) {
    bindSearch();
  }

  if (state.page === 'base') {
    setupBase();
  }

  if (state.page === 'assembly') {
    setupScanner();
  }

  const badge = count('Сборка');

  if ($('#assemblyBadge')) {
    $('#assemblyBadge').textContent =
      badge || '';
  }

  if ($('#mobileAssemblyBadge')) {
    $('#mobileAssemblyBadge').textContent =
      badge || '';
  }
}

function dashboard() {
  const base = objects('База');

  const statuses = {};

  base.forEach(o => {
    const s = o['Статус'] || '';
    statuses[s] = (statuses[s] || 0) + 1;
  });

  const dirs = objects('Убыло').reduce(
    (a, o) => {
      const d =
        o['Направление'] ||
        'Без направления';

      a[d] = (a[d] || 0) + 1;

      return a;
    },
    {}
  );

  const top = Object.entries(dirs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return `
    <div class="notice">
      Локальная версия SKLADAPLAN работает
      без сервера. Изменения, сделанные здесь,
      сохраняются только в браузере устройства.
    </div>

    <div class="cards">

      <div class="card">
        <div class="label">
          Всего записей в Базе
        </div>

        <div class="value">
          ${base.length.toLocaleString('ru-RU')}
        </div>

        <div class="sub">
          коробок / строк
        </div>
      </div>

      <div class="card">
        <div class="label">
          На складе
        </div>

        <div class="value">
          ${(statuses['На складе'] || 0)
            .toLocaleString('ru-RU')}
        </div>

        <div class="sub">
          текущий остаток
        </div>
      </div>

      <div class="card">
        <div class="label">
          Скомплектовано
        </div>

        <div class="value">
          ${(statuses['Скомплектовано'] || 0)
            .toLocaleString('ru-RU')}
        </div>

        <div class="sub">
          готово к отгрузке
        </div>
      </div>

      <div class="card">
        <div class="label">
          Отгружено
        </div>

        <div class="value">
          ${(statuses['Отгружено'] || 0)
            .toLocaleString('ru-RU')}
        </div>

        <div class="sub">
          по данным Базы
        </div>
      </div>

    </div>

    <div class="grid2">

      <div class="panel">

        <div class="section-title">
          <h3>Последние операции</h3>
          <span class="muted">
            лист «Убыло»
          </span>
        </div>

        ${table('Убыло', 10)}

      </div>

      <div class="panel">

        <div class="section-title">
          <h3>По направлениям</h3>
          <span class="muted">
            отгрузки
          </span>
        </div>

        ${
          top.map(([k, v]) => `
            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:9px 0;
                border-bottom:1px solid #eee;
                font-size:11px
              "
            >
              <span>${esc(k)}</span>
              <b>${v}</b>
            </div>
          `).join('')
        }

      </div>

    </div>

    <div
      class="panel"
      style="margin-top:14px"
    >

      <h3>Быстрые действия</h3>

      <div class="quick">

        <button data-go="base">
          <b>▦ Открыть базу</b>
          <span>
            Поиск, добавление и редактирование коробок
          </span>
        </button>

        <button data-go="assembly">
          <b>✓ Сборка</b>
          <span>
            Перейти к комплектации
          </span>
        </button>

        <button id="calcBoxes">
          <b>＋ Рассчитать коробки</b>
          <span>
            Для будущего модуля заказов
          </span>
        </button>

      </div>

    </div>
  `;
}

/* =========================================================
   ОСТАЛЬНЫЕ ЛИСТЫ
========================================================= */

function sheetView(sheet) {
  return `
    <div class="panel">

      <div class="toolbar">

        <input
          id="search"
          class="search"
          placeholder="Поиск по всем колонкам…"
        >

        <span
          class="muted"
          style="padding:10px 0"
        >
          ${count(sheet).toLocaleString('ru-RU')} строк
        </span>

      </div>

      <div id="sheetTable">
        ${table(sheet)}
      </div>

    </div>
  `;
}

/* =========================================================
   СБОРКА
========================================================= */

function assembly() {
  const d = objects('Сборка')
    .filter(o => o['Штрихкод'] != null);

  d.sort(
    (a, b) =>
      String(a['Зона/Ряд'] || '')
        .localeCompare(
          String(b['Зона/Ряд'] || ''),
          'ru',
          { numeric: true }
        ) ||
      String(a['Поддон'] || '')
        .localeCompare(
          String(b['Поддон'] || ''),
          'ru',
          { numeric: true }
        )
  );

  const total = d.reduce(
    (n, o) =>
      n + (Number(o['Кол-во коробок']) || 0),
    0
  );

  return `
    <div class="panel">

      <div class="section-title">

        <div>

          <h3>
            Список сборки
          </h3>

          <div class="route-note">
            Маршрут отсортирован
            по зоне/ряду → поддону.
            Всего к подбору:
            <b>${total}</b> коробок.
          </div>

        </div>

        <span class="muted">
          ${d.length} позиции
        </span>

      </div>

      <div class="assembly-tools">

        <input
          id="assemblySearch"
          placeholder="Штрихкод, зона, поддон…"
        >

        <input
          id="currentPallet"
          placeholder="Текущий поддон (необязательно)"
        >

        <button
          class="primary"
          id="scanBtn"
        >
          ▣ Сканировать
        </button>

      </div>

      <div
        class="muted"
        style="font-size:11px;margin-bottom:10px"
      >
        Если указан текущий поддон,
        сканер будет принимать коробки
        только с него.
      </div>

      ${assemblyTable(d)}

    </div>

    <div
      id="scanModal"
      class="scan-modal"
    >

      <div class="scan-box">

        <div class="scan-head">

          <h2>
            Сканирование коробки
          </h2>

          <button
            class="scan-close"
            id="scanClose"
          >
            ×
          </button>

        </div>

        <input
          id="scanInput"
          class="scan-input"
          autocomplete="off"
          inputmode="numeric"
          placeholder="Сканируйте штрихкод…"
        >

        <div
          id="scanStatus"
          class="scan-status"
        >
          Готов к сканированию.
        </div>

        <div class="scan-hint">
          Bluetooth-сканер должен работать
          как клавиатура.
          После сканирования нажмите Enter
          или дождитесь автоматической обработки.
        </div>

      </div>

    </div>
  `;
}

function normBarcode(v) {
  return String(v ?? '')
    .replace(/\.0$|,0$/, '')
    .replace(/\D/g, '');
}

function assemblyTable(d) {
  return `
    <div class="table-wrap">

      <table class="data-table">

        <thead>
          <tr>
            <th>Штрихкод</th>
            <th>Зона/Ряд</th>
            <th>Поддон</th>
            <th>Коробок</th>
            <th>Отбор</th>
          </tr>
        </thead>

        <tbody>

          ${d.map(o => `
            <tr>

              <td data-label="Штрихкод">
                ${esc(fmt(o['Штрихкод']))}
              </td>

              <td data-label="Зона/Ряд">
                ${esc(fmt(o['Зона/Ряд']))}
              </td>

              <td data-label="Поддон">
                ${esc(fmt(o['Поддон']))}
              </td>

              <td data-label="Коробок">
                ${esc(fmt(o['Кол-во коробок']))}
              </td>

              <td data-label="Отбор">
                ${o['Отбор ✔️'] ? '✓' : ''}
              </td>

            </tr>
          `).join('')}

        </tbody>

      </table>

    </div>
  `;
}

/* =========================================================
   СКАНЕР
========================================================= */

function setupScanner() {
  const modal = $('#scanModal');
  const input = $('#scanInput');
  const statusEl = $('#scanStatus');

  if (!modal || !input || !statusEl) {
    return;
  }

  const close = () => {
    modal.classList.remove('show');
    input.value = '';
  };

  $('#scanBtn').onclick = () => {
    modal.classList.add('show');

    setTimeout(() => {
      input.focus();
    }, 80);
  };

  $('#scanClose').onclick = close;

  modal.onclick = e => {
    if (e.target === modal) {
      close();
    }
  };

  const process = () => {
    const code = normBarcode(input.value);

    if (!code) return;

    const pallet =
      String(
        $('#currentPallet')?.value || ''
      )
        .trim()
        .toLowerCase();

    const base = objects('База');

    let candidates = base
      .map(x => ({
        o: x,
        i: x.__rowIndex
      }))
      .filter(
        x =>
          normBarcode(x.o['Штрихкод']) === code &&
          String(x.o['Статус'] || '')
            .toLowerCase()
            .includes('на складе')
      );

    if (pallet) {
      candidates =
        candidates.filter(
          x =>
            String(
              x.o['Поддон'] ?? ''
            ).toLowerCase() === pallet
        );
    }

    if (!candidates.length) {
      statusEl.className =
        'scan-status bad';

      statusEl.innerHTML = `
        <b>✕ Коробка не найдена</b>
        <br>
        <span style="font-size:12px">
          ${esc(code)}
          ${
            pallet
              ? ' · поддон ' + esc(pallet)
              : ''
          }
        </span>
      `;

      input.select();
      beep(false);

      return;
    }

    const hit = candidates[0];

    /*
     * Меняем непосредственно строку
     * в DATA['База'].
     *
     * __rowIndex начинается с 1,
     * потому что DATA[0] = заголовки.
     */
    const row =
      DATA['База'][hit.i];

    if (row) {
      const headers =
        headerRows('База');

      const statusIndex =
        headers.indexOf('Статус');

      const workerIndex =
        headers.indexOf('Кто работал');

      const dateIndex =
        headers.indexOf('Дата');

      if (statusIndex >= 0) {
        row[statusIndex] =
          'Скомплектовано';
      }

      if (workerIndex >= 0) {
        row[workerIndex] =
          'SKLADAPLAN';
      }

      if (dateIndex >= 0) {
        row[dateIndex] =
          new Date().toISOString();
      }
    }

    statusEl.className =
      'scan-status ok';

    statusEl.innerHTML = `
      <b>✓ Коробка принята</b>
      <br>
      <span style="font-size:12px">
        ${esc(code)}
        · ${esc(hit.o['Артикул'] || '')}
        · ${esc(hit.o['Зона/Ряд'] || '')}
        · поддон ${esc(hit.o['Поддон'] || '')}
      </span>
    `;

    beep(true);

    input.value = '';
    input.focus();

    /*
     * ВАЖНО:
     * Раньше здесь был render(),
     * из-за которого модальное окно
     * уничтожалось сразу после сканирования.
     *
     * Теперь интерфейс не перерисовываем.
     * Сканирование продолжается.
     */

    updateAssemblyBadge();
  };

  input.addEventListener(
    'keydown',
    e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        process();
      }
    }
  );

  let timer;

  input.addEventListener(
    'input',
    () => {
      clearTimeout(timer);

      if (
        normBarcode(input.value).length >= 12
      ) {
        timer = setTimeout(
          process,
          120
        );
      }
    }
  );
}

/* =========================================================
   ЗВУК
========================================================= */

function beep(ok) {
  try {
    const C =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!C) return;

    const c = new C();
    const o = c.createOscillator();
    const g = c.createGain();

    o.frequency.value =
      ok ? 880 : 180;

    o.type = 'sine';

    g.gain.value = 0.06;

    o.connect(g);
    g.connect(c.destination);

    o.start();

    setTimeout(
      () => {
        o.stop();
        c.close();
      },
      ok ? 130 : 260
    );

  } catch (e) {}
}

/* =========================================================
   ПОИСК В БАЗЕ
========================================================= */

function bindSearch() {
  const inp = $('#search');

  if (!inp) return;

  inp.addEventListener(
    'input',
    () => {

      const sheet =
        {
          base: 'База',
          received: 'Принято',
          collected: 'Собрано',
          shipped: 'Убыло'
        }[state.page];

      const q =
        inp.value
          .trim()
          .toLowerCase();

      /*
       * Для Базы используем
       * специальную таблицу,
       * чтобы кнопки редактирования
       * продолжали работать.
       */

      if (sheet === 'База') {

        const r = rows(sheet);

        const filtered =
          r
            .slice(1)
            .map((row, index) => ({
              r: row,
              index
            }))
            .filter(({ r }) =>
              r.some(v =>
                String(v ?? '')
                  .toLowerCase()
                  .includes(q)
              )
            );

        $('#baseTable').innerHTML =
          baseTable(
            filtered,
            r[0]
          );

        setupBase();

        return;
      }

      if (!q) {
        $(
          '#sheetTable'
        ).innerHTML =
          table(sheet);

        return;
      }

      const r = rows(sheet);

      const filtered = [
        r[0],
        ...r
          .slice(1)
          .filter(x =>
            x.some(v =>
              String(v ?? '')
                .toLowerCase()
                .includes(q)
            )
          )
      ];

      const old = DATA[sheet];

      DATA[sheet] = filtered;

      $('#sheetTable').innerHTML =
        table(sheet);

      DATA[sheet] = old;
    }
  );
}

/* =========================================================
   BADGE
========================================================= */

function updateAssemblyBadge() {
  const badge = count('Сборка');

  if ($('#assemblyBadge')) {
    $('#assemblyBadge').textContent =
      badge || '';
  }

  if ($('#mobileAssemblyBadge')) {
    $('#mobileAssemblyBadge').textContent =
      badge || '';
  }
}

/* =========================================================
   TOOLS
========================================================= */

function tools() {
  return `
    <div class="grid2">

      <div class="panel">

        <h3>
          Импорт / экспорт
        </h3>

        <p class="muted">
          Данные загружаются из
          database.json.
          Изменения текущей версии
          можно выгрузить обратно
          в JSON.
        </p>

        <button
          class="big-action"
          id="exportBtn2"
        >
          Скачать текущие данные JSON
        </button>

      </div>

      <div class="panel">

        <h3>
          Резервная копия
        </h3>

        <p class="muted">
          Создаёт локальный JSON-архив
          всех листов.
        </p>

        <button
          class="big-action"
          id="backupBtn2"
        >
          Создать локальный backup
        </button>

      </div>

    </div>

    <div
      class="panel"
      style="margin-top:14px"
    >

      <h3>
        Структура исходного файла
      </h3>

      ${
        Object.entries(DATA)
          .map(([k, v]) => `
            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:9px 0;
                border-bottom:1px solid #eee;
                font-size:11px
              "
            >
              <span>${esc(k)}</span>
              <b>
                ${Math.max(
                  0,
                  v.length - 1
                ).toLocaleString('ru-RU')}
              </b>
            </div>
          `)
          .join('')
      }

    </div>
  `;
}

/* =========================================================
   VIEWS
========================================================= */

const views = {
  dashboard: dashboard,
  base: baseView,
  assembly: assembly,
  received: () => sheetView('Принято'),
  collected: () => sheetView('Собрано'),
  shipped: () => sheetView('Убыло'),
  tools: tools
};

/* =========================================================
   DOWNLOAD
========================================================= */

function download(
  name,
  text,
  type = 'application/json'
) {
  const a =
    document.createElement('a');

  a.href =
    URL.createObjectURL(
      new Blob(
        [text],
        { type }
      )
    );

  a.download = name;

  a.click();

  setTimeout(
    () =>
      URL.revokeObjectURL(a.href),
    500
  );
}

function backup() {
  const stamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, '-');

  download(
    `SKLADAPLAN_BACKUP_${stamp}.json`,
    JSON.stringify(
      {
        createdAt:
          new Date().toISOString(),

        source:
          'SKLADAPLAN',

        data:
          DATA
      },
      null,
      2
    )
  );
}

function exportData() {
  download(
    `SKLADAPLAN_DATA_${
      new Date()
        .toISOString()
        .slice(0, 10)
    }.json`,
    JSON.stringify(
      DATA,
      null,
      2
    )
  );
}

/* =========================================================
   НАВИГАЦИЯ
========================================================= */

document.addEventListener(
  'click',
  e => {

    const n =
      e.target.closest(
        '.nav,.mobile-nav-btn'
      );

    if (n) {
      state.page =
        n.dataset.page;

      render();

      return;
    }

    const g =
      e.target.closest(
        '[data-go]'
      );

    if (g) {
      state.page =
        g.dataset.go;

      render();

      return;
    }

    if (
      e.target.id ===
        'backupBtn' ||
      e.target.id ===
        'backupBtn2'
    ) {
      backup();

      return;
    }

    if (
      e.target.id ===
        'exportBtn' ||
      e.target.id ===
        'exportBtn2'
    ) {
      exportData();

      return;
    }

    if (
      e.target.id ===
      'calcBoxes'
    ) {
      alert(
        'Модуль расчёта коробок будет добавлен на этапе работы с заказами.'
      );

      return;
    }

    /*
     * Кнопка сканирования
     * теперь обрабатывается
     * внутри setupScanner().
     */

    if (
      e.target.id ===
      'mobileMenu'
    ) {
      state.page = 'tools';
      render();
    }
  }
);

/* =========================================================
   ЗАПУСК
========================================================= */

async function startApp() {
  const loaded =
    await loadDatabase();

  if (!loaded) {
    $('#content').innerHTML = `
      <div class="panel">
        <h3>
          Не удалось загрузить database.json
        </h3>

        <p class="muted">
          Проверь, что файл database.json
          находится рядом с index.html.
        </p>
      </div>
    `;

    return;
  }

  render();
}

startApp();
