/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apps from "../apps.js";
import type * as auth from "../auth.js";
import type * as client from "../client.js";
import type * as clientUpdates from "../clientUpdates.js";
import type * as computers from "../computers.js";
import type * as crons from "../crons.js";
import type * as deviceAuth from "../deviceAuth.js";
import type * as enrollmentTokens from "../enrollmentTokens.js";
import type * as functions from "../functions.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as lib_aggregate_computerAggregate from "../lib/aggregate/computerAggregate.js";
import type * as lib_aggregate_installAggregate from "../lib/aggregate/installAggregate.js";
import type * as lib_dpop from "../lib/dpop.js";
import type * as lib_encoding from "../lib/encoding.js";
import type * as lib_groupRules from "../lib/groupRules.js";
import type * as lib_idNormalization from "../lib/idNormalization.js";
import type * as lib_jwt from "../lib/jwt.js";
import type * as lib_withAuth from "../lib/withAuth.js";
import type * as migrations from "../migrations.js";
import type * as staticGroups from "../staticGroups.js";
import type * as tasks from "../tasks.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apps: typeof apps;
  auth: typeof auth;
  client: typeof client;
  clientUpdates: typeof clientUpdates;
  computers: typeof computers;
  crons: typeof crons;
  deviceAuth: typeof deviceAuth;
  enrollmentTokens: typeof enrollmentTokens;
  functions: typeof functions;
  groups: typeof groups;
  http: typeof http;
  "lib/aggregate/computerAggregate": typeof lib_aggregate_computerAggregate;
  "lib/aggregate/installAggregate": typeof lib_aggregate_installAggregate;
  "lib/dpop": typeof lib_dpop;
  "lib/encoding": typeof lib_encoding;
  "lib/groupRules": typeof lib_groupRules;
  "lib/idNormalization": typeof lib_idNormalization;
  "lib/jwt": typeof lib_jwt;
  "lib/withAuth": typeof lib_withAuth;
  migrations: typeof migrations;
  staticGroups: typeof staticGroups;
  tasks: typeof tasks;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  installStatusAggregate: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"installStatusAggregate">;
  computerAggregate: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"computerAggregate">;
};
