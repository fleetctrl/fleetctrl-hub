import { accountRouter } from "./routers/account";
import { computerRouter } from "./routers/computer";
import { groupRouter } from "./routers/group";
import { keyRouter } from "./routers/key";
import { rustdeskRouter } from "./routers/rustdesk";
import { appRouter as appRouteRouter } from "./routers/app";
import { createCallerFactory, createTRPCRouter } from "./trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  key: keyRouter,
  rustdesk: rustdeskRouter,
  account: accountRouter,
  group: groupRouter,
  comuter: computerRouter,
  app: appRouteRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
