alter type "public"."task types" rename to "task types__old_version_to_be_dropped";

create type "public"."task types" as enum ('SET_PASSWD', 'SET_NETWORK_STRING');

alter table "public"."tasks" alter column task type "public"."task types" using task::text::"public"."task types";

drop type "public"."task types__old_version_to_be_dropped";


