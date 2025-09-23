import { SiteHeader } from "@/components/site-header";
import { DataTable } from "./data-table";
import { columns } from "./columns";
import CreateNewKeyDialog from "./createNewKeyDialog";
import { api } from "@/trpc/server";

export default async function Keys() {
    const data = await api.key.getAll()

    return <><SiteHeader page="Enroll Keys" />
        <div className="flex flex-col items-center">
            <div className="flex flex-col gap-3 items-center w-[800px]">
                <div className="w-full flex justify-end"><CreateNewKeyDialog /></div>
                <DataTable columns={columns} data={data} />
            </div>
        </div>
    </>
}

