-- OrbitOS audited publishing-job reconciliation contract (M23).
-- This resolves an ambiguous post outcome without automatically retrying the post.
-- Keep this file as the architecture/source SQL for the live migration.

create schema if not exists private;

create table if not exists private.publishing_job_reconciliation_events (
  event_id uuid primary key default pg_catalog.gen_random_uuid(),
  job_id text not null unique,
  workspace_id text not null,
  operator_id uuid not null,
  resolution text not null
    check (resolution in ('confirmed_published', 'closed_without_retry')),
  provider_post_id text,
  evidence_reference text not null
    check (pg_catalog.length(pg_catalog.btrim(evidence_reference)) between 3 and 500),
  notes text not null default ''
    check (pg_catalog.length(notes) <= 1000),
  created_at timestamptz not null default pg_catalog.now(),
  constraint publishing_job_reconciliation_resolution_fields_check
    check (
      (resolution = 'confirmed_published' and provider_post_id is not null
        and pg_catalog.length(pg_catalog.btrim(provider_post_id)) between 1 and 512)
      or
      (resolution = 'closed_without_retry' and provider_post_id is null)
    )
);

-- Retain audit rows independently of jobs/workspaces so later clean-up cannot erase
-- the fact that a privileged operator reconciled an ambiguous publish outcome.
alter table private.publishing_job_reconciliation_events enable row level security;
revoke all on table private.publishing_job_reconciliation_events
  from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select, insert on table private.publishing_job_reconciliation_events to service_role;

-- Explicit service-role policies make the intended private access model visible
-- to security advisors. These do not grant table privileges to client roles.
drop policy if exists publishing_job_reconciliation_service_role_read
  on private.publishing_job_reconciliation_events;
create policy publishing_job_reconciliation_service_role_read
  on private.publishing_job_reconciliation_events
  for select to service_role
  using (true);

drop policy if exists publishing_job_reconciliation_service_role_insert
  on private.publishing_job_reconciliation_events;
create policy publishing_job_reconciliation_service_role_insert
  on private.publishing_job_reconciliation_events
  for insert to service_role
  with check (true);

create or replace function public.reconcile_unknown_publishing_job(
  p_job_id text,
  p_operator_id uuid,
  p_resolution text,
  p_provider_post_id text,
  p_evidence_reference text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_job public.publishing_jobs%rowtype;
  v_checkpoint jsonb;
  v_phase text;
  v_operator_role text;
  v_post_id text;
  v_evidence text;
  v_notes text;
  v_event_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may reconcile publishing jobs'
      using errcode = '42501';
  end if;

  if p_job_id is null or pg_catalog.length(pg_catalog.btrim(p_job_id)) not between 1 and 256 then
    raise exception 'p_job_id is required'
      using errcode = '22023';
  end if;
  if p_operator_id is null then
    raise exception 'p_operator_id is required'
      using errcode = '22023';
  end if;
  if p_resolution is null or p_resolution not in ('confirmed_published', 'closed_without_retry') then
    raise exception 'Unsupported reconciliation resolution'
      using errcode = '22023';
  end if;

  v_evidence := pg_catalog.btrim(coalesce(p_evidence_reference, ''));
  v_notes := coalesce(p_notes, '');
  v_post_id := nullif(pg_catalog.btrim(coalesce(p_provider_post_id, '')), '');

  if pg_catalog.length(v_evidence) not between 3 and 500 then
    raise exception 'A concise evidence reference is required'
      using errcode = '22023';
  end if;
  if pg_catalog.length(v_notes) > 1000 then
    raise exception 'p_notes must be at most 1000 characters'
      using errcode = '22023';
  end if;

  select jobs.*
    into v_job
  from public.publishing_jobs as jobs
  where jobs.id = p_job_id
  for update;

  if not found then
    raise exception 'Publishing job not found'
      using errcode = 'P0002';
  end if;

  if v_job.status <> 'failed'
    or v_job.last_error_code is distinct from 'PUBLISH_OUTCOME_UNKNOWN'
  then
    raise exception 'Only failed jobs with PUBLISH_OUTCOME_UNKNOWN may be reconciled'
      using errcode = '55000';
  end if;

  v_checkpoint := v_job.payload -> '_instagramPublishing';
  if v_checkpoint is null or pg_catalog.jsonb_typeof(v_checkpoint) <> 'object' then
    raise exception 'Publishing checkpoint is missing or invalid'
      using errcode = '55000';
  end if;

  v_phase := v_checkpoint ->> 'phase';
  if v_phase is distinct from 'publish_started'
    and v_phase is distinct from 'published'
  then
    raise exception 'Publishing checkpoint is not eligible for reconciliation'
      using errcode = '55000';
  end if;

  select wm.role
    into v_operator_role
  from public.workspace_members as wm
  where wm.workspace_id = v_job.workspace_id
    and wm.user_id = p_operator_id;

  if v_operator_role is null or v_operator_role not in ('owner', 'admin') then
    raise exception 'Workspace owner or admin role is required'
      using errcode = '42501';
  end if;

  if p_resolution = 'confirmed_published' then
    if v_post_id is null or pg_catalog.length(v_post_id) > 512 then
      raise exception 'A provider post ID is required to confirm publication'
        using errcode = '22023';
    end if;
    if nullif(pg_catalog.btrim(coalesce(v_checkpoint ->> 'providerPostId', '')), '') is not null
      and v_checkpoint ->> 'providerPostId' is distinct from v_post_id
    then
      raise exception 'Provider post ID does not match the stored checkpoint'
        using errcode = '55000';
    end if;
  else
    if v_post_id is not null then
      raise exception 'provider_post_id must be empty when closing without retry'
        using errcode = '22023';
    end if;
    if v_phase <> 'publish_started' then
      raise exception 'A checkpoint with a confirmed post cannot be closed as unpublished'
        using errcode = '55000';
    end if;
    if nullif(pg_catalog.btrim(coalesce(v_checkpoint ->> 'providerPostId', '')), '') is not null then
      raise exception 'A checkpoint with a provider post ID cannot be closed as unpublished'
        using errcode = '55000';
    end if;
  end if;

  -- Update the job and insert the immutable audit event in the same transaction.
  -- Neither resolution re-queues the job or triggers another provider publish call.
  if p_resolution = 'confirmed_published' then
    update public.publishing_jobs
    set status = 'published',
        provider_post_id = v_post_id,
        finished_at = v_now,
        lease_expires_at = null,
        lease_token = null,
        last_error_code = null,
        last_error_message = null,
        payload = pg_catalog.jsonb_set(
          coalesce(payload, '{}'::jsonb),
          '{_instagramPublishing}',
          coalesce(v_checkpoint, '{}'::jsonb) || pg_catalog.jsonb_build_object(
            'idempotencyKey', v_job.idempotency_key,
            'phase', 'published',
            'containerId', coalesce(nullif(v_checkpoint ->> 'containerId', ''), 'operator-confirmed'),
            'providerPostId', v_post_id,
            'updatedAt', v_now::text
          ),
          true
        )
    where id = v_job.id;
  else
    update public.publishing_jobs
    set status = 'failed',
        finished_at = coalesce(finished_at, v_now),
        lease_expires_at = null,
        lease_token = null,
        last_error_code = 'PUBLISH_RECONCILED_NO_POST',
        last_error_message = 'An authorized operator reviewed the provider account and closed this job without retry.'
    where id = v_job.id;
  end if;

  insert into private.publishing_job_reconciliation_events (
    job_id,
    workspace_id,
    operator_id,
    resolution,
    provider_post_id,
    evidence_reference,
    notes,
    created_at
  )
  values (
    v_job.id,
    v_job.workspace_id,
    p_operator_id,
    p_resolution,
    case when p_resolution = 'confirmed_published' then v_post_id else null end,
    v_evidence,
    v_notes,
    v_now
  )
  returning event_id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'eventId', v_event_id,
    'jobId', v_job.id,
    'resolution', p_resolution,
    'status', case when p_resolution = 'confirmed_published' then 'published' else 'failed' end
  );
end;
$function$;

revoke all on function public.reconcile_unknown_publishing_job(text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_unknown_publishing_job(text, uuid, text, text, text, text)
  to service_role;
