import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { env } from "@/lib/env";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY;


const getCrypto = () => {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj) {
    throw new Error("Crypto API is unavailable in the current runtime");
  }
  return cryptoObj;
};

export const generateKey = () => {
  const cryptoObj = getCrypto();
  const array = new Uint8Array(32);
  cryptoObj.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(32).padStart(2, "0"))
    .join("");
};

export async function b64urlSHA256(input: string): Promise<string> {
  const cryptoObj = getCrypto();
  const data = new TextEncoder().encode(input);
  const hashBuffer = await cryptoObj.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
