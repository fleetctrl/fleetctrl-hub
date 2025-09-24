import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { createClient as createClientjs } from "@supabase/supabase-js";

export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function createSupabaseClient() {
  return createClientjs(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}