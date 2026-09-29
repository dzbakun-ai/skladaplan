/* =========================================================
   SKLADAPLAN — СТРАТЕГИЧЕСКАЯ КАРТА (v2)
   Интеграция через DOM-наблюдение — БЕЗ обёрток tasksView.
   Не конфликтует с unified-planner.js.
   ========================================================= */

(function () {
  'use strict';
  if (window.spStrategyBoard) return;

  const STYLES_ID = 'spStrategyBoardStyles';
  const CONTENT_ID = 'spStrategyContent';
  const NODES_KEY = 'sp-strategy-nodes-v1';
  const EDGES_KEY = 'sp-strategy-edges-v1';
  const VIEW_KEY = 'sp-strategy-view-v1';
  const ACTIVE_KEY = 'sp-strategy-active';

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
  let observer = null;
  let scheduled = false;

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
  function isActive() { try { return localStorage.getItem(ACTIVE_KEY) === '1'; } catch (e) { return false; } }
  function setActiveFlag(v) { try { v ? localStorage.setItem(ACTIVE_KEY, '1') : localStorage.removeItem(ACTIVE_KEY); } catch (e) {} }

  /* ============ UTILS ============ */
  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }
  function nodeById(id) { return st.nodes.find(n => n.id === id); }

  /* ============ ШАБЛОН ============ */
  function loadTemplate() {
    const id = k => k + '_' + Date.now() + Math.random().toString(36).slice(2, 5);
    const g1 = id('g'), i1 = id('i'), i2 = id('i'), i3 = id('i');
    const s1 = id('s'), s2 = id('s'), s3 = id('s'), s4 = id('s'), s5 = id('s'), s6 = id('s');
    const n = (nid, x, y, type, status, title, text) =>
      ({ id: nid, x, y, w: 260, h: 120, type, status, title, text });
    const e = (from, to) => ({ id: uid('e'), from, to });

    st.nodes = [
      n(g1, 420, 40,  'goal', 'planned', 'Развитие склада 2027', 'Стратегический план: что хотим получить к концу следующего года.'),
      n(i1, 40,  240, 'idea', 'planned', 'Увеличить пропускную способность', 'Больше коробок в час при том же количестве людей.'),
      n(i2, 420, 240, 'idea', 'planned', 'Снизить ошибки сборки', 'Меньше пересортицы и возвратов от клиентов.'),
      n(i3, 800, 240, 'idea', 'idea',    'Ускорить приёмку и отгрузку', 'Сократить время на обработку одной машины.'),
      n(s1, 20,  440, 'step', 'idea',    'Второй стационарный сканер', 'Поставить в зоне приёмки и отгрузки.'),
      n(s2, 300, 440, 'step', 'idea',    'Мобильный сканер + рюкзак', 'Для инвентаризации прямо с пола.'),
      n(s3, 340, 440, 'step', 'planned', 'Обязательное сканирование при комплектации', 'Каждая коробка сканируется дважды: взял / положил.'),
      n(s4, 620, 440, 'step', 'idea',    'Автопроверка веса', 'Весы на выходе сверяют вес паллета.'),
      n(s5, 780, 440, 'step', 'idea',    'Предпечатные этикетки', 'Печатать наклейки заранее по ТТН.'),
      n(s6, 1060,440, 'step', 'idea',    'Интеграция с ТТН перевозчика', 'Подтягивать данные из накладных автоматически.')
    ];
    st.edges = [
      e(g1, i1), e(g1, i2), e(g1, i3),
      e(i1, s1), e(i1, s2),
      e(i2, s3), e(i2, s4),
      e(i3, s5), e(i3, s6)
    ];
    st.viewport = { x: 20, y: 20, zoom: 0.7 };
    save();
  }

  /* ============ ВЁРСТКА ============ */
  function buildView() {
    return `
      <div class="sp-sb-wrap">
        <div class="sp-sb-toolbar">
          <button type="button" class="sp-sb-btn sp-sb-btn-primary" data-sb-new><span>+</span> Новый узел</button>
          <div class="sp-sb-sep"></div>
          <button type="button" class="sp-sb-btn" data-sb-fit title="Показать все ноды">⤢ Всё</button>
          <button type="button" class="sp-sb-btn" data-sb-zoom-out title="Уменьшить">−</button>
          <span class="sp-sb-zoom" data-sb-zoom>100%</span>
          <button type="button" class="sp-sb-btn" data-sb-zoom-in title="Увеличить">+</button>
          <div class="sp-sb-sep"></div>
          <button type="button" class="sp-sb-btn" data-sb-template title="Загрузить пример">✨ Пример</button>
          <button type="button" class="sp-sb-btn sp-sb-btn-danger" data-sb-clear>Очистить</button>
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
        <div class="sp-sb-hint-row">
          Клик по ✎ — редактировать · Тяните от правой ● к левой ● другой ноды — связать · Ctrl + колесо — зум
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
    g.querySelectorAll('[data-edge-del]').forEach(x => {
      x.addEventListener('click', ev => {
        ev.stopPropagation();
        st.edges = st.edges.filter(e => e.id !== x.getAttribute('data-edge-del'));
        save(); renderEdges();
      });
    });
  }

  function edgePathHtml(e) {
    const a = nodeById(e.from), b = nodeById(e.to);
    if (!a || !b) return '';
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x,       y2 = b.y + b.h / 2;
    const dx = x2 - x1;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return `
      <path d="M${x1},${y1} C${x1 + dx * 0.4},${y1} ${x2 - dx * 0.4},${y2} ${x2},${y2}"
            stroke="#94a3b8" stroke-width="2" fill="none" marker-end="url(#spSbArrow)"/>
      <g data-edge-del="${esc(e.id)}" style="cursor:pointer">
        <circle cx="${mx}" cy="${my}" r="10" fill="#fff" stroke="#e2e8f0"/>
        <text x="${mx}" y="${my + 4}" text-anchor="middle" font-size="11" fill="#94a3b8">×</text>
      </g>
    `;
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

  /* ============ ОПЕРАЦИИ ============ */
  function createNode(opts = {}) {
    const id = uid('n');
    const cx = -(st.viewport.x) / st.viewport.zoom + 200;
    const cy = -(st.viewport.y) / st.viewport.zoom + 200;
    const n = {
      id,
      x: opts.x ?? cx + Math.random() * 100,
      y: opts.y ?? cy + Math.random() * 100,
      w: 260, h: 120,
      type: opts.type || 'idea',
      status: opts.status || 'idea',
      title: opts.title || 'Новая нода',
      text: opts.text || ''
    };
    st.nodes.push(n);
    save(); renderNodes(); renderEdges(); updateEmptyState();
    openEditor(id);
    return n;
  }

  function deleteNode(id) {
    if (!confirm('Удалить ноду и все её связи?')) return;
    st.nodes = st.nodes.filter(n => n.id !== id);
    st.edges = st.edges.filter(e => e.from !== id && e.to !== id);
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
                const t = NODE_TYPES[k]; const act = n.type === k;
                return `<button type="button" class="sp-sb-type-btn${act ? ' is-active' : ''}"
                  data-type="${k}" style="--c:${t.color}; --b:${t.bg}; --bd:${t.border};">
                  ${t.icon} ${esc(t.label)}</button>`;
              }).join('')}
            </div>
          </label>
          <label class="sp-sb-field">
            <span>Заголовок</span>
            <input type="text" data-sb-title maxlength="120" value="${esc(n.title || '')}">
          </label>
          <label class="sp-sb-field">
            <span>Описание</span>
            <textarea data-sb-text rows="4" maxlength="500">${esc(n.text || '')}</textarea>
          </label>
          <label class="sp-sb-field">
            <span>Статус</span>
            <div class="sp-sb-status-picker">
              ${Object.keys(STATUSES).map(k => {
                const s = STATUSES[k]; const act = n.status === k;
                return `<button type="button" class="sp-sb-status-btn${act ? ' is-active' : ''}"
                  data-status="${k}" style="--c:${s.color};">${s.icon} ${esc(s.label)}</button>`;
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

    overlay.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
      overlay.querySelectorAll('[data-type]').forEach(x => x.classList.remove('is-active'));
      b.classList.add('is-active');
    }));
    overlay.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => {
      overlay.querySelectorAll('[data-status]').forEach(x => x.classList.remove('is-active'));
      b.classList.add('is-active');
    }));
    overlay.querySelectorAll('[data-sb-close]').forEach(x => x.addEventListener('click', closeEditor));
    overlay.addEventListener('click', e => { if (e.target === overlay) closeEditor(); });

    overlay.querySelector('[data-sb-save]').addEventListener('click', () => {
      n.type   = overlay.querySelector('[data-type].is-active')?.getAttribute('data-type') || n.type;
      n.status = overlay.querySelector('[data-status].is-active')?.getAttribute('data-status') || n.status;
      n.title  = overlay.querySelector('[data-sb-title]').value.trim();
      n.text   = overlay.querySelector('[data-sb-text]').value.trim();
      save(); renderNodes(); closeEditor();
    });
    overlay.querySelector('[data-sb-delete]').addEventListener('click', () => { closeEditor(); deleteNode(id); });

    function onEsc(e) { if (e.key === 'Escape') { closeEditor(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);

    setTimeout(() => overlay.querySelector('[data-sb-title]')?.focus(), 30);
  }

  function closeEditor() { document.getElementById('spSbModal')?.remove(); }

  /* ============ DRAG / PAN / CONNECT ============ */
  function bindNodeHandlers() {
    document.querySelectorAll('.sp-sb-node').forEach(el => {
      const id = el.getAttribute('data-node-id');
      el.addEventListener('mousedown', ev => {
        if (ev.target.closest('[data-node-del]')) return;
        if (ev.target.closest('[data-node-edit]')) return;
        if (ev.target.closest('[data-port-out]')) return;
        if (ev.target.closest('[data-port-in]')) return;
        const head = ev.target.closest('[data-drag-handle]');
        if (head || ev.target === el) startNodeDrag(ev, el, id);
      });
      el.querySelector('[data-node-edit]')?.addEventListener('click', ev => {
        ev.stopPropagation(); openEditor(id);
      });
      el.querySelector('[data-node-del]')?.addEventListener('click', ev => {
        ev.stopPropagation(); deleteNode(id);
      });
      el.querySelector('[data-port-out]')?.addEventListener('mousedown', ev => {
        ev.stopPropagation(); ev.preventDefault();
        startConnect(ev, id);
      });
    });
  }

  function startNodeDrag(ev, el, id) {
    const n = nodeById(id); if (!n) return;
    ev.preventDefault();
    const zoom = st.viewport.zoom;
    const startX = ev.clientX, startY = ev.clientY;
    const sx = n.x, sy = n.y;
    el.classList.add('is-dragging');
    function onMove(e) {
      n.x = Math.round(sx + (e.clientX - startX) / zoom);
      n.y = Math.round(sy + (e.clientY - startY) / zoom);
      el.style.left = n.x + 'px';
      el.style.top  = n.y + 'px';
      renderEdges();
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
      if (ev.target.closest('.sp-sb-node')) return;
      if (ev.target.closest('.sp-sb-empty')) return;
      if (ev.button !== 0) return;
      ev.preventDefault();
      const sx = ev.clientX, sy = ev.clientY;
      const vx = st.viewport.x, vy = st.viewport.y;
      canvas.classList.add('is-panning');
      function onMove(e) {
        st.viewport.x = vx + (e.clientX - sx);
        st.viewport.y = vy + (e.clientY - sy);
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
      applyViewport(); save();
    }, { passive: false });
  }

  function startConnect(ev, fromId) {
    ev.preventDefault();
    const svg = document.querySelector('[data-sb-svg]');
    const tempLine = svg?.querySelector('[data-sb-temp-line]');
    if (!tempLine) return;
    tempLine.style.display = '';
    const fromNode = nodeById(fromId); if (!fromNode) return;
    const rect = svg.getBoundingClientRect();
    const zoom = st.viewport.zoom;
    function toLocal(cx, cy) {
      return {
        x: (cx - rect.left - st.viewport.x) / zoom,
        y: (cy - rect.top  - st.viewport.y) / zoom
      };
    }
    const p1 = { x: fromNode.x + fromNode.w, y: fromNode.y + fromNode.h / 2 };
    function onMove(e) {
      const p2 = toLocal(e.clientX, e.clientY);
      const dx = p2.x - p1.x;
      tempLine.setAttribute('d', `M${p1.x},${p1.y} C${p1.x + dx * 0.4},${p1.y} ${p2.x - dx * 0.4},${p2.y} ${p2.x},${p2.y}`);
    }
    function onUp(e) {
      tempLine.style.display = 'none';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const inPort = el?.closest('[data-port-in]');
      if (!inPort) return;
      const toId = inPort.closest('[data-node-id]')?.getAttribute('data-node-id');
      if (!toId || toId === fromId) return;
      if (st.edges.some(x => x.from === fromId && x.to === toId)) return;
      st.edges.push({ id: uid('e'), from: fromId, to: toId });
      save(); renderEdges();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function fitView() {
    const canvas = document.querySelector('[data-sb-canvas]');
    if (!canvas || !st.nodes.length) return;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    st.nodes.forEach(n => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });
    const pad = 40;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const zoom = Math.max(0.3, Math.min(1.2, Math.min(cw / w, ch / h)));
    st.viewport.zoom = zoom;
    st.viewport.x = (cw - (maxX - minX) * zoom) / 2 - minX * zoom;
    st.viewport.y = (ch - (maxY - minY) * zoom) / 2 - minY * zoom;
    applyViewport(); save();
  }

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
      if (st.nodes.length && !confirm('Заменить текущую карту примером?')) return;
      loadTemplate();
      applyViewport(); renderNodes(); renderEdges(); updateEmptyState();
    });
    root.querySelector('[data-sb-clear]')?.addEventListener('click', () => {
      if (!st.nodes.length) return;
      if (!confirm('Удалить все ноды и связи?')) return;
      st.nodes = []; st.edges = [];
      save(); renderNodes(); renderEdges(); updateEmptyState();
    });
  }

  /* ============ КНОПКА В SWITCHER + КЛИКИ ============ */
  function findSwitcher() { return document.querySelector('#content .sp-up-modes'); }

  function ensureStrategyButton() {
    const switcher = findSwitcher();
    if (!switcher) return null;
    let btn = switcher.querySelector('[data-sp-up-mode="strategy"]');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-up-mode';
      btn.setAttribute('data-sp-up-mode', 'strategy');
      btn.setAttribute('role', 'tab');
      btn.textContent = '🗺️ Стратегия';
      switcher.appendChild(btn);
    }
    if (isActive()) {
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      switcher.querySelectorAll('.sp-up-mode').forEach(x => {
        if (x !== btn) { x.classList.remove('is-active'); x.setAttribute('aria-selected', 'false'); }
      });
    } else {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-selected', 'false');
    }
    return btn;
  }

  /* Глобальный перехватчик кликов по переключателю вкладок */
  document.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-sp-up-mode]');
    if (!btn) return;
    const mode = btn.getAttribute('data-sp-up-mode');

    if (mode === 'strategy') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (isActive()) {
        setActiveFlag(false);
        removeStrategyView();
        const st2 = findSwitcher();
        st2?.querySelectorAll('.sp-up-mode').forEach(x => {
          if (x.getAttribute('data-sp-up-mode') === 'tasks') {
            x.classList.add('is-active'); x.setAttribute('aria-selected', 'true');
          } else {
            x.classList.remove('is-active'); x.setAttribute('aria-selected', 'false');
          }
        });
      } else {
        setActiveFlag(true);
        applyStrategyView();
      }
      return;
    }

    /* Клик по любой другой вкладке — сбрасываем наш флаг.
       НЕ preventDefault: даём unified-planner'у обработать. */
    if (isActive()) {
      setActiveFlag(false);
      removeStrategyView();
    }
  }, true);

  /* ============ ПРИМЕНЕНИЕ / УДАЛЕНИЕ ============ */
  function applyStrategyView() {
    const switcher = findSwitcher();
    if (!switcher) return;
    const parent = switcher.parentElement;
    if (!parent) return;

    /* Подсветить наш таб */
    ensureStrategyButton();

    /* Скрыть все родственные блоки, кроме switcher */
    [...parent.children].forEach(el => {
      if (el === switcher) return;
      if (el.id === CONTENT_ID) return;
      el.style.display = 'none';
    });

    /* Вставить/показать нашу доску */
    let board = document.getElementById(CONTENT_ID);
    if (!board) {
      board = document.createElement('div');
      board.id = CONTENT_ID;
      board.style.marginTop = '16px';
      switcher.parentNode.insertBefore(board, switcher.nextSibling);
      board.innerHTML = buildView();
    } else {
      board.style.display = '';
      /* Перестроим view, если вдруг было пусто */
      if (!board.querySelector('.sp-sb-wrap')) {
        board.innerHTML = buildView();
      }
    }
    setupBoard();
  }

  function removeStrategyView() {
    const board = document.getElementById(CONTENT_ID);
    if (board) board.remove();
    /* Показать спрятанные блоки */
    const switcher = findSwitcher();
    if (switcher?.parentElement) {
      [...switcher.parentElement.children].forEach(el => {
        if (el === switcher) return;
        if (el.id === CONTENT_ID) return;
        el.style.display = '';
      });
    }
  }

  /* ============ SYNC ПО MUTATION ============ */
  function syncDOM() {
    const switcher = findSwitcher();
    if (!switcher) {
      /* Не на странице Планирования — если наша доска где-то осталась, убрать */
      if (document.getElementById(CONTENT_ID)) {
        document.getElementById(CONTENT_ID).remove();
      }
      return;
    }

    ensureStrategyButton();

    if (isActive()) {
      /* Убедиться, что доска в правильном состоянии */
      if (!document.getElementById(CONTENT_ID)) {
        applyStrategyView();
      } else {
        /* Спрятать чужие блоки, если они вдруг проявились после re-render */
        const parent = switcher.parentElement;
        if (parent) {
          [...parent.children].forEach(el => {
            if (el === switcher) return;
            if (el.id === CONTENT_ID) return;
            el.style.display = 'none';
          });
        }
      }
    } else {
      if (document.getElementById(CONTENT_ID)) {
        removeStrategyView();
      }
    }
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { syncDOM(); } catch (e) { console.warn('[StrategyBoard] sync error:', e); }
    });
  }

  function startObserver() {
    if (observer) return;
    const content = document.getElementById('content');
    if (!content) { setTimeout(startObserver, 300); return; }
    observer = new MutationObserver(scheduleSync);
    observer.observe(content, { childList: true, subtree: true });
    scheduleSync();
  }

  /* ============ СТИЛИ ============ */
  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const s = document.createElement('style');
    s.id = STYLES_ID;
    s.textContent = `
      .sp-sb-wrap {
        background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 14px;
        box-shadow: var(--shadow-card);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 60vh;
      }
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
      .sp-sb-btn-primary { background: var(--primary, #2563EB); border-color: var(--primary, #2563EB); color: #fff; }
      .sp-sb-btn-primary:hover { background: var(--primary-hover, #1D4ED8); border-color: var(--primary-hover, #1D4ED8); }
      .sp-sb-btn-danger { color: #b42318; }
      .sp-sb-btn-danger:hover { background: #fef2f2; border-color: #fecaca; }
      .sp-sb-sep { width: 1px; height: 22px; background: #e2e8f0; margin: 0 4px; }
      .sp-sb-spacer { flex: 1; }
      .sp-sb-zoom {
        display: inline-block; min-width: 42px; text-align: center;
        font-size: 12px; font-weight: 700; color: #475569;
        font-variant-numeric: tabular-nums;
      }
      .sp-sb-canvas {
        position: relative;
        flex: 1;
        min-height: 400px;
        overflow: hidden;
        cursor: grab;
        background:
          radial-gradient(circle at 20px 20px, #e2e8f0 1px, transparent 1.2px) 0 0/24px 24px,
          linear-gradient(180deg, #fbfcfd, #f5f7fa);
        user-select: none;
        touch-action: none;
      }
      .sp-sb-canvas.is-panning { cursor: grabbing; }
      .sp-sb-pan {
        position: absolute; left: 0; top: 0;
        width: 1px; height: 1px;
      }
      .sp-sb-svg {
        position: absolute; left: -20000px; top: -20000px;
        width: 40000px; height: 40000px;
        overflow: visible;
        pointer-events: none;
        z-index: 1;
      }
      .sp-sb-svg g[data-sb-edges] > * { pointer-events: auto; }
      .sp-sb-nodes {
        position: absolute; left: 0; top: 0;
        z-index: 2;
      }
      .sp-sb-node {
        position: absolute;
        border: 2px solid;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(15,23,42,.06);
        cursor: move;
        min-width: 180px;
        transition: box-shadow .12s ease;
      }
      .sp-sb-node:hover { box-shadow: 0 8px 22px rgba(15,23,42,.12); }
      .sp-sb-node.is-dragging { box-shadow: 0 14px 32px rgba(15,23,42,.2); z-index: 100; }
      .sp-sb-node-head { display: flex; align-items: center; gap: 7px; padding: 8px 10px; cursor: move; }
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
      .sp-sb-node-body { padding: 0 12px 8px; font-size: 12px; line-height: 1.45; color: #475569; word-break: break-word; }
      .sp-sb-node-foot { padding: 6px 10px 9px; }
      .sp-sb-status {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px;
        border-radius: 999px; border: 1px solid;
        font-size: 10px; font-weight: 700; white-space: nowrap;
      }
      .sp-sb-port {
        position: absolute; top: 50%; transform: translateY(-50%);
        width: 14px; height: 14px; border-radius: 50%;
        background: #fff; border: 2px solid #94a3b8;
        cursor: crosshair; z-index: 3;
        transition: all .12s ease;
      }
      .sp-sb-port:hover { border-color: var(--primary, #2563EB); background: #eff6ff; transform: translateY(-50%) scale(1.3); }
      .sp-sb-port-in  { left: -8px; }
      .sp-sb-port-out { right: -8px; }
      .sp-sb-empty {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 10px; text-align: center; padding: 30px;
        pointer-events: none;
      }
      .sp-sb-empty > * { pointer-events: auto; }
      .sp-sb-empty-icon { font-size: 48px; opacity: .5; }
      .sp-sb-empty-title { font-size: 16px; font-weight: 700; color: #0f172a; }
      .sp-sb-empty-text { font-size: 13px; color: #64748b; max-width: 380px; line-height: 1.5; }
      .sp-sb-hint-row {
        padding: 8px 14px;
        font-size: 11px; color: #94a3b8;
        border-top: 1px solid #f1f5f9;
        background: #fafbfc;
      }
      /* Редактор */
      .sp-sb-modal-backdrop {
        position: fixed; inset: 0;
        background: rgba(15,23,42,.55);
        z-index: 100010;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
      }
      .sp-sb-modal {
        background: #fff; border-radius: 16px;
        width: 100%; max-width: 520px; max-height: 92vh;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      .sp-sb-modal-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 20px; border-bottom: 1px solid #eef1f4;
      }
      .sp-sb-modal-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
      .sp-sb-modal-close {
        border: 0; background: #f3f3f3; width: 34px; height: 34px;
        border-radius: 50%; cursor: pointer;
        font-size: 20px; line-height: 1; color: #444;
      }
      .sp-sb-modal-body { padding: 16px 20px 4px; overflow-y: auto; }
      .sp-sb-modal-foot {
        display: flex; gap: 8px; align-items: center;
        padding: 12px 20px 16px; border-top: 1px solid #eef1f4;
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
      .sp-sb-type-picker, .sp-sb-status-picker { display: flex; flex-wrap: wrap; gap: 6px; }
      .sp-sb-type-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 7px 12px;
        border: 1.5px solid var(--bd, #cbd5e1);
        background: var(--b, #f8fafc);
        color: var(--c, #334155);
        border-radius: 9px;
        font-family: inherit; font-size: 12px; font-weight: 600;
        cursor: pointer;
      }
      .sp-sb-type-btn.is-active { box-shadow: 0 0 0 2px var(--c, #2563EB); }
      .sp-sb-status-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 7px 12px; border: 1px solid #dfe3e8;
        background: #fff; color: #475569;
        border-radius: 9px;
        font-family: inherit; font-size: 12px; font-weight: 600;
        cursor: pointer;
      }
      .sp-sb-status-btn:hover { background: #f8fafc; }
      .sp-sb-status-btn.is-active {
        border-color: var(--c, #2563EB);
        color: var(--c, #2563EB);
      }

      @media (max-width: 700px) {
        .sp-sb-toolbar { padding: 8px 10px; gap: 6px; }
        .sp-sb-btn { padding: 6px 10px; font-size: 11px; }
        .sp-sb-hint-row { display: none; }
        .sp-sb-canvas { min-height: 55vh; }
        .sp-sb-node { min-width: 140px; }
        .sp-sb-modal-backdrop { padding: 0; align-items: flex-end; }
        .sp-sb-modal { border-radius: 18px 18px 0 0; max-height: 88vh; }
      }
    `;
    document.head.appendChild(s);

    /* Ховер-крестик на связях */
    if (!document.getElementById('spSbEdgeHoverCss')) {
      const s2 = document.createElement('style');
      s2.id = 'spSbEdgeHoverCss';
      s2.textContent = `
        .sp-sb-svg g[data-sb-edges] [data-edge-del] { opacity: 0; transition: opacity .12s ease; }
        .sp-sb-canvas:hover .sp-sb-svg g[data-sb-edges] [data-edge-del] { opacity: .9; }
      `;
      document.head.appendChild(s2);
    }
  }

  /* ============ INIT ============ */
  function init() {
    injectStyles();
    load();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
    setTimeout(startObserver, 400);
    setTimeout(startObserver, 1500);

    /* Догоняющие тики на случай позднего рендера */
    let ticks = 0;
    const t = setInterval(() => {
      ticks++;
      scheduleSync();
      if (ticks >= 20) clearInterval(t);
    }, 500);

    console.log('[StrategyBoard v2] Модуль инициализирован');
  }

  init();

  window.spStrategyBoard = {
    rebuild: scheduleSync,
    clear: () => { st.nodes = []; st.edges = []; save(); },
    isActive,
    version: '2.0.0'
  };
})();
