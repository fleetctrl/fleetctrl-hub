"use client";

import * as React from "react";
import {
  IconDashboard,
  IconInnerShadowTop,
  IconKey,
  IconRefresh,
  IconWorldSearch,
  IconUsers,
  IconApps,
} from "@tabler/icons-react";

import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import Link from "next/link";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/admin",
      icon: IconDashboard,
    },
    {
      title: "RustDesk",
      url: "/admin/rustdesk",
      icon: IconWorldSearch,
    },
    {
      title: "Groups",
      url: "/admin/groups/static",
      icon: IconUsers,
    },
    {
      title: "Apps",
      url: "/admin/apps",
      icon: IconApps,
    },
  ],
  navSecondary: [
    {
      title: "Enroll Keys",
      url: "/admin/keys",
      icon: IconKey,
    },
    {
      title: "Client versions",
      url: "/admin/client",
      icon: IconRefresh,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="h-14 border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/admin">
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">FleetCtrl</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
