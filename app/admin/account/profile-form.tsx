"use client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

// shadcn RHF wrapper
import { Form, FormField } from "@/components/ui/form";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { api } from "@/trpc/react";
import { toast } from "sonner";

type ProfileFormProps = {
  firstName?: string;
  lastName?: string;
};

const profileSchema = z.object({
  firstname: z.string().min(1, { message: "First name is required" }),
  lastname: z.string().min(1, { message: "Last name is required" }),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileForm({
  firstName: initialFirstName = "",
  lastName: initialLastName = "",
}: ProfileFormProps) {
  const updateAccountMutation = api.account.update.useMutation({
    onError: () => {
      toast.error("Unable to save changes");
    },
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstname: initialFirstName,
      lastname: initialLastName,
    },
    criteriaMode: "all",
    mode: "onTouched",
  });

  async function onSubmit(values: ProfileFormValues) {
    try {
      await updateAccountMutation.mutateAsync(values);
      toast.success("Saved changes");
    } catch {
      /* onError už toastnul */
    }
  }

  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldSet>
              <FieldLegend>Personal details</FieldLegend>
              <FieldDescription>
                Update the name shown across the admin area.
              </FieldDescription>

              <FieldGroup>
                <div className="grid gap-2 grid-cols-2 ms:grid-cols-1">
                  <div className="grid gap-2">
                    <FormField
                      control={form.control}
                      name="firstname"
                      render={({ field, fieldState }) => (
                        <Field
                          orientation="responsive"
                          data-invalid={!!fieldState.error || undefined}
                        >
                          <FieldLabel htmlFor="firstname">First name</FieldLabel>
                          <Input
                            id="firstname"
                            autoComplete="off"
                            placeholder=""
                            {...field} // <- důležité!
                          />
                          <FieldError>
                            {fieldState.error?.message}
                          </FieldError>
                        </Field>
                      )}
                    />
                  </div>

                  <div className="grid gap-2">
                    <FormField
                      control={form.control}
                      name="lastname"
                      render={({ field, fieldState }) => (
                        <Field
                          orientation="responsive"
                          data-invalid={!!fieldState.error || undefined}
                        >
                          <FieldLabel htmlFor="lastname">Last name</FieldLabel>
                          <Input
                            id="lastname"
                            autoComplete="off"
                            placeholder=""
                            {...field} // <- důležité!
                          />
                          <FieldError>
                            {fieldState.error?.message}
                          </FieldError>
                        </Field>
                      )}
                    />
                  </div>
                </div>
              </FieldGroup>

              <Field orientation="horizontal">
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting || updateAccountMutation.isPending}
                >
                  {form.formState.isSubmitting || updateAccountMutation.isPending
                    ? "Saving…"
                    : "Save changes"}
                </Button>
              </Field>
            </FieldSet>
          </form>
        </Form>
      </ItemContent>
    </Item>
  );
}
