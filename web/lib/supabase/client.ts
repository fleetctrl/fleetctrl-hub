import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "../utils";

export function createClient() {
  return createBrowserClient(getSupabaseUrl()!, getSupabaseAnonKey()!);
}
