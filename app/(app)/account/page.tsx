"use server";

import { AccountPasswordForm } from "@/app/modules/account/account-password-form";
import { AccountProfileForm } from "@/app/modules/account/form/account-profile-form";
import PageWrapper from "@/components/page-wrapper";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export default async function Account() {
  return (
    <PageWrapper
      siteHeader={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Account</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="flex flex-col items-center">
        <div className="w-full space-y-6 px-4 pb-10">
          <AccountProfileForm />
          <AccountPasswordForm />
        </div>
      </div>
    </PageWrapper>
  );
}
