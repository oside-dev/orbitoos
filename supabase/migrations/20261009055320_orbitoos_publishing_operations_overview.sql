-- OrbitOS read-only publishing operations overview (M24).
-- Exposes only bounded, sanitized operational rows to an owner/admin via a
-- service-role-only RPC; no client role can call this function directly.

create or replace function public.get_publishing_operations_overview(
  p_workspace_id text,
  p_operator_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_operator_role text;
  v_summary jsonb;
  v_jobs jsonb;
  v_events jsonb;
  v_now timestamptz := pg_catalog.now();
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may read publishing operations'
      using errcode = '42501';
  end if;

  if p_workspace_id is null
    or pg_catalog.length(pg_catalog.btrim(p_workspace_id)) not between 1 and 256
    or p_operator_id is null
  then
    raise exception 'A workspace and operator are required'
      using errcode = '22023';
  end if;

  select wm.role
    into v_operator_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_operator_id;

  if v_operator_role is null or v_operator_role not in ('owner', 'admin') then
    raise exception 'Workspace owner or admin role is required'
      using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'total', pg_catalog.count(*),
    'queued', pg_catalog.count(*) filter (where j.status = 'queued'),
    'processing', pg_catalog.count(*) filter (where j.status = 'processing'),
    'published', pg_catalog.count(*) filter (where j.status = 'published'),
    'failed', pg_catalog.count(*) filter (where j.status = 'failed'),
    'canceled', pg_catalog.count(*) filter (where j.status = 'canceled'),
    'unknownOutcome', pg_catalog.count(*) filter (
      where j.status = 'failed'
        and j.last_error_code = 'PUBLISH_OUTCOME_UNKNOWN'
    )
  )
  into v_summary
  from public.publishing_jobs as j
  where j.workspace_id = p_workspace_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', j.id,
        'status', j.status,
        'attempts', j.attempts,
        'max_attempts', j.max_attempts,
        'scheduled_at', j.scheduled_at,
        'started_at', j.started_at,
        'last_attempt_at', j.last_attempt_at,
        'next_attempt_at', j.next_attempt_at,
        'finished_at', j.finished_at,
        'created_at', j.created_at,
        'last_error_code', j.last_error_code,
        'last_error_message', pg_catalog.left(coalesce(j.last_error_message, ''), 240),
        'provider_post_id', j.provider_post_id,
        'content_item_id', j.content_item_id,
        'content_variant_id', j.content_variant_id,
        'social_account_id', j.social_account_id
      )
      order by j.created_at desc
    ),
    '[]'::jsonb
  )
  into v_jobs
  from (
    select pj.*
    from public.publishing_jobs as pj
    where pj.workspace_id = p_workspace_id
    order by pj.created_at desc
    limit 50
  ) as j;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'event_id', e.event_id,
        'job_id', e.job_id,
        'operator_id', e.operator_id,
        'resolution', e.resolution,
        'provider_post_id', e.provider_post_id,
        'evidence_reference', e.evidence_reference,
        'notes', pg_catalog.left(coalesce(e.notes, ''), 1000),
        'created_at', e.created_at
      )
      order by e.created_at desc
    ),
    '[]'::jsonb
  )
  into v_events
  from (
    select audit.*
    from private.publishing_job_reconciliation_events as audit
    where audit.workspace_id = p_workspace_id
    order by audit.created_at desc
    limit 50
  ) as e;

  return pg_catalog.jsonb_build_object(
    'generatedAt', v_now,
    'summary', v_summary,
    'jobs', v_jobs,
    'reconciliationEvents', v_events
  );
end;
$function$;

revoke all on function public.get_publishing_operations_overview(text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_publishing_operations_overview(text, uuid)
  to service_role;
