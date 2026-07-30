
CREATE OR REPLACE FUNCTION public.advance_tournament_winner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  next_round INT;
  next_pos INT;
  next_match RECORD;
  total_rounds INT;
BEGIN
  IF NEW.winner_id IS NULL OR (OLD.winner_id IS NOT DISTINCT FROM NEW.winner_id) THEN
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
$$;

CREATE TRIGGER trg_advance_winner
AFTER UPDATE OF winner_id ON public.tournament_matches
FOR EACH ROW EXECUTE FUNCTION public.advance_tournament_winner();
