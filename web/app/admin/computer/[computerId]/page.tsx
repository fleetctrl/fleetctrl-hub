import { createClient } from "@/lib/supabase/server";
import Tabs from "./tabs";

type Params = Promise<{
  computerId: string;
}>;

export default async function Computer({ params }: { params: Params }) {
  const { computerId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("computers")
    .select("*")
    .eq("rustdesk_id", computerId)
    .single();

  return (
    <div className="w-screen">
      <div className="grid grid-cols-1 w-full max-w-5xl gap-4">
        <div className="w-full">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold">Computer {data.name}</h1>
            <p className="text-gray-500">
              <span>OS: {data.os} | </span>
              <span>IP: {data.ip}</span>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 w-full">
          <Tabs />
        </div>
      </div>
    </div>
  );
}
