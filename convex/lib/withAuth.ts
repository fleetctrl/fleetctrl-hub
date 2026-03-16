/**
 * Authenticated Function Wrappers
 *
 * Provides withAuthQuery, withAuthMutation, and withAuthAction
 * that automatically verify the user is authenticated and inject
 * the user into the context.
 */

import {
    customQuery,
    customMutation,
    customAction,
} from "convex-helpers/server/customFunctions";
import { query, action } from "../_generated/server";
import { mutation } from "../functions";
import { ConvexError } from "convex/values";

export const withAuthQuery = customQuery(query, {
    args: {},
    input: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError({
                code: "UNAUTHORIZED",
                message: "You must be logged in to perform this action",
            });
        }
        return { ctx: { user: identity }, args: {} };
    },
});

export const withAuthMutation = customMutation(mutation, {
    args: {},
    input: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError({
                code: "UNAUTHORIZED",
                message: "You must be logged in to perform this action",
            });
        }
        return { ctx: { user: identity }, args: {} };
    },
});

export const withAuthAction = customAction(action, {
    args: {},
    input: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError({
                code: "UNAUTHORIZED",
                message: "You must be logged in to perform this action",
            });
        }
        return { ctx: { user: identity }, args: {} };
    },
});