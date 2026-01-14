import Tabs from "./tabs";
import { Id } from "@/convex/_generated/dataModel";

type Params = Promise<{
  computerId: string;
}>;

export default async function Computer({ params }: { params: Params }) {
  const { computerId } = await params;
  return <Tabs computerId={computerId as Id<"computers">} />;
}
