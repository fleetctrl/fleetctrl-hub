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
import { useEffect } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { X, Plus, Trash2, Pencil, Upload } from "lucide-react";
import { detectionItemSchema, storedFileReferenceSchema } from "@/lib/schemas/create-app";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/ui/shadcn-io/dropzone";
import { uploadFileToTempStorage, StoredFileReference } from "@/lib/storage/temp-storage";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const assignmentSchema = z.object({
    groupId: z.string(),
    mode: z.enum(["include", "exclude"]),
});

const createFormSchema = (isAutoUpdate: boolean) => z.object({
    version: isAutoUpdate
        ? z.string().optional()
        : z.string().min(1, {
            message: "Version is required.",
        }),
    uninstall_previous: z.boolean(),
    disabled: z.boolean(),
    assignments: z.object({
        installGroups: z.array(assignmentSchema),
        uninstallGroups: z.array(assignmentSchema),
    }),
    detections: z.array(detectionItemSchema),
    requirements: z.object({
        timeout: z.number(),
        runAsSystem: z.boolean(),
        requirementScriptBinary: storedFileReferenceSchema.optional(),
    }).optional(),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface EditReleaseSheetProps {
    appId: string;
    isAutoUpdate?: boolean;
    release: {
        id: string;
        version: string;
        installer_type: string;
        uninstall_previous?: boolean;
        disabled_at: string | null;
        computer_group_releases?: {
            assign_type: string;
            action: string;
            computer_groups: {
                id: string;
                display_name: string;
            } | { id: string; display_name: string; }[] | null;
        }[];
        detection_rules?: {
            type: string;
            config: any;
        }[];
        release_requirements?: {
            timeout_seconds: number;
            run_as_system: boolean;
            storage_path: string;
            bucket: string;
            byte_size: number;
            hash: string;
        }[];
    } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const DEFAULT_DETECTION_VALUES: z.infer<typeof detectionItemSchema> = {
    type: "file",
    path: "",
    fileType: "exists",
    fileTypeValue: "",
    registryKey: "",
    registryType: "exists",
    registryTypeValue: "",
};

const toDropzonePreview = (
    file?: StoredFileReference | null
): File[] | undefined => {
    if (!file) {
        return undefined;
    }

    return [
        {
            name: file.name,
            size: file.size,
            type: file.type ?? "application/octet-stream",
            lastModified: Date.now(),
        } as File,
    ];
};

export function EditReleaseSheet({
    appId,
    isAutoUpdate = false,
    release,
    open,
    onOpenChange,
}: EditReleaseSheetProps) {
    const router = useRouter();
    const utils = api.useUtils();
    const { data: groups } = api.group.getAll.useQuery();

    const formSchema = createFormSchema(isAutoUpdate);
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            version: "",
            uninstall_previous: false,
            disabled: false,
            assignments: {
                installGroups: [],
                uninstallGroups: [],
            },
            detections: [],
            requirements: {
                timeout: 60,
                runAsSystem: false,
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

    const {
        fields: detectionsFields,
        append: appendDetection,
        remove: removeDetection,
        update: updateDetection
    } = useFieldArray({
        control: form.control,
        name: "detections"
    });

    const [isUploadingRequirement, setIsUploadingRequirement] = useState(false);
    const [isDetectionSheetOpen, setIsDetectionSheetOpen] = useState(false);
    const [editingDetectionIndex, setEditingDetectionIndex] = useState<number | null>(null);

    useEffect(() => {
        if (release) {
            const installGroups = release.computer_group_releases
                ?.filter((r) => r.action === "install")
                .map((r) => ({
                    groupId: Array.isArray(r.computer_groups) ? r.computer_groups[0]?.id : r.computer_groups?.id || "",
                    mode: r.assign_type as "include" | "exclude",
                })) || [];

            const uninstallGroups = release.computer_group_releases
                ?.filter((r) => r.action === "uninstall")
                .map((r) => ({
                    groupId: Array.isArray(r.computer_groups) ? r.computer_groups[0]?.id : r.computer_groups?.id || "",
                    mode: r.assign_type as "include" | "exclude",
                })) || [];

            const detections = release.detection_rules?.map((d) => {
                const config = d.config;
                if (d.type === "file") {
                    return {
                        type: "file" as const,
                        path: config.path || "",
                        fileType: (config.operator || "exists") as any,
                        fileTypeValue: config.value || "",
                    };
                } else {
                    return {
                        type: "registry" as const,
                        path: config.path || "", // Keep path as it might be required
                        registryKey: config.path || "",
                        registryType: (config.operator || "exists") as any,
                        registryTypeValue: config.value || "",
                    };
                }
            }) || [];

            const requirement = release.release_requirements?.[0];

            form.reset({
                version: release.version === "latest" ? "" : release.version,
                uninstall_previous: release.uninstall_previous || false,
                disabled: !!release.disabled_at,
                assignments: {
                    installGroups: installGroups.filter(g => g.groupId),
                    uninstallGroups: uninstallGroups.filter(g => g.groupId),
                },
                detections,
                requirements: requirement ? {
                    timeout: requirement.timeout_seconds,
                    runAsSystem: requirement.run_as_system,
                    requirementScriptBinary: undefined, // Don't reset binary unless uploaded
                } : {
                    timeout: 60,
                    runAsSystem: false,
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

    function onSubmit(values: FormValues) {
        if (!release) return;

        updateMutation.mutate({
            id: release.id,
            data: values,
        });
    }


    function handleOpenChange(isOpen: boolean) {
        if (!isOpen && release) {
            const installGroups = release.computer_group_releases
                ?.filter((r) => r.action === "install")
                .map((r) => ({
                    groupId: Array.isArray(r.computer_groups) ? r.computer_groups[0]?.id : r.computer_groups?.id || "",
                    mode: r.assign_type as "include" | "exclude",
                })) || [];

            const uninstallGroups = release.computer_group_releases
                ?.filter((r) => r.action === "uninstall")
                .map((r) => ({
                    groupId: Array.isArray(r.computer_groups) ? r.computer_groups[0]?.id : r.computer_groups?.id || "",
                    mode: r.assign_type as "include" | "exclude",
                })) || [];

            const detections = release.detection_rules?.map((d) => {
                const config = d.config;
                if (d.type === "file") {
                    return {
                        type: "file" as const,
                        path: config.path || "",
                        fileType: (config.operator || "exists") as any,
                        fileTypeValue: config.value || "",
                    };
                } else {
                    return {
                        type: "registry" as const,
                        path: config.path || "",
                        registryKey: config.path || "",
                        registryType: (config.operator || "exists") as any,
                        registryTypeValue: config.value || "",
                    };
                }
            }) || [];

            const requirement = release.release_requirements?.[0];

            form.reset({
                version: release.version === "latest" ? "" : release.version,
                uninstall_previous: release.uninstall_previous || false,
                disabled: !!release.disabled_at,
                assignments: {
                    installGroups: installGroups.filter(g => g.groupId),
                    uninstallGroups: uninstallGroups.filter(g => g.groupId),
                },
                detections,
                requirements: requirement ? {
                    timeout: requirement.timeout_seconds,
                    runAsSystem: requirement.run_as_system,
                    requirementScriptBinary: undefined,
                } : {
                    timeout: 60,
                    runAsSystem: false,
                },
            });
        }
        onOpenChange(isOpen);
    }

    const popupForm = useForm<z.infer<typeof detectionItemSchema>>({
        resolver: zodResolver(detectionItemSchema),
        defaultValues: DEFAULT_DETECTION_VALUES,
    });

    const popupType = popupForm.watch("type");
    const popupFileType = popupForm.watch("fileType");
    const popupRegistryType = popupForm.watch("registryType");

    const onSubmitDetection = popupForm.handleSubmit((values) => {
        if (editingDetectionIndex !== null) {
            updateDetection(editingDetectionIndex, values);
        } else {
            appendDetection(values);
        }
        setEditingDetectionIndex(null);
        popupForm.reset(DEFAULT_DETECTION_VALUES);
        setIsDetectionSheetOpen(false);
    });

    const handleEditDetection = (index: number) => {
        const detection = detectionsFields[index];
        if (!detection) return;

        setEditingDetectionIndex(index);
        popupForm.reset({
            type: detection.type as any,
            path: detection.path ?? "",
            fileType: detection.fileType as any,
            fileTypeValue: detection.fileTypeValue ?? "",
            registryKey: detection.registryKey ?? "",
            registryType: detection.registryType as any,
            registryTypeValue: detection.registryTypeValue ?? "",
        });
        setIsDetectionSheetOpen(true);
    };

    if (!release) return null;

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent className="overflow-y-auto max-h-screen sm:max-w-[500px]">
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
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="details">Details</TabsTrigger>
                                <TabsTrigger value="requirements">Requirements</TabsTrigger>
                                <TabsTrigger value="detections">Detections</TabsTrigger>
                                <TabsTrigger value="assignments">Assignments</TabsTrigger>
                            </TabsList>
                            <TabsContent value="details" className="space-y-4 py-4">
                                {!isAutoUpdate && (
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
                                )}
                                {!isAutoUpdate && (
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
                                )}
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

                            <TabsContent value="requirements" className="space-y-6 py-4">
                                <FormField
                                    control={form.control}
                                    name="requirements.requirementScriptBinary"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Requirement Script</FormLabel>
                                            <Dropzone
                                                src={toDropzonePreview(field.value)}
                                                accept={{ "text/plain": [".ps1"] }}
                                                maxFiles={1}
                                                maxSize={1024 * 1024 * 20}
                                                disabled={isUploadingRequirement}
                                                onDrop={(files) => {
                                                    const file = files.at(0);
                                                    if (!file) return;
                                                    setIsUploadingRequirement(true);
                                                    void (async () => {
                                                        try {
                                                            const uploaded = await uploadFileToTempStorage({
                                                                file,
                                                                category: "requirements",
                                                            });
                                                            field.onChange(uploaded);
                                                            toast.success("Requirement script uploaded");
                                                        } catch (err) {
                                                            toast.error("Failed to upload requirement script");
                                                            console.error(err);
                                                        } finally {
                                                            setIsUploadingRequirement(false);
                                                        }
                                                    })();
                                                }}
                                            >
                                                <DropzoneEmptyState />
                                                <DropzoneContent />
                                            </Dropzone>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="requirements.timeout"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Timeout (s)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="requirements.runAsSystem"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                                <div className="space-y-0.5">
                                                    <FormLabel>Run as System</FormLabel>
                                                </div>
                                                <FormControl>
                                                    <Switch
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </TabsContent>

                            <TabsContent value="detections" className="space-y-6 py-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Detection Rules</h3>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setEditingDetectionIndex(null);
                                                popupForm.reset(DEFAULT_DETECTION_VALUES);
                                                setIsDetectionSheetOpen(true);
                                            }}
                                        >
                                            <Plus className="h-4 w-4 mr-1" /> Add
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        {detectionsFields.map((field, index) => (
                                            <Card key={field.id} className="border-border/60">
                                                <CardContent className="p-3 flex items-center justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="capitalize">{field.type}</Badge>
                                                            <span className="font-medium text-sm truncate block">
                                                                {field.type === "file" ? field.path : field.registryKey}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-1 truncate">
                                                            {field.type === "file" ? field.fileType : field.registryType}
                                                            {field.fileTypeValue || field.registryTypeValue ? `: ${field.fileTypeValue || field.registryTypeValue}` : ""}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleEditDetection(index)}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeDetection(index)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                        {detectionsFields.length === 0 && (
                                            <div className="text-sm text-muted-foreground text-center py-6 border rounded-md border-dashed">
                                                No detection rules.
                                            </div>
                                        )}
                                    </div>
                                </div>
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

            <Sheet open={isDetectionSheetOpen} onOpenChange={setIsDetectionSheetOpen}>
                <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>{editingDetectionIndex !== null ? "Edit Detection" : "Add Detection"}</SheetTitle>
                    </SheetHeader>
                    <Form {...popupForm}>
                        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void onSubmitDetection(); }} className="space-y-4 pt-4 px-4">
                            <FormField
                                control={popupForm.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Type</FormLabel>
                                        <Select onValueChange={(val) => {
                                            field.onChange(val);
                                            // Reset fields when switching types to avoid leakage
                                            if (val === "registry") {
                                                popupForm.setValue("path", popupForm.getValues("registryKey") || "");
                                            } else {
                                                popupForm.setValue("registryKey", popupForm.getValues("path") || "");
                                            }
                                        }} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="file">File</SelectItem>
                                                <SelectItem value="registry">Registry</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {popupType === "file" ? (
                                <>
                                    <FormField
                                        control={popupForm.control}
                                        name="path"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Path</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="C:\Path\To\File.exe"
                                                        {...field}
                                                        onChange={(e) => {
                                                            field.onChange(e);
                                                            popupForm.setValue("registryKey", e.target.value);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={popupForm.control}
                                        name="fileType"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Detection Method</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="exists">File exists</SelectItem>
                                                        <SelectItem value="version_equal">Version equals</SelectItem>
                                                        <SelectItem value="version_equal_or_higher">Version equal or higher</SelectItem>
                                                        <SelectItem value="version_equal_or_lower">Version equal or lower</SelectItem>
                                                        <SelectItem value="version_higher">Version higher</SelectItem>
                                                        <SelectItem value="version_lower">Version lower</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {popupFileType !== "exists" && (
                                        <FormField
                                            control={popupForm.control}
                                            name="fileTypeValue"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Version</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="1.2.3.4" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </>
                            ) : (
                                <>
                                    <FormField
                                        control={popupForm.control}
                                        name="registryKey"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Registry Key</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="HKEY_LOCAL_MACHINE\..."
                                                        {...field}
                                                        onChange={(e) => {
                                                            field.onChange(e);
                                                            popupForm.setValue("path", e.target.value);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={popupForm.control}
                                        name="registryType"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Detection Method</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="exists">Key exists</SelectItem>
                                                        <SelectItem value="string">String match</SelectItem>
                                                        <SelectItem value="version_equal">Version equals</SelectItem>
                                                        <SelectItem value="version_equal_or_higher">Version equal or higher</SelectItem>
                                                        <SelectItem value="version_equal_or_lower">Version equal or lower</SelectItem>
                                                        <SelectItem value="version_higher">Version higher</SelectItem>
                                                        <SelectItem value="version_lower">Version lower</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {popupRegistryType !== "exists" && (
                                        <FormField
                                            control={popupForm.control}
                                            name="registryTypeValue"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Value</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </>
                            )}

                            <SheetFooter className="pt-4">
                                <Button type="submit">
                                    {editingDetectionIndex !== null ? "Save Changes" : "Add Detection"}
                                </Button>
                            </SheetFooter>
                        </form>
                    </Form>
                </SheetContent>
            </Sheet>
        </Sheet>
    );
}
