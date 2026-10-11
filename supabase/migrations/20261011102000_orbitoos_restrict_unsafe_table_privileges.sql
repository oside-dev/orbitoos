-- Restrict legacy baseline grants so row-level security is not undermined by
-- table-level privileges. PostgreSQL RLS does not govern TRUNCATE.
-- Preserve only the DML operations supported by the existing row-scoped policies.
--
-- This migration is source-only until reviewed and applied as a controlled release.
-- The service_role grants are explicit and are not revoked by this migration.
-- Future application tables/sequences created by the migration role must also
-- require explicit browser grants rather than inheriting broad defaults.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;

revoke all privileges on table
  public.activities,
  public.api_logs,
  public.notifications,
  public.plans,
  public.profiles
from public, anon, authenticated;

grant select, insert, update, delete on table public.activities to authenticated;

-- api_logs intentionally has no browser UPDATE policy.
grant select, insert, delete on table public.api_logs to authenticated;

grant select, insert, update, delete on table public.notifications to authenticated;

-- Active plan rows remain publicly readable; writes stay backend-owned.
grant select on table public.plans to anon, authenticated;

-- Preserve self-owned profile CRUD and workspace-scoped profile reads.
grant select, insert, update, delete on table public.profiles to authenticated;
