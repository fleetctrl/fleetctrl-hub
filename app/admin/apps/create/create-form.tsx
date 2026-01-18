"use client";
import { useFieldArray, useForm, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  MultiStepForm,
  MultiStepFormContextProvider,
  MultiStepFormHeader,
  MultiStepFormStep,
  useMultiStepFormContext,
} from "@/components/ui/kit/multistep-form";
import { Stepper } from "@/components/ui/kit/stepper";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Item, ItemContent } from "@/components/ui/item";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Database, FileSearch, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/ui/shadcn-io/dropzone";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  detectionItemSchema,
  assignmentTargetSchema,
  createAppSchema,
} from "@/lib/schemas/create-app";
import { uploadFileToConvex } from "@/lib/convex-upload";
import { useRouter } from "next/navigation";

const DEFAULT_DETECTION_VALUES: z.infer<typeof detectionItemSchema> = {
  type: "file",
  path: "",
  fileType: "exists",
  fileTypeValue: "",
  registryKey: "",
  registryType: "exists",
  registryTypeValue: "",
};

const DEFAULT_ASSIGNMENT_VALUE: z.infer<typeof assignmentTargetSchema> = {
  groupId: "",
  groupType: "static",
  mode: "include",
};

const FormSchema = createAppSchema;
type CreateAppFormValues = z.infer<typeof FormSchema>;

const useCreateAppFormContext = () =>
  useMultiStepFormContext<typeof FormSchema>();

// Helper for dropzone preview - adapted for Convex StoredFile
const toDropzonePreview = (
  file?: { name: string; size: number; type?: string | null } | null
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
    } as unknown as File,
  ];
};

export function CreateForm() {
  const router = useRouter()
  const createMutation = useMutation(api.apps.create);

  const form = useForm<CreateAppFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      appInfo: {
        name: "",
        description: "",
        publisher: "",
      },
      release: {
        type: "winget",
        wingetId: "",
        installScript: "",
        uninstallScript: "",
        installBinary: undefined,
        autoUpdate: false,
        version: "",
        uninstallPreviousVersion: false,
        allowMultipleVersions: false,
      },
      requirement: {
        requirementScriptBinary: undefined,
        runAsSystem: false,
      },
      detection: {
        detections: [],
      },
      assignment: {
        installGroups: [],
        uninstallGroups: [],
      },
    },
    reValidateMode: "onBlur",
    mode: "onBlur",
  });

  const onSubmit = async (data: CreateAppFormValues) => {
    try {
      // Transform data to match Convex schema if needed
      // The schema matches closely enough, ID casting is done inside the mutation or we can do it here
      // The form values uses strings for IDs, but Convex expects strings or Ids.
      // Our updated schema.ts uses v.string() for IDs in nested objects which is good.
      // However, installBinary needs to map storageId string to Id<"_storage">.

      const transformedData = {
        ...data,
        release: {
          ...data.release,
          installBinary: data.release.installBinary ? {
            ...data.release.installBinary,
            storageId: data.release.installBinary.storageId as Id<"_storage">,
            type: data.release.installBinary.type ?? "application/octet-stream"
          } : undefined
        },
        requirement: data.requirement ? {
          ...data.requirement,
          requirementScriptBinary: data.requirement.requirementScriptBinary ? {
            ...data.requirement.requirementScriptBinary,
            storageId: data.requirement.requirementScriptBinary.storageId as Id<"_storage">,
            type: data.requirement.requirementScriptBinary.type ?? "application/octet-stream"
          } : undefined
        } : undefined
      };

      await createMutation(transformedData);
      toast.success("App created");
      router.push("/admin/apps");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(message);
      toast.error(`Error when creating app: ${message}`);
    }
  };

  return (
    <MultiStepForm schema={FormSchema} form={form} onSubmit={onSubmit}>
      <MultiStepFormHeader
        className={"flex w-full flex-col justify-center space-y-6 pb-5"}
      >
        <h2 className={"text-xl font-bold"}>Create new app</h2>
        <MultiStepFormContextProvider>
          {({ currentStepIndex }) => (
            <Stepper
              variant={"numbers"}
              steps={
                form.watch("release.type") === "winget"
                  ? ["appInfo", "release", "requirement", "assignment"]
                  : [
                    "appInfo",
                    "release",
                    "requirement",
                    "detection",
                    "assignment",
                  ]
              }
              currentStep={currentStepIndex}
            />
          )}
        </MultiStepFormContextProvider>
      </MultiStepFormHeader>
      <MultiStepFormStep name="appInfo">
        <AppInfoStep />
      </MultiStepFormStep>
      <MultiStepFormStep name="release">
        <ReleaseStep />
      </MultiStepFormStep>
      <MultiStepFormStep name="requirement">
        <RequirementStep />
      </MultiStepFormStep>
      {form.watch("release.type") !== "winget" && (
        <MultiStepFormStep name="detection">
          <DetectionStep />
        </MultiStepFormStep>
      )}
      <MultiStepFormStep name="assignment">
        <AssignmentStep />
      </MultiStepFormStep>
    </MultiStepForm>
  );
}

function AppInfoStep() {
  const { form, nextStep, errors } = useCreateAppFormContext();
  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <div className="space-y-8 w-full mx-auto py-10">
            <FormField
              control={form.control}
              name="appInfo.name"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="" type="text" {...field} />
                  </FormControl>
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="appInfo.description"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder=""
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="appInfo.publisher"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Publisher *</FormLabel>
                  <FormControl>
                    <Input placeholder="" type="text" {...field} />
                  </FormControl>
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </FormItem>
              )}
            />



            <div className="flex gap-3">
              <Button onClick={nextStep} disabled={!!errors.appInfo}>
                Next
              </Button>
            </div>
          </div>
        </Form>
      </ItemContent>
    </Item>
  );
}

function ReleaseStep() {
  const { form, nextStep, prevStep, errors } = useCreateAppFormContext();
  const [type, setType] = useState(form.getValues("release").type);
  const [autoUpdate, setAutoUpdate] = useState(
    form.getValues("release").autoUpdate
  );
  const watchedReleaseType = form.watch("release.type");
  const watchedAutoUpdate = form.watch("release.autoUpdate");
  const [isUploadingBinary, setIsUploadingBinary] = useState(false);

  const generateUploadUrl = useMutation(api.apps.generateUploadUrl);

  useEffect(() => {
    setType(watchedReleaseType);
    setAutoUpdate(watchedAutoUpdate);
    form.clearErrors("release");
  }, [form, watchedAutoUpdate, watchedReleaseType]);
  useEffect(() => {
    if (autoUpdate) {
      form.setValue("release.allowMultipleVersions", false);
      form.setValue("release.uninstallPreviousVersion", false);
    }
  }, [form, autoUpdate]);
  useEffect(() => {
    if (type === "win32") {
      return;
    }
    form.setValue("release.installBinary", undefined);
    form.setValue("release.allowMultipleVersions", false);
    form.setValue("release.uninstallPreviousVersion", false);

    // Note: We are not explicitly deleting the previous file from storage here as creating logic is simpler.
    // If needed, we could add a deleteFile mutation.
  }, [form, type]);

  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <div className="space-y-8 w-full mx-auto py-10">
            <FormField
              control={form.control}
              name="release.type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Release type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="winget">winget</SelectItem>
                      <SelectItem value="win32">win32</SelectItem>
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="release.wingetId"
              render={({ field }) => (
                <FormItem
                  className={cn("", {
                    hidden: type !== "winget",
                  })}
                >
                  <FormLabel>Winget ID</FormLabel>
                  <FormControl>
                    <Input placeholder="" type="text" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="release.installBinary"
              render={({ field }) => (
                <FormItem className={cn("", { hidden: type !== "win32" })}>
                  <FormLabel>Install binary</FormLabel>
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
                          const uploaded = await uploadFileToConvex(file, generateUploadUrl);
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
                  {isUploadingBinary ? (
                    <p className="text-xs text-muted-foreground">
                      Uploading installer…
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="release.installScript"
              render={({ field }) => (
                <FormItem
                  className={cn("", {
                    hidden: type !== "win32",
                  })}
                >
                  <FormLabel>Install script</FormLabel>
                  <FormControl>
                    <Input placeholder="" type="text" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="release.uninstallScript"
              render={({ field }) => (
                <FormItem
                  className={cn("", {
                    hidden: type !== "win32",
                  })}
                >
                  <FormLabel>Uninstall script</FormLabel>
                  <FormControl>
                    <Input placeholder="" type="" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="release.autoUpdate"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Auto updated</FormLabel>
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
              name="release.uninstallPreviousVersion"
              render={({ field }) => (
                <FormItem
                  className={cn(
                    "flex flex-row items-center justify-between rounded-lg border p-4",
                    { hidden: type !== "win32" || autoUpdate }
                  )}
                >
                  <div className="space-y-0.5">
                    <FormLabel>Uninstall previous version</FormLabel>
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
              name="release.version"
              render={({ field }) => (
                <FormItem className={cn("", { hidden: autoUpdate })}>
                  <FormLabel>Version</FormLabel>
                  <FormControl>
                    <Input placeholder="v1.0.0" type="text" {...field} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="release.allowMultipleVersions"
              render={({ field }) => (
                <FormItem
                  className={cn(
                    "flex flex-row items-center justify-between rounded-lg border p-4",
                    { hidden: type !== "win32" || autoUpdate }
                  )}
                >
                  <div className="space-y-0.5">
                    <FormLabel>Allow multiple versions</FormLabel>
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
            <div className="flex gap-3">
              <Button variant={"ghost"} onClick={prevStep}>
                Back
              </Button>
              <Button
                onClick={nextStep}
                disabled={!!errors.release || isUploadingBinary}
              >
                Next
              </Button>
            </div>
          </div>
        </Form>
      </ItemContent>
    </Item>
  );
}

function RequirementStep() {
  const { form, nextStep, prevStep, errors } = useCreateAppFormContext();
  const [isUploadingRequirement, setIsUploadingRequirement] = useState(false);
  const generateUploadUrl = useMutation(api.apps.generateUploadUrl);
  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <div className="space-y-8 w-full mx-auto py-10">
            <FormField
              control={form.control}
              name="requirement.requirementScriptBinary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Requirement script</FormLabel>
                  <Dropzone
                    src={toDropzonePreview(field.value)}
                    accept={{
                      "text/plain": [".ps1"],
                    }}
                    maxFiles={1}
                    maxSize={1024 * 1024 * 20}
                    minSize={1}
                    disabled={isUploadingRequirement}
                    onError={(err) =>
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "File rejected by dropzone"
                      )
                    }
                    onDrop={(files) => {
                      const file = files.at(0);
                      if (!file) {
                        return;
                      }

                      setIsUploadingRequirement(true);
                      void (async () => {
                        try {
                          const uploaded = await uploadFileToConvex(file, generateUploadUrl);
                          field.onChange(uploaded);
                          toast.success("Requirement script uploaded");
                        } catch (uploadError) {
                          console.error(uploadError);
                          toast.error(
                            uploadError instanceof Error
                              ? uploadError.message
                              : "Unable to upload requirement script"
                          );
                        } finally {
                          setIsUploadingRequirement(false);
                        }
                      })();
                    }}
                  >
                    <DropzoneEmptyState />
                    <DropzoneContent />
                  </Dropzone>
                  {isUploadingRequirement ? (
                    <p className="text-xs text-muted-foreground">
                      Uploading requirement script…
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("requirement.requirementScriptBinary") && (
              <FormField
                control={form.control}
                name="requirement.runAsSystem"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Run as system</FormLabel>
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

            <div className="flex gap-3">
              <Button variant={"ghost"} onClick={prevStep}>
                Back
              </Button>
              <Button
                onClick={nextStep}
                disabled={!!errors.requirement || isUploadingRequirement}
              >
                Next
              </Button>
            </div>
          </div>
        </Form>
      </ItemContent>
    </Item>
  );
}

function DetectionStep() {
  const { form, nextStep, prevStep, errors } = useCreateAppFormContext();
  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <div className="space-y-8 w-full mx-auto py-10">
            <DetectionListForm form={form} />

            <div className="flex gap-3">
              <Button variant={"ghost"} onClick={prevStep}>
                Back
              </Button>
              <Button onClick={nextStep} disabled={!!errors.detection}>
                Next
              </Button>
            </div>
          </div>
        </Form>
      </ItemContent>
    </Item>
  );
}

function DetectionListForm({
  form,
}: {
  form: UseFormReturn<z.infer<typeof FormSchema>>;
}) {
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "detection.detections",
  });

  const [open, setOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const detections = form.watch("detection.detections") || [];

  // Separate mini-form for popup (you can also share schema)
  const popupForm = useForm<z.infer<typeof detectionItemSchema>>({
    resolver: zodResolver(detectionItemSchema),
    defaultValues: DEFAULT_DETECTION_VALUES,
  });

  const [type, setType] = useState(popupForm.watch("type"));
  const [fileType, setFileType] = useState(popupForm.watch("fileType"));
  const [registryType, setRegistryType] = useState(
    popupForm.watch("registryType")
  );

  const popupType = popupForm.watch("type");
  const popupFileType = popupForm.watch("fileType");
  const popupRegistryType = popupForm.watch("registryType");

  useEffect(() => {
    setType(popupType);
    setFileType(popupFileType);
    setRegistryType(popupRegistryType);
    popupForm.clearErrors();
  }, [popupForm, popupFileType, popupRegistryType, popupType]);

  const handleSheetToggle = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setEditingIndex(null);
      popupForm.reset(DEFAULT_DETECTION_VALUES);
    }
  };

  const handleCreateTrigger = () => {
    setEditingIndex(null);
    popupForm.reset(DEFAULT_DETECTION_VALUES);
  };

  const handleEditDetection = (index: number) => {
    const detection = detections[index];
    if (!detection) {
      return;
    }

    setEditingIndex(index);
    popupForm.reset({
      type: detection.type,
      path: detection.path ?? "",
      fileType: detection.fileType ?? "exists",
      fileTypeValue: detection.fileTypeValue ?? "",
      registryKey: detection.registryKey ?? "",
      registryType: detection.registryType ?? "exists",
      registryTypeValue: detection.registryTypeValue ?? "",
    });
    setOpen(true);
  };

  const onSubmitDetection = popupForm.handleSubmit(
    (values) => {
      console.log("Adding detection:", values);
      if (editingIndex !== null) {
        update(editingIndex, values);
      } else {
        append(values);
      }

      setEditingIndex(null);
      popupForm.reset(DEFAULT_DETECTION_VALUES);
      setOpen(false);
    },
    (errors) => {
      console.error("Detection form validation failed:", errors);
    }
  );

  const formatConditionLabel = (raw?: string | null) => {
    if (!raw) {
      return "—";
    }

    const map: Record<string, string> = {
      version_equal: "=",
      version_equal_or_higher: "≥",
      version_equal_or_lower: "≤",
      version_higher: ">",
      version_lower: "<",
      exists: "Exists",
      string: "String",
    };

    return map[raw] ?? raw.replaceAll("_", " ");
  };

  return (
    <div className="space-y-6">
      {/* List */}
      <div className="space-y-3">
        {fields.length ? (
          fields.map((field, index) => {
            const detection = detections[index];
            const isFile = detection?.type === "file";
            const primaryValue = isFile
              ? detection?.path
              : detection?.registryKey;
            const conditionLabel = isFile
              ? detection?.fileType
              : detection?.registryType;
            const conditionValue = isFile
              ? detection?.fileTypeValue
              : detection?.registryTypeValue;
            const formattedCondition = formatConditionLabel(conditionLabel);

            return (
              <Card
                key={field.id}
                className="relative border-border/60 bg-muted/30"
              >
                <CardHeader className="space-y-3 px-4 py-3 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {isFile ? (
                        <FileSearch className="h-4 w-4" />
                      ) : (
                        <Database className="h-4 w-4" />
                      )}
                      <Badge variant="secondary" className="capitalize">
                        {detection?.type ?? "unknown"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEditDetection(index)}
                        aria-label="Edit detection"
                        className="text-muted-foreground transition-colors hover:text-primary hover:bg-primary/10"
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit detection</span>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(index)}
                        aria-label="Remove detection"
                        className="text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove detection</span>
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-base font-semibold break-all">
                    {primaryValue || "Not configured"}
                  </CardTitle>
                  <CardDescription className="capitalize">
                    {isFile ? "File path" : "Registry key"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 border-t border-border/60 bg-background/80 px-4 py-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Condition</p>
                    <p className="font-medium capitalize">
                      {formattedCondition}
                    </p>
                  </div>
                  {conditionValue && conditionLabel !== "exists" ? (
                    <div>
                      <p className="text-muted-foreground">
                        {isFile ? "Expected value" : "Value"}
                      </p>
                      <p className="font-medium break-all">
                        {conditionValue}
                      </p>
                    </div>
                  ) : null}
                  {isFile && !conditionValue && conditionLabel === "exists" ? (
                    <div>
                      <p className="text-muted-foreground">Mode</p>
                      <p className="font-medium">Check for presence only</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
            No detections yet. Add one to get started.
          </div>
        )}
      </div>

      {/* Flyout Trigger */}
      <Sheet open={open} onOpenChange={handleSheetToggle}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCreateTrigger}
          >
            Add detection
          </Button>
        </SheetTrigger>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingIndex !== null ? "Edit detection" : "New detection"}
            </SheetTitle>
            <SheetDescription>
              {editingIndex !== null
                ? "Update the detection parameters below."
                : "Define the detection parameters below."}
            </SheetDescription>
          </SheetHeader>

          <Item>
            <ItemContent className="p-2">
              <Form {...popupForm}>
                <form
                  onSubmit={(e) => {
                    e.stopPropagation();
                    void onSubmitDetection(e);
                  }}
                  className="space-y-5 mt-5"
                >
                  <FormField
                    control={popupForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="file">file</SelectItem>
                            <SelectItem value="registry">registry</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={popupForm.control}
                    name="path"
                    render={({ field }) => (
                      <FormItem
                        className={cn({
                          hidden: !(type === "file" || type === "registry"),
                        })}
                      >
                        <FormLabel>Path *</FormLabel>
                        <FormControl>
                          <Input placeholder="" type="text" {...field} />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* File */}
                  <FormField
                    control={popupForm.control}
                    name="fileType"
                    render={({ field }) => (
                      <FormItem className={cn({ hidden: type !== "file" })}>
                        <FormLabel>File type *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="exists">exists</SelectItem>
                            <SelectItem value="version_equal">
                              version equal
                            </SelectItem>
                            <SelectItem value="version_equal_or_higher">
                              version equal or higher
                            </SelectItem>
                            <SelectItem value="version_equal_or_lower">
                              version equal or lower
                            </SelectItem>
                            <SelectItem value="version_higher">
                              version higher
                            </SelectItem>
                            <SelectItem value="version_lower">
                              version lower
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={popupForm.control}
                    name="fileTypeValue"
                    render={({ field }) => (
                      <FormItem
                        className={cn({
                          hidden:
                            !(type === "file") || !(fileType !== "exists"),
                        })}
                      >
                        <FormLabel>Version *</FormLabel>
                        <FormControl>
                          <Input placeholder="" type="text" {...field} />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* registry */}
                  <FormField
                    control={popupForm.control}
                    name="registryKey"
                    render={({ field }) => (
                      <FormItem
                        className={cn({
                          hidden: !(type === "registry"),
                        })}
                      >
                        <FormLabel>Key *</FormLabel>
                        <FormControl>
                          <Input placeholder="" type="text" {...field} />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={popupForm.control}
                    name="registryType"
                    render={({ field }) => (
                      <FormItem className={cn({ hidden: type !== "registry" })}>
                        <FormLabel>Registry type *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="exists">exists</SelectItem>
                            <SelectItem value="string">string</SelectItem>
                            <SelectItem value="version_equal">
                              version equal
                            </SelectItem>
                            <SelectItem value="version_equal_or_higher">
                              version equal or higher
                            </SelectItem>
                            <SelectItem value="version_equal_or_lower">
                              version equal or lower
                            </SelectItem>
                            <SelectItem value="version_higher">
                              version higher
                            </SelectItem>
                            <SelectItem value="version_lower">
                              version lower
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={popupForm.control}
                    name="registryTypeValue"
                    render={({ field }) => (
                      <FormItem
                        className={cn({
                          hidden:
                            !(type === "registry") ||
                            !(registryType !== "exists"),
                        })}
                      >
                        <FormLabel>Value *</FormLabel>
                        <FormControl>
                          <Input placeholder="" type="text" {...field} />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <SheetFooter className="">
                    <div className="flex gap-3 justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void onSubmitDetection(e);
                        }}
                      >
                        Save detection
                      </Button>
                    </div>
                  </SheetFooter>
                </form>
              </Form>
            </ItemContent>
          </Item>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AssignmentStep() {
  const { form, prevStep } = useCreateAppFormContext();
  const {
    fields: installFields,
    append: appendInstall,
    remove: removeInstall,
    update: updateInstall,
  } = useFieldArray({
    control: form.control,
    name: "assignment.installGroups",
  });
  const {
    fields: uninstallFields,
    append: appendUninstall,
    remove: removeUninstall,
    update: updateUninstall,
  } = useFieldArray({
    control: form.control,
    name: "assignment.uninstallGroups",
  });
  const installValues = form.watch("assignment.installGroups");
  const uninstallValues = form.watch("assignment.uninstallGroups");
  const isSubmitting = form.formState.isSubmitting;

  const staticGroups = useQuery(api.staticGroups.list);
  const dynamicGroups = useQuery(api.groups.getAll);

  const groups = [
    ...(staticGroups || []).map(g => ({ id: g.id, displayName: g.displayName, type: "static" as const })),
    ...(dynamicGroups || []).map(g => ({ id: g.id, displayName: g.displayName, type: "dynamic" as const })),
  ];

  const [sheetState, setSheetState] = useState<{
    type: "install" | "uninstall";
    index: number | null;
  } | null>(null);
  const sheetType = sheetState?.type ?? null;
  const assignmentForm = useForm<z.infer<typeof assignmentTargetSchema>>({
    resolver: zodResolver(assignmentTargetSchema),
    defaultValues: DEFAULT_ASSIGNMENT_VALUE,
  });
  const isEditingAssignment = sheetState?.index !== null;

  const closeSheet = () => {
    setSheetState(null);
    assignmentForm.reset(DEFAULT_ASSIGNMENT_VALUE);
    assignmentForm.clearErrors();
  };

  const handleSheetChange = (open: boolean) => {
    if (!open) {
      closeSheet();
    }
  };

  const getGroupLabel = (id?: string | null) => {
    if (!id) {
      return "Unknown group";
    }

    return groups.find((group) => group.id === id)?.displayName ?? id;
  };

  const handleSubmitAssignment = assignmentForm.handleSubmit(
    (values) => {
      console.log("Adding assignment:", values, "to", sheetType);
      const skipIndex = sheetState?.index ?? null;

      const isDuplicate = (
        list: typeof installValues,
        type: "install" | "uninstall"
      ) =>
        list?.some((entry: { groupId: string }, idx: number | null) => {
          if (sheetState?.type === type && skipIndex === idx) {
            return false;
          }
          return entry?.groupId === values.groupId;
        });

      const alreadyUsed =
        isDuplicate(installValues, "install") ||
        isDuplicate(uninstallValues, "uninstall");

      if (alreadyUsed) {
        assignmentForm.setError("groupId", {
          message: "This group is already assigned.",
        });
        return;
      }

      if (sheetType === "install") {
        if (sheetState && sheetState?.index !== null) {
          updateInstall(sheetState.index, values);
        } else {
          appendInstall(values);
        }
      } else if (sheetType === "uninstall") {
        if (sheetState && sheetState?.index !== null) {
          updateUninstall(sheetState.index, values);
        } else {
          appendUninstall(values);
        }
      }

      closeSheet();
    },
    (errors) => {
      console.error("Assignment form validation failed:", errors);
    }
  );

  const openSheet = (type: "install" | "uninstall", index: number | null) => {
    assignmentForm.clearErrors();
    if (index !== null) {
      const source =
        type === "install" ? installValues?.[index] : uninstallValues?.[index];
      assignmentForm.reset(
        source ?? DEFAULT_ASSIGNMENT_VALUE
      );
    } else {
      assignmentForm.reset(DEFAULT_ASSIGNMENT_VALUE);
    }

    setSheetState({ type, index });
  };

  const renderGroupCard = (
    type: "install" | "uninstall",
    fields: typeof installFields,
    values: typeof installValues
  ) => {
    const title = type === "install" ? "Install" : "Uninstall";
    const description =
      type === "install"
        ? "Pick the device groups that should receive this app."
        : "Pick the groups where the app should be removed.";
    const handleRemove = type === "install" ? removeInstall : removeUninstall;

    return (
      <Card className="border-border/60">
        <CardHeader className="space-y-3">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.length ? (
            fields.map((field, index) => {
              const currentMode = values?.[index]?.mode ?? "include";
              const groupId = values?.[index]?.groupId;
              const label = getGroupLabel(groupId);

              return (
                <div
                  key={field.id}
                  className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                      <span>Group</span>
                      <Badge
                        variant={
                          currentMode === "exclude" ? "destructive" : "default"
                        }
                        className="capitalize"
                      >
                        {currentMode}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => openSheet(type, index)}
                        aria-label="Edit assignment"
                        className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemove(index)}
                        aria-label="Remove assignment"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{groupId}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
              No groups added yet.
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => openSheet(type, null)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add group
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <div className="space-y-8 w-full mx-auto py-10">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Assignments</h3>
              <p className="text-sm text-muted-foreground">
                Just like Intune, decide who should get the app and who should
                have it removed. Each group can be marked as include or exclude.
              </p>
            </div>
            <div className="space-y-6">
              {renderGroupCard("install", installFields, installValues)}
              {renderGroupCard("uninstall", uninstallFields, uninstallValues)}
            </div>
            <div className="flex gap-3">
              <Button variant={"ghost"} type="button" onClick={prevStep}>
                Back
              </Button>
              <Button type={'submit'} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Create app"}
              </Button>
            </div>
          </div>
        </Form>
      </ItemContent>
      <Sheet open={sheetType !== null} onOpenChange={handleSheetChange}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {sheetType === "install"
                ? isEditingAssignment
                  ? "Edit install group"
                  : "Add install group"
                : isEditingAssignment
                  ? "Edit uninstall group"
                  : "Add uninstall group"}
            </SheetTitle>
            <SheetDescription>
              Choose a group from your directory and decide whether to include
              or exclude it.
            </SheetDescription>
          </SheetHeader>
          <Item>
            <ItemContent className="p-2">
              <Form {...assignmentForm}>
                <form
                  onSubmit={(e) => {
                    e.stopPropagation();
                    void handleSubmitAssignment(e);
                  }}
                  className="mt-5 space-y-5"
                >
                  <FormField
                    control={assignmentForm.control}
                    name="groupId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            const selectedGroup = groups.find((g) => g.id === val);
                            if (selectedGroup) {
                              assignmentForm.setValue("groupType", selectedGroup.type);
                            }
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select group" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {groups.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                <span className="flex items-center gap-2">
                                  {group.displayName}
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${group.type === 'dynamic' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                    {group.type}
                                  </span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={assignmentForm.control}
                    name="mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mode</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="include">Include</SelectItem>
                            <SelectItem value="exclude">Exclude</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <SheetFooter>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => closeSheet()}
                      >
                        Close
                      </Button>
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleSubmitAssignment(e);
                        }}
                      >
                        {isEditingAssignment ? "Save changes" : "Add"}
                      </Button>
                    </div>
                  </SheetFooter>
                </form>
              </Form>
            </ItemContent>
          </Item>
        </SheetContent>
      </Sheet>
    </Item>
  );
}
