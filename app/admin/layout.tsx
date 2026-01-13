"use client";

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { redirect } from "next/navigation";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();

  // We can fetch user data here if needed for the Sidebar
  // For now passing mock or basic info, or fetching from Convex.
  // The User table is handled by Convex Auth.

  // Let's assume we have a query `api.users.current`?
  // Standard Convex Auth doesn't expose a simple user object by default without configuring it.
  // But we can just pass what we have or handle loading state.

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
     // Middleware should have handled this, but client-side check is good too.
     // Redirect is handled by middleware mostly.
  }

  // Placeholder user for now until we query it properly
  const user = {
      firstname: "Admin",
      lastname: "User",
      email: "admin@example.com",
      avatar: ""
  };

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
