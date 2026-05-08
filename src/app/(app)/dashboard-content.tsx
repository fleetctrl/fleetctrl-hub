"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
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
import { useAuthQuery } from "@/hooks/auth-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

type MetricProps = {
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  progress?: number;
};

function formatRelativeTime(timestamp?: number) {
  if (!timestamp) {
    return "Never";
  }

  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isComputerOnline(lastConnection?: number) {
  return (
    typeof lastConnection === "number" &&
    Date.now() - lastConnection < ONLINE_THRESHOLD_MS
  );
}

function Metric({ title, value, detail, icon: Icon, progress }: MetricProps) {
  return (
    <div className="flex min-h-32 flex-col justify-between gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-muted-foreground">{title}</span>
          <span className="truncate text-2xl font-semibold">{value}</span>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{detail}</span>
        {typeof progress === "number" ? <Progress value={progress} /> : null}
      </div>
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
      <div className="grid rounded-md border sm:grid-cols-2 lg:grid-cols-4">
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
    .sort((a, b) => (b.lastConnection ?? 0) - (a.lastConnection ?? 0))
    .slice(0, 6);

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live fleet status across devices, apps, groups, and client updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/rustdesk">
              <MonitorIcon data-icon="inline-start" />
              Devices
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/groups/static">
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

      <div className="grid overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4">
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
        <Card>
          <CardHeader>
            <CardTitle>Fleet Health</CardTitle>
            <CardDescription>
              Current device reachability and client rollout.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Computers</CardTitle>
            <CardDescription>
              Devices ordered by their latest client contact.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentComputers.length > 0 ? (
                  recentComputers.map((computer) => (
                    <TableRow key={computer.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {computer.name ?? computer.rustdeskId ?? "Unnamed"}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {computer.loginUser ?? computer.os ?? "No user"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {computer.clientVersion ?? "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            isComputerOnline(computer.lastConnection)
                              ? "default"
                              : "secondary"
                          }
                        >
                          {isComputerOnline(computer.lastConnection)
                            ? "Online"
                            : "Offline"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatRelativeTime(computer.lastConnection)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No computers enrolled.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
