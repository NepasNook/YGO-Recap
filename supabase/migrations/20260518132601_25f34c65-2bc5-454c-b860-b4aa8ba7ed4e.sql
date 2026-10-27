CREATE TABLE public.user_lp_shortcuts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  delta integer NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_lp_shortcuts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.user_lp_shortcuts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.user_lp_shortcuts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.user_lp_shortcuts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.user_lp_shortcuts FOR DELETE USING (auth.uid() = user_id);