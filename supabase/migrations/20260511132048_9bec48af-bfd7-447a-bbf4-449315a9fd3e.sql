
DROP VIEW IF EXISTS public.user_stats;
CREATE VIEW public.user_stats WITH (security_invoker=on) AS
SELECT
  p.id AS user_id,
  p.username,
  COUNT(d.id) FILTER (WHERE d.winner_id IS NOT NULL) AS total_duels,
  COUNT(d.id) FILTER (WHERE d.winner_id = p.id) AS wins,
  COUNT(d.id) FILTER (WHERE d.winner_id IS NOT NULL AND d.winner_id <> p.id) AS losses,
  CASE WHEN COUNT(d.id) FILTER (WHERE d.winner_id IS NOT NULL) > 0
    THEN ROUND(100.0 * COUNT(d.id) FILTER (WHERE d.winner_id = p.id) / COUNT(d.id) FILTER (WHERE d.winner_id IS NOT NULL), 1)
    ELSE 0 END AS win_pct
FROM public.profiles p
LEFT JOIN public.duels d ON (d.player1_id = p.id OR d.player2_id = p.id)
GROUP BY p.id, p.username;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
