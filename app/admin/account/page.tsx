import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import PageWrapper from "@/components/page-wrapper";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export default async function Account() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  const userMetadata = (user?.user_metadata ?? {}) as Record<
    string,
    string | undefined
  >;

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
          <ProfileForm
            firstName={userMetadata.firstname ?? ""}
            lastName={userMetadata.lastname ?? ""}
          />
          <PasswordForm />
        </div>
      </div>
    </PageWrapper>
  );
}
