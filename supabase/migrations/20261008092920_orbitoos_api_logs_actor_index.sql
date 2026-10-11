-- Add actor lookup support for API audit rows.
create index if not exists api_logs_actor_user_id_idx
  on public.api_logs(actor_user_id);
