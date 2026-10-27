-- Each player can pick a default deck per game format (one for GOAT, one for
-- EDISON). Starting a duel pre-selects it; it can still be changed per duel.
-- Requires 20261014120000_game_formats_goat_edison.sql (decks.game_format).

CREATE TABLE IF NOT EXISTS public.user_default_decks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_format text NOT NULL CHECK (game_format IN ('goat', 'edison')),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_format)
);

ALTER TABLE public.user_default_decks ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read them: starting a duel pre-selects the
-- opponent's default deck too. Each player only writes their own.
DROP POLICY IF EXISTS "udd authenticated read" ON public.user_default_decks;
CREATE POLICY "udd authenticated read" ON public.user_default_decks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "udd self insert" ON public.user_default_decks;
CREATE POLICY "udd self insert" ON public.user_default_decks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "udd self update" ON public.user_default_decks;
CREATE POLICY "udd self update" ON public.user_default_decks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "udd self delete" ON public.user_default_decks;
CREATE POLICY "udd self delete" ON public.user_default_decks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.user_default_decks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_default_decks TO authenticated;

-- The default deck of a format must be one of that format's decks.
CREATE OR REPLACE FUNCTION public.check_user_default_deck()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.decks d WHERE d.id = NEW.deck_id AND d.game_format = NEW.game_format) THEN
    RAISE EXCEPTION 'Il mazzo scelto non appartiene al formato %', upper(NEW.game_format);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_user_default_deck() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_check_user_default_deck ON public.user_default_decks;
CREATE TRIGGER trg_check_user_default_deck
  BEFORE INSERT OR UPDATE ON public.user_default_decks
  FOR EACH ROW EXECUTE FUNCTION public.check_user_default_deck();
