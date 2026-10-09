-- Only workspace owners and admins may change workspace-level configuration.
-- Membership alone is insufficient: settings include shared AI configuration,
-- workspace identity, and active brand selection.

drop policy if exists workspaces_member_update on public.workspaces;

create policy workspaces_member_update
on public.workspaces
for update
to authenticated
using (
  id in (select private.user_workspace_ids())
  and exists (
    select 1
      from public.workspace_members as wm
     where wm.workspace_id = workspaces.id
       and wm.user_id = (select auth.uid())
       and wm.role in ('owner', 'admin')
  )
)
with check (
  id in (select private.user_workspace_ids())
  and exists (
    select 1
      from public.workspace_members as wm
     where wm.workspace_id = workspaces.id
       and wm.user_id = (select auth.uid())
       and wm.role in ('owner', 'admin')
  )
);
