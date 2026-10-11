-- OrbitOS foundational expansion (reconstructed from the connected production catalog).
-- This migration is reconstructed rather than the byte-for-byte original manual SQL.
-- Core social-account/job tables and their boundaries are appended from the tracked
-- source contract docs/architecture/social-publishing-foundation.sql.
-- Verified production column types/constraints were read-only inspected on 2026-10-11.

create table if not exists public.activities (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  brand_id text references public.brands(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_logs (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  brand_id text references public.brands(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  action text not null,
  request jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  status text not null default 'ok',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text references public.workspaces(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id text primary key,
  name text not null unique,
  description text not null default '',
  price_monthly numeric not null default 0,
  currency text not null default 'USD',
  billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year')),
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  website text,
  locale text default 'en',
  timezone text default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (username is null or char_length(username) >= 3)
);

create table if not exists public.subscriptions (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused')),
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_actor_user_id_idx on public.activities(actor_user_id);
create index if not exists activities_brand_id_idx on public.activities(brand_id);
create index if not exists activities_workspace_id_idx on public.activities(workspace_id);

create index if not exists api_logs_brand_id_idx on public.api_logs(brand_id);
create index if not exists api_logs_workspace_id_idx on public.api_logs(workspace_id);
create index if not exists api_logs_created_at_idx on public.api_logs(created_at desc);

create index if not exists notifications_created_at_idx on public.notifications(created_at desc);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_workspace_id_idx on public.notifications(workspace_id);

create index if not exists profiles_username_idx on public.profiles(username);
create index if not exists subscriptions_plan_id_idx on public.subscriptions(plan_id);
create index if not exists subscriptions_workspace_id_idx on public.subscriptions(workspace_id);

alter table public.activities enable row level security;
alter table public.api_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;

revoke all on table public.activities, public.api_logs, public.notifications,
  public.profiles, public.subscriptions from public, anon, authenticated;
revoke all on table public.plans from public, anon, authenticated;

grant select, insert, update, delete on table public.activities,
  public.api_logs, public.notifications, public.profiles to authenticated;
grant select on table public.plans to anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.activities,
  public.api_logs, public.notifications, public.profiles, public.plans,
  public.subscriptions to service_role;

create policy activities_member_read on public.activities for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));
create policy activities_member_insert on public.activities for insert to authenticated
  with check (workspace_id in (select private.user_workspace_ids()));
create policy activities_member_update on public.activities for update to authenticated
  using (workspace_id in (select private.user_workspace_ids()))
  with check (workspace_id in (select private.user_workspace_ids()));
create policy activities_member_delete on public.activities for delete to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

create policy api_logs_member_read on public.api_logs for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));
create policy api_logs_member_insert on public.api_logs for insert to authenticated
  with check (workspace_id in (select private.user_workspace_ids()));
create policy api_logs_member_delete on public.api_logs for delete to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

create policy notifications_owner_read on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);
create policy notifications_owner_insert on public.notifications for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy notifications_owner_update on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy notifications_owner_delete on public.notifications for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy plans_public_read on public.plans for select to public
  using (is_active = true);

create policy profiles_self_insert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_self_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy profiles_self_delete on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);
create policy profiles_workspace_member_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members as wm
      where wm.user_id = profiles.id
        and wm.workspace_id in (select private.user_workspace_ids())
    )
  );

create policy subscriptions_member_read on public.subscriptions for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

-- M14 social-account metadata, durable jobs, idempotency and secret references.
-- OrbitOS social publishing foundation
-- Applied to Supabase project lkcbtgqdvzmaihcnxxwk on 2026-10-08.
-- This document is the source-of-truth SQL for the live schema additions.
-- M28 makes social-account metadata and publishing-job state backend-owned.

create table if not exists public.social_accounts (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  brand_id text references public.brands(id) on delete set null,
  platform text not null check (platform in ('facebook','instagram','tiktok','youtube','x','linkedin')),
  account_type text not null default 'profile'
    check (account_type in ('profile','page','channel','business')),
  external_account_id text not null,
  handle text,
  display_name text,
  profile_url text,
  avatar_url text,
  status text not null default 'connected'
    check (status in ('pending','connected','reauth_required','disconnected','error')),
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform, external_account_id)
);

create table if not exists public.publishing_jobs (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  brand_id text references public.brands(id) on delete set null,
  social_account_id text not null references public.social_accounts(id) on delete cascade,
  content_item_id text not null references public.content_items(id) on delete cascade,
  content_variant_id text references public.content_variants(id) on delete set null,
  idempotency_key text not null unique,
  scheduled_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued','processing','published','failed','canceled')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_post_id text,
  last_error_code text,
  last_error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create schema if not exists private;

create table if not exists private.social_account_secrets (
  social_account_id text primary key references public.social_accounts(id) on delete cascade,
  access_secret_name text not null,
  refresh_secret_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_accounts_workspace_idx
  on public.social_accounts(workspace_id);
create index if not exists social_accounts_brand_idx
  on public.social_accounts(brand_id);
create index if not exists social_accounts_platform_idx
  on public.social_accounts(platform);

create index if not exists publishing_jobs_workspace_idx
  on public.publishing_jobs(workspace_id);
create index if not exists publishing_jobs_account_idx
  on public.publishing_jobs(social_account_id);
create index if not exists publishing_jobs_status_schedule_idx
  on public.publishing_jobs(status, scheduled_at);
create index if not exists publishing_jobs_brand_idx
  on public.publishing_jobs(brand_id);
create index if not exists publishing_jobs_content_item_idx
  on public.publishing_jobs(content_item_id);
create index if not exists publishing_jobs_content_variant_idx
  on public.publishing_jobs(content_variant_id);

alter table public.social_accounts enable row level security;
alter table public.publishing_jobs enable row level security;

create policy social_accounts_member_read
on public.social_accounts
for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy social_accounts_member_insert
on public.social_accounts
for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy social_accounts_member_update
on public.social_accounts
for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy social_accounts_member_delete
on public.social_accounts
for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy publishing_jobs_member_read
on public.publishing_jobs
for select to authenticated
using (workspace_id in (select private.user_workspace_ids()));

create policy publishing_jobs_member_insert
on public.publishing_jobs
for insert to authenticated
with check (workspace_id in (select private.user_workspace_ids()));

create policy publishing_jobs_member_update
on public.publishing_jobs
for update to authenticated
using (workspace_id in (select private.user_workspace_ids()))
with check (workspace_id in (select private.user_workspace_ids()));

create policy publishing_jobs_member_delete
on public.publishing_jobs
for delete to authenticated
using (workspace_id in (select private.user_workspace_ids()));

-- Client access is read-only; OAuth and the publishing worker are the writers.
revoke all on table public.social_accounts from public, anon, authenticated;
revoke all on table public.publishing_jobs from public, anon, authenticated;
grant select on public.social_accounts to authenticated;
grant select on public.publishing_jobs to authenticated;
grant select, insert, update, delete on public.social_accounts to service_role;
grant select, insert, update, delete on public.publishing_jobs to service_role;

-- Credential references remain backend-only. RLS is defense in depth:
-- intentionally create no client policies for this table.
-- service_role has BYPASSRLS and is the only role granted table privileges here.
alter table private.social_account_secrets enable row level security;

revoke all on table private.social_account_secrets from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.social_account_secrets to service_role;
