"use server";

import { SiteHeader } from "./site-header";

type Props = {
  children: React.ReactNode;
  siteHeader?: string;
};

export default async function PageWrapper({ children, siteHeader }: Props) {
  return (
    <div>
      <SiteHeader page={siteHeader ?? ""} />
      <div className="flex flex-col items-center">
        <div className="w-[1000px] md:max-w-[90%] flex flex-col justify-center items-center">
          {children}
        </div>
      </div>
    </div>
  );
}
