-- Replace the "replay full history" Elo approach with a simple live rating:
-- every profile starts at 1500, and a trigger nudges both players' elo by a
-- fixed K-factor whenever a duel's winner is first set (for_fun = false only).
-- No backfill from past duels — ratings start moving from today onward.

DROP FUNCTION IF EXISTS public.compute_elo_ratings();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS elo integer NOT NULL DEFAULT 1500;

GRANT SELECT (elo) ON public.profiles TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.apply_duel_elo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ra numeric;
  rb numeric;
  ea numeric;
  eb numeric;
  sa numeric;
  sb numeric;
  k CONSTANT numeric := 32;
BEGIN
  -- Only score real, decided, non-for-fun duels.
  IF NEW.for_fun OR NEW.winner_id IS NULL OR NEW.player1_id = NEW.player2_id THEN
    RETURN NEW;
  END IF;
  -- Apply once: skip if this duel already had a winner before this write
  -- (avoids double-counting on later edits/corrections).
  IF TG_OP = 'UPDATE' AND OLD.winner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT elo INTO ra FROM public.profiles WHERE id = NEW.player1_id;
  SELECT elo INTO rb FROM public.profiles WHERE id = NEW.player2_id;
  ra := COALESCE(ra, 1500);
  rb := COALESCE(rb, 1500);

  ea := 1.0 / (1.0 + power(10, (rb - ra) / 400.0));
  eb := 1.0 - ea;
  sa := CASE WHEN NEW.winner_id = NEW.player1_id THEN 1 ELSE 0 END;
  sb := 1 - sa;

  UPDATE public.profiles SET elo = ROUND(ra + k * (sa - ea)) WHERE id = NEW.player1_id;
  UPDATE public.profiles SET elo = ROUND(rb + k * (sb - eb)) WHERE id = NEW.player2_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_duel_elo ON public.duels;
CREATE TRIGGER trg_duel_elo
  AFTER INSERT OR UPDATE OF winner_id ON public.duels
  FOR EACH ROW EXECUTE FUNCTION public.apply_duel_elo();
