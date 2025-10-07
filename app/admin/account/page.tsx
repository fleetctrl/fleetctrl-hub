import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export default async function Account() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  const userMetadata = (user?.user_metadata ?? {}) as Record<string, string | undefined>;

  return (
    <>
      <SiteHeader page="Account" />
      <div className="flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-6 px-4 pb-10">
          <ProfileForm
            firstName={userMetadata.firstname ?? ""}
            lastName={userMetadata.lastname ?? ""}
          />
          <PasswordForm />
        </div>
      </div>
    </>
  );
}
