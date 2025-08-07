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
    // 6 minutes
    const now = new Date(Date.now() - 360000);

    const isActive =
      new Date(cp?.last_connection).getTime() >=
      new Date(
        now
          .toLocaleString("sv-SE", { timeZone: "Europe/Prague" })
          .replace(" ", "T")
          .replace(",", "")
      ).getTime();

    return {
      rustdeskID: cp.rustdesk_id,
      name: cp?.name,
      ip: cp?.ip,
      os: cp?.os,
      osVersion: cp?.os_version,
      loginUser: cp?.login_user,
      lastConnection: isActive ? "Online" : "Offline",
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
