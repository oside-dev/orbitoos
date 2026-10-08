-- Persist the Strategy Agent output as a first-class idea artifact.

alter table public.ideas
  add column if not exists strategy jsonb not null default '{}'::jsonb;
