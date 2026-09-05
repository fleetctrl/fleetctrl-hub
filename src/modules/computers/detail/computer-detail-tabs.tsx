"use client";
import { useCurrentTime } from "@/hooks/use-current-time";
import { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useAuthQuery } from "@/hooks/use-auth-query";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, relativeTime } from "@/lib/utils";
import { useComputerDetailTab } from "./hooks/use-computer-detail-tab";

type Detail = NonNullable<ReturnType<typeof useComputerDetailTab>>

type Props = {
  detail: Detail;
};

type ComputerData = NonNullable<
  ReturnType<typeof useAuthQuery<typeof api.computers.getById>>
>;

const ONLINE_WINDOW = 5 * 60 * 1000;

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

const changeNetworkStringSchema = z.object({
  networkString: z.string().min(1, { message: "Network string is required" }),
});

type ChangeNetworkStringSchema = z.infer<typeof changeNetworkStringSchema>;

const taskStatusVariant = {
  SUCCESS: "success",
  PENDING: "warning",
  IN_PROGRESS: "secondary",
  ERROR: "destructive",
} satisfies Record<string, "success" | "warning" | "destructive" | "secondary">;

export default function ComputerDetailTabs({ detail }: Props) {
  const now = useCurrentTime();
  if (detail.status === "loading") {
    return (
      <div className="flex w-full flex-col gap-6 py-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (detail.status === "notFound") {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        Computer not found.
      </div>
    );
  }

  const {
    openChangeNetwork,
    setOpenChangeNetwork,
    openChangePassword,
    setOpenChangePassword,
    computer,
    createTask,
    tasks,
  } = detail;

  const isOnline =
    typeof computer.lastConnection === "number" &&
    now - computer.lastConnection < ONLINE_WINDOW;

  return (
    <div className="flex w-full flex-col gap-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              isOnline ? "bg-success" : "bg-muted-foreground/40",
            )}
            title={isOnline ? "Online" : "Offline"}
          />
          <h1 className="truncate text-xl font-semibold">{computer.name}</h1>
          <Badge variant={isOnline ? "success" : "outline"}>
            {isOnline ? "Online" : relativeTime(computer.lastConnection)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
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
            createTask={createTask}
          />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">
            Activity{tasks?.length ? ` (${tasks.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 flex flex-col gap-8">
          <section>
            <SectionTitle>System</SectionTitle>
            <dl>
              <DetailRow label="Computer name">{computer.name}</DetailRow>
              <DetailRow label="OS">
                {computer.os ? (
                  <>
                    {computer.os}
                    {computer.osVersion ? (
                      <span className="text-muted-foreground"> {computer.osVersion}</span>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow label="Client version">
                {computer.clientVersion ?? "—"}
              </DetailRow>
            </dl>
          </section>

          <section>
            <SectionTitle>Hardware</SectionTitle>
            <dl>
              <DetailRow label="Processor">{computer.hardware?.cpu_name ?? "—"}</DetailRow>
              <DetailRow label="Cores / logical CPUs">
                {computer.hardware ? `${computer.hardware.cpu_cores} / ${computer.hardware.cpu_logical_processors}` : "—"}
              </DetailRow>
              <DetailRow label="RAM">{formatBytes(computer.hardware?.ram_bytes)}</DetailRow>
              <DetailRow label="Windows drive">{computer.hardware?.system_drive ?? "—"}</DetailRow>
              <DetailRow label="Drive capacity">{formatBytes(computer.hardware?.system_drive_total_bytes)}</DetailRow>
              <DetailRow label="Free space">{formatBytes(computer.hardware?.system_drive_free_bytes)}</DetailRow>
              <DetailRow label="Last inventory">
                {computer.lastInventoryAt ? new Date(computer.lastInventoryAt).toLocaleString("cs") : "—"}
              </DetailRow>
            </dl>
          </section>

          <section>
            <SectionTitle>Remote access</SectionTitle>
            <dl>
              <DetailRow label="RustDesk ID">
                <span className="tabular-nums">
                  {computer.rustdeskId?.toString() ?? "—"}
                </span>
              </DetailRow>
              {computer.intuneId && (
                <DetailRow label="Intune ID">
                  <span className="break-all">{computer.intuneId}</span>
                </DetailRow>
              )}
              <DetailRow label="IP address">
                <span className="tabular-nums">{computer.ip ?? "—"}</span>
              </DetailRow>
            </dl>
          </section>

          <section>
            <SectionTitle>Usage</SectionTitle>
            <dl>
              <DetailRow label="Login user">
                {computer.loginUser ?? "—"}
              </DetailRow>
              <DetailRow label="Last check-in">
                {typeof computer.lastConnection === "number"
                  ? `${new Date(computer.lastConnection).toLocaleString("cs")} (${relativeTime(computer.lastConnection)})`
                  : "—"}
              </DetailRow>
            </dl>
          </section>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {tasks?.length ? (
            <div className="overflow-hidden rounded-sm border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.taskType}</TableCell>
                      <TableCell>
                        <Badge variant={taskStatusVariant[task.status] ?? "secondary"}>
                          {task.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(task.createdAt).toLocaleString("cs")}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-destructive">
                        {task.error ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="rounded-sm border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              No device actions yet.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatBytes(bytes: number | undefined) {
  return bytes === undefined ? "—" : `${(bytes / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 1 })} GiB`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-baseline gap-4 border-b border-border/60 py-2.5 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ChangePasswordDialog({
  computer,
  open,
  setOpen,
  createTask,
}: {
  computer: ComputerData;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  createTask: any;
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
        <Button size="sm">Change Password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set new RustDesk password</DialogTitle>
          <DialogDescription>
            A task will be created and executed on the device.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    Must be at least 8 characters, contain one uppercase letter
                    and one number.
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
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full">
              Change Password
            </Button>
          </form>
        </Form>
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
  createTask: any;
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
        <Button size="sm" variant="outline">
          Change Network
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Network</DialogTitle>
          <DialogDescription>
            A task will be created and executed on the device.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="networkString"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Network String</FormLabel>
                  <FormControl>
                    <Input type="text" {...field} />
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
      </DialogContent>
    </Dialog>
  );
}
