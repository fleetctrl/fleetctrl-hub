import { SiteHeader } from "@/components/site-header";
import { api } from "@/trpc/server";
import { DataTable } from "./data-table";
import { columns } from "./columns";
import CreateNewKeyDialog from "./createNewKeyDialog";

export default async function Keys() {
  const data = await api.keys.list();

  return (
    <>
      <SiteHeader page="Enroll Keys" />
      <div className="flex flex-col items-center">
        <div className="flex flex-col gap-3 items-center w-[800px]">
          <div className="w-full flex justify-end">
            <CreateNewKeyDialog />
          </div>
          <DataTable columns={columns} data={data} />
        </div>
      </div>
    </>
  );
}

