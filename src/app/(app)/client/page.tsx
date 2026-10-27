import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ClientUpdatesTable } from "@/features/client-updates/ui";
import PageWrapper from "@/components/page-wrapper";

export default async function ClientUpdatesPage() {
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
