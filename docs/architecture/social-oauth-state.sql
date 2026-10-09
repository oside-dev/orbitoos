-- OrbitOS single-use state for the Instagram Login OAuth flow (M18).
-- The raw state is returned only to the initiating browser; only its SHA-256
-- digest is stored. State is short-lived, single-use, and backend-only.

create table if not exists private.social_oauth_states (
  state_hash text primary key
    check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  brand_id text not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint social_oauth_states_expiry_check
    check (expires_at > created_at)
);

create index if not exists social_oauth_states_expiry_idx
  on private.social_oauth_states(expires_at);

alter table private.social_oauth_states enable row level security;
revoke all on table private.social_oauth_states from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.social_oauth_states to service_role;

create or replace function public.create_social_oauth_state(
  p_state_hash text,
  p_user_id uuid,
  p_workspace_id text,
  p_brand_id text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Only the backend service role may create OAuth state'
      using errcode = '42501';
  end if;

  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'OAuth state digest is invalid'
      using errcode = '22023';
  end if;

  if p_user_id is null
    or nullif(pg_catalog.btrim(coalesce(p_workspace_id, '')), '') is null
    or nullif(pg_catalog.btrim(coalesce(p_brand_id, '')), '') is null
  then
    raise exception 'OAuth state context is incomplete'
      using errcode = '22023';
  end if;

  if p_expires_at <= pg_catalog.now()
    or p_expires_at > pg_catalog.now() + interval '15 minutes'
    or p_expires_at < pg_catalog.now() + interval '1 minute'
  then
    raise exception 'OAuth state expiry must be between one and fifteen minutes'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workspace_members as wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id
      and wm.role in ('owner', 'admin')
  ) then
    raise exception 'Workspace administrator membership is required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.brands as b
    where b.id = p_brand_id
      and b.workspace_id = p_workspace_id
  ) then
    raise exception 'Brand does not belong to this workspace'
      using errcode = '22023';
  end if;

  -- Keep the private state table bounded without a scheduled cleanup job.
  delete from private.social_oauth_states
  where expires_at < pg_catalog.now() - interval '1 day'
     or consumed_at < pg_catalog.now() - interval '1 day';

  insert into private.social_oauth_states (
    state_hash, user_id, workspace_id, brand_id, expires_at
  ) values (
    p_state_hash, p_user_id, p_workspace_id, p_brand_id, p_expires_at
  );

  return true;
end;
$function$;

create or replace function public.consume_social_oauth_state(
  p_state_hash text
)
returns table (
  user_id uuid,
  workspace_id text,
  brand_id text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Only the backend service role may consume OAuth state'
      using errcode = '42501';
  end if;

  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  return query
  update private.social_oauth_states as s
  set consumed_at = pg_catalog.now()
  where s.state_hash = p_state_hash
    and s.consumed_at is null
    and s.expires_at > pg_catalog.now()
    and exists (
      select 1
      from public.workspace_members as wm
      where wm.workspace_id = s.workspace_id
        and wm.user_id = s.user_id
        and wm.role in ('owner', 'admin')
    )
    and exists (
      select 1
      from public.brands as b
      where b.id = s.brand_id
        and b.workspace_id = s.workspace_id
    )
  returning s.user_id, s.workspace_id, s.brand_id;
end;
$function$;

revoke all on function public.create_social_oauth_state(text, uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.consume_social_oauth_state(text)
  from public, anon, authenticated;

grant execute on function public.create_social_oauth_state(text, uuid, text, text, timestamptz)
  to service_role;
grant execute on function public.consume_social_oauth_state(text)
  to service_role;
