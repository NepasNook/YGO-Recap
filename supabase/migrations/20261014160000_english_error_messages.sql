-- English error messages: the app's UI is now in English, and these texts
-- reach the user as error toasts. The functions are the latest definitions
-- (20260929074604, 20261014120000, 20261014130000) with only the messages
-- changed; CREATE OR REPLACE keeps their triggers and privileges.

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
      RAISE EXCEPTION 'A new duel cannot already have a result';
    END IF;
    IF NEW.player1_id = NEW.player2_id THEN
      RAISE EXCEPTION 'A player cannot challenge themselves';
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
      RAISE EXCEPTION 'This duel does not match an open match of this tournament';
    END IF;
    NEW.date := now();
    NEW.created_at := now();
    NEW.pending_join_user_id := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: a finished duel is final for its players (only an admin corrects it).
  IF OLD.winner_id IS NOT NULL THEN
    RAISE EXCEPTION 'This duel is already finished: only an admin can change it';
  END IF;
  IF NEW.player1_id IS DISTINCT FROM OLD.player1_id
     OR (OLD.player2_id IS NOT NULL AND NEW.player2_id IS DISTINCT FROM OLD.player2_id)
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.tournament_match_id IS DISTINCT FROM OLD.tournament_match_id
     OR NEW.for_fun IS DISTINCT FROM OLD.for_fun
     OR NEW.best_of IS DISTINCT FROM OLD.best_of THEN
    RAISE EXCEPTION 'The players, date and format of a duel cannot be changed';
  END IF;
  IF NEW.winner_id IS NOT NULL AND NEW.winner_id IS DISTINCT FROM NEW.player1_id AND NEW.winner_id IS DISTINCT FROM NEW.player2_id THEN
    RAISE EXCEPTION 'The winner must be one of the two players';
  END IF;
  RETURN NEW;
END;
$$;

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
    RAISE EXCEPTION 'A match cannot be moved to another tournament';
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
    RAISE EXCEPTION 'Only the organizer or an admin can change this match';
  END IF;
  IF NEW.winner_id IS DISTINCT FROM OLD.winner_id THEN
    IF OLD.winner_id IS NOT NULL THEN
      RAISE EXCEPTION 'Result already recorded: only the organizer or an admin can change it';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.duels d
      WHERE d.id = NEW.duel_id AND d.tournament_match_id = NEW.id AND d.winner_id = NEW.winner_id
    ) THEN
      RAISE EXCEPTION 'The winner must come from a finished duel of this match';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_duel_game_format()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.tournament_match_id IS NOT NULL THEN
    SELECT t.game_format INTO NEW.game_format
    FROM public.tournament_matches m
    JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE m.id = NEW.tournament_match_id;
    NEW.game_format := COALESCE(NEW.game_format, 'goat');
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.game_format IS DISTINCT FROM OLD.game_format
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'The game format of a duel cannot be changed';
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.game_format IS DISTINCT FROM OLD.game_format
     OR NEW.deck1_id IS DISTINCT FROM OLD.deck1_id
     OR NEW.deck2_id IS DISTINCT FROM OLD.deck2_id THEN
    IF EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id IN (NEW.deck1_id, NEW.deck2_id) AND d.game_format <> NEW.game_format
    ) THEN
      RAISE EXCEPTION 'The chosen decks are not % decks', upper(NEW.game_format);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_default_deck()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.decks d WHERE d.id = NEW.deck_id AND d.game_format = NEW.game_format) THEN
    RAISE EXCEPTION 'The chosen deck is not a % deck', upper(NEW.game_format);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
