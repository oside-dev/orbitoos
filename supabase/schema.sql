-- OrbitOS target schema for Supabase Free
-- This file is a contract for M2. M0 remains local-first.

create table if not exists workspaces (
  id uuid primary key,
  name text not null,
  slug text unique not null,
  timezone text not null default 'UTC',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists brands (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
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
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  objective text not null default '',
  audience text not null default '',
  platforms text[] not null default '{}',
  pillar text not null default '',
  tone text not null default '',
  status text not null default 'idea',
  score integer not null default 50,
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_items (
  id uuid primary key,
  idea_id uuid references ideas(id) on delete set null,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  brief text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_variants (
  id uuid primary key,
  content_item_id uuid not null references content_items(id) on delete cascade,
  platform text not null,
  hook text not null default '',
  body text not null default '',
  cta text not null default '',
  hashtags text[] not null default '{}',
  creative_brief text not null default '',
  status text not null default 'draft',
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists schedules (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  platform text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists analytics_snapshots (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_item_id uuid references content_items(id) on delete set null,
  platform text not null,
  snapshot_date date not null,
  views integer not null default 0,
  reach integer not null default 0,
  engagements integer not null default 0,
  follower_delta integer not null default 0,
  is_demo boolean not null default true
);

create table if not exists agent_runs (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent text not null,
  task text not null,
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists learning_insights (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  detail text not null default '',
  category text not null default 'general',
  confidence numeric not null default 0.5,
  impact text not null default 'medium',
  status text not null default 'new',
  created_at timestamptz not null default now()
);