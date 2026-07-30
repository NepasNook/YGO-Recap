
DROP POLICY IF EXISTS "decks public read" ON public.decks;
CREATE POLICY "decks authenticated read" ON public.decks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tournaments public read" ON public.tournaments;
CREATE POLICY "tournaments authenticated read" ON public.tournaments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tm public read" ON public.tournament_matches;
CREATE POLICY "tm authenticated read" ON public.tournament_matches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tp public read" ON public.tournament_participants;
CREATE POLICY "tp authenticated read" ON public.tournament_participants FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.decks FROM anon;
REVOKE SELECT ON public.tournaments FROM anon;
REVOKE SELECT ON public.tournament_matches FROM anon;
REVOKE SELECT ON public.tournament_participants FROM anon;
