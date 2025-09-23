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
  const computer = await api.computers.byId({ id: computerId });

  return (<> 
    <SiteHeader page="RustDesk" />
    <div className="container mx-auto w-full px-4">
      <div className="flex flex-col w-full gap-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin/rustdesk">RustDesk</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>{computer.name}</BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="w-full">
          <h1 className="text-3xl font-bold">{computer?.name ?? ""}</h1>
        </div>
        <div className="flex w-full">
          <Tabs computer={computer} />
        </div>
      </div>
    </div>
  </>
  );
}
