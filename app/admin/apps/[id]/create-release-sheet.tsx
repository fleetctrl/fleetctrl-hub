"use client";

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
import { useForm } from "react-hook-form";
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
import { useEffect, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    Dropzone,
    DropzoneContent,
    DropzoneEmptyState,
} from "@/components/ui/shadcn-io/dropzone";
import {
    deleteStoredFile,
    StoredFileReference,
    uploadFileToTempStorage,
} from "@/lib/storage/temp-storage";

const storedFileSchema = z.object({
    bucket: z.string(),
    path: z.string(),
    name: z.string(),
    size: z.number(),
    type: z.string().optional().nullable(),
    hash: z.string().optional(),
});

const createFormSchema = (isAutoUpdate: boolean) => z.object({
    type: z.enum(["winget", "win32"]),
    version: z.string().optional(),
    uninstall_previous: z.boolean(),
    wingetId: z.string().optional(),
    installBinary: storedFileSchema.optional(),
    installScript: z.string().optional(),
    uninstallScript: z.string().optional(),
}).superRefine((data, ctx) => {
    // Version is required only if NOT autoUpdate
    if (!isAutoUpdate && !data.version) {
        ctx.addIssue({
            code: "custom",
            message: "Version is required",
            path: ["version"],
        });
    }
    if (data.type === "winget" && !data.wingetId) {
        ctx.addIssue({
            code: "custom",
            message: "Winget ID is required",
            path: ["wingetId"],
        });
    }
    if (data.type === "win32" && !data.installBinary) {
        ctx.addIssue({
            code: "custom",
            message: "Install binary is required",
            path: ["installBinary"],
        });
    }
    if (data.type === "win32" && !data.installScript) {
        ctx.addIssue({
            code: "custom",
            message: "Install script is required",
            path: ["installScript"],
        });
    }
    if (data.type === "win32" && !data.uninstallScript) {
        ctx.addIssue({
            code: "custom",
            message: "Uninstall script is required",
            path: ["uninstallScript"],
        });
    }
});

interface CreateReleaseSheetProps {
    appId: string;
    isAutoUpdate: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const toDropzonePreview = (file?: StoredFileReference | null): File[] | undefined => {
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

export function CreateReleaseSheet({
    appId,
    isAutoUpdate,
    open,
    onOpenChange,
}: CreateReleaseSheetProps) {
    const router = useRouter();
    const utils = api.useUtils();
    const [isUploadingBinary, setIsUploadingBinary] = useState(false);

    const formSchema = createFormSchema(isAutoUpdate);
    type FormValues = z.infer<typeof formSchema>;

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            type: "winget",
            version: "",
            uninstall_previous: false,
            wingetId: "",
            installBinary: undefined,
            installScript: "",
            uninstallScript: "",
        },
    });

    const watchedType = form.watch("type");

    // Cleanup binary when switching away from win32
    useEffect(() => {
        if (watchedType !== "win32") {
            const binary = form.getValues("installBinary");
            if (binary) {
                form.setValue("installBinary", undefined);
                void deleteStoredFile({ file: binary }).catch(() => undefined);
            }
        }
    }, [watchedType, form]);

    const createMutation = api.app.createRelease.useMutation({
        onSuccess: () => {
            toast.success("Release created successfully");
            onOpenChange(false);
            form.reset();
            router.refresh();
            utils.app.getReleases.invalidate({ appId });
        },
        onError: (error) => {
            toast.error(`Error creating release: ${error.message}`);
        },
    });

    function onSubmit(values: FormValues) {
        createMutation.mutate({
            appId,
            type: values.type,
            version: isAutoUpdate ? "latest" : values.version || "",
            uninstall_previous: values.uninstall_previous,
            wingetId: values.wingetId,
            installBinary: values.installBinary,
            installScript: values.installScript,
            uninstallScript: values.uninstallScript,
        });
    }

    function handleOpenChange(isOpen: boolean) {
        if (!isOpen) {
            // Cleanup uploaded binary if closing without save
            const binary = form.getValues("installBinary");
            if (binary) {
                void deleteStoredFile({ file: binary }).catch(() => undefined);
            }
            form.reset();
        }
        onOpenChange(isOpen);
    }

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent className="overflow-y-auto max-h-screen">
                <SheetHeader>
                    <SheetTitle>Create Release</SheetTitle>
                    <SheetDescription>
                        Add a new release version for this app.
                    </SheetDescription>
                </SheetHeader>
                <Form {...form}>
                    <form
                        id="create-release-form"
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-4 px-4 pt-4"
                    >
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Release Type</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="winget">Winget</SelectItem>
                                            <SelectItem value="win32">Win32</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="wingetId"
                            render={({ field }) => (
                                <FormItem className={cn({ hidden: watchedType !== "winget" })}>
                                    <FormLabel>Winget ID</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Mozilla.Firefox" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        The package identifier from winget repository.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="installBinary"
                            render={({ field }) => (
                                <FormItem className={cn({ hidden: watchedType !== "win32" })}>
                                    <FormLabel>Install Binary</FormLabel>
                                    <Dropzone
                                        src={toDropzonePreview(field.value)}
                                        accept={{ "application/zip": [".zip"] }}
                                        maxFiles={1}
                                        maxSize={1024 * 1024 * 5000}
                                        minSize={1024}
                                        disabled={isUploadingBinary}
                                        onDrop={(files) => {
                                            const file = files.at(0);
                                            if (!file) {
                                                return;
                                            }
                                            setIsUploadingBinary(true);
                                            void (async () => {
                                                try {
                                                    if (field.value) {
                                                        await deleteStoredFile({ file: field.value });
                                                    }
                                                    const uploaded = await uploadFileToTempStorage({
                                                        file,
                                                        category: "installers",
                                                    });
                                                    field.onChange(uploaded);
                                                    toast.success("Installer uploaded");
                                                } catch (uploadError) {
                                                    console.error(uploadError);
                                                    toast.error(
                                                        uploadError instanceof Error
                                                            ? uploadError.message
                                                            : "Unable to upload installer"
                                                    );
                                                } finally {
                                                    setIsUploadingBinary(false);
                                                }
                                            })();
                                        }}
                                        onError={(err) =>
                                            toast.error(
                                                err instanceof Error
                                                    ? err.message
                                                    : "File rejected by dropzone"
                                            )
                                        }
                                    >
                                        <DropzoneEmptyState />
                                        <DropzoneContent />
                                    </Dropzone>
                                    {isUploadingBinary && (
                                        <p className="text-xs text-muted-foreground">
                                            Uploading installer…
                                        </p>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="installScript"
                            render={({ field }) => (
                                <FormItem className={cn({ hidden: watchedType !== "win32" })}>
                                    <FormLabel>Install Script</FormLabel>
                                    <FormControl>
                                        <Input placeholder="msiexec /i app.msi /qn" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Command to install the application.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="uninstallScript"
                            render={({ field }) => (
                                <FormItem className={cn({ hidden: watchedType !== "win32" })}>
                                    <FormLabel>Uninstall Script</FormLabel>
                                    <FormControl>
                                        <Input placeholder="msiexec /x {GUID} /qn" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Command to uninstall the application.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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
                                            Specify the version number for this release.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <FormField
                            control={form.control}
                            name="uninstall_previous"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                    <div className="space-y-0.5">
                                        <FormLabel>Uninstall Previous</FormLabel>
                                        <FormDescription>
                                            Uninstall previous version before installing this one.
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
                    </form>
                </Form>
                <SheetFooter>
                    <Button
                        type="submit"
                        form="create-release-form"
                        disabled={createMutation.isPending || isUploadingBinary}
                    >
                        {createMutation.isPending ? "Creating..." : "Create Release"}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
