-- 1) Remove profiles from realtime publication so emails are not broadcast
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles';
  END IF;
END$$;

-- 2) Tighten realtime.messages policies to participants of a duel channel
DROP POLICY IF EXISTS "authenticated can use realtime" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can broadcast realtime" ON realtime.messages;
DROP POLICY IF EXISTS "subscribe to duel channels you participate in" ON realtime.messages;
DROP POLICY IF EXISTS "broadcast to duel channels you participate in" ON realtime.messages;

CREATE POLICY "subscribe to duel channels you participate in"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.duels d
    WHERE realtime.topic() = 'duel-' || d.id::text
      AND (
        d.player1_id = auth.uid()
        OR d.player2_id = auth.uid()
        OR d.pending_join_user_id = auth.uid()
      )
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "broadcast to duel channels you participate in"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.duels d
    WHERE realtime.topic() = 'duel-' || d.id::text
      AND (
        d.player1_id = auth.uid()
        OR d.player2_id = auth.uid()
      )
  )
  OR public.has_role(auth.uid(), 'admin')
);