import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/auth-query";
import { useMutation } from "convex/react";
import { useState } from "react";

export function useComputerDetailTab(computerId: Id<"computers">) {
  const [openChangePassword, setOpenChangePassword] = useState(false);
  const [openChangeNetwork, setOpenChangeNetwork] = useState(false);

  const computer = useAuthQuery(api.computers.getById, { id: computerId });
  const tasks = useAuthQuery(api.tasks.getByComputer, { computerId });
  const createTask = useMutation(api.tasks.create);

  const common = {
    openChangePassword,
    setOpenChangePassword,
    openChangeNetwork,
    setOpenChangeNetwork,
    tasks,
    createTask,
  };

  if (computer === undefined) {
    return {
      ...common,
      status: "loading" as const,
    };
  }

  if (computer === null) {
    return {
      ...common,
      status: "notFound" as const,
    };
  }

  return {
    ...common,
    status: "ready" as const,
    computer,
  };
}
