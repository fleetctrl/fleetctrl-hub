"use client";
import { useEffect, useState } from "react";
import { useAuthPaginatedQuery, useAuthQuery } from "@/hooks/use-auth-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import PageWrapper from "@/components/page-wrapper";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

import { EditAppSheet } from "@/modules/apps/detail/releases/app-edit-app-sheet";
import { Pen, Plus } from "lucide-react";
import { AppReleaseSheet } from "@/modules/apps/detail/releases/app-release-sheet";
import { AppReleasesTable } from "@/modules/apps/detail/releases/app-releases-table";
import { useDeviceInstallStatus } from "@/modules/apps/hooks/use-device-install-status";
import { DeviceInstallStatusTable } from "@/modules/apps/table/device-install-status-table";
import { parseAsString, useQueryStates } from "nuqs";

export default function AppDetailPage() {
  const params = useParams();
  const appId = params.id as string;
  const normalizedAppId = appId as Id<"apps">;

  const app = useAuthQuery(api.apps.getById, { id: normalizedAppId });
  const releasesQuery = useAuthPaginatedQuery(api.apps.getReleasesPaginated, { appId: normalizedAppId }, { initialNumItems: 20 });
  const releases = releasesQuery.results;
  const deviceInstallStatus = useDeviceInstallStatus(normalizedAppId);

  // console.log("Device install status:", deviceInstallStatus);

  const isLoading = app === undefined;
  const releasesLoading = releasesQuery.status === "LoadingFirstPage";
  const error = app === null;

  const [{ view: activeView }, setQueryState] = useQueryStates({
    view: parseAsString.withDefault("overview").withOptions({
      shallow: true,
      clearOnDefault: true,
      history: "replace",
    }),
  });

  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showCreateReleaseSheet, setShowCreateReleaseSheet] = useState(false);

  useEffect(() => {
    if (showCreateReleaseSheet && releasesQuery.status === "CanLoadMore") releasesQuery.loadMore(20);
  }, [releasesQuery, showCreateReleaseSheet]);

  // Determine if we can add a new release
  // For autoupdate apps, only 1 release is allowed
  const canAddRelease = !app?.auto_update || (releases?.length ?? 0) === 0;

  if (isLoading) {
    return (
      <PageWrapper
        siteHeader={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/apps">Apps</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Loading...</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      >
        <div className="flex items-center justify-center h-full">
          Loading...
        </div>
      </PageWrapper>
    );
  }

  if (error || !app) {
    return (
      <PageWrapper
        siteHeader={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/apps">Apps</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Error</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      >
        <div className="flex items-center justify-center h-full text-destructive">
          Error loading app details.
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      siteHeader={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/apps">Apps</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{app.display_name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="flex flex-col md:flex-row gap-6 w-full h-full items-start">
        {/* Sidebar */}
        <div className="w-full md:w-64 shrink-0 space-y-1">
          <div className="font-semibold text-lg px-4 py-2 mb-2 wrap-break-word">
            {app.display_name}
          </div>
          <nav className="flex flex-col space-y-1">
            <Button
              variant={activeView === "overview" ? "secondary" : "ghost"}
              className="justify-start w-full"
              onClick={() => setQueryState({ view: "overview" })}
            >
              Overview
            </Button>
            <Button
              variant={activeView === "deviceStatus" ? "secondary" : "ghost"}
              className="justify-start w-full"
              onClick={() => setQueryState({ view: "deviceStatus" })}
            >
              Device install status
            </Button>
            {/*<Button
              variant={activeView === "properties" ? "secondary" : "ghost"}
              className="justify-start w-full"
              onClick={() => setActiveView("properties")}
            >
              Properties
            </Button>
            <Button variant="ghost" className="justify-start w-full" disabled>
              User install status
            </Button>*/}
          </nav>
        </div>

        {/* Main Content */}
        <div className="min-w-0 w-full flex-1 space-y-6">
          {activeView === "overview" && (
            <>
              {/* Essentials Section */}
              <Card className="border-none shadow-none bg-transparent">
                <CardHeader className="px-0 pt-0 flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xl font-semibold">
                    Essentials
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEditSheet(true)}
                  >
                    <Pen className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </CardHeader>
                <CardContent className="px-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Publisher
                    </div>
                    <div className="font-medium">{app.publisher || "-"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Operating system
                    </div>
                    <div className="font-medium">Windows</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      App created
                    </div>
                    <div className="font-medium">
                      {new Date(app.created_at).toLocaleString("cs-CZ")}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Last modified
                    </div>
                    <div className="font-medium">
                      {new Date(app.updated_at).toLocaleString("cs-CZ")}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Auto update
                    </div>
                    <div className="font-medium">
                      {app.auto_update ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="col-span-1 md:col-span-2 lg:col-span-3">
                    <div className="text-sm text-muted-foreground">
                      Description
                    </div>
                    <div className="font-medium whitespace-pre-wrap">
                      {app.description || "-"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <EditAppSheet
                app={{
                  id: app.id,
                  display_name: app.display_name,
                  description: app.description,
                  publisher: app.publisher,
                }}
                open={showEditSheet}
                onOpenChange={setShowEditSheet}
              />

              {/* Releases Section */}
              <Card className="border-none shadow-none bg-transparent">
                <CardHeader className="px-0 pt-0 flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xl font-semibold">
                    Releases
                  </CardTitle>
                  {canAddRelease && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateReleaseSheet(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Release
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="px-0">
                  <AppReleasesTable
                    releases={releases ?? []}
                    appId={appId}
                    isAutoUpdate={app.auto_update}
                    isInitialLoading={releasesLoading}
                    isLoadingMore={releasesQuery.status === "LoadingMore"}
                    hasMore={releasesQuery.status === "CanLoadMore"}
                    onLoadMore={() => releasesQuery.loadMore(20)}
                  />
                </CardContent>
              </Card>

              <AppReleaseSheet
                appId={appId}
                isAutoUpdate={app.auto_update}
                copyableReleases={releases ?? []}
                isLoadingCopyableReleases={releasesQuery.status !== "Exhausted"}
                open={showCreateReleaseSheet}
                onOpenChange={setShowCreateReleaseSheet}
              />
            </>
          )}

          {activeView === "deviceStatus" && (
            <Card className="border-none shadow-none bg-transparent">
              <CardHeader className="px-0 pt-0 pb-2">
                <CardTitle>Device install status</CardTitle>
              </CardHeader>
              <CardContent className="px-0 space-y-4">
                {deviceInstallStatus.isSummaryLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Loading status summary...
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 md:grid-cols-3 lg:grid-cols-6">
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Total
                        </div>
                        <div className="font-medium">
                          {deviceInstallStatus.summary?.total ?? 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Installed
                        </div>
                        <div className="font-medium">
                          {deviceInstallStatus.summary?.byStatus.INSTALLED ??
                            0}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Installing
                        </div>
                        <div className="font-medium">
                          {deviceInstallStatus.summary?.byStatus.INSTALLING ??
                            0}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Pending
                        </div>
                        <div className="font-medium">
                          {deviceInstallStatus.summary?.byStatus.PENDING ?? 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Error
                        </div>
                        <div className="font-medium">
                          {deviceInstallStatus.summary?.byStatus.ERROR ?? 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Uninstalled
                        </div>
                        <div className="font-medium">
                          {deviceInstallStatus.summary?.byStatus.UNINSTALLED ??
                            0}
                        </div>
                      </div>
                  </div>
                )}
                <DeviceInstallStatusTable
                  items={deviceInstallStatus.items}
                  isInitialLoading={deviceInstallStatus.isInitialLoading}
                  isLoadingMore={deviceInstallStatus.isLoadingMore}
                  hasMore={deviceInstallStatus.hasMore}
                  onLoadMore={deviceInstallStatus.loadMore}
                />
              </CardContent>
            </Card>
          )}

          {activeView === "properties" && (
            <Card>
              <CardHeader>
                <CardTitle>Properties</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  App properties configuration will be here.
                </p>
                {/* TODO: Add form to edit app properties */}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
