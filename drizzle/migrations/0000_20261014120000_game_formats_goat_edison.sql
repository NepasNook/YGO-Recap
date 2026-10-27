-- Two game formats, GOAT and EDISON, each with its own deck pool and its own
-- leaderboards. Everything recorded so far was played in GOAT, so existing
-- decks, duels and tournaments default to 'goat'.

-- 1) Columns ------------------------------------------------------------------

ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS game_format text NOT NULL DEFAULT 'goat';
ALTER TABLE public.decks DROP CONSTRAINT IF EXISTS decks_game_format_check;
ALTER TABLE public.decks ADD CONSTRAINT decks_game_format_check CHECK (game_format IN ('goat', 'edison'));

ALTER TABLE public.duels ADD COLUMN IF NOT EXISTS game_format text NOT NULL DEFAULT 'goat';
ALTER TABLE public.duels DROP CONSTRAINT IF EXISTS duels_game_format_check;
ALTER TABLE public.duels ADD CONSTRAINT duels_game_format_check CHECK (game_format IN ('goat', 'edison'));

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS game_format text NOT NULL DEFAULT 'goat';
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_game_format_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_game_format_check CHECK (game_format IN ('goat', 'edison'));

CREATE INDEX IF NOT EXISTS duels_game_format_date_idx ON public.duels (game_format, date);

-- 2) EDISON deck pool ----------------------------------------------------------

INSERT INTO public.decks (name, user_id, game_format)
SELECT v.name, NULL, 'edison'
FROM (VALUES
  ('Gladiatore Bestia'),
  ('Alanera'),
  ('Fedele della Luce'),
  ('Dragon Beat'),
  ('Vaju Turbo'),
  ('Frog')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.decks d WHERE d.name = v.name AND d.game_format = 'edison'
);


-- 3) A duel's format must match its decks and its tournament --------------------
-- Applies to admins too: a GOAT duel with an EDISON deck would end up in the
-- wrong leaderboard. A tournament duel always takes its tournament's format.
-- Players can't switch the format of a duel once it exists.

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
    RAISE EXCEPTION 'Il formato di gioco del duello non è modificabile';
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.game_format IS DISTINCT FROM OLD.game_format
     OR NEW.deck1_id IS DISTINCT FROM OLD.deck1_id
      OR NEW.deck2_id IS DISTINCT FROM OLD.deck2_id THEN
    IF EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id IN (NEW.deck1_id, NEW.deck2_id) AND d.game_format <> NEW.game_format
    ) THEN
      RAISE EXCEPTION 'I mazzi scelti non appartengono al formato % del duello', upper(NEW.game_format);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_duel_game_format() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_duel_game_format ON public.duels;
CREATE TRIGGER trg_guard_duel_game_format
  BEFORE INSERT OR UPDATE ON public.duels
  FOR EACH ROW EXECUTE FUNCTION public.guard_duel_game_format();

-- 4) Win-rate stats per format ---------------------------------------------------
-- Same numbers as `user_stats`, one row per (player, format).

DROP VIEW IF EXISTS public.user_format_stats;
CREATE VIEW public.user_format_stats AS
SELECT p.id AS user_id,
    p.username,
    f.game_format,
    count(d.id) FILTER (WHERE d.winner_id IS NOT NULL AND d.for_fun = false) AS total_duels,
    count(d.id) FILTER (WHERE d.winner_id = p.id AND d.for_fun = false) AS wins,
    count(d.id) FILTER (WHERE d.winner_id IS NOT NULL AND d.winner_id <> p.id AND d.for_fun = false) AS losses,
    CASE
        WHEN count(d.id) FILTER (WHERE d.winner_id IS NOT NULL AND d.for_fun = false) > 0 THEN
            round(100.0 * count(d.id) FILTER (WHERE d.winner_id = p.id AND d.for_fun = false)::numeric
                / count(d.id) FILTER (WHERE d.winner_id IS NOT NULL AND d.for_fun = false)::numeric, 1)
        ELSE 0::numeric
    END AS win_pct
FROM public.profiles p
CROSS JOIN (VALUES ('goat'::text), ('edison'::text)) AS f(game_format)
LEFT JOIN public.duels d
  ON (d.player1_id = p.id OR d.player2_id = p.id) AND d.game_format = f.game_format
GROUP BY p.id, p.username, f.game_format;

ALTER VIEW public.user_format_stats SET (security_invoker = on);
GRANT SELECT ON public.user_format_stats TO authenticated, anon;


-- 5) Elo per format -------------------------------------------------------------
-- Same algorithm as before, computed only over the duels of one format.
-- The old no-argument version is dropped: keeping it next to one with a
-- default argument would make `compute_elo_ratings()` ambiguous.

DROP FUNCTION IF EXISTS public.compute_elo_ratings();

CREATE OR REPLACE FUNCTION public.compute_elo_ratings(_game_format text DEFAULT 'goat')
RETURNS TABLE(user_id uuid, username text, elo integer, duels_played integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
  ratings jsonb := '{}'::jsonb;
  played jsonb := '{}'::jsonb;
  ra numeric;
  rb numeric;
  ea numeric;
  eb numeric;
  sa numeric;
  sb numeric;
  k CONSTANT numeric := 32;
  start_rating CONSTANT numeric := 1500;
  cutoff CONSTANT timestamptz := '2026-07-17 00:00:00+00';
BEGIN
  FOR d IN
    SELECT player1_id AS p1, player2_id AS p2, winner_id AS w
    FROM public.duels
    WHERE for_fun = false AND winner_id IS NOT NULL AND date >= cutoff
      AND game_format = _game_format
    ORDER BY date ASC
  LOOP
    IF d.p1 = d.p2 THEN CONTINUE; END IF;

    ra := COALESCE((ratings ->> d.p1::text)::numeric, start_rating);
    rb := COALESCE((ratings ->> d.p2::text)::numeric, start_rating);
    ea := 1.0 / (1.0 + power(10, (rb - ra) / 400.0));
    eb := 1.0 - ea;
    sa := CASE WHEN d.w = d.p1 THEN 1 ELSE 0 END;
    sb := 1 - sa;

    ratings := jsonb_set(ratings, ARRAY[d.p1::text], to_jsonb(ra + k * (sa - ea)));
    ratings := jsonb_set(ratings, ARRAY[d.p2::text], to_jsonb(rb + k * (sb - eb)));
    played := jsonb_set(played, ARRAY[d.p1::text], to_jsonb(COALESCE((played ->> d.p1::text)::int, 0) + 1));
    played := jsonb_set(played, ARRAY[d.p2::text], to_jsonb(COALESCE((played ->> d.p2::text)::int, 0) + 1));
  END LOOP;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    COALESCE(ROUND((ratings ->> p.id::text)::numeric)::int, start_rating::int) AS elo,
    COALESCE((played ->> p.id::text)::int, 0) AS duels_played
  FROM public.profiles p
  ORDER BY 3 DESC, p.username ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_elo_ratings(text) TO authenticated, anon;