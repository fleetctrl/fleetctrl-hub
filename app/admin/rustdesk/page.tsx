import PageWrapper from "@/components/page-wrapper";
import { RustDeskTable } from "./data-table";

export default async function ProtectedPage() {

  return (<PageWrapper siteHeader="RustDesk">
    <RustDeskTable />
  </PageWrapper>);
}
