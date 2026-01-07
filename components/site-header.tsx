import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeSwitcher } from "./theme-switcher";

type Props = {
  children?: React.ReactNode;
  page?: string;
};

export function SiteHeader({ children, page }: Props) {
  return (
    <>
      <header className="sticky inset-0 w-full bg-[#ffffff] dark:bg-[#0a0a0a] top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          {children || (page && <span className="font-medium text-sm">{page}</span>)}
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitcher />
            <Button
              variant="ghost"
              asChild
              size="sm"
              className="hidden sm:flex"
            >
              <a
                href="https://github.com/fleetctrl/fleetctrl-hub"
                rel="noopener noreferrer"
                target="_blank"
                className="dark:text-foreground"
              >
                GitHub
              </a>
            </Button>
          </div>
        </div>
      </header>
      <div className="h-14 mb-9"></div>
    </>
  );
}
