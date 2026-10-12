-- OrbitOS target schema for Supabase Free
-- This file is a contract for the persistent backend adapter.
-- The local-first runtime remains the default until a real backend is connected.

create table if not exists workspaces (
  id text primary key,
  name text not null,
  slug text unique not null,
  timezone text not null default 'UTC',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'editor', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_workspace_idx
  on workspace_members(user_id, workspace_id);

create index if not exists workspace_members_workspace_idx
  on workspace_members(workspace_id);

create index if not exists brands_workspace_id_idx
  on brands(workspace_id);

create index if not exists ideas_workspace_id_idx
  on ideas(workspace_id);
create index if not exists ideas_brand_id_idx
  on ideas(brand_id);

create index if not exists research_items_workspace_id_idx
  on research_items(workspace_id);
create index if not exists research_items_brand_id_idx
  on research_items(brand_id);
create index if not exists research_items_idea_id_idx
  on research_items(idea_id);

create index if not exists content_items_workspace_id_idx
  on content_items(workspace_id);
create index if not exists content_items_brand_id_idx
  on content_items(brand_id);
create index if not exists content_items_idea_id_idx
  on content_items(idea_id);

create index if not exists content_variants_workspace_id_idx
  on content_variants(workspace_id);
create index if not exists content_variants_brand_id_idx
  on content_variants(brand_id);
create index if not exists content_variants_content_item_id_idx
  on content_variants(content_item_id);

create index if not exists schedules_workspace_id_idx
  on schedules(workspace_id);
create index if not exists schedules_brand_id_idx
  on schedules(brand_id);
create index if not exists schedules_content_item_id_idx
  on schedules(content_item_id);

create index if not exists analytics_snapshots_workspace_id_idx
  on analytics_snapshots(workspace_id);
create index if not exists analytics_snapshots_brand_id_idx
  on analytics_snapshots(brand_id);
create index if not exists analytics_snapshots_content_item_id_idx
  on analytics_snapshots(content_item_id);

create index if not exists agent_runs_workspace_id_idx
  on agent_runs(workspace_id);
create index if not exists agent_runs_brand_id_idx
  on agent_runs(brand_id);

create index if not exists learning_insights_workspace_id_idx
  on learning_insights(workspace_id);
create index if not exists learning_insights_brand_id_idx
  on learning_insights(brand_id);

create table if not exists brands (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  voice text not null default '',
  audience text not null default '',
  pillars text[] not null default '{}',
  prohibited text[] not null default '{}',
  visual_direction text not null default '',
  posting_goals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists ideas (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  brand_id text references brands(id) on delete set null,
  title text not null,
  objective text not null default '',
  audience text not null default '',
  platforms text[] not null default '{}',
  pillar text not null default '',
  tone text not null default '',
  status text not null default 'idea',
  score integer not null default 50,
  strategy jsonb not null default '{}'::jsonb,
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);



create table if not exists research_items (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  brand_id text references brands(id) on delete set null,
  idea_id text references ideas(id) on delete set null,
  topic text not null default '',
  summary text not null default '',
  signals jsonb not null default '[]'::jsonb,
  opportunity_score integer not null default 0,
  sources jsonb not null default '[]'::jsonb,
  generated_by text not null default 'backend',
  created_at timestamptz not null default now()
);

create table if not exists content_items (
  id text primary key,
  idea_id text references ideas(id) on delete set null,
  brand_id text references brands(id) on delete set null,
  workspace_id text not null references workspaces(id) on delete cascade,
  title text not null,
  brief text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_variants (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  brand_id text references brands(id) on delete set null,
  content_item_id text not null references content_items(id) on delete cascade,
  platform text not null,
  hook text not null default '',
  body text not null default '',
  cta text not null default '',
  hashtags text[] not null default '{}',
  creative_brief text not null default '',
  visual_direction text not null default '',
  media_url text not null default '',
  status text not null default 'draft',
  approved boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists schedules (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  brand_id text references brands(id) on delete set null,
  content_item_id text not null references content_items(id) on delete cascade,
  platform text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists analytics_snapshots (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  brand_id text references brands(id) on delete set null,
  content_item_id text references content_items(id) on delete set null,
  platform text not null,
  snapshot_date date not null,
  views integer not null default 0,
  reach integer not null default 0,
  engagements integer not null default 0,
  follower_delta integer not null default 0,
  is_demo boolean not null default true,
  source text not null default 'unknown',
  provider text not null default 'unknown'
);

create table if not exists agent_runs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  brand_id text references brands(id) on delete set null,
  agent text not null,
  task text not null,
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists learning_insights (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  brand_id text references brands(id) on delete set null,
  title text not null,
  detail text not null default '',
  category text not null default 'general',
  confidence numeric not null default 0.5,
  impact text not null default 'medium',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  generated_at timestamptz not null default now()
);


-- Security contract: browser/API access is restricted to authenticated
-- users who belong to the workspace. Workspace provisioning/membership changes
-- remain backend-controlled until an explicit invitation/bootstrap flow exists.
-- Never expose a Supabase service_role/secret key to the browser.

create schema if not exists private;

create or replace function private.user_workspace_ids()
returns setof text
language sql
security definer
set search_path = ''
stable
as $$
  select wm.workspace_id
  from public.workspace_members wm
  where wm.user_id = (select auth.uid());
$$;

revoke execute on function private.user_workspace_ids() from public;
revoke execute on function private.user_workspace_ids() from anon;
grant usage on schema private to authenticated;
grant execute on function private.user_workspace_ids() to authenticated;

alter table if exists workspaces enable row level security;
alter table if exists workspace_members enable row level security;
alter table if exists brands enable row level security;
alter table if exists ideas enable row level security;
alter table if exists research_items enable row level security;
alter table if exists content_items enable row level security;
alter table if exists content_variants enable row level security;
alter table if exists schedules enable row level security;
alter table if exists analytics_snapshots enable row level security;
alter table if exists agent_runs enable row level security;
alter table if exists learning_insights enable row level security;

revoke all on table workspaces from anon, authenticated;
revoke all on table workspace_members from anon, authenticated;
revoke all on table brands from anon, authenticated;
revoke all on table ideas from anon, authenticated;
revoke all on table research_items from anon, authenticated;
revoke all on table content_items from anon, authenticated;
revoke all on table content_variants from anon, authenticated;
revoke all on table schedules from anon, authenticated;
revoke all on table analytics_snapshots from anon, authenticated;
revoke all on table agent_runs from anon, authenticated;
revoke all on table learning_insights from anon, authenticated;

grant select, update on table workspaces to authenticated;
grant select on table workspace_members to authenticated;
grant select, insert, update, delete on table brands to authenticated;
grant select, insert, update, delete on table ideas to authenticated;
grant select, insert, update, delete on table research_items to authenticated;
grant select, insert, update, delete on table content_items to authenticated;
grant select, insert, update, delete on table content_variants to authenticated;
grant select, insert, update, delete on table schedules to authenticated;
grant select, insert, update, delete on table analytics_snapshots to authenticated;
grant select, insert, update, delete on table agent_runs to authenticated;
grant select, insert, update, delete on table learning_insights to authenticated;

drop policy if exists "workspace_members_read" on workspace_members;
drop policy if exists "workspaces_member_read" on workspaces;
drop policy if exists "workspaces_member_update" on workspaces;
drop policy if exists "brands_member_access" on brands;
drop policy if exists "ideas_member_access" on ideas;
drop policy if exists "research_member_access" on research_items;
drop policy if exists "content_items_member_access" on content_items;
drop policy if exists "content_variants_member_access" on content_variants;
drop policy if exists "schedules_member_access" on schedules;
drop policy if exists "analytics_member_access" on analytics_snapshots;
drop policy if exists "agent_runs_member_access" on agent_runs;
drop policy if exists "learning_member_access" on learning_insights;

create policy "workspace_members_member_read"
on workspace_members
for select
to authenticated
using (
  workspace_id in (select private.user_workspace_ids())
);

create policy "workspaces_member_read"
on workspaces
for select
to authenticated
using (
  id in (select private.user_workspace_ids())
);

create policy "workspaces_member_update"
on workspaces
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

create policy "brands_member_read"
on brands for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "brands_member_insert"
on brands for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy "brands_member_update"
on brands for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy "brands_member_delete"
on brands for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "ideas_member_read"
on ideas for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "ideas_member_insert"
on ideas for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy "ideas_member_update"
on ideas for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy "ideas_member_delete"
on ideas for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "research_member_read"
on research_items for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "research_member_insert"
on research_items for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy "research_member_update"
on research_items for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy "research_member_delete"
on research_items for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "content_items_member_read"
on content_items for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "content_items_member_insert"
on content_items for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy "content_items_member_update"
on content_items for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy "content_items_member_delete"
on content_items for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "content_variants_member_read"
on content_variants for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "content_variants_member_insert"
on content_variants for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy "content_variants_member_update"
on content_variants for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy "content_variants_member_delete"
on content_variants for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "schedules_member_read"
on schedules for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "schedules_member_insert"
on schedules
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

create policy "schedules_member_update"
on schedules
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

create policy "schedules_member_delete"
on schedules
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

create policy "analytics_member_read"
on analytics_snapshots for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "analytics_member_insert"
on analytics_snapshots for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy "analytics_member_update"
on analytics_snapshots for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy "analytics_member_delete"
on analytics_snapshots for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "agent_runs_member_read"
on agent_runs for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "agent_runs_member_insert"
on agent_runs for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy "agent_runs_member_update"
on agent_runs for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy "agent_runs_member_delete"
on agent_runs for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "learning_member_read"
on learning_insights for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy "learning_member_insert"
on learning_insights for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy "learning_member_update"
on learning_insights for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy "learning_member_delete"
on learning_insights for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));


-- Role-based approval protection for human-reviewed content.
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
