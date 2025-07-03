import { createClient } from "@/lib/supabase/server";
import { columns, Computer } from "./columns";
import { DataTable } from "./data-table";

async function getData(): Promise<Computer[]> {
  const supabase = createClient();

  const { data: computers } = await (await supabase)
    .from("computers")
    .select("*");

  if (!computers) return [];

  const data = computers.map((cp) => {
    return {
      rustdeskID: cp.rustdesk_id,
      name: cp?.name,
      ip: cp?.ip,
      os: cp?.os,
      osVersion: cp?.os_version,
      loginUser: cp?.login_user,
    } as Computer;
  });

  return data;
}

export default async function ProtectedPage() {
  const data = await getData();
  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <div className="flex flex-col gap-2 items-start">
        <DataTable columns={columns} data={data} />
      </div>
    </div>
  );
}
