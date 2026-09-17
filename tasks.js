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
   КОНТРАГЕНТЫ И КОНТАКТЫ
   Отдельное состояние: не пересекается с tasksState.
   ========================================================= */

const PARTNER_CATEGORIES = [
  'Клиент',
  'Поставщик',
  'Перевозчик',
  'Транспортная компания',
  'Склад / 3PL',
  'Партнёр',
  'Прочее'
];

const partnersState = {
  items: [],
  loading: false,
  loaded: false,
  loadError: null,
  search: '',
  category: 'all',
  editingPartnerId: null,
  editingContactId: null,
  contactPartnerId: null,
  expandedPartnerId: null
};

function partnersSameId(a, b) {
  return String(a) === String(b);
}

function partnerById(id) {
  return partnersState.items.find(partner => partnersSameId(partner.id, id)) || null;
}

async function loadPartnersFromSupabase() {
  if (partnersState.loading || partnersState.loaded) return;

  partnersState.loading = true;
  partnersState.loadError = null;

  try {
    const { data, error } = await supabaseClient
      .from('partners')
      .select(`
        *,
        contacts (*)
      `)
      .order('active', { ascending: false })
      .order('favorite', { ascending: false })
      .order('name', { ascending: true });

    if (error) throw error;

    partnersState.items = Array.isArray(data)
      ? data.map(partner => ({
          ...partner,
          contacts: Array.isArray(partner.contacts)
            ? partner.contacts
                .slice()
                .sort((a, b) => {
                  if (a.primary_contact !== b.primary_contact) {
                    return a.primary_contact ? -1 : 1;
                  }
                  return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
                })
            : []
        }))
      : [];

    partnersState.loaded = true;
  } catch (error) {
    console.error('SKLADAPLAN PARTNERS load error:', error);
    partnersState.loadError = error.message || 'Не удалось загрузить контрагентов';
    toast('Не удалось загрузить контрагентов: ' + (error.message || 'ошибка Supabase'), 'error');
  } finally {
    partnersState.loading = false;
  }
}

function upsertPartnerLocal(partner) {
  const index = partnersState.items.findIndex(item => partnersSameId(item.id, partner.id));
  if (index === -1) {
    partnersState.items.unshift({ ...partner, contacts: [] });
  } else {
    partnersState.items[index] = {
      ...partnersState.items[index],
      ...partner,
      contacts: partnersState.items[index].contacts || []
    };
  }
}

async function savePartner(partnerData) {
  const name = normalizeText(partnerData.name);
  if (!name) {
    toast('Введите название контрагента', 'error');
    return null;
  }

  const payload = {
    name,
    category: partnerData.category || 'Прочее',
    phone: normalizeText(partnerData.phone || ''),
    email: normalizeText(partnerData.email || ''),
    website: normalizeText(partnerData.website || ''),
    address: normalizeText(partnerData.address || ''),
    city: normalizeText(partnerData.city || ''),
    country: normalizeText(partnerData.country || ''),
    tax_id: normalizeText(partnerData.tax_id || ''),
    registration_id: normalizeText(partnerData.registration_id || ''),
    comment: normalizeText(partnerData.comment || ''),
    favorite: !!partnerData.favorite,
    active: partnerData.active !== false,
    updated_by: state.user?.email || null
  };

  try {
    let data;
    let error;

    if (partnersState.editingPartnerId !== null && partnersState.editingPartnerId !== 'new') {
      ({ data, error } = await supabaseClient
        .from('partners')
        .update(payload)
        .eq('id', partnersState.editingPartnerId)
        .select('*')
        .single());
    } else {
      ({ data, error } = await supabaseClient
        .from('partners')
        .insert({
          ...payload,
          created_by: state.user?.email || null
        })
        .select('*')
        .single());
    }

    if (error) throw error;

    upsertPartnerLocal(data);
    partnersState.editingPartnerId = null;
    return data;
  } catch (error) {
    console.error('SKLADAPLAN PARTNERS save error:', error);
    toast('Не удалось сохранить контрагента: ' + (error.message || 'ошибка Supabase'), 'error');
    return null;
  }
}

async function deletePartner(id) {
  const partner = partnerById(id);
  if (!partner) return false;

  if (!window.confirm(`Удалить контрагента «${partner.name}» и его контакты?`)) {
    return false;
  }

  try {
    const { error } = await supabaseClient
      .from('partners')
      .delete()
      .eq('id', id);

    if (error) throw error;

    partnersState.items = partnersState.items.filter(item => !partnersSameId(item.id, id));
    if (partnersSameId(partnersState.expandedPartnerId, id)) partnersState.expandedPartnerId = null;
    return true;
  } catch (error) {
    console.error('SKLADAPLAN PARTNERS delete error:', error);
    toast('Не удалось удалить контрагента: ' + (error.message || 'ошибка Supabase'), 'error');
    return false;
  }
}

async function saveContact(contactData) {
  const partnerId = contactData.partner_id;
  const name = normalizeText(contactData.name);

  if (partnerId === null || partnerId === undefined || partnerId === '') {
    toast('Не выбран контрагент', 'error');
    return null;
  }

  if (!name) {
    toast('Введите имя контакта', 'error');
    return null;
  }

  const payload = {
    partner_id: partnerId,
    name,
    position: normalizeText(contactData.position || ''),
    phone: normalizeText(contactData.phone || ''),
    phone_extra: normalizeText(contactData.phone_extra || ''),
    email: normalizeText(contactData.email || ''),
    comment: normalizeText(contactData.comment || ''),
    primary_contact: !!contactData.primary_contact,
    active: contactData.active !== false,
    updated_by: state.user?.email || null
  };

  try {
    let data;
    let error;

    if (partnersState.editingContactId !== null) {
      ({ data, error } = await supabaseClient
        .from('contacts')
        .update(payload)
        .eq('id', partnersState.editingContactId)
        .select('*')
        .single());
    } else {
      ({ data, error } = await supabaseClient
        .from('contacts')
        .insert({
          ...payload,
          created_by: state.user?.email || null
        })
        .select('*')
        .single());
    }

    if (error) throw error;

    const partner = partnerById(partnerId);
    if (partner) {
      if (partnersState.editingContactId !== null) {
        partner.contacts = (partner.contacts || []).map(contact =>
          partnersSameId(contact.id, data.id) ? data : contact
        );
      } else {
        partner.contacts = [...(partner.contacts || []), data];
      }

      partner.contacts.sort((a, b) => {
        if (a.primary_contact !== b.primary_contact) return a.primary_contact ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
      });

      if (data.primary_contact) {
        partner.contacts = partner.contacts.map(contact =>
          partnersSameId(contact.id, data.id)
            ? contact
            : { ...contact, primary_contact: false }
        );
      }
    }

    partnersState.editingContactId = null;
    partnersState.contactPartnerId = null;
    return data;
  } catch (error) {
    console.error('SKLADAPLAN CONTACTS save error:', error);
    toast('Не удалось сохранить контакт: ' + (error.message || 'ошибка Supabase'), 'error');
    return null;
  }
}

async function deleteContact(id, partnerId) {
  try {
    const { error } = await supabaseClient
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    const partner = partnerById(partnerId);
    if (partner) {
      partner.contacts = (partner.contacts || []).filter(contact => !partnersSameId(contact.id, id));
    }
    return true;
  } catch (error) {
    console.error('SKLADAPLAN CONTACTS delete error:', error);
    toast('Не удалось удалить контакт: ' + (error.message || 'ошибка Supabase'), 'error');
    return false;
  }
}

function partnerFormHtml(partner = null) {
  const editing = !!partner;
  return `
    <div class="partner-form">
      <div class="partner-form-grid">
        <input type="text" class="partner-edit-name" value="${escapeHtml(partner?.name || '')}" placeholder="Название компании *">
        <select class="partner-edit-category">
          ${PARTNER_CATEGORIES.map(category => `<option value="${escapeHtml(category)}" ${category === (partner?.category || 'Прочее') ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
        </select>
        <input type="text" class="partner-edit-phone" value="${escapeHtml(partner?.phone || '')}" placeholder="Телефон">
        <input type="email" class="partner-edit-email" value="${escapeHtml(partner?.email || '')}" placeholder="Email">
        <input type="text" class="partner-edit-website" value="${escapeHtml(partner?.website || '')}" placeholder="Сайт">
        <input type="text" class="partner-edit-city" value="${escapeHtml(partner?.city || '')}" placeholder="Город">
        <input type="text" class="partner-edit-address" value="${escapeHtml(partner?.address || '')}" placeholder="Адрес">
        <input type="text" class="partner-edit-tax-id" value="${escapeHtml(partner?.tax_id || '')}" placeholder="ИНН / налоговый номер">
        <input type="text" class="partner-edit-registration-id" value="${escapeHtml(partner?.registration_id || '')}" placeholder="Регистрационный номер">
      </div>
      <textarea class="partner-edit-comment" placeholder="Комментарий">${escapeHtml(partner?.comment || '')}</textarea>
      <div class="partner-form-bottom">
        <label class="partner-check">
          <input type="checkbox" class="partner-edit-favorite" ${partner?.favorite ? 'checked' : ''}>
          <svg class="icon"><use href="#icon-star"></use></svg>
          Избранный
        </label>
        <label class="partner-check">
          <input type="checkbox" class="partner-edit-active" ${partner?.active !== false ? 'checked' : ''}>
          Активен
        </label>
        <div class="partner-form-actions">
          <button type="button" class="sp-btn" data-save-partner="${editing ? escapeHtml(partner.id) : 'new'}">Сохранить</button>
          <button type="button" class="sp-btn secondary" data-cancel-partner>Отмена</button>
        </div>
      </div>
    </div>
  `;
}

function contactFormHtml(partnerId, contact = null) {
  return `
    <div class="contact-form">
      <div class="contact-form-grid">
        <input type="text" class="contact-edit-name" value="${escapeHtml(contact?.name || '')}" placeholder="Имя и фамилия *">
        <input type="text" class="contact-edit-position" value="${escapeHtml(contact?.position || '')}" placeholder="Должность">
        <input type="text" class="contact-edit-phone" value="${escapeHtml(contact?.phone || '')}" placeholder="Телефон">
        <input type="text" class="contact-edit-phone-extra" value="${escapeHtml(contact?.phone_extra || '')}" placeholder="Доп. телефон">
        <input type="email" class="contact-edit-email" value="${escapeHtml(contact?.email || '')}" placeholder="Email">
      </div>
      <textarea class="contact-edit-comment" placeholder="Комментарий">${escapeHtml(contact?.comment || '')}</textarea>
      <div class="contact-form-bottom">
        <label class="partner-check">
          <input type="checkbox" class="contact-edit-primary" ${contact?.primary_contact ? 'checked' : ''}>
          Основной контакт
        </label>
        <label class="partner-check">
          <input type="checkbox" class="contact-edit-active" ${contact?.active !== false ? 'checked' : ''}>
          Активен
        </label>
        <div class="partner-form-actions">
          <button type="button" class="sp-btn" data-save-contact="${escapeHtml(partnerId)}">Сохранить</button>
          <button type="button" class="sp-btn secondary" data-cancel-contact>Отмена</button>
        </div>
      </div>
    </div>
  `;
}

function partnerCardHtml(partner) {
  const editing = partnersState.editingPartnerId !== null && partnersSameId(partnersState.editingPartnerId, partner.id);
  const expanded = partnersState.expandedPartnerId !== null && partnersSameId(partnersState.expandedPartnerId, partner.id);

  if (editing) {
    return `
      <div class="partner-card is-editing">
        ${partnerFormHtml(partner)}
      </div>
    `;
  }

  const contacts = Array.isArray(partner.contacts) ? partner.contacts : [];
  const visibleContacts = expanded ? contacts : contacts.slice(0, 2);

  return `
    <article class="partner-card ${partner.active === false ? 'is-inactive' : ''}">
      <div class="partner-card-main">
        <div class="partner-card-head">
          <div class="partner-card-title-wrap">
            <button type="button" class="partner-star ${partner.favorite ? 'is-active' : ''}" data-toggle-partner-favorite="${escapeHtml(partner.id)}" title="Избранное">
              <svg class="icon"><use href="#icon-${partner.favorite ? 'star-filled' : 'star'}"></use></svg>
            </button>
            <div>
              <h4>${escapeHtml(partner.name)}</h4>
              <span class="partner-category">${escapeHtml(partner.category || 'Прочее')}</span>
            </div>
          </div>
          <div class="partner-card-actions">
            <button type="button" class="task-icon-btn" data-edit-partner="${escapeHtml(partner.id)}" title="Изменить">
              <svg class="icon"><use href="#icon-edit"></use></svg>
            </button>
            <button type="button" class="task-icon-btn danger" data-delete-partner="${escapeHtml(partner.id)}" title="Удалить">
              <svg class="icon"><use href="#icon-trash"></use></svg>
            </button>
          </div>
        </div>

        <div class="partner-company-data">
          ${partner.phone ? `<span>☎ ${escapeHtml(partner.phone)}</span>` : ''}
          ${partner.email ? `<span>✉ ${escapeHtml(partner.email)}</span>` : ''}
          ${partner.city ? `<span>⌖ ${escapeHtml(partner.city)}</span>` : ''}
        </div>

        ${partner.comment ? `<div class="sp-muted partner-card-comment">${escapeHtml(partner.comment)}</div>` : ''}
      </div>

      <div class="partner-contacts-head">
        <b>Контакты <span>${contacts.length}</span></b>
        <button type="button" class="sp-btn secondary partner-add-contact" data-add-contact="${escapeHtml(partner.id)}">
          <svg class="icon"><use href="#icon-plus"></use></svg>
          Контакт
        </button>
      </div>

      ${
        partnersState.editingContactId !== null &&
        partnersState.contactPartnerId !== null &&
        partnersSameId(partnersState.contactPartnerId, partner.id)
          ? contactFormHtml(partner.id, contacts.find(contact => partnersSameId(contact.id, partnersState.editingContactId)) || null)
          : `
            <div class="partner-contact-list">
              ${visibleContacts.length ? visibleContacts.map(contact => `
                <div class="partner-contact ${contact.active === false ? 'is-inactive' : ''}">
                  <div class="partner-contact-info">
                    <div class="partner-contact-name">
                      ${escapeHtml(contact.name)}
                      ${contact.primary_contact ? '<span class="partner-primary-badge">Основной</span>' : ''}
                    </div>
                    ${contact.position ? `<div class="sp-muted partner-contact-position">${escapeHtml(contact.position)}</div>` : ''}
                    <div class="partner-contact-links">
                      ${contact.phone ? `<span>☎ ${escapeHtml(contact.phone)}</span>` : ''}
                      ${contact.phone_extra ? `<span>☎ ${escapeHtml(contact.phone_extra)}</span>` : ''}
                      ${contact.email ? `<span>✉ ${escapeHtml(contact.email)}</span>` : ''}
                    </div>
                  </div>
                  <div class="partner-contact-actions">
                    <button type="button" class="task-icon-btn" data-edit-contact="${escapeHtml(contact.id)}" data-contact-partner="${escapeHtml(partner.id)}" title="Изменить">
                      <svg class="icon"><use href="#icon-edit"></use></svg>
                    </button>
                    <button type="button" class="task-icon-btn danger" data-delete-contact="${escapeHtml(contact.id)}" data-contact-partner="${escapeHtml(partner.id)}" title="Удалить">
                      <svg class="icon"><use href="#icon-trash"></use></svg>
                    </button>
                  </div>
                </div>
              `).join('') : '<div class="sp-muted partner-no-contacts">Контактов пока нет.</div>'}
            </div>
          `
      }

      ${contacts.length > 2 ? `
        <button type="button" class="partner-show-more" data-toggle-partner="${escapeHtml(partner.id)}">
          ${expanded ? 'Свернуть' : `Показать ещё (${contacts.length - 2})`}
        </button>
      ` : ''}
    </article>
  `;
}

function getFilteredPartners() {
  const search = normalizeText(partnersState.search).toLowerCase();

  return partnersState.items.filter(partner => {
    if (partnersState.category !== 'all' && partner.category !== partnersState.category) return false;
    if (!search) return true;

    const haystack = [
      partner.name,
      partner.category,
      partner.phone,
      partner.email,
      partner.city,
      ...(partner.contacts || []).flatMap(contact => [contact.name, contact.position, contact.phone, contact.email])
    ].join(' ').toLowerCase();

    return haystack.includes(search);
  });
}

function partnersViewHtml() {
  if (partnersState.loading && !partnersState.loaded) {
    return '<div class="sp-empty">Загружаем контрагентов...</div>';
  }

  if (partnersState.loadError && !partnersState.loaded) {
    return `<div class="sp-empty">Не удалось загрузить контрагентов.<div class="sp-muted" style="margin-top:6px;font-size:12px;">${escapeHtml(partnersState.loadError)}</div></div>`;
  }

  if (partnersState.editingPartnerId === 'new') {
    return `<div class="partner-card is-editing">${partnerFormHtml()}</div>`;
  }

  const partners = getFilteredPartners();
  if (!partners.length) {
    return '<div class="sp-empty">Контрагенты не найдены.</div>';
  }

  return `<div class="partner-list">${partners.map(partnerCardHtml).join('')}</div>`;
}

function partnersBlockHtml() {
  return `
    <section class="sp-card partners-block">
      <div class="sp-dashboard-block-head partners-block-head">
        <div>
          <h2>Контрагенты и контакты</h2>
          <div class="sp-muted partners-subtitle">Компании, перевозчики и контактные лица</div>
        </div>
        <button type="button" class="sp-btn" id="addPartnerBtn">
          <svg class="icon"><use href="#icon-plus"></use></svg>
          Добавить
        </button>
      </div>

      <div class="partners-toolbar">
        <input id="partnerSearchInput" type="search" value="${escapeHtml(partnersState.search)}" placeholder="Поиск компании или контакта...">
        <select id="partnerCategoryFilter">
          <option value="all" ${partnersState.category === 'all' ? 'selected' : ''}>Все категории</option>
          ${PARTNER_CATEGORIES.map(category => `<option value="${escapeHtml(category)}" ${partnersState.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
        </select>
      </div>

      ${partnersState.editingPartnerId === 'new' ? '' : partnersViewHtml()}

      ${partnersState.editingPartnerId === 'new' ? partnerFormHtml() : ''}
    </section>
  `;
}

function setupPartners() {
  if (!partnersState.loaded && !partnersState.loading) {
    loadPartnersFromSupabase().then(() => {
      if (document.getElementById('addPartnerBtn')) render();
    });
  }

  $('#addPartnerBtn')?.addEventListener('click', () => {
    partnersState.editingPartnerId = 'new';
    render();
  });

  $('#partnerSearchInput')?.addEventListener('input', event => {
    partnersState.search = event.target.value || '';

    const cursor = event.target.selectionStart ?? partnersState.search.length;
    render();

    requestAnimationFrame(() => {
      const input = document.getElementById('partnerSearchInput');
      if (!input) return;
      input.focus();
      const nextCursor = Math.min(cursor, input.value.length);
      input.setSelectionRange(nextCursor, nextCursor);
    });
  });

  $('#partnerCategoryFilter')?.addEventListener('change', event => {
    partnersState.category = event.target.value || 'all';
    render();
  });

  $all('[data-cancel-partner]').forEach(button => {
    button.addEventListener('click', () => {
      partnersState.editingPartnerId = null;
      render();
    });
  });

  $all('[data-save-partner]').forEach(button => {
    button.addEventListener('click', async () => {
      const form = button.closest('.partner-form');
      if (!form) return;

      const saved = await savePartner({
        name: form.querySelector('.partner-edit-name')?.value,
        category: form.querySelector('.partner-edit-category')?.value,
        phone: form.querySelector('.partner-edit-phone')?.value,
        email: form.querySelector('.partner-edit-email')?.value,
        website: form.querySelector('.partner-edit-website')?.value,
        city: form.querySelector('.partner-edit-city')?.value,
        address: form.querySelector('.partner-edit-address')?.value,
        tax_id: form.querySelector('.partner-edit-tax-id')?.value,
        registration_id: form.querySelector('.partner-edit-registration-id')?.value,
        comment: form.querySelector('.partner-edit-comment')?.value,
        favorite: !!form.querySelector('.partner-edit-favorite')?.checked,
        active: !!form.querySelector('.partner-edit-active')?.checked
      });

      if (saved) {
        render();
        toast('Контрагент сохранён');
      }
    });
  });

  $all('[data-edit-partner]').forEach(button => {
    button.addEventListener('click', () => {
      partnersState.editingPartnerId = button.dataset.editPartner;
      render();
    });
  });

  $all('[data-delete-partner]').forEach(button => {
    button.addEventListener('click', async () => {
      const deleted = await deletePartner(button.dataset.deletePartner);
      if (deleted) {
        render();
        toast('Контрагент удалён');
      }
    });
  });

  $all('[data-toggle-partner-favorite]').forEach(button => {
    button.addEventListener('click', async () => {
      const partner = partnerById(button.dataset.togglePartnerFavorite);
      if (!partner) return;

      try {
        const { data, error } = await supabaseClient
          .from('partners')
          .update({ favorite: !partner.favorite, updated_by: state.user?.email || null })
          .eq('id', partner.id)
          .select('*')
          .single();
        if (error) throw error;
        upsertPartnerLocal(data);
        render();
      } catch (error) {
        console.error('SKLADAPLAN PARTNERS favorite error:', error);
        toast('Не удалось изменить избранное: ' + (error.message || 'ошибка Supabase'), 'error');
      }
    });
  });

  $all('[data-toggle-partner]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.togglePartner;
      partnersState.expandedPartnerId = partnersSameId(partnersState.expandedPartnerId, id) ? null : id;
      render();
    });
  });

  $all('[data-add-contact]').forEach(button => {
    button.addEventListener('click', () => {
      partnersState.contactPartnerId = button.dataset.addContact;
      partnersState.editingContactId = null;
      render();
    });
  });

  $all('[data-cancel-contact]').forEach(button => {
    button.addEventListener('click', () => {
      partnersState.editingContactId = null;
      partnersState.contactPartnerId = null;
      render();
    });
  });

  $all('[data-edit-contact]').forEach(button => {
    button.addEventListener('click', () => {
      partnersState.editingContactId = button.dataset.editContact;
      partnersState.contactPartnerId = button.dataset.contactPartner;
      render();
    });
  });

  $all('[data-save-contact]').forEach(button => {
    button.addEventListener('click', async () => {
      const form = button.closest('.contact-form');
      if (!form) return;

      const saved = await saveContact({
        partner_id: button.dataset.saveContact,
        name: form.querySelector('.contact-edit-name')?.value,
        position: form.querySelector('.contact-edit-position')?.value,
        phone: form.querySelector('.contact-edit-phone')?.value,
        phone_extra: form.querySelector('.contact-edit-phone-extra')?.value,
        email: form.querySelector('.contact-edit-email')?.value,
        comment: form.querySelector('.contact-edit-comment')?.value,
        primary_contact: !!form.querySelector('.contact-edit-primary')?.checked,
        active: !!form.querySelector('.contact-edit-active')?.checked
      });

      if (saved) {
        render();
        toast('Контакт сохранён');
      }
    });
  });

  $all('[data-delete-contact]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Удалить этот контакт?')) return;

      const deleted = await deleteContact(
        button.dataset.deleteContact,
        button.dataset.contactPartner
      );

      if (deleted) {
        render();
        toast('Контакт удалён');
      }
    });
  });
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

    ${partnersBlockHtml()}

  `;

}


/* =========================================================
   SETUP — СТРАНИЦА «ЗАДАЧИ»
   ========================================================= */

function setupTasks() {

  setupPartners();

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
