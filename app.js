const SUPABASE_URL = 'https://ithhecprdosvjiddoalq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0dB5DQt2_ysOohx42IN4rA_mnypLeOR';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let DATA = {};
let BOX_IDS = [];

async function loadDatabase(){
  try {
    const r = await fetch('database.json', {
      cache: 'no-store'
    });

    if (!r.ok) {
      throw new Error('HTTP ' + r.status);
    }

    DATA = await r.json();

    const {
      data,
      error
    } = await supabaseClient
      .from('boxes')
      .select('*')
      .order('id', {
        ascending: true
      });

    if (error) {
      throw error;
    }

    BOX_IDS = data.map(row => row.id);

    DATA['База'] = [
      [
        'Штрихкод',
        'Артикул',
        'Кол-во в коробке',
        'Зона/Ряд',
        'Поддон',
        'Статус',
        'Дата',
        'Склад',
        'Столбец 9',
        'Направление',
        'Отбор ✔️',
        'Кто работал'
      ],

      ...data.map(row => [
        row.barcode ?? '',
        row.article ?? '',
        row.quantity_in_box ?? '',
        row.zone_row ?? '',
        row.pallet ?? '',
        row.status ?? '',
        row.date ?? '',
        row.warehouse ?? '',
        row.column_9 ?? '',
        row.direction ?? '',
        row.pick ? 'ИСТИНА' : 'ЛОЖЬ',
        row.worker ?? ''
      ])
    ];

    console.log(
      'SKLADAPLAN: База загружена из Supabase:',
      data.length,
      'коробок'
    );

    return true;

  } catch (err) {

    console.error(
      'Ошибка подключения к Supabase:',
      err
    );

    try {

      const r = await fetch(
        'database.json',
        {
          cache: 'no-store'
        }
      );

      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }

      DATA = await r.json();
      BOX_IDS = [];

      console.warn(
        'Supabase недоступен. Используется database.json.'
      );

      return true;

    } catch (fallbackError) {

      console.error(
        'Не удалось загрузить database.json:',
        fallbackError
      );

      return false;
    }
  }
}


const state = {
  page: 'dashboard',
  editingRow: null
};


const pages = {
  dashboard: [
    'Главная',
    'Главный экран склада'
  ],

  base: [
    'База',
    'Все коробки и остатки'
  ],

  assembly: [
    'Сборка',
    'Заказы к комплектации'
  ],

  received: [
    'Принято',
    'Поступления на склад'
  ],

  collected: [
    'Собрано',
    'Скомплектованные коробки'
  ],

  shipped: [
    'Убыло',
    'История отгрузок'
  ],

  tools: [
    'Инструменты',
    'Сервисные операции'
  ]
};


const $ = selector =>
  document.querySelector(selector);


const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char])
  );


function rows(sheet){
  return DATA[sheet] || [];
}


function headerRows(sheet){
  const data = rows(sheet);

  return data.length
    ? data[0].map(x => x ?? '')
    : [];
}


function objects(sheet){

  const data = rows(sheet);

  if (!data.length) {
    return [];
  }

  const headers = data[0];

  return data
    .slice(1)
    .filter(row =>
      row.some(
        value =>
          value !== null &&
          value !== '' &&
          value !== undefined
      )
    )
    .map((row, index) => ({
      __rowIndex: index + 1,

      ...Object.fromEntries(
        headers.map(
          (key, i) => [
            key || `col_${i + 1}`,
            row[i] ?? ''
          ]
        )
      )
    }));
}


function count(sheet){
  return objects(sheet).length;
}


function fmt(value){

  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  if (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\d/.test(value)
  ) {
    return value.slice(0, 10);
  }

  if (typeof value === 'number') {
    return value.toLocaleString('ru-RU');
  }

  return String(value);
}


function status(value){

  let className = '';

  if (
    String(value).includes('Скомплект')
  ) {
    className = 'green';
  }

  if (
    String(value).includes('Взять') ||
    String(value).includes('КПодбору')
  ) {
    className = 'yellow';
  }

  if (
    String(value).includes('Отгруж')
  ) {
    className = 'red';
  }

  return `
    <span class="status ${className}">
      ${esc(value)}
    </span>
  `;
}


function table(sheet, limit = 500){

  const data = rows(sheet);

  if (!data.length) {
    return `
      <div class="empty">
        Нет данных
      </div>
    `;
  }

  const headers = data[0];

  const body = data
    .slice(1)
    .filter(row =>
      row.some(
        value =>
          value !== null &&
          value !== '' &&
          value !== undefined
      )
    )
    .slice(0, limit);

  return `
    <div class="table-wrap">

      <table class="data-table">

        <thead>

          <tr>
            ${headers
              .map(
                header =>
                  `<th>${esc(header ?? '')}</th>`
              )
              .join('')
            }
          </tr>

        </thead>

        <tbody>

          ${body.map(row => `

            <tr>

              ${headers
                .map(
                  (header, i) => `

                    <td data-label="${esc(header ?? '')}">

                      ${
                        i === 5 &&
                        sheet !== 'Сборка'
                          ? status(row[i])
                          : esc(fmt(row[i]))
                      }

                    </td>

                  `
                )
                .join('')
              }

            </tr>

          `).join('')}

        </tbody>

      </table>

    </div>
  `;
}


function baseView(){

  const data = rows('База');

  if (!data.length) {

    return `
      <div class="panel">

        <div class="empty">
          Лист «База» отсутствует
        </div>

      </div>
    `;
  }

  const headers = data[0];

  const body = data
    .slice(1)
    .map(
      (row, index) => ({
        row,
        index
      })
    )
    .filter(
      ({row}) =>
        row.some(
          value =>
            value !== null &&
            value !== '' &&
            value !== undefined
        )
    );

  return `

    <div class="panel">

      <div
        class="toolbar"
        style="gap:8px;flex-wrap:wrap"
      >

        <input
          id="search"
          class="search"
          placeholder="Поиск штрихкода, артикула, зоны, поддона…"
        >

        <span
          class="muted"
          style="padding:10px 0"
        >
          ${count('База').toLocaleString('ru-RU')}
          коробок
        </span>

        <button
          class="primary"
          id="addBoxBtn"
        >
          ＋ Добавить коробку
        </button>

      </div>

      <div
        id="baseTable"
        style="margin-top:12px"
      >
        ${baseTable(body, headers)}
      </div>

    </div>

    ${boxModal()}
  `;
}


function baseTable(body, headers){

  return `

    <div class="table-wrap">

      <table class="data-table">

        <thead>

          <tr>

            ${headers
              .map(
                header =>
                  `<th>${esc(header ?? '')}</th>`
              )
              .join('')
            }

            <th>
              Действия
            </th>

          </tr>

        </thead>

        <tbody>

          ${body.map(
            ({row, index}) => `

              <tr>

                ${headers
                  .map(
                    (header, i) => `

                      <td
                        data-label="${esc(header ?? '')}"
                      >

                        ${
                          i === 5
                            ? status(row[i])
                            : esc(fmt(row[i]))
                        }

                      </td>

                    `
                  )
                  .join('')
                }

                <td data-label="Действия">

                  <div
                    style="
                      display:flex;
                      gap:6px;
                      flex-wrap:wrap
                    "
                  >

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

            `
          ).join('')}

        </tbody>

      </table>

    </div>
  `;
}


function boxModal(){

  const headers = headerRows('База');

  let row = [];

  if (state.editingRow !== null) {

    row =
      rows('База')[
        state.editingRow + 1
      ] || [];
  }

  const fields = headers
    .map(
      (header, i) => {

        const value =
          row[i] ?? '';

        return `

          <label
            style="
              display:block;
              margin-bottom:12px
            "
          >

            <span
              style="
                display:block;
                font-size:11px;
                font-weight:700;
                margin-bottom:5px
              "
            >
              ${esc(header)}
            </span>

            <input
              class="box-field"
              data-index="${i}"
              value="${esc(value)}"
              autocomplete="off"
            >

          </label>

        `;
      }
    )
    .join('');

  return `

    <div
      id="boxModal"
      class="scan-modal"
    >

      <div
        class="scan-box"
        style="
          max-width:620px;
          max-height:90vh;
          overflow:auto
        "
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


function setupBase(){

  const addButton =
    $('#addBoxBtn');

  if (addButton) {

    addButton.onclick = () => {

      state.editingRow = null;

      const oldModal =
        $('#boxModal');

      if (oldModal) {
        oldModal.remove();
      }

      document.body.insertAdjacentHTML(
        'beforeend',
        boxModal()
      );

      openBoxModal();
    };
  }


  document
    .querySelectorAll('.edit-box')
    .forEach(button => {

      button.onclick = () => {

        state.editingRow =
          Number(button.dataset.row);

        const oldModal =
          $('#boxModal');

        if (oldModal) {
          oldModal.remove();
        }

        document.body.insertAdjacentHTML(
          'beforeend',
          boxModal()
        );

        openBoxModal();
      };
    });


  document
    .querySelectorAll('.delete-box')
    .forEach(button => {

      button.onclick = async () => {

        const index =
          Number(button.dataset.row);

        const row =
          rows('База')[index + 1];

        if (!row) {
          return;
        }

        const barcode =
          row[0] || '';

        const id =
          BOX_IDS[index];

        if (!id) {

          alert(
            'Для этой строки не найден ID Supabase.\n\n' +
            'Обновите страницу и попробуйте ещё раз.'
          );

          return;
        }

        const confirmed =
          confirm(
            `Удалить коробку ${barcode}?\n\n` +
            'Она будет удалена из общей базы Supabase.'
          );

        if (!confirmed) {
          return;
        }

        button.disabled = true;

        const {
          error
        } = await supabaseClient
          .from('boxes')
          .delete()
          .eq('id', id);

        if (error) {

          console.error(error);

          alert(
            'Не удалось удалить коробку:\n' +
            error.message
          );

          button.disabled = false;

          return;
        }

        await reloadAndRender();
      };
    });
}


function openBoxModal(){

  const modal =
    $('#boxModal');

  if (!modal) {
    return;
  }

  modal.classList.add('show');


  const close = () => {

    modal.classList.remove('show');

    state.editingRow = null;

    setTimeout(() => {

      const current =
        $('#boxModal');

      if (current) {
        current.remove();
      }

    }, 150);
  };


  $('#boxModalClose').onclick =
    close;

  $('#boxCancel').onclick =
    close;


  modal.onclick = event => {

    if (event.target === modal) {
      close();
    }
  };


  $('#boxSave').onclick =
    saveBox;
}


function normBarcode(value){

  return String(value ?? '')
    .replace(/\.0$|,0$/, '')
    .replace(/\D/g, '');
}


function rowToSupabase(row){

  let quantity = null;

  if (
    row[2] !== '' &&
    row[2] !== null &&
    row[2] !== undefined
  ) {

    const parsed =
      Number(row[2]);

    quantity =
      Number.isFinite(parsed)
        ? parsed
        : null;
  }

  return {

    barcode:
      normBarcode(row[0]),

    article:
      row[1] || null,

    quantity_in_box:
      quantity,

    zone_row:
      row[3] || null,

    pallet:
      row[4] || null,

    status:
      row[5] || 'На складе',

    date:
      row[6] || null,

    warehouse:
      row[7] || null,

    column_9:
      row[8] || null,

    direction:
      row[9] || null,

    pick:
      String(row[10] || '')
        .toLowerCase() === 'истина' ||
      String(row[10] || '')
        .toLowerCase() === 'true',

    worker:
      row[11] || null,

    updated_at:
      new Date().toISOString()
  };
}


async function saveBox(){

  const headers =
    headerRows('База');

  const newRow =
    headers.map((_, i) => {

      const input =
        document.querySelector(
          `.box-field[data-index="${i}"]`
        );

      return input
        ? input.value.trim()
        : '';
    });


  const barcode =
    normBarcode(newRow[0]);


  if (!barcode) {

    alert(
      'Введите штрихкод.'
    );

    return;
  }


  newRow[0] =
    barcode;


  const button =
    $('#boxSave');


  if (button) {

    button.disabled =
      true;

    button.textContent =
      'Сохранение…';
  }


  try {

    if (
      state.editingRow === null
    ) {

      const payload =
        rowToSupabase(newRow);

      delete payload.updated_at;

      const {
        error
      } = await supabaseClient
        .from('boxes')
        .insert(payload);

      if (error) {
        throw error;
      }

    } else {

      const id =
        BOX_IDS[
          state.editingRow
        ];

      if (!id) {

        throw new Error(
          'Не найден ID коробки в Supabase.'
        );
      }


      const payload =
        rowToSupabase(newRow);


      const {
        error
      } = await supabaseClient
        .from('boxes')
        .update(payload)
        .eq('id', id);


      if (error) {
        throw error;
      }
    }


    state.editingRow =
      null;

    await reloadAndRender();

  } catch (error) {

    console.error(error);

    alert(
      'Не удалось сохранить коробку:\n' +
      (error.message || error)
    );

    if (button) {

      button.disabled =
        false;

      button.textContent =
        '💾 Сохранить';
    }
  }
}


async function updateBox(
  id,
  changes
){

  const payload = {
    ...changes,

    updated_at:
      new Date().toISOString()
  };


  const {
    error
  } = await supabaseClient
    .from('boxes')
    .update(payload)
    .eq('id', id);


  if (error) {
    throw error;
  }
}


async function reloadAndRender(){

  const loaded =
    await loadDatabase();


  if (!loaded) {

    alert(
      'Не удалось обновить данные.'
    );

    return;
  }


  render();
}


function dashboard(){

  const base =
    objects('База');


  const statuses = {};


  base.forEach(row => {

    const s =
      row['Статус'] || '';

    statuses[s] =
      (statuses[s] || 0) + 1;
  });


  const directions =
    objects('Убыло')
      .reduce(
        (result, row) => {

          const direction =
            row['Направление'] ||
            'Без направления';

          result[direction] =
            (result[direction] || 0) + 1;

          return result;

        },
        {}
      );


  const top =
    Object.entries(directions)
      .sort(
        (a,b) =>
          b[1] - a[1]
      )
      .slice(0,8);


  return `

    <div class="notice">

      SKLADAPLAN подключён к Supabase.

      Изменения в «Базе»
      сохраняются в общей базе данных.

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
          ${
            (
              statuses['На складе'] || 0
            ).toLocaleString('ru-RU')
          }
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
          ${
            (
              statuses['Скомплектовано'] || 0
            ).toLocaleString('ru-RU')
          }
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
          ${
            (
              statuses['Отгружено'] || 0
            ).toLocaleString('ru-RU')
          }
        </div>

        <div class="sub">
          по данным Базы
        </div>

      </div>

    </div>


    <div class="grid2">

      <div class="panel">

        <div class="section-title">

          <h3>
            Последние операции
          </h3>

          <span class="muted">
            лист «Убыло»
          </span>

        </div>

        ${table('Убыло',10)}

      </div>


      <div class="panel">

        <div class="section-title">

          <h3>
            По направлениям
          </h3>

          <span class="muted">
            отгрузки
          </span>

        </div>


        ${top.map(
          ([key,value]) => `

            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:9px 0;
                border-bottom:1px solid #eee;
                font-size:11px
              "
            >

              <span>
                ${esc(key)}
              </span>

              <b>
                ${value}
              </b>

            </div>

          `
        ).join('')}

      </div>

    </div>


    <div
      class="panel"
      style="margin-top:14px"
    >

      <h3>
        Быстрые действия
      </h3>


      <div class="quick">

        <button data-go="base">

          <b>
            ▦ Открыть базу
          </b>

          <span>
            Поиск, добавление и
            редактирование коробок
          </span>

        </button>


        <button data-go="assembly">

          <b>
            ✓ Сборка
          </b>

          <span>
            Перейти к комплектации
          </span>

        </button>


        <button id="calcBoxes">

          <b>
            ＋ Рассчитать коробки
          </b>

          <span>
            Для будущего модуля заказов
          </span>

        </button>

      </div>

    </div>

  `;
}


function sheetView(sheet){

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
          ${count(sheet).toLocaleString('ru-RU')}
          строк
        </span>

      </div>

      <div id="sheetTable">
        ${table(sheet)}
      </div>

    </div>

  `;
}


function assembly(){

  const data =
    objects('Сборка')
      .filter(
        row =>
          row['Штрихкод'] != null
      );


  data.sort(
    (a,b) =>

      String(
        a['Зона/Ряд'] || ''
      ).localeCompare(
        String(
          b['Зона/Ряд'] || ''
        ),
        'ru',
        {
          numeric:true
        }
      )

      ||

      String(
        a['Поддон'] || ''
      ).localeCompare(
        String(
          b['Поддон'] || ''
        ),
        'ru',
        {
          numeric:true
        }
      )
  );


  const total =
    data.reduce(
      (sum,row) =>
        sum +
        (
          Number(
            row['Кол-во коробок']
          ) || 0
        ),
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

            <b>
              ${total}
            </b>

            коробок.

          </div>

        </div>


        <span class="muted">
          ${data.length} позиции
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
        style="
          font-size:11px;
          margin-bottom:10px
        "
      >

        Если указан текущий поддон,
        сканер будет принимать коробки
        только с него.

      </div>


      ${assemblyTable(data)}

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

          Bluetooth-сканер должен
          работать как клавиатура.

          После сканирования нажмите
          Enter или дождитесь
          автоматической обработки.

        </div>

      </div>

    </div>

  `;
}


function assemblyTable(data){

  return `

    <div class="table-wrap">

      <table class="data-table">

        <thead>

          <tr>

            <th>
              Штрихкод
            </th>

            <th>
              Зона/Ряд
            </th>

            <th>
              Поддон
            </th>

            <th>
              Коробок
            </th>

            <th>
              Отбор
            </th>

          </tr>

        </thead>


        <tbody>

          ${data.map(
            row => `

              <tr>

                <td data-label="Штрихкод">
                  ${esc(
                    fmt(
                      row['Штрихкод']
                    )
                  )}
                </td>


                <td data-label="Зона/Ряд">
                  ${esc(
                    fmt(
                      row['Зона/Ряд']
                    )
                  )}
                </td>


                <td data-label="Поддон">
                  ${esc(
                    fmt(
                      row['Поддон']
                    )
                  )}
                </td>


                <td data-label="Коробок">
                  ${esc(
                    fmt(
                      row['Кол-во коробок']
                    )
                  )}
                </td>


                <td data-label="Отбор">

                  ${
                    row['Отбор ✔️']
                      ? '✓'
                      : ''
                  }

                </td>

              </tr>

            `
          ).join('')}

        </tbody>

      </table>

    </div>

  `;
}


function setupScanner(){

  const modal =
    $('#scanModal');

  const input =
    $('#scanInput');

  const statusElement =
    $('#scanStatus');


  if (
    !modal ||
    !input ||
    !statusElement
  ) {
    return;
  }


  const close = () => {

    modal.classList.remove(
      'show'
    );

    input.value = '';
  };


  $('#scanBtn').onclick = () => {

    modal.classList.add(
      'show'
    );

    setTimeout(
      () => input.focus(),
      80
    );
  };


  $('#scanClose').onclick =
    close;


  modal.onclick = event => {

    if (
      event.target === modal
    ) {
      close();
    }
  };


  const processScan =
    async () => {

      const code =
        normBarcode(
          input.value
        );


      if (!code) {
        return;
      }


      const currentPallet =
        String(
          $('#currentPallet')?.value ||
          ''
        )
          .trim()
          .toLowerCase();


      const base =
        objects('База');


      let candidates =
        base
          .map(
            row => ({
              object: row,
              index: row.__rowIndex
            })
          )
          .filter(
            item =>
              normBarcode(
                item.object['Штрихкод']
              ) === code &&

              String(
                item.object['Статус'] ||
                ''
              )
                .toLowerCase()
                .includes(
                  'на складе'
                )
          );


      if (currentPallet) {

        candidates =
          candidates.filter(
            item =>
              String(
                item.object['Поддон'] ??
                ''
              )
                .toLowerCase() ===
              currentPallet
          );
      }


      if (!candidates.length) {

        statusElement.className =
          'scan-status bad';


        statusElement.innerHTML = `

          <b>
            ✕ Коробка не найдена
          </b>

          <br>

          <span style="font-size:12px">

            ${esc(code)}

            ${
              currentPallet
                ? ' · поддон ' +
                  esc(currentPallet)
                : ''
            }

          </span>

        `;


        input.select();

        beep(false);

        return;
      }


      const hit =
        candidates[0];


      const id =
        BOX_IDS[
          hit.index - 1
        ];


      if (!id) {

        statusElement.className =
          'scan-status bad';


        statusElement.innerHTML = `

          <b>
            ✕ У коробки нет ID Supabase
          </b>

          <br>

          <span style="font-size:12px">
            ${esc(code)}
          </span>

        `;


        beep(false);

        return;
      }


      try {

        await updateBox(
          id,
          {
            status:
              'Скомплектовано',

            worker:
              'SKLADAPLAN',

            date:
              new Date().toISOString(),

            pick:
              true
          }
        );


        const row =
          DATA['База'][
            hit.index
          ];


        const headers =
          headerRows('База');


        if (row) {

          const statusIndex =
            headers.indexOf(
              'Статус'
            );

          const workerIndex =
            headers.indexOf(
              'Кто работал'
            );

          const dateIndex =
            headers.indexOf(
              'Дата'
            );

          const pickIndex =
            headers.indexOf(
              'Отбор ✔️'
            );


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


          if (pickIndex >= 0) {
            row[pickIndex] =
              'ИСТИНА';
          }
        }


        statusElement.className =
          'scan-status ok';


        statusElement.innerHTML = `

          <b>
            ✓ Коробка сохранена
          </b>

          <br>

          <span style="font-size:12px">

            ${esc(code)}

            ·
            ${esc(
              hit.object['Артикул'] || ''
            )}

            ·
            ${esc(
              hit.object['Зона/Ряд'] || ''
            )}

            · поддон
            ${esc(
              hit.object['Поддон'] || ''
            )}

          </span>

        `;


        beep(true);


        input.value = '';

        input.focus();


        updateAssemblyBadge();

      } catch(error) {

        console.error(error);


        statusElement.className =
          'scan-status bad';


        statusElement.innerHTML = `

          <b>
            ✕ Ошибка сохранения
          </b>

          <br>

          <span style="font-size:12px">

            ${esc(
              error.message ||
              error
            )}

          </span>

        `;


        beep(false);
      }
    };


  input.addEventListener(
    'keydown',
    event => {

      if (
        event.key === 'Enter'
      ) {

        event.preventDefault();

        processScan();
      }
    }
  );


  let timer;


  input.addEventListener(
    'input',
    () => {

      clearTimeout(timer);


      if (
        normBarcode(
          input.value
        ).length >= 12
      ) {

        timer =
          setTimeout(
            processScan,
            120
          );
      }
    }
  );
}


function beep(ok){

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


    oscillator.frequency.value =
      ok
        ? 880
        : 180;


    oscillator.type =
      'sine';


    gain.gain.value =
      0.06;


    oscillator.connect(gain);

    gain.connect(
      context.destination
    );


    oscillator.start();


    setTimeout(
      () => {

        oscillator.stop();

        context.close();

      },
      ok ? 130 : 260
    );

  } catch(error) {}
}


function bindSearch(){

  const input =
    $('#search');


  if (!input) {
    return;
  }


  input.addEventListener(
    'input',
    () => {

      const sheet =
        {
          base: 'База',
          received: 'Принято',
          collected: 'Собрано',
          shipped: 'Убыло'
        }[
          state.page
        ];


      const query =
        input.value
          .trim()
          .toLowerCase();


      if (
        sheet === 'База'
      ) {

        const data =
          rows(sheet);


        const filtered =
          data
            .slice(1)
            .map(
              (row,index) => ({
                row,
                index
              })
            )
            .filter(
              ({row}) =>
                row.some(
                  value =>
                    String(
                      value ?? ''
                    )
                      .toLowerCase()
                      .includes(query)
                )
            );


        $('#baseTable').innerHTML =
          baseTable(
            filtered,
            data[0]
          );


        setupBase();

        return;
      }


      if (!query) {

        $('#sheetTable').innerHTML =
          table(sheet);

        return;
      }


      const data =
        rows(sheet);


      const filtered = [

        data[0],

        ...data
          .slice(1)
          .filter(
            row =>
              row.some(
                value =>
                  String(
                    value ?? ''
                  )
                    .toLowerCase()
                    .includes(query)
              )
          )
      ];


      const old =
        DATA[sheet];


      DATA[sheet] =
        filtered;


      $('#sheetTable').innerHTML =
        table(sheet);


      DATA[sheet] =
        old;
    }
  );
}


function updateAssemblyBadge(){

  const value =
    count('Сборка');


  if (
    $('#assemblyBadge')
  ) {

    $('#assemblyBadge')
      .textContent =
        value || '';
  }


  if (
    $('#mobileAssemblyBadge')
  ) {

    $('#mobileAssemblyBadge')
      .textContent =
        value || '';
  }
}


function tools(){

  return `

    <div class="grid2">

      <div class="panel">

        <h3>
          Импорт / экспорт
        </h3>

        <p class="muted">

          «База» теперь хранится
          в Supabase.

          Остальные листы пока
          загружаются из
          database.json.

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
          текущих данных.

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
        Структура данных
      </h3>


      ${Object.entries(DATA)
        .map(
          ([key,value]) => `

            <div
              style="
                display:flex;
                justify-content:space-between;
                padding:9px 0;
                border-bottom:1px solid #eee;
                font-size:11px
              "
            >

              <span>
                ${esc(key)}
              </span>

              <b>
                ${
                  Math.max(
                    0,
                    value.length - 1
                  ).toLocaleString('ru-RU')
                }
              </b>

            </div>

          `
        )
        .join('')}

    </div>

  `;
}


const views = {

  dashboard:
    dashboard,

  base:
    baseView,

  assembly:
    assembly,

  received:
    () =>
      sheetView('Принято'),

  collected:
    () =>
      sheetView('Собрано'),

  shipped:
    () =>
      sheetView('Убыло'),

  tools:
    tools
};


function download(
  name,
  text,
  type = 'application/json'
){

  const link =
    document.createElement('a');


  link.href =
    URL.createObjectURL(
      new Blob(
        [text],
        {type}
      )
    );


  link.download =
    name;


  link.click();


  setTimeout(
    () =>
      URL.revokeObjectURL(
        link.href
      ),
    500
  );
}


function backup(){

  const stamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        '-'
      );


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


function exportData(){

  download(

    `SKLADAPLAN_DATA_${new Date().toISOString().slice(0,10)}.json`,

    JSON.stringify(
      DATA,
      null,
      2
    )

  );
}


function render(){

  const [
    pageTitle,
    heading
  ] =
    pages[state.page];


  $('#pageTitle')
    .textContent =
      pageTitle;


  $('#heading')
    .textContent =
      heading;


  document
    .querySelectorAll(
      '.nav,.mobile-nav-btn'
    )
    .forEach(
      button =>
        button.classList.toggle(
          'active',
          button.dataset.page ===
          state.page
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


  if (
    state.page === 'base'
  ) {

    setupBase();
  }


  if (
    state.page === 'assembly'
  ) {

    setupScanner();
  }


  updateAssemblyBadge();
}


document.addEventListener(
  'click',
  event => {

    const navigation =
      event.target.closest(
        '.nav,.mobile-nav-btn'
      );


    if (navigation) {

      state.page =
        navigation.dataset.page;

      render();

      return;
    }


    const go =
      event.target.closest(
        '[data-go]'
      );


    if (go) {

      state.page =
        go.dataset.go;

      render();

      return;
    }


    if (
      event.target.id ===
        'backupBtn' ||

      event.target.id ===
        'backupBtn2'
    ) {

      backup();

      return;
    }


    if (
      event.target.id ===
        'exportBtn' ||

      event.target.id ===
        'exportBtn2'
    ) {

      exportData();

      return;
    }


    if (
      event.target.id ===
      'calcBoxes'
    ) {

      alert(
        'Модуль расчёта коробок будет добавлен на этапе работы с заказами.'
      );

      return;
    }


    if (
      event.target.id ===
      'mobileMenu'
    ) {

      state.page =
        'tools';

      render();
    }

  }
);


async function startApp(){

  const loaded =
    await loadDatabase();


  if (!loaded) {

    $('#content').innerHTML = `

      <div class="panel">

        <h3>
          Не удалось загрузить данные
        </h3>

        <p class="muted">

          Проверь подключение к
          Supabase и наличие
          database.json.

        </p>

      </div>

    `;

    return;
  }


  render();
}
startApp();
