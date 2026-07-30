
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_max_players_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_max_players_check CHECK (max_players >= 2 AND max_players <= 128);

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'bracket';
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_format_check CHECK (format IN ('bracket','league'));
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS matches_per_player integer;

CREATE OR REPLACE FUNCTION public.advance_tournament_winner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_round INT;
  next_pos INT;
  next_match RECORD;
  total_rounds INT;
  t_format TEXT;
BEGIN
  IF NEW.winner_id IS NULL OR (OLD.winner_id IS NOT DISTINCT FROM NEW.winner_id) THEN
    RETURN NEW;
  END IF;

  SELECT format INTO t_format FROM public.tournaments WHERE id = NEW.tournament_id;
  -- League mode: no bracket progression, winner is chosen manually at the end
  IF t_format = 'league' THEN
    RETURN NEW;
  END IF;

  SELECT MAX(round) INTO total_rounds FROM public.tournament_matches WHERE tournament_id = NEW.tournament_id;

  IF NEW.round = total_rounds THEN
    UPDATE public.tournaments SET winner_id = NEW.winner_id, status = 'finished' WHERE id = NEW.tournament_id;
    RETURN NEW;
  END IF;

  next_round := NEW.round + 1;
  next_pos := (NEW.bracket_position + 1) / 2;
  SELECT * INTO next_match FROM public.tournament_matches
    WHERE tournament_id = NEW.tournament_id AND round = next_round AND bracket_position = next_pos;

  IF next_match.id IS NOT NULL THEN
    IF NEW.bracket_position % 2 = 1 THEN
      UPDATE public.tournament_matches SET player1_id = NEW.winner_id WHERE id = next_match.id;
    ELSE
      UPDATE public.tournament_matches SET player2_id = NEW.winner_id WHERE id = next_match.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
