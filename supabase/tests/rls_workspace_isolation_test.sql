-- Exercise the real PostgreSQL RLS policies against two workspaces and two roles.
-- The fixed fixtures are rolled back at the end and never touch production.
BEGIN;
SELECT plan(12);

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

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

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
  'new row violates row-level security policy for table "ideas"',
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
