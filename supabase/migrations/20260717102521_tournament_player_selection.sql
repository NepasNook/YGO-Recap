-- Allow tournament creator (or admin) to add other users as participants
-- when creating a tournament with a hand-picked player list, instead of
-- requiring each participant to insert their own row.
DROP POLICY IF EXISTS "tp self join" ON public.tournament_participants;
CREATE POLICY "tp self or creator join" ON public.tournament_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.creator_id = auth.uid())
  );
