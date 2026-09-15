/* ============================================================
   SKLADAPLAN — PLANNER
   Планировщик отгрузок и задач
   ============================================================ */

console.log('Planner module loaded');


/* ============================================================
   STATE
   ============================================================ */

const plannerState = {
  currentDate: new Date(),
  selectedDate: new Date(),

  view: 'month',

  shipments: [],
  tasks: [],

  editingShipmentId: null,
  editingTaskId: null,

  initialized: false
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


function plannerEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


/* ============================================================
   LOCAL STORAGE
   ============================================================ */

const PLANNER_STORAGE_KEY =
  'skladaplan_planner_v1';


function plannerLoad() {

  try {

    const raw =
      localStorage.getItem(
        PLANNER_STORAGE_KEY
      );

    if (!raw) {
      return;
    }

    const data =
      JSON.parse(raw);

    plannerState.shipments =
      Array.isArray(data.shipments)
        ? data.shipments
        : [];

    plannerState.tasks =
      Array.isArray(data.tasks)
        ? data.tasks
        : [];

  } catch (error) {

    console.error(
      'Planner load error:',
      error
    );

    plannerState.shipments = [];
    plannerState.tasks = [];
  }
}


function plannerSave() {

  try {

    localStorage.setItem(
      PLANNER_STORAGE_KEY,
      JSON.stringify({
        shipments:
          plannerState.shipments,

        tasks:
          plannerState.tasks
      })
    );

  } catch (error) {

    console.error(
      'Planner save error:',
      error
    );
  }
}


/* ============================================================
   DEMO DATA
   ============================================================ */

function plannerCreateDemoData() {

  if (
    plannerState.shipments.length ||
    plannerState.tasks.length
  ) {
    return;
  }

  const today =
    plannerTodayKey();

  const tomorrowDate =
    new Date();

  tomorrowDate.setDate(
    tomorrowDate.getDate() + 1
  );

  const tomorrow =
    plannerDateKey(
      tomorrowDate
    );

  plannerState.shipments = [
    {
      id: 'shipment_demo_1',

      date: today,

      time: '14:00',

      title: 'Плановая отгрузка',

      direction: 'Основное направление',

      warehouse: 'Склад СОХ',

      status: 'Запланирована',

      responsible: '',

      comment: ''
    },

    {
      id: 'shipment_demo_2',

      date: tomorrow,

      time: '10:30',

      title: 'Отгрузка заказа',

      direction: 'Склад №7',

      warehouse: 'Склад №7',

      status: 'Подготовка',

      responsible: '',

      comment: ''
    }
  ];

  plannerState.tasks = [
    {
      id: 'task_demo_1',

      date: today,

      time: '11:00',

      title: 'Проверить комплектацию',

      priority: 'Высокий',

      status: 'К выполнению',

      comment: ''
    }
  ];

  plannerSave();
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

    if (events.shipments.length) {

      html += `
        <span class="planner-event-dot shipment">
          ${events.shipments.length}
        </span>
      `;
    }

    if (events.tasks.length) {

      html += `
        <span class="planner-event-dot task">
          ${events.tasks.length}
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

  if (
    !events.shipments.length &&
    !events.tasks.length
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
            ✎
          </button>

          <button
            type="button"
            class="planner-icon-button planner-danger"
            data-delete-shipment="${plannerEscape(
              shipment.id
            )}"
            title="Удалить"
          >
            ×
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
            'К выполнению'
          )}
        </span>

        <div class="planner-card-buttons">

          <button
            type="button"
            class="planner-icon-button"
            data-edit-task="${plannerEscape(
              task.id
            )}"
            title="Изменить"
          >
            ✎
          </button>

          <button
            type="button"
            class="planner-icon-button planner-danger"
            data-delete-task="${plannerEscape(
              task.id
            )}"
            title="Удалить"
          >
            ×
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

  if (!plannerState.initialized) {

    plannerLoad();

    plannerState.initialized = true;
  }

  return `
    <div class="planner">

      <header class="planner-header">

        <div>

          <div class="planner-kicker">
            SKLADAPLAN
          </div>

          <h1>
            Планировщик
          </h1>

          <p>
            Отгрузки, задачи и планы склада.
          </p>

        </div>

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

  console.log(
    'Planner setup loaded'
  );


  document
    .getElementById(
      'plannerTodayButton'
    )
    ?.addEventListener(
      'click',
      () => {

        const today =
          new Date();

        plannerState.currentDate =
          new Date(today);

        plannerState.selectedDate =
          new Date(today);

        render();
      }
    );


  document
    .getElementById(
      'plannerPrevMonth'
    )
    ?.addEventListener(
      'click',
      () => {

        plannerState.currentDate =
          new Date(
            plannerState.currentDate.getFullYear(),
            plannerState.currentDate.getMonth() - 1,
            1
          );

        render();
      }
    );


  document
    .getElementById(
      'plannerNextMonth'
    )
    ?.addEventListener(
      'click',
      () => {

        plannerState.currentDate =
          new Date(
            plannerState.currentDate.getFullYear(),
            plannerState.currentDate.getMonth() + 1,
            1
          );

        render();
      }
    );


  document
    .querySelectorAll(
      '[data-planner-date]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            const date =
              plannerParseDate(
                button.dataset.plannerDate
              );

            plannerState.selectedDate =
              date;

            if (
              date.getMonth() !==
              plannerState.currentDate.getMonth()
            ) {

              plannerState.currentDate =
                new Date(date);
            }

            render();
          }
        );
      }
    );


  document
    .getElementById(
      'plannerAddShipment'
    )
    ?.addEventListener(
      'click',
      () => {

        plannerOpenShipmentModal();
      }
    );


  document
    .getElementById(
      'plannerAddTask'
    )
    ?.addEventListener(
      'click',
      () => {

        plannerOpenTaskModal();
      }
    );


  document
    .querySelectorAll(
      '[data-edit-shipment]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            plannerOpenShipmentModal(
              button.dataset.editShipment
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      '[data-delete-shipment]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            plannerDeleteShipment(
              button.dataset.deleteShipment
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      '[data-edit-task]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            plannerOpenTaskModal(
              button.dataset.editTask
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      '[data-delete-task]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            plannerDeleteTask(
              button.dataset.deleteTask
            );
          }
        );
      }
    );
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
            item.id === id
        )
      : null;

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
              value="${defaultDate}"
              required
            >
          </label>

          <label>
            <span>Время</span>

            <input
              type="time"
              name="time"
              value="${time}"
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

function plannerSaveShipment(
  data
) {

  if (
    !data.title ||
    !data.date
  ) {
    return;
  }


  if (
    plannerState.editingShipmentId
  ) {

    const index =
      plannerState.shipments.findIndex(
        item =>
          item.id ===
          plannerState.editingShipmentId
      );

    if (index !== -1) {

      plannerState.shipments[index] = {
        ...plannerState.shipments[index],
        ...data
      };
    }

  } else {

    plannerState.shipments.push({

      id:
        'shipment_' +
        Date.now(),

      ...data
    });
  }


  plannerSave();

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

function plannerDeleteShipment(
  id
) {

  const shipment =
    plannerState.shipments.find(
      item =>
        item.id === id
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


  plannerState.shipments =
    plannerState.shipments.filter(
      item =>
        item.id !== id
    );

  plannerSave();

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
            item.id === id
        )
      : null;

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
              value="${defaultDate}"
              required
            >
          </label>

          <label>
            <span>Время</span>

            <input
              type="time"
              name="time"
              value="${time}"
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
            data.get('comment')
        });
      }
    );
}


/* ============================================================
   SAVE TASK
   ============================================================ */

function plannerSaveTask(
  data
) {

  if (
    !data.title ||
    !data.date
  ) {
    return;
  }


  if (
    plannerState.editingTaskId
  ) {

    const index =
      plannerState.tasks.findIndex(
        item =>
          item.id ===
          plannerState.editingTaskId
      );

    if (index !== -1) {

      plannerState.tasks[index] = {
        ...plannerState.tasks[index],
        ...data
      };
    }

  } else {

    plannerState.tasks.push({

      id:
        'task_' +
        Date.now(),

      ...data
    });
  }


  plannerSave();

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

function plannerDeleteTask(
  id
) {

  const task =
    plannerState.tasks.find(
      item =>
        item.id === id
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


  plannerState.tasks =
    plannerState.tasks.filter(
      item =>
        item.id !== id
    );

  plannerSave();

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
