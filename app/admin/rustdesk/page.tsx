import { RustDeskTable } from "./data-table";
import { SiteHeader } from "@/components/site-header";

export default async function ProtectedPage() {

  return (<>
    <SiteHeader page="RustDesk" />
    <div className="flex flex-col items-center"><RustDeskTable /></div>
  </>);
}
