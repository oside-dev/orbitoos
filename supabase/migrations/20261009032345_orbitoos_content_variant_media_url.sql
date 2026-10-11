-- OrbitOS platform-native media asset URL for content variants.
-- Safe for existing workspaces: old variants remain valid drafts with an empty URL.
alter table public.content_variants
  add column if not exists media_url text not null default '';
