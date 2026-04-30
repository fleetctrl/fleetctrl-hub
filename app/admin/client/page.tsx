"use server";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ClientUpdatesTable } from "./data-table";
import PageWrapper from "@/components/page-wrapper";
import { getToken } from "@/lib/auth-server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function ClientUpdatesPage() {
    const initialToken = await getToken();
    const clients = await preloadQuery(
        api.clientUpdates.getAll,
        {},
        initialToken ? { token: initialToken } : undefined
    );
    return (
        <PageWrapper
            siteHeader={
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbPage>Client Updates</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            }
        >
            <ClientUpdatesTable data={clients} />
        </PageWrapper>
    );
}
