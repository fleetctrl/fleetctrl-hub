import Tabs from "./tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/trpc/server";

type Params = Promise<{
  computerId: string;
}>;

export default async function Computer({ params }: { params: Params }) {
  const { computerId } = await params;
  const rustdesk = await api.rustdesk.getSingle({ id: computerId });

  return (<>
    <SiteHeader>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/rustdesk">RustDesk</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>{rustdesk?.name ?? ""}</BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </SiteHeader>
    <div className="container mx-auto w-full px-4 py-6">
      <div className="flex flex-col w-full gap-6">
        <div className="w-full">
          <h1 className="text-3xl font-bold">{rustdesk?.name ?? ""}</h1>
        </div>
        {rustdesk && <div className="flex w-full">
          <Tabs computer={rustdesk} />
        </div>}
      </div>
    </div>
  </>
  );
}
