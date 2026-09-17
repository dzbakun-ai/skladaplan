/* ============================================================
   SKLADAPLAN — PLANNER
   Планировщик отгрузок и задач
   ============================================================ */


/* ============================================================
   STATE
   ============================================================ */

const plannerState = {
  eventsBound: false,
  currentDate: new Date(),
  selectedDate: new Date(),

  view: 'month',

  shipments: [],
  tasks: [],

  editingShipmentId: null,
  editingTaskId: null,

  initialized: false,

  // Данные теперь хранятся в Supabase (таблицы
  // planner_shipments / planner_tasks — см.
  // supabase_migration_planner.sql), а не в
  // localStorage — чтобы планировщик был общим
  // для всех, кто заходит в SKLADAPLAN, а не только
  // для одного браузера/устройства.
  loading: false,
  loaded: false,
  loadError: null
};


/* ============================================================
   HELPERS
   ============================================================ */

function plannerPad(value) {
  return String(value).padStart(2, '0');
}


function plannerDateKey(date) {
  const d = new Date(date);

  return (
    d.getFullYear() +
    '-' +
    plannerPad(d.getMonth() + 1) +
    '-' +
    plannerPad(d.getDate())
  );
}


function plannerTodayKey() {
  return plannerDateKey(new Date());
}


function plannerParseDate(value) {
  if (!value) {
    return new Date();
  }

  const parts = value.split('-');

  if (parts.length !== 3) {
    return new Date();
  }

  return new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );
}


function plannerFormatDate(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
}


function plannerFormatShortDate(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}


function plannerMonthName(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}


function plannerSameDate(a, b) {
  return plannerDateKey(a) === plannerDateKey(b);
}


function plannerSameId(a, b) {
  return String(a) === String(b);
}


function plannerEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


/* ============================================================
   SUPABASE

   Данные планировщика хранятся в Supabase (таблицы
   planner_shipments / planner_tasks), а не в localStorage —
   чтобы они были одинаковыми у всех, кто заходит в
   SKLADAPLAN, а не только в одном браузере на одном
   устройстве. SQL для создания таблиц — в файле
   supabase_migration_planner.sql, его нужно один раз
   выполнить в Supabase (SQL Editor) перед тем как
   пользоваться планировщиком.

   planner.js подключается ПОСЛЕ app.js (см. index.html) и
   использует уже созданный там supabaseClient — отдельного
   клиента здесь не создаём.
   ============================================================ */

/*
  Приводим строку из Supabase (snake_case, "date" — тип date)
  к тому же плоскому виду, в котором эти объекты всегда жили
  в plannerState (те же имена полей, что и раньше, дата —
  строка "YYYY-MM-DD", как отдаёт plannerDateKey).
*/
function plannerMapShipmentRow(row) {

  return {
    id: row.id,
    date: row.date,
    time: row.time || '',
    title: row.title || '',
    direction: row.direction || '',
    warehouse: row.warehouse || '',
    status: row.status || 'Запланирована',
    responsible: row.responsible || '',
    comment: row.comment || ''
  };

}


function plannerMapTaskRow(row) {

  return {
    id: row.id,
    date: row.date,
    time: row.time || '',
    title: row.title || '',
    priority: row.priority || 'Обычный',
    status: row.status || 'К выполнению',
    comment: row.comment || '',

    /*
      favorite — колонка добавляется миграцией
      supabase_migration_planner_favorite.sql. Если миграция
      ещё не выполнена, поле придёт undefined — считаем
      его false, интерфейс от этого не ломается.
    */
    favorite: row.favorite === true
  };

}


/* ------------------------------------------------------------
   СТАТУСЫ ЗАДАЧ

   Единая точка, где решается «задача закрыта или нет».
   Используется и Планировщиком, и виджетом на Главной,
   чтобы они не разошлись.
   ------------------------------------------------------------ */

const PLANNER_TASK_STATUS_OPEN = 'К выполнению';
const PLANNER_TASK_STATUS_DONE = 'Выполнено';


function plannerTaskIsClosed(task) {

  return (
    task.status === PLANNER_TASK_STATUS_DONE ||
    task.status === 'Отменено'
  );

}


function plannerTaskIsOverdue(task) {

  if (
    !task.date ||
    plannerTaskIsClosed(task)
  ) {
    return false;
  }

  return task.date < plannerTodayKey();

}


async function plannerLoadFromSupabase(
  rerender = true
) {

  /*
    rerender=false нужен при старте приложения
    (startAuthenticatedApp в app.js): там render()
    вызывается один раз сам, после загрузки всех
    данных, и повторный render() отсюда не нужен.
  */

  if (plannerState.loading) {
    return;
  }

  plannerState.loading = true;
  plannerState.loadError = null;

  try {

    const [
      shipmentsResult,
      tasksResult
    ] = await Promise.all([

      supabaseClient
        .from('planner_shipments')
        .select('*')
        .order('date', { ascending: true }),

      supabaseClient
        .from('planner_tasks')
        .select('*')
        .order('date', { ascending: true })

    ]);

    if (shipmentsResult.error) {
      throw shipmentsResult.error;
    }

    if (tasksResult.error) {
      throw tasksResult.error;
    }

    plannerState.shipments =
      (shipmentsResult.data || [])
        .map(plannerMapShipmentRow);

    plannerState.tasks =
      (tasksResult.data || [])
        .map(plannerMapTaskRow);

    plannerState.loaded = true;

  } catch (error) {

    console.error(
      'Planner load error:',
      error
    );

    plannerState.loadError =
      error?.message ||
      'Не удалось загрузить планировщик';

    if (
      typeof toast === 'function'
    ) {

      toast(
        'Не удалось загрузить планировщик. Проверьте, что выполнена supabase_migration_planner.sql',
        'error'
      );

    }

  } finally {

    plannerState.loading = false;

  }

  plannerState.initialized = true;

  if (
    rerender &&
    typeof render === 'function'
  ) {
    render();
  }

}


/* ============================================================
   CALENDAR
   ============================================================ */

function plannerGetMonthDays() {

  const year =
    plannerState.currentDate.getFullYear();

  const month =
    plannerState.currentDate.getMonth();

  const firstDay =
    new Date(
      year,
      month,
      1
    );

  const lastDay =
    new Date(
      year,
      month + 1,
      0
    );

  let startDay =
    firstDay.getDay();

  /*
    JS:
    Sunday = 0

    Для русского календаря:
    Пн = 0
  */

  startDay =
    startDay === 0
      ? 6
      : startDay - 1;

  const daysInMonth =
    lastDay.getDate();

  const cells = [];

  const previousMonthLastDay =
    new Date(
      year,
      month,
      0
    ).getDate();

  for (
    let i = startDay - 1;
    i >= 0;
    i--
  ) {

    cells.push({
      date: new Date(
        year,
        month - 1,
        previousMonthLastDay - i
      ),
      currentMonth: false
    });
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {

    cells.push({
      date: new Date(
        year,
        month,
        day
      ),
      currentMonth: true
    });
  }

  let nextDay = 1;

  while (cells.length < 42) {

    cells.push({
      date: new Date(
        year,
        month + 1,
        nextDay
      ),
      currentMonth: false
    });

    nextDay++;
  }

  return cells;
}


function plannerEventsForDate(date) {

  const key =
    plannerDateKey(date);

  const shipments =
    plannerState.shipments
      .filter(
        shipment =>
          shipment.date === key
      );

  const tasks =
    plannerState.tasks
      .filter(
        task =>
          task.date === key
      );

  return {
    shipments,
    tasks
  };
}


function plannerCalendarView() {

  const days =
    plannerGetMonthDays();

  const weekdays = [
    'Пн',
    'Вт',
    'Ср',
    'Чт',
    'Пт',
    'Сб',
    'Вс'
  ];

  let html = `
    <div class="planner-calendar">

      <div class="planner-weekdays">
  `;

  weekdays.forEach(day => {

    html += `
      <div class="planner-weekday">
        ${day}
      </div>
    `;
  });

  html += `
      </div>

      <div class="planner-days">
  `;

  days.forEach(item => {

    const date =
      item.date;

    const key =
      plannerDateKey(date);

    const events =
      plannerEventsForDate(date);

    const isToday =
      key === plannerTodayKey();

    const isSelected =
      plannerSameDate(
        date,
        plannerState.selectedDate
      );

    html += `
      <button
        type="button"
        class="
          planner-day
          ${item.currentMonth ? '' : 'planner-day-muted'}
          ${isToday ? 'planner-day-today' : ''}
          ${isSelected ? 'planner-day-selected' : ''}
        "
        data-planner-date="${key}"
      >

        <span class="planner-day-number">
          ${date.getDate()}
        </span>

        <span class="planner-day-events">
    `;

    /*
      Один маркер на вид события, а не по маркеру
      на каждую запись: иконка + число. Сколько бы
      задач ни было на дне, чип остаётся один,
      меняется только цифра.
    */

    const externalCount =
      plannerExternalTasksForKey(key).length;

    const tasksCount =
      events.tasks.length + externalCount;

    if (events.shipments.length) {

      html += `
        <span
          class="planner-event-dot shipment"
          title="Отгрузок: ${events.shipments.length}"
        >
          <svg class="icon"><use href="#icon-truck"></use></svg>
          ${events.shipments.length}
        </span>
      `;
    }

    if (tasksCount) {

      html += `
        <span
          class="planner-event-dot task"
          title="Задач: ${tasksCount}"
        >
          <svg class="icon"><use href="#icon-list"></use></svg>
          ${tasksCount}
        </span>
      `;
    }

    html += `
        </span>

      </button>
    `;
  });

  html += `
      </div>

    </div>
  `;

  return html;
}


/* ============================================================
   SELECTED DAY
   ============================================================ */

function plannerSelectedDayView() {

  const date =
    plannerState.selectedDate;

  const key =
    plannerDateKey(date);

  const events =
    plannerEventsForDate(date);

  let html = `
    <section class="planner-day-panel">

      <div class="planner-section-header">

        <div>
          <div class="planner-section-kicker">
            Выбранная дата
          </div>

          <h2>
            ${plannerEscape(
              plannerFormatDate(date)
            )}
          </h2>
        </div>

        <div class="planner-actions">
          <button
            type="button"
            class="planner-button planner-button-primary"
            id="plannerAddShipment"
          >
            + Отгрузка
          </button>

          <button
            type="button"
            class="planner-button"
            id="plannerAddTask"
          >
            + Задача
          </button>
        </div>

      </div>
  `;

  const externalTasks =
    plannerExternalTasksForKey(key);

  if (
    !events.shipments.length &&
    !events.tasks.length &&
    !externalTasks.length
  ) {

    html += `
      <div class="planner-empty">
        На эту дату ничего не запланировано.
      </div>
    `;

  } else {

    if (events.shipments.length) {

      html += `
        <div class="planner-list-section">

          <div class="planner-list-title">
            Отгрузки
          </div>

          <div class="planner-list">
      `;

      events.shipments.forEach(
        shipment => {

          html += `
            ${plannerShipmentCard(
              shipment
            )}
          `;
        }
      );

      html += `
          </div>

        </div>
      `;
    }


    if (events.tasks.length) {

      html += `
        <div class="planner-list-section">

          <div class="planner-list-title">
            Задачи
          </div>

          <div class="planner-list">
      `;

      events.tasks.forEach(
        task => {

          html += `
            ${plannerTaskCard(
              task
            )}
          `;
        }
      );

      html += `
          </div>

        </div>
      `;
    }


    /*
      Задачи из раздела «Задачи» (public.tasks).
      Показываем, но не редактируем здесь — кнопка
      открывает раздел «Задачи».
    */

    if (externalTasks.length) {

      html += `
        <div class="planner-list-section">

          <div class="planner-list-title">
            Задачи из раздела «Задачи»

            <button
              type="button"
              class="planner-button planner-button-small"
              data-page="tasks"
            >
              Открыть раздел
            </button>
          </div>

          <div class="planner-list">
      `;

      externalTasks.forEach(
        task => {

          html += plannerExternalTaskCard(task);

        }
      );

      html += `
          </div>

        </div>
      `;
    }
  }

  html += `
    </section>
  `;

  return html;
}


/* ============================================================
   SHIPMENT CARD
   ============================================================ */

function plannerShipmentCard(
  shipment
) {

  return `
    <article
      class="planner-card"
      data-shipment-id="${plannerEscape(
        shipment.id
      )}"
    >

      <div class="planner-card-main">

        <div class="planner-card-time">
          ${plannerEscape(
            shipment.time || '--:--'
          )}
        </div>

        <div class="planner-card-content">

          <div class="planner-card-title">
            ${plannerEscape(
              shipment.title ||
              'Отгрузка'
            )}
          </div>

          <div class="planner-card-meta">

            ${
              shipment.direction
                ? `
                  <span>
                    ${plannerEscape(
                      shipment.direction
                    )}
                  </span>
                `
                : ''
            }

            ${
              shipment.warehouse
                ? `
                  <span>
                    ${plannerEscape(
                      shipment.warehouse
                    )}
                  </span>
                `
                : ''
            }

          </div>

        </div>

      </div>

      <div class="planner-card-side">

        <span class="planner-status">
          ${plannerEscape(
            shipment.status ||
            'Запланирована'
          )}
        </span>

        <div class="planner-card-buttons">

          <button
            type="button"
            class="planner-icon-button"
            data-edit-shipment="${plannerEscape(
              shipment.id
            )}"
            title="Изменить"
          >
            <svg class="icon"><use href="#icon-edit"></use></svg>
          </button>

          <button
            type="button"
            class="planner-icon-button planner-danger"
            data-delete-shipment="${plannerEscape(
              shipment.id
            )}"
            title="Удалить"
          >
            <svg class="icon"><use href="#icon-trash"></use></svg>
          </button>

        </div>

      </div>

    </article>
  `;
}


/* ============================================================
   TASK CARD
   ============================================================ */

function plannerTaskCard(
  task
) {

  return `
    <article
      class="planner-card"
      data-task-id="${plannerEscape(
        task.id
      )}"
    >

      <div class="planner-card-main">

        <div class="planner-card-time">
          ${plannerEscape(
            task.time || '--:--'
          )}
        </div>

        <div class="planner-card-content">

          <div class="planner-card-title">
            ${plannerEscape(
              task.title ||
              'Задача'
            )}
          </div>

          <div class="planner-card-meta">

            ${
              task.priority
                ? `
                  <span>
                    Приоритет:
                    ${plannerEscape(
                      task.priority
                    )}
                  </span>
                `
                : ''
            }

          </div>

        </div>

      </div>

      <div class="planner-card-side">

        <span class="planner-status">
          ${plannerEscape(
            task.status ||
            PLANNER_TASK_STATUS_OPEN
          )}
        </span>

        ${
          plannerTaskIsOverdue(task)
            ? '<span class="planner-overdue">Просрочено</span>'
            : ''
        }

        <div class="planner-card-buttons">

          <button
            type="button"
            class="planner-icon-button ${
              task.favorite
                ? 'is-active'
                : ''
            }"
            data-favorite-task="${plannerEscape(
              task.id
            )}"
            title="Избранное"
          >
            <svg class="icon"><use href="#icon-${
              task.favorite
                ? 'star-filled'
                : 'star'
            }"></use></svg>
          </button>

          <button
            type="button"
            class="planner-icon-button"
            data-edit-task="${plannerEscape(
              task.id
            )}"
            title="Изменить"
          >
            <svg class="icon"><use href="#icon-edit"></use></svg>
          </button>

          <button
            type="button"
            class="planner-icon-button planner-danger"
            data-delete-task="${plannerEscape(
              task.id
            )}"
            title="Удалить"
          >
            <svg class="icon"><use href="#icon-trash"></use></svg>
          </button>

        </div>

      </div>

    </article>
  `;
}


/* ============================================================
   STATISTICS
   ============================================================ */

function plannerStatsView() {

  const today =
    plannerTodayKey();

  const todayShipments =
    plannerState.shipments.filter(
      item =>
        item.date === today
    ).length;

  const todayTasks =
    plannerState.tasks.filter(
      item =>
        item.date === today
    ).length;

  const plannedShipments =
    plannerState.shipments.filter(
      item =>
        item.status !== 'Отменена' &&
        item.status !== 'Отгружена'
    ).length;

  return `
    <div class="planner-stats">

      <div class="planner-stat">

        <span class="planner-stat-label">
          Сегодня отгрузок
        </span>

        <strong>
          ${todayShipments}
        </strong>

      </div>

      <div class="planner-stat">

        <span class="planner-stat-label">
          Сегодня задач
        </span>

        <strong>
          ${todayTasks}
        </strong>

      </div>

      <div class="planner-stat">

        <span class="planner-stat-label">
          Запланировано
        </span>

        <strong>
          ${plannedShipments}
        </strong>

      </div>

    </div>
  `;
}


/* ============================================================
   MAIN VIEW
   ============================================================ */

function plannerView() {

  if (
    !plannerState.initialized
  ) {

    plannerState.initialized = true;

    // Асинхронно, не блокируем первый рендер —
    // plannerLoadFromSupabase() сам вызовет render()
    // повторно, когда данные придут.
    plannerLoadFromSupabase();

  }

  if (
    plannerState.loading &&
    !plannerState.loaded
  ) {

    return `
      <div class="planner">
        <div class="planner-empty">
          Загрузка планировщика...
        </div>
      </div>
    `;

  }

  if (
    plannerState.loadError &&
    !plannerState.loaded
  ) {

    return `
      <div class="planner">
        <div class="planner-empty">
          Не удалось загрузить планировщик.<br>
          ${plannerEscape(plannerState.loadError)}
          <br><br>
          <button
            type="button"
            class="planner-button"
            id="plannerRetryLoad"
          >
            Повторить
          </button>
        </div>
      </div>
    `;

  }

  return `
    <div class="planner">

      <!--
        Заголовок страницы не дублируется здесь:
        его показывает topbar (PAGE_META.planner).
        В самой странице оставлена только панель
        управления календарём.
      -->

      <header class="planner-header planner-header-compact">

        <button
          type="button"
          class="planner-button"
          id="plannerTodayButton"
        >
          Сегодня
        </button>

      </header>


      ${plannerStatsView()}


      <section class="planner-calendar-section">

        <div class="planner-calendar-header">

          <button
            type="button"
            class="planner-month-button"
            id="plannerPrevMonth"
          >
            ‹
          </button>

          <h2>
            ${plannerEscape(
              plannerMonthName(
                plannerState.currentDate
              )
            )}
          </h2>

          <button
            type="button"
            class="planner-month-button"
            id="plannerNextMonth"
          >
            ›
          </button>

        </div>

        ${plannerCalendarView()}

      </section>


      ${plannerSelectedDayView()}

    </div>
  `;
}


/* ============================================================
   SETUP
   ============================================================ */

function setupPlanner() {
  if (plannerState.eventsBound) {
    return;
  }

  plannerState.eventsBound = true;

  document.addEventListener('click', event => {
    const button = event.target.closest(
      '#plannerRetryLoad, #plannerTodayButton, #plannerPrevMonth, #plannerNextMonth, [data-planner-date], #plannerAddShipment, #plannerAddTask, [data-edit-shipment], [data-delete-shipment], [data-favorite-task], [data-edit-task], [data-delete-task]'
    );

    if (!button) return;

    if (button.id === 'plannerRetryLoad') {
      plannerState.initialized = false;
      plannerState.loadError = null;
      render();
      return;
    }

    if (button.id === 'plannerTodayButton') {
      const today = new Date();
      plannerState.currentDate = new Date(today);
      plannerState.selectedDate = new Date(today);
      render();
      return;
    }

    if (button.id === 'plannerPrevMonth') {
      plannerState.currentDate = new Date(
        plannerState.currentDate.getFullYear(),
        plannerState.currentDate.getMonth() - 1,
        1
      );
      render();
      return;
    }

    if (button.id === 'plannerNextMonth') {
      plannerState.currentDate = new Date(
        plannerState.currentDate.getFullYear(),
        plannerState.currentDate.getMonth() + 1,
        1
      );
      render();
      return;
    }

    if (button.matches('[data-planner-date]')) {
      const value = button.dataset.plannerDate;
      if (!value) return;
      const date = plannerParseDate(value);
      if (Number.isNaN(date.getTime())) return;
      plannerState.selectedDate = date;
      if (
        date.getMonth() !== plannerState.currentDate.getMonth() ||
        date.getFullYear() !== plannerState.currentDate.getFullYear()
      ) {
        plannerState.currentDate = new Date(date);
      }
      render();
      return;
    }

    if (button.id === 'plannerAddShipment') {
      plannerOpenShipmentModal();
      return;
    }

    if (button.id === 'plannerAddTask') {
      plannerOpenTaskModal();
      return;
    }

    if (button.matches('[data-edit-shipment]')) {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.editShipment;
      if (!id) return;
      plannerOpenShipmentModal(id);
      return;
    }

    if (button.matches('[data-delete-shipment]')) {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.deleteShipment;
      if (!id) return;
      plannerDeleteShipment(id);
      return;
    }

    if (button.matches('[data-favorite-task]')) {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.favoriteTask;
      if (!id) return;
      plannerToggleTaskFavorite(id);
      return;
    }

    if (button.matches('[data-edit-task]')) {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.editTask;
      if (!id) return;
      plannerOpenTaskModal(id);
      return;
    }

    if (button.matches('[data-delete-task]')) {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.deleteTask;
      if (!id) return;
      plannerDeleteTask(id);
    }
  });
}

/* ============================================================
   SHIPMENT MODAL
   ============================================================ */

function plannerOpenShipmentModal(
  id = null
) {

  plannerState.editingShipmentId =
    id;

  const shipment =
    id
      ? plannerState.shipments.find(
          item =>
            plannerSameId(item.id, id)
        )
      : null;

  if (id && !shipment) {
    console.error('Planner: отгрузка для редактирования не найдена:', id);
    if (typeof toast === 'function') toast('Отгрузка не найдена', 'error');
    plannerState.editingShipmentId = null;
    return;
  }

  const defaultDate =
    shipment?.date ||
    plannerDateKey(
      plannerState.selectedDate
    );

  const title =
    shipment?.title ||
    '';

  const time =
    shipment?.time ||
    '12:00';

  const direction =
    shipment?.direction ||
    '';

  const warehouse =
    shipment?.warehouse ||
    '';

  const status =
    shipment?.status ||
    'Запланирована';

  const responsible =
    shipment?.responsible ||
    '';

  const comment =
    shipment?.comment ||
    '';


  plannerShowModal(`
    <div class="planner-modal">

      <div class="planner-modal-header">

        <div>
          <div class="planner-section-kicker">
            Планировщик
          </div>

          <h2>
            ${id
              ? 'Изменить отгрузку'
              : 'Новая отгрузка'}
          </h2>
        </div>

        <button
          type="button"
          class="planner-modal-close"
          data-planner-close
        >
          ×
        </button>

      </div>


      <form
        id="plannerShipmentForm"
        class="planner-form"
      >

        <label>
          <span>Название</span>

          <input
            name="title"
            value="${plannerEscape(title)}"
            placeholder="Например: Отгрузка заказа"
            required
          >
        </label>


        <div class="planner-form-grid">

          <label>
            <span>Дата</span>

            <input
              type="date"
              name="date"
              value="${plannerEscape(defaultDate)}"
              required
            >
          </label>

          <label>
            <span>Время</span>

            <input
              type="time"
              name="time"
              value="${plannerEscape(time)}"
            >
          </label>

        </div>


        <label>
          <span>Направление</span>

          <input
            name="direction"
            value="${plannerEscape(direction)}"
            placeholder="Направление"
          >
        </label>


        <label>
          <span>Склад</span>

          <input
            name="warehouse"
            value="${plannerEscape(warehouse)}"
            placeholder="Склад"
          >
        </label>


        <label>
          <span>Статус</span>

          <select name="status">

            ${[
              'Запланирована',
              'Подготовка',
              'Готова к отгрузке',
              'Отгружена',
              'Отменена'
            ]
              .map(
                value =>
                  `
                    <option
                      value="${value}"
                      ${
                        value === status
                          ? 'selected'
                          : ''
                      }
                    >
                      ${value}
                    </option>
                  `
              )
              .join('')}

          </select>

        </label>


        <label>
          <span>Ответственный</span>

          <input
            name="responsible"
            value="${plannerEscape(responsible)}"
            placeholder="Ответственный"
          >
        </label>


        <label>
          <span>Комментарий</span>

          <textarea
            name="comment"
            rows="4"
            placeholder="Дополнительная информация"
          >${plannerEscape(comment)}</textarea>
        </label>


        <div class="planner-form-actions">

          <button
            type="button"
            class="planner-button"
            data-planner-close
          >
            Отмена
          </button>

          <button
            type="submit"
            class="planner-button planner-button-primary"
          >
            Сохранить
          </button>

        </div>

      </form>

    </div>
  `);


  document
    .getElementById(
      'plannerShipmentForm'
    )
    ?.addEventListener(
      'submit',
      event => {

        event.preventDefault();

        const form =
          event.currentTarget;

        const data =
          new FormData(form);

        plannerSaveShipment({
          title:
            data.get('title'),

          date:
            data.get('date'),

          time:
            data.get('time'),

          direction:
            data.get('direction'),

          warehouse:
            data.get('warehouse'),

          status:
            data.get('status'),

          responsible:
            data.get('responsible'),

          comment:
            data.get('comment')
        });
      }
    );
}


/* ============================================================
   SAVE SHIPMENT
   ============================================================ */

async function plannerSaveShipment(
  data
) {

  if (
    !data.title ||
    !data.date
  ) {
    return;
  }

  const operatorEmail =
    (
      typeof state !== 'undefined' &&
      state.user?.email
    ) || null;

  const payload = {
    date: data.date,
    time: data.time || null,
    title: data.title,
    direction: data.direction || null,
    warehouse: data.warehouse || null,
    status: data.status || 'Запланирована',
    responsible: data.responsible || null,
    comment: data.comment || null,
    updated_by: operatorEmail
  };


  if (
    plannerState.editingShipmentId
  ) {

    const {
      data: row,
      error
    } =
      await supabaseClient
        .from('planner_shipments')
        .update(payload)
        .eq(
          'id',
          plannerState.editingShipmentId
        )
        .select('*')
        .single();

    if (error) {

      console.error(
        'Planner save shipment error:',
        error
      );

      if (typeof toast === 'function') {

        toast(
          error.message ||
          'Не удалось сохранить отгрузку',
          'error'
        );

      }

      return;

    }

    const index =
      plannerState.shipments.findIndex(
        item =>
          item.id ===
          plannerState.editingShipmentId
      );

    const mapped =
      plannerMapShipmentRow(row);

    if (index !== -1) {
      plannerState.shipments[index] = mapped;
    } else {
      plannerState.shipments.push(mapped);
    }

  } else {

    const {
      data: row,
      error
    } =
      await supabaseClient
        .from('planner_shipments')
        .insert({
          ...payload,
          created_by: operatorEmail
        })
        .select('*')
        .single();

    if (error) {

      console.error(
        'Planner create shipment error:',
        error
      );

      if (typeof toast === 'function') {

        toast(
          error.message ||
          'Не удалось создать отгрузку (проверьте, что выполнена supabase_migration_planner.sql)',
          'error'
        );

      }

      return;

    }

    plannerState.shipments.push(
      plannerMapShipmentRow(row)
    );

  }


  plannerState.selectedDate =
    plannerParseDate(
      data.date
    );

  plannerState.currentDate =
    plannerParseDate(
      data.date
    );

  plannerState.editingShipmentId =
    null;

  plannerCloseModal();

  render();
}


/* ============================================================
   DELETE SHIPMENT
   ============================================================ */

async function plannerDeleteShipment(
  id
) {

  const shipment =
    plannerState.shipments.find(
      item =>
        plannerSameId(item.id, id)
    );

  if (!shipment) {
    return;
  }


  const confirmed =
    confirm(
      `Удалить отгрузку «${
        shipment.title ||
        'без названия'
      }»?`
    );

  if (!confirmed) {
    return;
  }


  const {
    error
  } =
    await supabaseClient
      .from('planner_shipments')
      .delete()
      .eq('id', id);

  if (error) {

    console.error(
      'Planner delete shipment error:',
      error
    );

    if (typeof toast === 'function') {

      toast(
        error.message ||
        'Не удалось удалить отгрузку',
        'error'
      );

    }

    return;

  }


  plannerState.shipments =
    plannerState.shipments.filter(
      item =>
        !plannerSameId(item.id, id)
    );

  render();
}


/* ============================================================
   TASK MODAL
   ============================================================ */

function plannerOpenTaskModal(
  id = null
) {

  plannerState.editingTaskId =
    id;

  const task =
    id
      ? plannerState.tasks.find(
          item =>
            plannerSameId(item.id, id)
        )
      : null;

  if (id && !task) {
    console.error('Planner: задача для редактирования не найдена:', id);
    if (typeof toast === 'function') toast('Задача не найдена', 'error');
    plannerState.editingTaskId = null;
    return;
  }

  const defaultDate =
    task?.date ||
    plannerDateKey(
      plannerState.selectedDate
    );

  const title =
    task?.title ||
    '';

  const time =
    task?.time ||
    '12:00';

  const priority =
    task?.priority ||
    'Обычный';

  const status =
    task?.status ||
    'К выполнению';

  const comment =
    task?.comment ||
    '';

  const favorite =
    task?.favorite === true;


  plannerShowModal(`
    <div class="planner-modal">

      <div class="planner-modal-header">

        <div>
          <div class="planner-section-kicker">
            Планировщик
          </div>

          <h2>
            ${id
              ? 'Изменить задачу'
              : 'Новая задача'}
          </h2>
        </div>

        <button
          type="button"
          class="planner-modal-close"
          data-planner-close
        >
          ×
        </button>

      </div>


      <form
        id="plannerTaskForm"
        class="planner-form"
      >

        <label>
          <span>Задача</span>

          <input
            name="title"
            value="${plannerEscape(title)}"
            placeholder="Что нужно сделать?"
            required
          >
        </label>


        <div class="planner-form-grid">

          <label>
            <span>Дата</span>

            <input
              type="date"
              name="date"
              value="${plannerEscape(defaultDate)}"
              required
            >
          </label>

          <label>
            <span>Время</span>

            <input
              type="time"
              name="time"
              value="${plannerEscape(time)}"
            >
          </label>

        </div>


        <label>
          <span>Приоритет</span>

          <select name="priority">

            ${[
              'Низкий',
              'Обычный',
              'Высокий'
            ]
              .map(
                value =>
                  `
                    <option
                      value="${value}"
                      ${
                        value === priority
                          ? 'selected'
                          : ''
                      }
                    >
                      ${value}
                    </option>
                  `
              )
              .join('')}

          </select>

        </label>


        <label>
          <span>Статус</span>

          <select name="status">

            ${[
              'К выполнению',
              'В работе',
              'Выполнено',
              'Отменено'
            ]
              .map(
                value =>
                  `
                    <option
                      value="${value}"
                      ${
                        value === status
                          ? 'selected'
                          : ''
                      }
                    >
                      ${value}
                    </option>
                  `
              )
              .join('')}

          </select>

        </label>


        <label>
          <span>Комментарий</span>

          <textarea
            name="comment"
            rows="4"
            placeholder="Дополнительная информация"
          >${plannerEscape(comment)}</textarea>
        </label>


        <div class="planner-form-actions">

          <button
            type="button"
            class="planner-button"
            data-planner-close
          >
            Отмена
          </button>

          <button
            type="submit"
            class="planner-button planner-button-primary"
          >
            Сохранить
          </button>

        </div>

      </form>

    </div>
  `);


  document
    .getElementById(
      'plannerTaskForm'
    )
    ?.addEventListener(
      'submit',
      event => {

        event.preventDefault();

        const form =
          event.currentTarget;

        const data =
          new FormData(form);

        plannerSaveTask({
          title:
            data.get('title'),

          date:
            data.get('date'),

          time:
            data.get('time'),

          priority:
            data.get('priority'),

          status:
            data.get('status'),

          comment:
            data.get('comment'),

          favorite:
            data.get('favorite') === 'on'
        });
      }
    );
}


/* ============================================================
   SAVE TASK
   ============================================================ */

async function plannerSaveTask(
  data
) {

  if (
    !data.title ||
    !data.date
  ) {
    return;
  }

  const operatorEmail =
    (
      typeof state !== 'undefined' &&
      state.user?.email
    ) || null;

  const payload = {
    date: data.date,
    time: data.time || null,
    title: data.title,
    priority: data.priority || 'Обычный',
    status: data.status || PLANNER_TASK_STATUS_OPEN,
    comment: data.comment || null,
    favorite: data.favorite === true,
    updated_by: operatorEmail
  };


  if (
    plannerState.editingTaskId
  ) {

    const {
      data: row,
      error
    } =
      await supabaseClient
        .from('planner_tasks')
        .update(payload)
        .eq(
          'id',
          plannerState.editingTaskId
        )
        .select('*')
        .single();

    if (error) {

      console.error(
        'Planner save task error:',
        error
      );

      if (typeof toast === 'function') {

        toast(
          error.message ||
          'Не удалось сохранить задачу',
          'error'
        );

      }

      return;

    }

    const index =
      plannerState.tasks.findIndex(
        item =>
          item.id ===
          plannerState.editingTaskId
      );

    const mapped =
      plannerMapTaskRow(row);

    if (index !== -1) {
      plannerState.tasks[index] = mapped;
    } else {
      plannerState.tasks.push(mapped);
    }

  } else {

    const {
      data: row,
      error
    } =
      await supabaseClient
        .from('planner_tasks')
        .insert({
          ...payload,
          created_by: operatorEmail
        })
        .select('*')
        .single();

    if (error) {

      console.error(
        'Planner create task error:',
        error
      );

      if (typeof toast === 'function') {

        toast(
          error.message ||
          'Не удалось создать задачу (проверьте, что выполнена supabase_migration_planner.sql)',
          'error'
        );

      }

      return;

    }

    plannerState.tasks.push(
      plannerMapTaskRow(row)
    );

  }


  plannerState.selectedDate =
    plannerParseDate(
      data.date
    );

  plannerState.currentDate =
    plannerParseDate(
      data.date
    );

  plannerState.editingTaskId =
    null;

  plannerCloseModal();

  render();
}


/* ============================================================
   DELETE TASK
   ============================================================ */

async function plannerDeleteTask(
  id
) {

  const task =
    plannerState.tasks.find(
      item =>
        plannerSameId(item.id, id)
    );

  if (!task) {
    return;
  }


  const confirmed =
    confirm(
      `Удалить задачу «${
        task.title ||
        'без названия'
      }»?`
    );

  if (!confirmed) {
    return;
  }


  const {
    error
  } =
    await supabaseClient
      .from('planner_tasks')
      .delete()
      .eq('id', id);

  if (error) {

    console.error(
      'Planner delete task error:',
      error
    );

    if (typeof toast === 'function') {

      toast(
        error.message ||
        'Не удалось удалить задачу',
        'error'
      );

    }

    return;

  }


  plannerState.tasks =
    plannerState.tasks.filter(
      item =>
        !plannerSameId(item.id, id)
    );

  render();
}


/* ============================================================
   MODAL
   ============================================================ */

function plannerShowModal(
  content
) {

  plannerCloseModal();


  const overlay =
    document.createElement(
      'div'
    );

  overlay.className =
    'planner-modal-overlay';

  overlay.id =
    'plannerModalOverlay';

  overlay.innerHTML =
    content;

  document
    .body
    .appendChild(
      overlay
    );


  overlay
    .querySelectorAll(
      '[data-planner-close]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          plannerCloseModal
        );
      }
    );


  overlay.addEventListener(
    'click',
    event => {

      if (
        event.target ===
        overlay
      ) {
        plannerCloseModal();
      }
    }
  );
}


function plannerCloseModal() {

  document
    .getElementById(
      'plannerModalOverlay'
    )
    ?.remove();

  plannerState.editingShipmentId =
    null;

  plannerState.editingTaskId =
    null;
}


/* ============================================================
   EXPORT / RESET
   ============================================================ */

function plannerExportData() {

  const data = {
    shipments:
      plannerState.shipments,

    tasks:
      plannerState.tasks,

    exportedAt:
      new Date().toISOString()
  };


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
          'application/json'
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      'a'
    );

  link.href = url;

  link.download =
    'skladaplan-planner.json';

  link.click();

  URL.revokeObjectURL(
    url
  );
}


/* ============================================================
   СВЯЗЬ С РАЗДЕЛОМ «ЗАДАЧИ» (tasks.js / public.tasks)

   Планировщик НЕ хранит чужие задачи и не копирует их.
   Он читает уже загруженный tasksState из tasks.js и
   показывает задачи с назначенной датой (due_date)
   рядом со своими задачами и отгрузками — в календаре
   и в панели выбранного дня. Редактируются они там же,
   где и создавались: кнопка ведёт в раздел «Задачи».
   ============================================================ */

function plannerExternalTasks() {

  const items =
    (
      typeof tasksState !== 'undefined' &&
      Array.isArray(tasksState.items)
    )
      ? tasksState.items
      : [];

  return items.filter(
    task =>
      Boolean(task.due_date)
  );

}


function plannerExternalTasksForKey(key) {

  return plannerExternalTasks()
    .filter(
      task =>
        task.due_date === key
    );

}


function plannerExternalTaskCard(task) {

  const done =
    task.completed === true;

  return `
    <article class="planner-card planner-card-external">

      <div class="planner-card-main">

        <div class="planner-card-time">
          <svg class="icon"><use href="#icon-list"></use></svg>
        </div>

        <div class="planner-card-content">

          <div class="planner-card-title ${
            done
              ? 'planner-card-title-done'
              : ''
          }">
            ${plannerEscape(task.title)}
          </div>

          <div class="planner-card-meta">
            <span>Из раздела «Задачи»</span>
          </div>

        </div>

      </div>

      <div class="planner-card-side">

        <span class="planner-status">
          ${done ? 'Выполнено' : 'К выполнению'}
        </span>

        <div class="planner-card-buttons">

          <button
            type="button"
            class="planner-icon-button"
            data-page="tasks"
            title="Открыть в разделе «Задачи»"
          >
            <svg class="icon"><use href="#icon-edit"></use></svg>
          </button>

        </div>

      </div>

    </article>
  `;

}


/* ============================================================
   ТОЧЕЧНОЕ ОБНОВЛЕНИЕ ЗАДАЧИ ПЛАНИРОВЩИКА
   (звёздочка «избранное» на карточке)
   ============================================================ */

async function plannerToggleTaskFavorite(id) {

  const task =
    plannerState.tasks.find(
      item =>
        plannerSameId(item.id, id)
    );

  if (!task) {
    return;
  }

  await plannerPatchTask(
    id,
    {
      favorite: !task.favorite
    }
  );

}


async function plannerPatchTask(
  id,
  changes
) {

  const operatorEmail =
    (
      typeof state !== 'undefined' &&
      state.user?.email
    ) || null;

  const {
    data: row,
    error
  } =
    await supabaseClient
      .from('planner_tasks')
      .update({
        ...changes,
        updated_by: operatorEmail
      })
      .eq('id', id)
      .select('*')
      .single();

  if (error) {

    console.error(
      'Planner patch task error:',
      error
    );

    if (typeof toast === 'function') {

      toast(
        error.message ||
        'Не удалось обновить задачу',
        'error'
      );

    }

    return;

  }

  const index =
    plannerState.tasks.findIndex(
      item =>
        plannerSameId(item.id, id)
    );

  if (index !== -1) {

    plannerState.tasks[index] =
      plannerMapTaskRow(row);

  }

  render();

}


/* ============================================================
   INITIALIZATION
   ============================================================ */

window
  .plannerView =
  plannerView;

window
  .setupPlanner =
  setupPlanner;

window
  .plannerOpenShipmentModal =
  plannerOpenShipmentModal;

window
  .plannerOpenTaskModal =
  plannerOpenTaskModal;

window
  .plannerExportData =
  plannerExportData;

window
  .plannerLoadFromSupabase =
  plannerLoadFromSupabase;
