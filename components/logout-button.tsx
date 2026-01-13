"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";

export function LogoutButton() {
  const router = useRouter();
  const { signOut } = useAuthActions();

  const logout = async () => {
    await signOut();
    router.push("/auth/login");
  };

  return <Button onClick={logout}>Logout</Button>;
}
