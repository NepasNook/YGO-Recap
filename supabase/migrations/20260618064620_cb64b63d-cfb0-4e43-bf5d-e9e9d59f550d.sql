DROP POLICY IF EXISTS "dg public read" ON public.duel_games;
CREATE POLICY "dg auth read" ON public.duel_games FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.duel_games FROM anon;

DROP POLICY IF EXISTS "dls public read" ON public.duel_live_state;
CREATE POLICY "dls auth read" ON public.duel_live_state FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.duel_live_state FROM anon;

DROP POLICY IF EXISTS "lp public read" ON public.duel_lp_logs;
DROP POLICY IF EXISTS "duel_lp_logs public read" ON public.duel_lp_logs;
DO $$ DECLARE p text; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='duel_lp_logs' AND cmd='SELECT' AND 'public' = ANY(roles)
  LOOP EXECUTE format('DROP POLICY %I ON public.duel_lp_logs', p); END LOOP;
END $$;
CREATE POLICY "lp auth read" ON public.duel_lp_logs FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.duel_lp_logs FROM anon;