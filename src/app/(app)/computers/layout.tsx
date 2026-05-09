import BlankLayout from "@/layouts/blank-layout";
import { globalMetaTitle } from "@/lib/meta";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `RustDesk - ${globalMetaTitle}`,
};
export default BlankLayout;
