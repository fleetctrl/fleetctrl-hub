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
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as lib_dpop from "../lib/dpop.js";
import type * as lib_encoding from "../lib/encoding.js";
import type * as lib_jtiStore from "../lib/jtiStore.js";
import type * as lib_jwt from "../lib/jwt.js";
import type * as lib_withAuth from "../lib/withAuth.js";
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
  groups: typeof groups;
  http: typeof http;
  "lib/dpop": typeof lib_dpop;
  "lib/encoding": typeof lib_encoding;
  "lib/jtiStore": typeof lib_jtiStore;
  "lib/jwt": typeof lib_jwt;
  "lib/withAuth": typeof lib_withAuth;
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
  betterAuth: {
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          input:
          | {
            data: {
              createdAt: number;
              email: string;
              emailVerified: boolean;
              image?: null | string;
              name: string;
              role?: null | string;
              updatedAt: number;
              userId?: null | string;
            };
            model: "user";
          }
          | {
            data: {
              createdAt: number;
              expiresAt: number;
              ipAddress?: null | string;
              token: string;
              updatedAt: number;
              userAgent?: null | string;
              userId: string;
            };
            model: "session";
          }
          | {
            data: {
              accessToken?: null | string;
              accessTokenExpiresAt?: null | number;
              accountId: string;
              createdAt: number;
              idToken?: null | string;
              password?: null | string;
              providerId: string;
              refreshToken?: null | string;
              refreshTokenExpiresAt?: null | number;
              scope?: null | string;
              updatedAt: number;
              userId: string;
            };
            model: "account";
          }
          | {
            data: {
              createdAt: number;
              expiresAt: number;
              identifier: string;
              updatedAt: number;
              value: string;
            };
            model: "verification";
          }
          | {
            data: {
              createdAt: number;
              expiresAt?: null | number;
              privateKey: string;
              publicKey: string;
            };
            model: "jwks";
          };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
          | {
            model: "user";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "name"
              | "email"
              | "emailVerified"
              | "image"
              | "createdAt"
              | "updatedAt"
              | "userId"
              | "role"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "session";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "expiresAt"
              | "token"
              | "createdAt"
              | "updatedAt"
              | "ipAddress"
              | "userAgent"
              | "userId"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "account";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "accountId"
              | "providerId"
              | "userId"
              | "accessToken"
              | "refreshToken"
              | "idToken"
              | "accessTokenExpiresAt"
              | "refreshTokenExpiresAt"
              | "scope"
              | "password"
              | "createdAt"
              | "updatedAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "verification";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "identifier"
              | "value"
              | "expiresAt"
              | "createdAt"
              | "updatedAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "jwks";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "publicKey"
              | "privateKey"
              | "createdAt"
              | "expiresAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
          | {
            model: "user";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "name"
              | "email"
              | "emailVerified"
              | "image"
              | "createdAt"
              | "updatedAt"
              | "userId"
              | "role"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "session";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "expiresAt"
              | "token"
              | "createdAt"
              | "updatedAt"
              | "ipAddress"
              | "userAgent"
              | "userId"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "account";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "accountId"
              | "providerId"
              | "userId"
              | "accessToken"
              | "refreshToken"
              | "idToken"
              | "accessTokenExpiresAt"
              | "refreshTokenExpiresAt"
              | "scope"
              | "password"
              | "createdAt"
              | "updatedAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "verification";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "identifier"
              | "value"
              | "expiresAt"
              | "createdAt"
              | "updatedAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "jwks";
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "publicKey"
              | "privateKey"
              | "createdAt"
              | "expiresAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          };
          onDeleteHandle?: string;
        },
        any
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          limit?: number;
          model: "user" | "session" | "account" | "verification" | "jwks";
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
            | "lt"
            | "lte"
            | "gt"
            | "gte"
            | "eq"
            | "in"
            | "not_in"
            | "ne"
            | "contains"
            | "starts_with"
            | "ends_with";
            value:
            | string
            | number
            | boolean
            | Array<string>
            | Array<number>
            | null;
          }>;
        },
        any
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          model: "user" | "session" | "account" | "verification" | "jwks";
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
            | "lt"
            | "lte"
            | "gt"
            | "gte"
            | "eq"
            | "in"
            | "not_in"
            | "ne"
            | "contains"
            | "starts_with"
            | "ends_with";
            value:
            | string
            | number
            | boolean
            | Array<string>
            | Array<number>
            | null;
          }>;
        },
        any
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
          | {
            model: "user";
            update: {
              createdAt?: number;
              email?: string;
              emailVerified?: boolean;
              image?: null | string;
              name?: string;
              role?: null | string;
              updatedAt?: number;
              userId?: null | string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "name"
              | "email"
              | "emailVerified"
              | "image"
              | "createdAt"
              | "updatedAt"
              | "userId"
              | "role"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "session";
            update: {
              createdAt?: number;
              expiresAt?: number;
              ipAddress?: null | string;
              token?: string;
              updatedAt?: number;
              userAgent?: null | string;
              userId?: string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "expiresAt"
              | "token"
              | "createdAt"
              | "updatedAt"
              | "ipAddress"
              | "userAgent"
              | "userId"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "account";
            update: {
              accessToken?: null | string;
              accessTokenExpiresAt?: null | number;
              accountId?: string;
              createdAt?: number;
              idToken?: null | string;
              password?: null | string;
              providerId?: string;
              refreshToken?: null | string;
              refreshTokenExpiresAt?: null | number;
              scope?: null | string;
              updatedAt?: number;
              userId?: string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "accountId"
              | "providerId"
              | "userId"
              | "accessToken"
              | "refreshToken"
              | "idToken"
              | "accessTokenExpiresAt"
              | "refreshTokenExpiresAt"
              | "scope"
              | "password"
              | "createdAt"
              | "updatedAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "verification";
            update: {
              createdAt?: number;
              expiresAt?: number;
              identifier?: string;
              updatedAt?: number;
              value?: string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "identifier"
              | "value"
              | "expiresAt"
              | "createdAt"
              | "updatedAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "jwks";
            update: {
              createdAt?: number;
              expiresAt?: null | number;
              privateKey?: string;
              publicKey?: string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "publicKey"
              | "privateKey"
              | "createdAt"
              | "expiresAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
          | {
            model: "user";
            update: {
              createdAt?: number;
              email?: string;
              emailVerified?: boolean;
              image?: null | string;
              name?: string;
              role?: null | string;
              updatedAt?: number;
              userId?: null | string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "name"
              | "email"
              | "emailVerified"
              | "image"
              | "createdAt"
              | "updatedAt"
              | "userId"
              | "role"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "session";
            update: {
              createdAt?: number;
              expiresAt?: number;
              ipAddress?: null | string;
              token?: string;
              updatedAt?: number;
              userAgent?: null | string;
              userId?: string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "expiresAt"
              | "token"
              | "createdAt"
              | "updatedAt"
              | "ipAddress"
              | "userAgent"
              | "userId"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "account";
            update: {
              accessToken?: null | string;
              accessTokenExpiresAt?: null | number;
              accountId?: string;
              createdAt?: number;
              idToken?: null | string;
              password?: null | string;
              providerId?: string;
              refreshToken?: null | string;
              refreshTokenExpiresAt?: null | number;
              scope?: null | string;
              updatedAt?: number;
              userId?: string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "accountId"
              | "providerId"
              | "userId"
              | "accessToken"
              | "refreshToken"
              | "idToken"
              | "accessTokenExpiresAt"
              | "refreshTokenExpiresAt"
              | "scope"
              | "password"
              | "createdAt"
              | "updatedAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "verification";
            update: {
              createdAt?: number;
              expiresAt?: number;
              identifier?: string;
              updatedAt?: number;
              value?: string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "identifier"
              | "value"
              | "expiresAt"
              | "createdAt"
              | "updatedAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          }
          | {
            model: "jwks";
            update: {
              createdAt?: number;
              expiresAt?: null | number;
              privateKey?: string;
              publicKey?: string;
            };
            where?: Array<{
              connector?: "AND" | "OR";
              field:
              | "publicKey"
              | "privateKey"
              | "createdAt"
              | "expiresAt"
              | "_id";
              operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
              value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
            }>;
          };
          onUpdateHandle?: string;
        },
        any
      >;
    };
  };
  installStatusAggregate: {
    btree: {
      aggregateBetween: FunctionReference<"query", "internal", { k1?: any; k2?: any; namespace?: any }, { count: number; sum: number }>;
      aggregateBetweenBatch: FunctionReference<"query", "internal", { queries: Array<{ k1?: any; k2?: any; namespace?: any }> }, Array<{ count: number; sum: number }>>;
      atNegativeOffset: FunctionReference<"query", "internal", { k1?: any; k2?: any; namespace?: any; offset: number }, { k: any; s: number; v: any }>;
      atOffset: FunctionReference<"query", "internal", { k1?: any; k2?: any; namespace?: any; offset: number }, { k: any; s: number; v: any }>;
      atOffsetBatch: FunctionReference<"query", "internal", { queries: Array<{ k1?: any; k2?: any; namespace?: any; offset: number }> }, Array<{ k: any; s: number; v: any }>>;
      get: FunctionReference<"query", "internal", { key: any; namespace?: any }, null | { k: any; s: number; v: any }>;
      offset: FunctionReference<"query", "internal", { k1?: any; key: any; namespace?: any }, number>;
      offsetUntil: FunctionReference<"query", "internal", { k2?: any; key: any; namespace?: any }, number>;
      paginate: FunctionReference<"query", "internal", { cursor?: string; k1?: any; k2?: any; limit: number; namespace?: any; order: "asc" | "desc" }, { cursor: string; isDone: boolean; page: Array<{ k: any; s: number; v: any }> }>;
      paginateNamespaces: FunctionReference<"query", "internal", { cursor?: string; limit: number }, { cursor: string; isDone: boolean; page: Array<any> }>;
      validate: FunctionReference<"query", "internal", { namespace?: any }, any>;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<"query", "internal", { namespace?: any; node?: string }, null>;
      listTreeNodes: FunctionReference<"query", "internal", { take?: number }, Array<{ _creationTime: number; _id: string; aggregate?: { count: number; sum: number }; items: Array<{ k: any; s: number; v: any }>; subtrees: Array<string> }>>;
      listTrees: FunctionReference<"query", "internal", { take?: number }, Array<{ _creationTime: number; _id: string; maxNodeSize: number; namespace?: any; root: string }>>;
    };
    public: {
      clear: FunctionReference<"mutation", "internal", { maxNodeSize?: number; namespace?: any; rootLazy?: boolean }, null>;
      delete_: FunctionReference<"mutation", "internal", { key: any; namespace?: any }, null>;
      deleteIfExists: FunctionReference<"mutation", "internal", { key: any; namespace?: any }, any>;
      init: FunctionReference<"mutation", "internal", { maxNodeSize?: number; namespace?: any; rootLazy?: boolean }, null>;
      insert: FunctionReference<"mutation", "internal", { key: any; namespace?: any; summand?: number; value: any }, null>;
      makeRootLazy: FunctionReference<"mutation", "internal", { namespace?: any }, null>;
      replace: FunctionReference<"mutation", "internal", { currentKey: any; namespace?: any; newKey: any; newNamespace?: any; summand?: number; value: any }, null>;
      replaceOrInsert: FunctionReference<"mutation", "internal", { currentKey: any; namespace?: any; newKey: any; newNamespace?: any; summand?: number; value: any }, any>;
    };
  };
};
