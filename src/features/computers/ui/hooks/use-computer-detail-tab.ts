"use client";

import { useState } from "react";
import { useComputer } from "../api";

/** Device actions shown on the computer page; provided by the tasks feature through the page. */
export type ComputerTasks = {
  tasks:
    | {
        id: string;
        createdAt: number;
        status: "PENDING" | "IN_PROGRESS" | "SUCCESS" | "ERROR";
        taskType: string;
        error?: string;
      }[]
    | undefined;
  createTask: (args: {
    computerId: string;
    taskType: "SET_PASSWD" | "SET_NETWORK_STRING";
    taskData?: unknown;
  }) => Promise<{ id: string }>;
};

export function useComputerDetailTab(computerId: string, { tasks, createTask }: ComputerTasks) {
  const [openChangePassword, setOpenChangePassword] = useState(false);
  const [openChangeNetwork, setOpenChangeNetwork] = useState(false);

  const computer = useComputer(computerId);

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
