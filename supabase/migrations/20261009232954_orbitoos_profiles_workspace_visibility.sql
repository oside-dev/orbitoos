do $migration$
begin
  -- This optional legacy table exists in the current production project but is not
  -- part of the canonical OrbitOS schema. Keep fresh deployments a no-op if absent.
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists profiles_public_read on public.profiles';
    execute 'drop policy if exists profiles_workspace_member_read on public.profiles';

    execute $command$
      create policy profiles_workspace_member_read
      on public.profiles
      for select
      to authenticated
      using (
        id = (select auth.uid())
        or exists (
          select 1
          from public.workspace_members as wm
          where wm.user_id = profiles.id
            and wm.workspace_id in (
              select private.user_workspace_ids()
            )
        )
      )
    $command$;

    execute 'revoke all on table public.profiles from anon';
  end if;
end
$migration$;
