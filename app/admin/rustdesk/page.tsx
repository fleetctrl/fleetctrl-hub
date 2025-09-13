import { createClient } from "@/lib/supabase/server";
import { columns, Computer } from "./columns";
import { DataTable } from "./data-table";
import { SiteHeader } from "@/components/site-header";

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
      id: cp.id,
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

  return (<>
    <SiteHeader page="RustDesk" />
    <div className="flex flex-col items-center"><DataTable columns={columns} data={data} /></div>
  </>);
}
