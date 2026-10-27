"use client";

import { hc, type InferRequestType } from "hono/client";
import { call } from "@/lib/api/call";
import { useApiMutation, useApiQuery, usePaginatedApiQuery } from "@/lib/api/hooks";
import type { AppsAdminRoutes } from "../server/admin.routes";

const client = hc<AppsAdminRoutes>("/api/admin/apps");

export const appKeys = {
    all: ["apps"] as const,
};

const page = ({ cursor, numItems }: { cursor?: string; numItems: number }) => ({ cursor, numItems: String(numItems) });

type CreateAppArgs = InferRequestType<typeof client.index.$post>["json"];
type ReleaseArgs = InferRequestType<(typeof client)[":id"]["releases"]["$post"]>["json"];

/** Every app with group and install counts (dashboard). */
export function useApps() {
    return useApiQuery([...appKeys.all, "list"], () => call(client.all.$get()));
}

export function useAppsPaginated(options: { initialNumItems: number }) {
    return usePaginatedApiQuery([...appKeys.all, "table"], (args) => call(client.table.$get({ query: page(args) })), options);
}

/** `null` when the app does not exist. */
export function useApp(id: string) {
    return useApiQuery([...appKeys.all, "detail", id], () => call(client[":id"].$get({ param: { id } })));
}

export function useReleasesPaginated(appId: string, options: { initialNumItems: number }) {
    return usePaginatedApiQuery(
        [...appKeys.all, "releases", appId],
        (args) => call(client[":id"].releases.$get({ param: { id: appId }, query: page(args) })),
        options,
    );
}

export function useInstallStatusSummary(appId: string) {
    return useApiQuery([...appKeys.all, "installs", appId, "summary"], () =>
        call(client[":id"].installs.summary.$get({ param: { id: appId } })));
}

export function useInstallStatusPaginated(appId: string, options: { initialNumItems: number }) {
    return usePaginatedApiQuery(
        [...appKeys.all, "installs", appId, "page"],
        (args) => call(client[":id"].installs.$get({ param: { id: appId }, query: page(args) })),
        options,
    );
}

export function useCreateApp() {
    return useApiMutation((args: CreateAppArgs) => call(client.index.$post({ json: args })));
}

export function useUpdateApp() {
    return useApiMutation(({ id, data }: { id: string; data: { display_name?: string; description?: string; publisher?: string } }) =>
        call(client[":id"].$patch({ param: { id }, json: data })));
}

export function useRemoveApp() {
    return useApiMutation(({ id }: { id: string }) => call(client[":id"].$delete({ param: { id } })));
}

export function useCreateRelease() {
    return useApiMutation(({ appId, ...json }: ReleaseArgs & { appId: string }) =>
        call(client[":id"].releases.$post({ param: { id: appId }, json })));
}

export function useUpdateRelease() {
    return useApiMutation(({ id, data }: { id: string; data: ReleaseArgs }) =>
        call(client.releases[":releaseId"].$patch({ param: { releaseId: id }, json: data })));
}

export function useDeleteRelease() {
    return useApiMutation(({ id }: { id: string }) => call(client.releases[":releaseId"].$delete({ param: { releaseId: id } })));
}

export function useRequestReinstall() {
    return useApiMutation(({ installId }: { installId: string }) =>
        call(client.installs[":installId"].reinstall.$post({ param: { installId } })));
}

export function useRequestReinstallForApp() {
    return useApiMutation(({ appId }: { appId: string }) => call(client[":id"].reinstall.$post({ param: { id: appId } })));
}
