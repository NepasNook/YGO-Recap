
CREATE POLICY "dg admin delete" ON public.duel_games FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tm admin delete" ON public.tournament_matches FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
