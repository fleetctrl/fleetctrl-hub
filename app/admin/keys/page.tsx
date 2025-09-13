import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "./data-table";
import { columns, KeyData } from "./columns";
import CreateNewKeyDialog from "./createNewKeyDialog";


async function getData(): Promise<KeyData[]> {
    const supabase = createClient();

    const { data: keys } = await (await supabase)
        .from("enrollment_tokens")
        .select("*").order("created_at", {
            ascending: false,
        });

    if (!keys) return Promise.resolve([]);

    const data = keys.map((key) => {
        return {
            id: key.token_hash ?? "",
            name: key.name ?? "",
            remainingUses: key.remaining_uses == -1 ? "unlimited" : key.remaining_uses,
            token_fragment: key.token_fragment ?? "",
            expiresAt: new Date(key.expires_at).toLocaleDateString("cs") + " " + new Date(key.expires_at).toLocaleTimeString("cs")
        } as KeyData
    })

    return Promise.resolve(data)
}

export default async function Keys() {
    const data = await getData()

    return <><SiteHeader page="Enroll Keys" />
        <div className="flex flex-col items-center">
            <div className="flex flex-col gap-3 items-center w-[800px]">
                <div className="w-full flex justify-end"><CreateNewKeyDialog /></div>
                <DataTable columns={columns} data={data} />
            </div>
        </div>
    </>
}

