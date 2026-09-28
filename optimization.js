/* =========================================================
   SKLADAPLAN — ОПТИМИЗАЦИЯ СКЛАДА
   Правило проекта: 1 штрихкод = 1 физическая коробка.

   Версия v4 (2026-09-28):
   - Можно выбрать НЕСКОЛЬКО целевых зон.
   - Исходные и целевые зоны взаимно исключаются.
   - Алгоритм распределяет коробки по всем выбранным
     целевым зонам, заполняя по приоритету.
   - При применении план делится по целевым зонам —
     RPC вызывается отдельно для каждой.
   - Кнопка «📤 В Telegram» отправляет план до применения.
   ========================================================= */

'use strict';

const OPTIMIZATION_PAGE = 'optimization';
const OPTIMIZATION_DEFAULT_CAPACITY = 40;
const OPTIMIZATION_PAGE_SIZE = 1000;

/* ---------------------------------------------------------
   Хелпер: доступ к Supabase-клиенту.
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
    targetZones: new Set(),
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
} else {
  /* Миграция при обновлении страницы без перезагрузки */
  if (!(state.optimization.targetZones instanceof Set)) {
    state.optimization.targetZones = new Set();
  }
  if ('targetZone' in state.optimization) {
    /* старое поле больше не используется */
    delete state.optimization.targetZone;
  }
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

/* =========================================================
   Списки складов и зон
   ========================================================= */

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

/* =========================================================
   Bootstrap
   ========================================================= */

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

  const zoneSet = new Set(zones);

  /* Чистим исходные и целевые от зон, которых больше нет */
  opt.sourceZones = new Set(
    [...opt.sourceZones].filter(z => zoneSet.has(z))
  );
  opt.targetZones = new Set(
    [...opt.targetZones].filter(z => zoneSet.has(z))
  );

  opt.loaded = true;
}

/* =========================================================
   Группировка исходных коробок
   ========================================================= */

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

/* =========================================================
   Целевые паллеты — из всех выбранных целевых зон
   ========================================================= */

function optimizationBuildTargetPallets(boxes, targetZonesSet, capacity) {
  const groups = new Map();

  boxes
    .filter(box =>
      targetZonesSet.has(box.zone_row) &&
      (box.pallet || '').trim()
    )
    .forEach(box => {
      const zone = box.zone_row;
      const pallet = (box.pallet || '').trim();
      const key = zone + '¦' + pallet;

      if (!groups.has(key)) {
        groups.set(key, {
          zone,
          pallet,
          count: 0
        });
      }
      groups.get(key).count += 1;
    });

  return [...groups.values()]
    .map(group => ({
      id: null,
      zone: group.zone,
      pallet: group.pallet,
      status: 'На складе',
      count: group.count,
      free: Math.max(0, capacity - group.count)
    }))
    .filter(p => p.free > 0)
    .sort((a, b) =>
      b.count - a.count ||
      a.zone.localeCompare(b.zone, 'ru') ||
      a.pallet.localeCompare(b.pallet, 'ru', { numeric: true })
    );
}

/* =========================================================
   Подбор перемещений
   ========================================================= */

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
          a.zone.localeCompare(b.zone, 'ru') ||
          a.pallet.localeCompare(b.pallet, 'ru', { numeric: true })
        )[0];

      if (!target) break;

      const amount = Math.min(remaining.length, target.free);
      const selected = remaining.splice(0, amount);

      moves.push({
        id: `${source.key}→${target.zone}→${target.pallet}→${moves.length + 1}`,
        sourceWarehouse: source.warehouse,
        sourceZone: source.zone,
        sourcePallet: source.pallet,
        targetWarehouse: source.warehouse,
        targetZone: target.zone,
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

/* =========================================================
   РАСЧЁТ
   ========================================================= */

async function optimizationCalculate() {
  const opt = state.optimization;
  const capacity = Number(opt.capacity);

  if (!opt.warehouse) {
    toast('Выберите склад', 'error');
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

  if (!opt.targetZones.size) {
    toast('Выберите хотя бы одну целевую зону', 'error');
    return;
  }

  /* Исходные и целевые не должны пересекаться */
  for (const z of opt.sourceZones) {
    if (opt.targetZones.has(z)) {
      toast(`Зона «${z}» не может быть одновременно исходной и целевой`, 'error');
      return;
    }
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

    const targetPallets = optimizationBuildTargetPallets(boxes, opt.targetZones, capacity);

    opt.sourceData = filteredGroups;
    opt.targetPallets = targetPallets;
    opt.plan = optimizationChooseMoves(filteredGroups, targetPallets, capacity);
    opt.calculatedAt = new Date().toISOString();
    opt.loaded = true;

    const totalMoves = opt.plan.reduce((s, m) => s + m.boxCount, 0);

    if (!filteredGroups.length) {
      toast('В выбранных исходных зонах нет коробок со статусом «На складе»', 'error');
    } else if (!targetPallets.length) {
      toast('В целевых зонах все поддоны уже заполнены до выбранного лимита', 'error');
    } else if (totalMoves === 0) {
      toast('Нет перемещений: все целевые места полны', 'error');
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

/* =========================================================
   Сводка
   ========================================================= */

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

  const targetZonesInPlan = new Set(moves.map(m => m.targetZone));

  return {
    sourcePallets: sourceKeys.size,
    sourceBoxes: plannedSourceBoxes,
    targetPallets: new Set(moves.map(m => m.targetZone + '¦' + m.targetPallet)).size,
    targetZones: targetZonesInPlan.size,
    movedBoxes,
    freedPallets: freedKeys.size,
    unresolvedBoxes: Math.max(0, plannedSourceBoxes - movedBoxes),
    moves: moves.length
  };
}

/* =========================================================
   Рендер списка исходных зон
   ========================================================= */

function optimizationRenderSourceZones() {
  const opt = state.optimization;
  const zones = opt.availableZones || [];

  return zones.length
    ? zones.map(zone => {
        const isTarget = opt.targetZones.has(zone);
        return `
          <label class="optimization-check ${isTarget ? 'optimization-check-disabled' : ''}">
            <input
              type="checkbox"
              data-opt-source-zone="${optimizationEscape(zone)}"
              ${opt.sourceZones.has(zone) ? 'checked' : ''}
              ${isTarget ? 'disabled' : ''}
            >
            <span class="optimization-check-main">
              <span class="optimization-check-title">${optimizationEscape(zone)}</span>
              ${isTarget ? '<span class="optimization-check-meta">уже выбрана как целевая</span>' : ''}
            </span>
          </label>
        `;
      }).join('')
    : '<div class="optimization-empty">Нет зон</div>';
}

function optimizationRenderTargetZones() {
  const opt = state.optimization;
  const zones = opt.availableZones || [];

  return zones.length
    ? zones.map(zone => {
        const isSource = opt.sourceZones.has(zone);
        return `
          <label class="optimization-check ${isSource ? 'optimization-check-disabled' : ''}">
            <input
              type="checkbox"
              data-opt-target-zone="${optimizationEscape(zone)}"
              ${opt.targetZones.has(zone) ? 'checked' : ''}
              ${isSource ? 'disabled' : ''}
            >
            <span class="optimization-check-main">
              <span class="optimization-check-title">${optimizationEscape(zone)}</span>
              ${isSource ? '<span class="optimization-check-meta">уже выбрана как исходная</span>' : ''}
            </span>
          </label>
        `;
      }).join('')
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

/* =========================================================
   Рендер отчёта
   ========================================================= */

function optimizationRenderReport() {
  const opt = state.optimization;
  const moves = opt.plan;

  if (!(opt.expandedMoves instanceof Set)) opt.expandedMoves = new Set();

  if (!moves.length) {
    return '<div class="optimization-empty">Подходящих перемещений не найдено.</div>';
  }

  return `
    <style>
      .opt-expand-btn {
        background: transparent; border: 1px solid #ddd;
        border-radius: 4px; padding: 2px 7px; cursor: pointer;
        font-size: 10px; color: #666; line-height: 1; min-width: 22px;
      }
      .opt-expand-btn:hover { background: #f0f0f0; color: #111; }
      .opt-details-row td {
        padding: 0 !important; background: #f7f9fb;
        border-bottom: 1px solid #e5e9ed;
      }
      .opt-details-wrap { padding: 12px 16px 14px; }
      .opt-details-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 10px; flex-wrap: wrap;
      }
      .opt-details-title { font-size: 12px; font-weight: 700; color: #333; }
      .opt-details-title .opt-details-num { font-weight: 500; color: #666; margin-left: 6px; }
      .opt-details-copy {
        background: #fff; border: 1px solid #ccc; border-radius: 6px;
        padding: 5px 10px; cursor: pointer; font-size: 11px; font-weight: 600;
        color: #333; display: inline-flex; align-items: center; gap: 5px;
      }
      .opt-details-copy:hover { background: #f0f0f0; border-color: #999; }
      .opt-barcodes-table {
        width: 100%; border-collapse: collapse; background: #fff;
        border: 1px solid #e0e4e8; border-radius: 6px; overflow: hidden; font-size: 12px;
      }
      .opt-barcodes-table thead th {
        background: #eef1f4; color: #555; font-weight: 600; font-size: 10px;
        text-transform: uppercase; letter-spacing: 0.04em;
        padding: 6px 10px; text-align: left; border-bottom: 1px solid #e0e4e8;
      }
      .opt-barcodes-table tbody td {
        padding: 6px 10px; border-bottom: 1px solid #f0f2f4; vertical-align: middle;
      }
      .opt-barcodes-table tbody tr:last-child td { border-bottom: 0; }
      .opt-barcodes-table tbody tr:hover { background: #fafbfc; }
      .opt-barcodes-table .opt-num {
        color: #999; font-variant-numeric: tabular-nums; width: 40px;
      }
      .opt-barcodes-table .opt-barcode {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 13px; font-weight: 600; color: #111; letter-spacing: 0.01em;
      }
      .opt-barcodes-table .opt-qty {
        width: 70px; text-align: right; font-variant-numeric: tabular-nums;
      }
      .opt-barcodes-table .opt-qty-badge {
        display: inline-block; min-width: 26px; padding: 2px 8px;
        border-radius: 999px; background: #eef1f4; color: #444;
        font-size: 11px; font-weight: 700;
      }
      .opt-barcodes-table .opt-qty-badge.is-multi {
        background: var(--primary, #2563EB); color: #fff;
      }
      .opt-barcodes-scroll { max-height: 260px; overflow-y: auto; border-radius: 6px; }
      @media (max-width: 640px) {
        .opt-barcodes-table thead th:first-child,
        .opt-barcodes-table tbody td:first-child { display: none; }
        .opt-barcodes-table .opt-qty { width: 54px; }
        .opt-barcode { font-size: 12px !important; word-break: break-all; }
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
                  <button type="button" class="opt-expand-btn"
                    data-opt-expand="${optimizationEscape(move.id)}">${isExpanded ? '▼' : '▶'}</button>
                </td>
                <td><input type="checkbox" data-opt-move="${optimizationEscape(move.id)}" ${excluded ? '' : 'checked'}></td>
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
                        <button type="button" class="opt-details-copy"
                          data-opt-copy-move="${optimizationEscape(move.id)}">📋 Скопировать список</button>
                      </div>
                      <div class="opt-barcodes-scroll">
                        <table class="opt-barcodes-table">
                          <thead><tr><th>№</th><th>Штрихкод</th><th style="text-align:right;">Кол-во</th></tr></thead>
                          <tbody>${rowsHtml || '<tr><td colspan="3" style="text-align:center;padding:14px;">Нет данных</td></tr>'}</tbody>
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

/* =========================================================
   Экспорт CSV
   ========================================================= */

function optimizationExportCsv() {
  const moves = optimizationActiveMoves();
  if (!moves.length) { toast('В отчёте нет выбранных перемещений', 'error'); return; }

  const header = ['№','Откуда','Исходный паллет','Коробок','Куда','Целевой паллет','Было на целевом','Станет на целевом','Штрихкоды'];
  const rows = moves.map((move, index) => {
    const grouped = optimizationGroupBarcodes(move.barcodes || []);
    const barcodeText = grouped.map(g => g.count > 1 ? `${g.barcode}×${g.count}` : g.barcode).join(', ');
    return [index + 1, move.sourceZone, move.sourcePallet || '', move.boxCount, move.targetZone, move.targetPallet, move.targetBefore, move.targetAfter, barcodeText];
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
   ПРИМЕНЕНИЕ — по группам (по каждой целевой зоне отдельно)
   ========================================================= */

async function optimizationApply() {
  const opt = state.optimization;
  const moves = optimizationActiveMoves();

  if (!moves.length) { toast('Нет перемещений для закрытия оптимизации', 'error'); return; }

  const summary = optimizationSummary();
  const confirmed = confirm(
    `Закрыть оптимизацию?\n\n` +
    `Целевых зон: ${summary.targetZones}\n` +
    `Перемещений: ${summary.moves}\n` +
    `Коробок: ${summary.movedBoxes}\n` +
    `Освободится паллет: ${summary.freedPallets}\n\n` +
    (summary.targetZones > 1
      ? `План будет применён по одной зоне за раз.\nЕсли одна зона упадёт — предыдущие уже применятся.\n\n`
      : '') +
    `После подтверждения SKLADAPLAN изменит адреса коробок.`
  );

  if (!confirmed) return;

  opt.applying = true;
  opt.error = '';
  render();

  /* Группируем moves по targetZone */
  const groupsByZone = new Map();
  moves.forEach(move => {
    if (!groupsByZone.has(move.targetZone)) groupsByZone.set(move.targetZone, []);
    groupsByZone.get(move.targetZone).push(move);
  });

  const zoneOrder = [...groupsByZone.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
  const results = [];
  let totalBoxes = 0;
  let totalMoves = 0;
  let totalFreed = 0;
  let failedZones = [];

  for (const zone of zoneOrder) {
    const zoneMoves = groupsByZone.get(zone);

    const plan = zoneMoves.map(move => ({
      source_warehouse: move.sourceWarehouse,
      source_zone: move.sourceZone,
      source_pallet: move.sourcePallet,
      target_warehouse: move.targetWarehouse,
      target_zone: move.targetZone,
      target_pallet: move.targetPallet,
      box_ids: move.boxIds
    }));

    try {
      const { data, error } = await supabaseClient.rpc('sp_apply_warehouse_optimization', {
        p_plan: plan,
        p_capacity: Number(opt.capacity),
        p_operator: state.user?.email || null,
        p_target_zone: zone,
        p_source_zones: [...opt.sourceZones]
      });

      if (error) throw error;

      results.push({ zone, ok: true, data: data || {} });
      totalBoxes += (data?.box_count || 0);
      totalMoves += (data?.move_count || 0);
      totalFreed += (data?.freed_pallet_count || 0);
    } catch (e) {
      console.error(`optimizationApply zone ${zone}:`, e);
      results.push({ zone, ok: false, error: e?.message || String(e) });
      failedZones.push(zone);
    }
  }

  opt.result = {
    optimization_id: results.find(r => r.ok)?.data?.optimization_id || null,
    box_count: totalBoxes,
    move_count: totalMoves,
    freed_pallet_count: totalFreed,
    zones_applied: results.filter(r => r.ok).length,
    zones_failed: failedZones.length,
    results
  };

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

  if (failedZones.length) {
    toast(`Перемещено коробок: ${totalBoxes}. Ошибка в зонах: ${failedZones.join(', ')}`, 'error');
  } else {
    toast(`Оптимизация закрыта. Перемещено коробок: ${totalBoxes}`);
  }

  try {
    await notifyOptimizationApplied(opt.result, opt);
  } catch (e) {
    console.warn('[Optimization] notify failed:', e);
  }

  opt.applying = false;
  render();
}

/* =========================================================
   Уведомление о применении
   ========================================================= */

async function notifyOptimizationApplied(result, opt) {
  try {
    const client = getSupabase();
    if (!client) return;

    const { data: settings } = await client
      .from('telegram_settings')
      .select('bot_token, enabled')
      .eq('id', 1).maybeSingle();

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

    const zonesList = [...(opt.targetZones || [])].join(', ') || '—';

    const text =
      '⚙️ <b>Оптимизация склада применена</b>\n\n' +
      `Целевые зоны: <b>${escapeHtml(zonesList)}</b>\n` +
      `📦 Перемещено коробок: <b>${result.box_count || 0}</b>\n` +
      `🔀 Операций: <b>${result.move_count || 0}</b>\n` +
      `🆓 Освободилось паллет: <b>${result.freed_pallet_count || 0}</b>\n\n` +
      (result.zones_failed ? `⚠️ Ошибки в зонах: ${result.zones_failed}\n\n` : '') +
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
            chat_id: u.chat_id, text, parse_mode: 'HTML',
            disable_web_page_preview: true, reply_markup
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

/* =========================================================
   Отправка плана в Telegram (до применения)
   ========================================================= */

async function sendPlanToTelegram() {
  const opt = state.optimization;
  const moves = optimizationActiveMoves();

  if (!moves.length) { toast('Сначала рассчитайте оптимизацию', 'error'); return; }

  const summary = optimizationSummary();

  const client = getSupabase();
  if (!client) { toast('Supabase-клиент недоступен', 'error'); return; }

  const { data: settings } = await client
    .from('telegram_settings')
    .select('bot_token, enabled')
    .eq('id', 1).maybeSingle();

  if (!settings || !settings.enabled || !settings.bot_token) {
    toast('Уведомления Telegram выключены. Включите в разделе Данные → Telegram.', 'error');
    return;
  }

  const { data: users } = await client
    .from('telegram_users')
    .select('chat_id')
    .eq('active', true);

  if (!users || !users.length) { toast('Нет активных пользователей бота', 'error'); return; }

  const operatorEmail =
    (typeof state !== 'undefined' && state?.user?.email) ||
    (window.state?.user?.email) ||
    '—';

  const zonesList = [...opt.targetZones].join(', ');

  const lines = [];
  lines.push('⚙️ <b>Оптимизация — план расчёта</b>\n');
  lines.push(`Склад: <b>${escapeHtml(opt.warehouse)}</b>`);
  lines.push(`Целевые зоны: <b>${escapeHtml(zonesList)}</b>`);
  lines.push(`Вместимость паллета: <b>${opt.capacity}</b> кор.`);
  lines.push(`Исходных зон: <b>${opt.sourceZones.size}</b>`);
  lines.push('');
  lines.push(`📦 К перемещению коробок: <b>${summary.movedBoxes}</b>`);
  lines.push(`🔀 Операций: <b>${summary.moves}</b>`);
  lines.push(`🆓 Освободится паллет: <b>${summary.freedPallets}</b>`);
  if (summary.unresolvedBoxes > 0) lines.push(`⚠️ Не размещено: <b>${summary.unresolvedBoxes}</b>`);
  lines.push('');
  lines.push('<b>Перемещения:</b>');
  lines.push('');

  const preview = moves.slice(0, 15);
  preview.forEach((m, i) => {
    lines.push(`${i + 1}. <code>${escapeHtml(m.sourceZone)}</code> · поддон ${escapeHtml(m.sourcePallet || '—')}`);
    lines.push(`   → <code>${escapeHtml(m.targetZone)}</code> · поддон ${escapeHtml(m.targetPallet)}`);
    lines.push(`   📦 ${m.boxCount} кор.`);
    if (i < preview.length - 1) lines.push('');
  });

  if (moves.length > preview.length) {
    lines.push('');
    lines.push(`<i>…и ещё ${moves.length - preview.length} перемещений</i>`);
  }

  lines.push('');
  lines.push('⚠️ <b>Это только план. В базе пока ничего не изменено.</b>');
  lines.push(`👤 ${escapeHtml(operatorEmail)}`);
  lines.push(`Время: ${new Date().toLocaleString('ru-RU')}`);

  const text = lines.join('\n');

  let sent = 0;
  for (const u of users) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${settings.bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: u.chat_id, text, parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.ok) sent++;
    } catch (e) {
      console.warn('[Optimization] send plan error to', u.chat_id, e);
    }
  }

  if (sent > 0) toast(`План отправлен в Telegram: ${sent}`);
  else toast('Не удалось отправить план в Telegram', 'error');
}

/* =========================================================
   ВЬЮ
   ========================================================= */

function warehouseOptimizationView() {
  optimizationBootstrap();

  const opt = state.optimization;
  const summary = optimizationSummary();
  const zones = opt.availableZones || [];
  const warehouses = opt.availableWarehouses || [];

  const targetZonesSelected = opt.targetZones instanceof Set ? opt.targetZones.size : 0;
  const targetZonesLabel = targetZonesSelected
    ? `Выбрано: ${targetZonesSelected}`
    : 'Не выбрано ни одной';

  return `
    <div class="optimization-shell">
      <div class="sp-card" style="margin-bottom:16px;">
        <div class="sp-card-label">ОПТИМИЗАЦИЯ СКЛАДА</div>
        <h2 style="margin:4px 0 8px;">Консолидация паллет</h2>
        <p class="sp-muted" style="margin:0;">
          Система ищет недозаполненные поддоны в исходных зонах и распределяет
          коробки по выбранным целевым зонам. Можно указать несколько целевых
          зон — алгоритм заполнит их по приоритету. Расчёт ничего не меняет в базе
          до нажатия «Закрыть оптимизацию».
        </p>
      </div>

      ${opt.error ? `<div class="optimization-warning" style="margin-bottom:16px;">${optimizationEscape(opt.error)}</div>` : ''}
      ${opt.result ? `<div class="optimization-success" style="margin-bottom:16px;">Оптимизация применена. Перемещено коробок: ${optimizationEscape(opt.result.box_count || 0)}. Зон: ${optimizationEscape(opt.result.zones_applied || 0)}${opt.result.zones_failed ? `, ошибок в зонах: ${opt.result.zones_failed}` : ''}.</div>` : ''}

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
              ${optimizationRenderSourceZones()}
            </div>
          </div>

          <div style="margin-top:18px;">
            <div class="sp-card-label">ЦЕЛЕВЫЕ ЗОНЫ / РЯДЫ</div>
            <div class="sp-muted" style="font-size:11px;margin-top:2px;">${targetZonesLabel}</div>
            <div class="optimization-zone-list" style="margin-top:8px;">
              ${optimizationRenderTargetZones()}
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
              ? `<div class="optimization-warning" style="margin-bottom:12px;">Часть коробок не удалось разместить — в выбранных целевых зонах не хватило свободного места. Можно добавить ещё целевые зоны или увеличить вместимость паллета.</div>`
              : ''}
            ${optimizationRenderReport()}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   Обновление списка исходных паллет
   ========================================================= */

async function optimizationRefreshSourcePallets() {
  const opt = state.optimization;
  if (!opt.warehouse || !opt.sourceZones.size) { opt.sourceData = []; return; }

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

/* =========================================================
   SETUP
   ========================================================= */

function setupWarehouseOptimization() {
  const opt = state.optimization;

  if (!(opt.expandedMoves instanceof Set)) opt.expandedMoves = new Set();
  if (!(opt.targetZones instanceof Set)) opt.targetZones = new Set();

  $('#optimizationWarehouse')?.addEventListener('change', async event => {
    opt.warehouse = event.target.value;
    opt.sourceZones = new Set();
    opt.targetZones = new Set();
    opt.sourceData = [];
    opt.plan = [];
    opt.selectedPalletKeys = new Set();
    opt.excludedMoves = new Set();
    opt.expandedMoves = new Set();
    opt.loaded = false;
    render();
  });

  $('#optimizationCapacity')?.addEventListener('change', async event => {
    opt.capacity = Math.max(1, Math.min(1000, Number(event.target.value) || OPTIMIZATION_DEFAULT_CAPACITY));
    opt.plan = [];
    opt.excludedMoves = new Set();
    opt.expandedMoves = new Set();
    if (opt.mode === 'selected') await optimizationRefreshSourcePallets();
    render();
  });

  $('#optimizationMode')?.addEventListener('change', async event => {
    opt.mode = event.target.value;
    opt.plan = [];
    opt.excludedMoves = new Set();
    opt.expandedMoves = new Set();
    if (opt.mode === 'selected') await optimizationRefreshSourcePallets();
    render();
  });

  /* Исходные зоны */
  $all('[data-opt-source-zone]').forEach(input => {
    input.addEventListener('change', async event => {
      const zone = event.target.getAttribute('data-opt-source-zone');
      if (event.target.checked) {
        if (opt.targetZones.has(zone)) {
          toast(`Зона «${zone}» уже выбрана как целевая. Сначала снимите её оттуда.`, 'error');
          event.target.checked = false;
          return;
        }
        opt.sourceZones.add(zone);
      } else {
        opt.sourceZones.delete(zone);
      }
      opt.plan = [];
      opt.excludedMoves = new Set();
      opt.expandedMoves = new Set();
      if (opt.mode === 'selected') await optimizationRefreshSourcePallets();
      render();
    });
  });

  /* Целевые зоны */
  $all('[data-opt-target-zone]').forEach(input => {
    input.addEventListener('change', event => {
      const zone = event.target.getAttribute('data-opt-target-zone');
      if (event.target.checked) {
        if (opt.sourceZones.has(zone)) {
          toast(`Зона «${zone}» уже выбрана как исходная. Сначала снимите её оттуда.`, 'error');
          event.target.checked = false;
          return;
        }
        opt.targetZones.add(zone);
      } else {
        opt.targetZones.delete(zone);
      }
      opt.plan = [];
      opt.excludedMoves = new Set();
      opt.expandedMoves = new Set();
      render();
    });
  });

  /* Исходные паллеты */
  $all('[data-opt-source-pallet]').forEach(input => {
    input.addEventListener('change', event => {
      const key = event.target.getAttribute('data-opt-source-pallet');
      if (event.target.checked) opt.selectedPalletKeys.add(key);
      else opt.selectedPalletKeys.delete(key);
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
      if (event.target.checked) opt.excludedMoves.delete(id);
      else opt.excludedMoves.add(id);
      render();
    });
  });

  $all('[data-opt-expand]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.getAttribute('data-opt-expand');
      if (opt.expandedMoves.has(id)) opt.expandedMoves.delete(id);
      else opt.expandedMoves.add(id);
      render();
    });
  });

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
        for (let i = 0; i < g.count; i++) lines.push(g.barcode);
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
        } catch (e) { success = false; }
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
