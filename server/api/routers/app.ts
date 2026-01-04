import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { createAppSchema, detectionItemSchema, storedFileReferenceSchema } from "@/lib/schemas/create-app";
import { z } from "zod";
import {
  buildReleaseAssetPath,
  deleteStoredFile,
  moveStoredFileWithinBucket,
} from "@/lib/storage/temp-storage";

export const appRouter = createTRPCRouter({
  getTableData: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase.from("apps").select(`
      id,
      display_name,
      description,
      created_at,
      updated_at,
      releases(
        computer_group_releases(
          computer_groups(id, display_name)
        )
      )
    `);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to get apps",
        cause: (error as any)?.cause ?? error.message,
      });
    }

    const toArray = (v: unknown) =>
      Array.isArray(v)
        ? v
        : v && typeof v === "object"
          ? Object.values(v as Record<string, unknown>)
          : [];

    const outData = (data ?? []).map((app: any) => {
      const allGroups = (app.releases ?? []).flatMap((release: any) => {
        return toArray(release.computer_group_releases).map((cgr: any) => {
          const compObj = Array.isArray(cgr?.computer_groups)
            ? cgr.computer_groups[0]
            : cgr?.computer_groups;

          if (!compObj || typeof compObj !== "object") return null;

          const id = String((compObj as any)?.id ?? "");
          const name = String((compObj as any)?.display_name ?? "");
          if (!id) return null;

          return { id, name };
        });
      }).filter(Boolean) as { id: string; name: string }[];

      // Deduplicate groups by ID
      const uniqueGroupsMap = new Map<string, { id: string; name: string }>();
      for (const g of allGroups) {
        uniqueGroupsMap.set(g.id, g);
      }
      const groups = Array.from(uniqueGroupsMap.values());

      return {
        id: String(app.id),
        displayName: String(app.display_name ?? ""),
        createdAt: app.created_at ?? null,
        updatedAt: app.updated_at ?? null,
        groups: groups,
        groupsCount: groups.length,
      };
    });

    return outData;
  }),
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: app, error } = await ctx.supabase
        .from("apps")
        .select(
          `
        id,
        display_name,
        description,
        publisher,
        allow_multiple_versions,
        auto_update,
        created_at,
        updated_at
      `,
        )
        .eq("id", input.id)
        .single();

      if (error || !app) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "App not found",
          cause: error,
        });
      }


      const { data: releasesData, error: releasesError } = await ctx.supabase
        .from("releases")
        .select(
          `
          id,
          version,
          created_at,
          installer_type,
          disabled_at
        `,
        )
        .eq("app_id", input.id)
        .order("created_at", { ascending: false });

      if (releasesError) {
        console.error("Error fetching releases:", releasesError);
      }
      const releases = (releasesData ?? []).map((r) => ({
        ...r,
        version: app.auto_update ? "latest" : r.version,
      }));

      return {
        ...app,
        releases,
      };
    }),
  getReleases: protectedProcedure
    .input(z.object({ appId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: releases, error } = await ctx.supabase
        .from("releases")
        .select(
          `
          id,
          version,
          created_at,
          installer_type,
          disabled_at,
          uninstall_previous,
          computer_group_releases(
            assign_type,
            action,
            computer_groups(id, display_name)
          ),
          detection_rules(*),
          release_requirements(*)
        `,
        )
        .eq("app_id", input.appId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to fetch releases",
          cause: error,
        });
      }

      return releases ?? [];
    }),
  create: protectedProcedure.input(createAppSchema).mutation(async ({ ctx, input }) => {
    return await ctx.db.begin(async (sql) => {
      // create app
      const appInfo = input.appInfo;
      const [app] = await sql`
        insert into apps ${sql({
        display_name: appInfo.name,
        description: appInfo.description,
        publisher: appInfo.publisher,
        allow_multiple_versions: input.release.allowMultipleVersions,
        auto_update: input.release.autoUpdate,
      })}
        returning id
      `;

      if (!app) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create app",
        });
      }
      const appId = app.id;

      // Release
      const release = input.release;

      const version =
        release.autoUpdate && !release.version ? "latest" : release.version!;

      const insertRelese = {
        installer_type: release.type,
        app_id: appId,
        version: version,
        uninstall_previous: release.uninstallPreviousVersion,
      };

      const [releaseData] = await sql`
        insert into releases ${sql(insertRelese)}
        returning id
      `;

      if (!releaseData) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create release",
        });
      }
      const releaseId = releaseData.id;

      if (release.type === "winget") {
        const wingetReleaseInsert = {
          release_id: releaseId,
          winget_id: release.wingetId,
        };
        await sql`
          insert into winget_releases ${sql(wingetReleaseInsert)}
        `;
      } else if (release.type === "win32") {
        const installBinary = release.installBinary;

        if (
          !installBinary ||
          !release.installScript ||
          !release.uninstallScript
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Missing required win32 release data",
          });
        }

        if (!installBinary.hash) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Installer binary hash is missing. Please re-upload the file.",
          });
        }

        const destinationPath = buildReleaseAssetPath({
          appId,
          releaseId,
          filename: installBinary.name,
          category: "installers",
        });

        const movedBinary = await moveStoredFileWithinBucket({
          supabase: ctx.supabase,
          file: installBinary,
          destinationPath,
        }).catch((moveError) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to move installer binary",
            cause: moveError,
          });
        });

        const win32ReleaseInsert = {
          release_id: releaseId,
          install_script: release.installScript,
          uninstall_script: release.uninstallScript,
          install_binary_bucket: movedBinary.bucket,
          install_binary_path: movedBinary.path,
          install_binary_size: movedBinary.size,
          hash: installBinary.hash,
        };

        try {
          await sql`
            insert into win32_releases ${sql(win32ReleaseInsert)}
          `;
        } catch (err) {
          // If the DB insert fails, we must cleanup the moved file
          // We move it back to the temp storage so the user can try again
          await moveStoredFileWithinBucket({
            supabase: ctx.supabase,
            file: movedBinary,
            destinationPath: installBinary.path,
          }).catch(() => undefined);
          throw err;
        }
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No correct release provided",
        });
      }


      // Requirements
      const requirement = input.requirement;
      if (requirement && requirement.requirementScriptBinary) {
        const requirementScriptBinary = requirement.requirementScriptBinary;

        if (
          !requirementScriptBinary ||
          !requirementScriptBinary.name ||
          !requirementScriptBinary.path ||
          !requirementScriptBinary.bucket
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Missing required requirement script binary data",
          });
        }

        const destinationPath = buildReleaseAssetPath({
          appId,
          releaseId,
          filename: requirementScriptBinary?.name,
          category: "requirements",
        });

        const movedBinary = await moveStoredFileWithinBucket({
          supabase: ctx.supabase,
          file: requirementScriptBinary,
          destinationPath,
        }).catch((moveError) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to move installer binary",
            cause: moveError,
          });
        });

        const requirementInsert = {
          release_id: releaseId,
          timeout_seconds: requirement?.timeout ?? 60,
          run_as_system: requirement.runAsSystem,
          bucket: requirementScriptBinary?.bucket,
          storage_path: movedBinary.path,
          hash: requirementScriptBinary?.hash,
          byte_size: requirementScriptBinary?.size,
        };
        console.log(requirementInsert);
        try {
          await sql`
          insert into release_requirements ${sql(requirementInsert)}
        `;
        } catch (error) {
          // If the DB insert fails, we must cleanup the moved file
          // We move it back to the temp storage so the user can try again
          await moveStoredFileWithinBucket({
            supabase: ctx.supabase,
            file: movedBinary,
            destinationPath: requirementScriptBinary.path,
          }).catch(() => undefined);
          throw error;
        }
      }

      // Detections
      const detections = input.detection;
      if (detections) {
        for (const detection of detections.detections) {
          switch (detection.type) {
            case "file":
              const foperator = detection.fileType;
              const fpath = detection.path;
              const fvalue = detection.fileTypeValue;

              const fileDetectionInsert = {
                release_id: releaseId,
                type: "file",
                config: {
                  "version": "1",
                  "operator": foperator,
                  "path": fpath,
                  "value": fvalue,
                },
              };

              try {
                await sql`
                insert into detection_rules ${sql(fileDetectionInsert)}
              `;
              } catch (error) {
                throw error;
              }
              break;
            case "registry":
              const roperator = detection.registryType;
              const rpath = detection.path;
              const rvalue = detection.registryTypeValue;

              const registryDetectionInsert = {
                release_id: releaseId,
                type: "registry",
                config: {
                  "version": "1",
                  "operator": roperator,
                  "path": rpath,
                  "value": rvalue,
                },
              };

              try {
                await sql`
                insert into detection_rules ${sql(registryDetectionInsert)}
              `;
              } catch (error) {
                throw error;
              }
              break;
            default:
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Unknown detection type",
              });
          }
        }
      }

      // Assignments
      const assigments = input.assignment;
      if (assigments) {
        // Install groups
        for (const group of assigments.installGroups) {
          const insertAssignment = {
            release_id: releaseId,
            group_id: group.groupId,
            assign_type: group.mode,
            action: "install",
          };
          await sql`
            insert into computer_group_releases ${sql(insertAssignment)}
          `;
        }

        // Uninstall groups
        for (const group of assigments.uninstallGroups) {
          const insertAssignment = {
            release_id: releaseId,
            group_id: group.groupId,
            assign_type: group.mode,
            action: "uninstall",
          };
          await sql`
            insert into computer_group_releases ${sql(insertAssignment)}
          `;
        }
      }
    });

  }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          display_name: z.string().optional(),
          description: z.string().optional(),
          publisher: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("apps")
        .update(input.data)
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to update app",
          cause: error,
        });
      }

      return { success: true };
    }),
  updateRelease: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          version: z.string().optional(),
          uninstall_previous: z.boolean().optional(),
          disabled: z.boolean().optional(),
          assignments: z.object({
            installGroups: z.array(z.object({
              groupId: z.string(),
              mode: z.enum(["include", "exclude"]),
            })),
            uninstallGroups: z.array(z.object({
              groupId: z.string(),
              mode: z.enum(["include", "exclude"]),
            })),
          }).optional(),
          detections: z.array(detectionItemSchema).optional(),
          requirements: z.object({
            timeout: z.number().optional(),
            runAsSystem: z.boolean().optional(),
            requirementScriptBinary: storedFileReferenceSchema.optional(),
          }).optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {};

      if (input.data.version !== undefined) {
        updateData.version = input.data.version;
      }

      if (input.data.uninstall_previous !== undefined) {
        updateData.uninstall_previous = input.data.uninstall_previous;
      }

      if (input.data.disabled !== undefined) {
        updateData.disabled_at = input.data.disabled ? new Date().toISOString() : null;
      }

      // Update basic release info
      const { error } = await ctx.supabase
        .from("releases")
        .update(updateData)
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to update release",
          cause: error,
        });
      }

      // Update Assignments
      if (input.data.assignments) {
        // First delete existing assignments
        const { error: deleteError } = await ctx.supabase
          .from("computer_group_releases")
          .delete()
          .eq("release_id", input.id);

        if (deleteError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to clear existing assignments",
            cause: deleteError,
          });
        }

        const assignments = input.data.assignments;
        const insertData = [];

        // Install Groups
        for (const group of assignments.installGroups) {
          insertData.push({
            release_id: input.id,
            group_id: group.groupId,
            assign_type: group.mode,
            action: "install",
          });
        }

        // Uninstall Groups
        for (const group of assignments.uninstallGroups) {
          insertData.push({
            release_id: input.id,
            group_id: group.groupId,
            assign_type: group.mode,
            action: "uninstall",
          });
        }

        if (insertData.length > 0) {
          const { error: insertError } = await ctx.supabase
            .from("computer_group_releases")
            .insert(insertData);

          if (insertError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Unable to insert new assignments",
              cause: insertError,
            });
          }
        }
      }

      // Update Detections
      if (input.data.detections) {
        // First delete existing detections
        const { error: deleteDetectionsError } = await ctx.supabase
          .from("detection_rules")
          .delete()
          .eq("release_id", input.id);

        if (deleteDetectionsError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to clear existing detections",
            cause: deleteDetectionsError,
          });
        }

        const detectionsData = input.data.detections.map((detection) => {
          if (detection.type === "file") {
            return {
              release_id: input.id,
              type: "file",
              config: {
                version: "1",
                operator: detection.fileType,
                path: detection.path,
                value: detection.fileTypeValue,
              },
            };
          } else {
            return {
              release_id: input.id,
              type: "registry",
              config: {
                version: "1",
                operator: detection.registryType,
                path: detection.registryKey || detection.path,
                value: detection.registryTypeValue,
              },
            };
          }
        });

        if (detectionsData.length > 0) {
          const { error: insertDetectionsError } = await ctx.supabase
            .from("detection_rules")
            .insert(detectionsData);

          if (insertDetectionsError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Unable to insert new detections",
              cause: insertDetectionsError,
            });
          }
        }
      }

      // Update Requirements
      if (input.data.requirements) {
        const req = input.data.requirements;

        // If a new binary is provided, we need to handle it
        let storageData: any = {};
        if (req.requirementScriptBinary) {
          // Get appId for the path
          const { data: releaseData } = await ctx.supabase
            .from("releases")
            .select("app_id")
            .eq("id", input.id)
            .single();

          if (!releaseData) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Release not found for requirement update",
            });
          }

          const destinationPath = buildReleaseAssetPath({
            appId: releaseData.app_id,
            releaseId: input.id,
            filename: req.requirementScriptBinary.name,
            category: "requirements",
          });

          const movedBinary = await moveStoredFileWithinBucket({
            supabase: ctx.supabase,
            file: req.requirementScriptBinary,
            destinationPath,
          });

          storageData = {
            bucket: movedBinary.bucket,
            storage_path: movedBinary.path,
            hash: req.requirementScriptBinary.hash,
            byte_size: movedBinary.size,
          };
        }

        const requirementUpdate = {
          timeout_seconds: req.timeout ?? 60,
          run_as_system: req.runAsSystem ?? false,
          ...storageData,
        };

        // Check if requirement already exists
        const { data: existingReq, error: checkError } = await ctx.supabase
          .from("release_requirements")
          .select("id")
          .eq("release_id", input.id)
          .maybeSingle();

        if (checkError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error checking for existing requirements",
            cause: checkError,
          });
        }

        if (existingReq) {
          const { error: updateReqError } = await ctx.supabase
            .from("release_requirements")
            .update(requirementUpdate)
            .eq("release_id", input.id);

          if (updateReqError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Unable to update requirements",
              cause: updateReqError,
            });
          }
        } else if (req.requirementScriptBinary) {
          // Create new requirement ONLY if we have a binary
          const { error: insertReqError } = await ctx.supabase
            .from("release_requirements")
            .insert({
              release_id: input.id,
              ...requirementUpdate,
            });

          if (insertReqError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Unable to create requirements",
              cause: insertReqError,
            });
          }
        }
      }

      return { success: true };
    }),

  createRelease: protectedProcedure
    .input(
      z.object({
        appId: z.string(),
        type: z.enum(["winget", "win32"]),
        version: z.string().optional(),
        uninstall_previous: z.boolean().optional(),
        // Winget specific
        wingetId: z.string().optional(),
        // Win32 specific
        installBinary: z.object({
          bucket: z.string(),
          path: z.string(),
          name: z.string(),
          size: z.number(),
          type: z.string().optional().nullable(),
          hash: z.string().optional(),
        }).optional(),
        installScript: z.string().optional(),
        uninstallScript: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if app exists and get auto_update setting
      const { data: app, error: appError } = await ctx.supabase
        .from("apps")
        .select("id, auto_update")
        .eq("id", input.appId)
        .single();

      if (appError || !app) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "App not found",
          cause: appError,
        });
      }

      // If auto_update is enabled, check if there's already a release
      if (app.auto_update) {
        const { count, error: countError } = await ctx.supabase
          .from("releases")
          .select("id", { count: "exact", head: true })
          .eq("app_id", input.appId);

        if (countError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to check existing releases",
            cause: countError,
          });
        }

        if (count && count > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Auto-update apps can only have one release",
          });
        }
      }

      // Validate inputs based on type
      if (input.type === "winget" && !input.wingetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Winget ID is required for winget releases",
        });
      }

      if (input.type === "win32") {
        if (!input.installBinary) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Install binary is required for win32 releases",
          });
        }
        if (!input.installScript) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Install script is required for win32 releases",
          });
        }
        if (!input.uninstallScript) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Uninstall script is required for win32 releases",
          });
        }
      }

      // Determine version - use "latest" for autoupdate apps
      const finalVersion = app.auto_update ? "latest" : (input.version || "1.0.0");

      // Create the release
      const { data: release, error } = await ctx.supabase
        .from("releases")
        .insert({
          app_id: input.appId,
          version: finalVersion,
          uninstall_previous: input.uninstall_previous ?? false,
          installer_type: input.type,
        })
        .select("id")
        .single();

      if (error || !release) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create release",
          cause: error,
        });
      }

      const releaseId = release.id;

      // Create type-specific release data
      if (input.type === "winget") {
        console.log("Creating winget release with:", { release_id: releaseId, winget_id: input.wingetId });
        const { error: wingetError } = await ctx.supabase
          .from("winget_releases")
          .insert({
            release_id: releaseId,
            winget_id: input.wingetId,
          });

        if (wingetError) {
          // Rollback release creation
          console.error("Winget insert error:", wingetError);
          await ctx.supabase.from("releases").delete().eq("id", releaseId);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to create winget release data",
            cause: wingetError,
          });
        }
      } else if (input.type === "win32" && input.installBinary) {
        // Move binary from temp to permanent storage
        const destinationPath = buildReleaseAssetPath({
          appId: input.appId,
          releaseId,
          filename: input.installBinary.name,
          category: "installers",
        });

        const movedBinary = await moveStoredFileWithinBucket({
          supabase: ctx.supabase,
          file: input.installBinary,
          destinationPath,
        }).catch((moveError) => {
          // Rollback release creation
          ctx.supabase.from("releases").delete().eq("id", releaseId);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to move installer binary",
            cause: moveError,
          });
        });

        const { error: win32Error } = await ctx.supabase
          .from("win32_releases")
          .insert({
            release_id: releaseId,
            install_script: input.installScript,
            uninstall_script: input.uninstallScript,
            install_binary_bucket: movedBinary.bucket,
            install_binary_path: movedBinary.path,
            install_binary_size: movedBinary.size,
            hash: input.installBinary.hash,
          });

        if (win32Error) {
          // Rollback: move file back, delete release
          await moveStoredFileWithinBucket({
            supabase: ctx.supabase,
            file: movedBinary,
            destinationPath: input.installBinary.path,
          }).catch(() => undefined);
          await ctx.supabase.from("releases").delete().eq("id", releaseId);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to create win32 release data",
            cause: win32Error,
          });
        }
      }

      return { success: true, releaseId };
    }),


  deleteRelease: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // First delete related computer_group_releases
      const { error: deleteAssignmentsError } = await ctx.supabase
        .from("computer_group_releases")
        .delete()
        .eq("release_id", input.id);

      if (deleteAssignmentsError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to delete release assignments",
          cause: deleteAssignmentsError,
        });
      }

      // Then delete the release itself
      const { error } = await ctx.supabase
        .from("releases")
        .delete()
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to delete release",
          cause: error,
        });
      }

      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if any release has assignments
      const { data: releases } = await ctx.supabase
        .from("releases")
        .select("id")
        .eq("app_id", input.id);

      if (releases && releases.length > 0) {
        const releaseIds = releases.map((r) => r.id);
        const { count } = await ctx.supabase
          .from("computer_group_releases")
          .select("id", { count: "exact", head: true })
          .in("release_id", releaseIds);

        if (count && count > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot delete app because it has active group assignments. Please remove all assignments from its releases first.",
          });
        }
      }

      const { error } = await ctx.supabase
        .from("apps")
        .delete()
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to delete app",
          cause: error,
        });
      }

      return { success: true };
    }),
});
