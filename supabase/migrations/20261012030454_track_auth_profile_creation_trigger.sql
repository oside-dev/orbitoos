-- Track the auth.users profile bootstrap trigger observed in the connected
-- production project. This preserves legacy profile creation behavior when a
-- fresh local Supabase database is rebuilt from the migration chain.
--
-- A profile row is supplementary workspace metadata, not the workspace itself.
-- The owner workspace and membership are provisioned by bootstrap-workspace.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, full_name, avatar_url, username, website)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'website', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger as t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_created'
      and not t.tgisinternal
      and t.tgfoid = 'private.handle_new_user()'::regprocedure
  ) then
    if exists (
      select 1
      from pg_catalog.pg_trigger as t
      where t.tgrelid = 'auth.users'::regclass
        and t.tgname = 'on_auth_user_created'
        and not t.tgisinternal
    ) then
      raise exception 'auth.users already has on_auth_user_created with a different function';
    end if;

    execute 'create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user()';
  end if;
end;
$migration$;
