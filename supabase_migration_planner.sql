-- =========================================================
-- SKLADAPLAN — миграция для Планировщика (planner.js)
-- =========================================================
--
-- Выполните этот файл вручную в Supabase (Project → SQL
-- Editor) один раз, до того как открывать вкладку
-- «Планировщик» в приложении. Файл аддитивный
-- (IF NOT EXISTS везде, где можно) и ничего не удаляет.
--
-- Планировщик хранит данные в двух новых, самостоятельных
-- таблицах — planner_shipments (запланированные отгрузки)
-- и planner_tasks (задачи). Они не связаны с основной
-- таблицей boxes и не влияют на неё никак — это отдельный
-- календарь/список дел, а не часть складского учёта коробок.
-- =========================================================


-- ---------------------------------------------------------
-- 1. planner_shipments
-- ---------------------------------------------------------

create table if not exists public.planner_shipments (
  id uuid primary key default gen_random_uuid(),

  date date not null,
  time text,

  title text not null,
  direction text,
  warehouse text,

  -- 'Запланирована' | 'Подготовка' | 'Готова к отгрузке' |
  -- 'Отгружена' | 'Отменена'
  status text not null default 'Запланирована',

  responsible text,
  comment text,

  created_by text,
  updated_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planner_shipments_date_idx
  on public.planner_shipments (date);


-- ---------------------------------------------------------
-- 2. planner_tasks
-- ---------------------------------------------------------

create table if not exists public.planner_tasks (
  id uuid primary key default gen_random_uuid(),

  date date not null,
  time text,

  title text not null,

  -- 'Низкий' | 'Обычный' | 'Высокий'
  priority text not null default 'Обычный',

  -- 'К выполнению' | 'В работе' | 'Выполнено' | 'Отменено'
  status text not null default 'К выполнению',

  comment text,

  created_by text,
  updated_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planner_tasks_date_idx
  on public.planner_tasks (date);


-- ---------------------------------------------------------
-- 3. Автообновление updated_at при любом UPDATE
--    (не полагаемся на то, что фронтенд всегда правильно
--    его проставит).
-- ---------------------------------------------------------

create or replace function public.planner_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists planner_shipments_set_updated_at
  on public.planner_shipments;

create trigger planner_shipments_set_updated_at
  before update on public.planner_shipments
  for each row
  execute function public.planner_set_updated_at();

drop trigger if exists planner_tasks_set_updated_at
  on public.planner_tasks;

create trigger planner_tasks_set_updated_at
  before update on public.planner_tasks
  for each row
  execute function public.planner_set_updated_at();


-- ---------------------------------------------------------
-- 4. RLS
--    Планировщик общий для всей команды склада (как и
--    остальное приложение) — доступ на чтение/запись для
--    любого залогиненного пользователя, без разделения по
--    авторству. Если у вас есть роль "наблюдатель"
--    (isViewer() в app.js) и её нужно ограничить и здесь —
--    скажите, добавим отдельную политику только на select.
-- ---------------------------------------------------------

alter table public.planner_shipments enable row level security;
alter table public.planner_tasks enable row level security;

drop policy if exists planner_shipments_all_authenticated
  on public.planner_shipments;

create policy planner_shipments_all_authenticated
  on public.planner_shipments
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists planner_tasks_all_authenticated
  on public.planner_tasks;

create policy planner_tasks_all_authenticated
  on public.planner_tasks
  for all
  to authenticated
  using (true)
  with check (true);


-- ---------------------------------------------------------
-- Готово. После выполнения этого файла планировщик в
-- приложении будет читать и писать данные напрямую в
-- planner_shipments / planner_tasks — они видны всем, кто
-- заходит в SKLADAPLAN под своей учётной записью, на любом
-- устройстве.
-- ---------------------------------------------------------
