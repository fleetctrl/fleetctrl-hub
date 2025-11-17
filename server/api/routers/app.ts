import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { createAppSchema } from "@/lib/schemas/create-app";
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
      computer_group_apps(
        computer_groups(id, display_name)
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
      const groups = toArray(app?.computer_group_apps)
        .map((gm: any) => {
          const compObj = Array.isArray(gm?.computer_groups)
            ? gm.computer_groups[0]
            : gm?.computer_groups;
          if (!compObj || typeof compObj !== "object") return null;

          const id = String((compObj as any)?.id ?? "");
          const name = String((compObj as any)?.display_name ?? "");
          if (!id) return null;

          return { id, name };
        })
        .filter(Boolean) as { id: string; name: string }[];

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
  create: protectedProcedure.input(createAppSchema).mutation(async ({ ctx, input }) => {
    // create app
    const appInfo = input.appInfo;
    const { data: appInfoData, error: appInfoError } = await ctx.supabase.from("apps").insert({ display_name: appInfo.name, description: appInfo.description, publisher: appInfo.publisher }).select('id');
    if (appInfoError || !appInfoData[0]) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to create app",
        cause: appInfoError?.cause,
      });
    }
    const appId = appInfoData[0].id

    // Release
    const release = input.release;

    const insertRelese = {
      installer_type: release.type,
      app_id: appId,
      version: release.version
    }
    const { data: releaseData, error: releaseError } = await ctx.supabase.from("releases").insert(insertRelese).select("id")
    if (releaseError || !releaseData[0]) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to create release",
        cause: releaseError?.cause,
      });
    }
    const releaseId = releaseData[0].id

    if (release.type === "winget") {
      const wingetReleaseInsert = {
        release_id: releaseId,
        winget_id: release.wingetId
      }
      const { error: wingetReleaseError } = await ctx.supabase.from("winget_releases").insert(wingetReleaseInsert)
      if (releaseError || !releaseData[0]) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create release",
          cause: wingetReleaseError?.cause,
        });
      }
    } else if (release.type === "win32") {
      const installBinary = release.installBinary;

      if (!installBinary || !release.installScript || !release.uninstallScript) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Missing required win32 release data",
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
        install_binary_type: movedBinary.type ?? null,
      };

      const { error: win32ReleaseError } = await ctx.supabase
        .from("win32_releases")
        .insert(win32ReleaseInsert);

      if (win32ReleaseError) {
        await deleteStoredFile({
          file: movedBinary,
        }).catch(() => undefined);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create win32 release",
          cause: win32ReleaseError?.cause ?? win32ReleaseError?.message,
        });
      }
    } else {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No correct release provided"
      });
    }

  })
});
