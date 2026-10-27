import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { cookies } from "next/headers";
import { Metadata } from "next";
import { globalMetaTitle } from "@/lib/meta";
import { ComputerPresenceProvider } from "@/features/computers/ui";

export const metadata: Metadata = {
  title: `Dashboard - ${globalMetaTitle}`,
};

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts redirects requests without a session cookie to /sign-in; the API enforces the real check.
  const cookieStore = await cookies();
  const defaultOpen =
    cookieStore.get("sidebar_state")?.value === "true" || true; // Default to open if cookie is not set

  return (
    <ComputerPresenceProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </ComputerPresenceProvider>
  );
}
