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
import type * as computers from "../computers.js";
import type * as crons from "../crons.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as lib_dpop from "../lib/dpop.js";
import type * as lib_jtiStore from "../lib/jtiStore.js";
import type * as lib_jwt from "../lib/jwt.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apps: typeof apps;
  auth: typeof auth;
  client: typeof client;
  computers: typeof computers;
  crons: typeof crons;
  groups: typeof groups;
  http: typeof http;
  "lib/dpop": typeof lib_dpop;
  "lib/jtiStore": typeof lib_jtiStore;
  "lib/jwt": typeof lib_jwt;
  tasks: typeof tasks;
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

export declare const components: {};
