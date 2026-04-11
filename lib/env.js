import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({

  /*
   * Serverside Environment variables, not available on the client.
   * Will throw if you access these variables on the client.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    CONVEX_URL: z.url().optional(),
    CONVEX_SITE_INTERNAL_URL: z.url().optional(),
    VERCEL_URL: z.url().optional(),
  },
  /*
   * Environment variables available on the client (and server).
   *
   * 💡 You'll get type errors if these are not prefixed with NEXT_PUBLIC_.
   */
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.url(),
    NEXT_PUBLIC_CONVEX_SITE_URL: z.url(),
    NEXT_PUBLIC_SITE_URL: z.url(),
    NEXT_PUBLIC_ALLOW_REGISTRATION: z.enum(["true", "false"]),
  },
  /*
   * Specify what values should be validated by your schemas above.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    CONVEX_URL: process.env.CONVEX_URL,
    CONVEX_SITE_INTERNAL_URL: process.env.CONVEX_SITE_INTERNAL_URL,

    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_ALLOW_REGISTRATION: process.env.NEXT_PUBLIC_ALLOW_REGISTRATION,
  },
  // Tell the library to skip validation if condition is true.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
