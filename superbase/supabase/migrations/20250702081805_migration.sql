drop policy "Enable read access for all authenticated" on "public"."computers";

alter table "public"."computers" add column "key" uuid not null default gen_random_uuid();

alter table "public"."computers" add column "login_user" character varying;

CREATE UNIQUE INDEX computers_key_key ON public.computers USING btree (key);

alter table "public"."computers" add constraint "computers_key_key" UNIQUE using index "computers_key_key";

grant delete on table "public"."computers" to "postgres";

grant insert on table "public"."computers" to "postgres";

grant references on table "public"."computers" to "postgres";

grant select on table "public"."computers" to "postgres";

grant trigger on table "public"."computers" to "postgres";

grant truncate on table "public"."computers" to "postgres";

grant update on table "public"."computers" to "postgres";

create policy "Enable insert for anon"
on "public"."computers"
as restrictive
for insert
to anon
with check (true);


create policy "Enable update for computers with same rustdesk_id"
on "public"."computers"
as permissive
for update
to anon
using (((rustdesk_id = rustdesk_id) AND (key = key)))
with check (((rustdesk_id = rustdesk_id) AND (key = key)));


create policy "Enable read access for all authenticated"
on "public"."computers"
as permissive
for select
to authenticated, anon
using (true);



