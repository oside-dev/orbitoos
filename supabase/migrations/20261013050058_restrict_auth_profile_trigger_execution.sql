-- This SECURITY DEFINER helper is invoked by the auth.users trigger only.
-- Client roles must not be able to invoke it as a callable database function.
revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;

do $migration$
begin
  if has_function_privilege('anon', 'private.handle_new_user()', 'execute')
    or has_function_privilege('authenticated', 'private.handle_new_user()', 'execute')
    or has_function_privilege('service_role', 'private.handle_new_user()', 'execute') then
    raise exception 'private.handle_new_user() must not be executable by client or service API roles';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_created'
      and not t.tgisinternal
      and t.tgfoid = 'private.handle_new_user()'::regprocedure
  ) then
    raise exception 'auth.users.on_auth_user_created trigger must remain attached to private.handle_new_user()';
  end if;
end;
$migration$;
