import { createClient } from "@/lib/supabase/server";
import Tabs from "./tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SiteHeader } from "@/components/site-header";

type Params = Promise<{
  computerId: string;
}>;

export default async function Computer({ params }: { params: Params }) {
  const { computerId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("computers")
    .select("*")
    .eq("id", computerId)
    .single();

  const computer = {
    id: data.id,
    rustdeskID: data.rustdesk_id,
    name: data?.name,
    ip: data?.ip,
    os: data?.os,
    osVersion: data?.os_version,
    loginUser: data?.login_user,
    lastConnection: data?.last_connection,
  };

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
          <h1 className="text-3xl font-bold">{data?.name ?? ""}</h1>
        </div>
        <div className="flex w-full">
          <Tabs computer={computer} />
        </div>
      </div>
    </div>
  </>
  );
}
