
-- 1) Duels: remove the "any authenticated user" clause
DROP POLICY IF EXISTS "duels participant or joiner update" ON public.duels;
CREATE POLICY "duels participant or joiner update"
ON public.duels
FOR UPDATE
USING (
  auth.uid() = player1_id
  OR auth.uid() = player2_id
  OR auth.uid() = pending_join_user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2) Profiles: restrict SELECT to authenticated; expose a safe public view without email
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;
CREATE POLICY "profiles authenticated read"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Owners and admins can still read their own email via direct row access (covered by above).
-- For unauthenticated public listings (e.g. username pages), expose a column-safe view.
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT id, username, avatar_url, created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Revoke direct email access from anon
REVOKE SELECT ON public.profiles FROM anon;

-- 3) user_roles: restrict SELECT to self or admin
DROP POLICY IF EXISTS "roles readable by all" ON public.user_roles;
CREATE POLICY "roles readable by self or admin"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 4) realtime.messages: require authentication for channel subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can use realtime" ON realtime.messages;
CREATE POLICY "authenticated can use realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "authenticated can broadcast realtime" ON realtime.messages;
CREATE POLICY "authenticated can broadcast realtime"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);
