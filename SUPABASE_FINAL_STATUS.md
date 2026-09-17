# SKLADAPLAN — final package status

This package contains the frontend working tree plus a database migration package.

## Frontend
- Existing WMS architecture preserved.
- Viewer role fails closed in the client.
- Viewer permissions are re-applied after dynamic render.
- UI receives a teal/amber design-system layer based on `Skladaplan_otchet/skladaplan.md`.
- Reduced-motion accessibility support added.
- Cache-busting version updated.
- JavaScript syntax checks pass for app/planner/tasks/help.
- `index.html` has no duplicate IDs.

## Supabase
`SUPABASE_P0.sql` is designed for the reported schema where `boxes.id` is bigint. It removes anonymous write policies, gives viewers read-only access, adds database-side admin checks, recreates the four WMS RPC contracts with `bigint[]`, and adds atomic `sp_apply_inventory`.

The migration is fail-fast if an existing non-empty `box_movements` table still contains legacy UUID ID columns. Do not run legacy migrations afterwards.

Run `SUPABASE_VERIFY.sql` after P0 and send/inspect the results before enabling production traffic.

## Important operational limitation
No browser, live Supabase project, physical scanner, or production Vercel deployment is available in this environment. Therefore this archive must not be represented as having passed a live end-to-end warehouse smoke test.
