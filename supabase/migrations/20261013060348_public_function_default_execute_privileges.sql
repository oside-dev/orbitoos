-- Restrict default function execution for future functions created by the migration role.
-- Existing function ACLs are unchanged; callers must receive explicit grants per function.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
