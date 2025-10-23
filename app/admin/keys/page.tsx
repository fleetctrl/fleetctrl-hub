import { SiteHeader } from "@/components/site-header";
import CreateNewKeyDialog from "./createNewKeyDialog";
import { KeysTable } from "./data-table";
import PageWrapper from "@/components/page-wrapper";

export default async function Keys() {
  return (
    <PageWrapper siteHeader="Keys">
      <KeysTable />
    </PageWrapper>
  );
}
