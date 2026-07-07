
CREATE POLICY "lesson images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'lesson-images');

CREATE POLICY "editors can upload lesson images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lesson-images' AND public.is_editor(auth.uid()));

CREATE POLICY "editors can update lesson images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'lesson-images' AND public.is_editor(auth.uid()));

CREATE POLICY "editors can delete lesson images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lesson-images' AND public.is_editor(auth.uid()));
