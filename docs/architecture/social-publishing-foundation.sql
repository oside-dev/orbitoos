-- OrbitOS social publishing foundation
-- Applied to Supabase project lkcbtgqdvzmaihcnxxwk on 2026-10-08.
-- This document is the source-of-truth SQL for the live schema additions.

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

grant select, insert, update, delete on public.social_accounts to authenticated;
grant select, insert, update, delete on public.publishing_jobs to authenticated;

-- Credential references remain backend-only. RLS is defense in depth:
-- intentionally create no client policies for this table.
-- service_role has BYPASSRLS and is the only role granted table privileges here.
alter table private.social_account_secrets enable row level security;

revoke all on table private.social_account_secrets from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.social_account_secrets to service_role;
