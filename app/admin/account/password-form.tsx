"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Item, ItemContent } from "@/components/ui/item";
import { Form, FormField } from "@/components/ui/form";
import { api } from "@/trpc/react";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

const passwordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { message: "Current password is required." }),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, {
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      }),
    repeatPassword: z
      .string()
      .min(1, { message: "Please repeat the new password." }),
  })
  .superRefine(({ newPassword, repeatPassword }, ctx) => {
    if (newPassword !== repeatPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["repeatPassword"],
        message: "New password fields do not match.",
      });
    }
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

type FormFeedback =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type PasswordFormProps = {
  email?: string | null;
};

export function PasswordForm({ email }: PasswordFormProps) {
  const changePasswordMutation = api.account.changePassword.useMutation({
    onError: (values) => {
      console.log(values.data?.code)
      if (values.data?.code == "UNAUTHORIZED") {
        form.setError("currentPassword", { message: "Your current password is incorrect." })
      } else {
        toast.error("Error changing password")
      }
    }
  })
  const [feedback, setFeedback] = useState<FormFeedback>(null);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      repeatPassword: "",
    },
    mode: "onTouched",
    criteriaMode: "all",
  });

  const [currentPasswordValue, newPasswordValue, repeatPasswordValue] =
    form.watch(["currentPassword", "newPassword", "repeatPassword"]);

  const isSubmitDisabled =
    form.formState.isSubmitting ||
    !currentPasswordValue ||
    !newPasswordValue ||
    !repeatPasswordValue ||
    newPasswordValue.length < MIN_PASSWORD_LENGTH;

  const handleSubmit = form.handleSubmit(async (values) => {
    changePasswordMutation.mutate({
      oldPassword: values.currentPassword,
      newPassword: values.newPassword
    })

    if (changePasswordMutation.isError) {
      return
    }
    form.reset();
  });

  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <form onSubmit={handleSubmit} noValidate>
            <FieldSet>
              <FieldLegend>Password</FieldLegend>
              <FieldDescription>
                Set a new password for your account.
              </FieldDescription>

              <FieldGroup>
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field, fieldState }) => (
                      <Field
                        orientation="responsive"
                        data-invalid={fieldState.invalid || undefined}
                      >
                        <FieldLabel htmlFor="current-password">
                          Current password
                        </FieldLabel>
                        <Input
                          id="current-password"
                          type="password"
                          autoComplete="current-password"
                          placeholder="Current password"
                          {...field}
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </Field>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field, fieldState }) => (
                      <Field
                        orientation="responsive"
                        data-invalid={fieldState.invalid || undefined}
                      >
                        <FieldLabel htmlFor="new-password">
                          New password
                        </FieldLabel>
                        <Input
                          id="new-password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="New password"
                          {...field}
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                        <FieldDescription>
                          Use at least {MIN_PASSWORD_LENGTH} characters.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="repeatPassword"
                    render={({ field, fieldState }) => (
                      <Field
                        orientation="responsive"
                        data-invalid={fieldState.invalid || undefined}
                      >
                        <FieldLabel htmlFor="repeat-password">
                          Repeat new password
                        </FieldLabel>
                        <Input
                          id="repeat-password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Repeat new password"
                          {...field}
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </Field>
                    )}
                  />
                </div>
              </FieldGroup>

              {feedback ? (
                <Field>
                  {feedback.type === "success" ? (
                    <p className="text-sm text-green-600">{feedback.message}</p>
                  ) : (
                    <FieldError>{feedback.message}</FieldError>
                  )}
                </Field>
              ) : null}

              <Field orientation="horizontal">
                <Button type="submit" disabled={isSubmitDisabled}>
                  {form.formState.isSubmitting ? "Saving..." : "Update password"}
                </Button>
              </Field>
            </FieldSet>
          </form>
        </Form>
      </ItemContent>
    </Item>
  );
}
