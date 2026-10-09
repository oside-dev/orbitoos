-- OrbitOS workspace role enforcement for approval and schedule mutations.
-- Workspace members can continue editing draft content, but only trusted content
-- roles (owner/admin/editor) can change approval state or mutate schedules.

create or replace function private.guard_content_approval_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_role text;
  v_requires_approval_role boolean := false;
begin
  -- Service-role Edge Functions and trusted database operators are backend-owned.
  -- Browser access is authenticated and is checked below against workspace_members.
  if (select auth.uid()) is null then
    return new;
  end if;

  select lower(btrim(wm.role))
    into v_role
    from public.workspace_members as wm
   where wm.workspace_id = new.workspace_id
     and wm.user_id = (select auth.uid())
   limit 1;

  if tg_table_name = 'content_items' then
    if tg_op = 'INSERT' then
      v_requires_approval_role :=
        lower(btrim(coalesce(new.status, ''))) = 'approved';
    else
      v_requires_approval_role :=
        (
          old.status is distinct from new.status
          and (
            lower(btrim(coalesce(old.status, ''))) = 'approved'
            or lower(btrim(coalesce(new.status, ''))) = 'approved'
          )
        )
        or (
          lower(btrim(coalesce(old.status, ''))) = 'approved'
          and (
            old.title is distinct from new.title
            or old.brief is distinct from new.brief
          )
        );
    end if;
  elsif tg_table_name = 'content_variants' then
    if tg_op = 'INSERT' then
      v_requires_approval_role :=
        coalesce(new.approved, false)
        or lower(btrim(coalesce(new.status, ''))) = 'approved';
    else
      v_requires_approval_role :=
        (
          old.approved is distinct from new.approved
          and (coalesce(old.approved, false) or coalesce(new.approved, false))
        )
        or (
          old.status is distinct from new.status
          and (
            lower(btrim(coalesce(old.status, ''))) = 'approved'
            or lower(btrim(coalesce(new.status, ''))) = 'approved'
          )
        )
        or (
          (coalesce(old.approved, false)
            or lower(btrim(coalesce(old.status, ''))) = 'approved')
          and (
            old.hook is distinct from new.hook
            or old.body is distinct from new.body
            or old.cta is distinct from new.cta
            or old.hashtags is distinct from new.hashtags
            or old.media_url is distinct from new.media_url
            or old.creative_brief is distinct from new.creative_brief
            or old.visual_direction is distinct from new.visual_direction
          )
        );
    end if;
  end if;

  if v_requires_approval_role
     and coalesce(v_role, '') not in ('owner', 'admin', 'editor') then
    raise exception 'Workspace role is not allowed to change content approval state.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_content_approval_role()
  from public, anon, authenticated;

drop trigger if exists content_items_approval_role_guard on public.content_items;
create trigger content_items_approval_role_guard
before insert or update on public.content_items
for each row execute function private.guard_content_approval_role();

drop trigger if exists content_variants_approval_role_guard on public.content_variants;
create trigger content_variants_approval_role_guard
before insert or update on public.content_variants
for each row execute function private.guard_content_approval_role();

-- Scheduling is an operational action: keep schedules readable by the whole
-- workspace, but limit create/update/delete to trusted content roles.
drop policy if exists schedules_member_insert on public.schedules;
drop policy if exists schedules_member_update on public.schedules;
drop policy if exists schedules_member_delete on public.schedules;

create policy schedules_member_insert
on public.schedules
for insert
to authenticated
with check (
  workspace_id in (select private.user_workspace_ids())
  and exists (
    select 1
      from public.workspace_members as wm
     where wm.workspace_id = schedules.workspace_id
       and wm.user_id = (select auth.uid())
       and wm.role in ('owner', 'admin', 'editor')
  )
);

create policy schedules_member_update
on public.schedules
for update
to authenticated
using (
  workspace_id in (select private.user_workspace_ids())
  and exists (
    select 1
      from public.workspace_members as wm
     where wm.workspace_id = schedules.workspace_id
       and wm.user_id = (select auth.uid())
       and wm.role in ('owner', 'admin', 'editor')
  )
)
with check (
  workspace_id in (select private.user_workspace_ids())
  and exists (
    select 1
      from public.workspace_members as wm
     where wm.workspace_id = schedules.workspace_id
       and wm.user_id = (select auth.uid())
       and wm.role in ('owner', 'admin', 'editor')
  )
);

create policy schedules_member_delete
on public.schedules
for delete
to authenticated
using (
  workspace_id in (select private.user_workspace_ids())
  and exists (
    select 1
      from public.workspace_members as wm
     where wm.workspace_id = schedules.workspace_id
       and wm.user_id = (select auth.uid())
       and wm.role in ('owner', 'admin', 'editor')
  )
);
