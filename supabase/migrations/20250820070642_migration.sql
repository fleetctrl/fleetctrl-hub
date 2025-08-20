alter table "public"."computers" alter column "created_at" drop default;

alter table "public"."computers" alter column "last_connection" drop default;

alter table "public"."computers" alter column "last_connection" set data type timestamp with time zone using "last_connection"::timestamp with time zone;

drop trigger if exists "tr_check_filters" on "realtime"."subscription";

drop trigger if exists "enforce_bucket_name_length_trigger" on "storage"."buckets";

drop trigger if exists "objects_delete_delete_prefix" on "storage"."objects";

drop trigger if exists "objects_insert_create_prefix" on "storage"."objects";

drop trigger if exists "objects_update_create_prefix" on "storage"."objects";

drop trigger if exists "update_objects_updated_at" on "storage"."objects";

drop trigger if exists "prefixes_create_hierarchy" on "storage"."prefixes";

drop trigger if exists "prefixes_delete_hierarchy" on "storage"."prefixes";


