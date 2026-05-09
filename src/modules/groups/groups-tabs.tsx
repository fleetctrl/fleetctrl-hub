"use client";

import { Preloaded } from "convex/react";
import { parseAsStringLiteral, useQueryStates } from "nuqs";

import { api } from "@/convex/_generated/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaticGroupsTable } from "./static/table/static-groups-table";
import { DynamicGroupsTable } from "./dynamic/table/dynamic-groups-table";

const groupTabs = ["static", "dynamic"] as const;

export function GroupsTabs({
  preloaded,
}: {
  preloaded: {
    staticGroups: Preloaded<typeof api.staticGroups.getTableData>;
    staticComputers: Preloaded<typeof api.staticGroups.getComputersForGroups>;
    dynamicGroups: Preloaded<typeof api.groups.getAll>;
  };
}) {
  const [{ type }, setQueryState] = useQueryStates({
    type: parseAsStringLiteral(groupTabs).withDefault("static").withOptions({
      shallow: true,
      clearOnDefault: true,
      history: "replace",
    }),
  });

  return (
    <Tabs
      value={type}
      onValueChange={(value) =>
        setQueryState({ type: value as (typeof groupTabs)[number] })
      }
      className="flex w-full flex-col gap-4"
    >
      <TabsList className="w-fit">
        <TabsTrigger value="static">Static Groups</TabsTrigger>
        <TabsTrigger value="dynamic">Dynamic Groups</TabsTrigger>
      </TabsList>
      <TabsContent value="static" className="mt-0">
        <StaticGroupsTable
          preloaded={{
            groups: preloaded.staticGroups,
            computers: preloaded.staticComputers,
          }}
        />
      </TabsContent>
      <TabsContent value="dynamic" className="mt-0">
        <DynamicGroupsTable
          preloaded={{
            groups: preloaded.dynamicGroups,
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
