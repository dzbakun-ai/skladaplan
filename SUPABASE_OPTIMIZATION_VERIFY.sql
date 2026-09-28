-- SKLADAPLAN — verify optimization migration
-- Run after SUPABASE_OPTIMIZATION.sql.

select to_regclass('public.warehouse_optimizations') as warehouse_optimizations;
select to_regclass('public.warehouse_optimization_moves') as warehouse_optimization_moves;

select
  p.oid::regprocedure as rpc,
  has_function_privilege(
    'authenticated',
    p.oid,
    'execute'
  ) as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'sp_apply_warehouse_optimization';

select
  count(*) filter (where status = 'applied') as applied_optimizations,
  count(*) filter (where status = 'failed') as failed_optimizations,
  count(*) as total_optimizations
from public.warehouse_optimizations;
