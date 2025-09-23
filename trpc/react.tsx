"use client";

import { httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import superjson from "superjson";
import type { AppRouter } from "@/server/api/root";

export const api = createTRPCReact<AppRouter>();

export function TRPCReactProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    api.createClient({
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
        httpBatchLink({
          url: "/api/trpc",
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: "include",
            });
          },
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </api.Provider>
    </QueryClientProvider>
  );
}
