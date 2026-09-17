-- SKLADAPLAN — Supabase security audit probe
-- READ ONLY. Nothing is changed by this script.
-- Run in Supabase SQL Editor and send me the result.

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'boxes',
    'warehouses',
    'locations',
    'pallets',
    'box_movements',
    'collected_verification_sessions',
    'collected_verification_items',
    'inventory_history',
    'pallet_notes',
    'planner_shipments',
    'planner_tasks',
    'tasks'
  )
order by tablename, policyname;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'sp_collect_boxes',
    'sp_ship_boxes',
    'sp_move_boxes',
    'sp_merge_pallets'
  )
order by p.proname, arguments;

select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('boxes', 'inventory_history')
order by c.table_name, c.ordinal_position;
