-- Switch decks to a fixed system-managed list
ALTER TABLE public.decks ALTER COLUMN user_id DROP NOT NULL;

-- Remove all existing decks (and any duel references via SET NULL semantics already handled by deck1_id/deck2_id being nullable)
UPDATE public.duels SET deck1_id = NULL WHERE deck1_id IS NOT NULL;
UPDATE public.duels SET deck2_id = NULL WHERE deck2_id IS NOT NULL;
DELETE FROM public.decks;

-- Insert the 10 fixed archetypes as system decks (user_id NULL)
INSERT INTO public.decks (name, user_id) VALUES
  ('Warrior', NULL),
  ('Goat Control', NULL),
  ('Chaos Turbo', NULL),
  ('Chaos Control', NULL),
  ('Chaos Return', NULL),
  ('Burn', NULL),
  ('Reasoning Gate', NULL),
  ('Earth Aggro', NULL),
  ('Zombie', NULL),
  ('Rescue Cat', NULL);

-- Lock down writes: only admin may insert/update/delete decks now
DROP POLICY IF EXISTS "decks owner write" ON public.decks;
DROP POLICY IF EXISTS "decks owner update" ON public.decks;
DROP POLICY IF EXISTS "decks owner delete" ON public.decks;
-- "decks admin all" + "decks public read" remain in place