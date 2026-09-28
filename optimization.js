/* =========================================================
   SKLADAPLAN — ОПТИМИЗАЦИЯ СКЛАДА
   Расчёт выполняется в браузере на свежем snapshot.
   Применение — одной атомарной RPC в Supabase.
   ========================================================= */

'use strict';

const OPTIMIZATION_PAGE = 'optimization';
const OPTIMIZATION_DEFAULT_CAPACITY = 40;
const OPTIMIZATION_PAGE_SIZE = 1000;

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
    calculatedAt: null,
    loading: false,
    applying: false,
    loaded: false,
    error: '',
    result: null
  };
}

function optimizationEscape(value) {
  return escapeHtml(value == null ? '' : String(value));
}

function optimizationPalletKey(warehouse, zone, pallet) {
  return [warehouse, zone, pallet].map(v => String(v ?? '')).join('¦');
}

function optimizationBoxArticle(box) {
  return normalizeText(box?.article || '');
}

function optimizationUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
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

async function optimizationLoadWarehouses() {
  const { data, error } = await supabaseClient
    .from('warehouses')
    .select('id,name')
    .order('name');

  if (error) throw error;
  return data || [];
}

async function optimizationLoadLocations(warehouseId) {
  const { data, error } = await supabaseClient
    .from('locations')
    .select('id,warehouse_id,code')
    .eq('warehouse_id', warehouseId)
    .order('code');

  if (error) throw error;
  return data || [];
}

async function optimizationLoadPallets(warehouseId, locationId) {
  const { data, error } = await supabaseClient
    .from('pallets')
    .select('id,warehouse_id,location_id,pallet_number,status')
    .eq('warehouse_id', warehouseId)
    .eq('location_id', locationId)
    .order('pallet_number');

  if (error) throw error;
  return data || [];
}

async function optimizationBootstrap() {
  const opt = state.optimization;
  opt.error = '';

  const warehouses = await optimizationLoadWarehouses();
  const warehouseNames = warehouses.map(row => row.name).filter(Boolean);

  if (!opt.warehouse && warehouseNames.length) {
    opt.warehouse = warehouseNames[0];
  }

  if (!opt.warehouse) {
    opt.loaded = true;
    return;
  }

  const warehouse = warehouses.find(row => row.name === opt.warehouse);
  if (!warehouse) {
    opt.warehouse = warehouseNames[0] || '';
  }

  const locations = await optimizationLoadLocations(warehouse.id);
  const zones = optimizationUnique(locations.map(row => row.code));

  if (!opt.targetZone || !zones.includes(opt.targetZone)) {
    opt.targetZone = zones[0] || '';
  }

  if (!opt.sourceZones.size) {
    opt.sourceZones = new Set();
  }

  opt.availableWarehouses = warehouseNames;
  opt.availableLocations = locations;
  opt.availableZones = zones;
  opt.loaded = true;
}

function optimizationGroupSourceBoxes(boxes) {
  const groups = new Map();

  boxes.forEach(box => {
    const key = optimizationPalletKey(box.warehouse, box.zone_row, box.pallet);
    if (!box.pallet || !box.zone_row) return;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        warehouse: box.warehouse,
        zone: box.zone_row,
        pallet: box.pallet,
        count: 0,
        articles: new Map(),
        boxes: []
      });
    }

    const group = groups.get(key);
    const article = optimizationBoxArticle(box) || 'Без артикула';
    group.count += 1;
    group.boxes.push(box);
    group.articles.set(article, (group.articles.get(article) || 0) + 1);
  });

  return [...groups.values()].sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    return a.pallet.localeCompare(b.pallet, 'ru');
  });
}

function optimizationBuildTargetPallets(boxes, pallets, targetZone, capacity) {
  const groups = new Map();

  boxes
    .filter(box => box.zone_row === targetZone && box.pallet)
    .forEach(box => {
      if (!groups.has(box.pallet)) {
        groups.set(box.pallet, {
          pallet: box.pallet,
          count: 0,
          articles: new Set(),
          boxes: []
        });
      }
      const group = groups.get(box.pallet);
      group.count += 1;
      const article = optimizationBoxArticle(box);
      if (article) group.articles.add(article);
      group.boxes.push(box);
    });

  return pallets
    .filter(pallet => pallet.status !== 'Закрыт')
    .map(pallet => {
      const group = groups.get(pallet.pallet_number);
      const count = group?.count || 0;
      const articles = [...(group?.articles || [])];
      return {
        id: pallet.id,
        pallet: pallet.pallet_number,
        status: pallet.status,
        count,
        free: Math.max(0, capacity - count),
        article: articles.length === 1 ? articles[0] : (articles.length ? '__MULTIPLE_ARTICLES__' : ''),
        articles
      };
    })
    .filter(pallet => pallet.free > 0 && pallet.article !== '__MULTIPLE_ARTICLES__')
    .sort((a, b) => b.count - a.count || a.pallet.localeCompare(b.pallet, 'ru'));
}

function optimizationChooseMoves(sourceGroups, targetPallets, capacity) {
  const targets = targetPallets.map(target => ({ ...target }));
  const moves = [];

  const eligible = sourceGroups
    .filter(group => group.count < capacity)
    .flatMap(group => {
      const byArticle = new Map();
      group.boxes.forEach(box => {
        const article = optimizationBoxArticle(box) || '';
        if (!byArticle.has(article)) byArticle.set(article, []);
        byArticle.get(article).push(box);
      });

      return [...byArticle.entries()].map(([article, boxes]) => ({
        group,
        article,
        boxes
      }));
    });

  // First use the most-filled compatible targets, which tends to free source pallets faster.
  eligible.sort((a, b) => {
    if (a.boxes.length !== b.boxes.length) return b.boxes.length - a.boxes.length;
    return a.group.pallet.localeCompare(b.group.pallet, 'ru');
  });

  eligible.forEach(source => {
    let remaining = [...source.boxes];

    while (remaining.length) {
      const target = targets
        .filter(candidate => candidate.free > 0 && (!candidate.article || candidate.article === source.article))
        .sort((a, b) => b.count - a.count || a.pallet.localeCompare(b.pallet, 'ru'))[0];

      if (!target) break;

      const amount = Math.min(remaining.length, target.free);
      const selected = remaining.splice(0, amount);

      moves.push({
        id: `${source.group.key}→${target.pallet}→${source.article || 'none'}→${moves.length + 1}`,
        sourceWarehouse: source.group.warehouse,
        sourceZone: source.group.zone,
        sourcePallet: source.group.pallet,
        targetWarehouse: source.group.warehouse,
        targetZone: state.optimization.targetZone,
        targetPallet: target.pallet,
        article: source.article,
        boxIds: selected.map(box => box.id),
        boxCount: selected.length,
        sourceBefore: source.group.count,
        sourceAfter: null,
        targetBefore: target.count,
        targetAfter: target.count + selected.length,
        sourceBoxIds: source.group.boxes.map(box => box.id)
      });

      target.count += selected.length;
      target.free -= selected.length;
      if (!target.article && source.article) target.article = source.article;
    }
  });

  const movedBySource = new Map();
  moves.forEach(move => {
    const key = optimizationPalletKey(move.sourceWarehouse, move.sourceZone, move.sourcePallet);
    movedBySource.set(key, (movedBySource.get(key) || 0) + move.boxCount);
  });

  moves.forEach(move => {
    const key = optimizationPalletKey(move.sourceWarehouse, move.sourceZone, move.sourcePallet);
    const sourceGroup = sourceGroups.find(group => group.key === key);
    move.sourceAfter = Math.max(0, (sourceGroup?.count || 0) - (movedBySource.get(key) || 0));
  });

  return moves;
}

function optimizationSelectedSourceGroups(groups) {
  const opt = state.optimization;
  if (opt.mode === 'all') return groups;
  return groups.filter(group => opt.selectedPalletKeys.has(group.key));
}

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
  opt.result = null;
  render();

  try {
    const warehouses = await optimizationLoadWarehouses();
    const warehouse = warehouses.find(row => row.name === opt.warehouse);
    if (!warehouse) throw new Error('Склад не найден');

    const locations = await optimizationLoadLocations(warehouse.id);
    const targetLocation = locations.find(row => row.code === opt.targetZone);
    if (!targetLocation) throw new Error(`Целевая зона не найдена: ${opt.targetZone}`);

    const boxes = await optimizationFetchAllBoxes(opt.warehouse);
    const sourceBoxes = boxes.filter(box => opt.sourceZones.has(box.zone_row));
    const sourceGroups = optimizationGroupSourceBoxes(sourceBoxes);
    const filteredGroups = optimizationSelectedSourceGroups(sourceGroups);
    const targetPalletRows = await optimizationLoadPallets(warehouse.id, targetLocation.id);
    const targetPallets = optimizationBuildTargetPallets(boxes, targetPalletRows, opt.targetZone, capacity);

    opt.sourceData = filteredGroups;
    opt.targetPallets = targetPallets;
    opt.plan = optimizationChooseMoves(filteredGroups, targetPallets, capacity);
    opt.calculatedAt = new Date().toISOString();
    opt.loaded = true;

    toast(`Расчёт готов: ${opt.plan.reduce((sum, move) => sum + move.boxCount, 0)} коробок к перемещению`);
  } catch (error) {
    console.error('optimizationCalculate:', error);
    opt.error = error?.message || 'Не удалось рассчитать оптимизацию';
    toast(opt.error, 'error');
  } finally {
    opt.loading = false;
    render();
  }
}

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

  const sourceKeys = new Set(moves.map(move => optimizationPalletKey(move.sourceWarehouse, move.sourceZone, move.sourcePallet)));
  const freedKeys = new Set();

  movedBySource.forEach((moved, key) => {
    const source = state.optimization.sourceData.find(group => group.key === key);
    if (source && moved >= source.count) freedKeys.add(key);
  });

  const plannedSourceBoxes = state.optimization.sourceData.reduce((sum, group) => sum + group.count, 0);
  const movedBoxes = moves.reduce((sum, move) => sum + move.boxCount, 0);

  return {
    sourcePallets: sourceKeys.size,
    sourceBoxes: plannedSourceBoxes,
    targetPallets: new Set(moves.map(move => move.targetPallet)).size,
    movedBoxes,
    freedPallets: freedKeys.size,
    unresolvedBoxes: Math.max(0, plannedSourceBoxes - movedBoxes),
    moves: moves.length
  };
}

function optSourceGroup(warehouse, zone, pallet) {
  const key = optimizationPalletKey(warehouse, zone, pallet);
  return state.optimization.sourceData.find(group => group.key === key);
}

function optimizationRenderZones() {
  const opt = state.optimization;
  const zones = opt.availableZones || [];
  return zones.map(zone => `
    <label class="optimization-check">
      <input type="checkbox" data-opt-source-zone="${optimizationEscape(zone)}" ${opt.sourceZones.has(zone) ? 'checked' : ''}>
      <span class="optimization-check-main">
        <span class="optimization-check-title">${optimizationEscape(zone)}</span>
      </span>
    </label>
  `).join('') || '<div class="optimization-empty">Нет зон</div>';
}

function optimizationRenderSourcePallets() {
  const opt = state.optimization;
  if (opt.mode !== 'selected') return '';

  if (!opt.sourceData.length) {
    return '<div class="optimization-empty">Подходящих неполных паллет пока нет или данные ещё загружаются.</div>';
  }

  return opt.sourceData.map(group => {
    const checked = opt.selectedPalletKeys.has(group.key);
    const articleText = [...group.articles.entries()].map(([article, count]) => `${article}: ${count}`).join(' · ');
    return `
      <label class="optimization-check">
        <input type="checkbox" data-opt-source-pallet="${optimizationEscape(group.key)}" ${checked ? 'checked' : ''}>
        <span class="optimization-check-main">
          <span class="optimization-check-title">${optimizationEscape(group.zone)} · ${optimizationEscape(group.pallet)}</span>
          <span class="optimization-check-meta">${group.count} коробок · ${optimizationEscape(articleText)}</span>
        </span>
      </label>
    `;
  }).join('');
}

function optimizationRenderReport() {
  const moves = state.optimization.plan;
  if (!moves.length) {
    return '<div class="optimization-empty">Подходящих перемещений не найдено.</div>';
  }

  const cumulative = new Map();

  return `
    <div class="optimization-report-wrap">
      <table class="optimization-report">
        <thead>
          <tr>
            <th>Выполнить</th>
            <th>№</th>
            <th>Откуда</th>
            <th>Исходный паллет</th>
            <th>Артикул</th>
            <th>Коробок</th>
            <th>Куда</th>
            <th>Целевой паллет</th>
            <th>Паллет после</th>
          </tr>
        </thead>
        <tbody>
          ${moves.map((move, index) => {
            const excluded = state.optimization.excludedMoves.has(move.id);
            const previous = cumulative.get(move.targetPallet) || 0;
            const isActive = !excluded;
            const after = move.targetBefore + previous + (isActive ? move.boxCount : 0);
            if (isActive) cumulative.set(move.targetPallet, previous + move.boxCount);

            return `
              <tr style="${excluded ? 'opacity:.45;' : ''}">
                <td>
                  <input type="checkbox" data-opt-move="${optimizationEscape(move.id)}" ${excluded ? '' : 'checked'}>
                </td>
                <td>${index + 1}</td>
                <td>${optimizationEscape(move.sourceZone)}</td>
                <td>${optimizationEscape(move.sourcePallet)}</td>
                <td>${optimizationEscape(move.article || 'Без артикула')}</td>
                <td>${move.boxCount}</td>
                <td>${optimizationEscape(move.targetZone)}</td>
                <td>${optimizationEscape(move.targetPallet)}</td>
                <td>${move.targetBefore} → ${after}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function optimizationExportCsv() {
  const moves = optimizationActiveMoves();
  if (!moves.length) {
    toast('В отчёте нет выбранных перемещений', 'error');
    return;
  }

  const header = ['№','Откуда','Исходный паллет','Артикул','Коробок','Куда','Целевой паллет','Было на целевом','Станет на целевом'];
  const rows = moves.map((move, index) => [
    index + 1,
    move.sourceZone,
    move.sourcePallet,
    move.article || '',
    move.boxCount,
    move.targetZone,
    move.targetPallet,
    move.targetBefore,
    move.targetAfter
  ]);

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
    `После подтверждения SKLADAPLAN изменит адреса коробок в основной базе. Операцию нельзя частично применить.`
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
      article: move.article || null,
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
      opt.error = `Оптимизация применена в базе, но экран не удалось обновить: ${reloadError?.message || 'ошибка загрузки'}`;
    }

    opt.plan = [];
    opt.sourceData = [];
    opt.targetPallets = [];
    opt.selectedPalletKeys = new Set();
    opt.excludedMoves = new Set();
    opt.calculatedAt = null;

    toast(`Оптимизация закрыта. Перемещено коробок: ${data?.box_count ?? summary.movedBoxes}`);
  } catch (error) {
    console.error('optimizationApply:', error);
    opt.error = error?.message || 'Не удалось закрыть оптимизацию';
    toast(opt.error, 'error');
  } finally {
    opt.applying = false;
    render();
  }
}

function warehouseOptimizationView() {
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
          Система ищет свободную ёмкость в целевой зоне и формирует готовый рабочий отчёт.
          Расчёт ничего не меняет в базе до нажатия «Закрыть оптимизацию».
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
                ${warehouses.map(name => `<option value="${optimizationEscape(name)}" ${name === opt.warehouse ? 'selected' : ''}>${optimizationEscape(name)}</option>`).join('')}
              </select>
            </label>

            <label>
              Целевая зона / ряд
              <select id="optimizationTargetZone">
                ${zones.map(zone => `<option value="${optimizationEscape(zone)}" ${zone === opt.targetZone ? 'selected' : ''}>${optimizationEscape(zone)}</option>`).join('')}
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
              <div class="sp-muted" style="margin-top:4px;">${opt.calculatedAt ? `Расчёт: ${new Date(opt.calculatedAt).toLocaleString('ru-RU')}` : 'Расчёт ещё не выполнен'}</div>
            </div>
            <div class="optimization-toolbar-actions">
              <button class="sp-btn secondary" id="optimizationExportBtn" type="button" ${!optimizationActiveMoves().length ? 'disabled' : ''}>Экспорт отчёта</button>
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
            ${summary.unresolvedBoxes ? `<div class="optimization-warning" style="margin-bottom:12px;">Не все коробки удалось разместить. Их не будет в плане перемещений — физически их пока не переносим.</div>` : ''}
            ${optimizationRenderReport()}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function optimizationRefreshSourcePallets() {
  const opt = state.optimization;
  if (!opt.warehouse || !opt.sourceZones.size) return;

  try {
    const boxes = await optimizationFetchAllBoxes(opt.warehouse);
    const groups = optimizationGroupSourceBoxes(boxes.filter(box => opt.sourceZones.has(box.zone_row)));
    opt.sourceData = groups.filter(group => group.count < Number(opt.capacity));
    const availableKeys = new Set(opt.sourceData.map(group => group.key));
    opt.selectedPalletKeys = new Set([...opt.selectedPalletKeys].filter(key => availableKeys.has(key)));
  } catch (error) {
    console.error('optimizationRefreshSourcePallets:', error);
    toast(error?.message || 'Не удалось загрузить паллеты', 'error');
  }
}

function setupWarehouseOptimization() {
  const opt = state.optimization;

  if (!opt.loaded) {
    opt.loading = true;
    optimizationBootstrap()
      .then(async () => {
        if (opt.mode === 'selected') await optimizationRefreshSourcePallets();
      })
      .catch(error => {
        console.error('optimizationBootstrap:', error);
        opt.error = error?.message || 'Не удалось загрузить данные склада';
      })
      .finally(() => {
        opt.loading = false;
        render();
      });
    return;
  }

  $('#optimizationWarehouse')?.addEventListener('change', async event => {
    opt.warehouse = event.target.value;
    opt.sourceZones = new Set();
    opt.targetZone = '';
    opt.sourceData = [];
    opt.plan = [];
    opt.selectedPalletKeys = new Set();
    opt.loaded = false;
    render();
  });

  $('#optimizationTargetZone')?.addEventListener('change', event => {
    opt.targetZone = event.target.value;
    opt.sourceZones.delete(opt.targetZone);
    opt.plan = [];
    render();
  });

  $('#optimizationCapacity')?.addEventListener('change', async event => {
    opt.capacity = Math.max(1, Math.min(1000, Number(event.target.value) || OPTIMIZATION_DEFAULT_CAPACITY));
    opt.plan = [];
    if (opt.mode === 'selected') await optimizationRefreshSourcePallets();
    render();
  });

  $('#optimizationMode')?.addEventListener('change', async event => {
    opt.mode = event.target.value;
    opt.plan = [];
    if (opt.mode === 'selected') await optimizationRefreshSourcePallets();
    render();
  });

  $all('[data-opt-source-zone]').forEach(input => {
    input.addEventListener('change', async event => {
      const zone = event.target.getAttribute('data-opt-source-zone');
      if (event.target.checked) opt.sourceZones.add(zone);
      else opt.sourceZones.delete(zone);
      if (zone === opt.targetZone && event.target.checked) event.target.checked = false;
      opt.plan = [];
      if (opt.mode === 'selected') await optimizationRefreshSourcePallets();
      render();
    });
  });

  $all('[data-opt-source-pallet]').forEach(input => {
    input.addEventListener('change', event => {
      const key = event.target.getAttribute('data-opt-source-pallet');
      if (event.target.checked) opt.selectedPalletKeys.add(key);
      else opt.selectedPalletKeys.delete(key);
      opt.plan = [];
      render();
    });
  });

  $('#optimizationSelectAllPallets')?.addEventListener('click', () => {
    opt.selectedPalletKeys = new Set(opt.sourceData.map(group => group.key));
    render();
  });

  $('#optimizationClearPallets')?.addEventListener('click', () => {
    opt.selectedPalletKeys = new Set();
    render();
  });

  $('#optimizationCalculateBtn')?.addEventListener('click', optimizationCalculate);
  $('#optimizationExportBtn')?.addEventListener('click', optimizationExportCsv);
  $('#optimizationApplyBtn')?.addEventListener('click', optimizationApply);

  $all('[data-opt-move]').forEach(input => {
    input.addEventListener('change', event => {
      const id = event.target.getAttribute('data-opt-move');
      if (event.target.checked) opt.excludedMoves.delete(id);
      else opt.excludedMoves.add(id);
      render();
    });
  });
}
