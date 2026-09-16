/* =========================================================
   SKLADAPLAN — TASK MANAGER
   tasks.js

   Отдельный модуль задач (Главная + страница «Задачи»).

   Хранилище: Supabase, таблица public.tasks
   (см. supabase_migration_tasks.sql — выполнить один раз
   в SQL Editor перед использованием).

   Переиспользует то, что уже есть в app.js (как и
   planner.js): глобальный supabaseClient, $, $all,
   escapeHtml, normalizeText, toast, render(), goToPage(),
   state.user. Своё состояние держит отдельно —
   tasksState — по тому же принципу, что и plannerState
   в planner.js: у каждого модуля своё состояние, они не
   пересекаются.
   ========================================================= */

'use strict';


/* =========================================================
   STATE
   ========================================================= */

const tasksState = {

  items: [],

  loading: false,
  loaded: false,
  loadError: null,

  /* list | calendar */
  view: 'list',

  /* all | active | done | favorite */
  filter: 'all',

  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  selectedDate: null,

  editingId: null,

  /*
    Избранное для быстрой задачи с Главной —
    переключается кнопкой-звёздочкой до отправки формы.
  */
  homeQuickFavorite: false

};


const TASK_PRIORITY_LABELS = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий'
};

const TASK_PRIORITY_COLORS = {
  low: '#4a90d9',
  medium: '#d99a00',
  high: '#c0392b'
};

const TASK_CALENDAR_MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель',
  'Май', 'Июнь', 'Июль', 'Август',
  'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const TASK_CALENDAR_WEEKDAY_NAMES =
  ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];


/* =========================================================
   SUPABASE — ЗАГРУЗКА
   ========================================================= */

async function loadTasksFromSupabase() {

  tasksState.loading = true;
  tasksState.loadError = null;

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('tasks')
        .select('*')
        .order('completed', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    tasksState.items =
      Array.isArray(data)
        ? data
        : [];

    tasksState.loaded = true;

  } catch (error) {

    console.error(
      'SKLADAPLAN TASKS load error:',
      error
    );

    tasksState.loadError =
      error.message ||
      'Не удалось загрузить задачи';

    toast(
      'Не удалось загрузить задачи. Проверьте, что в Supabase выполнена supabase_migration_tasks.sql',
      'error'
    );

  } finally {

    tasksState.loading = false;

  }

}


/* =========================================================
   SUPABASE — CRUD
   ========================================================= */

async function addTask(taskData) {

  const title =
    normalizeText(taskData.title);

  if (!title) {
    return null;
  }

  const payload = {
    title,
    description:
      normalizeText(taskData.description || ''),
    priority:
      taskData.priority || 'medium',
    due_date:
      taskData.due_date || null,
    due_time:
      taskData.due_time || null,
    favorite:
      !!taskData.favorite,
    completed: false,
    created_by:
      state.user?.email || null,
    updated_by:
      state.user?.email || null
  };

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('tasks')
        .insert(payload)
        .select()
        .single();

    if (error) {
      throw error;
    }

    tasksState.items.unshift(data);

    return data;

  } catch (error) {

    console.error(
      'SKLADAPLAN TASKS add error:',
      error
    );

    toast(
      'Не удалось сохранить задачу: ' +
        (error.message || 'ошибка Supabase'),
      'error'
    );

    return null;

  }

}


async function updateTask(id, changes) {

  const payload = {
    ...changes,
    updated_by:
      state.user?.email || null
  };

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('tasks')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
      throw error;
    }

    const index =
      tasksState.items.findIndex(
        task => task.id === id
      );

    if (index !== -1) {
      tasksState.items[index] = data;
    }

    return data;

  } catch (error) {

    console.error(
      'SKLADAPLAN TASKS update error:',
      error
    );

    toast(
      'Не удалось сохранить изменения: ' +
        (error.message || 'ошибка Supabase'),
      'error'
    );

    return null;

  }

}


async function deleteTask(id) {

  try {

    const { error } =
      await supabaseClient
        .from('tasks')
        .delete()
        .eq('id', id);

    if (error) {
      throw error;
    }

    tasksState.items =
      tasksState.items.filter(
        task => task.id !== id
      );

    return true;

  } catch (error) {

    console.error(
      'SKLADAPLAN TASKS delete error:',
      error
    );

    toast(
      'Не удалось удалить задачу: ' +
        (error.message || 'ошибка Supabase'),
      'error'
    );

    return false;

  }

}


async function toggleTaskDone(id) {

  const task =
    tasksState.items.find(
      t => t.id === id
    );

  if (!task) {
    return;
  }

  await updateTask(id, {
    completed: !task.completed
  });

  render();

}


async function toggleTaskFavorite(id) {

  const task =
    tasksState.items.find(
      t => t.id === id
    );

  if (!task) {
    return;
  }

  await updateTask(id, {
    favorite: !task.favorite
  });

  render();

}


/* =========================================================
   ВЫБОРКА / СОРТИРОВКА
   ========================================================= */

function getFilteredTasks() {

  return tasksState.items
    .filter(task => {

      if (tasksState.filter === 'active') {
        return !task.completed;
      }

      if (tasksState.filter === 'done') {
        return task.completed;
      }

      if (tasksState.filter === 'favorite') {
        return task.favorite;
      }

      return true;

    })
    .slice()
    .sort((a, b) => {

      if (a.due_date && b.due_date) {
        return a.due_date < b.due_date ? -1 : 1;
      }

      if (a.due_date) return -1;
      if (b.due_date) return 1;

      return 0;

    });

}


function isTaskOverdue(task) {

  if (!task.due_date || task.completed) {
    return false;
  }

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  const taskDate =
    new Date(task.due_date + 'T00:00:00');

  return taskDate < today;

}


function formatDateISO(date) {

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;

}


/* =========================================================
   РЕНДЕР — КАРТОЧКА ЗАДАЧИ (список/календарь/Главная общие)
   ========================================================= */

function taskCardHtml(task) {

  if (tasksState.editingId === task.id) {
    return taskEditFormHtml(task);
  }

  return `

    <div
      class="task-card ${task.completed ? 'is-done' : ''}"
      data-task-id="${escapeHtml(task.id)}"
    >

      <input
        type="checkbox"
        class="task-toggle"
        data-id="${escapeHtml(task.id)}"
        ${task.completed ? 'checked' : ''}
      >

      <div class="task-card-body">

        <div class="task-card-top">

          <b class="task-card-title">
            ${escapeHtml(task.title)}
          </b>

          <span
            class="task-priority-badge"
            style="background:${TASK_PRIORITY_COLORS[task.priority] || '#888'};"
          >
            ${TASK_PRIORITY_LABELS[task.priority] || task.priority}
          </span>

          ${
            isTaskOverdue(task)
              ? `<span class="task-overdue-badge">Просрочено</span>`
              : ''
          }

        </div>

        ${
          task.description
            ? `<div class="sp-muted task-card-desc">${escapeHtml(task.description)}</div>`
            : ''
        }

        ${
          (task.due_date || task.due_time)
            ? `
              <div class="sp-muted task-card-date">
                <svg class="icon"><use href="#icon-calendar"></use></svg>
                ${escapeHtml(task.due_date || '')}
                ${task.due_time ? escapeHtml(task.due_time) : ''}
              </div>
            `
            : ''
        }

      </div>

      <div class="task-card-actions">

        <button
          type="button"
          class="task-icon-btn ${task.favorite ? 'is-active' : ''}"
          data-favorite-task="${escapeHtml(task.id)}"
          title="Избранное"
        >
          <svg class="icon"><use href="#icon-${task.favorite ? 'star-filled' : 'star'}"></use></svg>
        </button>

        <button
          type="button"
          class="task-icon-btn"
          data-edit-task="${escapeHtml(task.id)}"
          title="Изменить"
        >
          <svg class="icon"><use href="#icon-edit"></use></svg>
        </button>

        <button
          type="button"
          class="task-icon-btn danger"
          data-delete-task="${escapeHtml(task.id)}"
          title="Удалить"
        >
          <svg class="icon"><use href="#icon-trash"></use></svg>
        </button>

      </div>

    </div>

  `;

}


function taskEditFormHtml(task) {

  return `

    <div
      class="task-card task-card-editing"
      data-task-id="${escapeHtml(task.id)}"
    >

      <div class="task-edit-grid">

        <input
          type="text"
          class="task-edit-title"
          value="${escapeHtml(task.title)}"
          placeholder="Что нужно сделать?"
        >

        <input
          type="date"
          class="task-edit-date"
          value="${escapeHtml(task.due_date || '')}"
        >

        <input
          type="time"
          class="task-edit-time"
          value="${escapeHtml(task.due_time || '')}"
        >

        <select class="task-edit-priority">
          <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Низкий приоритет</option>
          <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Средний приоритет</option>
          <option value="high" ${task.priority === 'high' ? 'selected' : ''}>Высокий приоритет</option>
        </select>

      </div>

      <textarea
        class="task-edit-desc"
        placeholder="Заметка (необязательно)"
      >${escapeHtml(task.description || '')}</textarea>

      <label class="task-edit-fav">
        <input
          type="checkbox"
          class="task-edit-favorite"
          ${task.favorite ? 'checked' : ''}
        >
        <svg class="icon"><use href="#icon-star"></use></svg>
        Избранное
      </label>

      <div class="task-edit-actions">

        <button
          type="button"
          class="sp-btn"
          data-save-task="${escapeHtml(task.id)}"
        >
          Сохранить
        </button>

        <button
          type="button"
          class="sp-btn secondary"
          data-cancel-edit-task="${escapeHtml(task.id)}"
        >
          Отмена
        </button>

      </div>

    </div>

  `;

}


/* =========================================================
   РЕНДЕР — СПИСОК
   ========================================================= */

function taskEmptyMessage() {

  if (tasksState.filter === 'done') {
    return 'Выполненных задач пока нет.';
  }

  if (tasksState.filter === 'favorite') {
    return 'Нет избранных задач. Отметьте задачу звёздочкой, чтобы она попала сюда и на Главную.';
  }

  if (tasksState.filter === 'active') {
    return 'Активных задач нет — всё сделано.';
  }

  return 'Задач нет. Добавьте первую задачу выше.';

}


function tasksListHtml() {

  if (tasksState.loading && !tasksState.loaded) {

    return `
      <div class="sp-empty">
        Загружаем задачи...
      </div>
    `;

  }

  if (tasksState.loadError && !tasksState.loaded) {

    return `
      <div class="sp-empty">
        Не удалось загрузить задачи.
        <div class="sp-muted" style="margin-top:6px;font-size:12px;">
          ${escapeHtml(tasksState.loadError)}
        </div>
      </div>
    `;

  }

  const tasks =
    getFilteredTasks();

  if (!tasks.length) {

    return `
      <div class="sp-empty">
        ${taskEmptyMessage()}
      </div>
    `;

  }

  return `
    <div class="task-list">
      ${tasks.map(taskCardHtml).join('')}
    </div>
  `;

}


/* =========================================================
   РЕНДЕР — КАЛЕНДАРЬ
   ========================================================= */

function tasksCalendarHtml() {

  const year =
    tasksState.calendarYear;

  const month =
    tasksState.calendarMonth;

  const firstOfMonth =
    new Date(year, month, 1);

  /* Понедельник = 0 ... Воскресенье = 6 */
  const firstWeekday =
    (firstOfMonth.getDay() + 6) % 7;

  const daysInMonth =
    new Date(year, month + 1, 0).getDate();

  const tasksByDate = {};

  tasksState.items.forEach(task => {

    if (!task.due_date) return;

    if (!tasksByDate[task.due_date]) {
      tasksByDate[task.due_date] = [];
    }

    tasksByDate[task.due_date].push(task);

  });

  const todayISO =
    formatDateISO(new Date());

  const cells = [];

  for (let i = 0; i < firstWeekday; i++) {
    cells.push('<div></div>');
  }

  for (let day = 1; day <= daysInMonth; day++) {

    const dateISO =
      formatDateISO(new Date(year, month, day));

    const dayTasks =
      tasksByDate[dateISO] || [];

    const isToday =
      dateISO === todayISO;

    const isSelected =
      dateISO === tasksState.selectedDate;

    cells.push(`

      <div
        class="task-calendar-day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${dayTasks.length ? 'has-tasks' : ''}"
        data-date="${dateISO}"
      >

        <div class="task-calendar-day-num">
          ${day}
        </div>

        ${
          dayTasks.length
            ? `
              <div class="task-calendar-day-count">
                ${dayTasks.length} ${dayTasks.length === 1 ? 'задача' : 'задач'}
              </div>
            `
            : ''
        }

      </div>

    `);

  }

  const selectedDayTasks =
    tasksState.selectedDate
      ? (tasksByDate[tasksState.selectedDate] || [])
      : [];

  return `

    <div class="task-calendar-head">

      <button class="sp-btn secondary" type="button" id="calendarPrevMonth">←</button>

      <b>${TASK_CALENDAR_MONTH_NAMES[month]} ${year}</b>

      <button class="sp-btn secondary" type="button" id="calendarNextMonth">→</button>

    </div>

    <div class="task-calendar-weekdays">
      ${TASK_CALENDAR_WEEKDAY_NAMES.map(name => `<div>${name}</div>`).join('')}
    </div>

    <div class="task-calendar-grid">
      ${cells.join('')}
    </div>

    ${
      tasksState.selectedDate
        ? `
          <div class="task-calendar-selected">

            <h3>Задачи на ${escapeHtml(tasksState.selectedDate)}</h3>

            ${
              selectedDayTasks.length
                ? `<div class="task-list">${selectedDayTasks.map(taskCardHtml).join('')}</div>`
                : `<div class="sp-muted">Задач нет.</div>`
            }

          </div>
        `
        : ''
    }

  `;

}


/* =========================================================
   СТРАНИЦА «ЗАДАЧИ»
   ========================================================= */

function tasksView() {

  return `

    <div class="sp-card" style="margin-bottom:16px;">

      <h3>+ Новая задача</h3>

      <div class="task-new-grid">

        <input
          id="taskTitleInput"
          type="text"
          placeholder="Что нужно сделать?"
        >

        <input id="taskDateInput" type="date">

        <input id="taskTimeInput" type="time">

        <select id="taskPriorityInput">
          <option value="low">Низкий приоритет</option>
          <option value="medium" selected>Средний приоритет</option>
          <option value="high">Высокий приоритет</option>
        </select>

      </div>

      <textarea
        id="taskNotesInput"
        placeholder="Заметка (необязательно)"
      ></textarea>

      <div class="task-new-actions">

        <label class="task-edit-fav">
          <input type="checkbox" id="taskFavoriteInput">
          <svg class="icon"><use href="#icon-star"></use></svg>
          Избранное
        </label>

        <button class="sp-btn" type="button" id="addTaskBtn">
          <svg class="icon"><use href="#icon-plus"></use></svg>
          Добавить задачу
        </button>

      </div>

    </div>


    <div class="sp-card" style="margin-bottom:16px;">

      <div class="task-toolbar">

        <div class="task-toolbar-group">

          <button
            class="sp-btn ${tasksState.view === 'list' ? '' : 'secondary'}"
            type="button"
            data-tasks-view="list"
          >
            <svg class="icon"><use href="#icon-list"></use></svg>
            Список
          </button>

          <button
            class="sp-btn ${tasksState.view === 'calendar' ? '' : 'secondary'}"
            type="button"
            data-tasks-view="calendar"
          >
            <svg class="icon"><use href="#icon-calendar"></use></svg>
            Календарь
          </button>

        </div>

        ${
          tasksState.view === 'list'
            ? `
              <div class="task-toolbar-group">

                <button class="sp-btn ${tasksState.filter === 'all' ? '' : 'secondary'}" type="button" data-tasks-filter="all">Все</button>
                <button class="sp-btn ${tasksState.filter === 'active' ? '' : 'secondary'}" type="button" data-tasks-filter="active">Активные</button>
                <button class="sp-btn ${tasksState.filter === 'done' ? '' : 'secondary'}" type="button" data-tasks-filter="done">Выполненные</button>
                <button class="sp-btn ${tasksState.filter === 'favorite' ? '' : 'secondary'}" type="button" data-tasks-filter="favorite">
                  <svg class="icon"><use href="#icon-star"></use></svg>
                  Избранные
                </button>

              </div>
            `
            : ''
        }

        <!--
          Связь с Планировщиком: задачи с датой видны
          в его календаре рядом с отгрузками.
        -->

        <div class="task-toolbar-group task-toolbar-right">

          <button
            class="sp-btn secondary"
            type="button"
            data-page="planner"
            title="Задачи с датой видны в календаре Планировщика"
          >
            <svg class="icon"><use href="#icon-calendar"></use></svg>
            В планировщик
          </button>

        </div>

      </div>

    </div>


    <div class="sp-card">
      ${
        tasksState.view === 'calendar'
          ? tasksCalendarHtml()
          : tasksListHtml()
      }
    </div>

  `;

}


/* =========================================================
   SETUP — СТРАНИЦА «ЗАДАЧИ»
   ========================================================= */

function setupTasks() {

  $('#addTaskBtn')?.addEventListener('click', async () => {

    const title =
      $('#taskTitleInput')?.value;

    if (!normalizeText(title)) {
      toast('Введите название задачи', 'error');
      return;
    }

    const task = await addTask({
      title,
      due_date: $('#taskDateInput')?.value || '',
      due_time: $('#taskTimeInput')?.value || '',
      priority: $('#taskPriorityInput')?.value || 'medium',
      description: $('#taskNotesInput')?.value || '',
      favorite: !!$('#taskFavoriteInput')?.checked
    });

    if (task) {
      render();
      toast('Задача добавлена');
    }

  });

  $all('[data-tasks-view]').forEach(button => {

    button.addEventListener('click', () => {
      tasksState.view = button.dataset.tasksView;
      render();
    });

  });

  $all('[data-tasks-filter]').forEach(button => {

    button.addEventListener('click', () => {
      tasksState.filter = button.dataset.tasksFilter;
      render();
    });

  });

  $all('.task-toggle').forEach(checkbox => {

    checkbox.addEventListener('change', event => {
      toggleTaskDone(event.target.dataset.id);
    });

  });

  $all('[data-favorite-task]').forEach(button => {

    button.addEventListener('click', () => {
      toggleTaskFavorite(button.dataset.favoriteTask);
    });

  });

  $all('[data-edit-task]').forEach(button => {

    button.addEventListener('click', () => {
      tasksState.editingId = button.dataset.editTask;
      render();
    });

  });

  $all('[data-cancel-edit-task]').forEach(button => {

    button.addEventListener('click', () => {
      tasksState.editingId = null;
      render();
    });

  });

  $all('[data-save-task]').forEach(button => {

    button.addEventListener('click', async () => {

      const id = button.dataset.saveTask;

      const card =
        button.closest('.task-card-editing');

      if (!card) return;

      const title =
        card.querySelector('.task-edit-title')?.value;

      if (!normalizeText(title)) {
        toast('Введите название задачи', 'error');
        return;
      }

      const updated = await updateTask(id, {
        title: normalizeText(title),
        description:
          card.querySelector('.task-edit-desc')?.value || '',
        priority:
          card.querySelector('.task-edit-priority')?.value || 'medium',
        due_date:
          card.querySelector('.task-edit-date')?.value || null,
        due_time:
          card.querySelector('.task-edit-time')?.value || null,
        favorite:
          !!card.querySelector('.task-edit-favorite')?.checked
      });

      if (updated) {
        tasksState.editingId = null;
        render();
        toast('Задача сохранена');
      }

    });

  });

  $all('[data-delete-task]').forEach(button => {

    button.addEventListener('click', async () => {

      const ok = await deleteTask(button.dataset.deleteTask);

      if (ok) {
        render();
        toast('Задача удалена');
      }

    });

  });

  $('#calendarPrevMonth')?.addEventListener('click', () => {

    tasksState.calendarMonth--;

    if (tasksState.calendarMonth < 0) {
      tasksState.calendarMonth = 11;
      tasksState.calendarYear--;
    }

    render();

  });

  $('#calendarNextMonth')?.addEventListener('click', () => {

    tasksState.calendarMonth++;

    if (tasksState.calendarMonth > 11) {
      tasksState.calendarMonth = 0;
      tasksState.calendarYear++;
    }

    render();

  });

  $all('.task-calendar-day').forEach(cell => {

    cell.addEventListener('click', () => {

      const date = cell.dataset.date;

      tasksState.selectedDate =
        tasksState.selectedDate === date
          ? null
          : date;

      render();

    });

  });

}


/* =========================================================
   ГЛАВНАЯ — ВИДЖЕТ ЗАДАЧ

   Показывает избранные активные задачи; если избранных
   нет — показывает ближайшие активные задачи. Создана
   на Главной задача сразу попадает в общий Supabase-список,
   поэтому страница «Задачи» и Главная всегда показывают
   одни и те же данные.
   ========================================================= */

function homeTasksListHtml() {

  if (tasksState.loading && !tasksState.loaded) {

    return `
      <div class="sp-muted" style="font-size:13px;">
        Загружаем задачи...
      </div>
    `;

  }

  const active =
    tasksState.items.filter(task => !task.completed);

  const favorites =
    active.filter(task => task.favorite);

  const source =
    favorites.length
      ? favorites
      : active;

  const tasks =
    source
      .slice()
      .sort((a, b) => {

        if (a.due_date && b.due_date) {
          return a.due_date < b.due_date ? -1 : 1;
        }

        if (a.due_date) return -1;
        if (b.due_date) return 1;

        return 0;

      })
      .slice(0, 5);

  if (!tasks.length) {

    return `
      <div class="sp-muted" style="font-size:13px;">
        Активных задач нет.
      </div>
    `;

  }

  return `
    <div class="home-task-list">
      ${tasks.map(task => `

        <div class="home-task-row">

          <input
            type="checkbox"
            class="home-task-toggle"
            data-id="${escapeHtml(task.id)}"
          >

          <span class="home-task-title">
            ${escapeHtml(task.title)}
          </span>

          <button
            type="button"
            class="task-icon-btn home-task-favorite ${task.favorite ? 'is-active' : ''}"
            data-favorite-task="${escapeHtml(task.id)}"
            title="Избранное"
          >
            <svg class="icon"><use href="#icon-${task.favorite ? 'star-filled' : 'star'}"></use></svg>
          </button>

          ${
            isTaskOverdue(task)
              ? `<span class="task-overdue-badge">Просрочено</span>`
              : (
                  task.due_date
                    ? `<span class="sp-muted home-task-date">${escapeHtml(task.due_date)}</span>`
                    : ''
                )
          }

        </div>

      `).join('')}
    </div>
  `;

}


function setupHomeTasksWidget() {

  const favoriteToggle =
    $('#homeTaskFavoriteToggle');

  if (favoriteToggle) {

    tasksState.homeQuickFavorite = false;

    favoriteToggle.addEventListener('click', () => {

      tasksState.homeQuickFavorite =
        !tasksState.homeQuickFavorite;

      favoriteToggle.classList.toggle(
        'is-active',
        tasksState.homeQuickFavorite
      );

      favoriteToggle.querySelector('use')
        ?.setAttribute(
          'href',
          tasksState.homeQuickFavorite
            ? '#icon-star-filled'
            : '#icon-star'
        );

    });

  }

  const submitHomeTask = async () => {

    const input =
      $('#homeTaskTitleInput');

    const title =
      input?.value;

    if (!normalizeText(title)) {
      return;
    }

    const task = await addTask({
      title,
      favorite: tasksState.homeQuickFavorite
    });

    if (task) {

      if (input) {
        input.value = '';
      }

      tasksState.homeQuickFavorite = false;

      render();

    }

  };

  $('#homeAddTaskBtn')?.addEventListener('click', submitHomeTask);

  $('#homeTaskTitleInput')?.addEventListener('keydown', event => {

    if (event.key === 'Enter') {
      event.preventDefault();
      submitHomeTask();
    }

  });

  $all('.home-task-toggle').forEach(checkbox => {

    checkbox.addEventListener('change', event => {
      toggleTaskDone(event.target.dataset.id);
    });

  });

  $all('.home-task-favorite').forEach(button => {

    button.addEventListener('click', () => {
      toggleTaskFavorite(button.dataset.favoriteTask);
    });

  });

}
