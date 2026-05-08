import { KeysTable } from "./data-table";
import PageWrapper from "@/components/page-wrapper";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { getToken } from "@/lib/auth-server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function Keys() {
  const initialToken = await getToken();
  const clients = await preloadQuery(
    api.enrollmentTokens.list,
    {},
    convexServerQueryOptions(initialToken),
  );
  return (
    <PageWrapper
      siteHeader={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Keys</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <KeysTable data={clients} />
    </PageWrapper>
  );
}
