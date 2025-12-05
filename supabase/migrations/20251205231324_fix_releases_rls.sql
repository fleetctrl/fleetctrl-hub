  create policy "Allow all for auth"
  on "public"."releases"
  as permissive
  for all
  to authenticated
using (true);