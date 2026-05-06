"use server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import PageWrapper from "@/components/page-wrapper";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getToken } from "@/lib/auth-server";
import { AppsTable } from "@/app/modules/apps/table/apps-table";

export default async function AppsPage() {
  const initialToken = await getToken();
  const apps = await preloadQuery(
    api.apps.getTableData,
    {},
    initialToken ? { token: initialToken } : undefined,
  );
  return (
    <PageWrapper
      siteHeader={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Apps</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <AppsTable data={apps} />
    </PageWrapper>
  );
}
