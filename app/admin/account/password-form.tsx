"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item, ItemContent } from "@/components/ui/item";
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export function PasswordForm() {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: PasswordFormValues) => {
    setIsLoading(true);
    try {
      await authClient.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success("Password updated successfully");
      form.reset();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update password. Check your current password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Item variant="outline">
      <ItemContent className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FieldSet>
              <FieldLegend>Password</FieldLegend>
              <FieldDescription>
                Set a new password for your account.
              </FieldDescription>

              <div className="mt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Current password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="New password"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Use at least 8 characters.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repeat new password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Repeat new password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="mt-4">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Updating..." : "Update password"}
                </Button>
              </div>
            </FieldSet>
          </form>
        </Form>
      </ItemContent>
    </Item>
  );
}
