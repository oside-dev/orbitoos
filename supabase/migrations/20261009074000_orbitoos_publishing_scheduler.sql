-- OrbitOS scheduled publishing dispatcher (M26).
-- Runs a Vault-authenticated Edge Function once per minute. The dispatcher
-- and publishing worker both fail closed unless publishing is explicitly enabled.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists private.publishing_scheduler_leases (
  id text primary key check (id = 'global'),
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now()
);

alter table private.publishing_scheduler_leases enable row level security;
drop policy if exists publishing_scheduler_leases_service_role_all
  on private.publishing_scheduler_leases;
create policy publishing_scheduler_leases_service_role_all
  on private.publishing_scheduler_leases
  for all
  to service_role
  using (true)
  with check (true);

grant usage on schema private to service_role;
grant select, insert, update, delete
  on table private.publishing_scheduler_leases
  to service_role;
revoke all on table private.publishing_scheduler_leases
  from public, anon, authenticated;

create or replace function public.verify_orbitoos_publishing_scheduler_token(
  p_candidate text
)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  select
    p_candidate is not null
    and pg_catalog.char_length(p_candidate) between 32 and 256
    and exists (
      select 1
      from vault.decrypted_secrets as secret
      where secret.name = 'orbitoos_publishing_scheduler_token'
        and secret.decrypted_secret = p_candidate
    );
$function$;

revoke all on function public.verify_orbitoos_publishing_scheduler_token(text)
  from public, anon, authenticated;
grant execute on function public.verify_orbitoos_publishing_scheduler_token(text)
  to service_role;

create or replace function public.claim_orbitoos_publishing_scheduler_lease(
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
    raise exception 'Only service_role may claim the publishing scheduler lease'
      using errcode = '42501';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'p_lease_seconds must be between 30 and 300'
      using errcode = '22023';
  end if;

  insert into private.publishing_scheduler_leases (
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
    where private.publishing_scheduler_leases.lease_expires_at is null
       or private.publishing_scheduler_leases.lease_expires_at <= pg_catalog.clock_timestamp()
  returning lease_token into v_claimed;

  return v_claimed;
end;
$function$;

revoke all on function public.claim_orbitoos_publishing_scheduler_lease(integer)
  from public, anon, authenticated;
grant execute on function public.claim_orbitoos_publishing_scheduler_lease(integer)
  to service_role;

create or replace function public.release_orbitoos_publishing_scheduler_lease(
  p_lease_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may release the publishing scheduler lease'
      using errcode = '42501';
  end if;

  if p_lease_token is null then
    return false;
  end if;

  update private.publishing_scheduler_leases
    set lease_token = null,
        lease_expires_at = null,
        updated_at = pg_catalog.clock_timestamp()
  where id = 'global'
    and lease_token = p_lease_token;

  return found;
end;
$function$;

revoke all on function public.release_orbitoos_publishing_scheduler_lease(uuid)
  from public, anon, authenticated;
grant execute on function public.release_orbitoos_publishing_scheduler_lease(uuid)
  to service_role;

-- These first two values are deployment configuration. The publishable key is
-- intentionally public by design; the random dispatcher token is not.
do $vault$
begin
  if not exists (
    select 1 from vault.secrets where name = 'orbitoos_project_url'
  ) then
    perform vault.create_secret(
      'https://lkcbtgqdvzmaihcnxxwk.supabase.co',
      'orbitoos_project_url',
      'OrbitOS Supabase project URL used by the publishing scheduler'
    );
  end if;

  if not exists (
    select 1 from vault.secrets where name = 'orbitoos_publishable_key'
  ) then
    perform vault.create_secret(
      'sb_publishable_9HzSqSyHCuPDjsX-g43hMA_XBvbVRht',
      'orbitoos_publishable_key',
      'Public Supabase publishable API key used by pg_net to invoke the scheduler'
    );
  end if;

  if not exists (
    select 1 from vault.secrets where name = 'orbitoos_publishing_scheduler_token'
  ) then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'orbitoos_publishing_scheduler_token',
      'Random bearer token for the internal OrbitOS publishing scheduler; never expose'
    );
  end if;
end;
$vault$;

-- Keep exactly one named cron job. Cron only invokes the authenticated
-- dispatcher; it does not turn on any publishing feature flag.
do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'orbitoos-publishing-scheduler'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'orbitoos-publishing-scheduler',
    '* * * * *',
    $scheduled$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'orbitoos_project_url'
        ) || '/functions/v1/publishing-scheduler',
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
