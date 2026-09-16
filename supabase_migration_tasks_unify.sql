-- =========================================================
-- SKLADAPLAN — объединение задач
-- supabase_migration_tasks_unify.sql
-- =========================================================
--
-- Выполнить ОДИН РАЗ в Supabase → SQL Editor, после
-- supabase_migration_planner.sql.
--
-- Что делает этот файл:
--
--   1. добавляет колонку favorite в planner_tasks;
--   2. переносит задачи из public.tasks в planner_tasks;
--   3. помечает перенесённые строки, чтобы повторный
--      запуск не создал дублей.
--
-- Чего этот файл НЕ делает:
--
--   * не удаляет таблицу public.tasks;
--   * не удаляет из неё ни одной строки;
--   * не трогает boxes, приёмку, сборку, отгрузку,
--     перемещение, паллеты, зоны, RPC и вообще ничего
--     из складского учёта.
--
-- Почему planner_tasks, а не public.tasks:
-- в проекте было два независимых задачника. Источником
-- истины выбран planner_tasks — у него более полная
-- модель (дата, время, приоритет, статусы, комментарий)
-- и он уже связан с отгрузками в одном календаре.
-- public.tasks был плоским чек-листом и использовался
-- только модулем tasks.js, который теперь удалён.
-- =========================================================


-- ---------------------------------------------------------
-- 1. favorite в planner_tasks
--    Единственное, чего не хватало planner_tasks по
--    сравнению с public.tasks. Аддитивно, со значением
--    по умолчанию — существующие строки не меняются.
-- ---------------------------------------------------------

alter table public.planner_tasks
  add column if not exists favorite boolean not null default false;

create index if not exists planner_tasks_favorite_idx
  on public.planner_tasks (favorite);


-- ---------------------------------------------------------
-- 2. Служебная колонка для идемпотентного переноса.
--    Хранит id исходной строки из public.tasks —
--    по ней видно, что именно уже перенесено.
-- ---------------------------------------------------------

alter table public.planner_tasks
  add column if not exists legacy_task_id uuid;

create unique index if not exists planner_tasks_legacy_task_id_key
  on public.planner_tasks (legacy_task_id)
  where legacy_task_id is not null;


-- ---------------------------------------------------------
-- 3. Перенос данных
--
--    Выполняется только если таблица public.tasks реально
--    существует (если вы её так и не создали — блок просто
--    тихо пропускается).
--
--    Соответствие полей:
--
--      title       -> title
--      description -> comment
--      favorite    -> favorite
--      due_date    -> date   (если пусто — дата создания,
--                             потому что в planner_tasks
--                             дата обязательна)
--      due_time    -> time
--      completed   -> status 'Выполнено' / 'К выполнению'
--      priority    -> low/medium/high => Низкий/Обычный/Высокий
-- ---------------------------------------------------------

do $$
begin

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tasks'
  ) then

    insert into public.planner_tasks (
      date,
      time,
      title,
      priority,
      status,
      comment,
      favorite,
      legacy_task_id,
      created_by,
      updated_by,
      created_at
    )
    select
      coalesce(t.due_date, t.created_at::date),
      nullif(t.due_time, ''),
      t.title,
      case t.priority
        when 'low'  then 'Низкий'
        when 'high' then 'Высокий'
        else 'Обычный'
      end,
      case when t.completed then 'Выполнено' else 'К выполнению' end,
      nullif(t.description, ''),
      coalesce(t.favorite, false),
      t.id,
      t.created_by,
      t.updated_by,
      t.created_at
    from public.tasks t
    where not exists (
      select 1
      from public.planner_tasks p
      where p.legacy_task_id = t.id
    );

    raise notice 'SKLADAPLAN: задачи из public.tasks перенесены в planner_tasks.';

  else

    raise notice 'SKLADAPLAN: таблицы public.tasks нет — переносить нечего.';

  end if;

end
$$;


-- ---------------------------------------------------------
-- 4. Проверка (выполните вручную, чтобы убедиться)
-- ---------------------------------------------------------
--
--   select count(*) from public.tasks;          -- было
--   select count(*) from public.planner_tasks
--     where legacy_task_id is not null;         -- перенесено
--
-- Числа должны совпадать.
--
-- Таблицу public.tasks можно удалить ПОЗЖЕ, вручную,
-- когда вы сами убедитесь, что всё на месте:
--
--   drop table public.tasks;
--
-- Намеренно не делаю этого здесь.
-- ---------------------------------------------------------
