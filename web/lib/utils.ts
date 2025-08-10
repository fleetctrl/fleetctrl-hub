import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSupabaseUrl() {
  if (typeof window !== "undefined" && window.__ENV__) {
    return window.__ENV__.NEXT_PUBLIC_SUPABASE_URL;
  }
  // fallback pro SSR
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:8000";
}

export function getSupabaseAnonKey() {
  if (typeof window !== "undefined" && window.__ENV__) {
    return window.__ENV__.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  // fallback pro SSR
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "secret";
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars = getSupabaseUrl() && getSupabaseAnonKey();
