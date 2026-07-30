CREATE TABLE public.duel_lp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id UUID NOT NULL REFERENCES public.duels(id) ON DELETE CASCADE,
  player INT NOT NULL CHECK (player IN (1,2)),
  prev_lp INT NOT NULL,
  new_lp INT NOT NULL,
  delta INT NOT NULL,
  by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.duel_lp_logs TO authenticated;
GRANT ALL ON public.duel_lp_logs TO service_role;

ALTER TABLE public.duel_lp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "duel lp logs public read" ON public.duel_lp_logs
  FOR SELECT USING (true);

CREATE POLICY "duel lp logs participant insert" ON public.duel_lp_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.duels d
      WHERE d.id = duel_id
        AND (auth.uid() = d.player1_id OR auth.uid() = d.player2_id OR has_role(auth.uid(),'admin'))
    )
  );

CREATE INDEX duel_lp_logs_duel_id_created_at_idx ON public.duel_lp_logs(duel_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_lp_logs;