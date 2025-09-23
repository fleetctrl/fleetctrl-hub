import { computersRouter } from "./routers/computers";
import { keysRouter } from "./routers/keys";
import { tasksRouter } from "./routers/tasks";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  computers: computersRouter,
  keys: keysRouter,
  tasks: tasksRouter,
});

export type AppRouter = typeof appRouter;
