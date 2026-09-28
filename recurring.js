/* =========================================================
   SKLADAPLAN — ПОВТОРЯЮЩИЕСЯ ЗАДАЧИ (РИТУАЛЫ)
   =========================================================

   Что делает:
   - Карточка «🔁 Ритуалы» в разделе «Задачи».
   - CRUD шаблонов: название, описание, приоритет,
     тип повторения (daily / weekly / interval).
   - Генератор: при входе в приложение проходит по активным
     шаблонам и создаёт задачи на сегодня (если ещё нет).

   Изоляция:
   - Не трогает app.js и tasks.js.
   - Оборачивает tasksView — добавляет свою карточку сверху.
   - Если что-то падает — оригинальный вид всё равно
     отработает.
   ========================================================= */

(function () {
  'use strict';
  if (window.spRecurring) return;

  const STYLES_ID = 'spRecurringStyles';
  const CARD_ID = 'spRecurringCard';
  const MODAL_ID = 'spRecurringModal';
  const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const GENERATE_COOLDOWN_MS = 60 * 60 * 1000; // не чаще раза в час

  let templates = [];
  let loading = false;
  let lastGenerateAt = 0;
  let scheduled = false;

  /* ============== БЕЗОПАСНЫЙ ДОСТУП ============== */

  function getSupabase() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  function getTasksState() {
    try { if (typeof tasksState !== 'undefined' && tasksState) return tasksState; } catch (e) {}
    if (window.tasksState) return window.tasksState;
    return null;
  }

  function getAppState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    if (window.state) return window.state;
    return null;
  }

  /* ============== УТИЛИТЫ ============== */

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'success');
    else console.log('[Recurring]', msg);
  }

  function todayKey() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatWeekdays(arr) {
    if (!Array.isArray(arr) || !arr.length) return '—';
    return arr
      .slice()
      .sort((a, b) => a - b)
      .map(n => DAYS_RU[n - 1] || '?')
      .join(' · ');
  }

  function repeatLabel(t) {
    if (t.repeat_type === 'daily') return '🔁 Каждый день';
    if (t.repeat_type === 'weekly') return '📅 ' + formatWeekdays(t.weekdays);
    if (t.repeat_type === 'interval') return `⏱ Каждые ${t.interval_days} дн.`;
    return '—';
  }

  /* ============== ЛОГИКА: НУЖНА ЛИ ГЕНЕРАЦИЯ НА ДАТУ ============== */

  function shouldRunOn(template, dateKey) {
    const t = String(template.repeat_type || '').toLowerCase();

    /* Раньше даты старта — не генерируем */
    if (template.starts_on && dateKey < String(template.starts_on).slice(0, 10)) {
      return false;
    }

    if (t === 'daily') return true;

    if (t === 'weekly') {
      const dow = new Date(dateKey + 'T00:00:00').getDay(); // 0=Вс..6=Сб
      const ru = dow === 0 ? 7 : dow; // 1..7 = Пн..Вс
      return Array.isArray(template.weekdays) && template.weekdays.includes(ru);
    }

    if (t === 'interval') {
      const n = Number(template.interval_days) || 0;
      if (n < 1) return false;
      const startKey = String(template.starts_on || template.created_at || '').slice(0, 10);
      if (!startKey) return false;
      const startD = new Date(startKey + 'T00:00:00').getTime();
      const thisD = new Date(dateKey + 'T00:00:00').getTime();
      const days = Math.floor((thisD - startD) / 86400000);
      return days >= 0 && days % n === 0;
    }

    return false;
  }

  /* ============== ЗАГРУЗКА / CRUD ШАБЛОНОВ ============== */

  async function loadTemplates() {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('task_templates')
      .select('*')
      .order('active', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Recurring] load error:', error);
      return [];
    }
    return data || [];
  }

  async function saveTemplate(payload, id) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');

    const op = getAppState()?.user?.email || null;
    const now = new Date().toISOString();

    if (id) {
      const { error } = await client
        .from('task_templates')
        .update({ ...payload, updated_by: op, updated_at: now })
        .eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await client
        .from('task_templates')
        .insert({ ...payload, created_by: op, updated_by: op });
      if (error) throw error;
    }
  }

  async function deleteTemplate(id) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');
    const { error } = await client.from('task_templates').delete().eq('id', id);
    if (error) throw error;
  }

  async function toggleTemplateActive(id, active) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase-клиент недоступен');
    const { error } = await client
      .from('task_templates')
      .update({ active: !!active, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  /* ============== ГЕНЕРАТОР ============== */

  async function generateForDate(dateKey) {
    const client = getSupabase();
    if (!client) return { created: 0 };

    if (!templates.length) {
      templates = await loadTemplates();
    }

    const activeTemplates = templates.filter(t => t.active);
    if (!activeTemplates.length) return { created: 0 };

    /* Что уже есть на эту дату — чтобы не создавать дубли */
    const { data: existing } = await client
      .from('tasks')
      .select('template_id')
      .eq('due_date', dateKey)
      .not('template_id', 'is', null);

    const already = new Set((existing || []).map(r => String(r.template_id)));

    /* Какие шаблоны должны сработать на эту дату */
    const toCreate = activeTemplates.filter(t =>
      shouldRunOn(t, dateKey) && !already.has(String(t.id))
    );

    if (!toCreate.length) return { created: 0 };

    const op = getAppState()?.user?.email || null;

    const payload = toCreate.map(t => ({
      title: t.title,
      description: t.description || '',
      priority: t.priority || 'medium',
      favorite: !!t.favorite,
      completed: false,
      due_date: dateKey,
      template_id: t.id,
      created_by: op,
      updated_by: op
    }));

    const { data: inserted, error } = await client
      .from('tasks')
      .insert(payload)
      .select('*');

    if (error) {
      /* Если конфликт по уникальному индексу — значит гонка,
         просто игнорируем, ничего критичного */
      console.warn('[Recurring] generate error:', error);
      return { created: 0, error: error.message };
    }

    /* Подкладываем новые задачи в tasksState, если он доступен */
    const ts = getTasksState();
    if (ts && Array.isArray(ts.items) && Array.isArray(inserted)) {
      ts.items.unshift(...inserted);
    }

    return { created: (inserted || []).length };
  }

  async function runGeneration(silent) {
    const now = Date.now();
    if (now - lastGenerateAt < GENERATE_COOLDOWN_MS) {
      /* Слишком частый вызов — пропускаем */
      return { created: 0, skipped: true };
    }
    lastGenerateAt = now;

    try {
      const res = await generateForDate(todayKey());
      if (!silent && res.created > 0) {
        toast(`Создано ритуальных задач: ${res.created}`);
      }
      if (res.created > 0) {
        /* Перерисовываем текущую страницу, чтобы задачи сразу появились */
        if (typeof window.render === 'function') window.render();
      }
      return res;
    } catch (e) {
      console.warn('[Recurring] generation error:', e);
      return { created: 0, error: e.message };
    }
  }

  /* ============== UI: КАРТОЧКА В РАЗДЕЛЕ «ЗАДАЧИ» ============== */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${CARD_ID} h3 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
      }
      #${CARD_ID} .sp-rec-sub {
        margin: 0 0 14px;
        font-size: 13px;
        color: #64748b;
        line-height: 1.4;
      }
      #${CARD_ID} .sp-rec-toolbar {
        display: flex; gap: 8px; flex-wrap: wrap;
        margin-bottom: 12px;
        justify-content: space-between;
        align-items: center;
      }
      #${CARD_ID} .sp-rec-btn {
        border: 0; border-radius: 9px;
        padding: 9px 14px; font-size: 13px; font-weight: 600;
        cursor: pointer; font-family: inherit;
        display: inline-flex; align-items: center; gap: 6px;
      }
      #${CARD_ID} .sp-rec-btn-primary { background: var(--primary, #2563EB); color: #fff; }
      #${CARD_ID} .sp-rec-btn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${CARD_ID} .sp-rec-btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
      #${CARD_ID} .sp-rec-btn-secondary:hover { background: #e2e8f0; }

      #${CARD_ID} .sp-rec-list { display: flex; flex-direction: column; gap: 8px; }
      #${CARD_ID} .sp-rec-item {
        display: flex; align-items: center; gap: 12px;
        padding: 11px 14px;
        border: 1px solid #e2e8f0;
        border-radius: 11px;
        background: #fff;
      }
      #${CARD_ID} .sp-rec-item.is-inactive { opacity: .55; }
      #${CARD_ID} .sp-rec-item-body { flex: 1; min-width: 0; }
      #${CARD_ID} .sp-rec-title {
        font-size: 14px; font-weight: 600; color: #0f172a;
        word-break: break-word;
      }
      #${CARD_ID} .sp-rec-meta {
        margin-top: 3px;
        display: flex; gap: 8px; flex-wrap: wrap;
        font-size: 11px; color: #64748b;
      }
      #${CARD_ID} .sp-rec-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px; font-weight: 700;
      }
      #${CARD_ID} .sp-rec-badge-on  { background: #dcfce7; color: #166534; }
      #${CARD_ID} .sp-rec-badge-off { background: #f1f5f9; color: #64748b; }
      #${CARD_ID} .sp-rec-badge-pri-low  { background: #dbeafe; color: #1e40af; }
      #${CARD_ID} .sp-rec-badge-pri-med  { background: #fef3c7; color: #92400e; }
      #${CARD_ID} .sp-rec-badge-pri-high { background: #fee2e2; color: #991b1b; }
      #${CARD_ID} .sp-rec-actions {
        display: flex; gap: 4px; flex-shrink: 0;
      }
      #${CARD_ID} .sp-rec-icon-btn {
        width: 30px; height: 30px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        color: #475569;
        cursor: pointer;
        font-size: 13px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      #${CARD_ID} .sp-rec-icon-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
      #${CARD_ID} .sp-rec-icon-btn.sp-rec-danger:hover {
        background: #fef2f2; color: #b42318; border-color: #fecaca;
      }
      #${CARD_ID} .sp-rec-empty {
        padding: 20px;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
        background: #f8fafc;
        border-radius: 11px;
      }
      #${CARD_ID} .sp-rec-loading {
        padding: 16px;
        text-align: center;
        color: #64748b;
        font-size: 13px;
      }

      /* Модалка */
      #${MODAL_ID} {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100014;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-rec-modal {
        background: #fff;
        border-radius: 16px;
        width: 100%; max-width: 520px;
        max-height: 92vh;
        overflow-y: auto;
        padding: 22px;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} h3 { margin: 0 0 4px; font-size: 17px; font-weight: 700; }
      #${MODAL_ID} .sp-rec-modal-sub {
        margin: 0 0 18px; font-size: 13px; color: #64748b;
      }
      #${MODAL_ID} .sp-rec-field { display: block; margin-bottom: 12px; }
      #${MODAL_ID} .sp-rec-field > span {
        display: block; font-size: 12px; font-weight: 600;
        color: #475569; margin-bottom: 5px;
      }
      #${MODAL_ID} .sp-rec-field input,
      #${MODAL_ID} .sp-rec-field select,
      #${MODAL_ID} .sp-rec-field textarea {
        width: 100%; box-sizing: border-box;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 10px 12px; font-size: 13px; outline: none; background: #fff;
        font-family: inherit;
      }
      #${MODAL_ID} .sp-rec-field textarea { min-height: 60px; resize: vertical; }
      #${MODAL_ID} .sp-rec-field input:focus,
      #${MODAL_ID} .sp-rec-field select:focus,
      #${MODAL_ID} .sp-rec-field textarea:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      #${MODAL_ID} .sp-rec-days {
        display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
      }
      #${MODAL_ID} .sp-rec-day {
        display: inline-flex; align-items: center;
        gap: 6px;
        padding: 6px 11px;
        border: 1px solid #dfe3e8;
        border-radius: 999px;
        cursor: pointer;
        font-size: 12px;
        background: #fff;
      }
      #${MODAL_ID} .sp-rec-day input { margin: 0; accent-color: var(--primary, #2563EB); cursor: pointer; }
      #${MODAL_ID} .sp-rec-day.is-checked {
        background: #eff6ff; border-color: #93c5fd;
      }
      #${MODAL_ID} .sp-rec-hint {
        font-size: 11px; color: #94a3b8;
        margin-top: -4px; margin-bottom: 10px;
      }
      #${MODAL_ID} .sp-rec-foot {
        display: flex; gap: 8px; justify-content: flex-end;
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid #eef1f4;
      }
      #${MODAL_ID} .sp-rec-fbtn {
        border: 0; border-radius: 9px; padding: 11px 18px;
        font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
      }
      #${MODAL_ID} .sp-rec-fbtn-primary { background: var(--primary, #2563EB); color: #fff; }
      #${MODAL_ID} .sp-rec-fbtn-primary:hover { background: var(--primary-hover, #1D4ED8); }
      #${MODAL_ID} .sp-rec-fbtn-secondary {
        background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0;
      }
      #${MODAL_ID} .sp-rec-fbtn-secondary:hover { background: #e2e8f0; }
      #${MODAL_ID} .sp-rec-err {
        margin: 6px 0 0;
        padding: 10px 12px;
        background: #fef2f2; color: #991b1b;
        border-radius: 8px; font-size: 12px;
      }

      @media (max-width: 640px) {
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-rec-modal {
          max-width: none; height: 100vh; max-height: 100vh;
          border-radius: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderCard() {
    if (document.getElementById(CARD_ID)) {
      /* если карточка уже есть — просто обновим список */
      renderList();
      return;
    }

    /* Вставляем карточку сверху в разделе «Задачи» —
       перед первой .sp-card в этом разделе */
    const content = document.getElementById('content');
    if (!content) return;

    /* Признак: страница «Задачи» — есть форма «Новая задача» с id taskTitleInput */
    if (!document.getElementById('taskTitleInput')) {
      /* не на странице задач — не вставляем */
      return;
    }

    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'sp-card';
    card.style.marginBottom = '16px';
    card.innerHTML = `
      <h3>🔁 Ежедневные ритуалы</h3>
      <p class="sp-rec-sub">
        Задачи, которые повторяются по расписанию. SKLADAPLAN сам создаст их на сегодня
        при входе в приложение.
      </p>
      <div class="sp-rec-toolbar">
        <button type="button" class="sp-rec-btn sp-rec-btn-primary" id="spRecAddBtn">
          <span>+</span> Добавить ритуал
        </button>
        <button type="button" class="sp-rec-btn sp-rec-btn-secondary" id="spRecGenerateBtn">
          ↻ Создать задачи на сегодня
        </button>
      </div>
      <div id="spRecList"><div class="sp-rec-loading">Загрузка…</div></div>
    `;

    /* Куда вставить: перед первой карточкой в #content */
    const firstCard = content.querySelector('.sp-card');
    if (firstCard && firstCard.parentNode === content) {
      content.insertBefore(card, firstCard);
    } else {
      content.insertBefore(card, content.firstChild);
    }

    document.getElementById('spRecAddBtn')?.addEventListener('click', () => openModal(null));
    document.getElementById('spRecGenerateBtn')?.addEventListener('click', async () => {
      lastGenerateAt = 0; /* сбрасываем кулдаун для ручного нажатия */
      const res = await runGeneration(false);
      if (res.created === 0) toast('Новых ритуальных задач на сегодня нет');
      renderList();
    });

    renderList();
  }

  async function renderList() {
    const container = document.getElementById('spRecList');
    if (!container) return;

    container.innerHTML = '<div class="sp-rec-loading">Загрузка…</div>';

    if (loading) return;
    loading = true;

    try {
      templates = await loadTemplates();

      if (!templates.length) {
        container.innerHTML = `
          <div class="sp-rec-empty">
            Пока нет ни одного ритуала.<br>
            <span style="font-size:11px;">Например: «Каждое утро проверить поддон у ворот».</span>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="sp-rec-list">
          ${templates.map(t => {
            const isActive = !!t.active;

            const priClass =
              t.priority === 'high' ? 'sp-rec-badge-pri-high' :
              t.priority === 'low'  ? 'sp-rec-badge-pri-low'  :
              'sp-rec-badge-pri-med';

            const priLabel =
              t.priority === 'high' ? 'Высокий' :
              t.priority === 'low'  ? 'Низкий'  : 'Средний';

            return `
              <div class="sp-rec-item ${isActive ? '' : 'is-inactive'}">
                <div class="sp-rec-item-body">
                  <div class="sp-rec-title">${escapeHtml(t.title)}</div>
                  ${t.description ? `<div class="sp-rec-meta">${escapeHtml(t.description)}</div>` : ''}
                  <div class="sp-rec-meta">
                    <span>${escapeHtml(repeatLabel(t))}</span>
                    <span class="sp-rec-badge ${priClass}">${priLabel}</span>
                    <span class="sp-rec-badge ${isActive ? 'sp-rec-badge-on' : 'sp-rec-badge-off'}">
                      ${isActive ? 'Активен' : 'Выключен'}
                    </span>
                  </div>
                </div>
                <div class="sp-rec-actions">
                  <button type="button" class="sp-rec-icon-btn"
                    data-rec-toggle="${escapeHtml(t.id)}"
                    title="${isActive ? 'Выключить' : 'Включить'}"
                  >${isActive ? '⏸' : '▶'}</button>
                  <button type="button" class="sp-rec-icon-btn"
                    data-rec-edit="${escapeHtml(t.id)}"
                    title="Изменить"
                  >✎</button>
                  <button type="button" class="sp-rec-icon-btn sp-rec-danger"
                    data-rec-delete="${escapeHtml(t.id)}"
                    title="Удалить"
                  >×</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      /* Обработчики */
      container.querySelectorAll('[data-rec-toggle]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-rec-toggle');
          const t = templates.find(x => x.id === id);
          if (!t) return;
          try {
            await toggleTemplateActive(id, !t.active);
            await renderList();
          } catch (e) {
            toast('Ошибка: ' + (e.message || ''), 'error');
          }
        });
      });

      container.querySelectorAll('[data-rec-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-rec-edit');
          const t = templates.find(x => x.id === id);
          if (t) openModal(t);
        });
      });

      container.querySelectorAll('[data-rec-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-rec-delete');
          const t = templates.find(x => x.id === id);
          if (!t) return;
          if (!confirm(`Удалить ритуал «${t.title}»?\n\nРанее созданные задачи останутся в списке.`)) return;
          try {
            await deleteTemplate(id);
            toast('Ритуал удалён');
            await renderList();
          } catch (e) {
            toast('Ошибка: ' + (e.message || ''), 'error');
          }
        });
      });

    } catch (e) {
      console.error('[Recurring] renderList error:', e);
      container.innerHTML = `<div class="sp-rec-empty">Ошибка загрузки: ${escapeHtml(e.message || '')}</div>`;
    } finally {
      loading = false;
    }
  }

  /* ============== МОДАЛКА РЕДАКТИРОВАНИЯ ============== */

  function openModal(existing) {
    if (document.getElementById(MODAL_ID)) return;

    const isEdit = !!existing;
    const t = existing || {
      title: '',
      description: '',
      priority: 'medium',
      favorite: false,
      repeat_type: 'daily',
      weekdays: [],
      interval_days: 3,
      starts_on: todayKey(),
      active: true
    };

    const selectedWeekdays = new Set(Array.isArray(t.weekdays) ? t.weekdays : []);

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-rec-modal">
        <h3>${isEdit ? 'Изменить ритуал' : 'Новый ритуал'}</h3>
        <p class="sp-rec-modal-sub">
          Задача будет автоматически создаваться на сегодня,
          если подходит под расписание.
        </p>

        <label class="sp-rec-field">
          <span>Название задачи</span>
          <input id="spRecTitle" type="text" value="${escapeHtml(t.title)}"
            placeholder="Например: Проверить поддон у ворот">
        </label>

        <label class="sp-rec-field">
          <span>Описание (необязательно)</span>
          <textarea id="spRecDesc" placeholder="Дополнительно">${escapeHtml(t.description || '')}</textarea>
        </label>

        <label class="sp-rec-field">
          <span>Приоритет</span>
          <select id="spRecPriority">
            <option value="low" ${t.priority === 'low' ? 'selected' : ''}>Низкий</option>
            <option value="medium" ${t.priority === 'medium' ? 'selected' : ''}>Средний</option>
            <option value="high" ${t.priority === 'high' ? 'selected' : ''}>Высокий</option>
          </select>
        </label>

        <label class="sp-rec-field">
          <span>Тип повторения</span>
          <select id="spRecRepeat">
            <option value="daily" ${t.repeat_type === 'daily' ? 'selected' : ''}>Каждый день</option>
            <option value="weekly" ${t.repeat_type === 'weekly' ? 'selected' : ''}>По дням недели</option>
            <option value="interval" ${t.repeat_type === 'interval' ? 'selected' : ''}>Каждые N дней</option>
          </select>
        </label>

        <div id="spRecWeeklyBlock" style="display:${t.repeat_type === 'weekly' ? 'block' : 'none'};">
          <div class="sp-rec-field">
            <span>Дни недели</span>
            <div class="sp-rec-days">
              ${DAYS_RU.map((label, i) => {
                const n = i + 1;
                const checked = selectedWeekdays.has(n);
                return `
                  <label class="sp-rec-day ${checked ? 'is-checked' : ''}">
                    <input type="checkbox" data-rec-day="${n}" ${checked ? 'checked' : ''}>
                    ${label}
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div id="spRecIntervalBlock" style="display:${t.repeat_type === 'interval' ? 'block' : 'none'};">
          <label class="sp-rec-field">
            <span>Каждые N дней</span>
            <input id="spRecInterval" type="number" min="1" max="365"
              value="${escapeHtml(t.interval_days || 3)}">
          </label>
          <div class="sp-rec-hint">Отсчёт идёт от даты старта (см. ниже).</div>
        </div>

        <label class="sp-rec-field">
          <span>Дата старта</span>
          <input id="spRecStartsOn" type="date"
            value="${escapeHtml(String(t.starts_on || todayKey()).slice(0, 10))}">
        </label>

        <label class="sp-rec-field" style="display:flex;align-items:center;gap:8px;flex-direction:row;">
          <input type="checkbox" id="spRecFavorite" ${t.favorite ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--primary, #2563EB);">
          <span style="margin:0;">Добавлять в избранное</span>
        </label>

        <label class="sp-rec-field" style="display:flex;align-items:center;gap:8px;flex-direction:row;">
          <input type="checkbox" id="spRecActive" ${t.active !== false ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--primary, #2563EB);">
          <span style="margin:0;">Активен</span>
        </label>

        <div id="spRecErr"></div>

        <div class="sp-rec-foot">
          <button type="button" class="sp-rec-fbtn sp-rec-fbtn-secondary" id="spRecCancel">Отмена</button>
          <button type="button" class="sp-rec-fbtn sp-rec-fbtn-primary" id="spRecSave">
            ${isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('spRecCancel').addEventListener('click', close);

    /* Переключение блоков в зависимости от типа */
    const repeatSel = document.getElementById('spRecRepeat');
    const weeklyBlock = document.getElementById('spRecWeeklyBlock');
    const intervalBlock = document.getElementById('spRecIntervalBlock');

    repeatSel.addEventListener('change', () => {
      const v = repeatSel.value;
      weeklyBlock.style.display = v === 'weekly' ? 'block' : 'none';
      intervalBlock.style.display = v === 'interval' ? 'block' : 'none';
    });

    /* Подсветка выбранных дней */
    overlay.querySelectorAll('[data-rec-day]').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('.sp-rec-day').classList.toggle('is-checked', cb.checked);
      });
    });

    const escHandler = e => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    /* Сохранение */
    document.getElementById('spRecSave').addEventListener('click', async () => {
      const btn = document.getElementById('spRecSave');
      const errEl = document.getElementById('spRecErr');

      const title = (document.getElementById('spRecTitle')?.value || '').trim();
      const description = (document.getElementById('spRecDesc')?.value || '').trim();
      const priority = document.getElementById('spRecPriority')?.value || 'medium';
      const repeat_type = repeatSel.value;
      const weekdays = [...overlay.querySelectorAll('[data-rec-day]:checked')]
        .map(cb => Number(cb.getAttribute('data-rec-day')));
      const interval_days = Number(document.getElementById('spRecInterval')?.value || 0) || null;
      const starts_on = document.getElementById('spRecStartsOn')?.value || todayKey();
      const favorite = !!document.getElementById('spRecFavorite')?.checked;
      const active = !!document.getElementById('spRecActive')?.checked;

      if (!title) {
        errEl.innerHTML = '<div class="sp-rec-err">Укажите название задачи</div>';
        return;
      }

      if (repeat_type === 'weekly' && !weekdays.length) {
        errEl.innerHTML = '<div class="sp-rec-err">Выберите хотя бы один день недели</div>';
        return;
      }

      if (repeat_type === 'interval' && (!interval_days || interval_days < 1)) {
        errEl.innerHTML = '<div class="sp-rec-err">Укажите интервал в днях (≥ 1)</div>';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Сохранение…';
      errEl.innerHTML = '';

      const payload = {
        title,
        description,
        priority,
        favorite,
        active,
        repeat_type,
        weekdays: repeat_type === 'weekly' ? weekdays : [],
        interval_days: repeat_type === 'interval' ? interval_days : null,
        starts_on
      };

      try {
        await saveTemplate(payload, isEdit ? existing.id : null);
        toast(isEdit ? 'Ритуал обновлён' : 'Ритуал создан');
        close();
        await renderList();
      } catch (e) {
        console.error('[Recurring] save error:', e);
        errEl.innerHTML = `<div class="sp-rec-err">Ошибка: ${escapeHtml(e.message || '')}</div>`;
        btn.disabled = false;
        btn.textContent = isEdit ? 'Сохранить' : 'Создать';
      }
    });

    /* Фокус на первое поле */
    setTimeout(() => document.getElementById('spRecTitle')?.focus(), 30);
  }

  /* ============== ХУКИ В TASKS.JS ============== */

  function installHooks() {
    if (typeof window.tasksView !== 'function') return false;
    if (window.tasksView.__recWrapped) return true;

    const originalView = window.tasksView;
    const originalSetup = window.setupTasks;

    const wrappedView = function () {
      /* Не вставляем ничего в HTML — вставим DOM-элемент
         после отрисовки, из setup() */
      return originalView.apply(this, arguments);
    };
    wrappedView.__recWrapped = true;
    window.tasksView = wrappedView;

    if (typeof originalSetup === 'function') {
      window.setupTasks = function () {
        originalSetup.apply(this, arguments);

        /* После setup — вставляем карточку (или только список
           если она уже есть) */
        setTimeout(() => {
          try { renderCard(); } catch (e) { console.warn('[Recurring] renderCard:', e); }
        }, 40);
      };
    }

    console.log('[Recurring] Хуки установлены');
    return true;
  }

  /* ============== ИНИЦИАЛИЗАЦИЯ ============== */

  function init() {
    injectStyles();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installHooks, { once: true });
    } else {
      installHooks();
    }

    setTimeout(installHooks, 300);
    setTimeout(installHooks, 1500);
    setTimeout(installHooks, 4000);

    /* Генерация — с задержкой, чтобы app.js успел загрузить задачи */
    setTimeout(() => {
      runGeneration(true).catch(() => {});
    }, 6000);

    console.log('[Recurring] Модуль инициализирован');
  }

  init();

  window.spRecurring = {
    reload: async () => {
      templates = await loadTemplates();
      renderList();
    },
    generate: () => {
      lastGenerateAt = 0;
      return runGeneration(false);
    },
    version: '1.0.0'
  };

})();
