"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore, type PropsWithChildren } from "react";
import { useCurrentTime } from "@/hooks/use-current-time";
import { presenceEventSchema } from "../contract";
import { computerKeys, computersApiBase } from "./api";

/** A computer counts as online when it was seen within this window. */
export const ONLINE_WINDOW = 5 * 60 * 1000;

// Newest pushed `last_connection` per computer, shared by every component in the tab.
let latest = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function applyUpdates(updates: { id: string; lastConnection: number }[]) {
    const next = new Map(latest);
    for (const update of updates) {
        if ((next.get(update.id) ?? 0) < update.lastConnection) next.set(update.id, update.lastConnection);
    }
    latest = next;
    for (const listener of listeners) listener();
}

/**
 * Opens one EventSource per tab to `GET /admin/computers/presence`. Every (re)connect and every
 * `resync` refetches computer queries, so updates missed while disconnected are not lost.
 */
export function ComputerPresenceProvider({ children }: PropsWithChildren) {
    const queryClient = useQueryClient();
    useEffect(() => {
        const source = new EventSource(`${computersApiBase}/presence`);
        const resync = () => void queryClient.invalidateQueries({ queryKey: computerKeys.all });
        source.addEventListener("open", resync);
        source.addEventListener("resync", resync);
        source.addEventListener("presence", (event) => {
            try {
                const parsed = presenceEventSchema.safeParse(JSON.parse(event.data));
                if (parsed.success) applyUpdates(parsed.data);
            } catch {
                // malformed event; the next refetch corrects the state
            }
        });
        return () => source.close();
    }, [queryClient]);
    return children;
}

/** Newest pushed connection times, for components that summarize many computers. */
export function usePushedConnections(): ReadonlyMap<string, number> {
    return useSyncExternalStore(subscribe, () => latest, () => latest);
}

function newest(a: number | undefined, b: number | undefined) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return Math.max(a, b);
}

export function isOnline(lastConnection: number | undefined, now: number) {
    return lastConnection !== undefined && now - lastConnection < ONLINE_WINDOW;
}

/**
 * Online status from the newer of the queried and the pushed `lastConnection`. Going offline needs
 * no event: the 30 s clock tick ages the timestamp out.
 */
export function useComputerStatus(id: string, queriedLastConnection: number | undefined) {
    const pushed = useSyncExternalStore(subscribe, () => latest.get(id), () => undefined);
    const now = useCurrentTime();
    const lastConnection = newest(pushed, queriedLastConnection);
    return { lastConnection, isOnline: isOnline(lastConnection, now) };
}

/** Number of online computers among `computers`, live. */
export function useOnlineCount(computers: { id: string; lastConnection?: number }[]) {
    const pushed = usePushedConnections();
    const now = useCurrentTime();
    return computers.filter((computer) => isOnline(newest(pushed.get(computer.id), computer.lastConnection), now)).length;
}
