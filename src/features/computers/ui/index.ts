"use client";

// Public UI API of the computers feature.
export { useComputers, computerKeys, type ComputerListItem } from "./api";
export { ComputerPresenceProvider, useComputerStatus, useOnlineCount, ONLINE_WINDOW } from "./presence";
export { ComputersTable } from "./components/table/computers-data-table";
export { default as ComputerDetailTabs } from "./components/detail/computer-detail-tabs";
export { useComputerDetailTab, type ComputerTasks } from "./hooks/use-computer-detail-tab";
