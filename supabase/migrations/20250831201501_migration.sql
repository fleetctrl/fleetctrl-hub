create extension if not exists "pgjwt" with schema "extensions";

create type "public"."refresh_token_status" as enum ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED');

create type "public"."task_status" as enum ('PENDING', 'SUCCESS', 'ERROR');

create type "public"."task_types" as enum ('SET_PASSWD', 'SET_NETWORK_STRING');


  create table "public"."computers" (
    "rustdesk_id" numeric,
    "name" character varying not null,
    "ip" character varying,
    "last_connection" timestamp with time zone default (now() AT TIME ZONE 'utc'::text),
    "os" character varying,
    "os_version" character varying,
    "created_at" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text),
    "login_user" character varying,
    "fingerprint_hash" text,
    "id" uuid not null default gen_random_uuid(),
    "jkt" text
      );


alter table "public"."computers" enable row level security;


  create table "public"."enrollment_tokens" (
    "created_at" timestamp with time zone not null default now(),
    "token" text not null,
    "remaining_uses" bigint not null,
    "disabled" boolean not null default false,
    "created_by" uuid,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone
      );


alter table "public"."enrollment_tokens" enable row level security;


  create table "public"."refresh_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "jkt" text,
    "created_at" timestamp with time zone not null default now(),
    "expires_at" timestamp with time zone not null,
    "last_used_at" timestamp with time zone,
    "computer_id" uuid not null,
    "status" refresh_token_status,
    "grace_until" timestamp with time zone,
    "token_hash" text
      );


alter table "public"."refresh_tokens" enable row level security;


  create table "public"."tasks" (
    "created_at" timestamp with time zone not null default now(),
    "task" task_types,
    "status" task_status not null default 'PENDING'::task_status,
    "error" character varying,
    "task_data" json,
    "id" uuid not null default gen_random_uuid(),
    "computer_id" uuid,
    "started_at" timestamp with time zone,
    "finish_at" timestamp with time zone
      );


alter table "public"."tasks" enable row level security;

CREATE UNIQUE INDEX computers_pkey ON public.computers USING btree (id);

CREATE INDEX computers_rustdesk_id_idx ON public.computers USING hash (rustdesk_id);

CREATE UNIQUE INDEX computers_rustdesk_id_key ON public.computers USING btree (rustdesk_id);

CREATE UNIQUE INDEX enrollment_tokens_pkey ON public.enrollment_tokens USING btree (token);

CREATE INDEX refresh_tokens_computer_id_idx ON public.refresh_tokens USING btree (computer_id);

CREATE UNIQUE INDEX refresh_tokens_pkey ON public.refresh_tokens USING btree (id);

CREATE UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id);

alter table "public"."computers" add constraint "computers_pkey" PRIMARY KEY using index "computers_pkey";

alter table "public"."enrollment_tokens" add constraint "enrollment_tokens_pkey" PRIMARY KEY using index "enrollment_tokens_pkey";

alter table "public"."refresh_tokens" add constraint "refresh_tokens_pkey" PRIMARY KEY using index "refresh_tokens_pkey";

alter table "public"."tasks" add constraint "tasks_pkey" PRIMARY KEY using index "tasks_pkey";

alter table "public"."computers" add constraint "computers_rustdesk_id_key" UNIQUE using index "computers_rustdesk_id_key";

alter table "public"."enrollment_tokens" add constraint "enrollment_tokens_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."enrollment_tokens" validate constraint "enrollment_tokens_created_by_fkey";

alter table "public"."refresh_tokens" add constraint "refresh_tokens_computer_id_fkey" FOREIGN KEY (computer_id) REFERENCES computers(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."refresh_tokens" validate constraint "refresh_tokens_computer_id_fkey";

alter table "public"."tasks" add constraint "tasks_computer_id_fkey" FOREIGN KEY (computer_id) REFERENCES computers(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."tasks" validate constraint "tasks_computer_id_fkey";

grant delete on table "public"."computers" to "anon";

grant insert on table "public"."computers" to "anon";

grant references on table "public"."computers" to "anon";

grant select on table "public"."computers" to "anon";

grant trigger on table "public"."computers" to "anon";

grant truncate on table "public"."computers" to "anon";

grant update on table "public"."computers" to "anon";

grant delete on table "public"."computers" to "authenticated";

grant insert on table "public"."computers" to "authenticated";

grant references on table "public"."computers" to "authenticated";

grant select on table "public"."computers" to "authenticated";

grant trigger on table "public"."computers" to "authenticated";

grant truncate on table "public"."computers" to "authenticated";

grant update on table "public"."computers" to "authenticated";

grant delete on table "public"."computers" to "postgres";

grant insert on table "public"."computers" to "postgres";

grant references on table "public"."computers" to "postgres";

grant select on table "public"."computers" to "postgres";

grant trigger on table "public"."computers" to "postgres";

grant truncate on table "public"."computers" to "postgres";

grant update on table "public"."computers" to "postgres";

grant delete on table "public"."computers" to "service_role";

grant insert on table "public"."computers" to "service_role";

grant references on table "public"."computers" to "service_role";

grant select on table "public"."computers" to "service_role";

grant trigger on table "public"."computers" to "service_role";

grant truncate on table "public"."computers" to "service_role";

grant update on table "public"."computers" to "service_role";

grant delete on table "public"."enrollment_tokens" to "anon";

grant insert on table "public"."enrollment_tokens" to "anon";

grant references on table "public"."enrollment_tokens" to "anon";

grant select on table "public"."enrollment_tokens" to "anon";

grant trigger on table "public"."enrollment_tokens" to "anon";

grant truncate on table "public"."enrollment_tokens" to "anon";

grant update on table "public"."enrollment_tokens" to "anon";

grant delete on table "public"."enrollment_tokens" to "authenticated";

grant insert on table "public"."enrollment_tokens" to "authenticated";

grant references on table "public"."enrollment_tokens" to "authenticated";

grant select on table "public"."enrollment_tokens" to "authenticated";

grant trigger on table "public"."enrollment_tokens" to "authenticated";

grant truncate on table "public"."enrollment_tokens" to "authenticated";

grant update on table "public"."enrollment_tokens" to "authenticated";

grant delete on table "public"."enrollment_tokens" to "postgres";

grant insert on table "public"."enrollment_tokens" to "postgres";

grant references on table "public"."enrollment_tokens" to "postgres";

grant select on table "public"."enrollment_tokens" to "postgres";

grant trigger on table "public"."enrollment_tokens" to "postgres";

grant truncate on table "public"."enrollment_tokens" to "postgres";

grant update on table "public"."enrollment_tokens" to "postgres";

grant delete on table "public"."enrollment_tokens" to "service_role";

grant insert on table "public"."enrollment_tokens" to "service_role";

grant references on table "public"."enrollment_tokens" to "service_role";

grant select on table "public"."enrollment_tokens" to "service_role";

grant trigger on table "public"."enrollment_tokens" to "service_role";

grant truncate on table "public"."enrollment_tokens" to "service_role";

grant update on table "public"."enrollment_tokens" to "service_role";

grant delete on table "public"."refresh_tokens" to "anon";

grant insert on table "public"."refresh_tokens" to "anon";

grant references on table "public"."refresh_tokens" to "anon";

grant select on table "public"."refresh_tokens" to "anon";

grant trigger on table "public"."refresh_tokens" to "anon";

grant truncate on table "public"."refresh_tokens" to "anon";

grant update on table "public"."refresh_tokens" to "anon";

grant delete on table "public"."refresh_tokens" to "authenticated";

grant insert on table "public"."refresh_tokens" to "authenticated";

grant references on table "public"."refresh_tokens" to "authenticated";

grant select on table "public"."refresh_tokens" to "authenticated";

grant trigger on table "public"."refresh_tokens" to "authenticated";

grant truncate on table "public"."refresh_tokens" to "authenticated";

grant update on table "public"."refresh_tokens" to "authenticated";

grant delete on table "public"."refresh_tokens" to "postgres";

grant insert on table "public"."refresh_tokens" to "postgres";

grant references on table "public"."refresh_tokens" to "postgres";

grant select on table "public"."refresh_tokens" to "postgres";

grant trigger on table "public"."refresh_tokens" to "postgres";

grant truncate on table "public"."refresh_tokens" to "postgres";

grant update on table "public"."refresh_tokens" to "postgres";

grant delete on table "public"."refresh_tokens" to "service_role";

grant insert on table "public"."refresh_tokens" to "service_role";

grant references on table "public"."refresh_tokens" to "service_role";

grant select on table "public"."refresh_tokens" to "service_role";

grant trigger on table "public"."refresh_tokens" to "service_role";

grant truncate on table "public"."refresh_tokens" to "service_role";

grant update on table "public"."refresh_tokens" to "service_role";

grant delete on table "public"."tasks" to "anon";

grant insert on table "public"."tasks" to "anon";

grant references on table "public"."tasks" to "anon";

grant select on table "public"."tasks" to "anon";

grant trigger on table "public"."tasks" to "anon";

grant truncate on table "public"."tasks" to "anon";

grant update on table "public"."tasks" to "anon";

grant delete on table "public"."tasks" to "authenticated";

grant insert on table "public"."tasks" to "authenticated";

grant references on table "public"."tasks" to "authenticated";

grant select on table "public"."tasks" to "authenticated";

grant trigger on table "public"."tasks" to "authenticated";

grant truncate on table "public"."tasks" to "authenticated";

grant update on table "public"."tasks" to "authenticated";

grant delete on table "public"."tasks" to "service_role";

grant insert on table "public"."tasks" to "service_role";

grant references on table "public"."tasks" to "service_role";

grant select on table "public"."tasks" to "service_role";

grant trigger on table "public"."tasks" to "service_role";

grant truncate on table "public"."tasks" to "service_role";

grant update on table "public"."tasks" to "service_role";


  create policy "Allow authenticated to insert"
  on "public"."tasks"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Enable select for authenticated"
  on "public"."tasks"
  as permissive
  for select
  to authenticated
using (true);


drop trigger if exists "tr_check_filters" on "realtime"."subscription";

drop trigger if exists "enforce_bucket_name_length_trigger" on "storage"."buckets";

drop trigger if exists "objects_delete_delete_prefix" on "storage"."objects";

drop trigger if exists "objects_insert_create_prefix" on "storage"."objects";

drop trigger if exists "objects_update_create_prefix" on "storage"."objects";

drop trigger if exists "update_objects_updated_at" on "storage"."objects";

drop trigger if exists "prefixes_create_hierarchy" on "storage"."prefixes";

drop trigger if exists "prefixes_delete_hierarchy" on "storage"."prefixes";


