CREATE POLICY "Give access to a authenticated user 9flvp9_0" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'internal');

CREATE POLICY "Give access to a authenticated user 9flvp9_1" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'internal');

CREATE POLICY "Give access to a authenticated user 9flvp9_2" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'internal');

CREATE POLICY "Give access to a authenticated user 9flvp9_3" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'internal');