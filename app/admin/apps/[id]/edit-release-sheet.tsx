"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const assignmentSchema = z.object({
    groupId: z.string(),
    mode: z.enum(["include", "exclude"]),
});

const formSchema = z.object({
    version: z.string().min(1, {
        message: "Version is required.",
    }),
    uninstall_previous: z.boolean(),
    disabled: z.boolean(),
    assignments: z.object({
        installGroups: z.array(assignmentSchema),
        uninstallGroups: z.array(assignmentSchema),
    }),
});

interface EditReleaseSheetProps {
    appId: string;
    release: {
        id: string;
        version: string;
        uninstall_previous?: boolean;
        disabled_at: string | null;
        computer_group_releases?: {
            assign_type: "include" | "exclude";
            action: "install" | "uninstall";
            computer_groups: {
                id: string;
                display_name: string;
            } | null;
        }[];
    } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EditReleaseSheet({
    appId,
    release,
    open,
    onOpenChange,
}: EditReleaseSheetProps) {
    const router = useRouter();
    const utils = api.useUtils();
    const { data: groups } = api.group.getAll.useQuery();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            version: "",
            uninstall_previous: false,
            disabled: false,
            assignments: {
                installGroups: [],
                uninstallGroups: [],
            },
        },
    });

    const {
        fields: installFields,
        append: appendInstall,
        remove: removeInstall
    } = useFieldArray({
        control: form.control,
        name: "assignments.installGroups"
    });

    const {
        fields: uninstallFields,
        append: appendUninstall,
        remove: removeUninstall
    } = useFieldArray({
        control: form.control,
        name: "assignments.uninstallGroups"
    });

    useEffect(() => {
        if (release) {
            const installGroups = release.computer_group_releases
                ?.filter((r) => r.action === "install")
                .map((r) => ({
                    groupId: Array.isArray(r.computer_groups) ? r.computer_groups[0]?.id : r.computer_groups?.id || "", // safely handle if it somehow is different
                    mode: r.assign_type,
                })) || [];

            const uninstallGroups = release.computer_group_releases
                ?.filter((r) => r.action === "uninstall")
                .map((r) => ({
                    groupId: Array.isArray(r.computer_groups) ? r.computer_groups[0]?.id : r.computer_groups?.id || "",
                    mode: r.assign_type,
                })) || [];

            // We must filter out any where groupId failed to resolve (shouldn't happen with correct join)
            // Assuming r.computer_groups is strictly typed from query but just safe casting

            form.reset({
                version: release.version === "latest" ? "" : release.version,
                uninstall_previous: release.uninstall_previous || false,
                disabled: !!release.disabled_at,
                assignments: {
                    installGroups: installGroups.filter(g => g.groupId),
                    uninstallGroups: uninstallGroups.filter(g => g.groupId),
                },
            });
        }
    }, [release, form]);

    const updateMutation = api.app.updateRelease.useMutation({
        onSuccess: () => {
            toast.success("Release updated successfully");
            onOpenChange(false);
            router.refresh();
            utils.app.getReleases.invalidate({ appId });
        },
        onError: (error) => {
            toast.error(`Error updating release: ${error.message}`);
        },
    });

    function onSubmit(values: z.infer<typeof formSchema>) {
        if (!release) return;

        updateMutation.mutate({
            id: release.id,
            data: values,
        });
    }

    const getGroupName = (id: string) =>
        groups?.find((g) => g.id === id)?.display_name || "Unknown Group";

    function handleOpenChange(isOpen: boolean) {
        if (!isOpen && release) {
            const installGroups = release.computer_group_releases
                ?.filter((r) => r.action === "install")
                .map((r) => ({
                    groupId: Array.isArray(r.computer_groups) ? r.computer_groups[0]?.id : r.computer_groups?.id || "",
                    mode: r.assign_type,
                })) || [];

            const uninstallGroups = release.computer_group_releases
                ?.filter((r) => r.action === "uninstall")
                .map((r) => ({
                    groupId: Array.isArray(r.computer_groups) ? r.computer_groups[0]?.id : r.computer_groups?.id || "",
                    mode: r.assign_type,
                })) || [];

            form.reset({
                version: release.version === "latest" ? "" : release.version,
                uninstall_previous: release.uninstall_previous || false,
                disabled: !!release.disabled_at,
                assignments: {
                    installGroups: installGroups.filter(g => g.groupId),
                    uninstallGroups: uninstallGroups.filter(g => g.groupId),
                },
            });
        }
        onOpenChange(isOpen);
    }

    if (!release) return null;

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent className="overflow-y-auto max-h-screen">
                <SheetHeader>
                    <SheetTitle>Edit Release</SheetTitle>
                    <SheetDescription>
                        Modify release details and assignments.
                    </SheetDescription>
                </SheetHeader>
                <Form {...form}>
                    <form
                        id="edit-release-form"
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-6 px-4 pt-4"
                    >
                        <Tabs defaultValue="details" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="details">Details</TabsTrigger>
                                <TabsTrigger value="assignments">Assignments</TabsTrigger>
                            </TabsList>
                            <TabsContent value="details" className="space-y-4 py-4">
                                <FormField
                                    control={form.control}
                                    name="version"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Version</FormLabel>
                                            <FormControl>
                                                <Input placeholder="1.0.0" {...field} />
                                            </FormControl>
                                            <FormDescription>
                                                Use specific version number.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="uninstall_previous"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                            <div className="space-y-0.5">
                                                <FormLabel>Uninstall Previous</FormLabel>
                                                <FormDescription>
                                                    Uninstall previous version first.
                                                </FormDescription>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="disabled"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                            <div className="space-y-0.5">
                                                <FormLabel>Disabled</FormLabel>
                                                <FormDescription>
                                                    Prevent installation.
                                                </FormDescription>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </TabsContent>
                            <TabsContent value="assignments" className="space-y-6 py-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Install Assignments</h3>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => appendInstall({ groupId: "", mode: "include" })}
                                        >
                                            <Plus className="h-4 w-4 mr-1" /> Add
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        {installFields.map((field, index) => (
                                            <div key={field.id} className="flex gap-2 items-center">
                                                <FormField
                                                    control={form.control}
                                                    name={`assignments.installGroups.${index}.groupId`}
                                                    render={({ field }) => (
                                                        <FormItem className="flex-1">
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select group" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    {groups?.map((g) => (
                                                                        <SelectItem key={g.id} value={g.id}>{g.display_name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`assignments.installGroups.${index}.mode`}
                                                    render={({ field }) => (
                                                        <FormItem className="w-24">
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="include">Include</SelectItem>
                                                                    <SelectItem value="exclude">Exclude</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeInstall(index)} className="shrink-0">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                        {installFields.length === 0 && (
                                            <div className="text-sm text-muted-foreground text-center py-2 border rounded-md border-dashed">
                                                No install assignments.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Uninstall Assignments</h3>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => appendUninstall({ groupId: "", mode: "include" })}
                                        >
                                            <Plus className="h-4 w-4 mr-1" /> Add
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        {uninstallFields.map((field, index) => (
                                            <div key={field.id} className="flex gap-2 items-center">
                                                <FormField
                                                    control={form.control}
                                                    name={`assignments.uninstallGroups.${index}.groupId`}
                                                    render={({ field }) => (
                                                        <FormItem className="flex-1">
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select group" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    {groups?.map((g) => (
                                                                        <SelectItem key={g.id} value={g.id}>{g.display_name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`assignments.uninstallGroups.${index}.mode`}
                                                    render={({ field }) => (
                                                        <FormItem className="w-24">
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="include">Include</SelectItem>
                                                                    <SelectItem value="exclude">Exclude</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeUninstall(index)} className="shrink-0">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                        {uninstallFields.length === 0 && (
                                            <div className="text-sm text-muted-foreground text-center py-2 border rounded-md border-dashed">
                                                No uninstall assignments.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </form>
                </Form>
                <SheetFooter>
                    <Button
                        type="submit"
                        form="edit-release-form"
                        disabled={updateMutation.isPending}
                    >
                        {updateMutation.isPending ? "Saving..." : "Save changes"}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
