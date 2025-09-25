grant delete on table "public"."computers" to "postgres";

grant insert on table "public"."computers" to "postgres";

grant references on table "public"."computers" to "postgres";

grant select on table "public"."computers" to "postgres";

grant trigger on table "public"."computers" to "postgres";

grant truncate on table "public"."computers" to "postgres";

grant update on table "public"."computers" to "postgres";

grant delete on table "public"."enrollment_tokens" to "postgres";

grant insert on table "public"."enrollment_tokens" to "postgres";

grant references on table "public"."enrollment_tokens" to "postgres";

grant select on table "public"."enrollment_tokens" to "postgres";

grant trigger on table "public"."enrollment_tokens" to "postgres";

grant truncate on table "public"."enrollment_tokens" to "postgres";

grant update on table "public"."enrollment_tokens" to "postgres";

grant delete on table "public"."refresh_tokens" to "postgres";

grant insert on table "public"."refresh_tokens" to "postgres";

grant references on table "public"."refresh_tokens" to "postgres";

grant select on table "public"."refresh_tokens" to "postgres";

grant trigger on table "public"."refresh_tokens" to "postgres";

grant truncate on table "public"."refresh_tokens" to "postgres";

grant update on table "public"."refresh_tokens" to "postgres";


  create policy "insert for auth"
  on "realtime"."messages"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "select for authenticated"
  on "realtime"."messages"
  as permissive
  for select
  to authenticated
using (true);

