import { columns } from "./columns";
import { DataTable } from "./data-table";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/trpc/server";

export default async function ProtectedPage() {
  const data = await api.rustdesk.getAll();

  return (<>
    <SiteHeader page="RustDesk" />
    <div className="flex flex-col items-center"><DataTable columns={columns} data={data} /></div>
  </>);
}
