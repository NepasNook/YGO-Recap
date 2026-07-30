-- Elo ratings, recomputed from scratch by replaying every completed,
-- non-for-fun duel in chronological order. Runs SECURITY DEFINER so it can
-- read `duels` (restricted to authenticated users) internally while only
-- exposing the aggregated result publicly — mirrors the public.user_stats
-- view, which already exposes aggregated (non-raw) duel stats to anon.
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
  start_rating CONSTANT numeric := 1000;
BEGIN
  FOR d IN
    SELECT player1_id AS p1, player2_id AS p2, winner_id AS w
    FROM public.duels
    WHERE for_fun = false AND winner_id IS NOT NULL
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
    ROUND((ratings ->> p.id::text)::numeric)::int AS elo,
    (played ->> p.id::text)::int AS duels_played
  FROM public.profiles p
  WHERE ratings ? p.id::text
  ORDER BY 3 DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_elo_ratings() TO authenticated, anon;
