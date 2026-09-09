const SUPABASE_URL = 'https://ithhecprdosvjiddoalq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0dB5DQt2_ysOohx42IN4rA_mnypLeOR';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let DATA = {};
let BOX_IDS = [];


// =====================================================
// ЗАГРУЗКА БАЗЫ
// =====================================================

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


    BOX_IDS = data.map(
      row => row.id
    );


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

      ...data.map(
        row => [

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

        ]
      )

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


// =====================================================
// STATE
// =====================================================

const state = {
  page: 'dashboard',
  editingRow: null
};


// =====================================================
// PAGES
// =====================================================

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


// =====================================================
// HELPERS
// =====================================================

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

  const data =
    rows(sheet);


  return data.length
    ? data[0].map(
        x => x ?? ''
      )
    : [];

}


function objects(sheet){

  const data =
    rows(sheet);


  if (!data.length) {
    return [];
  }


  const headers =
    data[0];


  return data
    .slice(1)
    .filter(
      row =>
        row.some(
          value =>
            value !== null &&
            value !== '' &&
            value !== undefined
        )
    )
    .map(
      (row, index) => ({

        __rowIndex:
          index + 1,

        ...Object.fromEntries(
          headers.map(
            (key, i) => [
              key || `col_${i + 1}`,
              row[i] ?? ''
            ]
          )
        )

      })
    );

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


  if (
    typeof value === 'number'
  ) {

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


// =====================================================
// ОБЩАЯ ТАБЛИЦА
// =====================================================

function table(
  sheet,
  limit = 500
){

  const data =
    rows(sheet);


  if (!data.length) {

    return `

      <div class="empty">
        Нет данных
      </div>

    `;

  }


  const headers =
    data[0];


  const body =
    data
      .slice(1)
      .filter(
        row =>
          row.some(
            value =>
              value !== null &&
              value !== '' &&
              value !== undefined
          )
      )
      .slice(
        0,
        limit
      );


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

          ${body
            .map(
              row => `

                <tr>

                  ${headers
                    .map(
                      (header, i) => `

                        <td
                          data-label="${esc(header ?? '')}"
                        >

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

              `
            )
            .join('')}

        </tbody>

      </table>

    </div>

  `;

}


// =====================================================
// БАЗА
// =====================================================

function baseView(){

  const data =
    rows('База');


  if (!data.length) {

    return `

      <div class="panel">

        <div class="empty">
          Лист «База» отсутствует
        </div>

      </div>

    `;

  }


  const headers =
    data[0];


  const body =
    data
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

        ${baseTable(
          body,
          headers
        )}

      </div>

    </div>


    ${boxModal()}

  `;

}


function baseTable(
  body,
  headers
){

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

          ${body
            .map(
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
            )
            .join('')}

        </tbody>

      </table>

    </div>

  `;

}


// =====================================================
// MODAL КОРОБКИ
// =====================================================

function boxModal(){

  const headers =
    headerRows('База');


  let row = [];


  if (
    state.editingRow !== null
  ) {

    row =
      rows('База')[
        state.editingRow + 1
      ] || [];

  }


  const fields =
    headers
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


// =====================================================
// НАСТРОЙКА БАЗЫ
// =====================================================

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
    .forEach(
      button => {

        button.onclick = () => {

          state.editingRow =
            Number(
              button.dataset.row
            );


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
    );


  document
    .querySelectorAll('.delete-box')
    .forEach(
      button => {

        button.onclick =
          async () => {

            const index =
              Number(
                button.dataset.row
              );


            const row =
              rows('База')[
                index + 1
              ];


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

      }
    );

}


// =====================================================
// MODAL
// =====================================================

function openBoxModal(){

  const modal =
    $('#boxModal');


  if (!modal) {
    return;
  }


  modal.classList.add('show');


  const close = () => {

    modal.classList.remove(
      'show'
    );


    state.editingRow = null;


    setTimeout(
      () => {

        const current =
          $('#boxModal');


        if (current) {
          current.remove();
        }

      },
      150
    );

  };


  $('#boxModalClose').onclick =
    close;


  $('#boxCancel').onclick =
    close;


  modal.onclick =
    event => {

      if (
        event.target === modal
      ) {

        close();

      }

    };


  $('#boxSave').onclick =
    saveBox;

}


// =====================================================
// BARCODE
// =====================================================

function normBarcode(value){

  return String(value ?? '')
    .replace(
      /\.0$|,0$/,
      ''
    )
    .replace(
      /\D/g,
      ''
    );

}


// =====================================================
// SUPABASE ROW
// =====================================================

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


// =====================================================
// СОХРАНЕНИЕ КОРОБКИ
// =====================================================

async function saveBox(){

  const headers =
    headerRows('База');


  const newRow =
    headers.map(
      (_, i) => {

        const input =
          document.querySelector(
            `.box-field[data-index="${i}"]`
          );


        return input
          ? input.value.trim()
          : '';

      }
    );


  const barcode =
    normBarcode(
      newRow[0]
    );


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
        rowToSupabase(
          newRow
        );


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
        rowToSupabase(
          newRow
        );


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


// =====================================================
// UPDATE BOX
// =====================================================

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


// =====================================================
// RELOAD
// =====================================================

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


// =====================================================
// DASHBOARD
// =====================================================

function dashboard(){

  const base =
    objects('База');


  const statuses = {};


  base.forEach(
    row => {

      const s =
        row['Статус'] || '';


      statuses[s] =
        (statuses[s] || 0) + 1;

    }
  );


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
    Object.entries(
      directions
    )
      .sort(
        (a,b) =>
          b[1] - a[1]
      )
      .slice(
        0,
        8
      );


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


        ${table(
          'Убыло',
          10
        )}

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


        ${top
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
                  ${value}
                </b>

              </div>

            `
          )
          .join('')}

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


// =====================================================
// SHEET VIEW
// =====================================================

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


// =====================================================
// ASSEMBLY
// =====================================================

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

          ${data
            .map(
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
            )
            .join('')}

        </tbody>

      </table>

    </div>

  `;

}


// =====================================================
// SCANNER
// =====================================================

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


  const scanButton =
    $('#scanBtn');


  if (scanButton) {

    scanButton.onclick =
      () => {

        modal.classList.add(
          'show'
        );


        setTimeout(
          () =>
            input.focus(),
          80
        );

      };

  }


  $('#scanClose').onclick =
    close;


  modal.onclick =
    event => {

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

              object:
                row,

              index:
                row.__rowIndex

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


          if (
            statusIndex >= 0
          ) {

            row[statusIndex] =
              'Скомплектовано';

          }


          if (
            workerIndex >= 0
          ) {

            row[workerIndex] =
              'SKLADAPLAN';

          }


          if (
            dateIndex >= 0
          ) {

            row[dateIndex] =
              new Date().toISOString();

          }


          if (
            pickIndex >= 0
          ) {

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


// =====================================================
// BEEP
// =====================================================

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
      ok
        ? 130
        : 260
    );

  } catch(error) {}

}


// =====================================================
// SEARCH
// =====================================================

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


        const baseTableElement =
          $('#baseTable');


        if (baseTableElement) {

          baseTableElement.innerHTML =
            baseTable(
              filtered,
              data[0]
            );

        }


        setupBase();


        return;

      }


      if (!query) {

        const sheetTableElement =
          $('#sheetTable');


        if (sheetTableElement) {

          sheetTableElement.innerHTML =
            table(sheet);

        }


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


      const sheetTableElement =
        $('#sheetTable');


      if (sheetTableElement) {

        sheetTableElement.innerHTML =
          table(sheet);

      }


      DATA[sheet] =
        old;

    }
  );

}


// =====================================================
// ASSEMBLY BADGE
// =====================================================

function updateAssemblyBadge(){

  const value =
    count('Сборка');


  const badge =
    $('#assemblyBadge');


  if (badge) {

    badge.textContent =
      value || '';

  }


  const mobileBadge =
    $('#mobileAssemblyBadge');


  if (mobileBadge) {

    mobileBadge.textContent =
      value || '';

  }

}


// =====================================================
// EXCEL IMPORT
// =====================================================

const EXCEL_HEADERS = [

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

];


let pendingExcelImport = null;


// -----------------------------------------------------
// Нормализация заголовка
// -----------------------------------------------------

function normalizeExcelHeader(value){

  return String(
    value ?? ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' '
    )
    .toLowerCase();

}


// -----------------------------------------------------
// Нормализация штрихкода
// -----------------------------------------------------

function normalizeImportedBarcode(value){

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return '';

  }


  return String(value)
    .trim()
    .replace(
      /\.0$/,
      ''
    )
    .replace(
      /,0$/,
      ''
    )
    .replace(
      /\D/g,
      ''
    );

}


// -----------------------------------------------------
// Boolean из Excel
// -----------------------------------------------------

function excelBoolean(value){

  const text =
    String(
      value ?? ''
    )
      .trim()
      .toLowerCase();


  return (

    text === 'истина' ||

    text === 'true' ||

    text === 'да' ||

    text === '1' ||

    text === '✓' ||

    text === '✔️'

  );

}


// -----------------------------------------------------
// Дата из Excel
// -----------------------------------------------------

function excelDate(value){

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
      isNaN(
        value.getTime()
      )
    ) {

      return null;

    }


    return value.toISOString();

  }


  if (
    typeof value === 'number' &&
    value > 20000 &&
    value < 60000
  ) {

    const d =
      XLSX.SSF.parse_date_code(
        value
      );


    if (d) {

      return new Date(
        Date.UTC(
          d.y,
          d.m - 1,
          d.d,
          d.H || 0,
          d.M || 0,
          Math.floor(
            d.S || 0
          )
        )
      ).toISOString();

    }

  }


  const text =
    String(value)
      .trim();


  const match =
    text.match(
      /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/
    );


  if (match) {

    const day =
      Number(
        match[1]
      );


    const month =
      Number(
        match[2]
      );


    const year =
      Number(
        match[3]
      );


    return new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    ).toISOString();

  }


  const parsed =
    new Date(text);


  if (
    !isNaN(
      parsed.getTime()
    )
  ) {

    return parsed.toISOString();

  }


  return null;

}


// -----------------------------------------------------
// Поиск колонки
// -----------------------------------------------------

function findExcelColumn(
  headers,
  name
){

  const target =
    normalizeExcelHeader(
      name
    );


  return headers.findIndex(
    header =>
      normalizeExcelHeader(
        header
      ) === target
  );

}


// -----------------------------------------------------
// Чтение Excel
// -----------------------------------------------------

async function readExcel(file){

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();


      reader.onload =
        event => {

          try {

            const workbook =
              XLSX.read(
                event.target.result,
                {
                  type: 'array',
                  cellDates: true
                }
              );


            if (
              !workbook.SheetNames.length
            ) {

              throw new Error(
                'В Excel нет листов.'
              );

            }


            const sheet =
              workbook.Sheets[
                workbook.SheetNames[0]
              ];


            const data =
              XLSX.utils.sheet_to_json(
                sheet,
                {
                  header: 1,
                  defval: '',
                  raw: true
                }
              );


            resolve({

              sheetName:
                workbook.SheetNames[0],

              data

            });

          } catch(error) {

            reject(error);

          }

        };


      reader.onerror =
        () =>
          reject(
            new Error(
              'Не удалось прочитать Excel.'
            )
          );


      reader.readAsArrayBuffer(
        file
      );

    }
  );

}


// -----------------------------------------------------
// Конвертация Excel
// -----------------------------------------------------

function convertExcelData(
  rawData
){

  if (
    !rawData ||
    rawData.length < 2
  ) {

    throw new Error(
      'Excel-файл пустой или содержит только заголовки.'
    );

  }


  const headers =
    rawData[0].map(
      value =>
        String(
          value ?? ''
        ).trim()
    );


  const indexes = {};


  EXCEL_HEADERS.forEach(
    header => {

      indexes[header] =
        findExcelColumn(
          headers,
          header
        );

    }
  );


  if (
    indexes['Штрихкод'] === -1
  ) {

    throw new Error(
      'Не найдена колонка «Штрихкод».'
    );

  }


  const result = [];

  let errors = 0;


  rawData
    .slice(1)
    .forEach(
      (sourceRow, index) => {

        const empty =
          sourceRow.every(
            value =>
              value === '' ||
              value === null ||
              value === undefined
          );


        if (empty) {
          return;
        }


        const barcode =
          normalizeImportedBarcode(
            sourceRow[
              indexes['Штрихкод']
            ]
          );


        if (!barcode) {

          errors++;

          return;

        }


        let quantity = null;


        if (
          indexes['Кол-во в коробке'] >= 0
        ) {

          const value =
            sourceRow[
              indexes['Кол-во в коробке']
            ];


          if (
            value !== '' &&
            value !== null &&
            value !== undefined
          ) {

            const number =
              Number(value);


            if (
              Number.isFinite(number)
            ) {

              quantity =
                number;

            }

          }

        }


        result.push({

          excelRow:
            index + 2,

          data: {

            barcode,

            article:
              indexes['Артикул'] >= 0
                ? String(
                    sourceRow[
                      indexes['Артикул']
                    ] ?? ''
                  ).trim() || null
                : null,


            quantity_in_box:
              quantity,


            zone_row:
              indexes['Зона/Ряд'] >= 0
                ? String(
                    sourceRow[
                      indexes['Зона/Ряд']
                    ] ?? ''
                  ).trim() || null
                : null,


            pallet:
              indexes['Поддон'] >= 0
                ? String(
                    sourceRow[
                      indexes['Поддон']
                    ] ?? ''
                  ).trim() || null
                : null,


            status:
              indexes['Статус'] >= 0
                ? String(
                    sourceRow[
                      indexes['Статус']
                    ] ?? ''
                  ).trim() ||
                  'На складе'
                : 'На складе',


            date:
              indexes['Дата'] >= 0
                ? excelDate(
                    sourceRow[
                      indexes['Дата']
                    ]
                  )
                : null,


            warehouse:
              indexes['Склад'] >= 0
                ? String(
                    sourceRow[
                      indexes['Склад']
                    ] ?? ''
                  ).trim() || null
                : null,


            column_9:
              indexes['Столбец 9'] >= 0
                ? String(
                    sourceRow[
                      indexes['Столбец 9']
                    ] ?? ''
                  ).trim() || null
                : null,


            direction:
              indexes['Направление'] >= 0
                ? String(
                    sourceRow[
                      indexes['Направление']
                    ] ?? ''
                  ).trim() || null
                : null,


            pick:
              indexes['Отбор ✔️'] >= 0
                ? excelBoolean(
                    sourceRow[
                      indexes['Отбор ✔️']
                    ]
                  )
                : false,


            worker:
              indexes['Кто работал'] >= 0
                ? String(
                    sourceRow[
                      indexes['Кто работал']
                    ] ?? ''
                  ).trim() || null
                : null

          }

        });

      }
    );


  return {

    rows:
      result,

    errors

  };

}


// -----------------------------------------------------
// Preview Excel
// -----------------------------------------------------

function excelPreview(
  items
){

  const preview =
    items.slice(
      0,
      20
    );


  return `

    <div class="table-wrap">

      <table class="data-table">

        <thead>

          <tr>

            <th>
              №
            </th>

            <th>
              Штрихкод
            </th>

            <th>
              Артикул
            </th>

            <th>
              Зона/Ряд
            </th>

            <th>
              Поддон
            </th>

            <th>
              Статус
            </th>

            <th>
              Склад
            </th>

          </tr>

        </thead>


        <tbody>

          ${preview
            .map(
              item => `

                <tr>

                  <td>
                    ${item.excelRow}
                  </td>


                  <td>
                    ${esc(
                      item.data.barcode
                    )}
                  </td>


                  <td>
                    ${esc(
                      item.data.article || ''
                    )}
                  </td>


                  <td>
                    ${esc(
                      item.data.zone_row || ''
                    )}
                  </td>


                  <td>
                    ${esc(
                      item.data.pallet || ''
                    )}
                  </td>


                  <td>
                    ${esc(
                      item.data.status || ''
                    )}
                  </td>


                  <td>
                    ${esc(
                      item.data.warehouse || ''
                    )}
                  </td>

                </tr>

              `
            )
            .join('')}

        </tbody>

      </table>

    </div>


    ${
      items.length > 20

        ? `

          <div
            class="muted"
            style="margin-top:8px"
          >

            Показаны первые 20 строк
            из
            ${items.length.toLocaleString('ru-RU')}.

          </div>

        `

        : ''
    }

  `;

}


// -----------------------------------------------------
// Импорт в Supabase
// -----------------------------------------------------

async function importExcelRows(
  items
){

  const chunkSize =
    500;


  let imported =
    0;


  for (
    let i = 0;
    i < items.length;
    i += chunkSize
  ) {

    const now =
      new Date().toISOString();


    const chunk =
      items
        .slice(
          i,
          i + chunkSize
        )
        .map(
          item => ({

            ...item.data,

            created_at:
              now,

            updated_at:
              now

          })
        );


    const {
      error
    } = await supabaseClient
      .from('boxes')
      .insert(chunk);


    if (error) {
      throw error;
    }


    imported +=
      chunk.length;


    const progress =
      $('#importProgress');


    if (progress) {

      progress.textContent =

        `Загружено ${
          imported.toLocaleString('ru-RU')
        } из ${
          items.length.toLocaleString('ru-RU')
        } коробок…`;

    }

  }


  return imported;

}


// =====================================================
// EXCEL IMPORT VIEW
// =====================================================

function excelImportView(){

  return `

    <div class="panel">

      <div class="section-title">

        <div>

          <h3>
            📥 Импорт Excel
          </h3>


          <div class="muted">

            Загрузить готовую таблицу склада
            в Supabase

          </div>

        </div>

      </div>


      <div
        style="
          border:2px dashed #ccc;
          border-radius:12px;
          padding:25px;
          text-align:center;
          margin-top:15px
        "
      >

        <input
          type="file"
          id="excelFile"
          accept=".xlsx,.xls"
          style="display:none"
        >


        <button
          class="primary"
          id="chooseExcelBtn"
        >
          📄 Выбрать Excel
        </button>


        <div
          id="excelFileName"
          class="muted"
          style="margin-top:10px"
        >
          Файл не выбран
        </div>

      </div>


      <div
        id="excelInfo"
        style="margin-top:15px"
      ></div>


      <div
        id="excelPreview"
        style="margin-top:15px"
      ></div>


      <div
        id="importProgress"
        class="muted"
        style="margin-top:12px"
      ></div>


      <div
        id="importActions"
        style="
          display:none;
          gap:8px;
          margin-top:15px;
          flex-wrap:wrap
        "
      >

        <button
          class="primary"
          id="startExcelImport"
        >
          🚀 Импортировать в Supabase
        </button>


        <button
          class="ghost"
          id="cancelExcelImport"
        >
          Отмена
        </button>

      </div>

    </div>


    <div
      class="panel"
      style="margin-top:14px"
    >

      <h3>
        Правила импорта
      </h3>


      <div
        class="muted"
        style="
          line-height:1.8;
          font-size:12px
        "
      >

        <div>
          ✓ 1 строка Excel = 1 физическая коробка
        </div>


        <div>
          ✓ Одинаковые штрихкоды не объединяются
        </div>


        <div>
          ✓ Штрихкод автоматически очищается от .0 и ,0
        </div>


        <div>
          ✓ Пустое «Кол-во в коробке» допускается
        </div>


        <div>
          ✓ Данные загружаются напрямую в Supabase
        </div>


        <div>
          ⚠️ Существующие записи не удаляются
        </div>

      </div>

    </div>

  `;

}


// =====================================================
// SETUP EXCEL IMPORT
// =====================================================

function setupExcelImport(){

  const fileInput =
    $('#excelFile');


  const chooseButton =
    $('#chooseExcelBtn');


  if (
    !fileInput ||
    !chooseButton
  ) {

    return;

  }


  chooseButton.onclick =
    () =>
      fileInput.click();


  fileInput.onchange =
    async event => {

      const file =
        event.target.files?.[0];


      if (!file) {
        return;
      }


      $('#excelFileName')
        .textContent =
          file.name;


      $('#excelInfo')
        .innerHTML =
          '<div class="muted">Читаем Excel…</div>';


      $('#excelPreview')
        .innerHTML = '';


      $('#importActions')
        .style.display =
          'none';


      pendingExcelImport =
        null;


      try {

        if (
          typeof XLSX ===
          'undefined'
        ) {

          throw new Error(
            'Библиотека XLSX не загружена. Проверь index.html.'
          );

        }


        const workbook =
          await readExcel(
            file
          );


        const converted =
          convertExcelData(
            workbook.data
          );


        pendingExcelImport =
          converted.rows;


        $('#excelInfo')
          .innerHTML = `

            <div
              style="
                display:grid;
                grid-template-columns:
                repeat(auto-fit,minmax(150px,1fr));
                gap:8px
              "
            >

              <div class="card">

                <div class="label">
                  Лист
                </div>

                <div class="value">
                  ${esc(
                    workbook.sheetName
                  )}
                </div>

              </div>


              <div class="card">

                <div class="label">
                  Коробок
                </div>

                <div class="value">
                  ${converted.rows.length.toLocaleString('ru-RU')}
                </div>

              </div>


              <div class="card">

                <div class="label">
                  Ошибки
                </div>

                <div class="value">
                  ${converted.errors}
                </div>

              </div>

            </div>

          `;


        $('#excelPreview')
          .innerHTML =
            excelPreview(
              converted.rows
            );


        if (
          converted.rows.length
        ) {

          $('#importActions')
            .style.display =
              'flex';

        }

      } catch(error) {

        console.error(
          error
        );


        $('#excelInfo')
          .innerHTML = `

            <div
              class="notice"
              style="border-left:4px solid #c00"
            >

              ❌
              ${esc(
                error.message ||
                error
              )}

            </div>

          `;

      }

    };


  const importButton =
    $('#startExcelImport');


  if (importButton) {

    importButton.onclick =
      async () => {

        if (
          !pendingExcelImport ||
          !pendingExcelImport.length
        ) {

          alert(
            'Сначала выберите Excel-файл.'
          );

          return;

        }


        const total =
          pendingExcelImport.length;


        const confirmed =
          confirm(

            `Импортировать ${
              total.toLocaleString('ru-RU')
            } коробок в Supabase?\n\n` +

            `Каждая строка Excel станет отдельной физической коробкой.\n\n` +

            `Существующие коробки удаляться не будут.`

          );


        if (!confirmed) {
          return;
        }


        const button =
          $('#startExcelImport');


        button.disabled =
          true;


        button.textContent =
          'Импортируем…';


        try {

          const imported =
            await importExcelRows(
              pendingExcelImport
            );


          $('#importProgress')
            .innerHTML = `

              <div
                class="notice"
                style="margin-top:10px"
              >

                ✅ Импорт завершён.

                Добавлено:

                <b>
                  ${imported.toLocaleString('ru-RU')}
                </b>

                коробок.

              </div>

            `;


          pendingExcelImport =
            null;


          $('#importActions')
            .style.display =
              'none';


          await loadDatabase();


          state.page =
            'base';


          render();


          alert(

            `Импорт завершён.\n\n` +

            `Добавлено коробок: ${
              imported.toLocaleString('ru-RU')
            }`

          );

        } catch(error) {

          console.error(
            error
          );


          $('#importProgress')
            .innerHTML = `

              <div
                class="notice"
                style="
                  margin-top:10px;
                  border-left:4px solid #c00
                "
              >

                ❌ Ошибка импорта:

                <br>

                ${esc(
                  error.message ||
                  error
                )}

              </div>

            `;


          button.disabled =
            false;


          button.textContent =
            '🚀 Импортировать в Supabase';

        }

      };

  }


  const cancelButton =
    $('#cancelExcelImport');


  if (cancelButton) {

    cancelButton.onclick =
      () => {

        pendingExcelImport =
          null;


        fileInput.value =
          '';


        $('#excelFileName')
          .textContent =
            'Файл не выбран';


        $('#excelInfo')
          .innerHTML = '';


        $('#excelPreview')
          .innerHTML = '';


        $('#importProgress')
          .innerHTML = '';


        $('#importActions')
          .style.display =
            'none';

      };

  }

}


// =====================================================
// TOOLS
// =====================================================

function tools(){

  return `

    ${excelImportView()}


    <div
      class="grid2"
      style="margin-top:14px"
    >

      <div class="panel">

        <h3>
          Экспорт
        </h3>


        <p class="muted">

          Скачать текущие данные
          SKLADAPLAN в JSON.

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

          Создаёт локальный JSON-архив.

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


// =====================================================
// VIEWS
// =====================================================

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


// =====================================================
// DOWNLOAD
// =====================================================

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
        {
          type
        }
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


// =====================================================
// BACKUP
// =====================================================

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


// =====================================================
// EXPORT
// =====================================================

function exportData(){

  download(

    `SKLADAPLAN_DATA_${
      new Date()
        .toISOString()
        .slice(0,10)
    }.json`,

    JSON.stringify(
      DATA,
      null,
      2
    )

  );

}


// =====================================================
// RENDER
// =====================================================

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


  if (
    state.page === 'tools'
  ) {

    setupExcelImport();

  }


  updateAssemblyBadge();

}


// =====================================================
// ГЛОБАЛЬНЫЕ КНОПКИ И НАВИГАЦИЯ
// =====================================================

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


// =====================================================
// START APP
// =====================================================

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
