-- OrbitOS Instagram account upsert and private-table RLS policies (M19).
-- The upsert preserves the account primary key atomically, even if two OAuth
-- callbacks for the same account arrive at nearly the same time.

create or replace function public.upsert_instagram_social_account(
  p_workspace_id text,
  p_brand_id text,
  p_external_account_id text,
  p_handle text,
  p_display_name text,
  p_profile_url text,
  p_scopes text[],
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id text;
  v_was_created boolean := false;
  v_previous_status text;
  v_previous_metadata jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Only the backend service role may upsert social accounts'
      using errcode = '42501';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_workspace_id, '')), '') is null
    or nullif(pg_catalog.btrim(coalesce(p_brand_id, '')), '') is null
    or nullif(pg_catalog.btrim(coalesce(p_external_account_id, '')), '') is null
    or pg_catalog.length(p_external_account_id) > 256
  then
    raise exception 'Instagram account identity is invalid'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.brands as b
    where b.id = p_brand_id
      and b.workspace_id = p_workspace_id
  ) then
    raise exception 'Brand does not belong to the selected workspace'
      using errcode = '22023';
  end if;

  select sa.id, sa.status, sa.metadata
  into v_account_id, v_previous_status, v_previous_metadata
  from public.social_accounts as sa
  where sa.workspace_id = p_workspace_id
    and sa.platform = 'instagram'
    and sa.external_account_id = p_external_account_id
  for update;

  if v_account_id is not null then
    update public.social_accounts
    set brand_id = p_brand_id,
        account_type = 'profile',
        handle = p_handle,
        display_name = p_display_name,
        profile_url = p_profile_url,
        status = 'pending',
        scopes = coalesce(p_scopes, array[]::text[]),
        metadata = coalesce(p_metadata, '{}'::jsonb),
        updated_at = pg_catalog.now()
    where id = v_account_id;
  else
    insert into public.social_accounts (
      id,
      workspace_id,
      brand_id,
      platform,
      account_type,
      external_account_id,
      handle,
      display_name,
      profile_url,
      status,
      scopes,
      metadata,
      connected_at,
      updated_at
    )
    values (
      'social-instagram-' || pg_catalog.gen_random_uuid()::text,
      p_workspace_id,
      p_brand_id,
      'instagram',
      'profile',
      p_external_account_id,
      p_handle,
      p_display_name,
      p_profile_url,
      'pending',
      coalesce(p_scopes, array[]::text[]),
      coalesce(p_metadata, '{}'::jsonb),
      pg_catalog.now(),
      pg_catalog.now()
    )
    on conflict (workspace_id, platform, external_account_id) do nothing
    returning id into v_account_id;

    if v_account_id is not null then
      v_was_created := true;
      v_previous_status := null;
      v_previous_metadata := null;
    else
      -- Another callback inserted this account after our initial read. Lock
      -- the winner and update its non-key fields without changing its id.
      select sa.id, sa.status, sa.metadata
      into v_account_id, v_previous_status, v_previous_metadata
      from public.social_accounts as sa
      where sa.workspace_id = p_workspace_id
        and sa.platform = 'instagram'
        and sa.external_account_id = p_external_account_id
      for update;

      if v_account_id is null then
        raise exception 'Instagram account could not be claimed'
          using errcode = '40001';
      end if;

      update public.social_accounts
      set brand_id = p_brand_id,
          account_type = 'profile',
          handle = p_handle,
          display_name = p_display_name,
          profile_url = p_profile_url,
          status = 'pending',
          scopes = coalesce(p_scopes, array[]::text[]),
          metadata = coalesce(p_metadata, '{}'::jsonb),
          updated_at = pg_catalog.now()
      where id = v_account_id;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'accountId', v_account_id,
    'created', v_was_created,
    'previousStatus', v_previous_status,
    'previousMetadata', v_previous_metadata
  );
end;
$function$;

revoke all on function public.upsert_instagram_social_account(
  text, text, text, text, text, text, text[], jsonb
) from public, anon, authenticated;
grant execute on function public.upsert_instagram_social_account(
  text, text, text, text, text, text, text[], jsonb
) to service_role;

-- These private tables intentionally expose no client operations. Explicit
-- service_role policies remove advisor warnings while preserving that boundary.
drop policy if exists social_account_secrets_service_role_all
  on private.social_account_secrets;
create policy social_account_secrets_service_role_all
  on private.social_account_secrets
  for all to service_role
  using (true)
  with check (true);

drop policy if exists social_oauth_states_service_role_all
  on private.social_oauth_states;
create policy social_oauth_states_service_role_all
  on private.social_oauth_states
  for all to service_role
  using (true)
  with check (true);
