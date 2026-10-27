import type { Job } from "@/server/cron";
import type { EventBus } from "@/server/events";
import { refreshAllDynamicGroups, refreshComputerMemberships } from "./membership";

export const groupsJobs: Job[] = [
    // Hourly, for time-based rules (olderThanDays, newerThanDays, ...) that no write triggers.
    { name: "dynamic-groups-refresh", schedule: "0 * * * *", run: (tx) => refreshAllDynamicGroups(tx) },
];

export function registerGroupsEventHandlers(events: EventBus) {
    events.on("computer.ruleFieldsChanged", async (tx, { computerId }) => {
        await refreshComputerMemberships(tx, computerId);
    });
}
