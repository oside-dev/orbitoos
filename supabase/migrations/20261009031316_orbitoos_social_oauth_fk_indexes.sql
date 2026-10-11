-- Index foreign keys used by cleanup and workspace/brand lookups for OAuth state.
create index if not exists social_oauth_states_user_idx
  on private.social_oauth_states(user_id);
create index if not exists social_oauth_states_workspace_idx
  on private.social_oauth_states(workspace_id);
create index if not exists social_oauth_states_brand_idx
  on private.social_oauth_states(brand_id);
