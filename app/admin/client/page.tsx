import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ClientUpdatesTable } from "./data-table";
import PageWrapper from "@/components/page-wrapper";

export default function ClientUpdatesPage() {
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
            <ClientUpdatesTable />
        </PageWrapper>
    );
}
