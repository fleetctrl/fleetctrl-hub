"use client";
import { Dispatch, SetStateAction, useState } from "react";
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
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  computerId: Id<"computers">;
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

// Define a type for the computer data returned by the query
type ComputerData = NonNullable<ReturnType<typeof useQuery<typeof api.computers.getById>>>;

export default function Tabs({ computerId }: Props) {
  const [openChangePassword, setOpenChangePassword] = useState(false);
  const [openChangeNetwork, setOpenChangeNetwork] = useState(false);

  const computer = useQuery(api.computers.getById, { id: computerId });
  const tasks = useQuery(api.tasks.getByComputer, { computerId });
  const createTask = useMutation(api.tasks.create);

  const isLoading = computer === undefined;

  if (isLoading) {
    return (
      <>
        <SiteHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin/rustdesk">RustDesk</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><Skeleton className="h-4 w-24" /></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </SiteHeader>
        <div className="container mx-auto w-full px-4 py-6">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (computer === null) {
    return (
      <>
        <SiteHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin/rustdesk">RustDesk</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>Not Found</BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </SiteHeader>
        <div className="container mx-auto w-full px-4 py-6">
          Computer not found
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin/rustdesk">RustDesk</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>{computer?.name ?? ""}</BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </SiteHeader>
      <div className="container mx-auto w-full px-4 py-6">
        <div className="flex flex-col w-full gap-6">
          <div className="w-full">
            <h1 className="text-3xl font-bold">{computer?.name ?? ""}</h1>
          </div>
          <div className="flex w-full">
            <div className="flex gap-5 w-full">
              <div className="flex flex-col w-full gap-3">
                <div className="flex gap-2 mb-2">
                  <ChangePasswordDialog
                    computer={computer}
                    open={openChangePassword}
                    setOpen={setOpenChangePassword}
                    createTask={createTask}
                  />
                  <ChangeNetworkStringDialog
                    computer={computer}
                    open={openChangeNetwork}
                    setOpen={setOpenChangeNetwork}
                    createTask={createTask} />
                </div>
                <hr />

                <div className="flex flex-col gap-3 w-full">
                  <table className="w-full">
                    <tbody>
                      <TableRow
                        name="RustDesk ID"
                        value={computer.rustdeskId?.toString() ?? ""}
                      />
                      {computer.intuneId && (
                        <TableRow
                          name="Intune ID"
                          value={computer.intuneId}
                        />
                      )}
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
                      <TableRow
                        name="Client version"
                        value={computer.clientVersion ?? "—"}
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
                              <td className="px-5 py-2 text-left">{task.taskType}</td>
                              <td className="px-5 py-2 text-left">{task.status}</td>
                              <td className="px-5 py-2 text-left">
                                {new Date(task.createdAt).toLocaleString("cs")}
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
          </div>
        </div>
      </div>
    </>
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
  createTask
}: {
  computer: ComputerData;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  createTask: any // Typing mutations is tricky without inferred types, 'any' is safe here if usage is correct
}) {
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

    try {
      await createTask({
        taskType: "SET_PASSWD",
        taskData: taskData,
        computerId: computer.id,
      });
      toast.success("Password change task created");
      setOpen(false);
      form.reset();
    } catch (error) {
      toast.error("Failed to change password");
      console.error(error);
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
  createTask,
}: {
  computer: ComputerData;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  createTask: any
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

    try {
      await createTask({
        taskType: "SET_NETWORK_STRING",
        taskData: taskData,
        computerId: computer.id,
      });
      toast.success("Network string change task created");
      setOpen(false);
      form.reset();
    } catch (error) {
      toast.error("Failed to change network string");
      console.error(error);
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
