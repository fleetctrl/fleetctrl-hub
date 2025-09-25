create extension if not exists "pg_cron" with schema "pg_catalog";

CREATE INDEX refresh_tokens_token_hash_idx ON public.refresh_tokens USING hash (token_hash);

grant delete on table "public"."computers" to "postgres";

grant insert on table "public"."computers" to "postgres";

grant references on table "public"."computers" to "postgres";

grant select on table "public"."computers" to "postgres";

grant trigger on table "public"."computers" to "postgres";

grant truncate on table "public"."computers" to "postgres";

grant update on table "public"."computers" to "postgres";

grant delete on table "public"."enrollment_tokens" to "postgres";

grant insert on table "public"."enrollment_tokens" to "postgres";

grant references on table "public"."enrollment_tokens" to "postgres";

grant select on table "public"."enrollment_tokens" to "postgres";

grant trigger on table "public"."enrollment_tokens" to "postgres";

grant truncate on table "public"."enrollment_tokens" to "postgres";

grant update on table "public"."enrollment_tokens" to "postgres";

grant delete on table "public"."refresh_tokens" to "postgres";

grant insert on table "public"."refresh_tokens" to "postgres";

grant references on table "public"."refresh_tokens" to "postgres";

grant select on table "public"."refresh_tokens" to "postgres";

grant trigger on table "public"."refresh_tokens" to "postgres";

grant truncate on table "public"."refresh_tokens" to "postgres";

grant update on table "public"."refresh_tokens" to "postgres";

