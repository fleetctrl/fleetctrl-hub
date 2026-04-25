import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { cookies } from "next/headers"

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authentication is now handled by middleware (convexAuthNextjsMiddleware)
  // No need to check auth here - protected routes redirect to sign-in automatically
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}