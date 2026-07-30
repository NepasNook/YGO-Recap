-- Revert the "live trigger" Elo approach: go back to recomputing Elo on the
-- fly from the same `duels` table used for the win-rate leaderboard, but
-- only counting matches from 2026-07-17 onward (the day this feature
-- launched) instead of full history. Every registered profile is returned
-- (defaulting to the 1500 baseline) so the leaderboard always shows the
-- full roster, even with zero qualifying duels so far.

DROP TRIGGER IF EXISTS trg_duel_elo ON public.duels;
DROP FUNCTION IF EXISTS public.apply_duel_elo();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS elo;

CREATE OR REPLACE FUNCTION public.compute_elo_ratings()
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

GRANT EXECUTE ON FUNCTION public.compute_elo_ratings() TO authenticated, anon;
