"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from "react-hook-form";
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
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";

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

export function PasswordForm() {
  const { user, isLoaded } = useUser();

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
    !isLoaded ||
    !currentPasswordValue ||
    !newPasswordValue ||
    !repeatPasswordValue ||
    newPasswordValue.length < MIN_PASSWORD_LENGTH;

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!user) return;
    try {
      await user.updatePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      });
      toast.success("Password updated");
      form.reset();
    } catch (err: any) {
      // Clerk error handling
      const errors = err?.errors || [];
      const errorCode = errors[0]?.code;
      if (errorCode === "form_password_incorrect") {
        form.setError("currentPassword", { message: "Incorrect password." });
      } else if (errorCode === "form_password_pwned") {
        form.setError("newPassword", { message: "Password has been found in a data breach." });
      } else {
        toast.error("Error changing password");
        console.error(err);
      }
    }
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
