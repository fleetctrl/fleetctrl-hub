import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import PageWrapper from "@/components/page-wrapper";
import { convexServerQueryOptions, getToken } from "@/lib/auth-server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { GroupsTabs } from "@/modules/groups/groups-tabs";

export default async function GroupsPage() {
  const initialToken = await getToken();
  const queryOptions = convexServerQueryOptions(initialToken);
  const [staticGroups, staticComputers, dynamicGroups] = await Promise.all([
    preloadQuery(api.staticGroups.getTableData, {}, queryOptions),
    preloadQuery(api.staticGroups.getComputersForGroups, {}, queryOptions),
    preloadQuery(api.groups.getAll, {}, queryOptions),
  ]);

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
      <GroupsTabs
        preloaded={{
          staticGroups,
          staticComputers,
          dynamicGroups,
        }}
      />
    </PageWrapper>
  );
}
