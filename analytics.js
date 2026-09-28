/* =========================================================
   SKLADAPLAN — АНАЛИТИКА
   =========================================================

   Что делает:
   - Кнопка «📊 Открыть аналитику» на странице «Данные».
   - Модальное окно с графиками: оборот по дням,
     распределение по статусам, топ зон, активность
     операторов, сводка.

   Что НЕ делает:
   - Ничего не пишет в базу.
   - Не трогает существующие модули.
   - Читает из уже загруженного state.boxes и из audit_log
     (журнал из предыдущего этапа).

   Зависимость:
   - Chart.js 4.x подгружается с CDN при первом открытии
     аналитики. Если нет интернета — покажет ошибку,
     остальное приложение не пострадает.
   ========================================================= */

(function () {
  'use strict';

  const CHART_LIB = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  const STYLES_ID = 'spAnalyticsStyles';
  const MODAL_ID = 'spAnalyticsModal';
  const PERIOD_DAYS = 30;

  let libLoading = null;
  const chartInstances = [];

  /* =========================================================
     СТИЛИ
     ========================================================= */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #spAnalyticsOpenBtn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--primary, #2563EB);
        color: #fff;
        border: 0;
        border-radius: 10px;
        padding: 11px 18px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 12px;
        margin-left: 8px;
      }
      #spAnalyticsOpenBtn:hover { background: var(--primary-hover, #1D4ED8); }

      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 100003;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        backdrop-filter: blur(3px);
      }
      #${MODAL_ID} .sp-an-card {
        background: #f8fafc;
        border-radius: 16px;
        width: 100%;
        max-width: 1180px;
        max-height: 92vh;
        overflow-y: auto;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
        padding: 0;
      }
      #${MODAL_ID} .sp-an-head {
        position: sticky;
        top: 0;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        border-bottom: 1px solid #eef1f4;
        z-index: 2;
      }
      #${MODAL_ID} .sp-an-head h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }
      #${MODAL_ID} .sp-an-close {
        border: 0;
        background: #f3f3f3;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: #444;
      }
      #${MODAL_ID} .sp-an-close:hover { background: #e5e5e5; }

      #${MODAL_ID} .sp-an-body {
        padding: 20px 24px 30px;
      }
      #${MODAL_ID} .sp-an-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 16px;
      }
      #${MODAL_ID} .sp-an-block {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 16px 18px;
        min-height: 300px;
        display: flex;
        flex-direction: column;
      }
      #${MODAL_ID} .sp-an-block-full {
        grid-column: 1 / -1;
      }
      #${MODAL_ID} .sp-an-block-head {
        margin-bottom: 12px;
      }
      #${MODAL_ID} .sp-an-block-head h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
      }
      #${MODAL_ID} .sp-an-block-head p {
        margin: 4px 0 0;
        font-size: 12px;
        color: #94a3b8;
      }
      #${MODAL_ID} .sp-an-canvas-wrap {
        flex: 1;
        position: relative;
        min-height: 220px;
      }

      #${MODAL_ID} .sp-an-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      #${MODAL_ID} .sp-an-kpi {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 14px 16px;
      }
      #${MODAL_ID} .sp-an-kpi-label {
        font-size: 11px;
        color: #64748b;
        font-weight: 600;
        letter-spacing: .03em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      #${MODAL_ID} .sp-an-kpi-value {
        font-size: 24px;
        font-weight: 750;
        color: #0f172a;
        line-height: 1;
      }
      #${MODAL_ID} .sp-an-kpi-sub {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 4px;
      }

      #${MODAL_ID} .sp-an-loading {
        text-align: center;
        padding: 60px 20px;
        color: #64748b;
        font-size: 14px;
      }
      #${MODAL_ID} .sp-an-error {
        background: #fff2f0;
        color: #991b1b;
        padding: 14px 16px;
        border-radius: 10px;
        font-size: 13px;
      }

      @media (max-width: 800px) {
        #${MODAL_ID} .sp-an-grid {
          grid-template-columns: 1fr;
        }
        #${MODAL_ID} .sp-an-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 640px) {
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-an-card {
          max-width: none;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
        }
        #${MODAL_ID} .sp-an-body { padding: 14px; }
        #${MODAL_ID} .sp-an-kpi-value { font-size: 20px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* =========================================================
     ЗАГРУЗКА CHART.JS
     ========================================================= */

  function loadChartLib() {
    if (window.Chart) return Promise.resolve();
    if (libLoading) return libLoading;

    libLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CHART_LIB;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Не удалось загрузить библиотеку графиков. Проверьте интернет.'));
      document.head.appendChild(s);
    });

    return libLoading;
  }

  /* =========================================================
     ДАННЫЕ
     ========================================================= */

  /* Достаёт движения из audit_log за последние N дней */
  async function fetchMovements(days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const { data, error } = await supabaseClient
      .from('audit_log')
      .select('action, table_name, changed_fields, old_data, new_data, created_at, operator_email')
      .eq('table_name', 'boxes')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .limit(20000);

    if (error) throw error;
    return data || [];
  }

  /* Разбор movements → в разрезы: приход / отгрузка / перемещение */
  function buildDailySeries(movements, days) {
    const buckets = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { received: 0, shipped: 0, moved: 0 };
    }

    movements.forEach(m => {
      const key = (m.created_at || '').slice(0, 10);
      if (!buckets[key]) return;

      if (m.action === 'INSERT') {
        buckets[key].received += 1;
      } else if (m.action === 'UPDATE') {
        const changed = Array.isArray(m.changed_fields) ? m.changed_fields : [];
        const newStatus = m.new_data?.Статус;
        const oldStatus = m.old_data?.Статус;

        if (newStatus === 'Отгружено' && oldStatus !== 'Отгружено') {
          buckets[key].shipped += 1;
        }
        if (
          changed.includes('Зона/ряд') ||
          changed.includes('Поддон') ||
          changed.includes('Склад')
        ) {
          buckets[key].moved += 1;
        }
      }
    });

    const labels = Object.keys(buckets);
    return {
      labels: labels.map(k => {
        const [y, mo, d] = k.split('-');
        return `${d}.${mo}`;
      }),
      received: labels.map(k => buckets[k].received),
      shipped: labels.map(k => buckets[k].shipped),
      moved: labels.map(k => buckets[k].moved)
    };
  }

  function buildStatusBreakdown(boxes) {
    const map = {};
    boxes.forEach(b => {
      const s = (b.status || 'Не указан').trim();
      map[s] = (map[s] || 0) + 1;
    });

    const order = ['На складе', 'Зарезервирована', 'КПодбору', 'Скомплектовано', 'Отгружено', 'Пустая'];
    const labels = Object.keys(map).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return {
      labels,
      values: labels.map(l => map[l])
    };
  }

  function buildTopZones(boxes, limit) {
    const map = {};
    boxes.forEach(b => {
      if (b.status === 'Отгружено') return;
      const z = (b.zone_row || '').trim();
      if (!z) return;
      map[z] = (map[z] || 0) + 1;
    });

    const sorted = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return {
      labels: sorted.map(([k]) => k),
      values: sorted.map(([, v]) => v)
    };
  }

  function buildOperatorsActivity(movements) {
    const map = {};
    movements.forEach(m => {
      const op = (m.operator_email || '—').trim();
      map[op] = (map[op] || 0) + 1;
    });

    const sorted = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      labels: sorted.map(([k]) => k),
      values: sorted.map(([, v]) => v)
    };
  }

  /* =========================================================
     ГРАФИКИ
     ========================================================= */

  const COLORS = {
    primary: '#2563EB',
    success: '#10b981',
    amber: '#f59e0b',
    slate: '#475569',
    red: '#ef4444',
    violet: '#8b5cf6'
  };

  function destroyAllCharts() {
    while (chartInstances.length) {
      const c = chartInstances.pop();
      try { c.destroy(); } catch (e) { /* ignore */ }
    }
  }

  function makeChart(ctx, config) {
    if (!ctx) return;
    const chart = new window.Chart(ctx, config);
    chartInstances.push(chart);
    return chart;
  }

  function renderTurnoverChart(canvas, series) {
    makeChart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Принято',
            data: series.received,
            borderColor: COLORS.success,
            backgroundColor: 'rgba(16, 185, 129, .1)',
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true
          },
          {
            label: 'Отгружено',
            data: series.shipped,
            borderColor: COLORS.primary,
            backgroundColor: 'rgba(37, 99, 235, .08)',
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true
          },
          {
            label: 'Перемещено',
            data: series.moved,
            borderColor: COLORS.amber,
            backgroundColor: 'rgba(245, 158, 11, .08)',
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            titleFont: { size: 12 },
            bodyFont: { size: 12 }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, maxRotation: 0, autoSkipPadding: 20 }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 10 }, precision: 0 }
          }
        }
      }
    });
  }

  function renderStatusChart(canvas, data) {
    const palette = [
      COLORS.slate,      // На складе
      COLORS.amber,      // Зарезервирована
      COLORS.violet,     // КПодбору
      COLORS.success,    // Скомплектовано
      COLORS.primary,    // Отгружено
      COLORS.red         // Пустая
    ];

    makeChart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.values,
          backgroundColor: data.labels.map((_, i) => palette[i % palette.length]),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 }, padding: 8 }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  function renderTopZonesChart(canvas, data) {
    makeChart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Коробок',
          data: data.values,
          backgroundColor: COLORS.primary,
          borderRadius: 5,
          barThickness: 16
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#0f172a', padding: 10 }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 10 }, precision: 0 }
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 10 } }
          }
        }
      }
    });
  }

  function renderOperatorsChart(canvas, data) {
    makeChart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Действий',
          data: data.values,
          backgroundColor: COLORS.violet,
          borderRadius: 6,
          barThickness: 22
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#0f172a', padding: 10 }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10 },
              maxRotation: 30,
              callback: function (val) {
                const label = this.getLabelForValue(val);
                return label.length > 18 ? label.slice(0, 16) + '…' : label;
              }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 10 }, precision: 0 }
          }
        }
      }
    });
  }

  /* =========================================================
     МОДАЛКА
     ========================================================= */

  function buildModalHtml() {
    return `
      <div class="sp-an-card">
        <div class="sp-an-head">
          <h2>📊 Аналитика склада</h2>
          <button type="button" class="sp-an-close" aria-label="Закрыть">×</button>
        </div>

        <div class="sp-an-body">
          <div id="spAnalyticsLoading" class="sp-an-loading">
            Загрузка данных…
          </div>

          <div id="spAnalyticsError" style="display:none;"></div>

          <div id="spAnalyticsContent" style="display:none;">
            <div class="sp-an-kpis" id="spAnalyticsKpis"></div>

            <div class="sp-an-grid" style="margin-top:16px;">
              <div class="sp-an-block sp-an-block-full">
                <div class="sp-an-block-head">
                  <h3>Оборот за последние 30 дней</h3>
                  <p>Принято / отгружено / перемещено — по дням</p>
                </div>
                <div class="sp-an-canvas-wrap">
                  <canvas id="spAnChartTurnover"></canvas>
                </div>
              </div>

              <div class="sp-an-block">
                <div class="sp-an-block-head">
                  <h3>Распределение по статусам</h3>
                  <p>Текущее состояние всех коробок</p>
                </div>
                <div class="sp-an-canvas-wrap">
                  <canvas id="spAnChartStatus"></canvas>
                </div>
              </div>

              <div class="sp-an-block">
                <div class="sp-an-block-head">
                  <h3>Топ-15 зон по количеству коробок</h3>
                  <p>Где сейчас лежит больше всего</p>
                </div>
                <div class="sp-an-canvas-wrap">
                  <canvas id="spAnChartZones"></canvas>
                </div>
              </div>

              <div class="sp-an-block sp-an-block-full">
                <div class="sp-an-block-head">
                  <h3>Активность операторов за 30 дней</h3>
                  <p>Топ-10 сотрудников по количеству действий</p>
                </div>
                <div class="sp-an-canvas-wrap">
                  <canvas id="spAnChartOperators"></canvas>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderKpis() {
    const boxes = window.state && Array.isArray(state.boxes) ? state.boxes : [];

    const total = boxes.length;
    const articles = new Set(boxes.map(b => b.article).filter(Boolean)).size;
    const pallets = new Set(
      boxes.filter(b => b.status !== 'Отгружено').map(b => b.pallet).filter(Boolean)
    ).size;
    const warehouses = new Set(boxes.map(b => b.warehouse).filter(Boolean)).size;

    document.getElementById('spAnalyticsKpis').innerHTML = `
      <div class="sp-an-kpi">
        <div class="sp-an-kpi-label">Всего коробок</div>
        <div class="sp-an-kpi-value">${total.toLocaleString('ru-RU')}</div>
        <div class="sp-an-kpi-sub">на всех складах</div>
      </div>
      <div class="sp-an-kpi">
        <div class="sp-an-kpi-label">Уникальных артикулов</div>
        <div class="sp-an-kpi-value">${articles.toLocaleString('ru-RU')}</div>
        <div class="sp-an-kpi-sub">в базе</div>
      </div>
      <div class="sp-an-kpi">
        <div class="sp-an-kpi-label">Поддонов на складе</div>
        <div class="sp-an-kpi-value">${pallets.toLocaleString('ru-RU')}</div>
        <div class="sp-an-kpi-sub">физических</div>
      </div>
      <div class="sp-an-kpi">
        <div class="sp-an-kpi-label">Складов</div>
        <div class="sp-an-kpi-value">${warehouses}</div>
        <div class="sp-an-kpi-sub">активных</div>
      </div>
    `;
  }

  async function loadAndRender() {
    const loadingEl = document.getElementById('spAnalyticsLoading');
    const errorEl = document.getElementById('spAnalyticsError');
    const contentEl = document.getElementById('spAnalyticsContent');

    try {
      /* Загружаем библиотеку параллельно с данными */
      const [movements] = await Promise.all([
        fetchMovements(PERIOD_DAYS),
        loadChartLib()
      ]);

      const boxes = window.state && Array.isArray(state.boxes) ? state.boxes : [];

      /* Строим все данные */
      const turnoverSeries = buildDailySeries(movements, PERIOD_DAYS);
      const statusData = buildStatusBreakdown(boxes);
      const zonesData = buildTopZones(boxes, 15);
      const operatorsData = buildOperatorsActivity(movements);

      /* Показываем контент */
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';

      /* KPI */
      renderKpis();

      /* Графики — с небольшой задержкой, чтобы canvas успел стать видимым */
      setTimeout(() => {
        destroyAllCharts();

        renderTurnoverChart(
          document.getElementById('spAnChartTurnover'),
          turnoverSeries
        );
        renderStatusChart(
          document.getElementById('spAnChartStatus'),
          statusData
        );
        renderTopZonesChart(
          document.getElementById('spAnChartZones'),
          zonesData
        );
        renderOperatorsChart(
          document.getElementById('spAnChartOperators'),
          operatorsData
        );
      }, 50);

    } catch (err) {
      console.error('[Analytics] error:', err);
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      errorEl.className = 'sp-an-error';
      errorEl.textContent =
        'Не удалось построить аналитику: ' + (err.message || 'неизвестная ошибка');
    }
  }

  function openModal() {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = buildModalHtml();
    document.body.appendChild(overlay);

    overlay.querySelector('.sp-an-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });

    const escHandler = e => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    loadAndRender();
  }

  function closeModal() {
    destroyAllCharts();
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  /* =========================================================
     КНОПКА НА СТРАНИЦЕ «ДАННЫЕ»
     ========================================================= */

  function attachButton() {
    if (document.getElementById('spAnalyticsOpenBtn')) return;

    const auditBtn = document.getElementById('spAuditLogOpenBtn');
    const accountCard = document.querySelector('#logoutBtn')?.closest('.sp-card');

    if (!auditBtn && !accountCard) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'spAnalyticsOpenBtn';
    btn.innerHTML = '📊 Открыть аналитику';

    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    /* Вставляем после кнопки журнала, если она есть,
       иначе — после карточки «Аккаунт» */
    if (auditBtn) {
      auditBtn.insertAdjacentElement('afterend', btn);
    } else if (accountCard) {
      accountCard.insertAdjacentElement('afterend', btn);
    }
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  function init() {
    injectStyles();

    const tryAttach = () => {
      try { attachButton(); } catch (e) {
        console.warn('[Analytics] attach error:', e);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach, { once: true });
    } else {
      tryAttach();
    }

    /* Раздел «Данные» пересобирается при каждом переходе */
    const obs = new MutationObserver(tryAttach);
    obs.observe(document.body, { childList: true, subtree: true });

    console.log('[Analytics] Модуль инициализирован');
  }

  init();

  /* Публичный API */
  window.spAnalytics = {
    open: openModal,
    close: closeModal,
    version: '1.0.0'
  };

})();
