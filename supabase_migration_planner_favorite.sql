-- =========================================================
-- SKLADAPLAN — избранное в задачах Планировщика
-- supabase_migration_planner_favorite.sql
-- =========================================================
--
-- Выполнить ОДИН РАЗ в Supabase → SQL Editor, после
-- supabase_migration_planner.sql.
--
-- Что делает: добавляет колонку favorite в planner_tasks —
-- она нужна кнопке-звёздочке на карточке задачи в
-- Планировщике.
--
-- Ничего не удаляет и не переносит. Таблицы boxes,
-- pallets, box_movements, tasks, planner_shipments и
-- вся складская логика не затрагиваются.
-- =========================================================


alter table public.planner_tasks
  add column if not exists favorite boolean not null default false;

create index if not exists planner_tasks_favorite_idx
  on public.planner_tasks (favorite);


-- =========================================================
-- ВНИМАНИЕ — ОТКАТ ПРЕДЫДУЩЕЙ МИГРАЦИИ
-- =========================================================
--
-- В предыдущей версии проекта был файл
-- supabase_migration_tasks_unify.sql. Он объединял два
-- задачника: переносил строки из public.tasks в
-- planner_tasks. По вашему решению разделы «Задачи» и
-- «Планировщик» снова разделены, поэтому тот перенос
-- больше не нужен.
--
-- ЕСЛИ ВЫ ЕГО УЖЕ ВЫПОЛНИЛИ — в planner_tasks лежат
-- копии задач из public.tasks. Их видно по заполненной
-- колонке legacy_task_id. Сначала посмотрите, сколько их:
--
--   select count(*)
--   from public.planner_tasks
--   where legacy_task_id is not null;
--
-- Если это действительно только копии и ничего из них вы
-- в Планировщике не правили — удалите их:
--
--   delete from public.planner_tasks
--   where legacy_task_id is not null;
--
-- И, если хотите, уберите служебную колонку:
--
--   drop index if exists planner_tasks_legacy_task_id_key;
--   alter table public.planner_tasks
--     drop column if exists legacy_task_id;
--
-- Эти три команды намеренно закомментированы: удаление
-- строк автоматически, без вашего решения, я делать не
-- буду. Оригинальные задачи в public.tasks тем переносом
-- не затрагивались — они на месте в любом случае.
--
-- ЕСЛИ ВЫ ЕГО НЕ ВЫПОЛНЯЛИ — ничего делать не нужно,
-- просто удалите тот файл, в новом архиве его уже нет.
-- =========================================================
