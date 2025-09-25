import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { env } from "./env";
import { createHash } from "crypto";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY;


export const generateKey = () => {
  // generate random 32 char
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(32).padStart(2, "0"))
    .join("");
}

export function b64urlSHA256(input: string): string {
  const hash = createHash("sha256")
    .update(input)
    .digest("base64");

  // převod na base64url
  return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

