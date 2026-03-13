/**
 * Install Status Aggregate
 *
 * Tracks denormalized counts of computer_release_installs per (app, status).
 * Namespace: [appId, status] — enables O(log n) count queries per app per status.
 *
 * Usage:
 *   await installStatusAggregate.count(ctx, { namespace: [appId, "INSTALLED"] })
 */

import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import { Id } from "../_generated/dataModel";

export type InstallStatus =
    | "PENDING"
    | "INSTALLING"
    | "INSTALLED"
    | "ERROR"
    | "UNINSTALLED";

export const INSTALL_STATUSES: InstallStatus[] = [
    "PENDING",
    "INSTALLING",
    "INSTALLED",
    "ERROR",
    "UNINSTALLED",
];

export const installStatusAggregate = new DirectAggregate<{
    Namespace: [Id<"apps">, InstallStatus];
    Key: null;
    Id: string;
}>(components.installStatusAggregate);
