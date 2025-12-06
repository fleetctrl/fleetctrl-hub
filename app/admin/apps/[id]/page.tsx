"use client";
import { useState } from "react";
import { api } from "@/trpc/react";
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
import { ReleasesTable } from "./releases-table";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

import { EditAppSheet } from "./edit-app-sheet";
import { CreateReleaseSheet } from "./create-release-sheet";
import { Copy, Pen, Plus } from "lucide-react";

export default function AppDetailPage() {
    const params = useParams();
    const appId = params.id as string;

    const { data: app, isLoading, error } = api.app.getById.useQuery({ id: appId });
    const { data: releases, isLoading: releasesLoading } = api.app.getReleases.useQuery(
        { appId },
        { enabled: !!appId }
    );
    const [activeView, setActiveView] = useState<"overview" | "properties">("overview");
    const [showEditSheet, setShowEditSheet] = useState(false);
    const [showCreateReleaseSheet, setShowCreateReleaseSheet] = useState(false);

    console.log(app);

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
                                <BreadcrumbLink href="/admin/apps">Apps</BreadcrumbLink>
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
                                <BreadcrumbLink href="/admin/apps">Apps</BreadcrumbLink>
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
                            <BreadcrumbLink href="/admin/apps">Apps</BreadcrumbLink>
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
                <div className="w-full md:w-64 flex-shrink-0 space-y-1">
                    <div className="font-semibold text-lg px-4 py-2 mb-2 break-words">{app.display_name}</div>
                    <nav className="flex flex-col space-y-1">
                        <Button
                            variant={activeView === "overview" ? "secondary" : "ghost"}
                            className="justify-start w-full"
                            onClick={() => setActiveView("overview")}
                        >
                            Overview
                        </Button>
                        <Button
                            variant={activeView === "properties" ? "secondary" : "ghost"}
                            className="justify-start w-full"
                            onClick={() => setActiveView("properties")}
                        >
                            Properties
                        </Button>
                        <Button variant="ghost" className="justify-start w-full" disabled>
                            Device install status
                        </Button>
                        <Button variant="ghost" className="justify-start w-full" disabled>
                            User install status
                        </Button>
                    </nav>
                </div>

                {/* Main Content */}
                <div className="flex-1 space-y-6 w-full">
                    {activeView === "overview" && (
                        <>
                            {/* Essentials Section */}
                            <Card className="border-none shadow-none bg-transparent">
                                <CardHeader className="px-0 pt-0 flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-xl font-semibold">Essentials</CardTitle>
                                    <Button variant="outline" size="sm" onClick={() => setShowEditSheet(true)}>
                                        <Pen className="w-4 h-4 mr-2" />
                                        Edit
                                    </Button>
                                </CardHeader>
                                <CardContent className="px-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8">
                                    <div>
                                        <div className="text-sm text-muted-foreground">Publisher</div>
                                        <div className="font-medium">{app.publisher || "-"}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">Operating system</div>
                                        <div className="font-medium">Windows</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">App created</div>
                                        <div className="font-medium">{new Date(app.created_at).toLocaleString("cs-CZ")}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">Last modified</div>
                                        <div className="font-medium">{new Date(app.updated_at).toLocaleString("cs-CZ")}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">Auto update</div>
                                        <div className="font-medium">
                                            {app.auto_update ? "Yes" : "No"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">Allow multiple versions</div>
                                        <div className="font-medium">
                                            {app.allow_multiple_versions ? "Yes" : "No"}
                                        </div>
                                    </div>
                                    <div className="col-span-1 md:col-span-2 lg:col-span-3">
                                        <div className="text-sm text-muted-foreground">Description</div>
                                        <div className="font-medium whitespace-pre-wrap">{app.description || "-"}</div>
                                    </div>
                                </CardContent>
                            </Card>

                            <EditAppSheet
                                app={{
                                    id: app.id,
                                    display_name: app.display_name,
                                    description: app.description,
                                    publisher: app.publisher
                                }}
                                open={showEditSheet}
                                onOpenChange={setShowEditSheet}
                            />

                            {/* Releases Section */}
                            <Card className="border-none shadow-none bg-transparent">
                                <CardHeader className="px-0 pt-0 flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-xl font-semibold">Releases</CardTitle>
                                    {canAddRelease && (
                                        <Button variant="outline" size="sm" onClick={() => setShowCreateReleaseSheet(true)}>
                                            <Plus className="w-4 h-4 mr-2" />
                                            Add Release
                                        </Button>
                                    )}
                                </CardHeader>
                                <CardContent className="px-0">
                                    {releasesLoading ? (
                                        <div className="text-muted-foreground">Loading releases...</div>
                                    ) : (
                                        <ReleasesTable releases={releases ?? []} appId={appId} />
                                    )}
                                </CardContent>
                            </Card>

                            <CreateReleaseSheet
                                appId={appId}
                                isAutoUpdate={app.auto_update}
                                open={showCreateReleaseSheet}
                                onOpenChange={setShowCreateReleaseSheet}
                            />
                        </>
                    )}

                    {activeView === "properties" && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Properties</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">App properties configuration will be here.</p>
                                {/* TODO: Add form to edit app properties */}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </PageWrapper>
    );
}
