/* =========================================================
   SKLADAPLAN — ОПТИМИЗАЦИЯ СКЛАДА
   Правило проекта: 1 штрихкод = 1 физическая коробка.
   Артикулы для оптимизации НЕ учитываются.

   Версия от 2026-09-28 (v3):
   1. Списки складов/зон — из state.boxes (не из warehouses/
      locations): исключает расхождение «Склад СОХ» vs «СОХ»
      и разницу в регистрах зон.
   2. Целевые поддоны — из boxes."Поддон" целевой зоны.
   3. Коробки без поддона не отбрасываются.
   4. Артикулы не влияют ни на что.
   5. Раскрывающаяся строка отчёта — таблица
      № / Штрихкод / Кол-во, одинаковые штрихкоды
      сгруппированы. Есть кнопка «Скопировать список» —
      копирует штрихкоды построчно, каждый повтор
      отдельной строкой (для сканера / Excel).
   6. «Паллет после» — корректное «было → станет».
   7. После применения оптимизации все активные
      пользователи Telegram-бота получают уведомление.
   ========================================================= */

'use strict';

const OPTIMIZATION_PAGE = 'optimization';
const OPTIMIZATION_DEFAULT_CAPACITY = 40;
const OPTIMIZATION_PAGE_SIZE = 1000;

/* ---------------------------------------------------------
   Хелпер: доступ к Supabase-клиенту.
   В app.js он объявлен через const, поэтому через
   window.supabaseClient недоступен — читаем по имени.
   --------------------------------------------------------- */
function getSupabase() {
  try {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
  } catch (e) {}
  if (window.supabaseClient) return window.supabaseClient;
  return null;
}

if (!state.optimization) {
  state.optimization = {
    warehouse: '',
    sourceZones: new Set(),
    targetZone: '',
    capacity: OPTIMIZATION_DEFAULT_CAPACITY,
    mode: 'all',
    sourcePallets: [],
    selectedPalletKeys: new Set(),
    sourceData: [],
    targetPallets: [],
    plan: [],
    excludedMoves: new Set(),
    expandedMoves: new Set(),
    calculatedAt: null,
    loading: false,
    applying: false,
    loaded: false,
    error: '',
    result: null,
    availableWarehouses: [],
    availableZones: []
  };
}

function optimizationEscape(value) {
  return escapeHtml(value == null ? '' : String(value));
}

function optimizationPalletKey(warehouse, zone, pallet) {
  return [warehouse, zone, pallet].map(v => String(v ?? '')).join('¦');
}

function optimizationUnique(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' }));
}

/* ---------------------------------------------------------
   Группировка одинаковых штрихкодов в пары { barcode, count }.
   --------------------------------------------------------- */

function optimizationGroupBarcodes(barcodes) {
  const map = new Map();

  (barcodes || []).forEach(code => {
    const key = String(code ?? '').trim();
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });

  return [...map.entries()]
    .map(([barcode, count]) => ({ barcode, count }))
    .sort((a, b) =>
      a.barcode.localeCompare(b.barcode, 'ru', { numeric: true, sensitivity: 'base' })
    );
}

/* ---------------------------------------------------------
   Списки складов и зон — из state.boxes.
   --------------------------------------------------------- */

function optimizationWarehouseList() {
  return optimizationUnique(
    (state.boxes || [])
      .map(b => (b.warehouse || '').trim())
      .filter(Boolean)
  );
}

function optimizationZoneList(warehouse) {
  if (!warehouse) return [];

  return optimizationUnique(
    (state.boxes || [])
      .filter(b => (b.warehouse || '').trim() === warehouse)
      .map(b => (b.zone_row || '').trim())
      .filter(Boolean)
  );
}

/* ---------------------------------------------------------
   Свежая выгрузка коробок выбранного склада из Supabase.
   --------------------------------------------------------- */

async function optimizationFetchAllBoxes(warehouse) {
  const rows = [];

  for (let from = 0; ; from += OPTIMIZATION_PAGE_SIZE) {
    const to = from + OPTIMIZATION_PAGE_SIZE - 1;

    const { data, error } = await supabaseClient
      .from('boxes')
      .select(BOX_SELECT)
      .eq('Склад', warehouse)
      .eq('Статус', 'На складе')
      .range(from, to);

    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < OPTIMIZATION_PAGE_SIZE) break;
  }

  return rows;
}

/* ---------------------------------------------------------
   Bootstrap — синхронный, берёт списки из state.boxes.
   --------------------------------------------------------- */

function optimizationBootstrap() {
  const opt = state.optimization;
  opt.error = '';

  const warehouses = optimizationWarehouseList();
  opt.availableWarehouses = warehouses;

  if (!opt.warehouse || !warehouses.includes(opt.warehouse)) {
    opt.warehouse = warehouses[0] || '';
  }

  const zones = optimizationZoneList(opt.warehouse);
  opt.availableZones = zones;

  if (!opt.targetZone || !zones.includes(opt.targetZone)) {
    opt.targetZone =
      zones.find(z => !opt.sourceZones.has(z)) ||
      zones[0] ||
      '';
  }

  const zoneSet = new Set(zones);
  opt.sourceZones = new Set(
    [...opt.sourceZones].filter(z => zoneSet.has(z))
  );

  opt.loaded = true;
}

/* ---------------------------------------------------------
   Группировка исходных коробок по (склад + зона + поддон).
   Одна коробка = одна запись, ничего не суммируем.
   --------------------------------------------------------- */

function optimizationGroupSourceBoxes(boxes) {
  const groups = new Map();

  boxes.forEach(box => {
    if (!box.zone_row) return;

    const palletValue = (box.pallet || '').trim();
    const key = optimizationPalletKey(box.warehouse, box.zone_row, palletValue);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        warehouse: box.warehouse,
        zone: box.zone_row,
        pallet: palletValue,
        count: 0,
        boxes: []
      });
    }

    const group = groups.get(key);
    group.count += 1;
    group.boxes.push(box);
  });

  return [...groups.values()].sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    return a.pallet.localeCompare(b.pallet, 'ru', { numeric: true });
  });
}

/* ---------------------------------------------------------
   Целевые поддоны — группировка коробок целевой зоны
   по тексту «Поддон». Никаких фильтров по артикулам.
   --------------------------------------------------------- */

function optimizationBuildTargetPallets(boxes, targetZone, capacity) {
  const groups = new Map();

  boxes
    .filter(box => box.zone_row === targetZone && (box.pallet || '').trim())
    .forEach(box => {
      const pallet = (box.pallet || '').trim();

      if (!groups.has(pallet)) {
        groups.set(pallet, {
          pallet,
          count: 0,
          boxes: []
        });
      }

      const group = groups.get(pallet);
      group.count += 1;
      group.boxes.push(box);
    });

  return [...groups.values()]
    .map(group => ({
      id: null,
      pallet: group.pallet,
      status: 'На складе',
      count: group.count,
      free: Math.max(0, capacity - group.count)
    }))
    .filter(p => p.free > 0)
    .sort((a, b) =>
      b.count - a.count ||
      a.pallet.localeCompare(b.pallet, 'ru', { numeric: true })
    );
}

/* ---------------------------------------------------------
   Подбор перемещений.
   --------------------------------------------------------- */

function optimizationChooseMoves(sourceGroups, targetPallets, capacity) {
  const targets = targetPallets.map(t => ({ ...t }));
  const moves = [];

  const eligible = sourceGroups
    .filter(group => group.count < capacity)
    .slice()
    .sort((a, b) =>
      b.count - a.count ||
      a.pallet.localeCompare(b.pallet, 'ru', { numeric: true })
    );

  eligible.forEach(source => {
    let remaining = [...source.boxes];

    while (remaining.length) {
      const target = targets
        .filter(c => c.free > 0)
        .sort((a, b) =>
          b.count - a.count ||
          a.pallet.localeCompare(b.pallet, 'ru', { numeric: true })
        )[0];

      if (!target) break;

      const amount = Math.min(remaining.length, target.free);
      const selected = remaining.splice(0, amount);

      moves.push({
        id: `${source.key}→${target.pallet}→${moves.length + 1}`,
        sourceWarehouse: source.warehouse,
        sourceZone: source.zone,
        sourcePallet: source.pallet,
        targetWarehouse: source.warehouse,
        targetZone: state.optimization.targetZone,
        targetPallet: target.pallet,
        boxIds: selected.map(box => box.id),
        barcodes: selected.map(box => normalizeBarcode(box.barcode)),
        boxCount: selected.length,
        sourceBefore: source.count,
        sourceAfter: null,
        targetBefore: target.count,
        targetAfter: target.count + selected.length
      });

      target.count += selected.length;
      target.free -= selected.length;
    }
  });

  const movedBySource = new Map();

  moves.forEach(move => {
    const key = optimizationPalletKey(move.sourceWarehouse, move.sourceZone, move.sourcePallet);
    movedBySource.set(key, (movedBySource.get(key) || 0) + move.boxCount);
  });

  moves.forEach(move => {
    const key = optimizationPalletKey(move.sourceWarehouse, move.sourceZone, move.sourcePallet);
    const sourceGroup = sourceGroups.find(g => g.key === key);
    move.sourceAfter = Math.max(0, (sourceGroup?.count || 0) - (movedBySource.get(key) || 0));
  });

  return moves;
}

function optimizationSelectedSourceGroups(groups) {
  const opt = state.optimization;
  if (opt.mode === 'all') return groups;
  return groups.filter(group => opt.selectedPalletKeys.has(group.key));
}

/* ---------------------------------------------------------
   РАСЧЁТ
   --------------------------------------------------------- */

async function optimizationCalculate() {
  const opt = state.optimization;
  const capacity = Number(opt.capacity);

  if (!opt.warehouse || !opt.targetZone) {
    toast('Выберите склад и целевую зону', 'error');
    return;
  }

  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
    toast('Вместимость паллета должна быть целым числом от 1 до 1000', 'error');
    return;
  }

  if (!opt.sourceZones.size) {
    toast('Выберите хотя бы одну исходную зону', 'error');
    return;
  }

  if (opt.sourceZones.has(opt.targetZone)) {
    toast('Целевая зона не должна одновременно быть исходной', 'error');
    return;
  }

  if (opt.mode === 'selected' && !opt.selectedPalletKeys.size) {
    toast('Выберите хотя бы один исходный паллет', 'error');
    return;
  }

  opt.loading = true;
  opt.error = '';
  opt.plan = [];
  opt.excludedMoves = new Set();
  opt.expandedMoves = new Set();
  opt.result = null;
  render();

  try {
    const boxes = await optimizationFetchAllBoxes(opt.warehouse);

    const sourceBoxes = boxes.filter(box => opt.sourceZones.has(box.zone_row));
    const sourceGroups = optimizationGroupSourceBoxes(sourceBoxes);
    const filteredGroups = optimizationSelectedSourceGroups(sourceGroups);

    const targetPallets = optimizationBuildTargetPallets(boxes, opt.targetZone, capacity);

    opt.sourceData = filteredGroups;
    opt.targetPallets = targetPallets;
    opt.plan = optimizationChooseMoves(filteredGroups, targetPallets, capacity);
    opt.calculatedAt = new Date().toISOString();
    opt.loaded = true;

    const totalMoves = opt.plan.reduce((s, m) => s + m.boxCount, 0);

    if (!filteredGroups.length) {
      toast('В выбранных исходных зонах нет коробок со статусом «На складе»', 'error');
    } else if (!targetPallets.length) {
      toast('В целевой зоне все поддоны уже заполнены до выбранного лимита', 'error');
    } else if (totalMoves === 0) {
      toast('Нет перемещений: все целевые места либо полны, либо не найдено исходных коробок', 'error');
    } else {
      toast(`Расчёт готов: ${totalMoves} коробок к перемещению`);
    }
  } catch (error) {
    console.error('optimizationCalculate:', error);
    opt.error = error?.message || 'Не удалось рассчитать оптимизацию';
    toast(opt.error, 'error');
  } finally {
    opt.loading = false;
    render();
  }
}

/* ---------------------------------------------------------
   Сводка
   --------------------------------------------------------- */

function optimizationActiveMoves() {
  const opt = state.optimization;
  return opt.plan.filter(move => !opt.excludedMoves.has(move.id));
}

function optimizationSummary() {
  const moves = optimizationActiveMoves();
  const movedBySource = new Map();

  moves.forEach(move => {
    const key = optimizationPalletKey(move.sourceWarehouse, move.sourceZone, move.sourcePallet);
    movedBySource.set(key, (movedBySource.get(key) || 0) + move.boxCount);
  });

  const sourceKeys = new Set(
    moves.map(m => optimizationPalletKey(m.sourceWarehouse, m.sourceZone, m.sourcePallet))
  );

  const freedKeys = new Set();

  movedBySource.forEach((moved, key) => {
    const source = state.optimization.sourceData.find(g => g.key === key);
    if (source && moved >= source.count) freedKeys.add(key);
  });

  const plannedSourceBoxes = state.optimization.sourceData
    .reduce((sum, g) => sum + g.count, 0);

  const movedBoxes = moves.reduce((sum, m) => sum + m.boxCount, 0);

  return {
    sourcePallets: sourceKeys.size,
    sourceBoxes: plannedSourceBoxes,
    targetPallets: new Set(moves.map(m => m.targetPallet)).size,
    movedBoxes,
    freedPallets: freedKeys.size,
    unresolvedBoxes: Math.max(0, plannedSourceBoxes - movedBoxes),
    moves: moves.length
  };
}

/* ---------------------------------------------------------
   Рендер левой панели
   --------------------------------------------------------- */

function optimizationRenderZones() {
  const opt = state.optimization;
  const zones = opt.availableZones || [];

  return zones.length
    ? zones.map(zone => `
        <label class="optimization-check">
          <input
            type="checkbox"
            data-opt-source-zone="${optimizationEscape(zone)}"
            ${opt.sourceZones.has(zone) ? 'checked' : ''}
          >
          <span class="optimization-check-main">
            <span class="optimization-check-title">${optimizationEscape(zone)}</span>
          </span>
        </label>
      `).join('')
    : '<div class="optimization-empty">Нет зон</div>';
}

function optimizationRenderSourcePallets() {
  const opt = state.optimization;
  if (opt.mode !== 'selected') return '';

  if (!opt.sourceData.length) {
    return '<div class="optimization-empty">Подходящих неполных паллет пока нет.</div>';
  }

  return opt.sourceData.map(group => {
    const checked = opt.selectedPalletKeys.has(group.key);
    const palletLabel = group.pallet || '(без поддона)';

    return `
      <label class="optimization-check">
        <input
          type="checkbox"
          data-opt-source-pallet="${optimizationEscape(group.key)}"
          ${checked ? 'checked' : ''}
        >
        <span class="optimization-check-main">
          <span class="optimization-check-title">
            ${optimizationEscape(group.zone)} · ${optimizationEscape(palletLabel)}
          </span>
          <span class="optimization-check-meta">
            ${group.count} коробок
          </span>
        </span>
      </label>
    `;
  }).join('');
}

/* ---------------------------------------------------------
   Рендер отчёта.
   Раскрывающаяся строка — таблица № / Штрихкод / Кол-во.
   --------------------------------------------------------- */

function optimizationRenderReport() {
  const opt = state.optimization;
  const moves = opt.plan;

  if (!(opt.expandedMoves instanceof Set)) {
    opt.expandedMoves = new Set();
  }

  if (!moves.length) {
    return '<div class="optimization-empty">Подходящих перемещений не найдено.</div>';
  }

  return `
    <style>
      .opt-expand-btn {
        background: transparent;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 2px 7px;
        cursor: pointer;
        font-size: 10px;
        color: #666;
        line-height: 1;
        min-width: 22px;
      }
      .opt-expand-btn:hover { background: #f0f0f0; color: #111; }

      .opt-details-row td {
        padding: 0 !important;
        background: #f7f9fb;
        border-bottom: 1px solid #e5e9ed;
      }

      .opt-details-wrap {
        padding: 12px 16px 14px;
      }

      .opt-details-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }

      .opt-details-title {
        font-size: 12px;
        font-weight: 700;
        color: #333;
      }

      .opt-details-title .opt-details-num {
        font-weight: 500;
        color: #666;
        margin-left: 6px;
      }

      .opt-details-copy {
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 6px;
        padding: 5px 10px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        color: #333;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .opt-details-copy:hover {
        background: #f0f0f0;
        border-color: #999;
      }
      .opt-details-copy:active {
        transform: scale(0.98);
      }

      .opt-barcodes-table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        border: 1px solid #e0e4e8;
        border-radius: 6px;
        overflow: hidden;
        font-size: 12px;
      }
      .opt-barcodes-table thead th {
        background: #eef1f4;
        color: #555;
        font-weight: 600;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 6px 10px;
        text-align: left;
        border-bottom: 1px solid #e0e4e8;
      }
      .opt-barcodes-table tbody td {
        padding: 6px 10px;
        border-bottom: 1px solid #f0f2f4;
        vertical-align: middle;
      }
      .opt-barcodes-table tbody tr:last-child td {
        border-bottom: 0;
      }
      .opt-barcodes-table tbody tr:hover {
        background: #fafbfc;
      }
      .opt-barcodes-table .opt-num {
        color: #999;
        font-variant-numeric: tabular-nums;
        width: 40px;
      }
      .opt-barcodes-table .opt-barcode {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 13px;
        font-weight: 600;
        color: #111;
        letter-spacing: 0.01em;
      }
      .opt-barcodes-table .opt-qty {
        width: 70px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .opt-barcodes-table .opt-qty-badge {
        display: inline-block;
        min-width: 26px;
        padding: 2px 8px;
        border-radius: 999px;
        background: #eef1f4;
        color: #444;
        font-size: 11px;
        font-weight: 700;
      }
      .opt-barcodes-table .opt-qty-badge.is-multi {
        background: var(--primary, #2563EB);
        color: #fff;
      }
      .opt-barcodes-scroll {
        max-height: 260px;
        overflow-y: auto;
        border-radius: 6px;
      }

      @media (max-width: 640px) {
        .opt-barcodes-table thead th:first-child,
        .opt-barcodes-table tbody td:first-child {
          display: none;
        }
        .opt-barcodes-table .opt-qty {
          width: 54px;
        }
        .opt-barcode {
          font-size: 12px !important;
          word-break: break-all;
        }
      }
    </style>

    <div class="optimization-report-wrap">
      <table class="optimization-report">
        <thead>
          <tr>
            <th style="width:34px;"></th>
            <th>Выполнить</th>
            <th>№</th>
            <th>Откуда</th>
            <th>Исходный паллет</th>
            <th>Коробок</th>
            <th>Куда</th>
            <th>Целевой паллет</th>
            <th>Паллет после</th>
          </tr>
        </thead>
        <tbody>
          ${moves.map((move, index) => {
            const excluded = opt.excludedMoves.has(move.id);
            const isExpanded = opt.expandedMoves.has(move.id);
            const barcodes = Array.isArray(move.barcodes) ? move.barcodes : [];
            const grouped = optimizationGroupBarcodes(barcodes);

            const rowsHtml = grouped.map((g, i) => `
              <tr>
                <td class="opt-num">${i + 1}</td>
                <td class="opt-barcode">${optimizationEscape(g.barcode)}</td>
                <td class="opt-qty">
                  <span class="opt-qty-badge ${g.count > 1 ? 'is-multi' : ''}">
                    ${g.count > 1 ? '× ' + g.count : g.count}
                  </span>
                </td>
              </tr>
            `).join('');

            return `
              <tr style="${excluded ? 'opacity:.45;' : ''}">
                <td>
                  <button
                    type="button"
                    class="opt-expand-btn"
                    data-opt-expand="${optimizationEscape(move.id)}"
                    title="${isExpanded ? 'Скрыть штрихкоды' : 'Показать штрихкоды'}"
                  >${isExpanded ? '▼' : '▶'}</button>
                </td>
                <td>
                  <input type="checkbox" data-opt-move="${optimizationEscape(move.id)}" ${excluded ? '' : 'checked'}>
                </td>
                <td>${index + 1}</td>
                <td>${optimizationEscape(move.sourceZone)}</td>
                <td>${optimizationEscape(move.sourcePallet || '—')}</td>
                <td>${move.boxCount}</td>
                <td>${optimizationEscape(move.targetZone)}</td>
                <td>${optimizationEscape(move.targetPallet)}</td>
                <td>${move.targetBefore} → ${move.targetAfter}</td>
              </tr>
              ${isExpanded ? `
                <tr class="opt-details-row">
                  <td colspan="9">
                    <div class="opt-details-wrap">
                      <div class="opt-details-head">
                        <div class="opt-details-title">
                          Штрихкоды на перемещение
                          <span class="opt-details-num">
                            · ${grouped.length} уник. · всего ${barcodes.length} кор.
                          </span>
                        </div>
                        <button
                          type="button"
                          class="opt-details-copy"
                          data-opt-copy-move="${optimizationEscape(move.id)}"
                          title="Скопировать все штрихкоды в буфер обмена"
                        >
                          📋 Скопировать список
                        </button>
                      </div>
                      <div class="opt-barcodes-scroll">
                        <table class="opt-barcodes-table">
                          <thead>
                            <tr>
                              <th>№</th>
                              <th>Штрихкод</th>
                              <th style="text-align:right;">Кол-во</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${rowsHtml || '<tr><td colspan="3" class="sp-muted" style="text-align:center;padding:14px;">Нет данных</td></tr>'}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              ` : ''}
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ---------------------------------------------------------
   Экспорт CSV
   --------------------------------------------------------- */

function optimizationExportCsv() {
  const moves = optimizationActiveMoves();

  if (!moves.length) {
    toast('В отчёте нет выбранных перемещений', 'error');
    return;
  }

  const header = [
    '№',
    'Откуда',
    'Исходный паллет',
    'Коробок',
    'Куда',
    'Целевой паллет',
    'Было на целевом',
    'Станет на целевом',
    'Штрихкоды'
  ];

  const rows = moves.map((move, index) => {
    const grouped = optimizationGroupBarcodes(move.barcodes || []);

    const barcodeText = grouped
      .map(g => g.count > 1 ? `${g.barcode}×${g.count}` : g.barcode)
      .join(', ');

    return [
      index + 1,
      move.sourceZone,
      move.sourcePallet || '',
      move.boxCount,
      move.targetZone,
      move.targetPallet,
      move.targetBefore,
      move.targetAfter,
      barcodeText
    ];
  });

  const csv = [header, ...rows]
    .map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skladaplan-optimizaciya-${todayFileDate()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================================================
   Отправка текущего плана (до применения) в Telegram.
   Кнопка «📤 В Telegram» на странице оптимизации.
   ========================================================= */
async function sendPlanToTelegram() {
  const opt = state.optimization;
  const moves = optimizationActiveMoves();

  if (!moves.length) {
    toast('Сначала рассчитайте оптимизацию', 'error');
    return;
  }

  const summary = optimizationSummary();

  /* 1. Получаем настройки бота */
  const client = getSupabase();
  if (!client) {
    toast('Supabase-клиент недоступен', 'error');
    return;
  }

  const { data: settings } = await client
    .from('telegram_settings')
    .select('bot_token, enabled')
    .eq('id', 1)
    .maybeSingle();

  if (!settings || !settings.enabled || !settings.bot_token) {
    toast('Уведомления Telegram выключены. Включите в разделе Данные → Telegram.', 'error');
    return;
  }

  const { data: users } = await client
    .from('telegram_users')
    .select('chat_id')
    .eq('active', true);

  if (!users || !users.length) {
    toast('Нет активных пользователей бота', 'error');
    return;
  }

  /* 2. Формируем текст сообщения */
  const operatorEmail =
    (typeof state !== 'undefined' && state?.user?.email) ||
    (window.state?.user?.email) ||
    '—';

  const lines = [];
  lines.push('⚙️ <b>Оптимизация — план расчёта</b>\n');
  lines.push(`Склад: <b>${escapeHtml(opt.warehouse)}</b>`);
  lines.push(`Целевая зона: <b>${escapeHtml(opt.targetZone)}</b>`);
  lines.push(`Вместимость паллета: <b>${opt.capacity}</b> кор.`);
  lines.push(`Исходных зон: <b>${opt.sourceZones.size}</b>`);
  lines.push('');

  lines.push(`📦 К перемещению коробок: <b>${summary.movedBoxes}</b>`);
  lines.push(`🔀 Операций: <b>${summary.moves}</b>`);
  lines.push(`🆓 Освободится паллет: <b>${summary.freedPallets}</b>`);

  if (summary.unresolvedBoxes > 0) {
    lines.push(`⚠️ Не размещено: <b>${summary.unresolvedBoxes}</b>`);
  }

  lines.push('');
  lines.push('<b>Перемещения:</b>');
  lines.push('');

  const previewLimit = 15;
  const preview = moves.slice(0, previewLimit);

  preview.forEach((m, i) => {
    const uniqBarcodes = new Set((m.barcodes || []).map(String)).size;

    lines.push(`${i + 1}. <code>${escapeHtml(m.sourceZone)}</code> · поддон ${escapeHtml(m.sourcePallet || '—')}`);
    lines.push(`   → <code>${escapeHtml(m.targetZone)}</code> · поддон ${escapeHtml(m.targetPallet)}`);
    lines.push(`   📦 ${m.boxCount} кор. · ${uniqBarcodes} уник.`);

    if (i < preview.length - 1) lines.push('');
  });

  if (moves.length > previewLimit) {
    lines.push('');
    lines.push(`<i>…и ещё ${moves.length - previewLimit} перемещений</i>`);
  }

  lines.push('');
  lines.push('⚠️ <b>Это только план. В базе пока ничего не изменено.</b>');
  lines.push('Чтобы применить — откройте SKLADAPLAN → Оптимизация → «Закрыть оптимизацию».');
  lines.push('');
  lines.push(`👤 ${escapeHtml(operatorEmail)}`);
  lines.push(`Время: ${new Date().toLocaleString('ru-RU')}`);

  const text = lines.join('\n');

  /* 3. Отправляем всем активным пользователям */
  let sent = 0;
  let failed = 0;

  for (const u of users) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${settings.bot_token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: u.chat_id,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (data && data.ok) sent++;
      else failed++;
    } catch (e) {
      console.warn('[Optimization] send plan error to', u.chat_id, e);
      failed++;
    }
  }

  if (sent > 0) {
    toast(`План отправлен в Telegram: ${sent} получател${sent === 1 ? 'ь' : 'ей'}`);
  } else {
    toast('Не удалось отправить план в Telegram', 'error');
  }

  if (failed > 0) {
    console.warn('[Optimization] send plan failed for', failed, 'users');
  }
}

/* =========================================================
   Уведомление в Telegram после применения оптимизации
   ========================================================= */
async function notifyOptimizationApplied(result, opt) {
  try {
    const client = getSupabase();
    if (!client) return;

    const { data: settings } = await client
      .from('telegram_settings')
      .select('bot_token, enabled')
      .eq('id', 1)
      .maybeSingle();

    if (!settings || !settings.enabled || !settings.bot_token) return;

    const { data: users } = await client
      .from('telegram_users')
      .select('chat_id')
      .eq('active', true);

    if (!users || !users.length) return;

    const operatorEmail =
      (typeof state !== 'undefined' && state?.user?.email) ||
      (window.state?.user?.email) ||
      '—';

    const text =
      '⚙️ <b>Оптимизация склада применена</b>\n\n' +
      `Целевая зона: <b>${escapeHtml(opt.targetZone)}</b>\n` +
      `📦 Перемещено коробок: <b>${result.box_count || 0}</b>\n` +
      `🔀 Операций: <b>${result.move_count || 0}</b>\n` +
      `🆓 Освободилось паллет: <b>${result.freed_pallet_count || 0}</b>\n\n` +
      `👤 ${escapeHtml(operatorEmail)}\n` +
      `Время: ${new Date().toLocaleString('ru-RU')}`;

    const reply_markup = {
      inline_keyboard: [[
        { text: '📊 Подробнее', callback_data: `opt_show:${result.optimization_id}` },
        { text: '📋 Все оптимизации', callback_data: 'cmd_opt' }
      ]]
    };

    for (const u of users) {
      try {
        await fetch(`https://api.telegram.org/bot${settings.bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: u.chat_id,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: reply_markup
          })
        });
      } catch (e) {
        console.warn('[Optimization] notify to', u.chat_id, 'error:', e);
      }
    }
  } catch (e) {
    console.warn('[Optimization] notify error:', e);
  }
}

/* ---------------------------------------------------------
   ПРИМЕНЕНИЕ
   --------------------------------------------------------- */

async function optimizationApply() {
  const opt = state.optimization;
  const moves = optimizationActiveMoves();

  if (!moves.length) {
    toast('Нет перемещений для закрытия оптимизации', 'error');
    return;
  }

  const summary = optimizationSummary();
  const confirmed = confirm(
    `Закрыть оптимизацию?\n\n` +
    `Перемещений: ${summary.moves}\n` +
    `Коробок: ${summary.movedBoxes}\n` +
    `Освободится паллет: ${summary.freedPallets}\n\n` +
    `После подтверждения SKLADAPLAN изменит адреса коробок. Операцию нельзя частично применить.`
  );

  if (!confirmed) return;

  opt.applying = true;
  opt.error = '';
  render();

  try {
    const plan = moves.map(move => ({
      source_warehouse: move.sourceWarehouse,
      source_zone: move.sourceZone,
      source_pallet: move.sourcePallet,
      target_warehouse: move.targetWarehouse,
      target_zone: move.targetZone,
      target_pallet: move.targetPallet,
      box_ids: move.boxIds
    }));

    const { data, error } = await supabaseClient.rpc('sp_apply_warehouse_optimization', {
      p_plan: plan,
      p_capacity: Number(opt.capacity),
      p_operator: state.user?.email || null,
      p_target_zone: opt.targetZone,
      p_source_zones: [...opt.sourceZones]
    });

    if (error) throw error;

    opt.result = data || {};

    try {
      await loadBoxesFromSupabase();
    } catch (reloadError) {
      console.error('optimizationApply reload:', reloadError);
      opt.error = `Оптимизация применена, но экран не удалось обновить: ${reloadError?.message || 'ошибка'}`;
    }

    opt.plan = [];
    opt.sourceData = [];
    opt.targetPallets = [];
    opt.selectedPalletKeys = new Set();
    opt.excludedMoves = new Set();
    opt.expandedMoves = new Set();
    opt.calculatedAt = null;

    toast(`Оптимизация закрыта. Перемещено коробок: ${data?.box_count ?? summary.movedBoxes}`);

    /* Уведомление в Telegram всем пользователям бота.
       Не блокирует основной поток: если что-то пойдёт не так —
       просто лог в консоль. */
    try {
      await notifyOptimizationApplied(data || {}, opt);
    } catch (e) {
      console.warn('[Optimization] notify failed:', e);
    }
  } catch (error) {
    console.error('optimizationApply:', error);
    opt.error = error?.message || 'Не удалось закрыть оптимизацию';
    toast(opt.error, 'error');
  } finally {
    opt.applying = false;
    render();
  }
}

/* ---------------------------------------------------------
   ВЬЮ
   --------------------------------------------------------- */

function warehouseOptimizationView() {
  optimizationBootstrap();

  const opt = state.optimization;
  const summary = optimizationSummary();
  const zones = opt.availableZones || [];
  const warehouses = opt.availableWarehouses || [];

  return `
    <div class="optimization-shell">
      <div class="sp-card" style="margin-bottom:16px;">
        <div class="sp-card-label">ОПТИМИЗАЦИЯ СКЛАДА</div>
        <h2 style="margin:4px 0 8px;">Консолидация паллет</h2>
        <p class="sp-muted" style="margin:0;">
          Система ищет недозаполненные поддоны в целевой зоне и подбирает,
          какие коробки из исходных зон к ним доложить, чтобы довести их
          до выбранной «Вместимости паллета». Расчёт ничего не меняет в базе
          до нажатия «Закрыть оптимизацию».
        </p>
      </div>

      ${opt.error ? `<div class="optimization-warning" style="margin-bottom:16px;">${optimizationEscape(opt.error)}</div>` : ''}
      ${opt.result ? `<div class="optimization-success" style="margin-bottom:16px;">Оптимизация №${optimizationEscape(opt.result.optimization_id || '')} применена. Перемещено коробок: ${optimizationEscape(opt.result.box_count || 0)}.</div>` : ''}

      <div class="optimization-grid">
        <div class="sp-card">
          <div class="sp-card-label">ПАРАМЕТРЫ</div>

          <div class="sp-form">
            <label>
              Склад
              <select id="optimizationWarehouse">
                ${warehouses.length
                  ? warehouses.map(name => `
                      <option value="${optimizationEscape(name)}" ${name === opt.warehouse ? 'selected' : ''}>${optimizationEscape(name)}</option>
                    `).join('')
                  : '<option value="">Нет складов в boxes</option>'}
              </select>
            </label>

            <label>
              Целевая зона / ряд
              <select id="optimizationTargetZone">
                ${zones.length
                  ? zones.map(zone => `
                      <option value="${optimizationEscape(zone)}" ${zone === opt.targetZone ? 'selected' : ''}>${optimizationEscape(zone)}</option>
                    `).join('')
                  : '<option value="">Нет зон у этого склада</option>'}
              </select>
            </label>

            <label>
              Вместимость паллета
              <input id="optimizationCapacity" type="number" min="1" max="1000" value="${optimizationEscape(opt.capacity)}">
            </label>

            <label>
              Исходные паллеты
              <select id="optimizationMode">
                <option value="all" ${opt.mode === 'all' ? 'selected' : ''}>Все подходящие</option>
                <option value="selected" ${opt.mode === 'selected' ? 'selected' : ''}>Только выбранные</option>
              </select>
            </label>
          </div>

          <div style="margin-top:18px;">
            <div class="sp-card-label">ИСХОДНЫЕ ЗОНЫ / РЯДЫ</div>
            <div class="optimization-zone-list" style="margin-top:8px;">
              ${optimizationRenderZones()}
            </div>
          </div>

          ${opt.mode === 'selected' ? `
            <div style="margin-top:18px;">
              <div class="optimization-toolbar">
                <div class="sp-card-label">ВЫБОР ПАЛЛЕТОВ</div>
                <div class="optimization-toolbar-actions">
                  <button class="sp-btn secondary" id="optimizationSelectAllPallets" type="button">Все</button>
                  <button class="sp-btn secondary" id="optimizationClearPallets" type="button">Снять</button>
                </div>
              </div>
              <div class="optimization-pallet-list" style="margin-top:8px;">
                ${optimizationRenderSourcePallets()}
              </div>
            </div>
          ` : ''}

          <div class="sp-form-actions" style="margin-top:18px;">
            <button class="sp-btn" id="optimizationCalculateBtn" type="button" ${opt.loading || opt.applying ? 'disabled' : ''}>
              ${opt.loading ? 'Расчёт…' : 'Рассчитать оптимизацию'}
            </button>
          </div>
        </div>

        <div class="sp-card">
          <div class="optimization-toolbar">
            <div>
              <div class="sp-card-label">РЕЗУЛЬТАТ</div>
              <div class="sp-muted" style="margin-top:4px;">
                ${opt.calculatedAt
                  ? `Расчёт: ${new Date(opt.calculatedAt).toLocaleString('ru-RU')}`
                  : 'Расчёт ещё не выполнен'}
              </div>
            </div>
            <div class="optimization-toolbar-actions">
              <button class="sp-btn secondary" id="optimizationExportBtn" type="button" ${!optimizationActiveMoves().length ? 'disabled' : ''}>Экспорт отчёта</button>
              <button class="sp-btn secondary" id="optimizationSendTgBtn" type="button" ${!optimizationActiveMoves().length ? 'disabled' : ''}>📤 В Telegram</button>
              <button class="sp-btn" id="optimizationApplyBtn" type="button" ${!optimizationActiveMoves().length || opt.applying ? 'disabled' : ''}>
                ${opt.applying ? 'Закрытие…' : 'Закрыть оптимизацию'}
              </button>
            </div>
          </div>

          <div class="optimization-kpis" style="margin-top:16px;">
            <div class="optimization-kpi"><div class="optimization-kpi-label">Исходные паллеты</div><div class="optimization-kpi-value">${summary.sourcePallets}</div></div>
            <div class="optimization-kpi"><div class="optimization-kpi-label">Коробок к перемещению</div><div class="optimization-kpi-value">${summary.movedBoxes}</div></div>
            <div class="optimization-kpi"><div class="optimization-kpi-label">Освободится паллет</div><div class="optimization-kpi-value">${summary.freedPallets}</div></div>
            <div class="optimization-kpi"><div class="optimization-kpi-label">Не размещено</div><div class="optimization-kpi-value">${summary.unresolvedBoxes}</div></div>
          </div>

          <div style="margin-top:16px;">
            ${summary.unresolvedBoxes
              ? `<div class="optimization-warning" style="margin-bottom:12px;">Часть коробок не удалось разместить — в целевой зоне не хватило свободного места под выбранный лимит «Вместимости паллета».</div>`
              : ''}
            ${optimizationRenderReport()}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------
   Обновление списка исходных паллет
   --------------------------------------------------------- */

async function optimizationRefreshSourcePallets() {
  const opt = state.optimization;
  if (!opt.warehouse || !opt.sourceZones.size) {
    opt.sourceData = [];
    return;
  }

  try {
    const boxes = await optimizationFetchAllBoxes(opt.warehouse);
    const sourceBoxes = boxes.filter(box => opt.sourceZones.has(box.zone_row));
    const groups = optimizationGroupSourceBoxes(sourceBoxes);

    opt.sourceData = groups.filter(g => g.count < Number(opt.capacity));

    const availableKeys = new Set(opt.sourceData.map(g => g.key));
    opt.selectedPalletKeys = new Set(
      [...opt.selectedPalletKeys].filter(key => availableKeys.has(key))
    );
  } catch (error) {
    console.error('optimizationRefreshSourcePallets:', error);
    opt.sourceData = [];
  }
}

/* ---------------------------------------------------------
   SETUP
   --------------------------------------------------------- */

function setupWarehouseOptimization() {
  const opt = state.optimization;

  if (!(opt.expandedMoves instanceof Set)) {
    opt.expandedMoves = new Set();
  }

  $('#optimizationWarehouse')?.addEventListener('change', async event => {
    opt.warehouse = event.target.value;
    opt.sourceZones = new Set();
    opt.targetZone = '';
    opt.sourceData = [];
    opt.plan = [];
    opt.selectedPalletKeys = new Set();
    opt.excludedMoves = new Set();
    opt.expandedMoves = new Set();
    opt.loaded = false;
    render();
  });

  $('#optimizationTargetZone')?.addEventListener('change', event => {
    opt.targetZone = event.target.value;
    opt.sourceZones.delete(opt.targetZone);
    opt.plan = [];
    opt.excludedMoves = new Set();
    opt.expandedMoves = new Set();
    render();
  });

  $('#optimizationCapacity')?.addEventListener('change', async event => {
    opt.capacity = Math.max(1, Math.min(1000, Number(event.target.value) || OPTIMIZATION_DEFAULT_CAPACITY));
    opt.plan = [];
    opt.excludedMoves = new Set();
    opt.expandedMoves = new Set();

    if (opt.mode === 'selected') {
      await optimizationRefreshSourcePallets();
    }

    render();
  });

  $('#optimizationMode')?.addEventListener('change', async event => {
    opt.mode = event.target.value;
    opt.plan = [];
    opt.excludedMoves = new Set();
    opt.expandedMoves = new Set();

    if (opt.mode === 'selected') {
      await optimizationRefreshSourcePallets();
    }

    render();
  });

  $all('[data-opt-source-zone]').forEach(input => {
    input.addEventListener('change', async event => {
      const zone = event.target.getAttribute('data-opt-source-zone');

      if (event.target.checked) {
        opt.sourceZones.add(zone);
      } else {
        opt.sourceZones.delete(zone);
      }

      if (zone === opt.targetZone && event.target.checked) {
        event.target.checked = false;
        opt.sourceZones.delete(zone);
      }

      opt.plan = [];
      opt.excludedMoves = new Set();
      opt.expandedMoves = new Set();

      if (opt.mode === 'selected') {
        await optimizationRefreshSourcePallets();
      }

      render();
    });
  });

  $all('[data-opt-source-pallet]').forEach(input => {
    input.addEventListener('change', event => {
      const key = event.target.getAttribute('data-opt-source-pallet');

      if (event.target.checked) {
        opt.selectedPalletKeys.add(key);
      } else {
        opt.selectedPalletKeys.delete(key);
      }

      opt.plan = [];
      opt.excludedMoves = new Set();
      opt.expandedMoves = new Set();
      render();
    });
  });

  $('#optimizationSelectAllPallets')?.addEventListener('click', () => {
    opt.selectedPalletKeys = new Set(opt.sourceData.map(g => g.key));
    render();
  });

  $('#optimizationClearPallets')?.addEventListener('click', () => {
    opt.selectedPalletKeys = new Set();
    render();
  });

  $('#optimizationCalculateBtn')?.addEventListener('click', optimizationCalculate);
  $('#optimizationExportBtn')?.addEventListener('click', optimizationExportCsv);
  $('#optimizationSendTgBtn')?.addEventListener('click', sendPlanToTelegram);
  $('#optimizationApplyBtn')?.addEventListener('click', optimizationApply);

  $all('[data-opt-move]').forEach(input => {
    input.addEventListener('change', event => {
      const id = event.target.getAttribute('data-opt-move');

      if (event.target.checked) {
        opt.excludedMoves.delete(id);
      } else {
        opt.excludedMoves.add(id);
      }

      render();
    });
  });

  $all('[data-opt-expand]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const id = btn.getAttribute('data-opt-expand');

      if (!(opt.expandedMoves instanceof Set)) {
        opt.expandedMoves = new Set();
      }

      if (opt.expandedMoves.has(id)) {
        opt.expandedMoves.delete(id);
      } else {
        opt.expandedMoves.add(id);
      }

      render();
    });
  });

  /* -------------------------------------------------------
     Кнопка «Скопировать список» в раскрытой строке.
     Копирует все штрихкоды построчно: каждый повтор —
     отдельной строкой. Формат — для сканера или Excel.
     ------------------------------------------------------- */

  $all('[data-opt-copy-move]').forEach(btn => {
    btn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();

      const moveId = btn.getAttribute('data-opt-copy-move');
      const move = opt.plan.find(m => m.id === moveId);

      if (!move) return;

      const grouped = optimizationGroupBarcodes(move.barcodes || []);

      const lines = [];
      grouped.forEach(g => {
        for (let i = 0; i < g.count; i++) {
          lines.push(g.barcode);
        }
      });

      const text = lines.join('\n');

      let success = false;

      if (typeof copyTextToClipboard === 'function') {
        success = await copyTextToClipboard(text);
      } else {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-10000px;';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          success = true;
        } catch (e) {
          success = false;
        }
      }

      if (success) {
        const oldText = btn.innerHTML;
        btn.innerHTML = '✓ Скопировано';
        setTimeout(() => { btn.innerHTML = oldText; }, 1400);
        toast(`Скопировано штрихкодов: ${lines.length}`);
      } else {
        toast('Не удалось скопировать', 'error');
      }
    });
  });
}
