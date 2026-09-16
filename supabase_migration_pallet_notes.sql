-- =========================================================
-- SKLADAPLAN — заметки по сформированным поддонам
-- supabase_migration_pallet_notes.sql
-- =========================================================
--
-- Выполнить ОДИН РАЗ в Supabase → SQL Editor.
--
-- Что это: отдельная маленькая таблица, чтобы можно было
-- прикрепить текстовую пометку к сформированному поддону
-- отгрузки (например «не влезло 5 коробок», «ждём машину
-- завтра», «повреждена упаковка»). Поддон в этом проекте —
-- не отдельная сущность с id, а просто текст в колонке
-- boxes."Поддон", поэтому заметка тоже привязывается по
-- тексту: направление + номер поддона.
--
-- Ничего не удаляет и не трогает boxes, pallets,
-- planner_*, tasks — полностью самостоятельная таблица.
-- =========================================================


create table if not exists public.pallet_notes (
  id uuid primary key default gen_random_uuid(),

  -- '' — если поддон без привязки к направлению
  direction text not null default '',

  pallet text not null,

  note text not null default '',

  created_by text,
  updated_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Один поддон в рамках направления — одна заметка.
create unique index if not exists pallet_notes_direction_pallet_key
  on public.pallet_notes (direction, pallet);


create or replace function public.planner_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pallet_notes_set_updated_at
  on public.pallet_notes;

create trigger pallet_notes_set_updated_at
  before update on public.pallet_notes
  for each row
  execute function public.planner_set_updated_at();


alter table public.pallet_notes enable row level security;

drop policy if exists pallet_notes_all_authenticated
  on public.pallet_notes;

create policy pallet_notes_all_authenticated
  on public.pallet_notes
  for all
  to authenticated
  using (true)
  with check (true);


-- ---------------------------------------------------------
-- Готово. Пустая заметка (note = '') удаляется из таблицы
-- самим приложением, а не хранится как пустая строка —
-- см. savePalletNote() в app.js.
-- ---------------------------------------------------------
