import PageWrapper from "@/components/page-wrapper";
import { ComputersTable } from "../../../modules/computers/table/computers-data-table";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export default async function ProtectedPage() {
  return (
    <PageWrapper
      siteHeader={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Computers</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <ComputersTable />
    </PageWrapper>
  );
}
