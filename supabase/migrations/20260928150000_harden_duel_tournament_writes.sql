-- Tighten who can write what on duels and tournaments, without changing any
-- flow the app itself uses. Until now RLS only checked *who* writes a row, not
-- *what* they write, so a signed-in user calling the API directly could:
--   * insert duels that were already won, backdated, against anyone;
--   * rewrite a finished duel (winner, players), or clear its winner and then
--     delete it (the delete policy only allows duels without a winner);
--   * move a match of their own tournament into someone else's and have the
--     advancement trigger crown them champion there;
--   * join tournaments that are already running, finished or full.
-- Every rule below skips admins, the service role / SQL editor (no auth.uid())
-- and writes made by other triggers (pg_trigger_depth() > 1), so admin tools
-- and the bracket advancement keep working exactly as before.


-- 1) Duels ------------------------------------------------------------------

-- `pending_join_user_id` (old lobby feature) is unused by the app: it no longer
-- grants write access. WITH CHECK also validates the row *after* the update.
DROP POLICY IF EXISTS "duels participant or joiner update" ON public.duels;
DROP POLICY IF EXISTS "duels participant or admin update" ON public.duels;
CREATE POLICY "duels participant or admin update" ON public.duels
  FOR UPDATE
  USING (auth.uid() = player1_id OR auth.uid() = player2_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.guard_duel_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A duel starts empty; its result is recorded while it's played.
    IF NEW.winner_id IS NOT NULL OR NEW.games_p1_wins <> 0 OR NEW.games_p2_wins <> 0 OR NEW.status <> 'live' THEN
      RAISE EXCEPTION 'Un nuovo duello non può avere già un risultato';
    END IF;
    IF NEW.player1_id = NEW.player2_id THEN
      RAISE EXCEPTION 'Un giocatore non può sfidare sé stesso';
    END IF;
    -- A tournament duel must be between that match's two players (either
    -- order: whoever starts it becomes player 1) and the match still open.
    IF NEW.tournament_match_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tournament_matches m
      WHERE m.id = NEW.tournament_match_id
        AND m.winner_id IS NULL
        AND ((m.player1_id = NEW.player1_id AND m.player2_id = NEW.player2_id)
          OR (m.player1_id = NEW.player2_id AND m.player2_id = NEW.player1_id))
    ) THEN
      RAISE EXCEPTION 'Il duello non corrisponde a un match aperto di questo torneo';
    END IF;
    NEW.date := now();
    NEW.created_at := now();
    NEW.pending_join_user_id := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: a finished duel is final for its players (only an admin corrects it).
  IF OLD.winner_id IS NOT NULL THEN
    RAISE EXCEPTION 'Duello già concluso: solo un admin può modificarlo';
  END IF;
  IF NEW.player1_id IS DISTINCT FROM OLD.player1_id
     OR (OLD.player2_id IS NOT NULL AND NEW.player2_id IS DISTINCT FROM OLD.player2_id)
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.tournament_match_id IS DISTINCT FROM OLD.tournament_match_id
     OR NEW.for_fun IS DISTINCT FROM OLD.for_fun
     OR NEW.best_of IS DISTINCT FROM OLD.best_of THEN
    RAISE EXCEPTION 'Giocatori, data e formato del duello non sono modificabili';
  END IF;
  IF NEW.winner_id IS NOT NULL AND NEW.winner_id IS DISTINCT FROM NEW.player1_id AND NEW.winner_id IS DISTINCT FROM NEW.player2_id THEN
    RAISE EXCEPTION 'Il vincitore deve essere uno dei due giocatori';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_duel_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_duel_write ON public.duels;
CREATE TRIGGER trg_guard_duel_write
  BEFORE INSERT OR UPDATE ON public.duels
  FOR EACH ROW EXECUTE FUNCTION public.guard_duel_write();


-- 2) Tournament matches -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_tournament_match_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.tournament_id IS DISTINCT FROM OLD.tournament_id THEN
    RAISE EXCEPTION 'Un match non può essere spostato in un altro torneo';
  END IF;

  -- The organizer manages their own tournament freely.
  IF EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = OLD.tournament_id AND t.creator_id = auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- The match's players may only link/unlink their duel and record the
  -- result of the duel they actually finished for this match.
  IF NEW.round IS DISTINCT FROM OLD.round
     OR NEW.bracket_position IS DISTINCT FROM OLD.bracket_position
     OR NEW.player1_id IS DISTINCT FROM OLD.player1_id
     OR NEW.player2_id IS DISTINCT FROM OLD.player2_id
     OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo l''organizzatore o un admin può modificare il match';
  END IF;
  IF NEW.winner_id IS DISTINCT FROM OLD.winner_id THEN
    IF OLD.winner_id IS NOT NULL THEN
      RAISE EXCEPTION 'Risultato già registrato: solo l''organizzatore o un admin può cambiarlo';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.duels d
      WHERE d.id = NEW.duel_id AND d.tournament_match_id = NEW.id AND d.winner_id = NEW.winner_id
    ) THEN
      RAISE EXCEPTION 'Il vincitore deve risultare da un duello concluso di questo match';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_tournament_match_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_tournament_match_update ON public.tournament_matches;
CREATE TRIGGER trg_guard_tournament_match_update
  BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_match_update();

-- Bracket advancement, now also undoing it when a result is cleared ("Annulla
-- risultato" / admin "No winner"): the player is taken back out of the next
-- round (only while that match hasn't started or been decided), and clearing
-- the final reopens the tournament. Setting a result behaves as before.
CREATE OR REPLACE FUNCTION public.advance_tournament_winner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_pos INT;
  next_match RECORD;
  total_rounds INT;
  t_format TEXT;
BEGIN
  IF OLD.winner_id IS NOT DISTINCT FROM NEW.winner_id THEN
    RETURN NEW;
  END IF;

  SELECT format INTO t_format FROM public.tournaments WHERE id = NEW.tournament_id;
  -- League mode: no bracket progression, winner is chosen manually at the end
  IF t_format = 'league' THEN
    RETURN NEW;
  END IF;

  SELECT MAX(round) INTO total_rounds FROM public.tournament_matches WHERE tournament_id = NEW.tournament_id;

  IF NEW.round = total_rounds THEN
    IF NEW.winner_id IS NOT NULL THEN
      UPDATE public.tournaments SET winner_id = NEW.winner_id, status = 'finished' WHERE id = NEW.tournament_id;
    ELSE
      UPDATE public.tournaments SET winner_id = NULL, status = 'active'
        WHERE id = NEW.tournament_id AND winner_id IS NOT DISTINCT FROM OLD.winner_id;
    END IF;
    RETURN NEW;
  END IF;

  next_pos := (NEW.bracket_position + 1) / 2;
  SELECT * INTO next_match FROM public.tournament_matches
    WHERE tournament_id = NEW.tournament_id AND round = NEW.round + 1 AND bracket_position = next_pos;

  IF next_match.id IS NOT NULL THEN
    IF NEW.winner_id IS NOT NULL THEN
      IF NEW.bracket_position % 2 = 1 THEN
        UPDATE public.tournament_matches SET player1_id = NEW.winner_id WHERE id = next_match.id;
      ELSE
        UPDATE public.tournament_matches SET player2_id = NEW.winner_id WHERE id = next_match.id;
      END IF;
    -- (Not for BYEs: their automatic win is never re-set, so the player would
    -- be left with no way back into the next round.)
    ELSIF next_match.winner_id IS NULL AND next_match.duel_id IS NULL
          AND NEW.player1_id IS NOT NULL AND NEW.player2_id IS NOT NULL THEN
      IF NEW.bracket_position % 2 = 1 THEN
        UPDATE public.tournament_matches SET player1_id = NULL WHERE id = next_match.id AND player1_id = OLD.winner_id;
      ELSE
        UPDATE public.tournament_matches SET player2_id = NULL WHERE id = next_match.id AND player2_id = OLD.winner_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- One-time repair: BYE matches are created already decided, and the trigger
-- above only fires on updates, so those players never moved on and brackets
-- with an odd number of players got stuck. Place each BYE winner in its
-- still-empty slot of the next round (running tournaments only).
UPDATE public.tournament_matches nm
SET player1_id = m.winner_id
FROM public.tournament_matches m
JOIN public.tournaments t ON t.id = m.tournament_id
WHERE t.format = 'bracket' AND t.status <> 'finished'
  AND m.winner_id IS NOT NULL AND (m.player1_id IS NULL OR m.player2_id IS NULL)
  AND m.bracket_position % 2 = 1
  AND nm.tournament_id = m.tournament_id AND nm.round = m.round + 1
  AND nm.bracket_position = (m.bracket_position + 1) / 2
  AND nm.player1_id IS NULL AND nm.winner_id IS NULL
  -- skip if the organizer already placed that player in the next round by hand
  AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches x
    WHERE x.tournament_id = m.tournament_id AND x.round = m.round + 1
      AND m.winner_id IN (x.player1_id, x.player2_id)
  );

UPDATE public.tournament_matches nm
SET player2_id = m.winner_id
FROM public.tournament_matches m
JOIN public.tournaments t ON t.id = m.tournament_id
WHERE t.format = 'bracket' AND t.status <> 'finished'
  AND m.winner_id IS NOT NULL AND (m.player1_id IS NULL OR m.player2_id IS NULL)
  AND m.bracket_position % 2 = 0
  AND nm.tournament_id = m.tournament_id AND nm.round = m.round + 1
  AND nm.bracket_position = (m.bracket_position + 1) / 2
  AND nm.player2_id IS NULL AND nm.winner_id IS NULL
  -- skip if the organizer already placed that player in the next round by hand
  AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches x
    WHERE x.tournament_id = m.tournament_id AND x.round = m.round + 1
      AND m.winner_id IN (x.player1_id, x.player2_id)
  );


-- 3) Tournament participants ------------------------------------------------

-- Organizer and admins still add anyone (tournament creation picks players);
-- joining by yourself is only possible while registrations are open and there's room.
DROP POLICY IF EXISTS "tp self or creator join" ON public.tournament_participants;
CREATE POLICY "tp self or creator join" ON public.tournament_participants
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.creator_id = auth.uid())
    OR (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.tournaments t
        WHERE t.id = tournament_id
          AND t.status = 'open'
          AND (SELECT count(*) FROM public.tournament_participants p WHERE p.tournament_id = t.id) < t.max_players
      )
    )
  );


-- 4) LP log: let the duel's players delete an LP change (used by Undo) ------

GRANT DELETE ON public.duel_lp_logs TO authenticated;
DROP POLICY IF EXISTS "duel lp logs participant delete" ON public.duel_lp_logs;
CREATE POLICY "duel lp logs participant delete" ON public.duel_lp_logs
  FOR DELETE TO authenticated
  USING (
    note IS NULL
    AND EXISTS (
      SELECT 1 FROM public.duels d
      WHERE d.id = duel_id
        AND (auth.uid() = d.player1_id OR auth.uid() = d.player2_id OR public.has_role(auth.uid(), 'admin'))
    )
  );


-- 5) Sign-up: check a duelist name is free (case-insensitive) before creating
-- the account; otherwise handle_new_user silently appends random digits.
-- Names are already public through the leaderboard (compute_elo_ratings).
CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(trim(_username)));
$$;

REVOKE EXECUTE ON FUNCTION public.username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;
