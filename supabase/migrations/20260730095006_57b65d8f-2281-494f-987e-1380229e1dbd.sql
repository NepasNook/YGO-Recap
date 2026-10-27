DROP POLICY IF EXISTS "avatars public read" ON storage.objects;

CREATE POLICY "avatars owner list"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);