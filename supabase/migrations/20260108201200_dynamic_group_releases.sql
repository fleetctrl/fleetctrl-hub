-- Create dynamic_group_releases table for assigning releases to dynamic groups
-- This mirrors computer_group_releases but references dynamic_computer_groups

create table "public"."dynamic_group_releases" (
    "created_at" timestamp with time zone not null default now(),
    "release_id" uuid not null,
    "group_id" uuid not null,
    "id" uuid not null default gen_random_uuid(),
    "assign_type" assign_app_type not null default 'include'::assign_app_type,
    "action" assignment_action not null
);

alter table "public"."dynamic_group_releases" enable row level security;

-- Primary key
CREATE UNIQUE INDEX dynamic_group_releases_pkey ON public.dynamic_group_releases USING btree (id);
alter table "public"."dynamic_group_releases" add constraint "dynamic_group_releases_pkey" PRIMARY KEY using index "dynamic_group_releases_pkey";

-- Unique constraint for release_id + group_id combination
CREATE UNIQUE INDEX dynamic_group_release_unique ON public.dynamic_group_releases USING btree (release_id, group_id);
alter table "public"."dynamic_group_releases" add constraint "dynamic_group_release_unique" UNIQUE using index "dynamic_group_release_unique";

-- Foreign key to dynamic_computer_groups
alter table "public"."dynamic_group_releases" add constraint "dynamic_group_releases_group_id_fkey" 
    FOREIGN KEY (group_id) REFERENCES dynamic_computer_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."dynamic_group_releases" validate constraint "dynamic_group_releases_group_id_fkey";

-- Foreign key to releases
alter table "public"."dynamic_group_releases" add constraint "dynamic_group_releases_release_id_fkey" 
    FOREIGN KEY (release_id) REFERENCES releases(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."dynamic_group_releases" validate constraint "dynamic_group_releases_release_id_fkey";

-- RLS policy
create policy "allow all for auth"
    on "public"."dynamic_group_releases"
    as permissive
    for all
    to public
    using (true);

-- Grants for all roles
grant delete on table "public"."dynamic_group_releases" to "anon";
grant insert on table "public"."dynamic_group_releases" to "anon";
grant references on table "public"."dynamic_group_releases" to "anon";
grant select on table "public"."dynamic_group_releases" to "anon";
grant trigger on table "public"."dynamic_group_releases" to "anon";
grant truncate on table "public"."dynamic_group_releases" to "anon";
grant update on table "public"."dynamic_group_releases" to "anon";

grant delete on table "public"."dynamic_group_releases" to "authenticated";
grant insert on table "public"."dynamic_group_releases" to "authenticated";
grant references on table "public"."dynamic_group_releases" to "authenticated";
grant select on table "public"."dynamic_group_releases" to "authenticated";
grant trigger on table "public"."dynamic_group_releases" to "authenticated";
grant truncate on table "public"."dynamic_group_releases" to "authenticated";
grant update on table "public"."dynamic_group_releases" to "authenticated";

grant delete on table "public"."dynamic_group_releases" to "postgres";
grant insert on table "public"."dynamic_group_releases" to "postgres";
grant references on table "public"."dynamic_group_releases" to "postgres";
grant select on table "public"."dynamic_group_releases" to "postgres";
grant trigger on table "public"."dynamic_group_releases" to "postgres";
grant truncate on table "public"."dynamic_group_releases" to "postgres";
grant update on table "public"."dynamic_group_releases" to "postgres";

grant delete on table "public"."dynamic_group_releases" to "service_role";
grant insert on table "public"."dynamic_group_releases" to "service_role";
grant references on table "public"."dynamic_group_releases" to "service_role";
grant select on table "public"."dynamic_group_releases" to "service_role";
grant trigger on table "public"."dynamic_group_releases" to "service_role";
grant truncate on table "public"."dynamic_group_releases" to "service_role";
grant update on table "public"."dynamic_group_releases" to "service_role";
