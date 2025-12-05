import { ReactNode } from "react";
import { SiteHeader } from "./site-header";

type Props = {
  children: ReactNode;
  siteHeader?: ReactNode;
};

export default function PageWrapper({ children, siteHeader }: Props) {
  return (
    <div>
      <SiteHeader>{siteHeader}</SiteHeader>
      <div className="flex flex-col items-center">
        <div className="w-[1000px] md:max-w-[90%] flex flex-col justify-center items-center">
          {children}
        </div>
      </div>
    </div>
  );
}
