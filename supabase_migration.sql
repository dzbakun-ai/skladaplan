-- =========================================================
-- SKLADAPLAN — миграция для Этапов 2–5
-- =========================================================
--
-- ВАЖНО: выполните этот файл вручную в Supabase
-- (Project → SQL Editor). У меня нет доступа к вашей живой
-- базе данных и я не мог протестировать этот скрипт на
-- реальных данных — он написан так, чтобы быть безопасным
-- для повторного запуска (IF NOT EXISTS везде, где можно) и
-- ничего не удаляет и не перезаписывает существующие данные.
-- Перед прогоном на продакшене рекомендую сначала прогнать
-- его на тестовом проекте/копии либо сделать backup
-- (Database → Backups в Supabase).
--
-- Существующие таблицы orders / order_lines / pick_items /
-- movements / directions / verification_sessions /
-- verification_items этим файлом не трогаются — их
-- фактическая структура неизвестна (в предоставленной схеме
-- были только имена таблиц и FK, без колонок), поэтому ниже
-- заведены новые, полностью самостоятельные таблицы с другими
-- именами. Если что-то из старых таблиц вы уже используете —
-- эта миграция никак на них не повлияет.
--
-- Перемещение и объединение паллет ниже сделаны по ТЕКСТОВЫМ
-- полям boxes."Склад"/"Зона/ряд"/"Поддон", а не по FK
-- (warehouse_id/location_id/pallet_id) — потому что в текущей
-- базе именно текстовые поля надёжно заполнены на всех
-- коробках (это видно по тому, как сегодня работают База и
-- Сборка), а FK есть не у всех записей. FK-колонки при этом
-- тоже обновляются, когда для текста находится подходящая
-- существующая запись в warehouses/locations/pallets.
-- =========================================================


-- ---------------------------------------------------------
-- 1. boxes: время и автор комплектации / отгрузки
--    (нужно для Этапа 2 и Этапа 7 — раньше была только
--    updated_at, которая перезаписывается любым изменением)
-- ---------------------------------------------------------

alter table public.boxes
  add column if not exists collected_at timestamptz;

alter table public.boxes
  add column if not exists collected_by text;

alter table public.boxes
  add column if not exists shipped_at timestamptz;

alter table public.boxes
  add column if not exists shipped_by text;


-- ---------------------------------------------------------
-- 2. pallets: возможность архивировать пустой поддон
--    после объединения (колонка status уже существует и
--    используется в коде — 'На складе' / 'Закрыт' — здесь
--    только добавляем archived_at; новый статус 'Пустой'
--    пишем в уже существующую колонку status).
-- ---------------------------------------------------------

alter table public.pallets
  add column if not exists archived_at timestamptz;


-- ---------------------------------------------------------
-- 3. box_movements: история перемещений (Этап 4, Этап 8)
--    Новая, самостоятельная таблица — существующую
--    таблицу movements не трогаем, т.к. не знаем её
--    фактической структуры.
-- ---------------------------------------------------------

create table if not exists public.box_movements (
  id uuid primary key default gen_random_uuid(),
  box_id uuid references public.boxes(id) on delete set null,
  barcode text,

  from_warehouse_id uuid references public.warehouses(id),
  to_warehouse_id   uuid references public.warehouses(id),

  from_location_id uuid references public.locations(id),
  to_location_id   uuid references public.locations(id),

  from_pallet_id uuid references public.pallets(id),
  to_pallet_id   uuid references public.pallets(id),

  from_warehouse_text text,
  to_warehouse_text   text,
  from_zone_text text,
  to_zone_text   text,
  from_pallet_text text,
  to_pallet_text   text,

  -- 'move' | 'pallet_merge'
  reason text not null default 'move',

  operator text,
  moved_at timestamptz not null default now()
);

alter table public.box_movements enable row level security;

drop policy if exists box_movements_select_authenticated on public.box_movements;
create policy box_movements_select_authenticated
  on public.box_movements
  for select
  to authenticated
  using (true);

drop policy if exists box_movements_insert_authenticated on public.box_movements;
create policy box_movements_insert_authenticated
  on public.box_movements
  for insert
  to authenticated
  with check (true);


-- ---------------------------------------------------------
-- 4. Проверка скомплектованного (Этап 7)
--    Отдельно от inventory_history, как и требовалось.
-- ---------------------------------------------------------

create table if not exists public.collected_verification_sessions (
  id uuid primary key default gen_random_uuid(),

  direction text,
  warehouse text,

  expected_count integer not null default 0,
  scanned_count  integer not null default 0,
  missing_count  integer not null default 0,
  extra_count    integer not null default 0,

  -- 'ok' | 'mismatch'
  status text not null default 'ok',

  operator text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.collected_verification_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.collected_verification_sessions(id) on delete cascade,
  box_id uuid references public.boxes(id),
  barcode text,
  -- 'expected_found' | 'missing' | 'extra'
  result text not null
);

alter table public.collected_verification_sessions enable row level security;
alter table public.collected_verification_items enable row level security;

drop policy if exists cvs_select_authenticated on public.collected_verification_sessions;
create policy cvs_select_authenticated
  on public.collected_verification_sessions
  for select to authenticated using (true);

drop policy if exists cvs_insert_authenticated on public.collected_verification_sessions;
create policy cvs_insert_authenticated
  on public.collected_verification_sessions
  for insert to authenticated with check (true);

drop policy if exists cvi_select_authenticated on public.collected_verification_items;
create policy cvi_select_authenticated
  on public.collected_verification_items
  for select to authenticated using (true);

drop policy if exists cvi_insert_authenticated on public.collected_verification_items;
create policy cvi_insert_authenticated
  on public.collected_verification_items
  for insert to authenticated with check (true);


-- ---------------------------------------------------------
-- 5. RPC: атомарная комплектация (КПодбору → Скомплектовано)
--    Этап 2 / Этап 15 (атомарность).
-- ---------------------------------------------------------

create or replace function public.sp_collect_boxes(
  p_box_ids uuid[],
  p_operator text,
  p_direction text default null
)
returns setof public.boxes
language plpgsql
security definer
set search_path = public
as $$
begin

  return query
  update public.boxes
  set
    "Статус"      = 'Скомплектовано',
    "Изменил"     = p_operator,
    collected_at  = now(),
    collected_by  = p_operator,
    "Направление" = coalesce(nullif(p_direction, ''), "Направление")
  where
    id = any(p_box_ids)
    and "Статус" = 'КПодбору'
  returning *;

end;
$$;

grant execute on function public.sp_collect_boxes(uuid[], text, text) to authenticated;


-- ---------------------------------------------------------
-- 6. RPC: атомарная отгрузка (Скомплектовано → Отгружено)
--    Раньше это был цикл из N отдельных UPDATE на фронтенде —
--    при сбое сети часть коробок отгружалась, часть нет.
-- ---------------------------------------------------------

create or replace function public.sp_ship_boxes(
  p_box_ids uuid[],
  p_operator text
)
returns setof public.boxes
language plpgsql
security definer
set search_path = public
as $$
begin

  return query
  update public.boxes
  set
    "Статус"    = 'Отгружено',
    "Изменил"   = p_operator,
    shipped_at  = now(),
    shipped_by  = p_operator
  where
    id = any(p_box_ids)
    and "Статус" = 'Скомплектовано'
  returning *;

end;
$$;

grant execute on function public.sp_ship_boxes(uuid[], text) to authenticated;


-- ---------------------------------------------------------
-- 7. RPC: перемещение коробок (Этап 4)
--    Работает по текстовым Склад/Зона-ряд/Поддон (основной
--    сегодняшний адрес коробки), плюс обновляет FK-колонки,
--    если для текста находится существующая запись.
--    Пишет историю в box_movements.
-- ---------------------------------------------------------

create or replace function public.sp_move_boxes(
  p_box_ids uuid[],
  p_target_warehouse text,
  p_target_zone text,
  p_target_pallet text,
  p_operator text,
  p_reason text default 'move'
)
returns setof public.boxes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_warehouse_id uuid;
  v_location_id  uuid;
  v_pallet_id    uuid;
begin

  select id into v_warehouse_id
  from public.warehouses
  where name = p_target_warehouse
  limit 1;

  select id into v_location_id
  from public.locations
  where code = p_target_zone
    and (v_warehouse_id is null or warehouse_id = v_warehouse_id)
  limit 1;

  select id into v_pallet_id
  from public.pallets
  where pallet_number = p_target_pallet
    and (v_warehouse_id is null or warehouse_id = v_warehouse_id)
  limit 1;

  insert into public.box_movements (
    box_id, barcode,
    from_warehouse_id, to_warehouse_id,
    from_location_id, to_location_id,
    from_pallet_id, to_pallet_id,
    from_warehouse_text, to_warehouse_text,
    from_zone_text, to_zone_text,
    from_pallet_text, to_pallet_text,
    reason, operator
  )
  select
    b.id, b."Штрихкод",
    b.warehouse_id, v_warehouse_id,
    b.location_id, v_location_id,
    b.pallet_id, v_pallet_id,
    b."Склад", p_target_warehouse,
    b."Зона/ряд", p_target_zone,
    b."Поддон", p_target_pallet,
    p_reason, p_operator
  from public.boxes b
  where b.id = any(p_box_ids);

  return query
  update public.boxes
  set
    "Склад"      = coalesce(nullif(p_target_warehouse, ''), "Склад"),
    "Зона/ряд"   = coalesce(nullif(p_target_zone, ''), "Зона/ряд"),
    "Поддон"     = coalesce(nullif(p_target_pallet, ''), "Поддон"),
    warehouse_id = coalesce(v_warehouse_id, warehouse_id),
    location_id  = coalesce(v_location_id, location_id),
    pallet_id    = coalesce(v_pallet_id, pallet_id),
    "Изменил"    = p_operator
  where id = any(p_box_ids)
  returning *;

end;
$$;

grant execute on function public.sp_move_boxes(uuid[], text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------
-- 8. RPC: объединение неполных паллет (Этап 3)
--    Принимает список исходных "адресов" паллет (склад/зона/
--    номер поддона как текст — так же, как их сегодня видит
--    База) и один целевой адрес. Переносит все коробки с
--    исходных адресов на целевой, атомарно, с историей.
-- ---------------------------------------------------------

create or replace function public.sp_merge_pallets(
  p_source_pallets jsonb,      -- [{"warehouse":"...","zone":"...","pallet":"..."}, ...]
  p_target_warehouse text,
  p_target_zone text,
  p_target_pallet text,
  p_operator text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_warehouse_id uuid;
  v_location_id  uuid;
  v_pallet_id    uuid;
  v_moved_count  integer;
begin

  select id into v_warehouse_id
  from public.warehouses
  where name = p_target_warehouse
  limit 1;

  select id into v_location_id
  from public.locations
  where code = p_target_zone
    and (v_warehouse_id is null or warehouse_id = v_warehouse_id)
  limit 1;

  select id into v_pallet_id
  from public.pallets
  where pallet_number = p_target_pallet
    and (v_warehouse_id is null or warehouse_id = v_warehouse_id)
  limit 1;

  insert into public.box_movements (
    box_id, barcode,
    from_warehouse_id, to_warehouse_id,
    from_location_id, to_location_id,
    from_pallet_id, to_pallet_id,
    from_warehouse_text, to_warehouse_text,
    from_zone_text, to_zone_text,
    from_pallet_text, to_pallet_text,
    reason, operator
  )
  select
    b.id, b."Штрихкод",
    b.warehouse_id, v_warehouse_id,
    b.location_id, v_location_id,
    b.pallet_id, v_pallet_id,
    b."Склад", p_target_warehouse,
    b."Зона/ряд", p_target_zone,
    b."Поддон", p_target_pallet,
    'pallet_merge', p_operator
  from public.boxes b
  where exists (
    select 1
    from jsonb_array_elements(p_source_pallets) as s
    where b."Склад" = s->>'warehouse'
      and b."Зона/ряд" = s->>'zone'
      and b."Поддон" = s->>'pallet'
  )
  and not (
    b."Склад" = p_target_warehouse
    and b."Зона/ряд" = p_target_zone
    and b."Поддон" = p_target_pallet
  );

  update public.boxes b
  set
    "Склад"      = p_target_warehouse,
    "Зона/ряд"   = p_target_zone,
    "Поддон"     = p_target_pallet,
    warehouse_id = coalesce(v_warehouse_id, b.warehouse_id),
    location_id  = coalesce(v_location_id, b.location_id),
    pallet_id    = coalesce(v_pallet_id, b.pallet_id),
    "Изменил"    = p_operator
  where exists (
    select 1
    from jsonb_array_elements(p_source_pallets) as s
    where b."Склад" = s->>'warehouse'
      and b."Зона/ряд" = s->>'zone'
      and b."Поддон" = s->>'pallet'
  )
  and not (
    b."Склад" = p_target_warehouse
    and b."Зона/ряд" = p_target_zone
    and b."Поддон" = p_target_pallet
  );

  get diagnostics v_moved_count = row_count;

  -- Если у исходных паллет есть настоящие записи в pallets —
  -- помечаем их пустыми/архивными (не обязательно, но полезно
  -- для чистоты справочника; если записи нет — просто ничего
  -- не произойдёт).
  update public.pallets p
  set
    status = 'Пустой',
    archived_at = now()
  where exists (
    select 1
    from jsonb_array_elements(p_source_pallets) as s
    where p.pallet_number = s->>'pallet'
      and not (
        p.pallet_number = p_target_pallet
        and (v_warehouse_id is null or p.warehouse_id = v_warehouse_id)
      )
  );

  return coalesce(v_moved_count, 0);

end;
$$;

grant execute on function public.sp_merge_pallets(jsonb, text, text, text, text) to authenticated;


-- ---------------------------------------------------------
-- Готово. После выполнения этого файла в Supabase SQL Editor
-- новая версия app.js сможет пользоваться sp_collect_boxes /
-- sp_ship_boxes / sp_move_boxes / sp_merge_pallets, а также
-- колонками boxes.collected_at / collected_by / shipped_at /
-- shipped_by и таблицами box_movements,
-- collected_verification_sessions, collected_verification_items.
-- ---------------------------------------------------------
