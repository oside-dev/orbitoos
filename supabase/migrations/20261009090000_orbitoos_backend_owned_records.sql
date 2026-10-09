-- OrbitOS backend-owned social/publishing records (M28).
-- Browser clients may read workspace-scoped status, but cannot forge accounts,
-- mutate publishing state/leases, or change billing/subscription state.

alter table public.social_accounts enable row level security;
alter table public.publishing_jobs enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists social_accounts_member_insert on public.social_accounts;
drop policy if exists social_accounts_member_update on public.social_accounts;
drop policy if exists social_accounts_member_delete on public.social_accounts;

drop policy if exists publishing_jobs_member_insert on public.publishing_jobs;
drop policy if exists publishing_jobs_member_update on public.publishing_jobs;
drop policy if exists publishing_jobs_member_delete on public.publishing_jobs;

drop policy if exists subscriptions_member_insert on public.subscriptions;
drop policy if exists subscriptions_member_update on public.subscriptions;
drop policy if exists subscriptions_member_delete on public.subscriptions;

-- Remove browser write grants, including inherited PUBLIC grants, then restore
-- only workspace-scoped reads for signed-in members. service_role retains the
-- backend DML needed by OAuth, materialization, worker transitions and billing.
revoke all on table public.social_accounts from public, anon, authenticated;
revoke all on table public.publishing_jobs from public, anon, authenticated;
revoke all on table public.subscriptions from public, anon, authenticated;

grant select on table public.social_accounts to authenticated;
grant select on table public.publishing_jobs to authenticated;
grant select on table public.subscriptions to authenticated;

grant select, insert, update, delete on table public.social_accounts to service_role;
grant select, insert, update, delete on table public.publishing_jobs to service_role;
grant select, insert, update, delete on table public.subscriptions to service_role;
