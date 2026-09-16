-- =========================================================
-- SKLADAPLAN — миграция для Task Manager (tasks.js)
-- =========================================================
--
-- Выполните этот файл вручную в Supabase (Project → SQL
-- Editor) один раз, до того как открывать страницу «Задачи»
-- или блок «Задачи» на Главной. Файл аддитивный
-- (if not exists везде, где можно) и ничего не удаляет и
-- не трогает существующие таблицы (boxes, planner_shipments,
-- planner_tasks и т.д.).
--
-- Почему отдельная таблица, а не planner_tasks:
-- planner_tasks — это задачи внутри Планировщика отгрузок
-- (свои статусы 'К выполнению'/'В работе'/'Выполнено'/
-- 'Отменено', обязательная дата). tasks — общие рабочие
-- задачи кладовщика с Главной и страницы «Задачи»: простой
-- чек-лист (сделано/не сделано), с избранным, без
-- обязательной даты. Смешивать эти две сущности означало бы
-- тащить чужую модель статусов туда, где она не нужна —
-- решили не трогать работающий planner_tasks и завести
-- параллельную таблицу по той же проверенной схеме.
-- =========================================================


-- ---------------------------------------------------------
-- 1. tasks
-- ---------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  description text not null default '',

  completed boolean not null default false,
  favorite boolean not null default false,

  -- 'low' | 'medium' | 'high'
  priority text not null default 'medium',

  due_date date,
  due_time text,

  created_by text,
  updated_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_due_date_idx
  on public.tasks (due_date);

create index if not exists tasks_completed_idx
  on public.tasks (completed);

create index if not exists tasks_favorite_idx
  on public.tasks (favorite);


-- ---------------------------------------------------------
-- 2. Автообновление updated_at при любом UPDATE
--    (тот же паттерн, что и planner_set_updated_at —
--    переиспользуем его же, не создаём копию функции).
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

drop trigger if exists tasks_set_updated_at
  on public.tasks;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row
  execute function public.planner_set_updated_at();


-- ---------------------------------------------------------
-- 3. RLS
--    Задачи общие для всей команды склада — доступ на
--    чтение/запись для любого залогиненного пользователя,
--    без разделения по авторству. Это тот же паттерн, что
--    уже используется в planner_shipments / planner_tasks /
--    box_movements — сделано так же для единообразия.
--
--    Разделение по роли (viewer / admin) сейчас в проекте
--    везде реализовано на уровне интерфейса (isViewer() /
--    canEdit() в app.js), а не на уровне RLS ни для одной
--    существующей таблицы — тут решили не вводить новый,
--    более строгий паттерн только для задач, а остаться
--    последовательными. Если нужно реально запретить
--    запись для viewer на уровне базы — это отдельная,
--    более крупная задача, затрагивающая все таблицы разом,
--    скажите, если она нужна.
-- ---------------------------------------------------------

alter table public.tasks enable row level security;

drop policy if exists tasks_all_authenticated
  on public.tasks;

create policy tasks_all_authenticated
  on public.tasks
  for all
  to authenticated
  using (true)
  with check (true);


-- ---------------------------------------------------------
-- Готово. После выполнения этого файла Task Manager будет
-- читать и писать данные напрямую в tasks — задачи видны
-- всем, кто заходит в SKLADAPLAN под своей учётной записью,
-- на любом устройстве, и переживают обновление страницы.
-- ---------------------------------------------------------
