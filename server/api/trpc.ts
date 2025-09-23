import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { env } from "@/lib/env";
import type { RequestCookies } from "next/dist/compiled/@edge-runtime/cookies";

type CookieStore = {
  getAll: () => ReturnType<RequestCookies["getAll"]>;
  set?: (name: string, value: string, options?: Parameters<RequestCookies["set"]>[2]) => void;
};

type CreateContextOptions = {
  headers: Headers;
  cookieStore: CookieStore;
};

export type TRPCContext = {
  supabase: SupabaseClient;
  user: User | null;
  headers: Headers;
};

export const createTRPCContext = async ({
  headers,
  cookieStore,
}: CreateContextOptions): Promise<TRPCContext> => {
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set?.(name, value, options);
            } catch {
              // Unable to set cookies in this environment (e.g. Server Component).
            }
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    supabase,
    user,
    headers,
  };
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});
