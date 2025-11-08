"use client";
import {
  FieldValues,
  useFieldArray,
  useForm,
  UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  createStepSchema,
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
  FormDescription,
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
import { Database, FileSearch, Pencil, Trash2 } from "lucide-react";
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

const detectionItemSchema = z
  .object({
    type: z.enum(["file", "registry"], {
      message: "Type is required",
    }),
    path: z.string().min(1, { message: "Path is required" }),
    fileType: z
      .enum([
        "exists",
        "version_equal",
        "version_equal_or_higher",
        "version_equal_or_lower",
        "version_higher",
        "version_lower",
      ])
      .optional(),
    fileTypeValue: z.string().optional(),
    registryKey: z.string().optional(),
    registryType: z
      .enum([
        "exists",
        "string",
        "version_equal",
        "version_equal_or_higher",
        "version_equal_or_lower",
        "version_higher",
        "version_lower",
      ])
      .optional(),
    registryTypeValue: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // File
    if (data.type === "file" && !data.path) {
      ctx.addIssue({
        code: "custom",
        message: "Path is required",
        path: ["path"],
      });
    }
    if (data.type === "file" && !data.fileType) {
      ctx.addIssue({
        code: "custom",
        message: "File type is required",
        path: ["fileType"],
      });
    }
    if (
      data.type === "file" &&
      data.fileType !== "exists" &&
      !data.fileTypeValue
    ) {
      ctx.addIssue({
        code: "custom",
        message: "File type value is required",
        path: ["fileTypeValue"],
      });
    }

    console.log(data);
    // Registry
    if (data.type === "registry" && !data.registryKey) {
      ctx.addIssue({
        code: "custom",
        message: "Registry key is required",
        path: ["registryKey"],
      });
    }
    if (data.type === "registry" && !data.registryType) {
      ctx.addIssue({
        code: "custom",
        message: "Registry type is required",
        path: ["registryType"],
      });
    }
    if (data.type === "registry" && !data.registryKey) {
      ctx.addIssue({
        code: "custom",
        message: "Registry key is required",
        path: ["registryKey"],
      });
    }
    if (data.type === "registry" && !data.fileType) {
      ctx.addIssue({
        code: "custom",
        message: "Registry type is required",
        path: ["fileTypeValue"],
      });
    }
    if (
      data.type === "registry" &&
      data.registryType !== "exists" &&
      !data.registryTypeValue
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Registry value is required",
        path: ["registryTypeValue"],
      });
    }
  });

const DEFAULT_DETECTION_VALUES: z.infer<typeof detectionItemSchema> = {
  type: "file",
  path: "",
  fileType: "exists",
  fileTypeValue: "",
  registryKey: "",
  registryType: "exists",
  registryTypeValue: "",
};

const FormSchema = createStepSchema({
  appInfo: z.object({
    name: z.string().min(2, { message: "App name is required" }),
    description: z.string().optional(),
    publisher: z.string().min(2, { message: "Publisher is required" }),
  }),
  release: z
    .object({
      type: z.enum(["win32", "winget"]),
      wingetId: z.string().optional(),
      installScript: z.string().optional(),
      uninstallScript: z.string().optional(),
      installBinary: z.file().optional(),
      autoUpdate: z.boolean(),
      version: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (!data.autoUpdate && !data.version) {
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
          message: "Install binary is required when type is win32",
          path: ["installBinary"],
        });
      }
      if (data.type === "win32" && !data.installScript) {
        ctx.addIssue({
          code: "custom",
          message: "Install script is required",
          path: ["install_script"],
        });
      }
      if (data.type === "win32" && !data.uninstallScript) {
        ctx.addIssue({
          code: "custom",
          message: "Uninstall script is required",
          path: ["uninstall_script"],
        });
      }
    }),
  requirement: z.object({
    requirementScriptBinary: z.file().optional(),
  }),
  detection: z.object({
    detections: z
      .array(detectionItemSchema)
      .min(1, "At least one detection is required"),
  }),
});

export function CreateForm() {
  const form = useForm({
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
      },
      requirement: {
        requirementScriptBinary: undefined,
      },
      detection: {
        detections: [],
      },
    },
    reValidateMode: "onBlur",
    mode: "onBlur",
  });

  const onSubmit = (data: any) => {
    console.log(data);
    // Handle form submission
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
              steps={["appInfo", "release", "requirement", "detection", "assignment"]}
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
      <MultiStepFormStep name="detection">
        <DetectionStep />
      </MultiStepFormStep>
      <MultiStepFormStep name="assignment">
        <AssignmentStep />
      </MultiStepFormStep>
    </MultiStepForm>
  );
}

function AppInfoStep() {
  const { form, nextStep, errors } = useMultiStepFormContext();
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
  const { form, nextStep, prevStep, errors } = useMultiStepFormContext();
  const [type, setType] = useState(form.getValues("release").type);
  const [autoUpdate, setAutoUpdate] = useState(
    form.getValues("release").autoUpdate
  );
  useEffect(() => {
    setType(form.getValues("release").type);
    setAutoUpdate(form.getValues("release").autoUpdate);
    form.clearErrors("release");
  }, [form.watch("release.type", setType), form.watch("release.autoUpdate")]);
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
                    {...field}
                    accept={{ "application/zip": [".zip"] }}
                    maxFiles={1}
                    maxSize={1024 * 1024 * 5000}
                    minSize={1024}
                    onError={console.error}
                  >
                    <DropzoneEmptyState />
                    <DropzoneContent />
                    <FormMessage />
                  </Dropzone>
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
            <div className="flex gap-3">
              <Button variant={"ghost"} onClick={prevStep}>
                Back
              </Button>
              <Button onClick={nextStep} disabled={!!errors.release}>
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
  const { form, nextStep, prevStep, errors } = useMultiStepFormContext();
  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <div className="space-y-8 w-full mx-auto py-10">
            <FormField
              control={form.control}
              name="release.requirementScriptBinary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Requirement script</FormLabel>
                  <Dropzone
                    {...field}
                    accept={{
                      "text/plain": [".ps1"],
                    }}
                    maxFiles={1}
                    maxSize={1024 * 1024 * 20}
                    minSize={1024}
                    onError={console.error}
                  >
                    <DropzoneEmptyState />
                    <DropzoneContent />
                    <FormMessage />
                  </Dropzone>
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <Button variant={"ghost"} onClick={prevStep}>
                Back
              </Button>
              <Button onClick={nextStep} disabled={!!errors.release}>
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
  const { form, nextStep, prevStep, errors } = useMultiStepFormContext();
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
              <Button onClick={nextStep} disabled={!!errors.release}>
                Next
              </Button>
            </div>
          </div>
        </Form>
      </ItemContent>
    </Item>
  );
}

function DetectionListForm({ form }: { form: UseFormReturn<FieldValues> }) {
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "release.detections",
  });

  const [open, setOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const detections = form.watch("release.detections") || [];

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

  useEffect(() => {
    setType(popupForm.watch("type"));
    setFileType(popupForm.watch("fileType"));
    setRegistryType(popupForm.watch("registryType"));
    popupForm.clearErrors();
  }, [
    popupForm.watch("type"),
    popupForm.watch("fileType"),
    popupForm.watch("registryType"),
  ]);

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

  const onSubmitDetection = popupForm.handleSubmit((values) => {
    if (editingIndex !== null) {
      update(editingIndex, values);
    } else {
      append(values);
    }

    setEditingIndex(null);
    popupForm.reset(DEFAULT_DETECTION_VALUES);
    setOpen(false);
  });

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
                <form onSubmit={onSubmitDetection} className="space-y-5 mt-5">
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
                      <Button type="submit">Save detection</Button>
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
  const { form, nextStep, prevStep, errors } = useMultiStepFormContext();
  return (
    <Item variant="outline">
      <ItemContent className="p-2">
        <Form {...form}>
          <div className="space-y-8 w-full mx-auto py-10">

            <div className="flex gap-3">
              <Button variant={"ghost"} onClick={prevStep}>
                Back
              </Button>
              <Button onClick={nextStep} disabled={!!errors.release}>
                Next
              </Button>
            </div>
          </div>
        </Form>
      </ItemContent>
    </Item>
  );
}
