"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type PropsWithChildren } from "react";
import { ApiError } from "./call";

export function QueryProvider({ children }: PropsWithChildren) {
    const [client] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                // Fresh on mount, on window focus and after the user's own mutations; no polling.
                staleTime: 30_000,
                refetchOnWindowFocus: true,
                retry: (failureCount, error) =>
                    failureCount < 2 && !(error instanceof ApiError && error.status < 500),
            },
        },
    }));
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
