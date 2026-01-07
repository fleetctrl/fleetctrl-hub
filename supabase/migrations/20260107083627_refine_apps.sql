CREATE OR REPLACE FUNCTION public.enforce_auto_update_switch()
 RETURNS trigger
 LANGUAGE plpgsql
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

grant delete on table "public"."apps" to "postgres";

grant insert on table "public"."apps" to "postgres";

grant references on table "public"."apps" to "postgres";

grant select on table "public"."apps" to "postgres";

grant trigger on table "public"."apps" to "postgres";

grant truncate on table "public"."apps" to "postgres";

grant update on table "public"."apps" to "postgres";

grant delete on table "public"."computer_group_members" to "postgres";

grant insert on table "public"."computer_group_members" to "postgres";

grant references on table "public"."computer_group_members" to "postgres";

grant select on table "public"."computer_group_members" to "postgres";

grant trigger on table "public"."computer_group_members" to "postgres";

grant truncate on table "public"."computer_group_members" to "postgres";

grant update on table "public"."computer_group_members" to "postgres";

grant delete on table "public"."computer_group_releases" to "postgres";

grant insert on table "public"."computer_group_releases" to "postgres";

grant references on table "public"."computer_group_releases" to "postgres";

grant select on table "public"."computer_group_releases" to "postgres";

grant trigger on table "public"."computer_group_releases" to "postgres";

grant truncate on table "public"."computer_group_releases" to "postgres";

grant update on table "public"."computer_group_releases" to "postgres";

grant delete on table "public"."computer_groups" to "postgres";

grant insert on table "public"."computer_groups" to "postgres";

grant references on table "public"."computer_groups" to "postgres";

grant select on table "public"."computer_groups" to "postgres";

grant trigger on table "public"."computer_groups" to "postgres";

grant truncate on table "public"."computer_groups" to "postgres";

grant update on table "public"."computer_groups" to "postgres";

grant delete on table "public"."detection_rules" to "postgres";

grant insert on table "public"."detection_rules" to "postgres";

grant references on table "public"."detection_rules" to "postgres";

grant select on table "public"."detection_rules" to "postgres";

grant trigger on table "public"."detection_rules" to "postgres";

grant truncate on table "public"."detection_rules" to "postgres";

grant update on table "public"."detection_rules" to "postgres";

grant delete on table "public"."release_requirements" to "postgres";

grant insert on table "public"."release_requirements" to "postgres";

grant references on table "public"."release_requirements" to "postgres";

grant select on table "public"."release_requirements" to "postgres";

grant trigger on table "public"."release_requirements" to "postgres";

grant truncate on table "public"."release_requirements" to "postgres";

grant update on table "public"."release_requirements" to "postgres";

grant delete on table "public"."release_scripts" to "postgres";

grant insert on table "public"."release_scripts" to "postgres";

grant references on table "public"."release_scripts" to "postgres";

grant select on table "public"."release_scripts" to "postgres";

grant trigger on table "public"."release_scripts" to "postgres";

grant truncate on table "public"."release_scripts" to "postgres";

grant update on table "public"."release_scripts" to "postgres";

grant delete on table "public"."releases" to "postgres";

grant insert on table "public"."releases" to "postgres";

grant references on table "public"."releases" to "postgres";

grant select on table "public"."releases" to "postgres";

grant trigger on table "public"."releases" to "postgres";

grant truncate on table "public"."releases" to "postgres";

grant update on table "public"."releases" to "postgres";

grant delete on table "public"."win32_releases" to "postgres";

grant insert on table "public"."win32_releases" to "postgres";

grant references on table "public"."win32_releases" to "postgres";

grant select on table "public"."win32_releases" to "postgres";

grant trigger on table "public"."win32_releases" to "postgres";

grant truncate on table "public"."win32_releases" to "postgres";

grant update on table "public"."win32_releases" to "postgres";

grant delete on table "public"."winget_releases" to "postgres";

grant insert on table "public"."winget_releases" to "postgres";

grant references on table "public"."winget_releases" to "postgres";

grant select on table "public"."winget_releases" to "postgres";

grant trigger on table "public"."winget_releases" to "postgres";

grant truncate on table "public"."winget_releases" to "postgres";

grant update on table "public"."winget_releases" to "postgres";



drop policy "Allow authenticated upload to temp" on "storage"."objects";

drop policy "Authenticated can select from internal" on "storage"."objects";

drop policy "Authenticated can update in internal" on "storage"."objects";

drop policy "Authenticated can upload to internal" on "storage"."objects";