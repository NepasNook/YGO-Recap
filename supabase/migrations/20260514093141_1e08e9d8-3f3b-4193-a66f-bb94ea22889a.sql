
-- 1-2) Bootstrap del ruolo admin (grant iniziale + trigger di auto-assegnazione):
--      rimossi da questo file perche' contenevano un indirizzo email in chiaro.
--      Sostituiti da 20260722090000_admin_bootstrap_no_pii.sql, che tiene gli
--      indirizzi in private.admin_bootstrap_emails (dato nel DB, non nel repo).
--      Su un database creato da zero non esiste alcun admin preconfigurato:
--      vedi il README per come promuovere il primo utente.

-- 3) Live duel lobby: add status & pending join columns
ALTER TABLE public.duels
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS pending_join_user_id UUID;

-- Allow player2 to be NULL for hosted (waiting) duels
ALTER TABLE public.duels ALTER COLUMN player2_id DROP NOT NULL;

-- Update insert policy to allow hosting (player2 may be null)
DROP POLICY IF EXISTS "duels participant insert" ON public.duels;
CREATE POLICY "duels participant insert" ON public.duels
  FOR INSERT WITH CHECK (auth.uid() = player1_id);

-- Allow any authenticated user to update pending_join_user_id (to request to join);
-- replace existing update policy with broader one
DROP POLICY IF EXISTS "duels participant update" ON public.duels;
CREATE POLICY "duels participant or joiner update" ON public.duels
  FOR UPDATE USING (
    auth.uid() = player1_id OR auth.uid() = player2_id OR auth.uid() IS NOT NULL OR public.has_role(auth.uid(), 'admin')
  );

-- 4) duel_live_state table for realtime sync
CREATE TABLE IF NOT EXISTS public.duel_live_state (
  duel_id UUID PRIMARY KEY REFERENCES public.duels(id) ON DELETE CASCADE,
  p1_lp INT NOT NULL DEFAULT 8000,
  p2_lp INT NOT NULL DEFAULT 8000,
  p1_wins INT NOT NULL DEFAULT 0,
  p2_wins INT NOT NULL DEFAULT 0,
  last_event JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.duel_live_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dls public read" ON public.duel_live_state;
CREATE POLICY "dls public read" ON public.duel_live_state FOR SELECT USING (true);

DROP POLICY IF EXISTS "dls participant insert" ON public.duel_live_state;
CREATE POLICY "dls participant insert" ON public.duel_live_state FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.duels d WHERE d.id = duel_id AND (auth.uid() = d.player1_id OR auth.uid() = d.player2_id))
);

DROP POLICY IF EXISTS "dls participant update" ON public.duel_live_state;
CREATE POLICY "dls participant update" ON public.duel_live_state FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.duels d WHERE d.id = duel_id AND (auth.uid() = d.player1_id OR auth.uid() = d.player2_id OR public.has_role(auth.uid(), 'admin')))
);

-- 5) Realtime
ALTER TABLE public.duels REPLICA IDENTITY FULL;
ALTER TABLE public.duel_live_state REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='duels';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.duels; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='duel_live_state';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_live_state; END IF;
END $$;
