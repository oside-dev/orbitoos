-- Exercise the real PostgreSQL RLS policies against two workspaces and two roles.
-- The fixed fixtures are rolled back at the end and never touch production.
BEGIN;
SELECT plan(23);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-owner-a@example.test', now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-owner-b@example.test', now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rls-viewer-a@example.test', now());

INSERT INTO public.workspaces (id, name, slug)
VALUES
  ('ws-rls-owner-a', 'Workspace A', 'ws-rls-owner-a'),
  ('ws-rls-owner-b', 'Workspace B', 'ws-rls-owner-b');

INSERT INTO public.workspace_members (id, workspace_id, user_id, role)
VALUES
  ('membership-rls-owner-a', 'ws-rls-owner-a', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('membership-rls-owner-b', 'ws-rls-owner-b', '10000000-0000-4000-8000-000000000002', 'owner'),
  ('membership-rls-viewer-a', 'ws-rls-owner-a', '10000000-0000-4000-8000-000000000003', 'viewer');

INSERT INTO public.ideas (id, workspace_id, title)
VALUES
  ('idea-rls-owner-a', 'ws-rls-owner-a', 'Private idea A'),
  ('idea-rls-owner-b', 'ws-rls-owner-b', 'Private idea B');


-- Assert the production security hardening remains true after replaying migrations.
SELECT is(
  (SELECT count(*)::integer FROM pg_constraint
   WHERE connamespace IN ('public'::regnamespace, 'private'::regnamespace)),
  95,
  'the application schema contains the expected constraints'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace IN ('public'::regnamespace, 'private'::regnamespace)
      AND NOT convalidated
  ),
  'all application constraints are validated'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('public', 'private') AND c.relkind = 'r'),
  24,
  'the application table inventory remains stable'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('public', 'private')
     AND c.relkind = 'r' AND c.relrowsecurity),
  24,
  'row-level security is enabled on every application table'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_index i
   JOIN pg_class t ON t.oid = i.indrelid
   JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname IN ('public', 'private') AND t.relkind = 'r'),
  84,
  'the application index inventory remains stable'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname IN ('public', 'private') AND t.relkind = 'r'
      AND (NOT i.indisvalid OR NOT i.indisready)
  ),
  'all application indexes are valid and ready'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM (VALUES ('anon'::text), ('authenticated'::text)) AS browser(role_name)
    CROSS JOIN (
      VALUES
        ('public.activities'::regclass),
        ('public.api_logs'::regclass),
        ('public.notifications'::regclass),
        ('public.plans'::regclass),
        ('public.profiles'::regclass)
    ) AS app_table(relation_id)
    WHERE has_table_privilege(browser.role_name, app_table.relation_id, 'TRUNCATE')
       OR has_table_privilege(browser.role_name, app_table.relation_id, 'REFERENCES')
       OR has_table_privilege(browser.role_name, app_table.relation_id, 'TRIGGER')
  ),
  'browser roles have no TRUNCATE, REFERENCES, or TRIGGER grants on hardened legacy tables'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM (VALUES ('anon'::text), ('authenticated'::text)) AS browser(role_name)
    CROSS JOIN (
      VALUES
        ('private.social_account_secrets'::regclass),
        ('private.social_oauth_states'::regclass),
        ('private.publishing_scheduler_leases'::regclass),
        ('private.instagram_token_refresh_scheduler_leases'::regclass),
        ('private.publishing_job_reconciliation_events'::regclass)
    ) AS private_table(relation_id)
    WHERE has_table_privilege(browser.role_name, private_table.relation_id, 'SELECT')
       OR has_table_privilege(browser.role_name, private_table.relation_id, 'INSERT')
       OR has_table_privilege(browser.role_name, private_table.relation_id, 'UPDATE')
       OR has_table_privilege(browser.role_name, private_table.relation_id, 'DELETE')
  ),
  'browser roles cannot directly access private credential, OAuth, lease, or reconciliation tables'
);
SELECT ok(
  NOT has_function_privilege('anon', 'private.handle_new_user()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.handle_new_user()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'private.handle_new_user()', 'EXECUTE'),
  'the Auth profile trigger helper remains non-executable by browser and service roles'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclobjtype = 'f'
      AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace)
      AND acl.privilege_type = 'EXECUTE'
      AND (acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'))
  ),
  'future postgres-created functions do not default to PUBLIC or browser-role EXECUTE'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclobjtype IN ('r', 'S')
      AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace)
      AND (acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'))
  ),
  'future postgres-created public tables and sequences have no PUBLIC or browser-role default grants'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

SELECT is(
  (SELECT count(*)::integer FROM public.ideas WHERE id = 'idea-rls-owner-a'),
  1,
  'owner can read an idea in their own workspace'
);
SELECT is(
  (SELECT count(*)::integer FROM public.ideas WHERE id = 'idea-rls-owner-b'),
  0,
  'owner cannot read another workspace idea'
);
SELECT lives_ok(
  $$ INSERT INTO public.ideas (id, workspace_id, title)
     VALUES ('idea-rls-owner-a-new', 'ws-rls-owner-a', 'New idea A') $$,
  'owner can create an idea in their own workspace'
);
SELECT throws_ok(
  $$ INSERT INTO public.ideas (id, workspace_id, title)
     VALUES ('idea-rls-cross-workspace', 'ws-rls-owner-b', 'Cross-workspace write') $$,
  '42501',
  NULL,
  'owner cannot insert an idea into another workspace'
);
SELECT results_eq(
  $$ UPDATE public.ideas SET title = 'Unauthorized update'
     WHERE id = 'idea-rls-owner-b' RETURNING id $$,
  ARRAY[]::text[],
  'owner cannot update another workspace idea'
);
SELECT results_eq(
  $$ DELETE FROM public.ideas WHERE id = 'idea-rls-owner-b' RETURNING id $$,
  ARRAY[]::text[],
  'owner cannot delete another workspace idea'
);
SELECT is(
  (SELECT count(*)::integer FROM public.ideas WHERE workspace_id = 'ws-rls-owner-a'),
  2,
  'owner can read both ideas in their own workspace after insertion'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
SELECT results_eq(
  $$ UPDATE public.workspaces SET name = 'Unauthorized workspace change'
     WHERE id = 'ws-rls-owner-a' RETURNING id $$,
  ARRAY[]::text[],
  'viewer cannot update workspace settings'
);
SELECT is(
  (SELECT name FROM public.workspaces WHERE id = 'ws-rls-owner-a'),
  'Workspace A',
  'viewer sees unchanged workspace settings'
);

RESET ROLE;
SELECT is(
  (SELECT title FROM public.ideas WHERE id = 'idea-rls-owner-b'),
  'Private idea B',
  'blocked cross-workspace update leaves the other idea unchanged'
);
SELECT is(
  (SELECT count(*)::integer FROM public.ideas WHERE workspace_id = 'ws-rls-owner-b'),
  1,
  'blocked cross-workspace delete leaves the other workspace row intact'
);
SELECT is(
  (SELECT count(*)::integer FROM public.ideas WHERE id = 'idea-rls-cross-workspace'),
  0,
  'blocked cross-workspace insert did not create a row'
);

SELECT * FROM finish();
ROLLBACK;
