DROP POLICY IF EXISTS "duels participant insert" ON public.duels;
CREATE POLICY "duels participant insert" ON public.duels
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = player1_id OR has_role(auth.uid(), 'admin'::app_role));