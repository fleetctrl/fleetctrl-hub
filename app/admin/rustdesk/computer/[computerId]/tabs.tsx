"use client";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { RustDesk } from "@/server/api/routers/rustdesk";
import { api } from "@/trpc/react";

type Props = {
  computer: RustDesk;
};

type TableRowProps = {
  name: string;
  value: string;
};

export const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters long" })
  .regex(/[A-Z]/, {
    message: "Password must contain at least one uppercase letter",
  })
  .regex(/\d/, {
    message: "Password must contain at least one number",
  });

export const passwordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

type ChangePassworFormValues = z.infer<typeof passwordFormSchema>;

const changeNetworkStringSchema = z.object({ networkString: z.string().min(1, { message: "Network string is required" }) });

type ChangeNetworkStringSchema = z.infer<typeof changeNetworkStringSchema>;

export default function Tabs({ computer }: Props) {
  const [openChangePassword, setOpenChangePassword] = useState(false);
  const [openChangeNetwork, setOpenChangeNetwork] = useState(false);

  const { data: tasks, refetch } = api.rustdesk.getTasks.useQuery({ id: computer.id });
  const createTaskMutation = api.rustdesk.createTask.useMutation({
    onSuccess: () => {
      toast.success("Password was changed");
    },
    onError: () => {
      toast.error("Failed to change password");
    },
  });

  return (
    <div className="flex gap-5 w-full">
      <div className="flex flex-col w-full gap-3">
        <div className="flex gap-2 mb-2">
          <ChangePasswordDialog
            computer={computer}
            open={openChangePassword}
            setOpen={setOpenChangePassword}
            onClose={() => void refetch()}
            createTaskMutation={createTaskMutation}
          />
          <ChangeNetworkStringDialog
            computer={computer}
            open={openChangeNetwork}
            setOpen={setOpenChangeNetwork}
            onClose={() => void refetch()}
            createTaskMutation={createTaskMutation} />
        </div>
        <hr />

        <div className="flex flex-col gap-3 w-full">
          <table className="w-full">
            <tbody>
              <TableRow
                name="RustDesk ID"
                value={computer.rustdeskID?.toString() ?? ""}
              />
              <TableRow name="Computer name" value={computer?.name ?? ""} />
              <TableRow name="Computer IP" value={computer.ip ?? ""} />
              <TableRow name="User" value={computer.loginUser ?? ""} />
              {computer.lastConnection && (
                <TableRow
                  name="Last check-in time"
                  value={new Date(computer.lastConnection).toLocaleString("cs")}
                />
              )}
              <TableRow name="Windows type" value={computer.os ?? ""} />
              <TableRow
                name="Windows version"
                value={computer.osVersion ?? ""}
              />
            </tbody>
          </table>
          <hr className="w-full" />
          <div>
            <h2>Device actions</h2>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-5 py-2 text-left">Action</th>
                  <th className="px-5 py-2 text-left">Status</th>
                  <th className="px-5 py-2 text-left">Date/Time</th>
                  <th className="px-5 py-2 text-left">Error</th>
                </tr>
              </thead>
              <tbody>
                {tasks?.map((task) => {
                  return (
                    <tr key={task.id}>
                      <td className="px-5 py-2 text-left">{task.task}</td>
                      <td className="px-5 py-2 text-left">{task.status}</td>
                      <td className="px-5 py-2 text-left">
                        {new Date(task.created_at).toLocaleString("cs")}
                      </td>
                      <td className="px-5 py-2 text-left">
                        {task.error ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableRow({ name, value }: TableRowProps) {
  return (
    <tr>
      <td className="py-1 pr-2 whitespace-nowrap">{name}</td>
      <td className="py-1">
        <span className="px-2">:</span>
        <span>{value}</span>
      </td>
    </tr>
  );
}

function ChangePasswordDialog({
  computer,
  open,
  setOpen,
  onClose,
  createTaskMutation
}: {
  computer: RustDesk;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onClose: () => void;
  createTaskMutation: any
}) {
  // const createTaskMutation = api.rustdesk.createTask.useMutation({
  //   onSuccess: () => {
  //     toast.success("Password was changed");
  //     setOpen(false);
  //     onClose();
  //     form.reset();
  //   },
  //   onError: () => {
  //     toast.error("Failed to change password");
  //   },
  // });
  const form = useForm<ChangePassworFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: ChangePassworFormValues) {
    const taskData = {
      password: values.password,
    };

    createTaskMutation.mutate({
      task: "SET_PASSWORD",
      taskData: taskData,
      computerID: computer.id,
    });

    if (!createTaskMutation.error) {
      setOpen(false);
      onClose();
      form.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={"secondary"}>Change Password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set new RustDesk password</DialogTitle>
          <DialogDescription asChild>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                {/* Password */}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormDescription>
                        Must be at least 8 characters, contain one uppercase
                        letter and one number.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Confirm Password */}
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormDescription>
                        Re-enter your new password to confirm.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full">
                  Change Password
                </Button>
              </form>
            </Form>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

function ChangeNetworkStringDialog({
  computer,
  open,
  setOpen,
  onClose,
  createTaskMutation,
}: {
  computer: RustDesk;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onClose: () => void;
  createTaskMutation: any
}) {
  const form = useForm<ChangeNetworkStringSchema>({
    resolver: zodResolver(changeNetworkStringSchema),
    defaultValues: {
      networkString: "",
    },
  });

  async function onSubmit(values: ChangeNetworkStringSchema) {
    const taskData = {
      networkString: values.networkString,
    };

    createTaskMutation.mutate({
      task: "SET_NETWORK_STRING",
      taskData: taskData,
      computerID: computer.id,
    });

    if (!createTaskMutation.error) {
      setOpen(false);
      onClose();
      form.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={"secondary"}>Change Network</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Network</DialogTitle>
          <DialogDescription asChild>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                {/* Network String */}
                <FormField
                  control={form.control}
                  name="networkString"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Network String</FormLabel>
                      <FormControl>
                        <Input type="networkString" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full">
                  Change Network
                </Button>
              </form>
            </Form>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
