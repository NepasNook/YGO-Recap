-- 1) Admin as referee ---------------------------------------------------------
-- An admin can start a tournament duel between two other players and run it
-- from their own phone. Every other write the duel room makes (duels, LP log,
-- live-state updates) already allowed admins; these two did not, so the room
-- got stuck on "Caricamento duello…" and games couldn't be recorded.

DROP POLICY IF EXISTS "dls participant insert" ON public.duel_live_state;
CREATE POLICY "dls participant insert" ON public.duel_live_state FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.duels d
    WHERE d.id = duel_id
      AND (auth.uid() = d.player1_id OR auth.uid() = d.player2_id OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "dg participant write" ON public.duel_games;
CREATE POLICY "dg participant write" ON public.duel_games FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.duels d
    WHERE d.id = duel_id
      AND (auth.uid() = d.player1_id OR auth.uid() = d.player2_id OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);


-- 2) Deleting a tournament duel frees its match --------------------------------
-- `tournament_matches.duel_id` has no foreign key, so deleting a duel (admin
-- panel, or "Annulla" in the duel room) left the match pointing at a duel that
-- no longer exists: "Resume" led to "Duello non trovato" and the match could
-- never be started again. Unlink it, and drop the result that duel produced:
-- advance_tournament_winner then takes the winner back out of the next round
-- (if that match hasn't started yet) or reopens the tournament (final).
-- Runs as a nested trigger, so guard_tournament_match_update lets it through.

CREATE OR REPLACE FUNCTION public.release_match_of_deleted_duel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tournament_matches
  SET duel_id = NULL,
      started_at = NULL,
      winner_id = CASE WHEN OLD.winner_id IS NOT NULL AND winner_id = OLD.winner_id THEN NULL ELSE winner_id END
  WHERE duel_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_match_of_deleted_duel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_release_match_of_deleted_duel ON public.duels;
CREATE TRIGGER trg_release_match_of_deleted_duel
  AFTER DELETE ON public.duels
  FOR EACH ROW EXECUTE FUNCTION public.release_match_of_deleted_duel();

-- One-time repair: matches already pointing at a duel that was deleted.
UPDATE public.tournament_matches m
SET duel_id = NULL, started_at = NULL
WHERE m.duel_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.duels d WHERE d.id = m.duel_id);