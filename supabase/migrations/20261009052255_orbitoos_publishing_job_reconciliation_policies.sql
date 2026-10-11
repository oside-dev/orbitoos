-- Explicitly restrict reconciliation audit-table policies to service_role.
-- Explicit service-role policies make the intended private access model visible
-- to security advisors. These do not grant table privileges to client roles.
drop policy if exists publishing_job_reconciliation_service_role_read
  on private.publishing_job_reconciliation_events;
create policy publishing_job_reconciliation_service_role_read
  on private.publishing_job_reconciliation_events
  for select to service_role
  using (true);

drop policy if exists publishing_job_reconciliation_service_role_insert
  on private.publishing_job_reconciliation_events;
create policy publishing_job_reconciliation_service_role_insert
  on private.publishing_job_reconciliation_events
  for insert to service_role
  with check (true);
