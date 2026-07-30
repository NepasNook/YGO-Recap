
ALTER TABLE public.duels ADD COLUMN IF NOT EXISTS for_fun BOOLEAN NOT NULL DEFAULT false;

DROP VIEW IF EXISTS public.user_stats;
CREATE VIEW public.user_stats AS
SELECT p.id AS user_id,
    p.username,
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
LEFT JOIN public.duels d ON d.player1_id = p.id OR d.player2_id = p.id
GROUP BY p.id, p.username;

GRANT SELECT ON public.user_stats TO authenticated, anon;
