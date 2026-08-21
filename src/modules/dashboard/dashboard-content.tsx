"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { FunctionReturnType } from "convex/server";
import {
  ActivityIcon,
  AppWindowIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  MonitorIcon,
  RefreshCwIcon,
  UsersIcon,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { VirtualTable } from "@/components/virtual-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/utils";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

type MetricProps = {
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  progress?: number;
};

type ComputerRow = FunctionReturnType<typeof api.computers.list>[number];

const recentComputerColumns: ColumnDef<ComputerRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    size: 250,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          {row.original.name ?? row.original.rustdeskId ?? "Unnamed"}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {row.original.loginUser ?? row.original.os ?? "No user"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "clientVersion",
    header: "Client",
    size: 80,
    cell: ({ row }) => row.original.clientVersion ?? "Unknown",
  },
  {
    id: "status",
    header: "Status",
    size: 110,
    cell: ({ row }) => {
      const online = isComputerOnline(row.original.lastConnection);

      return (
        <Badge variant={online ? "success" : "outline"}>
          {online ? "Online" : "Offline"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "lastConnection",
    header: () => <div className="text-right">Last seen</div>,
    size: 80,
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground">
        {row.original.lastConnection
          ? relativeTime(row.original.lastConnection)
          : "Never"}
      </div>
    ),
  },
];

function RecentComputersTable({ computers }: { computers: ComputerRow[] }) {
  const table = useReactTable({
    data: computers,
    columns: recentComputerColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (computer) => computer.id,
  });

  return (
    <VirtualTable
      table={table}
      ariaLabel="Recent computers"
      emptyMessage="No computers enrolled."
      isInitialLoading={false}
      isLoadingMore={false}
      hasMore={false}
      onLoadMore={() => {}}
      height="19.5rem"
      className="rounded-none border-0"
    />
  );
}

function isComputerOnline(lastConnection?: number) {
  return (
    typeof lastConnection === "number" &&
    Date.now() - lastConnection < ONLINE_THRESHOLD_MS
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-sm border bg-card">
      <div className="flex flex-col gap-0.5 border-b px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Metric({ title, value, detail, icon: Icon, progress }: MetricProps) {
  return (
    <div className="flex min-w-0 flex-col p-4">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </span>
      <span className="mt-2 truncate text-2xl font-semibold">{value}</span>
      <span className="mt-1 text-sm text-muted-foreground">{detail}</span>
      {typeof progress === "number" ? (
        <Progress className="mt-3" value={progress} />
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid divide-y overflow-hidden rounded-sm border bg-card sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex min-h-32 flex-col gap-4 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-auto h-2 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

export function DashboardContent() {
  const computers = useAuthQuery(api.computers.list);
  const apps = useAuthQuery(api.apps.getTableData);
  const staticGroups = useAuthQuery(api.staticGroups.list);
  const dynamicGroups = useAuthQuery(api.groups.getAll);
  const clientUpdates = useAuthQuery(api.clientUpdates.getAll);
  const enrollmentTokens = useAuthQuery(api.enrollmentTokens.list);

  const isLoading = [
    computers,
    apps,
    staticGroups,
    dynamicGroups,
    clientUpdates,
    enrollmentTokens,
  ].some((value) => value === undefined);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const computerRows = computers ?? [];
  const appRows = apps ?? [];
  const staticGroupRows = staticGroups ?? [];
  const dynamicGroupRows = dynamicGroups ?? [];
  const clientUpdateRows = clientUpdates ?? [];
  const enrollmentTokenRows = enrollmentTokens ?? [];

  const totalComputers = computerRows.length;
  const onlineComputers = computerRows.filter((computer) =>
    isComputerOnline(computer.lastConnection),
  ).length;
  const onlinePercentage =
    totalComputers > 0
      ? Math.round((onlineComputers / totalComputers) * 100)
      : 0;

  const totalGroups = staticGroupRows.length + dynamicGroupRows.length;
  const totalInstalls = appRows.reduce(
    (total, app) => total + (app.installedCount ?? 0),
    0,
  );
  const activeClientUpdate = clientUpdateRows.find(
    (update) => update.is_active,
  );
  const outdatedComputers = activeClientUpdate
    ? computerRows.filter(
      (computer) => computer.clientVersion !== activeClientUpdate.version,
    ).length
    : 0;
  const activeEnrollmentTokens = enrollmentTokenRows.filter((token) => {
    const hasUses = token.remainingUses === -1 || token.remainingUses > 0;
    const isExpired = token.expiresAt ? token.expiresAt < Date.now() : false;
    return !token.disabled && hasUses && !isExpired;
  }).length;
  const recentComputers = [...computerRows]
    .sort((a, b) => (b.lastConnection ?? 0) - (a.lastConnection ?? 0));

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live fleet status across computers, apps, groups, and client updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/computers">
              <MonitorIcon data-icon="inline-start" />
              Computers
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/groups">
              <UsersIcon data-icon="inline-start" />
              Groups
            </Link>
          </Button>
          {/* <Button asChild>
            <Link href="/apps/create">
              <AppWindowIcon data-icon="inline-start" />
              Create app
            </Link>
          </Button> */}
        </div>
      </div>

      <div className="grid divide-y overflow-hidden rounded-sm border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <Metric
          title="Computers"
          value={totalComputers.toString()}
          detail={`${onlineComputers} online now`}
          icon={MonitorIcon}
        />
        <Metric
          title="App installs"
          value={totalInstalls.toString()}
          detail={`${appRows.length} apps managed`}
          icon={AppWindowIcon}
        />
        <Metric
          title="Groups"
          value={totalGroups.toString()}
          detail={`${staticGroupRows.length} static, ${dynamicGroupRows.length} dynamic`}
          icon={UsersIcon}
        />
        <Metric
          title="Enrollment keys"
          value={activeEnrollmentTokens.toString()}
          detail={`${enrollmentTokenRows.length} total keys`}
          icon={KeyRoundIcon}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Section
          title="Fleet Health"
          description="Current device reachability and client rollout."
        >
          <div className="flex flex-col gap-5 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Online coverage</span>
                <Badge variant="secondary">{onlinePercentage}%</Badge>
              </div>
              <Progress value={onlinePercentage} />
            </div>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  Active client
                </div>
                <span className="truncate text-sm text-muted-foreground">
                  {activeClientUpdate?.version ?? "Not selected"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <RefreshCwIcon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  Updates needed
                </div>
                <span className="text-sm text-muted-foreground">
                  {activeClientUpdate
                    ? `${outdatedComputers} computers`
                    : "No active version"}
                </span>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ActivityIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium">Managed surface</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {totalGroups} groups / {appRows.length} apps
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Recent Computers"
          description="Devices ordered by their latest client contact."
        >
          <RecentComputersTable computers={recentComputers} />
        </Section>
      </div>
    </div>
  );
}
