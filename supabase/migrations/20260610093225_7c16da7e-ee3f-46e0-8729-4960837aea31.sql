-- 1) Restrict duels SELECT to authenticated users (was USING true to anon too)
DROP POLICY IF EXISTS "duels public read" ON public.duels;
CREATE POLICY "duels authenticated read" ON public.duels
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.duels FROM anon;

-- 2) Column-level grants on profiles: hide email from cross-user SELECTs.
-- RLS USING(true) still applies, but PostgREST will reject queries that
-- include columns the role has no SELECT grant on (i.e. email).
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, username, avatar_url, created_at) ON public.profiles TO authenticated;
GRANT SELECT (id, username, avatar_url, created_at) ON public.profiles TO anon;

-- 3) Admin helper to retrieve emails (joined from auth.users) without
-- exposing the column to regular authenticated users.
CREATE OR REPLACE FUNCTION public.admin_list_user_emails()
RETURNS TABLE (id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE public.has_role(auth.uid(), 'admin');
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_user_emails() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_emails() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated;