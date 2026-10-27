-- An automated security pass restricted avatar reads to "owner only"
-- (20260730095006_...sql), which breaks displaying other users' avatars
-- across the app (leaderboard, tournaments, public profiles). Avatars are
-- profile pictures meant to be publicly visible, like on any social app —
-- only writes (upload/update/delete) need to stay owner-restricted, which
-- the "avatars owner insert/update/delete" policies already handle.
DROP POLICY IF EXISTS "avatars owner list" ON storage.objects;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
