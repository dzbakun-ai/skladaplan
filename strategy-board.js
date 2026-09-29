/* =========================================================
   SKLADAPLAN — СТРАТЕГИЧЕСКАЯ КАРТА
   Доска планов развития склада с нодами и связями.
   Встраивается как новая вкладка в «Планирование».
   ========================================================= */

(function () {
  'use strict';
  if (window.spStrategyBoard) return;

  const STYLES_ID = 'spStrategyBoardStyles';
  const NODES_KEY = 'sp-strategy-nodes-v1';
  const EDGES_KEY = 'sp-strategy-edges-v1';
  const VIEW_KEY  = 'sp-strategy-view-v1';
  const ACTIVE_KEY = 'sp-strategy-active';
  const SWITCHER_CLASS = 'sp-up-modes';

  const NODE_TYPES = {
    goal:    { label: 'Цель',     icon: '🎯', color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd' },
    idea:    { label: 'Идея',     icon: '💡', color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
    step:    { label: 'Шаг',      icon: '🔨', color: '#047857', bg: '#ecfdf5', border: '#6ee7b7' },
    problem: { label: 'Проблема', icon: '⚠️', color: '#b42318', bg: '#fef2f2', border: '#fca5a5' },
    note:    { label: 'Заметка',  icon: '📝', color: '#334155', bg: '#f8fafc', border: '#cbd5e1' }
  };
  const STATUSES = {
    idea:        { label: 'Идея',      icon: '💡', color: '#94a3b8' },
    planned:     { label: 'В планах',  icon: '📋', color: '#3b82f6' },
    in_progress: { label: 'В работе',  icon: '🔨', color: '#f59e0b' },
    done:        { label: 'Готово',    icon: '✅', color: '#10b981' }
  };

  let st = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  let selectedId = null;
  let drag = null;     // node dragging
  let pan = null;      // canvas panning
  let connect = null;  // connecting line

  /* ============ STORAGE ============ */

  function load() {
    try {
      st.nodes = JSON.parse(localStorage.getItem(NODES_KEY) || '[]');
      st.edges = JSON.parse(localStorage.getItem(EDGES_KEY) || '[]');
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (v && typeof v === 'object') st.viewport = v;
      if (!Array.isArray(st.nodes)) st.nodes = [];
      if (!Array.isArray(st.edges)) st.edges = [];
    } catch (e) {
      st = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    }
  }
  function save() {
    try {
      localStorage.setItem(NODES_KEY, JSON.stringify(st.nodes));
      localStorage.setItem(EDGES_KEY, JSON.stringify(st.edges));
      localStorage.setItem(VIEW_KEY, JSON.stringify(st.viewport));
    } catch (e) {}
  }

  /* ============ UTILS ============ */

  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }

  function isActive() { try { return localStorage.getItem(ACTIVE_KEY) === '1'; } catch (e) { return false; } }
  function setActive(v) {
    try { v ? localStorage.setItem(ACTIVE_KEY, '1') : localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
  }

  function nodeById(id) { return st.nodes.find(n => n.id === id); }
  function edgeById(id) { return st.edges.find(e => e.id === id); }

  /* ============ ШАБЛОН ============ */

  function loadTemplate() {
    const n = (id, x, y, w, h, type, status, title, text) =>
      ({ id, x, y, w, h, type, status, title, text });
    const e = (from, to) => ({ id: uid('e'), from, to });

    const g1 = 'g_' + Date.now();
    const i1 = 'i1_' + Date.now(), i2 = 'i2_' + Date.now(), i3 = 'i3_' + Date.now();
    const s1 = 's1_' + Date.now(), s2 = 's2_' + Date.now(), s3 = 's3_' + Date.now();
    const s4 = 's4_' + Date.now(), s5 = 's5_' + Date.now(), s6 = 's6_' + Date.now();

    st.nodes = [
      n(g1, 420, 40, 300, 110, 'goal', 'planned',
        'Развитие склада 2027',
        'Стратегический план: что хотим получить к концу следующего года.'),
      n(i1, 60, 260, 280, 130, 'idea', 'planned',
        'Увеличить пропускную способность',
        'Больше коробок в час при том же количестве людей.'),
      n(i2, 420, 260, 280, 130, 'idea', 'planned',
        'Снизить ошибки сборки',
        'Меньше пересортицы и возвратов от клиентов.'),
      n(i3, 780, 260, 280, 130, 'idea', 'idea',
        'Ускорить приёмку и отгрузку',
        'Сократить время на обработку одной машины.'),
      n(s1, 20, 470, 260, 120, 'step', 'idea',
        'Второй стационарный сканер',
        'Поставить в зоне приёмки и отгрузки.'),
      n(s2, 300, 470, 260, 120, 'step', 'idea',
        'Мобильный сканер + рюкзак',
        'Для инвентаризации прямо с пола.'),
      n(s3, 380, 470, 260, 120, 'step', 'planned',
        'Обязательное сканирование при комплектации',
        'Каждая коробка сканируется дважды: взял / положил.'),
      n(s4, 660, 470, 260, 120, 'step', 'idea',
        'Автопроверка веса',
        'Весы на выходе сверяют вес паллета.'),
      n(s5, 800, 470, 260, 120, 'step', 'idea',
        'Предпечатные этикетки',
        'Печатать наклейки заранее по ТТН.'),
      n(s6, 1080, 470, 260, 120, 'step', 'idea',
        'Интеграция с ТТН перевозчика',
        'Подтягивать данные из накладных автоматически.')
    ];

    st.edges = [
      e(g1, i1), e(g1, i2), e(g1, i3),
      e(i1, s1), e(i1, s2),
      e(i2, s3), e(i2, s4),
      e(i3, s5), e(i3, s6)
    ];

    st.viewport = { x: 20, y: 20, zoom: 0.75 };
    save();
  }

  /* ============ ВЁРСТКА ============ */

  function buildView() {
    return `
      <div class="sp-sb-wrap">
        <div class="sp-sb-toolbar">
          <button type="button" class="sp-sb-btn sp-sb-btn-primary" data-sb-new>
            <span>+</span> Новый узел
          </button>
          <div class="sp-sb-sep"></div>
          <button type="button" class="sp-sb-btn" data-sb-fit title="Показать все ноды">⤢ Показать всё</button>
          <button type="button" class="sp-sb-btn" data-sb-zoom-out title="Уменьшить">−</button>
          <span class="sp-sb-zoom" data-sb-zoom>100%</span>
          <button type="button" class="sp-sb-btn" data-sb-zoom-in title="Увеличить">+</button>
          <div class="sp-sb-sep"></div>
          <button type="button" class="sp-sb-btn" data-sb-template title="Загрузить пример «Развитие склада»">✨ Пример</button>
          <button type="button" class="sp-sb-btn sp-sb-btn-danger" data-sb-clear>Очистить</button>
          <div class="sp-sb-spacer"></div>
          <span class="sp-sb-hint">Клик по ✎ — редактировать · Тянуть от ● к ● — связать</span>
        </div>
        <div class="sp-sb-canvas" data-sb-canvas>
          <div class="sp-sb-pan" data-sb-pan>
            <svg class="sp-sb-svg" data-sb-svg xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="spSbArrow" viewBox="0 0 10 10" refX="9" refY="5"
                        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/>
                </marker>
              </defs>
              <g data-sb-edges></g>
              <path data-sb-temp-line style="display:none" stroke="#2563EB" stroke-width="2"
                    fill="none" stroke-dasharray="6 4" marker-end="url(#spSbArrow)"/>
            </svg>
            <div class="sp-sb-nodes" data-sb-nodes></div>
          </div>
          <div class="sp-sb-empty" data-sb-empty>
            <div class="sp-sb-empty-icon">🗺️</div>
            <div class="sp-sb-empty-title">Пока пусто</div>
            <div class="sp-sb-empty-text">
              Создайте первую ноду или загрузите пример, чтобы увидеть, как это работает.
            </div>
            <button type="button" class="sp-sb-btn sp-sb-btn-primary" data-sb-new-empty>
              + Создать первую ноду
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function nodeHtml(n) {
    const t = NODE_TYPES[n.type] || NODE_TYPES.note;
    const s = STATUSES[n.status] || STATUSES.idea;
    return `
      <div class="sp-sb-node" data-node-id="${esc(n.id)}"
           style="left:${n.x}px; top:${n.y}px; width:${n.w}px;
                  background:${t.bg}; border-color:${t.border}; color:${t.color};">
        <div class="sp-sb-node-head" data-drag-handle>
          <span class="sp-sb-node-icon">${t.icon}</span>
          <span class="sp-sb-node-title">${esc(n.title || '(без названия)')}</span>
          <button type="button" class="sp-sb-node-edit" data-node-edit title="Редактировать">✎</button>
          <button type="button" class="sp-sb-node-del" data-node-del title="Удалить">×</button>
        </div>
        ${n.text ? `<div class="sp-sb-node-body">${esc(n.text)}</div>` : ''}
        <div class="sp-sb-node-foot">
          <span class="sp-sb-status" style="background:${s.color}1a; color:${s.color}; border-color:${s.color}40;">
            ${s.icon} ${esc(s.label)}
          </span>
        </div>
        <span class="sp-sb-port sp-sb-port-in"  data-port-in  title="Входящая связь"></span>
        <span class="sp-sb-port sp-sb-port-out" data-port-out title="Тянуть к другой ноде"></span>
      </div>
    `;
  }

  /* ============ РЕНДЕР ============ */

  function renderNodes() {
    const host = document.querySelector('[data-sb-nodes]');
    if (!host) return;
    host.innerHTML = st.nodes.map(nodeHtml).join('');
    bindNodeHandlers();
  }

  function renderEdges() {
    const g = document.querySelector('[data-sb-edges]');
    if (!g) return;
    g.innerHTML = st.edges.map(edgePathHtml).join('');

    /* Обработчики удаления рёбер (крестик в середине) */
    g.querySelectorAll('[data-edge-del]').forEach(x => {
      x.addEventListener('click', ev => {
        ev.stopPropagation();
        const id = x.getAttribute('data-edge-del');
        st.edges = st.edges.filter(e => e.id !== id);
        save(); renderEdges();
      });
    });
  }

  function edgePathHtml(e) {
    const a = nodeById(e.from), b = nodeById(e.to);
    if (!a || !b) return '';
    const p = computeEdgePoints(a, b);
    const mx = (p.x1 + p.x2) / 2, my = (p.y1 + p.y2) / 2;
    return `
      <path d="M${p.x1},${p.y1} C${p.x1 + p.dx * 0.4},${p.y1} ${p.x2 - p.dx * 0.4},${p.y2} ${p.x2},${p.y2}"
            stroke="#94a3b8" stroke-width="2" fill="none"
            marker-end="url(#spSbArrow)"/>
      <circle cx="${mx}" cy="${my}" r="10" fill="#fff" stroke="#e2e8f0" data-edge-del="${esc(e.id)}"
              style="cursor:pointer; opacity:0"/>
      <text x="${mx}" y="${my + 4}" text-anchor="middle" font-size="11" fill="#94a3b8"
            data-edge-del="${esc(e.id)}" style="cursor:pointer; opacity:0">×</text>
    `;
  }

  /* Показываем крестик при наведении: используем CSS-правило через класс
     на родителе. Пока проще через CSS-селектор по <g>:  */
  function setupEdgeHoverCss() {
    if (document.getElementById('spSbEdgeHoverCss')) return;
    const s = document.createElement('style');
    s.id = 'spSbEdgeHoverCss';
    s.textContent = `
      .sp-sb-svg g[data-sb-edges] > [data-edge-del] { opacity: 0; transition: opacity .12s ease; }
      .sp-sb-svg:hover g[data-sb-edges] > [data-edge-del] { opacity: .85; }
      .sp-sb-svg g[data-sb-edges] > [data-edge-del]:hover { opacity: 1; }
    `;
    document.head.appendChild(s);
  }

  function computeEdgePoints(a, b) {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x,       y2 = b.y + b.h / 2;
    return { x1, y1, x2, y2, dx: x2 - x1 };
  }

  function applyViewport() {
    const pan = document.querySelector('[data-sb-pan]');
    if (!pan) return;
    const v = st.viewport;
    pan.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    pan.style.transformOrigin = '0 0';
    const zoomEl = document.querySelector('[data-sb-zoom]');
    if (zoomEl) zoomEl.textContent = Math.round(v.zoom * 100) + '%';
  }

  /* ============ ОПЕРАЦИИ С НОДАМИ ============ */

  function createNode(opts = {}) {
    const id = uid('n');
    const cx = -(st.viewport.x) / st.viewport.zoom + 200;
    const cy = -(st.viewport.y) / st.viewport.zoom + 200;
    const n = {
      id,
      x: opts.x ?? cx + Math.random() * 100,
      y: opts.y ?? cy + Math.random() * 100,
      w: 260,
      h: 120,
      type: opts.type || 'idea',
      status: opts.status || 'idea',
      title: opts.title || 'Новая нода',
      text: opts.text || ''
    };
    st.nodes.push(n);
    save();
    renderNodes();
    renderEdges();
    updateEmptyState();
    openEditor(id);
    return n;
  }

  function deleteNode(id) {
    if (!confirm('Удалить ноду и все её связи?')) return;
    st.nodes = st.nodes.filter(n => n.id !== id);
    st.edges = st.edges.filter(e => e.from !== id && e.to !== id);
    if (selectedId === id) selectedId = null;
    save(); renderNodes(); renderEdges(); updateEmptyState();
  }

  function updateEmptyState() {
    const empty = document.querySelector('[data-sb-empty]');
    if (!empty) return;
    empty.style.display = st.nodes.length ? 'none' : 'flex';
  }

  /* ============ РЕДАКТОР ============ */

  function openEditor(id) {
    const n = nodeById(id);
    if (!n) return;

    const overlay = document.createElement('div');
    overlay.className = 'sp-sb-modal-backdrop';
    overlay.id = 'spSbModal';
    overlay.innerHTML = `
      <div class="sp-sb-modal">
        <div class="sp-sb-modal-head">
          <h3>Редактировать ноду</h3>
          <button type="button" class="sp-sb-modal-close" data-sb-close>×</button>
        </div>

        <div class="sp-sb-modal-body">
          <label class="sp-sb-field">
            <span>Тип ноды</span>
            <div class="sp-sb-type-picker">
              ${Object.keys(NODE_TYPES).map(k => {
                const t = NODE_TYPES[k];
                const act = n.type === k;
                return `<button type="button" class="sp-sb-type-btn${act ? ' is-active' : ''}"
                  data-type="${k}" style="--c:${t.color}; --b:${t.bg}; --bd:${t.border};">
                  ${t.icon} ${esc(t.label)}</button>`;
              }).join('')}
            </div>
          </label>

          <label class="sp-sb-field">
            <span>Заголовок</span>
            <input type="text" data-sb-title maxlength="120" value="${esc(n.title || '')}"
              placeholder="Например: Увеличить пропускную способность">
          </label>

          <label class="sp-sb-field">
            <span>Описание</span>
            <textarea data-sb-text rows="4" maxlength="500"
              placeholder="Что конкретно имеется в виду…">${esc(n.text || '')}</textarea>
          </label>

          <label class="sp-sb-field">
            <span>Статус</span>
            <div class="sp-sb-status-picker">
              ${Object.keys(STATUSES).map(k => {
                const s = STATUSES[k];
                const act = n.status === k;
                return `<button type="button" class="sp-sb-status-btn${act ? ' is-active' : ''}"
                  data-status="${k}" style="--c:${s.color};">
                  ${s.icon} ${esc(s.label)}</button>`;
              }).join('')}
            </div>
          </label>
        </div>

        <div class="sp-sb-modal-foot">
          <button type="button" class="sp-sb-btn sp-sb-btn-danger" data-sb-delete>Удалить</button>
          <div class="sp-sb-spacer"></div>
          <button type="button" class="sp-sb-btn" data-sb-close>Отмена</button>
          <button type="button" class="sp-sb-btn sp-sb-btn-primary" data-sb-save>Сохранить</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    /* Picker-ы */
    overlay.querySelectorAll('[data-type]').forEach(b => {
      b.addEventListener('click', () => {
        overlay.querySelectorAll('[data-type]').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
      });
    });
    overlay.querySelectorAll('[data-status]').forEach(b => {
      b.addEventListener('click', () => {
        overlay.querySelectorAll('[data-status]').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
      });
    });

    /* Закрытие */
    overlay.querySelectorAll('[data-sb-close]').forEach(x =>
      x.addEventListener('click', closeEditor));
    overlay.addEventListener('click', e => { if (e.target === overlay) closeEditor(); });
    document.addEventListener('keydown', escCloser);

    /* Сохранить */
    overlay.querySelector('[data-sb-save]').addEventListener('click', () => {
      const type = overlay.querySelector('[data-type].is-active')?.getAttribute('data-type') || n.type;
      const status = overlay.querySelector('[data-status].is-active')?.getAttribute('data-status') || n.status;
      const title = overlay.querySelector('[data-sb-title]').value.trim();
      const text  = overlay.querySelector('[data-sb-text]').value.trim();
      n.type = type; n.status = status; n.title = title; n.text = text;
      save(); renderNodes();
      closeEditor();
    });

    /* Удалить */
    overlay.querySelector('[data-sb-delete]').addEventListener('click', () => {
      closeEditor();
      deleteNode(id);
    });

    /* Автофокус */
    setTimeout(() => overlay.querySelector('[data-sb-title]')?.focus(), 30);

    /* Esc */
    function escCloser(e) {
      if (e.key === 'Escape') { closeEditor(); document.removeEventListener('keydown', escCloser); }
    }
  }

  function closeEditor() {
    document.getElementById('spSbModal')?.remove();
  }

  /* ============ DRAG / PAN / CONNECT ============ */

  function bindNodeHandlers() {
    document.querySelectorAll('.sp-sb-node').forEach(el => {
      const id = el.getAttribute('data-node-id');

      /* Клик → выделение */
      el.addEventListener('mousedown', ev => {
        if (ev.target.closest('[data-node-del]')) return;
        if (ev.target.closest('[data-node-edit]')) return;
        if (ev.target.closest('[data-port-out]')) return;
        if (ev.target.closest('[data-port-in]')) return;
        /* Начать перетаскивание, если попали в шапку или по самой ноде */
        const head = ev.target.closest('[data-drag-handle]');
        if (head || ev.target === el) {
          startNodeDrag(ev, el, id);
        }
      });

      /* ✎ редактировать */
      el.querySelector('[data-node-edit]')?.addEventListener('click', ev => {
        ev.stopPropagation();
        openEditor(id);
      });

      /* × удалить */
      el.querySelector('[data-node-del]')?.addEventListener('click', ev => {
        ev.stopPropagation();
        deleteNode(id);
      });

      /* Порт out → начать соединение */
      el.querySelector('[data-port-out]')?.addEventListener('mousedown', ev => {
        ev.stopPropagation();
        ev.preventDefault();
        startConnect(ev, id);
      });
    });
  }

  function startNodeDrag(ev, el, id) {
    const n = nodeById(id);
    if (!n) return;
    ev.preventDefault();
    selectedId = id;

    const zoom = st.viewport.zoom;
    const startX = ev.clientX, startY = ev.clientY;
    const startLeft = n.x, startTop = n.y;

    el.classList.add('is-dragging');
    el.setPointerCapture?.(ev.pointerId);

    function onMove(e) {
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;
      n.x = Math.round(startLeft + dx);
      n.y = Math.round(startTop + dy);
      el.style.left = n.x + 'px';
      el.style.top  = n.y + 'px';
      renderEdges(); // перерисовать линии
    }
    function onUp() {
      el.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      save();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function bindCanvasPan() {
    const canvas = document.querySelector('[data-sb-canvas]');
    if (!canvas) return;

    canvas.addEventListener('mousedown', ev => {
      /* Только по пустому месту */
      if (ev.target.closest('.sp-sb-node')) return;
      if (ev.target.closest('.sp-sb-empty')) return;
      if (ev.button !== 0) return;

      ev.preventDefault();
      const startX = ev.clientX, startY = ev.clientY;
      const sx = st.viewport.x, sy = st.viewport.y;
      canvas.classList.add('is-panning');

      function onMove(e) {
        st.viewport.x = sx + (e.clientX - startX);
        st.viewport.y = sy + (e.clientY - startY);
        applyViewport();
      }
      function onUp() {
        canvas.classList.remove('is-panning');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        save();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    /* Зум колёсиком */
    canvas.addEventListener('wheel', ev => {
      if (!ev.ctrlKey && !ev.metaKey && Math.abs(ev.deltaY) < 20) return;
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const oldZ = st.viewport.zoom;
      const factor = ev.deltaY < 0 ? 1.1 : 0.9;
      const newZ = Math.max(0.3, Math.min(2, oldZ * factor));
      st.viewport.x = mx - (mx - st.viewport.x) * (newZ / oldZ);
      st.viewport.y = my - (my - st.viewport.y) * (newZ / oldZ);
      st.viewport.zoom = newZ;
      applyViewport();
      save();
    }, { passive: false });
  }

  function startConnect(ev, fromId) {
    ev.preventDefault();
    const svg = document.querySelector('[data-sb-svg]');
    const tempLine = svg?.querySelector('[data-sb-temp-line]');
    if (!tempLine) return;
    tempLine.style.display = '';

    const fromNode = nodeById(fromId);
    if (!fromNode) return;

    const rect = svg.getBoundingClientRect();
    const zoom = st.viewport.zoom;

    /* Преобразуем координаты курсора в координаты "внутри" pan-слоя */
    function toLocal(clientX, clientY) {
      return {
        x: (clientX - rect.left - st.viewport.x) / zoom,
        y: (clientY - rect.top  - st.viewport.y) / zoom
      };
    }

    const p1 = { x: fromNode.x + fromNode.w, y: fromNode.y + fromNode.h / 2 };

    function onMove(e) {
      const p2 = toLocal(e.clientX, e.clientY);
      const dx = p2.x - p1.x;
      tempLine.setAttribute('d',
        `M${p1.x},${p1.y} C${p1.x + dx * 0.4},${p1.y} ${p2.x - dx * 0.4},${p2.y} ${p2.x},${p2.y}`);
    }

    function onUp(e) {
      tempLine.style.display = 'none';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      /* Куда попали — там может быть порт in */
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const inPort = el?.closest('[data-port-in]');
      if (!inPort) return;

      const toId = inPort.closest('[data-node-id]')?.getAttribute('data-node-id');
      if (!toId || toId === fromId) return;

      /* Не дублируем связи */
      if (st.edges.some(x => x.from === fromId && x.to === toId)) return;

      st.edges.push({ id: uid('e'), from: fromId, to: toId });
      save(); renderEdges();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /* ============ FIT VIEW ============ */

  function fitView() {
    const canvas = document.querySelector('[data-sb-canvas]');
    if (!canvas || !st.nodes.length) return;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    st.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });

    const pad = 40;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const zoom = Math.max(0.3, Math.min(1.2, Math.min(cw / w, ch / h)));
    st.viewport.zoom = zoom;
    st.viewport.x = (cw - (maxX - minX) * zoom) / 2 - minX * zoom;
    st.viewport.y = (ch - (maxY - minY) * zoom) / 2 - minY * zoom;
    applyViewport();
    save();
  }

  /* ============ SETUP ============ */

  function setupBoard() {
    const root = document.querySelector('.sp-sb-wrap');
    if (!root) return;

    applyViewport();
    renderNodes();
    renderEdges();
    bindCanvasPan();
    updateEmptyState();

    root.querySelector('[data-sb-new]')?.addEventListener('click', () => createNode());
    root.querySelector('[data-sb-new-empty]')?.addEventListener('click', () => createNode());

    root.querySelector('[data-sb-fit]')?.addEventListener('click', fitView);

    root.querySelector('[data-sb-zoom-in]')?.addEventListener('click', () => {
      st.viewport.zoom = Math.min(2, st.viewport.zoom * 1.15);
      applyViewport(); save();
    });
    root.querySelector('[data-sb-zoom-out]')?.addEventListener('click', () => {
      st.viewport.zoom = Math.max(0.3, st.viewport.zoom / 1.15);
      applyViewport(); save();
    });

    root.querySelector('[data-sb-template]')?.addEventListener('click', () => {
      if (st.nodes.length && !confirm('Заменить текущую карту примером «Развитие склада»?')) return;
      loadTemplate();
      applyViewport();
      renderNodes();
      renderEdges();
      updateEmptyState();
    });

    root.querySelector('[data-sb-clear]')?.addEventListener('click', () => {
      if (!st.nodes.length) return;
      if (!confirm('Удалить все ноды и связи? Это действие необратимо.')) return;
      st.nodes = []; st.edges = [];
      save(); renderNodes(); renderEdges(); updateEmptyState();
    });
  }

  /* ============ ИНТЕГРАЦИЯ С UNIFIED-PLANNER ============ */

  /* Вставляем кнопку-вкладку в .sp-up-modes */
  function injectTabIntoSwitcher(html) {
    if (html.includes('data-sp-up-mode="strategy"')) return html;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const switcher = tmp.querySelector('.' + SWITCHER_CLASS);
    if (switcher) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-up-mode';
      btn.setAttribute('data-sp-up-mode', 'strategy');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.textContent = '🗺️ Стратегия';
      switcher.appendChild(btn);
    }
    return tmp.innerHTML;
  }

  /* Обёртка над tasksView */
  function installViewHook() {
    if (typeof window.tasksView !== 'function') return false;
    if (window.tasksView.__strategyWrapped) return true;

    const originalView = window.tasksView;

    const wrapped = function () {
      if (isActive()) {
        /* Заголовок страницы */
        setTimeout(() => {
          const h = document.getElementById('heading');
          const pt = document.getElementById('pageTitle');
          if (h) h.textContent = 'Стратегия развития';
          if (pt) pt.textContent = 'Стратегия';
        }, 30);

        return `
          <div class="${SWITCHER_CLASS}" role="tablist" aria-label="Режим">
            <button type="button" class="sp-up-mode" data-sp-up-mode="tasks" role="tab" aria-selected="false">📝 Задачи</button>
            <button type="button" class="sp-up-mode" data-sp-up-mode="planner" role="tab" aria-selected="false">📅 Планировщик</button>
            <button type="button" class="sp-up-mode" data-sp-up-mode="shifts" role="tab" aria-selected="false">⏱ Смены</button>
            <button type="button" class="sp-up-mode" data-sp-up-mode="reminders" role="tab" aria-selected="false">🔔 Напоминания</button>
            <button type="button" class="sp-up-mode is-active" data-sp-up-mode="strategy" role="tab" aria-selected="true">🗺️ Стратегия</button>
          </div>
          ${buildView()}
        `;
      }
      /* Обычный путь: отдаём через unified-planner, потом добавляем наш таб */
      let html = originalView.apply(this, arguments);
      try { html = injectTabIntoSwitcher(html); } catch (e) {}
      return html;
    };
    wrapped.__strategyWrapped = true;
    window.tasksView = wrapped;
    return true;
  }

  /* Обёртка над setupTasks */
  function installSetupHook() {
    if (typeof window.setupTasks !== 'function') return false;
    if (window.setupTasks.__strategyWrapped) return true;

    const original = window.setupTasks;

    const wrapped = function () {
      if (isActive()) {
        setupBoard();
        return;
      }
      original.apply(this, arguments);
    };
    wrapped.__strategyWrapped = true;
    window.setupTasks = wrapped;
    return true;
  }

  /* Перехват клика по кнопке стратегии (до unified-planner) */
  function installTabClickInterceptor() {
    document.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-sp-up-mode]');
      if (!btn) return;
      const mode = btn.getAttribute('data-sp-up-mode');

      if (mode === 'strategy') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        setActive(true);
        if (typeof window.render === 'function') window.render();
      } else {
        /* Пользователь кликнул другую вкладку — снять флаг стратегии */
        if (isActive()) setActive(false);
      }
    }, true); /* capture — перехватываем до обработчика unified */
  }

  /* ============ СТИЛИ ============ */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const s = document.createElement('style');
    s.id = STYLES_ID;
    s.textContent = `
      /* Контейнер */
      .sp-sb-wrap {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 14px;
        box-shadow: var(--shadow-card);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 78vh;
      }

      /* Панель инструментов */
      .sp-sb-toolbar {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--line, #e2e8f0);
        background: #fafbfc;
        flex-wrap: wrap;
      }
      .sp-sb-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 12px;
        border: 1px solid #dfe3e8;
        background: #fff; color: #334155;
        border-radius: 9px;
        font-family: inherit; font-size: 12px; font-weight: 600;
        cursor: pointer;
        transition: background .12s ease, border-color .12s ease;
      }
      .sp-sb-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
      .sp-sb-btn-primary {
        background: var(--primary, #2563EB); border-color: var(--primary, #2563EB); color: #fff;
      }
      .sp-sb-btn-primary:hover { background: var(--primary-hover, #1D4ED8); border-color: var(--primary-hover, #1D4ED8); }
      .sp-sb-btn-danger { color: #b42318; }
      .sp-sb-btn-danger:hover { background: #fef2f2; border-color: #fecaca; }
      .sp-sb-sep { width: 1px; height: 22px; background: #e2e8f0; margin: 0 4px; }
      .sp-sb-spacer { flex: 1; }
      .sp-sb-zoom {
        display: inline-block;
        min-width: 42px; text-align: center;
        font-size: 12px; font-weight: 700; color: #475569;
        font-variant-numeric: tabular-nums;
      }
      .sp-sb-hint {
        font-size: 11px; color: #94a3b8;
      }

      /* Холст */
      .sp-sb-canvas {
        position: relative;
        flex: 1;
        min-height: 500px;
        overflow: hidden;
        cursor: grab;
        background:
          radial-gradient(circle at 20px 20px, #e2e8f0 1px, transparent 1.2px) 0 0/24px 24px,
          linear-gradient(180deg, #fbfcfd, #f5f7fa);
        user-select: none;
      }
      .sp-sb-canvas.is-panning { cursor: grabbing; }

      .sp-sb-pan {
        position: absolute; left: 0; top: 0;
        width: 1px; height: 1px;
        /* width/height 1px — потому что transform-scale растягивает всё
           содержимое относительно точки origin. Реальный размер даёт
           каждый элемент внутри через свой абсолютный left/top. */
      }

      /* SVG для рёбер — растягивается на большой регион */
      .sp-sb-svg {
        position: absolute; left: -20000px; top: -20000px;
        width: 40000px; height: 40000px;
        overflow: visible;
        pointer-events: auto;
        z-index: 1;
      }
      .sp-sb-svg g[data-sb-edges] { pointer-events: auto; }

      /* Слой нод */
      .sp-sb-nodes {
        position: absolute; left: 0; top: 0;
        z-index: 2;
      }

      /* Нода */
      .sp-sb-node {
        position: absolute;
        border: 2px solid;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.04);
        cursor: move;
        min-width: 180px;
        transition: box-shadow .12s ease;
      }
      .sp-sb-node:hover {
        box-shadow: 0 8px 22px rgba(15,23,42,.12), 0 2px 6px rgba(15,23,42,.06);
      }
      .sp-sb-node.is-dragging {
        box-shadow: 0 14px 32px rgba(15,23,42,.2), 0 4px 10px rgba(15,23,42,.1);
        z-index: 100;
      }
      .sp-sb-node-head {
        display: flex; align-items: center; gap: 7px;
        padding: 8px 10px;
        cursor: move;
      }
      .sp-sb-node-icon { font-size: 14px; flex-shrink: 0; }
      .sp-sb-node-title {
        flex: 1; min-width: 0;
        font-size: 13px; font-weight: 700;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .sp-sb-node-edit, .sp-sb-node-del {
        width: 22px; height: 22px;
        border: 0; background: transparent;
        color: currentColor; opacity: .55;
        cursor: pointer; border-radius: 5px;
        font-size: 12px; line-height: 1;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .sp-sb-node-edit:hover, .sp-sb-node-del:hover { opacity: 1; background: rgba(0,0,0,.06); }
      .sp-sb-node-del:hover { color: #b42318; background: rgba(180,35,24,.12); }

      .sp-sb-node-body {
        padding: 0 12px 8px;
        font-size: 12px; line-height: 1.45;
        color: #475569;
        word-break: break-word;
      }
      .sp-sb-node-foot {
        padding: 6px 10px 9px;
      }
      .sp-sb-status {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid;
        font-size: 10px; font-weight: 700;
        white-space: nowrap;
      }

      /* Порты */
      .sp-sb-port {
        position: absolute; top: 50%; transform: translateY(-50%);
        width: 14px; height: 14px;
        border-radius: 50%;
        background: #fff; border: 2px solid #94a3b8;
        cursor: crosshair;
        transition: all .12s ease;
        z-index: 3;
      }
      .sp-sb-port:hover {
        border-color: var(--primary, #2563EB);
        background: #eff6ff;
        transform: translateY(-50%) scale(1.3);
      }
      .sp-sb-port-in  { left: -8px; }
      .sp-sb-port-out { right: -8px; }

      /* Пустое состояние */
      .sp-sb-empty {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 10px;
        text-align: center;
        padding: 30px;
        pointer-events: none;
      }
      .sp-sb-empty > * { pointer-events: auto; }
      .sp-sb-empty-icon { font-size: 48px; opacity: .5; }
      .sp-sb-empty-title { font-size: 16px; font-weight: 700; color: #0f172a; }
      .sp-sb-empty-text {
        font-size: 13px; color: #64748b; max-width: 380px; line-height: 1.5;
      }

      /* Модалка редактора */
      .sp-sb-modal-backdrop {
        position: fixed; inset: 0;
        background: rgba(15,23,42,.55);
        z-index: 100010;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      .sp-sb-modal {
        background: #fff;
        border-radius: 16px;
        width: 100%; max-width: 520px;
        max-height: 92vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      .sp-sb-modal-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #eef1f4;
      }
      .sp-sb-modal-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
      .sp-sb-modal-close {
        border: 0; background: #f3f3f3;
        width: 34px; height: 34px;
        border-radius: 50%; cursor: pointer;
        font-size: 20px; line-height: 1; color: #444;
      }
      .sp-sb-modal-close:hover { background: #e5e5e5; }
      .sp-sb-modal-body {
        padding: 16px 20px 4px;
        overflow-y: auto;
      }
      .sp-sb-modal-foot {
        display: flex; gap: 8px; align-items: center;
        padding: 12px 20px 16px;
        border-top: 1px solid #eef1f4;
        background: #fafbfc;
      }
      .sp-sb-field { display: block; margin-bottom: 14px; }
      .sp-sb-field > span {
        display: block; font-size: 12px; font-weight: 600;
        color: #475569; margin-bottom: 6px;
      }
      .sp-sb-field input,
      .sp-sb-field textarea {
        width: 100%; box-sizing: border-box;
        border: 1px solid #dfe3e8; border-radius: 9px;
        padding: 10px 12px; font-size: 13px;
        outline: none; background: #fff; font-family: inherit;
      }
      .sp-sb-field textarea { resize: vertical; min-height: 70px; }
      .sp-sb-field input:focus,
      .sp-sb-field textarea:focus {
        border-color: var(--primary, #2563EB);
        box-shadow: 0 0 0 3px rgba(37,99,235,.1);
      }
      .sp-sb-type-picker, .sp-sb-status-picker {
        display: flex; flex-wrap: wrap; gap: 6px;
      }
      .sp-sb-type-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 7px 12px;
        border: 1.5px solid var(--bd, #cbd5e1);
        background: var(--b, #f8fafc);
        color: var(--c, #334155);
        border-radius: 9px;
        font-family: inherit; font-size: 12px; font-weight: 600;
        cursor: pointer;
        transition: all .12s ease;
      }
      .sp-sb-type-btn.is-active {
        box-shadow: 0 0 0 2px var(--c, #2563EB);
      }
      .sp-sb-status-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 7px 12px;
        border: 1px solid #dfe3e8;
        background: #fff;
        color: #475569;
        border-radius: 9px;
        font-family: inherit; font-size: 12px; font-weight: 600;
        cursor: pointer;
        transition: all .12s ease;
      }
      .sp-sb-status-btn:hover { background: #f8fafc; }
      .sp-sb-status-btn.is-active {
        border-color: var(--c, #2563EB);
        color: var(--c, #2563EB);
        background: color-mix(in srgb, var(--c, #2563EB) 10%, white);
      }

      @media (max-width: 700px) {
        .sp-sb-toolbar { padding: 8px 10px; gap: 6px; }
        .sp-sb-btn { padding: 6px 10px; font-size: 11px; }
        .sp-sb-hint { display: none; }
        .sp-sb-canvas { min-height: 60vh; }
      }
    `;
    document.head.appendChild(s);
    setupEdgeHoverCss();
  }

  /* ============ INIT ============ */

  function init() {
    injectStyles();
    load();
    installTabClickInterceptor();

    const tryHooks = () => {
      installViewHook();
      installSetupHook();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryHooks, { once: true });
    } else {
      tryHooks();
    }
    setTimeout(tryHooks, 300);
    setTimeout(tryHooks, 1500);
    setTimeout(tryHooks, 4000);

    console.log('[StrategyBoard] Модуль инициализирован');
  }

  init();

  window.spStrategyBoard = {
    rebuild: () => { if (isActive()) setupBoard(); },
    clear: () => { st.nodes = []; st.edges = []; save(); },
    version: '1.0.0'
  };
})();
