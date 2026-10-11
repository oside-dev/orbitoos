-- Workspace foreign-key indexes added by production migration 20261008053534.
-- Recovered from commit 39f69be5ae7146c78c3dd7c7673cd55fac71fada.

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
