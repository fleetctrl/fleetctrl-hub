import { Id } from "@/convex/_generated/dataModel";
import ComputerDetailTabs from "@/modules/computers/detail/computer-detail-tabs";

type Params = Promise<{
  computerId: string;
}>;

export default async function Computer({ params }: { params: Params }) {
  const { computerId } = await params;
  return <ComputerDetailTabs computerId={computerId as Id<"computers">} />;
}
