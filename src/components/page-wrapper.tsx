import { ReactNode } from "react";
import { SiteHeader } from "./site-header";

type Props = {
  children: ReactNode;
  siteHeader?: ReactNode;
};

export default function PageWrapper({ children, siteHeader }: Props) {
  return (
    <div className="min-w-0">
      <SiteHeader>{siteHeader}</SiteHeader>
      <div className="flex min-w-0 flex-col items-center px-4 md:px-0">
        <div className="flex w-full max-w-[1000px] min-w-0 flex-col justify-center items-center md:w-[90%]">
          {children}
        </div>
      </div>
    </div>
  );
}
