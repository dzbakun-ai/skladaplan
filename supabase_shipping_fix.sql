-- SKLADAPLAN: исправление контракта RPC отгрузки.
-- Причина: public.boxes.id = bigint, а старая sp_ship_boxes принимала uuid[].
-- Данные boxes не удаляются.

begin;

-- Создаём корректную bigint-версию RPC.
create or replace function public.sp_ship_boxes(
  p_box_ids bigint[],
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
    "Статус" = 'Отгружено',
    "Изменил" = p_operator,
    shipped_at = now(),
    shipped_by = p_operator
  where
    id = any(p_box_ids)
    and "Статус" = 'Скомплектовано'
  returning *;
end;
$$;

-- Новый контракт доступен авторизованным пользователям.
revoke all on function public.sp_ship_boxes(bigint[], text) from public;
grant execute on function public.sp_ship_boxes(bigint[], text) to authenticated;

-- Удаляем старую несовместимую сигнатуру uuid[].
drop function if exists public.sp_ship_boxes(uuid[], text);

commit;
