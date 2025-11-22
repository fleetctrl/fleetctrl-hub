import { z } from "zod";

export const storedFileReferenceSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.string().optional().nullable(),
  hash: z.string().optional(),
});

export const assignmentTargetSchema = z.object({
  groupId: z.string().min(1, { message: "Group is required" }),
  mode: z.enum(["include", "exclude"], {
    message: "Select include or exclude",
  }),
});

export const detectionItemSchema = z
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
    // File-specific requirements
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

    // Registry-specific requirements
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

export const createAppSchema = z.object({
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
      installBinary: storedFileReferenceSchema.optional(),
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
      if (
        data.type === "win32" &&
        data.installBinary &&
        !data.installBinary.hash
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Install binary hash is missing. Please re-upload the file.",
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
    }),
  requirement: z.object({
    requirementScriptBinary: storedFileReferenceSchema.optional(),
  }),
  detection: z.object({
    detections: z
      .array(detectionItemSchema)
      .min(1, "At least one detection is required"),
  }),
  assignment: z.object({
    installGroups: z.array(assignmentTargetSchema),
    uninstallGroups: z.array(assignmentTargetSchema),
  }),
});
