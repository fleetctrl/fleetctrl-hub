  create table "public"."computer_group_members" (
    "created_at" timestamp with time zone not null default now(),
    "computer_id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null default gen_random_uuid(),
    "id" uuid not null default gen_random_uuid()
      );


alter table "public"."computer_group_members" enable row level security;


  create table "public"."computer_groups" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "display_name" text not null
      );


alter table "public"."computer_groups" enable row level security;

CREATE UNIQUE INDEX computer_group_members_pkey ON public.computer_group_members USING btree (id);

CREATE UNIQUE INDEX computer_group_members_unique ON public.computer_group_members USING btree (computer_id, group_id);

CREATE UNIQUE INDEX computer_groups_display_name_key ON public.computer_groups USING btree (display_name);

CREATE UNIQUE INDEX computer_groups_pkey ON public.computer_groups USING btree (id);


alter table "public"."computer_group_members" add constraint "computer_group_members_pkey" PRIMARY KEY using index "computer_group_members_pkey";

alter table "public"."computer_groups" add constraint "computer_groups_pkey" PRIMARY KEY using index "computer_groups_pkey";

alter table "public"."computer_group_members" add constraint "computer_group_members_computer_id_fkey" FOREIGN KEY (computer_id) REFERENCES computers(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."computer_group_members" validate constraint "computer_group_members_computer_id_fkey";

alter table "public"."computer_group_members" add constraint "computer_group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES computer_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."computer_group_members" validate constraint "computer_group_members_group_id_fkey";

alter table "public"."computer_group_members" add constraint "computer_group_members_unique" UNIQUE using index "computer_group_members_unique";

alter table "public"."computer_groups" add constraint "computer_groups_display_name_key" UNIQUE using index "computer_groups_display_name_key";

grant delete on table "public"."computer_group_members" to "anon";

grant insert on table "public"."computer_group_members" to "anon";

grant references on table "public"."computer_group_members" to "anon";

grant select on table "public"."computer_group_members" to "anon";

grant trigger on table "public"."computer_group_members" to "anon";

grant truncate on table "public"."computer_group_members" to "anon";

grant update on table "public"."computer_group_members" to "anon";

grant delete on table "public"."computer_group_members" to "authenticated";

grant insert on table "public"."computer_group_members" to "authenticated";

grant references on table "public"."computer_group_members" to "authenticated";

grant select on table "public"."computer_group_members" to "authenticated";

grant trigger on table "public"."computer_group_members" to "authenticated";

grant truncate on table "public"."computer_group_members" to "authenticated";

grant update on table "public"."computer_group_members" to "authenticated";

grant delete on table "public"."computer_group_members" to "postgres";

grant insert on table "public"."computer_group_members" to "postgres";

grant references on table "public"."computer_group_members" to "postgres";

grant select on table "public"."computer_group_members" to "postgres";

grant trigger on table "public"."computer_group_members" to "postgres";

grant truncate on table "public"."computer_group_members" to "postgres";

grant update on table "public"."computer_group_members" to "postgres";

grant delete on table "public"."computer_group_members" to "service_role";

grant insert on table "public"."computer_group_members" to "service_role";

grant references on table "public"."computer_group_members" to "service_role";

grant select on table "public"."computer_group_members" to "service_role";

grant trigger on table "public"."computer_group_members" to "service_role";

grant truncate on table "public"."computer_group_members" to "service_role";

grant update on table "public"."computer_group_members" to "service_role";

grant delete on table "public"."computer_groups" to "anon";

grant insert on table "public"."computer_groups" to "anon";

grant references on table "public"."computer_groups" to "anon";

grant select on table "public"."computer_groups" to "anon";

grant trigger on table "public"."computer_groups" to "anon";

grant truncate on table "public"."computer_groups" to "anon";

grant update on table "public"."computer_groups" to "anon";

grant delete on table "public"."computer_groups" to "authenticated";

grant insert on table "public"."computer_groups" to "authenticated";

grant references on table "public"."computer_groups" to "authenticated";

grant select on table "public"."computer_groups" to "authenticated";

grant trigger on table "public"."computer_groups" to "authenticated";

grant truncate on table "public"."computer_groups" to "authenticated";

grant update on table "public"."computer_groups" to "authenticated";

grant delete on table "public"."computer_groups" to "postgres";

grant insert on table "public"."computer_groups" to "postgres";

grant references on table "public"."computer_groups" to "postgres";

grant select on table "public"."computer_groups" to "postgres";

grant trigger on table "public"."computer_groups" to "postgres";

grant truncate on table "public"."computer_groups" to "postgres";

grant update on table "public"."computer_groups" to "postgres";

grant delete on table "public"."computer_groups" to "service_role";

grant insert on table "public"."computer_groups" to "service_role";

grant references on table "public"."computer_groups" to "service_role";

grant select on table "public"."computer_groups" to "service_role";

grant trigger on table "public"."computer_groups" to "service_role";

grant truncate on table "public"."computer_groups" to "service_role";

grant update on table "public"."computer_groups" to "service_role";


create policy "allow all for auth"
  on "public"."computer_group_members"
  as permissive
  for all
  to authenticated
using (true);



  create policy "enable all to auth"
  on "public"."computer_groups"
  as permissive
  for all
  to authenticated
using (true)
with check (true);


alter publication supabase_realtime add table public.computer_groups;
alter publication supabase_realtime add table public.computer_group_members;