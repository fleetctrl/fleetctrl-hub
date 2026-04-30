"use server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { GroupsTable } from "./data-table";
import PageWrapper from "@/components/page-wrapper";
import { getToken } from "@/lib/auth-server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function GroupsPage() {
  const initialToken = await getToken();
  const groups = await preloadQuery(
    api.staticGroups.getTableData,
    {},
    initialToken ? { token: initialToken } : undefined
  );
  const computers = await preloadQuery(
    api.staticGroups.getComputersForGroups,
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
      <GroupsTable preloaded={{ groups, computers }} />
    </PageWrapper>
  );
}
