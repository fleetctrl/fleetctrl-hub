import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import PageWrapper from "@/components/page-wrapper";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export default function Account() {
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
          <ProfileForm />
          <PasswordForm />
        </div>
      </div>
    </PageWrapper>
  );
}
