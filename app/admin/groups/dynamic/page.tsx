"use server";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { DynamicGroupsTable } from "./data-table";
import PageWrapper from "@/components/page-wrapper";
import { getToken } from "@/lib/auth-server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function DynamicGroupsPage() {
    const initialToken = await getToken();
    const groups = await preloadQuery(
        api.groups.getAll,
        {},
        initialToken ? { token: initialToken } : undefined
    );
    return (
        <PageWrapper
            siteHeader={
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbPage>Groups</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            }
        >
            <DynamicGroupsTable preloaded={{ groups }} />
        </PageWrapper>
    );
}
