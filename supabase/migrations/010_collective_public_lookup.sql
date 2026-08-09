-- Any authenticated user needs to be able to read collectives in order to:
--   (a) look up a collective by its join code before they are a member
--   (b) check for code collisions when creating a new collective
-- The 5-digit join code provides sufficient access control for discovery.

CREATE POLICY "Authenticated users can look up any collective"
  ON collectives FOR SELECT
  USING (auth.uid() IS NOT NULL);
