import { SiteHeader } from "@/components/site-header";
import CreateNewKeyDialog from "./createNewKeyDialog";
import { KeysTable } from "./data-table";

export default async function Keys() {

    return <><SiteHeader page="Enroll Keys" />
        <div className="flex flex-col items-center">
            <div className="flex flex-col gap-3 items-center w-[800px]">
                <div className="w-full flex justify-end"><CreateNewKeyDialog /></div>
                <KeysTable />
            </div>
        </div>
    </>
}

