-- OrbitOS social-account credential lifecycle (M17).
-- OAuth tokens are encrypted by Supabase Vault and never returned to browser state.
-- Public RPCs intentionally grant execution only to the backend service role.

create or replace function public.store_social_account_secret(
  p_social_account_id text,
  p_secret_kind text,
  p_secret_value text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret_name text;
  v_secret_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the backend service role may store social account secrets'
      using errcode = '42501';
  end if;

  if p_secret_kind not in ('access', 'refresh') then
    raise exception 'Unsupported social account secret kind'
      using errcode = '22023';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_secret_value, '')), '') is null then
    raise exception 'Social account secret value is required'
      using errcode = '22023';
  end if;

  if pg_catalog.length(p_secret_value) > 32768 then
    raise exception 'Social account secret value is too large'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.social_accounts as sa
    where sa.id = p_social_account_id
  ) then
    raise exception 'Social account does not exist'
      using errcode = '22023';
  end if;

  -- Stable name lets token rotation update the existing Vault entry without
  -- storing token bytes or exposing Vault IDs in OrbitOS's public state.
  v_secret_name :=
    'orbitoos-social-account:' ||
    pg_catalog.md5(p_social_account_id) ||
    ':' ||
    p_secret_kind;

  select ds.id
  into v_secret_id
  from vault.decrypted_secrets as ds
  where ds.name = v_secret_name
  order by ds.created_at desc
  limit 1;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret_value,
      v_secret_name,
      'OrbitOS social account OAuth credential'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret_value,
      v_secret_name,
      'OrbitOS social account OAuth credential'
    );
  end if;

  if p_secret_kind = 'access' then
    insert into private.social_account_secrets (
      social_account_id,
      access_secret_name,
      created_at,
      updated_at
    )
    values (
      p_social_account_id,
      v_secret_name,
      pg_catalog.now(),
      pg_catalog.now()
    )
    on conflict (social_account_id) do update
      set access_secret_name = excluded.access_secret_name,
          updated_at = pg_catalog.now();
  else
    update private.social_account_secrets
    set refresh_secret_name = v_secret_name,
        updated_at = pg_catalog.now()
    where social_account_id = p_social_account_id;

    if not found then
      raise exception 'Store the access token before storing a refresh token'
        using errcode = '22023';
    end if;
  end if;

  return true;
end;
$function$;

create or replace function public.get_social_account_secret(
  p_social_account_id text,
  p_secret_kind text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret_name text;
  v_secret_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the backend service role may read social account secrets'
      using errcode = '42501';
  end if;

  if p_secret_kind not in ('access', 'refresh') then
    raise exception 'Unsupported social account secret kind'
      using errcode = '22023';
  end if;

  select case
    when p_secret_kind = 'access' then s.access_secret_name
    else s.refresh_secret_name
  end
  into v_secret_name
  from private.social_account_secrets as s
  where s.social_account_id = p_social_account_id;

  if v_secret_name is null then
    raise exception 'Social account secret is not available'
      using errcode = 'P0002';
  end if;

  select ds.decrypted_secret
  into v_secret_value
  from vault.decrypted_secrets as ds
  where ds.name = v_secret_name
  order by ds.created_at desc
  limit 1;

  if v_secret_value is null then
    raise exception 'Social account secret is not available'
      using errcode = 'P0002';
  end if;

  return v_secret_value;
end;
$function$;

create or replace function private.delete_social_account_vault_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret_name text;
  v_secret_id uuid;
begin
  foreach v_secret_name in array
    array[old.access_secret_name, old.refresh_secret_name]
  loop
    if v_secret_name is null then
      continue;
    end if;

    select ds.id
    into v_secret_id
    from vault.decrypted_secrets as ds
    where ds.name = v_secret_name
    order by ds.created_at desc
    limit 1;

    if v_secret_id is not null then
      delete from vault.secrets
      where id = v_secret_id;
      v_secret_id := null;
    end if;
  end loop;

  return old;
end;
$function$;

drop trigger if exists social_account_secrets_cleanup_vault
  on private.social_account_secrets;

create trigger social_account_secrets_cleanup_vault
before delete on private.social_account_secrets
for each row
execute function private.delete_social_account_vault_secrets();

create or replace function public.delete_social_account_secrets(
  p_social_account_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the backend service role may delete social account secrets'
      using errcode = '42501';
  end if;

  delete from private.social_account_secrets
  where social_account_id = p_social_account_id;

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$function$;

revoke all on function public.store_social_account_secret(text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_social_account_secret(text, text)
  from public, anon, authenticated;
revoke all on function public.delete_social_account_secrets(text)
  from public, anon, authenticated;
revoke all on function private.delete_social_account_vault_secrets()
  from public, anon, authenticated;

grant execute on function public.store_social_account_secret(text, text, text)
  to service_role;
grant execute on function public.get_social_account_secret(text, text)
  to service_role;
grant execute on function public.delete_social_account_secrets(text)
  to service_role;
grant execute on function private.delete_social_account_vault_secrets()
  to service_role;
