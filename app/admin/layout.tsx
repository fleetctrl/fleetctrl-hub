import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/auth/login");
  }

  return (
    <SidebarProvider>
      <AppSidebar user={data.user} />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}