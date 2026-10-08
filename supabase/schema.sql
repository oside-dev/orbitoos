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


-- Security baseline: exposed public tables stay protected until explicit
-- workspace ownership policies are defined. The persistence adapter is a
-- server-side boundary; never ship a secret/service key to the browser.

alter table if exists workspaces enable row level security;
alter table if exists brands enable row level security;
alter table if exists ideas enable row level security;
alter table if exists research_items enable row level security;
alter table if exists content_items enable row level security;
alter table if exists content_variants enable row level security;
alter table if exists schedules enable row level security;
alter table if exists analytics_snapshots enable row level security;
alter table if exists agent_runs enable row level security;
alter table if exists learning_insights enable row level security;
