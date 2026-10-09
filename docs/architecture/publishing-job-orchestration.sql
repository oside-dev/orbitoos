-- OrbitOS publishing job orchestration contract (M15).
-- Add worker leases and bounded retry/backoff state without enabling publishing.

alter table public.publishing_jobs
  add column if not exists max_attempts integer not null default 5;
alter table public.publishing_jobs
  add column if not exists next_attempt_at timestamptz not null default now();
alter table public.publishing_jobs
  add column if not exists last_attempt_at timestamptz;
alter table public.publishing_jobs
  add column if not exists lease_expires_at timestamptz;
alter table public.publishing_jobs
  add column if not exists lease_token uuid;

do $block$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'publishing_jobs_max_attempts_check'
      and conrelid = 'public.publishing_jobs'::regclass
  ) then
    alter table public.publishing_jobs
      add constraint publishing_jobs_max_attempts_check
      check (max_attempts between 1 and 20);
  end if;
end;
$block$;

create index if not exists publishing_jobs_due_idx
  on public.publishing_jobs(status, next_attempt_at, scheduled_at)
  where status = 'queued';

create index if not exists publishing_jobs_expired_lease_idx
  on public.publishing_jobs(lease_expires_at)
  where status = 'processing';

-- A lease token prevents a stale worker from finalizing a job after another
-- worker has reclaimed its expired lease. RPC execution is backend-only.
create or replace function public.claim_due_publishing_jobs(
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.publishing_jobs
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may claim publishing jobs'
      using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'p_limit must be between 1 and 25'
      using errcode = '22023';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'p_lease_seconds must be between 30 and 900'
      using errcode = '22023';
  end if;

  -- Expired work that has already exhausted its retry budget becomes terminal.
  update public.publishing_jobs
  set status = 'failed',
      finished_at = pg_catalog.now(),
      lease_expires_at = null,
      lease_token = null,
      last_error_code = 'MAX_ATTEMPTS_EXCEEDED',
      last_error_message = 'The publishing job exhausted its configured attempt limit.'
  where attempts >= max_attempts
    and (
      (status = 'queued'
        and scheduled_at <= pg_catalog.now()
        and next_attempt_at <= pg_catalog.now())
      or
      (status = 'processing'
        and (lease_expires_at is null or lease_expires_at <= pg_catalog.now()))
    );

  return query
  with candidates as (
    select j.id
    from public.publishing_jobs as j
    where j.attempts < j.max_attempts
      and (
        (j.status = 'queued'
          and j.scheduled_at <= pg_catalog.now()
          and j.next_attempt_at <= pg_catalog.now())
        or
        (j.status = 'processing'
          and (j.lease_expires_at is null or j.lease_expires_at <= pg_catalog.now()))
      )
    order by j.scheduled_at, j.created_at
    limit p_limit
    for update of j skip locked
  ),
  claimed as (
    update public.publishing_jobs as j
    set status = 'processing',
        attempts = j.attempts + 1,
        started_at = pg_catalog.now(),
        last_attempt_at = pg_catalog.now(),
        lease_expires_at = pg_catalog.now()
          + pg_catalog.make_interval(secs => p_lease_seconds),
        lease_token = pg_catalog.gen_random_uuid(),
        last_error_code = null,
        last_error_message = null
    from candidates as c
    where j.id = c.id
    returning j.*
  )
  select claimed.* from claimed;
end;
$function$;

create or replace function public.complete_publishing_job(
  p_job_id text,
  p_lease_token uuid,
  p_provider_post_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may complete publishing jobs'
      using errcode = '42501';
  end if;

  update public.publishing_jobs
  set status = 'published',
      provider_post_id = nullif(pg_catalog.btrim(p_provider_post_id), ''),
      finished_at = pg_catalog.now(),
      lease_expires_at = null,
      lease_token = null,
      last_error_code = null,
      last_error_message = null
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

create or replace function public.retry_publishing_job(
  p_job_id text,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retry_seconds integer default 60
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may retry publishing jobs'
      using errcode = '42501';
  end if;

  if p_retry_seconds is null or p_retry_seconds < 5 or p_retry_seconds > 86400 then
    raise exception 'p_retry_seconds must be between 5 and 86400'
      using errcode = '22023';
  end if;

  -- p_error_message must already be sanitized; never pass credentials, tokens,
  -- full provider responses, or request headers into persisted diagnostics.
  update public.publishing_jobs
  set status = case when attempts < max_attempts then 'queued' else 'failed' end,
      next_attempt_at = case
        when attempts < max_attempts
          then pg_catalog.now() + pg_catalog.make_interval(secs => p_retry_seconds)
        else next_attempt_at
      end,
      last_error_code = coalesce(
        nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_error_code, '')), 128), ''),
        'PUBLISH_FAILED'
      ),
      last_error_message = nullif(
        pg_catalog.left(coalesce(p_error_message, ''), 1000),
        ''
      ),
      finished_at = case
        when attempts < max_attempts then null
        else pg_catalog.now()
      end,
      lease_expires_at = null,
      lease_token = null
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

revoke all on function public.claim_due_publishing_jobs(integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_publishing_job(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.retry_publishing_job(text, uuid, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.claim_due_publishing_jobs(integer, integer)
  to service_role;
grant execute on function public.complete_publishing_job(text, uuid, text)
  to service_role;
grant execute on function public.retry_publishing_job(text, uuid, text, text, integer)
  to service_role;
