-- M30: Prevent low-privilege users from deleting or re-scoping approved content.
-- Editors and above may update/delete approved content; analysts/viewers can still
-- work on drafts, but cannot bypass review by changing linked workspace/brand/content
-- attributes or deleting approved records.

create or replace function private.guard_content_approval_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_role text;
  v_requires_approval_role boolean := false;
  v_workspace_id text;
begin
  -- Service-role Edge Functions and trusted database operators are backend-owned.
  -- Their requests do not carry a user UID; browser requests are checked below.
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_workspace_id := old.workspace_id;
  else
    v_workspace_id := new.workspace_id;
  end if;

  select lower(btrim(wm.role))
    into v_role
    from public.workspace_members as wm
   where wm.workspace_id = v_workspace_id
     and wm.user_id = (select auth.uid())
   limit 1;

  if tg_table_name = 'content_items' then
    if tg_op = 'INSERT' then
      v_requires_approval_role :=
        lower(btrim(coalesce(new.status, ''))) = 'approved';
    elsif tg_op = 'DELETE' then
      v_requires_approval_role :=
        lower(btrim(coalesce(old.status, ''))) = 'approved';
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
          and (to_jsonb(old) - 'updated_at') is distinct from
              (to_jsonb(new) - 'updated_at')
        );
    end if;
  elsif tg_table_name = 'content_variants' then
    if tg_op = 'INSERT' then
      v_requires_approval_role :=
        coalesce(new.approved, false)
        or lower(btrim(coalesce(new.status, ''))) = 'approved';
    elsif tg_op = 'DELETE' then
      v_requires_approval_role :=
        coalesce(old.approved, false)
        or lower(btrim(coalesce(old.status, ''))) = 'approved';
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
          (
            coalesce(old.approved, false)
            or lower(btrim(coalesce(old.status, ''))) = 'approved'
          )
          and (to_jsonb(old) - 'updated_at') is distinct from
              (to_jsonb(new) - 'updated_at')
        );
    end if;
  end if;

  if v_requires_approval_role
     and coalesce(v_role, '') not in ('owner', 'admin', 'editor') then
    raise exception 'Workspace role is not allowed to change approved content.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_content_approval_role()
  from public, anon, authenticated;

drop trigger if exists content_items_approval_role_guard on public.content_items;
create trigger content_items_approval_role_guard
before insert or update or delete on public.content_items
for each row execute function private.guard_content_approval_role();

drop trigger if exists content_variants_approval_role_guard on public.content_variants;
create trigger content_variants_approval_role_guard
before insert or update or delete on public.content_variants
for each row execute function private.guard_content_approval_role();
