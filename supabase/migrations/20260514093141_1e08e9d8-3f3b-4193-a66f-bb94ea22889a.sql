
-- The admin's real email is not published: replace admin@example.com with it
-- (in both places below) before applying this migration to a new database.
-- 1) Grant admin role to the admin (existing user)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM public.profiles WHERE email = 'admin@example.com'
ON CONFLICT DO NOTHING;

-- 2) Trigger to auto-grant admin to that email on signup (in addition to default 'user')
CREATE OR REPLACE FUNCTION public.auto_admin_armando()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email = 'admin@example.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS auto_admin_armando_trigger ON auth.users;
CREATE TRIGGER auto_admin_armando_trigger
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_admin_armando();

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
