-- Duels can now be Best of 3 (default, first to 2 game wins) or a Single
-- Match (best_of = 1, first game win ends the match).
ALTER TABLE public.duels ADD COLUMN IF NOT EXISTS best_of integer NOT NULL DEFAULT 3;
ALTER TABLE public.duels DROP CONSTRAINT IF EXISTS duels_best_of_check;
ALTER TABLE public.duels ADD CONSTRAINT duels_best_of_check CHECK (best_of IN (1, 3));
