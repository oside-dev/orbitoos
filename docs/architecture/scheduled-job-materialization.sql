-- OrbitOS scheduled publishing-job materialization (M25).
-- Converts only eligible, human-approved schedules to durable, idempotent jobs.
-- It does not call a provider or enable the worker.

create index if not exists schedules_materialization_idx
  on public.schedules(status, scheduled_at, created_at)
  where status = 'scheduled';

create or replace function public.materialize_scheduled_publishing_jobs(
  p_limit integer,
  p_platforms text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_scanned integer := 0;
  v_created integer := 0;
  v_now timestamptz := pg_catalog.now();
begin
  if current_user <> 'service_role' then
    raise exception 'Only service_role may materialize publishing jobs'
      using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100'
      using errcode = '22023';
  end if;

  if p_platforms is null
    or pg_catalog.cardinality(p_platforms) < 1
    or pg_catalog.cardinality(p_platforms) > 6
  then
    raise exception 'p_platforms must contain 1 to 6 supported platforms'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_platforms) as requested(platform)
    where requested.platform not in (
      'facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin'
    )
  ) then
    raise exception 'p_platforms contains an unsupported platform'
      using errcode = '22023';
  end if;

  with eligible_schedules as (
    select
      s.id as schedule_id,
      s.workspace_id,
      s.brand_id,
      s.content_item_id,
      s.scheduled_at,
      variant.id as content_variant_id,
      account.social_account_id,
      'schedule:' || s.id as idempotency_key
    from public.schedules as s
    cross join lateral (
      select case pg_catalog.lower(pg_catalog.btrim(s.platform))
        when 'facebook' then 'facebook'
        when 'instagram' then 'instagram'
        when 'instagram reels' then 'instagram'
        when 'tiktok' then 'tiktok'
        when 'youtube' then 'youtube'
        when 'youtube shorts' then 'youtube'
        when 'x' then 'x'
        when 'linkedin' then 'linkedin'
        else null
      end as normalized_platform
    ) as schedule_platform
    join public.content_items as ci
      on ci.id = s.content_item_id
      and ci.workspace_id = s.workspace_id
      and ci.brand_id is not distinct from s.brand_id
      and ci.status = 'approved'
    join lateral (
      select cv.id, cv.status, cv.approved
      from public.content_variants as cv
      cross join lateral (
        select case pg_catalog.lower(pg_catalog.btrim(cv.platform))
          when 'facebook' then 'facebook'
          when 'instagram' then 'instagram'
          when 'instagram reels' then 'instagram'
          when 'tiktok' then 'tiktok'
          when 'youtube' then 'youtube'
          when 'youtube shorts' then 'youtube'
          when 'x' then 'x'
          when 'linkedin' then 'linkedin'
          else null
        end as normalized_platform
      ) as variant_platform
      where cv.workspace_id = s.workspace_id
        and cv.content_item_id = s.content_item_id
        and cv.brand_id is not distinct from s.brand_id
        and variant_platform.normalized_platform = schedule_platform.normalized_platform
      order by cv.version desc, cv.updated_at desc, cv.id desc
      limit 1
    ) as variant on variant.status = 'approved' and variant.approved is true
    join lateral (
      select
        pg_catalog.count(*) as account_count,
        pg_catalog.min(sa.id) as social_account_id
      from public.social_accounts as sa
      where sa.workspace_id = s.workspace_id
        and sa.brand_id is not distinct from s.brand_id
        and sa.platform = schedule_platform.normalized_platform
        and sa.status = 'connected'
    ) as account on account.account_count = 1
    where s.status = 'scheduled'
      and schedule_platform.normalized_platform = any(p_platforms)
      and not exists (
        select 1
        from public.publishing_jobs as existing
        where existing.idempotency_key = 'schedule:' || s.id
      )
    order by s.scheduled_at, s.created_at, s.id
    limit p_limit
  ),
  inserted_jobs as (
    insert into public.publishing_jobs (
      id,
      workspace_id,
      brand_id,
      social_account_id,
      content_item_id,
      content_variant_id,
      idempotency_key,
      scheduled_at,
      status,
      attempts,
      next_attempt_at,
      payload,
      created_at
    )
    select
      'schedule-job:' || eligible.schedule_id,
      eligible.workspace_id,
      eligible.brand_id,
      eligible.social_account_id,
      eligible.content_item_id,
      eligible.content_variant_id,
      eligible.idempotency_key,
      eligible.scheduled_at,
      'queued',
      0,
      v_now,
      pg_catalog.jsonb_build_object(
        'source', 'schedule',
        'scheduleId', eligible.schedule_id,
        'materializedAt', v_now
      ),
      v_now
    from eligible_schedules as eligible
    on conflict do nothing
    returning id
  )
  select
    (select pg_catalog.count(*)::integer from eligible_schedules),
    (select pg_catalog.count(*)::integer from inserted_jobs)
  into v_scanned, v_created;

  return pg_catalog.jsonb_build_object(
    'candidateCount', v_scanned,
    'created', v_created,
    'insertConflicts', pg_catalog.greatest(0, v_scanned - v_created),
    'generatedAt', v_now
  );
end;
$function$;

revoke all on function public.materialize_scheduled_publishing_jobs(integer, text[])
  from public, anon, authenticated;
grant execute on function public.materialize_scheduled_publishing_jobs(integer, text[])
  to service_role;
