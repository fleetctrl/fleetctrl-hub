-- Add RLS policies for winget_releases and win32_releases tables
-- These policies allow authenticated users to perform all operations

CREATE POLICY "allow all for auth"
  ON "public"."winget_releases"
  AS permissive
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow all for auth"
  ON "public"."win32_releases"
  AS permissive
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow all for auth"
  ON "public"."releases"
  AS permissive
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow all for auth"
  ON "public"."detection_rules"
  AS permissive
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow all for auth"
  ON "public"."release_requirements"
  AS permissive
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow all for auth"
  ON "public"."release_scripts"
  AS permissive
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
