import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { getToken } from "@/lib/auth-server";
import { env } from "@/lib/env";

const defaultUrl = env.VERCEL_URL
  ? `https://${env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "FleetCtrl",
  description: "Fleet management for RustDesk clients",
  icons: {
    icon: "/favicon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get initial token for SSR
  const initialToken = await getToken();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ConvexClientProvider initialToken={initialToken}>
          <NuqsAdapter>
            <Toaster />
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
            </ThemeProvider>
          </NuqsAdapter>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
