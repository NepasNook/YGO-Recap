ALTER TABLE public.duels ADD COLUMN IF NOT EXISTS is_local boolean NOT NULL DEFAULT false;
ALTER TABLE public.duel_live_state ADD COLUMN IF NOT EXISTS draws integer NOT NULL DEFAULT 0;
ALTER TABLE public.duel_live_state ADD COLUMN IF NOT EXISTS rps_needed boolean NOT NULL DEFAULT true;
ALTER TABLE public.duel_live_state ADD COLUMN IF NOT EXISTS starter integer;