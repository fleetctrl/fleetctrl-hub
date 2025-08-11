alter table "public"."tasks" drop constraint "tasks_pkey";

drop index if exists "public"."tasks_pkey";

alter table "public"."tasks" add column "uuid" uuid not null default gen_random_uuid();

CREATE UNIQUE INDEX tasks_uuid_key ON public.tasks USING btree (uuid);

CREATE UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id, uuid);

alter table "public"."tasks" add constraint "tasks_pkey" PRIMARY KEY using index "tasks_pkey";

alter table "public"."tasks" add constraint "tasks_uuid_key" UNIQUE using index "tasks_uuid_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.edit_task_status(in_uuid uuid, in_new_status "task status")
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    UPDATE public.tasks
    SET status = in_new_status
    WHERE uuid = in_uuid;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_computer_by_key(in_rustdesk_id numeric, in_key uuid)
 RETURNS record
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT *
FROM public.computers
WHERE computers.rustdesk_id = $1 AND computers.key = $2;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tasks_by_rustdesk_id(in_rustdesk_id integer, in_key uuid)
 RETURNS SETOF record
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$SELECT public.tasks.uuid,
  public.tasks.created_at, 
  public.tasks.status, 
  public.tasks.task,
  public.tasks.task_data

FROM public.tasks

INNER JOIN public.computers ON public.computers.id = public.tasks.computer_id

WHERE public.computers.rustdesk_id = $1 
  AND public.computers.key = $2
  AND public.tasks.status = 'PENDING';$function$
;

CREATE OR REPLACE FUNCTION public.is_computer_registered(in_rustdesk_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$SELECT EXISTS (

    SELECT 1 

    FROM public.computers 

    WHERE computers.rustdesk_id = $1

) AS exists_result;$function$
;

CREATE OR REPLACE FUNCTION public.register_computer(in_name character varying, in_rustdesk_id integer, in_key uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$WITH ins AS (
  INSERT INTO public.computers (name, rustdesk_id, key)
  VALUES ($1, $2, $3)
  RETURNING 1       
)
SELECT EXISTS (SELECT 1 FROM ins) AS success;$function$
;

CREATE OR REPLACE FUNCTION public.update_computer(in_name character varying, in_rustdesk_id integer, in_key uuid, in_ip character varying, in_os character varying, in_os_version character varying, in_login_user character varying, in_last_connection timestamp without time zone)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$WITH ins AS (
  UPDATE public.computers SET 
    name = in_name,
    ip = in_ip,
    os = in_os,
    os_version = in_os_version,
    login_user = in_login_user,
    last_connection = in_last_connection
  WHERE
    rustdesk_id = in_rustdesk_id
    AND key = in_key
  RETURNING 1 
)
SELECT EXISTS (SELECT 1 FROM ins) AS success;$function$
;

grant delete on table "public"."computers" to "postgres";

grant insert on table "public"."computers" to "postgres";

grant references on table "public"."computers" to "postgres";

grant select on table "public"."computers" to "postgres";

grant trigger on table "public"."computers" to "postgres";

grant truncate on table "public"."computers" to "postgres";

grant update on table "public"."computers" to "postgres";

grant delete on table "public"."tasks" to "postgres";

grant insert on table "public"."tasks" to "postgres";

grant references on table "public"."tasks" to "postgres";

grant select on table "public"."tasks" to "postgres";

grant trigger on table "public"."tasks" to "postgres";

grant truncate on table "public"."tasks" to "postgres";

grant update on table "public"."tasks" to "postgres";


