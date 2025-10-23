import { GroupsTable } from "./data-table";
import PageWrapper from "@/components/page-wrapper";

export default function GroupsPage() {
  return (
    <PageWrapper siteHeader="Groups">
      <GroupsTable />
    </PageWrapper>
  );
}
