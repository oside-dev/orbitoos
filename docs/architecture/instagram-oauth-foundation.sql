-- OrbitOS Instagram Login / OAuth connection foundation.
-- State records contain only a SHA-256 state hash, not the raw browser state.
-- Instagram access tokens are stored in Supabase Vault; browser-visible rows
-- contain metadata and secret names only.

create table if not exists private.social_oauth_states (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  brand_id text references public.brands(id) on delete set null,
  provider text not null default 'instagram' check (provider = 'instagram'),
  redirect_uri text not null,
  app_return_url text not null,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index if not exists social_oauth_states_expiry_idx
  on private.social_oauth_states(expires_at);
create index if not exists social_oauth_states_user_created_idx
  on private.social_oauth_states(user_id, created_at desc);

alter table private.social_oauth_states enable row level security;
revoke all on table private.social_oauth_states from public, anon, authenticated;

-- Only backend code that authenticates with the Supabase secret/service role
-- may create or consume OAuth state. These SECURITY DEFINER RPCs are locked
-- down explicitly; the browser never receives direct access to the state table.
create or replace function public.create_social_oauth_state(
  p_state_hash text,
  p_user_id uuid,
  p_workspace_id text,
  p_brand_id text,
  p_redirect_uri text,
  p_app_return_url text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_recent_states integer;
begin
  if p_state_hash is null or p_state_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid OAuth state hash' using errcode = '22023';
  end if;

  if p_expires_at is null
    or p_expires_at <= pg_catalog.now()
    or p_expires_at > pg_catalog.now() + interval '15 minutes'
  then
    raise exception 'OAuth state expiry is outside the permitted window'
      using errcode = '22023';
  end if;

  if p_redirect_uri is null or p_redirect_uri !~ '^https://[^[:space:]]+$'
    or p_app_return_url is null or p_app_return_url !~ '^https://[^[:space:]]+$'
  then
    raise exception 'OAuth redirect URLs must use HTTPS'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workspace_members as wm
    where wm.user_id = p_user_id
      and wm.workspace_id = p_workspace_id
  ) then
    raise exception 'Workspace access is required'
      using errcode = '42501';
  end if;

  if p_brand_id is not null and not exists (
    select 1
    from public.brands as b
    where b.id = p_brand_id
      and b.workspace_id = p_workspace_id
  ) then
    raise exception 'Brand does not belong to the requested workspace'
      using errcode = '42501';
  end if;

  delete from private.social_oauth_states
  where expires_at < pg_catalog.now() - interval '7 days'
     or consumed_at < pg_catalog.now() - interval '7 days';

  select pg_catalog.count(*)::integer
    into v_recent_states
  from private.social_oauth_states as s
  where s.user_id = p_user_id
    and s.created_at > pg_catalog.now() - interval '1 hour';

  if v_recent_states >= 10 then
    raise exception 'Too many OAuth attempts'
      using errcode = '54000';
  end if;

  insert into private.social_oauth_states (
    state_hash, user_id, workspace_id, brand_id, provider,
    redirect_uri, app_return_url, expires_at
  ) values (
    p_state_hash, p_user_id, p_workspace_id, p_brand_id, 'instagram',
    p_redirect_uri, p_app_return_url, p_expires_at
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
  brand_id text,
  redirect_uri text,
  app_return_url text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_state_hash is null or p_state_hash !~ '^[a-f0-9]{64}$' then
    return;
  end if;

  return query
  update private.social_oauth_states as s
  set consumed_at = pg_catalog.now()
  where s.state_hash = p_state_hash
    and s.provider = 'instagram'
    and s.consumed_at is null
    and s.expires_at > pg_catalog.now()
  returning s.user_id, s.workspace_id, s.brand_id, s.redirect_uri, s.app_return_url;
end;
$function$;

-- The callback passes verified OAuth metadata and the long-lived token to this
-- backend-only RPC. The token is encrypted in Vault before any reference is
-- returned; it is never returned from this function.
create or replace function public.persist_instagram_connection(
  p_user_id uuid,
  p_workspace_id text,
  p_brand_id text,
  p_instagram_user_id text,
  p_username text,
  p_scopes text[],
  p_access_token text,
  p_token_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id text;
  v_access_secret_name text;
  v_secret_id uuid;
  v_required_scopes text[] := array[
    'instagram_business_basic',
    'instagram_business_content_publish'
  ];
begin
  if p_access_token is null
    or pg_catalog.length(p_access_token) < 20
    or pg_catalog.length(p_access_token) > 8192
  then
    raise exception 'Invalid access token payload'
      using errcode = '22023';
  end if;

  if p_instagram_user_id is null
    or p_instagram_user_id !~ '^[0-9]{1,64}$'
    or p_username is null
    or p_username !~ '^[A-Za-z0-9._]{1,30}$'
  then
    raise exception 'Invalid Instagram profile metadata'
      using errcode = '22023';
  end if;

  if p_scopes is null or not (p_scopes @> v_required_scopes) then
    raise exception 'Required Instagram permissions were not granted'
      using errcode = '42501';
  end if;

  if p_token_expires_at is null
    or p_token_expires_at <= pg_catalog.now()
    or p_token_expires_at > pg_catalog.now() + interval '90 days'
  then
    raise exception 'Invalid Instagram token expiry'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workspace_members as wm
    where wm.user_id = p_user_id
      and wm.workspace_id = p_workspace_id
  ) then
    raise exception 'Workspace access is required'
      using errcode = '42501';
  end if;

  if p_brand_id is not null and not exists (
    select 1
    from public.brands as b
    where b.id = p_brand_id
      and b.workspace_id = p_workspace_id
  ) then
    raise exception 'Brand does not belong to the requested workspace'
      using errcode = '42501';
  end if;

  insert into public.social_accounts (
    id, workspace_id, brand_id, platform, account_type,
    external_account_id, handle, display_name, profile_url,
    status, scopes, metadata, connected_at, updated_at
  ) values (
    'social-account-instagram-' || pg_catalog.md5(p_workspace_id || ':' || p_instagram_user_id),
    p_workspace_id,
    p_brand_id,
    'instagram',
    'profile',
    p_instagram_user_id,
    p_username,
    p_username,
    'https://www.instagram.com/' || p_username || '/',
    'connected',
    p_scopes,
    pg_catalog.jsonb_build_object(
      'authProvider', 'instagram-login',
      'tokenExpiresAt', p_token_expires_at
    ),
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (workspace_id, platform, external_account_id)
  do update set
    brand_id = excluded.brand_id,
    handle = excluded.handle,
    display_name = excluded.display_name,
    profile_url = excluded.profile_url,
    status = 'connected',
    scopes = excluded.scopes,
    metadata = public.social_accounts.metadata || excluded.metadata,
    connected_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  returning id into v_account_id;

  select s.access_secret_name
    into v_access_secret_name
  from private.social_account_secrets as s
  where s.social_account_id = v_account_id
  for update;

  if v_access_secret_name is not null then
    select vs.id
      into v_secret_id
    from vault.secrets as vs
    where vs.name = v_access_secret_name
    limit 1;
  end if;

  if v_secret_id is null then
    v_access_secret_name := 'orbitoos_instagram_access_' || pg_catalog.md5(v_account_id);

    select vs.id
      into v_secret_id
    from vault.secrets as vs
    where vs.name = v_access_secret_name
    limit 1;
  end if;

  if v_secret_id is null then
    perform vault.create_secret(
      p_access_token,
      v_access_secret_name,
      'OrbitOS Instagram access token for account ' || v_account_id
    );

    select vs.id
      into v_secret_id
    from vault.secrets as vs
    where vs.name = v_access_secret_name
    limit 1;

    if v_secret_id is null then
      raise exception 'Vault token storage failed';
    end if;
  else
    perform vault.update_secret(
      v_secret_id,
      p_access_token,
      v_access_secret_name,
      'OrbitOS Instagram access token for account ' || v_account_id
    );
  end if;

  insert into private.social_account_secrets (
    social_account_id, access_secret_name, refresh_secret_name,
    created_at, updated_at
  ) values (
    v_account_id, v_access_secret_name, null,
    pg_catalog.now(), pg_catalog.now()
  )
  on conflict (social_account_id)
  do update set
    access_secret_name = excluded.access_secret_name,
    refresh_secret_name = null,
    updated_at = pg_catalog.now();

  return pg_catalog.jsonb_build_object(
    'socialAccountId', v_account_id,
    'platform', 'instagram',
    'externalAccountId', p_instagram_user_id,
    'handle', p_username,
    'status', 'connected',
    'tokenExpiresAt', p_token_expires_at
  );
end;
$function$;

revoke all on function public.create_social_oauth_state(
  text, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.consume_social_oauth_state(text)
  from public, anon, authenticated;
revoke all on function public.persist_instagram_connection(
  uuid, text, text, text, text, text[], text, timestamptz
) from public, anon, authenticated;

grant execute on function public.create_social_oauth_state(
  text, uuid, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.consume_social_oauth_state(text)
  to service_role;
grant execute on function public.persist_instagram_connection(
  uuid, text, text, text, text, text[], text, timestamptz
) to service_role;
