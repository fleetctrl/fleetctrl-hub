-- Client updates table for managing FleetCtrl client versions
create table "public"."client_updates" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "version" text not null,
    "storage_path" text not null,
    "storage_bucket" text not null default 'internal',
    "hash" text not null,
    "byte_size" bigint not null,
    "is_active" boolean not null default false,
    "notes" text
);

alter table "public"."client_updates" enable row level security;

CREATE UNIQUE INDEX client_updates_pkey ON public.client_updates USING btree (id);
CREATE UNIQUE INDEX client_updates_version_key ON public.client_updates USING btree (version);

alter table "public"."client_updates" add constraint "client_updates_pkey" PRIMARY KEY using index "client_updates_pkey";
alter table "public"."client_updates" add constraint "client_updates_version_key" UNIQUE using index "client_updates_version_key";

-- Only one version can be active at a time (partial unique index)
CREATE UNIQUE INDEX client_updates_single_active ON public.client_updates (is_active) WHERE is_active = true;

-- RLS policies for authenticated users (admin UI)
create policy "allow all for auth"
on "public"."client_updates"
as permissive
for all
to authenticated
using (true);

-- Grants
grant delete on table "public"."client_updates" to "anon";
grant insert on table "public"."client_updates" to "anon";
grant references on table "public"."client_updates" to "anon";
grant select on table "public"."client_updates" to "anon";
grant trigger on table "public"."client_updates" to "anon";
grant truncate on table "public"."client_updates" to "anon";
grant update on table "public"."client_updates" to "anon";

grant delete on table "public"."client_updates" to "authenticated";
grant insert on table "public"."client_updates" to "authenticated";
grant references on table "public"."client_updates" to "authenticated";
grant select on table "public"."client_updates" to "authenticated";
grant trigger on table "public"."client_updates" to "authenticated";
grant truncate on table "public"."client_updates" to "authenticated";
grant update on table "public"."client_updates" to "authenticated";

grant delete on table "public"."client_updates" to "service_role";
grant insert on table "public"."client_updates" to "service_role";
grant references on table "public"."client_updates" to "service_role";
grant select on table "public"."client_updates" to "service_role";
grant trigger on table "public"."client_updates" to "service_role";
grant truncate on table "public"."client_updates" to "service_role";
grant update on table "public"."client_updates" to "service_role";
