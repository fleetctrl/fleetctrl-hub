import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DynamicGroupsTable } from "./data-table";
import PageWrapper from "@/components/page-wrapper";

export default function DynamicGroupsPage() {
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
            <DynamicGroupsTable />
        </PageWrapper>
    );
}
