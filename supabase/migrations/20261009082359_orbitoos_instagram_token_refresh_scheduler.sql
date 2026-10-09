-- OrbitOS scheduled Instagram token refresh (M27).
-- Installs a daily Vault-authenticated dispatcher. Token refresh remains
-- disabled unless ORBITOS_INSTAGRAM_REFRESH_ENABLED is explicitly enabled.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists private.instagram_token_refresh_scheduler_leases (
  id text primary key check (id = 'global'),
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now()
);

alter table private.instagram_token_refresh_scheduler_leases enable row level security;
drop policy if exists instagram_token_refresh_scheduler_leases_service_role_all
  on private.instagram_token_refresh_scheduler_leases;
create policy instagram_token_refresh_scheduler_leases_service_role_all
  on private.instagram_token_refresh_scheduler_leases
  for all
  to service_role
  using (true)
  with check (true);

grant usage on schema private to service_role;
grant select, insert, update, delete
  on table private.instagram_token_refresh_scheduler_leases
  to service_role;
revoke all on table private.instagram_token_refresh_scheduler_leases
  from public, anon, authenticated;

create or replace function public.claim_orbitoos_instagram_token_refresh_scheduler_lease(
  p_lease_seconds integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_candidate uuid := pg_catalog.gen_random_uuid();
  v_claimed uuid;
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may claim the Instagram token refresh scheduler lease'
      using errcode = '42501';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'p_lease_seconds must be between 30 and 300'
      using errcode = '22023';
  end if;

  insert into private.instagram_token_refresh_scheduler_leases (
    id, lease_token, lease_expires_at, updated_at
  )
  values (
    'global',
    v_candidate,
    pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds),
    pg_catalog.clock_timestamp()
  )
  on conflict (id) do update
    set lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at,
        updated_at = excluded.updated_at
    where private.instagram_token_refresh_scheduler_leases.lease_expires_at is null
       or private.instagram_token_refresh_scheduler_leases.lease_expires_at <= pg_catalog.clock_timestamp()
  returning lease_token into v_claimed;

  return v_claimed;
end;
$function$;

revoke all on function public.claim_orbitoos_instagram_token_refresh_scheduler_lease(integer)
  from public, anon, authenticated;
grant execute on function public.claim_orbitoos_instagram_token_refresh_scheduler_lease(integer)
  to service_role;

create or replace function public.release_orbitoos_instagram_token_refresh_scheduler_lease(
  p_lease_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may release the Instagram token refresh scheduler lease'
      using errcode = '42501';
  end if;

  if p_lease_token is null then
    return false;
  end if;

  update private.instagram_token_refresh_scheduler_leases
    set lease_token = null,
        lease_expires_at = null,
        updated_at = pg_catalog.clock_timestamp()
  where id = 'global'
    and lease_token = p_lease_token;

  return found;
end;
$function$;

revoke all on function public.release_orbitoos_instagram_token_refresh_scheduler_lease(uuid)
  from public, anon, authenticated;
grant execute on function public.release_orbitoos_instagram_token_refresh_scheduler_lease(uuid)
  to service_role;

-- Re-register one named daily job. It shares the existing Vault-backed
-- scheduler token and public publishable key; no new credential is added.
do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'orbitoos-instagram-token-refresh'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'orbitoos-instagram-token-refresh',
    '17 2 * * *',
    $scheduled$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'orbitoos_project_url'
        ) || '/functions/v1/instagram-token-refresh-scheduler',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'orbitoos_publishing_scheduler_token'
          ),
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'orbitoos_publishable_key'
          )
        ),
        body := pg_catalog.jsonb_build_object(
          'source', 'pg_cron',
          'scheduled_at', pg_catalog.now()
        )
      ) as request_id;
    $scheduled$
  );
end;
$cron$;
