-- SKLADAPLAN P0 verification. Read-only.
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('boxes','warehouses','locations','pallets','box_movements','inventory_history','tasks','planner_tasks','planner_shipments','pallet_notes')
order by tablename, policyname;

select p.proname, pg_get_function_identity_arguments(p.oid) arguments,
       p.prosecdef security_definer,
       has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('sp_collect_boxes','sp_ship_boxes','sp_move_boxes','sp_merge_pallets','skladaplan_is_admin')
order by p.proname, arguments;

select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and table_name='box_movements'
order by ordinal_position;

select 'PASS: boxes.id is bigint' check_name
where exists (select 1 from information_schema.columns where table_schema='public' and table_name='boxes' and column_name='id' and data_type='bigint');

select p.proname, pg_get_function_identity_arguments(p.oid) arguments, p.prosecdef security_definer, has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sp_apply_inventory';
