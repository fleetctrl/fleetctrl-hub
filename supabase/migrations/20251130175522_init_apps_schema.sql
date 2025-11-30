create type "public"."assign_app_type" as enum ('include', 'exclude');

create type "public"."assignment_action" as enum ('install', 'uninstall');

create type "public"."detection_type" as enum ('file', 'registry');

create type "public"."installer_type" as enum ('winget', 'win32');

create type "public"."script_engine" as enum ('cmd', 'powershell');

create type "public"."script_phase" as enum ('pre', 'post');

drop policy "Allow select for authenticated" on "public"."enrollment_tokens";

drop policy "allow authenticated to delete" on "public"."enrollment_tokens";

drop policy "authenticated can insert" on "public"."enrollment_tokens";

    create table "public"."apps" (
        "id" uuid not null default gen_random_uuid(),
        "display_name" text not null,
        "created_at" timestamp with time zone not null default now(),
        "updated_at" timestamp with time zone not null default now(),
        "description" text,
        "publisher" text not null default ''::text,
        "allow_multiple_versions" boolean not null default false,
        "auto_update" boolean not null default false
        );

alter table "public"."apps" enable row level security;

    create table "public"."computer_group_releases" (
    "created_at" timestamp with time zone not null default now(),
    "release_id" uuid not null,
    "group_id" uuid not null,
    "id" uuid not null default gen_random_uuid(),
    "assign_type" assign_app_type not null default 'include'::assign_app_type,
    "action" assignment_action not null
      );

alter table "public"."computer_group_releases" enable row level security;

    create table "public"."detection_rules" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamp with time zone not null default now(),
        "updated_at" timestamp with time zone not null default now(),
        "release_id" uuid not null default gen_random_uuid(),
        "config" jsonb not null,
        "type" detection_type not null
        );

alter table "public"."detection_rules" enable row level security;

    create table "public"."release_requirements" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "release_id" uuid not null default gen_random_uuid(),
    "timeout_seconds" bigint not null default '60'::bigint,
    "run_as_system" boolean not null,
    "storage_path" text not null,
    "hash" text not null,
    "bucket" text not null,
    "byte_size" bigint
      );

alter table "public"."release_requirements" enable row level security;

    create table "public"."release_scripts" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "release_id" uuid,
    "phase" script_phase not null,
    "timeout_seconds" integer not null,
    "run_as_system" boolean not null,
    "storage_path" text,
    "engine" script_engine not null,
    "hash" text not null
      );

alter table "public"."release_scripts" enable row level security;

    create table "public"."releases" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now(),
    "version" text not null,
    "installer_type" installer_type not null,
    "app_id" uuid not null,
    "disabled_at" timestamp with time zone,
    "uninstall_previous" boolean not null default false
      );

alter table "public"."releases" enable row level security;

    create table "public"."win32_releases" (
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp without time zone not null default now(),
    "release_id" uuid not null,
    "install_binary_path" text not null,
    "hash" text not null,
    "install_script" text not null,
    "uninstall_script" text not null,
    "install_binary_size" bigint,
    "id" uuid not null default gen_random_uuid(),
    "install_binary_bucket" text not null
      );

alter table "public"."win32_releases" enable row level security;

    create table "public"."winget_releases" (
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp without time zone not null default now(),
    "release_id" uuid not null,
    "winget_id" text not null,
    "id" uuid not null default gen_random_uuid()
      );

alter table "public"."winget_releases" enable row level security;

CREATE UNIQUE INDEX apps_pkey ON public.apps USING btree (id);

CREATE UNIQUE INDEX computer_group_app_unique ON public.computer_group_releases USING btree (release_id, group_id);

CREATE UNIQUE INDEX computer_group_apps_pkey ON public.computer_group_releases USING btree (id);

CREATE UNIQUE INDEX detection_rules_pkey ON public.detection_rules USING btree (id);

CREATE UNIQUE INDEX package_scripts_pkey ON public.release_scripts USING btree (id);

CREATE UNIQUE INDEX release_requirements_pkey ON public.release_requirements USING btree (id);

CREATE UNIQUE INDEX releases_pkey ON public.releases USING btree (id);

CREATE UNIQUE INDEX releases_unique_app_version ON public.releases USING btree (app_id, version);

CREATE UNIQUE INDEX win32_releases_pkey ON public.win32_releases USING btree (id);

CREATE UNIQUE INDEX win32_releases_release_id_key ON public.win32_releases USING btree (release_id);

CREATE UNIQUE INDEX win32_releases_release_id_key1 ON public.win32_releases USING btree (release_id);

CREATE UNIQUE INDEX winget_releases_pkey ON public.winget_releases USING btree (id);

CREATE UNIQUE INDEX winget_releases_release_id_key ON public.winget_releases USING btree (release_id);

alter table "public"."apps" add constraint "apps_pkey" PRIMARY KEY using index "apps_pkey";

alter table "public"."computer_group_releases" add constraint "computer_group_apps_pkey" PRIMARY KEY using index "computer_group_apps_pkey";

alter table "public"."detection_rules" add constraint "detection_rules_pkey" PRIMARY KEY using index "detection_rules_pkey";

alter table "public"."release_requirements" add constraint "release_requirements_pkey" PRIMARY KEY using index "release_requirements_pkey";

alter table "public"."release_scripts" add constraint "package_scripts_pkey" PRIMARY KEY using index "package_scripts_pkey";

alter table "public"."releases" add constraint "releases_pkey" PRIMARY KEY using index "releases_pkey";

alter table "public"."win32_releases" add constraint "win32_releases_pkey" PRIMARY KEY using index "win32_releases_pkey";

alter table "public"."winget_releases" add constraint "winget_releases_pkey" PRIMARY KEY using index "winget_releases_pkey";

alter table "public"."computer_group_releases" add constraint "computer_group_app_unique" UNIQUE using index "computer_group_app_unique";

alter table "public"."computer_group_releases" add constraint "computer_group_apps_group_id_fkey" FOREIGN KEY (group_id) REFERENCES computer_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."computer_group_releases" validate constraint "computer_group_apps_group_id_fkey";

alter table "public"."computer_group_releases" add constraint "computer_group_releases_release_id_fkey" FOREIGN KEY (release_id) REFERENCES releases(id) not valid;

alter table "public"."computer_group_releases" validate constraint "computer_group_releases_release_id_fkey";

alter table "public"."detection_rules" add constraint "detection_rules_release_id_fkey" FOREIGN KEY (release_id) REFERENCES releases(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."detection_rules" validate constraint "detection_rules_release_id_fkey";

alter table "public"."release_requirements" add constraint "release_requirements_release_id_fkey" FOREIGN KEY (release_id) REFERENCES releases(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."release_requirements" validate constraint "release_requirements_release_id_fkey";

alter table "public"."release_scripts" add constraint "release_scripts_release_id_fkey" FOREIGN KEY (release_id) REFERENCES releases(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."release_scripts" validate constraint "release_scripts_release_id_fkey";

alter table "public"."releases" add constraint "releases_app_id_fkey" FOREIGN KEY (app_id) REFERENCES apps(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."releases" validate constraint "releases_app_id_fkey";

alter table "public"."releases" add constraint "releases_unique_app_version" UNIQUE using index "releases_unique_app_version";

alter table "public"."win32_releases" add constraint "win32_releases_release_id_fkey" FOREIGN KEY (release_id) REFERENCES releases(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."win32_releases" validate constraint "win32_releases_release_id_fkey";

alter table "public"."win32_releases" add constraint "win32_releases_release_id_key" UNIQUE using index "win32_releases_release_id_key";

alter table "public"."win32_releases" add constraint "win32_releases_release_id_key1" UNIQUE using index "win32_releases_release_id_key1";

alter table "public"."winget_releases" add constraint "winget_releases_release_id_fkey" FOREIGN KEY (release_id) REFERENCES releases(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."winget_releases" validate constraint "winget_releases_release_id_fkey";

alter table "public"."winget_releases" add constraint "winget_releases_release_id_key" UNIQUE using index "winget_releases_release_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.enforce_auto_update_switch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
DECLARE
    link_count INT;
BEGIN
    -- zajímá nás jen situace, kdy se přepíná z false -> true
    IF NEW.auto_update = TRUE AND OLD.auto_update = FALSE THEN
        SELECT COUNT(*) INTO link_count
        FROM releases
        WHERE app_id = NEW.id;

        IF link_count > 1 THEN
            RAISE EXCEPTION
                'Aplikace (%) už má % napojení. Nelze zapnout auto_update, pokud existuje víc než jedno.',
                NEW.id, link_count;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_single_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
DECLARE
    is_auto BOOLEAN;
    link_count INT;
BEGIN
    -- zjistíme, jestli je app auto-update
    SELECT auto_update INTO is_auto FROM apps WHERE id = NEW.app_id;

    IF is_auto THEN
        -- spočítáme existující linky
        SELECT COUNT(*) INTO link_count
        FROM releases
        WHERE app_id = NEW.app_id;

        -- pokud už existuje jeden, smůla
        IF link_count >= 1 THEN
            RAISE EXCEPTION 'Auto-update aplikace (%) může mít pouze jedno napojení', NEW.app_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

grant delete on table "public"."apps" to "anon";

grant insert on table "public"."apps" to "anon";

grant references on table "public"."apps" to "anon";

grant select on table "public"."apps" to "anon";

grant trigger on table "public"."apps" to "anon";

grant truncate on table "public"."apps" to "anon";

grant update on table "public"."apps" to "anon";

grant delete on table "public"."apps" to "authenticated";

grant insert on table "public"."apps" to "authenticated";

grant references on table "public"."apps" to "authenticated";

grant select on table "public"."apps" to "authenticated";

grant trigger on table "public"."apps" to "authenticated";

grant truncate on table "public"."apps" to "authenticated";

grant update on table "public"."apps" to "authenticated";

grant delete on table "public"."apps" to "postgres";

grant insert on table "public"."apps" to "postgres";

grant references on table "public"."apps" to "postgres";

grant select on table "public"."apps" to "postgres";

grant trigger on table "public"."apps" to "postgres";

grant truncate on table "public"."apps" to "postgres";

grant update on table "public"."apps" to "postgres";

grant delete on table "public"."apps" to "service_role";

grant insert on table "public"."apps" to "service_role";

grant references on table "public"."apps" to "service_role";

grant select on table "public"."apps" to "service_role";

grant trigger on table "public"."apps" to "service_role";

grant truncate on table "public"."apps" to "service_role";

grant update on table "public"."apps" to "service_role";

grant delete on table "public"."computer_group_members" to "postgres";

grant insert on table "public"."computer_group_members" to "postgres";

grant references on table "public"."computer_group_members" to "postgres";

grant select on table "public"."computer_group_members" to "postgres";

grant trigger on table "public"."computer_group_members" to "postgres";

grant truncate on table "public"."computer_group_members" to "postgres";

grant update on table "public"."computer_group_members" to "postgres";

grant delete on table "public"."computer_group_releases" to "anon";

grant insert on table "public"."computer_group_releases" to "anon";

grant references on table "public"."computer_group_releases" to "anon";

grant select on table "public"."computer_group_releases" to "anon";

grant trigger on table "public"."computer_group_releases" to "anon";

grant truncate on table "public"."computer_group_releases" to "anon";

grant update on table "public"."computer_group_releases" to "anon";

grant delete on table "public"."computer_group_releases" to "authenticated";

grant insert on table "public"."computer_group_releases" to "authenticated";

grant references on table "public"."computer_group_releases" to "authenticated";

grant select on table "public"."computer_group_releases" to "authenticated";

grant trigger on table "public"."computer_group_releases" to "authenticated";

grant truncate on table "public"."computer_group_releases" to "authenticated";

grant update on table "public"."computer_group_releases" to "authenticated";

grant delete on table "public"."computer_group_releases" to "postgres";

grant insert on table "public"."computer_group_releases" to "postgres";

grant references on table "public"."computer_group_releases" to "postgres";

grant select on table "public"."computer_group_releases" to "postgres";

grant trigger on table "public"."computer_group_releases" to "postgres";

grant truncate on table "public"."computer_group_releases" to "postgres";

grant update on table "public"."computer_group_releases" to "postgres";

grant delete on table "public"."computer_group_releases" to "service_role";

grant insert on table "public"."computer_group_releases" to "service_role";

grant references on table "public"."computer_group_releases" to "service_role";

grant select on table "public"."computer_group_releases" to "service_role";

grant trigger on table "public"."computer_group_releases" to "service_role";

grant truncate on table "public"."computer_group_releases" to "service_role";

grant update on table "public"."computer_group_releases" to "service_role";

grant delete on table "public"."computer_groups" to "postgres";

grant insert on table "public"."computer_groups" to "postgres";

grant references on table "public"."computer_groups" to "postgres";

grant select on table "public"."computer_groups" to "postgres";

grant trigger on table "public"."computer_groups" to "postgres";

grant truncate on table "public"."computer_groups" to "postgres";

grant update on table "public"."computer_groups" to "postgres";

grant delete on table "public"."detection_rules" to "anon";

grant insert on table "public"."detection_rules" to "anon";

grant references on table "public"."detection_rules" to "anon";

grant select on table "public"."detection_rules" to "anon";

grant trigger on table "public"."detection_rules" to "anon";

grant truncate on table "public"."detection_rules" to "anon";

grant update on table "public"."detection_rules" to "anon";

grant delete on table "public"."detection_rules" to "authenticated";

grant insert on table "public"."detection_rules" to "authenticated";

grant references on table "public"."detection_rules" to "authenticated";

grant select on table "public"."detection_rules" to "authenticated";

grant trigger on table "public"."detection_rules" to "authenticated";

grant truncate on table "public"."detection_rules" to "authenticated";

grant update on table "public"."detection_rules" to "authenticated";

grant delete on table "public"."detection_rules" to "postgres";

grant insert on table "public"."detection_rules" to "postgres";

grant references on table "public"."detection_rules" to "postgres";

grant select on table "public"."detection_rules" to "postgres";

grant trigger on table "public"."detection_rules" to "postgres";

grant truncate on table "public"."detection_rules" to "postgres";

grant update on table "public"."detection_rules" to "postgres";

grant delete on table "public"."detection_rules" to "service_role";

grant insert on table "public"."detection_rules" to "service_role";

grant references on table "public"."detection_rules" to "service_role";

grant select on table "public"."detection_rules" to "service_role";

grant trigger on table "public"."detection_rules" to "service_role";

grant truncate on table "public"."detection_rules" to "service_role";

grant update on table "public"."detection_rules" to "service_role";

grant delete on table "public"."release_requirements" to "anon";

grant insert on table "public"."release_requirements" to "anon";

grant references on table "public"."release_requirements" to "anon";

grant select on table "public"."release_requirements" to "anon";

grant trigger on table "public"."release_requirements" to "anon";

grant truncate on table "public"."release_requirements" to "anon";

grant update on table "public"."release_requirements" to "anon";

grant delete on table "public"."release_requirements" to "authenticated";

grant insert on table "public"."release_requirements" to "authenticated";

grant references on table "public"."release_requirements" to "authenticated";

grant select on table "public"."release_requirements" to "authenticated";

grant trigger on table "public"."release_requirements" to "authenticated";

grant truncate on table "public"."release_requirements" to "authenticated";

grant update on table "public"."release_requirements" to "authenticated";

grant delete on table "public"."release_requirements" to "postgres";

grant insert on table "public"."release_requirements" to "postgres";

grant references on table "public"."release_requirements" to "postgres";

grant select on table "public"."release_requirements" to "postgres";

grant trigger on table "public"."release_requirements" to "postgres";

grant truncate on table "public"."release_requirements" to "postgres";

grant update on table "public"."release_requirements" to "postgres";

grant delete on table "public"."release_requirements" to "service_role";

grant insert on table "public"."release_requirements" to "service_role";

grant references on table "public"."release_requirements" to "service_role";

grant select on table "public"."release_requirements" to "service_role";

grant trigger on table "public"."release_requirements" to "service_role";

grant truncate on table "public"."release_requirements" to "service_role";

grant update on table "public"."release_requirements" to "service_role";

grant delete on table "public"."release_scripts" to "anon";

grant insert on table "public"."release_scripts" to "anon";

grant references on table "public"."release_scripts" to "anon";

grant select on table "public"."release_scripts" to "anon";

grant trigger on table "public"."release_scripts" to "anon";

grant truncate on table "public"."release_scripts" to "anon";

grant update on table "public"."release_scripts" to "anon";

grant delete on table "public"."release_scripts" to "authenticated";

grant insert on table "public"."release_scripts" to "authenticated";

grant references on table "public"."release_scripts" to "authenticated";

grant select on table "public"."release_scripts" to "authenticated";

grant trigger on table "public"."release_scripts" to "authenticated";

grant truncate on table "public"."release_scripts" to "authenticated";

grant update on table "public"."release_scripts" to "authenticated";

grant delete on table "public"."release_scripts" to "postgres";

grant insert on table "public"."release_scripts" to "postgres";

grant references on table "public"."release_scripts" to "postgres";

grant select on table "public"."release_scripts" to "postgres";

grant trigger on table "public"."release_scripts" to "postgres";

grant truncate on table "public"."release_scripts" to "postgres";

grant update on table "public"."release_scripts" to "postgres";

grant delete on table "public"."release_scripts" to "service_role";

grant insert on table "public"."release_scripts" to "service_role";

grant references on table "public"."release_scripts" to "service_role";

grant select on table "public"."release_scripts" to "service_role";

grant trigger on table "public"."release_scripts" to "service_role";

grant truncate on table "public"."release_scripts" to "service_role";

grant update on table "public"."release_scripts" to "service_role";

grant delete on table "public"."releases" to "anon";

grant insert on table "public"."releases" to "anon";

grant references on table "public"."releases" to "anon";

grant select on table "public"."releases" to "anon";

grant trigger on table "public"."releases" to "anon";

grant truncate on table "public"."releases" to "anon";

grant update on table "public"."releases" to "anon";

grant delete on table "public"."releases" to "authenticated";

grant insert on table "public"."releases" to "authenticated";

grant references on table "public"."releases" to "authenticated";

grant select on table "public"."releases" to "authenticated";

grant trigger on table "public"."releases" to "authenticated";

grant truncate on table "public"."releases" to "authenticated";

grant update on table "public"."releases" to "authenticated";

grant delete on table "public"."releases" to "postgres";

grant insert on table "public"."releases" to "postgres";

grant references on table "public"."releases" to "postgres";

grant select on table "public"."releases" to "postgres";

grant trigger on table "public"."releases" to "postgres";

grant truncate on table "public"."releases" to "postgres";

grant update on table "public"."releases" to "postgres";

grant delete on table "public"."releases" to "service_role";

grant insert on table "public"."releases" to "service_role";

grant references on table "public"."releases" to "service_role";

grant select on table "public"."releases" to "service_role";

grant trigger on table "public"."releases" to "service_role";

grant truncate on table "public"."releases" to "service_role";

grant update on table "public"."releases" to "service_role";

grant delete on table "public"."win32_releases" to "anon";

grant insert on table "public"."win32_releases" to "anon";

grant references on table "public"."win32_releases" to "anon";

grant select on table "public"."win32_releases" to "anon";

grant trigger on table "public"."win32_releases" to "anon";

grant truncate on table "public"."win32_releases" to "anon";

grant update on table "public"."win32_releases" to "anon";

grant delete on table "public"."win32_releases" to "authenticated";

grant insert on table "public"."win32_releases" to "authenticated";

grant references on table "public"."win32_releases" to "authenticated";

grant select on table "public"."win32_releases" to "authenticated";

grant trigger on table "public"."win32_releases" to "authenticated";

grant truncate on table "public"."win32_releases" to "authenticated";

grant update on table "public"."win32_releases" to "authenticated";

grant delete on table "public"."win32_releases" to "postgres";

grant insert on table "public"."win32_releases" to "postgres";

grant references on table "public"."win32_releases" to "postgres";

grant select on table "public"."win32_releases" to "postgres";

grant trigger on table "public"."win32_releases" to "postgres";

grant truncate on table "public"."win32_releases" to "postgres";

grant update on table "public"."win32_releases" to "postgres";

grant delete on table "public"."win32_releases" to "service_role";

grant insert on table "public"."win32_releases" to "service_role";

grant references on table "public"."win32_releases" to "service_role";

grant select on table "public"."win32_releases" to "service_role";

grant trigger on table "public"."win32_releases" to "service_role";

grant truncate on table "public"."win32_releases" to "service_role";

grant update on table "public"."win32_releases" to "service_role";

grant delete on table "public"."winget_releases" to "anon";

grant insert on table "public"."winget_releases" to "anon";

grant references on table "public"."winget_releases" to "anon";

grant select on table "public"."winget_releases" to "anon";

grant trigger on table "public"."winget_releases" to "anon";

grant truncate on table "public"."winget_releases" to "anon";

grant update on table "public"."winget_releases" to "anon";

grant delete on table "public"."winget_releases" to "authenticated";

grant insert on table "public"."winget_releases" to "authenticated";

grant references on table "public"."winget_releases" to "authenticated";

grant select on table "public"."winget_releases" to "authenticated";

grant trigger on table "public"."winget_releases" to "authenticated";

grant truncate on table "public"."winget_releases" to "authenticated";

grant update on table "public"."winget_releases" to "authenticated";

grant delete on table "public"."winget_releases" to "postgres";

grant insert on table "public"."winget_releases" to "postgres";

grant references on table "public"."winget_releases" to "postgres";

grant select on table "public"."winget_releases" to "postgres";

grant trigger on table "public"."winget_releases" to "postgres";

grant truncate on table "public"."winget_releases" to "postgres";

grant update on table "public"."winget_releases" to "postgres";

grant delete on table "public"."winget_releases" to "service_role";

grant insert on table "public"."winget_releases" to "service_role";

grant references on table "public"."winget_releases" to "service_role";

grant select on table "public"."winget_releases" to "service_role";

grant trigger on table "public"."winget_releases" to "service_role";

grant truncate on table "public"."winget_releases" to "service_role";

grant update on table "public"."winget_releases" to "service_role";


 create policy "allow all for auth"
  on "public"."apps"
  as permissive
  for all
  to public
using (true);



  create policy "allow all for auth"
  on "public"."computer_group_releases"
  as permissive
  for all
  to public
using (true);



  create policy "allow all to auth"
  on "public"."enrollment_tokens"
  as permissive
  for all
  to authenticated
using (true);

CREATE TRIGGER releases_enforce_auto_update_switch BEFORE UPDATE ON public.apps FOR EACH ROW EXECUTE FUNCTION enforce_auto_update_switch();

CREATE TRIGGER releases_enfoce_single_link_on_auto_update BEFORE INSERT ON public.releases FOR EACH ROW EXECUTE FUNCTION enforce_single_link();

drop policy "insert for auth" on "realtime"."messages";

drop policy "select for authenticated" on "realtime"."messages";

create policy "Enable insert for authenticated users only"
  on "storage"."buckets"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Allow authenticated upload to temp"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'internal'::text) AND ((storage.foldername(name))[1] = 'temp'::text)));

