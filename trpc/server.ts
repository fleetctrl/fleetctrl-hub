import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { RouterInputs, RouterOutputs } from "./shared";

const createCaller = cache(async () => {
  const ctx = await createTRPCContext({
    headers: headers(),
    cookieStore: cookies(),
  });

  return appRouter.createCaller(ctx);
});

export const api = {
  computers: {
    list: async () => (await createCaller()).computers.list(),
    byId: async (input: RouterInputs["computers"]["byId"]) =>
      (await createCaller()).computers.byId(input),
    delete: async (input: RouterInputs["computers"]["delete"]) =>
      (await createCaller()).computers.delete(input),
  },
  keys: {
    list: async () => (await createCaller()).keys.list(),
    create: async (input: RouterInputs["keys"]["create"]) =>
      (await createCaller()).keys.create(input),
    delete: async (input: RouterInputs["keys"]["delete"]) =>
      (await createCaller()).keys.delete(input),
  },
  tasks: {
    listForComputer: async (
      input: RouterInputs["tasks"]["listForComputer"]
    ) => (await createCaller()).tasks.listForComputer(input),
    enqueue: async (input: RouterInputs["tasks"]["enqueue"]) =>
      (await createCaller()).tasks.enqueue(input),
  },
};

export type { RouterInputs, RouterOutputs } from "./shared";
