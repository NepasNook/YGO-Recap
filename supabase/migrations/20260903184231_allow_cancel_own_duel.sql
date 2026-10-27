-- Let a duel's own participants cancel it while it's still in progress
-- (winner_id IS NULL) — previously only admins could delete a duel at all.
-- Admins keep unrestricted delete (e.g. to clean up a finished duel too).
DROP POLICY IF EXISTS "duels admin delete" ON public.duels;
CREATE POLICY "duels participant or admin delete" ON public.duels
  FOR DELETE USING (
    (winner_id IS NULL AND (auth.uid() = player1_id OR auth.uid() = player2_id))
    OR public.has_role(auth.uid(), 'admin')
  );
